// MCP stdio server exposing Tesco Ireland catalogue search (read-only).
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fetchPageHtml, closeBrowser } from "./fetcher.mjs";
import { searchProducts, MAX_QUERIES_PER_CALL, MAX_COUNT } from "./search.mjs";

const server = new Server(
  { name: "tesco-ie-grocery-mcp", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_products",
      description:
        "Search the Tesco Ireland (tesco.ie) grocery catalogue. Accepts one query or a batch of up to 10 queries (one per shopping-list item) run sequentially with conservative pacing. Returns, per query, matching products with name, brand, price in EUR, unit price, promo label and product URL, or an explicit status when the fetch was blocked or failed. Read-only; no account needed. Basket and checkout are NOT supported: tesco.ie requires the user's own account, and ordering always stays with the user.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Single product search text, e.g. 'milk'." },
          queries: {
            type: "array",
            description: `Batch mode: up to ${MAX_QUERIES_PER_CALL} queries in one call.`,
            items: {
              type: "object",
              properties: {
                query: { type: "string", description: "Product search text." },
                count: { type: "integer", description: `Results per page (1-${MAX_COUNT}, default 24).` },
                offset: { type: "integer", description: "Pagination offset (default 0)." },
              },
              required: ["query"],
            },
          },
          count: { type: "integer", description: `Results per page for single-query mode (1-${MAX_COUNT}, default 24).` },
          offset: { type: "integer", description: "Pagination offset for single-query mode (default 0)." },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== "search_products") {
    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }] };
  }
  const a = req.params.arguments ?? {};
  const batch = Array.isArray(a.queries) && a.queries.length > 0
    ? a.queries
    : [{ query: a.query, count: a.count, offset: a.offset }];
  try {
    const results = await searchProducts(fetchPageHtml, batch);
    const allFailed = results.every((r) => r.status !== "ok");
    return {
      isError: allFailed,
      content: [{ type: "text", text: JSON.stringify({ results }, null, 2) }],
    };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: e.message }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.on("SIGINT", async () => { await closeBrowser(); process.exit(0); });
