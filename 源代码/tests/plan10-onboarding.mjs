#!/usr/bin/env node
// Plan X — D组: 首次建仓引导闭环 验收脚本
//
// Usage:
//   node tests/plan10-onboarding.mjs --http=http://localhost:4177
//   node tests/plan10-onboarding.mjs --http=https://decision-brain-gray.vercel.app

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(PROJECT_ROOT, "data");

const HTTP_FETCH_TIMEOUT_MS = 30_000;

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

async function fetchChat(httpBase, message, sessionId, context = {}) {
  const body = { message, sessionId, context };
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
  try { resp = await fetcher(`${httpBase}/api/chat`, fetchOpts); }
  finally { clearTimeout(timer); }
  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "unknown");
    throw new Error(`HTTP ${resp.status}: ${errorText.slice(0, 200)}`);
  }
  return resp.json();
}

function isNonEmptyReply(reply) {
  return typeof reply === "string" && reply.trim().length > 0;
}

function hasSuggestions(r) {
  return Array.isArray(r.suggestions) && r.suggestions.length > 0;
}

function suggestionContains(r, keyword) {
  if (!Array.isArray(r.suggestions)) return false;
  return r.suggestions.some((s) => s.includes(keyword));
}

// ── Acceptance Test Cases ────────────────────────────────────────────

const ONBOARDING_CASES = [
  {
    id: "px-d-01",
    description: "Step 1 — 研究 SOL（新 session）触发 evaluate_candidate，返回引导",
    inputs: [
      { message: "研究 SOL", sessionId: "px-d-onboard", context: {} }
    ],
    assertions: {
      intentIsEvaluate: (r) => r.intent === "evaluate_candidate",
      hasReply: (r) => isNonEmptyReply(r.reply),
      hasSuggestions: (r) => hasSuggestions(r),
      suggestsRecordPosition: (r) =>
        suggestionContains(r, "记录") || suggestionContains(r, "仓位") || suggestionContains(r, "持仓"),
    },
  },
  {
    id: "px-d-02",
    description: "Step 2 — 记录仓位（我买了 SOL 100 个，成本 120）生成 draft plan",
    inputs: [
      { message: "我买了 SOL 100 个，成本 120", sessionId: "px-d-onboard", context: { lastAsset: "SOL", lastIntent: "evaluate_candidate" } }
    ],
    assertions: {
      intentIsManage: (r) => r.intent === "manage_position",
      hasReply: (r) => isNonEmptyReply(r.reply),
      replyMentionsDraftOrPlan: (r) =>
        /draft|计划|plan|估值|估值区/i.test(r.reply || ""),
      hasSuggestions: (r) => hasSuggestions(r),
      suggestsConfirm: (r) =>
        suggestionContains(r, "确认") || suggestionContains(r, "计划"),
    },
  },
  {
    id: "px-d-03",
    description: "Step 3 — 确认 SOL 计划，plan 从 draft → active",
    inputs: [
      { message: "确认 SOL 计划", sessionId: "px-d-onboard", context: { lastAsset: "SOL", lastIntent: "manage_position" } }
    ],
    assertions: {
      intentIsConfirm: (r) => r.intent === "confirm_plan",
      hasReply: (r) => isNonEmptyReply(r.reply),
      replyMentionsActiveOrMonitor: (r) =>
        /active|激活|监控|监测|monitor/i.test(r.reply || ""),
      hasSuggestions: (r) => hasSuggestions(r),
    },
  },
  {
    id: "px-d-04",
    description: "新 session smalltalk — 首次交互给简短引导",
    inputs: [
      { message: "你好", sessionId: "px-d-fresh", context: {} }
    ],
    assertions: {
      intentIsSmalltalk: (r) => r.intent === "smalltalk",
      hasReply: (r) => isNonEmptyReply(r.reply),
      replyMentionsGuide: (r) =>
        /研究|记录|持仓|管理|仓位/i.test(r.reply || ""),
    },
  },
];

// ── State verification via /api/state ────────────────────────────────

async function fetchState(httpBase) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_FETCH_TIMEOUT_MS);
  const proxyConfig = getFetchDispatcher();
  const fetcher = proxyConfig?.fetcher || fetch;
  let resp;
  try { resp = await fetcher(`${httpBase}/api/state`, { signal: controller.signal, ...(proxyConfig?.dispatcher ? { dispatcher: proxyConfig.dispatcher } : {}) }); }
  finally { clearTimeout(timer); }
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ── Runner ──────────────────────────────────────────────────────────

async function runCaseHttp(testCase, httpBase) {
  const results = [];
  for (const input of testCase.inputs) {
    const t0 = Date.now();
    let result;
    try {
      result = await fetchChat(httpBase, input.message, input.sessionId, input.context || {});
      if (result.ok === undefined) result.ok = true;
    } catch (err) {
      result = { ok: false, error: err.message, sessionId: input.sessionId };
    }
    const tookMs = Date.now() - t0;
    result._timing = { tookMs };
    result._message = input.message;
    results.push(result);
  }
  return results;
}

async function main() {
  const httpBase = parseHttpFlag(process.argv);
  if (!httpBase) {
    console.error("ERROR: --http=<URL> is required for Plan X onboarding tests");
    console.error("Usage: node tests/plan10-onboarding.mjs --http=http://localhost:4177");
    process.exit(1);
  }

  const verbose = process.argv.includes("--verbose");
  const mode = `HTTP → ${httpBase}`;
  const cases = ONBOARDING_CASES;

  console.log(`Plan X D组 — Onboarding Acceptance: ${cases.length} case(s)  [${mode}]`);
  console.log("");

  const report = {
    meta: {
      version: "X-D-1.0",
      mode: "http",
      http_base: httpBase,
      started_at: new Date().toISOString(),
      total_cases: cases.length,
    },
    results: [],
    summary: { pass: 0, fail: 0, total_assertions: 0, passed_assertions: 0, failed_assertions: 0 },
  };

  for (const testCase of cases) {
    const caseResult = {
      case_id: testCase.id,
      description: testCase.description,
      assertions: {},
      allPassed: true,
      responses: [],
    };

    const responses = await runCaseHttp(testCase, httpBase);
    caseResult.responses = responses.map((r) => ({
      intent: r.intent,
      assetQuery: r.assetQuery,
      reply: (r.reply || "").slice(0, 300),
      replyFull: r.reply || "",
      suggestions: r.suggestions || [],
      tookMs: r._timing?.tookMs,
      error: r.error || null,
    }));

    // Run assertions against the last response (primary turn)
    const primary = responses[responses.length - 1];
    for (const [name, fn] of Object.entries(testCase.assertions)) {
      report.summary.total_assertions++;
      try {
        const passed = fn(primary);
        caseResult.assertions[name] = passed ? "PASS" : "FAIL";
        if (passed) report.summary.passed_assertions++;
        else { report.summary.failed_assertions++; caseResult.allPassed = false; }
      } catch (err) {
        caseResult.assertions[name] = `ERROR: ${err.message}`;
        report.summary.failed_assertions++;
        caseResult.allPassed = false;
      }
    }

    if (caseResult.allPassed) report.summary.pass++;
    else report.summary.fail++;

    report.results.push(caseResult);

    const status = caseResult.allPassed ? "PASS" : "FAIL";
    console.log(`  ${status}  ${testCase.id}: ${testCase.description}`);
    if (verbose) {
      for (const [name, result] of Object.entries(caseResult.assertions)) {
        console.log(`    ${result === "PASS" ? "✓" : "✗"} ${name}: ${result}`);
      }
      const lastResp = caseResult.responses[caseResult.responses.length - 1];
      if (lastResp) {
        console.log(`    reply: ${lastResp.reply}`);
        console.log(`    suggestions: [${(lastResp.suggestions || []).join(", ")}]`);
        console.log(`    tookMs: ${lastResp.tookMs}`);
      }
    }
  }

  // State verification
  console.log("");
  console.log("State verification (post-flow):");
  try {
    const state = await fetchState(httpBase);
    const plans = state.plans || {};
    const positions = state.positions || {};
    const planEntries = Object.values(plans);
    const activePlans = planEntries.filter((p) => p.status === "active");
    const draftPlans = planEntries.filter((p) => p.status === "draft");
    const solPlan = planEntries.find((p) => p.assetSymbol === "SOL" || (p.assetSymbol || "").toUpperCase() === "SOL");

    console.log(`  Total plans: ${planEntries.length}`);
    console.log(`  Draft plans: ${draftPlans.length}`);
    console.log(`  Active plans: ${activePlans.length}`);

    if (solPlan) {
      console.log(`  SOL plan status: ${solPlan.status}`);
      console.log(`  SOL plan has addZone: ${Boolean(solPlan.addZone)}`);
      console.log(`  SOL plan has holdZone: ${Boolean(solPlan.holdZone)}`);
      console.log(`  SOL plan has sellZone: ${Boolean(solPlan.sellZone)}`);
      const posEntries = Object.values(positions);
      const solPos = posEntries.find((p) => (p.assetSymbol || "").toUpperCase() === "SOL");
      if (solPos) {
        console.log(`  SOL position: ${solPos.units} units @ $${solPos.averageCost}`);
      }
    }

    report.stateSummary = {
      totalPlans: planEntries.length,
      draftPlans: draftPlans.length,
      activePlans: activePlans.length,
      solPlanStatus: solPlan?.status || "none",
      solPlanHasZones: solPlan ? Boolean(solPlan.addZone && solPlan.holdZone && solPlan.sellZone) : false,
    };
  } catch (err) {
    console.log(`  State fetch error: ${err.message}`);
    report.stateSummary = { error: err.message };
  }

  // Write report
  await mkdir(OUTPUT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(OUTPUT_DIR, `plan10-onboarding-${timestamp}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log("");
  console.log(`Report: ${reportPath}`);

  // Summary
  console.log("");
  console.log(`PASS: ${report.summary.pass}  FAIL: ${report.summary.fail}  Assertions: ${report.summary.passed_assertions}/${report.summary.total_assertions}`);

  const exitCode = report.summary.fail > 0 ? 1 : 0;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
