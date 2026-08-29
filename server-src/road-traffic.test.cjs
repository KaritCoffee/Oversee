const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DailyTrafficBudget,
  buildOverpassRoadQuery,
  normalizeOverpassRoads,
  normalizeTrafficBbox,
  parseTrafficTilePath,
  quantizeTrafficBbox,
} = require("./road-traffic.js");

test("traffic tile paths reject out-of-grid and arbitrary proxy targets", () => {
  assert.deepEqual(parseTrafficTilePath("/api/traffic/flow/12/2044/1360.png"), { zoom: 12, x: 2044, y: 1360 });
  assert.equal(parseTrafficTilePath("/api/traffic/flow/12/99999/1.png"), null);
  assert.equal(parseTrafficTilePath("/api/traffic/flow/https://example.test/x.png"), null);
});

test("traffic bounds require a small non-dateline viewport", () => {
  assert.deepEqual(normalizeTrafficBbox("-122.6,45.3,-122.3,45.7"), {
    west: -122.6,
    south: 45.3,
    east: -122.3,
    north: 45.7,
  });
  assert.throws(() => normalizeTrafficBbox("-180,-80,180,80"), /Zoom closer/);
  assert.throws(() => normalizeTrafficBbox("170,-10,-170,10"), /outside/);
});

test("OpenStreetMap road responses are bounded and normalized", () => {
  const roads = normalizeOverpassRoads({
    elements: [
      { type: "way", id: 2, tags: { highway: "residential", name: "Local Road" }, geometry: [{ lat: 1, lon: 2 }, { lat: 1.1, lon: 2.1 }] },
      { type: "way", id: 1, tags: { highway: "motorway", ref: "I-5", lanes: "4" }, geometry: [{ lat: 45, lon: -123 }, { lat: 46, lon: -122 }] },
      { type: "node", id: 3, tags: { highway: "primary" }, lat: 1, lon: 1 },
    ],
  });
  assert.equal(roads.length, 1);
  assert.equal(roads[0].id, "osm-way-1");
  assert.equal(roads[0].name, "I-5");
  assert.equal(roads[0].lanes, 4);
  assert.deepEqual(roads[0].coordinates[0], [-123, 45]);
});

test("road queries and quantized cache bounds stay deterministic", () => {
  const bounds = quantizeTrafficBbox({ west: -122.614, south: 45.311, east: -122.306, north: 45.719 }, "major");
  assert.deepEqual(bounds, { west: -122.7, south: 45.3, east: -122.3, north: 45.8 });
  const query = buildOverpassRoadQuery(bounds);
  assert.match(query, /way\["highway"/);
  assert.match(query, /45\.3,-122\.7,45\.8,-122\.3/);
});

test("daily traffic tile budget resets on the next UTC day", () => {
  let now = Date.parse("2026-08-29T22:00:00Z");
  const budget = new DailyTrafficBudget({ limit: 100, now: () => now });
  assert.equal(budget.consume(99), true);
  assert.equal(budget.consume(2), false);
  assert.equal(budget.snapshot().remaining, 1);
  now = Date.parse("2026-08-30T00:01:00Z");
  assert.equal(budget.snapshot().used, 0);
  assert.equal(budget.consume(2), true);
});
