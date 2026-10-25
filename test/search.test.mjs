// Batch/pacing/error logic of the shared search core, with an injected fake
// fetcher: no browser, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchProducts, MAX_QUERIES_PER_CALL } from "../src/search.mjs";

const plp = readFileSync(new URL("./fixtures/plp-snippet.html", import.meta.url), "utf8");
const CHALLENGE = "<html><body>Access Denied. Reference #abc</body></html>";
const EMPTY_SSR = '<html><script>window.__STATE__={"FacetType:1":{"__typename":"FacetType","id":"1"}};</script></html>';

function fakeFetcher(map) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [needle, htmlOrErr] of Object.entries(map)) {
      if (url.includes(`query=${needle}`)) {
        if (htmlOrErr instanceof Error) throw htmlOrErr;
        return htmlOrErr;
      }
    }
    return EMPTY_SSR;
  };
  fn.calls = calls;
  return fn;
}

test("batch returns one result per query, in order", async () => {
  const fetcher = fakeFetcher({ milk: plp });
  const results = await searchProducts(fetcher, [{ query: "milk" }, { query: "bread" }]);
  assert.equal(results.length, 2);
  assert.equal(results[0].status, "ok");
  assert.equal(results[0].products.length, 2);
  assert.equal(results[1].status, "ok");
  assert.equal(results[1].count, 0);
  assert.equal(fetcher.calls.length, 2);
});

test("no_cache and fetch errors are per-query, not fatal to the batch", async () => {
  const fetcher = fakeFetcher({ milk: plp, eggs: CHALLENGE, butter: new Error("nav timeout") });
  const results = await searchProducts(fetcher, [
    { query: "milk" }, { query: "eggs" }, { query: "butter" },
  ]);
  assert.deepEqual(results.map((r) => r.status), ["ok", "no_cache", "fetch_error"]);
  assert.match(results[1].error, /Not a zero-result search/);
  assert.match(results[2].error, /nav timeout/);
});

test("count and offset reach the URL and are clamped", async () => {
  const fetcher = fakeFetcher({});
  await searchProducts(fetcher, [{ query: "milk", count: 10, offset: 20 }]);
  assert.match(fetcher.calls[0], /count=10&offset=20/);
  await searchProducts(fetcher, [{ query: "milk", count: 9999, offset: -5 }]);
  assert.match(fetcher.calls[1], /count=48&offset=0/);
});

test("batch size and empty input are rejected", async () => {
  const fetcher = fakeFetcher({});
  await assert.rejects(() => searchProducts(fetcher, []), /at least one/);
  const tooMany = Array.from({ length: MAX_QUERIES_PER_CALL + 1 }, (_, i) => ({ query: `q${i}` }));
  await assert.rejects(() => searchProducts(fetcher, tooMany), /too many/);
});
