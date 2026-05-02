const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const resourceDir = path.join(repoRoot, "src-tauri", "resources");
const nodeTarget = path.join(resourceDir, process.platform === "win32" ? "node.exe" : "node");
const localConfig = path.join(repoRoot, "config.local.json");
const resourceConfig = path.join(resourceDir, "config.local.json");

fs.mkdirSync(resourceDir, { recursive: true });
fs.copyFileSync(process.execPath, nodeTarget);

if (process.platform !== "win32") {
  fs.chmodSync(nodeTarget, 0o755);
}

if (process.env.NASA_FIRMS_MAP_KEY || process.env.FIRMS_MAP_KEY) {
  const nasaFirmsMapKey = process.env.NASA_FIRMS_MAP_KEY || process.env.FIRMS_MAP_KEY;
  fs.writeFileSync(resourceConfig, `${JSON.stringify({ nasaFirmsMapKey }, null, 2)}\n`);
  console.log(`Prepared local config from environment at ${resourceConfig}`);
} else if (fs.existsSync(localConfig)) {
  fs.copyFileSync(localConfig, resourceConfig);
  console.log(`Prepared local config at ${resourceConfig}`);
}

console.log(`Prepared bundled Node runtime at ${nodeTarget}`);
