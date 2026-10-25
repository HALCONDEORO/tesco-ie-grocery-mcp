// Boot test: the MCP server must actually start and answer the real protocol
// (initialize + tools/list) over stdio, not just parse fixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

async function waitFor(responses, id, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const hit = responses.find((r) => r.id === id);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

test("MCP server boots, initializes and lists search_products", async () => {
  const server = spawn("node", ["src/server.mjs"], { cwd: new URL("..", import.meta.url).pathname });
  try {
    let buf = "";
    const responses = [];
    server.stdout.on("data", (d) => {
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) { try { responses.push(JSON.parse(line)); } catch { /* non-rpc line */ } }
      }
    });
    const send = (msg) => server.stdin.write(JSON.stringify(msg) + "\n");

    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "boot-test", version: "0.0.0" },
    } });
    const init = await waitFor(responses, 1, 10000);
    assert.ok(init?.result?.serverInfo, "initialize must return serverInfo");
    assert.equal(init.result.serverInfo.name, "tesco-ie-grocery-mcp");

    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const list = await waitFor(responses, 2, 10000);
    assert.ok(list?.result?.tools, "tools/list must return tools");
    const tool = list.result.tools.find((t) => t.name === "search_products");
    assert.ok(tool, "search_products must be listed");
    assert.match(tool.description, /Read-only/);
    assert.match(tool.description, /NOT supported/);
  } finally {
    server.kill("SIGINT");
  }
});
