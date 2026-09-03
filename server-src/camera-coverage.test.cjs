const test = require("node:test");
const assert = require("node:assert/strict");

const {
  US_STATES,
  classifyCamera,
  calculateCameraCoverage,
  summarizeSourceHealth,
  rankCoverageGaps,
  buildCameraCoverageDiagnostics,
} = require("./camera-coverage.js");

test("classifyCamera assigns one media state and lets down override playable capabilities", () => {
  assert.deepEqual(classifyCamera({ capability: "stream" }), { kind: "live", playable: true });
  assert.deepEqual(classifyCamera({ viewerType: "image" }), { kind: "still", playable: true });
  assert.deepEqual(classifyCamera({ previewUrl: "https://example.test/camera.jpg" }), { kind: "still", playable: true });
  assert.deepEqual(
    classifyCamera({ capability: "player", healthStatus: "down" }),
    { kind: "down", playable: false }
  );
  assert.deepEqual(
    classifyCamera({ viewerType: "hls", offlineReason: "Public feed is unavailable" }),
    { kind: "down", playable: false }
  );
  assert.deepEqual(classifyCamera({ capability: "source", viewerType: "page" }), { kind: "unknown", playable: false });
  assert.deepEqual(classifyCamera(null), { kind: "unknown", playable: false });
});

test("calculateCameraCoverage summarizes media, countries, regions, coordinates, and US states", () => {
  const cameras = [
    {
      id: "co-live",
      country: "USA",
      region: "Colorado",
      capability: "stream",
      lat: 39.7,
      lng: -104.9,
    },
    {
      id: "or-still",
      country: "United States of America",
      region: "Oregon",
      viewerType: "image",
      lat: 44.1,
      lng: -121.2,
    },
    {
      id: "ambiguous-us-region",
      country: "U.S.",
      region: "Kentucky / Indiana",
      capability: "source",
    },
    {
      id: "germany-down",
      country: "germany",
      region: "bavaria",
      capability: "player",
      streamStatus: "offline",
      lat: 48.1,
      lng: 11.6,
    },
    {
      id: "uk-live",
      country: "UK",
      region: "London",
      viewerType: "iframe",
      lat: 51.5,
      lng: -0.1,
    },
    {
      id: "inferred-california",
      stateCode: "CA",
      area: "Sacramento",
      capability: "snapshot",
      latitude: 38.6,
      longitude: -121.5,
    },
    null,
  ];

  const coverage = calculateCameraCoverage(cameras);

  assert.deepEqual(coverage.sample, { received: 7, processed: 7, truncated: 0 });
  assert.deepEqual(coverage.counts, {
    total: 7,
    playable: 4,
    live: 2,
    still: 2,
    down: 1,
    unknown: 2,
    geolocated: 5,
  });
  assert.deepEqual(coverage.coordinates, { valid: 5, invalid: 2 });
  assert.equal(coverage.countries.covered, 3);
  assert.deepEqual(
    coverage.countries.entries.map(({ name, total }) => [name, total]),
    [["United States", 4], ["Germany", 1], ["United Kingdom", 1], ["Unknown", 1]]
  );
  assert.equal(coverage.regions.entries.find((entry) => entry.name === "Bavaria").down, 1);
  assert.equal(coverage.usStates.total, US_STATES.length);
  assert.equal(coverage.usStates.covered, 3);
  assert.equal(coverage.usStates.cameras, 4);
  assert.equal(coverage.usStates.unassignedCameras, 1);
  assert.equal(coverage.usStates.entries.find((entry) => entry.code === "CA").still, 1);
  assert.equal(coverage.usStates.entries.find((entry) => entry.code === "CO").live, 1);
  assert.equal(coverage.usStates.entries.find((entry) => entry.code === "OR").still, 1);
  assert.equal(coverage.usStates.missing.includes("Texas"), true);
});

test("state inference is conservative for foreign and ambiguous regions", () => {
  const coverage = calculateCameraCoverage([
    { country: "Canada", region: "Georgia", capability: "stream" },
    { country: "United States", region: "North Carolina", viewerType: "image" },
    { country: "United States", region: "North Dakota / South Dakota", viewerType: "image" },
    { state: "US-TX", capability: "stream" },
  ]);

  assert.equal(coverage.usStates.cameras, 3);
  assert.equal(coverage.usStates.covered, 2);
  assert.equal(coverage.usStates.unassignedCameras, 1);
  assert.equal(coverage.usStates.entries.find((entry) => entry.code === "NC").total, 1);
  assert.equal(coverage.usStates.entries.find((entry) => entry.code === "TX").total, 1);
  assert.equal(coverage.usStates.entries.find((entry) => entry.code === "GA").total, 0);
});

test("coverage output ordering and limits are deterministic", () => {
  const cameras = [
    { country: "Zulu", region: "Two", capability: "stream" },
    { country: "Alpha", region: "One", viewerType: "image" },
    { country: "Zulu", region: "One", viewerType: "image" },
    { country: "Bravo", region: "One", capability: "source" },
  ];
  const first = calculateCameraCoverage(cameras, { maxCountries: 2, maxRegions: 2 });
  const second = calculateCameraCoverage(cameras, { maxCountries: 2, maxRegions: 2 });

  assert.deepEqual(first, second);
  assert.deepEqual(first.countries.entries.map((entry) => entry.name), ["Zulu", "Alpha"]);
  assert.equal(first.countries.omittedGroups, 1);
  assert.equal(first.countries.omittedCameras, 1);
  assert.deepEqual(
    first.regions.entries.map((entry) => `${entry.country}/${entry.name}`),
    ["Alpha/One", "Bravo/One"]
  );
});

test("summarizeSourceHealth matches camera catalogs, derives unknown sources, and omits unsafe details", () => {
  const cameras = [
    { sourceId: "alpha", sourceName: "Alpha Official" },
    { sourceId: "alpha", sourceName: "Alpha Official" },
    { sourceId: "beta", sourceName: "Beta Camera Catalog" },
  ];
  const health = [
    {
      id: "alpha",
      name: "Alpha Official",
      ok: true,
      count: 1,
      updatedAt: "2026-09-01T12:00:00-07:00",
      message: "token=do-not-expose",
      sourceUrl: "https://internal.example.test/private",
    },
    { id: "bravo", name: "Bravo Adapter", ok: false, count: 3, message: "private stack trace" },
    { id: "charlie", name: "Charlie Adapter", ok: true, stale: true, count: 4, cached: true },
    { id: "delta", name: "Delta Paid Adapter", configured: false, optional: true },
  ];

  const summary = summarizeSourceHealth(health, cameras);
  const serialized = JSON.stringify(summary);

  assert.deepEqual(summary.sample, { received: 4, processed: 4, truncated: 0 });
  assert.equal(summary.total, 5);
  assert.equal(summary.healthy, 1);
  assert.equal(summary.down, 1);
  assert.equal(summary.stale, 1);
  assert.equal(summary.unconfigured, 1);
  assert.equal(summary.unknown, 1);
  assert.equal(summary.degraded, 0);
  assert.equal(summary.responding, 1);
  assert.equal(summary.usable, 2);
  assert.equal(summary.records, 10);
  assert.equal(summary.entries[0].name, "Bravo Adapter");
  assert.equal(summary.entries.find((entry) => entry.name === "Alpha Official").records, 2);
  assert.equal(summary.entries.find((entry) => entry.name === "Beta Camera Catalog").status, "unknown");
  assert.equal(summary.entries.find((entry) => entry.name === "Alpha Official").updatedAt, "2026-09-01T19:00:00.000Z");
  assert.equal(serialized.includes("do-not-expose"), false);
  assert.equal(serialized.includes("private stack trace"), false);
  assert.equal(serialized.includes("internal.example.test"), false);
});

test("source health accepts keyed metadata, merges duplicate IDs, and prioritizes issue entries", () => {
  const summary = summarizeSourceHealth({
    duplicateOne: { id: "same", name: "Same Source", ok: true, count: 2 },
    duplicateTwo: { id: "same", name: "Same Source", ok: false, count: 4 },
    cached: { name: "Cached Source", ok: true, cached: true, count: 1 },
    good: { name: "Good Source", status: "verified", count: 8 },
  }, [], { maxSourceEntries: 2 });

  assert.equal(summary.total, 3);
  assert.equal(summary.down, 1);
  assert.equal(summary.degraded, 1);
  assert.equal(summary.healthy, 1);
  assert.equal(summary.entries.length, 2);
  assert.deepEqual(summary.entries.map((entry) => entry.status), ["down", "degraded"]);
  assert.equal(summary.entries[0].records, 4);
  assert.equal(summary.omitted, 1);
});

test("rankCoverageGaps finds and ranks a known empty cell surrounded by cameras", () => {
  const cameras = [
    [5, 5], [5, 15], [5, 25],
    [15, 5], [15, 25],
    [25, 5], [25, 15], [25, 25],
  ].map(([lat, lng], index) => ({ id: `camera-${index}`, lat, lng }));

  const gaps = rankCoverageGaps(cameras, {
    bounds: { west: 0, south: 0, east: 30, north: 30 },
    cellDegrees: 10,
    minNeighborCells: 2,
  });

  assert.equal(gaps.examinedCells, 9);
  assert.equal(gaps.occupiedCells, 8);
  assert.equal(gaps.camerasInBounds, 8);
  assert.equal(gaps.candidateCells, 1);
  assert.equal(gaps.entries[0].rank, 1);
  assert.deepEqual(gaps.entries[0].center, { lat: 15, lng: 15 });
  assert.deepEqual(gaps.entries[0].bounds, { west: 10, south: 10, east: 20, north: 20 });
  assert.equal(gaps.entries[0].neighborOccupiedCells, 8);
  assert.equal(gaps.entries[0].neighborCameraCount, 8);
});

test("gap grids and camera processing remain bounded", () => {
  const cameras = Array.from({ length: 20 }, (_, index) => ({
    lat: -40 + index * 4,
    lng: -170 + index * 10,
    capability: "stream",
  }));
  const gaps = rankCoverageGaps(cameras, { cellDegrees: 1, maxGridCells: 100, maxCameras: 7 });
  const coverage = calculateCameraCoverage(cameras, { maxCameras: 7 });

  assert.ok(gaps.examinedCells <= 100);
  assert.equal(gaps.camerasInBounds, 7);
  assert.deepEqual(coverage.sample, { received: 20, processed: 7, truncated: 13 });
  assert.equal(coverage.counts.total, 7);
});

test("buildCameraCoverageDiagnostics is compact, deterministic, and user-safe", () => {
  const cameras = [
    {
      id: "safe-camera",
      country: "Germany",
      region: "Bavaria",
      sourceId: "safe-source",
      sourceName: "Safe Source",
      capability: "stream",
      lat: 48,
      lng: 11,
      apiKey: "camera-secret",
      sourceUrl: "https://example.test/?key=camera-secret",
    },
  ];
  const health = [{
    id: "safe-source",
    name: "Safe Source",
    ok: false,
    message: "provider-secret",
    url: "https://private.example.test",
  }];
  const options = { generatedAt: "2026-09-02T10:15:00-07:00", maxGaps: 3 };
  const first = buildCameraCoverageDiagnostics(cameras, health, options);
  const second = buildCameraCoverageDiagnostics(cameras, health, options);
  const serialized = JSON.stringify(first);

  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 1);
  assert.equal(first.generatedAt, "2026-09-02T17:15:00.000Z");
  assert.equal(first.counts.total, 1);
  assert.equal(first.coverage.countries.entries[0].name, "Germany");
  assert.equal(first.sourceHealth.down, 1);
  assert.equal(Object.hasOwn(first.coverage.usStates, "entries"), false);
  assert.equal(serialized.includes("camera-secret"), false);
  assert.equal(serialized.includes("provider-secret"), false);
  assert.equal(serialized.includes("private.example.test"), false);
  assert.equal(serialized.includes("sourceUrl"), false);
});

test("all public functions tolerate malformed inputs", () => {
  assert.doesNotThrow(() => classifyCamera("camera"));
  assert.doesNotThrow(() => calculateCameraCoverage({ cameras: [] }));
  assert.doesNotThrow(() => summarizeSourceHealth("offline", null));
  assert.doesNotThrow(() => rankCoverageGaps([undefined, "camera", 12], { bounds: "world" }));
  assert.doesNotThrow(() => buildCameraCoverageDiagnostics(undefined, undefined));

  const diagnostic = buildCameraCoverageDiagnostics(undefined, undefined);
  assert.equal(diagnostic.counts.total, 0);
  assert.equal(diagnostic.coverage.usStates.covered, 0);
  assert.equal(diagnostic.coverage.usStates.missing.length, US_STATES.length);
  assert.equal(diagnostic.sourceHealth.total, 0);
  assert.deepEqual(diagnostic.gaps.entries, []);
});
