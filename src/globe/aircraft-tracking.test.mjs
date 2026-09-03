import test from "node:test";
import assert from "node:assert/strict";
import {
  aircraftSignalState,
  classifyAircraft,
  smoothHeading,
  trackingCameraProfile,
  trackingTelemetry,
} from "./aircraft-tracking.js";

test("classifies common helicopter and fixed-wing ICAO designators", () => {
  assert.equal(classifyAircraft({ aircraftType: "B06" }).id, "helicopter");
  assert.equal(classifyAircraft({ aircraftType: "R44" }).id, "helicopter");
  assert.equal(classifyAircraft({ aircraftType: "B738" }).id, "jet");
  assert.equal(classifyAircraft({ aircraftType: "AT72" }).id, "turboprop");
});

test("uses a closer camera profile for helicopters", () => {
  const helicopter = trackingCameraProfile("chase", { aircraftType: "R44" });
  const jet = trackingCameraProfile("chase", { aircraftType: "B738" });
  assert.ok(helicopter.distanceKm < jet.distanceKm);
  assert.equal(trackingCameraProfile("not-a-mode", {}).mode, "follow");
});

test("labels old aircraft fixes as estimated or lost", () => {
  const now = Date.parse("2026-01-01T00:10:00Z");
  assert.equal(aircraftSignalState({ time: "2026-01-01T00:09:30Z" }, now).id, "live");
  assert.equal(aircraftSignalState({ time: "2026-01-01T00:08:30Z" }, now).id, "estimated");
  assert.equal(aircraftSignalState({ time: "2026-01-01T00:00:00Z" }, now).id, "lost");
});

test("formats cockpit telemetry and interpolates heading across north", () => {
  const telemetry = trackingTelemetry({ altitudeMeters: 1000, velocity: 100, heading: 271, verticalRate: 2, time: new Date().toISOString() });
  assert.equal(telemetry.altitudeFeet, 3281);
  assert.equal(telemetry.speedKnots, 194);
  assert.equal(telemetry.headingDegrees, 271);
  assert.equal(smoothHeading(350, 10, 0.5), 0);
});
