const AIS_STREAM_URL = "wss://stream.aisstream.io/v0/stream";
const STALE_MS = 15 * 60 * 1000;
const MAX_VESSELS = 8000;

class AisCollector {
  constructor({ WebSocketImpl = globalThis.WebSocket, now = () => Date.now(), warn = console.warn } = {}) {
    this.WebSocketImpl = WebSocketImpl;
    this.now = now;
    this.warn = warn;
    this.socket = null;
    this.key = "";
    this.vessels = new Map();
    this.staticData = new Map();
    this.tracks = new Map();
    this.status = "unconfigured";
    this.message = "Add a free AISStream key in Settings to enable vessels.";
    this.updatedAt = 0;
    this.retryTimer = null;
    this.watchdogTimer = null;
    this.retryCount = 0;
    this.generation = 0;
  }

  configure(key) {
    const next = String(key || "").trim();
    if (next === this.key && (this.socket || !next)) return;
    this.stop();
    this.key = next;
    if (!next) {
      this.status = "unconfigured";
      this.message = "Add a free AISStream key in Settings to enable vessels.";
      return;
    }
    this.connect();
  }

  connect() {
    if (!this.key || !this.WebSocketImpl || this.socket) return;
    const generation = ++this.generation;
    this.status = "connecting";
    this.message = "Connecting to AISStream.";
    let socket;
    try {
      socket = new this.WebSocketImpl(AIS_STREAM_URL);
    } catch (error) {
      this.fail(error.message);
      return;
    }
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (!this.owns(generation, socket)) return;
      socket.send(JSON.stringify({
        APIKey: this.key,
        BoundingBoxes: [[[-90, -180], [90, 180]]],
        FilterMessageTypes: [
          "PositionReport",
          "StandardClassBPositionReport",
          "ExtendedClassBPositionReport",
          "LongRangeAisBroadcastMessage",
          "ShipStaticData",
          "StaticDataReport",
        ],
      }));
      this.status = "live";
      this.message = "Waiting for vessel positions.";
      this.retryCount = 0;
      this.startWatchdog(generation, socket);
    });

    socket.addEventListener("message", async (event) => {
      if (!this.owns(generation, socket)) return;
      try {
        const text = typeof event.data === "string" ? event.data : await decodeFrame(event.data);
        if (text.length > 1_000_000) return;
        const envelope = JSON.parse(text);
        if (envelope?.error) {
          this.message = `AISStream: ${String(envelope.error).slice(0, 180)}`;
          if (/key|auth|forbidden|unauthor/i.test(this.message)) this.status = "auth-error";
          return;
        }
        const vessel = normalizeAisEnvelope(envelope, this.staticData, this.now());
        this.updatedAt = this.now();
        this.status = "live";
        if (!vessel) return;
        this.vessels.set(vessel.mmsi, vessel);
        this.appendTrack(vessel);
        this.prune();
        this.message = `${this.vessels.size.toLocaleString()} recent vessel positions.`;
      } catch {
        // A malformed upstream frame is ignored without disrupting valid traffic.
      }
    });

    socket.addEventListener("error", () => {
      if (this.owns(generation, socket)) this.message = "AISStream connection error.";
    });
    socket.addEventListener("close", () => {
      if (!this.owns(generation, socket)) return;
      this.socket = null;
      this.clearWatchdog();
      if (this.status !== "auth-error") this.scheduleReconnect();
    });
  }

  snapshot() {
    this.prune();
    const data = [...this.vessels.values()]
      .sort((left, right) => right.observedAtMs - left.observedAtMs)
      .map((vessel) => ({ ...vessel, trail: this.tracks.get(vessel.mmsi) || [] }));
    return {
      ok: this.status === "live" || this.status === "connecting" || this.status === "unconfigured",
      configured: Boolean(this.key),
      data,
      updatedAt: this.updatedAt,
      status: this.status,
      message: this.message,
    };
  }

  appendTrack(vessel) {
    const track = this.tracks.get(vessel.mmsi) || [];
    const previous = track.at(-1);
    if (!previous || vessel.observedAtMs - previous.time >= 30_000) {
      track.push({ lat: vessel.lat, lng: vessel.lng, time: vessel.observedAtMs });
      if (track.length > 24) track.splice(0, track.length - 24);
      this.tracks.set(vessel.mmsi, track);
    }
  }

  prune() {
    const cutoff = this.now() - STALE_MS;
    for (const [mmsi, vessel] of this.vessels) {
      if (vessel.observedAtMs < cutoff) {
        this.vessels.delete(mmsi);
        this.tracks.delete(mmsi);
      }
    }
    if (this.vessels.size <= MAX_VESSELS) return;
    const oldest = [...this.vessels.values()].sort((a, b) => a.observedAtMs - b.observedAtMs);
    for (const vessel of oldest.slice(0, this.vessels.size - MAX_VESSELS)) {
      this.vessels.delete(vessel.mmsi);
      this.tracks.delete(vessel.mmsi);
    }
  }

  startWatchdog(generation, socket) {
    this.clearWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (!this.owns(generation, socket)) return;
      if (this.updatedAt && this.now() - this.updatedAt < 90_000) return;
      this.message = "AISStream is connected but has not delivered recent positions.";
    }, 30_000);
    this.watchdogTimer.unref?.();
  }

  scheduleReconnect() {
    if (!this.key || this.retryTimer || this.status === "auth-error") return;
    const delay = Math.min(5 * 60_000, 5000 * 2 ** Math.min(6, this.retryCount++));
    this.status = "delayed";
    this.message = `AISStream reconnect scheduled in ${Math.round(delay / 1000)}s.`;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
    this.retryTimer.unref?.();
  }

  fail(message) {
    this.status = "delayed";
    this.message = String(message || "AISStream unavailable");
    this.socket = null;
    this.scheduleReconnect();
  }

  owns(generation, socket) {
    return generation === this.generation && socket === this.socket;
  }

  clearWatchdog() {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  stop() {
    this.generation += 1;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.clearWatchdog();
    const socket = this.socket;
    this.socket = null;
    try {
      socket?.close?.();
    } catch {
      // Shutdown is best effort.
    }
  }
}

function normalizeAisEnvelope(envelope, staticData = new Map(), nowMs = Date.now()) {
  const messageType = String(envelope?.MessageType || "");
  const body = envelope?.Message?.[messageType] || {};
  const metadata = envelope?.MetaData || envelope?.Metadata || {};
  const mmsi = cleanText(metadata.MMSI ?? body.UserID ?? body.UserId ?? body.Mmsi);
  if (!mmsi) return null;

  if (messageType === "ShipStaticData" || messageType === "StaticDataReport") {
    const previous = staticData.get(mmsi) || {};
    staticData.set(mmsi, {
      name: cleanText(metadata.ShipName ?? body.Name ?? body.ShipName ?? body.ReportA?.Name ?? previous.name),
      type: cleanText(body.Type ?? body.ShipType ?? body.ReportB?.ShipType ?? previous.type),
      destination: cleanText(body.Destination ?? previous.destination),
      imo: cleanText(body.ImoNumber ?? body.IMO ?? previous.imo),
    });
  }

  const lat = finiteNumber(metadata.latitude ?? metadata.Latitude ?? body.Latitude);
  const lng = finiteNumber(metadata.longitude ?? metadata.Longitude ?? body.Longitude);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const known = staticData.get(mmsi) || {};
  const observedAt = validIsoDate(metadata.time_utc ?? metadata.TimeUtc) || new Date(nowMs).toISOString();
  const heading = normalizeHeading(body.TrueHeading ?? body.Heading ?? body.Cog ?? body.COG);
  const speedKnots = finiteNumber(body.Sog ?? body.SOG);

  return {
    id: `vessel-${mmsi}`,
    type: "vessel",
    name: cleanText(metadata.ShipName ?? body.Name ?? body.ShipName ?? known.name) || `MMSI ${mmsi}`,
    mmsi,
    imo: cleanText(body.ImoNumber ?? body.IMO ?? known.imo),
    vesselType: cleanText(body.Type ?? body.ShipType ?? known.type),
    destination: cleanText(body.Destination ?? known.destination),
    speedKnots,
    velocity: speedKnots === null ? 0 : speedKnots * 0.514444,
    course: finiteNumber(body.Cog ?? body.COG),
    heading,
    lat,
    lng,
    observedAt,
    time: observedAt,
    observedAtMs: Date.parse(observedAt),
    source: "AISStream",
    sourceUrl: "https://aisstream.io/",
  };
}

async function decodeFrame(data) {
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  if (data && typeof data.text === "function") return data.text();
  return String(data || "");
}

function finiteNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeHeading(value) {
  const number = finiteNumber(value);
  if (number === null || number < 0 || number >= 511) return null;
  return ((number % 360) + 360) % 360;
}

function validIsoDate(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

module.exports = {
  AisCollector,
  normalizeAisEnvelope,
};
