// CLI flag validation for `search`: bad input must exit 2 with a usage error
// before any browser or network work starts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const GUARD = new URL("./helpers/no-io-guard.mjs", import.meta.url).pathname;

// Runs the real CLI in a subprocess. A local TCP listener stands in for any
// proxy and counts connections; the profile dir must not be created either.
async function runCli(args) {
  let connections = 0;
  const listener = createServer((sock) => { connections++; sock.destroy(); });
  await new Promise((r) => listener.listen(0, "127.0.0.1", r));
  const proxy = `http://127.0.0.1:${listener.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), "tesco-cli-"));
  const profile = join(dir, "profile");
  const traceFile = join(dir, "io-trace.txt");
  try {
    const child = spawn("node", ["--import", GUARD, "src/cli.mjs", ...args], {
      cwd: ROOT,
      env: {
        ...process.env,
        HTTP_PROXY: proxy, HTTPS_PROXY: proxy, ALL_PROXY: proxy,
        http_proxy: proxy, https_proxy: proxy, all_proxy: proxy,
        TESCO_IE_PROFILE: profile,
        NO_IO_TRACE: traceFile,
      },
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const code = await new Promise((res) => child.on("close", res));
    await new Promise((r) => setTimeout(r, 100));
    const ioTrace = existsSync(traceFile) ? readFileSync(traceFile, "utf8") : "";
    return { code, stdout, stderr, connections, ioTrace, profileCreated: existsSync(profile) };
  } finally {
    listener.close();
  }
}

const BAD = [
  ["--offset then --count (value swallowed)", ["search", "--offset", "--count", "10", "milk"]],
  ["--count not a number", ["search", "--count", "abc", "milk"]],
  ["--count zero", ["search", "--count", "0", "milk"]],
  ["--count negative", ["search", "--count", "-5", "milk"]],
  ["--count above max", ["search", "--count", "49", "milk"]],
  ["--count decimal", ["search", "--count", "2.5", "milk"]],
  ["--count missing value", ["search", "milk", "--count"]],
  ["--offset not a number", ["search", "--offset", "x", "milk"]],
  ["--offset negative", ["search", "--offset", "-1", "milk"]],
  ["--offset above max", ["search", "--offset", "10001", "milk"]],
  ["--offset missing value", ["search", "milk", "--offset"]],
  ["repeated --count", ["search", "--count", "5", "--count", "6", "milk"]],
  ["unknown flag", ["search", "--limit", "5", "milk"]],
  ["too many queries", ["search", ...Array.from({ length: 11 }, (_, i) => `q${i}`)]],
];

for (const [name, args] of BAD) {
  test(`search rejects ${name} with exit 2 and no fetch`, async () => {
    const r = await runCli(args);
    assert.equal(r.code, 2, `stderr: ${r.stderr}`);
    assert.match(r.stderr, /Usage:/);
    assert.equal(r.stdout, "", "no results JSON on stdout");
    assert.equal(r.ioTrace, "", "guard saw no socket, DNS, fetch or child process");
    assert.equal(r.connections, 0, "no network connection attempted");
    assert.equal(r.profileCreated, false, "no browser profile created");
  });
}

test("search with no query still exits 2", async () => {
  const r = await runCli(["search", "--count", "5"]);
  assert.equal(r.code, 2);
  assert.equal(r.ioTrace, "");
  assert.equal(r.connections, 0);
});

// Proves the guard itself works: a fetch inside the guarded process is caught.
test("no-io guard records and blocks fetch, sockets and child processes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tesco-guard-"));
  const traceFile = join(dir, "io-trace.txt");
  const code = [
    "const t=[];",
    "try{fetch('http://127.0.0.1:9')}catch{t.push('fetch')}",
    "try{(await import('node:child_process')).spawn('true')}catch{t.push('spawn')}",
    "try{(await import('node:net')).connect(9)}catch{t.push('net')}",
    "console.log(t.join())",
  ].join(";");
  const child = spawn("node", ["--import", GUARD, "--input-type=module", "-e", code], {
    env: { ...process.env, NO_IO_TRACE: traceFile },
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  await new Promise((res) => child.on("close", res));
  assert.equal(out.trim(), "fetch,spawn,net");
  const trace = readFileSync(traceFile, "utf8");
  assert.match(trace, /fetch/);
  assert.match(trace, /child_process\.spawn/);
  assert.match(trace, /net\.connect/);
});

import { parseSearchArgs } from "../src/cli-args.mjs";

test("parseSearchArgs accepts valid flags in any position", () => {
  assert.deepEqual(parseSearchArgs(["--count", "10", "milk", "--offset", "24", "bread"]), {
    flags: { "--count": 10, "--offset": 24 },
    queries: ["milk", "bread"],
  });
  assert.deepEqual(parseSearchArgs(["milk"]), { flags: {}, queries: ["milk"] });
  assert.deepEqual(parseSearchArgs(["--offset", "0", "--count", "48", "milk"]).flags, {
    "--offset": 0, "--count": 48,
  });
});
