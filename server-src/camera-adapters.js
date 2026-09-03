function cameraRecord(value = {}) {
  const name = cleanText(value.name || "Public traffic camera");
  const imageUrl = safeUrl(value.imageUrl, value.baseUrl);
  const streamUrl = safeUrl(value.streamUrl, value.baseUrl);
  const viewerType = streamUrl
    ? (value.viewerType === "video" ? "video" : "hls")
    : (imageUrl || value.resolverType ? "image" : "page");
  const fallbackViews = (value.fallbackViews || [])
    .map((view) => ({
      type: view.type || "image",
      url: safeUrl(view.url, view.baseUrl || value.baseUrl),
      sourceName: view.sourceName || value.sourceName,
      sourcePageUrl: view.sourcePageUrl || value.sourcePageUrl,
      refreshSeconds: Number(view.refreshSeconds || value.refreshSeconds || 60),
      requestHeaders: view.requestHeaders || value.requestHeaders,
    }))
    .filter((view) => view.url && view.url !== imageUrl && view.url !== streamUrl);
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
    media: streamUrl ? "video" : imageUrl ? "still" : "source",
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
    viewerType,
    capability: streamUrl ? "stream" : imageUrl || value.resolverType ? "snapshot" : "source",
    capabilityLabel: streamUrl ? "Live Stream" : imageUrl || value.resolverType ? "Current Still" : "Source Page",
    previewUrl: imageUrl,
    imageUrl,
    streamUrl,
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
  let nextAfterLimit = "";
  for (let page = 0; nextUrl && page < 12; page += 1) {
    const data = await fetchJson(nextUrl, { timeoutMs: 30000 });
    const things = requireCatalogArray(data?.value, "Taiwan Civil IoT CCTV", page === 0);
    for (const thing of things) {
      const coordinates = locationCoordinates(thing.Locations?.[0]?.location);
      const lng = Number(coordinates[0]);
      const lat = Number(coordinates[1]);
      if (!validPosition(lat, lng)) continue;
      for (const stream of arrayOrEmpty(thing.Datastreams)) {
        const observation = stream.Observations?.[0] || {};
        const imageUrl = safeUrl(observationResultUrl(observation.result));
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
    nextUrl = normalizeSensorThingsNextUrl(next, root);
    nextAfterLimit = nextUrl;
  }
  if (nextAfterLimit) throw new Error("Taiwan Civil IoT CCTV exceeded the 6,000-record pagination safety limit");
  if (!cameras.length) throw new Error("Taiwan Civil IoT CCTV returned no usable camera observations");
  return cameras;
}

async function fetchBayernCameras({ fetchJson, sourceUrl, imageBaseUrl, officialUrl }) {
  const data = await fetchJson(sourceUrl, { timeoutMs: 22000 });
  if (data?.isValid === false || data?.enabled === false) {
    throw new Error(`BayernInfo camera catalog is unavailable${data?.message ? `: ${cleanText(data.message)}` : ""}`);
  }
  const groups = Array.isArray(data) ? data : requireCatalogArray(data?.groups, "BayernInfo", true);
  const rows = [];
  walkBayernGroups(groups, {}, rows);
  if (!rows.length) throw new Error("BayernInfo returned no webcam records");
  const cameras = rows.map(({ camera, context }) => {
    const lat = Number(camera.lat);
    const lng = Number(camera.lon ?? camera.lng);
    if (!validPosition(lat, lng)) return null;
    const route = cleanText(camera.route || context.route || "");
    const rawLocation = cleanText(camera.location || camera.title || "");
    const location = isOrdinalLabel(rawLocation) ? "" : rawLocation;
    const area = location || cleanText(context.title || route || "Bavaria");
    const direction = cleanText(camera.direction || camera.angle || "");
    const name = meaningfulParts([route, location || context.title, direction]).join(" - ") || "Bavaria traffic camera";
    return cameraRecord({
      id: `bayern-${slug(camera.id || `${lat}-${lng}-${direction}`)}`,
      name,
      area,
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
      tags: ["germany", "bavaria", "bayerninfo", route, area, direction],
    });
  }).filter((camera) => camera?.imageUrl);
  if (!cameras.length) throw new Error("BayernInfo returned no usable camera records");
  return cameras;
}

async function fetchVancouverCameras({ fetchJson, sourceUrl, officialUrl }) {
  const cameras = [];
  const seenRecords = new Set();
  const seenPages = new Set();
  const pageSize = 100;
  const maxRecords = 1000;
  for (let offset = 0; offset < maxRecords; offset += pageSize) {
    const url = new URL(sourceUrl);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    const data = await fetchJson(url.href, { timeoutMs: 16000 });
    const records = requireCatalogArray(data?.results, "City of Vancouver camera catalog", offset === 0);
    if (!records.length) break;
    const pageKey = pageFingerprint(records, (record) => record.mapid || record.url || record.name);
    if (seenPages.has(pageKey)) throw new Error("City of Vancouver camera pagination repeated a page");
    seenPages.add(pageKey);
    for (const record of records) {
      const position = vancouverPosition(record);
      const lat = Number(position?.lat);
      const lng = Number(position?.lng);
      const pageUrl = safeUrl(record.url);
      if (!validPosition(lat, lng) || !pageUrl) continue;
      const recordKey = String(record.mapid || pageUrl);
      if (seenRecords.has(recordKey)) continue;
      seenRecords.add(recordKey);
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
    const totalCount = finiteNonNegativeNumber(data.total_count);
    if (totalCount !== null && totalCount > maxRecords) {
      throw new Error(`City of Vancouver camera catalog exceeds the ${maxRecords}-record safety limit`);
    }
    if (totalCount !== null && offset + records.length >= totalCount) break;
    if (records.length < pageSize) {
      if (totalCount !== null && offset + records.length < totalCount) {
        throw new Error("City of Vancouver camera catalog ended before its advertised total");
      }
      break;
    }
  }
  if (!cameras.length) throw new Error("City of Vancouver camera catalog returned no usable records");
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
  const features = requireCatalogArray(data?.features, "511SC camera catalog", true);
  const cameras = features.map((feature) => {
    const [lng, lat] = feature.geometry?.coordinates || [];
    const properties = feature.properties || {};
    if (!validPosition(Number(lat), Number(lng)) || isFalseLike(properties.active)) return null;
    const rawImage = safeUrl(properties.image_url, sourceUrl);
    const imageUrl = normalizeScdotImage(rawImage, properties.id);
    const streamUrls = isTrueLike(properties.problem_stream)
      ? []
      : uniqueStrings([properties.https_url, properties.ios_url].map((url) => publicHlsUrl(url)));
    if (!imageUrl && !streamUrls.length) return null;
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
      streamUrl: streamUrls[0],
      viewerType: "hls",
      fallbackViews: streamUrls.slice(1).map((url) => ({
        type: "hls",
        url,
        sourceName: "511SC Traffic Cameras",
        sourcePageUrl: officialUrl,
        requestHeaders: { Referer: "https://www.511sc.org/" },
      })),
      requestHeaders: { Referer: "https://www.511sc.org/" },
      refreshSeconds: 60,
      tags: ["south-carolina", "scdot", "511sc", properties.route, properties.direction],
    });
  }).filter(Boolean);
  if (!cameras.length) throw new Error("511SC camera catalog returned no usable records");
  return cameras;
}

async function fetchEstoniaCameras({ fetchJson, sourceUrl, imageBaseUrl, officialUrl }) {
  const features = [];
  const seenPages = new Set();
  const pageSize = 500;
  const maxRecords = 5000;
  let hasMore = false;
  let offset = 0;
  while (offset < maxRecords) {
    const url = new URL(sourceUrl);
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("resultRecordCount", String(pageSize));
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("f", "json");
    const data = await fetchJson(url.href, { timeoutMs: 18000 });
    if (data?.error) throw new Error(`Estonian Transport Administration camera query failed: ${cleanText(data.error.message || data.error.details?.[0] || "ArcGIS error")}`);
    const page = requireCatalogArray(data?.features, "Estonian Transport Administration camera catalog", offset === 0);
    if (!page.length) break;
    const pageKey = pageFingerprint(page, (feature) => feature.attributes?.objectid ?? feature.attributes?.weather_station_id);
    if (seenPages.has(pageKey)) throw new Error("Estonian Transport Administration camera pagination repeated a page");
    seenPages.add(pageKey);
    features.push(...page);
    hasMore = data.exceededTransferLimit === true || page.length === pageSize;
    if (!hasMore) break;
    offset += page.length;
  }
  if (hasMore && features.length >= maxRecords) {
    throw new Error(`Estonian Transport Administration camera catalog exceeds the ${maxRecords}-record safety limit`);
  }
  const cameras = features.map((feature) => {
    const attributes = feature.attributes || feature.properties || {};
    const position = arcgisPoint(feature, attributes);
    const lat = Number(position?.lat);
    const lng = Number(position?.lng);
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
  if (!cameras.length) throw new Error("Estonian Transport Administration camera catalog returned no usable records");
  return cameras;
}

async function fetchIcelandCameras({ fetchJson, sourceUrl, officialUrl }) {
  const rows = requireCatalogArray(await fetchJson(sourceUrl, { timeoutMs: 18000 }), "Icelandic road camera catalog", true);
  const stations = new Map();
  for (const row of rows) {
    const lat = Number(row.Breidd);
    const lng = Number(row.Lengd);
    const imageUrl = safeUrl(row.Slod);
    if (!validPosition(lat, lng) || !imageUrl) continue;
    const id = String(row.Maelist_nr || `${lat}-${lng}`);
    const values = stations.get(id) || [];
    if (!values.some((view) => view.imageUrl === imageUrl)) values.push({ row, imageUrl, lat, lng });
    stations.set(id, values);
  }
  const cameras = [...stations.entries()].map(([id, views]) => {
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
  if (!cameras.length) throw new Error("Icelandic road camera catalog returned no usable records");
  return cameras;
}

async function fetchCastleRockCameras({ fetchJson, source, retryDelayMs = 250 }) {
  const endpoint = new URL("/List/GetData/Cameras", source.baseUrl).href;
  const origin = new URL(source.baseUrl).origin;
  const cameras = [];
  const seenPages = new Set();
  const seenRecords = new Set();
  const pageSize = 100;
  const maxRecords = 5000;
  let total = null;
  let start = 0;
  while (start < maxRecords && (total === null || start < total)) {
    const data = await fetchJsonWithTransientRetry(fetchJson, endpoint, {
      method: "POST",
      body: buildCameraListForm(start, pageSize),
      timeoutMs: 22000,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Origin: origin,
        Referer: source.officialUrl,
      },
    }, retryDelayMs);
    const advertisedTotal = finiteNonNegativeNumber(data?.recordsFiltered ?? data?.recordsTotal);
    if (advertisedTotal !== null) total = advertisedTotal;
    if (total !== null && total > maxRecords) {
      throw new Error(`${source.name} exceeds the ${maxRecords}-record pagination safety limit`);
    }
    const rows = requireCatalogArray(data?.data, source.name, start === 0);
    if (!rows.length) {
      if (total !== null && start < total) throw new Error(`${source.name} ended before its advertised total`);
      break;
    }
    const pageKey = pageFingerprint(rows, (record) => record.id ?? record.DT_RowId ?? record.sourceId);
    if (seenPages.has(pageKey)) throw new Error(`${source.name} pagination repeated a page`);
    seenPages.add(pageKey);
    for (const record of rows) {
      if (isFalseLike(record.visible)) continue;
      const point = parseWellKnownPoint(record.latLng?.geography?.wellKnownText);
      if (!point) continue;
      const recordKey = String(record.id ?? record.DT_RowId ?? `${point.lat}-${point.lng}-${record.location || ""}`);
      if (seenRecords.has(recordKey)) continue;
      seenRecords.add(recordKey);
      const views = arrayOrEmpty(record.images).filter((image) => !isTrueLike(image.disabled) && !isTrueLike(image.blocked));
      const imageUrls = uniqueStrings(views.map((image) => safeUrl(image.imageUrl, source.baseUrl)));
      const streamUrls = uniqueStrings(views
        .filter((image) => !isTrueLike(image.videoDisabled) && !isTrueLike(image.isVideoAuthRequired))
        .map((image) => publicHlsUrl(image.videoUrl, source.baseUrl)));
      if (!imageUrls.length && !streamUrls.length) continue;
      const location = cleanText(record.location || record.roadway || `${source.region} traffic camera`);
      const area = cleanText(record.county || record.state || source.region);
      cameras.push(cameraRecord({
        id: `${source.id}-${slug(record.id || `${point.lat}-${point.lng}`)}`,
        name: meaningfulParts([record.roadway, location, record.direction]).join(" - "),
        area,
        region: cleanText(record.state || source.region),
        country: cleanText(record.country || source.country),
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: endpoint,
        officialUrl: source.officialUrl,
        sourcePageUrl: source.officialUrl,
        lat: point.lat,
        lng: point.lng,
        imageUrl: imageUrls[0],
        streamUrl: streamUrls[0],
        viewerType: "hls",
        fallbackViews: [
          ...streamUrls.slice(1).map((url) => ({ type: "hls", url })),
          ...imageUrls.slice(1).map((url) => ({ type: "image", url })),
        ].map((view) => ({
          ...view,
          sourceName: source.name,
          sourcePageUrl: source.officialUrl,
          refreshSeconds: 60,
          requestHeaders: { Referer: source.officialUrl, Origin: origin },
        })),
        requestHeaders: { Referer: source.officialUrl, Origin: origin },
        refreshSeconds: 60,
        tags: [source.id, record.state, record.county, record.roadway, record.direction],
      }));
    }
    start += rows.length;
    if (total !== null && start >= total) break;
    if (rows.length < pageSize && total === null) break;
  }
  if ((total === null || start < total) && start >= maxRecords) {
    throw new Error(`${source.name} exceeded the ${maxRecords}-record pagination safety limit`);
  }
  if (!cameras.length) throw new Error(`${source.name} returned no usable camera records`);
  return cameras;
}

async function fetchJsonWithTransientRetry(fetchJson, url, options, retryDelayMs) {
  try {
    return await fetchJson(url, options);
  } catch (error) {
    if (!isTransientFetchError(error)) throw error;
    if (retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    return fetchJson(url, options);
  }
}

function isTransientFetchError(error) {
  return /(?:returned\s+(?:408|425|429|5\d\d)|fetch failed|timed?\s*out|aborted|socket|ECONNRESET|ENOTFOUND|EAI_AGAIN)/i
    .test(String(error?.message || error));
}

function walkBayernGroups(value, context, rows) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkBayernGroups(item, context, rows);
    return;
  }
  const nextContext = {
    ...context,
    title: cleanText(value.title_en || value.title_de || value.title || value.name || context.title || ""),
    route: cleanText(value.route || context.route || ""),
  };
  for (const camera of arrayOrEmpty(value.webcams)) rows.push({ camera, context: nextContext });
  for (const group of arrayOrEmpty(value.groups || value.children)) walkBayernGroups(group, nextContext, rows);
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
  const match = String(value || "").match(/POINT(?:\s+(?:ZM|Z|M))?\s*\(\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s+(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?:\s+-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)?(?:\s+-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)?\s*\)/i);
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  return validPosition(lat, lng) ? { lat, lng } : null;
}

function requireCatalogArray(value, sourceName, requireItems = false) {
  if (!Array.isArray(value)) throw new Error(`${sourceName} returned an invalid catalog schema`);
  if (requireItems && !value.length) throw new Error(`${sourceName} returned an empty catalog`);
  return value;
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function locationCoordinates(location) {
  const geometry = location?.type === "Feature" ? location.geometry : location;
  return Array.isArray(geometry?.coordinates) ? geometry.coordinates : [];
}

function observationResultUrl(result) {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  return result.url || result.imageUrl || result.href || "";
}

function normalizeSensorThingsNextUrl(value, root) {
  const text = String(value || "").trim();
  if (!text) return "";
  let next;
  try {
    next = new URL(text, root);
  } catch {
    throw new Error("Taiwan Civil IoT CCTV returned an invalid pagination URL");
  }
  const allowedHosts = new Set([root.host.toLowerCase(), "sta.ci.taiwan.gov.tw", "sta.colife.org.tw"]);
  if (!/^https?:$/.test(next.protocol) || !allowedHosts.has(next.host.toLowerCase()) || next.pathname !== root.pathname) {
    throw new Error("Taiwan Civil IoT CCTV returned an unexpected pagination URL");
  }
  next.protocol = root.protocol;
  next.host = root.host;
  return next.href;
}

function vancouverPosition(record) {
  const point = record?.geo_point_2d;
  if (point && typeof point === "object") return { lat: point.lat, lng: point.lon ?? point.lng };
  const coordinates = record?.geom?.geometry?.coordinates || record?.geometry?.coordinates;
  return Array.isArray(coordinates) ? { lat: coordinates[1], lng: coordinates[0] } : null;
}

function arcgisPoint(feature, attributes = {}) {
  const coordinates = feature?.geometry?.coordinates;
  const lat = feature?.geometry?.y ?? coordinates?.[1] ?? attributes.latitude ?? attributes.Latitude ?? attributes.lat;
  const lng = feature?.geometry?.x ?? coordinates?.[0] ?? attributes.longitude ?? attributes.Longitude ?? attributes.lng ?? attributes.lon;
  return validPosition(Number(lat), Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : null;
}

function finiteNonNegativeNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function pageFingerprint(records, keyFor) {
  return `${records.length}:${records.map((record) => {
    const key = keyFor(record);
    return key === null || key === undefined || key === "" ? JSON.stringify(record).slice(0, 160) : String(key);
  }).join("|")}`;
}

function meaningfulParts(values) {
  const parts = [];
  for (const value of values) {
    const part = cleanText(value);
    if (!part) continue;
    const key = part.toLowerCase();
    if (parts.some((existing) => {
      const existingKey = existing.toLowerCase();
      const existingTokens = existingKey.split(/[^a-z0-9]+/).filter(Boolean);
      return existingKey === key || existingTokens.includes(key) || (key.length >= 3 && existingKey.includes(key));
    })) continue;
    parts.push(part);
  }
  return parts;
}

function isOrdinalLabel(value) {
  return /^\d+[a-z]?$/i.test(cleanText(value));
}

function isFalseLike(value) {
  return value === false || value === 0 || /^(?:false|0|no)$/i.test(String(value || "").trim());
}

function isTrueLike(value) {
  return value === true || value === 1 || /^(?:true|1|yes)$/i.test(String(value || "").trim());
}

function publicHlsUrl(value, baseUrl) {
  const url = safeUrl(value, baseUrl);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && /\.m3u8$/i.test(parsed.pathname) ? parsed.href : "";
  } catch {
    return "";
  }
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
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180
    && !(Math.abs(lat) <= 1e-7 && Math.abs(lng) <= 1e-7);
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
