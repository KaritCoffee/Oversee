const test = require("node:test");
const assert = require("node:assert/strict");
const {
  compareSemanticVersions,
  parseGitHubLatestReleaseResponse,
  parseSemanticVersion,
} = require("./release-update.js");

test("parses strict semantic versions and normalizes an optional tag prefix", () => {
  assert.deepEqual(parseSemanticVersion(" v3.4.0-beta.2+desktop.7 "), {
    normalized: "3.4.0-beta.2+desktop.7",
    major: "3",
    minor: "4",
    patch: "0",
    prerelease: ["beta", "2"],
    build: ["desktop", "7"],
  });
  assert.equal(parseSemanticVersion("3.04.0"), null);
  assert.equal(parseSemanticVersion("3.4"), null);
  assert.equal(parseSemanticVersion("3.4.0-01"), null);
  assert.equal(parseSemanticVersion("3.4.0<script>"), null);
  assert.equal(parseSemanticVersion(3.4), null);
});

test("compares semantic version precedence including prereleases", () => {
  const ordered = [
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
  ];

  for (let index = 1; index < ordered.length; index += 1) {
    assert.equal(compareSemanticVersions(ordered[index - 1], ordered[index]), -1);
    assert.equal(compareSemanticVersions(ordered[index], ordered[index - 1]), 1);
  }
  assert.equal(compareSemanticVersions("1.0.0+build.1", "1.0.0+build.99"), 0);
  assert.equal(compareSemanticVersions("not-a-version", "1.0.0"), null);
});

test("compares oversized numeric components without Number precision loss", () => {
  assert.equal(
    compareSemanticVersions("90071992547409931234567890.0.0", "90071992547409931234567889.999.999"),
    1,
  );
});

test("returns a bounded update-available result from a GitHub latest release", () => {
  const result = parseGitHubLatestReleaseResponse(
    {
      tag_name: "v3.5.0",
      name: "<img src=x onerror=alert(1)>",
      body: "Untrusted markdown is deliberately omitted.",
      html_url: "https://example.invalid/phishing",
      published_at: "2026-08-31T12:34:56Z",
      draft: false,
      prerelease: false,
    },
    { currentVersion: "3.4.0" },
  );

  assert.deepEqual(result, {
    ok: true,
    status: "update-available",
    reason: null,
    currentVersion: "3.4.0",
    latestVersion: "3.5.0",
    updateAvailable: true,
    releaseUrl: "https://github.com/KaritCoffee/Oversee/releases/tag/v3.5.0",
    publishedAt: "2026-08-31T12:34:56.000Z",
    prerelease: false,
    message: "Oversee 3.5.0 is available.",
  });
  assert.equal(JSON.stringify(result).includes("Untrusted"), false);
  assert.equal(JSON.stringify(result).includes("example.invalid"), false);
  assert.equal(Object.isFrozen(result), true);
});

test("reports current and development builds without offering a downgrade", () => {
  const release = { tag_name: "v3.4.0", draft: false, prerelease: false };
  const current = parseGitHubLatestReleaseResponse(release, { currentVersion: "3.4.0+local.2" });
  assert.equal(current.status, "up-to-date");
  assert.equal(current.updateAvailable, false);

  const ahead = parseGitHubLatestReleaseResponse(release, { currentVersion: "3.5.0-dev.1" });
  assert.equal(ahead.status, "development-build");
  assert.equal(ahead.updateAvailable, false);
});

test("ignores draft and prerelease responses unless prereleases are explicitly allowed", () => {
  const draft = parseGitHubLatestReleaseResponse(
    { tag_name: "v4.0.0", draft: true, prerelease: false },
    { currentVersion: "3.4.0" },
  );
  assert.equal(draft.status, "unavailable");
  assert.equal(draft.reason, "draft-release");

  const prerelease = { tag_name: "v3.5.0-rc.1", draft: false, prerelease: true };
  const ignored = parseGitHubLatestReleaseResponse(prerelease, { currentVersion: "3.4.0" });
  assert.equal(ignored.reason, "prerelease-release");

  const included = parseGitHubLatestReleaseResponse(prerelease, {
    currentVersion: "3.4.0",
    includePrerelease: true,
  });
  assert.equal(included.status, "update-available");
  assert.equal(included.prerelease, true);
});

test("returns fixed safe failures for malformed API responses", () => {
  const rateLimit = parseGitHubLatestReleaseResponse(
    { message: "API rate limit exceeded <script>alert(1)</script>" },
    { currentVersion: "3.4.0" },
  );
  assert.equal(rateLimit.ok, false);
  assert.equal(rateLimit.reason, "invalid-release-version");
  assert.equal(rateLimit.message, "Update information is unavailable right now.");
  assert.equal(JSON.stringify(rateLimit).includes("rate limit"), false);

  const invalidCurrent = parseGitHubLatestReleaseResponse(
    { tag_name: "v3.5.0" },
    { currentVersion: "unknown" },
  );
  assert.equal(invalidCurrent.reason, "invalid-current-version");
  assert.equal(invalidCurrent.currentVersion, null);

  const malformedBoolean = parseGitHubLatestReleaseResponse(
    { tag_name: "v3.5.0", draft: "false" },
    { currentVersion: "3.4.0" },
  );
  assert.equal(malformedBoolean.reason, "invalid-response");

  const missingOptions = parseGitHubLatestReleaseResponse({ tag_name: "v3.5.0" }, null);
  assert.equal(missingOptions.reason, "invalid-current-version");
  assert.equal(
    parseGitHubLatestReleaseResponse(
      { tag_name: "v3.5.0", published_at: "2026-02-31T12:00:00Z" },
      { currentVersion: "3.4.0" },
    ).publishedAt,
    null,
  );
});

test("constructs release links only for validated repositories and tags", () => {
  const custom = parseGitHubLatestReleaseResponse(
    { tag_name: "3.5.0+desktop.1", draft: false, prerelease: false },
    { currentVersion: "3.4.0", repository: "Example-Org/Oversee.desktop" },
  );
  assert.equal(
    custom.releaseUrl,
    "https://github.com/Example-Org/Oversee.desktop/releases/tag/3.5.0%2Bdesktop.1",
  );

  const invalidRepository = parseGitHubLatestReleaseResponse(
    { tag_name: "v3.5.0" },
    { currentVersion: "3.4.0", repository: "example.com/owner/repo" },
  );
  assert.equal(invalidRepository.reason, "invalid-repository");
  assert.equal(invalidRepository.releaseUrl, "https://github.com/KaritCoffee/Oversee/releases");
});
