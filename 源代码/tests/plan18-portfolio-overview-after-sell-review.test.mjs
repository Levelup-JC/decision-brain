// Plan XVIII Test Suite — Portfolio Overview Consistency After Sell Review
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SEED = {
  symbol: "BTC",
  units: 1,
  averageCost: 80000,
  reason: "BTC回调较多，目标是囤到一个比特币"
};

async function withTempState(t, callback) {
  const dataDir = await mkdtemp(join(tmpdir(), "db-plan18-port-"));
  const prevDir = process.env.DECISION_BRAIN_DATA_DIR;
  const prevFile = process.env.DECISION_BRAIN_STATE_FILE;
  const prevOffline = process.env.DECISION_BRAIN_OFFLINE;
  process.env.DECISION_BRAIN_DATA_DIR = dataDir;
  process.env.DECISION_BRAIN_OFFLINE = "1";
  delete process.env.DECISION_BRAIN_STATE_FILE;

  const { store } = await import("../src/data-store.mjs");
  store.resetCache();
  await store.clear();

  t.after(async () => {
    if (prevDir === undefined) delete process.env.DECISION_BRAIN_DATA_DIR;
    else process.env.DECISION_BRAIN_DATA_DIR = prevDir;
    if (prevFile === undefined) delete process.env.DECISION_BRAIN_STATE_FILE;
    else process.env.DECISION_BRAIN_STATE_FILE = prevFile;
    if (prevOffline === undefined) delete process.env.DECISION_BRAIN_OFFLINE;
    else process.env.DECISION_BRAIN_OFFLINE = prevOffline;
    store.resetCache();
  });

  return callback(dataDir);
}

async function seedBtc() {
  const { managePosition, confirmPlan } = await import("../src/services/api-service.mjs");
  await managePosition({
    assetQuery: SEED.symbol,
    units: SEED.units,
    averageCost: SEED.averageCost,
    reason: SEED.reason,
  });
  await confirmPlan({ assetQuery: SEED.symbol });
}

// ── 持仓总览必须读取持久化事实源 ────────────────────────────────

test("getPortfolioSummary returns BTC 1 after seed", async (t) => {
  await withTempState(t, async () => {
    await seedBtc();
    const { getPortfolioSummary } = await import("../src/services/api-service.mjs");
    const summary = await getPortfolioSummary();

    assert.equal(summary.totalCount, 1);
    assert.equal(summary.positions.length, 1);
    assert.equal(summary.positions[0].symbol, "BTC");
    assert.equal(summary.positions[0].units, 1);
    assert.equal(summary.positions[0].averageCost, 80000);
  });
});

// ── 连续卖出 review 后持仓总览仍显示 BTC ─────────────────────────

test("portfolio summary still shows BTC after sell review messages", async (t) => {
  await withTempState(t, async () => {
    await seedBtc();

    const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
    const sellMessages = [
      "我现在觉得比特币跌到6万了，我想卖掉一半，我怕它跌到3万。",
      "卖 30%",
      "可以卖吗？",
      "好，先卖15%。",
    ];

    for (const msg of sellMessages) {
      classifyIntent(msg);
    }

    const { getPortfolioSummary } = await import("../src/services/api-service.mjs");
    const summary = await getPortfolioSummary();

    assert.equal(summary.totalCount, 1, "still 1 position after sell reviews");
    assert.equal(summary.positions[0].symbol, "BTC");
    assert.equal(summary.positions[0].units, 1);
    assert.equal(summary.positions[0].averageCost, 80000);
    assert.ok(summary.positions[0].reason, "reason field is preserved");
  });
});

// ── 刷新研究后持仓仍存在 ──────────────────────────────────────

test("portfolio summary still shows BTC after refresh_research", async (t) => {
  await withTempState(t, async () => {
    await seedBtc();

    const { refreshResearch, getPortfolioSummary } = await import("../src/services/api-service.mjs");
    await refreshResearch({ assetQuery: "BTC" });

    const summary = await getPortfolioSummary();
    assert.equal(summary.totalCount, 1, "BTC still exists after refresh");
    assert.equal(summary.positions[0].units, 1);
  });
});

// ── 持仓总览字段完整性 ────────────────────────────────────────

test("portfolio summary contains all required fields", async (t) => {
  await withTempState(t, async () => {
    await seedBtc();

    const { getPortfolioSummary } = await import("../src/services/api-service.mjs");
    const summary = await getPortfolioSummary();
    const pos = summary.positions[0];

    const requiredFields = ["symbol", "units", "averageCost", "currentPrice", "reason"];
    for (const field of requiredFields) {
      assert.ok(
        pos[field] !== undefined && pos[field] !== null,
        `field '${field}' must be present, got: ${pos[field]}`
      );
    }
  });
});

// ── 确认记录卖出后持仓总览更新 ──────────────────────────────────

test("after confirmed sell, portfolio summary reflects reduced units", async (t) => {
  await withTempState(t, async () => {
    await seedBtc();

    // Simulate confirmed sell via managePosition
    const { managePosition, getPortfolioSummary } = await import("../src/services/api-service.mjs");
    await managePosition({
      assetQuery: "BTC",
      units: 0.15,
      action: "sell",
    });

    const summary = await getPortfolioSummary();
    assert.equal(summary.positions.length, 1);
    assert.equal(summary.positions[0].symbol, "BTC");
    assert.equal(summary.positions[0].units, 0.85, "units reduced from 1 to 0.85");
    assert.equal(summary.positions[0].averageCost, 80000, "average cost unchanged");
  });
});

// ── API endpoint returns consistent data ─────────────────────────

test("GET /api/portfolio-summary returns consistent JSON", async (t) => {
  await withTempState(t, async () => {
    await seedBtc();

    const { getPortfolioSummary } = await import("../src/services/api-service.mjs");
    const result = await getPortfolioSummary();

    assert.equal(result.ok, true);
    assert.ok(result.totalCount >= 0);
    assert.ok(Array.isArray(result.positions));
    assert.ok(typeof result.activeCount === "number");
    assert.ok(typeof result.draftCount === "number");
  });
});
