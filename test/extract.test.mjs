import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractProducts, SEARCH_URL } from "../src/extract.mjs";

const html = readFileSync(new URL("./fixtures/plp-snippet.html", import.meta.url), "utf8");

test("extracts normalized products from the embedded cache", () => {
  const { status, products } = extractProducts(html);
  assert.equal(status, "ok");
  assert.equal(products.length, 2);
  const milk = products.find((p) => p.tpnb === "81245629");
  assert.equal(milk.name, "Tesco Fresh Milk 1L");
  assert.equal(milk.price, 1.65);
  assert.equal(milk.isForSale, true);
  assert.match(milk.image, /^https:\/\/digitalcontent\.api\.tesco\.com\//);
  assert.match(milk.url, /^https:\/\/www\.tesco\.ie\/shop\/en-IE\/products\/292769732$/);
});

test("search URL builder", () => {
  assert.equal(
    SEARCH_URL("club milk", { count: 10 }),
    "https://www.tesco.ie/shop/en-IE/search?query=club%20milk&count=10&offset=0"
  );
});

test("page with no SSR cache at all is no_cache, not an empty result", () => {
  const { status, products } = extractProducts("<html><body>404 page</body></html>");
  assert.equal(status, "no_cache");
  assert.deepEqual(products, []);
});

test("challenge page is no_cache, not an empty result", () => {
  const challenge = "<html><body><script>var x=1;</script>Access Denied</body></html>";
  assert.equal(extractProducts(challenge).status, "no_cache");
});

test("SSR markers present but zero ProductType entries is an ok empty search", () => {
  const empty = '<html><script>window.__STATE__={"FacetType:1":{"__typename":"FacetType","id":"1"}};</script></html>';
  const { status, products } = extractProducts(empty);
  assert.equal(status, "ok");
  assert.deepEqual(products, []);
});

test("a literal < inside script content does not truncate the capture", () => {
  const withLt =
    '<html><script>window.__STATE__={"NoteType:1":{"__typename":"NoteType","t":"a<b"},' +
    '"ProductType:292769732":{"__typename":"ProductType","id":"292769732","tpnb":"81245629",' +
    '"title":"Tesco Fresh Milk 1L","brand":"Tesco","isForSale":true,"price":{"actual":1.65},' +
    '"defaultImageUrl":"https://digitalcontent.api.tesco.com/x.png"}};</script></html>';
  const { status, products } = extractProducts(withLt);
  assert.equal(status, "ok");
  assert.equal(products.length, 1);
  assert.equal(products[0].tpnb, "81245629");
});

// Minimal price-only shape transcribed from the 22 November public-page capture.
// It is not the full page or proof of current pricing or search result order.
test("captured nested PriceType retains item price and kg comparison separately", () => {
  const captured = '<script>{"ProductType:313375618":{"__typename":"ProductType","id":"313375618","tpnb":"91719947","title":"Tesco Porridge Oats 1.5Kg","price":{"__typename":"PriceType","actual":1.45,"unitPrice":0.97,"unitOfMeasure":"kg"}}}</script>';
  const product = extractProducts(captured).products[0];
  assert.equal(product.price, 1.45);
  assert.deepEqual(product.unitPrice, {price:0.97,per:"kg"});
  assert.equal(product.isForSale, null);
});
test("nested unit price preserves zero and legacy top-level shape", () => {
  const html = raw => '<script>'+JSON.stringify({__typename:"ProductType",id:"123456789",tpnb:"12345678",...raw})+'</script>';
  assert.deepEqual(extractProducts(html({price:{actual:2,unitPrice:0,unitOfMeasure:"kg"}})).products[0].unitPrice,{price:0,per:"kg"});
  assert.deepEqual(extractProducts(html({unitPrice:{price:3,unitOfMeasure:"l"}})).products[0].unitPrice,{price:3,per:"l"});
  assert.equal(extractProducts(html({price:{actual:2}})).products[0].unitPrice,null);
});
