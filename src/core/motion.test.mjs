import assert from "node:assert/strict";
import test from "node:test";
import { MotionStore, destinationPoint, interpolatePosition } from "./motion.js";

test("position interpolation crosses the date line on the short arc", () => {
  const result = interpolatePosition({ lat: 0, lng: 179 }, { lat: 0, lng: -179 }, 0.5);
  assert.ok(Math.abs(Math.abs(result.lng) - 180) < 0.001);
});

test("dead reckoning projects a moving contact and caps its coast", () => {
  const store = new MotionStore({ renderDelayMs: 0, maxCoastMs: 60_000 });
  const item = { id: "one", lat: 0, lng: 0, heading: 90, velocity: 200, time: "2026-01-01T00:00:00Z" };
  store.ingest("flight", [item], Date.parse(item.time));
  const moving = store.display("flight", item, Date.parse(item.time) + 30_000);
  const held = store.display("flight", item, Date.parse(item.time) + 120_000);
  assert.equal(moving.motionState, "coasting");
  assert.equal(held.motionState, "held");
  assert.ok(moving.lng > 0);
  assert.ok(held.lng > moving.lng);
});

test("destination projection keeps coordinates finite", () => {
  const result = destinationPoint(89.9, 170, 15, 500);
  assert.ok(Number.isFinite(result.lat));
  assert.ok(result.lng >= -180 && result.lng <= 180);
});

test("an older aggregate fix cannot replace a newer focused fix", () => {
  const store = new MotionStore({ renderDelayMs: 0 });
  const newer = { id: "tracked", lat: 40, lng: -75, time: "2026-01-01T00:01:00Z" };
  const older = { id: "tracked", lat: 10, lng: 20, time: "2026-01-01T00:00:00Z" };
  store.ingest("flight", [newer], Date.parse(newer.time));
  store.ingest("flight", [older], Date.parse(newer.time) + 10_000);

  const displayed = store.display("flight", newer, Date.parse(newer.time));
  assert.equal(displayed.lat, newer.lat);
  assert.equal(displayed.lng, newer.lng);
  assert.equal(store.trail("flight", newer.id).length, 1);
});
