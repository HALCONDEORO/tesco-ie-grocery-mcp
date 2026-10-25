# tesco-ie-grocery-mcp

[![ci](https://github.com/HALCONDEORO/tesco-ie-grocery-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/HALCONDEORO/tesco-ie-grocery-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

MCP server and CLI for the **Tesco Ireland** (tesco.ie) grocery catalogue.

Phase 1 is **read-only**: product search with names, brands, EUR prices, unit
prices, promo labels and product URLs. No account is needed for this phase.

**Not supported, by design:** basket, delivery slots, login and checkout.
Verified 2026-10-25, tesco.ie requires the user's own account even to add an
item to the basket (an anonymous "Add" redirects to the login page), and
placing an order always stays with the user in their own browser. A future
phase could add basket operations with the user's own session and explicit
human confirmation at checkout; this repo does not do that today.

## Why the extraction approach

Tesco has no public developer API for groceries (the historical Tesco Labs
developer portal is gone). The tesco.ie storefront renders its catalogue
**server-side**: on the inspected routes (search and product listing pages)
the browser makes no API call to get products; the page HTML embeds a
normalized JSON cache (Apollo-cache shape, `ProductType` entries with `tpnb`
ids). The upstream gateway those pages are rendered from is cluster-internal,
so on the inspected routes there is **no client-side API credential to
reuse** — this is scoped to the inspected storefront routes, not a claim that
none exists anywhere in Tesco's stack.

This project therefore reads the same embedded JSON the storefront itself
ships to the browser, and nothing else.

## Anti-bot posture

The storefront is fronted by Akamai: plain HTTP clients (curl, node fetch)
get `403` even with a browser User-Agent (verified 2026-10-25). This project
fetches pages with a real Chromium via Playwright and enforces a 2 s minimum
gap between page loads. It ships **no** anti-bot bypass: no fingerprint
spoofing, no CAPTCHA solving, no aggressive retrying. Since 0.3.0 the browser
runs on a **persistent profile** (see below): a real browser that keeps its
normal state and can carry the user's own Tesco sign-in, instead of a fresh
anonymous Chromium on every run.

**Status (2026-10-25): experimental prototype, not a demonstrated live
connector.** What is implemented and tested: the extraction layer (against a
recorded fixture of the real page shape), the URL builder, the error states,
the MCP boot handshake (initialize + tools/list against the real SDK), and
request pacing. What is NOT demonstrated: a successful end-to-end live fetch.
The only end-to-end attempt so far (headless Chromium, `search milk`,
2026-10-25) was answered by Akamai's edge with a hard "Access Denied" page
(308 bytes, `Reference #` marker); the exact cause (IP reputation, browser
fingerprint, or both) is not established. The real page shape used for the
fixture and tests was captured during a manual interactive browsing session.
Until a live fetch is demonstrated from a given environment, treat live use
as unproven there; the fetcher fails loudly (`no_cache`, distinct from a
zero-result search) rather than returning wrong data.

## Install and use

```bash
npm install
npx playwright install chromium   # one-time browser download

# CLI (each argument is a separate query; quote multi-word terms)
npx tesco-ie search "milk"
npx tesco-ie search --count 10 "milk" "bread" "free range eggs"

# MCP (stdio), e.g. from Claude Code:
claude mcp add tesco-ie -- node /path/to/tesco-ie-grocery-mcp/src/server.mjs
```

## Session (sign-in)

Some future features (basket, delivery slots) need the user's own Tesco
Ireland account, and a persistent real-browser profile also gives Akamai the
normal signals of an actual browser instead of a fresh anonymous Chromium.

```bash
npx tesco-ie login                 # opens a visible browser on tesco.ie
npx tesco-ie login --headless      # only if a session already exists
```

Sign in with your own account in the opened window; the command detects the
redirect and confirms `signed_in`. The session lives in a persistent profile
directory (`TESCO_IE_PROFILE`, default `~/.tesco-ie-grocery-mcp/profile`).
**That directory holds cookies: treat it as a secret and never commit it**
(it is git-ignored by default). Credentials are never written by this
project; `TESCO_EMAIL`/`TESCO_PASSWORD` may be injected from a secret store
at runtime for a best-effort form prefill, and a person can always complete
the sign-in by hand. `TESCO_IE_HEADED=1` opens a visible browser for fetches.

MCP tools:

| Tool | Scope |
|------|-------|
| `search_products` | Search tesco.ie catalogue. Single `query` or batched `queries` (max 10 per call), with `count`/`offset` pagination. Read-only. |

Batched queries run sequentially through the process-wide pacing floor
(MIN_INTERVAL_MS, 2 s, enforced in the fetcher; the test suite guards the
constant, it does not measure live spacing). Each query returns its own
status (`ok`, `no_cache`, `fetch_error`) so one blocked or failed search
never sinks the rest of the batch.

## Development

```bash
npm test   # node:test, extraction against a recorded fixture
```

## Legal and etiquette

Unofficial project, not affiliated with or endorsed by Tesco. Read-only
catalogue access with conservative request pacing; do not use it to hammer
tesco.ie. Product data belongs to Tesco; use it within their site terms.

Acknowledgements: the multi-country grocery-provider pattern and the
per-country viability notes that motivated this repo come from
[open-supermarkets](https://github.com/abracadabra50/open-supermarkets) (MIT)
and the provider evaluation notes in
[uk-grocery-cli](https://github.com/abracadabra50/uk-grocery-cli).
