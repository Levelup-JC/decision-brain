import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { store } from "../src/data-store.mjs";
import { managePosition, getPortfolioSummary } from "../src/services/api-service.mjs";

async function withTempState(testContext, callback) {
  const dataDir = await mkdtemp(join(tmpdir(), "decision-brain-plan14-"));
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

// ── Intent classification: add phrases route to manage_position ──────

test("classifyIntent routes '加仓' + quantity to manage_position", async (t) => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");

  const r1 = classifyIntent("加仓 SOL 50 个，成本 180");
  assert.equal(r1.intent, "manage_position");
  assert.equal(r1.slots.assetQuery, "SOL");
  assert.equal(r1.slots.units, 50);
  assert.equal(r1.slots.averageCost, 180);

  const r2 = classifyIntent("加仓 100 个 BTC 成本 70000");
  assert.equal(r2.intent, "manage_position");
  assert.equal(r2.slots.assetQuery, "BTC");
  assert.equal(r2.slots.units, 100);
  assert.equal(r2.slots.averageCost, 70000);
});

test("classifyIntent routes '追加' / '补仓' / '买多' to manage_position", async (t) => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");

  const r1 = classifyIntent("追加 100 个 SOL");
  assert.equal(r1.intent, "manage_position");

  const r2 = classifyIntent("补仓 50 个 ETH 成本 3000");
  assert.equal(r2.intent, "manage_position");

  const r3 = classifyIntent("买多 20 个 SOL");
  assert.equal(r3.intent, "manage_position");
});

test("classifyIntent routes '又买了' / '再买了' to manage_position", async (t) => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");

  const r1 = classifyIntent("我又买了 BTC 1 个，成本 70000");
  assert.equal(r1.intent, "manage_position");
  assert.equal(r1.slots.assetQuery, "BTC");

  const r2 = classifyIntent("又买了 50 个 SOL 成本 180");
  assert.equal(r2.intent, "manage_position");
});

test("classifyIntent routes '修正' / '改成' to manage_position (replace, not add)", async (t) => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");

  const r1 = classifyIntent("把 SOL 持仓修正为 80 个，成本 100");
  assert.equal(r1.intent, "manage_position");

  const r2 = classifyIntent("改成 BTC 持仓 5 个，成本 50000");
  assert.equal(r2.intent, "manage_position");
});

test("classifyIntent keeps '能加仓吗' as review_add (no quantity)", async (t) => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");

  const r1 = classifyIntent("SOL 能加仓吗？");
  assert.equal(r1.intent, "review_add");

  const r2 = classifyIntent("BTC 加不加仓？");
  assert.equal(r2.intent, "review_add");

  const r3 = classifyIntent("可以加仓 SOL 吗");
  assert.equal(r3.intent, "review_add");
});

// ── API: weighted average cost ────────────────────────────────────────

test("managePosition with action add computes weighted average cost (BTC scenario)", async (t) => {
  await withTempState(t, async () => {
    // First buy: 1 BTC @ 60000
    const first = await managePosition({
      assetQuery: "BTC",
      units: 1,
      averageCost: 60000,
      currentPrice: 60000,
      portfolioValue: 100000,
    });
    assert.equal(first.ok, true);

    // Add: 1 BTC @ 70000 → weighted avg = (1*60000 + 1*70000) / 2 = 65000
    const add = await managePosition({
      assetQuery: "BTC",
      units: 1,
      averageCost: 70000,
      currentPrice: 70000,
      portfolioValue: 100000,
      action: "add",
    });
    assert.equal(add.ok, true);

    const summary = await getPortfolioSummary();
    const btc = summary.positions.find((p) => p.symbol === "BTC");
    assert.ok(btc, "BTC position exists");
    assert.equal(btc.units, 2);
    assert.equal(btc.averageCost, 65000);
    assert.equal(btc.costBasisTotal, 130000);
  });
});

test("managePosition with action add computes weighted average cost (SOL scenario)", async (t) => {
  await withTempState(t, async () => {
    // First buy: 100 SOL @ 120
    const first = await managePosition({
      assetQuery: "SOL",
      units: 100,
      averageCost: 120,
      currentPrice: 120,
      portfolioValue: 50000,
    });
    assert.equal(first.ok, true);

    // Add: 50 SOL @ 180 → weighted avg = (100*120 + 50*180) / 150 = 140
    const add = await managePosition({
      assetQuery: "SOL",
      units: 50,
      averageCost: 180,
      currentPrice: 180,
      portfolioValue: 50000,
      action: "add",
    });
    assert.equal(add.ok, true);

    const summary = await getPortfolioSummary();
    const sol = summary.positions.find((p) => p.symbol === "SOL");
    assert.ok(sol, "SOL position exists");
    assert.equal(sol.units, 150);
    assert.equal(sol.averageCost, 140);
    assert.equal(sol.costBasisTotal, 21000);
  });
});

test("managePosition without action add replaces position (not weighted average)", async (t) => {
  await withTempState(t, async () => {
    // First buy: 100 SOL @ 120
    await managePosition({
      assetQuery: "SOL",
      units: 100,
      averageCost: 120,
      currentPrice: 120,
      portfolioValue: 50000,
    });

    // Replace: 80 SOL @ 100 (no action: "add")
    await managePosition({
      assetQuery: "SOL",
      units: 80,
      averageCost: 100,
      currentPrice: 100,
      portfolioValue: 50000,
    });

    const summary = await getPortfolioSummary();
    const sol = summary.positions.find((p) => p.symbol === "SOL");
    assert.ok(sol, "SOL position exists");
    assert.equal(sol.units, 80);
    assert.equal(sol.averageCost, 100);
    assert.equal(sol.costBasisTotal, 8000);
  });
});

test("portfolio summary returns costBasisTotal for each position", async (t) => {
  await withTempState(t, async () => {
    await managePosition({
      assetQuery: "ETH",
      units: 10,
      averageCost: 3000,
      currentPrice: 3200,
      portfolioValue: 50000,
    });

    const summary = await getPortfolioSummary();
    assert.ok(summary.positions.length > 0);
    const eth = summary.positions[0];
    assert.equal(eth.costBasisTotal, 30000);
    assert.ok(typeof eth.averageCost === "number");
    assert.ok(typeof eth.costBasisTotal === "number");
    assert.ok(typeof eth.currentValue === "number");
  });
});

test("getPortfolioSummary totalPositionValue uses sum of currentValue", async (t) => {
  await withTempState(t, async () => {
    await managePosition({
      assetQuery: "BTC",
      units: 1,
      averageCost: 60000,
      currentPrice: 65000,
      portfolioValue: 100000,
    });
    await managePosition({
      assetQuery: "ETH",
      units: 10,
      averageCost: 3000,
      currentPrice: 3200,
      portfolioValue: 100000,
    });

    const summary = await getPortfolioSummary();
    // totalPositionValue = sum(currentValue), not sum(costBasisTotal)
    const btc = summary.positions.find((p) => p.symbol === "BTC");
    const eth = summary.positions.find((p) => p.symbol === "ETH");
    const expectedTotal = (btc.currentValue || 0) + (eth.currentValue || 0);
    assert.equal(summary.totalPositionValue, expectedTotal);
    // Verify it's NOT using costBasisTotal
    const costSum = btc.costBasisTotal + eth.costBasisTotal;
    assert.notEqual(summary.totalPositionValue, costSum);
  });
});
