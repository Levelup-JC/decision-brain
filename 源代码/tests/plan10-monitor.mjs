#!/usr/bin/env node
// Plan X — E组: 持续监控与主动建议 验收脚本
//
// Usage:
//   node tests/plan10-monitor.mjs --http=http://localhost:4177        # HTTP mode (local)
//   node tests/plan10-monitor.mjs --http=https://decision-brain-gray.vercel.app  # HTTP mode (public)

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(PROJECT_ROOT, "data");
const HTTP_FETCH_TIMEOUT_MS = 60000;

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
  if (!resp.ok) { const errText = await resp.text().catch(() => "unknown"); throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`); }
  return resp.json();
}

async function apiGet(httpBase, path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_FETCH_TIMEOUT_MS);
  const proxyConfig = getFetchDispatcher();
  const fetcher = proxyConfig?.fetcher || fetch;
  const fetchOpts = {
    method: "GET", signal: controller.signal,
    ...(proxyConfig?.dispatcher ? { dispatcher: proxyConfig.dispatcher } : {}),
  };
  let resp;
  try { resp = await fetcher(`${httpBase}${path}`, fetchOpts); }
  finally { clearTimeout(timer); }
  return resp.json();
}

// ── Test runner ─────────────────────────────────────────────────────

function assert(condition, label) {
  if (!condition) throw new Error(`ASSERT FAIL: ${label}`);
}

function assertContains(text, substr, label) {
  if (!String(text || "").includes(substr)) {
    throw new Error(`ASSERT FAIL: ${label} — expected "${substr}" not found in:\n${String(text).slice(0, 300)}`);
  }
}

function assertMatch(text, re, label) {
  if (!re.test(String(text || ""))) {
    throw new Error(`ASSERT FAIL: ${label} — pattern ${re} not matched in:\n${String(text).slice(0, 300)}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const httpBase = parseHttpFlag(process.argv);
  if (!httpBase) {
    console.error("E组 test requires --http= flag (HTTP mode only, need seeded state)");
    process.exit(1);
  }

  console.log(`Plan X E组 — 持续监控与主动建议验收  [HTTP → ${httpBase}]`);
  console.log("");

  const report = {
    meta: {
      version: "X-E-1.0",
      http_base: httpBase,
      started_at: new Date().toISOString(),
    },
    cases: [],
    summary: { pass: 0, fail: 0 },
  };

  const sessionId = `plan10-monitor-${Date.now()}`;
  const context = {};

  // ── Step 0: Check initial state ──
  console.log("── Step 0: Initial state check ──");
  const initialState = await apiGet(httpBase, "/api/state");
  console.log(`  Assets: ${initialState.counts?.assets || 0}, Plans: ${initialState.counts?.plans || 0}, Positions: ${initialState.counts?.positions || 0}`);

  // ── Step 1: Seed state — evaluate SOL, record position, confirm plan ──
  console.log("\n── Step 1: Seed state (研究 → 记录 → 确认) ──");

  console.log("  1a: 研究 SOL...");
  const evalResult = await apiPost(httpBase, "/api/chat", {
    message: "研究一下 SOL 值不值得买",
    sessionId,
    context,
  });
  console.log(`    intent=${evalResult.intent} reply=${(evalResult.reply || "").slice(0, 80)}`);

  console.log("  1b: 记录 SOL 仓位...");
  const posResult = await apiPost(httpBase, "/api/chat", {
    message: "我买了 SOL 100 个，成本 120",
    sessionId,
    context: { lastAsset: "SOL", lastIntent: "evaluate_candidate" },
  });
  console.log(`    intent=${posResult.intent} reply=${(posResult.reply || "").slice(0, 80)}`);

  console.log("  1c: 确认 SOL 计划...");
  const confirmResult = await apiPost(httpBase, "/api/chat", {
    message: "确认 SOL 计划",
    sessionId,
    context: { lastAsset: "SOL", lastIntent: "manage_position" },
  });
  console.log(`    intent=${confirmResult.intent} reply=${(posResult.reply || "").slice(0, 80)}`);

  // Verify plan status
  const stateAfterConfirm = await apiGet(httpBase, "/api/state");
  const solPlan = (stateAfterConfirm.plans || []).find((p) => p.assetSymbol === "SOL");
  console.log(`    SOL plan status: ${solPlan?.status || "NOT FOUND"}`);

  // ── Step 2: Test cases ──
  const testCases = [
    {
      id: "E-monitor-01",
      label: "运行监控 SOL",
      message: "检查一下 SOL 计划",
      checks: [
        { type: "contains", value: "SOL", label: "reply mentions SOL" },
        { type: "regex", value: /估值|zone|区间|conservative|base|aggressive/i, label: "reply mentions valuation zone" },
        { type: "regex", value: /价格|price|\$/i, label: "reply mentions price" },
      ],
    },
    {
      id: "E-monitor-02",
      label: "SOL 能加仓吗",
      message: "现在 SOL 能加仓吗",
      checks: [
        { type: "contains", value: "SOL", label: "reply mentions SOL" },
        { type: "regex", value: /估值|zone|区间|加仓|不加仓|建议/i, label: "reply has add/suggestion context" },
      ],
    },
    {
      id: "E-monitor-03",
      label: "SOL 该减仓吗",
      message: "SOL 该减仓吗",
      checks: [
        { type: "contains", value: "SOL", label: "reply mentions SOL" },
        { type: "regex", value: /卖出|减仓|估值|zone|建议|止盈/i, label: "reply has sell/suggestion context" },
      ],
    },
    {
      id: "E-monitor-04",
      label: "无 active plan 时监控引导",
      message: "检查一下 DOGE 计划",
      checks: [
        { type: "regex", value: /没有|暂无|未找到|不存在|先|建仓|记录/i, label: "reply guides when no plan exists" },
      ],
    },
  ];

  const monitorSessionId = `plan10-monitor-e2e-${Date.now()}`;

  for (const tc of testCases) {
    console.log(`\n── ${tc.id}: ${tc.label} ──`);
    const t0 = Date.now();

    let result;
    try {
      result = await apiPost(httpBase, "/api/chat", {
        message: tc.message,
        sessionId: monitorSessionId,
        context: { lastAsset: "SOL" },
      });
    } catch (err) {
      result = { ok: false, error: err.message };
    }

    const tookMs = Date.now() - t0;
    const reply = result.reply || result.error || "";
    console.log(`  tookMs=${tookMs}ms intent=${result.intent || "N/A"}`);
    console.log(`  reply: ${reply.slice(0, 150)}`);

    const caseReport = {
      id: tc.id,
      label: tc.label,
      tookMs,
      intent: result.intent || null,
      replyPreview: reply.slice(0, 300),
      checks: [],
      passed: true,
    };

    for (const check of tc.checks) {
      let ok = true;
      let detail = "";
      try {
        if (check.type === "contains") {
          ok = String(reply).includes(check.value);
          detail = ok ? "OK" : `missing "${check.value}"`;
        } else if (check.type === "regex") {
          ok = check.value.test(String(reply));
          detail = ok ? "OK" : `no match for ${check.value}`;
        }
      } catch (e) {
        ok = false;
        detail = e.message;
      }
      caseReport.checks.push({ label: check.label, ok, detail });
      if (!ok) caseReport.passed = false;
      console.log(`    ${ok ? "✓" : "✗"} ${check.label} ${detail}`);
    }

    if (caseReport.passed) report.summary.pass++;
    else report.summary.fail++;
    report.cases.push(caseReport);
  }

  // ── Summary ──
  console.log("\n═══════════════════════════════════════");
  console.log(`E组验收: ${report.summary.pass} pass / ${report.summary.fail} fail`);
  const allPass = report.summary.fail === 0;
  console.log(`Overall: ${allPass ? "PASS" : "FAIL"}`);

  // Write report
  await mkdir(OUTPUT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(OUTPUT_DIR, `plan10-monitor-${ts}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nReport: ${reportPath}`);

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(2); });
