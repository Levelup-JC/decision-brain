import { chromium } from "playwright";
import { writeFileSync } from "fs";
import { join } from "path";

const URL = process.env.TEST_URL || "https://decision-brain-gray.vercel.app";

function log(msg) { console.log(`  [${new Date().toLocaleTimeString()}] ${msg}`); }

function ts() { return Date.now(); }

async function forceSend(page, message) {
  await page.evaluate((msg) => {
    const input = document.getElementById("chatInput");
    const btn = document.getElementById("chatSendBtn");
    if (input) { input.value = msg; }
    if (input) input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }, message);
}

async function waitForInputEnabled(page, timeoutMs = 60000) {
  const start = ts();
  try {
    await page.waitForFunction(() => {
      const input = document.getElementById("chatInput");
      return input && !input.disabled;
    }, { timeout: timeoutMs });
    return ts() - start;
  } catch {
    return -1; // timeout
  }
}

async function getInputState(page) {
  return await page.evaluate(() => {
    const input = document.getElementById("chatInput");
    const btn = document.getElementById("chatSendBtn");
    return {
      inputDisabled: input ? input.disabled : null,
      btnDisabled: btn ? btn.disabled : null,
      btnText: btn ? btn.textContent : null,
      inputExists: !!input,
      btnExists: !!btn,
    };
  });
}

async function getLastErrorBubble(page) {
  return await page.evaluate(() => {
    const errors = document.querySelectorAll(".chat-msg.error");
    if (errors.length === 0) return null;
    const last = errors[errors.length - 1];
    return last.textContent.substring(0, 200);
  });
}

async function getChatCount(page) {
  return await page.evaluate(() => {
    const list = document.getElementById("chatList");
    return list ? list.children.length : 0;
  });
}

(async () => {
  console.log("=== B-VII-1 输入框防死锁验证 ===\n");
  console.log(`URL: ${URL}\n`);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  log(`Page loaded. Console errors so far: ${consoleErrors.length}`);

  const results = [];
  const screenshots = [];

  // ============================================================
  // TEST 1: 15-round pressure test — input always re-enabled
  // ============================================================
  log("\n=== Test 1: 15轮压力测试 ===");
  const roundMessages = [
    "比特币怎么样", "它是什么", "能加仓吗", "卖一半",
    "以太坊呢", "卖30%", "SOL怎么样", "它是什么",
    "能加仓吗", "卖50%", "比特币最近如何", "以太坊还能涨吗",
    "卖20%", "SOL卖一半", "再看看比特币",
  ];

  let freezeCount = 0;
  const roundResults = [];

  for (let i = 0; i < roundMessages.length; i++) {
    const msg = roundMessages[i];
    log(`Round ${i + 1}: "${msg}"`);

    const beforeState = await getInputState(page);
    await forceSend(page, msg);

    const recoveryMs = await waitForInputEnabled(page, 90000);
    const afterState = await getInputState(page);

    const roundOk = recoveryMs > 0 && !afterState.inputDisabled;
    if (!roundOk) freezeCount++;

    roundResults.push({
      round: i + 1,
      message: msg,
      recoveryMs,
      inputEnabled: !afterState.inputDisabled,
      btnEnabled: !afterState.btnDisabled,
      btnText: afterState.btnText,
    });

    log(`  Recovery: ${recoveryMs}ms, input disabled: ${afterState.inputDisabled}, btn disabled: ${afterState.btnDisabled}`);
  }

  const test1Pass = freezeCount === 0;
  results.push({
    test: "15轮压力测试-0死锁",
    pass: test1Pass,
    detail: test1Pass
      ? "PASS: All 15 rounds recovered, input always re-enabled"
      : `FAIL: ${freezeCount} round(s) had input stuck`,
    rounds: roundResults,
  });

  // Screenshot after 15 rounds
  await page.screenshot({ path: join(import.meta.dirname, "../Plan-VII-B组-截图/B-VII-1_15rounds_final.png"), fullPage: true });
  screenshots.push("B-VII-1_15rounds_final.png");

  // ============================================================
  // TEST 2: Mock 500 error — input recovers + error bubble shown
  // ============================================================
  log("\n=== Test 2: 模拟500错误 ===");

  await page.route("**/api/chat", async (route) => {
    await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"internal"}' });
  });

  const chatCountBefore = await getChatCount(page);
  await forceSend(page, "测试500错误");
  const recoveryMs = await waitForInputEnabled(page, 30000);
  await page.waitForTimeout(1000);

  const state500 = await getInputState(page);
  const errorBubble = await getLastErrorBubble(page);
  const chatCountAfter = await getChatCount(page);

  await page.unroute("**/api/chat");

  const test2Pass = !state500.inputDisabled && !state500.btnDisabled && !!errorBubble;
  results.push({
    test: "模拟500-输入框恢复+错误提示",
    pass: test2Pass,
    detail: test2Pass
      ? "PASS: Input recovered, error bubble visible"
      : `FAIL: inputDisabled=${state500.inputDisabled}, btnDisabled=${state500.btnDisabled}, errorBubble=${!!errorBubble}`,
    recoveryMs,
    errorBubble,
    bubblesAdded: chatCountAfter - chatCountBefore,
  });

  await page.screenshot({ path: join(import.meta.dirname, "../Plan-VII-B组-截图/B-VII-1_500_error.png"), fullPage: false });
  screenshots.push("B-VII-1_500_error.png");
  log(`  500 test: inputDisabled=${state500.inputDisabled}, errorBubble=${errorBubble?.substring(0, 50)}`);

  // ============================================================
  // TEST 3: Mock timeout — input recovers + timeout message
  // ============================================================
  log("\n=== Test 3: 模拟超时 ===");

  await page.route("**/api/chat", async (route) => {
    // Delay beyond the 25s AbortController timeout
    await new Promise(() => {}); // never resolves
  });

  await forceSend(page, "测试超时");
  const timeoutRecoveryMs = await waitForInputEnabled(page, 40000);
  await page.waitForTimeout(1000);

  const stateTimeout = await getInputState(page);
  const timeoutError = await getLastErrorBubble(page);

  await page.unroute("**/api/chat");

  const test3Pass = !stateTimeout.inputDisabled && !stateTimeout.btnDisabled && !!timeoutError;
  results.push({
    test: "模拟超时-输入框恢复+超时提示",
    pass: test3Pass,
    detail: test3Pass
      ? "PASS: Input recovered after timeout, timeout error bubble visible"
      : `FAIL: inputDisabled=${stateTimeout.inputDisabled}, btnDisabled=${stateTimeout.btnDisabled}, errorBubble=${!!timeoutError}`,
    recoveryMs: timeoutRecoveryMs,
    errorBubble: timeoutError,
  });

  await page.screenshot({ path: join(import.meta.dirname, "../Plan-VII-B组-截图/B-VII-1_timeout.png"), fullPage: false });
  screenshots.push("B-VII-1_timeout.png");
  log(`  Timeout test: inputDisabled=${stateTimeout.inputDisabled}, errorBubble=${timeoutError?.substring(0, 50)}`);

  // ============================================================
  // TEST 4: Network offline — input recovers + network error
  // ============================================================
  log("\n=== Test 4: 模拟断网 ===");

  await page.route("**/api/chat", async (route) => {
    await route.abort("failed");
  });

  await forceSend(page, "测试断网");
  const offlineRecoveryMs = await waitForInputEnabled(page, 30000);
  await page.waitForTimeout(1000);

  const stateOffline = await getInputState(page);
  const offlineError = await getLastErrorBubble(page);

  await page.unroute("**/api/chat");

  const test4Pass = !stateOffline.inputDisabled && !stateOffline.btnDisabled && !!offlineError;
  results.push({
    test: "模拟断网-输入框恢复+网络错误提示",
    pass: test4Pass,
    detail: test4Pass
      ? "PASS: Input recovered after network failure, error bubble visible"
      : `FAIL: inputDisabled=${stateOffline.inputDisabled}, btnDisabled=${stateOffline.btnDisabled}, errorBubble=${!!offlineError}`,
    recoveryMs: offlineRecoveryMs,
    errorBubble: offlineError,
  });

  await page.screenshot({ path: join(import.meta.dirname, "../Plan-VII-B组-截图/B-VII-1_offline.png"), fullPage: false });
  screenshots.push("B-VII-1_offline.png");
  log(`  Offline test: inputDisabled=${stateOffline.inputDisabled}, errorBubble=${offlineError?.substring(0, 50)}`);

  // ============================================================
  // TEST 5: Resp missing reply field — doesn't crash
  // ============================================================
  log("\n=== Test 5: resp缺失字段-reply为undefined ===");

  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        intent: "evaluate_candidate",
        assetQuery: "BTC",
        fanout: [],
      }),
    });
  });

  await forceSend(page, "测试缺字段");
  const missingRecoveryMs = await waitForInputEnabled(page, 30000);
  await page.waitForTimeout(1000);

  const stateMissing = await getInputState(page);

  await page.unroute("**/api/chat");

  const test5Pass = !stateMissing.inputDisabled && !stateMissing.btnDisabled;
  results.push({
    test: "resp缺reply字段-不抛错卡死",
    pass: test5Pass,
    detail: test5Pass
      ? "PASS: Missing reply handled gracefully, input recovered"
      : `FAIL: inputDisabled=${stateMissing.inputDisabled}, btnDisabled=${stateMissing.btnDisabled}`,
    recoveryMs: missingRecoveryMs,
  });

  await page.screenshot({ path: join(import.meta.dirname, "../Plan-VII-B组-截图/B-VII-1_missing_field.png"), fullPage: false });
  screenshots.push("B-VII-1_missing_field.png");
  log(`  Missing field test: inputDisabled=${stateMissing.inputDisabled}`);

  // ============================================================
  // TEST 6: Loading state visible during send
  // ============================================================
  log("\n=== Test 6: Loading态验证 ===");

  let btnTextDuringSend = null;
  await page.route("**/api/chat", async (route) => {
    btnTextDuringSend = await page.evaluate(() => {
      const btn = document.getElementById("chatSendBtn");
      return btn ? btn.textContent : null;
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        intent: "evaluate_candidate",
        assetQuery: "BTC",
        reply: "这是一个测试回复。",
        fanout: [],
      }),
    });
  });

  await forceSend(page, "loading测试");
  await waitForInputEnabled(page, 30000);
  await page.waitForTimeout(500);

  const stateAfterLoading = await getInputState(page);
  await page.unroute("**/api/chat");

  const test6Pass = btnTextDuringSend === "思考中..." && stateAfterLoading.btnText === "发送";
  results.push({
    test: "Loading态-按钮显示思考中并恢复",
    pass: test6Pass,
    detail: test6Pass
      ? "PASS: Button showed '思考中...' during send, restored to '发送' after"
      : `FAIL: btnText_during="${btnTextDuringSend}", btnText_after="${stateAfterLoading.btnText}"`,
    btnTextDuringSend,
    btnTextAfter: stateAfterLoading.btnText,
  });

  log(`  Loading test: during="${btnTextDuringSend}", after="${stateAfterLoading.btnText}"`);

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log("\n========== B-VII-1 防死锁验证 SUMMARY ==========");
  let pass = 0, fail = 0;
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL";
    console.log(`${icon} ${r.test}`);
    console.log(`  ${r.detail}`);
    if (r.pass) pass++; else fail++;
  }
  console.log(`\n  ${pass} PASS / ${fail} FAIL / ${results.length} total`);
  console.log(`  Console errors: ${consoleErrors.length}`);
  if (consoleErrors.length) {
    consoleErrors.forEach(e => console.log(`    - ${e}`));
  }

  const report = {
    timestamp: new Date().toISOString(),
    url: URL,
    commit: process.env.COMMIT || "unknown",
    test: "B-VII-1 输入框防死锁验证",
    results,
    console_errors: consoleErrors,
    screenshots,
    summary: { pass, fail, total: results.length },
  };

  const reportPath = join(import.meta.dirname, "B-VII-1-freeze-fix-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved: ${reportPath}`);

  await browser.close();

  // Exit code
  if (fail > 0) process.exit(1);
})();
