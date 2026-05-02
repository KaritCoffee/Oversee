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
  ];

  const LAYERS = [
    { id: "cameras", label: "Cameras", color: "#19e2ff", icon: "cctv" },
    { id: "satellites", label: "Satellites", color: "#b85cff", icon: "satellite" },
    { id: "flights", label: "Flights", color: "#ffb02e", icon: "plane" },
    { id: "quakes", label: "Quakes", color: "#ff4e57", icon: "activity" },
    { id: "alerts", label: "Alerts", color: "#18f0a0", icon: "bell-ring" },
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
      detail: "Combines curated public cameras with official no-key feeds from NYC DOT, Caltrans, TfL JamCams, Iowa DOT, Ireland TII, Toronto, Florida 511, Georgia DOT, KYTC/Indiana, Redmond, and Lawrence.",
    },
    {
      name: "CelesTrak GP Data",
      status: "Free public feed",
      detail: "Active satellite element sets are sampled and rendered as approximate orbital positions with path arcs, altitude classes, and colored orbital regimes.",
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
      name: "OpenSky Network",
      status: "Best effort",
      detail: "Public aircraft states refresh automatically when anonymous rate limits allow it; trails show recent heading.",
    },
    {
      name: "USGS Earthquakes",
      status: "Free public feed",
      detail: "All-day GeoJSON feed powers seismic events and the recent-signals queue.",
    },
    {
      name: "National Weather Service",
      status: "Free public API",
      detail: "Active United States alerts add official hazard context where public NWS coverage exists.",
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
    alerts: "#18f0a0",
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
    layers: Object.fromEntries(LAYERS.map((layer) => [layer.id, true])),
    snapshot: null,
    query: "",
    cameraFilter: "all",
    includeDownStreams: false,
    downStreamIds: new Set(),
    catalogLimit: 120,
    assetLimit: 6,
    mapListMode: false,
    hasFitCameraMap: false,
    suppressMapMove: false,
    selection: null,
    feedView: null,
    regionSortAlpha: false,
    cameraMap: null,
    cameraLayer: null,
    radarLayer: null,
    radarOverlay: false,
    cameraRenderer: null,
    hls: null,
    stillRefreshTimer: null,
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
    dragging: false,
    dragStartedAt: [0, 0],
  };

  const els = {
    body: document.body,
    searchInput: document.getElementById("searchInput"),
    systemStatusLabel: document.getElementById("systemStatusLabel"),
    systemStatusSub: document.getElementById("systemStatusSub"),
    clockUtc: document.getElementById("clockUtc"),
    clockLocal: document.getElementById("clockLocal"),
    refreshAll: document.getElementById("refreshAll"),
    cycleSensorMode: document.getElementById("cycleSensorMode"),
    focusHome: document.getElementById("focusHome"),
    openSourcePanel: document.getElementById("openSourcePanel"),
    closeSourcePanel: document.getElementById("closeSourcePanel"),
    sourceDrawer: document.getElementById("sourceDrawer"),
    sourceGrid: document.getElementById("sourceGrid"),
    scopeControls: document.getElementById("scopeControls"),
    earthViewControls: document.getElementById("earthViewControls"),
    sensorModeControls: document.getElementById("sensorModeControls"),
    layerControls: document.getElementById("layerControls"),
    metricStrip: document.getElementById("metricStrip"),
    eventList: document.getElementById("eventList"),
    regionList: document.getElementById("regionList"),
    sortRegions: document.getElementById("sortRegions"),
    cameraFilterControls: document.getElementById("cameraFilterControls"),
    includeDownStreams: document.getElementById("includeDownStreams"),
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
    cameraMapMeta: document.getElementById("cameraMapMeta"),
    catalogList: document.getElementById("catalogList"),
    catalogTitle: document.getElementById("catalogTitle"),
    catalogHelp: document.getElementById("catalogHelp"),
    clearSearch: document.getElementById("clearSearch"),
    resetMapArea: document.getElementById("resetMapArea"),
    selectionCard: document.getElementById("selectionCard"),
    globeCanvas: document.getElementById("globeCanvas"),
    theaterSubtitle: document.getElementById("theaterSubtitle"),
  };

  init();

  function init() {
    bindEvents();
    renderStaticControls();
    renderSourceDrawer();
    initClock();
    initGlobe();
    initCameraMap();
    refreshSnapshot({ keepSelection: false });
    setInterval(initClock, 1000);
    setInterval(() => refreshSnapshot({ keepSelection: true, quiet: true }), 60000);
    if (globalThis.lucide) globalThis.lucide.createIcons();
  }

  function bindEvents() {
    els.searchInput.addEventListener("input", (event) => {
      state.query = event.target.value.trim().toLowerCase();
      state.mapListMode = false;
      state.catalogLimit = 120;
      renderCatalog();
      renderAssets();
      renderCameraMap({ fit: true });
      renderGlobeLayers();
    });

    els.searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const first = getSearchMatches()[0];
      if (first) selectObject(first.type, first.item, { focus: true });
    });

    els.refreshAll.addEventListener("click", () => refreshSnapshot({ force: true }));
    els.focusHome.addEventListener("click", () => setScope("us"));
    els.cycleSensorMode.addEventListener("click", cycleSensorMode);
    els.openSourcePanel.addEventListener("click", () => toggleSourceDrawer(true));
    els.closeSourcePanel.addEventListener("click", () => toggleSourceDrawer(false));
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
    els.loadMoreCameras.addEventListener("click", () => {
      state.catalogLimit += 120;
      renderCatalog();
    });
    els.toggleRadarOverlay.addEventListener("click", toggleRadarOverlay);

    document.body.addEventListener("click", (event) => {
      const nav = event.target.closest("[data-view-jump]");
      if (nav) {
        document.getElementById(nav.dataset.viewJump)?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (nav.classList.contains("nav-button")) {
          document.querySelectorAll(".nav-button").forEach((button) => button.classList.remove("active"));
          nav.classList.add("active");
        }
      }

      const action = event.target.closest("[data-select-type]");
      if (action) {
        const item = findItem(action.dataset.selectType, action.dataset.selectId);
        if (item) selectObject(action.dataset.selectType, item, { focus: action.dataset.focus === "true" });
      }

      const openUrl = event.target.closest("[data-open-url]");
      if (openUrl) {
        window.open(openUrl.dataset.openUrl, "_blank", "noopener,noreferrer");
      }

      if (event.target.closest("[data-close-modal]")) {
        toggleInsightModal("signal", false);
        toggleInsightModal("layer", false);
      }

      const searchTerm = event.target.closest("[data-search-term]");
      if (searchTerm) {
        applySearch(searchTerm.dataset.searchTerm || "");
      }
    });
  }

  function applySearch(term) {
    state.query = term.trim().toLowerCase();
    state.cameraFilter = "all";
    state.mapListMode = false;
    state.catalogLimit = 120;
    els.searchInput.value = term;
    renderCameraFilters();
    renderCatalog();
    renderAssets();
    renderCameraMap({ fit: true });
    renderGlobeLayers();
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

  function renderLayerControls() {
    els.layerControls.innerHTML = LAYERS.map((layer) => {
      const active = state.layers[layer.id] ? "active" : "";
      return `<button class="layer-button ${active}" style="color:${layer.color}" type="button" data-layer="${layer.id}">
        <span class="layer-dot"></span><span>${layer.label}</span>
      </button>`;
    }).join("");

    els.layerControls.onclick = (event) => {
      const button = event.target.closest("[data-layer]");
      if (!button) return;
      const layerId = button.dataset.layer;
      state.layers[layerId] = !state.layers[layerId];
      renderLayerControls();
      renderGlobeLayers();
      renderMetrics();
    };
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

  function initClock() {
    const now = new Date();
    els.clockUtc.textContent = `${now.toISOString().slice(11, 16)} UTC`;
    els.clockLocal.textContent = now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    updateSystemStatusAge();
  }

  function updateSystemStatusAge(options = {}) {
    if (!state.snapshot?.generatedAt || (!options.force && els.systemStatusLabel.textContent === "Syncing")) return;
    const sources = state.snapshot.sourceHealth || [];
    const responding = sources.filter((source) => source.ok).length;
    const total = sources.length || responding;
    els.systemStatusLabel.textContent = total && responding < total ? "Partial Data" : "Data Online";
    els.systemStatusSub.textContent = `${responding}/${total || 0} sources | updated ${formatTimeAgo(state.snapshot.generatedAt)}`;
  }

  async function refreshSnapshot(options = {}) {
    if (!options.quiet) {
      els.systemStatusLabel.textContent = "Syncing";
      els.systemStatusSub.textContent = "Refreshing public data";
    }

    try {
      const response = await fetch(`/api/intel-snapshot?scope=${encodeURIComponent(state.scope)}&ts=${Date.now()}`);
      if (!response.ok) throw new Error(`Snapshot failed with status ${response.status}`);
      state.snapshot = await response.json();
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
    renderCatalog();
    renderCameraMap();
    renderGlobeLayers();
    els.theaterSubtitle.textContent = subtitleForScope();
    if (globalThis.lucide) globalThis.lucide.createIcons();
  }

  function subtitleForScope() {
    const snapshot = state.snapshot;
    if (!snapshot) return "Free public intelligence layers fused into one global operating picture.";
    const sources = snapshot.sourceHealth.filter((source) => source.ok).length;
    const total = snapshot.sourceHealth.length;
    return `${labelForScope(state.scope)} scope | auto-refresh 60s | ${sources}/${total} public adapters responding | ${formatTimeAgo(snapshot.generatedAt)}`;
  }

  function renderMetrics() {
    const snapshot = state.snapshot || buildFallbackSnapshot();
    const activeLayers = LAYERS.filter((layer) => state.layers[layer.id]).length;
    const livePlayers = snapshot.cameras.filter((camera) => camera.capability === "player" || camera.capability === "stream").length;
    const values = [
      { label: "Public Signals", value: snapshot.metrics.eventsToday, delta: "+ live" },
      { label: "Active Alerts", value: snapshot.metrics.alerts, delta: `${snapshot.alerts.length} official` },
      { label: "Tracked Assets", value: snapshot.metrics.assets, delta: `${activeLayers} layers` },
      { label: "Camera Feeds", value: snapshot.metrics.cameraFeeds || snapshot.cameras.length, delta: `${livePlayers} playable video feeds` },
    ];

    els.metricStrip.innerHTML = values.map(
      (metric) => `<article class="metric-card"><span>${metric.label}</span><strong>${formatNumber(metric.value)}</strong><small>${metric.delta}</small></article>`
    ).join("");
  }

  function renderEvents() {
    const events = getFilteredEvents().slice(0, 5);
    if (!events.length) {
      els.eventList.innerHTML = `<div class="empty-state">No matching live events.</div>`;
      return;
    }

    els.eventList.innerHTML = events
      .map((event) => {
        const icon = iconForType(event.type);
        const color = colorForType(event.type);
        const subtitle = event.type === "alert"
          ? `${event.event || "Weather alert"} | ${event.areaSummary || event.region || "NWS"}`
          : event.region || event.location || event.source || "Public signal";
        return `<button class="event-card" type="button" data-select-type="${event.type}" data-select-id="${event.id}">
          <span class="event-icon" style="color:${color}"><i data-lucide="${icon}"></i></span>
          <span><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(subtitle)}</p></span>
          <span class="event-chip" style="color:${color}">${escapeHtml(event.severity || event.type)}</span>
        </button>`;
      })
      .join("");
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
    const values = [
      snapshot.cameras.length,
      snapshot.satellites.length,
      snapshot.flights.length,
      snapshot.quakes.length,
      snapshot.alerts.length,
    ];
    const total = values.reduce((sum, value) => sum + value, 0);
    els.signalTotal.textContent = formatNumber(total);
    els.layerTotal.textContent = formatNumber(total);
    els.alertTotal.textContent = formatNumber(snapshot.alerts.length);
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
    if (!assets.length) {
      els.assetList.innerHTML = `<div class="empty-state">No matching assets.</div>`;
      return;
    }

    els.assetList.innerHTML = assets
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
    document.querySelectorAll("[data-earth-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.earthView === viewId);
    });
    applyEarthView();
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

  function applyEarthView() {
    if (!globe.earth?.material || !globalThis.THREE) return;
    const material = globe.earth.material;
    const token = (globe.earthViewToken += 1);
    if (state.earthView === "ops") {
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
    const t = performance.now() / 1000;
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
    if (!globe.scene || !state.snapshot) return;
    globe.pickables = [];
    Object.values(globe.groups).forEach(clearGroup);

    const snapshot = state.snapshot;
    if (state.layers.cameras) addMarkers("cameras", getMapCameras(), "camera");
    if (state.layers.satellites) addMarkers("satellites", filterByQuery(snapshot.satellites), "satellite");
    if (state.layers.flights) addMarkers("flights", filterByQuery(snapshot.flights), "flight");
    if (state.layers.quakes) addMarkers("quakes", filterByQuery(snapshot.quakes), "quake");
    if (state.layers.alerts) addMarkers("alerts", filterByQuery(snapshot.alerts), "alert");
    renderSelectedGlobeFocus();
  }

  function addMarkers(layerId, items, type) {
    const group = globe.groups[layerId];
    const max = type === "satellite" ? 700 : type === "flight" ? 620 : type === "quake" ? 420 : 260;
    const visible = sampleItems(items, max);
    for (const item of visible) {
      const color = item.displayColor || COLORS[layerId] || colorForType(type);
      const lat = Number(item.lat);
      const lng = Number(item.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const altitude = type === "satellite" ? clamp((item.altitudeKm || 550) / 18000, 0.035, 0.62) : type === "flight" ? 0.045 : 0.018;
      const size = type === "quake" ? 0.028 + clamp((item.magnitude || 1) / 80, 0, 0.06) : type === "satellite" ? 0.038 : 0.052;
      const sprite = makeSprite(color, size);
      sprite.position.copy(latLngToVector3(lat, lng, 2.02 + altitude));
      sprite.userData = { type, item, baseScale: size, phase: Math.random() * Math.PI * 2 };
      group.add(sprite);
      globe.pickables.push(sprite);

      if (type === "satellite" && item.orbit && item.orbit.length && group.children.length < 240) {
        group.add(makePathLine(item.orbit.slice(0, 14), color, 2.18, 0.28));
      }
      if (type === "flight" && Number.isFinite(Number(item.heading)) && group.children.length < 520) {
        group.add(makeFlightTrail(item, color, 2.075));
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

  function renderSelectedGlobeFocus(type = state.selection?.type, item = state.selection?.item) {
    if (!globe.selectionGroup) return;
    clearGroup(globe.selectionGroup);
    if (!item) return;
    const lat = Number(item.lat);
    const lng = Number(item.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const color = type === "alert" ? COLORS.alerts : colorForType(type);
    if (type === "alert") {
      const rings = Array.isArray(item.geometryRings) ? item.geometryRings : [];
      if (rings.length) {
        for (const ring of rings) {
          globe.selectionGroup.add(makePathLine(ring, color, 2.075, 0.88));
          globe.selectionGroup.add(makePathLine(ring, "#ffffff", 2.081, 0.2));
        }
      } else {
        const radiusKm = clamp(Number(item.radiusKm || 220), 80, 900);
        globe.selectionGroup.add(makePathLine(makeGeoCircle(lat, lng, radiusKm), color, 2.075, 0.86));
        globe.selectionGroup.add(makePathLine(makeGeoCircle(lat, lng, radiusKm * 0.62), color, 2.082, 0.34));
      }
      globe.selectionGroup.add(makeSelectionBeam(lat, lng, color));
      const sprite = makeSprite(color, 0.16);
      sprite.position.copy(latLngToVector3(lat, lng, 2.2));
      globe.selectionGroup.add(sprite);
      return;
    }

    if (type === "flight" && Number.isFinite(Number(item.heading))) {
      const trail = makeFlightTrail(item, "#ffffff", 2.11, { minutes: 18, opacity: 0.72 });
      const glow = makeFlightTrail(item, COLORS.flights, 2.105, { minutes: 18, opacity: 0.92 });
      globe.selectionGroup.add(trail);
      globe.selectionGroup.add(glow);
      const origin = destinationPoint(lat, lng, Number(item.heading) + 180, clamp(Number(item.velocity || 180), 120, 280) * 60 * 18 / 1000);
      const originSprite = makeSprite("#ffffff", 0.08);
      originSprite.position.copy(latLngToVector3(origin.lat, origin.lng, 2.13));
      globe.selectionGroup.add(originSprite);
      globe.selectionGroup.add(makeSelectionBeam(lat, lng, COLORS.flights));
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
      selectObject(type, item, { focus: false });
    }
  }

  function createEarthTexture() {
    if (globalThis.THREE?.TextureLoader) {
      const texture = new THREE.TextureLoader().load("./assets/earth_atmos_2048.jpg", () => {
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
    if (!globe.camera || !globe.controls) return;
    const target = latLngToVector3(scope.center[0], scope.center[1], 5.2 - Math.min(scope.zoom, 6) * 0.16);
    globe.camera.position.lerp(target, 0.22);
    globe.controls.target.set(0, 0, 0);
  }

  function focusGlobeOnItem(item, options = {}) {
    const lat = Number(item?.lat);
    const lng = Number(item?.lng);
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
    globalThis.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(state.cameraMap);
    state.cameraLayer = globalThis.L.layerGroup().addTo(state.cameraMap);
    state.cameraMap.on("moveend zoomend", () => {
      if (state.suppressMapMove) return;
      state.mapListMode = true;
      state.catalogLimit = 120;
      renderCatalog();
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

  function renderCameraMap(options = {}) {
    if (!state.cameraMap || !state.cameraLayer) return;
    state.cameraLayer.clearLayers();
    const cameras = getMapCameras();
    const highlighted = new Set(getFilteredCameras().map((camera) => camera.id));
    const bounds = [];

    cameras.forEach((camera) => {
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
      bounds.push([camera.lat, camera.lng]);
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

  async function selectObject(type, item, options = {}) {
    state.selection = { type, id: item.id, item };
    renderSelectedGlobeFocus(type, item);
    if (!options.silent) focusGlobeOnItem(item, { pulse: type === "alert" });
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

    if (options.focus) {
      document.querySelector(".watch-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function renderSelectionCard(type, item) {
    const color = colorForType(type);
    els.selectionCard.innerHTML = `<h3>${escapeHtml(item.name || item.callsign || item.title || item.id)}</h3>
      <p>${escapeHtml(assetSubtitle(type, item))}</p>
      <button class="text-button" style="color:${color}" type="button" data-select-type="${type}" data-select-id="${item.id}" data-focus="true">${type === "alert" ? "Focus Alert" : "Open In Watch Pane"}</button>`;
    els.selectionCard.classList.add("visible");
  }

  function renderWatch(type, item, options = {}) {
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
    if (type === "camera") actions.push(`<button class="text-button" type="button" data-select-type="camera" data-select-id="${item.id}">Refresh</button>`);
    if (item.sourcePageUrl || item.sourceUrl || item.officialUrl || item.url) {
      actions.push(`<button class="text-button" type="button" data-open-url="${escapeHtml(item.sourcePageUrl || item.sourceUrl || item.officialUrl || item.url)}">Source</button>`);
    }
    return actions.join("");
  }

  function renderFeedView(view) {
    if (state.hls) {
      state.hls.destroy();
      state.hls = null;
    }
    if (state.stillRefreshTimer) {
      clearInterval(state.stillRefreshTimer);
      state.stillRefreshTimer = null;
    }

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
    els.watchView.innerHTML = `<div class="watch-placeholder" style="color:${color}">
      <i data-lucide="${iconForType(type)}"></i>
      <strong>${escapeHtml(item.name || item.callsign || item.title || item.id)}</strong>
      <span>${escapeHtml(infoSummary(type, item))}</span>
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
    if (state.layers.alerts) assets.push(...snapshot.alerts.map((item) => ({ type: "alert", item })));
    if (state.layers.cameras) assets.push(...getFilteredCameras().slice(0, 16).map((item) => ({ type: "camera", item })));
    return filterAssetsByQuery(assets);
  }

  function getSearchMatches() {
    const snapshot = state.snapshot || buildFallbackSnapshot();
    return filterAssetsByQuery([
      ...snapshot.cameras.map((item) => ({ type: "camera", item })),
      ...snapshot.satellites.map((item) => ({ type: "satellite", item })),
      ...snapshot.flights.map((item) => ({ type: "flight", item })),
      ...snapshot.quakes.map((item) => ({ type: "quake", item })),
      ...snapshot.alerts.map((item) => ({ type: "alert", item })),
    ]);
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
      metrics: { eventsToday: cameras.length, alerts: 0, assets: cameras.length, cameraFeeds: cameras.length, videoFeeds: cameras.filter((camera) => camera.capability === "player").length, streams: 1 },
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
        ["Source", "CelesTrak GP"],
      ];
    }
    if (type === "flight") {
      return [
        ["Callsign", item.callsign || "Unknown"],
        ["Altitude", item.altitudeMeters ? `${Math.round(item.altitudeMeters)} m` : "unknown"],
        ["Velocity", item.velocity ? `${Math.round(item.velocity)} m/s` : "unknown"],
        ["Heading", item.heading ? `${Math.round(item.heading)} deg` : "unknown"],
        ["Country", item.country || "unknown"],
        ["Source", "OpenSky"],
      ];
    }
    if (type === "quake") {
      return [
        ["Magnitude", item.magnitude ? item.magnitude.toFixed(1) : "unknown"],
        ["Depth", item.depthKm ? `${item.depthKm.toFixed(1)} km` : "unknown"],
        ["Place", item.location || "unknown"],
        ["Time", formatShortTime(item.time)],
        ["Severity", item.severity || "seismic"],
        ["Source", "USGS"],
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
        ["Source", "NWS"],
      ];
    }
    return [["Type", type], ["ID", item.id || "unknown"], ["Source", item.source || "public"]];
  }

  function assetSubtitle(type, item) {
    if (type === "camera") return `${item.area || "Unknown"} | ${item.region || item.country || "Global"} | ${item.capabilityLabel || item.media || "Camera"}`;
    if (type === "satellite") return `${item.objectType || "Satellite"} | ${item.altitudeKm ? `${Math.round(item.altitudeKm)} km` : "orbit"} | CelesTrak`;
    if (type === "flight") return `${item.country || "Unknown"} | ${item.altitudeMeters ? `${Math.round(item.altitudeMeters)} m` : "altitude unknown"} | OpenSky`;
    if (type === "quake") return `M${item.magnitude?.toFixed?.(1) || "?"} | ${item.location || "USGS event"}`;
    if (type === "alert") return `${item.event || "Alert"} | ${item.areaSummary || item.region || item.area || "NWS"}`;
    return item.source || "Public signal";
  }

  function infoSummary(type, item) {
    if (type === "satellite") return "Approximate live position from current public element data.";
    if (type === "flight") return "Public aircraft state from OpenSky when available.";
    if (type === "quake") return "USGS seismic event from the all-day GeoJSON feed.";
    if (type === "alert") return "Official public weather alert from the National Weather Service.";
    return assetSubtitle(type, item);
  }

  function iconForType(type) {
    return {
      camera: "cctv",
      satellite: "satellite",
      flight: "plane",
      quake: "activity",
      alert: "bell-ring",
      traffic: "route",
    }[type] || "circle";
  }

  function colorForType(type) {
    return {
      camera: COLORS.cameras,
      satellite: COLORS.satellites,
      flight: COLORS.flights,
      quake: COLORS.quakes,
      alert: COLORS.alerts,
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
