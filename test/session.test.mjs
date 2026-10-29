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
  verifySignedIn,
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
      this.currentUrl = url === "https://www.tesco.ie/account" ? accountFinalUrl : url;
      return { url: () => this.currentUrl, status: () => 200 };
    },
    getByRole() { return {first:()=>({async isVisible() {return true;}})}; },
    url() {
      return this.currentUrl;
    },
    async close() {},
    locator() {
      return { first: () => ({ async count() { return 0; } }), async innerText() { return "My account"; } };
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

test("login: reports signed_in only with positive account evidence", async () => {
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
          return { url: () => "https://www.tesco.ie/account/login", status:()=>200 };
        },
        locator:()=>({async innerText(){return "Account";}}),
        url: () => "https://www.tesco.ie/account",
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

test("verification fails closed on error, foreign origin, missing signal and denial",async()=>{
  for (const [url,status,text,count,expected] of [
    ["https://evil.invalid/account",200,"My account",1,false],
    ["https://www.tesco.ie/error",200,"My account",1,false],
    ["https://www.tesco.ie/account",500,"Error",1,false],
    ["https://www.tesco.ie/account",200,"My account",0,false],
    ["https://www.tesco.ie/account",403,"Denied",1,"blocked"],
    ["https://www.tesco.ie/account",200,"Access Denied Reference #abc",1,"blocked"],
    ["https://www.tesco.ie/account",200,"browser has failed some security checks",1,"blocked"],
    ["https://www.tesco.ie/account",200,"My account",1,true],
  ]) {let closed=false;const ctx={async newPage(){return {async goto(){return {url:()=>url,status:()=>status}},url(){return url},locator(){return {async innerText(){return text}}},getByRole(){return {first:()=>({async isVisible(){return count>0}})}},async close(){closed=true}}}};assert.equal(await verifySignedIn(ctx),expected,url);assert.ok(closed);}
});

test("refusals on login/error/foreign routes stop before any account-path check",async()=>{
 for(const url of ["https://www.tesco.ie/error","https://www.tesco.ie/account/login","https://foreign.invalid/error"]){
  for(const code of [200,401,403,429]){let closed=0;const ctx={async newPage(){return {async goto(){return {url:()=>url,status:()=>code}},locator(){return {async innerText(){return "browser has failed some security checks"}}},async close(){closed++}}}};
  assert.equal(await verifySignedIn(ctx),"blocked",`${url} ${code}`);assert.equal(closed,1);}
 }
});
test("login performs only one delayed verification and stops on redirected refusal",async()=>{
 let loads=0,closed=0;const waits=[];const ctx={pages:()=>[],async newPage(){return {async goto(){loads++;return {url:()=>"https://www.tesco.ie/error",status:()=>loads===1?200:403}},url:()=>"https://www.tesco.ie/account",locator:()=>({async innerText(){return "Sign in"}}),async close(){}}},async close(){closed++}};
 const r=await login({launchContext:async()=>ctx,sleep:async ms=>waits.push(ms)});
 assert.equal(r.status,"blocked");assert.equal(loads,2);assert.deepEqual(waits,[60000]);assert.equal(closed,1);
});
