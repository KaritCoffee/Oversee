import test from "node:test";
import assert from "node:assert/strict";
import { aircraftModelDataUri } from "./aircraft-models.js";

test("builds reusable embedded glTF aircraft models", () => {
  for (const kind of ["jet", "turboprop", "helicopter", "light"]) {
    const uri = aircraftModelDataUri(kind);
    assert.match(uri, /^data:model\/gltf\+json;base64,/);
    assert.ok(uri.length > 1000);
    assert.equal(uri, aircraftModelDataUri(kind));
  }
});

test("falls back to the light aircraft model", () => {
  assert.equal(aircraftModelDataUri("unknown"), aircraftModelDataUri("light"));
});
