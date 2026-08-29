import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const cargoToml = readText("src-tauri/Cargo.toml");
const cargoLock = readText("src-tauri/Cargo.lock");
const server = readText("server.js");

const versions = new Map([
  ["package.json", packageJson.version],
  ["package-lock.json", packageLock.version],
  ["package-lock root package", packageLock.packages?.[""]?.version],
  ["Tauri config", tauriConfig.version],
  ["Cargo.toml", sectionVersion(cargoToml, "package")],
  ["Cargo.lock", lockedPackageVersion(cargoLock, "oversee")],
  ["server.js", server.match(/const APP_VERSION = "([^"]+)";/)?.[1]],
]);

const expected = packageJson.version;
const mismatches = [...versions].filter(([, version]) => version !== expected);
if (!/^\d+\.\d+\.\d+$/.test(expected) || mismatches.length) {
  for (const [source, version] of versions) console.error(`${source}: ${version || "missing"}`);
  throw new Error(`Oversee version metadata must match package.json (${expected})`);
}

console.log(`Oversee version metadata is synchronized at ${expected}.`);

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function sectionVersion(toml, section) {
  const match = toml.match(new RegExp(`\\[${section}\\]([\\s\\S]*?)(?:\\n\\[|$)`));
  return match?.[1]?.match(/\bversion\s*=\s*"([^"]+)"/)?.[1];
}

function lockedPackageVersion(lock, name) {
  const packages = lock.split(/\r?\n\[\[package\]\]\r?\n/);
  const block = packages.find((value) => value.match(new RegExp(`^name = "${name}"$`, "m")));
  return block?.match(/^version = "([^"]+)"$/m)?.[1];
}
