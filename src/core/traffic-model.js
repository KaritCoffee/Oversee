const ROAD_SPEED_KMH = {
  motorway: 105,
  motorway_link: 55,
  trunk: 90,
  trunk_link: 50,
  primary: 68,
  primary_link: 42,
  secondary: 52,
  secondary_link: 36,
  tertiary: 40,
  tertiary_link: 30,
  unclassified: 30,
  residential: 24,
  living_street: 14,
};

export function trafficModelForRoad(road, now = Date.now()) {
  const longitude = representativeLongitude(road?.coordinates);
  const localHour = positiveModulo(new Date(now).getUTCHours() + new Date(now).getUTCMinutes() / 60 + longitude / 15, 24);
  const peak = peakCongestion(localHour);
  const timeBucket = Math.floor(Number(now) / (15 * 60 * 1000));
  const noise = stableUnit(`${road?.id || road?.name || "road"}:${timeBucket}`);
  const classPressure = /^(motorway|trunk|primary)/.test(String(road?.highway || "")) ? 0.08 : 0;
  const congestion = clamp(peak + classPressure + (noise - 0.5) * 0.28, 0.03, 0.82);
  const ratio = clamp(1 - congestion, 0.18, 0.98);
  const freeFlowKmh = ROAD_SPEED_KMH[road?.highway] || 34;
  const speedKmh = Math.max(5, Math.round(freeFlowKmh * ratio));
  return {
    ratio,
    speedKmh,
    freeFlowKmh,
    color: trafficColor(ratio),
    label: trafficCondition(ratio),
    localHour,
  };
}

export function trafficColor(ratio) {
  if (ratio < 0.3) return "#ff3f4d";
  if (ratio < 0.52) return "#ff7a1a";
  if (ratio < 0.75) return "#f4ca3a";
  return "#31e58f";
}

export function trafficCondition(ratio) {
  if (ratio < 0.3) return "heavy";
  if (ratio < 0.52) return "slow";
  if (ratio < 0.75) return "moderate";
  return "moving";
}

export function buildRoadPath(coordinates) {
  const points = (Array.isArray(coordinates) ? coordinates : [])
    .map((point) => ({ lng: Number(point?.[0]), lat: Number(point?.[1]) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  const cumulativeKm = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulativeKm.push(cumulativeKm[index - 1] + haversineKm(points[index - 1], points[index]));
  }
  return {
    points,
    cumulativeKm,
    lengthKm: cumulativeKm.at(-1) || 0,
  };
}

export function positionAlongRoad(path, progress) {
  if (!path?.points?.length) return null;
  if (path.points.length === 1 || !path.lengthKm) return { ...path.points[0] };
  const normalized = positiveModulo(Number(progress) || 0, 1);
  const targetKm = normalized * path.lengthKm;
  let upperIndex = 1;
  while (upperIndex < path.cumulativeKm.length && path.cumulativeKm[upperIndex] < targetKm) upperIndex += 1;
  upperIndex = Math.min(upperIndex, path.points.length - 1);
  const lowerIndex = Math.max(0, upperIndex - 1);
  const segmentStart = path.cumulativeKm[lowerIndex];
  const segmentLength = Math.max(0.000001, path.cumulativeKm[upperIndex] - segmentStart);
  const mix = clamp((targetKm - segmentStart) / segmentLength, 0, 1);
  return {
    lat: path.points[lowerIndex].lat + (path.points[upperIndex].lat - path.points[lowerIndex].lat) * mix,
    lng: path.points[lowerIndex].lng + (path.points[upperIndex].lng - path.points[lowerIndex].lng) * mix,
  };
}

export function stableUnit(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function peakCongestion(hour) {
  const morning = bell(hour, 8.1, 1.65) * 0.5;
  const evening = bell(hour, 17.35, 2.0) * 0.62;
  const midday = bell(hour, 12.6, 4.6) * 0.12;
  const overnightRelief = bell(hour, 3.0, 2.8) * 0.12;
  return clamp(0.08 + morning + evening + midday - overnightRelief, 0.03, 0.76);
}

function bell(value, center, width) {
  const distance = Math.min(Math.abs(value - center), 24 - Math.abs(value - center));
  return Math.exp(-0.5 * (distance / width) ** 2);
}

function representativeLongitude(coordinates) {
  const points = Array.isArray(coordinates) ? coordinates : [];
  if (!points.length) return 0;
  return Number(points[Math.floor(points.length / 2)]?.[0]) || 0;
}

function haversineKm(left, right) {
  const radiusKm = 6371;
  const dLat = toRadians(right.lat - left.lat);
  const dLng = toRadians(right.lng - left.lng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(left.lat)) * Math.cos(toRadians(right.lat)) * Math.sin(dLng / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function toRadians(value) {
  return Number(value) * Math.PI / 180;
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
