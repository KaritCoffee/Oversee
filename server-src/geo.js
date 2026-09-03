"use strict";

const NULL_ISLAND_EPSILON = 1e-7;

function normalizeGeoPosition(latValue, lngValue) {
  const lat = finiteCoordinate(latValue);
  const lng = finiteCoordinate(lngValue);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (Math.abs(lat) <= NULL_ISLAND_EPSILON && Math.abs(lng) <= NULL_ISLAND_EPSILON) return null;
  return { lat, lng };
}

function hasUsableGeoPosition(value) {
  return Boolean(normalizeGeoPosition(value?.lat ?? value?.latitude, value?.lng ?? value?.lon ?? value?.longitude));
}

function finiteCoordinate(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

module.exports = { hasUsableGeoPosition, normalizeGeoPosition };
