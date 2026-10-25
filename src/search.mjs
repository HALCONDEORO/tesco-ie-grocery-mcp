// Shared search core used by both the CLI and the MCP server.
// The page fetcher is injected so the batch/pacing/error logic is testable
// offline (no browser, no network).

import { extractProducts, SEARCH_URL } from "./extract.mjs";

export const MAX_QUERIES_PER_CALL = 10;
export const MAX_COUNT = 48;

/**
 * Run one or more catalogue searches, sequentially (the fetcher's pacing
 * spaces the underlying page loads).
 *
 * @param {(url: string) => Promise<string>} fetchPage injected page fetcher
 * @param {Array<{query: string, count?: number, offset?: number}>} queries
 * @returns {Promise<Array<{query: string, status: "ok"|"no_cache"|"fetch_error",
 *   count?: number, products?: object[], error?: string}>>}
 */
export async function searchProducts(fetchPage, queries) {
  if (!Array.isArray(queries) || queries.length === 0) {
    throw new Error("at least one query is required");
  }
  if (queries.length > MAX_QUERIES_PER_CALL) {
    throw new Error(`too many queries in one call (max ${MAX_QUERIES_PER_CALL})`);
  }
  const results = [];
  for (const q of queries) {
    const query = String(q?.query ?? "").trim();
    if (!query) {
      results.push({ query: "", status: "fetch_error", error: "query is required" });
      continue;
    }
    const count = clampInt(q.count, 1, MAX_COUNT, 24);
    const offset = clampInt(q.offset, 0, 10000, 0);
    try {
      const html = await fetchPage(SEARCH_URL(query, { count, offset }));
      const { status, products } = extractProducts(html);
      if (status === "no_cache") {
        results.push({
          query,
          status: "no_cache",
          error:
            "tesco.ie did not return its product cache (challenge page or changed page shape). Not a zero-result search.",
        });
      } else {
        results.push({ query, status: "ok", count: products.length, products });
      }
    } catch (e) {
      results.push({ query, status: "fetch_error", error: `tesco.ie fetch failed: ${e.message}` });
    }
  }
  return results;
}

function clampInt(v, min, max, dflt) {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
