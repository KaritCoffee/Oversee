import { buildRoadPath, positionAlongRoad, stableUnit, trafficModelForRoad } from "../core/traffic-model.js";

const ROAD_RANK = {
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

export class CesiumRoadTrafficLayer {
  constructor({ viewer, Cesium, maxRoads = 220, maxParticles = 150 }) {
    this.viewer = viewer;
    this.Cesium = Cesium;
    this.maxRoads = maxRoads;
    this.maxParticles = maxParticles;
    this.source = new Cesium.CustomDataSource("oversee-road-traffic");
    this.points = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    this.particles = [];
    this.lastUpdateAt = 0;
    this.visible = false;
    this.creditVisible = false;
    this.credit = new Cesium.Credit('<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>');
    viewer.dataSources.add(this.source);
    this.setVisible(false);
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    this.source.show = this.visible;
    this.points.show = this.visible;
    const creditDisplay = this.viewer.creditDisplay || this.viewer.scene?.frameState?.creditDisplay;
    if (this.visible && !this.creditVisible) {
      creditDisplay?.addStaticCredit?.(this.credit);
      this.creditVisible = true;
    } else if (!this.visible && this.creditVisible) {
      creditDisplay?.removeStaticCredit?.(this.credit);
      this.creditVisible = false;
    }
    this.viewer.scene.requestRender();
  }

  clear() {
    this.source.entities.removeAll();
    this.points.removeAll();
    this.particles = [];
    this.viewer.scene.requestRender();
  }

  setRoads(roads, options = {}) {
    this.clear();
    const mode = options.mode === "live" ? "live" : "modeled";
    const selected = rankRoads(roads).slice(0, this.maxRoads);
    const now = Date.now();
    for (const road of selected) {
      const path = buildRoadPath(road.coordinates);
      if (path.points.length < 2 || path.lengthKm < 0.04) continue;
      const model = trafficModelForRoad(road, now);
      const positions = this.Cesium.Cartesian3.fromDegreesArray(path.points.flatMap((point) => [point.lng, point.lat]));
      const lineColor = mode === "live"
        ? this.Cesium.Color.WHITE.withAlpha(0.18)
        : this.Cesium.Color.fromCssColorString(model.color).withAlpha(0.72);
      this.source.entities.add({
        name: road.name || "Road traffic",
        polyline: {
          positions,
          clampToGround: true,
          width: /^motorway|trunk/.test(road.highway) ? 2.7 : 1.8,
          material: new this.Cesium.PolylineGlowMaterialProperty({
            color: lineColor,
            glowPower: mode === "live" ? 0.08 : 0.16,
            taperPower: 0.72,
          }),
        },
      });

      if (this.particles.length >= this.maxParticles) continue;
      const particleColor = mode === "live"
        ? this.Cesium.Color.fromCssColorString("#e9fbff").withAlpha(0.94)
        : this.Cesium.Color.fromCssColorString(model.color).withAlpha(0.96);
      const point = this.points.add({
        position: this.Cesium.Cartesian3.fromDegrees(path.points[0].lng, path.points[0].lat, 150),
        pixelSize: /^motorway|trunk/.test(road.highway) ? 5.5 : 4.2,
        color: particleColor,
        outlineColor: this.Cesium.Color.BLACK.withAlpha(0.78),
        outlineWidth: 1,
        scaleByDistance: new this.Cesium.NearFarScalar(20000, 1.2, 1800000, 0.46),
        translucencyByDistance: new this.Cesium.NearFarScalar(20000, 1, 2200000, 0.18),
      });
      this.particles.push({
        point,
        path,
        progress: stableUnit(`${road.id}:particle`),
        speedKmh: model.speedKmh,
      });
    }
    this.setVisible(this.visible);
  }

  update(now = performance.now()) {
    if (!this.visible || !this.particles.length || now - this.lastUpdateAt < 80) return;
    const elapsedSeconds = this.lastUpdateAt ? Math.min(0.5, (now - this.lastUpdateAt) / 1000) : 0;
    this.lastUpdateAt = now;
    for (const particle of this.particles) {
      if (elapsedSeconds) {
        const visualDistanceKm = (particle.speedKmh / 3600) * elapsedSeconds * 12;
        particle.progress = (particle.progress + visualDistanceKm / Math.max(0.04, particle.path.lengthKm)) % 1;
      }
      const position = positionAlongRoad(particle.path, particle.progress);
      if (!position) continue;
      particle.point.position = this.Cesium.Cartesian3.fromDegrees(position.lng, position.lat, 150);
    }
    this.viewer.scene.requestRender();
  }
}

function rankRoads(roads) {
  return (Array.isArray(roads) ? roads : [])
    .map((road) => ({ road, path: buildRoadPath(road.coordinates) }))
    .sort((left, right) => (ROAD_RANK[left.road.highway] ?? 99) - (ROAD_RANK[right.road.highway] ?? 99) || right.path.lengthKm - left.path.lengthKm)
    .map((entry) => entry.road);
}
