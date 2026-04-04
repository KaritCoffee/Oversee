(function () {
  const DEFAULT_STATE = { query: "", region: "All", category: "All", media: "All", cityOnly: false, sort: "priority" };
  const DEFAULT_OPS_LAYERS = { cameras: true, quakes: true, alerts: true, flights: true };
  const FEED_VIEW_CACHE_TTL_MS = 45 * 1000;
  const OPS_SCOPES = [
    { id: "oregon", label: "Oregon", center: [44.05, -120.55], zoom: 6.4, bounds: [[41.8, -124.9], [46.35, -116.3]] },
    { id: "west", label: "US West", center: [41.6, -119.7], zoom: 4.7, bounds: [[31.0, -125.6], [49.8, -102.0]] },
    { id: "world", label: "Global", center: [20, 0], zoom: 2.1, bounds: [[-55, -170], [75, 170]] },
  ];
  const OPS_LAYER_DEFS = [
    { id: "cameras", label: "Cameras" },
    { id: "quakes", label: "Earthquakes" },
    { id: "alerts", label: "Alerts" },
    { id: "flights", label: "Flights" },
  ];
  const OVERSEE_META = typeof OVERSEE_FEED_META !== "undefined" ? OVERSEE_FEED_META : window.OVERSEE_FEED_META || {};
  const feedsById = new Map(OVERSEE_DATA.feeds.map((feed) => [feed.id, feed]));
  const sourcesById = new Map(OVERSEE_DATA.sources.map((source) => [source.id, source]));
  const feedViewCache = new Map();
  const state = {
    ...DEFAULT_STATE,
    visibleFeeds: [],
    live: { status: "loading", data: null, error: null },
    liveBoard: { status: "loading", data: null, error: null },
    selectedFeedId: "",
    feedView: { status: "idle", feedId: "", data: null, error: null },
    map: { mode: "leaflet", instance: null, markersLayer: null, markerIndex: new Map(), lastFilterKey: "" },
    ops: {
      scope: "west",
      layers: { ...DEFAULT_OPS_LAYERS },
      snapshot: { status: "loading", data: null, error: null },
      map: {
        mode: "leaflet",
        instance: null,
        camerasLayer: null,
        quakesLayer: null,
        alertsLayer: null,
        flightsLayer: null,
        cameraMarkerIndex: new Map(),
        lastScope: "",
      },
    },
  };
  let viewerPulseTimer = 0;

  const els = {
    regionFilters: document.getElementById("regionFilters"),
    categoryFilters: document.getElementById("categoryFilters"),
    mediaFilters: document.getElementById("mediaFilters"),
    searchInput: document.getElementById("searchInput"),
    cityOnlyToggle: document.getElementById("cityOnlyToggle"),
    sortSelect: document.getElementById("sortSelect"),
    resetFilters: document.getElementById("resetFilters"),
    filterStateLabel: document.getElementById("filterStateLabel"),
    metricGrid: document.getElementById("metricGrid"),
    coverageGrid: document.getElementById("coverageGrid"),
    notesList: document.getElementById("notesList"),
    liveGrid: document.getElementById("liveGrid"),
    liveMeta: document.getElementById("liveMeta"),
    liveBoardGrid: document.getElementById("liveBoardGrid"),
    liveBoardMeta: document.getElementById("liveBoardMeta"),
    mapMeta: document.getElementById("mapMeta"),
    cameraMap: document.getElementById("cameraMap"),
    selectedFeedTitle: document.getElementById("selectedFeedTitle"),
    selectedFeedMetaLine: document.getElementById("selectedFeedMetaLine"),
    selectedFeedTags: document.getElementById("selectedFeedTags"),
    selectedFeedViewer: document.getElementById("selectedFeedViewer"),
    selectedFeedSummary: document.getElementById("selectedFeedSummary"),
    selectedFeedActions: document.getElementById("selectedFeedActions"),
    viewerPanel: document.querySelector(".viewer-panel"),
    watchboard: document.getElementById("watchboard"),
    feedGrid: document.getElementById("feedGrid"),
    feedCountLabel: document.getElementById("feedCountLabel"),
    sourceGrid: document.getElementById("sourceGrid"),
    layerGrid: document.getElementById("layerGrid"),
    opsScopeChips: document.getElementById("opsScopeChips"),
    opsLayerChips: document.getElementById("opsLayerChips"),
    opsMeta: document.getElementById("opsMeta"),
    opsStatus: document.getElementById("opsStatus"),
    opsMetricGrid: document.getElementById("opsMetricGrid"),
    opsTimeline: document.getElementById("opsTimeline"),
    opsLegend: document.getElementById("opsLegend"),
    opsMap: document.getElementById("opsMap"),
  };

  const regions = uniqueValues(OVERSEE_DATA.feeds.map((feed) => feed.region));
  const categories = uniqueValues(OVERSEE_DATA.feeds.map((feed) => feed.category));
  const mediaTypes = uniqueValues(OVERSEE_DATA.feeds.map((feed) => feed.media));

  bindEvents();
  renderStaticSections();
  initMap();
  initOpsMap();
  renderOpsControls();
  render();
  renderOpsPanel();
  loadLiveSnapshot();
  loadLiveBoard();
  loadOpsSnapshot();

  window.setInterval(loadLiveSnapshot, 60 * 1000);
  window.setInterval(loadLiveBoard, 60 * 1000);
  window.setInterval(loadOpsSnapshot, 90 * 1000);
  window.setInterval(() => {
    if (state.selectedFeedId && state.feedView.data && state.feedView.data.type === "image") {
      loadSelectedFeedView(state.selectedFeedId, { force: true, quiet: true });
    }
  }, 20 * 1000);
  window.setInterval(() => {
    if (state.selectedFeedId && (!state.feedView.data || state.feedView.data.type !== "image")) {
      loadSelectedFeedView(state.selectedFeedId, { force: true, quiet: true });
    }
  }, 90 * 1000);

  function bindEvents() {
    els.searchInput.addEventListener("input", (event) => {
      state.query = event.target.value.trim().toLowerCase();
      render();
    });
    els.cityOnlyToggle.addEventListener("change", (event) => {
      state.cityOnly = event.target.checked;
      render();
    });
    els.sortSelect.addEventListener("change", (event) => {
      state.sort = event.target.value;
      render();
    });
    els.resetFilters.addEventListener("click", () => {
      Object.assign(state, DEFAULT_STATE);
      els.searchInput.value = "";
      els.cityOnlyToggle.checked = false;
      els.sortSelect.value = DEFAULT_STATE.sort;
      render();
    });
    document.body.addEventListener("click", (event) => {
      const watchTrigger = event.target.closest("[data-feed-watch]");
      if (watchTrigger) {
        selectFeed(watchTrigger.dataset.feedWatch, { reveal: true });
        return;
      }

      const feedTrigger = event.target.closest("[data-feed-select]");
      if (feedTrigger) {
        selectFeed(feedTrigger.dataset.feedSelect);
        return;
      }

      const refreshTrigger = event.target.closest("[data-feed-refresh]");
      if (refreshTrigger) {
        loadSelectedFeedView(refreshTrigger.dataset.feedRefresh, { force: true });
        flashViewerPanel();
        return;
      }

      const scopeTrigger = event.target.closest("[data-ops-scope]");
      if (scopeTrigger && scopeTrigger.dataset.opsScope !== state.ops.scope) {
        state.ops.scope = scopeTrigger.dataset.opsScope;
        renderOpsControls();
        loadOpsSnapshot();
        return;
      }

      const layerTrigger = event.target.closest("[data-ops-layer]");
      if (layerTrigger) {
        const layerId = layerTrigger.dataset.opsLayer;
        state.ops.layers[layerId] = !state.ops.layers[layerId];
        renderOpsControls();
        renderOpsPanel();
      }
    });
    document.body.addEventListener(
      "error",
      (event) => {
        const target = event.target;
        if (!target || !target.dataset || !target.dataset.directSrc || target.dataset.fallbackApplied) return;
        target.dataset.fallbackApplied = "1";
        target.src = target.dataset.directSrc;
      },
      true
    );

    buildChipSet(els.regionFilters, ["All"].concat(regions), "region");
    buildChipSet(els.categoryFilters, ["All"].concat(categories), "category");
    buildChipSet(els.mediaFilters, ["All"].concat(mediaTypes), "media");
  }

  function renderStaticSections() {
    els.notesList.innerHTML = OVERSEE_DATA.notes.map((note) => `<li>${note}</li>`).join("");
    els.coverageGrid.innerHTML = OVERSEE_DATA.coverageHighlights
      .map(
        (spot) =>
          `<article class="coverage-card"><div class="coverage-head"><h3>${spot.name}</h3><span class="badge badge-neutral">${spot.status}</span></div><p>${spot.detail}</p><div class="coverage-links">${spot.links
            .map((link) => `<a class="text-link" href="${link.url}" target="_blank" rel="noreferrer">${link.label}</a>`)
            .join("")}</div></article>`
      )
      .join("");
    els.sourceGrid.innerHTML = OVERSEE_DATA.sources
      .map(
        (source) =>
          `<article class="source-card"><div class="source-head"><span class="badge badge-${source.verification}">${labelize(source.verification)}</span><span class="source-category">${source.category}</span></div><h3>${source.name}</h3><p>${source.coverage}</p><dl class="meta-list"><div><dt>Owner</dt><dd>${source.owner}</dd></div><div><dt>Media</dt><dd>${source.media}</dd></div><div><dt>City/town coverage</dt><dd>${source.cityTownCoverage}</dd></div><div><dt>Adapter</dt><dd>${source.adapter}</dd></div></dl><a class="text-link" href="${source.url}" target="_blank" rel="noreferrer">Open source</a></article>`
      )
      .join("");
    els.layerGrid.innerHTML = OVERSEE_DATA.layers
      .map(
        (layer) =>
          `<article class="layer-card"><span class="layer-type">${layer.type}</span><h3>${layer.name}</h3><p>${layer.why}</p><div class="layer-footer"><span>${layer.cadence}</span><a class="text-link" href="${layer.url}" target="_blank" rel="noreferrer">Reference</a></div></article>`
      )
      .join("");
  }

  function initMap() {
    if (!els.cameraMap) return;
    if (!window.L) {
      state.map.mode = "fallback";
      return;
    }

    const map = window.L.map(els.cameraMap, { zoomControl: true, minZoom: 5 });
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    }).addTo(map);
    state.map.instance = map;
    state.map.markersLayer = window.L.layerGroup().addTo(map);
    map.setView([44.05, -120.55], 6.4);
    window.setTimeout(() => map.invalidateSize(), 0);
  }

  function initOpsMap() {
    if (!els.opsMap) return;
    if (!window.L) {
      state.ops.map.mode = "fallback";
      return;
    }

    const map = window.L.map(els.opsMap, { zoomControl: true, minZoom: 2, worldCopyJump: true });
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    }).addTo(map);

    state.ops.map.instance = map;
    state.ops.map.camerasLayer = window.L.layerGroup().addTo(map);
    state.ops.map.quakesLayer = window.L.layerGroup().addTo(map);
    state.ops.map.alertsLayer = window.L.layerGroup().addTo(map);
    state.ops.map.flightsLayer = window.L.layerGroup().addTo(map);

    const scope = getOpsScopeConfig(state.ops.scope);
    map.setView(scope.center, scope.zoom);
    window.setTimeout(() => map.invalidateSize(), 0);
  }

  function render() {
    updateChipStates();
    const filtered = getFilteredFeeds();
    const sorted = sortFeeds(filtered);
    state.visibleFeeds = sorted;

    const nextSelectedId = getPreferredSelectedFeedId(sorted);
    if (nextSelectedId !== state.selectedFeedId) {
      state.selectedFeedId = nextSelectedId;
      state.feedView = nextSelectedId
        ? { status: "loading", feedId: nextSelectedId, data: null, error: null }
        : { status: "idle", feedId: "", data: null, error: null };
    }

    renderFilterState(filtered);
    renderMetrics(filtered);
    renderLiveSources();
    renderLiveBoard();
    renderMap(sorted);
    renderSelectedFeed();
    renderWatchboard(sorted);
    renderFeeds(sorted);
    syncSelectedFeedVisuals();

    if (nextSelectedId && state.feedView.status === "loading") {
      loadSelectedFeedView(nextSelectedId);
    }
  }

  async function loadLiveSnapshot() {
    try {
      const response = await fetch("/api/dashboard-live");
      if (!response.ok) throw new Error(`Live adapter request failed with status ${response.status}`);
      state.live = { status: "ready", data: await response.json(), error: null };
    } catch (error) {
      state.live = { status: "error", data: null, error };
    }
    renderLiveSources();
  }

  async function loadLiveBoard() {
    try {
      const response = await fetch("/api/live-board");
      if (!response.ok) throw new Error(`Live board request failed with status ${response.status}`);
      state.liveBoard = { status: "ready", data: await response.json(), error: null };
    } catch (error) {
      state.liveBoard = { status: "ready", data: buildLocalLiveBoardData(), error };
    }
    renderLiveBoard();
    syncSelectedFeedVisuals();
  }

  async function loadOpsSnapshot() {
    const existingData = state.ops.snapshot.data;
    state.ops.snapshot = { status: existingData ? "refreshing" : "loading", data: existingData, error: null };
    renderOpsPanel();

    try {
      const response = await fetch(`/api/ops-snapshot?scope=${encodeURIComponent(state.ops.scope)}`);
      if (!response.ok) throw new Error(`Operations snapshot failed with status ${response.status}`);
      state.ops.snapshot = { status: "ready", data: await response.json(), error: null };
    } catch (error) {
      state.ops.snapshot = existingData
        ? { status: "ready", data: existingData, error }
        : { status: "error", data: null, error };
    }

    renderOpsPanel();
  }

  async function loadSelectedFeedView(feedId, options = {}) {
    const feed = feedsById.get(feedId);
    if (!feed) return;

    if (!options.force) {
      const cached = feedViewCache.get(feedId);
      if (cached && cached.expiresAt > Date.now()) {
        if (state.selectedFeedId === feedId) {
          state.feedView = { status: "ready", feedId, data: cached.data, error: null };
          renderSelectedFeed();
        }
        return;
      }
    }

    const metaViewer = OVERSEE_META[feedId] && OVERSEE_META[feedId].viewer;
    if (shouldUseClientDirectView(feed, metaViewer)) {
      const payload = buildClientViewPayload(
        feed,
        metaViewer,
        "Configured public dashboard view",
        "This feed is using a direct public view that the dashboard can render locally."
      );
      feedViewCache.set(feedId, { data: payload, expiresAt: Date.now() + FEED_VIEW_CACHE_TTL_MS });
      if (state.selectedFeedId === feedId) {
        state.feedView = { status: "ready", feedId, data: payload, error: null };
        renderSelectedFeed();
      }
      return;
    }

    if (state.selectedFeedId === feedId && !options.quiet) {
      state.feedView = { status: "loading", feedId, data: null, error: null };
      renderSelectedFeed();
    }

    try {
      const response = await fetch(`/api/feed-view?id=${encodeURIComponent(feedId)}`);
      if (!response.ok) throw new Error(`Feed viewer request failed with status ${response.status}`);
      const payload = await response.json();
      feedViewCache.set(feedId, { data: payload, expiresAt: Date.now() + FEED_VIEW_CACHE_TTL_MS });
      if (state.selectedFeedId === feedId) {
        state.feedView = { status: "ready", feedId, data: payload, error: null };
      }
    } catch (error) {
      const fallbackPayload = buildFallbackViewPayload(feed, error);
      feedViewCache.set(feedId, { data: fallbackPayload, expiresAt: Date.now() + FEED_VIEW_CACHE_TTL_MS });
      if (state.selectedFeedId === feedId) {
        state.feedView = { status: "ready", feedId, data: fallbackPayload, error: null };
      }
    }

    renderSelectedFeed();
  }

  function buildClientViewPayload(feed, viewer, sourceLabel, note) {
    return {
      feedId: feed.id,
      generatedAt: new Date().toISOString(),
      officialUrl: feed.url,
      meta: OVERSEE_META[feed.id] || null,
      type: viewer.type,
      url: viewer.url,
      capability: inferViewerCapability(viewer, feed),
      sourceLabel,
      note,
      sourcePageUrl: feed.url,
    };
  }

  function buildFallbackViewPayload(feed, error) {
    const metaViewer = OVERSEE_META[feed.id] && OVERSEE_META[feed.id].viewer;

    if (metaViewer && metaViewer.type && metaViewer.type !== "api") {
      return buildClientViewPayload(
        feed,
        metaViewer,
        "Configured public dashboard view",
        `The direct resolver was unavailable here, so the dashboard fell back to its built-in public ${metaViewer.type} view.`
      );
    }

    return {
      feedId: feed.id,
      generatedAt: new Date().toISOString(),
      officialUrl: feed.url,
      meta: OVERSEE_META[feed.id] || null,
      type: "iframe",
      url: feed.url,
      capability: "page",
      sourceLabel: "Official public source page",
      note: `The direct resolver was unavailable here, so the dashboard fell back to the official public page. ${error.message}`,
      sourcePageUrl: feed.url,
    };
  }

  function buildLocalLiveBoardData() {
    const items = OVERSEE_DATA.feeds
      .filter((feed) => getFeedViewRank(feed) >= 3)
      .sort((left, right) => getFeedViewRank(right) - getFeedViewRank(left) || right.priority - left.priority)
      .slice(0, 8)
      .map((feed) => ({
        id: feed.id,
        name: feed.name,
        area: feed.area,
        region: feed.region,
        sourceId: feed.sourceId,
        media: feed.media,
        category: feed.category,
        view: buildFallbackViewPayload(feed, new Error("Live board route unavailable")),
      }));

    return {
      generatedAt: new Date().toISOString(),
      items,
    };
  }

  function selectFeed(feedId, options = {}) {
    if (!feedsById.has(feedId)) return;

    const sameFeed = state.selectedFeedId === feedId;
    state.selectedFeedId = feedId;

    if (!sameFeed || options.forceViewer || !state.feedView.data || state.feedView.feedId !== feedId) {
      state.feedView = { status: "loading", feedId, data: null, error: null };
    }

    syncSelectedFeedVisuals();
    renderSelectedFeed();
    focusFeedOnMap(feedId);
    focusFeedOnOpsMap(feedId);

    if (options.reveal) {
      flashViewerPanel();
      maybeRevealViewerPanel();
    }

    if (!sameFeed || options.forceViewer || !state.feedView.data || state.feedView.feedId !== feedId) {
      loadSelectedFeedView(feedId, { force: Boolean(options.forceViewer) });
    }
  }

  function renderOpsControls() {
    if (els.opsScopeChips) {
      els.opsScopeChips.innerHTML = OPS_SCOPES.map(
        (scope) =>
          `<button class="chip ${scope.id === state.ops.scope ? "chip-active" : ""}" type="button" data-ops-scope="${scope.id}">${scope.label}</button>`
      ).join("");
    }

    if (els.opsLayerChips) {
      els.opsLayerChips.innerHTML = OPS_LAYER_DEFS.map(
        (layer) =>
          `<button class="chip ${state.ops.layers[layer.id] ? "chip-active" : ""}" type="button" data-ops-layer="${layer.id}">${layer.label}</button>`
      ).join("");
    }
  }

  function renderOpsPanel() {
    renderOpsMetrics();
    renderOpsTimeline();
    renderOpsLegend();
    renderOpsMap();
  }

  function renderOpsMetrics() {
    if (!els.opsMetricGrid || !els.opsMeta || !els.opsStatus) return;

    const snapshot = state.ops.snapshot.data;
    if (!snapshot) {
      els.opsMeta.textContent =
        state.ops.snapshot.status === "error" ? "Operations layers unavailable" : "Loading official situational layers...";
      els.opsStatus.textContent =
        state.ops.snapshot.status === "error" ? escapeHtml(state.ops.snapshot.error.message) : "Fetching public feeds...";
      els.opsMetricGrid.innerHTML =
        '<article class="ops-metric-card"><span>Layers</span><strong>...</strong></article><article class="ops-metric-card"><span>Signals</span><strong>...</strong></article>';
      return;
    }

    const scopedQuakes = getScopedQuakes(snapshot.quakes.items || []);
    const cameras = snapshot.cameras || [];
    const alerts = snapshot.alerts.items || [];
    const flights = snapshot.flights.items || [];
    const loadingLabel = state.ops.snapshot.status === "refreshing" ? "Refreshing..." : `Updated ${new Date(snapshot.generatedAt).toLocaleString()}`;
    els.opsMeta.textContent = `${labelize(state.ops.scope)} scope | ${loadingLabel}`;

    const healthBits = [`Quakes ${snapshot.quakes.status}`, `Alerts ${snapshot.alerts.status}`, `Flights ${snapshot.flights.status}`];
    if (state.ops.snapshot.error) {
      healthBits.push(`Using cached data: ${state.ops.snapshot.error.message}`);
    }
    els.opsStatus.textContent = healthBits.join(" | ");

    const metrics = [
      { label: "Camera nodes", value: cameras.length },
      { label: "Earthquakes", value: scopedQuakes.length },
      { label: "Oregon alerts", value: alerts.length },
      { label: "Flights", value: flights.length },
    ];

    els.opsMetricGrid.innerHTML = metrics
      .map((metric) => `<article class="ops-metric-card"><span>${metric.label}</span><strong>${metric.value}</strong></article>`)
      .join("");
  }

  function renderOpsTimeline() {
    if (!els.opsTimeline) return;

    const snapshot = state.ops.snapshot.data;
    if (!snapshot) {
      els.opsTimeline.innerHTML =
        '<article class="ops-event"><div class="ops-event-top"><h4>Building the briefing</h4><span class="badge badge-neutral">Pending</span></div><p>Recent earthquakes, Oregon alerts, and any available flight states will land here.</p></article>';
      return;
    }

    const items = snapshot.timeline || [];
    if (!items.length) {
      els.opsTimeline.innerHTML =
        '<article class="ops-event"><div class="ops-event-top"><h4>No live items yet</h4><span class="badge badge-neutral">Quiet</span></div><p>The public layers are online, but no recent alerts or quake events are in the current merged briefing.</p></article>';
      return;
    }

    els.opsTimeline.innerHTML = items
      .map((item) => {
        const tone =
          item.type === "alert"
            ? "live"
            : item.type === "quake"
              ? "still"
              : item.type === "flight"
                ? "pseudolive"
                : "neutral";

        return `<article class="ops-event"><div class="ops-event-top"><h4>${escapeHtml(item.title)}</h4><span class="badge badge-${tone}">${labelize(item.type)}</span></div><p>${escapeHtml(item.detail)}</p><div class="ops-event-meta"><span>${formatTimestamp(item.time)}</span><span>${escapeHtml(item.meta || "")}</span></div>${item.url ? `<a class="text-link" href="${item.url}" target="_blank" rel="noreferrer">Open source</a>` : ""}</article>`;
      })
      .join("");
  }

  function renderOpsLegend() {
    if (!els.opsLegend) return;

    const snapshot = state.ops.snapshot.data;
    const flightText =
      snapshot && snapshot.flights.status === "ready"
        ? "Best-effort OpenSky state vectors for the current scope."
        : "Flight layer is best effort and may be rate-limited without OpenSky credentials.";

    els.opsLegend.innerHTML = [
      {
        color: "#6fa8dc",
        title: "Camera nodes",
        detail: "Verified Oregon public camera locations. Clicking a camera marker opens that feed in the watch pane.",
      },
      {
        color: "#f2c14e",
        title: "Earthquakes",
        detail: "Recent USGS quake events, sized by magnitude and filtered by your current scope.",
      },
      {
        color: "#e16a3d",
        title: "Oregon alerts",
        detail: "Active National Weather Service alerts for Oregon, drawn as polygons when geometry is available.",
      },
      {
        color: "#7bd88f",
        title: "Flights",
        detail: flightText,
      },
    ]
      .map(
        (item) =>
          `<div class="ops-legend-item"><span class="ops-legend-swatch" style="background:${item.color}"></span><div class="ops-legend-copy"><strong>${item.title}</strong><p>${item.detail}</p></div></div>`
      )
      .join("");
  }

  function renderLiveSources() {
    if (state.live.status === "loading") {
      els.liveMeta.textContent = "Loading live source snapshot...";
      els.liveGrid.innerHTML =
        '<article class="live-card live-card-loading"><h3>Connecting to Oregon sources</h3><p>Pulling the latest public source metadata for TripCheck, OHAZ, Salem, and Newport.</p></article>';
      return;
    }

    if (state.live.status === "error") {
      els.liveMeta.textContent = "Live adapters unavailable";
      els.liveGrid.innerHTML = `<article class="live-card live-card-error"><h3>Live adapters could not load</h3><p>${escapeHtml(
        state.live.error.message
      )}</p><p>The dashboard catalog still works, but the live source summary section is unavailable.</p></article>`;
      return;
    }

    const snapshot = state.live.data;
    const { tripcheck, salem, newport, ohaz } = snapshot.sources;
    els.liveMeta.textContent = `Updated ${new Date(snapshot.generatedAt).toLocaleString()}`;
    els.liveGrid.innerHTML = `
      <article class="live-card live-card-wide">
        <div class="live-card-head"><div><p class="eyebrow">TripCheck</p><h3>${tripcheck.title}</h3></div><span class="status-pill">${tripcheck.statusLabel}</span></div>
        <p>${tripcheck.summary}</p>
        <div class="live-pill-row">${(tripcheck.stats || []).map((stat) => `<span>${escapeHtml(stat.label)}: ${escapeHtml(String(stat.value))}</span>`).join("")}</div>
        ${tripcheck.featuredLinks && tripcheck.featuredLinks.length ? `<div class="live-link-list">${tripcheck.featuredLinks
          .map((link) => `<a class="text-link" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`)
          .join("")}</div>` : ""}
        <div class="live-card-footer"><a class="text-link" href="${tripcheck.reportUrl}" target="_blank" rel="noreferrer">Open official report</a></div>
      </article>
      <article class="live-card">
        <div class="live-card-head"><div><p class="eyebrow">Newport</p><h3>${newport.title}</h3></div><span class="status-pill">${newport.statusLabel}</span></div>
        ${newport.imageUrl ? `<img class="live-image" src="${toAssetUrl(newport.imageUrl)}" data-direct-src="${newport.imageUrl}" alt="Newport webcam preview" loading="lazy" />` : '<div class="live-placeholder">No image preview available</div>'}
        <p>${newport.summary}</p>
        <div class="live-card-footer"><a class="text-link" href="${newport.pageUrl}" target="_blank" rel="noreferrer">Open webcam page</a><a class="text-link" href="${newport.weatherUrl}" target="_blank" rel="noreferrer">Weather</a></div>
      </article>
      <article class="live-card">
        <div class="live-card-head"><div><p class="eyebrow">Salem</p><h3>${salem.title}</h3></div><span class="status-pill">${salem.statusLabel}</span></div>
        <div class="live-placeholder live-placeholder-map">ArcGIS Viewer</div>
        <p>${salem.summary}</p>
        <div class="live-card-footer"><a class="text-link" href="${salem.viewerUrl}" target="_blank" rel="noreferrer">Open traffic viewer</a><a class="text-link" href="${salem.pageUrl}" target="_blank" rel="noreferrer">Source page</a></div>
      </article>
      <article class="live-card live-card-wide">
        <div class="live-card-head"><div><p class="eyebrow">OHAZ / ALERTWest</p><h3>${ohaz.title}</h3></div><span class="status-pill">${ohaz.statusLabel}</span></div>
        <p>${ohaz.summary}</p>
        <div class="live-thumb-grid">${(ohaz.cameras || [])
          .map(
            (camera) =>
              `<article class="thumb-card"><img src="${toAssetUrl(camera.imageUrl)}" data-direct-src="${camera.imageUrl}" alt="${escapeHtml(camera.label)}" loading="lazy" /><div><strong>${escapeHtml(camera.label)}</strong><p>${escapeHtml(camera.area)}</p></div></article>`
          )
          .join("")}</div>
        <div class="live-card-footer"><a class="text-link" href="${ohaz.pageUrl}" target="_blank" rel="noreferrer">Open OHAZ source</a><a class="text-link" href="${ohaz.platformUrl}" target="_blank" rel="noreferrer">Open ALERTWest</a></div>
      </article>`;
  }

  function renderLiveBoard() {
    if (!els.liveBoardGrid) return;

    if (state.liveBoard.status === "loading") {
      els.liveBoardMeta.textContent = "Loading direct camera views...";
      els.liveBoardGrid.innerHTML =
        '<article class="live-board-tile live-board-empty"><h3>Building the overnight camera board</h3><p>Resolving the strongest direct public camera views for Oregon.</p></article>';
      return;
    }

    if (state.liveBoard.status === "error") {
      els.liveBoardMeta.textContent = "Live camera board unavailable";
      els.liveBoardGrid.innerHTML = `<article class="live-board-tile live-board-empty"><h3>Camera board could not load</h3><p>${escapeHtml(
        state.liveBoard.error.message
      )}</p></article>`;
      return;
    }

    const items = state.liveBoard.data?.items || [];
    els.liveBoardMeta.textContent = state.liveBoard.data?.generatedAt
      ? `Updated ${new Date(state.liveBoard.data.generatedAt).toLocaleString()}`
      : `${items.length} camera views ready`;

    if (!items.length) {
      els.liveBoardGrid.innerHTML =
        '<article class="live-board-tile live-board-empty"><h3>No direct camera views available</h3><p>The source adapters are up, but no embeddable camera views were resolved for the board.</p></article>';
      return;
    }

    els.liveBoardGrid.innerHTML = items
      .map(
        (item) => {
          const mode = getViewerModeInfo(feedsById.get(item.id), item.view);
          return `<article class="live-board-tile ${item.id === state.selectedFeedId ? "is-selected" : ""}" data-feed-card="${item.id}"><div class="live-board-head"><div><h3>${item.name}</h3><p>${item.area} | ${item.region}</p></div><span class="badge badge-${mode.tone}">${mode.label}</span></div><button class="live-board-media" type="button" data-feed-select="${item.id}">${renderLiveBoardMedia(item)}</button><div class="live-board-footer"><span>${labelize(item.category)}</span><button class="viewer-button viewer-button-compact" type="button" data-feed-watch="${item.id}">Open In Watch Pane</button></div></article>`;
        }
      )
      .join("");
  }

  function renderLiveBoardMedia(item) {
    if (item.view.type === "image") {
      return `<img src="${toAssetUrl(item.view.url)}" data-direct-src="${item.view.url}" alt="${escapeHtml(item.name)}" loading="lazy" />`;
    }

    if (item.view.type === "video") {
      return `<video muted playsinline preload="metadata" src="${item.view.url}"></video>`;
    }

    if (item.view.type === "hls") {
      return `<div class="live-board-placeholder">Live video ready</div>`;
    }

    return `<div class="live-board-placeholder">${escapeHtml(item.view.sourceLabel || "Public camera view")}</div>`;
  }

  function renderMap(feeds) {
    if (els.mapMeta) {
      els.mapMeta.textContent = feeds.length ? `${feeds.length} cameras on map | click any marker to watch in-pane` : "No cameras match the current filters";
    }

    const filterKey = feeds.map((feed) => feed.id).join("|");

    if (state.map.mode === "fallback") {
      if (filterKey !== state.map.lastFilterKey) {
        renderFallbackMap(feeds);
        state.map.lastFilterKey = filterKey;
      } else {
        updatePrimaryMapSelection();
      }
      return;
    }

    if (!state.map.instance || !state.map.markersLayer) return;

    if (filterKey !== state.map.lastFilterKey) {
      rebuildPrimaryMapMarkers(feeds);
      state.map.lastFilterKey = filterKey;
    } else {
      updatePrimaryMapSelection();
    }
  }

  function rebuildPrimaryMapMarkers(feeds) {
    state.map.markersLayer.clearLayers();
    state.map.markerIndex.clear();

    const bounds = [];
    feeds.forEach((feed) => {
      const meta = OVERSEE_META[feed.id];
      if (!meta || typeof meta.lat !== "number" || typeof meta.lng !== "number") return;

      const marker = window.L.circleMarker([meta.lat, meta.lng], getMarkerStyle(feed, feed.id === state.selectedFeedId));
      marker.bindTooltip(feed.name, { direction: "top" });
      marker.on("click", () => selectFeed(feed.id, { reveal: true }));
      marker.addTo(state.map.markersLayer);
      state.map.markerIndex.set(feed.id, marker);
      bounds.push([meta.lat, meta.lng]);
    });

    if (bounds.length) {
      state.map.instance.fitBounds(bounds, { padding: [28, 28], maxZoom: 10 });
    }

    updatePrimaryMapSelection();
  }

  function renderFallbackMap(feeds) {
    const bounds = { minLat: 41.9, maxLat: 46.35, minLng: -124.8, maxLng: -116.5 };
    els.cameraMap.innerHTML = `<div class="fallback-map-shell"><div class="fallback-map-surface"><div class="fallback-map-label fallback-map-label-portland">Portland</div><div class="fallback-map-label fallback-map-label-eugene">Eugene</div><div class="fallback-map-label fallback-map-label-bend">Bend</div><div class="fallback-map-label fallback-map-label-medford">Medford</div>${feeds
      .map((feed) => {
        const meta = OVERSEE_META[feed.id];
        if (!meta || typeof meta.lat !== "number" || typeof meta.lng !== "number") return "";
        const x = ((meta.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
        const y = (1 - (meta.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100;
        return `<button class="fallback-map-marker ${feed.id === state.selectedFeedId ? "is-selected" : ""}" style="left:${x}%;top:${y}%;" type="button" data-feed-select="${feed.id}" data-map-feed-id="${feed.id}" title="${escapeHtml(feed.name)}"></button>`;
      })
      .join("")}</div></div>`;
  }

  function renderSelectedFeed() {
    const feed = feedsById.get(state.selectedFeedId);
    if (!feed) {
      els.selectedFeedTitle.textContent = "Select a camera";
      els.selectedFeedMetaLine.textContent = "Choose any camera from the map or feed list.";
      els.selectedFeedTags.innerHTML = "";
      els.selectedFeedSummary.textContent = "The watch pane will load the best embeddable public view the dashboard can resolve.";
      els.selectedFeedActions.innerHTML = "";
      els.selectedFeedViewer.innerHTML = '<div class="viewer-placeholder">No camera selected.</div>';
      return;
    }

    const source = getSource(feed.sourceId);
    const viewerMode = getViewerModeInfo(feed, state.feedView.data);
    els.selectedFeedTitle.textContent = feed.name;
    els.selectedFeedMetaLine.textContent = `${feed.area} | ${feed.county} | ${source.name}`;
    const tagParts = [
      `<span class="badge badge-${viewerMode.tone}">${viewerMode.label}</span>`,
      `<span class="badge badge-neutral">${labelize(feed.category)}</span>`,
      labelize(feed.locality) !== labelize(feed.category) ? `<span class="badge badge-neutral">${labelize(feed.locality)}</span>` : "",
      `<span class="badge badge-neutral">${feed.region}</span>`,
    ].filter(Boolean);
    els.selectedFeedTags.innerHTML = tagParts.join("");

    if (state.feedView.status === "loading" || state.feedView.feedId !== feed.id) {
      els.selectedFeedActions.innerHTML = `<button class="viewer-button" type="button" data-feed-refresh="${feed.id}">Refresh View</button><a class="viewer-link" href="${feed.url}" target="_blank" rel="noreferrer">Official source</a>`;
      els.selectedFeedSummary.textContent = `${feed.integration} Loading the best public embeddable view for this feed.`;
      els.selectedFeedViewer.innerHTML = '<div class="viewer-placeholder">Loading camera view...</div>';
      return;
    }

    if (state.feedView.status === "error") {
      els.selectedFeedActions.innerHTML = `<button class="viewer-button" type="button" data-feed-refresh="${feed.id}">Retry</button><a class="viewer-link" href="${feed.url}" target="_blank" rel="noreferrer">Official source</a>`;
      els.selectedFeedSummary.textContent = `${feed.integration} The dashboard could not resolve a direct view right now.`;
      els.selectedFeedViewer.innerHTML = `<div class="viewer-placeholder"><div><strong>Viewer unavailable</strong><p>${escapeHtml(
        state.feedView.error.message
      )}</p></div></div>`;
      return;
    }

    const viewer = state.feedView.data;
    const actions = [
      `<button class="viewer-button" type="button" data-feed-refresh="${feed.id}">Refresh View</button>`,
      `<a class="viewer-link" href="${feed.url}" target="_blank" rel="noreferrer">Official source</a>`,
    ];
    if (viewer.sourcePageUrl && viewer.sourcePageUrl !== feed.url) {
      actions.push(`<a class="viewer-link" href="${viewer.sourcePageUrl}" target="_blank" rel="noreferrer">Resolved page</a>`);
    }

    const capability = inferViewerCapability(viewer, feed);
    const iframeNote =
      viewer.type === "iframe"
        ? isEmbeddedLivePlayer(feed, viewer)
          ? " This source hosts its own live player inside the official page."
          : " If the pane stays blank, that source is likely blocking iframe embedding and the official source link is your fallback."
        : "";
    const refreshNote = viewer.type === "image" ? ` Oversee auto-refreshes current-still feeds about every ${getViewerRefreshSeconds(feed, viewer)} seconds.` : "";
    const guidanceNote =
      capability === "snapshot" && feed.sourceId === "osu-webcams"
        ? " This specific OSU feed is a public snapshot feed, not a continuous video stream. For verified OSU live players, try Memorial Union, Library Quad, Bruckner Courtyard, or Yaquina Bay."
        : "";
    els.selectedFeedActions.innerHTML = actions.join("");
    els.selectedFeedSummary.textContent = viewer.note
      ? `${feed.integration} ${viewer.note}${refreshNote}${iframeNote}${guidanceNote}`
      : `${feed.integration}${refreshNote}${iframeNote}${guidanceNote}`;
    els.selectedFeedViewer.innerHTML = renderViewerContent(viewer, feed.name);
    hydrateViewerPlayers();
  }

  function renderViewerContent(viewer, title) {
    if (!viewer || !viewer.type) return '<div class="viewer-placeholder">No embeddable public view is available for this feed yet.</div>';

    if (viewer.type === "image") {
      return `<div class="viewer-surface"><img class="viewer-image" src="${appendCacheBust(
        toAssetUrl(viewer.url),
        viewer.generatedAt || Date.now()
      )}" data-direct-src="${appendCacheBust(viewer.url, viewer.generatedAt || Date.now())}" alt="${escapeHtml(title)}" loading="eager" /><p class="viewer-note">${escapeHtml(
        viewer.sourceLabel || "Public camera image"
      )}</p></div>`;
    }

    if (viewer.type === "video") {
      return `<div class="viewer-surface"><video class="viewer-video" controls autoplay muted playsinline src="${viewer.url}"></video><p class="viewer-note">${escapeHtml(
        viewer.sourceLabel || "Public camera stream"
      )}</p></div>`;
    }

    if (viewer.type === "hls") {
      return `<div class="viewer-surface"><video class="viewer-video" controls autoplay muted playsinline data-hls-src="${escapeHtml(viewer.url)}"></video><p class="viewer-note">${escapeHtml(
        viewer.sourceLabel || "Public HLS stream"
      )}</p></div>`;
    }

    if (viewer.type === "iframe") {
      return `<div class="viewer-surface"><iframe class="viewer-frame" src="${viewer.url}" title="${escapeHtml(
        title
      )}" loading="eager" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowfullscreen></iframe><p class="viewer-note">${escapeHtml(
        viewer.sourceLabel || "Embedded public source page"
      )}</p></div>`;
    }

    return '<div class="viewer-placeholder">No embeddable public view is available for this feed yet.</div>';
  }

  function renderWatchboard(feeds) {
    els.watchboard.innerHTML = feeds
      .slice(0, 6)
      .map(
        (feed) =>
          `<article class="watch-card ${feed.id === state.selectedFeedId ? "is-selected" : ""}" data-feed-card="${feed.id}"><div class="watch-top"><span class="badge badge-${feed.media.replace(/[^a-z]/g, "")}">${labelize(feed.media)}</span><span class="watch-area">${feed.area}</span></div><h3>${feed.name}</h3><p>${feed.integration}</p><div class="watch-meta"><span>${getSource(feed.sourceId).name}</span><span>${feed.region}</span><span>Refresh ${formatFreshness(feed.freshness)}</span></div><div class="card-actions"><button class="viewer-button viewer-button-compact" type="button" data-feed-watch="${feed.id}">Open In Watch Pane</button></div></article>`
      )
      .join("");
  }

  function renderFeeds(feeds) {
    els.feedCountLabel.textContent = `${feeds.length} shown / ${OVERSEE_DATA.feeds.length} total`;
    if (!feeds.length) {
      els.feedGrid.innerHTML =
        '<article class="empty-state"><h3>No feeds match that filter set.</h3><p>Try widening the region, resetting filters, or searching for a broader term.</p></article>';
      return;
    }

    els.feedGrid.innerHTML = feeds
      .map(
        (feed) =>
          `<article class="feed-card ${feed.id === state.selectedFeedId ? "is-selected" : ""}" data-feed-card="${feed.id}"><div class="feed-scene feed-${feed.category}"><span class="feed-scene-label">${feed.region}</span><span class="feed-scene-locality">${labelize(feed.locality)}</span></div><div class="feed-body"><div class="feed-head"><div><h3>${feed.name}</h3><p>${feed.area} | ${feed.county}</p></div><span class="status-pill">${feed.status}</span></div><div class="tag-row"><span class="badge badge-${feed.media.replace(/[^a-z]/g, "")}">${labelize(feed.media)}</span><span class="badge badge-neutral">${labelize(feed.category)}</span><span class="badge badge-neutral">${getSource(feed.sourceId).name}</span></div><p class="feed-copy">${feed.integration}</p><div class="tag-list">${feed.tags.map((tag) => `<span>${tag}</span>`).join("")}</div><div class="feed-footer"><span>Freshness target: ${formatFreshness(feed.freshness)}</span><div class="card-actions"><button class="viewer-button viewer-button-compact" type="button" data-feed-watch="${feed.id}">Open In Watch Pane</button><a class="text-link" href="${feed.url}" target="_blank" rel="noreferrer">Source page</a></div></div></div></article>`
      )
      .join("");
  }

  function renderOpsMap() {
    if (!els.opsMap) return;

    if (state.ops.map.mode === "fallback") {
      renderOpsFallback();
      return;
    }

    if (!state.ops.map.instance) return;

    const snapshot = state.ops.snapshot.data;
    clearOpsLayers();

    if (!snapshot) return;

    if (state.ops.layers.alerts) renderOpsAlerts(snapshot.alerts.items || []);
    if (state.ops.layers.quakes) renderOpsQuakes(getScopedQuakes(snapshot.quakes.items || []));
    if (state.ops.layers.flights) renderOpsFlights(snapshot.flights.items || []);
    if (state.ops.layers.cameras) renderOpsCameras(snapshot.cameras || []);

    if (state.ops.map.lastScope !== state.ops.scope) {
      const scope = getOpsScopeConfig(state.ops.scope);
      if (state.ops.scope === "world") {
        state.ops.map.instance.setView(scope.center, scope.zoom);
      } else {
        state.ops.map.instance.fitBounds(scope.bounds, { padding: [24, 24], maxZoom: state.ops.scope === "oregon" ? 7 : 5 });
      }
      state.ops.map.lastScope = state.ops.scope;
    }

    updateOpsCameraSelection();
  }

  function renderOpsFallback() {
    const snapshot = state.ops.snapshot.data;
    if (!snapshot) {
      els.opsMap.innerHTML =
        '<div class="live-placeholder live-placeholder-map">Operations map unavailable here. The briefing rail still reflects the live public layers.</div>';
      return;
    }

    const metrics = [
      `Cameras: ${snapshot.cameras.length}`,
      `Quakes: ${getScopedQuakes(snapshot.quakes.items || []).length}`,
      `Alerts: ${(snapshot.alerts.items || []).length}`,
      `Flights: ${(snapshot.flights.items || []).length}`,
    ];
    els.opsMap.innerHTML = `<div class="live-placeholder live-placeholder-map">${escapeHtml(metrics.join(" | "))}</div>`;
  }

  function renderOpsAlerts(alerts) {
    alerts
      .filter((item) => item.geometry)
      .slice(0, 24)
      .forEach((item) => {
        window.L.geoJSON(item.geometry, {
          style: { color: "#ffb49a", weight: 2, fillColor: "#e16a3d", fillOpacity: 0.16 },
        })
          .bindPopup(`<strong>${escapeHtml(item.event)}</strong><br />${escapeHtml(item.areaDesc || "Oregon")}`)
          .addTo(state.ops.map.alertsLayer);
      });
  }

  function renderOpsQuakes(quakes) {
    quakes.slice(0, 120).forEach((item) => {
      const magnitude = item.mag == null ? 1 : Math.max(1, item.mag);
      const marker = window.L.circleMarker([item.lat, item.lng], {
        radius: Math.min(14, 4 + magnitude * 1.5),
        color: item.alert ? "#ffb49a" : "#f7d37f",
        weight: 2,
        fillColor: item.alert ? "#e16a3d" : "#f2c14e",
        fillOpacity: 0.78,
      });
      marker.bindPopup(
        `<strong>${escapeHtml(item.mag != null ? `M${item.mag.toFixed(1)}` : "Earthquake")}</strong><br />${escapeHtml(item.place)}<br />${escapeHtml(
          formatTimestamp(item.time)
        )}`
      );
      marker.addTo(state.ops.map.quakesLayer);
    });
  }

  function renderOpsFlights(flights) {
    flights.slice(0, state.ops.scope === "world" ? 320 : 220).forEach((item) => {
      const marker = window.L.circleMarker([item.lat, item.lng], {
        radius: item.onGround ? 3 : 4,
        color: "#b6ffd0",
        weight: 1.5,
        fillColor: "#7bd88f",
        fillOpacity: item.onGround ? 0.35 : 0.72,
      });
      marker.bindPopup(
        `<strong>${escapeHtml(item.callsign)}</strong><br />${escapeHtml(item.originCountry)}<br />${escapeHtml(
          item.onGround ? "On ground" : `Heading ${Math.round(item.headingDeg || 0)} deg`
        )}`
      );
      marker.addTo(state.ops.map.flightsLayer);
    });
  }

  function renderOpsCameras(cameras) {
    state.ops.map.cameraMarkerIndex.clear();
    cameras.forEach((camera) => {
      const feed = feedsById.get(camera.id);
      if (!feed) return;

      const marker = window.L.circleMarker([camera.lat, camera.lng], getOpsCameraStyle(feed, feed.id === state.selectedFeedId));
      marker.bindTooltip(camera.name, { direction: "top" });
      marker.on("click", () => selectFeed(feed.id, { reveal: true }));
      marker.addTo(state.ops.map.camerasLayer);
      state.ops.map.cameraMarkerIndex.set(feed.id, marker);
    });
  }

  function clearOpsLayers() {
    if (state.ops.map.camerasLayer) state.ops.map.camerasLayer.clearLayers();
    if (state.ops.map.quakesLayer) state.ops.map.quakesLayer.clearLayers();
    if (state.ops.map.alertsLayer) state.ops.map.alertsLayer.clearLayers();
    if (state.ops.map.flightsLayer) state.ops.map.flightsLayer.clearLayers();
    state.ops.map.cameraMarkerIndex.clear();
  }

  function syncSelectedFeedVisuals() {
    document.querySelectorAll("[data-feed-card]").forEach((element) => {
      element.classList.toggle("is-selected", element.dataset.feedCard === state.selectedFeedId);
    });

    updatePrimaryMapSelection();
    updateOpsCameraSelection();
  }

  function updatePrimaryMapSelection() {
    if (state.map.mode === "fallback") {
      document.querySelectorAll("[data-map-feed-id]").forEach((marker) => {
        marker.classList.toggle("is-selected", marker.dataset.mapFeedId === state.selectedFeedId);
      });
      return;
    }

    state.map.markerIndex.forEach((marker, feedId) => {
      const feed = feedsById.get(feedId);
      marker.setStyle(getMarkerStyle(feed, feedId === state.selectedFeedId));
      if (feedId === state.selectedFeedId && marker.bringToFront) marker.bringToFront();
    });
  }

  function updateOpsCameraSelection() {
    state.ops.map.cameraMarkerIndex.forEach((marker, feedId) => {
      const feed = feedsById.get(feedId);
      marker.setStyle(getOpsCameraStyle(feed, feedId === state.selectedFeedId));
      if (feedId === state.selectedFeedId && marker.bringToFront) marker.bringToFront();
    });
  }

  function buildChipSet(container, values, key) {
    container.innerHTML = values.map((value) => `<button class="chip" type="button" data-filter="${key}" data-value="${value}">${value}</button>`).join("");
    container.querySelectorAll(".chip").forEach((chip) =>
      chip.addEventListener("click", () => {
        state[key] = chip.dataset.value;
        render();
      })
    );
  }

  function updateChipStates() {
    document.querySelectorAll("[data-filter]").forEach((chip) => {
      chip.classList.toggle("chip-active", state[chip.dataset.filter] === chip.dataset.value);
    });
  }

  function renderFilterState(filteredFeeds) {
    const active = [];
    if (state.region !== "All") active.push(`region: ${state.region}`);
    if (state.category !== "All") active.push(`category: ${labelize(state.category)}`);
    if (state.media !== "All") active.push(`media: ${labelize(state.media)}`);
    if (state.cityOnly) active.push("city/town only");
    if (state.query) active.push(`search: "${state.query}"`);
    const scopeText = active.length ? active.join(" | ") : "All public Oregon feeds in the current catalog";
    els.filterStateLabel.textContent = `${filteredFeeds.length} shown | ${scopeText}`;
  }

  function renderMetrics(filteredFeeds) {
    const metrics = [
      { label: "Network catalog", value: OVERSEE_DATA.feeds.length, tone: "fog" },
      { label: "City/town coverage", value: OVERSEE_DATA.feeds.filter((feed) => feed.locality === "city" || feed.locality === "town").length, tone: "moss" },
      { label: "Live or pseudo-live", value: OVERSEE_DATA.feeds.filter((feed) => feed.media === "live" || feed.media === "pseudo-live").length, tone: "ice" },
      { label: "Source families", value: new Set(OVERSEE_DATA.feeds.map((feed) => feed.sourceId)).size, tone: "signal" },
      { label: "Current results", value: filteredFeeds.length, tone: "ember" },
      { label: "Regions covered", value: new Set(OVERSEE_DATA.feeds.map((feed) => feed.region)).size, tone: "fog" },
    ];
    els.metricGrid.innerHTML = metrics
      .map((metric) => `<article class="metric-card metric-${metric.tone}"><span>${metric.label}</span><strong>${metric.value}</strong></article>`)
      .join("");
  }

  function getFilteredFeeds() {
    return OVERSEE_DATA.feeds.filter((feed) => {
      const source = getSource(feed.sourceId);
      const haystack = [feed.name, feed.area, feed.region, feed.county, feed.category, feed.integration, feed.tags.join(" "), source ? source.name : ""]
        .join(" ")
        .toLowerCase();

      return (
        (!state.query || haystack.includes(state.query)) &&
        (state.region === "All" || feed.region === state.region) &&
        (state.category === "All" || feed.category === state.category) &&
        (state.media === "All" || feed.media === state.media) &&
        (!state.cityOnly || feed.locality === "city" || feed.locality === "town")
      );
    });
  }

  function sortFeeds(feeds) {
    const copy = feeds.slice();
    copy.sort((left, right) => {
      if (state.sort === "area") return left.area.localeCompare(right.area) || right.priority - left.priority;
      if (state.sort === "source") return getSource(left.sourceId).name.localeCompare(getSource(right.sourceId).name);
      if (state.sort === "freshness") return left.freshness - right.freshness || right.priority - left.priority;
      return getFeedViewRank(right) - getFeedViewRank(left) || right.priority - left.priority || left.area.localeCompare(right.area);
    });
    return copy;
  }

  function getPreferredSelectedFeedId(feeds) {
    if (feeds.some((feed) => feed.id === state.selectedFeedId)) return state.selectedFeedId;
    const direct = feeds.find((feed) => getFeedViewRank(feed) >= 3);
    return (direct || feeds[0] || {}).id || "";
  }

  function focusFeedOnMap(feedId) {
    if (state.map.mode === "fallback") return;
    const marker = state.map.markerIndex.get(feedId);
    if (!state.map.instance || !marker) return;
    state.map.instance.flyTo(marker.getLatLng(), Math.max(state.map.instance.getZoom(), 9), { duration: 0.45 });
    marker.openTooltip();
  }

  function focusFeedOnOpsMap(feedId) {
    const marker = state.ops.map.cameraMarkerIndex.get(feedId);
    if (!state.ops.map.instance || !marker) return;
    state.ops.map.instance.flyTo(marker.getLatLng(), Math.max(state.ops.map.instance.getZoom(), 7), { duration: 0.45 });
    marker.openTooltip();
  }

  function maybeRevealViewerPanel() {
    if (!els.viewerPanel) return;
    const rect = els.viewerPanel.getBoundingClientRect();
    const offscreen = rect.top < 80 || rect.bottom > window.innerHeight - 24;
    if (window.innerWidth < 1180 || offscreen) {
      els.viewerPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function flashViewerPanel() {
    if (!els.viewerPanel) return;
    els.viewerPanel.classList.remove("viewer-panel-flash");
    window.clearTimeout(viewerPulseTimer);
    void els.viewerPanel.offsetWidth;
    els.viewerPanel.classList.add("viewer-panel-flash");
    viewerPulseTimer = window.setTimeout(() => {
      els.viewerPanel.classList.remove("viewer-panel-flash");
    }, 900);
  }

  function getScopedQuakes(quakes) {
    if (state.ops.scope === "world") return quakes.slice(0, 120);
    const scope = getOpsScopeConfig(state.ops.scope);
    return quakes.filter((item) => withinLeafletBounds(item.lat, item.lng, scope.bounds)).slice(0, 120);
  }

  function withinLeafletBounds(lat, lng, bounds) {
    const southWest = bounds[0];
    const northEast = bounds[1];
    return lat >= southWest[0] && lat <= northEast[0] && lng >= southWest[1] && lng <= northEast[1];
  }

  function getOpsScopeConfig(scopeId) {
    return OPS_SCOPES.find((item) => item.id === scopeId) || OPS_SCOPES[1];
  }

  function getFeedViewRank(feed) {
    const meta = OVERSEE_META[feed.id];
    if (feed.sourceId === "osu-webcams" || feed.sourceId === "osu-sea-lion") return 3;
    if (meta?.viewer?.type === "image" || feed.sourceId === "ohaz" || feed.sourceId === "newport-city") return 4;
    if (meta?.viewer?.type === "video" || meta?.viewer?.type === "hls") return 3;
    if (meta?.viewer?.type === "iframe") return 2;
    if (feed.sourceId === "tripcheck") return 1;
    return 0;
  }

  function getViewerModeInfo(feed, viewer) {
    const capability = viewer && viewer.capability ? viewer.capability : inferViewerCapability(viewer, feed);

    if (capability === "video") {
      return { label: "Live Video", tone: "live" };
    }

    if (capability === "snapshot") {
      return { label: "Current Still", tone: "still" };
    }

    if (capability === "player") {
      return { label: "Live Player", tone: "live" };
    }

    if (viewer && viewer.type === "iframe") {
      return { label: "Source Page", tone: "neutral" };
    }

    if (feed && feed.media === "pseudo-live") {
      return { label: "Pseudo Live", tone: "pseudolive" };
    }

    if (feed && feed.media === "still") {
      return { label: "Still", tone: "still" };
    }

    return { label: "Live", tone: "live" };
  }

  function getViewerRefreshSeconds(feed, viewer) {
    if (viewer && viewer.type === "image") return 20;
    if (feed && feed.sourceId === "tripcheck") return 300;
    return 60;
  }

  function shouldUseClientDirectView(feed, metaViewer) {
    if (!feed || !metaViewer || !metaViewer.type) return false;
    if (feed.sourceId === "osu-webcams" || feed.sourceId === "osu-sea-lion") return false;
    return metaViewer.type === "image" || metaViewer.type === "video" || metaViewer.type === "hls";
  }

  function inferViewerCapability(viewer, feed) {
    if (!viewer || !viewer.type) {
      if (feed && feed.media === "still") return "snapshot";
      if (feed && feed.media === "pseudo-live") return "snapshot";
      return "unknown";
    }

    if (viewer.type === "video" || viewer.type === "hls") return "video";
    if (viewer.type === "image") return "snapshot";
    if (viewer.type === "iframe") {
      if (viewer.capability === "player") return "player";
      if (isEmbeddedLivePlayer(feed, viewer)) return "player";
      return "page";
    }

    return "unknown";
  }

  function hydrateViewerPlayers() {
    document.querySelectorAll("video[data-hls-src]").forEach((video) => {
      if (video.dataset.hlsBound) return;
      video.dataset.hlsBound = "1";
      const src = video.dataset.hlsSrc;
      if (!src) return;

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        return;
      }

      if (window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
        video._overseeHls = hls;
      }
    });
  }

  function isEmbeddedLivePlayer(feed, viewer) {
    if (!feed || !viewer || viewer.type !== "iframe") return false;
    if (viewer.capability === "player") return true;
    if (feed.sourceId === "osu-sea-lion") return true;
    return feed.sourceId === "osu-webcams" && feed.media === "live";
  }

  function getMarkerStyle(feed, isSelected) {
    const tone = getCategoryTone(feed.category);
    return { radius: isSelected ? 9 : 7, color: tone.stroke, weight: isSelected ? 3 : 2, fillColor: tone.fill, fillOpacity: isSelected ? 0.95 : 0.78 };
  }

  function getOpsCameraStyle(feed, isSelected) {
    const tone = getCategoryTone(feed.category);
    return { radius: isSelected ? 8 : 6, color: isSelected ? "#d9e1e8" : tone.stroke, weight: isSelected ? 3 : 2, fillColor: tone.fill, fillOpacity: isSelected ? 1 : 0.72 };
  }

  function getCategoryTone(category) {
    if (category === "wildfire") return { fill: "#e16a3d", stroke: "#ffb49a" };
    if (category === "marine" || category === "harbor") return { fill: "#4e9ee8", stroke: "#c8e8ff" };
    if (category === "service") return { fill: "#f2c14e", stroke: "#ffe19e" };
    if (category === "city" || category === "county") return { fill: "#78b7d8", stroke: "#d8f0ff" };
    return { fill: "#77a36c", stroke: "#d6f3ca" };
  }

  function toAssetUrl(url) {
    if (!url || !/^https?:/i.test(url)) return url;
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }

  function getSource(sourceId) {
    return sourcesById.get(sourceId);
  }

  function uniqueValues(values) {
    return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
  }

  function labelize(value) {
    return String(value || "").replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatFreshness(value) {
    if (value <= 2) return "~2 min";
    if (value <= 3) return "~3 min";
    if (value <= 4) return "~4 min";
    return "~5 min";
  }

  function formatTimestamp(value) {
    if (!value) return "Just now";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Recent";
    return date.toLocaleString();
  }

  function appendCacheBust(url, token) {
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}t=${encodeURIComponent(token)}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
