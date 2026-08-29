import assert from "node:assert/strict";
import test from "node:test";
import { SOURCE_PHASES, classifySource, summarizeSourceHealth } from "./source-health.js";

test("source health distinguishes empty, fresh cache, delayed, stale, and failed sources", () => {
  assert.equal(classifySource({ ok: true, count: 0 }), SOURCE_PHASES.EMPTY);
  assert.equal(classifySource({ ok: true, count: 2, cached: true }), SOURCE_PHASES.LIVE);
  assert.equal(classifySource({ ok: true, count: 2, delayed: true }), SOURCE_PHASES.DELAYED);
  assert.equal(classifySource({ ok: true, count: 2, stale: true }), SOURCE_PHASES.STALE);
  assert.equal(classifySource({ ok: false }), SOURCE_PHASES.ERROR);
  assert.equal(classifySource({ ok: false, optional: true }), SOURCE_PHASES.UNAVAILABLE);
});

test("optional failures do not make the core status partial", () => {
  const summary = summarizeSourceHealth([
    { name: "core", ok: true, count: 10 },
    { name: "optional", ok: false, optional: true },
  ]);
  assert.equal(summary.label, "Core Data Online");
  assert.equal(summary.responding, 1);
  assert.equal(summary.optionalResponding, 0);
});

test("unconfigured optional sources are disabled rather than responding", () => {
  const summary = summarizeSourceHealth([
    { name: "core", ok: true, count: 4 },
    { name: "optional", ok: true, configured: false, optional: true, count: 0 },
  ]);
  assert.equal(summary.label, "Core Data Online");
  assert.equal(summary.optionalResponding, 0);
  assert.equal(summary.disabled, 1);
});
