function normalizeTrackedFlightId(value) {
  const id = String(value || "").trim().toLowerCase().replace(/^flight-/, "").replace(/^~/, "");
  return /^[0-9a-f]{6}$/.test(id) ? id : "";
}

function selectTrackedAircraft(payload, expectedId) {
  const expected = normalizeTrackedFlightId(expectedId);
  if (!expected) return null;
  return (Array.isArray(payload?.ac) ? payload.ac : []).find((aircraft) => normalizeTrackedFlightId(aircraft?.hex) === expected) || null;
}

module.exports = { normalizeTrackedFlightId, selectTrackedAircraft };
