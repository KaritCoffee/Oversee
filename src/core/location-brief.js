const SIGNAL_COLLECTIONS = [
  ["camera", "cameras"],
  ["alert", "alerts"],
  ["fire", "fires"],
  ["quake", "quakes"],
  ["flight", "flights"],
  ["satellite", "satellites"],
  ["vessel", "vessels"],
  ["launch", "launches"],
  ["radio", "radio"],
  ["demographic", "demographics"],
];

export function collectNearbySignals(snapshot, center, radiusKm, options = {}) {
  const maxPerType = Math.max(1, Number(options.maxPerType || 80));
  const output = {};
  for (const [type, collection] of SIGNAL_COLLECTIONS) {
    const items = Array.isArray(snapshot?.[collection]) ? snapshot[collection] : [];
    output[collection] = items
      .map((item) => ({ ...item, distanceKm: distanceKm(center.lat, center.lng, Number(item.lat), Number(item.lng)), signalType: type }))
      .filter((item) => Number.isFinite(item.distanceKm) && item.distanceKm <= radiusKm)
      .sort((left, right) => left.distanceKm - right.distanceKm)
      .slice(0, maxPerType);
  }
  output.total = SIGNAL_COLLECTIONS.reduce((sum, [, collection]) => sum + output[collection].length, 0);
  return output;
}

export function evaluateWatchZone(zone, snapshot) {
  const nearby = collectNearbySignals(snapshot, zone, zone.radiusKm || 100, { maxPerType: 500 });
  const relevant = [
    ...nearby.alerts,
    ...nearby.fires,
    ...nearby.quakes,
    ...nearby.flights,
    ...nearby.vessels,
  ];
  const currentIds = relevant.map((item) => `${item.signalType}:${item.id}`).sort();
  const previous = new Set(Array.isArray(zone.lastSignalIds) ? zone.lastSignalIds : []);
  const newItems = relevant.filter((item) => !previous.has(`${item.signalType}:${item.id}`));
  return {
    currentIds,
    newItems,
    nearby,
    count: relevant.length,
    evaluatedAt: snapshot?.generatedAt || new Date().toISOString(),
  };
}

export function historyFrameItems(sample) {
  if (!sample) return [];
  return [
    ...tagHistory(sample.moving?.flights, "flight"),
    ...tagHistory(sample.moving?.satellites, "satellite"),
    ...tagHistory(sample.moving?.vessels, "vessel"),
    ...tagHistory(sample.signals?.alerts, "alert"),
    ...tagHistory(sample.signals?.quakes, "quake"),
    ...tagHistory(sample.signals?.fires, "fire"),
  ];
}

function tagHistory(items, type) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)))
    .map((item) => ({ ...item, type }));
}

export function distanceKm(latA, lngA, latB, lngB) {
  if (![latA, lngA, latB, lngB].every((value) => Number.isFinite(Number(value)))) return Number.POSITIVE_INFINITY;
  const radiusKm = 6371;
  const toRad = (value) => Number(value) * Math.PI / 180;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
