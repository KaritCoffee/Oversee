import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  json2satrec,
  propagate,
  twoline2satrec,
} from "satellite.js";

export class SatellitePropagator {
  constructor() {
    this.models = new Map();
    this.positionCache = new Map();
    this.cacheSecond = -1;
  }

  ingest(items = []) {
    const active = new Set();
    for (const item of items) {
      const id = String(item?.id || "");
      if (!id) continue;
      active.add(id);
      const elements = item.orbitalElements;
      const epoch = elementRevision(elements);
      if (!elements || this.models.get(id)?.epoch === epoch) continue;
      try {
        const satrec = satelliteRecord(elements);
        if (satrec?.error) continue;
        this.models.set(id, { satrec, epoch, item });
      } catch {
        // A malformed public element should not remove the source-provided fallback point.
      }
    }
    for (const id of this.models.keys()) {
      if (!active.has(id)) this.models.delete(id);
    }
    this.positionCache.clear();
  }

  position(item, date = new Date()) {
    const id = String(item?.id || "");
    const second = Math.floor(date.getTime() / 1_000);
    if (second !== this.cacheSecond) {
      this.cacheSecond = second;
      this.positionCache.clear();
    }
    if (this.positionCache.has(id)) return this.positionCache.get(id);
    const model = this.models.get(id);
    if (!model) return fallbackPosition(item);
    const propagated = propagateModel(model.satrec, date);
    const point = propagated || fallbackPosition(item);
    this.positionCache.set(id, point);
    return point;
  }

  groundTrack(item, date = new Date(), steps = 96) {
    const model = this.models.get(String(item?.id || ""));
    if (!model) return Array.isArray(item?.orbit) ? item.orbit : [];
    const periodMs = orbitalPeriodMs(model.satrec);
    const count = Math.max(24, Math.min(240, Math.floor(steps)));
    const start = date.getTime() - periodMs * 0.35;
    const points = [];
    for (let index = 0; index <= count; index += 1) {
      const point = propagateModel(model.satrec, new Date(start + periodMs * index / count));
      if (point) points.push(point);
    }
    return points;
  }
}

export function propagateElements(elements, date = new Date()) {
  try {
    const satrec = satelliteRecord(elements);
    if (satrec?.error) return null;
    return propagateModel(satrec, date);
  } catch {
    return null;
  }
}

function satelliteRecord(elements = {}) {
  if (elements.TLE_LINE1 && elements.TLE_LINE2) {
    return twoline2satrec(String(elements.TLE_LINE1), String(elements.TLE_LINE2));
  }
  return json2satrec(elements);
}

function elementRevision(elements = {}) {
  return elements.EPOCH || `${elements.TLE_LINE1 || ""}|${elements.TLE_LINE2 || ""}`;
}

function propagateModel(satrec, date) {
  try {
    const result = propagate(satrec, date);
    if (!result?.position || typeof result.position === "boolean") return null;
    const geo = eciToGeodetic(result.position, gstime(date));
    return {
      lat: degreesLat(geo.latitude),
      lng: normalizeLongitude(degreesLong(geo.longitude)),
      altitudeKm: geo.height,
    };
  } catch {
    return null;
  }
}

function orbitalPeriodMs(satrec) {
  const radiansPerMinute = Math.max(Number(satrec?.no || 0), 1e-6);
  return 2 * Math.PI / radiansPerMinute * 60_000;
}

function fallbackPosition(item = {}) {
  return {
    lat: Number(item.lat),
    lng: Number(item.lng),
    altitudeKm: Number(item.altitudeKm || 0),
  };
}

function normalizeLongitude(value) {
  return ((Number(value) + 540) % 360) - 180;
}
