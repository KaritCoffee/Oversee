import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [bundleRoot = "src-tauri/target/release/bundle", label = process.platform] = process.argv.slice(2);
const root = path.resolve(bundleRoot);
const packageVersion = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")).version;
const installers = walk(root).filter((file) => /\.(?:exe|dmg)$/i.test(file) && path.basename(file).includes(packageVersion));
if (!installers.length) throw new Error(`No ${packageVersion} installer files found under ${root}`);

const rows = installers.sort().map((file) => {
  const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  return `${hash}  ${path.relative(root, file).replaceAll("\\", "/")}`;
});
const output = path.join(root, `SHA256SUMS-${label}.txt`);
fs.writeFileSync(output, `${rows.join("\n")}\n`, "utf8");
console.log(`Wrote ${rows.length} installer checksum(s) to ${output}`);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
