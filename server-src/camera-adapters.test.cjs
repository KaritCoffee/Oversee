const test = require("node:test");
const assert = require("node:assert/strict");
const {
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
} = require("./camera-adapters.js");

test("Bayern groups flatten into image cameras", async () => {
  const cameras = await fetchBayernCameras({
    fetchJson: async () => ({ groups: [{ title: "A 9", webcams: [{ id: 7, lat: 48.1, lon: 11.5, url: "bi/jpg/7.jpg", location: "Munich" }] }] }),
    sourceUrl: "https://map.example/list.json",
    imageBaseUrl: "https://map.example/cam/",
    officialUrl: "https://example.test/cameras",
  });
  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].country, "Germany");
  assert.equal(cameras[0].imageUrl, "https://map.example/cam/bi/jpg/7.jpg");
});

test("Bayern localized groups replace numeric location ordinals", async () => {
  const cameras = await fetchBayernCameras({
    fetchJson: async () => ({
      enabled: true,
      isValid: true,
      groups: [{
        title_en: "Roadways",
        groups: [{
          title_de: "B2",
          webcams: [{
            id: 1034,
            lat: 50.383289,
            lon: 11.885435,
            url: "bi/jpg/camera.jpg",
            route: "B2 Hof - Töpen",
            location: "1",
            direction: "Töpen",
          }],
        }],
      }],
    }),
    sourceUrl: "https://map.example/list.json",
    imageBaseUrl: "https://map.example/cam/",
    officialUrl: "https://example.test/cameras",
  });
  assert.equal(cameras[0].area, "B2");
  assert.equal(cameras[0].name, "B2 Hof - Töpen");
  assert.doesNotMatch(cameras[0].name, / - 1(?: - |$)/);
});

test("Iceland station views become ordered fallbacks", async () => {
  const cameras = await fetchIcelandCameras({
    fetchJson: async () => [
      { Maelist_nr: 10, Breidd: 64.1, Lengd: -21.9, Slod: "https://cam.test/one.jpg", Vegheiti: "Road 1" },
      { Maelist_nr: 10, Breidd: 64.1, Lengd: -21.9, Slod: "https://cam.test/two.jpg", Vegheiti: "Road 1" },
    ],
    sourceUrl: "https://api.test/cameras",
    officialUrl: "https://road.test/",
  });
  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].fallbackViews[0].url, "https://cam.test/two.jpg");
});

test("Taiwan SensorThings pages normalize legacy hosts and result objects", async () => {
  const urls = [];
  const pages = [
    {
      value: [{
        "@iot.id": 1,
        name: "Taipei camera",
        properties: { city: "Taipei" },
        Locations: [{ location: { type: "Feature", geometry: { type: "Point", coordinates: [121.56, 25.04] } } }],
        Datastreams: [{
          "@iot.id": 11,
          name: "North",
          Observations: [{ result: { imageUrl: "https://images.test/taipei.jpg" }, phenomenonTime: "2026-09-01T00:00:00Z" }],
        }],
      }],
      "@iot.nextLink": "https://sta.ci.taiwan.gov.tw/STA_CCTV/v1.0/Things?%24skip=1",
    },
    {
      value: [{
        "@iot.id": 2,
        name: "Kaohsiung camera",
        properties: { county: "Kaohsiung" },
        Locations: [{ location: { type: "Point", coordinates: [120.3, 22.63] } }],
        Datastreams: [{
          "@iot.id": 22,
          name: "South",
          Observations: [{ result: "https://images.test/kaohsiung.jpg" }],
        }],
      }],
    },
  ];
  const cameras = await fetchTaiwanCameras({
    fetchJson: async (url) => {
      urls.push(url);
      return pages.shift();
    },
    sourceUrl: "https://sta.colife.org.tw/STA_CCTV/v1.0/Things",
    officialUrl: "https://ci.taiwan.gov.tw/",
  });
  assert.equal(cameras.length, 2);
  assert.equal(cameras[0].imageUrl, "https://images.test/taipei.jpg");
  assert.equal(cameras[0].lat, 25.04);
  assert.match(urls[1], /^https:\/\/sta\.colife\.org\.tw\/STA_CCTV\/v1\.0\/Things\?/);
});

test("Taiwan SensorThings rejects foreign pagination URLs", async () => {
  await assert.rejects(() => fetchTaiwanCameras({
    fetchJson: async () => ({
      value: [{
        "@iot.id": 1,
        Locations: [{ location: { coordinates: [121.5, 25] } }],
        Datastreams: [{ "@iot.id": 2, Observations: [{ result: "https://images.test/one.jpg" }] }],
      }],
      "@iot.nextLink": "https://example.invalid/collect",
    }),
    sourceUrl: "https://sta.colife.org.tw/STA_CCTV/v1.0/Things",
    officialUrl: "https://ci.taiwan.gov.tw/",
  }), /unexpected pagination URL/);
});

test("Vancouver catalog paginates without next_url and accepts GeoJSON coordinates", async () => {
  const offsets = [];
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    mapid: `TCM${index}`,
    name: `Camera ${index}`,
    url: `https://trafficcams.vancouver.ca/camera-${index}.htm`,
    geo_point_2d: { lat: 49.2 + index / 10000, lon: -123.1 },
  }));
  const cameras = await fetchVancouverCameras({
    fetchJson: async (url) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      offsets.push(offset);
      if (offset === 0) return { total_count: 101, results: firstPage };
      return {
        total_count: 101,
        results: [{
          mapid: "TCM100",
          name: "Final camera",
          url: "https://trafficcams.vancouver.ca/final.htm",
          geom: { geometry: { type: "Point", coordinates: [-123.12, 49.28] } },
        }],
      };
    },
    sourceUrl: "https://opendata.vancouver.ca/api/records",
    officialUrl: "https://opendata.vancouver.ca/",
  });
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(cameras.length, 101);
  assert.equal(cameras.at(-1).lat, 49.28);
  assert.equal(cameras.at(-1).lng, -123.12);
});

test("Vancouver catalog rejects repeated pages instead of caching a partial list", async () => {
  const page = Array.from({ length: 100 }, (_, index) => ({
    mapid: `TCM${index}`,
    name: `Camera ${index}`,
    url: `https://trafficcams.vancouver.ca/camera-${index}.htm`,
    geo_point_2d: { lat: 49.2, lon: -123.1 },
  }));
  await assert.rejects(() => fetchVancouverCameras({
    fetchJson: async () => ({ total_count: 200, results: page }),
    sourceUrl: "https://opendata.vancouver.ca/api/records",
    officialUrl: "https://opendata.vancouver.ca/",
  }), /repeated a page/);
});

test("Vancouver page parser keeps only camera images", () => {
  const urls = extractVancouverImageUrls(
    '<img src="/logo.png"><img src="cameraimages/main.jpg"><img src="https://trafficcams.vancouver.ca/cameraimages/north.jpg">',
    "https://trafficcams.vancouver.ca/grandview4.htm"
  );
  assert.deepEqual(urls, [
    "https://trafficcams.vancouver.ca/cameraimages/main.jpg",
    "https://trafficcams.vancouver.ca/cameraimages/north.jpg",
  ]);
});

test("SCDOT thumbnails normalize to current image endpoints", () => {
  assert.equal(
    normalizeScdotImage("https://sc.example/thumbs/123.flv.png", "123"),
    "https://sc.example/123.png"
  );
});

test("SCDOT cameras expose public HLS with a still and alternate stream fallback", async () => {
  const cameras = await fetchScdotCameras({
    fetchJson: async () => ({
      features: [{
        geometry: { coordinates: [-80.997286, 33.948503] },
        properties: {
          id: "2735",
          description: "I-77 S @ MM 4.9",
          route: "I-77",
          active: true,
          problem_stream: false,
          image_url: "https://snap.test/thumbs/10002.flv.png",
          https_url: "https://video.test/10002/playlist.m3u8",
          ios_url: "https://video.test/10002/playlist_sfm4s.m3u8",
        },
      }],
    }),
    sourceUrl: "https://sc.example/cameras.geojson",
    officialUrl: "https://www.511sc.org/",
  });
  assert.equal(cameras[0].viewerType, "hls");
  assert.equal(cameras[0].capability, "stream");
  assert.equal(cameras[0].streamUrl, "https://video.test/10002/playlist.m3u8");
  assert.equal(cameras[0].imageUrl, "https://snap.test/10002.png");
  assert.deepEqual(cameras[0].fallbackViews.map((view) => view.url), [
    "https://video.test/10002/playlist_sfm4s.m3u8",
  ]);
});

test("SCDOT problem streams remain available as snapshots only", async () => {
  const cameras = await fetchScdotCameras({
    fetchJson: async () => ({
      features: [{
        geometry: { coordinates: [-81, 34] },
        properties: {
          id: "1",
          active: "true",
          problem_stream: "true",
          image_url: "https://snap.test/thumbs/1.flv.png",
          https_url: "https://video.test/1/playlist.m3u8",
        },
      }],
    }),
    sourceUrl: "https://sc.example/cameras.geojson",
    officialUrl: "https://www.511sc.org/",
  });
  assert.equal(cameras[0].viewerType, "image");
  assert.equal(cameras[0].streamUrl, "");
  assert.equal(cameras[0].imageUrl, "https://snap.test/1.png");
});

test("Estonia ArcGIS catalog follows transfer-limit pages using returned row counts", async () => {
  const offsets = [];
  const cameras = await fetchEstoniaCameras({
    fetchJson: async (url) => {
      const offset = Number(new URL(url).searchParams.get("resultOffset"));
      offsets.push(offset);
      if (offset === 0) {
        return {
          exceededTransferLimit: true,
          features: [
            { attributes: { objectid: 1, site_name: "One", image_path: "1.jpg" }, geometry: { x: 24.7, y: 59.4 } },
            { attributes: { objectid: 2, site_name: "Two", image_path: "2.jpg" }, geometry: { x: 25.1, y: 58.9 } },
          ],
        };
      }
      return {
        exceededTransferLimit: false,
        features: [{
          attributes: { objectid: 3, site_name: "Three", image_path: "3.jpg" },
          geometry: { type: "Point", coordinates: [26.1, 58.4] },
        }],
      };
    },
    sourceUrl: "https://transport.test/MapServer/0/query?where=1%3D1",
    imageBaseUrl: "https://transport.test/images/",
    officialUrl: "https://transport.test/",
  });
  assert.deepEqual(offsets, [0, 2]);
  assert.equal(cameras.length, 3);
  assert.equal(cameras[2].lat, 58.4);
  assert.equal(cameras[2].imageUrl, "https://transport.test/images/3.jpg");
});

test("Estonia ArcGIS errors reject instead of replacing stale data with empty results", async () => {
  await assert.rejects(() => fetchEstoniaCameras({
    fetchJson: async () => ({ error: { message: "Service unavailable" } }),
    sourceUrl: "https://transport.test/MapServer/0/query",
    imageBaseUrl: "https://transport.test/images/",
    officialUrl: "https://transport.test/",
  }), /Service unavailable/);
});

test("Castle Rock point parser reads longitude before latitude", () => {
  assert.deepEqual(parseWellKnownPoint("POINT (-73.99 40.71)"), { lat: 40.71, lng: -73.99 });
  assert.deepEqual(parseWellKnownPoint("SRID=4326;POINT Z (-149.9 61.2 35)"), { lat: 61.2, lng: -149.9 });
  assert.equal(parseWellKnownPoint("POINT (0 0)"), null);
});

test("Castle Rock catalogs retry one transient upstream failure", async () => {
  let calls = 0;
  const cameras = await fetchCastleRockCameras({
    retryDelayMs: 0,
    source: {
      id: "test511",
      name: "Test 511",
      baseUrl: "https://511.test",
      officialUrl: "https://511.test/list/cameras",
      region: "Test Region",
      country: "Test Country",
    },
    fetchJson: async () => {
      calls += 1;
      if (calls === 1) throw new Error("511.test returned 500");
      return {
        recordsFiltered: 1,
        data: [{
          id: 7,
          location: "Main Street",
          roadway: "Route 1",
          latLng: { geography: { wellKnownText: "POINT (-73.99 40.71)" } },
          images: [{ id: 9, imageUrl: "https://images.511.test/9.jpg" }],
        }],
      };
    },
  });
  assert.equal(calls, 2);
  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].imageUrl, "https://images.511.test/9.jpg");
});

test("Castle Rock catalogs expose no-auth HLS and retain still fallbacks", async () => {
  const cameras = await fetchCastleRockCameras({
    retryDelayMs: 0,
    source: {
      id: "test511",
      name: "Test 511",
      baseUrl: "https://511.test",
      officialUrl: "https://511.test/list/cameras",
      region: "Test Region",
      country: "Test Country",
    },
    fetchJson: async () => ({
      recordsFiltered: 1,
      data: [{
        id: 7,
        location: "Main Street",
        roadway: "Route 1",
        latLng: { geography: { wellKnownText: "POINT (-73.99 40.71)" } },
        images: [
          {
            imageUrl: "/map/Cctv/9",
            videoUrl: "https://video.511.test/live/9/playlist.m3u8",
            videoDisabled: false,
            isVideoAuthRequired: false,
          },
          {
            imageUrl: "/map/Cctv/10",
            videoUrl: "https://video.511.test/live/10/playlist.m3u8",
          },
          {
            imageUrl: "/map/Cctv/11",
            videoUrl: "https://video.511.test/live/11/playlist.m3u8",
            isVideoAuthRequired: true,
          },
        ],
      }],
    }),
  });
  assert.equal(cameras[0].viewerType, "hls");
  assert.equal(cameras[0].streamUrl, "https://video.511.test/live/9/playlist.m3u8");
  assert.equal(cameras[0].imageUrl, "https://511.test/map/Cctv/9");
  assert.deepEqual(cameras[0].fallbackViews.map((view) => [view.type, view.url]), [
    ["hls", "https://video.511.test/live/10/playlist.m3u8"],
    ["image", "https://511.test/map/Cctv/10"],
    ["image", "https://511.test/map/Cctv/11"],
  ]);
});

test("Castle Rock catalogs keep 100-row requests and advance by rows actually returned", async () => {
  const starts = [];
  const lengths = [];
  const makeRecord = (id) => ({
    id,
    location: `Camera ${id}`,
    latLng: { geography: { wellKnownText: `POINT (-111.${id} 40.${id})` } },
    images: [{ imageUrl: `/map/Cctv/${id}` }],
  });
  const cameras = await fetchCastleRockCameras({
    retryDelayMs: 0,
    source: {
      id: "ut511",
      name: "Utah test catalog",
      baseUrl: "https://utah.test",
      officialUrl: "https://utah.test/list/cameras",
      region: "Utah",
      country: "United States",
    },
    fetchJson: async (_url, options) => {
      const form = new URLSearchParams(options.body);
      const start = Number(form.get("start"));
      starts.push(start);
      lengths.push(Number(form.get("length")));
      return start === 0
        ? { recordsFiltered: 3, data: [makeRecord(1), makeRecord(2)] }
        : { recordsFiltered: 3, data: [makeRecord(3)] };
    },
  });
  assert.deepEqual(starts, [0, 2]);
  assert.deepEqual(lengths, [100, 100]);
  assert.equal(cameras.length, 3);
});

test("Castle Rock catalogs do not retry permanent schema or authorization failures", async () => {
  let calls = 0;
  await assert.rejects(() => fetchCastleRockCameras({
    retryDelayMs: 0,
    source: {
      id: "test511",
      name: "Test 511",
      baseUrl: "https://511.test",
      officialUrl: "https://511.test/list/cameras",
      region: "Test",
      country: "Test",
    },
    fetchJson: async () => {
      calls += 1;
      throw new Error("511.test returned 401");
    },
  }), /returned 401/);
  assert.equal(calls, 1);
});
