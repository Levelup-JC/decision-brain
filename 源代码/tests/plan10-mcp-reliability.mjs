#!/usr/bin/env node
// Plan X B组 — MCP 数据可靠性验收脚本
// 连续快速请求 ENA / DOGE / AAVE，统计 traceHasMcp 成功率、缓存命中、retryCount
//
// Usage:
//   node tests/plan10-mcp-reliability.mjs                                    # process-internal
//   node tests/plan10-mcp-reliability.mjs --http=http://localhost:4177        # HTTP mode (local)
//   node tests/plan10-mcp-reliability.mjs --http=https://decision-brain-gray.vercel.app  # HTTP mode (public)

import { runOrchestrator } from "../src/chat-orchestrator.mjs";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(PROJECT_ROOT, "data");

const HTTP_FETCH_TIMEOUT_MS = 30_000;

const KNOWN_MCP_TOOLS = [
  "crypto_market", "dex_market", "macro_indicators", "rates_yields",
  "cross_asset", "defi_analytics", "network_status", "news_feed",
  "social_trending", "tradfi_news", "sentiment_index", "derivatives_sentiment",
  "technical_analysis", "crypto_derivatives", "global_assets",
];

// ── Helpers ──────────────────────────────────────────────────────────

function traceHasMcpCall(trace) {
  if (!Array.isArray(trace)) return false;
  return trace.some((t) => t.ok && KNOWN_MCP_TOOLS.includes(t.tool));
}

function hasCachedHit(trace) {
  if (!Array.isArray(trace)) return false;
  return trace.some((t) => t.cached === true);
}

function hasRetryCount(trace) {
  if (!Array.isArray(trace)) return false;
  return trace.some((t) => typeof t.retryCount === "number" && t.retryCount > 0);
}

function getRetryCounts(trace) {
  if (!Array.isArray(trace)) return [];
  return trace
    .filter((t) => typeof t.retryCount === "number" && t.retryCount > 0)
    .map((t) => ({ tool: t.tool, retryCount: t.retryCount }));
}

function parseHttpFlag(argv) {
  const arg = argv.find((a) => a.startsWith("--http="));
  if (!arg) return null;
  const url = arg.split("=")[1];
  try {
    new URL(url);
    return url.replace(/\/$/, "");
  } catch {
    console.error(`Invalid --http URL: "${url}"`);
    process.exit(1);
  }
}

let _sharedProxyAgent = null;
function getFetchDispatcher() {
  if (_sharedProxyAgent) return _sharedProxyAgent;
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (proxyUrl) {
    try {
      _sharedProxyAgent = {
        dispatcher: new ProxyAgent({
          uri: proxyUrl,
          requestTls: { rejectUnauthorized: false },
          connections: 8,
          pipelining: 1,
        }),
        fetcher: undiciFetch,
      };
      return _sharedProxyAgent;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function fetchChat(httpBase, message, sessionId) {
  const body = { message, sessionId, context: {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_FETCH_TIMEOUT_MS);
  const proxyConfig = getFetchDispatcher();
  const fetcher = proxyConfig?.fetcher || fetch;
  const fetchOpts = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
    ...(proxyConfig?.dispatcher ? { dispatcher: proxyConfig.dispatcher } : {}),
  };
  let resp;
  try {
    resp = await fetcher(`${httpBase}/api/chat`, fetchOpts);
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "unknown");
    throw new Error(`HTTP ${resp.status}: ${errorText.slice(0, 200)}`);
  }
  return resp.json();
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const httpBase = parseHttpFlag(process.argv);
  const mode = httpBase ? `HTTP (${httpBase})` : "process-internal";

  console.log(`Plan X B组 — MCP Reliability Test (${mode})`);
  console.log("─".repeat(60));

  const SYMBOLS = ["ENA", "DOGE", "AAVE"];
  const ROUNDS = 5; // each symbol queried 5 times

  const results = [];
  const startedAt = Date.now();

  // Round 1: rapid sequential queries (no delay between symbols)
  console.log("\n[Round 1] Rapid sequential queries (5 symbols each)...");
  for (let i = 0; i < ROUNDS; i++) {
    for (const symbol of SYMBOLS) {
      const sessionId = `p10-mcp-r1-${symbol}-${i}`;
      const message = `${symbol} 是什么`;

      try {
        let response;
        if (httpBase) {
          response = await fetchChat(httpBase, message, sessionId);
        } else {
          response = await runOrchestrator(message, sessionId, {});
        }

        const mcpOk = traceHasMcpCall(response.trace);
        const cached = hasCachedHit(response.trace);
        const retryCounts = getRetryCounts(response.trace);
        const tookMs = response.tookMs || 0;

        results.push({
          round: 1,
          symbol,
          index: i,
          sessionId,
          mcpOk,
          cached,
          retryCounts,
          tookMs,
          intent: response.intent,
          error: response.error || null,
        });

        console.log(
          `  ${symbol} #${i + 1}: mcp=${mcpOk ? "OK" : "FAIL"} cached=${cached} retries=${retryCounts.length} took=${tookMs}ms`
        );
      } catch (err) {
        results.push({
          round: 1,
          symbol,
          index: i,
          sessionId,
          mcpOk: false,
          cached: false,
          retryCounts: [],
          tookMs: 0,
          error: err.message,
        });
        console.log(`  ${symbol} #${i + 1}: ERROR ${err.message}`);
      }
    }
  }

  // Round 2: repeat to verify cache hits
  console.log("\n[Round 2] Cache verification (repeat queries)...");
  for (const symbol of SYMBOLS) {
    const sessionId = `p10-mcp-r2-${symbol}`;
    const message = `${symbol} 是什么`;

    try {
      let response;
      if (httpBase) {
        response = await fetchChat(httpBase, message, sessionId);
      } else {
        response = await runOrchestrator(message, sessionId, {});
      }

      const mcpOk = traceHasMcpCall(response.trace);
      const cached = hasCachedHit(response.trace);
      const retryCounts = getRetryCounts(response.trace);
      const tookMs = response.tookMs || 0;

      results.push({
        round: 2,
        symbol,
        index: 0,
        sessionId,
        mcpOk,
        cached,
        retryCounts,
        tookMs,
        intent: response.intent,
        error: response.error || null,
      });

      console.log(
        `  ${symbol}: mcp=${mcpOk ? "OK" : "FAIL"} cached=${cached} retries=${retryCounts.length} took=${tookMs}ms`
      );
    } catch (err) {
      results.push({
        round: 2,
        symbol,
        index: 0,
        sessionId,
        mcpOk: false,
        cached: false,
        retryCounts: [],
        tookMs: 0,
        error: err.message,
      });
      console.log(`  ${symbol}: ERROR ${err.message}`);
    }
  }

  const totalElapsed = Date.now() - startedAt;

  // ── Summary Statistics ──────────────────────────────────────────────

  const round1 = results.filter((r) => r.round === 1);
  const round2 = results.filter((r) => r.round === 2);

  const r1Success = round1.filter((r) => r.mcpOk).length;
  const r1Total = round1.length;
  const r1Rate = r1Total > 0 ? (r1Success / r1Total * 100).toFixed(1) : "N/A";

  const r2Success = round2.filter((r) => r.mcpOk).length;
  const r2Cached = round2.filter((r) => r.cached).length;
  const r2Total = round2.length;

  const allRetries = results.filter((r) => r.retryCounts.length > 0);
  const avgRound1Time = round1.length > 0
    ? Math.round(round1.reduce((sum, r) => sum + r.tookMs, 0) / round1.length)
    : 0;

  const summary = {
    test: "plan10-mcp-reliability",
    mode,
    timestamp: new Date().toISOString(),
    totalElapsedMs: totalElapsed,
    symbols: SYMBOLS,
    roundsPerSymbol: ROUNDS,
    round1: {
      total: r1Total,
      mcpSuccess: r1Success,
      successRate: `${r1Rate}%`,
      avgTookMs: avgRound1Time,
      errors: round1.filter((r) => r.error).length,
    },
    round2: {
      total: r2Total,
      mcpSuccess: r2Success,
      cachedHits: r2Cached,
      cacheHitRate: r2Total > 0 ? (r2Cached / r2Total * 100).toFixed(1) + "%" : "N/A",
    },
    retries: {
      totalCallsWithRetries: allRetries.length,
      details: allRetries.map((r) => ({ symbol: r.symbol, round: r.round, retryCounts: r.retryCounts })),
    },
    results,
  };

  console.log("\n" + "─".repeat(60));
  console.log("Summary:");
  console.log(`  Round 1 MCP success rate: ${r1Rate}% (${r1Success}/${r1Total})`);
  console.log(`  Round 1 avg response time: ${avgRound1Time}ms`);
  console.log(`  Round 2 cache hit rate: ${summary.round2.cacheHitRate} (${r2Cached}/${r2Total})`);
  console.log(`  Calls with retries: ${allRetries.length}`);
  if (allRetries.length > 0) {
    for (const r of allRetries) {
      console.log(`    ${r.symbol} round ${r.round}: ${JSON.stringify(r.retryCounts)}`);
    }
  }

  // ── Pass/Fail Verdict ──────────────────────────────────────────────

  const passRate = parseFloat(r1Rate);
  const passed = passRate >= 95 && summary.round2.cacheHitRate === "100.0%";

  console.log("\n" + "─".repeat(60));
  if (passed) {
    console.log("VERDICT: PASS");
    console.log("  - MCP success rate >= 95% ✓");
    console.log("  - Cache hits on repeat queries ✓");
  } else {
    console.log("VERDICT: FAIL");
    if (passRate < 95) console.log(`  - MCP success rate ${r1Rate}% < 95% threshold`);
    if (summary.round2.cacheHitRate !== "100.0%") console.log(`  - Cache hit rate ${summary.round2.cacheHitRate} < 100%`);
  }

  // ── Write JSON Report ──────────────────────────────────────────────

  await mkdir(OUTPUT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(OUTPUT_DIR, `plan10-mcp-reliability-${ts}.json`);
  await writeFile(jsonPath, JSON.stringify(summary, null, 2));
  console.log(`\nReport: ${jsonPath}`);

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
