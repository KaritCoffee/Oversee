const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractVancouverImageUrls,
  fetchBayernCameras,
  fetchIcelandCameras,
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

test("Castle Rock point parser reads longitude before latitude", () => {
  assert.deepEqual(parseWellKnownPoint("POINT (-73.99 40.71)"), { lat: 40.71, lng: -73.99 });
});
