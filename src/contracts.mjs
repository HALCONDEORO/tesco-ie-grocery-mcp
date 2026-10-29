import { MAX_QUERIES_PER_CALL, MAX_COUNT } from "./search.mjs";
export const TOOLS = [
    {
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      name: "search_products",
      description:
        "Search the Tesco Ireland (tesco.ie) grocery catalogue. Accepts one query or a batch of up to 10 queries (one per shopping-list item) run sequentially with conservative pacing. Returns, per query, matching products with name, brand, price in EUR, unit price, promo label and product URL, or an explicit status when the fetch was blocked or failed. Read-only prototype; successful live fetching is unproven. Basket and checkout are NOT supported: tesco.ie requires the user's own account, and ordering always stays with the user.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        oneOf: [{ required: ["query"], not: { required: ["queries"] } }, { required: ["queries"], not: { anyOf: [{required:["query"]},{required:["count"]},{required:["offset"]}] } }],
        properties: {
          query: { type: "string", minLength: 1, pattern: "\\S", description: "Single product search text, e.g. 'milk'." },
          queries: {
            type: "array", minItems: 1, maxItems: MAX_QUERIES_PER_CALL,
            description: `Batch mode: up to ${MAX_QUERIES_PER_CALL} queries in one call.`,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                query: { type: "string", minLength: 1, pattern: "\\S", description: "Product search text." },
                count: { type: "integer", minimum: 1, maximum: MAX_COUNT, description: `Results per page (1-${MAX_COUNT}, default 24).` },
                offset: { type: "integer", minimum: 0, maximum: 10000, description: "Pagination offset (default 0)." },
              },
              required: ["query"],
            },
          },
          count: { type: "integer", minimum: 1, maximum: MAX_COUNT, description: `Results per page for single-query mode (1-${MAX_COUNT}, default 24).` },
          offset: { type: "integer", minimum: 0, maximum: 10000, description: "Pagination offset for single-query mode (default 0)." },
        },
      },
    },
    {
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      name: "get_product",
      description:
        "Get full detail for one Tesco Ireland product by its numeric tesco.ie product id (the id in product URLs): name, brand, price in EUR, unit price, promo, availability, category, image and URL, plus detail fields (ingredients, nutrition, origin, pack size, storage, preparation) when the page carries them. Read-only prototype; successful live fetching is unproven.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^[0-9]{5,15}$", description: "Numeric tesco.ie product id, e.g. '292769732'." },
        },
        required: ["id"],
      },
    },
  ];
export function validateArguments(name, a) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return "arguments must be an object";
  const only = (o, keys) => Object.keys(o).every(k => keys.includes(k));
  const validQuery = q => q && typeof q === "object" && !Array.isArray(q) && only(q,["query","count","offset"]) && typeof q.query === "string" && q.query.trim().length > 0 && (q.count === undefined || Number.isInteger(q.count) && q.count >= 1 && q.count <= MAX_COUNT) && (q.offset === undefined || Number.isInteger(q.offset) && q.offset >= 0 && q.offset <= 10000);
  if (name === "get_product") return only(a,["id"]) && typeof a.id === "string" && /^[0-9]{5,15}$/.test(a.id) ? null : "id must contain 5-15 digits; no extra arguments";
  if (name !== "search_products") return "unknown tool";
  const batch = Object.hasOwn(a,"queries");
  return (batch ? only(a,["queries"]) && Array.isArray(a.queries) && a.queries.length >= 1 && a.queries.length <= MAX_QUERIES_PER_CALL && a.queries.every(validQuery) : validQuery(a)) ? null : "provide one valid query or 1-10 queries, not both; count 1-48 and offset 0-10000 must be integers";
}
