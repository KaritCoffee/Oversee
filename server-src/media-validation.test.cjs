const test = require("node:test");
const assert = require("node:assert/strict");
const { detectImageContentType, normalizeImageContentType } = require("./media-validation.js");

test("detects JPEG bytes when an upstream uses a generic content type", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  assert.equal(detectImageContentType(jpeg), "image/jpeg");
  assert.equal(normalizeImageContentType("application/octet-stream", jpeg), "image/jpeg");
});

test("rejects a markup error page mislabeled as an image", () => {
  assert.equal(normalizeImageContentType("image/jpeg", Buffer.from("<html>error</html>")), "");
});

test("preserves a declared image type when its signature is not recognized", () => {
  assert.equal(normalizeImageContentType("image/heic; charset=binary", Buffer.from([1, 2, 3, 4])), "image/heic");
});
