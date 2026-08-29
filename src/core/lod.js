export function inGeoBounds(item, bounds) {
  if (!bounds) return true;
  const lat = Number(item?.lat);
  const lng = Number(item?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < bounds.south || lat > bounds.north) return false;
  if (bounds.west <= bounds.east) return lng >= bounds.west && lng <= bounds.east;
  return lng >= bounds.west || lng <= bounds.east;
}

export function spatiallyBalancedSample(items, limit, options = {}) {
  const values = Array.isArray(items) ? items.filter(hasPosition) : [];
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  if (!cap || !values.length) return [];
  if (values.length <= cap) return [...values];

  const columns = Math.max(4, Math.ceil(Math.sqrt(cap * 2)));
  const rows = Math.max(2, Math.ceil(columns / 2));
  const buckets = new Map();
  const keyOf = options.key || ((item) => String(item.id || item.name || ""));
  const scoreOf = options.score || (() => 0);
  for (const item of values) {
    const column = Math.min(columns - 1, Math.max(0, Math.floor(((Number(item.lng) + 180) / 360) * columns)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(((90 - Number(item.lat)) / 180) * rows)));
    const bucketKey = row * columns + column;
    const bucket = buckets.get(bucketKey) || [];
    bucket.push(item);
    buckets.set(bucketKey, bucket);
  }

  for (const bucket of buckets.values()) {
    bucket.sort((left, right) => scoreOf(right) - scoreOf(left) || keyOf(left).localeCompare(keyOf(right)));
  }

  const orderedBuckets = [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, bucket]) => bucket);
  const selected = [];
  let depth = 0;
  while (selected.length < cap) {
    let added = false;
    for (const bucket of orderedBuckets) {
      if (bucket[depth]) {
        selected.push(bucket[depth]);
        added = true;
        if (selected.length >= cap) break;
      }
    }
    if (!added) break;
    depth += 1;
  }
  return selected;
}

export function altitudeBudget(cameraHeightMeters, budgets = {}) {
  const height = Math.max(0, Number(cameraHeightMeters) || 0);
  if (height < 80_000) return budgets.local || 1_500;
  if (height < 1_500_000) return budgets.regional || 3_500;
  return budgets.global || 5_000;
}

function hasPosition(item) {
  return Number.isFinite(Number(item?.lat)) && Number.isFinite(Number(item?.lng));
}
