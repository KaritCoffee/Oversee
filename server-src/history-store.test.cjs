const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { HistoryStore, compactSnapshot } = require("./history-store.js");

test("compacts and persists bounded snapshot history", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "oversee-history-"));
  const filePath = path.join(directory, "history.json");
  const store = new HistoryStore({ filePath, maxSamples: 24, minIntervalMs: 10_000 });
  const snapshot = {
    generatedAt: "2026-08-29T10:00:00Z",
    scope: "world",
    metrics: { alerts: 2 },
    flights: [{ id: "f1", lat: 1.234567, lng: 2.345678, callsign: "TEST" }],
    alerts: [{ id: "a1", lat: 3, lng: 4, event: "Flood" }],
  };
  assert.equal(store.append(snapshot), true);
  assert.equal(store.append({ ...snapshot, generatedAt: "2026-08-29T10:00:05Z" }), false);
  const restored = new HistoryStore({ filePath, maxSamples: 24 });
  assert.equal(restored.query({ scope: "world" }).length, 1);
  assert.equal(restored.query()[0].moving.flights[0].lat, 1.2346);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("compactSnapshot keeps only bounded movement samples", () => {
  const snapshot = compactSnapshot({
    generatedAt: "2026-08-29T10:00:00Z",
    flights: Array.from({ length: 220 }, (_, index) => ({ id: `f${index}`, lat: index / 10, lng: index / 10 })),
  });
  assert.equal(snapshot.moving.flights.length, 180);
});
