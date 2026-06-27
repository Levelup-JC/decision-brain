#!/usr/bin/env node
// Plan X F组 — 统一验收脚本 (9 cases)
// Covers: X-01 through X-09 as defined in Plan X §8 Task F1
//
// Usage:
//   node tests/plan10-dialog-acceptance.mjs --http=http://localhost:4177
//   node tests/plan10-dialog-acceptance.mjs --http=https://decision-brain-gray.vercel.app

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

function parseHttpFlag(argv) {
  const arg = argv.find((a) => a.startsWith("--http="));
  if (!arg) return null;
  const url = arg.split("=")[1];
  try { new URL(url); return url.replace(/\/$/, ""); } catch {
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
        dispatcher: new ProxyAgent({ uri: proxyUrl, requestTls: { rejectUnauthorized: false }, connections: 8, pipelining: 1 }),
        fetcher: undiciFetch,
      };
      return _sharedProxyAgent;
    } catch { return undefined; }
  }
  return undefined;
}

async function apiPost(httpBase, path, body) {
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
  try { resp = await fetcher(`${httpBase}${path}`, fetchOpts); }
  finally { clearTimeout(timer); }
  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "unknown");
    throw new Error(`HTTP ${resp.status}: ${errorText.slice(0, 200)}`);
  }
  return resp.json();
}

async function apiGet(httpBase, path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_FETCH_TIMEOUT_MS);
  const proxyConfig = getFetchDispatcher();
  const fetcher = proxyConfig?.fetcher || fetch;
  const resp = await fetcher(`${httpBase}${path}`, { signal: controller.signal, ...(proxyConfig?.dispatcher ? { dispatcher: proxyConfig.dispatcher } : {}) });
  clearTimeout(timer);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function chat(httpBase, message, sessionId, context = {}) {
  return apiPost(httpBase, "/api/chat", { message, sessionId, context });
}

function traceHasMcpCall(trace) {
  if (!Array.isArray(trace)) return false;
  return trace.some((t) => t.ok && KNOWN_MCP_TOOLS.includes(t.tool));
}

function traceHasFailure(trace) {
  if (!Array.isArray(trace)) return false;
  return trace.some((t) => !t.ok);
}

function hasDollarNumber(text) {
  return /\$[\d,]+/.test(text || "");
}

function numbersFromTraceCoverReply(reply, trace) {
  if (!Array.isArray(trace) || !reply) return true; // no dollars = no fabrication
  const dollarRe = /\$(\d[\d,.]*(?:\.\d+)?)\s*([BMKTbmkt])?/g;
  const replyNums = [];
  let m;
  while ((m = dollarRe.exec(reply)) !== null) {
    const base = parseFloat(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base) || base <= 0) continue;
    const suffix = (m[2] || "").toUpperCase();
    const mult = { B: 1e9, M: 1e6, K: 1e3, T: 1e12 }[suffix] || 1;
    replyNums.push(base * mult);
  }
  if (replyNums.length === 0) return true;

  const traceText = trace.map((t) => [t.rawSnippet, JSON.stringify(t.args)].join(" ")).join(" ");
  const traceNumRe = /\b(\d{2,}(?:\.\d+)?|0\.\d+)\b/g;
  const traceNums = [];
  while ((m = traceNumRe.exec(traceText)) !== null) {
    const val = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isFinite(val)) traceNums.push(val);
  }
  return replyNums.every((rn) => traceNums.some((tn) => Math.abs(rn - tn) / Math.max(rn, tn) < 0.3));
}

// ── Test Cases ────────────────────────────────────────────────────────

const TEST_CASES = [
  {
    id: "X-01", description: "BTC 是什么 — quick lookup, traceable numbers",
    message: "BTC 是什么", sessionId: "p10-x01",
    assertions: {
      replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentIsLookupAssetInfo: (r) => r.intent === "lookup_asset_info",
      hasPriceOrMCap: (r) => /\$|价格|市值|FDV|price|market/i.test(r.reply || ""),
      traceHasMcp: (r) => traceHasMcpCall(r.trace),
      numbersTraceable: (r) => numbersFromTraceCoverReply(r.reply, r.trace),
      notDegraded: (r) => r.degraded !== true,
    },
  },
  {
    id: "X-02", description: "ENA FDV 多少 — factual FDV only, no fabricated target price",
    message: "ENA FDV 多少", sessionId: "p10-x02",
    assertions: {
      replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentIsLookupAssetInfo: (r) => r.intent === "lookup_asset_info",
      noFabricatedTarget: (r) => !/目标价|target.*price|止损价|止盈价|入场价|target.*\$/.test(r.reply || ""),
      numbersTraceable: (r) => numbersFromTraceCoverReply(r.reply, r.trace),
    },
  },
  {
    id: "X-03", description: "我想买 SOL，帮我做计划 — onboarding guidance, one next-step question",
    message: "我想买 SOL，帮我做计划", sessionId: "p10-x03",
    assertions: {
      replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentIsEvaluateOrManage: (r) => ["evaluate_candidate", "manage_position"].includes(r.intent),
      hasSuggestions: (r) => Array.isArray(r.suggestions) && r.suggestions.length > 0,
      notExcessiveQuestions: (r) => {
        const reply = r.reply || "";
        const questionCount = (reply.match(/[?？]/g) || []).length;
        return questionCount <= 3; // at most a few questions, not bombarding user
      },
    },
  },
  {
    id: "X-04", description: "我买了 SOL 100 个，成本 120 — generates draft plan",
    message: "我买了 SOL 100 个，成本 120", sessionId: "p10-x04",
    assertions: {
      replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentIsManagePosition: (r) => r.intent === "manage_position",
      mentionsDraftOrPlan: (r) => /draft|计划|plan/i.test(r.reply || ""),
    },
  },
  {
    id: "X-05", description: "确认 SOL 计划 — plan becomes active",
    message: "确认 SOL 计划", sessionId: "p10-x04", // same session as X-04
    assertions: {
      replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentIsConfirmPlan: (r) => r.intent === "confirm_plan",
      mentionsActiveOrConfirmed: (r) => /active|激活|已确认|已生效|confirmed/i.test(r.reply || ""),
    },
  },
  {
    id: "X-06", description: "我的持仓总览 — all positions with plan status",
    message: "我的持仓总览", sessionId: "p10-x04", // same session after confirm
    assertions: {
      replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentIsMemory: (r) => r.intent === "lookup_memory",
      mentionsSol: (r) => /SOL/i.test(r.reply || ""),
      mentionsPlanStatus: (r) => /计划|plan|active|活跃|draft|待确认/i.test(r.reply || ""),
    },
  },
  {
    id: "X-07", description: "我之前 SOL 的投资计划是什么 — SOL plan summary",
    message: "我之前 SOL 的投资计划是什么", sessionId: "p10-x04",
    assertions: {
      replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentIsMemory: (r) => r.intent === "lookup_memory",
      mentionsSolPlan: (r) => /SOL/i.test(r.reply || "") && /计划|plan|估值|valuation/i.test(r.reply || ""),
    },
  },
  {
    id: "X-08", description: "检查一下 SOL 计划 — monitor vs plan comparison",
    message: "检查一下 SOL 计划", sessionId: "p10-x04",
    assertions: {
      replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentIsMonitor: (r) => r.intent === "run_monitor",
      hasComparison: (r) => /实时|当前.*vs|对比|估值.*区|zone/i.test(r.reply || ""),
    },
  },
  {
    id: "X-09", description: "Bad MCP URL + BTC 是什么 — no fabrication, honest degradation",
    message: "BTC 是什么", sessionId: "p10-x09-bad",
    needsBadMcp: true,
    assertions: {
      replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      noFabricatedDollar: (r) => !hasDollarNumber(r.reply || ""),
      honestDegradation: (r) => /暂无|不可用|无法获取|not available|暂未|稍后/i.test(r.reply || ""),
    },
  },
];

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const httpBase = parseHttpFlag(process.argv);
  if (!httpBase) {
    console.error("ERROR: --http=<base_url> is required (e.g. --http=http://localhost:4177)");
    process.exit(1);
  }

  const verbose = process.argv.includes("--verbose");
  console.log(`Plan X F组 — Dialog Acceptance  [HTTP → ${httpBase}]\n`);

  // Step 0: Reset state for clean start
  console.log("Step 0: Reset state");
  try {
    await apiPost(httpBase, "/api/reset", {});
    console.log("  State reset.\n");
  } catch (err) {
    console.error(`  Reset failed: ${err.message}\n`);
  }

  const report = {
    meta: {
      version: "X-F-1.0",
      mode: "http",
      http_base: httpBase,
      started_at: new Date().toISOString(),
      total_cases: TEST_CASES.length,
    },
    results: [],
    summary: { total_cases: TEST_CASES.length, passed: 0, failed: 0, total_assertions: 0, passed_assertions: 0 },
  };

  for (const tc of TEST_CASES) {
    const caseStart = Date.now();

    // Handle bad MCP URL case: set env override before request
    const origMcpUrl = process.env.MARKET_DATA_MCP_URL;
    if (tc.needsBadMcp) {
      process.env.MARKET_DATA_MCP_URL = "https://bad-mcp-host.invalid/mcp";
    }

    let result;
    try {
      result = await chat(httpBase, tc.message, tc.sessionId);
    } catch (err) {
      result = { ok: false, error: err.message, reply: "", trace: [] };
    }

    // Restore MCP URL
    if (tc.needsBadMcp) {
      if (origMcpUrl) process.env.MARKET_DATA_MCP_URL = origMcpUrl;
      else delete process.env.MARKET_DATA_MCP_URL;
    }

    const tookMs = Date.now() - caseStart;
    const assertionResults = {};
    let allPassed = true;

    for (const [name, fn] of Object.entries(tc.assertions)) {
      let passed = false;
      let error = null;
      try { passed = fn(result); } catch (err) { error = err.message; }
      assertionResults[name] = { passed, error };
      if (!passed) allPassed = false;
      report.summary.total_assertions++;
      if (passed) report.summary.passed_assertions++;
    }

    const caseReport = {
      id: tc.id,
      description: tc.description,
      passed: allPassed,
      tookMs,
      input: tc.message,
      intent: result.intent || null,
      assetQuery: result.assetQuery || null,
      replyPreview: (result.reply || result.error || "").slice(0, 300),
      replyFull: result.reply || "",
      traceSummary: (result.trace || []).map((t) => ({
        tool: t.tool, ok: t.ok, cached: t.cached || false, retryCount: t.retryCount,
      })),
      assertions: assertionResults,
    };

    report.results.push(caseReport);
    if (allPassed) report.summary.passed++;
    else report.summary.failed++;

    const icon = allPassed ? "PASS" : "FAIL";
    console.log(`  ${icon}  ${tc.id}  (${tookMs}ms)  ${tc.description}`);
    if (verbose || !allPassed) {
      for (const [name, ar] of Object.entries(assertionResults)) {
        const aIcon = ar.passed ? "  \u2713" : "  \u2717";
        const errMsg = ar.error ? ` \u2014 ${ar.error}` : "";
        console.log(`    ${aIcon} ${name}${errMsg}`);
      }
      if (!allPassed) console.log(`    Reply: ${caseReport.replyPreview.slice(0, 200)}`);
    }

    // Delay between cases
    await new Promise((r) => setTimeout(r, 500));
  }

  // Summary
  console.log(`\nResults: ${report.summary.passed}/${report.summary.total_cases} cases passed`);
  console.log(`Assertions: ${report.summary.passed_assertions}/${report.summary.total_assertions} passed`);

  const passRate = report.summary.total_cases > 0
    ? (report.summary.passed / report.summary.total_cases * 100).toFixed(1)
    : "N/A";
  console.log(`Pass rate: ${passRate}%`);

  // Write report
  await mkdir(OUTPUT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(OUTPUT_DIR, `plan10-acceptance-local-${ts}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nReport: ${reportPath}`);

  // 100% pass required for F组 sign-off
  const allPassed = report.summary.failed === 0;
  if (!allPassed) {
    console.log(`\nFAIL: ${report.summary.failed} case(s) failed. F组 sign-off requires 100% pass.`);
  } else {
    console.log("\nPASS: All cases passed. F组 sign-off ready.");
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
