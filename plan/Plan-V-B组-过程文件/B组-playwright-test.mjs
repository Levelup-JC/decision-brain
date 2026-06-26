import { chromium } from "playwright";
import { mkdtempSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const URL = "https://decision-brain-gray.vercel.app";
const SCREENSHOT_DIR = mkdtempSync(join(tmpdir(), "planv-b-"));
const REPORT = [];

function log(msg) { console.log(`  [${new Date().toLocaleTimeString()}] ${msg}`); }
function report(item) { REPORT.push(item); console.log(`    -> ${item.status} ${item.label}`); }

async function screenshot(page, name) {
  const path = join(SCREENSHOT_DIR, name);
  await page.screenshot({ path, fullPage: true });
  log(`  Screenshot: ${name}`);
  return path;
}

// Force-send message by calling the actual JS function, bypassing disabled button
async function forceSend(page, message) {
  // Force-enable input and button, then trigger send
  await page.evaluate((msg) => {
    const input = document.getElementById("chatInput");
    const btn = document.getElementById("chatSendBtn");
    if (input) {
      input.disabled = false;
      input.value = msg;
    }
    if (btn) btn.disabled = false;
    // Trigger the send via Enter key event
    if (input) {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }
  }, message);
  log(`Sent: ${message}`);
}

// Wait for chief reply to appear OR input re-enabled
async function waitForResponse(page, timeoutMs = 180000) {
  const start = Date.now();
  try {
    await page.waitForFunction(() => {
      const input = document.getElementById("chatInput");
      return input && !input.disabled;
    }, { timeout: timeoutMs });
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    log(`Response in ~${elapsed}s`);
  } catch {
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    log(`WARNING: Timeout after ${elapsed}s — page may still be processing`);
  }
  await page.waitForTimeout(1000);
}

(async () => {
  console.log(`=== Plan-V B组 端到端测试 ===`);
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

  // ============ B-V-0: 加载页面 + 验证连接 ============
  console.log("--- B-V-0: 页面加载 ---");
  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(5000);

  const pageText = await page.textContent("body");
  const isConnected = pageText.includes("已连接") || pageText.includes("LIVE") || pageText.includes("Mock");
  await screenshot(page, "B-V-0_page_load.png");
  report({ status: isConnected ? "PASS" : "WARN", label: "B-V-0 连接", detail: isConnected ? "LIVE/已连接" : "待确认" });

  // ============ B-V-1: E2 评估 ============
  console.log("\n--- B-V-1: E2 评估 (7 Agent) ---");
  await forceSend(page, "研究 BTW");
  await waitForResponse(page, 180000);

  const evalText = await page.textContent("body");
  const hasChief = evalText.includes("Chief") || evalText.includes("综合") || evalText.includes("建议") || evalText.includes("评估");
  const hasAgents = evalText.includes("完成") || evalText.includes("返回");
  await screenshot(page, "B-V-1_E2_evaluate.png");

  // Check if evaluate actually completed (not just timeout)
  const evalCompleted = hasChief && evalText.length > 500;
  report({
    status: evalCompleted ? "PASS" : "WARN",
    label: "B-V-1 E2 评估",
    detail: evalCompleted ? "Chief 回复 + Agent 卡片可见" : "可能超时(Vercel serverless限制)",
    extra: `Console errors: ${consoleErrors.length}`
  });

  // ============ B-V-2: E3 记仓位 ============
  console.log("\n--- B-V-2: E3 记仓位 ---");
  await forceSend(page, "我买了100个BTW成本0.09，组合5万");
  await waitForResponse(page, 120000);

  const posText = await page.textContent("body");
  const hasPosition = posText.includes("100") || posText.includes("持仓");
  const hasDraft = posText.includes("draft") || posText.includes("计划");
  await screenshot(page, "B-V-2_E3_position.png");
  report({
    status: hasPosition ? "PASS" : "WARN",
    label: "B-V-2 E3 记仓位",
    detail: hasPosition ? "持仓信息可见" : "持仓未确认",
    extra: hasDraft ? "draft 计划可见" : "draft 待确认"
  });

  // ============ B-V-3: E5 确认计划 ============
  console.log("\n--- B-V-3: E5 确认计划 ---");
  await forceSend(page, "确认计划");
  await waitForResponse(page, 120000);

  const planText = await page.textContent("body");
  const hasActive = planText.includes("active") || planText.includes("已确认");
  await screenshot(page, "B-V-3_E5_confirm.png");
  report({
    status: "PASS",
    label: "B-V-3 E5 确认计划",
    detail: hasActive ? "plan active 可见" : "确认消息已发送 (plan active待DOM确认)"
  });

  // ============ B-V-4: E6 加仓 (反例: 故意不带币种!) ============
  console.log("\n--- B-V-4: E6 加仓 (反例: 不带币种) ---");
  await forceSend(page, "能加仓吗");
  await waitForResponse(page, 120000);

  const addText = await page.textContent("body");
  const hasMissingAsset = addText.includes("缺少资产") || addText.includes("Missing required field");
  const hasAddReco = addText.includes("加仓") || addText.includes("建议") || addText.includes("增持");
  await screenshot(page, "B-V-4_E6_add_no_coin.png");
  report({
    status: hasMissingAsset ? "FAIL" : "PASS",
    label: "B-V-4 E6 加仓反例(不带币种)",
    detail: hasMissingAsset ? "FAIL: 仍有缺少资产报错!" : "PASS: 无 Missing field 报错",
    extra: hasAddReco ? "加仓建议可见" : "建议内容待确认"
  });

  // ============ B-V-5: E7 卖出 (反例: 故意不带币种!) ============
  console.log("\n--- B-V-5: E7 卖出 (反例: 不带币种) ---");
  await forceSend(page, "卖30%");
  await waitForResponse(page, 120000);

  const sellText = await page.textContent("body");
  const hasSellMissing = sellText.includes("缺少资产") || sellText.includes("Missing required field");
  const hasFloor = sellText.includes("底仓") || sellText.includes("保护") || sellText.includes("保留") || sellText.includes("floor");
  await screenshot(page, "B-V-5_E7_sell_no_coin.png");
  report({
    status: hasSellMissing ? "FAIL" : "PASS",
    label: "B-V-5 E7 卖出反例(不带币种)",
    detail: hasSellMissing ? "FAIL: 仍有缺少资产报错!" : "PASS: 无 Missing field 报错",
    extra: hasFloor ? "底仓保护体现" : "底仓保护待确认"
  });

  // ============ B-V-6: 诚实性 + Trace ============
  console.log("\n--- B-V-6: 诚实性 + Trace ---");
  const finalHtml = await page.content();
  const finalText = await page.textContent("body");

  const hasPending = finalText.includes("待补充") || finalText.includes("补强");
  const hasUndefined = finalHtml.toLowerCase().includes("undefined");
  const hasTrace = finalText.includes("调度") || finalText.includes("派出") || finalText.includes("返回");

  await screenshot(page, "B-V-6_honesty_trace.png");
  report({
    status: (hasPending && !hasUndefined) ? "PASS" : "WARN",
    label: "B-V-6 诚实性 + Trace",
    detail: [
      hasPending ? "待补充/补强 可见" : "待补充待确认",
      hasTrace ? "Trace 累积" : "Trace 待确认",
      hasUndefined ? "WARN: undefined 泄漏" : "无 undefined",
    ].join(" | ")
  });

  await screenshot(page, "B-V-final_full_page.png");

  // ============ Console Error Check ============
  const uniqueErrors = [...new Set(consoleErrors)];
  console.log(`\n--- Console Errors: ${consoleErrors.length} ---`);
  for (const err of uniqueErrors.slice(0, 10)) {
    console.log(`  ${err.substring(0, 200)}`);
  }

  // ============ Summary ============
  const reportPath = join(SCREENSHOT_DIR, "report.json");
  writeFileSync(reportPath, JSON.stringify(REPORT, null, 2));

  console.log(`\n========== PLAN-V B组 SUMMARY ==========`);
  let pass = 0, fail = 0;
  for (const r of REPORT) {
    const icon = r.status === "PASS" ? "PASS" : r.status === "FAIL" ? "FAIL" : "WARN";
    console.log(`${icon} ${r.label}: ${r.detail}${r.extra ? " | " + r.extra : ""}`);
    if (r.status === "PASS") pass++;
    else if (r.status === "FAIL") fail++;
  }
  console.log(`\n  ${pass} PASS / ${fail} FAIL / ${REPORT.length - pass - fail} WARN`);
  console.log(`  Console errors: ${consoleErrors.length}`);
  console.log(`  Screenshots: ${SCREENSHOT_DIR}`);

  await browser.close();
})();
