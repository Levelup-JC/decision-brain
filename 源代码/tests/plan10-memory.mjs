#!/usr/bin/env node
// Plan X — C组 投资历史贯通 验收脚本
// Tests: portfolio overview, single-asset plan history, empty state
//
// Usage:
//   node tests/plan10-memory.mjs --http=http://localhost:4177
//   node tests/plan10-memory.mjs --http=https://decision-brain-gray.vercel.app

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(PROJECT_ROOT, "data");

const HTTP_FETCH_TIMEOUT_MS = 30_000;

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

async function apiPost(httpBase, path, body) {
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
    resp = await fetcher(`${httpBase}${path}`, fetchOpts);
  } finally {
    clearTimeout(timer);
  }
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
  const fetchOpts = {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    ...(proxyConfig?.dispatcher ? { dispatcher: proxyConfig.dispatcher } : {}),
  };
  let resp;
  try {
    resp = await fetcher(`${httpBase}${path}`, fetchOpts);
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "unknown");
    throw new Error(`HTTP ${resp.status}: ${errorText.slice(0, 200)}`);
  }
  return resp.json();
}

async function chat(httpBase, message, sessionId, context = {}) {
  return apiPost(httpBase, "/api/chat", { message, sessionId, context });
}

// ── State Preset ──────────────────────────────────────────────────────

async function presetState(httpBase) {
  console.log("  Presetting state: SOL position + plan...");
  // Register SOL as a managed position with a draft plan
  const r1 = await apiPost(httpBase, "/api/manage-position", {
    assetQuery: "SOL",
    units: 100,
    averageCost: 120,
    portfolioValue: 50000,
  });
  console.log(`    managePosition SOL: ok=${r1.ok}, plan status=${r1.plan?.status || "none"}`);

  // Confirm SOL plan (draft → active)
  const r2 = await apiPost(httpBase, "/api/confirm-plan", {
    assetQuery: "SOL",
  });
  console.log(`    confirmPlan SOL: ok=${r2.ok}, status=${r2.plan?.status || "none"}`);

  // Register BTC
  const r3 = await apiPost(httpBase, "/api/manage-position", {
    assetQuery: "BTC",
    units: 0.5,
    averageCost: 45000,
    portfolioValue: 50000,
  });
  console.log(`    managePosition BTC: ok=${r3.ok}, plan status=${r3.plan?.status || "none"}`);

  // Small delay for state writes
  await new Promise((r) => setTimeout(r, 500));

  return { sol: r1, solConfirm: r2, btc: r3 };
}

// ── Test Cases ────────────────────────────────────────────────────────

const TEST_CASES = [
  {
    id: "p10-mem-01",
    description: "我的持仓总览 — returns all positions with plan status",
    message: "我的持仓总览",
    sessionId: "p10-mem-01",
    assertions: {
      hasReply: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentIsMemory: (r) => r.intent === "lookup_memory",
      mentionsSol: (r) => /SOL/i.test(r.reply || ""),
      mentionsBtc: (r) => /BTC/i.test(r.reply || ""),
      mentionsActiveStatus: (r) => /active|活跃|监控中/i.test(r.reply || ""),
      mentionsDraftStatus: (r) => /draft|待确认|草稿/i.test(r.reply || ""),
      mentionsPlanStatus: (r) => /计划|plan/i.test(r.reply || ""),
      mentionsCostOrUnits: (r) => /100|120|0\.5|45000/i.test(r.reply || ""),
    },
  },
  {
    id: "p10-mem-02",
    description: "我的 SOL 计划是什么 — returns SOL plan details + valuation",
    message: "我的 SOL 计划是什么",
    sessionId: "p10-mem-02",
    assertions: {
      hasReply: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentIsMemory: (r) => r.intent === "lookup_memory",
      assetQueryIsSol: (r) => r.assetQuery === "SOL" || (r.reply || "").toUpperCase().includes("SOL"),
      mentionsPlanActive: (r) => /active|活跃|已确认/.test(r.reply || ""),
      mentionsValuation: (r) => /估值|valuation|conservative|base|aggressive/i.test(r.reply || ""),
      mentionsCostOrUnits: (r) => /100|120/.test(r.reply || ""),
    },
  },
  {
    id: "p10-mem-03",
    description: "我的投资历史 — returns structured history",
    message: "我之前买过什么",
    sessionId: "p10-mem-03",
    assertions: {
      hasReply: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      intentIsMemory: (r) => r.intent === "lookup_memory",
      mentionsMultipleAssets: (r) => {
        const reply = r.reply || "";
        const assetCount = (reply.match(/SOL/gi) || []).length + (reply.match(/BTC/gi) || []).length;
        return assetCount >= 2;
      },
    },
  },
  {
    id: "p10-mem-04",
    description: "空持仓说真话 — no positions, honest response",
    message: "我有什么持仓",
    sessionId: "p10-mem-04-new",
    needsReset: true,
    assertions: {
      hasReply: (r) => typeof r.reply === "string" && r.reply.trim().length > 0,
      noPositionsHonest: (r) => /暂无|没有|无.*持仓|无.*记录|还没有|尚无/.test(r.reply || ""),
      noFabricatedNumbers: (r) => {
        // Should not have dollar amounts for fabricated positions
        const reply = r.reply || "";
        const dollarMatches = reply.match(/\$\d/g);
        return !dollarMatches || dollarMatches.length === 0;
      },
    },
  },
  {
    id: "p10-mem-05",
    description: "API portfolio-summary — returns structured JSON",
    message: null, // Not a chat test, API direct test
    sessionId: "p10-mem-05-api",
    isApiTest: true,
    assertions: {
      apiReturnsOk: (r) => r.ok === true,
      hasPositions: (r) => Array.isArray(r.positions),
      totalCountMatch: (r) => r.totalCount === r.positions.length,
      eachPositionHasSymbol: (r) => r.positions.every((p) => typeof p.symbol === "string"),
      eachPositionHasPlanField: (r) => r.positions.every((p) => p.plan === null || typeof p.plan === "object"),
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
  console.log(`Plan X — C组 Memory Acceptance  [HTTP → ${httpBase}]`);
  console.log("");

  // Preset state
  console.log("Step 1: Preset state");
  let presetResult;
  try {
    presetResult = await presetState(httpBase);
    console.log("  State preset complete.\n");
  } catch (err) {
    console.error(`  State preset failed: ${err.message}`);
    console.error("  Ensure the server is running and API endpoints are available.\n");
    process.exit(1);
  }

  // Run test cases
  console.log("Step 2: Run test cases\n");

  const report = {
    meta: {
      version: "X-C-1.0",
      mode: "http",
      http_base: httpBase,
      started_at: new Date().toISOString(),
      total_cases: TEST_CASES.length,
    },
    preset: {
      sol_plan_status: presetResult.solConfirm?.plan?.status || "unknown",
      btc_plan_status: presetResult.btc?.plan?.status || "unknown",
    },
    results: [],
    summary: {
      total_cases: TEST_CASES.length,
      passed_cases: 0,
      failed_cases: 0,
      total_assertions: 0,
      passed_assertions: 0,
    },
  };

  for (const testCase of TEST_CASES) {
    // Reset state before running test case that needs empty state
    if (testCase.needsReset) {
      try {
        await apiPost(httpBase, "/api/reset", {});
        console.log("    State reset for empty-state test.");
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.error(`    State reset failed: ${err.message}`);
      }
    }

    const caseStart = Date.now();
    let result;

    if (testCase.isApiTest) {
      // Direct API test
      try {
        result = await apiGet(httpBase, "/api/portfolio-summary");
      } catch (err) {
        result = { ok: false, error: err.message };
      }
    } else {
      // Chat test
      try {
        result = await chat(httpBase, testCase.message, testCase.sessionId);
      } catch (err) {
        result = { ok: false, error: err.message };
      }
    }

    const tookMs = Date.now() - caseStart;
    const assertionResults = {};
    let allPassed = true;

    for (const [name, fn] of Object.entries(testCase.assertions)) {
      let passed = false;
      let error = null;
      try {
        passed = fn(result);
      } catch (err) {
        error = err.message;
      }
      assertionResults[name] = { passed, error };
      if (!passed) allPassed = false;
      report.summary.total_assertions++;
      if (passed) report.summary.passed_assertions++;
    }

    const caseReport = {
      id: testCase.id,
      description: testCase.description,
      passed: allPassed,
      tookMs,
      input: testCase.message || "(API direct)",
      intent: result.intent || null,
      assetQuery: result.assetQuery || null,
      replyPreview: (result.reply || result.error || JSON.stringify(result)).slice(0, 300),
      replyFull: result.reply || JSON.stringify(result) || "",
      apiData: testCase.isApiTest ? {
        totalCount: result.totalCount,
        positions: (result.positions || []).map((p) => ({
          symbol: p.symbol,
          units: p.units,
          planStatus: p.plan?.status || null,
          valuationZone: p.valuationZone || null,
        })),
      } : null,
      assertions: assertionResults,
    };

    report.results.push(caseReport);

    if (allPassed) {
      report.summary.passed_cases++;
    } else {
      report.summary.failed_cases++;
    }

    const icon = allPassed ? "PASS" : "FAIL";
    console.log(`  ${icon}  ${testCase.id}  (${tookMs}ms)  ${testCase.description}`);
    if (verbose || !allPassed) {
      for (const [name, ar] of Object.entries(assertionResults)) {
        const aIcon = ar.passed ? "  ✓" : "  ✗";
        const errMsg = ar.error ? ` — ${ar.error}` : "";
        console.log(`    ${aIcon} ${name}${errMsg}`);
      }
      if (!allPassed) {
        console.log(`    Reply: ${caseReport.replyPreview.slice(0, 200)}`);
      }
    }

    // Small delay between requests
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Summary
  console.log("");
  console.log(`Results: ${report.summary.passed_cases}/${report.summary.total_cases} cases passed`);
  console.log(`Assertions: ${report.summary.passed_assertions}/${report.summary.total_assertions} passed`);

  // Write report
  await mkdir(OUTPUT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(OUTPUT_DIR, `plan10-memory-${ts}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Report: ${reportPath}`);

  const allPassed = report.summary.failed_cases === 0;
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Plan X C组 memory acceptance fatal:", err);
  process.exit(2);
});
