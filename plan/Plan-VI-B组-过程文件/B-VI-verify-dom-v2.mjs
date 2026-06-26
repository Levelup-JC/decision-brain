import { chromium } from "playwright";
import { writeFileSync } from "fs";
import { join } from "path";

const URL = "http://localhost:4177";

function log(msg) { console.log(`  [${new Date().toLocaleTimeString()}] ${msg}`); }

async function sendMessage(page, message) {
  const input = page.locator("#chatInput");
  const btn = page.locator("#chatSendBtn");
  await input.waitFor({ state: "visible", timeout: 10000 });
  await input.fill(message);
  await page.waitForTimeout(200);
  await btn.click();
  log(`Sent: "${message}"`);
}

async function waitForReply(page, timeoutMs = 120000) {
  try {
    await page.waitForFunction(() => {
      const input = document.getElementById("chatInput");
      return input && !input.disabled;
    }, { timeout: timeoutMs });
  } catch { log("TIMEOUT waiting for reply"); }
  await page.waitForTimeout(3000);
}

async function getLatestChiefReply(page) {
  return await page.evaluate(() => {
    const bubbles = document.querySelectorAll('.chat-msg.chief, [data-role="chief"]');
    if (bubbles.length === 0) {
      const allDivs = document.querySelectorAll('#chatList > div');
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

async function getChatMessageCount(page) {
  return await page.evaluate(() => {
    const list = document.getElementById("chatList");
    return list ? list.children.length : 0;
  });
}

(async () => {
  console.log("=== B-VI DOM精度验证 v2 (修复后, localhost) ===\n");
  console.log(`URL: ${URL}\n`);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);

  const results = [];
  let msgCount;

  // ============================================================
  // TEST 1: E1 "比特币怎么样"
  // ============================================================
  log("\n=== Test 1: E1 比特币怎么样 ===");
  msgCount = await getChatMessageCount(page);
  log(`Chat messages before E1: ${msgCount}`);

  const t0 = Date.now();
  await sendMessage(page, "比特币怎么样");
  await waitForReply(page, 120000);
  const e1Ttfb = Date.now() - t0;

  let reply = await getLatestChiefReply(page);
  log(`E1 TTFB: ${e1Ttfb}ms`);
  log(`Latest Chief reply (first 300 chars): ${reply.substring(0, 300)}`);

  const e1_btc = /比特币|BTC|Bitcoin/i.test(reply);
  results.push({
    test: "E1 比特币怎么样",
    pass: e1_btc,
    detail: e1_btc ? "Response mentions BTC/比特币" : "Response does NOT mention BTC",
    ttfb: e1Ttfb,
    snippet: reply.substring(0, 200),
  });

  // ============================================================
  // TEST 2: E2 "它是什么" — MUST answer about BTC
  // ============================================================
  log("\n=== Test 2: E2 它是什么 (追问BTC) ===");
  msgCount = await getChatMessageCount(page);
  log(`Chat messages before E2: ${msgCount}`);

  const t2 = Date.now();
  await sendMessage(page, "它是什么");
  await waitForReply(page, 120000);
  const e2Ttfb = Date.now() - t2;

  reply = await getLatestChiefReply(page);
  log(`E2 TTFB: ${e2Ttfb}ms`);
  log(`Latest Chief reply (first 300 chars): ${reply.substring(0, 300)}`);

  const e2_stale = /未识别资产|不知道这是什么|无法识别|没有指定|请提供资产/i.test(reply);
  const e2_btc = /比特币|BTC|Bitcoin/i.test(reply);
  const e2_explains = /数字|加密|货币|区块链|去中心化|资产|网络|价值|评估|投资|建议/i.test(reply);

  results.push({
    test: "E2 它是什么 (追问BTC)",
    pass: !e2_stale && e2_btc,
    detail: e2_stale
      ? `FAIL: stale - "${reply.match(/未识别资产|不知道这是什么|无法识别|没有指定|请提供资产/i)?.[0]}"`
      : e2_btc
        ? `PASS: BTC resolved from context, reply mentions BTC`
        : "FAIL: No BTC mention in response",
    ttfb: e2Ttfb,
    snippet: reply.substring(0, 200),
  });

  // ============================================================
  // TEST 3: E3 "能加仓吗" — MUST be about BTC
  // ============================================================
  log("\n=== Test 3: E3 能加仓吗 (追问BTC) ===");
  const t3 = Date.now();
  await sendMessage(page, "能加仓吗");
  await waitForReply(page, 120000);
  const e3Ttfb = Date.now() - t3;

  reply = await getLatestChiefReply(page);
  log(`E3 TTFB: ${e3Ttfb}ms`);
  log(`Latest Chief reply (first 300 chars): ${reply.substring(0, 300)}`);

  const e3_stale = /未识别资产|不知道|无法识别|没有指定|请提供资产|Missing required field/i.test(reply);
  const e3_btc = /比特币|BTC|Bitcoin/i.test(reply);

  results.push({
    test: "E3 能加仓吗 (追问BTC)",
    pass: !e3_stale && e3_btc,
    detail: e3_stale ? "FAIL: stale" : e3_btc ? "PASS: BTC add-position advice" : "WARN: no BTC mention",
    ttfb: e3Ttfb,
    snippet: reply.substring(0, 200),
  });

  // ============================================================
  // TEST 4: E7 "卖一半" — MUST be about BTC
  // ============================================================
  log("\n=== Test 4: E7 卖一半 (追问BTC) ===");
  const t7 = Date.now();
  await sendMessage(page, "卖一半");
  await waitForReply(page, 120000);
  const e7Ttfb = Date.now() - t7;

  reply = await getLatestChiefReply(page);
  log(`E7 TTFB: ${e7Ttfb}ms`);
  log(`Latest Chief reply (first 300 chars): ${reply.substring(0, 300)}`);

  const e7_stale = /未识别资产|不知道|无法识别|没有指定|请提供资产|Missing required field/i.test(reply);
  const e7_btc = /比特币|BTC|Bitcoin/i.test(reply);
  const e7_sell = /卖|卖出|减仓|止盈|止损|仓位|减持/i.test(reply);

  results.push({
    test: "E7 卖一半 (追问BTC)",
    pass: !e7_stale && e7_btc && e7Ttfb < 8000,
    detail: !e7_stale && e7_btc
      ? (e7Ttfb < 8000 ? "PASS: BTC sell advice, under 8s" : `PASS*: BTC resolved but ttfb=${e7Ttfb}ms > 8s`)
      : "FAIL",
    ttfb: e7Ttfb,
    snippet: reply.substring(0, 200),
  });

  // ============================================================
  // TEST 5: E4 "以太坊呢" — switch to ETH
  // ============================================================
  log("\n=== Test 5: E4 以太坊呢 ===");
  const t4 = Date.now();
  await sendMessage(page, "以太坊呢");
  await waitForReply(page, 120000);
  const e4Ttfb = Date.now() - t4;

  reply = await getLatestChiefReply(page);
  log(`E4 TTFB: ${e4Ttfb}ms`);
  log(`Latest Chief reply (first 300 chars): ${reply.substring(0, 300)}`);

  const e4_eth = /以太坊|ETH|Ethereum/i.test(reply);
  const e4_stale = /未识别资产|不知道这是什么|无法识别/i.test(reply);

  results.push({
    test: "E4 以太坊呢 (切换到ETH)",
    pass: e4_eth,
    detail: e4_eth ? "PASS: ETH evaluation" : (!e4_stale ? "PARTIAL: classification correct but synthesize retained BTC context" : "FAIL: stale"),
    ttfb: e4Ttfb,
    snippet: reply.substring(0, 200),
  });

  // ============================================================
  // TEST 6: E5 "卖 30%" — MUST be about ETH
  // ============================================================
  log("\n=== Test 6: E5 卖 30% (追问ETH) ===");
  const t5 = Date.now();
  await sendMessage(page, "卖 30%");
  await waitForReply(page, 120000);
  const e5Ttfb = Date.now() - t5;

  reply = await getLatestChiefReply(page);
  log(`E5 TTFB: ${e5Ttfb}ms`);
  log(`Latest Chief reply (first 300 chars): ${reply.substring(0, 300)}`);

  const e5_stale = /未识别资产|不知道|无法识别|没有指定|请提供资产|Missing required field/i.test(reply);
  const e5_eth = /以太坊|ETH|Ethereum/i.test(reply);
  const e5_sell = /卖|卖出|减仓|止盈|止损|仓位|30|%|减持/i.test(reply);

  results.push({
    test: "E5 卖 30% (追问ETH)",
    pass: !e5_stale && e5_eth,
    detail: !e5_stale && e5_eth
      ? `PASS: ETH sell 30% advice, ttfb=${e5Ttfb}ms`
      : (e5_stale ? `FAIL: stale` : `PARTIAL: no ETH in reply, ttfb=${e5Ttfb}ms`),
    ttfb: e5Ttfb,
    snippet: reply.substring(0, 200),
  });

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log("\n========== B-VI DOM v2 SUMMARY ==========");
  let pass = 0, fail = 0;
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL";
    console.log(`${icon} ${r.test} | ttfb=${r.ttfb}ms`);
    console.log(`  ${r.detail}`);
    console.log(`  Snippet: ${r.snippet.substring(0, 120)}...`);
    if (r.pass) pass++; else fail++;
  }
  console.log(`\n  ${pass} PASS / ${fail} FAIL / ${results.length} total`);
  console.log(`  Console errors: ${consoleErrors.length}`);

  const report = {
    timestamp: new Date().toISOString(),
    url: URL,
    version: "v2-post-fix",
    console_errors: consoleErrors.length,
    results,
    summary: { pass, fail, total: results.length },
  };
  writeFileSync(
    join(import.meta.dirname, "B-VI-dom-verify-report-v2.json"),
    JSON.stringify(report, null, 2)
  );

  // Screenshot of final state
  await page.screenshot({ path: join(import.meta.dirname, "../Plan-VI-B组-截图/B-VI-v2-final-state.png"), fullPage: true });
  console.log("\nFinal screenshot saved.");

  await browser.close();
})();
