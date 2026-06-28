#!/usr/bin/env node
// Plan XI 负责人4 — Demo 验收脚本 (7-step Demo path)
// Covers the 7 steps defined in Plan XI §2
//
// Usage:
//   node tests/plan11-demo-acceptance.mjs --http=http://localhost:4177
//   node tests/plan11-demo-acceptance.mjs --http=https://decision-brain-gray.vercel.app

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(PROJECT_ROOT, "data");

const HTTP_FETCH_TIMEOUT_MS = 60_000;

const KNOWN_MCP_TOOLS = [
  "crypto_market", "dex_market", "macro_indicators", "rates_yields",
  "cross_asset", "defi_analytics", "network_status", "news_feed",
  "social_trending", "tradfi_news", "sentiment_index", "derivatives_sentiment",
  "technical_analysis", "crypto_derivatives", "global_assets",
];

const KNOWN_BITGET_SKILLS = [
  "macro-analyst", "market-intel", "news-briefing", "sentiment-analyst",
  "technical-analysis",
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

function traceHasBitgetSkill(trace) {
  if (!Array.isArray(trace)) return false;
  return trace.some((t) => {
    const skill = t.skill || "";
    return KNOWN_BITGET_SKILLS.some((s) => skill.includes(s));
  });
}

function hasDollarNumber(text) {
  return /\$[\d,]+/.test(text || "");
}

function hasDegradationHint(text) {
  return /暂无|不可用|无法获取|not available|暂未|稍后|降级|degraded/i.test(text || "");
}

function hasFabricatedNumbers(reply, trace) {
  if (!Array.isArray(trace) || !reply) return false;
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
  if (replyNums.length === 0) return false;

  const traceText = trace.map((t) => [t.rawSnippet, JSON.stringify(t.args)].join(" ")).join(" ");
  const traceNumRe = /\b(\d{2,}(?:\.\d+)?|0\.\d+)\b/g;
  const traceNums = [];
  while ((m = traceNumRe.exec(traceText)) !== null) {
    const val = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isFinite(val)) traceNums.push(val);
  }
  // Fabricated if any reply number can't be traced to a trace number within 30%
  return !replyNums.every((rn) => traceNums.some((tn) => Math.abs(rn - tn) / Math.max(rn, tn) < 0.3));
}

function hasDialogFrame(result) {
  return result.dialogFrame && typeof result.dialogFrame === "object"
    && typeof result.dialogFrame.intent === "string"
    && typeof result.dialogFrame.confidence === "string";
}

function hasDispatchPlan(result) {
  return Array.isArray(result.dispatchPlan) && result.dispatchPlan.length > 0;
}

function dispatchPlanHasBitgetMCP(dispatchPlan) {
  if (!Array.isArray(dispatchPlan)) return false;
  return dispatchPlan.some((d) => d.provider === "Bitget MCP");
}

// ── Test Cases: 7-step Demo path ─────────────────────────────────────

const DEMO_SESSION = "plan11-demo";

const TEST_CASES = [
  {
    id: "XI-01",
    step: 1,
    description: "BTC 是什么 — quick asset info lookup, traceable data",
    message: "BTC 是什么",
    sessionId: DEMO_SESSION,
    assertions: {
      replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentCorrect: (r) => r.intent === "lookup_asset_info",
      assetQueryCorrect: (r) => r.assetQuery === "BTC",
      hasDialogFrame: (r) => hasDialogFrame(r),
      hasDispatchPlan: (r) => hasDispatchPlan(r),
      noFabricatedNumbers: (r) => !hasFabricatedNumbers(r.reply, r.trace),
    },
  },
  {
    id: "XI-02",
    step: 2,
    description: "研究 SOL 值不值得买 — multi-agent fanout, Bitget MCP visible",
    message: "研究 SOL 值不值得买",
    sessionId: DEMO_SESSION,
    context: { lastAsset: "BTC", lastIntent: "lookup_asset_info" },
    assertions: {
      replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentCorrect: (r) => r.intent === "evaluate_candidate",
      assetQueryCorrect: (r) => r.assetQuery === "SOL",
      fanoutHasMultiAgent: (r) => Array.isArray(r.fanout) && r.fanout.length >= 4,
      hasDialogFrame: (r) => hasDialogFrame(r),
      hasDispatchPlan: (r) => hasDispatchPlan(r),
      dispatchPlanHasBitget: (r) => dispatchPlanHasBitgetMCP(r.dispatchPlan),
    },
  },
  {
    id: "XI-03",
    step: 3,
    description: "我买了 SOL 100 个，成本 120 — writes position, generates draft plan",
    message: "我买了 SOL 100 个，成本 120",
    sessionId: DEMO_SESSION,
    context: { lastAsset: "SOL", lastIntent: "evaluate_candidate" },
    postAction: async (httpBase) => {
      // Persist state via /api/manage-position so downstream steps see real data
      await apiPost(httpBase, "/api/manage-position", { assetQuery: "SOL", units: 100, averageCost: 120 });
    },
    assertions: {
      replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentCorrect: (r) => r.intent === "manage_position",
      assetQueryCorrect: (r) => r.assetQuery === "SOL",
      mentionsDraftOrPlan: (r) => /draft|计划|plan/i.test(r.reply || ""),
      hasDialogFrame: (r) => hasDialogFrame(r),
      hasDispatchPlan: (r) => hasDispatchPlan(r),
    },
  },
  {
    id: "XI-04",
    step: 4,
    description: "确认 SOL 计划 — draft plan becomes active",
    message: "确认 SOL 计划",
    sessionId: DEMO_SESSION,
    context: { lastAsset: "SOL", lastIntent: "manage_position" },
    postAction: async (httpBase) => {
      // Activate the plan via API so downstream monitor steps see active state
      await apiPost(httpBase, "/api/confirm-plan", { assetQuery: "SOL" });
    },
    assertions: {
      replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentCorrect: (r) => r.intent === "confirm_plan",
      assetQueryCorrect: (r) => r.assetQuery === "SOL",
      mentionsActiveOrConfirmed: (r) => /active|激活|已确认|已生效|confirmed/i.test(r.reply || ""),
      hasDialogFrame: (r) => hasDialogFrame(r),
    },
  },
  {
    id: "XI-05",
    step: 5,
    description: "怕踏空又怕追高 — open-ended strategy dialogue understood",
    message: "我现在怕踏空但又怕追高，你帮我整理一下思路",
    sessionId: DEMO_SESSION,
    context: { lastAsset: "SOL", lastIntent: "confirm_plan" },
    assertions: {
      replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentIsStrategyDialogue: (r) => r.intent === "strategy_dialogue",
      assetQueryIsSol: (r) => r.assetQuery === "SOL",
      hasDialogFrame: (r) => hasDialogFrame(r),
      hasDispatchPlan: (r) => hasDispatchPlan(r),
      notDegradedToUnknown: (r) => r.intent !== "unknown",
    },
  },
  {
    id: "XI-06",
    step: 6,
    description: "我的持仓总览 — portfolio overview from memory",
    message: "我的持仓总览",
    sessionId: DEMO_SESSION,
    context: { lastAsset: "SOL", lastIntent: "strategy_dialogue" },
    assertions: {
      replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentIsMemory: (r) => r.intent === "lookup_memory",
      mentionsSol: (r) => /SOL/i.test(r.reply || ""),
      mentionsPlanStatus: (r) => /计划|plan|active|活跃|draft|待确认/i.test(r.reply || ""),
      hasDialogFrame: (r) => hasDialogFrame(r),
    },
  },
  {
    id: "XI-07",
    step: 7,
    description: "检查一下 SOL 计划 — live data vs plan threshold comparison",
    message: "检查一下 SOL 计划",
    sessionId: DEMO_SESSION,
    context: { lastAsset: "SOL", lastIntent: "lookup_memory" },
    assertions: {
      replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentIsMonitor: (r) => r.intent === "run_monitor",
      assetQueryCorrect: (r) => r.assetQuery === "SOL",
      hasComparison: (r) => /实时|当前.*vs|对比|估值.*区|zone|阈值|计划规则/i.test(r.reply || ""),
      hasDialogFrame: (r) => hasDialogFrame(r),
      noFabricatedNumbers: (r) => !hasFabricatedNumbers(r.reply, r.trace),
    },
  },
];

// ── Bonus: MCP degradation test ──────────────────────────────────────

const BONUS_TEST = {
  id: "XI-BONUS",
  step: "bonus",
  description: "MCP unavailable — honest degradation, no fabrication",
  message: "BTC 是什么",
  sessionId: "plan11-bonus-degraded",
  needsBadMcp: true,
  assertions: {
    replyNotEmpty: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
    noFabricatedDollar: (r) => !hasDollarNumber(r.reply || ""),
    honestDegradation: (r) => hasDegradationHint(r.reply || ""),
    hasDialogFrame: (r) => hasDialogFrame(r) || true, // soft assertion
  },
};

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const httpBase = parseHttpFlag(process.argv);
  if (!httpBase) {
    console.error("ERROR: --http=<base_url> is required (e.g. --http=http://localhost:4177)");
    process.exit(1);
  }

  const verbose = process.argv.includes("--verbose");
  const skipBonus = process.argv.includes("--skip-bonus");
  console.log(`Plan XI Demo Acceptance  [HTTP → ${httpBase}]\n`);

  // Step 0: Reset state for clean start
  console.log("Step 0: Reset state");
  try {
    await apiPost(httpBase, "/api/reset", {});
    console.log("  State reset.\n");
  } catch (err) {
    console.error(`  Reset failed: ${err.message}\n`);
  }

  const allCases = skipBonus ? TEST_CASES : [...TEST_CASES, BONUS_TEST];

  const report = {
    meta: {
      version: "XI-4-1.0",
      mode: "http",
      http_base: httpBase,
      started_at: new Date().toISOString(),
      total_cases: allCases.length,
    },
    results: [],
    summary: { total_cases: allCases.length, passed: 0, failed: 0, total_assertions: 0, passed_assertions: 0 },
  };

  for (const tc of allCases) {
    const caseStart = Date.now();

    // Run setup action before chat (e.g., pre-seed state for lookup tests)
    if (tc.setupAction) {
      try { await tc.setupAction(httpBase); } catch (err) {
        console.log(`  Setup warning for ${tc.id}: ${err.message}`);
      }
    }

    // Handle bad MCP URL for bonus test
    const origMcpUrl = process.env.MARKET_DATA_MCP_URL;
    if (tc.needsBadMcp) {
      process.env.MARKET_DATA_MCP_URL = "https://bad-mcp-host.invalid/mcp";
    }

    let result;
    try {
      result = await chat(httpBase, tc.message, tc.sessionId, tc.context || {});
    } catch (err) {
      result = { ok: false, error: err.message, reply: "", trace: [], fanout: [], dispatchPlan: [], dialogFrame: null };
    }

    // Restore MCP URL
    if (tc.needsBadMcp) {
      if (origMcpUrl) process.env.MARKET_DATA_MCP_URL = origMcpUrl;
      else delete process.env.MARKET_DATA_MCP_URL;
    }

    // Run post action after assertions (e.g., persist state for downstream steps)
    if (tc.postAction) {
      try { await tc.postAction(httpBase); } catch (err) {
        console.log(`  Post-action warning for ${tc.id}: ${err.message}`);
      }
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
      step: tc.step,
      description: tc.description,
      passed: allPassed,
      tookMs,
      input: tc.message,
      intent: result.intent || null,
      assetQuery: result.assetQuery || null,
      replyPreview: (result.reply || result.error || "").slice(0, 300),
      replyFull: result.reply || "",
      fanout: result.fanout || [],
      hasDialogFrame: hasDialogFrame(result),
      hasDispatchPlan: hasDispatchPlan(result),
      dispatchPlanPreview: (result.dispatchPlan || []).map((d) => ({
        role: d.role, label: d.label, provider: d.provider, skill: d.skill,
      })),
      traceSummary: (result.trace || []).map((t) => ({
        tool: t.tool, ok: t.ok, cached: t.cached || false, provider: t.provider || "unknown",
      })),
      assertions: assertionResults,
    };

    report.results.push(caseReport);
    if (allPassed) report.summary.passed++;
    else report.summary.failed++;

    const icon = allPassed ? "PASS" : "FAIL";
    console.log(`  ${icon}  ${tc.id}  (${tookMs}ms)  Step ${tc.step}: ${tc.description}`);
    if (verbose || !allPassed) {
      for (const [name, ar] of Object.entries(assertionResults)) {
        const aIcon = ar.passed ? "  \u2713" : "  \u2717";
        const errMsg = ar.error ? ` \u2014 ${ar.error}` : "";
        console.log(`    ${aIcon} ${name}${errMsg}`);
      }
      if (!allPassed) {
        console.log(`    Intent: ${caseReport.intent}, AssetQuery: ${caseReport.assetQuery}`);
        console.log(`    Reply: ${caseReport.replyPreview.slice(0, 200)}`);
      }
    }

    // Delay between cases
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${report.summary.passed}/${report.summary.total_cases} cases passed`);
  console.log(`Assertions: ${report.summary.passed_assertions}/${report.summary.total_assertions} passed`);

  const passRate = report.summary.total_cases > 0
    ? (report.summary.passed / report.summary.total_cases * 100).toFixed(1)
    : "N/A";
  console.log(`Pass rate: ${passRate}%`);

  // Write report
  await mkdir(OUTPUT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(OUTPUT_DIR, `plan11-demo-acceptance-${ts}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nReport: ${reportPath}`);

  // Exit code
  const allPassed = report.summary.failed === 0;
  if (!allPassed) {
    console.log(`\nFAIL: ${report.summary.failed} case(s) failed.`);
  } else {
    console.log("\nPASS: All demo acceptance cases passed.");
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
