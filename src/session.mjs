// Persistent browser session for tesco.ie.
//
// Why a persistent profile: a fresh headless Chromium (no cookies, no
// history, datacenter IP) is exactly the shape Akamai's edge blocks; the
// project's only end-to-end attempt from such a client was answered with a
// hard "Access Denied" page (2026-10-25). A real browser profile that the
// user actually uses - with their own Tesco sign-in - is not an anti-bot
// bypass: it is the user's own browser and their own account, the same as
// them opening Chrome themselves. No fingerprint spoofing, no CAPTCHA
// solving, no credential storage in this repo. If Tesco still challenges the
// browser, we fail loudly.
//
// The profile directory holds cookies and site data. Treat it as a secret:
// never commit it, never share it. The default location is per-user under
// the home directory.

import os from "node:os";
import path from "node:path";

export const DEFAULT_PROFILE_DIR = path.join(
  os.homedir(),
  ".tesco-ie-grocery-mcp",
  "profile"
);

export const TESCO_ACCOUNT_URL = "https://www.tesco.ie/account";
export const DEFAULT_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Resolve where the persistent profile lives and how the browser opens.
 * Precedence: explicit option > environment variable > default.
 *
 * @param {{profileDir?: string, headed?: boolean}} options
 * @param {NodeJS.ProcessEnv} env
 */
export function resolveSessionConfig(options = {}, env = process.env) {
  return {
    profileDir:
      options.profileDir ?? env.TESCO_IE_PROFILE ?? DEFAULT_PROFILE_DIR,
    headed: options.headed ?? parseHeaded(env.TESCO_IE_HEADED),
  };
}

/** Parse TESCO_IE_HEADED: "1"/"true" open a visible browser; anything else stays headless. */
export function parseHeaded(value) {
  return value === "1" || value === "true";
}

/**
 * Tesco's sign-in lives on the account gateway. Any URL whose path starts
 * with one of these prefixes is (or redirects to) the sign-in flow.
 */
const LOGIN_PATH_PREFIXES = ["/account/login", "/account/sign-in", "/sign-in", "/login"];

export function isLoginUrl(url) {
  try {
    const p = new URL(url).pathname.toLowerCase();
    return LOGIN_PATH_PREFIXES.some((prefix) => p.startsWith(prefix));
  } catch {
    return false;
  }
}

/**
 * Open the persistent profile on Tesco's account area and let a person sign
 * in (or reuse an existing session). The persistent context stores cookies
 * on disk by itself; nothing credentials-related is written by this code.
 *
 * If credentials are supplied (e.g. TESCO_EMAIL/TESCO_PASSWORD injected from
 * a secret store at runtime), a best-effort generic form fill is attempted
 * with standard field types; a person can always finish the flow by hand in
 * the opened window. Headed mode is the default for this reason.
 *
 * Sign-in is verified factually afterwards: the account URL is loaded and a
 * redirect back to a login URL means "not signed in".
 *
 * The launcher is injectable so the orchestration is testable offline.
 *
 * @param {{profileDir?: string, headed?: boolean, email?: string, password?: string,
 *   timeoutMs?: number, launchContext?: Function, sleep?: Function}} options
 * @returns {Promise<{status: "signed_in"|"not_signed_in"|"timeout", profileDir: string}>}
 */
export async function login(options = {}) {
  const { profileDir, headed } = resolveSessionConfig(
    { profileDir: options.profileDir, headed: options.headed ?? true },
    process.env
  );
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS;
  const sleep =
    options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const launchContext =
    options.launchContext ??
    (async () => {
      const { chromium } = await import("playwright");
      return chromium.launchPersistentContext(profileDir, {
        headless: !headed,
        viewport: { width: 1280, height: 900 },
        locale: "en-IE",
        timezoneId: "Europe/Dublin",
      });
    });

  const context = await launchContext();
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(TESCO_ACCOUNT_URL, { waitUntil: "load", timeout: 60000 });

    if (options.email && options.password) {
      await tryGenericFormFill(page, options.email, options.password);
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      // Paced like the fetcher: never more than one page load per 2 s.
      await sleep(2000);
      if (await verifySignedIn(context)) {
        return { status: "signed_in", profileDir };
      }
    }
    return { status: "timeout", profileDir };
  } finally {
    await context.close();
  }
}

/**
 * Best-effort fill of a standard email/password form. Intentionally generic
 * (input types, not Tesco-specific selectors) and intentionally non-fatal:
 * the human in front of the window can always complete the flow.
 */
async function tryGenericFormFill(page, email, password) {
  try {
    const emailInput = page.locator('input[type="email"], input[name*="email" i]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    if ((await emailInput.count()) === 0 || (await passwordInput.count()) === 0) return;
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await passwordInput.press("Enter");
  } catch {
    // The person at the keyboard finishes the flow; nothing to do.
  }
}

/**
 * Factual sign-in check: load the account URL in a throwaway page inside the
 * same persistent context. Anonymous visitors are redirected to a login URL.
 */
async function verifySignedIn(context) {
  const page = await context.newPage();
  try {
    const response = await page.goto(TESCO_ACCOUNT_URL, {
      waitUntil: "load",
      timeout: 45000,
    });
    const finalUrl = response?.url() ?? page.url();
    return !isLoginUrl(finalUrl);
  } catch {
    return false;
  } finally {
    await page.close();
  }
}
