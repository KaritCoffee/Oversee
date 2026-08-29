import assert from "node:assert/strict";
import test from "node:test";
import { inGeoBounds, spatiallyBalancedSample } from "./lod.js";

test("geographic bounds support date-line crossing rectangles", () => {
  const bounds = { west: 170, east: -170, south: -20, north: 20 };
  assert.equal(inGeoBounds({ lat: 0, lng: 179 }, bounds), true);
  assert.equal(inGeoBounds({ lat: 0, lng: -179 }, bounds), true);
  assert.equal(inGeoBounds({ lat: 0, lng: 0 }, bounds), false);
});

test("balanced sampling preserves geographically separate clusters", () => {
  const items = [
    ...Array.from({ length: 20 }, (_, id) => ({ id: `west-${id}`, lat: 40, lng: -120 })),
    ...Array.from({ length: 20 }, (_, id) => ({ id: `east-${id}`, lat: 40, lng: 120 })),
  ];
  const sample = spatiallyBalancedSample(items, 4);
  assert.ok(sample.some((item) => item.lng < 0));
  assert.ok(sample.some((item) => item.lng > 0));
});
