const test = require("node:test");
const assert = require("node:assert/strict");
const { hasUsableGeoPosition, normalizeGeoPosition } = require("./geo.js");

test("normalizes valid numeric and string coordinates", () => {
  assert.deepEqual(normalizeGeoPosition("40.71", "-73.99"), { lat: 40.71, lng: -73.99 });
  assert.equal(hasUsableGeoPosition({ latitude: 51.5, longitude: -0.12 }), true);
});

test("rejects missing, out-of-range, and non-finite coordinates", () => {
  assert.equal(normalizeGeoPosition(null, null), null);
  assert.equal(normalizeGeoPosition("", ""), null);
  assert.equal(normalizeGeoPosition(true, false), null);
  assert.equal(normalizeGeoPosition(91, 0), null);
  assert.equal(normalizeGeoPosition(0, 181), null);
  assert.equal(normalizeGeoPosition(Number.NaN, 12), null);
});

test("rejects Null Island placeholders without excluding equatorial positions", () => {
  assert.equal(normalizeGeoPosition(0, 0), null);
  assert.deepEqual(normalizeGeoPosition(0, -78.5), { lat: 0, lng: -78.5 });
  assert.deepEqual(normalizeGeoPosition(5.2, 0), { lat: 5.2, lng: 0 });
});
