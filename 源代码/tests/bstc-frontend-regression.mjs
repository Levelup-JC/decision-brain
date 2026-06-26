#!/usr/bin/env node
// BSTC Frontend Regression — Playwright-based input-freeze fault-tolerance tests.
//
// Usage:
//   node tests/bstc-frontend-regression.mjs
//   node tests/bstc-frontend-regression.mjs --url=http://localhost:4177
//   node tests/bstc-frontend-regression.mjs --url=https://decision-brain-gray.vercel.app
//   TEST_URL=http://localhost:4177 node tests/bstc-frontend-regression.mjs

import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(PROJECT_ROOT, "data");

function getGitHash() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "no-git";
  }
}

function getTimestamp() {
  return new Date().toISOString();
}

function parseUrl(argv) {
  const arg = argv.find((a) => a.startsWith("--url="));
  if (arg) return arg.split("=")[1].replace(/\/$/, "");
  return process.env.TEST_URL || "http://localhost:4177";
}

// ── Assertion helpers ─────────────────────────────────────────────────

async function isInputEnabled(page) {
  return page.$eval("#chatInput", (el) => !el.disabled);
}

async function isSendBtnEnabled(page) {
  return page.$eval("#chatSendBtn", (el) => !el.disabled && el.textContent !== "思考中...");
}

async function hasErrorBubble(page) {
  const errors = await page.$$(".chat-msg.error");
  return errors.length > 0;
}

async function sendMessage(page, text) {
  await page.fill("#chatInput", text);
  await page.click("#chatSendBtn");
}

// ── Test cases ────────────────────────────────────────────────────────

const TESTS = [
  {
    id: "freeze-001",
    description: "HTTP 500 → input recovers, error bubble shown",
    async run(page, url) {
      // Intercept /api/chat to return 500
      await page.route("**/api/chat", (route) => {
        route.fulfill({ status: 500, body: JSON.stringify({ ok: false, error: "Internal Server Error" }) }).catch(() => {});
      });

      await sendMessage(page, "测试 500 错误");

      // Wait for the UI to process the error
      await page.waitForTimeout(1500);

      const inputOk = await isInputEnabled(page);
      const hasError = await hasErrorBubble(page);

      // Clean up route
      await page.unroute("**/api/chat");

      return {
        passed: inputOk && hasError,
        details: { inputEnabled: inputOk, errorBubbleVisible: hasError },
      };
    },
  },

  {
    id: "freeze-002",
    description: "Request timeout (hang 30s) → AbortController fires at 25s, input recovers",
    async run(page, url) {
      // Intercept to simulate a hanging request (30s delay — page's AbortController will abort at 25s)
      await page.route("**/api/chat", async (route) => {
        await new Promise((r) => setTimeout(r, 30_000));
        route.fulfill({ status: 200, body: JSON.stringify({ ok: true, reply: "too late" }) }).catch(() => {});
      });

      await sendMessage(page, "测试超时");

      // Wait for input to recover (AbortController fires at 25s, plus some margin)
      const deadline = Date.now() + 28_000;
      let inputOk = false;
      while (Date.now() < deadline) {
        inputOk = await isInputEnabled(page);
        if (inputOk) break;
        await page.waitForTimeout(1000);
      }

      await page.unroute("**/api/chat").catch(() => {});

      return {
        passed: inputOk,
        details: { inputEnabled: inputOk, note: "AbortController 25s timeout verified" },
      };
    },
  },

  {
    id: "freeze-003",
    description: "Network disconnected → input recovers",
    async run(page, url) {
      // Intercept to abort (simulate network failure)
      await page.route("**/api/chat", (route) => route.abort("failed").catch(() => {}));

      await sendMessage(page, "测试断网");

      await page.waitForTimeout(1500);

      const inputOk = await isInputEnabled(page);
      const hasError = await hasErrorBubble(page);

      await page.unroute("**/api/chat");

      return {
        passed: inputOk,
        details: { inputEnabled: inputOk, errorBubbleVisible: hasError },
      };
    },
  },

  {
    id: "freeze-004",
    description: "Malformed response (missing reply) → no crash, input recovers",
    async run(page, url) {
      await page.route("**/api/chat", (route) => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({ ok: true, intent: "unknown" }),
          headers: { "Content-Type": "application/json" },
        }).catch(() => {});
      });

      await sendMessage(page, "测试异常响应");

      await page.waitForTimeout(1500);

      const inputOk = await isInputEnabled(page);
      await page.unroute("**/api/chat");

      return {
        passed: inputOk,
        details: { inputEnabled: inputOk },
      };
    },
  },

  {
    id: "freeze-005",
    description: "Empty JSON response → input recovers, no crash",
    async run(page, url) {
      await page.route("**/api/chat", (route) => {
        route.fulfill({
          status: 200,
          body: "not json {{{",
          headers: { "Content-Type": "application/json" },
        }).catch(() => {});
      });

      await sendMessage(page, "测试非法 JSON");

      await page.waitForTimeout(1500);

      const inputOk = await isInputEnabled(page);
      await page.unroute("**/api/chat");

      return {
        passed: inputOk,
        details: { inputEnabled: inputOk },
      };
    },
  },

  {
    id: "freeze-006",
    description: "15-round stress test — 0 freezes, input always recovers",
    async run(page, url) {
      const messages = [
        "BTC 怎么样",
        "能加仓吗",
        "ETH 呢",
        "SOL 也看看",
        "卖一半 SOL",
        "BTC 现在什么情况",
        "ETH 加仓建议",
        "SOL 刷新数据",
        "看我的持仓",
        "总结一下",
        "PEPE 值得研究吗",
        "AAVE 分析一下",
        "ENA 怎么样",
        "给个建议",
        "谢谢",
      ];

      const freezeLog = [];

      // Helper: wait until input is re-enabled (or timeout)
      async function waitForInputReady(maxWaitMs = 15_000) {
        const deadline = Date.now() + maxWaitMs;
        while (Date.now() < deadline) {
          const enabled = await isInputEnabled(page);
          if (enabled) return true;
          await page.waitForTimeout(500);
        }
        return false;
      }

      for (let i = 0; i < messages.length; i++) {
        // Wait for input to be ready before sending (realistic user behavior)
        if (i > 0) {
          const ready = await waitForInputReady();
          if (!ready) {
            freezeLog.push({ round: i, message: messages[i], status: "frozen_before_send_timeout" });
          }
        }

        await sendMessage(page, messages[i]);

        // Wait for input to recover after sending (up to 12s for slow API)
        const recovered = await waitForInputReady(12_000);
        if (!recovered) {
          freezeLog.push({ round: i, message: messages[i], status: "frozen_after_send" });
        }
      }

      return {
        passed: freezeLog.length === 0,
        details: { rounds: messages.length, freezes: freezeLog.length, freezeLog },
      };
    },
  },
];

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const url = parseUrl(process.argv);
  const gitHash = getGitHash();
  const startedAt = getTimestamp();

  console.log(`BSTC Frontend Regression — ${TESTS.length} fault-tolerance test(s)`);
  console.log(`Target: ${url}`);
  console.log(`Commit: ${gitHash}`);
  console.log("");

  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext();
  const page = await context.newPage();

  const report = {
    meta: {
      version: "VII-1.0",
      test_type: "frontend-fault-tolerance",
      target_url: url,
      commit_hash: gitHash,
      started_at: startedAt,
      total_cases: TESTS.length,
    },
    results: [],
    summary: {
      pass: 0,
      fail: 0,
      total: TESTS.length,
    },
  };

  let testIndex = 0;
  for (const test of TESTS) {
    testIndex++;
    const caseStart = Date.now();

    // Fresh page for each test to avoid state bleed
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForSelector("#chatInput", { timeout: 10_000 });

    // Clean up ALL lingering routes from previous test
    await page.unrouteAll({ behavior: "ignoreErrors" });

    let result;
    let error = null;
    try {
      result = await test.run(page, url);
    } catch (err) {
      error = err.message;
      result = { passed: false, details: { error: err.message } };
    }

    const passed = result.passed;
    const tookMs = Date.now() - caseStart;

    report.results.push({
      id: test.id,
      description: test.description,
      passed,
      error,
      tookMs,
      details: result.details,
    });

    if (passed) {
      report.summary.pass++;
      console.log(`  PASS  [${testIndex}/${TESTS.length}] ${test.id}  (${tookMs}ms)  ${test.description}`);
    } else {
      report.summary.fail++;
      console.log(`  FAIL  [${testIndex}/${TESTS.length}] ${test.id}  (${tookMs}ms)  ${test.description}`);
      console.log(`        Details: ${JSON.stringify(result.details)}`);
    }

    // Clean up routes between tests
    try { await page.unroute("**/api/chat"); } catch {}
  }

  await browser.close();

  report.summary.completed_at = getTimestamp();

  // Write report
  await mkdir(OUTPUT_DIR, { recursive: true });
  const reportFilename = `bstc-frontend-report-${gitHash}.json`;
  const reportPath = join(OUTPUT_DIR, reportFilename);
  const reportJSON = JSON.stringify(report, null, 2);
  await writeFile(reportPath, reportJSON, "utf8");

  const stat = await import("node:fs/promises").then((fs) => fs.stat(reportPath));
  if (stat.size === 0) {
    console.error("FATAL: Report file is 0 bytes!");
    process.exit(1);
  }

  console.log(`\nReport: ${reportPath}`);
  console.log(`Summary: ${report.summary.pass}/${report.summary.total} passed`);
  console.log(`Report size: ${stat.size} bytes`);

  process.exit(report.summary.fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Frontend regression fatal error:", err);
  process.exit(2);
});
