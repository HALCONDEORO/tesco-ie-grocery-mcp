import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_INTERVAL_MS, browserLaunchFailure } from "../src/fetcher.mjs";

// The README and MCP description promise conservative pacing; guard the knob.
test("pacing interval is conservative (>= 1s)", () => {
  assert.ok(MIN_INTERVAL_MS >= 1000);
});

test("missing browser gives an install command without installing or retrying", () => {
  const error = browserLaunchFailure(new Error("Executable doesn't exist at /synthetic/chromium"));
  assert.equal(error.status, "fetch_error");
  assert.match(error.message, /npx playwright install chromium/);
  assert.match(error.message, /No Tesco request/);
  const other = new Error("synthetic unrelated launch failure");
  assert.equal(browserLaunchFailure(other), other);
});
