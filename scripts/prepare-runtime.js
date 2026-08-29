const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const resourceDir = path.join(repoRoot, "src-tauri", "resources");
const nodeTarget = path.join(resourceDir, process.platform === "win32" ? "node.exe" : "node");
const resourceConfig = path.join(resourceDir, "config.local.json");

fs.mkdirSync(resourceDir, { recursive: true });
fs.copyFileSync(process.execPath, nodeTarget);

if (process.platform !== "win32") {
  fs.chmodSync(nodeTarget, 0o755);
}

// Distributable builds must never inherit credentials from the developer machine.
if (fs.existsSync(resourceConfig)) fs.rmSync(resourceConfig);

console.log(`Prepared bundled Node runtime at ${nodeTarget}`);
