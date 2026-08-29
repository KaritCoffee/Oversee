"use strict";

const MAJOR_HIGHWAYS = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
]);

const LOCAL_HIGHWAYS = new Set([
  ...MAJOR_HIGHWAYS,
  "unclassified",
  "residential",
  "living_street",
]);

const HIGHWAY_RANK = {
  motorway: 0,
  motorway_link: 1,
  trunk: 2,
  trunk_link: 3,
  primary: 4,
  primary_link: 5,
  secondary: 6,
  secondary_link: 7,
  tertiary: 8,
  tertiary_link: 9,
  unclassified: 10,
  residential: 11,
  living_street: 12,
};

function parseTrafficTilePath(pathname) {
  const match = /^\/api\/traffic\/flow\/(\d{1,2})\/(\d+)\/(\d+)\.png$/.exec(String(pathname || ""));
  if (!match) return null;
  const zoom = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > 22) return null;
  const maxCoordinate = (2 ** zoom) - 1;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || x > maxCoordinate || y > maxCoordinate) {
    return null;
  }
  return { zoom, x, y };
}

function normalizeTrafficBbox(value, options = {}) {
  const numbers = String(value || "").split(",").map(Number);
  if (numbers.length !== 4 || numbers.some((number) => !Number.isFinite(number))) {
    throw new Error("Traffic bounds must contain west,south,east,north coordinates");
  }
  const [west, south, east, north] = numbers;
  if (west < -180 || east > 180 || south < -85 || north > 85 || east <= west || north <= south) {
    throw new Error("Traffic bounds are outside the supported map area");
  }
  const maxLngSpan = Number(options.maxLngSpan || 5.5);
  const maxLatSpan = Number(options.maxLatSpan || 4.5);
  const maxArea = Number(options.maxArea || 18);
  const lngSpan = east - west;
  const latSpan = north - south;
  if (lngSpan > maxLngSpan || latSpan > maxLatSpan || lngSpan * latSpan > maxArea) {
    throw new Error("Zoom closer to load road traffic");
  }
  return {
    west: roundCoordinate(west),
    south: roundCoordinate(south),
    east: roundCoordinate(east),
    north: roundCoordinate(north),
  };
}

function quantizeTrafficBbox(bounds, detail = "major") {
  const step = detail === "local" ? 0.025 : 0.1;
  return {
    west: roundCoordinate(Math.floor(bounds.west / step) * step),
    south: roundCoordinate(Math.floor(bounds.south / step) * step),
    east: roundCoordinate(Math.ceil(bounds.east / step) * step),
    north: roundCoordinate(Math.ceil(bounds.north / step) * step),
  };
}

function buildOverpassRoadQuery(bounds, options = {}) {
  const detail = options.detail === "local" ? "local" : "major";
  const highwayPattern = detail === "local"
    ? "motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street"
    : "motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link";
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  return `[out:json][timeout:18];way["highway"~"^(${highwayPattern})$"](${bbox});out tags geom;`;
}

function normalizeOverpassRoads(payload, options = {}) {
  const detail = options.detail === "local" ? "local" : "major";
  const allowedHighways = detail === "local" ? LOCAL_HIGHWAYS : MAJOR_HIGHWAYS;
  const maxRoads = clampInteger(options.maxRoads, 20, 700, detail === "local" ? 520 : 420);
  const maxCoordinates = clampInteger(options.maxCoordinates, 500, 24000, detail === "local" ? 15000 : 12000);
  const candidates = (Array.isArray(payload?.elements) ? payload.elements : [])
    .filter((element) => element?.type === "way" && allowedHighways.has(element?.tags?.highway) && Array.isArray(element.geometry))
    .map((element) => ({
      element,
      rank: HIGHWAY_RANK[element.tags.highway] ?? 99,
      geometryLength: element.geometry.length,
    }))
    .sort((left, right) => left.rank - right.rank || right.geometryLength - left.geometryLength);

  const roads = [];
  let coordinateCount = 0;
  for (const candidate of candidates) {
    if (roads.length >= maxRoads || coordinateCount >= maxCoordinates) break;
    const remaining = maxCoordinates - coordinateCount;
    const coordinates = normalizeRoadCoordinates(candidate.element.geometry, Math.min(96, remaining));
    if (coordinates.length < 2) continue;
    const tags = candidate.element.tags || {};
    const highway = tags.highway;
    const fallbackName = titleCase(highway.replace(/_/g, " "));
    roads.push({
      id: `osm-way-${candidate.element.id}`,
      name: cleanText(tags.name || tags.ref || fallbackName),
      ref: cleanText(tags.ref || ""),
      highway,
      oneway: ["yes", "1", "true", "-1"].includes(String(tags.oneway || "").toLowerCase()),
      lanes: parsePositiveInteger(tags.lanes),
      maxspeed: parseMaxspeed(tags.maxspeed),
      coordinates,
    });
    coordinateCount += coordinates.length;
  }
  return roads;
}

class DailyTrafficBudget {
  constructor(options = {}) {
    this.limit = clampInteger(options.limit, 100, 50000, 5000);
    this.now = typeof options.now === "function" ? options.now : () => Date.now();
    this.day = String(options.day || "");
    this.used = clampInteger(options.used, 0, this.limit, 0);
    this.resetIfNeeded();
  }

  consume(amount = 1) {
    this.resetIfNeeded();
    const count = clampInteger(amount, 1, 1000, 1);
    if (this.used + count > this.limit) return false;
    this.used += count;
    return true;
  }

  snapshot() {
    this.resetIfNeeded();
    const resetAt = new Date(`${this.day}T00:00:00.000Z`);
    resetAt.setUTCDate(resetAt.getUTCDate() + 1);
    return {
      day: this.day,
      used: this.used,
      limit: this.limit,
      remaining: Math.max(0, this.limit - this.used),
      resetAt: resetAt.toISOString(),
    };
  }

  resetIfNeeded() {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    if (this.day === today) return;
    this.day = today;
    this.used = 0;
  }
}

function normalizeRoadCoordinates(geometry, limit) {
  const points = geometry
    .map((point) => [Number(point?.lon), Number(point?.lat)])
    .filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -85 && lat <= 85 && lng >= -180 && lng <= 180);
  if (points.length <= limit) return points.map(([lng, lat]) => [roundCoordinate(lng), roundCoordinate(lat)]);
  const selected = [];
  const stride = (points.length - 1) / (limit - 1);
  for (let index = 0; index < limit; index += 1) {
    const [lng, lat] = points[Math.round(index * stride)];
    selected.push([roundCoordinate(lng), roundCoordinate(lat)]);
  }
  return selected;
}

function parsePositiveInteger(value) {
  const number = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(number) && number > 0 && number < 20 ? number : 0;
}

function parseMaxspeed(value) {
  const match = /\d+/.exec(String(value || ""));
  if (!match) return 0;
  const speed = Number(match[0]);
  return Number.isFinite(speed) && speed > 0 && speed <= 250 ? speed : 0;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 140);
}

function titleCase(value) {
  return String(value || "").replace(/\b\w/g, (character) => character.toUpperCase());
}

function roundCoordinate(value) {
  return Number(Number(value).toFixed(5));
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

module.exports = {
  DailyTrafficBudget,
  buildOverpassRoadQuery,
  normalizeOverpassRoads,
  normalizeTrafficBbox,
  parseTrafficTilePath,
  quantizeTrafficBbox,
};
