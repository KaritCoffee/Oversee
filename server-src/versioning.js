function parseVersion(value) {
  const match = String(value || "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i);
  return match ? match.slice(1, 4).map(Number) : null;
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function buildUpdateStatus(currentVersion, release = {}) {
  const latestVersion = String(release.tag_name || release.name || "").replace(/^v/i, "");
  const releaseUrl = /^https:\/\/github\.com\/KaritCoffee\/Oversee\/releases\//i.test(String(release.html_url || ""))
    ? String(release.html_url)
    : "https://github.com/KaritCoffee/Oversee/releases";
  return {
    ok: Boolean(parseVersion(latestVersion)),
    currentVersion,
    latestVersion: parseVersion(latestVersion) ? latestVersion : "",
    updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
    releaseUrl,
    publishedAt: release.published_at || "",
    prerelease: Boolean(release.prerelease),
  };
}

module.exports = { buildUpdateStatus, compareVersions, parseVersion };
