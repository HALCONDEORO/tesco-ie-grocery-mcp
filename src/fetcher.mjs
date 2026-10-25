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
import { resolveSessionConfig } from "./session.mjs";

// Conservative request pacing, enforced process-wide: at least
// MIN_INTERVAL_MS between the start of two page loads.
export const MIN_INTERVAL_MS = 2000;
let lastLoadStartedAt = 0;

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

async function pace() {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastLoadStartedAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastLoadStartedAt = Date.now();
}

export async function fetchPageHtml(url, { timeoutMs = 45000 } = {}) {
  const context = await getContext();
  const page = await context.newPage();
  try {
    await pace();
    await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
    // The embedded product cache is part of the initial HTML; a small settle
    // window lets the SSR scripts finish serializing.
    await page.waitForTimeout(1500);
    return await page.content();
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (contextPromise) {
    const ctx = await contextPromise;
    contextPromise = null;
    await ctx.close();
  }
}
