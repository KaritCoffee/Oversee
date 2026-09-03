import test from "node:test";
import assert from "node:assert/strict";
import {
  buildIncidentView,
  incidentDistanceKm,
  normalizeIncidentPoint,
  scoreIncidentSignal,
  suggestIncidentRadiusKm,
} from "./incident-view.js";

const NOW = "2026-09-02T12:00:00.000Z";

test("builds a compact distance-ranked incident model across snapshot aliases", () => {
  const snapshot = {
    generatedAt: NOW,
    cameras: [
      { id: "far-camera", name: "Far camera", lat: 47.75, lng: -122.3, capability: "snapshot", imageUrl: "https://example.test/far.jpg" },
      { id: "near-camera", name: "Near camera", lat: 47.601, lng: -122.301, capability: "player", geometryRings: new Array(5_000).fill([1, 2]) },
      { id: "broken", name: "No coordinates", lat: "nope", lng: -122.3 },
    ],
    alerts: [{ id: "a1", event: "Flood Warning", severity: "Severe", lat: 47.62, lng: -122.31, time: "2026-09-02T11:30:00Z" }],
    fires: [{ id: "f1", name: "Ridge Fire", lat: 47.7, lng: -122.3, acres: 1_500, time: "2026-09-02T10:00:00Z" }],
    quakes: [{ id: "q1", title: "M4.5 earthquake", lat: 47.65, lng: -122.35, magnitude: 4.5, depthKm: 12, time: "2026-09-02T09:00:00Z" }],
    flights: [{ id: "flight-abc", callsign: "TEST1", lat: 47.61, lng: -122.32, altitudeMeters: 2_000, velocity: 100, time: "2026-09-02T11:59:00Z" }],
    satellites: [{ id: "sat-1", name: "TESTSAT", lat: 47.63, lng: -122.33, noradId: 12345, altitudeKm: 550, time: "2026-09-02T11:57:00Z" }],
    vessels: [{ id: "v1", name: "Ferry", lat: 47.605, lng: -122.305, speedKnots: 12, time: "2026-09-02T11:58:00Z" }],
  };

  const result = buildIncidentView({ lat: 47.6, lng: -122.3, label: "Seattle" }, snapshot, { radiusKm: 50, now: NOW });

  assert.equal(result.ok, true);
  assert.equal(result.radiusKm, 50);
  assert.deepEqual(result.nearby.cameras.map((item) => item.id), ["near-camera", "far-camera"]);
  assert.deepEqual(result.nearby.earthquakes.map((item) => item.id), ["q1"]);
  assert.deepEqual(result.nearby.aircraft.map((item) => item.id), ["flight-abc"]);
  assert.deepEqual(result.nearby.satellites.map((item) => item.id), ["sat-1"]);
  assert.equal(result.counts.cameras.loaded, 3);
  assert.equal(result.counts.cameras.mappable, 2);
  assert.equal(result.counts.cameras.nearby, 2);
  assert.equal(result.counts.totalNearby, 8);
  assert.equal(result.overview.hazardCount, 3);
  assert.equal(result.overview.movingAssetCount, 3);
  assert.equal("geometryRings" in result.nearby.cameras[0], false);
  assert.equal(result.nearby.cameras[0].details.playable, true);
});

test("normalizes common coordinate shapes and rejects malformed coordinates", () => {
  assert.deepEqual(normalizeIncidentPoint({ latitude: "12.5", longitude: "-45.25" }), { lat: 12.5, lng: -45.25 });
  assert.deepEqual(normalizeIncidentPoint({ geometry: { type: "Point", coordinates: [179.9, -10] } }), { lat: -10, lng: 179.9 });
  assert.deepEqual(normalizeIncidentPoint({ center: { lat: 0, lon: 0 } }), { lat: 0, lng: 0 });
  assert.equal(normalizeIncidentPoint({ lat: 91, lng: 0 }), null);
  assert.equal(normalizeIncidentPoint({ lat: null, lng: null }), null);
  assert.equal(normalizeIncidentPoint("47,-122"), null);
});

test("great-circle distance handles the international date line", () => {
  const distance = incidentDistanceKm({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 });
  assert.ok(distance > 22 && distance < 23);
  assert.equal(incidentDistanceKm({ lat: "bad", lng: 0 }, { lat: 0, lng: 0 }), Number.POSITIVE_INFINITY);
});

test("area footprints count a covering alert as zero-distance", () => {
  const result = buildIncidentView({ lat: 40, lng: -100 }, {
    generatedAt: NOW,
    alerts: [{ id: "wide", title: "Wide warning", lat: 41, lng: -100, radiusKm: 120, severity: "Moderate", time: NOW }],
  }, { radiusKm: 20 });

  assert.equal(result.nearby.alerts.length, 1);
  assert.equal(result.nearby.alerts[0].distanceKm, 0);
  assert.ok(result.nearby.alerts[0].centerDistanceKm > 111 && result.nearby.alerts[0].centerDistanceKm < 112);
});

test("suggested radii reflect selected footprints and incident scale", () => {
  assert.equal(suggestIncidentRadiusKm({ type: "alert", severity: "Extreme", lat: 1, lng: 2 }), 250);
  assert.equal(suggestIncidentRadiusKm({ type: "quake", magnitude: 6.4, lat: 1, lng: 2 }), 350);
  assert.equal(suggestIncidentRadiusKm({ type: "fire", acres: 10_000, lat: 1, lng: 2 }), 130);
  assert.equal(suggestIncidentRadiusKm({ type: "camera", lat: 1, lng: 2 }), 60);
  assert.equal(suggestIncidentRadiusKm({ type: "alert", radiusKm: 2_000, lat: 1, lng: 2 }), 1_000);
});

test("severity and recency scoring is deterministic and type-aware", () => {
  const freshSevere = scoreIncidentSignal({ severity: "Severe", urgency: "Immediate", time: "2026-09-02T11:55:00Z" }, "alert", NOW);
  const oldMinor = scoreIncidentSignal({ severity: "Minor", time: "2026-08-25T12:00:00Z" }, "alert", NOW);
  const emergency = scoreIncidentSignal({ squawk: "7700", time: NOW }, "flight", NOW);
  const quake = scoreIncidentSignal({ magnitude: 7.2, time: NOW }, "quake", NOW);
  const expired = scoreIncidentSignal({ severity: "Extreme", time: NOW, expires: "2026-09-02T11:00:00Z" }, "alert", NOW);

  assert.equal(freshSevere.severityScore, 90);
  assert.ok(freshSevere.recencyScore > oldMinor.recencyScore);
  assert.equal(emergency.severityScore, 100);
  assert.equal(quake.severityScore, 95);
  assert.equal(expired.severityScore, 25);
  assert.deepEqual(scoreIncidentSignal({ severity: "High", time: NOW }, "alert", NOW), scoreIncidentSignal({ severity: "High", time: NOW }, "alert", NOW));
});

test("activity feed prioritizes consequential fresh signals and remains bounded", () => {
  const alerts = Array.from({ length: 20 }, (_, index) => ({
    id: `alert-${index}`,
    event: index === 15 ? "Tornado Warning" : `Advisory ${index}`,
    severity: index === 15 ? "Extreme" : "Minor",
    urgency: index === 15 ? "Immediate" : "Expected",
    lat: 35 + index * 0.001,
    lng: -97,
    time: index === 15 ? NOW : "2026-09-01T12:00:00Z",
  }));
  const result = buildIncidentView({ lat: 35, lng: -97 }, { generatedAt: NOW, alerts }, {
    radiusKm: 100,
    limits: { alerts: 3, activity: 4 },
  });

  assert.equal(result.nearby.alerts.length, 3);
  assert.equal(result.activity.length, 4);
  assert.equal(result.activity[0].id, "alert-15");
  assert.match(result.activity[0].summary, /Tornado Warning|Alert|away|selected area/i);
  assert.ok(result.activity.every((item) => item.summary.length <= 220));
});

test("weather and context references are ranked, compact, and capped", () => {
  const result = buildIncidentView({ lat: 34, lng: -118 }, {
    generatedAt: NOW,
    weather: { title: "Local conditions", observedAt: "2026-09-02T11:45:00Z", temperatureC: 31, windGustKmh: 85, source: "Open-Meteo" },
    weatherPoints: [
      { id: "weather-far", lat: 35, lng: -118, temperatureC: 20, source: "Grid" },
      { id: "weather-near", lat: 34.01, lng: -118, precipitationMm: 7, source: "Grid" },
    ],
    demographics: [{ id: "population", title: "California population", lat: 37, lng: -119, radiusKm: 400, population: 39_000_000, source: "Census" }],
    context: {
      traffic: { incidents: [{ id: "road", description: "Road closed", categoryLabel: "Road closed", lat: 34.02, lng: -118.01, delaySeconds: 900, source: "Traffic" }] },
      airQuality: { stations: [{ id: "aq", name: "Downtown air", lat: 34.03, lng: -118, measurements: [{ parameter: "pm25" }], source: "OpenAQ" }] },
    },
    spaceWeather: { id: "space", geomagneticLevel: "Minor", kp: 4, source: "NOAA" },
  }, { radiusKm: 100, limits: { weather: 2, context: 3 } });

  assert.equal(result.references.weather.length, 2);
  assert.equal(result.references.weather[0].title, "Local conditions");
  assert.equal(result.references.weather[0].severityLevel, "high");
  assert.equal(result.references.context.length, 3);
  assert.ok(result.references.context.some((item) => item.type === "traffic"));
  assert.ok(result.references.context.some((item) => item.type === "demographic"));
  assert.ok(result.references.context.every((item) => !("geometry" in item)));
});

test("invalid selections return a safe empty model while preserving layer inventory", () => {
  const result = buildIncidentView({ lat: "unknown", lng: 200 }, {
    generatedAt: "not-a-date",
    cameras: [{ id: "valid", lat: 1, lng: 2 }, null, "bad"],
    alerts: "not-an-array",
  });

  assert.equal(result.ok, false);
  assert.equal(result.center, null);
  assert.equal(result.referenceTime, null);
  assert.equal(result.counts.cameras.loaded, 3);
  assert.equal(result.counts.cameras.mappable, 1);
  assert.equal(result.counts.totalNearby, 0);
  assert.deepEqual(result.nearby.cameras, []);
  assert.deepEqual(result.activity, []);
  assert.deepEqual(result.references, { weather: [], context: [] });
  assert.match(result.reason, /latitude and longitude/i);
});

test("caps output and inspected input without mutating caller data", () => {
  const snapshot = {
    generatedAt: NOW,
    cameras: Array.from({ length: 100 }, (_, index) => ({ id: `c-${index}`, name: `Camera ${index}`, lat: 10 + index * 0.0001, lng: 20 })),
    alerts: [{ id: "a", title: "Alert", severity: "High", lat: 10, lng: 20, time: NOW }],
  };
  const original = structuredClone(snapshot);
  const result = buildIncidentView({ lat: 10, lng: 20 }, snapshot, {
    radiusKm: 100,
    maxInputPerLayer: 12,
    limits: { cameras: 500, alerts: -5, activity: 500 },
  });

  assert.equal(result.counts.cameras.loaded, 100);
  assert.equal(result.counts.cameras.inspected, 12);
  assert.equal(result.counts.cameras.inputTruncated, true);
  assert.equal(result.nearby.cameras.length, 12);
  assert.equal(result.nearby.alerts.length, 0);
  assert.ok(result.activity.length <= 30);
  assert.deepEqual(snapshot, original);
});

test("missing timestamps produce stable zero recency instead of using wall-clock time", () => {
  const first = buildIncidentView({ lat: 0, lng: 0 }, {
    alerts: [{ id: "a", severity: "High", lat: 0, lng: 0 }],
  });
  const second = buildIncidentView({ lat: 0, lng: 0 }, {
    alerts: [{ id: "a", severity: "High", lat: 0, lng: 0 }],
  });

  assert.equal(first.referenceTime, null);
  assert.equal(first.nearby.alerts[0].recencyScore, 0);
  assert.deepEqual(first, second);
});

test("timezone-free ISO timestamps are interpreted consistently as UTC", () => {
  const score = scoreIncidentSignal({ severity: "High", time: "2026-09-02T11:00:00" }, "alert", NOW);
  assert.equal(score.time, "2026-09-02T11:00:00.000Z");
  assert.equal(score.ageMinutes, 60);
});
