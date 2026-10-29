// Browser-backed fetcher for tesco.ie pages.
// Why a browser: Akamai fronts the storefront and answers plain HTTP clients
// (curl, undici, node fetch) with 403 even with a browser User-Agent
// (verified 2026-10-25). The page renders fine in a real Chromium.
//
// Why a PERSISTENT profile: a fresh headless Chromium (no cookies, no
// history, datacenter IP) is the shape Akamai blocked in the project's only
// end-to-end attempt (2026-10-25). A persistent profile accumulates the
// normal state of a real browser and carries the user's own Tesco sign-in
// (see `tesco-ie login`). That is not an anti-bot bypass: it is the user's
// own browser and account. No fingerprint spoofing, no CAPTCHA solving, no
// aggressive retrying. If Tesco challenges the browser, this fails loudly.
//
// LIMIT (documented, not hidden): this drives a real browser via Playwright.
// It is slower and heavier than an API call and its stability depends on
// Tesco's front-end not changing shape.

import { chromium } from "playwright";
import { createLoadQueue, FetchFailure, blockedHtml } from "./load-control.mjs";
import { resolveSessionConfig } from "./session.mjs";

// Conservative request pacing, enforced process-wide: at least
// MIN_INTERVAL_MS between the start of two page loads.
export const MIN_INTERVAL_MS = 2000;
const enqueue = createLoadQueue({intervalMs: MIN_INTERVAL_MS});
let refused = null;

let contextPromise = null;

function getContext() {
  contextPromise ??= (() => {
    const { profileDir, headed } = resolveSessionConfig();
    return chromium.launchPersistentContext(profileDir, {
      headless: !headed,
      viewport: { width: 1280, height: 900 },
      locale: "en-IE",
      timezoneId: "Europe/Dublin",
    });
  })();
  return contextPromise;
}

export async function fetchPageHtml(url, { timeoutMs = 45000 } = {}) {
  return enqueue(async () => {
    // A refusal stops this process. A caller must not continue the batch or
    // silently retry with another profile. Restart only after reviewing it.
    if (refused) throw refused;
    const context = await getContext();
    const page = await context.newPage();
    try {
      const response = await page.goto(url, {waitUntil:"load",timeout:timeoutMs});
      const code = response?.status();
      if (code === 429) { refused = new FetchFailure("rate_limited", "HTTP 429; stop and honor Retry-After", response.headers()["retry-after"] ?? null); throw refused; }
      if (code === 401 || code === 403) { refused = new FetchFailure("blocked", `HTTP ${code}; no bypass attempted`); throw refused; }
      if (code >= 400) throw new FetchFailure("fetch_error", `HTTP ${code}`);
      await page.waitForTimeout(1500);
      const html = await page.content();
      if (blockedHtml(html)) { refused = new FetchFailure("blocked", "Challenge or denial page; no bypass attempted"); throw refused; }
      return html;
    } finally { await page.close(); }
  });
}

export async function closeBrowser() {
  if (contextPromise) {
    const ctx = await contextPromise;
    contextPromise = null;
    await ctx.close();
  }
}
