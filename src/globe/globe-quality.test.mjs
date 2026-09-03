import test from "node:test";
import assert from "node:assert/strict";
import {
  globeQualityAvailability,
  normalizeGlobeQuality,
  resolveGlobeQuality,
} from "./globe-quality.js";

test("normalizes unknown globe quality values to standard", () => {
  assert.equal(normalizeGlobeQuality("buildings"), "buildings");
  assert.equal(normalizeGlobeQuality("something-else"), "standard");
});

test("reports provider-backed quality availability without exposing key values", () => {
  assert.deepEqual(globeQualityAvailability({ capabilities: { cesiumIon: true, google3dTiles: false } }), {
    standard: true,
    buildings: true,
    photorealistic: false,
  });
});

test("falls back safely when a requested provider is unavailable", () => {
  assert.deepEqual(resolveGlobeQuality("photorealistic", {}), {
    mode: "standard",
    available: false,
    missing: "googleMapsApiKey",
    requested: "photorealistic",
  });
  assert.deepEqual(resolveGlobeQuality("buildings", { cesiumIonToken: "configured" }), {
    mode: "buildings",
    available: true,
    missing: "",
  });
});
