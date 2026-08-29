const dns = require("node:dns");
const net = require("node:net");

class RemoteMediaPolicy {
  constructor({ cacheTtlMs = 10 * 60 * 1000 } = {}) {
    this.allowedHosts = new Set();
    this.cache = new Map();
    this.cacheTtlMs = cacheTtlMs;
  }

  remember(value) {
    const url = parseRemoteMediaUrl(value);
    if (url) this.allowedHosts.add(url.hostname.toLowerCase());
    return Boolean(url);
  }

  async authorize(value, lookup = dns.promises.lookup) {
    const url = parseRemoteMediaUrl(value);
    if (!url) throw new Error("Missing or unsupported image URL");
    const hostname = url.hostname.toLowerCase();
    if (!this.allowedHosts.has(hostname)) throw new Error("Image host is not part of a loaded public source");

    const literalFamily = net.isIP(hostname);
    if (literalFamily) {
      if (!isPublicIpAddress(hostname)) throw new Error("Private or reserved image address blocked");
      return url;
    }

    const cached = this.cache.get(hostname);
    if (cached && Date.now() - cached.checkedAt < this.cacheTtlMs) {
      if (!cached.allowed) throw new Error("Private or reserved image address blocked");
      return url;
    }

    const records = await lookup(hostname, { all: true, verbatim: true });
    const addresses = (Array.isArray(records) ? records : [records]).map((record) => record?.address).filter(Boolean);
    const allowed = addresses.length > 0 && addresses.every(isPublicIpAddress);
    this.cache.set(hostname, { allowed, checkedAt: Date.now() });
    if (!allowed) throw new Error("Private or reserved image address blocked");
    return url;
  }
}

function parseRemoteMediaUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    if (url.port && url.port !== "80" && url.port !== "443") return null;
    return url;
  } catch {
    return null;
  }
}

function isPublicIpAddress(value) {
  const address = String(value || "").toLowerCase();
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 0 || b === 168)) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (family === 6) {
    if (address === "::" || address === "::1") return false;
    if (/^f[cd]/.test(address) || /^fe[89ab]/.test(address)) return false;
    if (address.startsWith("::ffff:")) return isPublicIpAddress(address.slice(7));
    return true;
  }
  return false;
}

module.exports = { RemoteMediaPolicy, isPublicIpAddress, parseRemoteMediaUrl };
