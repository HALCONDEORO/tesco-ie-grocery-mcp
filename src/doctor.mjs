// Live-environment check: one real fetch against tesco.ie, classified.
// The point is an honest verdict per environment ("does live fetching work
// from HERE?"), because the answer depends on Akamai's view of the network
// and browser profile, not on this code alone.

import { extractProducts, SEARCH_URL } from "./extract.mjs";

/**
 * Classify a fetched page without throwing.
 * @returns {"ok"|"blocked"|"no_cache"}
 */
export function classifyPage(html) {
  if (typeof html !== "string" || html.length === 0) return "no_cache";
  // Akamai's edge denial page: tiny body, "Access Denied", "Reference #"
  // marker (observed 2026-10-25, ~308 bytes).
  if (/access denied/i.test(html) && /reference #/i.test(html)) return "blocked";
  const { status } = extractProducts(html);
  return status === "ok" ? "ok" : "no_cache";
}

const VERDICTS = {
  ok: {
    status: "ok",
    summary: "Live fetch works from this environment.",
  },
  blocked: {
    status: "blocked",
    summary:
      "Akamai served an Access Denied page. This environment (IP reputation " +
      "and/or browser profile) is currently refused. No bypass is attempted; " +
      "a persistent real-browser profile with normal use is the intended path.",
  },
  no_cache: {
    status: "no_cache",
    summary:
      "The page arrived but carries no recognizable product cache: a " +
      "challenge page or a changed page shape, not a zero-result search.",
  },
  fetch_error: {
    status: "fetch_error",
    summary: "The page could not be fetched at all (network or browser error).",
  },
};

/**
 * Run the check. The fetcher is injected so the orchestration is testable
 * offline.
 * @param {(url: string) => Promise<string>} fetchPage
 */
export async function runDoctor(fetchPage) {
  const url = SEARCH_URL("milk", { count: 12 });
  let html;
  try {
    html = await fetchPage(url);
  } catch (e) {
    return { ...VERDICTS.fetch_error, url, error: e.message };
  }
  const cls = classifyPage(html);
  return { ...VERDICTS[cls], url };
}
