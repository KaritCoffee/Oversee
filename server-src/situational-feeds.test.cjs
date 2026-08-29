const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeOpenAqLatest,
  normalizeOpenAqLocations,
  normalizeGdacsEvents,
  normalizeMetars,
  normalizeOpenMeteoWeather,
  normalizeTomTomIncidents,
  weatherGridPoints,
} = require("./situational-feeds.js");

test("normalizes GDACS GeoJSON into spatial alert records", () => {
  const records = normalizeGdacsEvents({
    features: [{
      geometry: { type: "Point", coordinates: [13.4, 52.5] },
      properties: { eventtype: "FL", eventid: 42, alertlevel: "orange", country: "Germany", name: "River flooding", fromdate: "2026-08-20T00:00:00Z" },
    }],
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].id, "gdacs-FL-42");
  assert.equal(records[0].severity, "high");
  assert.equal(records[0].lat, 52.5);
  assert.equal(records[0].source, "GDACS");
});

test("normalizes Open-Meteo current conditions and hourly forecast", () => {
  const weather = normalizeOpenMeteoWeather({
    timezone: "Europe/Berlin",
    current: { time: "2026-08-29T10:00", temperature_2m: 22, wind_speed_10m: 14, weather_code: 3, is_day: 1 },
    hourly: { time: ["2026-08-29T10:00"], temperature_2m: [22], precipitation_probability: [20] },
  });
  assert.equal(weather.temperatureC, 22);
  assert.equal(weather.windKmh, 14);
  assert.equal(weather.nextHours[0].precipitationProbability, 20);
});

test("normalizes nearby OpenAQ stations and their latest measurements", () => {
  const stations = normalizeOpenAqLocations({
    results: [{
      id: 123,
      name: "Berlin Center",
      locality: "Berlin",
      country: { name: "Germany", code: "DE" },
      provider: { name: "Public monitor network" },
      coordinates: { latitude: 52.52, longitude: 13.405 },
      distance: 1400,
      datetimeLast: { utc: "2026-08-29T12:00:00Z" },
      sensors: [
        { id: 7, parameter: { displayName: "PM2.5", units: "ug/m3" } },
        { id: 8, parameter: { displayName: "O3", units: "ppm" } },
      ],
    }],
  });
  const latest = normalizeOpenAqLatest({
    results: [
      { sensorsId: 8, value: 0.02, datetime: { utc: "2026-08-29T11:55:00Z" } },
      { sensorsId: 7, value: 11.4, datetime: { utc: "2026-08-29T11:58:00Z" } },
    ],
  }, stations[0].sensors);

  assert.equal(stations[0].country, "Germany");
  assert.equal(stations[0].distanceMeters, 1400);
  assert.equal(latest[0].parameter, "PM2.5");
  assert.equal(latest[0].value, 11.4);
  assert.equal(latest[0].units, "ug/m3");
});

test("normalizes METAR rows", () => {
  const stations = normalizeMetars([{ icaoId: "EDDF", lat: 50.03, lon: 8.57, fltCat: "VFR", temp: 19 }]);
  assert.equal(stations[0].station, "EDDF");
  assert.equal(stations[0].category, "VFR");
  assert.equal(stations[0].lng, 8.57);
});

test("normalizes TomTom incidents and preserves road geometry", () => {
  const incidents = normalizeTomTomIncidents({ incidents: [{
    geometry: { type: "LineString", coordinates: [[-122.4, 47.6], [-122.39, 47.61]] },
    properties: { id: "abc", iconCategory: 8, magnitudeOfDelay: 4, delay: 900, roadNumbers: ["I-5"] },
  }] });
  assert.equal(incidents[0].categoryLabel, "Road closed");
  assert.equal(incidents[0].delaySeconds, 900);
  assert.deepEqual(incidents[0].roads, ["I-5"]);
});

test("weather grids stay bounded and support date-line crossing views", () => {
  const points = weatherGridPoints({ west: 170, south: -20, east: -170, north: 20 }, 40);
  assert.ok(points.length <= 40);
  assert.ok(points.some((point) => point.lng > 170));
  assert.ok(points.some((point) => point.lng < -170));
});
