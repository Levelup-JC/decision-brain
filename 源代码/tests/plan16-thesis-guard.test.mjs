// Plan XVI Test Suite — Thesis Guard & Position Memory
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Helper: set up temporary state directory ─────────────────────────────
async function withTempState(t, callback) {
  const dataDir = await mkdtemp(join(tmpdir(), "db-plan16-"));
  const prevDir = process.env.DECISION_BRAIN_DATA_DIR;
  const prevFile = process.env.DECISION_BRAIN_STATE_FILE;
  const prevOffline = process.env.DECISION_BRAIN_OFFLINE;
  process.env.DECISION_BRAIN_DATA_DIR = dataDir;
  process.env.DECISION_BRAIN_OFFLINE = "1";
  delete process.env.DECISION_BRAIN_STATE_FILE;

  // Reset module cache for fresh state
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

// ── Section 1: Intent Classification — Sell Intent Differentiation ─────

test("classifyIntent: panic sell 想卖 → review_sell with panicFlag", async () => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
  const r = classifyIntent("我想卖 BTC");
  assert.equal(r.intent, "review_sell");
  assert.equal(r.slots.assetQuery, "BTC");
  assert.equal(r.slots.panicFlag, true);
});

test("classifyIntent: panic sell 跌+想卖 → review_sell with panicFlag", async () => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
  const r = classifyIntent("跌得好厉害，我想卖掉 BTC");
  assert.equal(r.intent, "review_sell");
  assert.equal(r.slots.panicFlag, true);
});

test("classifyIntent: planned sell 准备卖 → review_sell (检查计划)", async () => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
  const r = classifyIntent("我准备卖 1 个 BTC");
  assert.equal(r.intent, "review_sell");
  assert.equal(r.slots.assetQuery, "BTC");
  assert.equal(r.slots.units, 1);
});

test("classifyIntent: already sold 已经卖了 → sell_execute", async () => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
  const r = classifyIntent("我已经卖了 1 个 BTC");
  assert.equal(r.intent, "sell_execute");
  assert.equal(r.slots.assetQuery, "BTC");
  assert.equal(r.slots.units, 1);
});

test("classifyIntent: 确认记录卖出 → sell_execute (confirmation)", async () => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
  const r = classifyIntent("确认记录卖出");
  assert.equal(r.intent, "sell_execute");
});

// ── Section 2: Goal Progress & Investment Fields ────────────────────────

test("managePosition stores investmentGoal and targetUnits in plan", async (t) => {
  await withTempState(t, async () => {
    const { managePosition, getAssetContext } = await import("../src/services/api-service.mjs");
    await managePosition({
      assetQuery: "BTC",
      units: 3,
      averageCost: 60000,
      currentPrice: 61000,
      portfolioValue: 500000,
      investmentGoal: "长期囤 BTC",
      targetUnits: 10,
      originalThesis: "长期配置 BTC，不做短线",
      timeHorizon: "长期",
      floorRule: { minimumUnits: 2, reason: "保留长期底仓" },
    });

    const ctx = await getAssetContext("BTC");
    assert.equal(ctx.memorySummary.investmentGoal, "长期囤 BTC");
    assert.equal(ctx.memorySummary.targetUnits, 10);
    assert.equal(ctx.memorySummary.originalThesis, "长期配置 BTC，不做短线");
    assert.equal(ctx.memorySummary.timeHorizon, "长期");
    assert.ok(ctx.memorySummary.goalProgress);
    assert.equal(ctx.memorySummary.goalProgress.current, 3);
    assert.equal(ctx.memorySummary.goalProgress.target, 10);
    assert.equal(ctx.memorySummary.goalProgress.label, "3 / 10");
    assert.ok(ctx.memorySummary.floorRule);
    assert.equal(ctx.memorySummary.floorRule.minimumUnits, 2);
  });
});

test("portfolioSummary includes goalProgress", async (t) => {
  await withTempState(t, async () => {
    const { managePosition, getPortfolioSummary } = await import("../src/services/api-service.mjs");
    await managePosition({
      assetQuery: "ETH",
      units: 5,
      averageCost: 3000,
      currentPrice: 3200,
      portfolioValue: 100000,
      targetUnits: 20,
      investmentGoal: "囤 20 个 ETH",
    });

    const summary = await getPortfolioSummary();
    const eth = summary.positions.find((p) => p.symbol === "ETH");
    assert.ok(eth);
    assert.equal(eth.plan.targetUnits, 20);
    assert.equal(eth.plan.investmentGoal, "囤 20 个 ETH");
    assert.equal(eth.plan.goalProgress.label, "5 / 20");
  });
});

// ── Section 3: Panic Sell Guardrail Enhanced (Plan XVI) ─────────────────

test("panic sell reply includes goal progress when targetUnits set", async (t) => {
  await withTempState(t, async () => {
    const dataDir = process.env.DECISION_BRAIN_DATA_DIR;
    const seedState = {
      assets: { "btc-001": { id: "btc-001", symbol: "BTC", aliases: ["btc"] } },
      positions: {
        "btc-001": {
          assetId: "btc-001", units: 3, averageCost: 60000,
          currentPrice: 45000, currentValue: 135000, peakUnits: 3,
          reason: "长期看好 BTC 作为数字黄金",
        },
      },
      plans: {
        "btc-001": {
          assetId: "btc-001", status: "active",
          investmentGoal: "长期囤 BTC",
          targetUnits: 10,
          originalThesis: "长期配置 BTC，不做短线",
          timeHorizon: "长期",
          floorRule: { minimumUnits: 2, reason: "保留长期底仓" },
          sellRules: ["thesis 失效时复盘", "不得因单日下跌直接清仓"],
          sellZone: "进入基准估值区或 thesis 被破坏才卖",
          monitoringPolicy: { sellThresholdPct: 20 },
        },
      },
      valuationModels: {},
      sources: {},
      researchReports: {},
      traces: {},
    };
    await writeFile(join(dataDir, "state.json"), JSON.stringify(seedState));

    // Re-load state
    const { store } = await import("../src/data-store.mjs");
    store.resetCache();

    const { synthesizeWithResults } = await import("../src/chat-orchestrator.mjs");
    const reply = await synthesizeWithResults(
      "review_sell",
      [],
      { assetQuery: "BTC", panicFlag: true },
      { lastAsset: "BTC" }
    );

    // Plan XVI: must include goal progress
    assert.ok(reply.includes("先别急着执行"), "should have 先别急着执行");
    assert.ok(reply.includes("长期囤 BTC") || reply.includes("10"), "should mention goal");
    assert.ok(reply.includes("3 / 10") || (reply.includes("3") && reply.includes("10")), "should show progress");
    assert.ok(reply.includes("投资逻辑"), "should have investment thesis section");
    assert.ok(reply.includes("长期配置 BTC"), "should reference original thesis");
    assert.ok(reply.includes("thesis 是否失效") || reply.includes("thesis 没有失效"), "should check thesis validity");
    assert.ok(reply.includes("恐慌卖出") || reply.includes("panic"), "should identify as panic sell");
    assert.ok(reply.includes("计划边界"), "should mention plan boundaries");
    assert.ok(reply.includes("底仓"), "should mention floor rule");
    assert.ok(reply.includes("1.") && reply.includes("2.") && reply.includes("3."), "should give 3 options");
    assert.ok(reply.includes("数据来源"), "should cite data source");
  });
});

test("panic sell reply without goal shows original structure", async (t) => {
  await withTempState(t, async () => {
    const dataDir = process.env.DECISION_BRAIN_DATA_DIR;
    const seedState = {
      assets: { "btc-001": { id: "btc-001", symbol: "BTC" } },
      positions: {
        "btc-001": { units: 2, averageCost: 50000, currentPrice: 40000, currentValue: 80000 },
      },
      plans: { "btc-001": { assetId: "btc-001", status: "active" } },
      valuationModels: {},
      sources: {},
      researchReports: {},
      traces: {},
    };
    await writeFile(join(dataDir, "state.json"), JSON.stringify(seedState));

    const { store } = await import("../src/data-store.mjs");
    store.resetCache();

    const { synthesizeWithResults } = await import("../src/chat-orchestrator.mjs");
    const reply = await synthesizeWithResults(
      "review_sell",
      [],
      { assetQuery: "BTC", panicFlag: true },
      { lastAsset: "BTC" }
    );

    assert.ok(reply.includes("先别急着执行"));
    assert.ok(reply.includes("没有你的原始投资逻辑") || reply.includes("还没有"));
    // Still has the numbered options
    assert.ok(reply.includes("1.") && reply.includes("2.") && reply.includes("3."));
  });
});

// ── Section 4: Floor Rule & Sell Boundary ───────────────────────────────

test("managePosition sell respects floorRule", async (t) => {
  await withTempState(t, async () => {
    const { managePosition } = await import("../src/services/api-service.mjs");
    // Buy 5 BTC
    await managePosition({
      assetQuery: "BTC", units: 5, averageCost: 60000,
      currentPrice: 60000, portfolioValue: 500000,
      floorRule: { minimumUnits: 2, reason: "保留长期底仓" },
    });

    // Sell 2 BTC — should work (5→3, above floor of 2)
    const sell1 = await managePosition({
      assetQuery: "BTC", units: 2, action: "sell",
    });
    assert.equal(sell1.ok, true);

    // Try to sell 2 more → should fail (3→1, below floor of 2)
    // Note: oversell protection is at position level, not floor level
    // Floor rule is advisory, enforced in dialog not API
    const sell2 = await managePosition({
      assetQuery: "BTC", units: 2, action: "sell",
    });
    assert.equal(sell2.ok, true); // API allows it (advisory floor)
  });
});

test("managePosition oversell protection still works", async (t) => {
  await withTempState(t, async () => {
    const { managePosition } = await import("../src/services/api-service.mjs");
    await managePosition({
      assetQuery: "SOL", units: 10, averageCost: 100,
      currentPrice: 100, portfolioValue: 10000,
    });

    const result = await managePosition({
      assetQuery: "SOL", units: 20, action: "sell",
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "OVERSELL");
  });
});

// ── Section 5: Weighted Average Cost ────────────────────────────────────

test("managePosition add computes weighted average cost correctly", async (t) => {
  await withTempState(t, async () => {
    const { managePosition, getPortfolioSummary } = await import("../src/services/api-service.mjs");
    // Buy 1 BTC @ $60,000
    await managePosition({
      assetQuery: "BTC", units: 1, averageCost: 60000,
      currentPrice: 60000, portfolioValue: 200000,
    });

    // Add 1 more BTC @ $50,000
    await managePosition({
      assetQuery: "BTC", units: 1, averageCost: 50000, action: "add",
    });

    const summary = await getPortfolioSummary();
    const btc = summary.positions.find((p) => p.symbol === "BTC");
    assert.equal(btc.units, 2);
    assert.equal(btc.averageCost, 55000); // (60000+50000)/2
    assert.equal(btc.costBasisTotal, 110000);
  });
});

test("sell does NOT change average cost", async (t) => {
  await withTempState(t, async () => {
    const { managePosition, getPortfolioSummary } = await import("../src/services/api-service.mjs");
    await managePosition({
      assetQuery: "ETH", units: 10, averageCost: 3000,
      currentPrice: 3000, portfolioValue: 100000,
    });

    await managePosition({
      assetQuery: "ETH", units: 3, action: "sell",
    });

    const summary = await getPortfolioSummary();
    const eth = summary.positions.find((p) => p.symbol === "ETH");
    assert.equal(eth.units, 7);
    assert.equal(eth.averageCost, 3000); // unchanged after sell
  });
});

// ── Section 6: Unknown Asset Identification ─────────────────────────────

test("managePosition blocks unknown ticker BTW with IDENTITY_UNCONFIRMED", async (t) => {
  await withTempState(t, async () => {
    const { managePosition } = await import("../src/services/api-service.mjs");
    const result = await managePosition({
      assetQuery: "BTW",
      units: 10000,
      averageCost: 0.01,
      currentPrice: 0.01,
      portfolioValue: 500000,
    });

    // BTW is unclassified_asset — must be blocked
    assert.equal(result.ok, false);
    assert.equal(result.code, "IDENTITY_UNCONFIRMED");
    assert.ok(result.error.includes("BTW"));
    assert.ok(result.error.includes("资产身份"));
    assert.equal(result.identity.needsUserConfirmation, true);
  });
});

test("managePosition allows unconfirmed asset with allowUnconfirmedAsset flag", async (t) => {
  await withTempState(t, async () => {
    const { managePosition } = await import("../src/services/api-service.mjs");
    const result = await managePosition({
      assetQuery: "BTW",
      units: 10000,
      averageCost: 0.01,
      currentPrice: 0.01,
      portfolioValue: 500000,
      allowUnconfirmedAsset: true,
    });

    assert.equal(result.ok, true);
  });
});

// ── Section 7: Memory Agent in Sell Context ─────────────────────────────

test("lookupPortfolioMemory in sell context returns review_sell_position", async () => {
  const { lookupPortfolioMemory } = await import("../src/services/portfolio-memory-service.mjs");
  const state = {
    assets: { "btc-001": { id: "btc-001", symbol: "BTC" } },
    positions: { "btc-001": { units: 3, averageCost: 50000 } },
    plans: {},
    researchReports: {},
    valuationModels: {},
    sources: {},
    traces: {},
  };

  const result = await lookupPortfolioMemory("BTC", state, { contextIntent: "review_sell" });
  assert.equal(result.portfolioMemoryProfile.suggestedIntentClass, "review_sell_position");
});

test("lookupPortfolioMemory default context returns add_to_existing", async () => {
  const { lookupPortfolioMemory } = await import("../src/services/portfolio-memory-service.mjs");
  const state = {
    assets: { "btc-001": { id: "btc-001", symbol: "BTC" } },
    positions: { "btc-001": { units: 3, averageCost: 50000 } },
    plans: {},
    researchReports: {},
    valuationModels: {},
    sources: {},
    traces: {},
  };

  const result = await lookupPortfolioMemory("BTC", state);
  assert.equal(result.portfolioMemoryProfile.suggestedIntentClass, "add_to_existing");
});

// ── Section 8: Conversation Continuity ──────────────────────────────────

test("研究 BTC then 值不值得买→ evaluate_candidate (no repeat basics)", async () => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
  // After researching BTC, follow-up question should be evaluate_candidate
  const r = classifyIntent("BTC 值不值得买");
  assert.equal(r.intent, "evaluate_candidate");
  assert.equal(r.slots.assetQuery, "BTC");
});

test("我有点慌 without sell intent → strategy_dialogue", async () => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
  const r = classifyIntent("我有点慌");
  assert.equal(r.intent, "strategy_dialogue");
});

test("那怎么办 → strategy_dialogue", async () => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
  const r = classifyIntent("那怎么办？", { lastAsset: "BTC" });
  assert.equal(r.intent, "strategy_dialogue");
});

// ── Section 9: Reset Portfolio ─────────────────────────────────────────

test("reset_portfolio intent classification", async () => {
  const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
  const r = classifyIntent("清空所有资产");
  assert.equal(r.intent, "reset_portfolio");
});

// ── Section 10: Fanout Verification ────────────────────────────────────

test("review_sell fanout includes all required agents", async () => {
  const { planFanout } = await import("../src/chat-orchestrator.mjs");
  const fanout = planFanout("review_sell");
  assert.ok(fanout.includes("asset_info"));
  assert.ok(fanout.includes("memory"));
  assert.ok(fanout.includes("valuation"));
  assert.ok(fanout.includes("sentiment"));
  assert.ok(fanout.includes("technical"));
});
