import test from "node:test";
import assert from "node:assert/strict";
import { applyLayerPreset, detectLayerPreset, normalizeLayerPreferences } from "./layer-presets.js";

const IDS = ["cameras", "satellites", "flights", "quakes", "fires", "alerts", "demographics", "vessels", "launches", "radio"];

test("applies bounded presets across every known layer", () => {
  const result = applyLayerPreset(Object.fromEntries(IDS.map((id) => [id, true])), "hazards", IDS);
  assert.equal(result.alerts, true);
  assert.equal(result.fires, true);
  assert.equal(result.quakes, true);
  assert.equal(result.cameras, false);
  assert.equal(result.radio, false);
  assert.deepEqual(Object.keys(result), IDS);
});

test("detects exact presets and leaves edited mixes custom", () => {
  const cameraLayers = applyLayerPreset({}, "cameras", IDS);
  assert.equal(detectLayerPreset(cameraLayers, IDS), "cameras");
  cameraLayers.flights = true;
  assert.equal(detectLayerPreset(cameraLayers, IDS), "custom");
});

test("normalizes stored preferences without accepting unknown keys", () => {
  assert.deepEqual(
    normalizeLayerPreferences({ cameras: false, flights: true, surprise: true }, ["cameras", "flights", "alerts"], { cameras: true, alerts: true }),
    { cameras: false, flights: true, alerts: true }
  );
});
