# tesco-ie-grocery-mcp

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
spoofing, no CAPTCHA solving, no aggressive retrying.

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

# CLI
npx tesco-ie search "milk"

# MCP (stdio), e.g. from Claude Code:
claude mcp add tesco-ie -- node /path/to/tesco-ie-grocery-mcp/src/server.mjs
```

MCP tools:

| Tool | Scope |
|------|-------|
| `search_products` | Search tesco.ie catalogue. Read-only. |

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
