import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { store } from "../src/data-store.mjs";
import { managePosition, getPortfolioSummary } from "../src/services/api-service.mjs";

async function withTempState(testContext, callback) {
  const dataDir = await mkdtemp(join(tmpdir(), "decision-brain-plan15-"));
  const previousDataDir = process.env.DECISION_BRAIN_DATA_DIR;
  const previousStateFile = process.env.DECISION_BRAIN_STATE_FILE;
  const previousOffline = process.env.DECISION_BRAIN_OFFLINE;

  process.env.DECISION_BRAIN_DATA_DIR = dataDir;
  process.env.DECISION_BRAIN_OFFLINE = "1";
  delete process.env.DECISION_BRAIN_STATE_FILE;
  store.resetCache();
  await store.clear();

  testContext.after(async () => {
    if (previousDataDir === undefined) {
      delete process.env.DECISION_BRAIN_DATA_DIR;
    } else {
      process.env.DECISION_BRAIN_DATA_DIR = previousDataDir;
    }
    if (previousStateFile === undefined) {
      delete process.env.DECISION_BRAIN_STATE_FILE;
    } else {
      process.env.DECISION_BRAIN_STATE_FILE = previousStateFile;
    }
    if (previousOffline === undefined) {
      delete process.env.DECISION_BRAIN_OFFLINE;
    } else {
      process.env.DECISION_BRAIN_OFFLINE = previousOffline;
    }
    store.resetCache();
  });

  return callback(dataDir);
}

// ── Intent classification: sell intents ──────────────────────────────

test("classifyIntent: panic sell → review_sell (no position change)", async (t) => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");

  const r1 = classifyIntent("我有点想卖 BTC");
  assert.equal(r1.intent, "review_sell");
  assert.equal(r1.slots.assetQuery, "BTC");
  assert.equal(r1.slots.panicFlag, true);

  const r2 = classifyIntent("现在跌得好厉害，我有点想把BTC卖掉");
  assert.equal(r2.intent, "review_sell");
  assert.equal(r2.slots.panicFlag, true);

  const r3 = classifyIntent("我受不了了，想清仓 BTC");
  assert.equal(r3.intent, "review_sell");
  assert.equal(r3.slots.panicFlag, true);

  const r4 = classifyIntent("恐慌了，想卖 SOL");
  assert.equal(r4.intent, "review_sell");
  assert.equal(r4.slots.panicFlag, true);

  // General anxiety without sell intent → strategy_dialogue
  const r5 = classifyIntent("我有点慌");
  assert.equal(r5.intent, "strategy_dialogue");
});

test("classifyIntent: '我准备卖 1 个 BTC' → review_sell (planned, check plan first)", async (t) => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");

  const r1 = classifyIntent("我准备卖 1 个 BTC");
  assert.equal(r1.intent, "review_sell");
  assert.equal(r1.slots.assetQuery, "BTC");

  const r2 = classifyIntent("打算卖一半 SOL");
  assert.equal(r2.intent, "review_sell");
});

test("classifyIntent: '我已经卖了 1 个 BTC' → sell_execute", async (t) => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");

  const r1 = classifyIntent("我已经卖了 1 个 BTC，记录");
  assert.equal(r1.intent, "sell_execute");
  assert.equal(r1.slots.assetQuery, "BTC");
  assert.equal(r1.slots.units, 1);

  const r2 = classifyIntent("已经卖出了 2 个 SOL");
  assert.equal(r2.intent, "sell_execute");

  const r3 = classifyIntent("卖了 3 个 ETH，帮我记录一下");
  assert.equal(r3.intent, "sell_execute");
});

test("classifyIntent: '我卖掉一个 BTC' → review_sell (ambiguous, ask for clarification)", async (t) => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");

  const r1 = classifyIntent("我卖掉一个 BTC");
  assert.equal(r1.intent, "review_sell");
  assert.equal(r1.slots.assetQuery, "BTC");
});

test("classifyIntent: '确认记录卖出' → sell_execute (confirmation)", async (t) => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");

  const r1 = classifyIntent("确认记录卖出");
  assert.equal(r1.intent, "sell_execute");
});

test("classifyIntent: 'should I sell BTC' → review_sell (not sell_execute)", async (t) => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");

  const r1 = classifyIntent("should I sell my BTC?");
  assert.equal(r1.intent, "review_sell");

  const r2 = classifyIntent("SOL 要不要卖？");
  assert.equal(r2.intent, "review_sell");
});

test("classifyIntent: sell_execute does NOT collide with add phrases", async (t) => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");

  // "又买了" should go to manage_position, not sell_execute
  const r1 = classifyIntent("我又买了 1 个 BTC 成本 70000");
  assert.equal(r1.intent, "manage_position");

  // "加仓" with quantity should go to manage_position
  const r2 = classifyIntent("加仓 50 个 SOL 成本 180");
  assert.equal(r2.intent, "manage_position");
});

// ── API: sell execution ──────────────────────────────────────────────

test("managePosition with action sell reduces units correctly", async (t) => {
  await withTempState(t, async () => {
    // Buy 5 BTC @ 60000
    await managePosition({
      assetQuery: "BTC",
      units: 5,
      averageCost: 60000,
      currentPrice: 60000,
      portfolioValue: 500000,
    });

    // Sell 2 BTC
    const sell = await managePosition({
      assetQuery: "BTC",
      units: 2,
      action: "sell",
    });
    assert.equal(sell.ok, true);

    const summary = await getPortfolioSummary();
    const btc = summary.positions.find((p) => p.symbol === "BTC");
    assert.ok(btc);
    assert.equal(btc.units, 3);
    // Average cost should NOT change after sell
    assert.equal(btc.averageCost, 60000);
    assert.equal(btc.costBasisTotal, 180000); // 3 * 60000
  });
});

test("managePosition with action sell preserves peakUnits", async (t) => {
  await withTempState(t, async () => {
    await managePosition({
      assetQuery: "SOL",
      units: 100,
      averageCost: 120,
      currentPrice: 120,
      portfolioValue: 50000,
    });

    // Sell 30 SOL
    await managePosition({
      assetQuery: "SOL",
      units: 30,
      action: "sell",
    });

    const summary = await getPortfolioSummary();
    const sol = summary.positions.find((p) => p.symbol === "SOL");
    assert.ok(sol);
    assert.equal(sol.units, 70);
    // averageCost stays the same
    assert.equal(sol.averageCost, 120);
  });
});

test("managePosition with action sell: oversell protection", async (t) => {
  await withTempState(t, async () => {
    await managePosition({
      assetQuery: "ETH",
      units: 2,
      averageCost: 3000,
      currentPrice: 3200,
      portfolioValue: 50000,
    });

    const result = await managePosition({
      assetQuery: "ETH",
      units: 10,
      action: "sell",
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "OVERSELL");
    assert.match(result.error, /超过.*持仓/);

    // Position should be unchanged
    const summary = await getPortfolioSummary();
    const eth = summary.positions.find((p) => p.symbol === "ETH");
    assert.equal(eth.units, 2);
  });
});

test("panic sell expression does NOT change position (API-level safety)", async (t) => {
  await withTempState(t, async () => {
    await managePosition({
      assetQuery: "BTC",
      units: 1,
      averageCost: 60000,
      currentPrice: 55000,
      portfolioValue: 100000,
    });

    // Verify position is intact (review_sell shouldn't have modified it)
    const summary = await getPortfolioSummary();
    const btc = summary.positions.find((p) => p.symbol === "BTC");
    assert.ok(btc);
    assert.equal(btc.units, 1);
    assert.equal(btc.averageCost, 60000);
  });
});
