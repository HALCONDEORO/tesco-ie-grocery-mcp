#!/usr/bin/env node
// CLI: tesco-ie <command>
//   search [--count N] [--offset N] <query> [more queries...]
//   login  [--profile DIR] [--headless]
import { fetchPageHtml, closeBrowser } from "./fetcher.mjs";
import { searchProducts } from "./search.mjs";
import { login } from "./session.mjs";

const USAGE = `Usage:
  tesco-ie search [--count N] [--offset N] <query> [more queries...]
  tesco-ie login  [--profile DIR] [--headless]

Environment:
  TESCO_IE_PROFILE   Persistent browser profile directory (holds the Tesco
                     session; treat it as a secret, never commit it).
  TESCO_IE_HEADED    "1" opens a visible browser window for fetches.
  TESCO_EMAIL        Optional, login only: prefill the sign-in form.
  TESCO_PASSWORD     Optional, login only: inject from a secret store at
                     runtime; never write it to the repo or the profile.`;

const args = process.argv.slice(2);
const command = args[0];

function takeFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count" || args[i] === "--offset" || args[i] === "--profile") {
      flags[args[i]] = args[++i];
    } else if (args[i] === "--headless") {
      flags["--headless"] = true;
    } else {
      positional.push(args[i]);
    }
  }
  return { flags, positional };
}

try {
  if (command === "search") {
    const { flags, positional: queries } = takeFlags(args.slice(1));
    if (queries.length === 0) {
      console.error(USAGE);
      process.exit(2);
    }
    const results = await searchProducts(
      fetchPageHtml,
      queries.map((query) => ({ query, count: flags["--count"], offset: flags["--offset"] }))
    );
    console.log(JSON.stringify({ results }, null, 2));
    // Exit non-zero if every query failed (blocked page or fetch error), so
    // scripts can tell "blocked" apart from "legitimately zero products".
    process.exit(results.every((r) => r.status !== "ok") ? 1 : 0);
  } else if (command === "login") {
    const { flags } = takeFlags(args.slice(1));
    console.error(
      "Opening tesco.ie in a persistent browser profile. Sign in with your own " +
        "Tesco Ireland account; the session is stored in the profile directory only."
    );
    const result = await login({
      profileDir: flags["--profile"],
      headed: flags["--headless"] ? false : undefined,
      email: process.env.TESCO_EMAIL,
      password: process.env.TESCO_PASSWORD,
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "signed_in") {
      console.error(`Signed in. Session stored in: ${result.profileDir}`);
    } else {
      console.error(
        result.status === "timeout"
          ? "Timed out waiting for sign-in. Re-run `tesco-ie login` to continue."
          : "Not signed in."
      );
    }
    process.exit(result.status === "signed_in" ? 0 : 1);
  } else {
    console.error(USAGE);
    process.exit(2);
  }
} finally {
  await closeBrowser();
}
