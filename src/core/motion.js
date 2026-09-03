const EARTH_RADIUS_KM = 6371.0088;
const DEG = Math.PI / 180;

export function normalizeLongitude(value) {
  return ((Number(value) + 540) % 360) - 180;
}

export function shortestLongitudeDelta(from, to) {
  return normalizeLongitude(Number(to) - Number(from));
}

export function interpolatePosition(from, to, amount) {
  const t = Math.max(0, Math.min(1, Number(amount) || 0));
  return {
    lat: Number(from.lat) + (Number(to.lat) - Number(from.lat)) * t,
    lng: normalizeLongitude(Number(from.lng) + shortestLongitudeDelta(from.lng, to.lng) * t),
    altitudeMeters: Number(from.altitudeMeters || 0)
      + (Number(to.altitudeMeters || 0) - Number(from.altitudeMeters || 0)) * t,
    heading: interpolateAngle(from.heading, to.heading, t),
  };
}

export function interpolateAngle(from, to, amount) {
  const a = Number(from);
  const b = Number(to);
  if (!Number.isFinite(a)) return Number.isFinite(b) ? normalizeHeading(b) : 0;
  if (!Number.isFinite(b)) return normalizeHeading(a);
  const delta = ((b - a + 540) % 360) - 180;
  return normalizeHeading(a + delta * Math.max(0, Math.min(1, amount)));
}

export function destinationPoint(lat, lng, bearing, distanceKm) {
  const angular = Number(distanceKm) / EARTH_RADIUS_KM;
  const bearingRad = Number(bearing) * DEG;
  const latRad = Number(lat) * DEG;
  const lngRad = Number(lng) * DEG;
  const targetLat = Math.asin(
    Math.sin(latRad) * Math.cos(angular)
      + Math.cos(latRad) * Math.sin(angular) * Math.cos(bearingRad),
  );
  const targetLng = lngRad + Math.atan2(
    Math.sin(bearingRad) * Math.sin(angular) * Math.cos(latRad),
    Math.cos(angular) - Math.sin(latRad) * Math.sin(targetLat),
  );
  return { lat: targetLat / DEG, lng: normalizeLongitude(targetLng / DEG) };
}

export class MotionStore {
  constructor({ renderDelayMs = 15_000, maxCoastMs = 120_000, historyLimit = 8 } = {}) {
    this.renderDelayMs = renderDelayMs;
    this.maxCoastMs = maxCoastMs;
    this.historyLimit = historyLimit;
    this.tracks = new Map();
  }

  ingest(type, items, observedAt = Date.now()) {
    const active = new Set();
    for (const item of Array.isArray(items) ? items : []) {
      const id = String(item?.id || "");
      const lat = Number(item?.lat);
      const lng = Number(item?.lng);
      if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const key = `${type}:${id}`;
      active.add(key);
      const sourceAt = parseTimestamp(item.time) || observedAt;
      const track = this.tracks.get(key) || [];
      const fix = {
        sourceAt,
        observedAt,
        lat,
        lng,
        altitudeMeters: Number(item.altitudeMeters || 0),
        heading: Number(item.heading),
        velocity: Math.max(0, Number(item.velocity || 0)),
      };
      const previous = track.at(-1);
      if (previous && sourceAt < previous.sourceAt) {
        // A slower aggregate refresh must not move a focused track back to an older fix.
        previous.observedAt = Math.max(previous.observedAt, observedAt);
      } else if (previous && sourceAt === previous.sourceAt) {
        Object.assign(previous, fix);
      } else {
        track.push(fix);
      }
      this.tracks.set(key, track.slice(-this.historyLimit));
    }

    const expiry = observedAt - 45 * 60_000;
    for (const [key, fixes] of this.tracks) {
      if (!active.has(key) && Number(fixes.at(-1)?.observedAt || 0) < expiry) this.tracks.delete(key);
    }
  }

  display(type, item, now = Date.now()) {
    const key = `${type}:${item?.id || ""}`;
    const fixes = this.tracks.get(key);
    if (!fixes?.length) return { ...item, motionState: "reported", motionAgeMs: 0 };
    const targetAt = now - this.renderDelayMs;
    const newest = fixes.at(-1);

    for (let index = 1; index < fixes.length; index += 1) {
      const from = fixes[index - 1];
      const to = fixes[index];
      if (targetAt < from.sourceAt || targetAt > to.sourceAt) continue;
      const span = Math.max(1, to.sourceAt - from.sourceAt);
      return {
        ...item,
        ...interpolatePosition(from, to, (targetAt - from.sourceAt) / span),
        motionState: "interpolated",
        motionAgeMs: Math.max(0, now - to.sourceAt),
      };
    }

    const elapsedMs = Math.max(0, targetAt - newest.sourceAt);
    const coastMs = Math.min(elapsedMs, this.maxCoastMs);
    if (coastMs > 0 && newest.velocity > 0 && Number.isFinite(newest.heading)) {
      const projected = destinationPoint(
        newest.lat,
        newest.lng,
        newest.heading,
        newest.velocity * coastMs / 1_000 / 1_000,
      );
      return {
        ...item,
        ...projected,
        altitudeMeters: newest.altitudeMeters,
        heading: newest.heading,
        motionState: elapsedMs > this.maxCoastMs ? "held" : "coasting",
        motionAgeMs: elapsedMs,
      };
    }
    return {
      ...item,
      lat: newest.lat,
      lng: newest.lng,
      altitudeMeters: newest.altitudeMeters,
      heading: newest.heading,
      motionState: "held",
      motionAgeMs: elapsedMs,
    };
  }

  trail(type, id) {
    return (this.tracks.get(`${type}:${id}`) || []).map(({ lat, lng, sourceAt }) => ({
      lat,
      lng,
      sourceAt,
    }));
  }
}

function normalizeHeading(value) {
  return ((Number(value) % 360) + 360) % 360;
}

function parseTimestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}
