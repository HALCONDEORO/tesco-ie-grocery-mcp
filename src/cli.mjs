#!/usr/bin/env node
// CLI: tesco-ie search [--count N] [--offset N] <query> [more queries...]
import { fetchPageHtml, closeBrowser } from "./fetcher.mjs";
import { searchProducts } from "./search.mjs";

const args = process.argv.slice(2);
if (args[0] !== "search") {
  console.error("Usage: tesco-ie search [--count N] [--offset N] <query> [more queries...]");
  process.exit(2);
}

let count, offset;
const queries = [];
for (let i = 1; i < args.length; i++) {
  if (args[i] === "--count") { count = args[++i]; continue; }
  if (args[i] === "--offset") { offset = args[++i]; continue; }
  queries.push(args[i]);
}
if (queries.length === 0) {
  console.error("Usage: tesco-ie search [--count N] [--offset N] <query> [more queries...]");
  process.exit(2);
}

try {
  const results = await searchProducts(
    fetchPageHtml,
    queries.map((query) => ({ query, count, offset }))
  );
  console.log(JSON.stringify({ results }, null, 2));
  // Exit non-zero if every query failed (blocked page or fetch error), so
  // scripts can tell "blocked" apart from "legitimately zero products".
  process.exit(results.every((r) => r.status !== "ok") ? 1 : 0);
} finally {
  await closeBrowser();
}
