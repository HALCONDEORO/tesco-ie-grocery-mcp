// Extraction of product data from tesco.ie SSR pages.
// Verified 2026-10-25 on the inspected storefront routes (search PLP): the
// storefront (Next.js + module federation) renders pages server-side and
// embeds a normalized JSON cache (Apollo-cache shape) in an inline <script>.
// Entries look like:
//   "ProductType:292769732": { "__typename": "ProductType", "id": "292769732",
//     "tpnb": "81245629", "price": { "actual": 1.65, ... }, ... }
// On the inspected routes there is NO client-side API call to hook: the
// upstream gateway is cluster-internal, so this embedded cache is the public
// read surface the storefront itself ships to the browser.

/**
 * Extract products from raw HTML.
 * Returns { status, products }:
 *  - "ok":        product cache found and parsed; products may be empty (a
 *                 legitimate zero-result search).
 *  - "no_cache":  the page carries no recognizable SSR product cache at all.
 *                 That means a challenge/block page or a changed page shape,
 *                 NOT a zero-result search. Callers must surface this loudly.
 */
export function extractProducts(html) {
  let sawSsrMarker = false;
  const products = [];
  // Capture script bodies non-greedily; a literal '<' inside the script must
  // not truncate the capture. The only hard terminator is </script>.
  for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    const text = unescapeJs(m[1]);
    if (!/"__typename"/.test(text)) continue;
    sawSsrMarker = true;
    if (!/"__typename"\s*:\s*"ProductType"/.test(text)) continue;
    for (const raw of scanTypenameObjects(text, "ProductType")) {
      const p = normalizeProduct(raw);
      if (p) products.push(p);
    }
  }
  const deduped = dedupeBy(products, (p) => p.id);
  return { status: sawSsrMarker ? "ok" : "no_cache", products: deduped };
}

function unescapeJs(s) {
  return s.replace(/\\u002F/g, "/").replace(/\\u0026/g, "&").replace(/\\u003D/g, "=");
}

/** Find every balanced {...} literal containing "__typename":"<typename>" and JSON-parse it. */
export function scanTypenameObjects(text, typename) {
  const needle = `"__typename":"${typename}"`;
  const needleSpaced = `"__typename": "${typename}"`;
  const out = [];
  let i = 0;
  while (i < text.length) {
    let hit = text.indexOf(needle, i);
    const hit2 = text.indexOf(needleSpaced, i);
    if (hit === -1 || (hit2 !== -1 && hit2 < hit)) hit = hit2;
    if (hit === -1) break;
    const start = findObjectStart(text, hit);
    if (start !== -1) {
      const end = findObjectEnd(text, start);
      if (end !== -1) {
        try { out.push(JSON.parse(text.slice(start, end + 1))); } catch { /* partial literal */ }
        i = end + 1;
        continue;
      }
    }
    i = hit + needle.length;
  }
  return out;
}

function findObjectStart(text, fromIndex) {
  for (let i = fromIndex; i >= 0 && i > fromIndex - 100000; i--) {
    if (text[i] === "{") return i;
    if (text[i] === "}" || text[i] === "]") return -1;
  }
  return -1;
}

function findObjectEnd(text, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function normalizeProduct(raw) {
  if (!raw?.id || !raw?.tpnb) return null;
  const price = raw.price?.actual ?? raw.price?.value ?? null;
  const unitPrice = raw.unitPrice?.price ?? raw.unitPrice?.value ?? null;
  const unitMeasure = raw.unitPrice?.unitOfMeasure ?? null;
  const promo = raw.promotions?.[0]?.offerText ?? raw.promotions?.[0]?.description ?? null;
  return {
    id: String(raw.id),
    tpnb: String(raw.tpnb),
    name: raw.title ?? raw.name ?? null,
    brand: raw.brand ?? null,
    price,
    currency: "EUR",
    unitPrice: unitPrice != null ? { price: unitPrice, per: unitMeasure } : null,
    promo,
    isForSale: raw.isForSale ?? null,
    image: raw.defaultImageUrl ?? raw.image?.url ?? null,
    url: raw.id ? `https://www.tesco.ie/shop/en-IE/products/${raw.id}` : null,
  };
}

function dedupeBy(list, keyFn) {
  const seen = new Set();
  return list.filter((x) => {
    const k = keyFn(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Canonical search URL for the tesco.ie storefront (verified 2026-10-25). */
export const SEARCH_URL = (q, { count = 24, offset = 0 } = {}) =>
  `https://www.tesco.ie/shop/en-IE/search?query=${encodeURIComponent(q)}&count=${count}&offset=${offset}`;
