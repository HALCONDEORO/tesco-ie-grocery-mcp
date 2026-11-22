// Strict argument parsing for `tesco-ie search`. Pure: no browser, no network.
// Returns { flags, queries } or { error } so the CLI can exit 2 before any work.
import { MAX_COUNT, MAX_QUERIES_PER_CALL } from "./search.mjs";

export const MAX_OFFSET = 10000;

const INT = /^\d+$/;

function intFlag(name, raw, min, max) {
  if (raw === undefined) return { error: `${name} needs a value` };
  if (!INT.test(raw)) return { error: `${name} must be a whole number, got "${raw}"` };
  const n = Number(raw);
  if (n < min || n > max) return { error: `${name} must be between ${min} and ${max}, got ${n}` };
  return { value: n };
}

export function parseSearchArgs(args) {
  const flags = {};
  const queries = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--count" || a === "--offset") {
      if (a in flags) return { error: `${a} given more than once` };
      const [min, max] = a === "--count" ? [1, MAX_COUNT] : [0, MAX_OFFSET];
      const r = intFlag(a, args[++i], min, max);
      if (r.error) return { error: r.error };
      flags[a] = r.value;
    } else if (a.startsWith("--")) {
      return { error: `unknown flag ${a}` };
    } else {
      queries.push(a);
    }
  }
  if (queries.length === 0) return { error: "search needs at least one query" };
  if (queries.length > MAX_QUERIES_PER_CALL) {
    return { error: `too many queries (max ${MAX_QUERIES_PER_CALL})` };
  }
  return { flags, queries };
}
