import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { classifyIntent, planFanout, runOrchestrator } from "../src/chat-orchestrator.mjs";

// ── Plan XV Section 5: Panic Sell Guardrail ─────────────────────────────

// ─── Panic sell detection (extractSlotsRule panicFlag) ─────────────────

test("现在跌得好厉害，我有点想把BTC卖掉 → review_sell with panicFlag", () => {
  const result = classifyIntent("现在跌得好厉害，我有点想把BTC卖掉", {});
  assert.equal(result.intent, "review_sell");
  assert.equal(result.slots.assetQuery, "BTC");
  assert.equal(result.slots.panicFlag, true);
});

test("我怕继续跌，想清仓 → review_sell with panicFlag", () => {
  const result = classifyIntent("我怕继续跌，想清仓", { lastAsset: "BTC" });
  assert.equal(result.intent, "review_sell");
  assert.equal(result.slots.panicFlag, true);
});

test("跌麻了，要不要卖 → review_sell with panicFlag", () => {
  const result = classifyIntent("跌麻了，要不要卖", { lastAsset: "BTC" });
  assert.equal(result.intent, "review_sell");
  assert.equal(result.slots.panicFlag, true);
});

test("我受不了了，卖掉吧 → review_sell with panicFlag", () => {
  const result = classifyIntent("我受不了了，卖掉吧", { lastAsset: "SOL" });
  assert.equal(result.intent, "review_sell");
  assert.equal(result.slots.panicFlag, true);
});

test("帮我判断要不要卖 → review_sell with panicFlag", () => {
  const result = classifyIntent("帮我判断要不要卖", { lastAsset: "BTC" });
  assert.equal(result.intent, "review_sell");
  assert.equal(result.slots.panicFlag, true);
});

test("清仓 BTC → review_sell with panicFlag", () => {
  const result = classifyIntent("清仓 BTC", {});
  assert.equal(result.intent, "review_sell");
  assert.equal(result.slots.panicFlag, true);
});

// ─── Non-panic sell: just asking to sell without distress ─────────────

test("卖 30% BTC → review_sell without panicFlag (冷静卖出)", () => {
  const result = classifyIntent("卖 30% BTC", {});
  assert.equal(result.intent, "review_sell");
  assert.equal(result.slots.panicFlag, false);
});

test("卖一个 BTC → review_sell without panicFlag", () => {
  const result = classifyIntent("卖一个 BTC", {});
  assert.equal(result.intent, "review_sell");
  assert.equal(result.slots.panicFlag, false);
});

test("止盈 50% → review_sell without panicFlag", () => {
  const result = classifyIntent("止盈 50%", { lastAsset: "BTC" });
  assert.equal(result.intent, "review_sell");
  assert.equal(result.slots.panicFlag, false);
});

// ─── Panic sell with position data → 5-part reply via synthesizeWithResults ──

test("panic sell with seeded position shows 5-part reply via synthesizeWithResults", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "decision-brain-ps-"));
  const prevDir = process.env.DECISION_BRAIN_DATA_DIR;
  const prevFile = process.env.DECISION_BRAIN_STATE_FILE;
  process.env.DECISION_BRAIN_DATA_DIR = dataDir;
  delete process.env.DECISION_BRAIN_STATE_FILE;

  const seedState = {
    assets: {
      "btc-001": { id: "btc-001", symbol: "BTC", aliases: ["btc", "bitcoin"] },
    },
    positions: {
      "btc-001": {
        units: 3,
        averageCost: 50000,
        currentPrice: 45000,
        currentValue: 135000,
        peakUnits: 3,
        reason: "长期看好 BTC 作为数字黄金和周期核心资产",
      },
    },
    plans: {
      "btc-001": {
        status: "active",
        sellZone: "进入基准估值区或 thesis 被破坏才卖",
        floorRule: { minimumUnits: 1 },
        monitoringPolicy: { sellThresholdPct: 20 },
        thesisInvalidators: ["BTC 被证明不安全", "全球禁止加密货币"],
      },
    },
    valuationModels: {
      "btc-001": { thesis: ["BTC 是数字黄金，长期价值存储"] },
    },
    sources: {},
    researchReports: {},
    traces: {},
  };

  await writeFile(join(dataDir, "state.json"), JSON.stringify(seedState));

  const prevApiKey = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;

  try {
    const { synthesizeWithResults } = await import("../src/chat-orchestrator.mjs");
    const reply = await synthesizeWithResults(
      "review_sell",
      [], // no agent results needed for panic path
      { assetQuery: "BTC", panicFlag: true },
      { lastAsset: "BTC" }
    );
    assert.ok(reply.includes("先别急着执行"));
    assert.ok(reply.includes("回看你最初的投资逻辑"));
    assert.ok(reply.includes("长期看好 BTC"));
    assert.ok(reply.includes("情绪驱动") || reply.includes("panic sell") || reply.includes("恐慌卖出"));
    assert.ok(reply.includes("底仓"));
    assert.ok(reply.includes("计划边界"));
    assert.ok(reply.includes("什么情况才该卖"));
    assert.ok(reply.includes("现在建议"));
  } finally {
    process.env.DECISION_BRAIN_DATA_DIR = prevDir || "";
    if (prevFile === undefined) delete process.env.DECISION_BRAIN_STATE_FILE;
    else process.env.DECISION_BRAIN_STATE_FILE = prevFile;
    if (prevApiKey !== undefined) process.env.LLM_API_KEY = prevApiKey;
    else delete process.env.LLM_API_KEY;
  }
});

test("panic sell without position reason shows missing reason prompt", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "decision-brain-ps2-"));
  const prevDir = process.env.DECISION_BRAIN_DATA_DIR;
  const prevFile = process.env.DECISION_BRAIN_STATE_FILE;
  process.env.DECISION_BRAIN_DATA_DIR = dataDir;
  delete process.env.DECISION_BRAIN_STATE_FILE;

  const seedState = {
    assets: { "btc-001": { id: "btc-001", symbol: "BTC" } },
    positions: {
      "btc-001": { units: 2, averageCost: 50000, currentPrice: 45000, currentValue: 90000 },
    },
    plans: {},
    valuationModels: {},
    sources: {},
    researchReports: {},
    traces: {},
  };

  await writeFile(join(dataDir, "state.json"), JSON.stringify(seedState));

  const prevApiKey = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;

  try {
    const { synthesizeWithResults } = await import("../src/chat-orchestrator.mjs");
    const reply = await synthesizeWithResults(
      "review_sell",
      [],
      { assetQuery: "BTC", panicFlag: true },
      { lastAsset: "BTC" }
    );
    assert.ok(reply.includes("先别急着执行"));
    assert.ok(
      reply.includes("还没有你的原始") ||
        reply.includes("缺少买入理由") ||
        reply.includes("缺少投资逻辑")
    );
  } finally {
    process.env.DECISION_BRAIN_DATA_DIR = prevDir || "";
    if (prevFile === undefined) delete process.env.DECISION_BRAIN_STATE_FILE;
    else process.env.DECISION_BRAIN_STATE_FILE = prevFile;
    if (prevApiKey !== undefined) process.env.LLM_API_KEY = prevApiKey;
    else delete process.env.LLM_API_KEY;
  }
});

// ─── Fanout verification ──────────────────────────────────────────────

test("review_sell fanout includes asset_info, memory, valuation, sentiment, technical", () => {
  const fanout = planFanout("review_sell");
  assert.ok(fanout.includes("asset_info"));
  assert.ok(fanout.includes("memory"));
  assert.ok(fanout.includes("valuation"));
  assert.ok(fanout.includes("sentiment"));
  assert.ok(fanout.includes("technical"));
});

// ─── Panic flag propagation in degraded mode (synthesizeRule) ─────────

test("review_sell panicFlag in degraded mode shows 5-part condensed reply", async () => {
  const { synthesizeRule } = await import("../src/chat-orchestrator.mjs");
  const reply = synthesizeRule(
    "review_sell",
    [],
    { assetQuery: "BTC", panicFlag: true },
    { lastAsset: "BTC" }
  );
  assert.ok(reply.includes("先别急着执行"));
  assert.ok(reply.includes("回看你最初的投资逻辑"));
  assert.ok(reply.includes("计划边界"));
  assert.ok(reply.includes("thesis") || reply.includes("什么情况才该卖"));
  assert.ok(reply.includes("建议"));
  assert.ok(reply.includes("panic sell") || reply.includes("情绪驱动") || reply.includes("恐慌卖出"));
});

// ─── Memory agent headline no longer shows add_to_existing ─────────────

test("review_sell contextInt triggers review_sell_position in memory", async () => {
  const { lookupPortfolioMemory } = await import("../src/services/portfolio-memory-service.mjs");

  const state = {
    assets: { "btc-001": { id: "btc-001", symbol: "BTC" } },
    positions: {
      "btc-001": { units: 3, averageCost: 50000, currentPrice: 45000, currentValue: 135000 },
    },
    plans: {},
    researchReports: {},
    valuationModels: {},
    sources: {},
    traces: {},
  };

  const result = await lookupPortfolioMemory("BTC", state, {
    contextIntent: "review_sell",
  });
  assert.equal(result.portfolioMemoryProfile.suggestedIntentClass, "review_sell_position");
});

test("default context (no intent hint) still returns add_to_existing", async () => {
  const { lookupPortfolioMemory } = await import("../src/services/portfolio-memory-service.mjs");

  const state = {
    assets: { "btc-001": { id: "btc-001", symbol: "BTC" } },
    positions: {
      "btc-001": { units: 3, averageCost: 50000, currentPrice: 45000, currentValue: 135000 },
    },
    plans: {},
    researchReports: {},
    valuationModels: {},
    sources: {},
    traces: {},
  };

  const result = await lookupPortfolioMemory("BTC", state);
  assert.equal(result.portfolioMemoryProfile.suggestedIntentClass, "add_to_existing");
});
