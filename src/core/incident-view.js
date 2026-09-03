const EARTH_RADIUS_KM = 6371;
const MAX_RADIUS_KM = 1000;
const DEFAULT_RADIUS_KM = 100;
const DEFAULT_MAX_INPUT = 100_000;

const LAYERS = [
  { key: "cameras", aliases: ["cameras"], type: "camera", limit: 8 },
  { key: "alerts", aliases: ["alerts"], type: "alert", limit: 10 },
  { key: "fires", aliases: ["fires"], type: "fire", limit: 10 },
  { key: "earthquakes", aliases: ["earthquakes", "quakes"], type: "earthquake", limit: 8 },
  { key: "aircraft", aliases: ["aircraft", "flights"], type: "aircraft", limit: 10 },
  { key: "satellites", aliases: ["satellites"], type: "satellite", limit: 8 },
  { key: "vessels", aliases: ["vessels"], type: "vessel", limit: 8 },
];

const TYPE_ALIASES = {
  camera: "camera",
  cameras: "camera",
  alert: "alert",
  alerts: "alert",
  fire: "fire",
  fires: "fire",
  quake: "earthquake",
  earthquake: "earthquake",
  earthquakes: "earthquake",
  flight: "aircraft",
  aircraft: "aircraft",
  plane: "aircraft",
  helicopter: "aircraft",
  satellite: "satellite",
  satellites: "satellite",
  vessel: "vessel",
  vessels: "vessel",
  ship: "vessel",
  weather: "weather",
};

const SEVERITY_WORD_SCORES = [
  [/\b(extreme|critical|catastrophic|emergency|red)\b/i, 100],
  [/\b(severe|high|major|orange)\b/i, 80],
  [/\b(moderate|medium|watch|yellow|nominal)\b/i, 55],
  [/\b(minor|low|advisory|green)\b/i, 30],
];

export function buildIncidentView(selection, snapshot = {}, options = {}) {
  const source = isRecord(snapshot) ? snapshot : {};
  const center = normalizeIncidentPoint(selection);
  const referenceMs = resolveReferenceTime(options.now, source.generatedAt, signalTime(selection));
  const referenceTime = referenceMs === null ? null : new Date(referenceMs).toISOString();
  const suggestion = radiusSuggestion(selection);
  const explicitRadius = positiveNumber(options.radiusKm);
  const radiusKm = round(clamp(explicitRadius ?? suggestion.km, 10, MAX_RADIUS_KM), 1);
  const maxInputPerLayer = boundedInteger(options.maxInputPerLayer, DEFAULT_MAX_INPUT, 1, DEFAULT_MAX_INPUT);
  const limits = resolveLimits(options.limits);
  const nearby = emptyNearby();
  const counts = {};
  const activityCandidates = [];

  for (const definition of LAYERS) {
    const items = readLayer(source, definition.aliases);
    const inspected = items.slice(0, maxInputPerLayer);
    const ranked = [];
    let mappable = 0;

    for (const item of inspected) {
      const point = normalizeIncidentPoint(item);
      if (!point) continue;
      mappable += 1;
      if (!center) continue;
      const centerDistanceKm = incidentDistanceKm(center, point);
      const footprintKm = itemFootprintKm(item, definition.type);
      const distanceKm = Math.max(0, centerDistanceKm - footprintKm);
      if (distanceKm > radiusKm) continue;
      ranked.push(compactSignal(item, definition.type, {
        point,
        centerDistanceKm,
        distanceKm,
        referenceMs,
        radiusKm,
      }));
    }

    ranked.sort(compareNearby);
    nearby[definition.key] = ranked.slice(0, limits[definition.key]);
    counts[definition.key] = {
      loaded: items.length,
      inspected: inspected.length,
      mappable,
      nearby: ranked.length,
      shown: nearby[definition.key].length,
      inputTruncated: items.length > inspected.length,
    };

    if (definition.type !== "camera") {
      const activityPoolSize = Math.max(24, limits.activity * 4);
      activityCandidates.push(...[...ranked].sort(compareActivity).slice(0, activityPoolSize));
    }
  }

  const totals = summarizeCounts(counts);
  counts.totalNearby = totals.nearby;
  counts.totalShown = totals.shown;
  counts.totalLoaded = totals.loaded;

  const references = center
    ? collectReferences(source, center, radiusKm, referenceMs, limits, maxInputPerLayer)
    : { weather: [], context: [] };
  const activity = center
    ? dedupeSignals(activityCandidates).sort(compareActivity).slice(0, limits.activity).map(toActivityItem)
    : [];
  const selected = center ? compactSelection(selection, center, referenceMs, radiusKm) : null;
  const overview = buildOverview(selected, nearby, counts, radiusKm);

  return {
    ok: Boolean(center),
    version: 1,
    reason: center ? "" : "A valid latitude and longitude are required.",
    center,
    selected,
    referenceTime,
    radiusKm,
    suggestedRadiusKm: suggestion.km,
    radiusReason: suggestion.reason,
    overview,
    counts,
    nearby,
    references,
    activity,
  };
}

export function normalizeIncidentPoint(value) {
  if (!isRecord(value)) return null;
  const candidates = [
    [value.lat, value.lng ?? value.lon],
    [value.latitude, value.longitude],
    [value.center?.lat, value.center?.lng ?? value.center?.lon],
    [value.position?.lat, value.position?.lng ?? value.position?.lon],
    [value.geometry?.type === "Point" ? value.geometry.coordinates?.[1] : undefined,
      value.geometry?.type === "Point" ? value.geometry.coordinates?.[0] : undefined],
    [Array.isArray(value.coordinates) ? value.coordinates[1] : undefined,
      Array.isArray(value.coordinates) ? value.coordinates[0] : undefined],
  ];

  for (const [rawLat, rawLng] of candidates) {
    const lat = finiteNumber(rawLat);
    const lng = finiteNumber(rawLng);
    if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

export function incidentDistanceKm(from, to) {
  const left = normalizeIncidentPoint(from);
  const right = normalizeIncidentPoint(to);
  if (!left || !right) return Number.POSITIVE_INFINITY;
  const toRadians = (value) => value * Math.PI / 180;
  const dLat = toRadians(right.lat - left.lat);
  const dLng = toRadians(right.lng - left.lng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(left.lat)) * Math.cos(toRadians(right.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export function suggestIncidentRadiusKm(selection) {
  return radiusSuggestion(selection).km;
}

export function scoreIncidentSignal(item, type, referenceTime) {
  const normalizedType = normalizeType(type || item?.type);
  const referenceMs = resolveReferenceTime(referenceTime);
  const timeMs = parseTime(signalTime(item));
  const ageMinutes = referenceMs === null || timeMs === null
    ? null
    : Math.max(0, (referenceMs - timeMs) / 60_000);
  let severityScore = wordSeverityScore(item);

  if (normalizedType === "earthquake") {
    const magnitude = finiteNumber(item?.magnitude ?? item?.mag);
    if (magnitude !== null) severityScore = Math.max(severityScore, quakeScore(magnitude));
  } else if (normalizedType === "fire") {
    severityScore = Math.max(severityScore, fireScore(item));
  } else if (normalizedType === "alert") {
    if (/immediate/i.test(cleanText(item?.urgency))) severityScore += 10;
    if (/observed/i.test(cleanText(item?.certainty))) severityScore += 5;
  } else if (normalizedType === "aircraft") {
    const emergency = `${cleanText(item?.emergency)} ${cleanText(item?.squawk)}`;
    severityScore = /7700|distress|emergency/i.test(emergency) ? 100 : Math.max(severityScore, 12);
  } else if (normalizedType === "satellite") {
    severityScore = Math.max(severityScore, 5);
  } else if (normalizedType === "vessel") {
    const navigation = `${cleanText(item?.navigationStatus)} ${cleanText(item?.status)} ${cleanText(item?.emergency)}`;
    severityScore = /distress|mayday|emergency|not under command/i.test(navigation) ? 95 : Math.max(severityScore, 8);
  } else if (normalizedType === "camera") {
    severityScore = 0;
  }

  const expiresMs = parseTime(item?.expires ?? item?.ends);
  if (referenceMs !== null && expiresMs !== null && expiresMs < referenceMs) severityScore *= 0.25;
  severityScore = Math.round(clamp(severityScore, 0, 100));
  const recencyScore = ageMinutes === null ? 0 : recencyFromAge(ageMinutes, normalizedType);

  return {
    severityLevel: severityLevel(severityScore),
    severityScore,
    recencyScore,
    ageMinutes: ageMinutes === null ? null : round(ageMinutes, 1),
    time: timeMs === null ? null : new Date(timeMs).toISOString(),
  };
}

function compactSignal(item, type, context) {
  const scoring = scoreIncidentSignal(item, type, context.referenceMs);
  const proximityScore = Math.round(100 * (1 - clamp(context.distanceKm / Math.max(context.radiusKm, 1), 0, 1)));
  const activityScore = Math.round(clamp(
    scoring.severityScore * 0.58 + scoring.recencyScore * 0.27 + proximityScore * 0.15,
    0,
    100,
  ));
  const common = {
    id: compactId(item, type),
    type,
    title: signalTitle(item, type),
    lat: context.point.lat,
    lng: context.point.lng,
    distanceKm: round(context.distanceKm, 2),
    centerDistanceKm: round(context.centerDistanceKm, 2),
    severity: cleanText(item?.severity) || scoring.severityLevel,
    ...scoring,
    activityScore,
    source: truncate(item?.source ?? item?.provider, 100),
    url: safeUrl(item?.url ?? item?.sourceUrl ?? item?.officialUrl ?? item?.detailUrl),
  };

  return compactObject({ ...common, details: signalDetails(item, type) });
}

function compactSelection(selection, center, referenceMs, radiusKm) {
  const item = isRecord(selection) ? selection : {};
  const type = inferType(item);
  if (!type) {
    return {
      id: truncate(item.id, 120),
      type: "point",
      title: truncate(item.title ?? item.name ?? item.label ?? "Selected location", 180),
      lat: center.lat,
      lng: center.lng,
      severityLevel: "unknown",
      severityScore: 0,
      recencyScore: 0,
      ageMinutes: null,
      time: null,
    };
  }
  return compactSignal(item, type, {
    point: center,
    centerDistanceKm: 0,
    distanceKm: 0,
    referenceMs,
    radiusKm,
  });
}

function signalDetails(item, type) {
  if (type === "camera") {
    const availability = cameraAvailability(item);
    return compactObject({
      area: truncate(item.area ?? item.region, 120),
      capability: truncate(item.capability ?? item.viewerType, 40),
      availability,
      playable: availability === "live" || availability === "video",
    });
  }
  if (type === "alert") {
    return compactObject({
      event: truncate(item.event, 100),
      area: truncate(item.areaSummary ?? item.region ?? item.area, 160),
      urgency: truncate(item.urgency, 40),
      certainty: truncate(item.certainty, 40),
      expires: normalizeTime(item.expires ?? item.ends),
    });
  }
  if (type === "fire") {
    return compactObject({
      subtype: truncate(item.subtype, 40),
      acres: finiteNumber(item.acres),
      frp: finiteNumber(item.frp),
      containmentPercent: finiteNumber(item.containment),
      confidence: truncate(item.confidence, 60),
    });
  }
  if (type === "earthquake") {
    return compactObject({
      magnitude: finiteNumber(item.magnitude ?? item.mag),
      depthKm: finiteNumber(item.depthKm ?? item.depth),
      location: truncate(item.location ?? item.place, 160),
    });
  }
  if (type === "aircraft") {
    const velocity = finiteNumber(item.velocity);
    return compactObject({
      callsign: truncate(item.callsign ?? item.name, 40),
      icao24: truncate(item.icao24, 16),
      registration: truncate(item.registration, 32),
      aircraftType: truncate(item.aircraftType, 40),
      altitudeMeters: finiteNumber(item.altitudeMeters),
      speedKmh: velocity === null ? null : round(velocity * 3.6, 1),
      heading: finiteNumber(item.heading),
      onGround: typeof item.onGround === "boolean" ? item.onGround : undefined,
      emergency: truncate(item.emergency, 40),
    });
  }
  if (type === "satellite") {
    return compactObject({
      noradId: truncate(item.noradId ?? item.noradCatId, 20),
      objectType: truncate(item.objectType ?? item.orbitClass, 40),
      altitudeKm: finiteNumber(item.altitudeKm ?? item.altitude),
      periodMinutes: finiteNumber(item.periodMinutes ?? item.period),
      inclination: finiteNumber(item.inclination),
    });
  }
  return compactObject({
    name: truncate(item.name, 100),
    mmsi: truncate(item.mmsi, 20),
    vesselType: truncate(item.vesselType, 60),
    destination: truncate(item.destination, 100),
    speedKnots: finiteNumber(item.speedKnots),
    course: finiteNumber(item.course ?? item.heading),
  });
}

function collectReferences(snapshot, center, radiusKm, referenceMs, limits, maxInput) {
  const localContexts = [snapshot.context, snapshot.locationContext, snapshot.briefContext].filter(isRecord);
  const weatherCandidates = [];
  addReference(weatherCandidates, snapshot.weather, "weather", true);
  for (const context of localContexts) addReference(weatherCandidates, context.weather, "weather", true);
  addReferenceArray(weatherCandidates, snapshot.weatherPoints, "weather");
  addReferenceArray(weatherCandidates, snapshot.weatherGrid, "weather");
  addReferenceArray(weatherCandidates, snapshot.globalWeatherPoints, "weather");
  for (const context of localContexts) addReferenceArray(weatherCandidates, context.weatherPoints, "weather");

  const contextCandidates = [];
  addReferenceArray(contextCandidates, snapshot.contextReferences, "context", true);
  addReferenceArray(contextCandidates, snapshot.demographics, "demographic");
  addTrafficReferences(contextCandidates, snapshot.traffic);
  addAviationReferences(contextCandidates, snapshot.aviation);
  addAirQualityReferences(contextCandidates, snapshot.airQuality);
  addReference(contextCandidates, snapshot.spaceWeather, "space-weather", true);
  for (const context of localContexts) {
    addReferenceArray(contextCandidates, context.contextReferences, "context", true);
    addTrafficReferences(contextCandidates, context.traffic);
    addAviationReferences(contextCandidates, context.aviation);
    addAirQualityReferences(contextCandidates, context.airQuality);
  }

  return {
    weather: rankReferences(weatherCandidates, center, radiusKm, referenceMs, limits.weather, maxInput),
    context: rankReferences(contextCandidates, center, radiusKm, referenceMs, limits.context, maxInput),
  };
}

function rankReferences(candidates, center, radiusKm, referenceMs, limit, maxInput) {
  const ranked = [];
  for (const candidate of candidates.slice(0, maxInput)) {
    const point = normalizeIncidentPoint(candidate.item);
    if (!point && !candidate.assumeLocal) continue;
    const centerDistanceKm = point ? incidentDistanceKm(center, point) : 0;
    const distanceKm = Math.max(0, centerDistanceKm - itemFootprintKm(candidate.item, candidate.kind));
    if (distanceKm > radiusKm * 1.5) continue;
    ranked.push(compactReference(candidate.item, candidate.kind, point || center, distanceKm, referenceMs));
  }
  return dedupeSignals(ranked).sort(compareReference).slice(0, limit);
}

function compactReference(item, kind, point, distanceKm, referenceMs) {
  const weather = kind === "weather";
  const weatherSeverity = weather ? weatherReferenceSeverity(item) : wordSeverityScore(item);
  const scored = scoreIncidentSignal({ ...item, severity: weatherSeverity.label }, kind, referenceMs);
  const timeMs = parseTime(signalTime(item));
  const details = weather ? {
    temperatureC: finiteNumber(item.temperatureC ?? item.temperature_2m),
    precipitationMm: finiteNumber(item.precipitationMm ?? item.precipitation),
    weatherCode: finiteNumber(item.weatherCode ?? item.weather_code),
    cloudCoverPercent: finiteNumber(item.cloudCoverPercent ?? item.cloudCover),
    windKmh: finiteNumber(item.windKmh ?? item.windSpeedKmh),
    windGustKmh: finiteNumber(item.windGustKmh ?? item.gustKmh),
  } : contextDetails(item, kind);
  return compactObject({
    id: compactId(item, kind),
    type: kind,
    title: referenceTitle(item, kind),
    lat: point.lat,
    lng: point.lng,
    distanceKm: round(distanceKm, 2),
    severityLevel: weather ? weatherSeverity.level : scored.severityLevel,
    severityScore: weather ? weatherSeverity.score : scored.severityScore,
    recencyScore: scored.recencyScore,
    ageMinutes: scored.ageMinutes,
    time: timeMs === null ? null : new Date(timeMs).toISOString(),
    source: truncate(item.source ?? item.provider, 100),
    url: safeUrl(item.url ?? item.sourceUrl ?? item.officialUrl),
    details: compactObject(details),
  });
}

function contextDetails(item, kind) {
  if (kind === "demographic") {
    return { population: finiteNumber(item.population), area: truncate(item.area ?? item.region, 100) };
  }
  if (kind === "traffic") {
    return {
      category: truncate(item.categoryLabel ?? item.category, 80),
      delaySeconds: finiteNumber(item.delaySeconds ?? item.delay),
      road: truncate(item.road ?? item.roads?.join(", "), 120),
    };
  }
  if (kind === "air-quality") {
    return { locality: truncate(item.locality ?? item.city, 100), measurements: arrayCount(item.measurements) };
  }
  if (kind === "aviation") {
    return { station: truncate(item.icaoId ?? item.station, 24), advisory: truncate(item.hazard ?? item.advisoryType, 80) };
  }
  if (kind === "space-weather") {
    return { kp: finiteNumber(item.kp), level: truncate(item.geomagneticLevel, 60), alertCount: arrayCount(item.alerts) };
  }
  return { summary: truncate(item.summary ?? item.description ?? item.note, 220) };
}

function addReference(target, item, kind, assumeLocal = false) {
  if (isRecord(item)) target.push({ item, kind, assumeLocal });
}

function addReferenceArray(target, items, kind, assumeLocal = false) {
  if (!Array.isArray(items)) return;
  for (const item of items) addReference(target, item, kind, assumeLocal);
}

function addTrafficReferences(target, traffic) {
  if (Array.isArray(traffic)) addReferenceArray(target, traffic, "traffic");
  else if (isRecord(traffic)) addReferenceArray(target, traffic.incidents, "traffic");
}

function addAviationReferences(target, aviation) {
  if (!isRecord(aviation)) return;
  addReferenceArray(target, aviation.stations, "aviation");
  addReferenceArray(target, aviation.advisories, "aviation");
}

function addAirQualityReferences(target, airQuality) {
  if (!isRecord(airQuality)) return;
  addReferenceArray(target, airQuality.stations, "air-quality");
}

function buildOverview(selected, nearby, counts, radiusKm) {
  const hazards = [...nearby.alerts, ...nearby.fires, ...nearby.earthquakes];
  const moving = [...nearby.aircraft, ...nearby.satellites, ...nearby.vessels];
  const selectedHazard = selected && ["alert", "fire", "earthquake"].includes(selected.type) ? selected : null;
  const highest = [selectedHazard, ...hazards].filter(Boolean).sort((a, b) => b.severityScore - a.severityScore)[0];
  const severityScore = highest?.severityScore || 0;
  const status = severityScore >= 85 ? "critical" : severityScore >= 65 ? "high" : severityScore >= 40 ? "elevated" : hazards.length ? "monitor" : "quiet";
  const hazardCount = counts.alerts.nearby + counts.fires.nearby + counts.earthquakes.nearby;
  const movingAssetCount = counts.aircraft.nearby + counts.satellites.nearby + counts.vessels.nearby;
  const cameraCount = counts.cameras.nearby;
  return {
    title: selected?.title || "Incident View",
    status,
    severityScore,
    recencyScore: highest?.recencyScore || 0,
    hazardCount,
    cameraCount,
    movingAssetCount,
    text: `${hazardCount} hazard ${plural(hazardCount, "signal")}, ${cameraCount} nearby ${plural(cameraCount, "camera")}, and ${movingAssetCount} moving ${plural(movingAssetCount, "asset")} within ${formatRadius(radiusKm)} km.`,
  };
}

function toActivityItem(item) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    summary: activitySummary(item),
    distanceKm: item.distanceKm,
    time: item.time,
    severityLevel: item.severityLevel,
    severityScore: item.severityScore,
    recencyScore: item.recencyScore,
    activityScore: item.activityScore,
    source: item.source,
    url: item.url,
  };
}

function activitySummary(item) {
  const distance = item.distanceKm < 0.1 ? "at the selected area" : `${formatRadius(item.distanceKm)} km away`;
  if (item.type === "earthquake") {
    const magnitude = item.details?.magnitude;
    return truncate(`${magnitude === undefined ? "Earthquake" : `Magnitude ${magnitude}`} ${distance}${item.details?.depthKm === undefined ? "" : ` at ${item.details.depthKm} km depth`}.`, 220);
  }
  if (item.type === "fire") {
    const scale = item.details?.acres ? `${Math.round(item.details.acres).toLocaleString("en-US")} acres` : item.details?.frp ? `FRP ${item.details.frp}` : "active fire signal";
    return truncate(`${scale} ${distance}.`, 220);
  }
  if (item.type === "alert") return truncate(`${item.details?.event || item.severity || "Alert"} ${distance}.`, 220);
  if (item.type === "aircraft") {
    const altitude = item.details?.altitudeMeters == null ? "" : ` at ${Math.round(item.details.altitudeMeters).toLocaleString("en-US")} m`;
    return truncate(`Aircraft ${distance}${altitude}.`, 220);
  }
  return truncate(`Vessel ${distance}${item.details?.destination ? ` bound for ${item.details.destination}` : ""}.`, 220);
}

function radiusSuggestion(selection) {
  const item = isRecord(selection) ? selection : {};
  const supplied = positiveNumber(item.radiusKm ?? item.radius);
  if (supplied !== null) return { km: round(clamp(supplied, 10, MAX_RADIUS_KM), 1), reason: "selected footprint" };

  const type = inferType(item);
  if (type === "alert") {
    const severity = wordSeverityScore(item);
    const km = severity >= 90 ? 250 : severity >= 70 ? 175 : severity >= 45 ? 110 : 70;
    return { km, reason: "alert severity" };
  }
  if (type === "earthquake") {
    const magnitude = finiteNumber(item.magnitude ?? item.mag) ?? 0;
    const km = magnitude >= 7 ? 600 : magnitude >= 6 ? 350 : magnitude >= 5 ? 220 : magnitude >= 4 ? 140 : 90;
    return { km, reason: "earthquake magnitude" };
  }
  if (type === "fire") {
    const acres = Math.max(0, finiteNumber(item.acres) ?? 0);
    const km = acres ? clamp(Math.sqrt(acres) * 1.3, 50, 450) : 100;
    return { km: round(km, 1), reason: acres ? "reported fire size" : "fire context" };
  }
  if (type === "camera") return { km: 60, reason: "camera context" };
  if (type === "aircraft" || type === "vessel") return { km: 90, reason: "moving asset context" };
  return { km: DEFAULT_RADIUS_KM, reason: "location context" };
}

function readLayer(snapshot, aliases) {
  const arrays = [];
  const seenArrays = new Set();
  for (const alias of aliases) {
    const items = snapshot[alias];
    if (Array.isArray(items) && !seenArrays.has(items)) {
      seenArrays.add(items);
      arrays.push(items);
    }
  }
  const output = [];
  const seenKeys = new Set();
  for (const item of arrays.flat()) {
    if (!isRecord(item)) {
      output.push(item);
      continue;
    }
    const id = cleanText(item.id);
    const point = normalizeIncidentPoint(item);
    const key = id ? `id:${id}` : point ? `point:${point.lat}:${point.lng}:${signalTitle(item, "item")}` : "";
    if (key && seenKeys.has(key)) continue;
    if (key) seenKeys.add(key);
    output.push(item);
  }
  return output;
}

function resolveLimits(input) {
  const limits = isRecord(input) ? input : {};
  const output = {};
  for (const layer of LAYERS) output[layer.key] = boundedInteger(limits[layer.key], layer.limit, 0, 50);
  output.weather = boundedInteger(limits.weather, 4, 0, 20);
  output.context = boundedInteger(limits.context, 6, 0, 24);
  output.activity = boundedInteger(limits.activity, 12, 0, 30);
  return output;
}

function emptyNearby() {
  return Object.fromEntries(LAYERS.map((layer) => [layer.key, []]));
}

function summarizeCounts(counts) {
  return Object.values(counts).reduce((totals, count) => ({
    loaded: totals.loaded + count.loaded,
    nearby: totals.nearby + count.nearby,
    shown: totals.shown + count.shown,
  }), { loaded: 0, nearby: 0, shown: 0 });
}

function compareNearby(left, right) {
  return left.distanceKm - right.distanceKm
    || right.activityScore - left.activityScore
    || compareTimes(right.time, left.time)
    || stableKey(left).localeCompare(stableKey(right));
}

function compareActivity(left, right) {
  return right.activityScore - left.activityScore
    || right.severityScore - left.severityScore
    || compareTimes(right.time, left.time)
    || left.distanceKm - right.distanceKm
    || stableKey(left).localeCompare(stableKey(right));
}

function compareReference(left, right) {
  return left.distanceKm - right.distanceKm
    || right.severityScore - left.severityScore
    || compareTimes(right.time, left.time)
    || stableKey(left).localeCompare(stableKey(right));
}

function compareTimes(left, right) {
  return (parseTime(left) ?? -1) - (parseTime(right) ?? -1);
}

function dedupeSignals(items) {
  const output = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function itemFootprintKm(item, type) {
  if (!isRecord(item)) return 0;
  const radius = positiveNumber(item.radiusKm ?? item.radius);
  if (radius !== null && ["alert", "fire", "earthquake", "demographic", "context"].includes(type)) {
    return clamp(radius, 0, MAX_RADIUS_KM);
  }
  return 0;
}

function wordSeverityScore(item) {
  if (!isRecord(item)) return 0;
  const text = [item.severity, item.alertLevel, item.urgency, item.event, item.status].map(cleanText).join(" ");
  for (const [pattern, score] of SEVERITY_WORD_SCORES) {
    if (pattern.test(text)) return score;
  }
  return text.trim() ? 15 : 0;
}

function quakeScore(magnitude) {
  if (magnitude >= 8) return 100;
  if (magnitude >= 7) return 95;
  if (magnitude >= 6) return 82;
  if (magnitude >= 5) return 65;
  if (magnitude >= 4) return 45;
  if (magnitude >= 3) return 25;
  return 10;
}

function fireScore(item) {
  const frp = Math.max(0, finiteNumber(item?.frp) ?? 0);
  const acres = Math.max(0, finiteNumber(item?.acres) ?? 0);
  const containment = finiteNumber(item?.containment);
  let score = frp >= 100 ? 90 : frp >= 40 ? 75 : frp >= 10 ? 55 : frp > 0 ? 35 : 0;
  if (acres >= 100_000) score = Math.max(score, 100);
  else if (acres >= 10_000) score = Math.max(score, 90);
  else if (acres >= 1_000) score = Math.max(score, 75);
  else if (acres >= 100) score = Math.max(score, 50);
  else if (acres > 0) score = Math.max(score, 30);
  if (containment !== null && containment < 20 && acres >= 100) score += 8;
  return Math.round(clamp(score, 0, 100));
}

function recencyFromAge(ageMinutes, type) {
  const halfLives = {
    aircraft: 5,
    vessel: 10,
    camera: 60,
    alert: 360,
    fire: 720,
    earthquake: 720,
    weather: 180,
  };
  const halfLife = halfLives[type] || 360;
  return Math.round(clamp(100 * 2 ** (-ageMinutes / halfLife), 0, 100));
}

function severityLevel(score) {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 40) return "moderate";
  if (score > 0) return "low";
  return "unknown";
}

function weatherReferenceSeverity(item) {
  const code = finiteNumber(item?.weatherCode ?? item?.weather_code);
  const gust = finiteNumber(item?.windGustKmh ?? item?.gustKmh) ?? 0;
  const precipitation = finiteNumber(item?.precipitationMm ?? item?.precipitation) ?? 0;
  let score = 10;
  if (code !== null && code >= 95) score = 80;
  else if (code !== null && (code >= 71 || code === 65 || code === 67)) score = 55;
  if (gust >= 120) score = Math.max(score, 95);
  else if (gust >= 80) score = Math.max(score, 75);
  else if (gust >= 50) score = Math.max(score, 50);
  if (precipitation >= 20) score = Math.max(score, 75);
  else if (precipitation >= 5) score = Math.max(score, 50);
  return { score, level: severityLevel(score), label: severityLevel(score) };
}

function cameraAvailability(item) {
  const text = `${cleanText(item?.streamStatus)} ${cleanText(item?.healthStatus)} ${cleanText(item?.status)} ${cleanText(item?.offlineReason)}`;
  if (/down|offline|unavailable|failed/i.test(text)) return "down";
  if (item?.capability === "stream" || item?.capability === "player" || ["hls", "video", "iframe"].includes(item?.viewerType)) return "live";
  if (item?.capability === "snapshot" || item?.viewerType === "image") return "snapshot";
  return "unknown";
}

function signalTitle(item, type) {
  const fallback = {
    camera: "Camera",
    alert: "Alert",
    fire: "Fire signal",
    earthquake: "Earthquake",
    aircraft: "Aircraft",
    satellite: "Satellite",
    vessel: "Vessel",
    weather: "Weather conditions",
  }[type] || "Signal";
  return truncate(item?.title ?? item?.name ?? item?.event ?? item?.callsign ?? fallback, 180);
}

function referenceTitle(item, kind) {
  if (kind === "weather") return signalTitle(item, "weather");
  if (kind === "space-weather") return truncate(item.title ?? `${item.geomagneticLevel || "Current"} space weather`, 180);
  if (kind === "demographic") return truncate(item.title ?? `${item.name || "Area"} population context`, 180);
  if (kind === "traffic") return truncate(item.title ?? item.name ?? item.description ?? item.categoryLabel ?? "Road incident", 180);
  if (kind === "aviation") return truncate(item.title ?? item.name ?? item.icaoId ?? "Aviation weather", 180);
  if (kind === "air-quality") return truncate(item.title ?? item.name ?? "Air-quality monitor", 180);
  return truncate(item.title ?? item.name ?? item.summary ?? "Context reference", 180);
}

function inferType(item) {
  if (!isRecord(item)) return "";
  const explicit = normalizeType(item.type ?? item.signalType ?? item.kind);
  if (explicit) return explicit;
  if (item.event || item.urgency || item.certainty) return "alert";
  if (item.magnitude !== undefined || item.mag !== undefined || item.depthKm !== undefined) return "earthquake";
  if (item.frp !== undefined || item.acres !== undefined || item.containment !== undefined) return "fire";
  if (item.icao24 || item.callsign || item.altitudeMeters !== undefined) return "aircraft";
  if (item.noradId || item.noradCatId || item.objectType || item.orbitClass) return "satellite";
  if (item.mmsi || item.vesselType || item.speedKnots !== undefined) return "vessel";
  if (item.capability || item.viewerType || item.imageUrl || item.streamUrl) return "camera";
  return "";
}

function normalizeType(value) {
  return TYPE_ALIASES[cleanText(value).toLowerCase()] || "";
}

function signalTime(item) {
  if (!isRecord(item)) return null;
  return item.time ?? item.observedAt ?? item.updatedAt ?? item.publishedAt ?? item.sent ?? item.effective ?? item.date ?? item.timestamp ?? null;
}

function parseTime(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "number" && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value;
  const text = String(value).trim();
  const timezoneFreeIso = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;
  const parsed = Date.parse(timezoneFreeIso.test(text) ? `${text.replace(" ", "T")}Z` : text);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveReferenceTime(...values) {
  for (const value of values) {
    const parsed = parseTime(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function normalizeTime(value) {
  const time = parseTime(value);
  return time === null ? undefined : new Date(time).toISOString();
}

function compactId(item, type) {
  const explicit = truncate(item?.id ?? item?.icao24 ?? item?.mmsi, 120);
  if (explicit) return explicit;
  const point = normalizeIncidentPoint(item);
  return `${type}:${point ? `${point.lat.toFixed(4)},${point.lng.toFixed(4)}` : "unknown"}:${signalTitle(item, type).toLowerCase()}`;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function safeUrl(value) {
  const text = truncate(value, 2048);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function stableKey(item) {
  return `${item.type || ""}:${item.id || ""}:${item.title || ""}`;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = finiteNumber(value);
  return number === null ? fallback : Math.round(clamp(number, minimum, maximum));
}

function truncate(value, maxLength) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function arrayCount(value) {
  return Array.isArray(value) ? value.length : undefined;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, places = 0) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function formatRadius(value) {
  return value < 10 ? round(value, 1).toLocaleString("en-US") : Math.round(value).toLocaleString("en-US");
}

function plural(count, singular) {
  return count === 1 ? singular : `${singular}s`;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
