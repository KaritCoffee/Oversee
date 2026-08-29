import assert from "node:assert/strict";
import test from "node:test";
import { SatellitePropagator, propagateElements } from "./satellite-motion.js";

const elements = {
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: "2026-08-28T00:00:00.000000",
  MEAN_MOTION: 15.49,
  ECCENTRICITY: 0.0005,
  INCLINATION: 51.64,
  RA_OF_ASC_NODE: 10,
  ARG_OF_PERICENTER: 20,
  MEAN_ANOMALY: 30,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: "U",
  NORAD_CAT_ID: 25544,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 50000,
  BSTAR: 0.0001,
  MEAN_MOTION_DOT: 0.0001,
  MEAN_MOTION_DDOT: 0,
};

test("CelesTrak GP elements propagate to a finite geodetic position", () => {
  const point = propagateElements(elements, new Date("2026-08-28T00:05:00Z"));
  assert.ok(point);
  assert.ok(point.lat >= -90 && point.lat <= 90);
  assert.ok(point.lng >= -180 && point.lng <= 180);
  assert.ok(point.altitudeKm > 100);
});

test("satellite propagator returns a ground track for an ingested object", () => {
  const propagator = new SatellitePropagator();
  const item = { id: "sat-25544", orbitalElements: elements };
  propagator.ingest([item]);
  const track = propagator.groundTrack(item, new Date("2026-08-28T00:05:00Z"), 32);
  assert.ok(track.length >= 24);
  assert.ok(track.every((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)));
});

test("TLE line pairs propagate when the CelesTrak JSON source is unavailable", () => {
  const point = propagateElements({
    TLE_LINE1: "1 25544U 98067A   24120.50000000  .00016717  00000-0  30116-3 0  9998",
    TLE_LINE2: "2 25544  51.6400  90.0000 0005000  10.0000 350.0000 15.50000000450000",
  }, new Date("2024-04-29T12:05:00Z"));
  assert.ok(Number.isFinite(point?.lat));
  assert.ok(Number.isFinite(point?.lng));
  assert.ok(Number.isFinite(point?.altitudeKm));
});
