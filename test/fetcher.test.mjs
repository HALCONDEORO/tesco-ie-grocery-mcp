import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_INTERVAL_MS } from "../src/fetcher.mjs";

// The README and MCP description promise conservative pacing; guard the knob.
test("pacing interval is conservative (>= 1s)", () => {
  assert.ok(MIN_INTERVAL_MS >= 1000);
});
