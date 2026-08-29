import assert from "node:assert/strict";
import test from "node:test";

import { buildRoadPath, positionAlongRoad, stableUnit, trafficModelForRoad } from "./traffic-model.js";

test("traffic model is deterministic for the same road and observation time", () => {
  const road = { id: "road-1", highway: "motorway", coordinates: [[-122.5, 45.5], [-122.4, 45.6]] };
  const observedAt = Date.parse("2026-08-29T16:01:00Z");
  const first = trafficModelForRoad(road, observedAt);
  const second = trafficModelForRoad(road, observedAt);
  assert.equal(first.ratio, second.ratio);
  assert.equal(first.color, second.color);
  assert.ok(first.speedKmh > 0 && first.speedKmh <= first.freeFlowKmh);
});

test("road interpolation follows cumulative distance and wraps", () => {
  const path = buildRoadPath([[0, 0], [1, 0], [1, 1]]);
  const halfway = positionAlongRoad(path, 0.5);
  assert.ok(Math.abs(halfway.lng - 1) < 0.02);
  assert.ok(Math.abs(halfway.lat) < 0.02);
  assert.deepEqual(positionAlongRoad(path, 1), positionAlongRoad(path, 0));
});

test("stable traffic seeds stay inside the unit interval", () => {
  assert.equal(stableUnit("same-road"), stableUnit("same-road"));
  assert.ok(stableUnit("different-road") >= 0 && stableUnit("different-road") <= 1);
});
