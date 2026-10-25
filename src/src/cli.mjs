#!/usr/bin/env node
// CLI: tesco-ie search <query>
import { fetchPageHtml, closeBrowser } from "./fetcher.mjs";
import { extractProducts, SEARCH_URL } from "./extract.mjs";

const [cmd, ...rest] = process.argv.slice(2);

if (cmd !== "search" || rest.length === 0) {
  console.error("Usage: tesco-ie search <query>");
  process.exit(2);
}

const query = rest.join(" ").trim();
try {
  const html = await fetchPageHtml(SEARCH_URL(query));
  const { status, products } = extractProducts(html);
  if (status === "no_cache") {
    console.error(
      "tesco.ie did not return its product cache (challenge page or changed page shape). Not a zero-result search."
    );
    process.exit(1);
  }
  console.log(JSON.stringify({ query, count: products.length, products }, null, 2));
} finally {
  await closeBrowser();
}
