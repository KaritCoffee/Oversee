const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const vm = require("node:vm");

const ROOT = __dirname;
const REQUESTED_PORT = Number(process.env.PORT || 4173);
const FALLBACK_PORTS = process.env.PORT ? [REQUESTED_PORT] : [4173, 4183, 4193, 4203, 4303];
const DATA = loadBrowserExport(path.join(ROOT, "assets", "data.js"), "OVERSEE_DATA");
const META = loadBrowserExport(path.join(ROOT, "assets", "feed-meta.js"), "OVERSEE_FEED_META");
const FEEDS_BY_ID = new Map(DATA.feeds.map((feed) => [feed.id, feed]));
const SOURCES_BY_ID = new Map(DATA.sources.map((source) => [source.id, source]));

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const SOURCE_URLS = {
  celestrakActive: "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json",
  celestrakVisual: "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json",
  openskyAll: "https://opensky-network.org/api/states/all",
  usgsQuakes: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
  nwsAlerts: "https://api.weather.gov/alerts/active",
  nycTrafficCameras: "https://webcams.nyctmc.org/api/cameras",
  tflJamCams: "https://api.tfl.gov.uk/Place/Type/JamCam",
  nasaGibsWms: "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi",
};

const GIBS_TEXTURES = {
  nasa: {
    layer: "MODIS_Terra_CorrectedReflectance_TrueColor",
    format: "image/jpeg",
    width: 2048,
    height: 1024,
  },
};

const SCOPE_BOUNDS = {
  world: { label: "Global", lamin: -70, lamax: 82, lomin: -180, lomax: 180, limit: 1800, flightLimit: 5000, satelliteLimit: 5000, quakeLimit: 2000 },
  us: { label: "United States", lamin: 18.0, lamax: 72.5, lomin: -170.0, lomax: -52.0, limit: 1400, flightLimit: 2200, satelliteLimit: 2500, quakeLimit: 1500 },
  west: { label: "US West", lamin: 31.0, lamax: 49.8, lomin: -125.6, lomax: -102.0, limit: 900, flightLimit: 900, satelliteLimit: 1400, quakeLimit: 900 },
  oregon: { label: "Oregon", lamin: 41.8, lamax: 46.4, lomin: -124.9, lomax: -116.3, limit: 320, flightLimit: 420, satelliteLimit: 700, quakeLimit: 500 },
};

const CALTRANS_DISTRICTS = Array.from({ length: 12 }, (_, index) => index + 1);
const DYNAMIC_CAMERAS_BY_ID = new Map();
const CELESTRAK_FALLBACK_GROUPS = ["visual", "stations", "starlink", "gps-ops", "gnss", "geo", "weather", "resource"];

const ARCGIS_CAMERA_SOURCES = [
  {
    id: "ireland-tii",
    name: "Ireland TII Traffic Cameras",
    url: "https://services2.arcgis.com/WRtfelnPg3R7bCEW/arcgis/rest/services/TrafficCameras/FeatureServer/0/query",
    country: "Ireland",
    region: "Ireland",
    category: "traffic",
    nameFields: ["Name"],
    imageFields: ["WeatherCAM", "link"],
    refreshSeconds: 300,
    tags: ["ireland", "tii", "traffic", "weather"],
  },
  {
    id: "toronto-rescu",
    name: "Toronto Traffic Cameras",
    url: "https://services7.arcgis.com/mbC97TSabuNgCnce/arcgis/rest/services/TrafficCameras/FeatureServer/0/query",
    country: "Canada",
    region: "Toronto",
    category: "traffic",
    nameFields: ["Main_Road", "Cross_Street"],
    areaFields: ["Group_"],
    imageFields: ["Traffic_Image"],
    refreshSeconds: 120,
    tags: ["toronto", "canada", "traffic"],
  },
  {
    id: "fl511",
    name: "Florida 511 Traffic Cameras",
    url: "https://services.arcgis.com/3wFbqsFPLeKqOlIK/arcgis/rest/services/FL511_Traffic_Cameras/FeatureServer/0/query",
    country: "United States",
    region: "Florida",
    category: "traffic",
    nameFields: ["DESCRIPT"],
    areaFields: ["COUNTY"],
    imageFields: ["IMAGE"],
    refreshSeconds: 180,
    tags: ["florida", "511", "traffic"],
  },
  {
    id: "gdot",
    name: "Georgia DOT Traffic Cameras",
    url: "https://services1.arcgis.com/2iUE8l8JKrP2tygQ/ArcGIS/rest/services/GDOT_Live_Traffic_Cameras/FeatureServer/0/query",
    country: "United States",
    region: "Georgia",
    category: "traffic",
    nameFields: ["location_description", "name"],
    areaFields: ["county", "subdivision"],
    imageFields: ["url"],
    streamFields: ["HLS"],
    refreshSeconds: 120,
    tags: ["georgia", "gdot", "traffic"],
  },
  {
    id: "indiana-trafficwise",
    name: "KYTC / Indiana TrafficWise Cameras",
    url: "https://services2.arcgis.com/CcI36Pduqd0OR4W9/arcgis/rest/services/trafficCamerasCur_Prd/FeatureServer/0/query",
    country: "United States",
    region: "Kentucky / Indiana",
    category: "traffic",
    nameFields: ["description", "name"],
    areaFields: ["county", "district"],
    imageFields: ["snapshot"],
    refreshSeconds: 180,
    tags: ["kentucky", "indiana", "trafficwise", "kytc", "traffic"],
  },
  {
    id: "iowa-dot",
    name: "Iowa DOT Traffic Cameras",
    url: "https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/Traffic_Cameras_View/FeatureServer/0/query",
    country: "United States",
    region: "Iowa",
    category: "traffic",
    nameFields: ["Desc_", "ImageName"],
    areaFields: ["REGION", "Route"],
    imageFields: ["ImageURL"],
    streamFields: ["VideoURL", "VideoURL_HD", "VideoURL_HB"],
    trustHls: true,
    refreshSeconds: 60,
    tags: ["iowa", "iowa-dot", "traffic", "hls"],
  },
  {
    id: "redmond-wa",
    name: "Redmond Traffic Cameras",
    url: "https://gis.redmond.gov/arcgis/rest/services/Traffic/Cameras/MapServer/0/query",
    country: "United States",
    region: "Washington",
    category: "traffic",
    nameFields: ["Description"],
    areaFields: ["d_Jurisdiction"],
    imageFields: ["ImagePath"],
    refreshSeconds: 180,
    tags: ["redmond", "washington", "traffic"],
  },
  {
    id: "lawrence-ks",
    name: "Lawrence Traffic Cameras",
    url: "https://services.arcgis.com/8O9UlSTnqjKptoda/ArcGIS/rest/services/Traffic_Cameras/FeatureServer/4/query",
    country: "United States",
    region: "Kansas",
    category: "traffic",
    nameFields: ["Approach", "FacilityID"],
    areaFields: ["OwnedBy"],
    imageFields: ["Hyperlink"],
    refreshSeconds: 300,
    tags: ["lawrence", "kansas", "traffic"],
  },
];

const KNOWN_LIVE_PLAYER_VIEWS = {
  "osu-memorial-union": {
    type: "iframe",
    url: "https://camstreamer.com/embed/3437433269aa0f7/S-61681?rel=0",
    sourceLabel: "CamStreamer live player",
    sourcePageUrl: "https://camstreamer.com/live/stream/167275607-oregon-state-university-memorial-union",
    capability: "player",
  },
  "osu-library-quad": {
    type: "iframe",
    url: "https://camstreamer.com/embed/erpJktO6XPgNoYqhfEYN53t2lNaW6iCxoNXSbbrJ?rel=0",
    sourceLabel: "CamStreamer live player",
    sourcePageUrl: "https://camstreamer.com/live/stream/376439953-oregon-state-university-valley",
    capability: "player",
  },
  "osu-bend-bruckner": {
    type: "iframe",
    url: "https://camstreamer.com/embed/084zuf2CdXTMyqMAk1QoVQMF6yLp8qUsUCTG8sLt?rel=0",
    sourceLabel: "CamStreamer live player",
    sourcePageUrl: "https://camstreamer.com/live/stream/43269-oregon-state-university-cascades",
    capability: "player",
  },
  "osu-yaquina-bay": {
    type: "iframe",
    url: "https://camstreamer.com/embed/w0ll7Jk2OKKasd25kSl9XnTtVKtkhU2WonTn82Sq?rel=0",
    sourceLabel: "CamStreamer live player",
    sourcePageUrl: "https://camstreamer.com/live/stream/113409317-oregon-state-university-newport",
    capability: "player",
  },
  "osu-monroe": {
    type: "iframe",
    url: "https://www.youtube-nocookie.com/embed/Z5skON2yzcI?autoplay=1&mute=1&playsinline=1&rel=0",
    sourceLabel: "YouTube live player",
    sourcePageUrl: "https://www.youtube.com/watch?v=Z5skON2yzcI",
    capability: "player",
  },
};

const FALLBACK_STILL_URLS = {
  "osu-memorial-union": "https://webcam.oregonstate.edu/cam/mu/live/live.jpg",
  "osu-monroe": "https://webcam.oregonstate.edu/cam/monroe/live/live.jpg",
  "osu-library-quad": "https://webcam.oregonstate.edu/cam/libraryquad/live/live.jpg",
  "osu-bend-bruckner": "https://webcam.oregonstate.edu/cam/cascades3/live/live.jpg",
  "osu-bend-innovation": "https://webcam.oregonstate.edu/cam/cascades1/live/live.jpg",
  "osu-yaquina-bay": "https://webcam.oregonstate.edu/cam/yaquinabay/live/live.jpg",
  "osu-ship-ops": "https://webcam.oregonstate.edu/cam/ships/live/live.jpg",
};

const cache = new Map();
let serverPort = REQUESTED_PORT;

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    if (requestUrl.pathname === "/api/health") {
      return sendJson(response, 200, { ok: true, port: serverPort, generatedAt: new Date().toISOString() });
    }

    if (requestUrl.pathname === "/api/cameras") {
      const scope = normalizeScope(requestUrl.searchParams.get("scope"));
      const cameraSet = await buildCameraSet(scope);
      return sendJson(response, 200, { generatedAt: new Date().toISOString(), scope, cameras: cameraSet.data, sourceHealth: cameraSet.health });
    }

    if (requestUrl.pathname === "/api/intel-snapshot") {
      const scope = normalizeScope(requestUrl.searchParams.get("scope"));
      const data = await buildIntelSnapshot(scope);
      return sendJson(response, 200, data);
    }

    if (requestUrl.pathname === "/api/feed-view") {
      const feedId = requestUrl.searchParams.get("id");
      if (!feedId) return sendJson(response, 400, { error: "Missing feed id" });
      return sendJson(response, 200, await resolveFeedView(feedId));
    }

    if (requestUrl.pathname === "/api/globe-texture") {
      return proxyGibsTexture(requestUrl, response);
    }

    if (requestUrl.pathname === "/api/image-proxy") {
      return proxyImage(requestUrl.searchParams.get("url"), response);
    }

    return serveStatic(requestUrl.pathname, response);
  } catch (error) {
    return sendJson(response, 500, { error: "Internal server error", message: error.message });
  }
});

listenOnPreferredPort(0);

async function buildIntelSnapshot(scope) {
  const bounds = SCOPE_BOUNDS[scope];
  const [cameraSet, satelliteResult, flightResult, quakeResult, alertResult] = await Promise.all([
    buildCameraSet(scope),
    getCached("satellites", 10 * 60 * 1000, () => fetchSatellites(scope)),
    getCached(`flights:${scope}`, 45 * 1000, () => fetchFlights(scope)),
    getCached("quakes", 60 * 1000, () => fetchQuakes()),
    getCached(`alerts:${scope}`, 90 * 1000, () => fetchAlerts(scope)),
  ]);

  const cameras = cameraSet.data;
  const satellites = filterGeoItems(satelliteResult.data, bounds).slice(0, bounds.satelliteLimit || bounds.limit);
  const flights = filterGeoItems(flightResult.data, bounds).slice(0, bounds.flightLimit || bounds.limit);
  const quakes = filterGeoItems(quakeResult.data, bounds).slice(0, bounds.quakeLimit || bounds.limit);
  const alerts = filterGeoItems(alertResult.data, bounds).slice(0, 80);
  const events = buildEvents({ cameras, satellites, flights, quakes, alerts });
  const regions = buildRegions({ cameras, satellites, flights, quakes, alerts });
  const severity = buildSeverity({ alerts, quakes });
  const sourceHealth = [
    ...cameraSet.health,
    healthFromResult("CelesTrak GP", satelliteResult, satellites.length),
    healthFromResult("OpenSky states", flightResult, flights.length),
    healthFromResult("USGS quakes", quakeResult, quakes.length),
    healthFromResult("NWS alerts", alertResult, alerts.length),
  ];
  const videoFeeds = cameras.filter((camera) => camera.capability === "player" || camera.capability === "stream").length;

  return {
    generatedAt: new Date().toISOString(),
    scope,
    cameraCatalogTotal: cameras.length,
    cameras,
    satellites,
    flights,
    quakes,
    alerts,
    traffic: [],
    events,
    regions,
    severity,
    sourceHealth,
    metrics: {
      eventsToday: cameras.length + satellites.length + flights.length + quakes.length + alerts.length,
      alerts: alerts.length,
      assets: cameras.length + satellites.length + flights.length,
      cameraFeeds: cameras.length,
      videoFeeds,
      streams: sourceHealth.filter((source) => source.ok).length,
    },
  };
}

async function buildCameraSet(scope = "world") {
  const bounds = SCOPE_BOUNDS[scope] || SCOPE_BOUNDS.world;
  const localCameras = await buildLocalCameras();
  const adapterSpecs = cameraAdapterSpecs(scope);
  const adapterResults = await Promise.all(
    adapterSpecs.map((adapter) => getCached(adapter.key, adapter.ttlMs, adapter.fetcher))
  );
  const externalCameras = adapterResults.flatMap((result) => result.data || []);
  const sourceHealth = [
    { name: "Local public camera catalog", ok: true, count: filterGeoItems(localCameras, bounds).length, source: "local" },
    ...adapterSpecs.map((adapter, index) => healthFromResult(adapter.name, adapterResults[index], filterGeoItems(adapterResults[index].data || [], bounds).length)),
  ];

  const cameras = [...localCameras, ...externalCameras]
    .filter((camera) => Number.isFinite(camera.lat) && Number.isFinite(camera.lng))
    .filter((camera) => !bounds || bounds === SCOPE_BOUNDS.world || inBounds(camera, bounds))
    .sort(compareCameras);

  rememberDynamicCameras(cameras);
  return { data: cameras, health: sourceHealth };
}

async function buildLocalCameras() {
  const cameras = await Promise.all(
    DATA.feeds.map(async (feed) => {
      const meta = META[feed.id] || {};
      const source = SOURCES_BY_ID.get(feed.sourceId) || {};
      const viewer = await resolveCatalogViewer(feed, meta);
      return {
        id: feed.id,
        type: "camera",
        name: feed.name,
        shortName: shortCameraName(feed.name),
        area: feed.area,
        region: feed.region,
        county: feed.county,
        category: feed.category,
        media: feed.media,
        status: feed.status,
        freshness: feed.freshness,
        tags: feed.tags || [],
        sourceId: feed.sourceId,
        sourceName: source.name || feed.sourceId,
        sourceUrl: source.url || feed.url,
        officialUrl: feed.url,
        sourcePageUrl: viewer.sourcePageUrl || source.url || feed.url,
        lat: Number(meta.lat),
        lng: Number(meta.lng),
        viewerType: viewer.type,
        capability: viewer.capability,
        capabilityLabel: capabilityLabel(viewer.capability),
        previewUrl: viewer.previewUrl || "",
        imageUrl: viewer.imageUrl || "",
      };
    })
  );
  return cameras.filter((camera) => Number.isFinite(camera.lat) && Number.isFinite(camera.lng));
}

function cameraAdapterSpecs(scope) {
  const adapters = [];
  if (scope === "world" || scope === "us") {
    adapters.push({
      key: "cameras:nyc-traffic",
      name: "NYC traffic cameras",
      ttlMs: 2 * 60 * 1000,
      fetcher: fetchNycTrafficCameras,
    });
  }
  if (scope === "world") {
    adapters.push({
      key: "cameras:tfl-jamcams",
      name: "Transport for London JamCams",
      ttlMs: 2 * 60 * 1000,
      fetcher: fetchTflJamCams,
    });
  }
  if (scope === "world" || scope === "us" || scope === "west") {
    adapters.push({
      key: "cameras:caltrans",
      name: "Caltrans CCTV",
      ttlMs: 5 * 60 * 1000,
      fetcher: fetchCaltransCameras,
    });
  }
  for (const source of ARCGIS_CAMERA_SOURCES) {
    if (scope === "world" || (scope === "us" && source.country === "United States") || scope === "west") {
      adapters.push({
        key: `cameras:arcgis:${source.id}`,
        name: source.name,
        ttlMs: 5 * 60 * 1000,
        fetcher: () => fetchArcgisCameras(source),
      });
    }
  }
  return adapters;
}

function rememberDynamicCameras(cameras) {
  for (const camera of cameras) {
    if (camera.dynamic) DYNAMIC_CAMERAS_BY_ID.set(camera.id, camera);
  }
}

function compareCameras(left, right) {
  const rank = (camera) => {
    if (camera.capability === "stream") return 0;
    if (camera.capability === "player") return 1;
    if (camera.viewerType === "image") return 2;
    return 3;
  };
  return rank(left) - rank(right) || String(left.sourceName || "").localeCompare(String(right.sourceName || "")) || String(left.name || "").localeCompare(String(right.name || ""));
}

async function fetchNycTrafficCameras() {
  const records = await fetchJson(SOURCE_URLS.nycTrafficCameras, { timeoutMs: 12000 });
  return (Array.isArray(records) ? records : [])
    .map((record) => {
      const lat = Number(record.latitude);
      const lng = Number(record.longitude);
      const online = String(record.isOnline).toLowerCase() === "true";
      if (!online || !Number.isFinite(lat) || !Number.isFinite(lng) || !record.imageUrl) return null;
      const name = String(record.name || "NYC traffic camera").replace(/\s+/g, " ").trim();
      const area = String(record.area || "New York City").replace(/\s+/g, " ").trim();
      return {
        id: `nyc-${record.id}`,
        dynamic: true,
        type: "camera",
        name,
        shortName: shortCameraName(name || "NYC traffic"),
        area,
        region: "New York Metro",
        county: area,
        country: "United States",
        category: "traffic",
        media: "still",
        status: "Online",
        freshness: 1,
        tags: ["nyc", "new-york", "traffic", "dot", area],
        sourceId: "nyc-tmc",
        sourceName: "NYC DOT Traffic Cameras",
        sourceUrl: SOURCE_URLS.nycTrafficCameras,
        officialUrl: "https://webcams.nyctmc.org/",
        sourcePageUrl: "https://webcams.nyctmc.org/",
        lat,
        lng,
        viewerType: "image",
        capability: "snapshot",
        capabilityLabel: "Current Still",
        previewUrl: record.imageUrl,
        imageUrl: record.imageUrl,
        refreshSeconds: 60,
      };
    })
    .filter(Boolean);
}

async function fetchTflJamCams() {
  const records = await fetchJson(SOURCE_URLS.tflJamCams, { timeoutMs: 14000 });
  return (Array.isArray(records) ? records : [])
    .map((record) => {
      const lat = Number(record.lat);
      const lng = Number(record.lon);
      const props = Object.fromEntries(
        (record.additionalProperties || []).map((entry) => [entry.key, entry.value])
      );
      const available = String(props.available || "true").toLowerCase() !== "false";
      const imageUrl = normalizeUrl(props.imageUrl);
      const videoUrl = normalizeUrl(props.videoUrl);
      if (!available || !Number.isFinite(lat) || !Number.isFinite(lng) || (!imageUrl && !videoUrl)) return null;
      const name = cleanCameraText(record.commonName || props.view || "TfL JamCam");
      const view = cleanCameraText(props.view || "");
      return {
        id: `tfl-${slugify(record.id || name)}`,
        dynamic: true,
        type: "camera",
        name: view ? `${name} (${view})` : name,
        shortName: shortCameraName(name),
        area: "London",
        region: "London",
        county: "Greater London",
        country: "United Kingdom",
        category: "traffic",
        media: videoUrl ? "video" : "still",
        status: "Online",
        freshness: 1,
        tags: ["london", "uk", "tfl", "jamcam", "traffic", view].filter(Boolean),
        sourceId: "tfl-jamcams",
        sourceName: "Transport for London JamCams",
        sourceUrl: SOURCE_URLS.tflJamCams,
        officialUrl: "https://tfl.gov.uk/traffic/status/",
        sourcePageUrl: "https://tfl.gov.uk/traffic/status/",
        lat,
        lng,
        viewerType: videoUrl ? "video" : "image",
        capability: videoUrl ? "stream" : "snapshot",
        capabilityLabel: videoUrl ? "Video Clip" : "Current Still",
        previewUrl: imageUrl,
        imageUrl,
        streamUrl: videoUrl,
        refreshSeconds: 60,
      };
    })
    .filter(Boolean);
}

async function fetchCaltransCameras() {
  const results = await Promise.allSettled(
    CALTRANS_DISTRICTS.map((district) => fetchJson(caltransDistrictUrl(district), { timeoutMs: 14000 }))
  );

  return results.flatMap((result, index) => {
    if (result.status !== "fulfilled") return [];
    const district = CALTRANS_DISTRICTS[index];
    return (result.value.data || [])
      .map((entry) => mapCaltransCamera(entry?.cctv || entry, district))
      .filter(Boolean);
  });
}

function mapCaltransCamera(cctv, district) {
  const location = cctv?.location || {};
  const imageData = cctv?.imageData || {};
  const staticData = imageData.static || {};
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  const imageUrl = staticData.currentImageURL || "";
  const streamUrl = imageData.streamingVideoURL || "";
  const inService = String(cctv?.inService).toLowerCase() !== "false";
  if (!inService || !Number.isFinite(lat) || !Number.isFinite(lng) || (!imageUrl && !streamUrl)) return null;

  const nearbyPlace = location.nearbyPlace || location.county || "California";
  const route = [location.route, location.direction].filter(Boolean).join(" ");
  const rawName = cleanCaltransName(location.locationName || cctv.index || route || "Caltrans CCTV");
  const freshness = Number(staticData.currentImageUpdateFrequency || 0) || 5;

  return {
    id: `caltrans-d${district}-${slugify(rawName || imageUrl)}-${cctv.index || "cam"}`,
    dynamic: true,
    type: "camera",
    name: rawName,
    shortName: shortCameraName(rawName),
    area: nearbyPlace,
    region: `California District ${district}`,
    county: location.county || nearbyPlace,
    country: "United States",
    category: "traffic",
    media: streamUrl ? "video-candidate" : "still",
    status: "Online",
    freshness,
    tags: ["caltrans", "california", "traffic", "dot", route, nearbyPlace, location.county].filter(Boolean),
    sourceId: "caltrans-cctv",
    sourceName: "Caltrans CCTV",
    sourceUrl: caltransDistrictUrl(district),
    officialUrl: "https://quickmap.dot.ca.gov/",
    sourcePageUrl: "https://quickmap.dot.ca.gov/",
    lat,
    lng,
    viewerType: streamUrl ? "hls" : "image",
    capability: streamUrl ? "candidate" : "snapshot",
    capabilityLabel: streamUrl ? "Video Candidate" : "Current Still",
    previewUrl: imageUrl,
    imageUrl,
    streamUrl,
    refreshSeconds: Math.max(30, freshness * 60),
  };
}

function caltransDistrictUrl(district) {
  return `https://cwwp2.dot.ca.gov/data/d${district}/cctv/cctvStatusD${String(district).padStart(2, "0")}.json`;
}

async function fetchArcgisCameras(source) {
  const url = new URL(source.url);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", "*");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("f", "json");
  const data = await fetchJson(url.href, { timeoutMs: 18000 });
  return (data.features || [])
    .map((feature) => mapArcgisCamera(feature, source))
    .filter(Boolean);
}

function mapArcgisCamera(feature, source) {
  const attributes = feature?.attributes || {};
  const lat = Number(attributes.LATITUDE ?? attributes.Latitude ?? attributes.latitude ?? feature?.geometry?.y);
  const lng = Number(attributes.LONGITUDE ?? attributes.Longitude ?? attributes.longitude ?? feature?.geometry?.x);
  const imageUrl = normalizeUrl(firstFieldValue(attributes, source.imageFields));
  const streamUrl = source.trustHls ? normalizeUrl(firstFieldValue(attributes, source.streamFields)) : "";
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (!imageUrl && !streamUrl)) return null;

  const objectId =
    attributes.OBJECTID ??
    attributes.ObjectId ??
    attributes.OBJECTID_1 ??
    attributes.FID ??
    attributes.OID ??
    attributes.oid ??
    attributes.device_id ??
    attributes.CameraViewId ??
    attributes.id ??
    attributes.ID ??
    slugify(`${imageUrl}|${streamUrl}|${lat}|${lng}`);
  const nameParts = (source.nameFields || []).map((field) => cleanCameraText(attributes[field])).filter(Boolean);
  const areaParts = (source.areaFields || []).map((field) => cleanCameraText(attributes[field])).filter(Boolean);
  const name = nameParts.length ? dedupeParts(nameParts).join(" @ ") : `${source.name} ${objectId}`;
  const area = areaParts[0] || source.region || source.country || "Public camera";

  return {
    id: `arcgis-${source.id}-${slugify(objectId)}`,
    dynamic: true,
    type: "camera",
    name,
    shortName: shortCameraName(name),
    area,
    region: source.region,
    county: area,
    country: source.country,
    category: source.category || "traffic",
    media: streamUrl ? "video" : "still",
    status: "Online",
    freshness: Math.round((source.refreshSeconds || 180) / 60),
    tags: [...(source.tags || []), area, source.region, source.country].filter(Boolean),
    sourceId: `arcgis-${source.id}`,
    sourceName: source.name,
    sourceUrl: source.url,
    officialUrl: source.officialUrl || source.url,
    sourcePageUrl: source.sourcePageUrl || source.officialUrl || source.url,
    lat,
    lng,
    viewerType: streamUrl ? "hls" : "image",
    capability: streamUrl ? "stream" : "snapshot",
    capabilityLabel: streamUrl ? "Live Stream" : "Current Still",
    previewUrl: imageUrl,
    imageUrl,
    streamUrl,
    refreshSeconds: source.refreshSeconds || 180,
  };
}

function firstFieldValue(attributes, fields = []) {
  for (const field of fields || []) {
    const value = attributes[field];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return "";
}

function normalizeUrl(value) {
  const text = cleanCameraText(value);
  if (!/^https?:\/\//i.test(text)) return "";
  return text;
}

function cleanCameraText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeParts(parts) {
  const seen = new Set();
  return parts.filter((part) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanCaltransName(value) {
  return String(value || "Caltrans CCTV")
    .replace(/^\s*TV[A-Z0-9]*\s*--\s*/i, "")
    .replace(/^\s*\([^)]+\)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveCatalogViewer(feed, meta) {
  if (KNOWN_LIVE_PLAYER_VIEWS[feed.id]) {
    return resolveKnownPlayerView(feed, meta);
  }

  const viewer = meta.viewer || {};
  if (viewer.type === "image") {
    return {
      type: "image",
      url: viewer.url,
      previewUrl: viewer.url,
      imageUrl: viewer.url,
      capability: "snapshot",
      sourcePageUrl: feed.url,
    };
  }

  if (FALLBACK_STILL_URLS[feed.id]) {
    return {
      type: "image",
      url: FALLBACK_STILL_URLS[feed.id],
      previewUrl: FALLBACK_STILL_URLS[feed.id],
      imageUrl: FALLBACK_STILL_URLS[feed.id],
      capability: "snapshot",
      sourcePageUrl: feed.url,
    };
  }

  if (viewer.type === "iframe") {
    return {
      type: "iframe",
      url: viewer.url,
      capability: "page",
      sourcePageUrl: viewer.url,
    };
  }

  return {
    type: "source",
    url: feed.url,
    capability: "source",
    sourcePageUrl: feed.url,
  };
}

async function resolveKnownPlayerView(feed, meta = {}) {
  const known = KNOWN_LIVE_PLAYER_VIEWS[feed.id];
  const stillUrl = FALLBACK_STILL_URLS[feed.id] || (meta.viewer?.type === "image" ? meta.viewer.url : "");
  const status = await verifyKnownEmbedPlayer(known);
  if (status.ok) {
    return {
      ...known,
      previewUrl: stillUrl,
      imageUrl: stillUrl,
      capability: "player",
    };
  }

  if (stillUrl) {
    return {
      type: "image",
      url: stillUrl,
      previewUrl: stillUrl,
      imageUrl: stillUrl,
      capability: "snapshot",
      sourcePageUrl: known.sourcePageUrl || feed.url,
      sourceLabel: "Current still fallback",
      offlineReason: status.message,
    };
  }

  return {
    ...known,
    previewUrl: "",
    imageUrl: "",
    capability: "candidate",
    offlineReason: status.message,
  };
}

async function verifyKnownEmbedPlayer(view) {
  if (!view || view.type !== "iframe" || !/camstreamer\.com/i.test(view.url || "")) {
    return { ok: true };
  }

  const result = await getCached(`embed:${view.url}`, 2 * 60 * 1000, async () => {
    const response = await fetch(view.url, {
      headers: {
        "User-Agent": "Oversee/0.3 (+local public intelligence dashboard)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`embed returned ${response.status}`);
    const text = await response.text();
    if (/<title>\s*Stream isn[’']t live now\.?\s*<\/title>/i.test(text) || /Stream isn[’']t live now\./i.test(text.slice(0, 2000))) {
      throw new Error("embedded player reports stream is not live");
    }
    return { available: true };
  });

  return result.ok ? { ok: true } : { ok: false, message: result.message || "embedded player unavailable" };
}

async function resolveFeedView(feedId) {
  const dynamicCamera = DYNAMIC_CAMERAS_BY_ID.get(feedId) || dynamicCameraFromId(feedId);
  if (dynamicCamera) return resolveDynamicFeedView(dynamicCamera);

  const feed = FEEDS_BY_ID.get(feedId);
  if (!feed) {
    return {
      type: "unavailable",
      sourceLabel: "Unknown feed",
      note: "The requested feed id is not in the camera catalog.",
    };
  }

  if (KNOWN_LIVE_PLAYER_VIEWS[feedId]) {
    const knownView = await resolveKnownPlayerView(feed, META[feedId] || {});
    if (knownView.type === "image") {
      return {
        feedId,
        generatedAt: new Date().toISOString(),
        type: "image",
        url: knownView.imageUrl || knownView.url,
        sourceLabel: "Embedded player offline; current still fallback",
        sourcePageUrl: knownView.sourcePageUrl || feed.url,
        capability: "snapshot",
        streamStatus: "down",
        note: `The embedded public player reports it is not live right now. Showing the refreshed still image instead.`,
      };
    }
    return {
      feedId,
      generatedAt: new Date().toISOString(),
      officialUrl: feed.url,
      note: "Known public live player mapping.",
      ...knownView,
    };
  }

  const metaViewer = META[feedId]?.viewer;
  if (metaViewer?.type === "image") {
    return {
      feedId,
      generatedAt: new Date().toISOString(),
      type: "image",
      url: metaViewer.url,
      sourceLabel: "Mapped public current image",
      sourcePageUrl: feed.url,
      capability: "snapshot",
      note: "This public source exposes a refreshed image rather than true video.",
    };
  }

  if (FALLBACK_STILL_URLS[feedId]) {
    return {
      feedId,
      generatedAt: new Date().toISOString(),
      type: "image",
      url: FALLBACK_STILL_URLS[feedId],
      sourceLabel: "Mapped public still image",
      sourcePageUrl: feed.url,
      capability: "snapshot",
      note: "This camera currently resolves to a public still image endpoint.",
    };
  }

  if (metaViewer?.type === "iframe") {
    return {
      feedId,
      generatedAt: new Date().toISOString(),
      type: "iframe",
      url: metaViewer.url,
      sourceLabel: "Official public source page",
      sourcePageUrl: metaViewer.url,
      capability: "page",
      note: "This source is available as a public page, not a direct extracted stream yet.",
    };
  }

  return {
    feedId,
    generatedAt: new Date().toISOString(),
    type: "iframe",
    url: feed.url,
    sourceLabel: "Official public source page",
    sourcePageUrl: feed.url,
    capability: "source",
    note: "No direct dashboard player has been verified for this feed yet.",
  };
}

function dynamicCameraFromId(feedId) {
  if (String(feedId || "").startsWith("nyc-")) {
    const cameraId = feedId.slice(4);
    if (/^[0-9a-f-]{32,}$/i.test(cameraId)) {
      const imageUrl = `https://webcams.nyctmc.org/api/cameras/${cameraId}/image`;
      return {
        id: feedId,
        dynamic: true,
        name: "NYC traffic camera",
        sourceName: "NYC DOT Traffic Cameras",
        sourcePageUrl: "https://webcams.nyctmc.org/",
        officialUrl: "https://webcams.nyctmc.org/",
        viewerType: "image",
        capability: "snapshot",
        capabilityLabel: "Current Still",
        imageUrl,
        previewUrl: imageUrl,
        refreshSeconds: 60,
      };
    }
  }
  return null;
}

async function resolveDynamicFeedView(camera) {
  const base = {
    feedId: camera.id,
    generatedAt: new Date().toISOString(),
    officialUrl: camera.officialUrl || camera.sourcePageUrl || camera.sourceUrl,
    sourcePageUrl: camera.sourcePageUrl || camera.officialUrl || camera.sourceUrl,
    capability: camera.capability || "snapshot",
    refreshSeconds: camera.refreshSeconds || 60,
  };

  if (camera.viewerType === "video" && camera.streamUrl) {
    return {
      ...base,
      type: "video",
      url: camera.streamUrl,
      sourceLabel: `${camera.sourceName || "Public source"} public video feed`,
      capability: "stream",
      note: "This source exposes a direct public video asset, so the dashboard can play it in-pane.",
    };
  }

  if (camera.viewerType === "hls" && camera.streamUrl) {
    const hlsResult = await verifyHlsPlaylist(camera.streamUrl);
    if (hlsResult.ok) {
      return {
        ...base,
        type: "hls",
        url: camera.streamUrl,
        sourceLabel: `${camera.sourceName || "Public source"} live HLS stream`,
        capability: "player",
        note: "This source exposes a direct HLS playlist, so the dashboard can play it in-pane.",
      };
    }

    if (camera.imageUrl) {
      return {
        ...base,
        type: "image",
        url: camera.imageUrl,
        sourceLabel: `${camera.sourceName || "Public source"} current image fallback`,
        capability: "snapshot",
        streamStatus: "down",
        note: `The source advertises a video stream, but it did not validate right now (${hlsResult.message || "unavailable"}). Showing the refreshed public image instead.`,
      };
    }
  }

  if (camera.imageUrl || camera.previewUrl) {
    return {
      ...base,
      type: "image",
      url: camera.imageUrl || camera.previewUrl,
      sourceLabel: `${camera.sourceName || "Public source"} current image`,
      capability: "snapshot",
      note: "This public source exposes a refreshed image feed rather than a browser-playable video stream.",
    };
  }

  return {
    ...base,
    type: "iframe",
    url: camera.sourcePageUrl || camera.officialUrl || camera.sourceUrl,
    sourceLabel: camera.sourceName || "Official public source page",
    capability: "source",
    note: "No direct dashboard media endpoint has been verified for this camera.",
  };
}

async function verifyHlsPlaylist(url) {
  const result = await getCached(`hls:${url}`, 5 * 60 * 1000, async () => {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Oversee/0.3 (+local public intelligence dashboard)",
        Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, text/plain;q=0.9, */*;q=0.8",
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error(`stream returned ${response.status}`);
    const text = await response.text();
    if (!/^#EXTM3U/m.test(text)) throw new Error("response is not an HLS playlist");
    return { ok: true };
  });

  return result.ok ? { ok: true } : { ok: false, message: result.message || "stream unavailable" };
}

async function fetchSatellites(scope) {
  let records;
  try {
    records = await fetchJson(SOURCE_URLS.celestrakActive, { timeoutMs: 12000 });
  } catch {
    records = await fetchCelesTrakFallbackGroups();
  }

  const now = Date.now();
  const maxSource = scope === "world" ? 5000 : scope === "us" ? 3200 : 1800;
  return deterministicSample(records || [], maxSource, "NORAD_CAT_ID")
    .map((record) => deriveSatellite(record, now))
    .filter(Boolean);
}

async function fetchCelesTrakFallbackGroups() {
  const results = await Promise.allSettled(
    CELESTRAK_FALLBACK_GROUPS.map((group) =>
      fetchJson(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=json`, { timeoutMs: 12000 })
    )
  );
  const byNorad = new Map();
  for (const result of results) {
    if (result.status !== "fulfilled" || !Array.isArray(result.value)) continue;
    for (const record of result.value) {
      const key = String(record.NORAD_CAT_ID || record.OBJECT_ID || record.OBJECT_NAME || "");
      if (key && !byNorad.has(key)) byNorad.set(key, record);
    }
  }
  if (!byNorad.size) return fetchJson(SOURCE_URLS.celestrakVisual, { timeoutMs: 9000 });
  return [...byNorad.values()];
}

function deriveSatellite(record, now) {
  const noradId = String(record.NORAD_CAT_ID || record.OBJECT_ID || record.OBJECT_NAME || "");
  const meanMotion = Number(record.MEAN_MOTION) || 14.2;
  const inclination = Number(record.INCLINATION) || 0;
  const raan = Number(record.RA_OF_ASC_NODE) || 0;
  const argPerigee = Number(record.ARG_OF_PERICENTER) || 0;
  const meanAnomaly = Number(record.MEAN_ANOMALY) || 0;
  const epochMs = Date.parse(record.EPOCH || "") || now;
  const elapsedMinutes = (now - epochMs) / 60000;
  const periodMinutes = 1440 / meanMotion;
  const angle = radians(meanAnomaly + (elapsedMinutes / periodMinutes) * 360);
  const point = orbitalPoint(angle, radians(inclination), radians(raan), radians(argPerigee), now);
  const altitudeKm = altitudeFromMeanMotion(meanMotion);
  const orbit = [];

  for (let step = 0; step < 32; step += 1) {
    const orbitAngle = angle + (step / 31) * Math.PI * 2;
    orbit.push(orbitalPoint(orbitAngle, radians(inclination), radians(raan), radians(argPerigee), now));
  }

  const objectType = classifySatellite(record, altitudeKm);
  return {
    id: `sat-${noradId}`,
    noradId,
    type: "satellite",
    name: record.OBJECT_NAME || `NORAD ${noradId}`,
    objectType,
    lat: point.lat,
    lng: point.lng,
    altitudeKm,
    inclination,
    periodMinutes,
    source: "CelesTrak GP",
    displayColor: satelliteColor(objectType),
    orbit,
  };
}

function orbitalPoint(angle, inclination, raan, argPerigee, now) {
  const u = angle + argPerigee;
  const xOrb = Math.cos(u);
  const yOrb = Math.sin(u);
  const x1 = xOrb * Math.cos(raan) - yOrb * Math.cos(inclination) * Math.sin(raan);
  const y1 = xOrb * Math.sin(raan) + yOrb * Math.cos(inclination) * Math.cos(raan);
  const z1 = yOrb * Math.sin(inclination);
  const earthRotation = ((now / 1000) % 86164) / 86164 * Math.PI * 2;
  const x = x1 * Math.cos(earthRotation) + y1 * Math.sin(earthRotation);
  const y = -x1 * Math.sin(earthRotation) + y1 * Math.cos(earthRotation);
  const z = z1;
  return {
    lat: degrees(Math.asin(z)),
    lng: normalizeLng(degrees(Math.atan2(y, x))),
  };
}

function altitudeFromMeanMotion(meanMotion) {
  const mu = 398600.4418;
  const earthRadiusKm = 6378.137;
  const n = (meanMotion * Math.PI * 2) / 86400;
  const semiMajorAxis = Math.cbrt(mu / (n * n));
  return Math.max(160, semiMajorAxis - earthRadiusKm);
}

function classifySatellite(record, altitudeKm) {
  const name = String(record.OBJECT_NAME || "").toLowerCase();
  if (name.includes("starlink")) return "Starlink";
  if (name.includes("gps") || name.includes("glonass") || name.includes("galileo") || name.includes("beidou")) return "Navigation";
  if (altitudeKm > 30000) return "GEO";
  if (altitudeKm > 2000) return "MEO";
  return "LEO";
}

function satelliteColor(objectType) {
  return {
    Starlink: "#8bd8ff",
    Navigation: "#23f7b5",
    GEO: "#ffcc4d",
    MEO: "#c678ff",
    LEO: "#b85cff",
  }[objectType] || "#b85cff";
}

async function fetchFlights(scope) {
  const bounds = SCOPE_BOUNDS[scope] || SCOPE_BOUNDS.world;
  const url = new URL(SOURCE_URLS.openskyAll);
  if (scope !== "world") {
    url.searchParams.set("lamin", bounds.lamin);
    url.searchParams.set("lamax", bounds.lamax);
    url.searchParams.set("lomin", bounds.lomin);
    url.searchParams.set("lomax", bounds.lomax);
  }

  const headers = {};
  if (process.env.OPENSKY_TOKEN) headers.Authorization = `Bearer ${process.env.OPENSKY_TOKEN}`;

  const data = await fetchJson(url.href, { headers, timeoutMs: 10000 });
  const states = Array.isArray(data.states) ? data.states : [];
  const maxStates = scope === "world" ? 5000 : scope === "us" ? 2200 : 900;
  return deterministicSample(states, maxStates, (state) => state[0])
    .map((stateVector) => {
      const lng = Number(stateVector[5]);
      const lat = Number(stateVector[6]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const callsign = String(stateVector[1] || "").trim() || stateVector[0];
      return {
        id: `flight-${stateVector[0]}`,
        type: "flight",
        name: callsign,
        callsign,
        country: stateVector[2] || "Unknown",
        lat,
        lng,
        altitudeMeters: Number(stateVector[13] || stateVector[7] || 0),
        velocity: Number(stateVector[9] || 0),
        heading: Number(stateVector[10] || 0),
        onGround: Boolean(stateVector[8]),
        time: stateVector[4] ? new Date(stateVector[4] * 1000).toISOString() : new Date().toISOString(),
        source: "OpenSky",
      };
    })
    .filter(Boolean);
}

async function fetchQuakes() {
  const data = await fetchJson(SOURCE_URLS.usgsQuakes, { timeoutMs: 10000 });
  return (data.features || [])
    .map((feature) => {
      const [lng, lat, depthKm] = feature.geometry?.coordinates || [];
      const magnitude = Number(feature.properties?.mag || 0);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        id: `quake-${feature.id}`,
        type: "quake",
        name: feature.properties?.title || `M${magnitude} earthquake`,
        title: feature.properties?.title || `M${magnitude} earthquake`,
        lat,
        lng,
        depthKm: Number(depthKm || 0),
        magnitude,
        location: feature.properties?.place || "USGS event",
        severity: quakeSeverity(magnitude),
        displayColor: quakeColor(magnitude),
        time: feature.properties?.time ? new Date(feature.properties.time).toISOString() : new Date().toISOString(),
        source: "USGS",
        url: feature.properties?.url,
      };
    })
    .filter(Boolean)
    .sort((left, right) => (right.magnitude || 0) - (left.magnitude || 0));
}

async function fetchAlerts(scope) {
  if (scope === "world" || scope === "us") {
    const data = await fetchJson(SOURCE_URLS.nwsAlerts, { timeoutMs: 12000 });
    return mapNwsAlertFeatures(data.features || [], "US").slice(0, 180);
  }

  const areas = scope === "oregon" ? ["OR"] : scope === "west" ? ["OR", "WA", "CA", "ID", "NV"] : ["OR", "WA", "CA", "ID", "NV", "AK", "HI"];
  const results = await Promise.allSettled(
    areas.map((area) => fetchJson(`${SOURCE_URLS.nwsAlerts}?area=${encodeURIComponent(area)}`, { timeoutMs: 9000 }))
  );

  return results
    .flatMap((result, areaIndex) => {
      if (result.status !== "fulfilled") return [];
      return mapNwsAlertFeatures(result.value.features || [], areas[areaIndex]);
    })
    .slice(0, 140);
}

function mapNwsAlertFeatures(features, area) {
  return features.map((feature, index) => {
    const props = feature.properties || {};
    const alertArea = stateCodeFromAlert(props) || area;
    const geometryRings = alertGeometryRings(feature.geometry);
    const center = centroidFromFeature(feature) || fallbackAlertCenter(alertArea, index);
    return {
      id: `alert-${props.id || feature.id || area + index}`,
      type: "alert",
      name: props.headline || props.event || "Weather alert",
      title: props.headline || props.event || "Weather alert",
      event: props.event || "Alert",
      lat: center.lat,
      lng: center.lng,
      region: props.areaDesc || area,
      areaSummary: summarizeAlertArea(props.areaDesc || area),
      area: alertArea,
      stateCode: alertArea,
      geometryRings,
      radiusKm: geometryRings.length ? 0 : fallbackAlertRadiusKm(alertArea, props.areaDesc || ""),
      severity: props.severity || "Unknown",
      urgency: props.urgency || "Unknown",
      certainty: props.certainty || "Unknown",
      time: props.sent || props.effective || new Date().toISOString(),
      expires: props.expires || props.ends || "",
      instruction: props.instruction || props.description || "",
      source: "NWS",
      url: props["@id"] || props.id,
    };
  });
}

function alertGeometryRings(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  const rawRings = [];
  if (geometry.type === "Polygon") {
    rawRings.push(...geometry.coordinates);
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) rawRings.push(...polygon);
  }
  return rawRings
    .map((ring) => simplifyRing(ring))
    .filter((ring) => ring.length >= 3)
    .slice(0, 10);
}

function simplifyRing(ring) {
  if (!Array.isArray(ring)) return [];
  const step = Math.max(1, Math.ceil(ring.length / 160));
  const simplified = [];
  for (let index = 0; index < ring.length; index += step) {
    const point = ring[index];
    if (Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))) {
      simplified.push({ lat: Number(point[1]), lng: Number(point[0]) });
    }
  }
  const first = simplified[0];
  const last = simplified[simplified.length - 1];
  if (first && last && (first.lat !== last.lat || first.lng !== last.lng)) simplified.push(first);
  return simplified;
}

function stateCodeFromAlert(props) {
  const ugc = props?.geocode?.UGC;
  if (Array.isArray(ugc) && ugc.length) {
    const code = String(ugc[0] || "").slice(0, 2).toUpperCase();
    if (STATE_CENTERS[code]) return code;
  }
  const sender = String(props.senderName || props.sender || props.headline || "");
  const match = sender.match(/\b([A-Z]{2})\b\s*$/);
  return match && STATE_CENTERS[match[1]] ? match[1] : "";
}

function summarizeAlertArea(areaDesc) {
  const text = cleanCameraText(areaDesc || "");
  if (!text) return "Unknown area";
  const parts = text.split(";").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 2) return text;
  return `${parts.slice(0, 2).join("; ")} +${parts.length - 2} more`;
}

function centroidFromFeature(feature) {
  const geometry = feature.geometry;
  if (!geometry) return null;
  const points = [];
  collectCoordinates(geometry.coordinates, points);
  if (!points.length) return null;
  const lat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const lng = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  return { lat, lng };
}

function collectCoordinates(value, points) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    points.push(value);
    return;
  }
  value.forEach((item) => collectCoordinates(item, points));
}

function fallbackAlertCenter(area, index) {
  const centers = {
    ...STATE_CENTERS,
    US: [39.5, -98.35],
  };
  const [lat, lng] = centers[area] || [44, -120];
  return { lat: lat + (index % 5) * 0.08, lng: lng + (index % 7) * 0.08 };
}

function fallbackAlertRadiusKm(area, areaDesc) {
  const parts = String(areaDesc || "").split(";").filter((part) => part.trim()).length;
  if (area === "US") return 850;
  return Math.min(720, Math.max(120, 140 + parts * 24));
}

const STATE_CENTERS = {
  AL: [32.8, -86.8], AK: [64.2, -149.5], AZ: [34.2, -111.7], AR: [34.9, -92.4],
  CA: [37.2, -119.5], CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5],
  FL: [28.6, -82.4], GA: [32.7, -83.3], HI: [20.8, -156.3], IA: [42.1, -93.5],
  ID: [44.1, -114.6], IL: [40.0, -89.2], IN: [39.9, -86.3], KS: [38.5, -98.0],
  KY: [37.8, -85.8], LA: [31.0, -91.9], MA: [42.3, -71.8], MD: [39.0, -76.7],
  ME: [45.3, -69.0], MI: [44.3, -85.4], MN: [46.3, -94.2], MO: [38.5, -92.5],
  MS: [32.7, -89.7], MT: [47.0, -110.5], NC: [35.5, -79.4], ND: [47.5, -100.5],
  NE: [41.5, -99.8], NH: [43.7, -71.6], NJ: [40.1, -74.7], NM: [34.4, -106.1],
  NV: [39.3, -116.6], NY: [42.9, -75.0], OH: [40.4, -82.8], OK: [35.6, -97.5],
  OR: [44.05, -120.55], PA: [41.0, -77.7], RI: [41.7, -71.6], SC: [33.8, -80.9],
  SD: [44.4, -100.2], TN: [35.8, -86.4], TX: [31.0, -99.3], UT: [39.3, -111.7],
  VA: [37.5, -78.8], VT: [44.0, -72.7], WA: [47.4, -120.7], WI: [44.6, -89.6],
  WV: [38.6, -80.6], WY: [43.0, -107.6], DC: [38.9, -77.0],
};

function buildEvents({ cameras, satellites, flights, quakes, alerts }) {
  const now = Date.now();
  const cameraEvents = cameras
    .filter((camera) => camera.capability === "player")
    .slice(0, 4)
    .map((camera, index) => ({
      id: camera.id,
      type: "camera",
      title: `${camera.shortName || camera.name} live player available`,
      region: camera.area,
      time: new Date(now - index * 7 * 60000).toISOString(),
      severity: "Live Feed",
    }));

  const quakeEvents = quakes.slice(0, 4).map((quake) => ({
    id: quake.id,
    type: "quake",
    title: quake.title,
    region: quake.location,
    time: quake.time,
    severity: quake.severity,
  }));

  const actionableAlerts = alerts.filter((alert) => !/test message/i.test(`${alert.event || ""} ${alert.title || ""}`));
  const alertEvents = (actionableAlerts.length ? actionableAlerts : alerts).slice(0, 5).map((alert) => ({
    id: alert.id,
    type: "alert",
    title: alert.title,
    region: alert.region,
    areaSummary: alert.areaSummary,
    event: alert.event,
    time: alert.time,
    severity: alert.severity,
  }));

  const flightEvents = flights.slice(0, 3).map((flight, index) => ({
    id: flight.id,
    type: "flight",
    title: `${flight.callsign || "Aircraft"} tracked`,
    region: flight.country,
    time: flight.time || new Date(now - index * 9 * 60000).toISOString(),
    severity: "Aircraft",
  }));

  const satEvents = satellites.slice(0, 3).map((satellite, index) => ({
    id: satellite.id,
    type: "satellite",
    title: `${satellite.name} pass projected`,
    region: satellite.objectType,
    time: new Date(now - index * 11 * 60000).toISOString(),
    severity: "Orbit",
  }));

  const priority = { alert: 0, quake: 1, flight: 2, satellite: 3, camera: 4 };
  return [...alertEvents, ...quakeEvents, ...flightEvents, ...satEvents, ...cameraEvents]
    .sort((left, right) => (priority[left.type] ?? 9) - (priority[right.type] ?? 9) || Date.parse(right.time || 0) - Date.parse(left.time || 0))
    .slice(0, 24);
}

function buildRegions({ cameras, satellites, flights, quakes, alerts }) {
  const buckets = new Map();
  for (const camera of cameras) addRegion(buckets, camera.region || camera.area, 1);
  for (const satellite of satellites) addRegion(buckets, satellite.objectType || "Orbit", 1);
  for (const flight of flights) addRegion(buckets, flight.country || "Aircraft", 1);
  for (const quake of quakes) addRegion(buckets, "Seismic", Math.max(1, Math.round(quake.magnitude || 1)));
  for (const alert of alerts) addRegion(buckets, alert.area || "Alerts", 2);

  return Array.from(buckets, ([name, total], index) => ({
    name,
    total,
    color: ["#19e2ff", "#b85cff", "#ffb02e", "#18f0a0", "#ff4e57", "#ff7a1a"][index % 6],
    delta: total > 20 ? "+ hot" : "+ live",
  }))
    .sort((left, right) => right.total - left.total)
    .slice(0, 12);
}

function addRegion(buckets, name, amount) {
  const key = name || "Unknown";
  buckets.set(key, (buckets.get(key) || 0) + amount);
}

function buildSeverity({ alerts, quakes }) {
  const severity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const quake of quakes) {
    if ((quake.magnitude || 0) >= 5) severity.critical += 1;
    else if ((quake.magnitude || 0) >= 4) severity.high += 1;
    else if ((quake.magnitude || 0) >= 2.5) severity.medium += 1;
    else severity.low += 1;
  }
  for (const alert of alerts) {
    const label = String(alert.severity || "").toLowerCase();
    if (label.includes("extreme") || label.includes("severe")) severity.critical += 1;
    else if (label.includes("moderate")) severity.high += 1;
    else if (label.includes("minor")) severity.medium += 1;
    else severity.low += 1;
  }
  return severity;
}

function filterGeoItems(items, bounds) {
  if (!items?.length) return [];
  if (!bounds || bounds === SCOPE_BOUNDS.world) return items;
  return items.filter((item) => inBounds(item, bounds));
}

function quakeSeverity(magnitude) {
  if (magnitude >= 5) return "critical";
  if (magnitude >= 4) return "high";
  if (magnitude >= 2.5) return "medium";
  return "low";
}

function quakeColor(magnitude) {
  if (magnitude >= 5) return "#ff4e57";
  if (magnitude >= 4) return "#ff7a1a";
  if (magnitude >= 2.5) return "#ffb02e";
  return "#19e2ff";
}

function inBounds(item, bounds) {
  return (
    Number.isFinite(Number(item.lat)) &&
    Number.isFinite(Number(item.lng)) &&
    item.lat >= bounds.lamin &&
    item.lat <= bounds.lamax &&
    item.lng >= bounds.lomin &&
    item.lng <= bounds.lomax
  );
}

function normalizeScope(value) {
  return Object.prototype.hasOwnProperty.call(SCOPE_BOUNDS, value) ? value : "world";
}

async function getCached(key, ttlMs, builder) {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return { ok: true, data: cached.data, cached: true };
  }

  try {
    const data = await builder();
    cache.set(key, { data, expiresAt: now + ttlMs, updatedAt: now });
    return { ok: true, data, cached: false };
  } catch (error) {
    if (cached) {
      return { ok: false, data: cached.data, cached: true, stale: true, message: error.message };
    }
    return { ok: false, data: [], cached: false, message: error.message };
  }
}

function healthFromResult(name, result, count) {
  return {
    name,
    ok: result.ok,
    count,
    cached: result.cached,
    stale: result.stale || false,
    message: result.message || "",
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Oversee/0.3 (+local public intelligence dashboard)",
      Accept: "application/geo+json, application/json, text/plain;q=0.9, */*;q=0.8",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(options.timeoutMs || 9000),
  });

  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return response.json();
}

async function proxyGibsTexture(requestUrl, response) {
  const view = GIBS_TEXTURES[requestUrl.searchParams.get("view") || "nasa"] || GIBS_TEXTURES.nasa;
  const date = sanitizeIsoDate(requestUrl.searchParams.get("date")) || isoDateDaysAgo(2);
  const width = clampInt(requestUrl.searchParams.get("width"), 1024, 4096, view.width);
  const height = Math.round(width / 2);
  const gibsUrl = new URL(SOURCE_URLS.nasaGibsWms);
  gibsUrl.searchParams.set("SERVICE", "WMS");
  gibsUrl.searchParams.set("REQUEST", "GetMap");
  gibsUrl.searchParams.set("VERSION", "1.1.1");
  gibsUrl.searchParams.set("LAYERS", view.layer);
  gibsUrl.searchParams.set("STYLES", "");
  gibsUrl.searchParams.set("SRS", "EPSG:4326");
  gibsUrl.searchParams.set("BBOX", "-180,-90,180,90");
  gibsUrl.searchParams.set("WIDTH", String(width));
  gibsUrl.searchParams.set("HEIGHT", String(height));
  gibsUrl.searchParams.set("FORMAT", view.format);
  gibsUrl.searchParams.set("TIME", date);

  const cacheKey = `gibs:${view.layer}:${date}:${width}`;
  const result = await getCached(cacheKey, 6 * 60 * 60 * 1000, async () => {
    const upstream = await fetch(gibsUrl, {
      headers: {
        "User-Agent": "Oversee/0.3 (+local public intelligence dashboard)",
        Accept: `${view.format}, image/*;q=0.9, */*;q=0.5`,
      },
      signal: AbortSignal.timeout(14000),
    });
    if (!upstream.ok) throw new Error(`NASA GIBS returned ${upstream.status}`);
    const contentType = upstream.headers.get("content-type") || view.format;
    if (!/^image\//i.test(contentType)) throw new Error(`NASA GIBS returned ${contentType}`);
    return {
      buffer: Buffer.from(await upstream.arrayBuffer()),
      contentType,
      date,
    };
  });

  if (!result.data?.buffer) {
    return sendText(response, 502, `NASA GIBS texture failed: ${result.message || "no image returned"}`);
  }

  response.writeHead(200, {
    "Content-Type": result.data.contentType || view.format,
    "Cache-Control": "public, max-age=21600",
    "Access-Control-Allow-Origin": "*",
    "X-Oversee-Imagery-Date": result.data.date || date,
    "X-Oversee-Imagery-Stale": result.stale ? "true" : "false",
  });
  response.end(result.data.buffer);
}

function sanitizeIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return "";
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time)) return "";
  return value;
}

function isoDateDaysAgo(days) {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function clampInt(value, min, max, fallback) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

async function proxyImage(imageUrl, response) {
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return sendJson(response, 400, { error: "Missing or unsupported image URL" });
  }

  try {
    const upstream = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Oversee/0.3 (+local public intelligence dashboard)",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) throw new Error(`Image upstream returned ${upstream.status}`);
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (!/^image\//i.test(contentType)) throw new Error(`Image upstream returned ${contentType}`);
    const buffer = Buffer.from(await upstream.arrayBuffer());
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    response.end(buffer);
  } catch (error) {
    sendText(response, 502, `Image proxy failed: ${error.message}`);
  }
}

function serveStatic(requestPath, response) {
  const safePath = requestPath === "/" ? "/index.html" : decodeURIComponent(requestPath);
  const filePath = path.resolve(ROOT, `.${safePath}`);
  if (!filePath.startsWith(ROOT)) return sendText(response, 403, "Forbidden");

  fs.readFile(filePath, (error, data) => {
    if (error) return sendText(response, 404, "Not found");
    const ext = path.extname(filePath).toLowerCase();
    const isCode = [".html", ".css", ".js"].includes(ext);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": isCode ? "no-cache" : "public, max-age=300",
    });
    response.end(data);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, text) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
  response.end(text);
}

function capabilityLabel(capability) {
  return {
    player: "Live Player",
    stream: "Live Stream",
    candidate: "Video Candidate",
    snapshot: "Current Still",
    page: "Source Page",
    source: "Source",
  }[capability] || "Source";
}

function shortCameraName(name) {
  return String(name || "")
    .replace(/^Oregon /i, "")
    .replace(/^Corvallis /i, "")
    .replace(/^Newport /i, "")
    .replace(/^Eugene /i, "")
    .slice(0, 36);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "camera";
}

function deterministicSample(items, max, keySelector = "id") {
  if (!Array.isArray(items) || items.length <= max) return items || [];
  return items
    .map((item, index) => ({ item, score: hashKey(typeof keySelector === "function" ? keySelector(item) : item[keySelector] || index) }))
    .sort((left, right) => left.score - right.score)
    .slice(0, max)
    .map((entry) => entry.item);
}

function hashKey(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function radians(value) {
  return (value * Math.PI) / 180;
}

function degrees(value) {
  return (value * 180) / Math.PI;
}

function normalizeLng(value) {
  let lng = value;
  while (lng < -180) lng += 360;
  while (lng > 180) lng -= 360;
  return lng;
}

function loadBrowserExport(filePath, exportName) {
  const source = fs.readFileSync(filePath, "utf8");
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source}; this.__export__ = ${exportName};`, context, { filename: filePath });
  return context.__export__;
}

function listenOnPreferredPort(index) {
  const port = FALLBACK_PORTS[index];
  if (!port) throw new Error(`Unable to bind Oversee to any preferred port: ${FALLBACK_PORTS.join(", ")}`);
  serverPort = port;

  const handleListening = () => {
    server.off("error", handleError);
    console.log(`Oversee running at http://localhost:${port}`);
  };

  const handleError = (error) => {
    server.off("listening", handleListening);
    if (error.code === "EADDRINUSE" && index < FALLBACK_PORTS.length - 1) {
      listenOnPreferredPort(index + 1);
      return;
    }
    throw error;
  };

  server.once("listening", handleListening);
  server.once("error", handleError);
  server.listen(port);
}
