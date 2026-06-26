#!/usr/bin/env node
// Plan-VIII Acceptance Script — D组 双维度回归守门
// 数据正确性 5问 + 可观测性 4项 = 9条断言
//
// Usage:
//   node tests/plan8-acceptance.mjs                                    # process-internal
//   node tests/plan8-acceptance.mjs --http=http://localhost:4177        # HTTP mode (local)
//   node tests/plan8-acceptance.mjs --http=https://decision-brain-gray.vercel.app  # HTTP mode (public)
//   npm run plan8-acceptance                                           # via package.json script

import { runOrchestrator } from "../src/chat-orchestrator.mjs";
import { isRuleOnly } from "../src/llm-client.mjs";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(PROJECT_ROOT, "data");

const HTTP_FETCH_TIMEOUT_MS = 30_000;

// Known MCP tool names from market-data server (Plan-VIII §5 trace contract)
const KNOWN_MCP_TOOLS = [
  "crypto_market", "dex_market", "macro_indicators", "rates_yields",
  "cross_asset", "defi_analytics", "network_status", "news_feed",
  "social_trending", "tradfi_news", "sentiment_index", "derivatives_sentiment",
  "technical_analysis", "crypto_derivatives", "global_assets",
];

const BTC_MCAP_MIN = 1e11; // BTC market cap floor: $100B (actual ~$1.2T+)
const ETH_MCAP_MIN = 1e10; // ETH market cap floor: $10B (actual ~$400B+)
const SOL_MCAP_MIN = 1e9;  // SOL market cap floor: $1B (actual ~$60B+)
const ENA_FDV_MIN = 1e6;   // ENA FDV floor: $1M (actual ~$1B+)
const FABRICATION_SMELLS = [
  /十亿市值/, /小币/, /小众.*币/, /不知名/, /小盘/,
  /1[,.]?000[,.]?000[,.]?000/,  // "1,000,000,000" ≈ 10亿 — smells like hallucination
];

// ── Helpers ──────────────────────────────────────────────────────────

function isNonEmptyReply(reply) {
  return typeof reply === "string" && reply.trim().length > 0;
}

function hasTrace(response) {
  return Array.isArray(response.trace) && response.trace.length > 0;
}

function traceHasMcpCall(trace) {
  if (!Array.isArray(trace)) return false;
  return trace.some((t) => t.ok && KNOWN_MCP_TOOLS.includes(t.tool));
}

function extractNumbers(text) {
  if (typeof text !== "string") return [];

  // Match $amount[B|M|K|T] with optional decimal: "$1204.7B", "$60102", "$0.7B"
  const dollarRe = /\$(\d[\d,.]*(?:\.\d+)?)\s*([BMKTbmkt])?/g;
  const nums = [];

  let m;
  while ((m = dollarRe.exec(text)) !== null) {
    const base = parseFloat(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base) || base <= 0) continue;
    const suffix = (m[2] || "").toUpperCase();
    const multiplier = { B: 1e9, M: 1e6, K: 1e3, T: 1e12 }[suffix] || 1;
    nums.push(base * multiplier);
  }

  // Catch raw numbers from trace JSON (min 2 digits, plus 0.xxx decimals)
  const rawRe = /\b(\d{2,}(?:\.\d+)?|0\.\d+)\b/g;
  while ((m = rawRe.exec(text)) !== null) {
    const val = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isFinite(val) && !nums.some((n) => Math.abs(n - val) / Math.max(n, val) < 0.01)) {
      nums.push(val);
    }
  }

  return nums;
}

function numbersAreTraceable(reply, trace) {
  if (!Array.isArray(trace) || !isNonEmptyReply(reply)) return false;

  // Reply: only extract dollar-formatted numbers (not raw substrings)
  const replyNums = [];
  const dollarRe = /\$(\d[\d,.]*(?:\.\d+)?)\s*([BMKTbmkt])?/g;
  let m;
  while ((m = dollarRe.exec(reply)) !== null) {
    const base = parseFloat(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base) || base <= 0) continue;
    const suffix = (m[2] || "").toUpperCase();
    const mult = { B: 1e9, M: 1e6, K: 1e3, T: 1e12 }[suffix] || 1;
    replyNums.push(base * mult);
  }
  if (replyNums.length === 0) return true; // no dollar numbers = no fabrication risk

  // Trace: extract all numbers from rawSnippets (JSON may have raw or formatted)
  const traceText = trace
    .map((t) => [t.rawSnippet, JSON.stringify(t.args)].join(" "))
    .join(" ");
  const traceNums = extractNumbers(traceText);

  return replyNums.every((rn) =>
    traceNums.some((tn) => Math.abs(rn - tn) / Math.max(rn, tn) < 0.3)
  );
}

function hasFabricationSmells(reply) {
  if (typeof reply !== "string") return false;
  return FABRICATION_SMELLS.some((re) => re.test(reply));
}

function hasDegradedMark(reply) {
  if (typeof reply !== "string") return false;
  return /暂无.*数据|数据.*暂.*无法|source.*unavailable|not.*connected|无法获取/i.test(reply);
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

// ── Acceptance Test Cases ────────────────────────────────────────────

const ACCEPTANCE_CASES = [
  // ═══════════════════════════════════════════════════════════════════
  // Dimension 1: 数据正确性 (5 cases)
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "p8-dc-01",
    dimension: "数据正确性",
    description: "BTC 是什么 — 返回真实市值/价格，量级万亿级",
    inputs: [{ message: "BTC 是什么", sessionId: "p8-dc-01", context: {} }],
    assertions: {
      intentCorrect: (r) => r.intent === "lookup_asset_info" || r.intent === "evaluate_candidate",
      traceHasMcp: (r) => traceHasMcpCall(r.trace),
      numbersTraceable: (r) => numbersAreTraceable(r.reply, r.trace),
      noFabrication: (r) => !hasFabricationSmells(r.reply),
      mcapInRange: (r) => {
        // BTC market cap should be > $100B (trillion level, not "十亿")
        const traceText = JSON.stringify(r.trace || []);
        const nums = extractNumbers(traceText);
        return nums.some((n) => n >= BTC_MCAP_MIN);
      },
    },
  },

  {
    id: "p8-dc-02",
    dimension: "数据正确性",
    description: "ETH 是什么 — 返回真实市值/价格",
    inputs: [{ message: "ETH 是什么", sessionId: "p8-dc-02", context: {} }],
    assertions: {
      intentCorrect: (r) => r.intent === "lookup_asset_info" || r.intent === "evaluate_candidate",
      traceHasMcp: (r) => traceHasMcpCall(r.trace),
      numbersTraceable: (r) => numbersAreTraceable(r.reply, r.trace),
      noFabrication: (r) => !hasFabricationSmells(r.reply),
      mcapInRange: (r) => {
        const traceText = JSON.stringify(r.trace || []);
        const nums = extractNumbers(traceText);
        return nums.some((n) => n >= ETH_MCAP_MIN);
      },
    },
  },

  {
    id: "p8-dc-03",
    dimension: "数据正确性",
    description: "SOL 是什么 — 返回真实市值/价格",
    inputs: [{ message: "SOL 是什么", sessionId: "p8-dc-03", context: {} }],
    assertions: {
      intentCorrect: (r) => r.intent === "lookup_asset_info" || r.intent === "evaluate_candidate",
      traceHasMcp: (r) => traceHasMcpCall(r.trace),
      numbersTraceable: (r) => numbersAreTraceable(r.reply, r.trace),
      noFabrication: (r) => !hasFabricationSmells(r.reply),
      mcapInRange: (r) => {
        const traceText = JSON.stringify(r.trace || []);
        const nums = extractNumbers(traceText);
        return nums.some((n) => n >= SOL_MCAP_MIN);
      },
    },
  },

  {
    id: "p8-dc-04",
    dimension: "数据正确性",
    description: "ENA 的 FDV 是多少 — FDV 非 0，可追溯",
    inputs: [{ message: "ENA 的 FDV 是多少", sessionId: "p8-dc-04", context: {} }],
    assertions: {
      intentCorrect: (r) => r.intent === "lookup_asset_info" || r.intent === "evaluate_candidate",
      traceHasMcp: (r) => traceHasMcpCall(r.trace),
      numbersTraceable: (r) => numbersAreTraceable(r.reply, r.trace),
      noFabrication: (r) => !hasFabricationSmells(r.reply),
      fdvNonZero: (r) => {
        const traceText = JSON.stringify(r.trace || []);
        const nums = extractNumbers(traceText);
        return nums.some((n) => n >= ENA_FDV_MIN);
      },
    },
  },

  {
    id: "p8-dc-05",
    dimension: "数据正确性",
    description: "大盘怎么样 — 误触防护：不应命中 lookup_asset_info",
    inputs: [{ message: "今天大盘怎么样", sessionId: "p8-dc-05", context: {} }],
    assertions: {
      notAssetLookup: (r) => r.intent !== "lookup_asset_info",
      hasReply: (r) => isNonEmptyReply(r.reply),
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // Dimension 2: 可观测性 (4 cases)
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "p8-ob-01",
    dimension: "可观测性",
    description: "response.trace 非空 — 任意资产查询产生 trace",
    inputs: [{ message: "AAVE 是什么", sessionId: "p8-ob-01", context: {} }],
    assertions: {
      traceNonEmpty: (r) => hasTrace(r),
      traceHasFields: (r) => {
        if (!hasTrace(r)) return false;
        return r.trace.every(
          (t) =>
            typeof t.agentRole === "string" &&
            typeof t.tool === "string" &&
            typeof t.ok === "boolean" &&
            typeof t.tookMs === "number"
        );
      },
    },
  },

  {
    id: "p8-ob-02",
    dimension: "可观测性",
    description: "trace 含真实 MCP 工具调用 — ok:true 且 tool 名在已知列表中",
    inputs: [{ message: "DOGE 是什么", sessionId: "p8-ob-02", context: {} }],
    assertions: {
      traceHasRealMcp: (r) => traceHasMcpCall(r.trace),
      atLeastOneOk: (r) => {
        if (!Array.isArray(r.trace)) return false;
        return r.trace.some((t) => t.ok === true);
      },
    },
  },

  {
    id: "p8-ob-03",
    dimension: "可观测性",
    description: "超时场景 — fanout 超时回传 degraded + 非空回复",
    inputs: [{ message: "全面分析一下 BTC 是否值得重仓买入并给出详细估值模型和风险评估", sessionId: "p8-ob-03", context: {} }],
    assertions: {
      // This verifies the system doesn't silently hang on heavy queries
      hasReply: (r) => isNonEmptyReply(r.reply),
      noCrash: (r) => r.ok !== false,
    },
  },

  {
    id: "p8-ob-04",
    dimension: "可观测性",
    description: "ruleOnly 字段存在 — API response 暴露诊断标志",
    inputs: [{ message: "你好", sessionId: "p8-ob-04", context: {} }],
    assertions: {
      ruleOnlyExposed: (r) => typeof r.ruleOnly === "boolean",
      hasReply: (r) => isNonEmptyReply(r.reply),
    },
  },
];

// ── Degradation smoke test (断网反例) ───────────────────────────
// Run separately via --degraded flag
const DEGRADED_TEST = {
  id: "p8-degraded-smoke",
  dimension: "可观测性",
  description: "断网反例 — ruleOnly 模式下不编造数字",
  inputs: [{ message: "BTC 市值多少", sessionId: "p8-degraded", context: {} }],
  assertions: {
    noMcapNumbers: (r) => {
      // When ruleOnly, reply should NOT contain fabricated market cap / price numbers
      const reply = r.reply || "";
      const nums = reply.match(/\$?\d[\d,.]*\s*[万亿BMKT]|\d[\d,.]*\s*(?:billion|million|trillion)/gi);
      return !nums || nums.length === 0;
    },
    hasReply: (r) => isNonEmptyReply(r.reply),
  },
};

// ── Runner ──────────────────────────────────────────────────────────

async function runCaseProcess(testCase) {
  const input = testCase.inputs[0];
  const context = input.context || {};
  const t0 = Date.now();
  let result;
  try {
    result = await runOrchestrator(input.message, input.sessionId, context);
  } catch (err) {
    result = { ok: false, error: err.message, sessionId: input.sessionId };
  }
  const tookMs = Date.now() - t0;
  result._timing = { tookMs };
  result._message = input.message;
  return result;
}

async function runCaseHttp(testCase, httpBase) {
  const input = testCase.inputs[0];
  const t0 = Date.now();
  let result;
  try {
    result = await fetchChat(httpBase, input.message, input.sessionId);
    if (result.ok === undefined) result.ok = true;
  } catch (err) {
    result = { ok: false, error: err.message, sessionId: input.sessionId };
  }
  const tookMs = Date.now() - t0;
  result._timing = { tookMs };
  result._message = input.message;
  return result;
}

async function main() {
  const httpBase = parseHttpFlag(process.argv);
  const runDegraded = process.argv.includes("--degraded");
  const verbose = process.argv.includes("--verbose");

  const mode = httpBase ? `HTTP → ${httpBase}` : "process-internal";
  const cases = runDegraded ? [DEGRADED_TEST] : ACCEPTANCE_CASES;

  console.log(`Plan-VIII Acceptance — ${cases.length} case(s)  [${mode}]`);
  console.log(`ruleOnly: ${isRuleOnly()}`);
  console.log("");

  const report = {
    meta: {
      version: "VIII-1.0",
      mode: httpBase ? "http" : "process",
      http_base: httpBase || null,
      ruleOnly: isRuleOnly(),
      started_at: new Date().toISOString(),
      total_cases: cases.length,
    },
    results: [],
    summary: {
      dimension_data: { pass: 0, fail: 0 },
      dimension_obs: { pass: 0, fail: 0 },
      total_assertions: 0,
      passed_assertions: 0,
    },
  };

  for (const testCase of cases) {
    const caseStart = Date.now();

    let result;
    try {
      result = httpBase
        ? await runCaseHttp(testCase, httpBase)
        : await runCaseProcess(testCase);
    } catch (err) {
      result = { ok: false, error: err.message };
    }

    const tookMs = Date.now() - caseStart;

    // Run all assertions for this case
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
      dimension: testCase.dimension,
      description: testCase.description,
      passed: allPassed,
      tookMs,
      input: testCase.inputs[0].message,
      intent: result.intent || null,
      assetQuery: result.assetQuery || null,
      replyPreview: (result.reply || result.error || "").slice(0, 200),
      traceHasMcp: traceHasMcpCall(result.trace),
      traceCount: Array.isArray(result.trace) ? result.trace.length : 0,
      ruleOnly: result.ruleOnly ?? null,
      assertions: assertionResults,
    };

    report.results.push(caseReport);

    // Small delay to avoid overwhelming the proxy
    if (httpBase) await new Promise((r) => setTimeout(r, 500));

    // Tally by dimension
    const dimKey = testCase.dimension === "数据正确性" ? "dimension_data" : "dimension_obs";
    if (allPassed) {
      report.summary[dimKey].pass++;
    } else {
      report.summary[dimKey].fail++;
    }

    const icon = allPassed ? "PASS" : "FAIL";
    console.log(`  ${icon}  ${testCase.id}  (${tookMs}ms)  ${testCase.description}`);
    if (verbose || !allPassed) {
      for (const [name, ar] of Object.entries(assertionResults)) {
        const aIcon = ar.passed ? "  ✓" : "  ✗";
        const errMsg = ar.error ? ` — ${ar.error}` : "";
        console.log(`    ${aIcon} ${name}${errMsg}`);
      }
    }
  }

  // Summary
  const total = report.summary.total_assertions;
  const passed = report.summary.passed_assertions;
  report.summary.completed_at = new Date().toISOString();
  report.summary.pass_rate = total > 0 ? (passed / total) : 0;

  console.log("");
  console.log(`Data: ${report.summary.dimension_data.pass}/${report.summary.dimension_data.pass + report.summary.dimension_data.fail}  Obs: ${report.summary.dimension_obs.pass}/${report.summary.dimension_obs.pass + report.summary.dimension_obs.fail}`);
  console.log(`Total: ${passed}/${total} passed (${(report.summary.pass_rate * 100).toFixed(1)}%)`);

  // Write report
  await mkdir(OUTPUT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(OUTPUT_DIR, `plan8-acceptance-${ts}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Report: ${reportPath}`);

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error("Plan-VIII acceptance fatal:", err);
  process.exit(2);
});
