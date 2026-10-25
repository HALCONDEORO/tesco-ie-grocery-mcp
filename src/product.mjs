// Product detail (PDP) fetching and extraction for tesco.ie.
// Verified 2026-10-25 against a live PDP capture: the product page embeds one
// full ProductType entry in the same SSR cache shape as the PLP, with an
// inline `details` object (ProductDetailsType) carrying ingredients,
// nutrition, origin, pack size and more.

import { scanTypenameObjects } from "./extract.mjs";

/** Canonical product page URL (verified 2026-10-25). */
export const PRODUCT_URL = (id) =>
  `https://www.tesco.ie/shop/en-IE/products/${encodeURIComponent(id)}`;

export function normalizeProductDetail(raw) {
  if (!raw?.id) return null;
  const d = raw.details ?? {};
  const flat = (list, map) => (Array.isArray(list) ? list.map(map).filter(Boolean) : null);
  return {
    id: String(raw.id),
    tpnb: raw.tpnb != null ? String(raw.tpnb) : null,
    name: raw.title ?? raw.name ?? null,
    brand: raw.brandName ?? raw.brand ?? null,
    price: raw.price?.actual ?? null,
    currency: "EUR",
    unitPrice:
      raw.price?.unitPrice != null
        ? { price: raw.price.unitPrice, per: raw.price.unitOfMeasure ?? null }
        : null,
    promo: raw.promotions?.[0]?.offerText ?? raw.promotions?.[0]?.description ?? null,
    isForSale: raw.isForSale ?? null,
    status: raw.status ?? null,
    image: raw.defaultImageUrl ?? raw.media?.defaultImage?.url ?? null,
    url: PRODUCT_URL(raw.id),
    category: {
      aisle: raw.aisleName ?? null,
      department: raw.departmentName ?? null,
      superDepartment: raw.superDepartmentName ?? null,
    },
    details: {
      features: d.features ?? null,
      productMarketing: d.productMarketing ?? null,
      brandMarketing: d.brandMarketing ?? null,
      manufacturerMarketing: d.manufacturerMarketing ?? null,
      ingredients: d.ingredients ?? null,
      additives: d.additives ?? null,
      allergens: d.allergens ?? null,
      nutrition: flat(d.nutrition, (n) =>
        n?.name ? { name: n.name, per100: n.value1 ?? null, perServing: n.value2 ?? null, ri: n.value3 ?? null } : null
      ),
      storage: d.storage ?? null,
      origin: flat(d.originInformation, (o) => (o ? { title: o.title ?? null, value: o.value ?? null } : null)),
      packSize: flat(d.packSize, (p) =>
        p?.value != null ? `${p.value}${p.units ?? ""}`.trim() : null
      ),
      netContents: d.netContents ?? null,
      preparationAndUsage: d.preparationAndUsage ?? null,
      cookingInstructions: d.cookingInstructions ?? null,
      safetyWarning: d.safetyWarning ?? null,
      warnings: d.warnings ?? null,
    },
  };
}

/**
 * Extract the single product from PDP HTML.
 * Returns { status: "ok"|"no_cache", product? } — no_cache means challenge
 * page or changed shape, never "product does not exist".
 */
export function extractProductDetail(html) {
  for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    const text = m[1];
    if (!/"__typename"\s*:\s*"ProductType"/.test(text)) continue;
    for (const raw of scanTypenameObjects(text, "ProductType")) {
      const p = normalizeProductDetail(raw);
      if (p) return { status: "ok", product: p };
    }
  }
  return { status: "no_cache" };
}

/**
 * Fetch and normalize one product by tesco.ie product id. Fetcher injected.
 */
export async function getProduct(fetchPage, id) {
  const clean = String(id ?? "").trim();
  if (!/^\d{5,15}$/.test(clean)) {
    return { id: clean, status: "fetch_error", error: "id must be the numeric tesco.ie product id" };
  }
  try {
    const html = await fetchPage(PRODUCT_URL(clean));
    const { status, product } = extractProductDetail(html);
    if (status === "no_cache") {
      return {
        id: clean,
        status: "no_cache",
        error: "tesco.ie did not return its product cache (challenge page or changed page shape).",
      };
    }
    return { id: clean, status: "ok", product };
  } catch (e) {
    return { id: clean, status: "fetch_error", error: `tesco.ie fetch failed: ${e.message}` };
  }
}
