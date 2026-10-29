// MCP stdio server exposing Tesco Ireland catalogue search (read-only).
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fetchPageHtml, closeBrowser } from "./fetcher.mjs";
import { searchProducts } from "./search.mjs";
import { getProduct } from "./product.mjs";

import { TOOLS, validateArguments } from "./contracts.mjs";

const server = new Server(
  { name: "tesco-ie-grocery-mcp", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const error = validateArguments(req.params.name, req.params.arguments ?? {});
  if (error) return { isError: true, content: [{ type: "text", text: JSON.stringify({status:"invalid_arguments",error}) }] };
  if (req.params.name === "get_product") {
    const result = await getProduct(fetchPageHtml, req.params.arguments?.id);
    return {
      isError: result.status !== "ok",
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
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
