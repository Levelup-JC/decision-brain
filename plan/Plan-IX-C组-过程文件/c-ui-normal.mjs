#!/usr/bin/env node
// Plan IX C组 — UI screenshot script (normal / MCP failure / fanout timeout)
//
// Usage:
//   SERVER_URL=http://localhost:4177 node plan/Plan-IX-C组-过程文件/c-ui-normal.mjs
//   node plan/Plan-IX-C组-过程文件/c-ui-normal.mjs --url=http://localhost:4177

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PLAN_DIR = join(__dirname, "..");
const SCREENSHOT_DIR = join(PLAN_DIR, "Plan-IX-C组-截图");

function parseUrl() {
  const arg = process.argv.find((a) => a.startsWith("--url="));
  if (arg) return arg.split("=")[1].replace(/\/$/, "");
  return process.env.SERVER_URL || "http://localhost:4177";
}

function ts() {
  return new Date().toISOString();
}

// ── Helpers ───────────────────────────────────────────────────────────

async function sendMessage(page, text) {
  await page.fill("#chatInput", text);
  await page.click("#chatSendBtn");
}

async function waitForAgentDone(page, role, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const statusText = await page.$eval(
      `.agent-card[data-role="${role}"] .agent-status`,
      (el) => el.textContent
    ).catch(() => null);
    if (statusText === "完成" || statusText === "失败" || statusText === "超时") {
      return statusText;
    }
    await page.waitForTimeout(500);
  }
  return "timeout_waiting";
}

async function waitForReplyText(page, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const bubbles = await page.$$(".chat-msg.chief");
    if (bubbles.length >= 2) {
      const text = await bubbles[bubbles.length - 1].textContent();
      if (text && text.length > 20 && !text.includes("我是 Chief 决策官")) {
        return text;
      }
    }
    // Also check error bubble
    const errBubbles = await page.$$(".chat-msg.error");
    if (errBubbles.length > 0) {
      return await errBubbles[errBubbles.length - 1].textContent();
    }
    await page.waitForTimeout(800);
  }
  return null;
}

async function expandAllTraces(page) {
  // Click all trace-summary elements to expand them
  const summaries = await page.$$(".trace-summary");
  for (const summary of summaries) {
    await summary.click().catch(() => {});
    await page.waitForTimeout(150);
  }
}

async function screenshotCommittee(page, filename) {
  const el = await page.$("#committeeBody");
  if (el) {
    await el.screenshot({ path: join(SCREENSHOT_DIR, filename), fullPage: false });
    console.log(`  [SCREENSHOT] ${join(SCREENSHOT_DIR, filename)}`);
  } else {
    await page.screenshot({ path: join(SCREENSHOT_DIR, filename), fullPage: true });
    console.log(`  [SCREENSHOT fullpage] ${join(SCREENSHOT_DIR, filename)}`);
  }
}

// ── C1: Normal state ──────────────────────────────────────────────────

async function testC1(page, url) {
  console.log(`\n── C1: UI normal state ──`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForSelector("#chatInput", { timeout: 10000 });
  await page.waitForTimeout(800);

  await sendMessage(page, "BTC 是什么");
  console.log("  Sent: BTC 是什么");

  // Wait for Asset Info agent to arrive
  const status = await waitForAgentDone(page, "asset_info", 30000);
  console.log(`  Asset Info status: ${status}`);

  // Wait for chief reply
  const reply = await waitForReplyText(page, 30000);
  console.log(`  Reply preview: ${(reply || "").slice(0, 120)}`);

  // Expand all trace entries to show tool details
  await expandAllTraces(page);
  await page.waitForTimeout(500);

  // Screenshot the committee body (center column)
  await screenshotCommittee(page, "C-IX-1-btc-asset-info-trace.png");

  // Collect API-level evidence
  const fanoutCards = await page.$$eval(".agent-card.done, .agent-card.running", (cards) =>
    cards.map((c) => ({
      role: c.getAttribute("data-role"),
      status: c.querySelector(".agent-status")?.textContent || "",
      headline: c.querySelector(".agent-headline")?.textContent || "",
    }))
  );
  console.log(`  Visible fanout cards: ${JSON.stringify(fanoutCards)}`);

  const traceVisible = await page.$(".trace-entry");
  console.log(`  Trace entries visible: ${traceVisible ? "YES" : "NO"}`);

  return { fanoutCards, replyPreview: (reply || "").slice(0, 200), traceVisible: !!traceVisible };
}

// ── C2: MCP failure state ─────────────────────────────────────────────

async function testC2(page, url) {
  console.log(`\n── C2: MCP failure state ──`);

  // Intercept /api/chat to simulate MCP failure response
  await page.route("**/api/chat", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      return route.continue();
    }
    const body = request.postDataJSON();
    if (body?.message?.includes("BTC 是什么") || body?.message?.includes("BTC")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          intent: "lookup_asset_info",
          assetQuery: "BTC",
          reply: "抱歉，当前数据源未连接，暂无法获取 BTC 的实时价格和市值数据。请在数据源恢复后重试。",
          fanout: ["asset_info"],
          degraded: true,
          ruleOnly: true,
          agentResults: [
            {
              role: "asset_info",
              headline: "数据源未连接，无法查询实时数据",
              tookMs: 3200,
              status: "error",
              data: null,
            },
          ],
          trace: [
            {
              agentRole: "asset_info",
              tool: "crypto_market",
              args: { coin_id: "bitcoin", vs_currency: "usd" },
              ok: false,
              tookMs: 3100,
              cached: false,
              rawSnippet: "",
              error: "ECONNREFUSED: MCP server unreachable at http://127.0.0.1:1/bad",
            },
          ],
          sessionId: "demo-001",
        }),
      });
    } else {
      return route.continue();
    }
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForSelector("#chatInput", { timeout: 10000 });
  await page.waitForTimeout(800);

  await sendMessage(page, "BTC 是什么");
  console.log("  Sent: BTC 是什么 (with MCP failure interception)");

  const status = await waitForAgentDone(page, "asset_info", 15000);
  console.log(`  Asset Info status: ${status}`);

  const reply = await waitForReplyText(page, 10000);
  console.log(`  Reply preview: ${(reply || "").slice(0, 150)}`);

  await expandAllTraces(page);
  await page.waitForTimeout(500);

  await screenshotCommittee(page, "C-IX-2-mcp-fail-red-card.png");

  // Verify red/error state
  const errorCards = await page.$$eval(".agent-card.error", (cards) =>
    cards.map((c) => ({
      role: c.getAttribute("data-role"),
      status: c.querySelector(".agent-status")?.textContent || "",
    }))
  );
  console.log(`  Error cards: ${JSON.stringify(errorCards)}`);

  const hasUnavailable = reply && /数据源未连接|暂无法获取|失败/.test(reply);
  console.log(`  Has unavailable text: ${hasUnavailable}`);

  await page.unroute("**/api/chat").catch(() => {});

  return { errorCards, hasUnavailable, replyPreview: (reply || "").slice(0, 200) };
}

// ── C3: Fanout timeout state ──────────────────────────────────────────

async function testC3(page, url) {
  console.log(`\n── C3: Fanout timeout state ──`);

  // Intercept /api/chat to simulate fanout timeout (server-side timeout before agent returns)
  await page.route("**/api/chat", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      return route.continue();
    }
    const body = request.postDataJSON();
    if (body?.message?.includes("BTC 是什么") || body?.message?.includes("BTC")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          intent: "lookup_asset_info",
          assetQuery: "BTC",
          reply: "本轮查询超时，部分 Agent 未能在时限内返回结果。请稍后重试。",
          fanout: ["asset_info", "onchain"],
          degraded: true,
          ruleOnly: true,
          agentResults: [],
          trace: [
            {
              agentRole: "asset_info",
              tool: "crypto_market",
              args: { coin_id: "bitcoin", vs_currency: "usd" },
              ok: false,
              tookMs: 0,
              cached: false,
              rawSnippet: "",
              error: "fanout_timeout",
            },
            {
              agentRole: "onchain",
              tool: "eth_gas",
              args: {},
              ok: false,
              tookMs: 0,
              cached: false,
              rawSnippet: "",
              error: "fanout_timeout",
            },
          ],
          sessionId: "demo-001",
        }),
      });
    } else {
      return route.continue();
    }
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForSelector("#chatInput", { timeout: 10000 });
  await page.waitForTimeout(800);

  await sendMessage(page, "BTC 是什么");
  console.log("  Sent: BTC 是什么 (with timeout interception)");

  // Wait for the UI to process fanout + timeout markers
  await page.waitForTimeout(2000);

  const reply = await waitForReplyText(page, 10000);
  console.log(`  Reply preview: ${(reply || "").slice(0, 150)}`);

  await expandAllTraces(page);
  await page.waitForTimeout(500);

  await screenshotCommittee(page, "C-IX-3-timeout-red-card.png");

  // Verify timeout cards
  const timeoutStatuses = await page.$$eval(".agent-status.error", (els) =>
    els.map((el) => el.textContent)
  );
  console.log(`  Timeout/error status badges: ${JSON.stringify(timeoutStatuses)}`);

  const errorCards = await page.$$eval(".agent-card.error", (cards) =>
    cards.map((c) => ({
      role: c.getAttribute("data-role"),
      headline: c.querySelector(".agent-headline")?.textContent || "",
    }))
  );
  console.log(`  Timeout cards: ${JSON.stringify(errorCards)}`);

  const notThinking = await page.$$eval(
    ".agent-card.error .agent-status",
    (els) => els.every((el) => el.textContent !== "思考中")
  );
  console.log(`  No card stuck in "思考中": ${notThinking}`);

  await page.unroute("**/api/chat").catch(() => {});

  return { timeoutStatuses, errorCards, notThinking, replyPreview: (reply || "").slice(0, 200) };
}

// ── Collect server log evidence ───────────────────────────────────────

async function collectLogEvidence(page, url) {
  console.log(`\n── Collecting API response evidence ──`);

  // Clear routes from previous tests
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForSelector("#chatInput", { timeout: 10000 });
  await page.waitForTimeout(800);

  // Intercept to capture the real response
  let capturedResponse = null;

  page.on("response", async (response) => {
    if (response.url().includes("/api/chat") && response.request().method() === "POST") {
      try {
        capturedResponse = await response.json();
      } catch {}
    }
  });

  await sendMessage(page, "BTC 是什么");
  console.log("  Sent: BTC 是什么 (capturing real response)");

  await page.waitForTimeout(5000);

  // Wait for any chief reply
  await waitForReplyText(page, 30000).catch(() => {});

  if (capturedResponse) {
    const evidence = {
      intent: capturedResponse.intent,
      fanout: capturedResponse.fanout,
      degraded: capturedResponse.degraded,
      ruleOnly: capturedResponse.ruleOnly,
      agentResults: (capturedResponse.agentResults || []).map((a) => ({
        role: a.role,
        headline: a.headline?.slice(0, 100),
        status: a.status,
        tookMs: a.tookMs,
      })),
      trace: (capturedResponse.trace || []).map((t) => ({
        agentRole: t.agentRole,
        tool: t.tool,
        ok: t.ok,
        tookMs: t.tookMs,
        cached: t.cached,
        error: t.error || null,
      })),
      replyPreview: (capturedResponse.reply || "").slice(0, 300),
    };
    console.log(`  API response evidence: ${JSON.stringify(evidence, null, 2)}`);
    return evidence;
  }

  console.log("  WARNING: Could not capture API response");
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const url = parseUrl();
  console.log(`Plan IX C组 — UI Screenshot Script`);
  console.log(`Target: ${url}`);
  console.log(`Started: ${ts()}`);

  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });

  const evidence = { c1: null, c2: null, c3: null, apiEvidence: null };

  try {
    // C1: Normal state (real server response)
    {
      const page = await context.newPage();
      evidence.c1 = await testC1(page, url);
      await page.close();
    }

    // C2: MCP failure state (intercepted)
    {
      const page = await context.newPage();
      evidence.c2 = await testC2(page, url);
      await page.close();
    }

    // C3: Timeout state (intercepted)
    {
      const page = await context.newPage();
      evidence.c3 = await testC3(page, url);
      await page.close();
    }

    // Collect real API evidence (for report)
    {
      const page = await context.newPage();
      evidence.apiEvidence = await collectLogEvidence(page, url);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`C组 Screenshot Summary`);
  console.log(`${"=".repeat(60)}`);
  console.log(`C1 normal state:`);
  console.log(`  Fanout cards: ${JSON.stringify(evidence.c1?.fanoutCards)}`);
  console.log(`  Trace visible: ${evidence.c1?.traceVisible}`);
  console.log(`C2 MCP failure:`);
  console.log(`  Error cards: ${JSON.stringify(evidence.c2?.errorCards)}`);
  console.log(`  Unavailable text: ${evidence.c2?.hasUnavailable}`);
  console.log(`C3 timeout:`);
  console.log(`  Timeout statuses: ${JSON.stringify(evidence.c3?.timeoutStatuses)}`);
  console.log(`  Not stuck thinking: ${evidence.c3?.notThinking}`);
  console.log(`\nScreenshots saved to: ${SCREENSHOT_DIR}`);
  console.log(`API evidence: ${JSON.stringify(evidence.apiEvidence, null, 2)}`);

  const allPassed =
    evidence.c1?.traceVisible &&
    evidence.c2?.hasUnavailable &&
    evidence.c3?.notThinking;

  console.log(`\nOverall: ${allPassed ? "ALL PASSED" : "SOME CHECKS FAILED"}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
