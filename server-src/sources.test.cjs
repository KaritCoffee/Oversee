const assert = require("node:assert/strict");
const test = require("node:test");

const { buildLaunchLibraryUrl, normalizeLaunch } = require("./launch-library.js");
const { normalizeRadioStation } = require("./radio-browser.js");
const { normalizeAisEnvelope } = require("./ais-collector.js");
const { satnogsRecordToGp, tleEpochToIso } = require("./satellite-fallback.js");
const { parseCensusPopulationCsv } = require("./census-population.js");
const { RemoteMediaPolicy, isPublicIpAddress } = require("./remote-media-policy.js");

test("Launch Library records retain verified launch-site coordinates", () => {
  const launch = normalizeLaunch({
    id: "abc",
    name: "Test Mission",
    net: "2026-08-28T12:00:00Z",
    status: { name: "Go" },
    pad: { name: "Pad 1", latitude: "28.5", longitude: "-80.6", location: { name: "Cape" } },
    rocket: { configuration: { full_name: "Falcon 9" } },
  });
  assert.equal(launch.id, "launch-abc");
  assert.equal(launch.lat, 28.5);
  assert.equal(launch.rocket, "Falcon 9");
});

test("Launch Library query is bounded to the configured rolling window", () => {
  const url = new URL(buildLaunchLibraryUrl(new Date("2026-08-28T00:00:00Z"), 500));
  assert.equal(url.searchParams.get("limit"), "100");
  assert.equal(url.searchParams.get("net__gte"), "2026-08-21T00:00:00.000Z");
  assert.equal(url.searchParams.get("net__lte"), "2026-09-27T00:00:00.000Z");
});

test("Radio Browser normalization rejects insecure and ungeolocated streams", () => {
  assert.equal(normalizeRadioStation({ stationuuid: "x", geo_lat: 1, geo_long: 2, url_resolved: "http://radio.test" }), null);
  assert.equal(normalizeRadioStation({ stationuuid: "x", url_resolved: "https://radio.test" }), null);
  assert.equal(normalizeRadioStation({ stationuuid: "x", geo_lat: 1, geo_long: 2, url_resolved: "https://radio.test" }).id, "radio-x");
});

test("AIS normalization combines position reports with static vessel metadata", () => {
  const staticData = new Map([["123", { name: "TEST SHIP", type: "Cargo" }]]);
  const vessel = normalizeAisEnvelope({
    MessageType: "PositionReport",
    MetaData: { MMSI: 123, latitude: 10, longitude: 20, time_utc: "2026-08-28T12:00:00Z" },
    Message: { PositionReport: { Sog: 12.4, Cog: 91, TrueHeading: 90 } },
  }, staticData);
  assert.equal(vessel.name, "TEST SHIP");
  assert.equal(vessel.speedKnots, 12.4);
  assert.equal(vessel.heading, 90);
});

test("SatNOGS TLE records normalize into the GP-compatible contract", () => {
  const record = satnogsRecordToGp({
    tle0: "0 ISS (ZARYA)",
    tle1: "1 25544U 98067A   24120.50000000  .00016717  00000-0  30116-3 0  9998",
    tle2: "2 25544  51.6400  90.0000 0005000  10.0000 350.0000 15.50000000450000",
    norad_cat_id: 25544,
  });
  assert.equal(record.OBJECT_NAME, "ISS (ZARYA)");
  assert.equal(record.NORAD_CAT_ID, "25544");
  assert.equal(record.DATA_SOURCE, "SatNOGS DB");
  assert.equal(tleEpochToIso("24120.50000000"), "2024-04-29T12:00:00.000Z");
});

test("Census population CSV selects the newest estimate and handles quoted names", () => {
  const rows = parseCensusPopulationCsv(
    'SUMLEV,STATE,NAME,POPESTIMATE2024,POPESTIMATE2025\n040,06,"California, State",39000000,39100000\n010,00,United States,340000000,341000000\n',
    { "06": { code: "CA", lat: 37, lng: -119 } },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "California, State");
  assert.equal(rows[0].population, 39100000);
  assert.equal(rows[0].vintage, "2025");
});

test("remote media policy blocks unknown and private targets", async () => {
  const policy = new RemoteMediaPolicy();
  policy.remember("https://images.example.test/camera.jpg");
  await assert.rejects(() => policy.authorize("https://other.example.test/image.jpg"), /not part/);
  await assert.rejects(
    () => policy.authorize("https://images.example.test/camera.jpg", async () => [{ address: "127.0.0.1", family: 4 }]),
    /Private or reserved/,
  );
  const publicPolicy = new RemoteMediaPolicy();
  publicPolicy.remember("https://images.example.test/camera.jpg");
  const allowed = await publicPolicy.authorize(
    "https://images.example.test/camera.jpg",
    async () => [{ address: "8.8.8.8", family: 4 }],
  );
  assert.equal(allowed.hostname, "images.example.test");
  assert.equal(isPublicIpAddress("10.0.0.2"), false);
  assert.equal(isPublicIpAddress("8.8.8.8"), true);
});
