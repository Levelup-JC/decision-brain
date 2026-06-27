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

import { AsyncLocalStorage } from "node:async_hooks";

const RAW_SNIPPET_MAX = 200;
const _als = new AsyncLocalStorage();

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
      const entry = { agentRole, tool, args, ok: true, tookMs, cached: false, rawSnippet };
      if (typeof result?.retryCount === "number" && result.retryCount > 0) {
        entry.retryCount = result.retryCount;
      }
      push(entry);
      console.log("[MCP]", tool, JSON.stringify(args), "ok", tookMs + "ms", result.retryCount ? `(retry:${result.retryCount})` : "");
      return [result, entries[entries.length - 1]];
    } catch (err) {
      const tookMs = Date.now() - startedAt;
      const entry = { agentRole, tool, args, ok: false, tookMs, cached: false, error: err.message };
      if (typeof err?.retryCount === "number" && err.retryCount > 0) {
        entry.retryCount = err.retryCount;
      }
      push(entry);
      console.log("[MCP]", tool, JSON.stringify(args), "FAIL", tookMs + "ms", err.message, err.retryCount ? `(retries:${err.retryCount})` : "");
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

// ── Per-branch trace collector via AsyncLocalStorage ─────────────────
// Each concurrent agent branch gets its own collector, no cross-talk.

export function runWithCollector(tc, fn) {
  return _als.run(tc, fn);
}

export function getCurrentCollector() {
  return _als.getStore();
}
