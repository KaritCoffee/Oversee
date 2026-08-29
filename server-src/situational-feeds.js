const GDACS_EVENT_NAMES = {
  EQ: "Earthquake",
  TC: "Tropical cyclone",
  FL: "Flood",
  VO: "Volcano",
  DR: "Drought",
  WF: "Wildfire",
};

const TOMTOM_INCIDENT_NAMES = {
  0: "Traffic incident",
  1: "Crash",
  2: "Fog",
  3: "Hazardous conditions",
  4: "Heavy rain",
  5: "Ice",
  6: "Traffic jam",
  7: "Lane closed",
  8: "Road closed",
  9: "Road work",
  10: "High wind",
  11: "Road flooding",
  14: "Disabled vehicle",
};

async function fetchGdacsEvents({ fetchJson, now = new Date() }) {
  const from = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  const url = new URL("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH");
  url.searchParams.set("eventlist", "EQ;TC;FL;VO;DR;WF");
  url.searchParams.set("fromdate", isoDate(from));
  url.searchParams.set("todate", isoDate(now));
  url.searchParams.set("alertlevel", "red;orange;green");
  url.searchParams.set("pagesize", "100");
  const payload = await fetchJson(url.toString(), { timeoutMs: 12_000 });
  return normalizeGdacsEvents(payload);
}

function normalizeGdacsEvents(payload) {
  const features = Array.isArray(payload?.features)
    ? payload.features
    : Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

  return features.map((feature, index) => {
    const props = feature?.properties || feature || {};
    const eventType = String(props.eventtype || props.eventType || props.type || "").toUpperCase();
    const eventId = String(props.eventid || props.eventId || props.id || index);
    const point = geometryCenter(feature?.geometry || props.geometry);
    if (!point) return null;
    const alertLevel = String(props.alertlevel || props.alertLevel || "green").toLowerCase();
    const severity = alertLevel === "red" ? "critical" : alertLevel === "orange" ? "high" : "medium";
    const country = cleanText(props.country || props.countryname || props.affectedcountries || "Global");
    const eventName = GDACS_EVENT_NAMES[eventType] || cleanText(props.eventname || props.name || "Disaster event");
    const title = cleanText(props.name || props.eventname || props.title || `${eventName}${country ? ` - ${country}` : ""}`);
    const time = normalizeTime(props.fromdate || props.fromDate || props.datetime || props.date || props.todate);
    const geometry = simplifyGeoGeometry(feature?.geometry || props.geometry);
    return {
      id: `gdacs-${eventType || "event"}-${eventId}`,
      type: "alert",
      subtype: "global-disaster",
      eventType,
      event: eventName,
      title,
      name: title,
      area: country || "Global",
      region: country || "Global",
      areaSummary: country || "Global",
      country,
      lat: point.lat,
      lng: point.lng,
      radiusKm: gdacsRadiusKm(eventType, props),
      geometry,
      severity,
      alertLevel,
      urgency: alertLevel === "red" ? "Immediate" : "Expected",
      certainty: "Observed",
      time,
      expires: normalizeTime(props.todate || props.toDate),
      description: cleanText(props.description || props.htmldescription || props.severitydata?.severitytext || ""),
      source: "GDACS",
      sourceUrl: normalizeHttpUrl(props.url?.report || props.url?.details || props.url || `https://www.gdacs.org/report.aspx?eventid=${encodeURIComponent(eventId)}&episodeid=${encodeURIComponent(props.episodeid || "")}&eventtype=${encodeURIComponent(eventType)}`),
      officialUrl: "https://www.gdacs.org/",
    };
  }).filter(Boolean);
}

async function fetchOpenMeteoWeather({ fetchJson, lat, lng }) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m");
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability,precipitation,weather_code,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("timezone", "auto");
  const payload = await fetchJson(url.toString(), { timeoutMs: 10_000 });
  return normalizeOpenMeteoWeather(payload);
}

async function fetchOpenMeteoGrid({ fetchJson, bounds, maxPoints = 48 }) {
  const requested = weatherGridPoints(bounds, maxPoints);
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", requested.map((point) => point.lat).join(","));
  url.searchParams.set("longitude", requested.map((point) => point.lng).join(","));
  url.searchParams.set("current", "temperature_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", "GMT");
  const payload = await fetchJson(url.toString(), { timeoutMs: 12_000 });
  const rows = Array.isArray(payload) ? payload : [payload];
  return rows.map((row, index) => {
    const current = row?.current || {};
    const fallback = requested[index] || requested[0];
    return {
      id: `weather-${index}-${Number(row?.latitude ?? fallback.lat).toFixed(2)}-${Number(row?.longitude ?? fallback.lng).toFixed(2)}`,
      lat: finiteOrNull(row?.latitude) ?? fallback.lat,
      lng: finiteOrNull(row?.longitude) ?? fallback.lng,
      observedAt: current.time || new Date().toISOString(),
      temperatureC: finiteOrNull(current.temperature_2m),
      precipitationMm: finiteOrNull(current.precipitation),
      weatherCode: finiteOrNull(current.weather_code),
      cloudCoverPercent: finiteOrNull(current.cloud_cover),
      windKmh: finiteOrNull(current.wind_speed_10m),
      windDirection: finiteOrNull(current.wind_direction_10m),
      windGustKmh: finiteOrNull(current.wind_gusts_10m),
      source: "Open-Meteo",
    };
  }).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function weatherGridPoints(bounds, maxPoints) {
  const total = Math.max(9, Math.min(80, Number(maxPoints || 48)));
  const latSpan = Math.max(0.1, bounds.north - bounds.south);
  const lngSpan = bounds.east >= bounds.west ? bounds.east - bounds.west : 360 - bounds.west + bounds.east;
  const columns = Math.max(3, Math.round(Math.sqrt(total * Math.max(0.5, lngSpan / latSpan))));
  const rows = Math.max(3, Math.floor(total / columns));
  const points = [];
  for (let row = 0; row < rows; row += 1) {
    const lat = bounds.south + (latSpan * (row + 0.5)) / rows;
    for (let column = 0; column < columns; column += 1) {
      let lng = bounds.west + (lngSpan * (column + 0.5)) / columns;
      if (lng > 180) lng -= 360;
      points.push({ lat: Number(lat.toFixed(3)), lng: Number(lng.toFixed(3)) });
      if (points.length >= total) return points;
    }
  }
  return points;
}

function normalizeOpenMeteoWeather(payload = {}) {
  const current = payload.current || {};
  const hourly = payload.hourly || {};
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const nextHours = times.slice(0, 24).map((time, index) => ({
    time,
    temperatureC: finiteOrNull(hourly.temperature_2m?.[index]),
    precipitationProbability: finiteOrNull(hourly.precipitation_probability?.[index]),
    precipitationMm: finiteOrNull(hourly.precipitation?.[index]),
    weatherCode: finiteOrNull(hourly.weather_code?.[index]),
    cloudCover: finiteOrNull(hourly.cloud_cover?.[index]),
    visibilityMeters: finiteOrNull(hourly.visibility?.[index]),
    windKmh: finiteOrNull(hourly.wind_speed_10m?.[index]),
    windGustKmh: finiteOrNull(hourly.wind_gusts_10m?.[index]),
  }));
  return {
    observedAt: current.time || new Date().toISOString(),
    timezone: payload.timezone || "UTC",
    elevationMeters: finiteOrNull(payload.elevation),
    temperatureC: finiteOrNull(current.temperature_2m),
    apparentTemperatureC: finiteOrNull(current.apparent_temperature),
    humidityPercent: finiteOrNull(current.relative_humidity_2m),
    precipitationMm: finiteOrNull(current.precipitation),
    rainMm: finiteOrNull(current.rain),
    snowCm: finiteOrNull(current.snowfall),
    weatherCode: finiteOrNull(current.weather_code),
    cloudCoverPercent: finiteOrNull(current.cloud_cover),
    pressureHpa: finiteOrNull(current.pressure_msl),
    windKmh: finiteOrNull(current.wind_speed_10m),
    windDirection: finiteOrNull(current.wind_direction_10m),
    windGustKmh: finiteOrNull(current.wind_gusts_10m),
    isDay: current.is_day === 1,
    nextHours,
    source: "Open-Meteo",
    sourceUrl: "https://open-meteo.com/",
  };
}

async function fetchOpenAqAirQuality({ fetchJson, apiKey, lat, lng, radiusKm = 25 }) {
  if (!apiKey) return { configured: false, stations: [], note: "Add an OpenAQ API key in Settings for local air-quality monitors." };
  const radiusMeters = Math.max(1000, Math.min(25000, Math.round(Number(radiusKm || 25) * 1000)));
  const url = new URL("https://api.openaq.org/v3/locations");
  url.searchParams.set("coordinates", `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`);
  url.searchParams.set("radius", String(radiusMeters));
  url.searchParams.set("limit", "8");
  url.searchParams.set("page", "1");
  const headers = { "X-API-Key": apiKey };
  const payload = await fetchJson(url.toString(), { timeoutMs: 10_000, headers });
  const locations = normalizeOpenAqLocations(payload).slice(0, 6);
  const latest = await Promise.allSettled(locations.map((location) => fetchJson(`https://api.openaq.org/v3/locations/${encodeURIComponent(location.locationId)}/latest?limit=100&page=1`, { timeoutMs: 10_000, headers })));
  return {
    configured: true,
    stations: locations.map((location, index) => ({
      ...location,
      measurements: normalizeOpenAqLatest(latest[index]?.status === "fulfilled" ? latest[index].value : {}, location.sensors),
    })),
    partial: latest.some((result) => result.status === "rejected"),
    source: "OpenAQ",
    sourceUrl: "https://openaq.org/",
  };
}

function normalizeOpenAqLocations(payload = {}) {
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  return rows.map((row) => {
    const lat = finiteOrNull(row?.coordinates?.latitude);
    const lng = finiteOrNull(row?.coordinates?.longitude);
    if (lat == null || lng == null || !row?.id) return null;
    return {
      id: `openaq-location-${row.id}`,
      locationId: Number(row.id),
      name: cleanText(row.name || row.locality || `OpenAQ station ${row.id}`),
      locality: cleanText(row.locality || row.country?.name || ""),
      country: cleanText(row.country?.name || row.country?.code || ""),
      provider: cleanText(row.provider?.name || row.owner?.name || "OpenAQ provider"),
      lat,
      lng,
      distanceMeters: finiteOrNull(row.distance),
      lastObservedAt: normalizeTime(row.datetimeLast?.utc),
      sensors: (Array.isArray(row.sensors) ? row.sensors : []).map((sensor) => ({
        id: Number(sensor.id),
        parameter: cleanText(sensor.parameter?.displayName || sensor.parameter?.name || sensor.name || "Measurement"),
        units: cleanText(sensor.parameter?.units || ""),
      })).filter((sensor) => Number.isFinite(sensor.id)),
    };
  }).filter(Boolean).sort((left, right) => (left.distanceMeters ?? Infinity) - (right.distanceMeters ?? Infinity));
}

function normalizeOpenAqLatest(payload = {}, sensors = []) {
  const sensorById = new Map(sensors.map((sensor) => [Number(sensor.id), sensor]));
  return (Array.isArray(payload?.results) ? payload.results : []).map((row) => {
    const sensor = sensorById.get(Number(row.sensorsId)) || {};
    const value = finiteOrNull(row.value);
    if (value == null) return null;
    return {
      sensorId: Number(row.sensorsId),
      parameter: sensor.parameter || `Sensor ${row.sensorsId}`,
      units: sensor.units || "",
      value,
      observedAt: normalizeTime(row.datetime?.utc),
    };
  }).filter(Boolean).sort((left, right) => airQualityParameterRank(left.parameter) - airQualityParameterRank(right.parameter));
}

function airQualityParameterRank(value) {
  const parameter = String(value || "").toLowerCase();
  if (/pm\s*2[._]?5/.test(parameter)) return 0;
  if (/pm\s*10/.test(parameter)) return 1;
  if (/ozone|\bo3\b/.test(parameter)) return 2;
  if (/nitrogen|\bno2\b/.test(parameter)) return 3;
  return 4;
}

async function fetchAviationWeather({ fetchJson, bounds }) {
  const bbox = [bounds.south, bounds.west, bounds.north, bounds.east].map((value) => Number(value).toFixed(4)).join(",");
  const metarUrl = `https://aviationweather.gov/api/data/metar?bbox=${encodeURIComponent(bbox)}&format=json&hours=3`;
  const sigmetUrl = `https://aviationweather.gov/api/data/airsigmet?bbox=${encodeURIComponent(bbox)}&format=geojson`;
  const [metars, sigmets] = await Promise.allSettled([
    fetchJson(metarUrl, { timeoutMs: 10_000 }),
    fetchJson(sigmetUrl, { timeoutMs: 10_000 }),
  ]);
  if (metars.status === "rejected" && sigmets.status === "rejected") {
    throw new Error(`Aviation weather unavailable: ${metars.reason?.message || sigmets.reason?.message || "request failed"}`);
  }
  return {
    stations: normalizeMetars(metars.status === "fulfilled" ? metars.value : []),
    advisories: normalizeAirSigmets(sigmets.status === "fulfilled" ? sigmets.value : []),
    partial: metars.status === "rejected" || sigmets.status === "rejected",
    source: "Aviation Weather Center",
    sourceUrl: "https://aviationweather.gov/",
  };
}

function normalizeMetars(payload) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((row, index) => {
    const lat = finiteOrNull(row.lat ?? row.latitude);
    const lng = finiteOrNull(row.lon ?? row.lng ?? row.longitude);
    if (lat == null || lng == null) return null;
    return {
      id: `metar-${row.icaoId || row.icao || index}`,
      station: row.icaoId || row.icao || "Unknown",
      name: row.name || row.site || row.icaoId || "Airport weather",
      lat,
      lng,
      observedAt: normalizeTime(row.reportTime || row.obsTime || row.receiptTime),
      category: row.fltCat || row.flightCategory || "",
      temperatureC: finiteOrNull(row.temp),
      dewpointC: finiteOrNull(row.dewp),
      windDirection: finiteOrNull(row.wdir),
      windKnots: finiteOrNull(row.wspd),
      windGustKnots: finiteOrNull(row.wgst),
      visibilityMiles: finiteOrNull(row.visib),
      ceilingFeet: finiteOrNull(row.clouds?.find?.((cloud) => /BKN|OVC|VV/.test(cloud.cover))?.base),
      altimeterHpa: finiteOrNull(row.altim),
      raw: cleanText(row.rawOb || row.raw || ""),
    };
  }).filter(Boolean);
}

function normalizeAirSigmets(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : Array.isArray(payload) ? payload : [];
  return features.map((feature, index) => {
    const props = feature?.properties || feature || {};
    const point = geometryCenter(feature?.geometry || props.geometry);
    if (!point) return null;
    return {
      id: `airsigmet-${props.airsigmetId || props.id || index}`,
      name: cleanText(props.hazard || props.airsigmetType || props.rawAirSigmet || "Aviation advisory"),
      hazard: cleanText(props.hazard || props.airsigmetType || "Advisory"),
      severity: cleanText(props.severity || ""),
      lat: point.lat,
      lng: point.lng,
      geometry: simplifyGeoGeometry(feature?.geometry || props.geometry),
      startsAt: normalizeTime(props.validTimeFrom || props.validTime || props.issueTime),
      endsAt: normalizeTime(props.validTimeTo || props.expireTime),
      raw: cleanText(props.rawAirSigmet || props.rawText || ""),
    };
  }).filter(Boolean);
}

async function fetchSpaceWeather({ fetchJson }) {
  const [alertsResult, kpResult, scalesResult] = await Promise.allSettled([
    fetchJson("https://services.swpc.noaa.gov/products/alerts.json", { timeoutMs: 10_000 }),
    fetchJson("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", { timeoutMs: 10_000 }),
    fetchJson("https://services.swpc.noaa.gov/products/noaa-scales.json", { timeoutMs: 10_000 }),
  ]);
  if ([alertsResult, kpResult, scalesResult].every((result) => result.status === "rejected")) {
    throw new Error("NOAA space-weather services did not respond");
  }
  const alertsPayload = alertsResult.status === "fulfilled" ? alertsResult.value : [];
  const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const alerts = (Array.isArray(alertsPayload) ? alertsPayload : []).slice().reverse().map((item, index) => ({
    id: String(item.product_id || item.id || index),
    issuedAt: normalizeTime(item.issue_datetime || item.issueTime),
    message: cleanText(item.message || item.summary || "Space weather alert"),
  })).filter((item) => Date.parse(item.issuedAt || 0) >= recentCutoff).slice(0, 12);
  const kp = latestKp(kpResult.status === "fulfilled" ? kpResult.value : []);
  const scales = scalesResult.status === "fulfilled" ? scalesResult.value : null;
  return {
    observedAt: kp.observedAt || new Date().toISOString(),
    kp: kp.value,
    geomagneticLevel: kp.value == null ? "Unknown" : kp.value >= 9 ? "G5" : kp.value >= 8 ? "G4" : kp.value >= 7 ? "G3" : kp.value >= 6 ? "G2" : kp.value >= 5 ? "G1" : "Quiet",
    alerts,
    scales,
    partial: [alertsResult, kpResult, scalesResult].some((result) => result.status === "rejected"),
    source: "NOAA Space Weather Prediction Center",
    sourceUrl: "https://www.swpc.noaa.gov/",
  };
}

function latestKp(payload) {
  if (!Array.isArray(payload) || payload.length < 2) return { value: null, observedAt: "" };
  const headers = payload[0];
  const rows = Array.isArray(headers) ? payload.slice(1) : payload;
  const latest = rows[rows.length - 1];
  if (Array.isArray(latest) && Array.isArray(headers)) {
    const index = headers.findIndex((header) => /kp/i.test(String(header)));
    const timeIndex = headers.findIndex((header) => /time/i.test(String(header)));
    return { value: finiteOrNull(latest[index >= 0 ? index : 1]), observedAt: normalizeTime(latest[timeIndex >= 0 ? timeIndex : 0]) };
  }
  return {
    value: finiteOrNull(latest?.kp ?? latest?.Kp ?? latest?.estimated_kp),
    observedAt: normalizeTime(latest?.time_tag || latest?.time),
  };
}

async function fetchTomTomIncidents({ fetchJson, apiKey, bounds }) {
  if (!apiKey) return { configured: false, incidents: [] };
  const url = new URL("https://api.tomtom.com/traffic/services/5/incidentDetails");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("bbox", [bounds.west, bounds.south, bounds.east, bounds.north].join(","));
  url.searchParams.set("language", "en-US");
  url.searchParams.set("timeValidityFilter", "present");
  url.searchParams.set("fields", "{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,timeValidity,probabilityOfOccurrence,lastReportTime}}}");
  const payload = await fetchJson(url.toString(), { timeoutMs: 10_000 });
  return { configured: true, incidents: normalizeTomTomIncidents(payload), source: "TomTom Traffic", sourceUrl: "https://www.tomtom.com/traffic-index/" };
}

function normalizeTomTomIncidents(payload = {}) {
  return (Array.isArray(payload.incidents) ? payload.incidents : []).map((feature, index) => {
    const props = feature?.properties || {};
    const point = geometryCenter(feature?.geometry);
    if (!point) return null;
    const category = Number(props.iconCategory || 0);
    const description = cleanText(props.events?.[0]?.description || TOMTOM_INCIDENT_NAMES[category] || "Traffic incident");
    return {
      id: `tomtom-incident-${props.id || index}`,
      type: "traffic",
      name: description,
      category,
      categoryLabel: TOMTOM_INCIDENT_NAMES[category] || "Traffic incident",
      lat: point.lat,
      lng: point.lng,
      geometry: simplifyGeoGeometry(feature?.geometry),
      severity: Number(props.magnitudeOfDelay || 0),
      delaySeconds: finiteOrNull(props.delay),
      lengthMeters: finiteOrNull(props.length),
      from: cleanText(props.from || ""),
      to: cleanText(props.to || ""),
      roads: Array.isArray(props.roadNumbers) ? props.roadNumbers.filter(Boolean) : [],
      startsAt: normalizeTime(props.startTime),
      endsAt: normalizeTime(props.endTime),
      updatedAt: normalizeTime(props.lastReportTime),
      source: "TomTom Traffic",
    };
  }).filter(Boolean);
}

function geometryCenter(geometry) {
  const points = [];
  collectCoordinates(geometry?.coordinates, points);
  if (!points.length) return null;
  const total = points.reduce((sum, point) => ({ lat: sum.lat + point.lat, lng: sum.lng + point.lng }), { lat: 0, lng: 0 });
  return { lat: total.lat / points.length, lng: total.lng / points.length };
}

function collectCoordinates(value, points) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
    points.push({ lng: Number(value[0]), lat: Number(value[1]) });
    return;
  }
  for (const child of value) collectCoordinates(child, points);
}

function simplifyGeoGeometry(geometry, maxPoints = 180) {
  if (!geometry?.type || !Array.isArray(geometry.coordinates)) return null;
  return { type: geometry.type, coordinates: simplifyCoordinates(geometry.coordinates, maxPoints) };
}

function simplifyCoordinates(value, maxPoints) {
  if (!Array.isArray(value)) return value;
  if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
    return [Number(value[0]), Number(value[1])];
  }
  if (value.length <= maxPoints) return value.map((child) => simplifyCoordinates(child, maxPoints));
  const step = Math.ceil(value.length / maxPoints);
  const sampled = value.filter((_child, index) => index % step === 0).map((child) => simplifyCoordinates(child, maxPoints));
  if (value.length && sampled[sampled.length - 1] !== value[value.length - 1]) sampled.push(simplifyCoordinates(value[value.length - 1], maxPoints));
  return sampled;
}

function gdacsRadiusKm(eventType, props) {
  const explicit = finiteOrNull(props.radius || props.radiuskm || props.alertRadius);
  if (explicit != null && explicit > 0) return Math.min(1200, explicit);
  if (eventType === "TC") return 420;
  if (eventType === "DR") return 600;
  if (eventType === "FL") return 180;
  if (eventType === "VO") return 80;
  if (eventType === "WF") return 60;
  return 90;
}

function normalizeTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeHttpUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value));
    return /^https?:$/.test(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

module.exports = {
  fetchAviationWeather,
  fetchGdacsEvents,
  fetchOpenAqAirQuality,
  fetchOpenMeteoGrid,
  fetchOpenMeteoWeather,
  fetchSpaceWeather,
  fetchTomTomIncidents,
  geometryCenter,
  normalizeAirSigmets,
  normalizeGdacsEvents,
  normalizeMetars,
  normalizeOpenMeteoWeather,
  normalizeOpenAqLatest,
  normalizeOpenAqLocations,
  normalizeTomTomIncidents,
  weatherGridPoints,
};
