const test = require("node:test");
const assert = require("node:assert/strict");
const { CameraHealthRegistry, buildCameraCoverage } = require("./camera-health.js");

test("camera health requires repeated failures before hiding a feed", () => {
  const registry = new CameraHealthRegistry();
  assert.equal(registry.record("cam", { ok: false }).status, "unverified");
  assert.equal(registry.record("cam", { ok: false }).status, "down");
  assert.equal(registry.record("cam", { ok: true }).status, "degraded");
  for (let index = 0; index < 8; index += 1) registry.record("cam", { ok: true });
  assert.equal(registry.status("cam").status, "verified");
});

test("camera health marks a working fallback as degraded", () => {
  const registry = new CameraHealthRegistry();
  const health = registry.record("cam", {
    ok: true,
    fallbackUsed: true,
    mediaType: "image",
    latencyMs: 120,
  });
  assert.equal(health.status, "degraded");
  assert.ok(health.healthScore > 0 && health.healthScore < 100);
  assert.equal(health.latencyMs, 120);
});

test("camera health retains a bounded recent history", () => {
  const registry = new CameraHealthRegistry();
  for (let index = 0; index < 20; index += 1) registry.record("cam", { ok: true });
  assert.equal(registry.status("cam").recentOutcomes.length, 12);
  assert.equal(registry.status("cam").confidence, 100);
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
  assert.equal(coverage.occupiedFiveDegreeCells, 2);
});
