const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const vm = require("node:vm");

const REQUESTED_PORT = Number(process.env.PORT || 4173);
const FALLBACK_PORTS = process.env.PORT ? [REQUESTED_PORT] : [4173, 4183, 4193, 4203, 4303];
const ROOT = __dirname;
const LIVE_CACHE_TTL_MS = 60 * 1000;
const FEED_VIEW_CACHE_TTL_MS = 45 * 1000;
const OPS_CACHE_TTL_MS = 60 * 1000;

const OVERSEE_DATA = loadBrowserExport(path.join(ROOT, "assets", "data.js"), "OVERSEE_DATA");
const OVERSEE_FEED_META = loadBrowserExport(path.join(ROOT, "assets", "feed-meta.js"), "OVERSEE_FEED_META");
const FEEDS_BY_ID = new Map(OVERSEE_DATA.feeds.map((feed) => [feed.id, feed]));

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const SOURCE_URLS = {
  tripcheckReport: "https://tripcheck.com/DynamicReports/Report/Cameras",
  tripcheckPage: "https://www.tripcheck.com/Pages/API",
  salemPage:
    "https://www.cityofsalem.net/community/transportation-getting-around/traffic-road-conditions/view-traffic-cameras",
  newportPage: "https://www.newportoregon.gov/dept/adm/webcam_full.asp",
  newportFallbackImage: "https://www.newportoregon.gov/img/webcam/newport1.jpg",
  ohazPage: "https://ohaz.uoregon.edu/wildfire-cameras/",
  alertwestPage: "https://alertwest.live/",
  clearwaterSeaLionPage: "https://clearwaterrestaurant.com/live-cam/",
  usgsQuakes: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
  nwsAlertsOregon: "https://api.weather.gov/alerts/active?area=OR",
  openskyStates: "https://opensky-network.org/api/states/all",
};

const ALLOWED_PAGE_PROXY_HOSTS = new Set([
  "webcam.oregonstate.edu",
  "mmi.oregonstate.edu",
  "apps.lanecounty.org",
  "www.weather.gov",
  "weather.gov",
  "www.cityofsalem.net",
  "cityofsalem.net",
  "salem.maps.arcgis.com",
  "www.oregon.gov",
  "oregon.gov",
  "www.tripcheck.com",
  "tripcheck.com",
  "www.newportoregon.gov",
  "newportoregon.gov",
  "clearwaterrestaurant.com",
  "www.clearwaterrestaurant.com",
]);

const OPS_SCOPE_BOUNDS = {
  oregon: { lamin: 41.8, lamax: 46.4, lomin: -124.9, lomax: -116.3 },
  west: { lamin: 31.0, lamax: 49.8, lomin: -125.6, lomax: -102.0 },
  world: null,
};

const OPS_SCOPE_LIMITS = {
  oregon: 140,
  west: 260,
  world: 420,
};

const LIVE_BOARD_FEED_IDS = [
  "ohaz-uoregon1",
  "ohaz-uoregon2",
  "ohaz-portland-west-hills",
  "ohaz-bend-odot",
  "ohaz-glenada",
  "newport-yaquina-bay",
  "osu-monroe",
  "osu-ship-ops",
];

const TRIPCHECK_WEST_REPORT_URL = "https://www.tripcheck.com/DynamicReports/Report/Cameras/4";

const TRIPCHECK_CAMERA_LOOKUP = {
  "tripcheck-eugene-coburg": { reportUrl: TRIPCHECK_WEST_REPORT_URL, pattern: /I-105 at Coburg Rd/i },
  "tripcheck-eugene-country-club": { reportUrl: TRIPCHECK_WEST_REPORT_URL, pattern: /I-105 at Country Club/i },
  "tripcheck-eugene-delta-hwy": { reportUrl: TRIPCHECK_WEST_REPORT_URL, pattern: /(Delta Hwy Near Valley River|OR132 Delta Hwy Near Valley River)/i },
  "tripcheck-eugene-beltline": { reportUrl: TRIPCHECK_WEST_REPORT_URL, pattern: /(Beltline at Delta Hwy|OR569 Beltline at Delta Hwy)/i },
  "tripcheck-eugene-west-11th": { reportUrl: TRIPCHECK_WEST_REPORT_URL, pattern: /(OR569 at OR126|West 11th)/i },
  "tripcheck-eugene-willamette-bridge": { reportUrl: TRIPCHECK_WEST_REPORT_URL, pattern: /I-5 at Willamette River Bridge/i },
  "tripcheck-springfield-52nd": { reportUrl: TRIPCHECK_WEST_REPORT_URL, pattern: /OR126 at 52nd/i },
  "tripcheck-toledo-dudlee": { reportUrl: TRIPCHECK_WEST_REPORT_URL, pattern: /US20 at Dudlee Hill/i },
  "tripcheck-toledo-pioneer": { reportUrl: TRIPCHECK_WEST_REPORT_URL, pattern: /US20 at Pioneer Mountain/i },
  "tripcheck-toledo-spring-hill": { reportUrl: TRIPCHECK_WEST_REPORT_URL, pattern: /US20 at Spring Hill Dr/i },
  "tripcheck-newport": { reportUrl: TRIPCHECK_WEST_REPORT_URL, pattern: /Newport/i },
};

const FEED_PAGE_OVERRIDES = {
  "lane-harbor-vista":
    "https://www.lanecounty.org/government/county_departments/public_works/parks/our_parks/harbor_vista",
  "lane-orchard-point":
    "https://www.lanecounty.org/government/county_departments/public_works/parks/our_parks/orchard_point",
  "osu-sea-lion-dock": SOURCE_URLS.clearwaterSeaLionPage,
};

const KNOWN_LIVE_PLAYER_VIEWS = {
  "osu-memorial-union": {
    type: "iframe",
    url: "https://camstreamer.com/embed/3437433269aa0f7/S-61681?rel=0",
    sourceLabel: "CamStreamer live player",
    sourcePageUrl: "https://camstreamer.com/live/stream/167275607-oregon-state-university-memorial-union",
    capability: "player",
    note: "This feed uses a public embeddable live player published in CamStreamer's live gallery for the Oregon State Memorial Union webcam.",
  },
  "osu-library-quad": {
    type: "iframe",
    url: "https://camstreamer.com/embed/erpJktO6XPgNoYqhfEYN53t2lNaW6iCxoNxSbbrJ?rel=0",
    sourceLabel: "CamStreamer live player",
    sourcePageUrl: "https://camstreamer.com/live/stream/376439953-oregon-state-university-valley",
    capability: "player",
    note: "This feed uses a public embeddable live player published in CamStreamer's live gallery for the OSU Valley Library Quad webcam.",
  },
  "osu-bend-bruckner": {
    type: "iframe",
    url: "https://camstreamer.com/embed/084zuf2CdXTMyqMAk1QoVQ5F6yLp8qUsUCTG8sLt?rel=0",
    sourceLabel: "CamStreamer live player",
    sourcePageUrl: "https://camstreamer.com/live/stream/43269-oregon-state-university-cascades",
    capability: "player",
    note: "This feed uses a public embeddable live player published in CamStreamer's live gallery for the OSU-Cascades Bruckner Courtyard webcam.",
  },
  "osu-yaquina-bay": {
    type: "iframe",
    url: "https://camstreamer.com/embed/w0ll7Jk2OKKasd25kSl9XnTtVKtkhU2WonTn82Sq?rel=0",
    sourceLabel: "CamStreamer live player",
    sourcePageUrl: "https://camstreamer.com/live/stream/113409317-oregon-state-university-newport",
    capability: "player",
    note: "This feed uses a public embeddable live player published in CamStreamer's live gallery for the Yaquina Bay camera.",
  },
  "osu-monroe": {
    type: "iframe",
    url: "https://www.youtube-nocookie.com/embed/Z5skON2yzcI?autoplay=1&mute=1&playsinline=1&rel=0",
    sourceLabel: "YouTube live player",
    sourcePageUrl: "https://www.youtube.com/watch?v=Z5skON2yzcI",
    capability: "player",
    note: "This feed uses a public YouTube livestream link that was surfaced from the source-page trail for Monroe Avenue.",
  },
};

let liveCache = {
  expiresAt: 0,
  data: null,
};

let liveBoardCache = {
  expiresAt: 0,
  data: null,
};

const opsCache = new Map();

const feedViewCache = new Map();

let serverPort = REQUESTED_PORT;

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    if (requestUrl.pathname === "/api/health") {
      return sendJson(response, 200, { ok: true, port: serverPort });
    }

    if (requestUrl.pathname === "/api/dashboard-live") {
      const data = await getLiveSnapshot();
      return sendJson(response, 200, data);
    }

    if (requestUrl.pathname === "/api/live-board") {
      const data = await getLiveBoard();
      return sendJson(response, 200, data);
    }

    if (requestUrl.pathname === "/api/ops-snapshot") {
      const scope = requestUrl.searchParams.get("scope") || "west";
      const data = await getOpsSnapshot(scope);
      return sendJson(response, 200, data);
    }

    if (requestUrl.pathname === "/api/feed-view") {
      const feedId = requestUrl.searchParams.get("id");

      if (!feedId) {
        return sendJson(response, 400, { error: "Missing feed id" });
      }

      const data = await getFeedView(feedId);
      return sendJson(response, 200, data);
    }

    if (requestUrl.pathname === "/api/image-proxy") {
      const imageUrl = requestUrl.searchParams.get("url");
      return proxyImage(imageUrl, response);
    }

    if (requestUrl.pathname === "/api/page-proxy") {
      const pageUrl = requestUrl.searchParams.get("url");
      return proxyPage(pageUrl, response);
    }

    return serveStaticFile(requestUrl.pathname, response);
  } catch (error) {
    return sendJson(response, 500, {
      error: "Internal server error",
      message: error.message,
    });
  }
});

listenOnPreferredPort(0);

async function getLiveSnapshot() {
  const now = Date.now();

  if (liveCache.data && liveCache.expiresAt > now) {
    return liveCache.data;
  }

  const [tripcheck, salem, newport, ohaz] = await Promise.all([
    buildTripcheckSource(),
    buildSalemSource(),
    buildNewportSource(),
    buildOhazSource(),
  ]);

  liveCache = {
    expiresAt: now + LIVE_CACHE_TTL_MS,
    data: {
      generatedAt: new Date(now).toISOString(),
      sources: {
        tripcheck,
        salem,
        newport,
        ohaz,
      },
    },
  };

  return liveCache.data;
}

async function getLiveBoard() {
  const now = Date.now();

  if (liveBoardCache.data && liveBoardCache.expiresAt > now) {
    return liveBoardCache.data;
  }

  const items = await Promise.all(
    LIVE_BOARD_FEED_IDS.map(async (feedId) => {
      const feed = FEEDS_BY_ID.get(feedId);

      if (!feed) {
        return null;
      }

      const view = await getFeedView(feedId);
      return {
        id: feed.id,
        name: feed.name,
        area: feed.area,
        region: feed.region,
        sourceId: feed.sourceId,
        media: feed.media,
        category: feed.category,
        view,
      };
    })
  );

  liveBoardCache = {
    expiresAt: now + LIVE_CACHE_TTL_MS,
    data: {
      generatedAt: new Date(now).toISOString(),
      items: items.filter((item) => item && (item.view.type === "image" || item.view.type === "video" || item.view.type === "hls")),
    },
  };

  return liveBoardCache.data;
}

async function getOpsSnapshot(requestedScope) {
  const scope = Object.prototype.hasOwnProperty.call(OPS_SCOPE_BOUNDS, requestedScope) ? requestedScope : "west";
  const now = Date.now();
  const cached = opsCache.get(scope);

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const [quakes, alerts, flights] = await Promise.all([
    buildOpsQuakes(),
    buildOpsAlerts(),
    buildOpsFlights(scope),
  ]);

  const cameras = buildOpsCameras();
  const timeline = buildOpsTimeline({ quakes, alerts, flights });
  const data = {
    generatedAt: new Date(now).toISOString(),
    scope,
    cameras,
    quakes,
    alerts,
    flights,
    timeline,
    sources: [
      { name: "USGS Earthquake Feeds", url: SOURCE_URLS.usgsQuakes },
      { name: "NWS Alerts API", url: SOURCE_URLS.nwsAlertsOregon },
      { name: "OpenSky Network", url: "https://opensky-network.org/data/" },
    ],
  };

  opsCache.set(scope, {
    expiresAt: now + OPS_CACHE_TTL_MS,
    data,
  });

  return data;
}

async function getFeedView(feedId) {
  const feed = FEEDS_BY_ID.get(feedId);

  if (!feed) {
    return {
      type: "unavailable",
      note: "Unknown feed id.",
      generatedAt: new Date().toISOString(),
    };
  }

  const cached = feedViewCache.get(feedId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let data;

  try {
    data = await resolveFeedView(feed);
  } catch (error) {
    data = {
      type: "iframe",
      url: feed.url,
      sourceLabel: "Official public source page",
      note: "Direct resolution failed here, so the dashboard fell back to the official public page.",
      sourcePageUrl: feed.url,
      error: error.message,
    };
  }

  data = decorateResolvedView(feed, data);

  const payload = {
    feedId,
    generatedAt: new Date().toISOString(),
    officialUrl: feed.url,
    meta: OVERSEE_FEED_META[feedId] || null,
    ...data,
  };

  feedViewCache.set(feedId, {
    expiresAt: Date.now() + FEED_VIEW_CACHE_TTL_MS,
    data: payload,
  });

  return payload;
}

async function resolveFeedView(feed) {
  const meta = OVERSEE_FEED_META[feed.id];

  if (feed.sourceId === "osu-webcams" || feed.sourceId === "osu-sea-lion") {
    return resolveOsuFeedView(feed, FEED_PAGE_OVERRIDES[feed.id] || feed.url);
  }

  if (meta && meta.viewer && meta.viewer.type && meta.viewer.type !== "api") {
    if (meta.viewer.type === "iframe") {
      return resolveGenericFeedView(feed, meta.viewer.url || FEED_PAGE_OVERRIDES[feed.id] || feed.url);
    }

    return {
      type: meta.viewer.type,
      url: meta.viewer.url,
      sourceLabel: "Configured public dashboard view",
      note: "This feed is using a direct public view that the dashboard has already mapped.",
      sourcePageUrl: feed.url,
    };
  }

  if (feed.sourceId === "tripcheck") {
    return resolveTripcheckFeedView(feed);
  }

  if (feed.sourceId === "ohaz") {
    return resolveOhazFeedView(feed);
  }

  if (feed.sourceId === "salem") {
    return resolveSalemFeedView(feed);
  }

  if (feed.sourceId === "newport-city") {
    return resolveNewportFeedView(feed);
  }

  return resolveGenericFeedView(feed);
}

async function resolveTripcheckFeedView(feed) {
  const lookup = TRIPCHECK_CAMERA_LOOKUP[feed.id];
  const reportUrl = (lookup && lookup.reportUrl) || SOURCE_URLS.tripcheckReport;

  if (!lookup) {
    return {
      type: "iframe",
      url: toProxiedPageUrl(reportUrl),
      sourceLabel: "Proxied TripCheck camera report",
      note: "This feed currently opens the official TripCheck report in-pane through the local proxy.",
      sourcePageUrl: reportUrl,
    };
  }

  try {
    const reportHtml = await fetchText(reportUrl);
    const links = extractAnchors(reportHtml, /View-Camera/i, reportUrl);
    const match = links.find((link) => lookup.pattern.test(link.label));

    if (!match) {
      return {
        type: "iframe",
        url: toProxiedPageUrl(reportUrl),
        sourceLabel: "Proxied TripCheck camera report",
        note: "The specific TripCheck popup could not be matched from the live report, so the report is embedded instead.",
        sourcePageUrl: reportUrl,
      };
    }

    const popupHtml = await fetchText(match.url);
    const imageUrl = extractBestImageUrl(popupHtml, match.url);

    if (imageUrl) {
      return {
        type: "image",
        url: imageUrl,
        sourceLabel: `TripCheck still image: ${match.label}`,
        note: "Resolved directly from the official TripCheck camera popup.",
        sourcePageUrl: match.url,
      };
    }

    return {
      type: "iframe",
      url: toProxiedPageUrl(match.url),
      sourceLabel: `Proxied TripCheck camera page: ${match.label}`,
      note: "Resolved to the official TripCheck camera page.",
      sourcePageUrl: match.url,
    };
  } catch (error) {
    return {
      type: "iframe",
      url: toProxiedPageUrl(reportUrl),
      sourceLabel: "Proxied TripCheck camera report",
      note: "The direct TripCheck camera resolver could not fetch live data in this environment, so the report is embedded instead.",
      sourcePageUrl: reportUrl,
      error: error.message,
    };
  }
}

function resolveOhazFeedView(feed) {
  const cameraName = {
    "ohaz-portland-west-hills": "Axis-PortlandWestHills1",
    "ohaz-bend-odot": "Axis-BendODOT",
    "ohaz-uoregon1": "Axis-UOregon1",
    "ohaz-uoregon2": "Axis-UOregon2",
    "ohaz-glenada": "Axis-Glenada",
  }[feed.id];

  if (!cameraName) {
    return {
      type: "iframe",
      url: SOURCE_URLS.ohazPage,
      sourceLabel: "OHAZ / ALERTWest camera page",
      note: "The official OHAZ page is embedded because this camera does not yet have a direct current-image mapping.",
      sourcePageUrl: SOURCE_URLS.ohazPage,
    };
  }

  return {
    type: "image",
    url: `https://alertwest.live/api/firecams/v0/currentimage?name=${encodeURIComponent(cameraName)}`,
    sourceLabel: "OHAZ / ALERTWest current image",
    note: "This dashboard view is using the public current-image endpoint published by Oregon Hazards Lab / ALERTWest.",
    sourcePageUrl: SOURCE_URLS.ohazPage,
  };
}

async function resolveSalemFeedView() {
  const salem = await buildSalemSource();

  return {
    type: "iframe",
    url: toProxiedPageUrl(salem.viewerUrl),
    sourceLabel: "Proxied City of Salem traffic viewer",
    note: "The public Salem traffic viewer is embedded through the dashboard proxy to avoid frame blocking.",
    sourcePageUrl: salem.pageUrl,
  };
}

async function resolveNewportFeedView() {
  const newport = await buildNewportSource();

  return {
    type: "image",
    url: newport.imageUrl,
    sourceLabel: "City of Newport webcam image",
    note: "The dashboard is showing the most recent image published on Newport's official webcam page.",
    sourcePageUrl: newport.pageUrl,
  };
}

async function resolveOsuFeedView(feed, sourcePageUrl) {
  const knownPlayer = KNOWN_LIVE_PLAYER_VIEWS[feed.id];
  if (knownPlayer) {
    return {
      ...knownPlayer,
    };
  }

  try {
    const html = await fetchText(sourcePageUrl);
    const text = stripHtml(html);
    const livePhrase = /Live stream of/i.test(text);
    const unavailablePhrase = /This stream is currently unavailable/i.test(text);
    const fullSizeStill = extractAnchorHref(html, /View Most Recent Full Size Webcam Still/i, sourcePageUrl);
    const fallbackStill = getKnownCurrentStillUrl(feed.id);
    const stillUrl = fullSizeStill || fallbackStill;
    const directMedia = extractBestMediaView(html, sourcePageUrl, {
      feedId: feed.id,
      sourceId: feed.sourceId,
      name: feed.name,
      area: feed.area,
      tags: feed.tags,
    });

    if (unavailablePhrase && stillUrl) {
      return {
        type: "image",
        url: stillUrl,
        sourceLabel: "OSU current still fallback",
        note: "The official OSU page currently reports that the stream is unavailable, so the dashboard is showing the latest published still instead.",
        sourcePageUrl,
      };
    }

    if (directMedia) {
      return {
        ...directMedia,
        note:
          directMedia.capability === "video"
            ? "The dashboard resolved a direct public media stream from the official OSU-linked player."
            : "The dashboard resolved a direct embedded player from the official OSU-linked source page.",
        sourcePageUrl,
      };
    }

    if (livePhrase) {
      return {
        type: "iframe",
        url: toProxiedPageUrl(sourcePageUrl),
        sourceLabel: "Proxied linked live player page",
        note: "The official source page presents this feed as a live stream, so the dashboard is embedding a proxied copy of that player page to avoid frame blocking.",
        sourcePageUrl,
      };
    }

    if (stillUrl) {
      return {
        type: "image",
        url: stillUrl,
        sourceLabel: "OSU current still",
        note: "A direct current still was available from the official OSU webcam page.",
        sourcePageUrl,
      };
    }
  } catch (error) {
    const fallbackStill = getKnownCurrentStillUrl(feed.id);

    if (fallbackStill) {
      return {
        type: "image",
        url: fallbackStill,
        sourceLabel: "OSU current still fallback",
        note: "The official OSU page could not be checked from this environment, so the dashboard fell back to the known current-still endpoint.",
        sourcePageUrl,
        error: error.message,
      };
    }
  }

  return {
    type: "iframe",
    url: toProxiedPageUrl(sourcePageUrl),
    sourceLabel: "Proxied linked camera page",
    note: "The dashboard embedded a proxied copy of the linked public camera page because no better direct media endpoint was confirmed.",
    sourcePageUrl,
  };
}

async function resolveGenericFeedView(feed, explicitSourcePageUrl) {
  const sourcePageUrl = explicitSourcePageUrl || FEED_PAGE_OVERRIDES[feed.id] || feed.url;

  try {
    const html = await fetchText(sourcePageUrl);
    const fullSizeStill = extractAnchorHref(html, /View Most Recent Full Size Webcam Still/i, sourcePageUrl);
    const directMedia = extractBestMediaView(html, sourcePageUrl, {
      feedId: feed.id,
      sourceId: feed.sourceId,
      name: feed.name,
      area: feed.area,
      tags: feed.tags,
    });

    if (directMedia) {
      return {
        ...directMedia,
        note:
          directMedia.capability === "video"
            ? "The dashboard resolved a direct public media stream from the official source page."
            : "The dashboard resolved a direct embedded player from the official source page.",
        sourcePageUrl,
      };
    }

    if (fullSizeStill) {
      return {
        type: "image",
        url: fullSizeStill,
        sourceLabel: "Resolved public webcam still",
        note: "The dashboard found a direct public still image link for this camera.",
        sourcePageUrl,
      };
    }

    const webcamLink = extractAnchorHref(html, /\b(webcam|camera|live view|view webcam)\b/i, sourcePageUrl);
    const imageUrl = extractBestImageUrl(html, sourcePageUrl);
    const cameraImageUrl = imageUrl && isLikelyCameraImageUrl(imageUrl) ? imageUrl : "";

    if (cameraImageUrl) {
      return {
        type: "image",
        url: cameraImageUrl,
        sourceLabel: "Resolved public camera image",
        note: "The dashboard resolved a direct public image from the official source page.",
        sourcePageUrl,
      };
    }

    if (webcamLink) {
      return {
        type: "iframe",
        url: toProxiedPageUrl(webcamLink),
        sourceLabel: "Proxied public camera page",
        note: "The dashboard found a more specific public camera page and embedded it here.",
        sourcePageUrl,
      };
    }
  } catch (error) {
    return {
      type: "iframe",
      url: toProxiedPageUrl(sourcePageUrl),
      sourceLabel: "Proxied public source page",
      note: "The resolver could not fetch a richer embeddable view here, so the official public page is embedded instead.",
      sourcePageUrl,
      error: error.message,
    };
  }

  return {
    type: "iframe",
    url: toProxiedPageUrl(sourcePageUrl),
    sourceLabel: "Proxied public source page",
    note: "No direct media asset was exposed on the source page, so the official public page is embedded instead.",
    sourcePageUrl,
  };
}

async function buildTripcheckSource() {
  try {
    const html = await fetchText(SOURCE_URLS.tripcheckReport);
    const text = stripHtml(html);
    const links = extractAnchors(html, /View-Camera/i, SOURCE_URLS.tripcheckReport);

    const stats = [
      { label: "Linked camera entries", value: links.length || "n/a" },
      { label: "Eugene mentions", value: countMatches(text, /Eugene/g) },
      { label: "Toledo corridor mentions", value: countMatches(text, /(Dudlee Hill|Pioneer Mountain|Spring Hill)/g) },
      { label: "Portland mentions", value: countMatches(text, /Portland -/g) },
      { label: "Salem mentions", value: countMatches(text, /Salem -/g) },
      { label: "Newport mentions", value: countMatches(text, /Newport/g) },
      { label: "Astoria mentions", value: countMatches(text, /Astoria/g) },
    ].filter((stat) => stat.value !== 0);

    const featuredLinks = links
      .filter((link) =>
        /(Portland|Salem|Newport|Astoria|Bend|Hood River|Medford|Yaquina|Burnside|Eugene|Coburg|Delta|Dudlee|Pioneer|Spring Hill)/i.test(
          link.label
        )
      )
      .slice(0, 10);

    return {
      title: "TripCheck roadside camera report",
      statusLabel: "Live snapshot",
      summary:
        links.length > 0
          ? "Fetched the public camera report and extracted official camera links where the report exposed them."
          : "Fetched the public camera report and highlighted official city and town coverage from the statewide report.",
      stats,
      featuredLinks,
      reportUrl: SOURCE_URLS.tripcheckReport,
      pageUrl: SOURCE_URLS.tripcheckPage,
    };
  } catch (error) {
    return {
      title: "TripCheck roadside camera report",
      statusLabel: "Fallback",
      summary:
        "The live TripCheck report could not be fetched from this environment, but the dashboard still links to the official statewide camera report and API page.",
      stats: [
        { label: "Status", value: "Fetch blocked" },
        { label: "Best fallback", value: "Official report link" },
      ],
      featuredLinks: [],
      reportUrl: SOURCE_URLS.tripcheckReport,
      pageUrl: SOURCE_URLS.tripcheckPage,
      error: error.message,
    };
  }
}

async function buildSalemSource() {
  try {
    const html = await fetchText(SOURCE_URLS.salemPage);
    const text = stripHtml(html);
    const viewerUrl =
      extractFirstUrl(html, /https:\/\/salem\.maps\.arcgis\.com\/apps\/instant\/sidebar\/index\.html\?appid=[^"' <]+/i) ||
      "https://salem.maps.arcgis.com/apps/instant/sidebar/index.html?appid=1dc340e3cbe34aadb723d0d6dd763e15";

    const summary =
      extractSentence(text, "majority of traffic cameras are now back online") ||
      extractSentence(text, "traffic cameras are now back online") ||
      "The city reports that most traffic cameras are back online, with some cameras still under repair.";

    return {
      title: "Salem traffic camera viewer",
      statusLabel: "Connected",
      summary,
      viewerUrl,
      pageUrl: SOURCE_URLS.salemPage,
    };
  } catch (error) {
    return {
      title: "Salem traffic camera viewer",
      statusLabel: "Fallback",
      summary:
        "The live Salem source page could not be fetched from this environment. The dashboard still links to the city page and the ArcGIS viewer.",
      viewerUrl:
        "https://salem.maps.arcgis.com/apps/instant/sidebar/index.html?appid=1dc340e3cbe34aadb723d0d6dd763e15",
      pageUrl: SOURCE_URLS.salemPage,
      error: error.message,
    };
  }
}

async function buildNewportSource() {
  try {
    const html = await fetchText(SOURCE_URLS.newportPage);
    const weatherUrl = extractFirstUrl(html, /https?:\/\/forecast7\.com\/[^"' <]+/i) || "https://forecast7.com/";
    const imageMatches = Array.from(html.matchAll(/\/img\/webcam\/newport\d+\.jpg/gi)).map((match) => match[0]);
    const uniqueImages = dedupe(imageMatches).map((imagePath) => new URL(imagePath, SOURCE_URLS.newportPage).href);

    return {
      title: "Newport Yaquina Bay webcam",
      statusLabel: "Connected",
      summary: "Pulled the official Newport webcam page and the most recent public webcam image path.",
      imageUrl: uniqueImages[0] || SOURCE_URLS.newportFallbackImage,
      weatherUrl,
      pageUrl: SOURCE_URLS.newportPage,
    };
  } catch (error) {
    return {
      title: "Newport Yaquina Bay webcam",
      statusLabel: "Fallback",
      summary:
        "The live Newport page could not be fetched from this environment. The dashboard is using the city's known webcam image path as a direct fallback.",
      imageUrl: SOURCE_URLS.newportFallbackImage,
      weatherUrl: "https://forecast7.com/",
      pageUrl: SOURCE_URLS.newportPage,
      error: error.message,
    };
  }
}

async function buildOhazSource() {
  const cameras = [
    { label: "Portland West Hills 1", area: "Portland", name: "Axis-PortlandWestHills1" },
    { label: "Bend ODOT", area: "Bend", name: "Axis-BendODOT" },
    { label: "Eugene UOregon1", area: "Eugene", name: "Axis-UOregon1" },
    { label: "Eugene UOregon2", area: "Eugene", name: "Axis-UOregon2" },
    { label: "Marys Peak", area: "Corvallis", name: "Axis-MarysPeak" },
    { label: "Glenada", area: "Florence", name: "Axis-Glenada" },
  ].map((camera) => ({
    label: camera.label,
    area: camera.area,
    imageUrl: `https://alertwest.live/api/firecams/v0/currentimage?name=${encodeURIComponent(camera.name)}`,
  }));

  return {
    title: "OHAZ wildfire cameras",
    statusLabel: "Connected",
    summary:
      "Using Oregon Hazards Lab / ALERTWest public current-image endpoints for featured Oregon wildfire cameras.",
    cameras,
    pageUrl: SOURCE_URLS.ohazPage,
    platformUrl: SOURCE_URLS.alertwestPage,
  };
}

function buildOpsCameras() {
  return OVERSEE_DATA.feeds
    .map((feed) => {
      const meta = OVERSEE_FEED_META[feed.id];

      if (!meta || typeof meta.lat !== "number" || typeof meta.lng !== "number") {
        return null;
      }

      return {
        id: feed.id,
        name: feed.name,
        area: feed.area,
        region: feed.region,
        category: feed.category,
        media: feed.media,
        lat: meta.lat,
        lng: meta.lng,
      };
    })
    .filter(Boolean);
}

async function buildOpsQuakes() {
  try {
    const payload = await fetchJson(SOURCE_URLS.usgsQuakes, {
      headers: {
        Accept: "application/geo+json,application/json;q=0.9,*/*;q=0.8",
      },
      timeoutMs: 8000,
    });

    const items = (payload.features || [])
      .map((feature) => {
        const coordinates = feature?.geometry?.coordinates || [];
        const properties = feature?.properties || {};
        const lng = Number(coordinates[0]);
        const lat = Number(coordinates[1]);
        const depthKm = Number(coordinates[2]);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }

        return {
          id: feature.id,
          mag: Number.isFinite(Number(properties.mag)) ? Number(properties.mag) : null,
          place: properties.place || "Unknown location",
          time: properties.time || 0,
          updated: properties.updated || 0,
          lat,
          lng,
          depthKm: Number.isFinite(depthKm) ? depthKm : null,
          significance: properties.sig || 0,
          tsunami: properties.tsunami || 0,
          alert: properties.alert || "",
          url: properties.url || "https://earthquake.usgs.gov/",
        };
      })
      .filter(Boolean)
      .sort((left, right) => (right.time || 0) - (left.time || 0))
      .slice(0, 160);

    return {
      status: "ready",
      summary: `Loaded ${items.length} recent earthquake events from the USGS GeoJSON summary feed.`,
      sourceUrl: SOURCE_URLS.usgsQuakes,
      items,
    };
  } catch (error) {
    return {
      status: "unavailable",
      summary: "The USGS earthquake feed could not be fetched in this environment.",
      sourceUrl: SOURCE_URLS.usgsQuakes,
      items: [],
      error: error.message,
    };
  }
}

async function buildOpsAlerts() {
  try {
    const payload = await fetchJson(SOURCE_URLS.nwsAlertsOregon, {
      headers: {
        Accept: "application/geo+json,application/ld+json,application/json;q=0.9,*/*;q=0.8",
      },
      timeoutMs: 8000,
    });

    const items = (payload.features || [])
      .map((feature) => {
        const properties = feature?.properties || {};
        return {
          id: properties.id || feature.id || `alert-${Math.random().toString(36).slice(2, 8)}`,
          event: properties.event || "Alert",
          headline: properties.headline || properties.event || "Weather alert",
          areaDesc: properties.areaDesc || "Oregon",
          severity: properties.severity || "Unknown",
          certainty: properties.certainty || "",
          urgency: properties.urgency || "",
          sent: properties.sent || "",
          effective: properties.effective || "",
          expires: properties.expires || "",
          instruction: properties.instruction || "",
          response: properties.response || "",
          geometry: feature.geometry || null,
          url: properties["@id"] || "https://api.weather.gov/alerts/active?area=OR",
        };
      })
      .sort((left, right) => new Date(right.sent || 0).getTime() - new Date(left.sent || 0).getTime());

    return {
      status: "ready",
      summary: `Loaded ${items.length} active Oregon weather and hazard alerts from api.weather.gov.`,
      sourceUrl: SOURCE_URLS.nwsAlertsOregon,
      items,
    };
  } catch (error) {
    return {
      status: "unavailable",
      summary: "The National Weather Service alerts feed could not be fetched in this environment.",
      sourceUrl: SOURCE_URLS.nwsAlertsOregon,
      items: [],
      error: error.message,
    };
  }
}

async function buildOpsFlights(scope) {
  const bounds = OPS_SCOPE_BOUNDS[scope] || OPS_SCOPE_BOUNDS.west;
  const params = new URLSearchParams();
  if (bounds) {
    params.set("lamin", String(bounds.lamin));
    params.set("lamax", String(bounds.lamax));
    params.set("lomin", String(bounds.lomin));
    params.set("lomax", String(bounds.lomax));
  }

  const requestUrl = params.size ? `${SOURCE_URLS.openskyStates}?${params.toString()}` : SOURCE_URLS.openskyStates;

  try {
    const payload = await fetchJson(requestUrl, {
      headers: buildOpenSkyHeaders(),
      timeoutMs: 8000,
    });

    const items = (payload.states || [])
      .map((stateVector) => {
        const lng = Number(stateVector[5]);
        const lat = Number(stateVector[6]);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }

        return {
          id: stateVector[0],
          callsign: normalizeWhitespace(String(stateVector[1] || "").trim()) || stateVector[0] || "Unknown",
          originCountry: stateVector[2] || "Unknown",
          lastContact: stateVector[4] || 0,
          lng,
          lat,
          baroAltitudeM: Number.isFinite(Number(stateVector[7])) ? Number(stateVector[7]) : null,
          onGround: Boolean(stateVector[8]),
          velocityMps: Number.isFinite(Number(stateVector[9])) ? Number(stateVector[9]) : null,
          headingDeg: Number.isFinite(Number(stateVector[10])) ? Number(stateVector[10]) : null,
          verticalRateMps: Number.isFinite(Number(stateVector[11])) ? Number(stateVector[11]) : null,
          geoAltitudeM: Number.isFinite(Number(stateVector[13])) ? Number(stateVector[13]) : null,
        };
      })
      .filter(Boolean)
      .sort((left, right) => (right.lastContact || 0) - (left.lastContact || 0));

    return {
      status: "ready",
      summary: `Loaded ${items.length} current flight state vectors from OpenSky for the ${scope} scope.`,
      sourceUrl: requestUrl,
      items: sampleItems(items, OPS_SCOPE_LIMITS[scope] || OPS_SCOPE_LIMITS.west),
    };
  } catch (error) {
    return {
      status: "limited",
      summary:
        "OpenSky flight data is currently unavailable or rate-limited here. The operations map keeps the official earthquake and alert layers online.",
      sourceUrl: requestUrl,
      items: [],
      error: error.message,
    };
  }
}

function buildOpsTimeline(snapshot) {
  const quakeEvents = (snapshot.quakes.items || []).slice(0, 5).map((item) => ({
    type: "quake",
    time: item.time || 0,
    title: item.mag != null ? `M${item.mag.toFixed(1)} earthquake` : "Earthquake",
    detail: item.place,
    meta: item.depthKm != null ? `Depth ${Math.round(item.depthKm)} km` : "USGS event",
    url: item.url,
  }));

  const alertEvents = (snapshot.alerts.items || []).slice(0, 5).map((item) => ({
    type: "alert",
    time: item.sent ? new Date(item.sent).getTime() : 0,
    title: item.event,
    detail: item.headline || item.areaDesc,
    meta: item.areaDesc || "Oregon",
    url: item.url,
  }));

  const items = quakeEvents
    .concat(alertEvents)
    .sort((left, right) => (right.time || 0) - (left.time || 0))
    .slice(0, 8);

  if (snapshot.flights.status !== "ready") {
    items.unshift({
      type: "flight",
      time: Date.now(),
      title: "Flight layer degraded",
      detail: snapshot.flights.summary,
      meta: "OpenSky adapter",
      url: "https://opensky-network.org/data/",
    });
  }

  return items.slice(0, 8);
}

function buildOpenSkyHeaders() {
  const headers = {
    Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
  };
  const token = process.env.OPENSKY_TOKEN;

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function serveStaticFile(pathname, response) {
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path
    .normalize(relativePath)
    .replace(/^([/\\])+/, "")
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, safePath);
  const relative = path.relative(ROOT, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return sendJson(response, 403, { error: "Forbidden" });
  }

  fs.readFile(filePath, (error, fileBuffer) => {
    if (error) {
      if (error.code === "ENOENT") {
        return sendJson(response, 404, { error: "Not found" });
      }

      return sendJson(response, 500, { error: "File read failed", message: error.message });
    }

    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" || ext === ".js" || ext === ".css" ? "no-cache" : "public, max-age=300",
    });
    response.end(fileBuffer);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function proxyImage(imageUrl, response) {
  if (!imageUrl) {
    return sendJson(response, 400, { error: "Missing image url" });
  }

  let parsed;

  try {
    parsed = new URL(imageUrl);
  } catch (error) {
    return sendJson(response, 400, { error: "Invalid image url", message: error.message });
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    return sendJson(response, 400, { error: "Unsupported protocol" });
  }

  try {
    const upstream = await fetch(parsed.href, {
      headers: {
        "User-Agent": "Oversee/0.1 (+local dashboard image proxy)",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return sendJson(response, 502, {
        error: "Image upstream failed",
        status: upstream.status,
      });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    response.writeHead(200, {
      "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "public, max-age=60",
    });
    response.end(Buffer.from(arrayBuffer));
  } catch (error) {
    return sendJson(response, 502, {
      error: "Image proxy failed",
      message: error.message,
    });
  }
}

async function proxyPage(pageUrl, response) {
  if (!pageUrl) {
    return sendJson(response, 400, { error: "Missing page url" });
  }

  let parsed;

  try {
    parsed = new URL(pageUrl);
  } catch (error) {
    return sendJson(response, 400, { error: "Invalid page url", message: error.message });
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    return sendJson(response, 400, { error: "Unsupported protocol" });
  }

  if (!ALLOWED_PAGE_PROXY_HOSTS.has(parsed.hostname)) {
    return sendJson(response, 403, { error: "Host not allowed for page proxy", host: parsed.hostname });
  }

  try {
    const html = await fetchText(parsed.href);
    const rewritten = rewriteHtmlForProxy(html, parsed.href);
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    response.end(rewritten);
  } catch (error) {
    return sendJson(response, 502, {
      error: "Page proxy failed",
      message: error.message,
    });
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Oversee/0.1 (+local dashboard prototype)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url} with status ${response.status}`);
  }

  return response.text();
}

function rewriteHtmlForProxy(html, sourceUrl) {
  const cleaned = html
    .replace(/<meta[^>]+http-equiv=(['"])Content-Security-Policy\1[^>]*>/gi, "")
    .replace(/<meta[^>]+http-equiv=(['"])X-Frame-Options\1[^>]*>/gi, "");

  if (/<base\b/i.test(cleaned)) {
    return cleaned;
  }

  if (/<head[^>]*>/i.test(cleaned)) {
    return cleaned.replace(/<head([^>]*)>/i, `<head$1><base href="${escapeHtmlAttribute(sourceUrl)}">`);
  }

  return `<base href="${escapeHtmlAttribute(sourceUrl)}">${cleaned}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Oversee/0.1 (+local dashboard prototype)",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(options.timeoutMs || 8000),
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url} with status ${response.status}`);
  }

  return response.json();
}

function extractAnchors(html, hrefPattern, baseUrl) {
  const anchors = [];
  const anchorRegex = /<a[^>]+href=(['"])(.*?)\1[^>]*>(.*?)<\/a>/gis;

  let match = anchorRegex.exec(html);
  while (match) {
    const href = match[2];
    const label = normalizeWhitespace(stripHtml(match[3]));

    if (hrefPattern.test(href) && label) {
      anchors.push({
        label,
        url: new URL(href, baseUrl).href,
      });
    }

    match = anchorRegex.exec(html);
  }

  return dedupeBy(anchors, (item) => `${item.label}|${item.url}`);
}

function extractAnchorHref(html, labelPattern, baseUrl) {
  const anchor = extractAnchors(html, /./, baseUrl).find((item) => labelPattern.test(item.label));
  return anchor ? anchor.url : "";
}

function extractBestMediaView(html, baseUrl, context = {}) {
  const candidates = []
    .concat(extractPlatformPlayerCandidates(html, baseUrl, context))
    .concat(extractDirectMediaCandidates(html, baseUrl, context))
    .concat(extractIframeCandidates(html, baseUrl, context));

  const ranked = candidates
    .filter((candidate) => candidate && candidate.url)
    .sort((left, right) => right.score - left.score);

  if (!ranked.length) {
    return null;
  }

  const best = ranked[0];
  return {
    type: best.type,
    url: best.url,
    sourceLabel: best.sourceLabel,
    capability: best.capability,
  };
}

function extractBestImageUrl(html, baseUrl) {
  const metaMatch =
    html.match(/<meta[^>]+property=(['"])og:image\1[^>]+content=(['"])(.*?)\2/si) ||
    html.match(/<meta[^>]+name=(['"])twitter:image\1[^>]+content=(['"])(.*?)\2/si);

  if (metaMatch && metaMatch[3]) {
    return new URL(metaMatch[3], baseUrl).href;
  }

  const imgMatches = Array.from(html.matchAll(/<img[^>]+src=(['"])(.*?)\1[^>]*>/gis)).map((match) => match[2]);
  const filtered = imgMatches
    .filter((src) => src && !src.startsWith("data:"))
    .map((src) => new URL(src, baseUrl).href)
    .filter((url) => !/logo|icon|sprite|blank|spacer/i.test(url));

  const scored = filtered
    .map((url) => ({ url, score: scoreImageUrl(url) }))
    .sort((left, right) => right.score - left.score);

  return scored[0] && scored[0].score >= 5 ? scored[0].url : "";
}

function scoreImageUrl(url) {
  let score = 0;

  if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) {
    score += 4;
  }

  if (/(cam|camera|webcam|still|current|snapshot|image)/i.test(url)) {
    score += 5;
  }

  if (/(newport|tripcheck|alertwest|webcam\.oregonstate|marine|barcam)/i.test(url)) {
    score += 3;
  }

  return score;
}

function isLikelyCameraImageUrl(url) {
  return scoreImageUrl(url) >= 9;
}

function extractPlatformPlayerCandidates(html, baseUrl, context = {}) {
  const candidates = [];
  const seen = new Set();
  const register = (rawUrl) => {
    const embedUrl = toEmbeddablePlatformUrl(rawUrl, baseUrl);
    if (!embedUrl) return;

    const key = `platform|${embedUrl}`;
    if (seen.has(key)) return;
    seen.add(key);

    const score = scoreIframeUrl(embedUrl, context) + 4;
    if (score < 10) return;

    candidates.push({
      type: "iframe",
      url: embedUrl,
      capability: "player",
      score,
      sourceLabel: /youtube/i.test(embedUrl) ? "YouTube live player" : "Resolved embedded public player",
    });
  };

  const attrRegex = /(?:src|href|content|data-src|data-url)\s*[:=]\s*(['"])(.*?)\1/gi;
  let match = attrRegex.exec(html);
  while (match) {
    register(match[2]);
    match = attrRegex.exec(html);
  }

  const inlineRegex = /(https?:\/\/[^"'<>\\\s]+?(?:youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com)[^"'<>\\\s]*)/gi;
  match = inlineRegex.exec(html);
  while (match) {
    register(match[1]);
    match = inlineRegex.exec(html);
  }

  return candidates;
}

function extractDirectMediaCandidates(html, baseUrl, context = {}) {
  const candidates = [];
  const seen = new Set();
  const register = (type, rawUrl) => {
    if (!rawUrl || rawUrl.startsWith("data:")) return;
    let url;
    try {
      url = new URL(rawUrl, baseUrl).href;
    } catch {
      return;
    }

    const key = `${type}|${url}`;
    if (seen.has(key)) return;
    seen.add(key);

    const score = scoreMediaUrl(url, type, context);
    if (score < 8) return;

    candidates.push({
      type,
      url,
      capability: "video",
      score,
      sourceLabel: type === "hls" ? "Resolved public HLS stream" : "Resolved public media stream",
    });
  };

  const attrRegex = /(?:src|href|content|data-src|data-url|file|stream|streamUrl|contentUrl)\s*[:=]\s*(['"])(.*?)\1/gi;
  let match = attrRegex.exec(html);
  while (match) {
    const value = match[2];
    if (/\.m3u8(?:[?#]|$)/i.test(value)) {
      register("hls", value);
    } else if (/\.(mp4|webm|m4v)(?:[?#]|$)/i.test(value)) {
      register("video", value);
    }
    match = attrRegex.exec(html);
  }

  const inlineRegex = /(https?:\/\/[^"'<>\\\s]+?\.(?:m3u8|mp4|webm|m4v)(?:\?[^"'<>\\\s]*)?)/gi;
  match = inlineRegex.exec(html);
  while (match) {
    if (/\.m3u8(?:[?#]|$)/i.test(match[1])) {
      register("hls", match[1]);
    } else {
      register("video", match[1]);
    }
    match = inlineRegex.exec(html);
  }

  return candidates;
}

function extractIframeCandidates(html, baseUrl, context = {}) {
  const candidates = [];
  const seen = new Set();
  const iframeRegex = /<iframe[^>]+src=(['"])(.*?)\1[^>]*>/gis;
  let match = iframeRegex.exec(html);

  while (match) {
    const rawUrl = match[2];
    let url;
    try {
      url = new URL(rawUrl, baseUrl).href;
    } catch {
      match = iframeRegex.exec(html);
      continue;
    }

    const score = scoreIframeUrl(url, context);
    const key = `iframe|${url}`;
    if (!seen.has(key) && score >= 8) {
      seen.add(key);
      candidates.push({
        type: "iframe",
        url,
        capability: "player",
        score,
        sourceLabel: "Resolved embedded public player",
      });
    }

    match = iframeRegex.exec(html);
  }

  return candidates;
}

function scoreMediaUrl(url, type, context = {}) {
  let score = type === "hls" ? 18 : 16;

  if (/youtube|vimeo|jwplatform|wistia|brightcove|cloudfront|m3u8|stream|live/i.test(url)) {
    score += 4;
  }

  if (/(camera|webcam|cam|live|stream|view)/i.test(url)) {
    score += 3;
  }

  const hintText = [context.feedId, context.sourceId, context.name, context.area]
    .concat(Array.isArray(context.tags) ? context.tags : [])
    .filter(Boolean)
    .join(" ");

  if (hintText) {
    const words = hintText
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4);

    if (words.some((word) => url.toLowerCase().includes(word))) {
      score += 2;
    }
  }

  return score;
}

function scoreIframeUrl(url, context = {}) {
  let score = 0;
  const lower = url.toLowerCase();

  if (/youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|player\.vimeo\.com|hdontap\.com|ipcamlive\.com|earthcam\.com/i.test(url)) {
    score += 12;
  }

  if (/(player|embed|live|stream|cam|camera|webcam|view)/i.test(lower)) {
    score += 5;
  }

  const hintText = [context.feedId, context.sourceId, context.name, context.area]
    .concat(Array.isArray(context.tags) ? context.tags : [])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (hintText) {
    const words = hintText.split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
    if (words.some((word) => lower.includes(word))) {
      score += 2;
    }
  }

  return score;
}

function toEmbeddablePlatformUrl(rawUrl, baseUrl) {
  if (!rawUrl || rawUrl.startsWith("data:")) return "";

  let parsed;
  try {
    parsed = new URL(rawUrl, baseUrl);
  } catch {
    return "";
  }

  const host = parsed.hostname.toLowerCase();

  if (host === "youtu.be") {
    const id = parsed.pathname.replace(/^\/+/, "").split("/")[0];
    return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0` : "";
  }

  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    if (parsed.pathname === "/watch") {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0` : "";
    }

    const embedMatch = parsed.pathname.match(/^\/embed\/([^/?#]+)/i);
    if (embedMatch && embedMatch[1]) {
      return `https://www.youtube-nocookie.com/embed/${embedMatch[1]}?autoplay=1&mute=1&playsinline=1&rel=0`;
    }

    const liveMatch = parsed.pathname.match(/^\/live\/([^/?#]+)/i);
    if (liveMatch && liveMatch[1]) {
      return `https://www.youtube-nocookie.com/embed/${liveMatch[1]}?autoplay=1&mute=1&playsinline=1&rel=0`;
    }
  }

  if (host.endsWith("vimeo.com")) {
    if (host === "player.vimeo.com") {
      return parsed.href;
    }

    const id = parsed.pathname.replace(/^\/+/, "").split("/")[0];
    return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : "";
  }

  return "";
}

function getKnownCurrentStillUrl(feedId) {
  return {
    "osu-memorial-union": "https://webcam.oregonstate.edu/cam/mu/live/live.jpg",
    "osu-monroe": "https://webcam.oregonstate.edu/cam/monroe/live/live.jpg",
    "osu-library-quad": "https://webcam.oregonstate.edu/cam/libraryquad/live/live.jpg",
    "osu-bend-bruckner": "https://webcam.oregonstate.edu/cam/cascades3/live/live.jpg",
    "osu-bend-innovation": "https://webcam.oregonstate.edu/cam/cascades1/live/live.jpg",
    "osu-yaquina-bay": "https://webcam.oregonstate.edu/cam/yaquinabay/live/live.jpg",
    "osu-ship-ops": "https://webcam.oregonstate.edu/cam/ships/live/live.jpg",
  }[feedId] || "";
}

function toProxiedPageUrl(url) {
  return `/api/page-proxy?url=${encodeURIComponent(url)}`;
}

function decorateResolvedView(feed, data) {
  const view = {
    ...(data || {}),
  };

  if (!view.sourcePageUrl) {
    view.sourcePageUrl = FEED_PAGE_OVERRIDES[feed.id] || feed.url;
  }

  if (!view.capability) {
    if (view.type === "video" || view.type === "hls") {
      view.capability = "video";
    } else if (view.type === "image") {
      view.capability = "snapshot";
    } else if (view.type === "iframe") {
      view.capability = /live player|live stream|embedded player/i.test(`${view.sourceLabel || ""} ${view.note || ""}`)
        ? "player"
        : "page";
    } else {
      view.capability = "unknown";
    }
  }

  return view;
}

function extractFirstUrl(html, pattern) {
  const match = html.match(pattern);
  return match ? match[0] : "";
}

function stripHtml(html) {
  return normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
  );
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeHtmlAttribute(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function countMatches(value, regex) {
  const matches = value.match(regex);
  return matches ? matches.length : 0;
}

function extractSentence(text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`([^.!?]*${escaped}[^.!?]*[.!?])`, "i");
  const match = text.match(regex);
  return match ? normalizeWhitespace(match[1]) : "";
}

function dedupe(values) {
  return Array.from(new Set(values));
}

function dedupeBy(values, getKey) {
  const seen = new Set();
  return values.filter((value) => {
    const key = getKey(value);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function sampleItems(values, maxItems) {
  if (values.length <= maxItems) {
    return values;
  }

  const step = values.length / maxItems;
  const result = [];

  for (let index = 0; index < maxItems; index += 1) {
    result.push(values[Math.floor(index * step)]);
  }

  return result.filter(Boolean);
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

  if (!port) {
    throw new Error(`Unable to bind Oversee to any preferred port: ${FALLBACK_PORTS.join(", ")}`);
  }

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
