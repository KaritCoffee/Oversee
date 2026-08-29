import assert from "node:assert/strict";
import test from "node:test";
import { planPointSync } from "./cesium-point-layer.js";

test("point collection reconciliation preserves stable IDs", () => {
  const plan = planPointSync(["a", "b"], [{ id: "b" }, { id: "c" }, { id: "c" }]);
  assert.deepEqual(plan.add, ["c"]);
  assert.deepEqual(plan.keep, ["b"]);
  assert.deepEqual(plan.remove, ["a"]);
});
