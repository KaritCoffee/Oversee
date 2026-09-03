export const LAYER_PRESETS = [
  {
    id: "overview",
    label: "Overview",
    description: "Core cameras, moving assets, hazards, and alerts.",
    layers: ["cameras", "satellites", "flights", "quakes", "fires", "alerts"],
  },
  {
    id: "cameras",
    label: "Cameras",
    description: "Camera coverage with alerts kept for nearby context.",
    layers: ["cameras", "alerts"],
  },
  {
    id: "aviation",
    label: "Aviation",
    description: "Aircraft, missions, and official alerts.",
    layers: ["flights", "launches", "alerts"],
  },
  {
    id: "hazards",
    label: "Hazards",
    description: "Earthquakes, fires, and official alerts without asset clutter.",
    layers: ["quakes", "fires", "alerts"],
  },
  {
    id: "maritime",
    label: "Maritime",
    description: "Vessels, coastal cameras, and official alerts.",
    layers: ["vessels", "cameras", "alerts"],
  },
  {
    id: "clean",
    label: "Clean",
    description: "Hide every signal layer for an unobstructed globe.",
    layers: [],
  },
];

export function applyLayerPreset(currentLayers = {}, presetId, layerIds = Object.keys(currentLayers)) {
  const preset = LAYER_PRESETS.find((entry) => entry.id === presetId);
  if (!preset) return { ...currentLayers };
  const enabled = new Set(preset.layers);
  return Object.fromEntries(layerIds.map((id) => [id, enabled.has(id)]));
}

export function detectLayerPreset(layers = {}, layerIds = Object.keys(layers)) {
  for (const preset of LAYER_PRESETS) {
    const enabled = new Set(preset.layers);
    if (layerIds.every((id) => Boolean(layers[id]) === enabled.has(id))) return preset.id;
  }
  return "custom";
}

export function normalizeLayerPreferences(value, layerIds, fallback = {}) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(layerIds.map((id) => [id, typeof source[id] === "boolean" ? source[id] : Boolean(fallback[id])]));
}
