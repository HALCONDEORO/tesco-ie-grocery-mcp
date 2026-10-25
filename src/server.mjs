// MCP stdio server exposing Tesco Ireland catalogue search (read-only).
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fetchPageHtml, closeBrowser } from "./fetcher.mjs";
import { extractProducts, SEARCH_URL } from "./extract.mjs";

const server = new Server(
  { name: "tesco-ie-grocery-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_products",
      description:
        "Search the Tesco Ireland (tesco.ie) grocery catalogue. Returns matching products with name, brand, price in EUR, unit price, promo label and product URL. Read-only; no account needed. Basket and checkout are NOT supported: tesco.ie requires the user's own account, and ordering always stays with the user.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Product search text, e.g. 'milk'." },
        },
        required: ["query"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== "search_products") {
    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }] };
  }
  const query = String(req.params.arguments?.query ?? "").trim();
  if (!query) return { isError: true, content: [{ type: "text", text: "query is required" }] };
  try {
    const html = await fetchPageHtml(SEARCH_URL(query));
    const { status, products } = extractProducts(html);
    if (status === "no_cache") {
      return {
        isError: true,
        content: [{
          type: "text",
          text: "tesco.ie did not return its product cache (challenge page or changed page shape). This is not a zero-result search; the fetcher needs attention.",
        }],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ query, count: products.length, products }, null, 2) }],
    };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: `tesco.ie fetch failed: ${e.message}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.on("SIGINT", async () => { await closeBrowser(); process.exit(0); });
