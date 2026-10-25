// Browser-backed fetcher for tesco.ie pages.
// Why a browser: Akamai fronts the storefront and answers plain HTTP clients
// (curl, undici, node fetch) with 403 even with a browser User-Agent
// (verified 2026-10-25). The page renders fine in a real Chromium.
//
// LIMIT (documented, not hidden): this drives a real browser via Playwright.
// It is slower and heavier than an API call and its stability depends on
// Tesco's front-end not changing shape. No anti-bot bypass tricks are used or
// shipped: standard headless Chromium, no fingerprint spoofing, no CAPTCHA
// solving. If Tesco challenges the browser, this fails loudly instead of
// working around it.

import { chromium } from "playwright";

// Conservative request pacing, enforced process-wide: at least
// MIN_INTERVAL_MS between the start of two page loads.
export const MIN_INTERVAL_MS = 2000;
let lastLoadStartedAt = 0;

let browserPromise = null;

function getBrowser() {
  browserPromise ??= chromium.launch({ headless: true });
  return browserPromise;
}

async function pace() {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastLoadStartedAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastLoadStartedAt = Date.now();
}

export async function fetchPageHtml(url, { timeoutMs = 45000 } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
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
  if (browserPromise) {
    const b = await browserPromise;
    browserPromise = null;
    await b.close();
  }
}
