export const AIRCRAFT_TRACKING_MODES = [
  { id: "follow", label: "Follow", description: "Stable regional view that keeps the aircraft centered." },
  { id: "chase", label: "Chase", description: "Closer third-person camera behind and above the aircraft." },
  { id: "cockpit", label: "Cockpit", description: "Forward-looking view aligned to the reported heading." },
];

const HELICOPTER_TYPES = /^(?:A10[9]|A1[1-8]9|B0?6|B10[5]|B2(?:06|12|14|22|30)|B4(?:07|12|27|29)|BK17|EC(?:20|25|30|35|45|55|75)|H1(?:25|35|45|60|75)|H2(?:15|25)|R(?:22|44|66)|S(?:58|61|64|70|76|92)|AS(?:32|35|50|55)|MD(?:50|52|60)|UH1|UH60|CH(?:46|47|53)|AH64|MI(?:2|8|17|24|26|28)|KA(?:27|32|50|52))$/;
const TURBOPROP_TYPES = /^(?:AT(?:43|45|46|72|75|76)|DH8|DHC|C1(?:2|3)|C2(?:08|12)|PC(?:6|12|24)|BE(?:20|30|35|36|40|90)|SF34|SB20|F50|F27|AN(?:12|24|26|28|30|32|38|72|74)|IL76)$/;
const JET_TYPES = /^(?:A2|A3|A4|A5|B7|B8|B9|CRJ|E1[79]|E2|E145|E135|GLF|CL30|CL35|CL60|C5|C17|LJ|FA[578]|F1[568]|M2[08]|DC|MD8|MD9|SU)/;

export function normalizeAircraftTrackingMode(value) {
  const mode = String(value || "").toLowerCase();
  return AIRCRAFT_TRACKING_MODES.some((item) => item.id === mode) ? mode : "follow";
}

export function classifyAircraft(item = {}) {
  const type = String(item.aircraftType || item.typeCode || "").trim().toUpperCase();
  const description = `${item.name || ""} ${item.callsign || ""} ${item.category || ""}`.toUpperCase();
  if (item.category === "A7" || HELICOPTER_TYPES.test(type) || /HELI|ROTOR|COPTER/.test(description)) {
    return { id: "helicopter", label: "Helicopter", model: "helicopter" };
  }
  if (TURBOPROP_TYPES.test(type)) return { id: "turboprop", label: "Turboprop", model: "turboprop" };
  if (JET_TYPES.test(type)) return { id: "jet", label: "Jet aircraft", model: "jet" };
  if (type) return { id: "light", label: "Aircraft", model: "light" };
  return { id: "generic", label: "Aircraft", model: "light" };
}

export function trackingCameraProfile(mode, aircraft = {}) {
  const normalizedMode = normalizeAircraftTrackingMode(mode);
  const rotorcraft = classifyAircraft(aircraft).id === "helicopter";
  const profiles = rotorcraft
    ? {
        follow: { distanceKm: 4.5, heightAboveMeters: 1600, pitchDegrees: -18, lookAheadKm: 1.2 },
        chase: { distanceKm: 0.42, heightAboveMeters: 145, pitchDegrees: -7, lookAheadKm: 1.0 },
        cockpit: { distanceKm: 0.018, heightAboveMeters: 4.2, pitchDegrees: -3, lookAheadKm: 1.4 },
      }
    : {
        follow: { distanceKm: 12, heightAboveMeters: 4500, pitchDegrees: -20, lookAheadKm: 4 },
        chase: { distanceKm: 1.25, heightAboveMeters: 420, pitchDegrees: -6, lookAheadKm: 5 },
        cockpit: { distanceKm: 0.035, heightAboveMeters: 7.5, pitchDegrees: -2, lookAheadKm: 7 },
      };
  return { mode: normalizedMode, ...profiles[normalizedMode] };
}

export function aircraftSignalState(item = {}, now = Date.now()) {
  const observedAt = Date.parse(item.time || item.observedAt || "");
  const ageMs = Number.isFinite(observedAt) ? Math.max(0, now - observedAt) : Infinity;
  if (ageMs <= 45_000) return { id: "live", label: "Fresh position", ageMs, estimated: false };
  if (ageMs <= 150_000) return { id: "estimated", label: "Interpolated position", ageMs, estimated: true };
  if (ageMs <= 5 * 60_000) return { id: "stale", label: "Holding last position", ageMs, estimated: true };
  return { id: "lost", label: "Signal unavailable", ageMs, estimated: true };
}

export function trackingTelemetry(item = {}, now = Date.now()) {
  const signal = aircraftSignalState(item, now);
  const altitudeMeters = Number(item.altitudeMeters || 0);
  const velocity = Number(item.velocity || 0);
  const heading = Number(item.heading);
  return {
    signal,
    altitudeFeet: Number.isFinite(altitudeMeters) ? Math.max(0, Math.round(altitudeMeters * 3.28084)) : 0,
    speedKnots: Number.isFinite(velocity) ? Math.max(0, Math.round(velocity * 1.94384)) : 0,
    headingDegrees: Number.isFinite(heading) ? Math.round(normalizeHeading(heading)) : null,
    verticalRateFeetPerMinute: Number.isFinite(Number(item.verticalRate))
      ? Math.round(Number(item.verticalRate) * 196.8504)
      : null,
  };
}

export function smoothHeading(from, to, amount = 0.16) {
  const start = normalizeHeading(from);
  const end = normalizeHeading(to);
  const delta = ((end - start + 540) % 360) - 180;
  return normalizeHeading(start + delta * Math.max(0, Math.min(1, amount)));
}

function normalizeHeading(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return ((number % 360) + 360) % 360;
}
