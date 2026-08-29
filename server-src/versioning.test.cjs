const test = require("node:test");
const assert = require("node:assert/strict");
const { buildUpdateStatus, compareVersions, parseVersion } = require("./versioning.js");

test("parses and compares release versions", () => {
  assert.deepEqual(parseVersion("v3.2.1"), [3, 2, 1]);
  assert.equal(compareVersions("3.2.0", "3.1.9"), 1);
  assert.equal(compareVersions("3.1.0", "3.1.0"), 0);
});

test("builds a safe GitHub update result", () => {
  const status = buildUpdateStatus("3.1.0", {
    tag_name: "v3.2.0",
    html_url: "https://github.com/KaritCoffee/Oversee/releases/tag/v3.2.0",
    published_at: "2026-01-01T00:00:00Z",
  });
  assert.equal(status.updateAvailable, true);
  assert.equal(status.latestVersion, "3.2.0");
});
