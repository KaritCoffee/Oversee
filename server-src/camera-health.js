const fs = require("node:fs");
const path = require("node:path");

class CameraHealthRegistry {
  constructor(options = {}) {
    this.filePath = options.filePath || "";
    this.maxRecords = Math.max(100, Number(options.maxRecords || 5000));
    this.records = new Map(Object.entries(this.load()));
    this.saveTimer = null;
  }

  record(id, observation = {}) {
    if (!id) return null;
    const previous = this.records.get(String(id)) || { checks: 0, successes: 0, failures: 0, consecutiveFailures: 0 };
    const ok = Boolean(observation.ok);
    const degraded = ok && Boolean(observation.degraded || observation.fallbackUsed);
    const now = new Date().toISOString();
    const recentOutcomes = [
      ...(Array.isArray(previous.recentOutcomes) ? previous.recentOutcomes : []),
      { ok, degraded, at: now },
    ].slice(-12);
    const record = {
      ...previous,
      checks: Number(previous.checks || 0) + 1,
      successes: Number(previous.successes || 0) + (ok ? 1 : 0),
      failures: Number(previous.failures || 0) + (ok ? 0 : 1),
      consecutiveFailures: ok ? 0 : Number(previous.consecutiveFailures || 0) + 1,
      lastCheckedAt: now,
      lastSuccessAt: ok ? now : previous.lastSuccessAt || "",
      lastFailureAt: ok ? previous.lastFailureAt || "" : now,
      mediaType: String(observation.mediaType || previous.mediaType || ""),
      contentType: String(observation.contentType || previous.contentType || "").slice(0, 100),
      sourceName: String(observation.sourceName || previous.sourceName || "").slice(0, 120),
      statusCode: Number(observation.statusCode || 0),
      latencyMs: Number.isFinite(Number(observation.latencyMs)) ? Math.max(0, Math.round(Number(observation.latencyMs))) : Number(previous.latencyMs || 0),
      bytesChecked: Number.isFinite(Number(observation.bytesChecked)) ? Math.max(0, Math.round(Number(observation.bytesChecked))) : Number(previous.bytesChecked || 0),
      fallbackUsed: degraded,
      recentOutcomes,
      message: ok ? "" : String(observation.message || "Media did not load").slice(0, 240),
    };
    this.records.set(String(id), record);
    this.prune();
    this.scheduleSave();
    return this.status(id);
  }

  status(id) {
    const record = this.records.get(String(id));
    if (!record) return { status: "unverified", checks: 0, healthScore: 45, confidence: 0 };
    const recent = Array.isArray(record.recentOutcomes) ? record.recentOutcomes : [];
    const recentSuccesses = recent.filter((outcome) => outcome.ok).length;
    const recentFallbacks = recent.filter((outcome) => outcome.ok && outcome.degraded).length;
    const successRate = recent.length ? recentSuccesses / recent.length : Number(record.successes || 0) / Math.max(1, Number(record.checks || 0));
    const fallbackRate = recent.length ? recentFallbacks / recent.length : 0;
    const confidence = Math.min(100, Math.round(Math.min(12, Number(record.checks || 0)) / 12 * 100));
    const healthScore = clamp(Math.round(
      successRate * 82
      + (record.lastSuccessAt ? 13 : 0)
      - Number(record.consecutiveFailures || 0) * 20
      - fallbackRate * 18
    ), 0, 100);
    const lastOutcome = recent.at(-1);
    const status = record.consecutiveFailures >= 2
      ? "down"
      : record.lastSuccessAt && (
          record.fallbackUsed
          || Number(record.consecutiveFailures || 0) === 1
          || (recent.length >= 3 && successRate < 0.8)
        )
        ? "degraded"
        : record.lastSuccessAt && lastOutcome?.ok
          ? "verified"
        : "unverified";
    return { ...record, status, healthScore, confidence, recentSuccessRate: Number(successRate.toFixed(3)) };
  }

  decorate(camera) {
    const health = this.status(camera.id);
    return {
      ...camera,
      healthStatus: health.status,
      healthScore: health.healthScore,
      healthConfidence: health.confidence,
      healthCheckedAt: health.lastCheckedAt || "",
      healthLastSuccessAt: health.lastSuccessAt || "",
      healthMessage: health.message || "",
      healthLatencyMs: health.latencyMs || 0,
      healthFallbackUsed: Boolean(health.fallbackUsed),
    };
  }

  summary(cameras = []) {
    const counts = { verified: 0, degraded: 0, down: 0, unverified: 0 };
    for (const camera of cameras) counts[this.status(camera.id).status] += 1;
    return { ...counts, observed: counts.verified + counts.degraded + counts.down, total: cameras.length };
  }

  load() {
    if (!this.filePath) return {};
    try {
      const payload = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return payload?.records && typeof payload.records === "object" ? payload.records : {};
    } catch {
      return {};
    }
  }

  save() {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, `${JSON.stringify({ version: 1, records: Object.fromEntries(this.records) })}\n`);
    } catch {
      // Camera playback remains usable when health persistence cannot be written.
    }
  }

  scheduleSave() {
    if (!this.filePath || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, 100);
    this.saveTimer.unref?.();
  }

  prune() {
    if (this.records.size <= this.maxRecords) return;
    const oldest = [...this.records.entries()]
      .sort((left, right) => Date.parse(left[1].lastCheckedAt || 0) - Date.parse(right[1].lastCheckedAt || 0))
      .slice(0, this.records.size - this.maxRecords);
    for (const [id] of oldest) this.records.delete(id);
  }
}

function buildCameraCoverage(cameras = []) {
  const countries = new Map();
  const regions = new Map();
  const sources = new Set();
  const grid = new Map();
  const fineGrid = new Map();
  let playable = 0;
  let stills = 0;
  let sourceOnly = 0;
  for (const camera of cameras) {
    const country = camera.country || "Unknown";
    const region = camera.region || camera.area || "Unknown";
    countries.set(country, (countries.get(country) || 0) + 1);
    regions.set(`${country}|${region}`, (regions.get(`${country}|${region}`) || 0) + 1);
    sources.add(camera.sourceId || camera.sourceName || "Unknown");
    if (camera.capability === "stream" || camera.capability === "player") playable += 1;
    else if (camera.viewerType === "image" || camera.capability === "snapshot") stills += 1;
    else sourceOnly += 1;
    const lat = Number(camera.lat);
    const lng = Number(camera.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const key = `${Math.floor((lat + 90) / 10)}:${Math.floor((lng + 180) / 10)}`;
      grid.set(key, (grid.get(key) || 0) + 1);
      const fineKey = `${Math.floor((lat + 90) / 5)}:${Math.floor((lng + 180) / 5)}`;
      fineGrid.set(fineKey, (fineGrid.get(fineKey) || 0) + 1);
    }
  }
  return {
    total: cameras.length,
    countries: countries.size,
    regions: regions.size,
    sources: sources.size,
    playable,
    stills,
    sourceOnly,
    occupiedTenDegreeCells: grid.size,
    occupiedFiveDegreeCells: fineGrid.size,
    topCountries: [...countries.entries()].sort((left, right) => right[1] - left[1]).slice(0, 16).map(([name, count]) => ({ name, count })),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

module.exports = { CameraHealthRegistry, buildCameraCoverage };
