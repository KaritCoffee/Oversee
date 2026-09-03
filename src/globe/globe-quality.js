export const GLOBE_QUALITY_MODES = [
  {
    id: "standard",
    label: "Standard",
    shortLabel: "Standard",
    description: "Fast satellite imagery on the dependable keyless globe.",
  },
  {
    id: "buildings",
    label: "3D Buildings",
    shortLabel: "3D",
    description: "Cesium world terrain with global OpenStreetMap buildings.",
    requires: "cesiumIon",
  },
  {
    id: "photorealistic",
    label: "Photorealistic",
    shortLabel: "Photo",
    description: "Google photorealistic 3D terrain and cities streamed on demand.",
    requires: "google3dTiles",
  },
];

export function normalizeGlobeQuality(value) {
  const requested = String(value || "").toLowerCase();
  return GLOBE_QUALITY_MODES.some((mode) => mode.id === requested) ? requested : "standard";
}

export function globeQualityAvailability(config = {}) {
  return {
    standard: true,
    buildings: Boolean(config.capabilities?.cesiumIon || config.cesiumIonToken),
    photorealistic: Boolean(config.capabilities?.google3dTiles || config.googleMapsApiKey),
  };
}

export function resolveGlobeQuality(requested, config = {}) {
  const mode = normalizeGlobeQuality(requested);
  const availability = globeQualityAvailability(config);
  if (availability[mode]) return { mode, available: true, missing: "" };
  return {
    mode: "standard",
    available: false,
    missing: mode === "buildings" ? "cesiumIonToken" : "googleMapsApiKey",
    requested: mode,
  };
}

export function globeQualityMode(id) {
  return GLOBE_QUALITY_MODES.find((mode) => mode.id === normalizeGlobeQuality(id)) || GLOBE_QUALITY_MODES[0];
}
