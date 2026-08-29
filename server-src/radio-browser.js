const RADIO_BROWSER_HOSTS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
];

async function fetchRadioStations({ fetchJson, limit = 900 }) {
  let lastError;
  for (const host of RADIO_BROWSER_HOSTS) {
    const url = new URL("/json/stations/search", host);
    url.searchParams.set("hidebroken", "true");
    url.searchParams.set("order", "clickcount");
    url.searchParams.set("reverse", "true");
    url.searchParams.set("limit", String(Math.max(1, Math.min(1500, Number(limit) || 900))));
    try {
      const payload = await fetchJson(url.toString(), { timeoutMs: 18_000 });
      return (Array.isArray(payload) ? payload : []).map(normalizeRadioStation).filter(Boolean);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Radio Browser did not return a station catalog");
}

function normalizeRadioStation(record) {
  const lat = finiteNumber(record?.geo_lat);
  const lng = finiteNumber(record?.geo_long);
  const streamUrl = String(record?.url_resolved || record?.url || "").trim();
  if (!record?.stationuuid || lat === null || lng === null || !/^https:\/\//i.test(streamUrl)) return null;
  const name = cleanText(record.name || record.stationuuid);
  return {
    id: `radio-${record.stationuuid}`,
    type: "radio",
    name,
    area: cleanText(record.state || record.country || "Global radio"),
    region: cleanText(record.state || record.country),
    country: cleanText(record.country),
    countryCode: cleanText(record.countrycode),
    language: cleanText(record.language),
    tags: String(record.tags || "").split(",").map(cleanText).filter(Boolean).slice(0, 12),
    codec: cleanText(record.codec),
    bitrate: finiteNumber(record.bitrate),
    votes: finiteNumber(record.votes),
    clickCount: finiteNumber(record.clickcount),
    streamUrl,
    homepage: /^https?:\/\//i.test(record.homepage || "") ? record.homepage : "",
    favicon: /^https?:\/\//i.test(record.favicon || "") ? record.favicon : "",
    lat,
    lng,
    source: "Radio Browser",
    sourceUrl: "https://www.radio-browser.info/",
  };
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

module.exports = {
  RADIO_BROWSER_HOSTS,
  fetchRadioStations,
  normalizeRadioStation,
};
