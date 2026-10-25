// Offline tests for PDP extraction against a real live capture (2026-10-25).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { extractProductDetail, getProduct, PRODUCT_URL } from "../src/product.mjs";

const PDP = readFileSync(new URL("./fixtures/pdp-snippet.html", import.meta.url), "utf8");

test("extractProductDetail: normalizes the captured real PDP product", () => {
  const { status, product } = extractProductDetail(PDP);
  assert.equal(status, "ok");
  assert.equal(product.id, "292769732");
  assert.equal(product.tpnb, "81245629");
  assert.equal(product.name, "Tesco Fresh Milk1ltr");
  assert.equal(product.brand, "TESCO");
  assert.equal(product.price, 1.15);
  assert.equal(product.currency, "EUR");
  assert.deepEqual(product.unitPrice, { price: 1.15, per: "litre" });
  assert.equal(product.isForSale, true);
  assert.equal(product.status, "AvailableForSale");
  assert.equal(product.url, "https://www.tesco.ie/shop/en-IE/products/292769732");
  assert.equal(product.category.aisle, "Fresh Milk");
  assert.equal(product.category.department, "Milk, Butter & Eggs");
  assert.match(product.image, /^https:\/\/digitalcontent\.api\.tesco\.com\//);
});

test("extractProductDetail: details carry nutrition, origin and pack size", () => {
  const { product } = extractProductDetail(PDP);
  assert.ok(Array.isArray(product.details.nutrition));
  const energy = product.details.nutrition.find((n) => n.name === "Energy");
  assert.equal(energy.per100, "267kJ / 64kcal");
  assert.deepEqual(product.details.packSize, ["1L"]);
  assert.equal(product.details.origin[0].title, "Produce of");
  assert.match(product.details.origin[0].value, /Republic of Ireland/);
});

test("extractProductDetail: a page without the cache is no_cache, loudly", () => {
  assert.equal(extractProductDetail("<html><body>nope</body></html>").status, "no_cache");
});

test("getProduct: rejects a non-numeric id without fetching", async () => {
  let fetched = false;
  const r = await getProduct(async () => { fetched = true; return ""; }, "milk");
  assert.equal(r.status, "fetch_error");
  assert.equal(fetched, false);
});

test("getProduct: ok path with injected fetcher", async () => {
  const r = await getProduct(async () => PDP, "292769732");
  assert.equal(r.status, "ok");
  assert.equal(r.product.name, "Tesco Fresh Milk1ltr");
});

test("getProduct: a throwing fetcher becomes fetch_error", async () => {
  const r = await getProduct(async () => { throw new Error("boom"); }, "292769732");
  assert.equal(r.status, "fetch_error");
  assert.match(r.error, /boom/);
});

test("PRODUCT_URL builds the canonical PDP URL", () => {
  assert.equal(PRODUCT_URL("292769732"), "https://www.tesco.ie/shop/en-IE/products/292769732");
});
