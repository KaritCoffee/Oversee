const DEFAULT_MAX_CAMERAS = 100000;
const DEFAULT_MAX_SOURCES = 2000;
const DEFAULT_MAX_GRID_CELLS = 20000;

const US_STATES = Object.freeze([
  ["Alabama", "AL"], ["Alaska", "AK"], ["Arizona", "AZ"], ["Arkansas", "AR"],
  ["California", "CA"], ["Colorado", "CO"], ["Connecticut", "CT"], ["Delaware", "DE"],
  ["District of Columbia", "DC"], ["Florida", "FL"], ["Georgia", "GA"], ["Hawaii", "HI"],
  ["Idaho", "ID"], ["Illinois", "IL"], ["Indiana", "IN"], ["Iowa", "IA"],
  ["Kansas", "KS"], ["Kentucky", "KY"], ["Louisiana", "LA"], ["Maine", "ME"],
  ["Maryland", "MD"], ["Massachusetts", "MA"], ["Michigan", "MI"], ["Minnesota", "MN"],
  ["Mississippi", "MS"], ["Missouri", "MO"], ["Montana", "MT"], ["Nebraska", "NE"],
  ["Nevada", "NV"], ["New Hampshire", "NH"], ["New Jersey", "NJ"], ["New Mexico", "NM"],
  ["New York", "NY"], ["North Carolina", "NC"], ["North Dakota", "ND"], ["Ohio", "OH"],
  ["Oklahoma", "OK"], ["Oregon", "OR"], ["Pennsylvania", "PA"], ["Rhode Island", "RI"],
  ["South Carolina", "SC"], ["South Dakota", "SD"], ["Tennessee", "TN"], ["Texas", "TX"],
  ["Utah", "UT"], ["Vermont", "VT"], ["Virginia", "VA"], ["Washington", "WA"],
  ["West Virginia", "WV"], ["Wisconsin", "WI"], ["Wyoming", "WY"],
]);

const STATE_BY_NAME = new Map(US_STATES.map(([name, code]) => [name.toLowerCase(), { name, code }]));
const STATE_BY_CODE = new Map(US_STATES.map(([name, code]) => [code, { name, code }]));
const UNITED_STATES_ALIASES = new Set([
  "united states",
  "united states of america",
  "usa",
  "us",
  "u s",
  "u s a",
]);
const COUNTRY_ALIASES = new Map([
  ["uk", "United Kingdom"],
  ["u k", "United Kingdom"],
  ["great britain", "United Kingdom"],
  ["republic of ireland", "Ireland"],
  ["south korea", "South Korea"],
  ["republic of korea", "South Korea"],
]);
const SOURCE_STATUS_ORDER = Object.freeze({ down: 0, stale: 1, degraded: 2, unconfigured: 3, unknown: 4, healthy: 5 });
const SOURCE_STATUS_SEVERITY = Object.freeze({ healthy: 0, unknown: 1, degraded: 2, stale: 3, unconfigured: 4, down: 5 });

function classifyCamera(camera = {}) {
  const record = camera && typeof camera === "object" ? camera : {};
  const healthStatus = token(record.healthStatus);
  const streamStatus = token(record.streamStatus);
  const status = token(record.status);
  const availability = token(record.availability);
  const down = record.available === false
    || record.ok === false
    || Boolean(cleanText(record.offlineReason, 160))
    || [healthStatus, streamStatus, status, availability].some((value) => /^(down|offline|failed|failure|unavailable|disabled|error|not live)$/.test(value));

  if (down) return { kind: "down", playable: false };

  const capability = token(record.capability);
  const viewerType = token(record.viewerType);
  const media = token(record.media);
  const live = streamStatus === "live"
    || ["stream", "player", "live", "video"].includes(capability)
    || ["video", "stream", "hls", "iframe", "player", "youtube"].includes(viewerType)
    || ["live", "video", "stream"].includes(media);
  if (live) return { kind: "live", playable: true };

  const still = ["snapshot", "still", "image"].includes(capability)
    || ["image", "snapshot", "still"].includes(viewerType)
    || ["still", "image", "snapshot"].includes(media)
    || Boolean(cleanText(record.imageUrl || record.previewUrl, 500));
  if (still) return { kind: "still", playable: true };

  return { kind: "unknown", playable: false };
}

function calculateCameraCoverage(cameras = [], options = {}) {
  const input = boundedArray(cameras, options.maxCameras, DEFAULT_MAX_CAMERAS);
  const countryGroups = new Map();
  const regionGroups = new Map();
  const stateGroups = new Map(US_STATES.map(([name, code]) => [code, { name, code, ...emptyCounts() }]));
  const totals = emptyCounts();
  let validCoordinates = 0;
  let invalidCoordinates = 0;
  let usCameras = 0;
  let unassignedUsCameras = 0;

  for (let index = 0; index < input.processed; index += 1) {
    const camera = objectRecord(input.items[index]);
    const classification = classifyCamera(camera);
    const position = cameraPosition(camera);
    const state = findUsState(camera);
    let country = normalizeCountry(camera.country);
    if (country === "Unknown" && state) country = "United States";
    const region = normalizeRegion(camera.region || camera.state || camera.area);

    incrementCounts(totals, classification, Boolean(position));
    incrementGroup(countryGroups, country, { name: country }, classification, Boolean(position));
    incrementGroup(regionGroups, `${country}\u0000${region}`, { name: region, country }, classification, Boolean(position));

    if (position) validCoordinates += 1;
    else invalidCoordinates += 1;

    if (country === "United States") {
      usCameras += 1;
      if (state) incrementCounts(stateGroups.get(state.code), classification, Boolean(position));
      else unassignedUsCameras += 1;
    }
  }

  const countries = summarizeGroups(countryGroups, boundedInteger(options.maxCountries, 24, 1, 100), (entry) => entry.name !== "Unknown");
  const regions = summarizeGroups(regionGroups, boundedInteger(options.maxRegions, 30, 1, 150), (entry) => entry.name !== "Unknown");
  const stateEntries = [...stateGroups.values()].map(publicCounts).sort((left, right) => compareText(left.name, right.name));
  const coveredStates = stateEntries.filter((entry) => entry.total > 0);
  const missingStates = stateEntries.filter((entry) => entry.total === 0).map((entry) => entry.name);
  const lowestCovered = [...coveredStates]
    .sort((left, right) => left.total - right.total || compareText(left.name, right.name))
    .slice(0, boundedInteger(options.maxStateGaps, 12, 1, US_STATES.length));

  return {
    sample: inputSample(input),
    counts: publicCounts(totals),
    coordinates: { valid: validCoordinates, invalid: invalidCoordinates },
    countries,
    regions,
    usStates: {
      total: US_STATES.length,
      covered: coveredStates.length,
      cameras: usCameras,
      unassignedCameras: unassignedUsCameras,
      missing: missingStates,
      lowestCovered,
      entries: stateEntries,
    },
  };
}

function summarizeSourceHealth(sourceHealth = [], cameras = [], options = {}) {
  const cameraInput = boundedArray(cameras, options.maxCameras, DEFAULT_MAX_CAMERAS);
  const sourceInput = boundedHealthArray(sourceHealth, options.maxSources);
  const catalog = buildCameraSourceCatalog(cameraInput.items, cameraInput.processed);
  const normalized = [];
  const matchedCameraSources = new Set();

  for (let index = 0; index < sourceInput.processed; index += 1) {
    const raw = objectRecord(sourceInput.items[index]);
    const aliases = sourceAliases(raw);
    const cameraKey = aliases.map((alias) => catalog.aliases.get(alias)).filter(Boolean).sort(compareText)[0] || "";
    if (cameraKey) matchedCameraSources.add(cameraKey);
    const catalogSource = cameraKey ? catalog.sources.get(cameraKey) : null;
    const suppliedCount = nonNegativeInteger(raw.count ?? raw.records ?? raw.cameraCount, 0);
    normalized.push({
      key: cameraKey || aliases[0] || `unnamed-source-${index + 1}`,
      name: safeSourceName(raw.name || raw.label || raw.sourceName || raw.id || raw.key || catalogSource?.name),
      status: sourceStatus(raw),
      records: Math.max(suppliedCount, catalogSource?.records || 0),
      cached: Boolean(raw.cached),
      optional: Boolean(raw.optional),
      updatedAt: safeTimestamp(raw.updatedAt || raw.lastCheckedAt),
    });
  }

  for (const [key, source] of catalog.sources) {
    if (matchedCameraSources.has(key)) continue;
    normalized.push({
      key,
      name: safeSourceName(source.name),
      status: "unknown",
      records: source.records,
      cached: false,
      optional: false,
      updatedAt: "",
    });
  }

  const merged = mergeSourceEntries(normalized);
  const statusCounts = { healthy: 0, degraded: 0, stale: 0, down: 0, unconfigured: 0, unknown: 0 };
  let recordCount = 0;
  for (const entry of merged) {
    statusCounts[entry.status] += 1;
    recordCount += entry.records;
  }
  merged.sort(compareSourceEntries);
  const entryLimit = boundedInteger(options.maxSourceEntries, 30, 1, 100);

  return {
    sample: inputSample(sourceInput),
    total: merged.length,
    responding: statusCounts.healthy + statusCounts.degraded,
    usable: statusCounts.healthy + statusCounts.degraded + statusCounts.stale,
    records: recordCount,
    ...statusCounts,
    entries: merged.slice(0, entryLimit).map(publicSourceEntry),
    omitted: Math.max(0, merged.length - entryLimit),
  };
}

function rankCoverageGaps(cameras = [], options = {}) {
  const input = boundedArray(cameras, options.maxCameras, DEFAULT_MAX_CAMERAS);
  const bounds = normalizeBounds(options.bounds || options.gapBounds);
  const maxGridCells = boundedInteger(options.maxGridCells, DEFAULT_MAX_GRID_CELLS, 100, 50000);
  const requestedCellDegrees = boundedNumber(options.cellDegrees, 10, 1, 30);
  const grid = buildGrid(bounds, requestedCellDegrees, maxGridCells);
  const occupied = new Map();
  let camerasInBounds = 0;

  for (let index = 0; index < input.processed; index += 1) {
    const position = cameraPosition(objectRecord(input.items[index]));
    if (!position || !insideBounds(position, bounds)) continue;
    const cell = positionCell(position, bounds, grid);
    const key = cell.row * grid.columns + cell.column;
    occupied.set(key, (occupied.get(key) || 0) + 1);
    camerasInBounds += 1;
  }

  const radius = boundedInteger(options.neighborRadius, 1, 1, 3);
  const minNeighborCells = boundedInteger(options.minNeighborCells, 2, 1, 8 * radius * radius + 4 * radius);
  const candidates = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const key = row * grid.columns + column;
      if (occupied.has(key)) continue;
      let neighborOccupiedCells = 0;
      let neighborCameraCount = 0;
      for (let rowOffset = -radius; rowOffset <= radius; rowOffset += 1) {
        for (let columnOffset = -radius; columnOffset <= radius; columnOffset += 1) {
          if (rowOffset === 0 && columnOffset === 0) continue;
          const neighborRow = row + rowOffset;
          const neighborColumn = column + columnOffset;
          if (neighborRow < 0 || neighborRow >= grid.rows || neighborColumn < 0 || neighborColumn >= grid.columns) continue;
          const count = occupied.get(neighborRow * grid.columns + neighborColumn) || 0;
          if (count > 0) {
            neighborOccupiedCells += 1;
            neighborCameraCount += count;
          }
        }
      }
      if (neighborOccupiedCells < minNeighborCells) continue;
      const cellBounds = gridCellBounds(row, column, bounds, grid);
      candidates.push({
        id: `${formatCoordinate(cellBounds.south)}:${formatCoordinate(cellBounds.west)}`,
        center: {
          lat: roundCoordinate((cellBounds.south + cellBounds.north) / 2),
          lng: roundCoordinate((cellBounds.west + cellBounds.east) / 2),
        },
        bounds: cellBounds,
        neighborOccupiedCells,
        neighborCameraCount,
        score: neighborOccupiedCells * 100 + Math.min(99, Math.round(Math.log2(neighborCameraCount + 1) * 10)),
      });
    }
  }

  candidates.sort((left, right) => right.score - left.score
    || right.neighborCameraCount - left.neighborCameraCount
    || left.bounds.south - right.bounds.south
    || left.bounds.west - right.bounds.west);
  const limit = boundedInteger(options.maxGaps, 20, 1, 100);

  return {
    bounds,
    cellDegrees: roundCoordinate(grid.cellDegrees),
    examinedCells: grid.rows * grid.columns,
    occupiedCells: occupied.size,
    coverageRatio: Number((occupied.size / Math.max(1, grid.rows * grid.columns)).toFixed(4)),
    camerasInBounds,
    candidateCells: candidates.length,
    entries: candidates.slice(0, limit).map((entry, index) => ({ rank: index + 1, ...entry })),
    omitted: Math.max(0, candidates.length - limit),
  };
}

function buildCameraCoverageDiagnostics(cameras = [], sourceHealth = [], options = {}) {
  const coverage = calculateCameraCoverage(cameras, options);
  const sources = summarizeSourceHealth(sourceHealth, cameras, options);
  const gaps = rankCoverageGaps(cameras, options);
  const diagnostic = {
    schemaVersion: 1,
    sample: coverage.sample,
    counts: coverage.counts,
    coverage: {
      coordinates: coverage.coordinates,
      countries: coverage.countries,
      regions: coverage.regions,
      usStates: {
        total: coverage.usStates.total,
        covered: coverage.usStates.covered,
        cameras: coverage.usStates.cameras,
        unassignedCameras: coverage.usStates.unassignedCameras,
        missing: coverage.usStates.missing,
        lowestCovered: coverage.usStates.lowestCovered,
      },
      grid: {
        bounds: gaps.bounds,
        cellDegrees: gaps.cellDegrees,
        examinedCells: gaps.examinedCells,
        occupiedCells: gaps.occupiedCells,
        coverageRatio: gaps.coverageRatio,
        camerasInBounds: gaps.camerasInBounds,
      },
    },
    sourceHealth: sources,
    gaps: {
      candidateCells: gaps.candidateCells,
      entries: gaps.entries,
      omitted: gaps.omitted,
    },
  };
  const generatedAt = safeTimestamp(options.generatedAt);
  if (generatedAt) diagnostic.generatedAt = generatedAt;
  return diagnostic;
}

function emptyCounts() {
  return { total: 0, playable: 0, live: 0, still: 0, down: 0, unknown: 0, geolocated: 0 };
}

function incrementCounts(counts, classification, geolocated) {
  counts.total += 1;
  counts[classification.kind] += 1;
  if (classification.playable) counts.playable += 1;
  if (geolocated) counts.geolocated += 1;
}

function incrementGroup(groups, key, labels, classification, geolocated) {
  if (!groups.has(key)) groups.set(key, { ...labels, ...emptyCounts() });
  incrementCounts(groups.get(key), classification, geolocated);
}

function publicCounts(value) {
  return {
    ...(value.name ? { name: value.name } : {}),
    ...(value.code ? { code: value.code } : {}),
    ...(value.country ? { country: value.country } : {}),
    total: value.total,
    playable: value.playable,
    live: value.live,
    still: value.still,
    down: value.down,
    unknown: value.unknown,
    geolocated: value.geolocated,
  };
}

function summarizeGroups(groups, limit, coveredPredicate) {
  const sorted = [...groups.values()].map(publicCounts).sort(compareCoverageEntries);
  const entries = sorted.slice(0, limit);
  return {
    covered: sorted.filter(coveredPredicate).length,
    groups: sorted.length,
    entries,
    omittedGroups: Math.max(0, sorted.length - entries.length),
    omittedCameras: sorted.slice(entries.length).reduce((sum, entry) => sum + entry.total, 0),
  };
}

function compareCoverageEntries(left, right) {
  return right.total - left.total
    || compareText(left.country || "", right.country || "")
    || compareText(left.name || "", right.name || "");
}

function normalizeCountry(value) {
  const cleaned = cleanText(value, 80);
  if (!cleaned) return "Unknown";
  const key = normalizedWords(cleaned);
  if (UNITED_STATES_ALIASES.has(key)) return "United States";
  if (COUNTRY_ALIASES.has(key)) return COUNTRY_ALIASES.get(key);
  return titleFromInput(cleaned);
}

function normalizeRegion(value) {
  const cleaned = cleanText(value, 100);
  return cleaned ? titleFromInput(cleaned) : "Unknown";
}

function findUsState(camera = {}) {
  const matches = new Map();
  const exactCandidates = [camera.state, camera.stateCode, camera.regionCode];
  for (const candidate of exactCandidates) addStateMatch(matches, candidate, false);
  for (const candidate of [camera.region, camera.area]) addStateMatch(matches, candidate, true);
  return matches.size === 1 ? [...matches.values()][0] : null;
}

function addStateMatch(matches, value, allowEmbeddedNames) {
  const cleaned = cleanText(value, 120);
  if (!cleaned) return;
  const words = normalizedWords(cleaned);
  const exactName = STATE_BY_NAME.get(words);
  if (exactName) matches.set(exactName.code, exactName);
  const codeMatch = cleaned.toUpperCase().replace(/[^A-Z-]/g, "").match(/^(?:US-)?([A-Z]{2})$/);
  if (codeMatch && STATE_BY_CODE.has(codeMatch[1])) matches.set(codeMatch[1], STATE_BY_CODE.get(codeMatch[1]));
  if (!allowEmbeddedNames) return;
  const padded = ` ${words} `;
  for (const [name, state] of STATE_BY_NAME) {
    if (padded.includes(` ${name} `)) matches.set(state.code, state);
  }
}

function buildCameraSourceCatalog(cameras, processed) {
  const sources = new Map();
  for (let index = 0; index < processed; index += 1) {
    const camera = objectRecord(cameras[index]);
    const id = sourceKey(camera.sourceId || camera.adapterId || camera.sourceKey);
    const name = safeSourceName(camera.sourceName || camera.source || camera.sourceId);
    const key = id || sourceKey(name);
    if (!key) continue;
    const existing = sources.get(key) || { name, records: 0, aliases: new Set() };
    existing.records += 1;
    existing.name = preferredLabel(existing.name, name);
    for (const alias of [id, sourceKey(name)]) if (alias) existing.aliases.add(alias);
    sources.set(key, existing);
  }
  const aliases = new Map();
  for (const [key, source] of [...sources.entries()].sort((left, right) => compareText(left[0], right[0]))) {
    source.aliases.add(key);
    for (const alias of source.aliases) {
      const previous = aliases.get(alias);
      if (!previous || compareText(key, previous) < 0) aliases.set(alias, key);
    }
  }
  return { sources, aliases };
}

function boundedHealthArray(value, requestedLimit) {
  let items = [];
  if (Array.isArray(value)) items = value;
  else if (value && typeof value === "object") {
    const nested = value.sources || value.sourceHealth || value.health || value.adapters;
    if (Array.isArray(nested)) items = nested;
    else items = Object.entries(value)
      .filter(([, entry]) => entry && typeof entry === "object" && !Array.isArray(entry))
      .map(([key, entry]) => ({ id: key, ...entry }));
  }
  return boundedArray(items, requestedLimit, DEFAULT_MAX_SOURCES);
}

function sourceAliases(record) {
  return [...new Set([
    sourceKey(record.sourceId),
    sourceKey(record.id),
    sourceKey(record.key),
    sourceKey(record.name),
    sourceKey(record.label),
    sourceKey(record.sourceName),
  ].filter(Boolean))];
}

function sourceStatus(record) {
  if (record.configured === false) return "unconfigured";
  const explicit = token(record.status || record.healthStatus || record.state);
  if (["down", "offline", "failed", "failure", "error", "unavailable"].includes(explicit) || record.ok === false) return "down";
  if (record.stale === true || explicit === "stale") return "stale";
  if (["degraded", "warning", "partial"].includes(explicit) || record.degraded === true || record.cached === true) return "degraded";
  if (["healthy", "verified", "online", "ok", "up"].includes(explicit) || record.ok === true) return "healthy";
  return "unknown";
}

function mergeSourceEntries(entries) {
  const merged = new Map();
  for (const entry of entries.sort((left, right) => compareText(left.key, right.key) || compareText(left.name, right.name))) {
    const key = entry.key || sourceKey(entry.name) || "unnamed-source";
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, { ...entry, key });
      continue;
    }
    const status = SOURCE_STATUS_SEVERITY[entry.status] > SOURCE_STATUS_SEVERITY[previous.status] ? entry.status : previous.status;
    merged.set(key, {
      key,
      name: preferredLabel(previous.name, entry.name),
      status,
      records: Math.max(previous.records, entry.records),
      cached: previous.cached || entry.cached,
      optional: previous.optional && entry.optional,
      updatedAt: [previous.updatedAt, entry.updatedAt].filter(Boolean).sort().at(-1) || "",
    });
  }
  return [...merged.values()];
}

function compareSourceEntries(left, right) {
  return SOURCE_STATUS_ORDER[left.status] - SOURCE_STATUS_ORDER[right.status]
    || right.records - left.records
    || compareText(left.name, right.name);
}

function publicSourceEntry(entry) {
  return {
    name: entry.name,
    status: entry.status,
    records: entry.records,
    cached: entry.cached,
    optional: entry.optional,
    ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
  };
}

function buildGrid(bounds, requestedCellDegrees, maxGridCells) {
  const width = bounds.east - bounds.west;
  const height = bounds.north - bounds.south;
  let cellDegrees = Math.max(requestedCellDegrees, Math.sqrt((width * height) / maxGridCells));
  let rows = Math.ceil(height / cellDegrees);
  let columns = Math.ceil(width / cellDegrees);
  while (rows * columns > maxGridCells) {
    cellDegrees *= 1.01;
    rows = Math.ceil(height / cellDegrees);
    columns = Math.ceil(width / cellDegrees);
  }
  return { cellDegrees, rows, columns };
}

function positionCell(position, bounds, grid) {
  return {
    row: Math.min(grid.rows - 1, Math.max(0, Math.floor((position.lat - bounds.south) / grid.cellDegrees))),
    column: Math.min(grid.columns - 1, Math.max(0, Math.floor((position.lng - bounds.west) / grid.cellDegrees))),
  };
}

function gridCellBounds(row, column, bounds, grid) {
  const south = bounds.south + row * grid.cellDegrees;
  const west = bounds.west + column * grid.cellDegrees;
  return {
    west: roundCoordinate(west),
    south: roundCoordinate(south),
    east: roundCoordinate(Math.min(bounds.east, west + grid.cellDegrees)),
    north: roundCoordinate(Math.min(bounds.north, south + grid.cellDegrees)),
  };
}

function normalizeBounds(value) {
  const candidate = Array.isArray(value)
    ? { west: value[0], south: value[1], east: value[2], north: value[3] }
    : objectRecord(value);
  const west = Number(candidate.west);
  const south = Number(candidate.south);
  const east = Number(candidate.east);
  const north = Number(candidate.north);
  if ([west, south, east, north].every(Number.isFinite)
    && west >= -180 && east <= 180 && south >= -90 && north <= 90
    && east > west && north > south) {
    return { west, south, east, north };
  }
  return { west: -180, south: -60, east: 180, north: 80 };
}

function cameraPosition(camera) {
  const rawLat = camera.lat ?? camera.latitude;
  const rawLng = camera.lng ?? camera.lon ?? camera.longitude;
  if (rawLat === null || rawLat === undefined || rawLat === "" || rawLng === null || rawLng === undefined || rawLng === "") return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180
    && !(Math.abs(lat) <= 1e-7 && Math.abs(lng) <= 1e-7)
    ? { lat, lng }
    : null;
}

function insideBounds(position, bounds) {
  return position.lng >= bounds.west && position.lng <= bounds.east
    && position.lat >= bounds.south && position.lat <= bounds.north;
}

function boundedArray(value, requestedLimit, defaultLimit) {
  const items = Array.isArray(value) ? value : [];
  const limit = boundedInteger(requestedLimit, defaultLimit, 1, defaultLimit);
  const processed = Math.min(items.length, limit);
  return { items, received: items.length, processed, truncated: Math.max(0, items.length - processed) };
}

function inputSample(input) {
  return { received: input.received, processed: input.processed, truncated: input.truncated };
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.floor(number))) : fallback;
}

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function cleanText(value, limit = 120) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function token(value) {
  return cleanText(value, 80).toLowerCase().replace(/[_-]+/g, " ");
}

function normalizedWords(value) {
  return cleanText(value, 120).toLowerCase().replace(/[._-]+/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function titleFromInput(value) {
  const cleaned = cleanText(value, 100);
  if (!cleaned) return cleaned;
  if (cleaned !== cleaned.toLowerCase() && cleaned !== cleaned.toUpperCase()) return cleaned;
  return cleaned.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function sourceKey(value) {
  return normalizedWords(value);
}

function safeSourceName(value) {
  return cleanText(value, 120) || "Unnamed source";
}

function safeTimestamp(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function preferredLabel(left, right) {
  const labels = [safeSourceName(left), safeSourceName(right)].filter((value) => value !== "Unnamed source");
  return labels.sort(compareText)[0] || "Unnamed source";
}

function compareText(left, right) {
  const leftKey = String(left).toLowerCase();
  const rightKey = String(right).toLowerCase();
  if (leftKey < rightKey) return -1;
  if (leftKey > rightKey) return 1;
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}

function roundCoordinate(value) {
  return Number(Number(value).toFixed(4));
}

function formatCoordinate(value) {
  return Number(value).toFixed(4);
}

module.exports = {
  US_STATES,
  classifyCamera,
  calculateCameraCoverage,
  summarizeSourceHealth,
  rankCoverageGaps,
  buildCameraCoverageDiagnostics,
};
