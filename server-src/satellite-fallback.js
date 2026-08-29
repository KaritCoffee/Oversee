function satnogsRecordToGp(record) {
  const line1 = String(record?.tle1 || "").trim();
  const line2 = String(record?.tle2 || "").trim();
  const noradId = String(record?.norad_cat_id || line1.slice(2, 7)).trim();
  if (!line1.startsWith("1 ") || !line2.startsWith("2 ") || !noradId) return null;
  const eccentricityDigits = line2.slice(26, 33).trim();
  const epoch = tleEpochToIso(line1.slice(18, 32));
  return {
    OBJECT_NAME: String(record.tle0 || `NORAD ${noradId}`).replace(/^0\s+/, "").trim(),
    NORAD_CAT_ID: noradId,
    EPOCH: epoch || record.updated,
    INCLINATION: Number(line2.slice(8, 16)),
    RA_OF_ASC_NODE: Number(line2.slice(17, 25)),
    ECCENTRICITY: Number(`0.${eccentricityDigits || "0"}`),
    ARG_OF_PERICENTER: Number(line2.slice(34, 42)),
    MEAN_ANOMALY: Number(line2.slice(43, 51)),
    MEAN_MOTION: Number(line2.slice(52, 63)),
    TLE_LINE1: line1,
    TLE_LINE2: line2,
    DATA_SOURCE: "SatNOGS DB",
  };
}

function tleEpochToIso(value) {
  const text = String(value || "").trim();
  if (!/^\d{5}(?:\.\d+)?$/.test(text)) return "";
  const yearTwoDigits = Number(text.slice(0, 2));
  const year = yearTwoDigits >= 57 ? 1900 + yearTwoDigits : 2000 + yearTwoDigits;
  const dayOfYear = Number(text.slice(2));
  if (!Number.isFinite(dayOfYear) || dayOfYear < 1 || dayOfYear >= 367) return "";
  return new Date(Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86400000).toISOString();
}

module.exports = { satnogsRecordToGp, tleEpochToIso };
