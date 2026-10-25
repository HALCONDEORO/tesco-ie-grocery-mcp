// Offline tests for the session/profile layer. No browser, no network:
// the browser launcher and the clock are injected.
import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_PROFILE_DIR,
  isLoginUrl,
  login,
  parseHeaded,
  resolveSessionConfig,
} from "../src/session.mjs";

test("resolveSessionConfig: explicit option wins over env and default", () => {
  const cfg = resolveSessionConfig(
    { profileDir: "/tmp/explicit" },
    { TESCO_IE_PROFILE: "/tmp/from-env" }
  );
  assert.equal(cfg.profileDir, "/tmp/explicit");
});

test("resolveSessionConfig: env wins over default", () => {
  const cfg = resolveSessionConfig({}, { TESCO_IE_PROFILE: "/tmp/from-env" });
  assert.equal(cfg.profileDir, "/tmp/from-env");
});

test("resolveSessionConfig: default is per-user under the home directory", () => {
  const cfg = resolveSessionConfig({}, {});
  assert.equal(cfg.profileDir, DEFAULT_PROFILE_DIR);
  assert.ok(cfg.profileDir.startsWith(os.homedir()));
  assert.ok(cfg.profileDir.endsWith(path.join("profile")));
});

test("parseHeaded: only explicit 1/true opens a visible browser", () => {
  assert.equal(parseHeaded("1"), true);
  assert.equal(parseHeaded("true"), true);
  assert.equal(parseHeaded("0"), false);
  assert.equal(parseHeaded("false"), false);
  assert.equal(parseHeaded(undefined), false);
  assert.equal(parseHeaded(""), false);
});

test("resolveSessionConfig: headed option wins over env", () => {
  assert.equal(resolveSessionConfig({ headed: true }, { TESCO_IE_HEADED: "0" }).headed, true);
  assert.equal(resolveSessionConfig({}, { TESCO_IE_HEADED: "1" }).headed, true);
  assert.equal(resolveSessionConfig({}, {}).headed, false);
});

test("isLoginUrl: detects tesco.ie sign-in URLs", () => {
  assert.equal(isLoginUrl("https://www.tesco.ie/account/login"), true);
  assert.equal(isLoginUrl("https://www.tesco.ie/account/login?redirect=/account"), true);
  assert.equal(isLoginUrl("https://secure.tesco.ie/account/sign-in"), true);
  assert.equal(isLoginUrl("https://www.tesco.ie/account"), false);
  assert.equal(isLoginUrl("https://www.tesco.ie/shop/en-IE/search?query=milk"), false);
  assert.equal(isLoginUrl("not a url"), false);
});

function fakeContext({ accountFinalUrl }) {
  const page = {
    async goto(url) {
      this.url = url === "https://www.tesco.ie/account" ? accountFinalUrl : url;
      return { url: () => this.url };
    },
    url() {
      return this.url;
    },
    async close() {},
    locator() {
      return { first: () => ({ async count() { return 0; } }) };
    },
  };
  return {
    pages: () => [],
    async newPage() {
      return { ...page, url: page.url, goto: page.goto, close: page.close, locator: page.locator };
    },
    async close() {},
  };
}

test("login: reports signed_in when the account page does not redirect to login", async () => {
  const result = await login({
    headed: true,
    sleep: async () => {},
    launchContext: async () => fakeContext({ accountFinalUrl: "https://www.tesco.ie/account" }),
  });
  assert.equal(result.status, "signed_in");
});

test("login: reports timeout when the account page keeps redirecting to login", async () => {
  const result = await login({
    headed: true,
    timeoutMs: 1,
    sleep: async () => {},
    launchContext: async () =>
      fakeContext({ accountFinalUrl: "https://www.tesco.ie/account/login?redirect=/account" }),
  });
  assert.equal(result.status, "timeout");
});

test("login: a page load failure during verification is not treated as signed in", async () => {
  let navigations = 0;
  const failing = {
    pages: () => [],
    async newPage() {
      return {
        async goto() {
          navigations += 1;
          // The initial navigation succeeds; verification loads fail.
          if (navigations > 1) throw new Error("net::ERR_CONNECTION_REFUSED");
          return { url: () => "https://www.tesco.ie/account/login" };
        },
        async close() {},
      };
    },
    async close() {},
  };
  const result = await login({
    headed: true,
    timeoutMs: 1,
    sleep: async () => {},
    launchContext: async () => failing,
  });
  assert.equal(result.status, "timeout");
});
