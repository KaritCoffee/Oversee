"use strict";

const DEFAULT_REPOSITORY = "KaritCoffee/Oversee";
const MAX_VERSION_LENGTH = 256;
const VERSION_PATTERN = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const REPOSITORY_PART_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9])?$/;

function parseSemanticVersion(value) {
  if (typeof value !== "string") return null;
  const source = value.trim();
  if (!source || source.length > MAX_VERSION_LENGTH) return null;

  const match = source.match(VERSION_PATTERN);
  if (!match) return null;

  const prerelease = match[4] ? match[4].split(".") : [];
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))) return null;

  const build = match[5] ? match[5].split(".") : [];
  const [major, minor, patch] = match.slice(1, 4);
  const normalized = `${major}.${minor}.${patch}${prerelease.length ? `-${prerelease.join(".")}` : ""}${
    build.length ? `+${build.join(".")}` : ""
  }`;

  return Object.freeze({
    normalized,
    major,
    minor,
    patch,
    prerelease: Object.freeze(prerelease),
    build: Object.freeze(build),
  });
}

function compareSemanticVersions(left, right) {
  const a = parseSemanticVersion(left);
  const b = parseSemanticVersion(right);
  if (!a || !b) return null;

  for (const key of ["major", "minor", "patch"]) {
    const result = compareNumericIdentifiers(a[key], b[key]);
    if (result !== 0) return result;
  }

  return comparePrerelease(a.prerelease, b.prerelease);
}

function parseGitHubLatestReleaseResponse(payload, options = {}) {
  const settings = isRecord(options) ? options : {};
  const repository = normalizeRepository(settings.repository || DEFAULT_REPOSITORY);
  const current = parseSemanticVersion(settings.currentVersion);
  if (!repository) return unavailableResult(current, DEFAULT_REPOSITORY, "invalid-repository");
  if (!current) return unavailableResult(null, repository, "invalid-current-version");
  if (!isRecord(payload)) return unavailableResult(current, repository, "invalid-response");

  if (hasOwn(payload, "draft") && typeof payload.draft !== "boolean") {
    return unavailableResult(current, repository, "invalid-response");
  }
  if (hasOwn(payload, "prerelease") && typeof payload.prerelease !== "boolean") {
    return unavailableResult(current, repository, "invalid-response");
  }
  if (payload.draft) return unavailableResult(current, repository, "draft-release");
  if (payload.prerelease && settings.includePrerelease !== true) {
    return unavailableResult(current, repository, "prerelease-release");
  }

  const tagName = boundedString(payload.tag_name, MAX_VERSION_LENGTH);
  const latest = parseSemanticVersion(tagName);
  if (!latest) return unavailableResult(current, repository, "invalid-release-version");

  const precedence = compareSemanticVersions(latest.normalized, current.normalized);
  const status = precedence > 0 ? "update-available" : precedence < 0 ? "development-build" : "up-to-date";
  const message =
    status === "update-available"
      ? `Oversee ${latest.normalized} is available.`
      : status === "development-build"
        ? "This Oversee build is newer than the latest published release."
        : "Oversee is up to date.";

  return Object.freeze({
    ok: true,
    status,
    reason: null,
    currentVersion: current.normalized,
    latestVersion: latest.normalized,
    updateAvailable: status === "update-available",
    releaseUrl: releaseTagUrl(repository, tagName),
    publishedAt: normalizePublishedAt(payload.published_at),
    prerelease: payload.prerelease === true,
    message,
  });
}

function compareNumericIdentifiers(left, right) {
  if (left.length !== right.length) return left.length > right.length ? 1 : -1;
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function comparePrerelease(left, right) {
  if (!left.length && !right.length) return 0;
  if (!left.length) return 1;
  if (!right.length) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (index >= left.length) return -1;
    if (index >= right.length) return 1;

    const a = left[index];
    const b = right[index];
    if (a === b) continue;

    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return compareNumericIdentifiers(a, b);
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a > b ? 1 : -1;
  }

  return 0;
}

function unavailableResult(current, repository, reason) {
  return Object.freeze({
    ok: false,
    status: "unavailable",
    reason,
    currentVersion: current?.normalized || null,
    latestVersion: null,
    updateAvailable: false,
    releaseUrl: releasesUrl(repository),
    publishedAt: null,
    prerelease: false,
    message: "Update information is unavailable right now.",
  });
}

function normalizeRepository(value) {
  if (typeof value !== "string" || value.length > 200) return "";
  const parts = value.split("/");
  if (parts.length !== 2 || parts.some((part) => !REPOSITORY_PART_PATTERN.test(part))) return "";
  return parts.join("/");
}

function normalizePublishedAt(value) {
  const source = boundedString(value, 32);
  if (!source || !ISO_TIMESTAMP_PATTERN.test(source)) return null;
  const timestamp = Date.parse(source);
  if (!Number.isFinite(timestamp)) return null;
  const [dateAndTime, fraction = ""] = source.slice(0, -1).split(".");
  const expected = `${dateAndTime}.${fraction.padEnd(3, "0")}Z`;
  const normalized = new Date(timestamp).toISOString();
  return normalized === expected ? normalized : null;
}

function releaseTagUrl(repository, tagName) {
  return `${releasesUrl(repository)}/tag/${encodeURIComponent(tagName)}`;
}

function releasesUrl(repository) {
  const [owner, name] = repository.split("/");
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases`;
}

function boundedString(value, maximumLength) {
  return typeof value === "string" && value.length <= maximumLength ? value.trim() : "";
}

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

module.exports = {
  compareSemanticVersions,
  parseGitHubLatestReleaseResponse,
  parseSemanticVersion,
};
