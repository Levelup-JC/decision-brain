import { chromium } from "playwright";
import { writeFileSync } from "fs";
import { join } from "path";

const URL = "https://decision-brain-gray.vercel.app";

function log(msg) { console.log(`  [${new Date().toLocaleTimeString()}] ${msg}`); }

async function forceSend(page, message) {
  await page.evaluate((msg) => {
    const input = document.getElementById("chatInput");
    const btn = document.getElementById("chatSendBtn");
    if (input) { input.disabled = false; input.value = msg; }
    if (btn) btn.disabled = false;
    if (input) input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }, message);
  log(`Sent: "${message}"`);
}

async function waitForReply(page, timeoutMs = 120000) {
  try {
    await page.waitForFunction(() => {
      const input = document.getElementById("chatInput");
      return input && !input.disabled;
    }, { timeout: timeoutMs });
  } catch { log("TIMEOUT waiting for reply"); }
  await page.waitForTimeout(2000);
}

// Get the LATEST chief reply bubble text only
async function getLatestChiefReply(page) {
  return await page.evaluate(() => {
    // Find all chief reply bubbles
    const bubbles = document.querySelectorAll('.bubble-chief, [data-role="chief"]');
    if (bubbles.length === 0) {
      // fallback: find by text content pattern
      const allDivs = document.querySelectorAll('#chatList > div, .chat-message');
      const candidates = [];
      allDivs.forEach(d => {
        if (d.textContent.length > 20) candidates.push(d.textContent.substring(0, 500));
      });
      return candidates.length ? candidates[candidates.length - 1] : "NO_CHIEF_BUBBLES";
    }
    const last = bubbles[bubbles.length - 1];
    return last.textContent.substring(0, 1000);
  });
}

// Get ALL chat messages in order with their content
async function getChatHistory(page) {
  return await page.evaluate(() => {
    const messages = [];
    const chatList = document.getElementById("chatList");
    if (!chatList) return [{ error: "chatList not found" }];
    const children = chatList.children;
    for (const child of children) {
      const text = child.textContent.substring(0, 300);
      const classes = child.className || "";
      messages.push({
        role: classes.includes("chief") ? "chief" :
              classes.includes("user") ? "user" :
              classes.includes("agent") ? "agent" : "other",
        text
      });
    }
    return messages;
  });
}

(async () => {
  console.log("=== B-VI DOM精度验证 ===\n");
  console.log(`URL: ${URL}\n`);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(4000);

  const results = [];

  // ============================================================
  // TEST 1: E1 "比特币怎么样" -> verify it answers about BTC
  // ============================================================
  log("\n=== Test 1: E1 比特币怎么样 ===");
  await forceSend(page, "比特币怎么样");
  await waitForReply(page, 120000);

  let reply = await getLatestChiefReply(page);
  log(`Latest Chief reply (first 500 chars): ${reply.substring(0, 500)}`);

  const e1_btcRelated = /比特币|BTC|Bitcoin/i.test(reply);
  results.push({
    test: "E1 比特币怎么样",
    pass: e1_btcRelated,
    detail: e1_btcRelated ? "Response mentions BTC/比特币" : "Response does NOT mention BTC",
    snippet: reply.substring(0, 200)
  });

  // ============================================================
  // TEST 2: E2 "它是什么" -> MUST answer about BTC without re-stating
  // ============================================================
  log("\n=== Test 2: E2 它是什么 (追问BTC) ===");
  const chatBeforeE2 = await getChatHistory(page);
  log(`Chat messages before E2: ${chatBeforeE2.length}`);

  await forceSend(page, "它是什么");
  await waitForReply(page, 120000);

  reply = await getLatestChiefReply(page);
  log(`Latest Chief reply (first 500 chars): ${reply.substring(0, 500)}`);

  // Critical check: does the answer to "它是什么" actually explain what BTC is?
  // Or does it say "不知道" / "未识别资产"?
  const e2_stale = /未识别资产|不知道这是什么|无法识别|没有指定|请提供资产/.test(reply);
  const e2_btc = /比特币|BTC|Bitcoin/i.test(reply);
  const e2_explains = /数字|加密|货币|区块链|去中心化|资产|网络|价值/i.test(reply);

  results.push({
    test: "E2 它是什么 (追问BTC)",
    pass: !e2_stale && e2_btc && e2_explains,
    detail: e2_stale
      ? `FAIL: stale response detected - "${reply.match(/未识别资产|不知道这是什么|无法识别|没有指定|请提供资产/i)?.[0]}"`
      : e2_btc
        ? (e2_explains ? "PASS: Explains BTC" : "WARN: mentions BTC but doesn't explain")
        : "FAIL: No BTC mention in response",
    snippet: reply.substring(0, 300)
  });

  // ============================================================
  // TEST 3: E3 "能加仓吗" -> MUST answer about adding to BTC
  // ============================================================
  log("\n=== Test 3: E3 能加仓吗 (追问BTC) ===");
  await forceSend(page, "能加仓吗");
  await waitForReply(page, 120000);

  reply = await getLatestChiefReply(page);
  log(`Latest Chief reply (first 500 chars): ${reply.substring(0, 500)}`);

  const e3_stale = /未识别资产|不知道|无法识别|没有指定|请提供资产|Missing required field/i.test(reply);
  const e3_btc = /比特币|BTC|Bitcoin/i.test(reply);
  const e3_add = /加仓|增持|买入|建仓|入场|仓位/i.test(reply);

  results.push({
    test: "E3 能加仓吗 (追问BTC)",
    pass: !e3_stale && (e3_btc || e3_add),
    detail: e3_stale
      ? `FAIL: stale response - "${reply.match(/未识别资产|不知道|无法识别|没有指定|请提供资产|Missing required field/i)?.[0]}"`
      : (e3_btc && e3_add ? "PASS: BTC add-position advice" : e3_add ? "PASS: add advice (coin name from previous)" : "WARN: unclear"),
    snippet: reply.substring(0, 300)
  });

  // ============================================================
  // TEST 4: E7 "卖一半" -> MUST answer about selling BTC
  // ============================================================
  log("\n=== Test 4: E7 卖一半 (追问BTC) ===");
  await forceSend(page, "卖一半");
  await waitForReply(page, 120000);

  reply = await getLatestChiefReply(page);
  log(`Latest Chief reply (first 500 chars): ${reply.substring(0, 500)}`);

  const e7_stale = /未识别资产|不知道|无法识别|没有指定|请提供资产|Missing required field/i.test(reply);
  const e7_btc = /比特币|BTC|Bitcoin/i.test(reply);
  const e7_sell = /卖|卖出|减仓|止盈|止损|仓位/i.test(reply);

  results.push({
    test: "E7 卖一半 (追问BTC)",
    pass: !e7_stale && (e7_btc || e7_sell),
    detail: e7_stale
      ? `FAIL: stale response - "${reply.match(/未识别资产|不知道|无法识别|没有指定|请提供资产|Missing required field/i)?.[0]}"`
      : (e7_btc && e7_sell ? "PASS: BTC sell advice" : e7_sell ? "PASS: sell advice" : "WARN: unclear"),
    snippet: reply.substring(0, 300)
  });

  // ============================================================
  // TEST 5: E4 "以太坊呢" -> switch to ETH
  // ============================================================
  log("\n=== Test 5: E4 以太坊呢 ===");
  await forceSend(page, "以太坊呢");
  await waitForReply(page, 120000);

  reply = await getLatestChiefReply(page);
  log(`Latest Chief reply (first 500 chars): ${reply.substring(0, 500)}`);

  const e4_stale = /未识别资产|不知道这是什么|无法识别/i.test(reply);
  const e4_eth = /以太坊|ETH|Ethereum/i.test(reply);

  results.push({
    test: "E4 以太坊呢 (切换到ETH)",
    pass: !e4_stale && e4_eth,
    detail: e4_stale
      ? `FAIL: stale - "${reply.match(/未识别资产|不知道这是什么|无法识别/i)?.[0]}"`
      : (e4_eth ? "PASS: ETH evaluation" : "FAIL: No ETH mention"),
    snippet: reply.substring(0, 300)
  });

  // ============================================================
  // TEST 6: E5 "卖 30%" -> MUST answer about selling ETH
  // ============================================================
  log("\n=== Test 6: E5 卖 30% (追问ETH) ===");
  await forceSend(page, "卖 30%");
  await waitForReply(page, 120000);

  reply = await getLatestChiefReply(page);
  log(`Latest Chief reply (first 500 chars): ${reply.substring(0, 500)}`);

  const e5_stale = /未识别资产|不知道|无法识别|没有指定|请提供资产|Missing required field/i.test(reply);
  const e5_eth = /以太坊|ETH|Ethereum/i.test(reply);
  const e5_sell = /卖|卖出|减仓|止盈|止损|仓位|30%|底仓|保留/i.test(reply);

  results.push({
    test: "E5 卖 30% (追问ETH)",
    pass: !e5_stale && (e5_eth || e5_sell),
    detail: e5_stale
      ? `FAIL: stale - "${reply.match(/未识别资产|不知道|无法识别|没有指定|请提供资产|Missing required field/i)?.[0]}"`
      : (e5_eth && e5_sell ? "PASS: ETH sell 30% advice" : e5_sell ? "PASS: sell advice" : "WARN: unclear"),
    snippet: reply.substring(0, 300)
  });

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log("\n========== DOM精度验证 SUMMARY ==========");
  let pass = 0, fail = 0;
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL";
    console.log(`\n${icon} ${r.test}`);
    console.log(`  Result: ${r.detail}`);
    console.log(`  Snippet: ${r.snippet.substring(0, 150)}...`);
    if (r.pass) pass++; else fail++;
  }
  console.log(`\n  ${pass} PASS / ${fail} FAIL / ${results.length} total`);
  console.log(`  Console errors: ${consoleErrors.length}`);

  const report = {
    timestamp: new Date().toISOString(),
    url: URL,
    console_errors: consoleErrors.length,
    results,
    summary: { pass, fail, total: results.length }
  };
  writeFileSync(
    join(import.meta.dirname, "B-VI-dom-verify-report.json"),
    JSON.stringify(report, null, 2)
  );

  await browser.close();
})();
