// Offline tests for the doctor's page classification and orchestration.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { classifyPage, runDoctor } from "../src/doctor.mjs";

const AKAMAI_PAGE =
  "<html><head><title>Access Denied</title></head><body>Access Denied. " +
  "You don't have permission to access this server. Reference #18.abcdef.123</body></html>";

test("classifyPage: Akamai denial page is 'blocked', never a zero-result search", () => {
  assert.equal(classifyPage(AKAMAI_PAGE), "blocked");
});

test("classifyPage: the recorded real PLP fixture is 'ok'", () => {
  const html = readFileSync(new URL("./fixtures/plp-snippet.html", import.meta.url), "utf8");
  assert.equal(classifyPage(html), "ok");
});

test("classifyPage: an ordinary page without the SSR cache is 'no_cache'", () => {
  assert.equal(classifyPage("<html><body>Hello</body></html>"), "no_cache");
  assert.equal(classifyPage(""), "no_cache");
});

test("runDoctor: ok verdict carries the probed URL", async () => {
  const html = readFileSync(new URL("./fixtures/plp-snippet.html", import.meta.url), "utf8");
  const verdict = await runDoctor(async () => html);
  assert.equal(verdict.status, "ok");
  assert.match(verdict.url, /tesco\.ie/);
});

test("runDoctor: blocked verdict explains the environment is refused", async () => {
  const verdict = await runDoctor(async () => AKAMAI_PAGE);
  assert.equal(verdict.status, "blocked");
  assert.match(verdict.summary, /Akamai/);
});

test("runDoctor: a throwing fetcher becomes fetch_error, not a crash", async () => {
  const verdict = await runDoctor(async () => {
    throw new Error("net::ERR_NAME_NOT_RESOLVED");
  });
  assert.equal(verdict.status, "fetch_error");
  assert.match(verdict.error, /ERR_NAME_NOT_RESOLVED/);
});
