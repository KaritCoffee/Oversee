import test from "node:test";
import assert from "node:assert/strict";
import { collectNearbySignals, evaluateWatchZone, historyFrameItems } from "./location-brief.js";

test("collectNearbySignals returns bounded nearest signals by type", () => {
  const nearby = collectNearbySignals({
    cameras: [{ id: "near", lat: 47.61, lng: -122.33 }, { id: "far", lat: 40.71, lng: -74.0 }],
    alerts: [{ id: "alert", lat: 47.62, lng: -122.34 }],
  }, { lat: 47.6, lng: -122.33 }, 20);
  assert.deepEqual(nearby.cameras.map((item) => item.id), ["near"]);
  assert.equal(nearby.alerts[0].signalType, "alert");
  assert.equal(nearby.total, 2);
});

test("evaluateWatchZone identifies only newly observed signals", () => {
  const zone = { lat: 47.6, lng: -122.3, radiusKm: 50, lastSignalIds: ["alert:old"] };
  const result = evaluateWatchZone(zone, {
    generatedAt: "2026-08-29T10:00:00Z",
    alerts: [{ id: "old", lat: 47.6, lng: -122.3 }, { id: "new", lat: 47.61, lng: -122.31 }],
  });
  assert.deepEqual(result.newItems.map((item) => item.id), ["new"]);
  assert.deepEqual(result.currentIds, ["alert:new", "alert:old"]);
});

test("historyFrameItems flattens supported historical layers", () => {
  const items = historyFrameItems({ moving: { flights: [{ id: "f1", lat: 1, lng: 2 }] }, signals: { fires: [{ id: "x", lat: 3, lng: 4 }] } });
  assert.deepEqual(items.map((item) => item.type), ["flight", "fire"]);
});
