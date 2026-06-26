import { chromium } from "playwright";
import { writeFileSync } from "fs";
import { join } from "path";

const URL = "https://decision-brain-gray.vercel.app";

function log(msg) { console.log(`  [${new Date().toLocaleTimeString()}] ${msg}`); }
function ts() { return Date.now(); }

async function forceSend(page, message) {
  await page.evaluate((msg) => {
    const input = document.getElementById("chatInput");
    if (input) { input.value = msg; }
    if (input) input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }, message);
  log(`Sent: "${message}"`);
}

async function waitForReply(page, timeoutMs = 90000) {
  const start = ts();
  try {
    await page.waitForFunction(() => {
      const input = document.getElementById("chatInput");
      return input && !input.disabled;
    }, { timeout: timeoutMs });
    return ts() - start;
  } catch { log("TIMEOUT waiting for reply"); return -1; }
}

async function getLatestChiefReply(page) {
  return await page.evaluate(() => {
    const bubbles = document.querySelectorAll(".chat-msg.chief");
    if (bubbles.length === 0) return "NO_CHIEF_BUBBLES";
    const last = bubbles[bubbles.length - 1];
    return last.textContent.substring(0, 2000);
  });
}

async function getInputState(page) {
  return await page.evaluate(() => {
    const input = document.getElementById("chatInput");
    const btn = document.getElementById("chatSendBtn");
    return {
      inputDisabled: input ? input.disabled : null,
      btnDisabled: btn ? btn.disabled : null,
      btnText: btn ? btn.textContent : null,
    };
  });
}

async function getErrorBubbles(page) {
  return await page.evaluate(() => {
    const errors = document.querySelectorAll(".chat-msg.error");
    return Array.from(errors).map(e => e.textContent.substring(0, 200));
  });
}

(async () => {
  console.log("=== B-VII-2 公网 E1-E7 链路 + 时延复验 ===\n");
  console.log(`URL: ${URL}\n`);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  const loadStart = ts();
  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  log(`Page loaded in ${ts() - loadStart}ms`);

  await page.screenshot({ path: join(import.meta.dirname, "../Plan-VII-B组-截图/B-VII-2_0_page_load.png"), fullPage: true });

  const results = [];
  const screenshots = [];

  // ============================================================
  // E1-E7 链路 (same session, cumulative context)
  // ============================================================
  const chain = [
    { id: "E1", msg: "比特币怎么样", expectedAsset: "BTC", check: /比特币|BTC|Bitcoin/i },
    { id: "E2", msg: "它是什么", expectedAsset: "BTC", check: /比特币|BTC|Bitcoin|数字|加密|货币|区块链|去中心化/i },
    { id: "E3", msg: "能加仓吗", expectedAsset: "BTC", check: /比特币|BTC|Bitcoin|加仓|增持|买入|建仓|仓位/i },
    { id: "E7", msg: "卖一半", expectedAsset: "BTC", check: /比特币|BTC|Bitcoin|卖|减仓|止盈|止损|仓位|比例|一半|50%/i },
    { id: "E4", msg: "以太坊呢", expectedAsset: "ETH", check: /以太坊|ETH|Ethereum/i, forbidden: /比特币|Bitcoin|BTC(?!.*以太坊)/i },
    { id: "E5", msg: "卖 30%", expectedAsset: "ETH", check: /以太坊|ETH|Ethereum|卖|30%|减仓/i },
  ];

  for (const step of chain) {
    log(`\n=== ${step.id}: "${step.msg}" ===`);
    const sendStart = ts();
    await forceSend(page, step.msg);
    const ttfb = await waitForReply(page, 90000);
    await page.waitForTimeout(1500); // let DOM settle

    const reply = await getLatestChiefReply(page);
    const state = await getInputState(page);

    const matchesAsset = step.check.test(reply);
    const forbiddenMatch = step.forbidden ? step.forbidden.test(reply) : false;
    const hasError = reply === "NO_CHIEF_BUBBLES";

    let pass = false;
    let detail = "";
    if (hasError) {
      detail = "FAIL: No chief reply bubble found";
    } else if (forbiddenMatch) {
      pass = false;
      // extract the forbidden match
      const fm = reply.match(step.forbidden);
      detail = `FAIL: Forbidden asset found in reply - "${fm?.[0]}"`;
    } else if (matchesAsset) {
      pass = true;
      detail = `PASS: ${step.expectedAsset} confirmed in reply`;
    } else {
      detail = `FAIL: ${step.expectedAsset} not found in reply`;
    }

    const isSellStep = step.msg.includes("卖");
    if (isSellStep && ttfb > 8000) {
      pass = false;
      detail += ` | sell TTFB ${ttfb}ms > 8s`;
    }

    log(`  TTFB: ${ttfb}ms | Asset: ${step.expectedAsset} | Match: ${matchesAsset} | Forbidden: ${forbiddenMatch}`);
    log(`  Reply (first 200): ${reply.substring(0, 200)}`);
    log(`  Input state: disabled=${state.inputDisabled}, btn=${state.btnDisabled}`);
    log(`  ${pass ? "PASS" : "FAIL"}: ${detail}`);

    results.push({
      step: step.id,
      message: step.msg,
      expectedAsset: step.expectedAsset,
      ttfbMs: ttfb,
      pass,
      detail,
      replySnippet: reply.substring(0, 300),
      inputDisabled: state.inputDisabled,
      btnDisabled: state.btnDisabled,
    });

    // Screenshot per step
    const ssName = `B-VII-2_${step.id}_${step.expectedAsset}.png`;
    await page.screenshot({ path: join(import.meta.dirname, "../Plan-VII-B组-截图", ssName), fullPage: false });
    screenshots.push(ssName);
  }

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log("\n========== B-VII-2 E1-E7 SUMMARY ==========");
  let pass = 0, fail = 0;
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL";
    console.log(`${icon} ${r.step} "${r.message}" TTFB=${r.ttfbMs}ms — ${r.detail}`);
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
    commit: "2880c50",
    test: "B-VII-2 E1-E7 公网链路复验",
    results,
    console_errors: consoleErrors,
    screenshots,
    summary: { pass, fail, total: results.length },
  };

  writeFileSync(
    join(import.meta.dirname, "B-VII-2-e2e-report.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(`\nReport saved.`);

  await browser.close();

  if (fail > 0) process.exit(1);
})();
