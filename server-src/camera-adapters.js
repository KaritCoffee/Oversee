function cameraRecord(value = {}) {
  const name = cleanText(value.name || "Public traffic camera");
  const imageUrl = safeUrl(value.imageUrl, value.baseUrl);
  const fallbackViews = (value.fallbackViews || [])
    .map((view) => ({
      type: view.type || "image",
      url: safeUrl(view.url, view.baseUrl || value.baseUrl),
      sourceName: view.sourceName || value.sourceName,
      sourcePageUrl: view.sourcePageUrl || value.sourcePageUrl,
      refreshSeconds: Number(view.refreshSeconds || value.refreshSeconds || 60),
      requestHeaders: view.requestHeaders || value.requestHeaders,
    }))
    .filter((view) => view.url && view.url !== imageUrl);
  return {
    id: value.id,
    dynamic: true,
    type: "camera",
    name,
    shortName: name.slice(0, 36),
    area: cleanText(value.area || value.region || value.country || "Public camera"),
    region: cleanText(value.region || value.area || value.country || "Unknown"),
    county: cleanText(value.county || value.area || value.region || "Unknown"),
    country: cleanText(value.country || "Unknown"),
    category: "traffic",
    media: imageUrl ? "still" : "source",
    status: "Online",
    freshness: Number(value.freshness || 2),
    tags: uniqueStrings([...(value.tags || []), value.country, value.region, "traffic"]),
    sourceId: value.sourceId,
    sourceName: value.sourceName,
    sourceUrl: value.sourceUrl,
    officialUrl: value.officialUrl || value.sourcePageUrl,
    sourcePageUrl: value.sourcePageUrl || value.officialUrl,
    lat: Number(value.lat),
    lng: Number(value.lng),
    viewerType: imageUrl || value.resolverType ? "image" : "page",
    capability: imageUrl || value.resolverType ? "snapshot" : "source",
    capabilityLabel: imageUrl || value.resolverType ? "Current Still" : "Source Page",
    previewUrl: imageUrl,
    imageUrl,
    refreshSeconds: Number(value.refreshSeconds || 60),
    requestHeaders: value.requestHeaders,
    fallbackViews,
    resolverType: value.resolverType || "",
    resolverUrl: value.resolverUrl || "",
    observedAt: value.observedAt || "",
  };
}

async function fetchTaiwanCameras({ fetchJson, sourceUrl, officialUrl }) {
  const root = new URL(sourceUrl);
  root.searchParams.set("$top", "500");
  root.searchParams.set("$select", "@iot.id,name,properties");
  root.searchParams.set(
    "$expand",
    "Locations($select=location),Datastreams($select=@iot.id,name,phenomenonTime;$expand=Observations($select=result,phenomenonTime;$orderby=phenomenonTime desc;$top=1))"
  );
  const cameras = [];
  let nextUrl = root.href;
  for (let page = 0; nextUrl && page < 12; page += 1) {
    const data = await fetchJson(nextUrl, { timeoutMs: 30000 });
    for (const thing of data.value || []) {
      const coordinates = thing.Locations?.[0]?.location?.coordinates || [];
      const lng = Number(coordinates[0]);
      const lat = Number(coordinates[1]);
      if (!validPosition(lat, lng)) continue;
      for (const stream of thing.Datastreams || []) {
        const observation = stream.Observations?.[0] || {};
        const imageUrl = safeUrl(observation.result);
        if (!imageUrl) continue;
        const city = cleanText(thing.properties?.city || thing.properties?.county || "Taiwan");
        const stationName = cleanText(thing.name || `CCTV ${thing["@iot.id"]}`);
        const viewName = cleanText(stream.name || "");
        cameras.push(cameraRecord({
          id: `tw-cctv-${slug(thing["@iot.id"])}-${slug(stream["@iot.id"])}`,
          name: viewName && viewName !== stationName ? `${stationName} - ${viewName}` : stationName,
          area: city,
          region: city,
          country: "Taiwan",
          sourceId: "taiwan-civil-iot-cctv",
          sourceName: "Taiwan Civil IoT CCTV",
          sourceUrl,
          officialUrl,
          sourcePageUrl: officialUrl,
          lat,
          lng,
          imageUrl,
          observedAt: observation.phenomenonTime || stream.phenomenonTime || "",
          refreshSeconds: 120,
          tags: ["taiwan", "civil-iot", thing.properties?.authority, city],
        }));
      }
    }
    const next = String(data["@iot.nextLink"] || "");
    nextUrl = next.replace(/^https?:\/\/sta\.ci\.taiwan\.gov\.tw/i, `${root.protocol}//${root.host}`);
  }
  return cameras;
}

async function fetchBayernCameras({ fetchJson, sourceUrl, imageBaseUrl, officialUrl }) {
  const data = await fetchJson(sourceUrl, { timeoutMs: 22000 });
  const rows = [];
  walkBayernGroups(data.groups || data, {}, rows);
  return rows.map(({ camera, context }) => {
    const lat = Number(camera.lat);
    const lng = Number(camera.lon ?? camera.lng);
    if (!validPosition(lat, lng)) return null;
    const route = cleanText(camera.route || context.route || "");
    const location = cleanText(camera.location || camera.title || context.title || "Bavaria traffic camera");
    const direction = cleanText(camera.direction || camera.angle || "");
    return cameraRecord({
      id: `bayern-${slug(camera.id || `${lat}-${lng}-${direction}`)}`,
      name: [route, location, direction].filter(Boolean).join(" - "),
      area: location,
      region: "Bavaria",
      country: "Germany",
      sourceId: "bayerninfo-webcams",
      sourceName: "BayernInfo Traffic Cameras",
      sourceUrl,
      officialUrl,
      sourcePageUrl: officialUrl,
      lat,
      lng,
      imageUrl: safeUrl(camera.url, imageBaseUrl),
      refreshSeconds: 60,
      tags: ["germany", "bavaria", "bayerninfo", route, direction],
    });
  }).filter((camera) => camera?.imageUrl);
}

async function fetchVancouverCameras({ fetchJson, sourceUrl, officialUrl }) {
  const cameras = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const url = new URL(sourceUrl);
    url.searchParams.set("limit", "100");
    url.searchParams.set("offset", String(offset));
    const data = await fetchJson(url.href, { timeoutMs: 16000 });
    for (const record of data.results || []) {
      const lat = Number(record.geo_point_2d?.lat);
      const lng = Number(record.geo_point_2d?.lon);
      const pageUrl = safeUrl(record.url);
      if (!validPosition(lat, lng) || !pageUrl) continue;
      cameras.push(cameraRecord({
        id: `vancouver-${slug(record.mapid || record.name || `${lat}-${lng}`)}`,
        name: record.name || "Vancouver traffic camera",
        area: record.geo_local_area || "Vancouver",
        region: "British Columbia",
        country: "Canada",
        sourceId: "vancouver-open-data-webcams",
        sourceName: "City of Vancouver Traffic Cameras",
        sourceUrl,
        officialUrl,
        sourcePageUrl: pageUrl,
        resolverType: "vancouver-page",
        resolverUrl: pageUrl,
        lat,
        lng,
        refreshSeconds: 60,
        tags: ["canada", "vancouver", "british-columbia", record.geo_local_area],
      }));
    }
    if (!data.next_url && offset + 100 >= Number(data.total_count || 0)) break;
  }
  return cameras;
}

function extractVancouverImageUrls(html, pageUrl) {
  const urls = [];
  const pattern = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  for (const match of String(html || "").matchAll(pattern)) {
    const url = safeUrl(match[1], pageUrl);
    if (url && /\/cameraimages\//i.test(new URL(url).pathname) && /\.(?:jpe?g|png)(?:$|\?)/i.test(url)) urls.push(url);
  }
  return [...new Set(urls)];
}

async function fetchScdotCameras({ fetchJson, sourceUrl, officialUrl }) {
  const data = await fetchJson(sourceUrl, { timeoutMs: 18000 });
  return (data.features || []).map((feature) => {
    const [lng, lat] = feature.geometry?.coordinates || [];
    const properties = feature.properties || {};
    if (!validPosition(Number(lat), Number(lng)) || properties.active === false) return null;
    const rawImage = safeUrl(properties.image_url, sourceUrl);
    const imageUrl = normalizeScdotImage(rawImage, properties.id);
    if (!imageUrl) return null;
    const location = cleanText(properties.description || properties.name || "South Carolina traffic camera");
    return cameraRecord({
      id: `scdot-${slug(properties.id || feature.id || `${lat}-${lng}`)}`,
      name: location,
      area: cleanText(properties.route || "South Carolina"),
      region: "South Carolina",
      country: "United States",
      sourceId: "scdot-511-cameras",
      sourceName: "511SC Traffic Cameras",
      sourceUrl,
      officialUrl,
      sourcePageUrl: officialUrl,
      lat,
      lng,
      imageUrl,
      requestHeaders: { Referer: "https://www.511sc.org/" },
      refreshSeconds: 60,
      tags: ["south-carolina", "scdot", "511sc", properties.route, properties.direction],
    });
  }).filter(Boolean);
}

async function fetchEstoniaCameras({ fetchJson, sourceUrl, imageBaseUrl, officialUrl }) {
  const data = await fetchJson(sourceUrl, { timeoutMs: 18000 });
  return (data.features || []).map((feature) => {
    const attributes = feature.attributes || feature.properties || {};
    const lat = Number(feature.geometry?.y ?? feature.geometry?.coordinates?.[1]);
    const lng = Number(feature.geometry?.x ?? feature.geometry?.coordinates?.[0]);
    const imageUrl = safeUrl(attributes.image_path, imageBaseUrl);
    if (!validPosition(lat, lng) || !imageUrl) return null;
    const name = cleanText(attributes.site_name || `Road camera ${attributes.weather_station_id || attributes.objectid}`);
    return cameraRecord({
      id: `estonia-${slug(attributes.objectid || attributes.weather_station_id || `${lat}-${lng}`)}`,
      name,
      area: name,
      region: "Estonia",
      country: "Estonia",
      sourceId: "estonia-road-cameras",
      sourceName: "Estonian Transport Administration Cameras",
      sourceUrl,
      officialUrl,
      sourcePageUrl: officialUrl,
      lat,
      lng,
      imageUrl,
      observedAt: attributes.image_time || "",
      refreshSeconds: 300,
      tags: ["estonia", "transpordiamet", "road-camera"],
    });
  }).filter(Boolean);
}

async function fetchIcelandCameras({ fetchJson, sourceUrl, officialUrl }) {
  const rows = await fetchJson(sourceUrl, { timeoutMs: 18000 });
  const stations = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const lat = Number(row.Breidd);
    const lng = Number(row.Lengd);
    const imageUrl = safeUrl(row.Slod);
    if (!validPosition(lat, lng) || !imageUrl) continue;
    const id = String(row.Maelist_nr || `${lat}-${lng}`);
    const values = stations.get(id) || [];
    values.push({ row, imageUrl, lat, lng });
    stations.set(id, values);
  }
  return [...stations.entries()].map(([id, views]) => {
    const primary = views[0];
    const road = cleanText(primary.row.Vegheiti || primary.row.NrVegur || "Iceland road");
    const description = cleanText(primary.row.Skyring || primary.row.Myndavel || "traffic camera");
    return cameraRecord({
      id: `iceland-${slug(id)}`,
      name: `${road} - ${description}`,
      area: road,
      region: "Iceland",
      country: "Iceland",
      sourceId: "iceland-road-cameras",
      sourceName: "Icelandic Road and Coastal Administration Cameras",
      sourceUrl,
      officialUrl,
      sourcePageUrl: officialUrl,
      lat: primary.lat,
      lng: primary.lng,
      imageUrl: primary.imageUrl,
      fallbackViews: views.slice(1).map((view) => ({
        type: "image",
        url: view.imageUrl,
        sourceName: "Icelandic Road and Coastal Administration Cameras",
        sourcePageUrl: officialUrl,
        refreshSeconds: 60,
      })),
      refreshSeconds: 60,
      tags: ["iceland", "road-camera", road],
    });
  });
}

async function fetchCastleRockCameras({ fetchJson, source }) {
  const endpoint = new URL("/List/GetData/Cameras", source.baseUrl).href;
  const cameras = [];
  const pageSize = 100;
  let total = Infinity;
  for (let start = 0; start < total && start < 5000; start += pageSize) {
    const data = await fetchJson(endpoint, {
      method: "POST",
      body: buildCameraListForm(start, pageSize),
      timeoutMs: 22000,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Origin: source.baseUrl,
        Referer: source.officialUrl,
      },
    });
    total = Number(data.recordsFiltered || data.recordsTotal || 0) || total;
    const rows = data.data || [];
    for (const record of rows) {
      if (record.visible === false) continue;
      const point = parseWellKnownPoint(record.latLng?.geography?.wellKnownText);
      if (!point) continue;
      const views = (record.images || []).filter((image) => !image.disabled && !image.blocked);
      const media = views.map((image) => safeUrl(image.imageUrl, source.baseUrl)).filter(Boolean);
      if (!media.length && record.id) media.push(new URL(`/map/Cctv/${encodeURIComponent(record.id)}`, source.baseUrl).href);
      if (!media.length) continue;
      const location = cleanText(record.location || record.roadway || `${source.region} traffic camera`);
      const area = cleanText(record.county || record.state || source.region);
      cameras.push(cameraRecord({
        id: `${source.id}-${slug(record.id || `${point.lat}-${point.lng}`)}`,
        name: [cleanText(record.roadway), location, cleanText(record.direction)].filter(Boolean).join(" - "),
        area,
        region: cleanText(record.state || source.region),
        country: source.country,
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: endpoint,
        officialUrl: source.officialUrl,
        sourcePageUrl: source.officialUrl,
        lat: point.lat,
        lng: point.lng,
        imageUrl: media[0],
        fallbackViews: media.slice(1).map((url) => ({
          type: "image",
          url,
          sourceName: source.name,
          sourcePageUrl: source.officialUrl,
          refreshSeconds: 60,
          requestHeaders: { Referer: source.officialUrl, Origin: source.baseUrl },
        })),
        requestHeaders: { Referer: source.officialUrl, Origin: source.baseUrl },
        refreshSeconds: 60,
        tags: [source.id, record.state, record.county, record.roadway, record.direction],
      }));
    }
    if (!rows.length || rows.length < pageSize) break;
  }
  return cameras;
}

function walkBayernGroups(value, context, rows) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkBayernGroups(item, context, rows);
    return;
  }
  const nextContext = {
    ...context,
    title: cleanText(value.title || value.name || context.title || ""),
    route: cleanText(value.route || context.route || ""),
  };
  for (const camera of value.webcams || []) rows.push({ camera, context: nextContext });
  for (const group of value.groups || value.children || []) walkBayernGroups(group, nextContext, rows);
}

function normalizeScdotImage(value, id) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/thumbs\/([^/]+?)\.flv\.png$/i);
    if (match) url.pathname = `/${match[1]}.png`;
    else if (id && /\/thumbs\//i.test(url.pathname)) url.pathname = `/${id}.png`;
    return url.href;
  } catch {
    return "";
  }
}

function buildCameraListForm(start, length) {
  const form = new URLSearchParams();
  form.set("draw", "1");
  form.set("start", String(start));
  form.set("length", String(length));
  form.set("search[value]", "");
  return form.toString();
}

function parseWellKnownPoint(value) {
  const match = String(value || "").match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  return validPosition(lat, lng) ? { lat, lng } : null;
}

function safeUrl(value, baseUrl) {
  try {
    const url = new URL(String(value || "").trim(), baseUrl);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function cleanText(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function slug(value) {
  return String(value || "camera").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "camera";
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function validPosition(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

module.exports = {
  extractVancouverImageUrls,
  fetchBayernCameras,
  fetchCastleRockCameras,
  fetchEstoniaCameras,
  fetchIcelandCameras,
  fetchScdotCameras,
  fetchTaiwanCameras,
  fetchVancouverCameras,
  normalizeScdotImage,
  parseWellKnownPoint,
};
