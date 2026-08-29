import "./data.js";
import "./feed-meta.js";
import earthTextureUrl from "./earth_atmos_2048.jpg?url";
import { altitudeBudget, inGeoBounds, spatiallyBalancedSample } from "../src/core/lod.js";
import { MotionStore } from "../src/core/motion.js";
import { SatellitePropagator } from "../src/core/satellite-motion.js";
import { summarizeSourceHealth } from "../src/core/source-health.js";
import { trafficModelForRoad } from "../src/core/traffic-model.js";
import { CesiumPointLayer } from "../src/globe/cesium-point-layer.js";
import { CesiumRoadTrafficLayer } from "../src/globe/cesium-traffic-layer.js";

(function () {
  const DATA = globalThis.OVERSEE_DATA || { feeds: [], sources: [], layers: [] };
  const META = globalThis.OVERSEE_FEED_META || {};

  const SCOPES = [
    { id: "world", label: "Global", center: [20, 0], zoom: 2.0 },
    { id: "us", label: "United States", center: [39.5, -98.35], zoom: 3.5 },
    { id: "west", label: "US West", center: [41.8, -119.2], zoom: 4.7 },
  ];

  const SENSOR_MODES = [
    { id: "crt", label: "CRT" },
    { id: "nvg", label: "NVG" },
    { id: "flir", label: "FLIR" },
    { id: "clean", label: "Clean" },
  ];

  const EARTH_VIEWS = [
    { id: "ops", label: "Ops" },
    { id: "nasa", label: "NASA" },
    { id: "topo", label: "USGS Topo" },
  ];

  const GLOBE_RENDERERS = [
    { id: "cesium", label: "Cesium" },
    { id: "three", label: "Ops" },
  ];

  const NOAA_RADAR_ARCGIS_URL = "https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer";
  const FEMA_FLOOD_ARCGIS_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
  const FEMA_FLOOD_LAYERS = "show:27,28";
  const WORLD_IMAGERY_ARCGIS_URL = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
  const USGS_TOPO_ARCGIS_URL = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer";

  const LAYERS = [
    { id: "cameras", label: "Cameras", color: "#19e2ff", icon: "cctv" },
    { id: "satellites", label: "Satellites", color: "#b85cff", icon: "satellite" },
    { id: "flights", label: "Flights", color: "#ffb02e", icon: "plane" },
    { id: "quakes", label: "Quakes", color: "#ff4e57", icon: "activity" },
    { id: "fires", label: "Fires", color: "#ff7a1a", icon: "flame" },
    { id: "alerts", label: "Alerts", color: "#18f0a0", icon: "bell-ring" },
    { id: "demographics", label: "Population", color: "#39d98a", icon: "users" },
    { id: "vessels", label: "Vessels", color: "#28d7c0", icon: "ship", advanced: true, defaultOn: false },
    { id: "launches", label: "Missions", color: "#ffdb66", icon: "rocket", advanced: true, defaultOn: false },
    { id: "radio", label: "Radio", color: "#ff78c8", icon: "radio", advanced: true, defaultOn: false },
  ];

  const CAMERA_FILTERS = [
    { id: "all", label: "All Cameras" },
    { id: "video", label: "Live Video" },
    { id: "stills", label: "Stills" },
    { id: "traffic", label: "Traffic" },
    { id: "outside-us", label: "Outside US" },
  ];

  const SOURCE_STACK = [
    {
      name: "Global Camera Adapters",
      status: "Mixed live/still feeds",
      detail: "Combines curated public cameras with official no-key feeds from NYC DOT, Caltrans, TfL JamCams, Iowa DOT, Austin, Illinois Gateway, Florida 511, Georgia DOT, KYTC/Indiana, PennDOT, Redmond, Lawrence, and more.",
    },
    {
      name: "International Camera Catalogs",
      status: "Free public feeds",
      detail: "Adds no-key camera catalogs from Spain DGT, Madrid, Hong Kong, Singapore, New Zealand, New South Wales, Puerto Rico, Panama Canal pages, and other official public portals where direct media is available.",
    },
    {
      name: "Bring-Your-Own-Key Camera APIs",
      status: "Optional official feeds",
      detail: "Wisconsin 511, Louisiana 511, DriveNC, and Alberta 511 adapters stay inactive until the user enters their own developer key in Settings.",
    },
    {
      name: "CelesTrak / SatNOGS Orbital Data",
      status: "Free public feeds",
      detail: "Current public element sets are propagated with SGP4 into live approximate positions and ground tracks. SatNOGS provides an automatic fallback when CelesTrak is unavailable.",
    },
    {
      name: "NASA GIBS Imagery",
      status: "Free public WMS",
      detail: "The globe can switch from the stylized ops skin to recent MODIS true-color imagery proxied from NASA GIBS.",
    },
    {
      name: "NOAA Radar WMS",
      status: "Free public weather overlay",
      detail: "The camera map can overlay CONUS base reflectivity from NOAA/NCEP without requiring a subscription.",
    },
    {
      name: "OpenStreetMap Roads / TomTom Traffic",
      status: "Modeled free layer + optional live flow",
      detail: "Bounded OpenStreetMap road queries power the no-key modeled motion layer. A user-supplied TomTom key adds observed congestion colors while keeping the key behind the local server.",
    },
    {
      name: "FEMA National Flood Hazard Layer",
      status: "Free public hazard overlay",
      detail: "Flood Hazard Zones and Flood Hazard Boundaries can be toggled on the globe or camera map for US flood-risk context.",
    },
    {
      name: "OpenSky Network",
      status: "Best effort",
      detail: "Public aircraft states are cached for 10 minutes to respect anonymous rate limits; trails show recent heading and observed movement.",
    },
    {
      name: "Launch Library 2 / Radio Browser",
      status: "Free optional layers",
      detail: "Upcoming launch missions and geolocated public radio stations are available from the More layer palette without crowding the default globe.",
    },
    {
      name: "AISStream",
      status: "Optional user key",
      detail: "Users can add their own AISStream key in Settings to display live vessel positions. The layer stays disabled when no key is configured.",
    },
    {
      name: "USGS Earthquakes",
      status: "Free public feed",
      detail: "All-day GeoJSON feed powers seismic events; significant quakes are enriched with ShakeMap impact metadata when available.",
    },
    {
      name: "EGP WildFireSA / WFIGS",
      status: "Free public wildfire layers",
      detail: "National fire situational awareness adds active incidents and current interagency perimeter polygons to the Fires layer.",
    },
    {
      name: "USGS National Map Topo",
      status: "Free public basemap",
      detail: "USGS Topo can be selected as the Cesium globe basemap for a more map-like planning view without an API key.",
    },
    {
      name: "U.S. Census Population Estimates",
      status: "Free public demographics",
      detail: "Current state-level population estimates add people/context signals near alerts, fires, cameras, and quake activity without needing an API key.",
    },
    {
      name: "National Weather Service",
      status: "Free public API",
      detail: "Active United States alerts add official hazard context where public NWS coverage exists.",
    },
    {
      name: "National Hurricane Center",
      status: "Free public tropical weather feed",
      detail: "Active NHC tropical systems are pulled into the Alerts layer so Caribbean storms can appear near Cuba when active.",
    },
    {
      name: "GDELT Cuba Reporting",
      status: "Best effort public reporting",
      detail: "Recent public reporting mentioning Cuba/Havana is geolocated near Cuba as context signals; treat these as media indicators, not official confirmation.",
    },
    {
      name: "OpenAQ",
      status: "Free with API key",
      detail: "Good candidate for a future air-quality layer. The API is free, but current v3 access requires an API key so it should stay optional.",
    },
    {
      name: "OpenStreetMap / Leaflet",
      status: "Free map layer",
      detail: "The camera map uses open map tiles and canvas-rendered markers for larger public camera inventories.",
    },
  ];

  const COLORS = {
    cameras: "#19e2ff",
    satellites: "#b85cff",
    flights: "#ffb02e",
    quakes: "#ff4e57",
    fires: "#ff7a1a",
    alerts: "#18f0a0",
    demographics: "#39d98a",
    vessels: "#28d7c0",
    launches: "#ffdb66",
    radio: "#ff78c8",
    traffic: "#1aa7ff",
    city: "#19e2ff",
    wildfire: "#ff7a1a",
    marine: "#1aa7ff",
    trafficFeed: "#ffb02e",
    service: "#18f0a0",
  };

  const state = {
    scope: "world",
    sensorMode: "crt",
    earthView: "ops",
    globeRenderer: loadGlobeRendererPreference(),
    layers: Object.fromEntries(LAYERS.map((layer) => [layer.id, layer.defaultOn !== false])),
    layerMenuOpen: false,
    snapshot: null,
    query: "",
    searchPanelOpen: false,
    cameraFilter: "all",
    includeDownStreams: false,
    showCameraMapMarkers: true,
    downStreamIds: new Set(),
    catalogLimit: 120,
    assetLimit: 6,
    mapListMode: false,
    hasFitCameraMap: false,
    suppressMapMove: false,
    selection: null,
    feedView: null,
    regionSortAlpha: false,
    collapsedPanels: loadCollapsedPanels(),
    cameraMap: null,
    cameraLayer: null,
    radarLayer: null,
    radarOverlay: false,
    floodLayer: null,
    floodOverlay: false,
    mapTrafficOverlay: false,
    trafficStatus: null,
    trafficStatusFetchedAt: 0,
    trafficMapTileLayer: null,
    trafficMapRoadLayer: null,
    trafficMapRenderer: null,
    trafficMapRefreshTimer: null,
    trafficMapRequestToken: 0,
    globeWeatherOverlay: false,
    globeFloodOverlay: false,
    globeTrafficOverlay: false,
    idleSpin: false,
    demoMode: false,
    demoTimer: null,
    demoLinkTimer: null,
    demoIndex: 0,
    demoCamera: null,
    demoHls: null,
    demoResolving: false,
    demoFeedPool: [],
    demoFeedPoolScope: "",
    demoPreviousIdleSpin: false,
    seenAlertIds: null,
    settings: null,
    audioContext: null,
    cameraRenderer: null,
    hls: null,
    stillRefreshTimer: null,
    trackHistory: new Map(),
    pinnedAssets: loadPinnedAssets(),
  };

  const globe = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    raycaster: null,
    pointer: null,
    worldGroup: null,
    earth: null,
    defaultEarthTexture: null,
    atmosphere: null,
    groups: {},
    selectionGroup: null,
    pickables: [],
    textures: new Map(),
    earthViewToken: 0,
    animationId: 0,
    lastMotionUpdate: 0,
    dragging: false,
    dragStartedAt: [0, 0],
  };

  const cesiumGlobe = {
    viewer: null,
    ready: false,
    loading: false,
    failed: false,
    baseLayer: null,
    sources: {},
    pointLayers: {},
    selectionSource: null,
    renderRetry: null,
    motionTimer: null,
    lastSelectionUpdate: 0,
    trafficLayer: null,
    trafficImageryLayer: null,
    trafficRefreshTimer: null,
    trafficRequestToken: 0,
    trafficBoundsKey: "",
  };

  const motionStore = new MotionStore({ renderDelayMs: 15_000, maxCoastMs: 120_000 });
  const satellitePropagator = new SatellitePropagator();

  const els = {
    body: document.body,
    searchInput: document.getElementById("searchInput"),
    openSearchPanel: document.getElementById("openSearchPanel"),
    searchModal: document.getElementById("searchModal"),
    searchResults: document.getElementById("searchResults"),
    systemStatusLabel: document.getElementById("systemStatusLabel"),
    systemStatusSub: document.getElementById("systemStatusSub"),
    clockUtc: document.getElementById("clockUtc"),
    clockLocal: document.getElementById("clockLocal"),
    refreshAll: document.getElementById("refreshAll"),
    cycleSensorMode: document.getElementById("cycleSensorMode"),
    focusHome: document.getElementById("focusHome"),
    toggleIdleSpin: document.getElementById("toggleIdleSpin"),
    toggleDemoMode: document.getElementById("toggleDemoMode"),
    closeDemoMode: document.getElementById("closeDemoMode"),
    openSourcePanel: document.getElementById("openSourcePanel"),
    openSettingsPanel: document.getElementById("openSettingsPanel"),
    closeSourcePanel: document.getElementById("closeSourcePanel"),
    closeSettingsPanel: document.getElementById("closeSettingsPanel"),
    sourceDrawer: document.getElementById("sourceDrawer"),
    settingsDrawer: document.getElementById("settingsDrawer"),
    sourceGrid: document.getElementById("sourceGrid"),
    settingsForm: document.getElementById("settingsForm"),
    settingsGrid: document.getElementById("settingsGrid"),
    settingsStatus: document.getElementById("settingsStatus"),
    scopeControls: document.getElementById("scopeControls"),
    globeRendererControls: document.getElementById("globeRendererControls"),
    earthViewControls: document.getElementById("earthViewControls"),
    sensorModeControls: document.getElementById("sensorModeControls"),
    layerControls: document.getElementById("layerControls"),
    metricStrip: document.getElementById("metricStrip"),
    alertDrawer: document.getElementById("alertDrawer"),
    alertDrawerList: document.getElementById("alertDrawerList"),
    openAlertDrawer: document.getElementById("openAlertDrawer"),
    closeAlertDrawer: document.getElementById("closeAlertDrawer"),
    alertDrawerCount: document.getElementById("alertDrawerCount"),
    toggleGlobeWeather: document.getElementById("toggleGlobeWeather"),
    toggleGlobeFlood: document.getElementById("toggleGlobeFlood"),
    toggleGlobeTraffic: document.getElementById("toggleGlobeTraffic"),
    globeTrafficStatus: document.getElementById("globeTrafficStatus"),
    regionList: document.getElementById("regionList"),
    sortRegions: document.getElementById("sortRegions"),
    cameraFilterControls: document.getElementById("cameraFilterControls"),
    includeDownStreams: document.getElementById("includeDownStreams"),
    showCameraMapMarkers: document.getElementById("showCameraMapMarkers"),
    loadMoreCameras: document.getElementById("loadMoreCameras"),
    openSignalModal: document.getElementById("openSignalModal"),
    openLayerModal: document.getElementById("openLayerModal"),
    signalModal: document.getElementById("signalModal"),
    layerModal: document.getElementById("layerModal"),
    signalTotal: document.getElementById("signalTotal"),
    signalChart: document.getElementById("signalChart"),
    layerTotal: document.getElementById("layerTotal"),
    layerDonut: document.getElementById("layerDonut"),
    layerLegend: document.getElementById("layerLegend"),
    assetList: document.getElementById("assetList"),
    showAllAssets: document.getElementById("showAllAssets"),
    alertTotal: document.getElementById("alertTotal"),
    severityGrid: document.getElementById("severityGrid"),
    timeline: document.getElementById("timeline"),
    watchTitle: document.getElementById("watchTitle"),
    watchMeta: document.getElementById("watchMeta"),
    watchActions: document.getElementById("watchActions"),
    watchView: document.getElementById("watchView"),
    watchDetail: document.getElementById("watchDetail"),
    cameraMap: document.getElementById("cameraMap"),
    toggleRadarOverlay: document.getElementById("toggleRadarOverlay"),
    toggleFloodOverlay: document.getElementById("toggleFloodOverlay"),
    toggleTrafficOverlay: document.getElementById("toggleTrafficOverlay"),
    cameraTrafficStatus: document.getElementById("cameraTrafficStatus"),
    cameraMapMeta: document.getElementById("cameraMapMeta"),
    catalogList: document.getElementById("catalogList"),
    catalogTitle: document.getElementById("catalogTitle"),
    catalogHelp: document.getElementById("catalogHelp"),
    clearSearch: document.getElementById("clearSearch"),
    resetMapArea: document.getElementById("resetMapArea"),
    selectionCard: document.getElementById("selectionCard"),
    demoCallout: document.getElementById("demoCallout"),
    demoTitle: document.getElementById("demoTitle"),
    demoMeta: document.getElementById("demoMeta"),
    demoMedia: document.getElementById("demoMedia"),
    demoStatus: document.getElementById("demoStatus"),
    demoLink: document.getElementById("demoLink"),
    demoLinkLine: document.getElementById("demoLinkLine"),
    demoLinkDot: document.getElementById("demoLinkDot"),
    stage: document.querySelector(".stage"),
    globeCanvas: document.getElementById("globeCanvas"),
    cesiumGlobe: document.getElementById("cesiumGlobe"),
    theaterSubtitle: document.getElementById("theaterSubtitle"),
  };

  init();

  function init() {
    bindEvents();
    renderStaticControls();
    renderSourceDrawer();
    applyCollapsedPanels();
    loadSettings();
    initClock();
    initGlobe();
    initCesiumGlobe();
    initCameraMap();
    updateRendererVisibility();
    refreshSnapshot({ keepSelection: false });
    setInterval(initClock, 1000);
    setInterval(() => refreshSnapshot({ keepSelection: true, quiet: true }), 60000);
    if (globalThis.lucide) globalThis.lucide.createIcons();
  }

  function bindEvents() {
    els.searchInput.addEventListener("input", (event) => {
      state.query = event.target.value.trim().toLowerCase();
      state.catalogLimit = 120;
      renderSearchResults();
      renderCatalog();
      renderAssets();
      renderGlobeLayers();
    });

    els.searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const first = getSearchMatches()[0];
      if (first) {
        event.preventDefault();
        selectSearchResult(first.type, first.item);
      }
    });

    els.openSearchPanel.addEventListener("click", () => toggleSearchModal(true));
    els.refreshAll.addEventListener("click", () => refreshSnapshot({ force: true }));
    els.focusHome.addEventListener("click", () => setScope("us"));
    els.toggleIdleSpin.addEventListener("click", toggleIdleSpin);
    els.toggleDemoMode.addEventListener("click", () => toggleDemoMode(!state.demoMode));
    els.closeDemoMode.addEventListener("click", () => toggleDemoMode(false));
    els.cycleSensorMode.addEventListener("click", cycleSensorMode);
    els.openSourcePanel.addEventListener("click", () => toggleSourceDrawer(true));
    els.openSettingsPanel.addEventListener("click", () => toggleSettingsDrawer(true));
    els.closeSourcePanel.addEventListener("click", () => toggleSourceDrawer(false));
    els.closeSettingsPanel.addEventListener("click", () => toggleSettingsDrawer(false));
    els.settingsForm.addEventListener("submit", saveSettings);
    els.openAlertDrawer.addEventListener("click", () => toggleAlertDrawer());
    els.closeAlertDrawer.addEventListener("click", () => toggleAlertDrawer(false));
    els.toggleGlobeWeather.addEventListener("click", toggleGlobeWeatherOverlay);
    els.toggleGlobeFlood.addEventListener("click", toggleGlobeFloodOverlay);
    els.toggleGlobeTraffic.addEventListener("click", toggleGlobeTrafficOverlay);
    els.openSignalModal.addEventListener("click", () => toggleInsightModal("signal", true));
    els.openLayerModal.addEventListener("click", () => toggleInsightModal("layer", true));
    els.sortRegions.addEventListener("click", () => {
      state.regionSortAlpha = !state.regionSortAlpha;
      renderRegions();
    });
    els.showAllAssets.addEventListener("click", () => {
      state.assetLimit = state.assetLimit === 6 ? 24 : 6;
      els.showAllAssets.textContent = state.assetLimit === 6 ? "More" : "Less";
      renderAssets();
    });
    els.clearSearch.addEventListener("click", () => {
      state.query = "";
      els.searchInput.value = "";
      state.cameraFilter = "all";
      state.mapListMode = false;
      state.catalogLimit = 120;
      renderCameraFilters();
      renderCatalog();
      renderAssets();
      renderCameraMap({ fit: true });
      renderGlobeLayers();
    });
    els.resetMapArea.addEventListener("click", () => {
      state.mapListMode = false;
      state.catalogLimit = 120;
      renderCatalog();
      renderCameraMap({ fit: true });
    });
    els.includeDownStreams.addEventListener("change", (event) => {
      state.includeDownStreams = event.target.checked;
      state.catalogLimit = 120;
      renderCatalog();
      renderCameraMap();
      renderGlobeLayers();
    });
    els.showCameraMapMarkers.addEventListener("change", (event) => {
      state.showCameraMapMarkers = event.target.checked;
      renderCatalog();
      renderCameraMap();
    });
    els.loadMoreCameras.addEventListener("click", () => {
      state.catalogLimit += 120;
      renderCatalog();
    });
    els.toggleRadarOverlay.addEventListener("click", toggleRadarOverlay);
    els.toggleFloodOverlay.addEventListener("click", toggleFloodOverlay);
    els.toggleTrafficOverlay.addEventListener("click", toggleMapTrafficOverlay);

    document.body.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-selection]")) {
        clearSelectionCard();
        return;
      }

      const nav = event.target.closest("[data-view-jump]");
      if (nav) {
        scrollToView(nav.dataset.viewJump);
        if (nav.classList.contains("nav-button")) {
          document.querySelectorAll(".nav-button").forEach((button) => button.classList.remove("active"));
          nav.classList.add("active");
        }
      }

      const action = event.target.closest("[data-select-type]");
      if (action) {
        const item = findItem(action.dataset.selectType, action.dataset.selectId);
        if (item) selectObject(action.dataset.selectType, item, { focus: action.dataset.focus === "true", scrollToWatch: action.dataset.scrollWatch === "true", pulse: action.dataset.pulse === "true" });
        if (action.closest("#alertDrawer")) toggleAlertDrawer(false);
        if (action.closest("#searchModal")) toggleSearchModal(false);
      }

      const pinAction = event.target.closest("[data-pin-asset]");
      if (pinAction) {
        event.preventDefault();
        event.stopPropagation();
        const item = findItem(pinAction.dataset.pinType, pinAction.dataset.pinId);
        if (item) togglePinnedAsset(pinAction.dataset.pinType, item);
      }

      const unpinAction = event.target.closest("[data-unpin-asset]");
      if (unpinAction) {
        event.preventDefault();
        event.stopPropagation();
        removePinnedAsset(unpinAction.dataset.unpinKey);
      }

      const nearestCameraAction = event.target.closest("[data-nearest-camera]");
      if (nearestCameraAction) {
        const item = findItem(nearestCameraAction.dataset.nearestType, nearestCameraAction.dataset.nearestId);
        if (item) selectNearestCamera(item);
      }

      const openUrl = event.target.closest("[data-open-url]");
      if (openUrl) {
        window.open(openUrl.dataset.openUrl, "_blank", "noopener,noreferrer");
      }

      if (event.target.closest("[data-close-modal]")) {
        toggleInsightModal("signal", false);
        toggleInsightModal("layer", false);
        toggleSearchModal(false);
      }

      const searchTerm = event.target.closest("[data-search-term]");
      if (searchTerm) {
        applySearch(searchTerm.dataset.searchTerm || "", { open: searchTerm.closest("#searchModal") ? false : true });
      }

      const collapseButton = event.target.closest("[data-collapse-panel]");
      if (collapseButton) togglePanelCollapse(collapseButton.dataset.collapsePanel);

      if (state.layerMenuOpen && !event.target.closest("#layerControls")) {
        state.layerMenuOpen = false;
        renderLayerControls();
      }
    });

    document.addEventListener("pointerdown", primeAlertAudio, { once: true, passive: true });
    document.addEventListener("fullscreenchange", () => {
      if (state.demoMode) window.setTimeout(resizeGlobe, 120);
    });
  }

  function applySearch(term, options = {}) {
    state.query = term.trim().toLowerCase();
    state.cameraFilter = "all";
    state.catalogLimit = 120;
    els.searchInput.value = term;
    if (options.open) toggleSearchModal(true);
    renderCameraFilters();
    renderSearchResults();
    renderCatalog();
    renderAssets();
    renderGlobeLayers();
  }

  function scrollToView(viewId) {
    const target = viewId === "map" ? els.stage : document.getElementById(viewId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: viewId === "map" ? "center" : "start" });
  }

  function renderStaticControls() {
    els.scopeControls.innerHTML = SCOPES.map(
      (scope) =>
        `<button class="segment ${scope.id === state.scope ? "active" : ""}" type="button" data-scope="${scope.id}">${scope.label}</button>`
    ).join("");
    els.scopeControls.addEventListener("click", (event) => {
      const button = event.target.closest("[data-scope]");
      if (button) setScope(button.dataset.scope);
    });

    renderGlobeRendererControls();

    els.earthViewControls.innerHTML = EARTH_VIEWS.map(
      (view) =>
        `<button class="segment ${view.id === state.earthView ? "active" : ""}" type="button" data-earth-view="${view.id}">${view.label}</button>`
    ).join("");
    els.earthViewControls.addEventListener("click", (event) => {
      const button = event.target.closest("[data-earth-view]");
      if (button) setEarthView(button.dataset.earthView);
    });

    els.sensorModeControls.innerHTML = SENSOR_MODES.map(
      (mode) =>
        `<button class="segment ${mode.id === state.sensorMode ? "active" : ""}" type="button" data-sensor-mode="${mode.id}">${mode.label}</button>`
    ).join("");
    els.sensorModeControls.addEventListener("click", (event) => {
      const button = event.target.closest("[data-sensor-mode]");
      if (button) setSensorMode(button.dataset.sensorMode);
    });

    renderLayerControls();
    renderCameraFilters();
  }

  function renderGlobeRendererControls() {
    els.globeRendererControls.innerHTML = GLOBE_RENDERERS.map(
      (renderer) =>
        `<button class="segment ${renderer.id === state.globeRenderer ? "active" : ""}" type="button" data-globe-renderer="${renderer.id}">${renderer.label}</button>`
    ).join("");
    els.globeRendererControls.addEventListener("click", (event) => {
      const button = event.target.closest("[data-globe-renderer]");
      if (button) setGlobeRenderer(button.dataset.globeRenderer);
    });
  }

  function renderLayerControls() {
    const renderButton = (layer) => {
      const active = state.layers[layer.id] ? "active" : "";
      return `<button class="layer-button ${active}" style="color:${layer.color}" type="button" data-layer="${layer.id}">
        <span class="layer-dot"></span><span>${layer.label}</span>
      </button>`;
    };
    const primary = LAYERS.filter((layer) => !layer.advanced);
    const advanced = LAYERS.filter((layer) => layer.advanced);
    const enabledAdvanced = advanced.filter((layer) => state.layers[layer.id]).length;
    els.layerControls.innerHTML = `${primary.map(renderButton).join("")}
      <button class="layer-button layer-more-button ${enabledAdvanced ? "active" : ""}" type="button" data-layer-menu aria-expanded="${state.layerMenuOpen}">
        <i data-lucide="layers-3"></i><span>More${enabledAdvanced ? ` ${enabledAdvanced}` : ""}</span>
      </button>
      <div class="layer-menu ${state.layerMenuOpen ? "open" : ""}" role="group" aria-label="Additional data layers">
        <div class="layer-menu-head"><span>Additional layers</span><small>Off by default</small></div>
        ${advanced.map(renderButton).join("")}
      </div>`;

    els.layerControls.onclick = (event) => {
      const menuButton = event.target.closest("[data-layer-menu]");
      if (menuButton) {
        event.stopPropagation();
        state.layerMenuOpen = !state.layerMenuOpen;
        renderLayerControls();
        return;
      }
      const button = event.target.closest("[data-layer]");
      if (!button) return;
      const layerId = button.dataset.layer;
      state.layers[layerId] = !state.layers[layerId];
      renderLayerControls();
      renderGlobeLayers();
      renderMetrics();
    };
    if (globalThis.lucide) globalThis.lucide.createIcons();
  }

  function renderCameraFilters() {
    els.cameraFilterControls.innerHTML = CAMERA_FILTERS.map(
      (filter) => `<button class="segment ${filter.id === state.cameraFilter ? "active" : ""}" type="button" data-camera-filter="${filter.id}">${filter.label}</button>`
    ).join("");
    els.cameraFilterControls.onclick = (event) => {
      const button = event.target.closest("[data-camera-filter]");
      if (!button) return;
      state.cameraFilter = button.dataset.cameraFilter;
      state.catalogLimit = 120;
      state.mapListMode = false;
      renderCameraFilters();
      renderCatalog();
      renderCameraMap({ fit: true });
      renderGlobeLayers();
    };
  }

  function renderSourceDrawer() {
    els.sourceGrid.innerHTML = SOURCE_STACK.map(
      (source) => `<article class="source-card">
        <h3>${source.name}</h3>
        <p><strong>${source.status}</strong></p>
        <p>${source.detail}</p>
      </article>`
    ).join("");
  }

  function toggleSourceDrawer(open) {
    els.sourceDrawer.classList.toggle("open", open);
    els.sourceDrawer.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) toggleSettingsDrawer(false);
  }

  function toggleSettingsDrawer(open) {
    els.settingsDrawer.classList.toggle("open", open);
    els.settingsDrawer.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      toggleSourceDrawer(false);
      loadSettings();
    }
  }

  async function loadSettings() {
    try {
      const response = await fetch(`/api/settings?ts=${Date.now()}`);
      if (!response.ok) throw new Error(`Settings failed with status ${response.status}`);
      state.settings = await response.json();
      renderSettings();
    } catch (error) {
      els.settingsStatus.textContent = `Settings unavailable: ${error.message}`;
    }
  }

  function renderSettings() {
    const settings = state.settings?.settings || [];
    els.settingsGrid.innerHTML = settings.map((setting) => `
      <label class="settings-field">
        <span>
          <strong>${escapeHtml(setting.label)}</strong>
          <small>${settingStatusText(setting)}</small>
          ${setting.description ? `<small class="settings-description">${escapeHtml(setting.description)}</small>` : ""}
        </span>
        <input
          type="password"
          name="${escapeHtml(setting.key)}"
          autocomplete="off"
          placeholder="${setting.configured ? "Configured - enter a new value to replace" : "Paste key or token"}"
        />
        <label class="clear-key">
          <input type="checkbox" name="${escapeHtml(setting.key)}Clear" ${setting.env ? "disabled" : ""} />
          <span>Clear local key</span>
        </label>
      </label>
    `).join("");
    els.settingsStatus.textContent = state.settings?.updatedAt
      ? `Local settings updated ${formatTimeAgo(state.settings.updatedAt)}`
      : "Keys are masked after saving.";
  }

  function settingStatusText(setting) {
    if (setting.env) return "Configured by environment";
    if (setting.local) return "Configured locally";
    if (setting.bundled) return "Configured by bundled default";
    if (setting.configured) return "Configured";
    return "Not configured";
  }

  async function saveSettings(event) {
    event.preventDefault();
    const formData = new FormData(els.settingsForm);
    const payload = {};
    for (const setting of state.settings?.settings || []) {
      const value = String(formData.get(setting.key) || "").trim();
      if (value) payload[setting.key] = value;
      if (formData.get(`${setting.key}Clear`)) payload[`${setting.key}Clear`] = true;
    }
    els.settingsStatus.textContent = "Saving local settings...";
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Save failed with status ${response.status}`);
      state.settings = await response.json();
      state.trafficStatus = null;
      state.trafficStatusFetchedAt = 0;
      renderSettings();
      refreshSnapshot({ keepSelection: true, quiet: false, force: true });
      if (state.globeTrafficOverlay) updateCesiumTrafficLayer();
      if (state.mapTrafficOverlay) refreshMapTrafficOverlay();
    } catch (error) {
      els.settingsStatus.textContent = error.message;
    }
  }

  function toggleAlertDrawer(open) {
    const shouldOpen = typeof open === "boolean" ? open : !els.alertDrawer.classList.contains("open");
    els.alertDrawer.classList.toggle("open", shouldOpen);
    els.alertDrawer.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
    els.openAlertDrawer.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  }

  function toggleIdleSpin() {
    state.idleSpin = !state.idleSpin;
    els.toggleIdleSpin.classList.toggle("active", state.idleSpin);
    els.toggleIdleSpin.setAttribute("aria-pressed", state.idleSpin ? "true" : "false");
  }

  async function toggleDemoMode(open, options = {}) {
    const shouldOpen = Boolean(open);
    if (shouldOpen === state.demoMode) return;
    state.demoMode = shouldOpen;
    els.stage.classList.toggle("demo-active", shouldOpen);
    els.toggleDemoMode.classList.toggle("active", shouldOpen);
    els.toggleDemoMode.setAttribute("aria-pressed", shouldOpen ? "true" : "false");
    els.demoCallout.classList.toggle("visible", shouldOpen);
    els.demoCallout.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
    els.demoLink.classList.toggle("visible", shouldOpen);

    if (shouldOpen) {
      state.demoPreviousIdleSpin = state.idleSpin;
      state.idleSpin = true;
      els.toggleIdleSpin.classList.add("active");
      els.toggleIdleSpin.setAttribute("aria-pressed", "true");
      clearSelectionCard();
      document.getElementById("overview")?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (document.fullscreenEnabled && !document.fullscreenElement) {
        els.stage.requestFullscreen?.().catch(() => {});
      }
      setDemoPresentationView();
      window.setTimeout(resizeGlobe, 250);
      startDemoCycle();
      return;
    }

    stopDemoCycle();
    state.idleSpin = state.demoPreviousIdleSpin;
    els.toggleIdleSpin.classList.toggle("active", state.idleSpin);
    els.toggleIdleSpin.setAttribute("aria-pressed", state.idleSpin ? "true" : "false");
    if (!options.skipFullscreenExit && document.fullscreenElement === els.stage) {
      document.exitFullscreen?.().catch(() => {});
    }
    window.setTimeout(resizeGlobe, 160);
  }

  function startDemoCycle() {
    stopDemoCycle({ keepCallout: true });
    showNextDemoCamera();
    state.demoTimer = window.setInterval(showNextDemoCamera, 14500);
    state.demoLinkTimer = window.setInterval(updateDemoLink, 180);
  }

  function stopDemoCycle(options = {}) {
    if (state.demoTimer) clearInterval(state.demoTimer);
    if (state.demoLinkTimer) clearInterval(state.demoLinkTimer);
    state.demoTimer = null;
    state.demoLinkTimer = null;
    state.demoCamera = null;
    state.demoResolving = false;
    destroyDemoMedia();
    if (!options.keepCallout) {
      els.demoMedia.innerHTML = "";
      els.demoStatus.textContent = "Demo stopped";
      els.demoLink.classList.remove("visible");
    }
  }

  async function showNextDemoCamera() {
    if (!state.demoMode || state.demoResolving) return;
    state.demoResolving = true;
    els.demoStatus.textContent = "Loading vetted demo feed";
    try {
      if (!state.demoFeedPool.length || state.demoFeedPoolScope !== state.scope) {
        await loadDemoFeedPool();
      }

      const demoFeeds = uniqueDemoCandidates([
        ...(state.demoFeedPool || []).filter((entry) => isDemoPointVisible(entry.camera)),
        ...(state.demoFeedPool || []),
      ]);
      if (demoFeeds.length) {
        state.demoIndex = (state.demoIndex + 1) % demoFeeds.length;
        const entry = demoFeeds[state.demoIndex];
        state.demoCamera = entry.camera;
        renderDemoFeed(entry.camera, entry.view);
        updateDemoLink();
        return;
      }

      if (!state.snapshot) {
        els.demoTitle.textContent = "Waiting for public data";
        els.demoMeta.textContent = "Demo mode will start as soon as camera data finishes loading.";
        els.demoMedia.innerHTML = `<div class="watch-placeholder"><i data-lucide="loader-circle"></i><span>Loading dashboard data</span></div>`;
        els.demoStatus.textContent = "Waiting for snapshot";
        if (globalThis.lucide) globalThis.lucide.createIcons();
        return;
      }

      const candidates = getDemoCameraCandidates();
      if (!candidates.length) {
        els.demoTitle.textContent = "No live video feeds available";
        els.demoMeta.textContent = "No browser-playable live players are loaded yet.";
        els.demoMedia.innerHTML = `<div class="watch-placeholder"><i data-lucide="cctv"></i><span>No playable public video in this view.</span></div>`;
        els.demoStatus.textContent = "Waiting for sources";
        if (globalThis.lucide) globalThis.lucide.createIcons();
        return;
      }

      els.demoStatus.textContent = "Finding live player";
      for (let attempt = 0; attempt < Math.min(candidates.length, 80); attempt += 1) {
        state.demoIndex = (state.demoIndex + 1) % candidates.length;
        const candidate = candidates[state.demoIndex];
        const camera = candidate.camera || candidate;
        try {
          let view = candidate.view;
          if (!view) {
            const response = await fetch(`/api/feed-view?id=${encodeURIComponent(camera.id)}&ts=${Date.now()}`);
            if (!response.ok) throw new Error(`Feed viewer failed with status ${response.status}`);
            view = await response.json();
          }
          if (!state.demoMode) return;
          if (!isPlayableDemoView(view)) {
            if (view?.streamStatus === "down") markStreamDown(camera.id);
            continue;
          }
          state.demoCamera = camera;
          renderDemoFeed(camera, view);
          updateDemoLink();
          return;
        } catch {
          continue;
        }
      }
      if (!state.demoMode) return;
      els.demoTitle.textContent = "Searching for live feeds";
      els.demoMeta.textContent = "Skipping still images, source pages, and unavailable streams.";
      els.demoMedia.innerHTML = `<div class="watch-placeholder"><i data-lucide="loader-circle"></i><span>Checking verified live players</span></div>`;
      els.demoStatus.textContent = "No validated stream in this pass";
      window.setTimeout(() => state.demoMode && showNextDemoCamera(), 1800);
      if (globalThis.lucide) globalThis.lucide.createIcons();
    } finally {
      state.demoResolving = false;
    }
  }

  function getDemoCameraCandidates() {
    const demoFeeds = (state.demoFeedPool || [])
      .filter((entry) => entry?.camera && entry?.view)
      .filter((entry) => !state.downStreamIds.has(entry.camera.id));
    if (demoFeeds.length) {
      const visibleDemoFeeds = demoFeeds.filter((entry) => isDemoPointVisible(entry.camera));
      return uniqueDemoCandidates([...visibleDemoFeeds, ...demoFeeds]);
    }

    const cameras = (state.snapshot?.cameras || buildFallbackCameras())
      .filter((camera) => Number.isFinite(Number(camera.lat)) && Number.isFinite(Number(camera.lng)))
      .filter((camera) => camera.capability === "player" || (camera.capability === "stream" && camera.streamUrl))
      .filter((camera) => !state.downStreamIds.has(camera.id));
    const visible = cameras.filter((camera) => isDemoPointVisible(camera));
    const ranked = uniqueById([
      ...visible.filter(isLikelyEmbeddedPlayer),
      ...cameras.filter(isLikelyEmbeddedPlayer),
      ...visible,
      ...cameras,
    ]);
    return ranked.length ? ranked.slice(0, 420) : [];
  }

  async function loadDemoFeedPool() {
    if (state.demoFeedPoolScope === state.scope && state.demoFeedPool.length) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 50000);
    try {
      const response = await fetch(`/api/demo-feeds?scope=${encodeURIComponent(state.scope)}&ts=${Date.now()}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Demo feeds failed with status ${response.status}`);
      const payload = await response.json();
      state.demoFeedPool = Array.isArray(payload.feeds) ? payload.feeds : [];
      state.demoFeedPoolScope = state.scope;
    } catch {
      state.demoFeedPool = [];
      state.demoFeedPoolScope = "";
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function setDemoPresentationView() {
    if (state.globeRenderer === "cesium" && cesiumGlobe.ready && globalThis.Cesium) {
      const scope = SCOPES.find((item) => item.id === state.scope) || SCOPES[0];
      const height = state.scope === "world" ? 17000000 : 8500000;
      cesiumGlobe.viewer.camera.flyTo({
        destination: globalThis.Cesium.Cartesian3.fromDegrees(scope.center[1], scope.center[0], height),
        duration: 0.9,
      });
      return;
    }
    if (!globe.camera || !globe.controls) return;
    globe.camera.position.copy(globe.camera.position.normalize().multiplyScalar(6.1));
    globe.controls.target.set(0, 0, 0);
    globe.controls.update();
  }

  function renderDemoFeed(camera, view) {
    destroyDemoMedia();
    const source = escapeHtml(view?.sourceLabel || camera.sourceName || "Public camera");
    els.demoTitle.textContent = camera.name || camera.id;
    els.demoMeta.textContent = assetSubtitle("camera", camera);

    if (view?.type === "iframe") {
      els.demoMedia.innerHTML = `<iframe src="${escapeHtml(view.url)}" title="${source}" allow="autoplay; fullscreen; encrypted-media" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
      els.demoStatus.textContent = "Embedded public player";
    } else if (view?.type === "video" || view?.type === "hls") {
      els.demoMedia.innerHTML = `<video id="demoVideo" autoplay muted playsinline></video>`;
      const video = document.getElementById("demoVideo");
      if (view.type === "hls" && globalThis.Hls && globalThis.Hls.isSupported()) {
        state.demoHls = new globalThis.Hls({ lowLatencyMode: true });
        state.demoHls.loadSource(view.url);
        state.demoHls.attachMedia(video);
        state.demoHls.on(globalThis.Hls.Events.ERROR, (_event, data) => {
          if (data?.fatal && state.demoCamera?.id === camera.id) {
            markStreamDown(camera.id);
            showNextDemoCamera();
          }
        });
      } else {
        video.src = view.url;
      }
      video.addEventListener("error", () => {
        markStreamDown(camera.id);
        if (state.demoMode && state.demoCamera?.id === camera.id) showNextDemoCamera();
      });
      els.demoStatus.textContent = "Live public video";
    } else {
      els.demoStatus.textContent = "Skipped non-video source";
      window.setTimeout(() => state.demoMode && showNextDemoCamera(), 400);
    }
    if (globalThis.lucide) globalThis.lucide.createIcons();
  }

  function isPlayableDemoView(view) {
    if (!view || view.streamStatus === "down") return false;
    if (view.type === "video" || view.type === "hls") return Boolean(view.url);
    if (view.type !== "iframe") return false;
    const url = String(view.url || "");
    const sourceLabel = String(view.sourceLabel || "");
    if (view.capability !== "player") return false;
    if (/official public source page|source page|current image|still/i.test(sourceLabel)) return false;
    return /youtube(?:-nocookie)?\.com\/embed|camstreamer\.com\/embed|player|live/i.test(url + " " + sourceLabel);
  }

  function isLikelyEmbeddedPlayer(camera) {
    const text = [
      camera.id,
      camera.name,
      camera.sourceName,
      camera.sourceUrl,
      camera.sourcePageUrl,
      camera.officialUrl,
      camera.url,
      camera.capabilityLabel,
    ].filter(Boolean).join(" ");
    return camera.capability === "player" || /youtube|youtu\.be|camstreamer|live player|embedded player/i.test(text);
  }

  function uniqueById(items) {
    const seen = new Set();
    return (items || []).filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  function uniqueDemoCandidates(items) {
    const seen = new Set();
    return (items || []).filter((entry) => {
      const id = entry?.camera?.id || entry?.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function isDemoPointVisible(camera) {
    try {
      const point = projectLatLngToStage(Number(camera?.lat), Number(camera?.lng));
      if (!point) return false;
      const rect = els.stage.getBoundingClientRect();
      return point.x > 30 && point.x < rect.width - 430 && point.y > 48 && point.y < rect.height - 60;
    } catch {
      return false;
    }
  }

  function destroyDemoMedia() {
    if (state.demoHls) {
      state.demoHls.destroy();
      state.demoHls = null;
    }
  }

  function updateDemoLink() {
    if (!state.demoMode || !state.demoCamera) return;
    const point = projectLatLngToStage(Number(state.demoCamera.lat), Number(state.demoCamera.lng));
    if (!point) {
      els.demoLink.classList.remove("visible");
      return;
    }
    const stageRect = els.stage.getBoundingClientRect();
    const calloutRect = els.demoCallout.getBoundingClientRect();
    const targetX = calloutRect.left - stageRect.left + 14;
    const targetY = calloutRect.top - stageRect.top + calloutRect.height * 0.56;
    els.demoLinkLine.setAttribute("x1", point.x.toFixed(1));
    els.demoLinkLine.setAttribute("y1", point.y.toFixed(1));
    els.demoLinkLine.setAttribute("x2", targetX.toFixed(1));
    els.demoLinkLine.setAttribute("y2", targetY.toFixed(1));
    els.demoLinkDot.setAttribute("cx", point.x.toFixed(1));
    els.demoLinkDot.setAttribute("cy", point.y.toFixed(1));
    els.demoLink.classList.add("visible");
  }

  function projectLatLngToStage(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const rect = els.stage.getBoundingClientRect();
    if (state.globeRenderer === "cesium" && cesiumGlobe.ready && globalThis.Cesium) {
      const scene = cesiumGlobe.viewer?.scene;
      const cartesian = globalThis.Cesium.Cartesian3.fromDegrees(lng, lat, 10000);
      const screen = globalThis.Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, cartesian);
      if (!screen) return null;
      return { x: screen.x - rect.left, y: screen.y - rect.top };
    }
    if (!globe.camera || !globalThis.THREE) return null;
    const vector = latLngToVector3(lat, lng, 2.08);
    globe.worldGroup?.updateMatrixWorld?.();
    if (globe.worldGroup) vector.applyMatrix4(globe.worldGroup.matrixWorld);
    vector.project(globe.camera);
    if (vector.z > 1) return null;
    return {
      x: (vector.x * 0.5 + 0.5) * rect.width,
      y: (-vector.y * 0.5 + 0.5) * rect.height,
    };
  }

  function primeAlertAudio() {
    try {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext || state.audioContext) return;
      state.audioContext = new AudioContext();
      state.audioContext.resume?.();
    } catch {
      state.audioContext = null;
    }
  }

  function playAlertChime() {
    try {
      primeAlertAudio();
      const context = state.audioContext;
      if (!context) return;
      context.resume?.();
      const now = context.currentTime;
      [0, 0.115].forEach((offset, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(index ? 660 : 520, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.045, now + offset + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.32);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.34);
      });
    } catch {
      // Audio is a nicety; never let browser audio policy interrupt data refresh.
    }
  }

  function cueNewAlert(newCount) {
    if (!newCount) return;
    els.openAlertDrawer.classList.remove("soft-ping");
    void els.openAlertDrawer.offsetWidth;
    els.openAlertDrawer.classList.add("soft-ping");
    window.setTimeout(() => els.openAlertDrawer.classList.remove("soft-ping"), 3200);
    playAlertChime();
  }

  function toggleInsightModal(type, open) {
    const modal = type === "signal" ? els.signalModal : els.layerModal;
    modal.classList.toggle("open", open);
    modal.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      renderCharts();
      if (globalThis.lucide) globalThis.lucide.createIcons();
    }
  }

  function toggleSearchModal(open) {
    state.searchPanelOpen = open;
    els.searchModal.classList.toggle("open", open);
    els.searchModal.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      renderSearchResults();
      window.setTimeout(() => els.searchInput.focus(), 80);
    }
  }

  function renderSearchResults() {
    if (!els.searchResults) return;
    const matches = getSearchMatches().slice(0, 18);
    if (!state.query) {
      els.searchResults.innerHTML = `<div class="empty-state">Type a place, feed, callsign, alert, or source name. Results will center on the globe without jumping down the page.</div>`;
      return;
    }
    if (!matches.length) {
      els.searchResults.innerHTML = `<div class="empty-state">No matching public signals found for "${escapeHtml(state.query)}".</div>`;
      return;
    }
    els.searchResults.innerHTML = matches.map(({ type, item }) => {
      const color = colorForType(type);
      return `<button class="search-result" type="button" data-select-type="${type}" data-select-id="${escapeHtml(item.id)}" data-focus="true">
        <span class="asset-kind" style="color:${color}"><i data-lucide="${iconForType(type)}"></i></span>
        <span><strong>${escapeHtml(item.name || item.callsign || item.title || item.id)}</strong><small>${escapeHtml(assetSubtitle(type, item))}</small></span>
        <em>${escapeHtml(type === "demographic" ? "population" : type)}</em>
      </button>`;
    }).join("");
    if (globalThis.lucide) globalThis.lucide.createIcons();
  }

  function selectSearchResult(type, item) {
    selectObject(type, item, { focus: true, scrollToWatch: false });
    toggleSearchModal(false);
  }

  function togglePanelCollapse(panelId) {
    const panel = panelElement(panelId);
    if (!panel) return;
    const collapsed = !panel.classList.contains("collapsed");
    panel.classList.toggle("collapsed", collapsed);
    state.collapsedPanels[panelId] = collapsed;
    saveCollapsedPanels();
    updateCollapseButtons();
  }

  function panelElement(panelId) {
    return {
      assets: document.querySelector(".top-assets"),
      regions: document.querySelector(".region-summary"),
      alerts: document.querySelector(".alert-summary"),
    }[panelId] || null;
  }

  function applyCollapsedPanels() {
    for (const [panelId, collapsed] of Object.entries(state.collapsedPanels || {})) {
      panelElement(panelId)?.classList.toggle("collapsed", Boolean(collapsed));
    }
    updateCollapseButtons();
  }

  function updateCollapseButtons() {
    document.querySelectorAll("[data-collapse-panel]").forEach((button) => {
      const panel = panelElement(button.dataset.collapsePanel);
      button.textContent = panel?.classList.contains("collapsed") ? "Expand" : "Collapse";
    });
  }

  function initClock() {
    const now = new Date();
    els.clockUtc.textContent = `${now.toISOString().slice(11, 16)} UTC`;
    els.clockLocal.textContent = now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    updateSystemStatusAge();
    updateSnapshotAgeLabels();
  }

  function updateSystemStatusAge(options = {}) {
    if (!state.snapshot?.generatedAt || (!options.force && els.systemStatusLabel.textContent === "Syncing")) return;
    const health = sourceHealthCounts(state.snapshot.sourceHealth || []);
    const staleText = health.stale ? ` | ${health.stale} stale cache${health.stale === 1 ? "" : "s"}` : "";
    const disabledText = health.disabled ? ` | ${health.disabled} optional off` : "";
    els.systemStatusLabel.textContent = health.label;
    els.systemStatusSub.textContent = `${health.responding}/${health.total || 0} core sources${staleText}${disabledText} | updated ${formatTimeAgo(state.snapshot.generatedAt)}`;
  }

  function updateSnapshotAgeLabels() {
    if (!state.snapshot?.generatedAt) return;
    els.theaterSubtitle.textContent = subtitleForScope();
  }

  async function refreshSnapshot(options = {}) {
    if (!options.quiet) {
      els.systemStatusLabel.textContent = "Syncing";
      els.systemStatusSub.textContent = "Refreshing public data";
    }

    try {
      const response = await fetch(`/api/intel-snapshot?scope=${encodeURIComponent(state.scope)}&ts=${Date.now()}`);
      if (!response.ok) throw new Error(`Snapshot failed with status ${response.status}`);
      const nextSnapshot = await response.json();
      const previousAlertIds = state.seenAlertIds;
      state.snapshot = nextSnapshot;
      motionStore.ingest("flight", state.snapshot.flights, Date.now());
      motionStore.ingest("vessel", state.snapshot.vessels || [], Date.now());
      satellitePropagator.ingest(state.snapshot.satellites);
      const currentAlertIds = new Set((state.snapshot.alerts || []).map((alert) => alert.id));
      if (previousAlertIds) {
        const newCount = [...currentAlertIds].filter((id) => !previousAlertIds.has(id)).length;
        if (newCount) cueNewAlert(newCount);
      }
      state.seenAlertIds = currentAlertIds;
      updateTrackHistory(state.snapshot);
      updateSystemStatusAge({ force: true });
      renderAll();

      if (!options.keepSelection || !state.selection) {
        selectFirstAvailableCamera({ silent: true, autoAdvanceOnDown: true });
      } else {
        refreshSelectionReference();
      }
    } catch (error) {
      console.error(error);
      els.systemStatusLabel.textContent = "Degraded";
      els.systemStatusSub.textContent = error.message;
      state.snapshot = buildFallbackSnapshot(error);
      renderAll();
    }
  }

  function renderAll() {
    renderMetrics();
    renderEvents();
    renderRegions();
    renderCharts();
    renderAssets();
    renderTimeline();
    renderSearchResults();
    renderCatalog();
    renderCameraMap();
    renderGlobeLayers();
    els.theaterSubtitle.textContent = subtitleForScope();
    if (globalThis.lucide) globalThis.lucide.createIcons();
  }

  function updateTrackHistory(snapshot) {
    const now = Date.now();
    for (const flight of snapshot?.flights || []) appendTrackPoint("flight", flight, now, 8);
    for (const satellite of snapshot?.satellites || []) appendTrackPoint("satellite", satellite, now, 10);
    for (const vessel of snapshot?.vessels || []) appendTrackPoint("vessel", vessel, now, 12);
    for (const [key, points] of state.trackHistory) {
      const newest = points.at(-1)?.seenAt || 0;
      if (now - newest > 30 * 60 * 1000) state.trackHistory.delete(key);
    }
  }

  function appendTrackPoint(type, item, seenAt, maxPoints) {
    const lat = Number(item.lat);
    const lng = Number(item.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const key = pinKey(type, item.id);
    const points = state.trackHistory.get(key) || [];
    const previous = points.at(-1);
    if (!previous || distanceKm(previous.lat, previous.lng, lat, lng) > 0.5) {
      points.push({ lat, lng, seenAt });
    } else {
      previous.seenAt = seenAt;
    }
    state.trackHistory.set(key, points.slice(-maxPoints));
  }

  function getTrackPoints(type, item) {
    if (type === "vessel" && Array.isArray(item?.trail) && item.trail.length) return item.trail;
    return state.trackHistory.get(pinKey(type, item.id)) || [];
  }

  function subtitleForScope() {
    const snapshot = state.snapshot;
    if (!snapshot) return "Free public intelligence layers fused into one global operating picture.";
    const health = sourceHealthCounts(snapshot.sourceHealth || []);
    const optionalDown = health.optionalTotal - health.optionalResponding;
    const optionalText = optionalDown > 0 ? ` | ${optionalDown} optional unavailable or off` : "";
    const staleText = health.stale ? ` | ${health.stale} stale cache${health.stale === 1 ? "" : "s"}` : "";
    return `${labelForScope(state.scope)} scope | auto-refresh 60s | ${health.responding}/${health.total} core adapters responding${optionalText}${staleText} | ${formatTimeAgo(snapshot.generatedAt)}`;
  }

  function sourceHealthCounts(sources) {
    return summarizeSourceHealth(sources);
  }

  function renderMetrics() {
    const snapshot = state.snapshot || buildFallbackSnapshot();
    const activeLayers = LAYERS.filter((layer) => state.layers[layer.id]).length;
    const livePlayers = snapshot.cameras.filter((camera) => camera.capability === "player" || camera.capability === "stream").length;
    const values = [
      { label: "Public Signals", value: snapshot.metrics.eventsToday, delta: "+ live" },
      { label: "Active Alerts", value: snapshot.metrics.alerts, delta: `${snapshot.alerts.length} official` },
      { label: "Fire Signals", value: snapshot.fires?.length || 0, delta: "FIRMS + EGP" },
      { label: "Camera Feeds", value: snapshot.metrics.cameraFeeds || snapshot.cameras.length, delta: `${livePlayers} playable video feeds` },
    ];

    els.metricStrip.innerHTML = values.map(
      (metric) => `<article class="metric-card"><span>${metric.label}</span><strong>${formatNumber(metric.value)}</strong><small>${metric.delta}</small></article>`
    ).join("");
  }

  function renderEvents() {
    const allEvents = getFilteredEvents();
    const events = allEvents.slice(0, 5);
    const alertEvents = getDisplayAlerts().slice(0, 30);
    els.alertDrawerCount.textContent = String(alertEvents.length || state.snapshot?.alerts?.length || 0);
    els.alertDrawerList.innerHTML = alertEvents.length
      ? alertEvents.map(renderEventCard).join("")
      : `<div class="empty-state">No active alert signals in this scope.</div>`;

    if (!events.length) {
      return;
    }
  }

  function getDisplayAlerts() {
    const alerts = [...(state.snapshot?.alerts || [])].sort((left, right) => {
      const leftTier = alertDisplayTier(left);
      const rightTier = alertDisplayTier(right);
      if (leftTier !== rightTier) return leftTier - rightTier;
      return (Date.parse(right.time || "") || 0) - (Date.parse(left.time || "") || 0);
    });
    const actionable = alerts.filter((alert) => alertDisplayTier(alert) < 2);
    return actionable.length ? actionable : alerts;
  }

  function isReferenceAlert(alert = {}) {
    return /reference/i.test(`${alert.event || ""} ${alert.severity || ""}`) || /reference monitor/i.test(alert.id || "");
  }

  function alertDisplayTier(alert = {}) {
    const text = `${alert.event || ""} ${alert.title || ""} ${alert.severity || ""} ${alert.source || ""}`;
    if (/test message/i.test(text) || isReferenceAlert(alert)) return 2;
    if (/open reporting|open source|gdelt/i.test(text)) return 1;
    return 0;
  }

  function renderEventCard(event) {
    const icon = iconForType(event.type);
    const color = colorForType(event.type);
    const subtitle = event.type === "alert"
      ? `${event.event || "Weather alert"} | ${event.areaSummary || event.region || "NWS"}`
      : event.region || event.location || event.source || "Public signal";
    return `<button class="event-card" type="button" data-select-type="${event.type}" data-select-id="${event.id}" ${event.type === "alert" ? 'data-focus="true" data-pulse="true"' : ""}>
      <span class="event-icon" style="color:${color}"><i data-lucide="${icon}"></i></span>
      <span><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(subtitle)}</p></span>
      <span class="event-chip" style="color:${color}">${escapeHtml(event.severity || event.type)}</span>
    </button>`;
  }

  function renderRegions() {
    const regions = [...(state.snapshot?.regions || [])];
    regions.sort((left, right) =>
      state.regionSortAlpha ? left.name.localeCompare(right.name) : right.total - left.total
    );

    els.regionList.innerHTML = regions
      .slice(0, 8)
      .map(
        (region, index) => `<div class="region-row">
          <span class="region-dot" style="color:${region.color || palette(index)}"></span>
          <span>${escapeHtml(region.name)}</span>
          <strong>${formatNumber(region.total)}</strong>
          <small>${region.delta || "+ live"}</small>
        </div>`
      )
      .join("");
  }

  function renderCharts() {
    const snapshot = state.snapshot || buildFallbackSnapshot();
    const values = LAYERS.map((layer) => Array.isArray(snapshot[layer.id]) ? snapshot[layer.id].length : 0);
    const total = values.reduce((sum, value) => sum + value, 0);
    const severityTotal = Object.values(snapshot.severity || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    els.signalTotal.textContent = formatNumber(total);
    els.layerTotal.textContent = formatNumber(total);
    els.alertTotal.textContent = formatNumber(severityTotal);
    drawSparkline(els.signalChart, buildSignalSeries(values));
    drawDonut(els.layerDonut, values, LAYERS.map((layer) => layer.color));
    renderLayerLegend(values);
    renderSeverityGrid(snapshot);
  }

  function renderLayerLegend(values) {
    els.layerLegend.innerHTML = LAYERS.map((layer, index) => {
      const value = values[index] || 0;
      return `<div class="legend-row" style="color:${layer.color}">
        <span class="legend-swatch"></span><span>${layer.label}</span><strong>${formatNumber(value)}</strong>
      </div>`;
    }).join("");
  }

  function renderSeverityGrid(snapshot) {
    const severity = snapshot.severity || { critical: 0, high: 0, medium: 0, low: 0 };
    const rows = [
      ["Critical", severity.critical || 0, COLORS.quakes],
      ["High", severity.high || 0, COLORS.flights],
      ["Medium", severity.medium || 0, COLORS.alerts],
      ["Low", severity.low || 0, COLORS.cameras],
    ];
    const max = Math.max(...rows.map((row) => row[1]), 1);
    els.severityGrid.innerHTML = rows
      .map(
        ([label, value, color]) => `<div class="severity-row">
          <span>${label}</span>
          <strong>${value}</strong>
          <div class="severity-bar" style="grid-column:1 / -1"><span style="width:${Math.max(8, (value / max) * 100)}%; background:${color}"></span></div>
        </div>`
      )
      .join("");
  }

  function renderAssets(showAll = false) {
    const assets = getFilteredAssets().slice(0, showAll ? 24 : state.assetLimit);
    const pinned = getPinnedAssets();
    if (!assets.length) {
      els.assetList.innerHTML = `${renderPinnedShelf(pinned)}<div class="empty-state">No matching assets.</div>`;
      return;
    }

    els.assetList.innerHTML = renderPinnedShelf(pinned) + assets
      .map(({ type, item }) => {
        const color = colorForType(type);
        return `<button class="asset-row" type="button" data-select-type="${type}" data-select-id="${item.id}">
          <span class="asset-kind" style="color:${color}"><i data-lucide="${iconForType(type)}"></i></span>
          <span><h3>${escapeHtml(item.name || item.callsign || item.title || item.id)}</h3><p>${escapeHtml(assetSubtitle(type, item))}</p></span>
          <span class="capability-chip" style="color:${color}">${escapeHtml(type)}</span>
        </button>`;
      })
      .join("");
  }

  function renderPinnedShelf(pinned) {
    if (!pinned.length) return "";
    return `<div class="pinned-shelf">
      <div class="pinned-head"><span>Pinned</span><small>${pinned.length}</small></div>
      ${pinned
        .map(({ type, item, key }) => {
          const color = colorForType(type);
          return `<div class="pinned-row">
            <button type="button" data-select-type="${type}" data-select-id="${item.id}" data-focus="true">
              <i data-lucide="${iconForType(type)}" style="color:${color}"></i>
              <span>${escapeHtml(item.name || item.callsign || item.title || item.id)}</span>
            </button>
            <button class="pin-remove" type="button" title="Unpin" data-unpin-asset="${escapeHtml(key)}"><i data-lucide="x"></i></button>
          </div>`;
        })
        .join("")}
    </div>`;
  }

  function renderTimeline() {
    const events = (state.snapshot?.events || []).slice(0, 6);
    els.timeline.innerHTML = events
      .map(
        (event) => `<button class="timeline-node" type="button" data-select-type="${event.type}" data-select-id="${event.id}">
          <strong>${formatShortTime(event.time || event.generatedAt)}</strong>
          <span>${escapeHtml(event.title || "Public signal")}</span>
        </button>`
      )
      .join("");
  }

  function pinKey(type, id) {
    return `${type}:${id}`;
  }

  function isPinned(type, id) {
    return state.pinnedAssets.some((asset) => asset.type === type && asset.id === id);
  }

  function togglePinnedAsset(type, item) {
    const key = pinKey(type, item.id);
    if (isPinned(type, item.id)) {
      state.pinnedAssets = state.pinnedAssets.filter((asset) => pinKey(asset.type, asset.id) !== key);
    } else {
      state.pinnedAssets = [{ type, id: item.id }, ...state.pinnedAssets].slice(0, 12);
    }
    savePinnedAssets();
    renderAssets();
    renderSelectionCard(type, item);
    renderWatch(type, item, { loading: type === "camera" && !state.feedView });
    if (globalThis.lucide) globalThis.lucide.createIcons();
  }

  function removePinnedAsset(key) {
    state.pinnedAssets = state.pinnedAssets.filter((asset) => pinKey(asset.type, asset.id) !== key);
    savePinnedAssets();
    renderAssets();
    if (state.selection?.item) renderSelectionCard(state.selection.type, state.selection.item);
    if (globalThis.lucide) globalThis.lucide.createIcons();
  }

  function getPinnedAssets() {
    return state.pinnedAssets
      .map((asset) => {
        const item = findItem(asset.type, asset.id);
        return item ? { ...asset, item, key: pinKey(asset.type, asset.id) } : null;
      })
      .filter(Boolean);
  }

  function loadPinnedAssets() {
    try {
      const parsed = JSON.parse(localStorage.getItem("oversee:pinned-assets") || "[]");
      return Array.isArray(parsed) ? parsed.filter((asset) => asset?.type && asset?.id).slice(0, 12) : [];
    } catch {
      return [];
    }
  }

  function savePinnedAssets() {
    localStorage.setItem("oversee:pinned-assets", JSON.stringify(state.pinnedAssets));
  }

  function loadCollapsedPanels() {
    try {
      const parsed = JSON.parse(localStorage.getItem("oversee:collapsed-panels") || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveCollapsedPanels() {
    localStorage.setItem("oversee:collapsed-panels", JSON.stringify(state.collapsedPanels || {}));
  }

  function renderCatalog() {
    const allMatches = getFilteredCameras();
    const mapMatches = getMapCameras();
    const catalogSet = getCatalogCameraSet(allMatches);
    const cameras = catalogSet.cameras;
    const visible = cameras.slice(0, state.catalogLimit);
    const loadedCount = state.snapshot?.cameraCatalogTotal || mapMatches.length || allMatches.length;
    const filterLabel = activeCameraFilterLabel();
    const hiddenStreamCount = hiddenStreamCameraCount();
    els.catalogTitle.textContent = state.mapListMode ? "Cameras In Map View" : "Camera Browser";
    els.catalogHelp.textContent = state.mapListMode
      ? "This list is scoped to the visible map bounds. Pan or zoom the map to change the area, or choose All Areas to reset."
      : "Showing all matching cameras. Pan or zoom the map to focus the list on an area.";
    els.cameraMapMeta.textContent =
      state.cameraFilter === "all"
        ? state.mapListMode
          ? `${formatNumber(cameras.length)} ${catalogSet.label} | ${formatNumber(allMatches.length)} listed | ${formatNumber(mapMatches.length)} cameras on map`
          : `${formatNumber(allMatches.length)} listed | ${formatNumber(mapMatches.length)} cameras on map | ${formatNumber(loadedCount)} loaded`
        : state.mapListMode
          ? `${formatNumber(cameras.length)} ${catalogSet.label} | ${formatNumber(allMatches.length)} ${filterLabel} listed | ${formatNumber(mapMatches.length)} cameras on map`
          : `${formatNumber(mapMatches.length)} cameras on map | ${formatNumber(allMatches.length)} ${filterLabel} highlighted/listed | ${formatNumber(loadedCount)} loaded`;
    if (hiddenStreamCount && !state.includeDownStreams) {
      els.cameraMapMeta.textContent += ` | ${formatNumber(hiddenStreamCount)} unverified/down hidden`;
    }
    if (!state.showCameraMapMarkers) {
      els.cameraMapMeta.textContent += " | camera dots hidden";
    }

    if (!cameras.length) {
      els.catalogList.innerHTML = `<div class="empty-state">No matching cameras.</div>`;
      els.loadMoreCameras.hidden = true;
      return;
    }

    els.catalogList.innerHTML = visible
      .map(
        (camera) => `<button class="catalog-card ${state.selection?.id === camera.id ? "selected" : ""}" type="button" data-select-type="camera" data-select-id="${camera.id}">
          <span><h3>${escapeHtml(camera.name)}</h3><p>${escapeHtml(camera.area)} | ${escapeHtml(camera.sourceName)} | ${escapeHtml(camera.capabilityLabel)}</p></span>
          <span class="capability-chip" style="color:${colorForCamera(camera)}">${escapeHtml(cameraStatusLabel(camera))}</span>
        </button>`
      )
      .join("");
    els.loadMoreCameras.hidden = visible.length >= cameras.length;
    els.loadMoreCameras.textContent = `Load More (${formatNumber(Math.min(120, cameras.length - visible.length))})`;
  }

  function setScope(scopeId) {
    state.scope = scopeId;
    state.mapListMode = false;
    state.hasFitCameraMap = false;
    document.querySelectorAll("[data-scope]").forEach((button) => {
      button.classList.toggle("active", button.dataset.scope === scopeId);
    });
    flyGlobeToScope(scopeId);
    refreshSnapshot({ keepSelection: true });
  }

  function setSensorMode(modeId) {
    state.sensorMode = modeId;
    document.body.classList.remove(...SENSOR_MODES.map((mode) => `sensor-${mode.id}`));
    document.body.classList.add(`sensor-${modeId}`);
    document.querySelectorAll("[data-sensor-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.sensorMode === modeId);
    });
  }

  function setEarthView(viewId) {
    if (!EARTH_VIEWS.some((view) => view.id === viewId)) return;
    state.earthView = viewId;
    if (viewId === "topo" && state.globeRenderer !== "cesium") setGlobeRenderer("cesium");
    document.querySelectorAll("[data-earth-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.earthView === viewId);
    });
    applyEarthView();
    updateCesiumBaseLayer();
  }

  function setGlobeRenderer(rendererId) {
    const requested = rendererId === "cesium" ? "cesium" : "three";
    if (requested !== "cesium" && state.globeTrafficOverlay) {
      state.globeTrafficOverlay = false;
      els.toggleGlobeTraffic.classList.remove("active");
      els.toggleGlobeTraffic.setAttribute("aria-pressed", "false");
      setTrafficStatusChip(els.globeTrafficStatus, "", { hidden: true });
      clearGlobeTrafficOverlay();
    }
    state.globeRenderer = requested === "cesium" && !globalThis.Cesium ? "three" : requested;
    localStorage.setItem("oversee:globe-renderer", state.globeRenderer);
    document.querySelectorAll("[data-globe-renderer]").forEach((button) => {
      button.classList.toggle("active", button.dataset.globeRenderer === state.globeRenderer);
    });
    updateRendererVisibility();
    if (state.globeRenderer === "cesium" && !cesiumGlobe.ready) initCesiumGlobe();
    renderGlobeLayers();
    if (state.selection?.item) {
      renderSelectedGlobeFocus(state.selection.type, state.selection.item);
      focusGlobeOnItem(state.selection.item);
    } else {
      flyGlobeToScope(state.scope);
    }
  }

  function updateRendererVisibility() {
    const useCesium = state.globeRenderer === "cesium" && globalThis.Cesium && !cesiumGlobe.failed;
    els.stage?.classList.toggle("renderer-cesium", useCesium);
    els.stage?.classList.toggle("renderer-three", !useCesium);
    if (!useCesium && state.globeRenderer === "cesium") {
      state.globeRenderer = "three";
      document.querySelectorAll("[data-globe-renderer]").forEach((button) => {
        button.classList.toggle("active", button.dataset.globeRenderer === state.globeRenderer);
      });
    }
    if (useCesium) {
      window.setTimeout(() => {
        cesiumGlobe.viewer?.resize?.();
        renderCesiumLayers({ retry: true });
        cesiumGlobe.viewer?.scene?.requestRender?.();
      }, 80);
    }
  }

  function cycleSensorMode() {
    const index = SENSOR_MODES.findIndex((mode) => mode.id === state.sensorMode);
    const next = SENSOR_MODES[(index + 1) % SENSOR_MODES.length];
    setSensorMode(next.id);
  }

  function initGlobe() {
    if (!globalThis.THREE || !els.globeCanvas) {
      els.selectionCard.innerHTML = `<p class="error-state">3D renderer unavailable.</p>`;
      return;
    }

    const THREE = globalThis.THREE;
    const rect = els.globeCanvas.getBoundingClientRect();
    globe.scene = new THREE.Scene();
    globe.scene.fog = new THREE.FogExp2(0x02070b, 0.06);
    globe.camera = new THREE.PerspectiveCamera(42, Math.max(1, rect.width) / Math.max(1, rect.height), 0.1, 1000);
    globe.camera.position.set(0, 0.45, 6.1);

    globe.renderer = new THREE.WebGLRenderer({ canvas: els.globeCanvas, antialias: true, alpha: true });
    globe.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    globe.renderer.setSize(rect.width, rect.height, false);

    if (THREE.OrbitControls) {
      globe.controls = new THREE.OrbitControls(globe.camera, els.globeCanvas);
      globe.controls.enableDamping = true;
      globe.controls.dampingFactor = 0.06;
      globe.controls.rotateSpeed = 0.42;
      globe.controls.zoomSpeed = 0.65;
      globe.controls.minDistance = 3.1;
      globe.controls.maxDistance = 10.5;
    }

    globe.raycaster = new THREE.Raycaster();
    globe.pointer = new THREE.Vector2();

    globe.scene.add(new THREE.AmbientLight(0x87b7ff, 0.68));
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(3, 2.5, 5);
    globe.scene.add(key);
    const rim = new THREE.PointLight(0x19e2ff, 1.8, 12);
    rim.position.set(-4, 2, -3);
    globe.scene.add(rim);

    globe.worldGroup = new THREE.Group();
    globe.scene.add(globe.worldGroup);

    globe.defaultEarthTexture = createEarthTexture();
    globe.earth = new THREE.Mesh(
      new THREE.SphereGeometry(2, 96, 96),
      new THREE.MeshPhongMaterial({
        map: globe.defaultEarthTexture,
        color: 0xffffff,
        emissive: 0x03111d,
        emissiveIntensity: 0.34,
        shininess: 10,
      })
    );
    globe.worldGroup.add(globe.earth);

    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(2.012, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x1aa7ff, wireframe: true, transparent: true, opacity: 0.07 })
    );
    globe.worldGroup.add(wire);

    globe.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(2.08, 96, 96),
      new THREE.MeshBasicMaterial({ color: 0x19e2ff, transparent: true, opacity: 0.08, side: THREE.BackSide })
    );
    globe.worldGroup.add(globe.atmosphere);

    globe.scene.add(createStarfield());
    for (const layer of LAYERS) {
      const group = new THREE.Group();
      group.name = layer.id;
      globe.groups[layer.id] = group;
      globe.worldGroup.add(group);
    }
    globe.selectionGroup = new THREE.Group();
    globe.selectionGroup.name = "selection-focus";
    globe.worldGroup.add(globe.selectionGroup);

    els.globeCanvas.addEventListener("pointerdown", (event) => {
      globe.dragging = false;
      globe.dragStartedAt = [event.clientX, event.clientY];
    });
    els.globeCanvas.addEventListener("pointermove", (event) => {
      const dx = event.clientX - globe.dragStartedAt[0];
      const dy = event.clientY - globe.dragStartedAt[1];
      if (Math.hypot(dx, dy) > 5) globe.dragging = true;
    });
    els.globeCanvas.addEventListener("click", onGlobeClick);
    window.addEventListener("resize", resizeGlobe);
    if (globalThis.ResizeObserver) {
      const observer = new ResizeObserver(resizeGlobe);
      observer.observe(els.globeCanvas.parentElement || els.globeCanvas);
    }
    setTimeout(resizeGlobe, 50);
    setTimeout(resizeGlobe, 500);
    applyEarthView();
    animateGlobe();
  }

  async function initCesiumGlobe() {
    if (cesiumGlobe.loading || cesiumGlobe.ready || !els.cesiumGlobe) return;
    if (!globalThis.Cesium) {
      cesiumGlobe.failed = true;
      updateRendererVisibility();
      return;
    }

    cesiumGlobe.loading = true;
    const Cesium = globalThis.Cesium;
    try {
      Cesium.Ion.defaultAccessToken = "";
      const viewer = new Cesium.Viewer(els.cesiumGlobe, {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        shouldAnimate: false,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
        imageryProvider: false,
        terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      });

      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.depthTestAgainstTerrain = false;
      viewer.scene.fog.enabled = true;
      viewer.scene.skyAtmosphere.show = true;
      viewer.scene.postProcessStages.fxaa.enabled = true;
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-25, 22, 22000000),
      });

      cesiumGlobe.viewer = viewer;
      for (const layer of LAYERS) {
        const source = new Cesium.CustomDataSource(`oversee-${layer.id}`);
        cesiumGlobe.sources[layer.id] = source;
        await viewer.dataSources.add(source);
        cesiumGlobe.pointLayers[layer.id] = new CesiumPointLayer({ viewer, Cesium, id: layer.id });
      }
      cesiumGlobe.selectionSource = new Cesium.CustomDataSource("oversee-selection");
      await viewer.dataSources.add(cesiumGlobe.selectionSource);
      cesiumGlobe.trafficLayer = new CesiumRoadTrafficLayer({ viewer, Cesium });

      await updateCesiumBaseLayer();
      updateCesiumWeatherLayer();
      updateCesiumFloodLayer();
      updateCesiumTrafficLayer();

      viewer.screenSpaceEventHandler.setInputAction((movement) => {
        const picked = viewer.scene.pick(movement.position);
        const data = picked?.id?.oversee;
        if (data?.item) selectObject(data.type, displayItemForGlobe(data.type, data.item), { focus: false });
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      viewer.camera.moveEnd.addEventListener(() => {
        renderCesiumLayers();
        scheduleGlobeTrafficRefresh();
      });

      cesiumGlobe.ready = true;
      cesiumGlobe.failed = false;
      startCesiumMotionUpdates();
      renderCesiumLayers();
      updateRendererVisibility();
    } catch (error) {
      console.warn("Cesium renderer unavailable", error);
      cesiumGlobe.failed = true;
      state.globeRenderer = "three";
      updateRendererVisibility();
    } finally {
      cesiumGlobe.loading = false;
    }
  }

  async function makeCesiumImageryProvider() {
    const Cesium = globalThis.Cesium;
    const url = state.earthView === "topo" ? USGS_TOPO_ARCGIS_URL : WORLD_IMAGERY_ARCGIS_URL;
    try {
      if (Cesium.ArcGisMapServerImageryProvider?.fromUrl) {
        return await Cesium.ArcGisMapServerImageryProvider.fromUrl(url);
      }
      return new Cesium.ArcGisMapServerImageryProvider({ url });
    } catch {
      return null;
    }
  }

  async function updateCesiumBaseLayer() {
    const viewer = cesiumGlobe.viewer;
    if (!viewer || !globalThis.Cesium) {
      if (state.globeWeatherOverlay) {
        state.globeWeatherOverlay = false;
        els.toggleGlobeWeather.classList.remove("active");
        els.toggleGlobeWeather.setAttribute("aria-pressed", "false");
      }
      return;
    }
    const provider = await makeCesiumImageryProvider();
    if (!provider) return;
    if (cesiumGlobe.baseLayer) {
      viewer.imageryLayers.remove(cesiumGlobe.baseLayer, false);
      cesiumGlobe.baseLayer = null;
    }
    cesiumGlobe.baseLayer = viewer.imageryLayers.addImageryProvider(provider, 0);
    cesiumGlobe.baseLayer.alpha = 1;
  }

  async function makeNoaaRadarProvider() {
    const Cesium = globalThis.Cesium;
    if (!Cesium) return null;
    try {
      if (Cesium.ArcGisMapServerImageryProvider?.fromUrl) {
        return await Cesium.ArcGisMapServerImageryProvider.fromUrl(NOAA_RADAR_ARCGIS_URL);
      }
      return new Cesium.ArcGisMapServerImageryProvider({ url: NOAA_RADAR_ARCGIS_URL });
    } catch (error) {
      console.warn("NOAA radar overlay unavailable", error);
      return null;
    }
  }

  async function makeFemaFloodProvider() {
    const Cesium = globalThis.Cesium;
    if (!Cesium) return null;
    const options = { layers: FEMA_FLOOD_LAYERS };
    try {
      if (Cesium.ArcGisMapServerImageryProvider?.fromUrl) {
        return await Cesium.ArcGisMapServerImageryProvider.fromUrl(FEMA_FLOOD_ARCGIS_URL, options);
      }
      return new Cesium.ArcGisMapServerImageryProvider({ url: FEMA_FLOOD_ARCGIS_URL, ...options });
    } catch (error) {
      console.warn("FEMA flood overlay unavailable", error);
      return null;
    }
  }

  async function toggleGlobeWeatherOverlay() {
    state.globeWeatherOverlay = !state.globeWeatherOverlay;
    if (state.globeWeatherOverlay && state.globeRenderer !== "cesium") {
      setGlobeRenderer("cesium");
    }
    await ensureCesiumGlobeReady();
    await updateCesiumWeatherLayer();
  }

  async function updateCesiumWeatherLayer() {
    els.toggleGlobeWeather.classList.toggle("active", state.globeWeatherOverlay);
    els.toggleGlobeWeather.setAttribute("aria-pressed", state.globeWeatherOverlay ? "true" : "false");

    const viewer = cesiumGlobe.viewer;
    if (!viewer || !globalThis.Cesium) {
      if (state.globeFloodOverlay) {
        state.globeFloodOverlay = false;
        els.toggleGlobeFlood.classList.remove("active");
        els.toggleGlobeFlood.setAttribute("aria-pressed", "false");
      }
      return;
    }

    if (!state.globeWeatherOverlay) {
      if (cesiumGlobe.weatherLayer) {
        viewer.imageryLayers.remove(cesiumGlobe.weatherLayer, false);
        cesiumGlobe.weatherLayer = null;
      }
      return;
    }

    if (cesiumGlobe.weatherLayer) return;
    const provider = await makeNoaaRadarProvider();
    if (!provider) {
      state.globeWeatherOverlay = false;
      els.toggleGlobeWeather.classList.remove("active");
      els.toggleGlobeWeather.setAttribute("aria-pressed", "false");
      return;
    }
    cesiumGlobe.weatherLayer = viewer.imageryLayers.addImageryProvider(provider);
    cesiumGlobe.weatherLayer.alpha = 0.58;
    cesiumGlobe.weatherLayer.brightness = 1.08;
  }

  async function toggleGlobeFloodOverlay() {
    state.globeFloodOverlay = !state.globeFloodOverlay;
    if (state.globeFloodOverlay && state.globeRenderer !== "cesium") {
      setGlobeRenderer("cesium");
    }
    await ensureCesiumGlobeReady();
    await updateCesiumFloodLayer();
  }

  async function updateCesiumFloodLayer() {
    els.toggleGlobeFlood.classList.toggle("active", state.globeFloodOverlay);
    els.toggleGlobeFlood.setAttribute("aria-pressed", state.globeFloodOverlay ? "true" : "false");

    const viewer = cesiumGlobe.viewer;
    if (!viewer || !globalThis.Cesium) return;

    if (!state.globeFloodOverlay) {
      if (cesiumGlobe.floodLayer) {
        viewer.imageryLayers.remove(cesiumGlobe.floodLayer, false);
        cesiumGlobe.floodLayer = null;
      }
      return;
    }

    if (cesiumGlobe.floodLayer) return;
    const provider = await makeFemaFloodProvider();
    if (!provider) {
      state.globeFloodOverlay = false;
      els.toggleGlobeFlood.classList.remove("active");
      els.toggleGlobeFlood.setAttribute("aria-pressed", "false");
      return;
    }
    cesiumGlobe.floodLayer = viewer.imageryLayers.addImageryProvider(provider);
    cesiumGlobe.floodLayer.alpha = 0.72;
    cesiumGlobe.floodLayer.brightness = 1.05;
  }

  async function ensureTrafficStatus(options = {}) {
    const isFresh = state.trafficStatus && Date.now() - state.trafficStatusFetchedAt < 60 * 1000;
    if (isFresh && !options.force) return state.trafficStatus;
    try {
      const response = await fetch(`/api/traffic/status?ts=${Date.now()}`);
      if (!response.ok) throw new Error(`Traffic status failed with ${response.status}`);
      state.trafficStatus = await response.json();
      state.trafficStatusFetchedAt = Date.now();
    } catch (error) {
      state.trafficStatus = {
        mode: "modeled",
        health: "degraded",
        provider: "OpenStreetMap road model",
        detail: "Road traffic status is temporarily unavailable.",
        message: error.message,
      };
      state.trafficStatusFetchedAt = Date.now();
    }
    return state.trafficStatus;
  }

  async function toggleGlobeTrafficOverlay() {
    state.globeTrafficOverlay = !state.globeTrafficOverlay;
    els.toggleGlobeTraffic.classList.toggle("active", state.globeTrafficOverlay);
    els.toggleGlobeTraffic.setAttribute("aria-pressed", state.globeTrafficOverlay ? "true" : "false");
    if (!state.globeTrafficOverlay) {
      clearGlobeTrafficOverlay();
      setTrafficStatusChip(els.globeTrafficStatus, "", { hidden: true });
      return;
    }
    setTrafficStatusChip(els.globeTrafficStatus, "Checking traffic source", { state: "loading" });
    if (state.globeRenderer !== "cesium") setGlobeRenderer("cesium");
    await ensureCesiumGlobeReady();
    await ensureTrafficStatus({ force: true });
    await updateCesiumTrafficLayer();
  }

  async function updateCesiumTrafficLayer() {
    els.toggleGlobeTraffic.classList.toggle("active", state.globeTrafficOverlay);
    els.toggleGlobeTraffic.setAttribute("aria-pressed", state.globeTrafficOverlay ? "true" : "false");
    if (!state.globeTrafficOverlay) {
      clearGlobeTrafficOverlay();
      return;
    }
    if (!cesiumGlobe.viewer || !cesiumGlobe.trafficLayer) return;
    cesiumGlobe.trafficLayer.setVisible(true);
    await refreshGlobeTrafficOverlay();
  }

  function scheduleGlobeTrafficRefresh() {
    if (!state.globeTrafficOverlay) return;
    window.clearTimeout(cesiumGlobe.trafficRefreshTimer);
    cesiumGlobe.trafficRefreshTimer = window.setTimeout(refreshGlobeTrafficOverlay, 520);
  }

  async function refreshGlobeTrafficOverlay() {
    if (!state.globeTrafficOverlay || !cesiumGlobe.viewer || !cesiumGlobe.trafficLayer) return;
    const status = await ensureTrafficStatus();
    const view = getCesiumTrafficView();
    if (!view) {
      removeCesiumTrafficImagery();
      cesiumGlobe.trafficLayer.setVisible(false);
      setTrafficStatusChip(els.globeTrafficStatus, "Zoom closer for road traffic", {
        state: "zoom",
        title: "Road traffic appears at city and metro scale to protect public services and API budgets.",
      });
      return;
    }

    cesiumGlobe.trafficLayer.setVisible(true);
    if (status.mode === "live" && status.health !== "budget-exhausted") ensureCesiumTrafficImagery();
    else removeCesiumTrafficImagery();
    const boundsKey = `${view.detail}:${view.bbox}`;
    if (cesiumGlobe.trafficBoundsKey === boundsKey && cesiumGlobe.trafficLayer.particles.length) {
      renderTrafficModeStatus(els.globeTrafficStatus, status);
      return;
    }

    const requestToken = ++cesiumGlobe.trafficRequestToken;
    setTrafficStatusChip(els.globeTrafficStatus, "Loading roads", { state: "loading" });
    try {
      const response = await fetch(`/api/traffic/roads?bbox=${encodeURIComponent(view.bbox)}&detail=${view.detail}&ts=${Date.now()}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || payload.error || `Road query failed with ${response.status}`);
      if (requestToken !== cesiumGlobe.trafficRequestToken || !state.globeTrafficOverlay) return;
      cesiumGlobe.trafficBoundsKey = boundsKey;
      cesiumGlobe.trafficLayer.setRoads(payload.roads, { mode: status.mode });
      renderTrafficModeStatus(els.globeTrafficStatus, status, payload.roads.length ? "" : "No mapped major roads in view");
      if (status.mode === "live") {
        window.setTimeout(async () => {
          if (!state.globeTrafficOverlay) return;
          const refreshed = await ensureTrafficStatus({ force: true });
          renderTrafficModeStatus(els.globeTrafficStatus, refreshed);
        }, 2600);
      }
    } catch (error) {
      if (requestToken !== cesiumGlobe.trafficRequestToken) return;
      cesiumGlobe.trafficLayer.clear();
      setTrafficStatusChip(els.globeTrafficStatus, "Road layer unavailable", { state: "error", title: error.message });
    }
  }

  function getCesiumTrafficView() {
    const viewer = cesiumGlobe.viewer;
    const Cesium = globalThis.Cesium;
    if (!viewer || !Cesium) return null;
    const height = Number(viewer.camera.positionCartographic?.height || Infinity);
    if (!Number.isFinite(height) || height > 900000) return null;
    const rectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    if (!rectangle) return null;
    const west = Cesium.Math.toDegrees(rectangle.west);
    const south = Math.max(-85, Cesium.Math.toDegrees(rectangle.south));
    const east = Cesium.Math.toDegrees(rectangle.east);
    const north = Math.min(85, Cesium.Math.toDegrees(rectangle.north));
    if (![west, south, east, north].every(Number.isFinite) || east <= west) return null;
    const lngSpan = east - west;
    const latSpan = north - south;
    if (lngSpan > 5.4 || latSpan > 4.4 || lngSpan * latSpan > 17.5) return null;
    const detail = height < 210000 && lngSpan < 1.7 && latSpan < 1.7 ? "local" : "major";
    return {
      detail,
      bbox: [west, south, east, north].map((value) => value.toFixed(5)).join(","),
    };
  }

  function ensureCesiumTrafficImagery() {
    const viewer = cesiumGlobe.viewer;
    const Cesium = globalThis.Cesium;
    if (!viewer || !Cesium || cesiumGlobe.trafficImageryLayer) return;
    try {
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: "/api/traffic/flow/{z}/{x}/{y}.png",
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
        minimumLevel: 0,
        maximumLevel: 20,
        credit: new Cesium.Credit("TomTom Traffic"),
      });
      cesiumGlobe.trafficImageryLayer = viewer.imageryLayers.addImageryProvider(provider);
      cesiumGlobe.trafficImageryLayer.alpha = 0.82;
      cesiumGlobe.trafficImageryLayer.brightness = 1.12;
      cesiumGlobe.trafficImageryLayer.contrast = 1.14;
    } catch (error) {
      console.warn("Live traffic imagery unavailable", error);
    }
  }

  function removeCesiumTrafficImagery() {
    if (!cesiumGlobe.viewer || !cesiumGlobe.trafficImageryLayer) return;
    cesiumGlobe.viewer.imageryLayers.remove(cesiumGlobe.trafficImageryLayer, false);
    cesiumGlobe.trafficImageryLayer = null;
  }

  function clearGlobeTrafficOverlay() {
    window.clearTimeout(cesiumGlobe.trafficRefreshTimer);
    cesiumGlobe.trafficRequestToken += 1;
    cesiumGlobe.trafficBoundsKey = "";
    removeCesiumTrafficImagery();
    cesiumGlobe.trafficLayer?.clear();
    cesiumGlobe.trafficLayer?.setVisible(false);
  }

  function renderTrafficModeStatus(element, status, override = "") {
    if (override) {
      setTrafficStatusChip(element, override, { state: "empty", title: status?.detail || "" });
      return;
    }
    if (status?.mode === "live") {
      const healthLabel = status.health === "budget-exhausted"
        ? "Daily ceiling reached"
        : status.health === "degraded"
          ? "Live traffic degraded"
          : status.health === "ready"
            ? "Live traffic ready"
            : "Live traffic · TomTom";
      setTrafficStatusChip(element, healthLabel, {
        state: status.health === "degraded" || status.health === "budget-exhausted" ? "error" : "live",
        title: [status.detail, status.message].filter(Boolean).join(" "),
      });
      return;
    }
    setTrafficStatusChip(element, "Modeled traffic · OSM", {
      state: status?.health === "degraded" ? "error" : "modeled",
      title: status?.detail || "Illustrative road movement, not observed traffic.",
    });
  }

  function setTrafficStatusChip(element, text, options = {}) {
    if (!element) return;
    element.hidden = Boolean(options.hidden);
    element.textContent = text;
    element.dataset.state = options.state || "";
    element.title = options.title || "";
  }

  async function ensureCesiumGlobeReady() {
    if (cesiumGlobe.ready || state.globeRenderer !== "cesium") return;
    if (!cesiumGlobe.loading) initCesiumGlobe();
    for (let attempt = 0; attempt < 24; attempt += 1) {
      if (cesiumGlobe.ready || cesiumGlobe.failed) return;
      await sleep(75);
    }
  }

  function applyEarthView() {
    if (!globe.earth?.material || !globalThis.THREE) return;
    const material = globe.earth.material;
    const token = (globe.earthViewToken += 1);
    if (state.earthView === "ops" || state.earthView === "topo") {
      material.map = globe.defaultEarthTexture;
      material.emissive.setHex(0x03111d);
      material.emissiveIntensity = 0.34;
      material.needsUpdate = true;
      return;
    }

    const texture = new THREE.TextureLoader().load(
      `/api/globe-texture?view=${encodeURIComponent(state.earthView)}&width=2048`,
      () => {
        if (token !== globe.earthViewToken || state.earthView !== "nasa") {
          texture.dispose?.();
          return;
        }
        texture.anisotropy = globe.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
        material.map = texture;
        material.emissive.setHex(0x01070a);
        material.emissiveIntensity = 0.16;
        material.needsUpdate = true;
      },
      undefined,
      () => {
        if (token !== globe.earthViewToken) return;
        state.earthView = "ops";
        document.querySelectorAll("[data-earth-view]").forEach((button) => {
          button.classList.toggle("active", button.dataset.earthView === "ops");
        });
        material.map = globe.defaultEarthTexture;
        material.needsUpdate = true;
      }
    );
  }

  function animateGlobe() {
    if (!globe.renderer) return;
    globe.animationId = requestAnimationFrame(animateGlobe);
    if (state.globeRenderer === "cesium") {
      cesiumGlobe.trafficLayer?.update(performance.now());
      if (state.idleSpin && cesiumGlobe.ready && cesiumGlobe.viewer) {
        cesiumGlobe.viewer.camera.rotate(globalThis.Cesium.Cartesian3.UNIT_Z, -0.00018);
        cesiumGlobe.viewer.scene.requestRender();
      }
      return;
    }
    const t = performance.now() / 1000;
    if (performance.now() - globe.lastMotionUpdate >= 100) {
      globe.lastMotionUpdate = performance.now();
      for (const sprite of globe.pickables) {
        const { type, item } = sprite.userData || {};
        if (type !== "flight" && type !== "satellite" && type !== "vessel") continue;
        const current = displayItemForGlobe(type, item);
        const altitude = type === "satellite"
          ? clamp(Number(current.altitudeKm || 550) / 18000, 0.035, 0.62)
          : type === "vessel" ? 0.006 : 0.045;
        sprite.position.copy(latLngToVector3(Number(current.lat), Number(current.lng), 2.02 + altitude));
      }
      if (state.selection?.item && (state.selection.type === "flight" || state.selection.type === "satellite" || state.selection.type === "vessel")) {
        renderSelectedGlobeFocus();
      }
    }
    if (state.idleSpin) {
      if (globe.worldGroup && !globe.dragging) {
        globe.worldGroup.rotation.y += 0.0012;
      }
    }
    for (const sprite of globe.pickables) {
      const base = sprite.userData.baseScale || 0.055;
      const pulse = 1 + Math.sin(t * 2.2 + sprite.userData.phase) * 0.08;
      sprite.scale.setScalar(base * pulse);
    }
    globe.controls?.update();
    globe.renderer.render(globe.scene, globe.camera);
  }

  function resizeGlobe() {
    if (!globe.renderer || !globe.camera) return;
    const rect = (els.globeCanvas.parentElement || els.globeCanvas).getBoundingClientRect();
    globe.camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
    globe.camera.updateProjectionMatrix();
    globe.renderer.setSize(rect.width, rect.height, false);
  }

  function renderGlobeLayers() {
    if (state.globeRenderer === "cesium") {
      renderCesiumLayers();
      return;
    }
    if (!globe.scene || !state.snapshot) return;
    globe.pickables = [];
    Object.values(globe.groups).forEach(clearGroup);

    const snapshot = state.snapshot;
    if (state.layers.cameras) addMarkers("cameras", getMapCameras(), "camera");
    if (state.layers.satellites) addMarkers("satellites", filterByQuery(snapshot.satellites), "satellite");
    if (state.layers.flights) addMarkers("flights", filterByQuery(snapshot.flights), "flight");
    if (state.layers.quakes) addMarkers("quakes", filterByQuery(snapshot.quakes), "quake");
    if (state.layers.fires) addMarkers("fires", filterByQuery(snapshot.fires || []), "fire");
    if (state.layers.alerts) addMarkers("alerts", filterByQuery(snapshot.alerts), "alert");
    if (state.layers.demographics) addMarkers("demographics", filterByQuery(snapshot.demographics || []), "demographic");
    if (state.layers.vessels) addMarkers("vessels", filterByQuery(snapshot.vessels || []), "vessel");
    if (state.layers.launches) addMarkers("launches", filterByQuery(snapshot.launches || []), "launch");
    if (state.layers.radio) addMarkers("radio", filterByQuery(snapshot.radio || []), "radio");
    renderSelectedGlobeFocus();
  }

  function renderCesiumLayers(options = {}) {
    if (!cesiumGlobe.ready || !state.snapshot || !globalThis.Cesium) return;
    if (cesiumGlobe.renderRetry) {
      clearTimeout(cesiumGlobe.renderRetry);
      cesiumGlobe.renderRetry = null;
    }
    Object.values(cesiumGlobe.sources).forEach((source) => source.entities.removeAll());
    for (const layer of LAYERS) {
      if (cesiumGlobe.pointLayers[layer.id]) cesiumGlobe.pointLayers[layer.id].show = state.layers[layer.id];
    }
    const snapshot = state.snapshot;
    if (state.layers.cameras) addCesiumMarkers("cameras", getMapCameras(), "camera");
    if (state.layers.satellites) addCesiumMarkers("satellites", filterByQuery(snapshot.satellites), "satellite");
    if (state.layers.flights) addCesiumMarkers("flights", filterByQuery(snapshot.flights), "flight");
    if (state.layers.quakes) addCesiumMarkers("quakes", filterByQuery(snapshot.quakes), "quake");
    if (state.layers.fires) addCesiumMarkers("fires", filterByQuery(snapshot.fires || []), "fire");
    if (state.layers.alerts) addCesiumMarkers("alerts", filterByQuery(snapshot.alerts), "alert");
    if (state.layers.demographics) addCesiumMarkers("demographics", filterByQuery(snapshot.demographics || []), "demographic");
    if (state.layers.vessels) addCesiumMarkers("vessels", filterByQuery(snapshot.vessels || []), "vessel");
    if (state.layers.launches) addCesiumMarkers("launches", filterByQuery(snapshot.launches || []), "launch");
    if (state.layers.radio) addCesiumMarkers("radio", filterByQuery(snapshot.radio || []), "radio");
    renderCesiumSelection();
    cesiumGlobe.viewer?.scene?.requestRender?.();
    const cameraPoints = cesiumGlobe.pointLayers.cameras;
    if (state.layers.cameras && getMapCameras().length && cameraPoints && !cameraPoints.size && !options.retry) {
      cesiumGlobe.renderRetry = window.setTimeout(() => renderCesiumLayers({ retry: true }), 350);
    }
  }

  function addCesiumMarkers(layerId, items, type) {
    const source = cesiumGlobe.sources[layerId];
    const pointLayer = cesiumGlobe.pointLayers[layerId];
    if (!source || !pointLayer || !globalThis.Cesium) return;
    const Cesium = globalThis.Cesium;
    const visible = getCesiumVisibleItems(items, type);
    pointLayer.sync(visible, {
      type,
      resolvePosition: (item, now) => {
        const displayed = displayItemForGlobe(type, item, now);
        return {
          lat: Number(displayed.lat),
          lng: Number(displayed.lng),
          height: cesiumHeightForType(type, displayed),
        };
      },
      describe: (item) => ({
        pixelSize: cesiumPointSize(type, item),
        color: cesiumColor(item.displayColor || COLORS[layerId] || colorForType(type), type === "camera" ? 0.78 : 0.92),
        outlineColor: Cesium.Color.WHITE.withAlpha(0.78),
        outlineWidth: type === "alert" ? 2 : 1,
        scaleByDistance: new Cesium.NearFarScalar(900000, 1.08, 18000000, 0.54),
        translucencyByDistance: new Cesium.NearFarScalar(900000, 0.96, 21000000, 0.42),
      }),
    });

    let orbitCount = 0;
    let trailCount = 0;
    for (const item of visible) {
      const displayed = displayItemForGlobe(type, item);
      const lat = Number(displayed.lat);
      const lng = Number(displayed.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const color = cesiumColor(item.displayColor || COLORS[layerId] || colorForType(type), type === "camera" ? 0.78 : 0.92);
      const height = cesiumHeightForType(type, displayed);
      if (type === "satellite" && Array.isArray(item.orbit) && item.orbit.length && orbitCount < 120) {
        source.entities.add({
          polyline: {
            positions: cesiumPositions(item.orbit, Math.max(height, 600000)),
            width: 1.25,
            material: color.withAlpha(0.38),
            arcType: Cesium.ArcType.GEODESIC,
          },
        });
        orbitCount += 1;
      }
      if (type === "flight" && trailCount < 500) {
        addCesiumTrackLine(source, "flight", item, color.withAlpha(0.56), 2);
        trailCount += 1;
      }
      if (type === "vessel" && trailCount < 500) {
        addCesiumTrackLine(source, "vessel", item, color.withAlpha(0.5), 2);
        trailCount += 1;
      }
    }
  }

  function startCesiumMotionUpdates() {
    if (cesiumGlobe.motionTimer) return;
    cesiumGlobe.motionTimer = window.setInterval(() => {
      if (state.globeRenderer !== "cesium" || !cesiumGlobe.ready) return;
      if (state.layers.flights) cesiumGlobe.pointLayers.flights?.updateDynamic();
      if (state.layers.satellites) cesiumGlobe.pointLayers.satellites?.updateDynamic();
      if (state.layers.vessels) cesiumGlobe.pointLayers.vessels?.updateDynamic();
      const now = Date.now();
      if (
        state.selection?.item
        && (state.selection.type === "flight" || state.selection.type === "satellite" || state.selection.type === "vessel")
        && now - cesiumGlobe.lastSelectionUpdate >= 1000
      ) {
        cesiumGlobe.lastSelectionUpdate = now;
        renderCesiumSelection();
      }
      cesiumGlobe.viewer?.scene?.requestRender?.();
    }, 250);
  }

  function getCesiumVisibleItems(items, type) {
    const values = Array.isArray(items) ? items : [];
    const viewer = cesiumGlobe.viewer;
    const cameraHeight = Number(viewer?.camera?.positionCartographic?.height || 22000000);
    const hardLimit = type === "camera"
      ? 4500
      : type === "satellite"
        ? 1200
        : type === "flight"
          ? 1800
          : type === "vessel"
            ? 2200
            : type === "radio"
              ? 750
              : type === "launch"
                ? 100
                : type === "quake"
            ? 900
            : type === "fire"
              ? 1800
              : type === "demographic"
                ? 100
                : 360;
    const budget = Math.min(hardLimit, altitudeBudget(cameraHeight, {
      local: type === "camera" ? 1800 : 1100,
      regional: type === "camera" ? 3200 : 1500,
      global: hardLimit,
    }));
    const bounds = cesiumViewBounds();
    const inView = bounds ? values.filter((item) => inGeoBounds(item, bounds)) : values;
    const candidates = inView.length ? inView : values;
    return spatiallyBalancedSample(candidates, budget, {
      score: (item) => type === "camera"
        ? Number(item.capability === "stream" || item.capability === "player") * 10
        : Number(item.magnitude || item.frp || 0),
    });
  }

  function cesiumViewBounds() {
    const Cesium = globalThis.Cesium;
    const rectangle = cesiumGlobe.viewer?.camera?.computeViewRectangle?.(Cesium?.Ellipsoid?.WGS84);
    if (!rectangle || !Cesium) return null;
    return {
      west: Cesium.Math.toDegrees(rectangle.west),
      south: Cesium.Math.toDegrees(rectangle.south),
      east: Cesium.Math.toDegrees(rectangle.east),
      north: Cesium.Math.toDegrees(rectangle.north),
    };
  }

  function displayItemForGlobe(type, item, now = Date.now()) {
    if (type === "satellite") {
      const point = satellitePropagator.position(item, new Date(now));
      return { ...item, ...point, motionState: "propagated", motionAgeMs: 0 };
    }
    if (type === "flight" || type === "vessel") return motionStore.display(type, item, now);
    return item;
  }

  function addCesiumTrackLine(source, type, item, color, width = 2) {
    const points = getTrackPoints(type, item);
    let trail = points.length > 1 ? points : [];
    if (!trail.length && type === "flight" && Number.isFinite(Number(item.heading))) {
      const speed = clamp(Number(item.velocity || 0), 120, 280);
      const start = destinationPoint(Number(item.lat), Number(item.lng), Number(item.heading) + 180, (speed * 60 * 8) / 1000);
      trail = [start, { lat: item.lat, lng: item.lng }];
    }
    if (trail.length < 2) return;
    source.entities.add({
      polyline: {
        positions: cesiumPositions(trail, type === "satellite" ? cesiumHeightForType(type, item) : type === "vessel" ? 1400 : 18000),
        width,
        material: color,
        arcType: globalThis.Cesium.ArcType.GEODESIC,
      },
    });
  }

  function renderCesiumSelection(type = state.selection?.type, item = state.selection?.item) {
    if (!cesiumGlobe.ready || !cesiumGlobe.selectionSource || !globalThis.Cesium) return;
    const Cesium = globalThis.Cesium;
    cesiumGlobe.selectionSource.entities.removeAll();
    if (!item) return;
    const displayed = displayItemForGlobe(type, item);
    const lat = Number(displayed.lat);
    const lng = Number(displayed.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const color = cesiumColor(type === "alert" ? COLORS.alerts : colorForType(type), 0.94);
    const height = cesiumHeightForType(type, displayed);
    cesiumGlobe.selectionSource.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat, height),
      point: {
        pixelSize: 18,
        color,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.95),
        outlineWidth: 3,
        heightReference: Cesium.HeightReference.NONE,
        scaleByDistance: new Cesium.NearFarScalar(900000, 1.15, 18000000, 0.68),
      },
    });
    cesiumGlobe.selectionSource.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([lng, lat, 0, lng, lat, Math.max(height, 450000)]),
        width: 2,
        material: color.withAlpha(0.8),
      },
    });
    if (type === "satellite") {
      const orbit = satellitePropagator.groundTrack(item, new Date(), 120);
      if (orbit.length) {
      cesiumGlobe.selectionSource.entities.add({
        polyline: {
          positions: cesiumPositions(orbit, Math.max(height, 600000)),
          width: 3,
          material: cesiumColor(COLORS.satellites, 0.86),
          arcType: Cesium.ArcType.GEODESIC,
        },
      });
      }
    }
    if (type === "flight") addCesiumTrackLine(cesiumGlobe.selectionSource, "flight", item, cesiumColor(COLORS.flights, 0.9), 3);
    if (type === "vessel") addCesiumTrackLine(cesiumGlobe.selectionSource, "vessel", item, cesiumColor(COLORS.vessels, 0.9), 3);
    if (type === "quake" && item.shakeMap?.overlay && item.shakeMap?.bounds) {
      const bounds = item.shakeMap.bounds;
      if ([bounds.west, bounds.south, bounds.east, bounds.north].every((value) => Number.isFinite(Number(value)))) {
        cesiumGlobe.selectionSource.entities.add({
          rectangle: {
            coordinates: Cesium.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north),
            material: new Cesium.ImageMaterialProperty({
              image: toProxyImageUrl(item.shakeMap.overlay),
              transparent: true,
              color: Cesium.Color.WHITE.withAlpha(0.58),
            }),
            height: 8000,
          },
        });
      }
    }
    if (type === "alert" || ((type === "fire" || type === "quake") && Array.isArray(item.geometryRings) && item.geometryRings.length)) {
      const rings = Array.isArray(item.geometryRings) && item.geometryRings.length ? item.geometryRings : [makeGeoCircle(lat, lng, clamp(Number(item.radiusKm || 220), 80, 900))];
      for (const ring of rings) {
        cesiumGlobe.selectionSource.entities.add({
          polyline: {
            positions: cesiumPositions(ring, 6000),
            width: type === "alert" ? 3 : 2.5,
            material: color.withAlpha(0.9),
            clampToGround: false,
          },
        });
      }
    }
    if (type === "demographic") {
      const radiusKm = clamp(Number(item.radiusKm || 140), 45, 480);
      cesiumGlobe.selectionSource.entities.add({
        ellipse: {
          semiMajorAxis: radiusKm * 1000,
          semiMinorAxis: radiusKm * 1000,
          material: cesiumColor(COLORS.demographics, 0.16),
          outline: true,
          outlineColor: cesiumColor(COLORS.demographics, 0.88),
          height: 7000,
        },
        position: Cesium.Cartesian3.fromDegrees(lng, lat, 8000),
      });
    }
  }

  function cesiumPositions(points, height = 0) {
    const values = [];
    for (const point of points) {
      values.push(Number(point.lng), Number(point.lat), height);
    }
    return globalThis.Cesium.Cartesian3.fromDegreesArrayHeights(values);
  }

  function cesiumColor(hex, alpha = 1) {
    return globalThis.Cesium.Color.fromCssColorString(hex || COLORS.cameras).withAlpha(alpha);
  }

  function cesiumHeightForType(type, item) {
    if (type === "satellite") return clamp(Number(item.altitudeKm || 550), 220, 36000) * 1000;
    if (type === "flight") return clamp(Number(item.altitudeMeters || 11000), 1200, 16000);
    if (type === "quake") return 16000;
    if (type === "fire") return 30000;
    if (type === "alert") return 24000;
    if (type === "demographic") return 22000;
    if (type === "vessel") return 1200;
    if (type === "launch") return 18000;
    if (type === "radio") return 7000;
    return 9000;
  }

  function cesiumPointSize(type, item) {
    if (type === "quake") return 8 + clamp(Number(item.magnitude || 1) * 1.6, 2, 12);
    if (type === "satellite") return 7;
    if (type === "flight") return 8;
    if (type === "alert") return 10;
    if (type === "fire") return 8 + clamp(Number(item.frp || 0) / 40, 0, 10);
    if (type === "demographic") return 7 + clamp(Math.sqrt(Number(item.population || 0)) / 1600, 2, 14);
    if (type === "vessel") return 7;
    if (type === "launch") return 10;
    if (type === "radio") return 6;
    return 6;
  }

  function addMarkers(layerId, items, type) {
    const group = globe.groups[layerId];
    const max = type === "satellite" ? 700 : type === "flight" ? 620 : type === "vessel" ? 700 : type === "radio" ? 420 : type === "launch" ? 100 : type === "quake" ? 420 : type === "fire" ? 720 : type === "demographic" ? 80 : 260;
    const visible = spatiallyBalancedSample(items, max, {
      score: (item) => type === "camera"
        ? Number(item.capability === "stream" || item.capability === "player") * 10
        : Number(item.magnitude || item.frp || 0),
    });
    for (const item of visible) {
      const color = item.displayColor || COLORS[layerId] || colorForType(type);
      const displayed = displayItemForGlobe(type, item);
      const lat = Number(displayed.lat);
      const lng = Number(displayed.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const altitude = type === "satellite" ? clamp((item.altitudeKm || 550) / 18000, 0.035, 0.62) : type === "flight" ? 0.045 : type === "vessel" ? 0.006 : type === "demographic" ? 0.024 : 0.018;
      const size = type === "quake"
        ? 0.028 + clamp((item.magnitude || 1) / 80, 0, 0.06)
        : type === "fire"
          ? 0.034 + clamp((item.frp || 1) / 1800, 0, 0.045)
          : type === "demographic"
            ? 0.034 + clamp(Math.sqrt(Number(item.population || 0)) / 85000, 0, 0.065)
            : type === "satellite" ? 0.038 : 0.052;
      const sprite = makeSprite(color, size);
      sprite.position.copy(latLngToVector3(lat, lng, 2.02 + altitude));
      sprite.userData = { type, item, baseScale: size, phase: Math.random() * Math.PI * 2 };
      group.add(sprite);
      globe.pickables.push(sprite);

      if (type === "satellite" && item.orbit && item.orbit.length && group.children.length < 240) {
        group.add(makePathLine(item.orbit.slice(0, 14), color, 2.18, 0.28));
      }
      if (type === "flight" && group.children.length < 520) {
        const trackTrail = makeTrackTrail("flight", item, color, 2.075, { opacity: 0.34 });
        group.add(trackTrail || makeFlightTrail(item, color, 2.075));
      }
      if (type === "vessel" && group.children.length < 520) {
        const trackTrail = makeTrackTrail("vessel", item, color, 2.035, { opacity: 0.32 });
        if (trackTrail) group.add(trackTrail);
      }
    }
  }

  function makePathLine(points, color, radius, opacity = 0.22) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => latLngToVector3(point.lat, point.lng, radius)));
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    return new THREE.Line(geometry, material);
  }

  function makeFlightTrail(item, color, radius, options = {}) {
    const speed = clamp(Number(item.velocity || 0), 120, 280);
    const minutes = Number(options.minutes || 4);
    const distanceKm = (speed * 60 * minutes) / 1000;
    const start = destinationPoint(Number(item.lat), Number(item.lng), Number(item.heading) + 180, distanceKm);
    return makePathLine([start, { lat: item.lat, lng: item.lng }], color, radius, options.opacity ?? 0.34);
  }

  function makeTrackTrail(type, item, color, radius, options = {}) {
    const points = getTrackPoints(type, item);
    if (points.length < 2) return null;
    return makePathLine(points, color, radius, options.opacity ?? 0.54);
  }

  function renderSelectedGlobeFocus(type = state.selection?.type, item = state.selection?.item) {
    if (state.globeRenderer === "cesium") {
      renderCesiumSelection(type, item);
      return;
    }
    if (!globe.selectionGroup) return;
    clearGroup(globe.selectionGroup);
    if (!item) return;
    item = displayItemForGlobe(type, item);
    const lat = Number(item.lat);
    const lng = Number(item.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const color = type === "alert" ? COLORS.alerts : colorForType(type);
    if (type === "alert" || type === "demographic" || ((type === "fire" || type === "quake") && Array.isArray(item.geometryRings) && item.geometryRings.length)) {
      const rings = Array.isArray(item.geometryRings) ? item.geometryRings : [];
      if (rings.length) {
        for (const ring of rings) {
          globe.selectionGroup.add(makePathLine(ring, color, 2.075, 0.88));
          globe.selectionGroup.add(makePathLine(ring, "#ffffff", 2.081, 0.2));
        }
      } else {
        const radiusKm = type === "demographic" ? clamp(Number(item.radiusKm || 140), 45, 480) : clamp(Number(item.radiusKm || 220), 80, 900);
        globe.selectionGroup.add(makePathLine(makeGeoCircle(lat, lng, radiusKm), color, 2.075, 0.86));
        globe.selectionGroup.add(makePathLine(makeGeoCircle(lat, lng, radiusKm * 0.62), color, 2.082, 0.34));
      }
      globe.selectionGroup.add(makeSelectionBeam(lat, lng, color));
      const sprite = makeSprite(color, 0.16);
      sprite.position.copy(latLngToVector3(lat, lng, 2.2));
      globe.selectionGroup.add(sprite);
      if (type === "alert" || type === "demographic") return;
    }

    if (type === "flight" && Number.isFinite(Number(item.heading))) {
      const trail = makeTrackTrail("flight", item, "#ffffff", 2.11, { opacity: 0.72 }) || makeFlightTrail(item, "#ffffff", 2.11, { minutes: 18, opacity: 0.72 });
      const glow = makeTrackTrail("flight", item, COLORS.flights, 2.105, { opacity: 0.92 }) || makeFlightTrail(item, COLORS.flights, 2.105, { minutes: 18, opacity: 0.92 });
      globe.selectionGroup.add(trail);
      globe.selectionGroup.add(glow);
      const historical = getTrackPoints("flight", item);
      const origin = historical[0] || destinationPoint(lat, lng, Number(item.heading) + 180, clamp(Number(item.velocity || 180), 120, 280) * 60 * 18 / 1000);
      const originSprite = makeSprite("#ffffff", 0.08);
      originSprite.position.copy(latLngToVector3(origin.lat, origin.lng, 2.13));
      globe.selectionGroup.add(originSprite);
      globe.selectionGroup.add(makeSelectionBeam(lat, lng, COLORS.flights));
    }

    if (type === "satellite") {
      const historyTrail = makeTrackTrail("satellite", item, "#ffffff", 2.22, { opacity: 0.66 });
      if (historyTrail) globe.selectionGroup.add(historyTrail);
      if (Array.isArray(item.orbit) && item.orbit.length) {
        globe.selectionGroup.add(makePathLine(item.orbit, "#ffffff", 2.235, 0.42));
        globe.selectionGroup.add(makePathLine(item.orbit, COLORS.satellites, 2.23, 0.78));
      }
      globe.selectionGroup.add(makeSelectionBeam(lat, lng, COLORS.satellites));
    }

    if (type === "vessel") {
      const trail = makeTrackTrail("vessel", item, COLORS.vessels, 2.055, { opacity: 0.94 });
      if (trail) globe.selectionGroup.add(trail);
      globe.selectionGroup.add(makeSelectionBeam(lat, lng, COLORS.vessels));
    }

    globe.selectionGroup.add(makePathLine(makeGeoCircle(lat, lng, 55), color, 2.075, 0.74));
  }

  function makeGeoCircle(lat, lng, radiusKm, segments = 96) {
    return Array.from({ length: segments + 1 }, (_, index) => destinationPoint(lat, lng, (index / segments) * 360, radiusKm));
  }

  function makeSelectionBeam(lat, lng, color) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      latLngToVector3(lat, lng, 2.05),
      latLngToVector3(lat, lng, 2.62),
    ]);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.64 });
    return new THREE.Line(geometry, material);
  }

  function makeSprite(color, size) {
    const texture = getSpriteTexture(color);
    const material = new THREE.SpriteMaterial({ map: texture, color: 0xffffff, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(size);
    return sprite;
  }

  function getSpriteTexture(color) {
    if (globe.textures.has(color)) return globe.textures.get(color);
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(48, 48, 3, 48, 48, 45);
    gradient.addColorStop(0, "#fff");
    gradient.addColorStop(0.24, color);
    gradient.addColorStop(0.55, `${color}99`);
    gradient.addColorStop(1, `${color}00`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(48, 48, 46, 0, Math.PI * 2);
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    globe.textures.set(color, texture);
    return texture;
  }

  function onGlobeClick(event) {
    if (globe.dragging || !globe.raycaster || !globe.pickables.length) return;
    const rect = els.globeCanvas.getBoundingClientRect();
    globe.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    globe.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    globe.raycaster.setFromCamera(globe.pointer, globe.camera);
    const hit = globe.raycaster.intersectObjects(globe.pickables, false)[0];
    if (hit?.object?.userData?.item) {
      const { type, item } = hit.object.userData;
      selectObject(type, displayItemForGlobe(type, item), { focus: false });
    }
  }

  function createEarthTexture() {
    if (globalThis.THREE?.TextureLoader) {
      const texture = new THREE.TextureLoader().load(earthTextureUrl, () => {
        texture.needsUpdate = true;
      });
      texture.anisotropy = globe.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
      return texture;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#071f35");
    gradient.addColorStop(0.5, "#062a44");
    gradient.addColorStop(1, "#041523");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(37, 190, 255, 0.16)";
    ctx.lineWidth = 1;
    for (let lat = -75; lat <= 75; lat += 15) drawLatLine(ctx, lat, canvas.width, canvas.height);
    for (let lng = -180; lng <= 180; lng += 15) drawLngLine(ctx, lng, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(25, 226, 255, 0.18)";
    ctx.strokeStyle = "rgba(80, 214, 255, 0.48)";
    ctx.lineWidth = 2;
    drawLandmass(ctx, [
      [72, -168], [62, -140], [50, -127], [34, -117], [18, -101], [8, -82], [25, -80], [41, -74],
      [52, -62], [60, -88], [70, -112],
    ], canvas);
    drawLandmass(ctx, [[13, -79], [-5, -78], [-20, -69], [-54, -70], [-45, -42], [-12, -35], [9, -53]], canvas);
    drawLandmass(ctx, [
      [70, -10], [58, 12], [45, 5], [36, -5], [32, 28], [12, 34], [-34, 18], [-35, 45], [4, 51],
      [18, 73], [8, 92], [23, 113], [51, 126], [66, 88], [60, 40],
    ], canvas);
    drawLandmass(ctx, [[-10, 112], [-36, 114], [-43, 146], [-23, 154], [-12, 132]], canvas);
    drawLandmass(ctx, [[72, -48], [60, -38], [62, -20], [76, -24]], canvas);

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i < 900; i += 1) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      ctx.fillRect(x, y, 1.2, 1.2);
    }

    return new THREE.CanvasTexture(canvas);
  }

  function drawLandmass(ctx, coords, canvas) {
    ctx.beginPath();
    coords.forEach(([lat, lng], index) => {
      const [x, y] = projectTexture(lat, lng, canvas.width, canvas.height);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawLatLine(ctx, lat, width, height) {
    const [, y] = projectTexture(lat, -180, width, height);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  function drawLngLine(ctx, lng, width, height) {
    const [x] = projectTexture(0, lng, width, height);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  function projectTexture(lat, lng, width, height) {
    return [((lng + 180) / 360) * width, ((90 - lat) / 180) * height];
  }

  function createStarfield() {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    for (let i = 0; i < 1500; i += 1) {
      const radius = 42;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions.push(radius * Math.sin(phi) * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi));
    }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0x7ed8ff, size: 0.038, transparent: true, opacity: 0.68 })
    );
  }

  function flyGlobeToScope(scopeId) {
    const scope = SCOPES.find((item) => item.id === scopeId) || SCOPES[0];
    if (state.globeRenderer === "cesium" && cesiumGlobe.ready) {
      const Cesium = globalThis.Cesium;
      const height = Math.max(2400000, 19000000 - Math.min(scope.zoom, 6) * 2500000);
      cesiumGlobe.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(scope.center[1], scope.center[0], height),
        duration: 0.8,
      });
      return;
    }
    if (!globe.camera || !globe.controls) return;
    const target = latLngToVector3(scope.center[0], scope.center[1], 5.2 - Math.min(scope.zoom, 6) * 0.16);
    globe.camera.position.lerp(target, 0.22);
    globe.controls.target.set(0, 0, 0);
  }

  function focusGlobeOnItem(item, options = {}) {
    const lat = Number(item?.lat);
    const lng = Number(item?.lng);
    if (state.globeRenderer === "cesium" && cesiumGlobe.ready && Number.isFinite(lat) && Number.isFinite(lng)) {
      const height = item.type === "satellite" || item.altitudeKm ? 7200000 : item.type === "flight" ? 1800000 : 900000;
      cesiumGlobe.viewer.camera.flyTo({
        destination: globalThis.Cesium.Cartesian3.fromDegrees(lng, lat, height),
        duration: 0.7,
      });
      if (options.pulse) {
        els.selectionCard.classList.remove("pulse");
        window.setTimeout(() => els.selectionCard.classList.add("pulse"), 0);
      }
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !globe.camera) return;
    const distance = item.type === "satellite" || item.altitudeKm ? 5.4 : 4.15;
    const target = latLngToVector3(lat, lng, 1).normalize().multiplyScalar(distance);
    globe.camera.position.copy(target);
    if (globe.controls) {
      globe.controls.target.set(0, 0, 0);
      globe.controls.update();
    } else {
      globe.camera.lookAt(0, 0, 0);
    }
    if (options.pulse) {
      els.selectionCard.classList.remove("pulse");
      window.setTimeout(() => els.selectionCard.classList.add("pulse"), 0);
    }
  }

  function latLngToVector3(lat, lng, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  function initCameraMap() {
    if (!globalThis.L || !els.cameraMap) return;
    state.cameraRenderer = globalThis.L.canvas({ padding: 0.5 });
    state.cameraMap = globalThis.L.map(els.cameraMap, { zoomControl: true, minZoom: 2, renderer: state.cameraRenderer }).setView([20, 0], 2);
    state.cameraMap.createPane("trafficTilePane");
    state.cameraMap.getPane("trafficTilePane").style.zIndex = "240";
    state.cameraMap.createPane("trafficMotionPane");
    state.cameraMap.getPane("trafficMotionPane").style.zIndex = "360";
    state.cameraMap.getPane("trafficMotionPane").style.pointerEvents = "none";
    state.trafficMapRenderer = globalThis.L.svg({ pane: "trafficMotionPane", padding: 0.5 });
    globalThis.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(state.cameraMap);
    state.cameraLayer = globalThis.L.layerGroup().addTo(state.cameraMap);
    state.cameraMap.on("moveend zoomend", () => {
      if (state.suppressMapMove) return;
      state.mapListMode = true;
      state.catalogLimit = 120;
      renderCatalog();
      scheduleMapTrafficRefresh();
    });
    state.cameraMap.on("click", () => {
      state.mapListMode = true;
      state.catalogLimit = 120;
      renderCatalog();
    });
  }

  function toggleRadarOverlay() {
    if (!state.cameraMap || !globalThis.L) return;
    state.radarOverlay = !state.radarOverlay;
    if (state.radarOverlay) {
      state.radarLayer = state.radarLayer || globalThis.L.tileLayer.wms("https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows", {
        layers: "conus_bref_qcd",
        format: "image/png",
        transparent: true,
        opacity: 0.48,
        attribution: "NOAA/NCEP",
      });
      state.radarLayer.addTo(state.cameraMap);
    } else if (state.radarLayer) {
      state.radarLayer.removeFrom(state.cameraMap);
    }
    els.toggleRadarOverlay.classList.toggle("active", state.radarOverlay);
  }

  function createFemaFloodLeafletLayer() {
    const L = globalThis.L;
    if (!L) return null;
    const FloodGridLayer = L.GridLayer.extend({
      createTile(coords, done) {
        const tile = document.createElement("img");
        const size = this.getTileSize();
        const nw = this._map.unproject([coords.x * size.x, coords.y * size.y], coords.z);
        const se = this._map.unproject([(coords.x + 1) * size.x, (coords.y + 1) * size.y], coords.z);
        const url = new URL(`${FEMA_FLOOD_ARCGIS_URL}/export`);
        url.searchParams.set("bbox", `${nw.lng},${se.lat},${se.lng},${nw.lat}`);
        url.searchParams.set("bboxSR", "4326");
        url.searchParams.set("imageSR", "3857");
        url.searchParams.set("size", `${size.x},${size.y}`);
        url.searchParams.set("format", "png32");
        url.searchParams.set("transparent", "true");
        url.searchParams.set("layers", FEMA_FLOOD_LAYERS);
        url.searchParams.set("f", "image");
        tile.alt = "FEMA flood hazard overlay";
        tile.decoding = "async";
        tile.src = url.toString();
        tile.onload = () => done(null, tile);
        tile.onerror = () => done(null, tile);
        return tile;
      },
    });
    return new FloodGridLayer({ opacity: 0.62, attribution: "FEMA NFHL" });
  }

  function toggleFloodOverlay() {
    if (!state.cameraMap || !globalThis.L) return;
    state.floodOverlay = !state.floodOverlay;
    if (state.floodOverlay) {
      state.floodLayer = state.floodLayer || createFemaFloodLeafletLayer();
      state.floodLayer?.addTo(state.cameraMap);
    } else if (state.floodLayer) {
      state.floodLayer.removeFrom(state.cameraMap);
    }
    els.toggleFloodOverlay.classList.toggle("active", state.floodOverlay);
  }

  async function toggleMapTrafficOverlay() {
    state.mapTrafficOverlay = !state.mapTrafficOverlay;
    els.toggleTrafficOverlay.classList.toggle("active", state.mapTrafficOverlay);
    els.toggleTrafficOverlay.setAttribute("aria-pressed", state.mapTrafficOverlay ? "true" : "false");
    if (!state.mapTrafficOverlay) {
      clearMapTrafficOverlay();
      setTrafficStatusChip(els.cameraTrafficStatus, "", { hidden: true });
      return;
    }
    setTrafficStatusChip(els.cameraTrafficStatus, "Checking source", { state: "loading" });
    await ensureTrafficStatus({ force: true });
    await refreshMapTrafficOverlay();
  }

  function scheduleMapTrafficRefresh() {
    if (!state.mapTrafficOverlay) return;
    window.clearTimeout(state.trafficMapRefreshTimer);
    state.trafficMapRefreshTimer = window.setTimeout(refreshMapTrafficOverlay, 420);
  }

  async function refreshMapTrafficOverlay() {
    if (!state.mapTrafficOverlay || !state.cameraMap || !globalThis.L) return;
    const status = await ensureTrafficStatus();
    const view = getLeafletTrafficView();
    if (!view) {
      removeMapTrafficTileLayer();
      state.trafficMapRoadLayer?.clearLayers();
      setTrafficStatusChip(els.cameraTrafficStatus, "Zoom closer", {
        state: "zoom",
        title: "Road traffic appears at city and metro scale.",
      });
      return;
    }

    if (status.mode === "live" && status.health !== "budget-exhausted") ensureMapTrafficTileLayer();
    else removeMapTrafficTileLayer();
    const requestToken = ++state.trafficMapRequestToken;
    setTrafficStatusChip(els.cameraTrafficStatus, "Loading roads", { state: "loading" });
    try {
      const response = await fetch(`/api/traffic/roads?bbox=${encodeURIComponent(view.bbox)}&detail=${view.detail}&ts=${Date.now()}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || payload.error || `Road query failed with ${response.status}`);
      if (requestToken !== state.trafficMapRequestToken || !state.mapTrafficOverlay) return;
      renderMapTrafficRoads(payload.roads, status.mode);
      renderTrafficModeStatus(els.cameraTrafficStatus, status, payload.roads.length ? "" : "No mapped major roads in view");
      if (status.mode === "live") {
        window.setTimeout(async () => {
          if (!state.mapTrafficOverlay) return;
          const refreshed = await ensureTrafficStatus({ force: true });
          renderTrafficModeStatus(els.cameraTrafficStatus, refreshed);
        }, 2600);
      }
    } catch (error) {
      if (requestToken !== state.trafficMapRequestToken) return;
      state.trafficMapRoadLayer?.clearLayers();
      if (status.mode === "live" && state.trafficMapTileLayer) {
        renderTrafficModeStatus(els.cameraTrafficStatus, status);
        els.cameraTrafficStatus.title = `${status.detail || ""} Road animation unavailable: ${error.message}`.trim();
      } else {
        setTrafficStatusChip(els.cameraTrafficStatus, "Road layer unavailable", { state: "error", title: error.message });
      }
    }
  }

  function getLeafletTrafficView() {
    const map = state.cameraMap;
    if (!map || map.getZoom() < 8) return null;
    const bounds = map.getBounds();
    const west = Number(bounds.getWest());
    const south = Math.max(-85, Number(bounds.getSouth()));
    const east = Number(bounds.getEast());
    const north = Math.min(85, Number(bounds.getNorth()));
    if (![west, south, east, north].every(Number.isFinite) || east <= west) return null;
    const lngSpan = east - west;
    const latSpan = north - south;
    if (lngSpan > 5.4 || latSpan > 4.4 || lngSpan * latSpan > 17.5) return null;
    const detail = map.getZoom() >= 12 && lngSpan < 1.7 && latSpan < 1.7 ? "local" : "major";
    return {
      detail,
      bbox: [west, south, east, north].map((value) => value.toFixed(5)).join(","),
    };
  }

  function ensureMapTrafficTileLayer() {
    if (state.trafficMapTileLayer || !state.cameraMap || !globalThis.L) return;
    state.trafficMapTileLayer = globalThis.L.tileLayer("/api/traffic/flow/{z}/{x}/{y}.png", {
      pane: "trafficTilePane",
      minZoom: 0,
      maxZoom: 20,
      opacity: 0.82,
      keepBuffer: 1,
      updateWhenIdle: true,
      attribution: "TomTom Traffic",
    });
    state.trafficMapTileLayer.on("tileerror", () => {
      window.setTimeout(async () => {
        if (!state.mapTrafficOverlay) return;
        const status = await ensureTrafficStatus({ force: true });
        renderTrafficModeStatus(els.cameraTrafficStatus, status);
      }, 600);
    });
    state.trafficMapTileLayer.addTo(state.cameraMap);
  }

  function removeMapTrafficTileLayer() {
    if (!state.trafficMapTileLayer || !state.cameraMap) return;
    state.trafficMapTileLayer.removeFrom(state.cameraMap);
    state.trafficMapTileLayer = null;
  }

  function renderMapTrafficRoads(roads, mode) {
    if (!state.cameraMap || !globalThis.L) return;
    if (!state.trafficMapRoadLayer) state.trafficMapRoadLayer = globalThis.L.layerGroup().addTo(state.cameraMap);
    state.trafficMapRoadLayer.clearLayers();
    const selected = (Array.isArray(roads) ? roads : []).slice(0, 280);
    for (const road of selected) {
      const latLngs = (road.coordinates || []).map(([lng, lat]) => [Number(lat), Number(lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
      if (latLngs.length < 2) continue;
      const model = trafficModelForRoad(road);
      const speedClass = model.ratio < 0.35 ? "slow" : model.ratio < 0.68 ? "medium" : "fast";
      const color = mode === "live" ? "#e9fbff" : model.color;
      const line = globalThis.L.polyline(latLngs, {
        renderer: state.trafficMapRenderer,
        pane: "trafficMotionPane",
        className: `oversee-traffic-motion traffic-motion-${mode} traffic-motion-${speedClass}`,
        color,
        opacity: mode === "live" ? 0.26 : 0.78,
        weight: /^(motorway|trunk)/.test(road.highway) ? 3 : 2,
        dashArray: mode === "live" ? "2 18" : "4 12",
        lineCap: "round",
        interactive: false,
      });
      line.addTo(state.trafficMapRoadLayer);
    }
  }

  function clearMapTrafficOverlay() {
    window.clearTimeout(state.trafficMapRefreshTimer);
    state.trafficMapRequestToken += 1;
    removeMapTrafficTileLayer();
    state.trafficMapRoadLayer?.clearLayers();
  }

  function renderCameraMap(options = {}) {
    if (!state.cameraMap || !state.cameraLayer) return;
    state.cameraLayer.clearLayers();
    const cameras = getMapCameras();
    const highlighted = new Set(getFilteredCameras().map((camera) => camera.id));
    const markerCameras = state.showCameraMapMarkers ? getCameraMapMarkerSet(cameras, highlighted) : [];
    const bounds = [];

    cameras.forEach((camera) => {
      if (!Number.isFinite(camera.lat) || !Number.isFinite(camera.lng)) return;
      bounds.push([camera.lat, camera.lng]);
    });

    markerCameras.forEach((camera) => {
      if (!Number.isFinite(camera.lat) || !Number.isFinite(camera.lng)) return;
      const isHighlighted = state.cameraFilter === "all" || highlighted.has(camera.id);
      const color = isHighlighted ? colorForCamera(camera) : "rgba(90, 121, 140, 0.62)";
      const marker = globalThis.L.circleMarker([camera.lat, camera.lng], {
        renderer: state.cameraRenderer,
        radius: isHighlighted ? (camera.capability === "player" ? 7 : camera.viewerType === "hls" ? 6 : 4) : 3,
        color,
        fillColor: color,
        fillOpacity: isHighlighted ? (camera.viewerType === "image" ? 0.62 : 0.84) : 0.22,
        weight: isHighlighted && camera.viewerType !== "image" ? 2 : 1,
      });
      marker.bindTooltip(`${camera.name}${isHighlighted ? "" : " (outside current list filter)"}`);
      marker.on("click", () => {
        state.mapListMode = true;
        state.catalogLimit = 120;
        selectObject("camera", camera, { focus: false });
      });
      marker.addTo(state.cameraLayer);
    });

    if (bounds.length && (options.fit || !state.hasFitCameraMap)) {
      const maxZoom = state.scope === "world" ? 4 : state.scope === "us" ? 5 : 8;
      state.suppressMapMove = true;
      state.cameraMap.fitBounds(bounds, { padding: [22, 22], maxZoom });
      state.hasFitCameraMap = true;
      window.setTimeout(() => {
        state.suppressMapMove = false;
      }, 250);
    }
  }

  function getCameraMapMarkerSet(cameras, highlighted) {
    const zoom = state.cameraMap?.getZoom?.() || 2;
    const maxMarkers = zoom <= 3 ? 4200 : zoom <= 5 ? 7000 : 10000;
    if (!cameras || cameras.length <= maxMarkers) return cameras || [];
    const selectedId = state.selection?.type === "camera" ? state.selection.id : "";
    const priority = [];
    const priorityIds = new Set();
    const priorityLimit = Math.floor(maxMarkers * 0.45);
    for (const camera of cameras) {
      if (camera.id === selectedId || highlighted.has(camera.id) || camera.capability === "player" || camera.capability === "stream") {
        priority.push(camera);
        priorityIds.add(camera.id);
      }
      if (priority.length >= priorityLimit) break;
    }
    const remaining = cameras.filter((camera) => !priorityIds.has(camera.id));
    return [...priority, ...sampleItems(remaining, Math.max(0, maxMarkers - priority.length))];
  }

  async function selectObject(type, item, options = {}) {
    state.selection = { type, id: item.id, item };
    renderSelectedGlobeFocus(type, item);
    if (!options.silent && options.focus) focusGlobeOnItem(item, { pulse: type === "alert" || options.pulse });
    if (type === "alert" && !options.silent) {
      document.getElementById("map")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    renderSelectionCard(type, item);
    renderWatch(type, item, { loading: type === "camera" });
    if (type === "camera") renderCatalog();

    if (type === "camera") {
      try {
        const response = await fetch(`/api/feed-view?id=${encodeURIComponent(item.id)}&ts=${Date.now()}`);
        if (!response.ok) throw new Error(`Feed viewer failed with status ${response.status}`);
        state.feedView = await response.json();
        if (state.feedView?.streamStatus === "down" && state.feedView.type !== "image") {
          markStreamDown(item.id, { autoAdvance: Boolean(options.autoAdvanceOnDown) });
        }
      } catch (error) {
        state.feedView = buildLocalFeedView(item, error);
      }
      if (state.selection?.id === item.id) renderWatch(type, item);
    }

    if (options.scrollToWatch) {
      document.querySelector(".watch-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function renderSelectionCard(type, item) {
    const color = colorForType(type);
    const pinned = isPinned(type, item.id);
    const primaryAction = type === "camera"
      ? `<button class="text-button" style="color:${color}" type="button" data-select-type="camera" data-select-id="${escapeHtml(item.id)}" data-scroll-watch="true">Watch Feed</button>`
      : `<button class="text-button" style="color:${color}" type="button" data-select-type="${type}" data-select-id="${escapeHtml(item.id)}" data-scroll-watch="true">View Details</button>`;
    const focusAction = `<button class="text-button" style="color:${color}" type="button" data-select-type="${type}" data-select-id="${escapeHtml(item.id)}" data-focus="true" data-pulse="true">${type === "alert" ? "Pinpoint Alert" : "Pinpoint"}</button>`;
    const nearestCameraAction = type !== "camera" && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng))
      ? `<button class="text-button" style="color:var(--cyan)" type="button" data-nearest-camera data-nearest-type="${type}" data-nearest-id="${escapeHtml(item.id)}"><i data-lucide="cctv"></i>Nearest Camera</button>`
      : "";
    els.selectionCard.innerHTML = `<button class="selection-close" type="button" data-close-selection aria-label="Close selection card">
        <i data-lucide="x"></i>
      </button>
      <h3>${escapeHtml(item.name || item.callsign || item.title || item.id)}</h3>
      <p>${escapeHtml(assetSubtitle(type, item))}</p>
      <div class="selection-actions">
        ${primaryAction}
        ${focusAction}
        ${nearestCameraAction}
        <button class="text-button" style="color:${pinned ? "var(--green)" : color}" type="button" data-pin-asset="true" data-pin-type="${type}" data-pin-id="${escapeHtml(item.id)}">
          <i data-lucide="${pinned ? "bookmark-check" : "bookmark"}"></i>${pinned ? "Pinned" : "Pin"}
        </button>
      </div>`;
    els.selectionCard.classList.add("visible");
    if (globalThis.lucide) globalThis.lucide.createIcons();
  }

  function selectNearestCamera(item) {
    const cameras = filterUnavailableStreams(state.snapshot?.cameras || [])
      .filter((camera) => Number.isFinite(Number(camera.lat)) && Number.isFinite(Number(camera.lng)));
    if (!cameras.length) return;
    const nearest = cameras.reduce((best, camera) => {
      const distance = distanceKm(Number(item.lat), Number(item.lng), Number(camera.lat), Number(camera.lng));
      return !best || distance < best.distance ? { camera, distance } : best;
    }, null);
    if (!nearest) return;
    selectObject("camera", nearest.camera, { scrollToWatch: true });
  }

  function clearSelectionCard() {
    state.selection = null;
    state.feedView = null;
    els.selectionCard.classList.remove("visible", "pulse");
    renderSelectedGlobeFocus(null, null);
    renderCesiumSelection(null, null);
    renderCatalog();
  }

  function renderWatch(type, item, options = {}) {
    stopActiveMedia();
    els.watchTitle.textContent = item.name || item.callsign || item.title || item.id;
    els.watchMeta.textContent = assetSubtitle(type, item);
    els.watchActions.innerHTML = buildWatchActions(type, item);
    renderWatchDetail(type, item);

    if (type !== "camera") {
      renderInfoWatch(type, item);
      return;
    }

    if (options.loading) {
      els.watchView.innerHTML = `<div class="watch-placeholder"><i data-lucide="loader-circle"></i><span>Loading feed</span></div>`;
      if (globalThis.lucide) globalThis.lucide.createIcons();
      return;
    }

    renderFeedView(state.feedView || buildLocalFeedView(item));
  }

  function buildWatchActions(type, item) {
    const actions = [];
    actions.push(`<button class="text-button" type="button" data-select-type="${type}" data-select-id="${escapeHtml(item.id)}" data-focus="true">Center</button>`);
    actions.push(`<button class="text-button" type="button" data-pin-asset="true" data-pin-type="${type}" data-pin-id="${escapeHtml(item.id)}">${isPinned(type, item.id) ? "Pinned" : "Pin"}</button>`);
    if (type === "camera") actions.push(`<button class="text-button" type="button" data-select-type="camera" data-select-id="${escapeHtml(item.id)}">Refresh</button>`);
    if (item.sourcePageUrl || item.sourceUrl || item.officialUrl || item.url) {
      actions.push(`<button class="text-button" type="button" data-open-url="${escapeHtml(item.sourcePageUrl || item.sourceUrl || item.officialUrl || item.url)}">Source</button>`);
    }
    return actions.join("");
  }

  function renderFeedView(view) {
    stopActiveMedia();
    if (!view) {
      els.watchView.innerHTML = `<div class="watch-placeholder"><i data-lucide="cctv"></i><span>No feed selected</span></div>`;
      return;
    }
    const note = view.note ? `<p class="media-note">${escapeHtml(view.note)}</p>` : "";
    if (view.type === "image") {
      const src = toProxyImageUrl(view.url, true);
      els.watchView.innerHTML = `<div class="media-frame">
        <img src="${src}" alt="${escapeHtml(view.sourceLabel || "Camera image")}" data-direct-src="${escapeHtml(view.url)}">
        <span class="media-badge still">Refreshed still</span>
        ${note}
      </div>`;
      const image = els.watchView.querySelector("img[data-direct-src]");
      image?.addEventListener("error", () => showImageError(view));
      scheduleStillRefresh(view);
    } else if (view.type === "iframe") {
      els.watchView.innerHTML = `<div class="media-frame">
        <iframe src="${escapeHtml(view.url)}" title="${escapeHtml(view.sourceLabel || "Public player")}" allow="autoplay; fullscreen; encrypted-media" referrerpolicy="no-referrer-when-downgrade"></iframe>
        <span class="media-badge live">Embedded player</span>
        ${note}
      </div>`;
    } else if (view.type === "video" || view.type === "hls") {
      els.watchView.innerHTML = `<div class="media-frame">
        <video id="activeVideo" controls autoplay muted playsinline></video>
        <span class="media-badge live">Live video</span>
        ${note}
      </div>`;
      const video = document.getElementById("activeVideo");
      if (view.type === "hls" && globalThis.Hls && globalThis.Hls.isSupported()) {
        state.hls = new globalThis.Hls({ lowLatencyMode: true });
        state.hls.loadSource(view.url);
        state.hls.attachMedia(video);
        state.hls.on(globalThis.Hls.Events.ERROR, (_event, data) => {
          if (data?.fatal) showVideoError(data.details || "The HLS stream stopped responding.");
        });
      } else {
        video.src = view.url;
      }
      video.addEventListener("error", () => showVideoError("The browser could not play this video stream."));
    } else {
      els.watchView.innerHTML = `<div class="watch-placeholder"><i data-lucide="circle-off"></i><span>${escapeHtml(view.note || "Viewer unavailable")}</span></div>`;
    }

    if (globalThis.lucide) globalThis.lucide.createIcons();
  }

  function stopActiveMedia() {
    if (state.hls) {
      state.hls.destroy();
      state.hls = null;
    }
    if (state.stillRefreshTimer) {
      clearInterval(state.stillRefreshTimer);
      state.stillRefreshTimer = null;
    }
    const media = els.watchView?.querySelector?.("video, audio");
    media?.pause?.();
    if (media) media.removeAttribute("src");
  }

  function scheduleStillRefresh(view) {
    const seconds = clamp(Number(view.refreshSeconds || 60), 20, 600);
    state.stillRefreshTimer = setInterval(() => {
      const image = els.watchView.querySelector("img[data-direct-src]");
      if (!image) return;
      image.src = toProxyImageUrl(image.dataset.directSrc, true);
    }, seconds * 1000);
  }

  function showVideoError(message) {
    if (!els.watchView.querySelector("video")) return;
    if (state.selection?.type === "camera") markStreamDown(state.selection.id);
    els.watchView.insertAdjacentHTML(
      "beforeend",
      `<div class="media-error"><strong>Video unavailable</strong><span>${escapeHtml(message)}</span></div>`
    );
  }

  function markStreamDown(cameraId, options = {}) {
    if (!cameraId || state.downStreamIds.has(cameraId)) return;
    state.downStreamIds.add(cameraId);
    if (!state.includeDownStreams) {
      renderCatalog();
      renderCameraMap();
      renderGlobeLayers();
      if (options.autoAdvance && state.selection?.type === "camera" && state.selection.id === cameraId) {
        selectFirstAvailableCamera({ silent: true, autoAdvanceOnDown: true, excludeIds: new Set([cameraId]) });
      }
    }
  }

  function showImageError(view) {
    const frame = els.watchView.querySelector(".media-frame");
    if (!frame || frame.querySelector(".media-error")) return;
    frame.insertAdjacentHTML(
      "beforeend",
      `<div class="media-error"><strong>Image unavailable</strong><span>This public still endpoint did not return an image right now. Try Refresh or open the source.</span></div>`
    );
  }

  function renderInfoWatch(type, item) {
    const color = colorForType(type);
    if (type === "radio") {
      els.watchView.innerHTML = `<div class="asset-watch radio-watch" style="border-color:${color}">
        <div class="asset-watch-icon"><i data-lucide="radio"></i></div>
        <div>
          <span class="media-badge live">Public radio</span>
          <h3>${escapeHtml(item.name || "Radio station")}</h3>
          <p>${escapeHtml(assetSubtitle(type, item))}</p>
          <audio controls preload="none" src="${escapeHtml(item.streamUrl || "")}"></audio>
          <small>Playback starts only when you press play.</small>
        </div>
      </div>`;
      const audio = els.watchView.querySelector("audio");
      audio?.addEventListener("error", () => {
        const note = els.watchView.querySelector("small");
        if (note) note.textContent = "This broadcaster is not accepting playback right now. Try its source page.";
      });
      if (globalThis.lucide) globalThis.lucide.createIcons();
      return;
    }
    if (type === "alert") {
      els.watchView.innerHTML = `<div class="alert-watch" style="border-color:${color}">
        <div>
          <span class="media-badge live">NWS Alert</span>
          <h3>${escapeHtml(item.event || item.title || "Weather alert")}</h3>
          <p>${escapeHtml(item.areaSummary || item.region || "Unknown affected area")}</p>
        </div>
        <p>${escapeHtml(shorten(item.instruction || infoSummary(type, item), 280))}</p>
        <button class="text-button" type="button" data-select-type="alert" data-select-id="${escapeHtml(item.id)}">Center On Globe</button>
      </div>`;
      return;
    }
    if (type === "quake" && item.shakeMap?.intensityMap) {
      els.watchView.innerHTML = `<div class="asset-watch shakemap-watch" style="border-color:${color}">
        <div>
          <span class="media-badge live">USGS ShakeMap</span>
          <h3>${escapeHtml(item.name || item.title || "Earthquake")}</h3>
          <p>${escapeHtml(infoSummary(type, item))}</p>
          <img src="${toProxyImageUrl(item.shakeMap.intensityMap)}" alt="USGS ShakeMap intensity map">
        </div>
        <button class="text-button" type="button" data-select-type="quake" data-select-id="${escapeHtml(item.id)}" data-focus="true">Center On Globe</button>
      </div>`;
      return;
    }
    const trackPoints = getTrackPoints(type, item);
    const trackText = type === "flight"
      ? trackPoints.length > 1
        ? `${trackPoints.length} observed positions retained in this browser session.`
        : "Trail uses current heading until another refresh observes movement."
      : type === "satellite"
        ? trackPoints.length > 1
          ? `${trackPoints.length} observed positions plus computed orbital path.`
          : "Computed orbital path is highlighted from public element data."
        : type === "vessel"
          ? trackPoints.length > 1
            ? `${trackPoints.length} recent AIS positions retained for this vessel.`
            : "Waiting for another AIS position to draw a wake trail."
        : infoSummary(type, item);
    els.watchView.innerHTML = `<div class="asset-watch" style="border-color:${color}">
      <div class="asset-watch-icon"><i data-lucide="${iconForType(type)}"></i></div>
      <div>
        <span class="media-badge live">${escapeHtml(type)}</span>
        <h3>${escapeHtml(item.name || item.callsign || item.title || item.id)}</h3>
        <p>${escapeHtml(infoSummary(type, item))}</p>
        <p>${escapeHtml(trackText)}</p>
      </div>
      <button class="text-button" type="button" data-select-type="${type}" data-select-id="${escapeHtml(item.id)}" data-focus="true">Center On Globe</button>
    </div>`;
    if (globalThis.lucide) globalThis.lucide.createIcons();
  }

  function renderWatchDetail(type, item) {
    const details = detailsForItem(type, item);
    els.watchDetail.innerHTML = details
      .map(([label, value]) => `<div class="detail-cell"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
      .join("");
  }

  function initSafeDirectoryForGitNotice() {
    return null;
  }

  function buildLocalFeedView(camera, error) {
    if (camera.viewerType === "hls" && camera.streamUrl) {
      return {
        type: "hls",
        url: camera.streamUrl,
        sourceLabel: camera.sourceName || "Public video stream",
        note: error ? error.message : "Local stream candidate.",
      };
    }
    if (camera.viewerType === "video" && camera.streamUrl) {
      return {
        type: "video",
        url: camera.streamUrl,
        sourceLabel: camera.sourceName || "Public video feed",
        note: error ? error.message : "Local mapped public video asset.",
      };
    }
    if (camera.imageUrl || camera.previewUrl) {
      return {
        type: "image",
        url: camera.imageUrl || camera.previewUrl,
        sourceLabel: camera.sourceName || "Mapped public image",
        note: error ? error.message : "Local mapped public image endpoint.",
        refreshSeconds: camera.refreshSeconds || 60,
      };
    }
    const metaViewer = META[camera.id]?.viewer;
    if (metaViewer?.type === "image") {
      return {
        type: "image",
        url: metaViewer.url,
        sourceLabel: "Mapped public still",
        note: error ? error.message : "Local mapped public image endpoint.",
      };
    }
    if (metaViewer?.type === "iframe") {
      return {
        type: "iframe",
        url: metaViewer.url,
        sourceLabel: "Mapped public player",
        note: error ? error.message : "Local mapped public page.",
      };
    }
    return {
      type: "iframe",
      url: camera.url,
      sourceLabel: "Official source page",
      note: error ? error.message : "No direct viewer mapping yet.",
    };
  }

  function refreshSelectionReference() {
    if (!state.selection) return;
    const item = findItem(state.selection.type, state.selection.id);
    if (item) {
      if (state.selection.type === "camera" && shouldHideUnavailableCamera(item)) {
        selectFirstAvailableCamera({ silent: true, autoAdvanceOnDown: true, excludeIds: new Set([item.id]) });
        return;
      }
      state.selection.item = item;
      renderSelectionCard(state.selection.type, item);
      renderWatch(state.selection.type, item, { loading: state.selection.type === "camera" && !state.feedView });
      return;
    }

    selectFirstAvailableCamera({ silent: true, autoAdvanceOnDown: true });
  }

  function findItem(type, id) {
    const snapshot = state.snapshot || buildFallbackSnapshot();
    if (type === "camera") return snapshot.cameras.find((item) => item.id === id);
    if (type === "satellite") return snapshot.satellites.find((item) => item.id === id);
    if (type === "flight") return snapshot.flights.find((item) => item.id === id);
    if (type === "quake") return snapshot.quakes.find((item) => item.id === id);
    if (type === "fire") return (snapshot.fires || []).find((item) => item.id === id);
    if (type === "demographic") return (snapshot.demographics || []).find((item) => item.id === id);
    if (type === "vessel") return (snapshot.vessels || []).find((item) => item.id === id);
    if (type === "launch") return (snapshot.launches || []).find((item) => item.id === id);
    if (type === "radio") return (snapshot.radio || []).find((item) => item.id === id);
    if (type === "alert") return snapshot.alerts.find((item) => item.id === id);
    return null;
  }

  function getFilteredCameras() {
    return filterUnavailableStreams(filterByCameraMode(getMapCameras()));
  }

  function getMapCameras() {
    const cameras = state.snapshot?.cameras || buildFallbackCameras();
    return filterByQuery(cameras);
  }

  function getCatalogCameraSet(cameras = getFilteredCameras()) {
    if (!state.mapListMode || !state.cameraMap) return { cameras, label: "matching" };
    const bounds = state.cameraMap.getBounds();
    const inView = cameras.filter((camera) => bounds.contains([camera.lat, camera.lng]));
    if (inView.length) return { cameras: inView, label: "in map view" };
    const center = state.cameraMap.getCenter();
    return {
      cameras: [...cameras]
        .sort((left, right) => distanceKm(center.lat, center.lng, left.lat, left.lng) - distanceKm(center.lat, center.lng, right.lat, right.lng))
        .slice(0, 80),
      label: "nearest to map center",
    };
  }

  function filterByCameraMode(cameras) {
    if (state.cameraFilter === "video") {
      return cameras.filter((camera) =>
        camera.capability === "player" ||
        camera.capability === "stream" ||
        (state.includeDownStreams && camera.capability === "candidate")
      );
    }
    if (state.cameraFilter === "stills") return cameras.filter((camera) => camera.viewerType === "image");
    if (state.cameraFilter === "traffic") return cameras.filter((camera) => camera.category === "traffic");
    if (state.cameraFilter === "outside-us") return cameras.filter((camera) => camera.country && camera.country !== "United States");
    return cameras;
  }

  function filterUnavailableStreams(cameras) {
    if (state.includeDownStreams) return cameras;
    return cameras.filter((camera) => !shouldHideUnavailableCamera(camera));
  }

  function shouldHideUnavailableCamera(camera) {
    return !state.includeDownStreams && (camera.capability === "candidate" || state.downStreamIds.has(camera.id));
  }

  function chooseDefaultCamera(cameras = state.snapshot?.cameras || []) {
    const available = filterUnavailableStreams(cameras || []);
    return available.find((camera) => camera.capability === "stream") ||
      available.find((camera) => camera.capability === "player") ||
      available.find((camera) => camera.viewerType === "image") ||
      available[0] ||
      (cameras || [])[0];
  }

  function selectFirstAvailableCamera(options = {}) {
    const { excludeIds, ...selectOptions } = options;
    const cameras = (state.snapshot?.cameras || []).filter((camera) => !excludeIds?.has(camera.id));
    const firstCamera = chooseDefaultCamera(cameras);
    if (firstCamera) {
      state.selection = null;
      state.feedView = null;
      selectObject("camera", firstCamera, { silent: true, autoAdvanceOnDown: true, ...selectOptions });
    }
  }

  function hiddenStreamCameraCount() {
    const cameras = getMapCameras();
    return cameras.filter((camera) => camera.capability === "candidate" || state.downStreamIds.has(camera.id)).length;
  }

  function cameraStatusLabel(camera) {
    if (state.downStreamIds.has(camera.id)) return "down";
    if (camera.capability === "candidate") return "unverified";
    if (camera.capability === "player" || camera.capability === "stream") return "live";
    return camera.category || "camera";
  }

  function activeCameraFilterLabel() {
    return CAMERA_FILTERS.find((filter) => filter.id === state.cameraFilter)?.label || "matching cameras";
  }

  function getFilteredEvents() {
    return filterByQuery(state.snapshot?.events || []);
  }

  function getFilteredAssets() {
    const snapshot = state.snapshot || buildFallbackSnapshot();
    const assets = [];
    if (state.layers.satellites) assets.push(...snapshot.satellites.map((item) => ({ type: "satellite", item })));
    if (state.layers.flights) assets.push(...snapshot.flights.map((item) => ({ type: "flight", item })));
    if (state.layers.quakes) assets.push(...snapshot.quakes.map((item) => ({ type: "quake", item })));
    if (state.layers.fires) assets.push(...(snapshot.fires || []).map((item) => ({ type: "fire", item })));
    if (state.layers.alerts) assets.push(...snapshot.alerts.map((item) => ({ type: "alert", item })));
    if (state.layers.demographics) assets.push(...(snapshot.demographics || []).map((item) => ({ type: "demographic", item })));
    if (state.layers.vessels) assets.push(...(snapshot.vessels || []).map((item) => ({ type: "vessel", item })));
    if (state.layers.launches) assets.push(...(snapshot.launches || []).map((item) => ({ type: "launch", item })));
    if (state.layers.radio) assets.push(...(snapshot.radio || []).map((item) => ({ type: "radio", item })));
    if (state.layers.cameras) assets.push(...getFilteredCameras().slice(0, 16).map((item) => ({ type: "camera", item })));
    return filterAssetsByQuery(assets);
  }

  function getSearchMatches() {
    const snapshot = state.snapshot || buildFallbackSnapshot();
    const matches = filterAssetsByQuery([
      ...snapshot.cameras.map((item) => ({ type: "camera", item })),
      ...snapshot.satellites.map((item) => ({ type: "satellite", item })),
      ...snapshot.flights.map((item) => ({ type: "flight", item })),
      ...snapshot.quakes.map((item) => ({ type: "quake", item })),
      ...(snapshot.fires || []).map((item) => ({ type: "fire", item })),
      ...(snapshot.demographics || []).map((item) => ({ type: "demographic", item })),
      ...(snapshot.vessels || []).map((item) => ({ type: "vessel", item })),
      ...(snapshot.launches || []).map((item) => ({ type: "launch", item })),
      ...(snapshot.radio || []).map((item) => ({ type: "radio", item })),
      ...snapshot.alerts.map((item) => ({ type: "alert", item })),
    ]);
    if (!state.query) return matches;
    return matches.sort((left, right) => searchRank(left) - searchRank(right));
  }

  function searchRank(entry) {
    const item = entry.item || {};
    const query = state.query;
    const exactFields = [item.country, item.region, item.area, item.name, item.title, item.callsign, item.id]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    if (exactFields.some((value) => value === query)) return 0;
    if (exactFields.some((value) => value.startsWith(query))) return 1;
    if (entry.type === "camera") return 2;
    if (entry.type === "alert") return 3;
    if (entry.type === "demographic") return 4;
    return 5;
  }

  function filterAssetsByQuery(assets) {
    if (!state.query) return assets;
    return assets.filter(({ type, item }) => searchableText(type, item).includes(state.query));
  }

  function filterByQuery(items) {
    if (!state.query) return items || [];
    return (items || []).filter((item) => searchableText("", item).includes(state.query));
  }

  function searchableText(type, item) {
    return [
      type,
      item.name,
      item.shortName,
      item.title,
      item.callsign,
      item.id,
      item.area,
      item.region,
      item.country,
      item.source,
      item.sourceName,
      item.category,
      item.severity,
      item.location,
      item.objectType,
      item.subtype,
      item.gacc,
      item.county,
      item.state,
      item.populationLabel,
      item.dataset,
      item.mmsi,
      item.imo,
      item.destination,
      item.vesselType,
      item.agency,
      item.rocket,
      item.missionName,
      item.missionType,
      item.language,
      item.codec,
    ]
      .concat(Array.isArray(item.tags) ? item.tags : [])
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function buildFallbackSnapshot(error) {
    const cameras = buildFallbackCameras();
    return {
      generatedAt: new Date().toISOString(),
      scope: state.scope,
      cameras,
      satellites: [],
      flights: [],
      quakes: [],
      fires: [],
      demographics: [],
      vessels: [],
      launches: [],
      radio: [],
      alerts: [],
      traffic: [],
      events: cameras.slice(0, 6).map((camera) => ({
        id: camera.id,
        type: "camera",
        title: camera.name,
        region: camera.region,
        time: new Date().toISOString(),
        severity: camera.capabilityLabel,
      })),
      regions: buildRegions(cameras),
      sourceHealth: [{ name: "Local catalog", ok: true }, { name: "Live adapters", ok: false, message: error?.message || "Offline" }],
      severity: { critical: 0, high: 0, medium: 0, low: cameras.length },
      metrics: { eventsToday: cameras.length, alerts: 0, assets: cameras.length, cameraFeeds: cameras.length, videoFeeds: cameras.filter((camera) => camera.capability === "player").length, streams: 1, demographics: 0 },
    };
  }

  function buildFallbackCameras() {
    const sourcesById = new Map(DATA.sources.map((source) => [source.id, source]));
    return DATA.feeds
      .map((feed) => {
        const meta = META[feed.id] || {};
        const source = sourcesById.get(feed.sourceId) || {};
        const viewer = meta.viewer || {};
        return {
          ...feed,
          lat: meta.lat,
          lng: meta.lng,
          sourceName: source.name || feed.sourceId,
          sourceUrl: source.url || feed.url,
          viewerType: viewer.type || "page",
          imageUrl: viewer.type === "image" ? viewer.url : "",
          previewUrl: viewer.type === "image" ? viewer.url : "",
          capability: viewer.type === "iframe" ? "page" : viewer.type === "image" ? "snapshot" : "source",
          capabilityLabel: viewer.type === "iframe" ? "Source Page" : viewer.type === "image" ? "Current Still" : "Source",
        };
      })
      .filter((feed) => Number.isFinite(feed.lat) && Number.isFinite(feed.lng));
  }

  function buildRegions(cameras) {
    const byRegion = new Map();
    cameras.forEach((camera) => {
      const key = camera.region || "Unknown";
      byRegion.set(key, (byRegion.get(key) || 0) + 1);
    });
    return Array.from(byRegion, ([name, total], index) => ({ name, total, color: palette(index), delta: "+ catalog" }));
  }

  function drawSparkline(canvas, series) {
    const ctx = setupCanvas(canvas);
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    drawGrid(ctx, width, height);
    const max = Math.max(...series, 1);
    const min = Math.min(...series, 0);
    ctx.beginPath();
    series.forEach((value, index) => {
      const x = (index / (series.length - 1 || 1)) * width;
      const y = height - ((value - min) / Math.max(1, max - min)) * (height - 22) - 11;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = COLORS.cameras;
    ctx.lineWidth = 3;
    ctx.shadowColor = COLORS.cameras;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawDonut(canvas, values, colors) {
    const ctx = setupCanvas(canvas);
    if (!ctx) return;
    const { width, height } = canvas;
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    const radius = Math.min(width, height) * 0.42;
    const inner = radius * 0.58;
    let angle = -Math.PI / 2;
    ctx.clearRect(0, 0, width, height);
    values.forEach((value, index) => {
      const slice = (value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, radius, angle, angle + slice);
      ctx.arc(width / 2, height / 2, inner, angle + slice, angle, true);
      ctx.closePath();
      ctx.fillStyle = colors[index];
      ctx.fill();
      angle += slice;
    });
    ctx.fillStyle = "#06111b";
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, inner * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 22px IBM Plex Sans";
    ctx.textAlign = "center";
    ctx.fillText(formatNumber(total), width / 2, height / 2 + 4);
  }

  function setupCanvas(canvas) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    canvas.width = Math.max(1, Math.floor(rect.width));
    canvas.height = Math.max(1, Math.floor(rect.height));
    return canvas.getContext("2d");
  }

  function drawGrid(ctx, width, height) {
    ctx.strokeStyle = "rgba(111,177,214,0.16)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  function buildSignalSeries(values) {
    const base = values.reduce((sum, value) => sum + value, 0) || 1;
    return Array.from({ length: 36 }, (_, index) => {
      const wave = Math.sin(index * 0.55) * 0.18 + Math.cos(index * 0.18) * 0.12;
      const ramp = index / 50;
      return Math.max(1, Math.round(base * (0.62 + wave + ramp)));
    });
  }

  function detailsForItem(type, item) {
    if (type === "camera") {
      return [
        ["Area", item.area || "Unknown"],
        ["Source", item.sourceName || item.sourceId || "Public source"],
        ["Capability", item.capabilityLabel || item.media || "Unknown"],
        ["Region", item.region || "Unknown"],
        ["Category", item.category || "camera"],
        ["Refresh", item.refreshSeconds ? `${Math.round(item.refreshSeconds / 60)} min` : item.freshness ? `${item.freshness} min` : "source defined"],
      ];
    }
    if (type === "satellite") {
      return [
        ["NORAD", item.noradId || item.id],
        ["Object", item.objectType || "Satellite"],
        ["Altitude", item.altitudeKm ? `${Math.round(item.altitudeKm)} km` : "estimated"],
        ["Inclination", item.inclination ? `${item.inclination.toFixed(1)} deg` : "unknown"],
        ["Period", item.periodMinutes ? `${item.periodMinutes.toFixed(1)} min` : "unknown"],
        ["Position", formatLatLng(item.lat, item.lng)],
        ["Trail", getTrackPoints(type, item).length > 1 ? `${getTrackPoints(type, item).length} points` : "orbit fallback"],
        ["Source", item.source || "Public orbital elements"],
      ];
    }
    if (type === "flight") {
      return [
        ["Callsign", item.callsign || "Unknown"],
        ["ICAO24", item.icao24 || item.id?.replace(/^flight-/, "") || "unknown"],
        ["Registration", item.registration || "unknown"],
        ["Aircraft", item.aircraftType || "unknown"],
        ["Altitude", item.altitudeMeters ? `${Math.round(item.altitudeMeters)} m` : "unknown"],
        ["Velocity", item.velocity ? `${Math.round(item.velocity)} m/s` : "unknown"],
        ["Heading", Number.isFinite(Number(item.heading)) ? `${Math.round(item.heading)} deg` : "unknown"],
        ["Country", item.country || "unknown"],
        ["Position", formatLatLng(item.lat, item.lng)],
        ["Trail", getTrackPoints(type, item).length > 1 ? `${getTrackPoints(type, item).length} points` : "heading fallback"],
        ["Source", item.source || "Aircraft feed"],
      ];
    }
    if (type === "quake") {
      return [
        ["Magnitude", item.magnitude ? item.magnitude.toFixed(1) : "unknown"],
        ["Depth", item.depthKm ? `${item.depthKm.toFixed(1)} km` : "unknown"],
        ["Place", item.location || "unknown"],
        ["ShakeMap", item.shakeMap ? `MMI ${Number(item.shakeMap.maxMmi || 0).toFixed(1)}` : "not available"],
        ["Time", formatShortTime(item.time)],
        ["Severity", item.severity || "seismic"],
        ["Source", "USGS"],
      ];
    }
    if (type === "fire") {
      if (item.subtype === "incident" || item.subtype === "perimeter") {
        return [
          ["Kind", item.subtype === "perimeter" ? "Current perimeter" : "Active incident"],
          ["Acres", item.acres ? formatNumber(Math.round(item.acres)) : "unknown"],
          ["Containment", item.containment != null ? `${item.containment}%` : "unknown"],
          ["Area", [item.county, item.state].filter(Boolean).join(", ") || item.gacc || "unknown"],
          ["Cause", item.cause || "unknown"],
          ["Updated", formatShortTime(item.time)],
          ["Source", item.source || "EGP WildFireSA"],
        ];
      }
      return [
        ["Confidence", item.confidence || "unknown"],
        ["FRP", item.frp ? `${Math.round(item.frp)} MW` : "unknown"],
        ["Brightness", item.brightness ? `${Math.round(item.brightness)} K` : "unknown"],
        ["Instrument", item.instrument || "VIIRS"],
        ["Satellite", item.satellite || "unknown"],
        ["Time", formatShortTime(item.time)],
        ["Position", formatLatLng(item.lat, item.lng)],
        ["Source", "NASA FIRMS"],
      ];
    }
    if (type === "alert") {
      return [
        ["Event", item.event || "Alert"],
        ["Area", item.areaSummary || item.region || item.area || "unknown"],
        ["Severity", item.severity || "unknown"],
        ["Urgency", item.urgency || "unknown"],
        ["Certainty", item.certainty || "unknown"],
        ["Sent", formatShortTime(item.time)],
        ["Expires", item.expires ? formatShortTime(item.expires) : "unknown"],
        ["Source", item.source || "NWS"],
      ];
    }
    if (type === "demographic") {
      return [
        ["Population", item.populationLabel || formatNumber(item.population || 0)],
        ["Dataset", item.dataset || "ACS total population"],
        ["Area", item.name || item.area || "unknown"],
        ["Scope", item.region || "United States"],
        ["Position", formatLatLng(item.lat, item.lng)],
        ["Source", item.source || "U.S. Census"],
      ];
    }
    if (type === "vessel") {
      return [
        ["MMSI", item.mmsi || "unknown"],
        ["IMO", item.imo || "unknown"],
        ["Vessel", item.vesselType || "unclassified"],
        ["Destination", item.destination || "not reported"],
        ["Speed", item.speedKnots != null ? `${Number(item.speedKnots).toFixed(1)} kn` : "unknown"],
        ["Course", item.course != null ? `${Math.round(item.course)} deg` : "unknown"],
        ["Observed", formatShortTime(item.observedAt)],
        ["Source", "AISStream"],
      ];
    }
    if (type === "launch") {
      return [
        ["Status", item.status || "unknown"],
        ["Launch", item.net ? formatShortTime(item.net) : "TBD"],
        ["Provider", item.agency || "unknown"],
        ["Vehicle", item.rocket || "unknown"],
        ["Pad", item.pad || item.area || "unknown"],
        ["Mission", item.missionName || item.missionType || "not disclosed"],
        ["Orbit", item.orbit || "not disclosed"],
        ["Source", "Launch Library 2"],
      ];
    }
    if (type === "radio") {
      return [
        ["Country", item.country || "unknown"],
        ["Region", item.region || "unknown"],
        ["Language", item.language || "not listed"],
        ["Codec", item.codec || "unknown"],
        ["Bitrate", item.bitrate ? `${item.bitrate} kbps` : "unknown"],
        ["Source", "Radio Browser"],
      ];
    }
    return [["Type", type], ["ID", item.id || "unknown"], ["Source", item.source || "public"]];
  }

  function assetSubtitle(type, item) {
    if (type === "camera") return `${item.area || "Unknown"} | ${item.region || item.country || "Global"} | ${item.capabilityLabel || item.media || "Camera"}`;
    if (type === "satellite") return `${item.objectType || "Satellite"} | ${item.altitudeKm ? `${Math.round(item.altitudeKm)} km` : "orbit"} | ${item.source || "Public orbital data"}`;
    if (type === "flight") return `${item.registration || item.country || "Unknown"} | ${item.altitudeMeters ? `${Math.round(item.altitudeMeters)} m` : "altitude unknown"} | ${item.source || "Aircraft feed"}`;
    if (type === "quake") return `M${item.magnitude?.toFixed?.(1) || "?"} | ${item.location || "USGS event"}`;
    if (type === "fire" && (item.subtype === "incident" || item.subtype === "perimeter")) return `${item.subtype === "perimeter" ? "Perimeter" : "Incident"} | ${item.acres ? `${formatNumber(Math.round(item.acres))} acres` : item.gacc || "WildFireSA"} | ${item.source || "EGP"}`;
    if (type === "fire") return `${item.instrument || "VIIRS"} | FRP ${Math.round(item.frp || 0)} | ${item.confidence || "unknown"} confidence`;
    if (type === "alert") return `${item.event || "Alert"} | ${item.areaSummary || item.region || item.area || "NWS"}`;
    if (type === "demographic") return `${item.populationLabel || formatNumber(item.population || 0)} people | ${item.source || "U.S. Census Population Estimates"}`;
    if (type === "vessel") return `${item.vesselType || "Vessel"} | ${item.speedKnots != null ? `${Number(item.speedKnots).toFixed(1)} kn` : "speed unknown"} | AISStream`;
    if (type === "launch") return `${item.status || "Mission"} | ${item.rocket || item.agency || "Launch Library 2"} | ${item.net ? formatShortTime(item.net) : "time TBD"}`;
    if (type === "radio") return `${item.region || item.country || "Global"} | ${item.language || item.codec || "Public radio"}`;
    return item.source || "Public signal";
  }

  function infoSummary(type, item) {
    if (type === "satellite") return "Approximate live position from current public element data.";
    if (type === "flight") return `Public aircraft state from ${item.source || "available public aircraft feed"}.`;
    if (type === "quake") return item.shakeMap ? `USGS seismic event with ShakeMap impact data. Max MMI ${Number(item.shakeMap.maxMmi || 0).toFixed(1)}.` : "USGS seismic event from the all-day GeoJSON feed.";
    if (type === "fire" && item.subtype === "perimeter") return `Current interagency perimeter from WFIGS. ${item.acres ? `${formatNumber(Math.round(item.acres))} mapped acres.` : "Mapped perimeter available."}`;
    if (type === "fire" && item.subtype === "incident") return `Active incident from EGP WildFireSA. ${item.acres ? `${formatNumber(Math.round(item.acres))} reported acres.` : "Incident details available."}`;
    if (type === "fire") return `NASA FIRMS ${item.instrument || "VIIRS"} hotspot. FRP ${Math.round(item.frp || 0)}, confidence ${item.confidence || "unknown"}.`;
    if (type === "alert") return item.source === "NWS" || !item.source
      ? "Official public weather alert from the National Weather Service."
      : `${item.source} public monitoring signal. Treat reference/media items as context, not official confirmation.`;
    if (type === "demographic") return `State-level population context from ${item.source || "U.S. Census Population Estimates"}. Useful for reading hazards near people, not as an incident feed.`;
    if (type === "vessel") return `Public AIS position for ${item.name || item.mmsi || "this vessel"}, observed ${formatTimeAgo(item.observedAt)}.`;
    if (type === "launch") return `${item.status || "Scheduled"} space mission from Launch Library 2. ${item.description || "Mission details are shown only when published by the source."}`;
    if (type === "radio") return "Public internet radio station from the community Radio Browser directory.";
    return assetSubtitle(type, item);
  }

  function iconForType(type) {
    return {
      camera: "cctv",
      satellite: "satellite",
      flight: "plane",
      quake: "activity",
      fire: "flame",
      alert: "bell-ring",
      demographic: "users",
      vessel: "ship",
      launch: "rocket",
      radio: "radio",
      traffic: "route",
    }[type] || "circle";
  }

  function colorForType(type) {
    return {
      camera: COLORS.cameras,
      satellite: COLORS.satellites,
      flight: COLORS.flights,
      quake: COLORS.quakes,
      fire: COLORS.fires,
      alert: COLORS.alerts,
      demographic: COLORS.demographics,
      vessel: COLORS.vessels,
      launch: COLORS.launches,
      radio: COLORS.radio,
      traffic: COLORS.traffic,
    }[type] || COLORS.cameras;
  }

  function colorForCamera(camera) {
    if (camera.category === "wildfire") return COLORS.wildfire;
    if (camera.category === "marine" || camera.category === "harbor") return COLORS.marine;
    if (camera.category === "traffic") return COLORS.trafficFeed;
    if (camera.category === "service") return COLORS.service;
    return COLORS.city;
  }

  function labelForScope(scopeId) {
    return SCOPES.find((scope) => scope.id === scopeId)?.label || scopeId;
  }

  function toProxyImageUrl(url, bustCache = false) {
    if (!url) return "";
    const proxy = `/api/image-proxy?url=${encodeURIComponent(url)}`;
    return bustCache ? `${proxy}&ts=${Date.now()}` : proxy;
  }

  function clearGroup(group) {
    while (group.children.length) {
      const child = group.children.pop();
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
  }

  function sampleItems(items, max) {
    if (!items || items.length <= max) return items || [];
    const step = items.length / max;
    return Array.from({ length: max }, (_, index) => items[Math.floor(index * step)]).filter(Boolean);
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function destinationPoint(lat, lng, bearing, distanceKm) {
    const radiusKm = 6371;
    const angularDistance = distanceKm / radiusKm;
    const bearingRad = (bearing * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;
    const lngRad = (lng * Math.PI) / 180;
    const nextLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
        Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad)
    );
    const nextLng =
      lngRad +
      Math.atan2(
        Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
        Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(nextLat)
      );
    return { lat: (nextLat * 180) / Math.PI, lng: (((nextLng * 180) / Math.PI + 540) % 360) - 180 };
  }

  function distanceKm(latA, lngA, latB, lngB) {
    const radiusKm = 6371;
    const dLat = ((latB - latA) * Math.PI) / 180;
    const dLng = ((lngB - lngA) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((latA * Math.PI) / 180) * Math.cos((latB * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function palette(index) {
    return [COLORS.cameras, COLORS.flights, COLORS.satellites, COLORS.alerts, COLORS.quakes, COLORS.wildfire][index % 6];
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat().format(Math.round(Number(value) || 0));
  }

  function formatTimeAgo(value) {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return "just now";
    const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.round(minutes / 60)}h ago`;
  }

  function formatShortTime(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return "--:--";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatLatLng(lat, lng) {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return "unknown";
    const ns = latNum >= 0 ? "N" : "S";
    const ew = lngNum >= 0 ? "E" : "W";
    return `${Math.abs(latNum).toFixed(3)} ${ns}, ${Math.abs(lngNum).toFixed(3)} ${ew}`;
  }

  function loadGlobeRendererPreference() {
    const saved = localStorage.getItem("oversee:globe-renderer");
    return saved === "three" || saved === "cesium" ? saved : "cesium";
  }

  function shorten(value, max) {
    const text = String(value || "");
    return text.length > max ? `${text.slice(0, max - 1)}...` : text;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
