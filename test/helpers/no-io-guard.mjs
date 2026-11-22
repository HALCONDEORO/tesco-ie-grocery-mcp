// Preloaded with `node --import` into the CLI subprocess. Any attempt to open
// a socket, resolve DNS, call fetch or start a child process (which is how
// Playwright launches a browser) is recorded to $NO_IO_TRACE and then throws.
import net from "node:net";
import dns from "node:dns";
import cp from "node:child_process";
import { appendFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const trace = process.env.NO_IO_TRACE;
function trip(what) {
  appendFileSync(trace, `${what}\n`);
  throw new Error(`no-io-guard: ${what} is not allowed here`);
}

net.Socket.prototype.connect = function () { trip("net.Socket.connect"); };
net.connect = net.createConnection = function () { trip("net.connect"); };
dns.lookup = function () { trip("dns.lookup"); };
dns.promises.lookup = function () { trip("dns.promises.lookup"); };
globalThis.fetch = function () { trip("fetch"); };
for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
  cp[name] = function () { trip(`child_process.${name}`); };
}

// Make `import { spawn } from "node:child_process"` see the patched functions.
syncBuiltinESMExports();
