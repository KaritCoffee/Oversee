export class CesiumPointLayer {
  constructor({ viewer, Cesium, id }) {
    this.viewer = viewer;
    this.Cesium = Cesium;
    this.id = id;
    this.records = new Map();
    this.collection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    this.resolvePosition = null;
    this.describe = null;
  }

  sync(items, { type, resolvePosition, describe }) {
    this.resolvePosition = resolvePosition;
    this.describe = describe;
    const seen = new Set();
    const now = Date.now();
    for (const item of Array.isArray(items) ? items : []) {
      const id = String(item?.id || "");
      if (!id || seen.has(id)) continue;
      const position = resolvePosition(item, now);
      if (!validPosition(position)) continue;
      seen.add(id);
      const style = describe(item, position);
      let record = this.records.get(id);
      if (!record) {
        const point = this.collection.add({
          id: { oversee: { type, item } },
          position: this.Cesium.Cartesian3.fromDegrees(
            Number(position.lng),
            Number(position.lat),
            Number(position.height || 0),
          ),
          pixelSize: style.pixelSize,
          color: style.color,
          outlineColor: style.outlineColor,
          outlineWidth: style.outlineWidth,
          scaleByDistance: style.scaleByDistance,
          translucencyByDistance: style.translucencyByDistance,
          disableDepthTestDistance: style.disableDepthTestDistance || 0,
        });
        record = { point, item, type, scratch: new this.Cesium.Cartesian3() };
        this.records.set(id, record);
      } else {
        record.item = item;
        record.type = type;
        record.point.id.oversee = { type, item };
        applyStyle(record.point, style);
        this.Cesium.Cartesian3.fromDegrees(
          Number(position.lng),
          Number(position.lat),
          Number(position.height || 0),
          this.Cesium.Ellipsoid.WGS84,
          record.scratch,
        );
        record.point.position = record.scratch;
      }
    }

    for (const [id, record] of this.records) {
      if (seen.has(id)) continue;
      this.collection.remove(record.point);
      this.records.delete(id);
    }
  }

  updateDynamic(now = Date.now()) {
    if (!this.resolvePosition) return;
    for (const record of this.records.values()) {
      const position = this.resolvePosition(record.item, now);
      if (!validPosition(position)) continue;
      this.Cesium.Cartesian3.fromDegrees(
        Number(position.lng),
        Number(position.lat),
        Number(position.height || 0),
        this.Cesium.Ellipsoid.WGS84,
        record.scratch,
      );
      record.point.position = record.scratch;
    }
  }

  set show(value) {
    this.collection.show = Boolean(value);
  }

  get size() {
    return this.records.size;
  }

  destroy() {
    this.records.clear();
    if (this.collection && this.viewer && !this.viewer.isDestroyed?.()) {
      this.viewer.scene.primitives.remove(this.collection);
    }
    this.collection = null;
  }
}

export function planPointSync(existingIds, nextItems) {
  const existing = new Set(existingIds || []);
  const next = new Set((nextItems || []).map((item) => String(item?.id || "")).filter(Boolean));
  return {
    add: [...next].filter((id) => !existing.has(id)),
    keep: [...next].filter((id) => existing.has(id)),
    remove: [...existing].filter((id) => !next.has(id)),
  };
}

function validPosition(position) {
  return Number.isFinite(Number(position?.lat)) && Number.isFinite(Number(position?.lng));
}

function applyStyle(point, style) {
  point.pixelSize = style.pixelSize;
  point.color = style.color;
  point.outlineColor = style.outlineColor;
  point.outlineWidth = style.outlineWidth;
  point.scaleByDistance = style.scaleByDistance;
  point.translucencyByDistance = style.translucencyByDistance;
  point.disableDepthTestDistance = style.disableDepthTestDistance || 0;
}
