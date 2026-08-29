const DEFAULT_API_URL = "https://ll.thespacedevs.com/2.3.0/launches/";

async function fetchLaunchLibrary({ fetchJson, token = "", now = new Date(), limit = 100 }) {
  const url = buildLaunchLibraryUrl(now, limit);
  const headers = token ? { Authorization: `Token ${token}` } : {};
  const payload = await fetchJson(url, { timeoutMs: 20_000, headers });
  return (Array.isArray(payload?.results) ? payload.results : [])
    .map(normalizeLaunch)
    .filter(Boolean);
}

function buildLaunchLibraryUrl(now = new Date(), limit = 100) {
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const url = new URL(DEFAULT_API_URL);
  url.searchParams.set("net__gte", start.toISOString());
  url.searchParams.set("net__lte", end.toISOString());
  url.searchParams.set("ordering", "net");
  url.searchParams.set("limit", String(Math.max(1, Math.min(100, Number(limit) || 100))));
  url.searchParams.set("mode", "detailed");
  return url.toString();
}

function normalizeLaunch(record) {
  const lat = finiteNumber(record?.pad?.latitude ?? record?.pad?.location?.latitude);
  const lng = finiteNumber(record?.pad?.longitude ?? record?.pad?.location?.longitude);
  if (!record?.id || lat === null || lng === null) return null;

  const status = cleanText(record.status?.name || record.status?.abbrev || "Scheduled");
  const agency = cleanText(record.launch_service_provider?.name || record.mission?.agencies?.[0]?.name);
  const rocket = cleanText(record.rocket?.configuration?.full_name || record.rocket?.configuration?.name);
  const pad = cleanText(record.pad?.name || record.pad?.location?.name || "Launch site");
  const location = cleanText(record.pad?.location?.name || pad);
  const videos = Array.isArray(record.vidURLs) ? record.vidURLs : [];
  const webcast = videos.find((entry) => entry?.url)?.url || record.webcast_live || "";
  const imageUrl = record.image?.image_url || record.image_url || record.mission?.image || "";
  const net = validIsoDate(record.net);

  return {
    id: `launch-${record.id}`,
    type: "launch",
    name: cleanText(record.name || `${rocket || "Rocket"} launch`),
    status,
    net,
    windowStart: validIsoDate(record.window_start),
    windowEnd: validIsoDate(record.window_end),
    agency,
    rocket,
    pad,
    area: location,
    region: cleanText(record.pad?.location?.map_url ? location : record.pad?.location?.name || location),
    country: cleanText(record.pad?.country_code || record.pad?.location?.country_code),
    missionName: cleanText(record.mission?.name),
    missionType: cleanText(record.mission?.type),
    description: cleanText(record.mission?.description || record.program?.[0]?.description),
    orbit: cleanText(record.mission?.orbit?.name || record.mission?.orbit?.abbrev),
    lat,
    lng,
    imageUrl,
    webcast,
    source: "Launch Library 2",
    sourceUrl: record.url || "https://thespacedevs.com/llapi",
    officialUrl: record.pad?.map_url || record.url || "https://thespacedevs.com/llapi",
    time: net,
  };
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function validIsoDate(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

module.exports = {
  buildLaunchLibraryUrl,
  fetchLaunchLibrary,
  normalizeLaunch,
};
