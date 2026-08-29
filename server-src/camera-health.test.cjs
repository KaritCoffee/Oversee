const test = require("node:test");
const assert = require("node:assert/strict");
const { CameraHealthRegistry, buildCameraCoverage } = require("./camera-health.js");

test("camera health requires repeated failures before hiding a feed", () => {
  const registry = new CameraHealthRegistry();
  assert.equal(registry.record("cam", { ok: false }).status, "unverified");
  assert.equal(registry.record("cam", { ok: false }).status, "down");
  assert.equal(registry.record("cam", { ok: true }).status, "verified");
});

test("camera coverage separates playable, still, and source-only records", () => {
  const coverage = buildCameraCoverage([
    { country: "US", region: "WA", sourceId: "one", capability: "player", lat: 47, lng: -122 },
    { country: "DE", region: "BE", sourceId: "two", capability: "snapshot", viewerType: "image", lat: 52, lng: 13 },
    { country: "DE", region: "BE", sourceId: "three", capability: "source", lat: 52, lng: 13 },
  ]);
  assert.equal(coverage.countries, 2);
  assert.equal(coverage.playable, 1);
  assert.equal(coverage.stills, 1);
  assert.equal(coverage.sourceOnly, 1);
});
