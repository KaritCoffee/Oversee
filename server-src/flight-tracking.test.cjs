const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeTrackedFlightId, selectTrackedAircraft } = require("./flight-tracking.js");

test("normalizes safe ICAO identifiers from application flight ids", () => {
  assert.equal(normalizeTrackedFlightId("flight-A1B2C3"), "a1b2c3");
  assert.equal(normalizeTrackedFlightId("~abcdef"), "abcdef");
  assert.equal(normalizeTrackedFlightId("../secret"), "");
});

test("selects only the aircraft matching the requested transponder", () => {
  const selected = selectTrackedAircraft({ ac: [{ hex: "111111" }, { hex: "A1B2C3", flight: "TEST" }] }, "flight-a1b2c3");
  assert.equal(selected.flight, "TEST");
});
