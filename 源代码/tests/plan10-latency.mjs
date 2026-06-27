#!/usr/bin/env node
// Plan X — A组: 响应时间基线
//
// Usage:
//   node tests/plan10-latency.mjs                                    # process-internal
//   node tests/plan10-latency.mjs --http=http://localhost:4177        # HTTP mode

import { runOrchestrator } from "../src/chat-orchestrator.mjs";
import { isRuleOnly } from "../src/llm-client.mjs";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(PROJECT_ROOT, "data");
const HTTP_FETCH_TIMEOUT_MS = 30000;

function parseHttpFlag(argv) {
  const arg = argv.find((a) => a.startsWith("--http="));
  if (!arg) return null;
  const url = arg.split("=")[1];
  try { new URL(url); return url.replace(/\/$/, ""); } catch { console.error(`Invalid --http URL: "${url}"`); process.exit(1); }
}

let _sharedProxyAgent = null;
function getFetchDispatcher() {
  if (_sharedProxyAgent) return _sharedProxyAgent;
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (proxyUrl) {
    try {
      _sharedProxyAgent = {
        dispatcher: new ProxyAgent({ uri: proxyUrl, requestTls: { rejectUnauthorized: false }, connections: 8, pipelining: 1 }),
        fetcher: undiciFetch,
      };
      return _sharedProxyAgent;
    } catch { return undefined; }
  }
  return undefined;
}

async function fetchChat(httpBase, message, sessionId, context = {}) {
  const body = { message, sessionId, context };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_FETCH_TIMEOUT_MS);
  const proxyConfig = getFetchDispatcher();
  const fetcher = proxyConfig?.fetcher || fetch;
  const fetchOpts = {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: controller.signal,
    ...(proxyConfig?.dispatcher ? { dispatcher: proxyConfig.dispatcher } : {}),
  };
  let resp;
  try { resp = await fetcher(`${httpBase}/api/chat`, fetchOpts); }
  finally { clearTimeout(timer); }
  if (!resp.ok) { const errText = await resp.text().catch(() => "unknown"); throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`); }
  return resp.json();
}

// ── Test Cases ────────────────────────────────────────────────────────

const TEST_CASES = [
  // Single asset fast queries: target P95 < 4s
  { id: "lat-btc", message: "BTC 是什么", sessionId: "lat-btc", iterations: 10 },
  // Committee queries: target P95 < 9s, no fanout_timeout
  { id: "lat-sol", message: "研究一下 SOL 值不值得买", sessionId: "lat-sol", iterations: 5 },
];

// ── Metrics ───────────────────────────────────────────────────────────

function computeStats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / n;
  const p50 = sorted[Math.floor(n * 0.5)];
  const p95 = sorted[Math.floor(n * 0.95)];
  const p99 = sorted[Math.floor(n * 0.99)];
  const min = sorted[0];
  const max = sorted[n - 1];
  return { n, avg, p50, p95, p99, min, max, sum };
}

// ── Runner ────────────────────────────────────────────────────────────

async function main() {
  const httpBase = parseHttpFlag(process.argv);
  const mode = httpBase ? `HTTP → ${httpBase}` : "process-internal";

  console.log(`Plan X Latency Baseline  [${mode}]`);
  console.log(`ruleOnly: ${isRuleOnly()}`);
  console.log("");

  const report = {
    meta: {
      version: "X-A1-1.0",
      mode: httpBase ? "http" : "process",
      http_base: httpBase || null,
      ruleOnly: isRuleOnly(),
      started_at: new Date().toISOString(),
    },
    cases: [],
  };

  for (const tc of TEST_CASES) {
    console.log(`Testing: ${tc.id} — "${tc.message}" (×${tc.iterations})`);
    const times = [];
    const details = [];

    for (let i = 0; i < tc.iterations; i++) {
      const t0 = Date.now();
      let result;
      try {
        result = httpBase
          ? await fetchChat(httpBase, tc.message, `${tc.sessionId}-${i}`, {})
          : await runOrchestrator(tc.message, `${tc.sessionId}-${i}`, {});
      } catch (err) {
        result = { ok: false, error: err.message };
      }
      const tookMs = Date.now() - t0;
      times.push(tookMs);
      details.push({
        iteration: i + 1,
        tookMs,
        intent: result.intent || null,
        degraded: result.degraded ?? null,
        hasTrace: Array.isArray(result.trace) && result.trace.length > 0,
        traceErrors: Array.isArray(result.trace) ? result.trace.filter((t) => !t.ok).map((t) => t.error) : [],
        replyPreview: (result.reply || result.error || "").slice(0, 120),
      });
      console.log(`  #${i + 1}: ${tookMs}ms  degraded=${result.degraded}  intent=${result.intent}`);
      if (httpBase && i < tc.iterations - 1) await new Promise((r) => setTimeout(r, 500));
    }

    const stats = computeStats(times);
    const degradedCount = details.filter((d) => d.degraded).length;
    const timeoutCount = details.filter((d) => d.traceErrors.some((e) => e === "fanout_timeout" || e === "agent_timeout")).length;

    console.log(`  Stats: avg=${stats.avg.toFixed(0)}ms p50=${stats.p50}ms p95=${stats.p95}ms min=${stats.min}ms max=${stats.max}ms`);
    console.log(`  Degraded: ${degradedCount}/${tc.iterations}  Timeouts: ${timeoutCount}/${tc.iterations}`);
    console.log("");

    report.cases.push({ id: tc.id, message: tc.message, stats, degradedCount, timeoutCount, details });
  }

  // Summary
  const btcCase = report.cases.find((c) => c.id === "lat-btc");
  const solCase = report.cases.find((c) => c.id === "lat-sol");

  console.log("═══════════════════════════════════════");
  console.log("SUMMARY");
  if (btcCase) {
    const pass = btcCase.stats.p95 < 4000 && btcCase.degradedCount === 0;
    console.log(`  BTC 是什么: P95=${btcCase.stats.p95}ms  degraded=${btcCase.degradedCount}/10  target=<4s,0 degraded → ${pass ? "PASS" : "FAIL"}`);
  }
  if (solCase) {
    const pass = solCase.stats.p95 < 9000 && solCase.timeoutCount === 0;
    console.log(`  研究 SOL: P95=${solCase.stats.p95}ms  timeouts=${solCase.timeoutCount}/5  target=<9s,0 timeout → ${pass ? "PASS" : "FAIL"}`);
  }

  // Write report
  await mkdir(OUTPUT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(OUTPUT_DIR, `plan10-latency-${ts}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nReport: ${reportPath}`);

  const allPass = (!btcCase || (btcCase.stats.p95 < 4000 && btcCase.degradedCount === 0))
    && (!solCase || (solCase.stats.p95 < 9000 && solCase.timeoutCount === 0));
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(2); });
