/**
 * Per-request trace collector.
 *
 * Schema (frozen per Plan-VIII §5):
 *   { agentRole, tool, args, ok, tookMs, cached, rawSnippet, error }
 *
 * Usage:
 *   import { createTraceCollector } from "./trace-collector.mjs";
 *   const tc = createTraceCollector("asset_info");
 *   const [result, entry] = await tc.call("crypto_market", { action: "search", query: "BTC" }, async () => { ... });
 */

const RAW_SNIPPET_MAX = 200;

export function createTraceCollector(agentRole) {
  const entries = [];

  function push(entry) {
    entries.push({
      agentRole: entry.agentRole || agentRole || "unknown",
      tool: entry.tool || "unknown",
      args: entry.args || {},
      ok: Boolean(entry.ok),
      tookMs: typeof entry.tookMs === "number" ? entry.tookMs : 0,
      cached: Boolean(entry.cached),
      rawSnippet: String(entry.rawSnippet || entry.error || "").slice(0, RAW_SNIPPET_MAX),
      error: entry.error || null,
    });
  }

  async function call(tool, args, fn) {
    const startedAt = Date.now();
    try {
      const result = await fn();
      const tookMs = Date.now() - startedAt;
      const rawSnippet =
        typeof result?.text === "string"
          ? result.text.slice(0, RAW_SNIPPET_MAX)
          : JSON.stringify(result).slice(0, RAW_SNIPPET_MAX);
      push({ agentRole, tool, args, ok: true, tookMs, cached: false, rawSnippet });
      console.log("[MCP]", tool, JSON.stringify(args), "ok", tookMs + "ms");
      return [result, entries[entries.length - 1]];
    } catch (err) {
      const tookMs = Date.now() - startedAt;
      push({ agentRole, tool, args, ok: false, tookMs, cached: false, error: err.message });
      console.log("[MCP]", tool, JSON.stringify(args), "FAIL", tookMs + "ms", err.message);
      throw err;
    }
  }

  function pushCached(tool, args, rawSnippet, tookMs = 0) {
    push({ agentRole, tool, args, ok: true, tookMs, cached: true, rawSnippet });
    console.log("[MCP]", tool, JSON.stringify(args), "cached", tookMs + "ms");
  }

  function pushTimeout(role, toolName) {
    push({
      agentRole: role || agentRole,
      tool: toolName || "unknown",
      args: {},
      ok: false,
      tookMs: 0,
      cached: false,
      error: "fanout_timeout",
    });
  }

  function drain() {
    return entries.splice(0, entries.length);
  }

  function snapshot() {
    return [...entries];
  }

  return { push, call, pushCached, pushTimeout, drain, snapshot };
}

// ── Current-request singleton ──────────────────────────────────────────
// Bitget adapter checks this so we don't need to thread traceCollector
// through every service layer. Set before fanout, clear after.

let _current = null;

export function setCurrentCollector(tc) {
  _current = tc;
}

export function getCurrentCollector() {
  return _current;
}

export function clearCurrentCollector() {
  _current = null;
}
