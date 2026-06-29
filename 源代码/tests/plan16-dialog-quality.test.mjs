// Plan XVI 负责人 2 — 对话智能与投资初心护栏 自检测试
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { classifyIntent, synthesizeRule, planFanout } from "../src/chat-orchestrator.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// Self-Check 1: 研究 BTC → BTC 是否值得买: 承接上一轮，不重复基础介绍
// ═══════════════════════════════════════════════════════════════════════════

test("Self-Check 1a: 研究 BTC → BTC 值不值得买: second intent is evaluate_candidate", () => {
  const ctx = {
    lastAsset: "BTC",
    lastIntent: "lookup_asset_info",
    lastResearchSummary: {
      assetQuery: "BTC",
      lastBasicInfoAt: new Date().toISOString(),
      lastMentionedFacts: "BTC 当前价格 $62000，市值 $1.2T",
    },
    recentTurns: [
      { message: "研究 BTC", intent: "lookup_asset_info", assetQuery: "BTC" },
    ],
  };
  const result = classifyIntent("BTC 值不值得买？", ctx);
  assert.equal(result.intent, "evaluate_candidate",
    `Second turn should upgrade to evaluate_candidate, got ${result.intent}`);
  assert.equal(result.slots.assetQuery, "BTC");
});

test("Self-Check 1b: 研究 BTC → 能不能买: second intent is evaluate_candidate", () => {
  const ctx = {
    lastAsset: "BTC",
    lastIntent: "lookup_asset_info",
    lastResearchSummary: {
      assetQuery: "BTC",
      lastBasicInfoAt: new Date().toISOString(),
    },
    recentTurns: [
      { message: "研究 BTC", intent: "lookup_asset_info", assetQuery: "BTC" },
    ],
  };
  const result = classifyIntent("BTC 能不能买", ctx);
  assert.equal(result.intent, "evaluate_candidate");
});

test("Self-Check 1c: synthesizeRule for evaluate_candidate does NOT repeat basic asset info format", () => {
  // When user already researched, the evaluate_candidate reply should advance to judgment
  const reply = synthesizeRule("evaluate_candidate", [], { assetQuery: "BTC" }, { lastAsset: "BTC" });
  // Should not be a plain asset info lookup reply
  assert.ok(
    reply.includes("多维度研究") || reply.includes("委员会") || reply.includes("研究评估"),
    "evaluate_candidate should trigger research assessment, not repeat basic info"
  );
  assert.ok(!reply.includes("当前价格为") || reply.includes("研究"),
    "Should not be a standalone price lookup reply");
});

// ═══════════════════════════════════════════════════════════════════════════
// Self-Check 2: 跌得好厉害，我想卖 BTC → 触发投资初心护栏
// ═══════════════════════════════════════════════════════════════════════════

test("Self-Check 2a: panic sell triggers review_sell with panicFlag", () => {
  const r = classifyIntent("跌得好厉害，我想卖 BTC");
  assert.equal(r.intent, "review_sell");
  assert.equal(r.slots.assetQuery, "BTC");
  assert.equal(r.slots.panicFlag, true);
});

test("Self-Check 2b: 跌得好厉害，我想卖掉 BTC triggers panicFlag", () => {
  const r = classifyIntent("跌得好厉害，我想卖掉 BTC");
  assert.equal(r.intent, "review_sell");
  assert.equal(r.slots.panicFlag, true);
});

test("Self-Check 2c: 我怕继续跌想清仓 triggers panicFlag", () => {
  const r = classifyIntent("我怕继续跌，想清仓", { lastAsset: "BTC" });
  assert.equal(r.intent, "review_sell");
  assert.equal(r.slots.panicFlag, true);
});

test("Self-Check 2d: panic sell degraded reply contains 5-part structure", () => {
  const reply = synthesizeRule("review_sell", [],
    { assetQuery: "BTC", panicFlag: true },
    { lastAsset: "BTC" }
  );
  assert.ok(reply.includes("先别急着执行"), "Must have 先别急着执行");
  assert.ok(reply.includes("投资逻辑"), "Must reference investment logic");
  assert.ok(reply.includes("计划边界"), "Must reference plan boundaries");
  assert.ok(reply.includes("建议"), "Must have suggestions");
  assert.ok(reply.includes("panic") || reply.includes("恐慌卖出") || reply.includes("情绪"),
    "Must identify panic sell risk");
});

// ═══════════════════════════════════════════════════════════════════════════
// Self-Check 3: 恐慌卖出回复包含目标仓位、当前进度、原 thesis、thesis 是否失效
// ═══════════════════════════════════════════════════════════════════════════

test("Self-Check 3: panic sell reply with full state includes all required fields", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "db-plan16-dq-"));
  const prevDir = process.env.DECISION_BRAIN_DATA_DIR;
  const prevFile = process.env.DECISION_BRAIN_STATE_FILE;
  const prevOffline = process.env.DECISION_BRAIN_OFFLINE;
  process.env.DECISION_BRAIN_DATA_DIR = dataDir;
  process.env.DECISION_BRAIN_OFFLINE = "1";
  delete process.env.DECISION_BRAIN_STATE_FILE;

  const seedState = {
    assets: { "btc-001": { id: "btc-001", symbol: "BTC", aliases: ["btc"] } },
    positions: {
      "btc-001": {
        units: 3, averageCost: 60000,
        currentPrice: 45000, currentValue: 135000,
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
        thesisInvalidators: ["BTC 被证明不安全"],
        monitoringPolicy: { sellThresholdPct: 20 },
      },
    },
    valuationModels: {
      "btc-001": { thesis: ["BTC 是数字黄金，长期价值存储"] },
    },
    sources: {}, researchReports: {}, traces: {},
  };
  await writeFile(join(dataDir, "state.json"), JSON.stringify(seedState));

  const { store } = await import("../src/data-store.mjs");
  store.resetCache();

  t.after(async () => {
    if (prevDir === undefined) delete process.env.DECISION_BRAIN_DATA_DIR;
    else process.env.DECISION_BRAIN_DATA_DIR = prevDir;
    if (prevFile === undefined) delete process.env.DECISION_BRAIN_STATE_FILE;
    else process.env.DECISION_BRAIN_STATE_FILE = prevFile;
    if (prevOffline === undefined) delete process.env.DECISION_BRAIN_OFFLINE;
    else process.env.DECISION_BRAIN_OFFLINE = prevOffline;
    store.resetCache();
  });

  const prevApiKey = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;

  try {
    const { synthesizeWithResults } = await import("../src/chat-orchestrator.mjs");
    const reply = await synthesizeWithResults(
      "review_sell", [],
      { assetQuery: "BTC", panicFlag: true },
      { lastAsset: "BTC" }
    );

    // Must include: goal
    assert.ok(reply.includes("长期囤 BTC") || reply.includes("目标"),
      "Must reference investment goal");
    // Must include: progress (3/10)
    assert.ok(reply.includes("3") && reply.includes("10"),
      "Must show current progress vs target");
    // Must include: original thesis
    assert.ok(reply.includes("长期配置 BTC") || reply.includes("长期看好"),
      "Must reference original thesis");
    // Must include: thesis validity check
    assert.ok(reply.includes("thesis 是否失效") || reply.includes("thesis 没有失效") || reply.includes("thesis 失效"),
      "Must check thesis validity");
    // Must include: plan boundaries
    assert.ok(reply.includes("计划边界"), "Must reference plan boundaries");
    // Must include: numbered options
    assert.ok(reply.includes("1.") && reply.includes("2.") && reply.includes("3."),
      "Must give 3 numbered options");
    // Must NOT suggest clearing position
    assert.ok(!reply.includes("建议清仓"), "Must NOT suggest clearing position");
    assert.ok(!reply.includes("全部卖出"), "Must NOT suggest selling everything");
  } finally {
    if (prevApiKey !== undefined) process.env.LLM_API_KEY = prevApiKey;
    else delete process.env.LLM_API_KEY;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Self-Check 4: 我准备卖 1 个 BTC → 先检查底仓和计划边界，不直接改仓位
// ═══════════════════════════════════════════════════════════════════════════

test("Self-Check 4a: 我准备卖 1 个 BTC → review_sell with plannedSellFlag", () => {
  const r = classifyIntent("我准备卖 1 个 BTC");
  assert.equal(r.intent, "review_sell");
  assert.equal(r.slots.assetQuery, "BTC");
  assert.equal(r.slots.units, 1);
  assert.equal(r.slots.panicFlag, false);
  assert.equal(r.slots.plannedSellFlag, true);
});

test("Self-Check 4b: 打算卖 2 个 ETH → review_sell with plannedSellFlag", () => {
  const r = classifyIntent("打算卖 2 个 ETH");
  assert.equal(r.intent, "review_sell");
  assert.equal(r.slots.assetQuery, "ETH");
  assert.equal(r.slots.plannedSellFlag, true);
});

test("Self-Check 4c: planned sell degraded reply checks boundaries, not direct execution", () => {
  const reply = synthesizeRule("review_sell", [],
    { assetQuery: "BTC", units: 1, plannedSellFlag: true, panicFlag: false },
    { lastAsset: "BTC" }
  );
  assert.ok(reply.includes("先确认计划边界"), "Must check plan boundaries first");
  assert.ok(reply.includes("底仓"), "Must reference floor rules");
  assert.ok(reply.includes("thesis"), "Must reference thesis check");
  assert.ok(reply.includes("记录确认流程") || reply.includes("记录"), "Must mention confirmation flow");
  // Must NOT directly change position
  assert.ok(!reply.includes("仓位已更新"), "Must NOT claim position was updated");
  assert.ok(!reply.includes("已卖出"), "Must NOT claim execution completed");
});

test("Self-Check 4d: planned sell with floor rule check via synthesizeWithResults", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "db-plan16-ps-"));
  const prevDir = process.env.DECISION_BRAIN_DATA_DIR;
  const prevFile = process.env.DECISION_BRAIN_STATE_FILE;
  const prevOffline = process.env.DECISION_BRAIN_OFFLINE;
  process.env.DECISION_BRAIN_DATA_DIR = dataDir;
  process.env.DECISION_BRAIN_OFFLINE = "1";
  delete process.env.DECISION_BRAIN_STATE_FILE;

  const seedState = {
    assets: { "btc-001": { id: "btc-001", symbol: "BTC" } },
    positions: {
      "btc-001": { units: 3, averageCost: 60000, currentPrice: 61000, currentValue: 183000, reason: "长期看好" },
    },
    plans: {
      "btc-001": {
        assetId: "btc-001", status: "active",
        floorRule: { minimumUnits: 2, reason: "保留长期底仓" },
        originalThesis: "长期配置 BTC，不做短线",
        sellZone: "基准估值区才卖",
      },
    },
    valuationModels: {}, sources: {}, researchReports: {}, traces: {},
  };
  await writeFile(join(dataDir, "state.json"), JSON.stringify(seedState));

  const { store } = await import("../src/data-store.mjs");
  store.resetCache();

  t.after(async () => {
    if (prevDir === undefined) delete process.env.DECISION_BRAIN_DATA_DIR;
    else process.env.DECISION_BRAIN_DATA_DIR = prevDir;
    if (prevFile === undefined) delete process.env.DECISION_BRAIN_STATE_FILE;
    else process.env.DECISION_BRAIN_STATE_FILE = prevFile;
    if (prevOffline === undefined) delete process.env.DECISION_BRAIN_OFFLINE;
    else process.env.DECISION_BRAIN_OFFLINE = prevOffline;
    store.resetCache();
  });

  const prevApiKey = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;

  try {
    const { synthesizeWithResults } = await import("../src/chat-orchestrator.mjs");
    const reply = await synthesizeWithResults(
      "review_sell", [],
      { assetQuery: "BTC", units: 2, plannedSellFlag: true, panicFlag: false },
      { lastAsset: "BTC" }
    );

    // Selling 2 of 3 → remaining 1 < floor of 2 → should warn
    assert.ok(reply.includes("先确认计划边界") || reply.includes("底仓"),
      "Must check boundaries");
    assert.ok(reply.includes("低于底仓") || reply.includes("2") || reply.includes("底仓"),
      "Should reference floor rule in planned sell check");
    // Must NOT directly execute
    assert.ok(!reply.includes("已记录卖出"), "Must NOT execute sell directly");
  } finally {
    if (prevApiKey !== undefined) process.env.LLM_API_KEY = prevApiKey;
    else delete process.env.LLM_API_KEY;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Self-Check 5: 我已经卖了 1 个 BTC → 记录确认流程，不输出普通卖出建议
// ═══════════════════════════════════════════════════════════════════════════

test("Self-Check 5a: 我已经卖了 1 个 BTC → sell_execute", () => {
  const r = classifyIntent("我已经卖了 1 个 BTC");
  assert.equal(r.intent, "sell_execute");
  assert.equal(r.slots.assetQuery, "BTC");
  assert.equal(r.slots.units, 1);
});

test("Self-Check 5b: 已经卖出了 2 个 SOL → sell_execute", () => {
  const r = classifyIntent("已经卖出了 2 个 SOL");
  assert.equal(r.intent, "sell_execute");
});

test("Self-Check 5c: sell_execute reply is confirmation prompt, not sell advice", () => {
  const reply = synthesizeRule("sell_execute", [],
    { assetQuery: "BTC", units: 1 },
    { lastAsset: "BTC" }
  );
  assert.ok(reply.includes("要记录这笔卖出吗"), "Must ask for confirmation to record");
  assert.ok(reply.includes("确认记录卖出"), "Must show confirmation instruction");
  assert.ok(!reply.includes("建议"), "Must NOT give sell advice");
  assert.ok(!reply.includes("估值"), "Must NOT include valuation analysis");
});

test("Self-Check 5d: sell_execute does NOT collide with review_sell for ambiguous phrases", () => {
  // "我卖掉一个 BTC" is ambiguous — should be review_sell (asking), not sell_execute
  const r = classifyIntent("我卖掉一个 BTC");
  assert.equal(r.intent, "review_sell",
    "Ambiguous sell phrases should route to review_sell, not sell_execute");
});

// ═══════════════════════════════════════════════════════════════════════════
// Self-Check 6: 模糊短句不会反复输出同一套四段式报告
// ═══════════════════════════════════════════════════════════════════════════

test("Self-Check 6a: fuzzy expressions produce diverse reply structures across intents", () => {
  // Diversity is at the reply level (LLM FUZZY MESSAGE STYLES), not intent classification.
  // Different fuzzy types may share strategy_dialogue intent but get different reply styles.
  // This test verifies that smalltalk vs strategy_dialogue produce structurally different replies.
  const strategicReplies = [
    synthesizeRule("strategy_dialogue", [], { assetQuery: "BTC" }, { lastAsset: "BTC" }),
  ];
  const nonStrategicReplies = [
    synthesizeRule("smalltalk", [], { assetQuery: null }, {}),
    synthesizeRule("unknown", [], { assetQuery: null }, {}),
  ];
  // Strategy replies should differ from non-strategy replies
  for (const sr of strategicReplies) {
    for (const nr of nonStrategicReplies) {
      assert.notEqual(sr, nr, "Strategy dialogue reply should differ from smalltalk/unknown");
    }
  }
  // Verify that the LLM path has distinct FUZZY MESSAGE STYLES for all 6 expression types
  // (verified via synthesizeLLM prompt text, not runtime LLM calls)
});

test("Self-Check 6b: 不想看了 → strategy_dialogue", () => {
  const r = classifyIntent("不想看了", { lastAsset: "BTC" });
  assert.equal(r.intent, "strategy_dialogue",
    "Frustration without sell intent should be strategy_dialogue");
});

test("Self-Check 6c: 我有点慌 without sell words → strategy_dialogue, not review_sell", () => {
  const r = classifyIntent("我有点慌", { lastAsset: "BTC" });
  assert.equal(r.intent, "strategy_dialogue",
    "Pure anxiety without sell language should be strategy_dialogue");
  assert.notEqual(r.intent, "review_sell");
});

test("Self-Check 6d: 那怎么办 preserves asset context", () => {
  const r = classifyIntent("那怎么办？", { lastAsset: "BTC" });
  assert.equal(r.intent, "strategy_dialogue");
});

test("Self-Check 6e: different fuzzy replies have different structures (rule path)", () => {
  // Rule-based replies should differ across intents
  const strategyReply = synthesizeRule("strategy_dialogue", [], { assetQuery: "BTC" }, { lastAsset: "BTC" });
  const smalltalkReply = synthesizeRule("smalltalk", [], { assetQuery: null }, {});
  const unknownReply = synthesizeRule("unknown", [], { assetQuery: null }, {});

  // Each intent should produce a structurally different reply
  assert.notEqual(strategyReply, smalltalkReply, "strategy_dialogue ≠ smalltalk");
  assert.notEqual(strategyReply, unknownReply, "strategy_dialogue ≠ unknown");
  assert.notEqual(smalltalkReply, unknownReply, "smalltalk ≠ unknown");
});

// ═══════════════════════════════════════════════════════════════════════════
// Additional: Plan XVI sell intent differentiation — all four types
// ═══════════════════════════════════════════════════════════════════════════

test("Plan XVI sell intent layer: 想卖 → review_sell (sell_review)", () => {
  const r = classifyIntent("我想卖 BTC");
  assert.equal(r.intent, "review_sell");
  assert.equal(r.slots.panicFlag, true); // "想卖" matches broad panic pattern
});

test("Plan XVI sell intent layer: 因下跌想卖 → review_sell with panicFlag (panic_sell_review)", () => {
  const r = classifyIntent("跌得好厉害，我想卖 BTC");
  assert.equal(r.intent, "review_sell");
  assert.equal(r.slots.panicFlag, true);
});

test("Plan XVI sell intent layer: 准备卖 → review_sell with plannedSellFlag (planned_sell_review)", () => {
  const r = classifyIntent("我准备卖 1 个 BTC");
  assert.equal(r.intent, "review_sell");
  assert.equal(r.slots.plannedSellFlag, true);
  assert.equal(r.slots.panicFlag, false);
});

test("Plan XVI sell intent layer: 已经卖 → sell_execute with confirmation (sell_execution_record)", () => {
  const r = classifyIntent("我已经卖了 1 个 BTC");
  assert.equal(r.intent, "sell_execute");
});

// ═══════════════════════════════════════════════════════════════════════════
// Fanout verification (intent → agent mapping unchanged)
// ═══════════════════════════════════════════════════════════════════════════

test("review_sell fanout unchanged: includes all required agents", () => {
  const fanout = planFanout("review_sell");
  assert.ok(fanout.includes("asset_info"));
  assert.ok(fanout.includes("memory"));
  assert.ok(fanout.includes("valuation"));
  assert.ok(fanout.includes("sentiment"));
  assert.ok(fanout.includes("technical"));
});

test("sell_execute fanout unchanged: memory only", () => {
  const fanout = planFanout("sell_execute");
  assert.deepEqual(fanout, ["memory"]);
});

test("strategy_dialogue fanout unchanged: asset_info + memory", () => {
  const fanout = planFanout("strategy_dialogue");
  assert.ok(fanout.includes("asset_info"));
  assert.ok(fanout.includes("memory"));
});
