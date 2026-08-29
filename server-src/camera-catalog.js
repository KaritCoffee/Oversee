const CACHE_BUST_PARAMS = new Set([
  "_",
  "cache",
  "cachebust",
  "cachebuster",
  "cb",
  "nocache",
  "t",
  "time",
  "timestamp",
  "ts",
]);

function canonicalCameraMediaUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!/^https?:$/.test(url.protocol)) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (CACHE_BUST_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch {
    return "";
  }
}

function cameraMediaCandidates(camera = {}) {
  const candidates = [];
  const push = (candidate) => {
    const url = String(candidate?.url || "").trim();
    if (!url) return;
    const type = normalizeMediaType(candidate.type, url);
    const key = `${type}|${canonicalCameraMediaUrl(url) || url}`;
    if (candidates.some((item) => item.key === key)) return;
    candidates.push({
      key,
      type,
      url,
      sourceName: candidate.sourceName || camera.sourceName || "Public source",
      sourcePageUrl: candidate.sourcePageUrl || camera.sourcePageUrl || camera.officialUrl || camera.sourceUrl || "",
      refreshSeconds: Number(candidate.refreshSeconds || camera.refreshSeconds || 60),
      requestHeaders: sanitizeRequestHeaders(candidate.requestHeaders || camera.requestHeaders),
      primary: Boolean(candidate.primary),
    });
  };

  if (camera.streamUrl) {
    push({
      type: camera.viewerType === "video" ? "video" : "hls",
      url: camera.streamUrl,
      primary: true,
    });
  }
  if (camera.imageUrl || camera.previewUrl) {
    push({ type: "image", url: camera.imageUrl || camera.previewUrl, primary: !camera.streamUrl });
  }
  for (const fallback of camera.fallbackViews || []) push(fallback);
  return candidates;
}

function deduplicateCameras(cameras = [], options = {}) {
  const statusFor = typeof options.statusFor === "function" ? options.statusFor : () => ({ status: "unverified", healthScore: 45 });
  const output = [];
  const idIndex = new Map();
  const geoNameIndex = new Map();
  const mediaIndex = new Map();
  let merged = 0;

  for (const input of cameras) {
    if (!input?.id || !validPosition(input)) continue;
    const camera = withCatalogScore(input, statusFor(input.id));
    const normalizedName = normalizeCameraName(camera.name);
    const geoNameKey = normalizedName
      ? `${Number(camera.lat).toFixed(5)}:${Number(camera.lng).toFixed(5)}:${normalizedName}`
      : "";
    let index = idIndex.get(String(camera.id));
    if (index === undefined && geoNameKey) index = geoNameIndex.get(geoNameKey);
    if (index === undefined) index = findMediaDuplicate(camera, output, mediaIndex);

    if (index === undefined) {
      index = output.length;
      output.push(camera);
    } else {
      output[index] = mergeCameraRecords(output[index], camera, statusFor);
      merged += 1;
    }

    const selected = output[index];
    idIndex.set(String(camera.id), index);
    idIndex.set(String(selected.id), index);
    const selectedName = normalizeCameraName(selected.name);
    if (selectedName) {
      geoNameIndex.set(`${Number(selected.lat).toFixed(5)}:${Number(selected.lng).toFixed(5)}:${selectedName}`, index);
    }
    indexMediaCandidates(selected, index, mediaIndex);
  }

  return {
    cameras: applyCoveragePriority(output),
    stats: { input: cameras.length, output: output.length, merged },
  };
}

function applyCoveragePriority(cameras = []) {
  const cells = new Map();
  const countries = new Map();
  const sources = new Map();
  for (const camera of cameras) {
    increment(cells, coverageCell(camera));
    increment(countries, camera.country || "Unknown");
    increment(sources, camera.sourceId || camera.sourceName || "Unknown");
  }

  return cameras.map((camera) => {
    const cellCount = cells.get(coverageCell(camera)) || 1;
    const countryCount = countries.get(camera.country || "Unknown") || 1;
    const sourceCount = sources.get(camera.sourceId || camera.sourceName || "Unknown") || 1;
    const sparseCellBonus = 24 / Math.sqrt(cellCount);
    const countryBonus = 10 / Math.sqrt(countryCount);
    const sourceBonus = 6 / Math.sqrt(sourceCount);
    const coveragePriority = clamp(Math.round(Number(camera.catalogScore || 0) + sparseCellBonus + countryBonus + sourceBonus), 0, 100);
    return {
      ...camera,
      coveragePriority,
      coverageWeight: Number((1 / Math.sqrt(cellCount)).toFixed(4)),
    };
  });
}

function cameraQualityScore(camera = {}, health = {}) {
  let score = 12;
  if (camera.capability === "stream") score += 30;
  else if (camera.capability === "player") score += 25;
  else if (camera.viewerType === "image" || camera.capability === "snapshot") score += 18;
  else if (camera.resolverType) score += 12;
  else score -= 8;
  if (camera.streamUrl) score += 8;
  if (camera.imageUrl || camera.previewUrl) score += 6;
  if (camera.officialUrl || camera.sourcePageUrl) score += 3;
  if (camera.dynamic) score += 2;
  if (camera.personal) score -= 2;

  const status = health.status || camera.healthStatus || "unverified";
  const healthScore = Number(health.healthScore ?? camera.healthScore);
  if (Number.isFinite(healthScore)) score += (healthScore - 45) * 0.35;
  if (status === "verified") score += 10;
  else if (status === "degraded") score -= 4;
  else if (status === "down") score -= 32;
  return clamp(Math.round(score), 0, 100);
}

function mergeCameraRecords(left, right, statusFor = () => ({})) {
  const leftScore = cameraQualityScore(left, statusFor(left.id));
  const rightScore = cameraQualityScore(right, statusFor(right.id));
  const primary = rightScore > leftScore ? right : left;
  const alternate = primary === left ? right : left;
  const alternateSources = uniqueStrings([
    ...(left.alternateSources || []),
    ...(right.alternateSources || []),
    left.sourceName,
    right.sourceName,
  ]);
  const fallbackViews = mergeMediaCandidates(primary, alternate)
    .filter((candidate) => !candidate.primary)
    .map(({ key, primary: ignored, ...candidate }) => candidate);
  const merged = {
    ...alternate,
    ...primary,
    fallbackViews,
    alternateSources,
    alternateSourceCount: Math.max(0, alternateSources.length - 1),
    duplicateCount: Number(left.duplicateCount || 1) + Number(right.duplicateCount || 1),
  };
  return withCatalogScore(merged, statusFor(merged.id));
}

function mergeMediaCandidates(primary, alternate) {
  const all = [
    ...cameraMediaCandidates(primary),
    ...cameraMediaCandidates(alternate).map((candidate) => ({ ...candidate, primary: false })),
  ];
  const seen = new Set();
  return all.filter((candidate) => {
    if (seen.has(candidate.key)) return false;
    seen.add(candidate.key);
    return true;
  });
}

function findMediaDuplicate(camera, output, mediaIndex) {
  for (const candidate of cameraMediaCandidates(camera)) {
    const indexes = mediaIndex.get(candidate.key) || [];
    for (const index of indexes) {
      const existing = output[index];
      if (existing && distanceKm(camera, existing) <= 2) return index;
    }
  }
  return undefined;
}

function indexMediaCandidates(camera, index, mediaIndex) {
  for (const candidate of cameraMediaCandidates(camera)) {
    const values = mediaIndex.get(candidate.key) || [];
    if (!values.includes(index)) values.push(index);
    mediaIndex.set(candidate.key, values);
  }
}

function withCatalogScore(camera, health) {
  return {
    ...camera,
    fallbackViews: Array.isArray(camera.fallbackViews) ? camera.fallbackViews : [],
    alternateSources: uniqueStrings(camera.alternateSources || [camera.sourceName]),
    duplicateCount: Number(camera.duplicateCount || 1),
    catalogScore: cameraQualityScore(camera, health),
  };
}

function normalizeMediaType(type, url) {
  if (type === "hls" || type === "video" || type === "image") return type;
  if (/\.m3u8(?:$|\?)/i.test(url)) return "hls";
  if (/\.(?:mp4|m4v|webm)(?:$|\?)/i.test(url)) return "video";
  return "image";
}

function normalizeCameraName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(?:live|public|traffic|camera|cctv|webcam)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sanitizeRequestHeaders(headers) {
  if (!headers || typeof headers !== "object") return undefined;
  const output = {};
  for (const key of ["Referer", "Origin"]) {
    if (headers[key]) output[key] = String(headers[key]);
  }
  return Object.keys(output).length ? output : undefined;
}

function coverageCell(camera) {
  return `${Math.floor((Number(camera.lat) + 90) / 5)}:${Math.floor((Number(camera.lng) + 180) / 5)}`;
}

function distanceKm(left, right) {
  const toRadians = (value) => Number(value) * Math.PI / 180;
  const latA = toRadians(left.lat);
  const latB = toRadians(right.lat);
  const dLat = latB - latA;
  const dLng = toRadians(right.lng) - toRadians(left.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

function validPosition(camera) {
  const lat = Number(camera?.lat);
  const lng = Number(camera?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

module.exports = {
  applyCoveragePriority,
  cameraMediaCandidates,
  cameraQualityScore,
  canonicalCameraMediaUrl,
  deduplicateCameras,
  normalizeCameraName,
};
