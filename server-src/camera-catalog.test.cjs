const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyCoveragePriority,
  canonicalCameraMediaUrl,
  deduplicateCameras,
} = require("./camera-catalog.js");

test("canonical media URLs remove only volatile cache parameters", () => {
  assert.equal(
    canonicalCameraMediaUrl("https://example.com/cam.jpg?id=7&timestamp=123&t=4"),
    "https://example.com/cam.jpg?id=7"
  );
});

test("deduplication merges nearby copies and keeps alternate media as fallback", () => {
  const result = deduplicateCameras([
    {
      id: "one",
      dynamic: true,
      name: "I-5 traffic camera",
      sourceName: "Agency A",
      lat: 45,
      lng: -122,
      viewerType: "image",
      capability: "snapshot",
      imageUrl: "https://a.example/cam.jpg?t=1",
    },
    {
      id: "two",
      dynamic: true,
      name: "I-5 CCTV",
      sourceName: "Agency B",
      lat: 45.0001,
      lng: -122.0001,
      viewerType: "hls",
      capability: "stream",
      streamUrl: "https://b.example/live.m3u8",
      imageUrl: "https://a.example/cam.jpg?t=2",
    },
  ]);
  assert.equal(result.cameras.length, 1);
  assert.equal(result.stats.merged, 1);
  assert.equal(result.cameras[0].capability, "stream");
  assert.ok(result.cameras[0].fallbackViews.some((view) => view.type === "image"));
  assert.deepEqual(result.cameras[0].alternateSources.sort(), ["Agency A", "Agency B"]);
});

test("shared placeholder media does not merge distant cameras", () => {
  const result = deduplicateCameras([
    { id: "one", name: "North", sourceName: "Agency", lat: 10, lng: 10, viewerType: "image", imageUrl: "https://example.com/offline.jpg" },
    { id: "two", name: "South", sourceName: "Agency", lat: 30, lng: 30, viewerType: "image", imageUrl: "https://example.com/offline.jpg" },
  ]);
  assert.equal(result.cameras.length, 2);
});

test("coverage priority favors cameras in sparse cells", () => {
  const dense = Array.from({ length: 12 }, (_, id) => ({ id: `dense-${id}`, lat: 40, lng: -75, catalogScore: 50, country: "US", sourceId: "dense" }));
  const [sparse] = applyCoveragePriority([{ id: "sparse", lat: -30, lng: 130, catalogScore: 50, country: "AU", sourceId: "sparse" }]);
  const balancedDense = applyCoveragePriority(dense);
  assert.ok(sparse.coveragePriority > balancedDense[0].coveragePriority);
});
