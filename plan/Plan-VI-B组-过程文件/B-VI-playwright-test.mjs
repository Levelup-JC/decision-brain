import { chromium } from "playwright";
import { mkdtempSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const URL = "https://decision-brain-gray.vercel.app";
const SCREENSHOT_DIR = mkdtempSync(join(tmpdir(), "planvi-b-"));
const REPORT = [];
const LATENCY_LOG = [];

function log(msg) { console.log(`  [${new Date().toLocaleTimeString()}] ${msg}`); }
function report(item) { REPORT.push(item); console.log(`    -> ${item.status} ${item.label}`); }

function screenshotName(seq, label) {
  return `B-VI-${seq}_${label.replace(/\s+/g, "_")}.png`;
}

async function takeShot(page, seq, label) {
  const name = screenshotName(seq, label);
  const path = join(SCREENSHOT_DIR, name);
  await page.screenshot({ path, fullPage: true });
  log(`  Screenshot: ${name}`);
  return path;
}

async function forceSend(page, message) {
  const ttfb = await page.evaluate((msg) => {
    return new Promise((resolve) => {
      const input = document.getElementById("chatInput");
      const btn = document.getElementById("chatSendBtn");
      if (input) {
        input.disabled = false;
        input.value = msg;
      }
      if (btn) btn.disabled = false;
      // Record send time in a data attr for TTFB measurement
      document.body.dataset.viSendTime = Date.now();
      if (input) {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      }
      resolve(document.body.dataset.viSendTime);
    });
  }, message);
  log(`Sent: "${message}"`);
  return ttfb;
}

async function waitForResponse(page, timeoutMs = 120000) {
  const start = Date.now();
  let firstReplyTime = null;
  try {
    await page.waitForFunction(() => {
      const input = document.getElementById("chatInput");
      return input && !input.disabled;
    }, { timeout: timeoutMs });
    firstReplyTime = Date.now();
    const elapsed = ((firstReplyTime - start) / 1000).toFixed(1);
    log(`Response in ~${elapsed}s`);
  } catch {
    firstReplyTime = Date.now();
    const elapsed = ((firstReplyTime - start) / 1000).toFixed(0);
    log(`WARNING: Timeout after ${elapsed}s`);
  }
  await page.waitForTimeout(1500);
  return firstReplyTime;
}

function checkCoinMention(text, expectedCoins) {
  for (const coin of expectedCoins) {
    if (text.includes(coin)) return coin;
  }
  return null;
}

function checkNoStalePhrases(text) {
  const stale = ["未识别资产", "不知道这是什么币", "missing required field", "缺少资产"];
  const found = [];
  for (const s of stale) {
    if (text.toLowerCase().includes(s.toLowerCase())) found.push(s);
  }
  return found;
}

// ======================================================================
// MAIN TEST
// ======================================================================
(async () => {
  console.log("=== Plan-VI B组 端到端验收测试 ===\n");
  console.log(`URL: ${URL}`);
  console.log(`Screenshots: ${SCREENSHOT_DIR}\n`);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  // ================================================================
  // PHASE 0: 页面加载 + 连接确认
  // ================================================================
  console.log("--- Phase 0: 页面加载 ---");
  const navStart = Date.now();
  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(5000);

  const pageText = await page.textContent("body");
  const isConnected = pageText.includes("已连接") || pageText.includes("LIVE") || pageText.includes("Mock");
  await takeShot(page, 0, "page_load");
  report({
    status: isConnected ? "PASS" : "WARN",
    label: "B-VI-0 页面连接",
    detail: isConnected ? "LIVE/已连接" : "待确认",
    extra: `Console: ${consoleErrors.length}`
  });

  // ================================================================
  // PHASE 1: B-VI-2 多资产独立测试 (BTC, ETH, SOL)
  // ================================================================
  console.log("\n--- Phase 1: B-VI-2 多资产独立测试 ---");
  const multiAssetResults = [];

  for (const asset of ["BTC", "ETH", "SOL"]) {
    console.log(`\n  -- Testing ${asset} --`);
    const assetStep = `研究 ${asset}`;
    const sendTs = await forceSend(page, assetStep);

    // Measure TTFB by watching DOM mutation
    const waitStart = Date.now();
    await waitForResponse(page, 120000);
    const ttfb = ((Date.now() - waitStart) / 1000).toFixed(1);

    const bodyText = await page.textContent("body");
    const coinFound = checkCoinMention(bodyText, [asset, asset === "SOL" ? "Solana" : asset]);
    const stalePhrases = checkNoStalePhrases(bodyText);

    LATENCY_LOG.push({ step: `B-VI-2 ${asset}`, ttfb_s: parseFloat(ttfb) });
    await takeShot(page, 2, `asset_${asset}`);

    multiAssetResults.push({
      asset,
      coinFound,
      stalePhrases,
      ttfb_s: parseFloat(ttfb),
      pass: coinFound !== null && stalePhrases.length === 0
    });
  }

  // ------------------------------------------------------------------
  report({
    status: multiAssetResults.every(r => r.pass) ? "PASS" : "FAIL",
    label: "B-VI-2 多资产覆盖 (BTC/ETH/SOL)",
    detail: multiAssetResults.map(r =>
      `${r.asset}: ${r.pass ? "OK" : `FAIL (${r.stalePhrases.join(",") || "coin missing"})`}`
    ).join(" | "),
    extra: `TTFB: ${multiAssetResults.map(r => `${r.asset}=${r.ttfb_s}s`).join(", ")}`
  });

  // ================================================================
  // PHASE 2: B-VI-1 追问链路连贯验收
  // ================================================================
  console.log("\n--- Phase 2: B-VI-1 追问链路 ---");

  const followupChain = [
    { seq: "E1", msg: "比特币怎么样", expectedCoin: ["BTC", "比特币", "Bitcoin"] },
    { seq: "E2", msg: "它是什么", expectedCoin: ["BTC", "比特币", "Bitcoin"], isFollowup: true },
    { seq: "E3", msg: "能加仓吗", expectedCoin: ["BTC", "比特币", "Bitcoin"], isFollowup: true },
    { seq: "E7", msg: "卖一半", expectedCoin: ["BTC", "比特币", "Bitcoin"], isFollowup: true, isSell: true },
    { seq: "E4", msg: "以太坊呢", expectedCoin: ["ETH", "以太坊", "Ethereum"] },
    { seq: "E5", msg: "卖 30%", expectedCoin: ["ETH", "以太坊", "Ethereum"], isFollowup: true, isSell: true },
  ];

  const followupResults = [];

  for (const step of followupChain) {
    console.log(`\n  -- ${step.seq}: "${step.msg}" ${step.isFollowup ? "(追问)" : ""} --`);
    const sendTs = await forceSend(page, step.msg);

    const waitStart = Date.now();
    await waitForResponse(page, 120000);
    const ttfb = ((Date.now() - waitStart) / 1000).toFixed(1);

    const bodyText = await page.textContent("body");
    const coinFound = checkCoinMention(bodyText, step.expectedCoin);
    const stalePhrases = checkNoStalePhrases(bodyText);

    LATENCY_LOG.push({
      step: `B-VI-1 ${step.seq} "${step.msg}"`,
      ttfb_s: parseFloat(ttfb),
      isSell: !!step.isSell
    });

    await takeShot(page, 1, `${step.seq}_${step.msg}`);

    const result = {
      seq: step.seq,
      msg: step.msg,
      isFollowup: step.isFollowup,
      coinFound,
      stalePhrases,
      ttfb_s: parseFloat(ttfb),
    };

    if (step.isSell) {
      result.sellTimeoutPass = parseFloat(ttfb) < 8.0;
      result.pass = coinFound !== null && stalePhrases.length === 0 && result.sellTimeoutPass;
    } else {
      result.pass = coinFound !== null && stalePhrases.length === 0;
    }

    followupResults.push(result);

    log(`  Coin found: ${coinFound || "NONE"} | Stale: ${stalePhrases.length ? stalePhrases.join(",") : "none"} | TTFB: ${ttfb}s`);
  }

  // ------------------------------------------------------------------
  const followupPassCount = followupResults.filter(r => r.pass).length;
  report({
    status: followupPassCount === followupChain.length ? "PASS" : "FAIL",
    label: "B-VI-1 追问链路连贯",
    detail: followupResults.map(r =>
      `${r.seq} "${r.msg}": ${r.pass ? "PASS" : `FAIL (coin=${r.coinFound || "missing"} stale=${r.stalePhrases.join(",")}`} ${r.ttfb_s}s`
    ).join(" | ")
  });

  // ================================================================
  // B-VI-3: TTFB Summary
  // ================================================================
  console.log("\n--- B-VI-3: TTFB Summary ---");
  const sellSteps = LATENCY_LOG.filter(l => l.isSell);
  const allSellPass = sellSteps.every(l => l.ttfb_s < 8.0);

  console.log("  Step latencies:");
  for (const l of LATENCY_LOG) {
    console.log(`    ${l.step}: ${l.ttfb_s}s${l.isSell ? (l.ttfb_s < 8 ? " [OK]" : " [TIMEOUT]") : ""}`);
  }

  report({
    status: allSellPass ? "PASS" : "FAIL",
    label: "B-VI-3 反例 sell 时延 < 8s",
    detail: sellSteps.map(l => `${l.step}: ${l.ttfb_s}s`).join(" | "),
    extra: `Avg TTFB: ${(LATENCY_LOG.reduce((s, l) => s + l.ttfb_s, 0) / LATENCY_LOG.length).toFixed(1)}s`
  });

  // ================================================================
  // PHASE 3: 最终检查
  // ================================================================
  console.log("\n--- Phase 3: 最终检查 ---");
  const finalHtml = await page.content();
  const finalText = await page.textContent("body");

  const hasUndefined = finalHtml.toLowerCase().includes("undefined");
  const hasPending = finalText.includes("待补充") || finalText.includes("补强");
  const hasTrace = finalText.includes("调度") || finalText.includes("派出") || finalText.includes("返回");

  await takeShot(page, 3, "final_state");
  report({
    status: (!hasUndefined) ? "PASS" : "FAIL",
    label: "B-VI 最终诚信检查",
    detail: [
      hasPending ? "待补充/补强可见" : "待补充待确认",
      hasTrace ? "Trace累积" : "Trace待确认",
      hasUndefined ? "FAIL: undefined泄漏" : "无undefined",
    ].join(" | ")
  });

  // ================================================================
  // CONSOLE ERROR CHECK
  // ================================================================
  const uniqueErrors = [...new Set(consoleErrors)];
  console.log(`\n--- Console Errors: ${consoleErrors.length} ---`);
  for (const err of uniqueErrors.slice(0, 10)) {
    console.log(`  ${err.substring(0, 200)}`);
  }

  report({
    status: consoleErrors.length === 0 ? "PASS" : "FAIL",
    label: "B-VI Console 0 Error",
    detail: consoleErrors.length === 0 ? "0 errors" : `${consoleErrors.length} errors`,
    extra: uniqueErrors.slice(0, 3).join("; ")
  });

  // ================================================================
  // SUMMARY
  // ================================================================
  const reportPath = join(SCREENSHOT_DIR, "B-VI-report.json");
  const fullReport = {
    plan: "Plan-VI",
    group: "B",
    timestamp: new Date().toISOString(),
    url: URL,
    screenshot_dir: SCREENSHOT_DIR,
    console_errors: consoleErrors.length,
    items: REPORT,
    latency_log: LATENCY_LOG,
  };
  writeFileSync(reportPath, JSON.stringify(fullReport, null, 2));

  console.log(`\n========== PLAN-VI B组 SUMMARY ==========`);
  let total = 0, pass = 0, fail = 0;
  for (const r of REPORT) {
    const icon = r.status === "PASS" ? "PASS" : r.status === "FAIL" ? "FAIL" : "WARN";
    console.log(`${icon} ${r.label}: ${r.detail}${r.extra ? " | " + r.extra : ""}`);
    total++;
    if (r.status === "PASS") pass++;
    else if (r.status === "FAIL") fail++;
  }
  console.log(`\n  ${pass} PASS / ${fail} FAIL / ${total - pass - fail} WARN`);
  console.log(`  Console errors: ${consoleErrors.length}`);
  console.log(`  Screenshots: ${SCREENSHOT_DIR}`);
  console.log(`  Report: ${reportPath}`);

  await browser.close();
})();
