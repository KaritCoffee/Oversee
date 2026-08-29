const fs = require("node:fs");
const path = require("node:path");

class HistoryStore {
  constructor(options = {}) {
    this.filePath = options.filePath;
    this.maxSamples = Math.max(24, Number(options.maxSamples || 576));
    this.minIntervalMs = Math.max(10_000, Number(options.minIntervalMs || 5 * 60 * 1000));
    this.samples = this.load();
  }

  append(snapshot) {
    if (!snapshot?.generatedAt) return false;
    const sample = compactSnapshot(snapshot);
    const latest = [...this.samples].reverse().find((entry) => entry.scope === sample.scope);
    if (latest && Date.parse(sample.time) - Date.parse(latest.time) < this.minIntervalMs) return false;
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) this.samples.splice(0, this.samples.length - this.maxSamples);
    this.save();
    return true;
  }

  query(options = {}) {
    const since = Number(options.since || 0);
    const scope = options.scope || "";
    const limit = Math.max(1, Math.min(this.maxSamples, Number(options.limit || 288)));
    return this.samples
      .filter((sample) => !scope || sample.scope === scope)
      .filter((sample) => !since || Date.parse(sample.time) >= since)
      .slice(-limit);
  }

  stats() {
    return {
      samples: this.samples.length,
      oldestAt: this.samples[0]?.time || "",
      newestAt: this.samples[this.samples.length - 1]?.time || "",
      filePath: this.filePath || "",
    };
  }

  load() {
    if (!this.filePath) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return Array.isArray(parsed?.samples) ? parsed.samples.slice(-this.maxSamples) : [];
    } catch {
      return [];
    }
  }

  save() {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, `${JSON.stringify({ version: 1, samples: this.samples })}\n`);
    } catch {
      // History is a convenience layer; source fetching must continue if local persistence fails.
    }
  }
}

function compactSnapshot(snapshot) {
  return {
    time: new Date(snapshot.generatedAt).toISOString(),
    scope: snapshot.scope || "world",
    metrics: { ...(snapshot.metrics || {}) },
    moving: {
      flights: compactPoints(snapshot.flights, 180, ["callsign", "heading", "altitudeMeters"]),
      satellites: compactPoints(snapshot.satellites, 140, ["name", "altitudeKm"]),
      vessels: compactPoints(snapshot.vessels, 100, ["name", "course", "speedKnots"]),
    },
    signals: {
      alerts: compactPoints(snapshot.alerts, 80, ["event", "severity", "areaSummary", "source"]),
      quakes: compactPoints(snapshot.quakes, 80, ["name", "magnitude", "depthKm"]),
      fires: compactPoints(snapshot.fires, 100, ["name", "severity", "subtype", "frp"]),
    },
  };
}

function compactPoints(items, limit, fields) {
  return (Array.isArray(items) ? items : []).slice(0, limit).map((item) => {
    const entry = {
      id: item.id,
      lat: round(item.lat, 4),
      lng: round(item.lng, 4),
      time: item.time || item.observedAt || item.updatedAt || "",
    };
    for (const field of fields) {
      if (item[field] != null && item[field] !== "") entry[field] = item[field];
    }
    return entry;
  });
}

function round(value, places) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** places;
  return Math.round(number * factor) / factor;
}

module.exports = { HistoryStore, compactSnapshot };
