import test from "node:test";
import assert from "node:assert/strict";
import {TOOLS,validateArguments as v} from "../src/contracts.mjs";
test("tools declare read-only and bounded exclusive inputs",()=>{assert.equal(TOOLS.length,2);for(const t of TOOLS)assert.equal(t.annotations.readOnlyHint,true);assert.equal(TOOLS[0].inputSchema.oneOf.length,2);assert.equal(TOOLS[0].inputSchema.properties.queries.maxItems,10);});
test("invalid arguments are rejected before any fetch",()=>{for(const a of [{},{query:" "},{query:"milk",queries:[]},{queries:[]},{query:"milk",count:2.5},{query:"milk",offset:10001},{queries:[{query:"a",extra:1}]},{queries:[{query:"a"}],count:2},{query:1},{query:"milk",url:"https://evil.invalid"}])assert.ok(v("search_products",a),JSON.stringify(a));});
test("valid modes and numeric product id",()=>{assert.equal(v("search_products",{query:"milk",count:48,offset:10000}),null);assert.equal(v("search_products",{queries:[{query:"milk"}]}),null);assert.equal(v("get_product",{id:"292769732"}),null);assert.ok(v("get_product",{id:"https://evil.invalid"}));});
