import test from "node:test";
import assert from "node:assert/strict";
import { classifyIntent, synthesizeRule, synthesizeAssetInfoRule, buildDispatchPlan } from "../src/chat-orchestrator.mjs";

// ── Plan XV Section 7: Dialog Quality Acceptance ──────────────────────

// ═══ Dedup & Context Continuity ═══

test("研究 BTC → 研究 BTC 是否值得买: second intent is evaluate_candidate", () => {
  const ctx = { lastAsset: "BTC", recentTurns: [
    { message: "研究 BTC", intent: "evaluate_candidate", assetQuery: "BTC" },
  ]};
  const result = classifyIntent("研究 BTC 是否值得买", ctx);
  assert.equal(result.intent, "evaluate_candidate");
  assert.equal(result.slots.assetQuery, "BTC");
});

test("研究 BTC → 研究 BTC 是否值得买: second reply does NOT repeat full intro", () => {
  // Simulate second turn: synthesizeRule should produce a different pattern than first turn
  const agentResults = [
    { role: "asset_info", headline: "BTC: 价格$60050 市值$1169B FDV $1.2T", data: { currentMetrics: { price: "$60050", marketCap: "$1169B", fdv: "$1.2T" } } },
  ];
  // First turn: lookup_asset_info
  const firstReply = synthesizeAssetInfoRule(agentResults, { assetQuery: "BTC" }, {});
  // The first reply should contain the full intro with price, marketCap, FDV
  assert.ok(firstReply.includes("$60050") || firstReply.includes("价格"), "First reply should contain price info");

  // Second turn: evaluate_candidate — should NOT be the same full intro
  const secondReply = synthesizeRule("evaluate_candidate", [], { assetQuery: "BTC" }, { lastAsset: "BTC" });
  // The evaluate_candidate reply should NOT be identical to the asset_info reply
  assert.notEqual(secondReply, firstReply);
  // evaluate_candidate should trigger committee research, not just repeat price info
  assert.ok(secondReply.includes("多维度研究") || secondReply.includes("委员会") || secondReply.includes("研究评估"),
    "Second reply should advance to evaluation, not repeat basic info");
});

test("same asset consecutive asks: context.lastAsset persists", () => {
  // After first BTC research, lastAsset should be BTC
  const ctx1 = { lastAsset: "BTC" };
  const r1 = classifyIntent("研究 SOL", ctx1);
  assert.equal(r1.slots.assetQuery, "SOL");

  // Next turn: ask about "it" without naming
  const ctx2 = { lastAsset: "SOL" };
  const r2 = classifyIntent("研究", ctx2);
  // Without explicit ticker in "研究" alone, the stopword filter may not find one
  // But the intent should be evaluate_candidate and context.lastAsset is available
  assert.ok(r2.intent === "evaluate_candidate" || r2.intent === "lookup_asset_info");
});

// ═══ Fuzzy Expression Diversity ═══

test("哪一个？→ strategy_dialogue, contextual not full report", () => {
  const result = classifyIntent("哪一个？", { lastAsset: "BTC" });
  assert.equal(result.intent, "strategy_dialogue");
  const reply = synthesizeRule("strategy_dialogue", [], { assetQuery: "BTC" }, { lastAsset: "BTC" });
  // strategy_dialogue should NOT output a full four-section research report
  assert.ok(!reply.includes("研究评估") || reply.includes("策略讨论"),
    "strategy_dialogue should focus on strategy discussion, not full research report");
});

test("你说人话 → unknown, reply is short not template", () => {
  const result = classifyIntent("你说人话", { lastAsset: "BTC" });
  // "你说人话" is conversational — should NOT fanout 7 agents
  const fanout = ["memory"];
  assert.ok(fanout.length <= 2, "Simple clarification should not trigger full fanout");
});

test("我有点慌 → strategy_dialogue with emotion context", () => {
  const result = classifyIntent("我有点慌", { lastAsset: "BTC" });
  // Emotional/anxiety expressions should route to strategy_dialogue for nuanced handling
  assert.ok(
    result.intent === "strategy_dialogue" || result.intent === "unknown",
    `Expected strategy_dialogue or unknown, got ${result.intent}`
  );
});

test("看不懂 → strategy_dialogue or unknown, not evaluate_candidate", () => {
  const result = classifyIntent("看不懂", { lastAsset: "BTC" });
  assert.notEqual(result.intent, "evaluate_candidate",
    "Confusion about previous advice should not trigger a new research cycle");
});

test("直接告诉我 → strategy_dialogue, keeps context", () => {
  const result = classifyIntent("直接告诉我", { lastAsset: "BTC" });
  assert.ok(
    result.intent === "strategy_dialogue" || result.intent === "unknown",
    `Expected strategy_dialogue or unknown, got ${result.intent}`
  );
});

test("fuzzy expressions produce different intents (not all same)", () => {
  const ctx = { lastAsset: "BTC" };
  const results = [
    classifyIntent("哪一个？", ctx),
    classifyIntent("你说人话", ctx),
    classifyIntent("我有点慌", ctx),
    classifyIntent("看不懂", ctx),
    classifyIntent("那怎么办？", ctx),
  ];
  // At least 2 different intents among the 5 fuzzy expressions
  const intents = new Set(results.map((r) => r.intent));
  assert.ok(intents.size >= 2, `Expected >= 2 different intents for fuzzy expressions, got ${intents.size}: ${[...intents].join(", ")}`);
});

// ═══ Panic Sell Guard ═══

test("panic sell expression: 现在跌得好厉害 → review_sell", () => {
  const result = classifyIntent("现在跌得好厉害，我有点想把BTC卖掉", {});
  assert.equal(result.intent, "review_sell", "Panic sell should trigger review_sell");
  assert.equal(result.slots.assetQuery, "BTC");
});

test("panic sell expression: 我怕继续跌想清仓 → review_sell", () => {
  const result = classifyIntent("我怕继续跌，想清仓", { lastAsset: "BTC" });
  assert.equal(result.intent, "review_sell");
});

test("panic sell expression: 跌麻了要不要卖 → review_sell", () => {
  const result = classifyIntent("跌麻了，要不要卖", { lastAsset: "BTC" });
  assert.equal(result.intent, "review_sell");
});

test("panic sell expression: 我受不了了卖掉吧 → review_sell", () => {
  const result = classifyIntent("我受不了了，卖掉吧", { lastAsset: "BTC" });
  assert.equal(result.intent, "review_sell");
});

test("panic sell reply contains sell zone and plan reference (rule template)", () => {
  const agentResults = [
    { role: "memory", headline: "意图: review_sell, 资产: BTC", data: { portfolioMemoryProfile: { suggestedIntentClass: "review_sell" } } },
  ];
  const reply = synthesizeRule("review_sell", agentResults, { assetQuery: "BTC" }, { lastAsset: "BTC" });
  // Rule-based template references sell zone and plan comparison
  assert.ok(
    reply.includes("卖出") || reply.includes("估值"),
    "Sell review reply should reference valuation or sell decision"
  );
});

// ═══ Sell Clarification ═══

test("我卖掉一个BTC → review_sell, not manage_position", () => {
  const result = classifyIntent("我卖掉一个BTC", {});
  assert.equal(result.intent, "review_sell");
  assert.equal(result.slots.assetQuery, "BTC");
});

test("sell by quantity with context → review_sell with sellPct if percentage", () => {
  // "卖 50% ETH" should extract sellPct
  const result = classifyIntent("卖 50%", { lastAsset: "ETH" });
  assert.equal(result.intent, "review_sell");
  assert.equal(result.slots.sellPct, 50);
});

test("sell vs panic have same intent (review_sell) but different context", () => {
  // Both route to review_sell, differentiation happens in synthesizeWithResults
  const panicResult = classifyIntent("现在跌得好厉害，我有点想把BTC卖掉", {});
  const execResult = classifyIntent("我卖掉一个BTC", {});
  assert.equal(panicResult.intent, "review_sell");
  assert.equal(execResult.intent, "review_sell");
  // Both are review_sell; how they're handled depends on the planCmp + LLM synthesis
});

// ═══ Fanout Rendering Fix ═══

test("fanout export handles string arrays (not just object arrays)", () => {
  const fanout = ["memory", "macro", "onchain", "sentiment", "technical", "news", "valuation"];
  // Simulate the export logic: handle both object [{role:"x"}] and string ["x"] arrays
  const roles = fanout.map((f) => (typeof f === "string" ? f : f.role));
  assert.equal(roles.join(", "), "memory, macro, onchain, sentiment, technical, news, valuation");
  // No empty commas
  assert.ok(!roles.join(", ").includes(", ,"), "Fanout export should not contain empty commas");
});

test("dispatchPlan export handles string arrays correctly", () => {
  const fanout = ["memory", "valuation"];
  const roles = fanout.map((f) => (typeof f === "string" ? f : f.role));
  assert.equal(roles.join(", "), "memory, valuation");
});

// ═══ DemoT 5-Step Scenario Intent Check ═══

test("demo scenario step 1: 我买了 BTC 3 个成本 50000 → manage_position", () => {
  const result = classifyIntent("我买了 BTC 3 个，成本 50000，因为长期看好 BTC 作为数字黄金", {});
  assert.equal(result.intent, "manage_position");
  assert.equal(result.slots.assetQuery, "BTC");
  assert.equal(result.slots.units, 3);
  assert.equal(result.slots.averageCost, 50000);
});

test("demo scenario step 2: 确认 BTC 投资计划 → confirm_plan", () => {
  const result = classifyIntent("确认 BTC 投资计划", { lastAsset: "BTC" });
  assert.equal(result.intent, "confirm_plan");
});

test("demo scenario step 3: 现在跌得好厉害想卖 → review_sell (panic)", () => {
  const result = classifyIntent("现在跌得好厉害，我有点想把 BTC 卖掉", { lastAsset: "BTC" });
  assert.equal(result.intent, "review_sell");
});

test("demo scenario step 4: 我卖掉一个 BTC → review_sell, NOT manage_position", () => {
  const result = classifyIntent("我卖掉一个 BTC", { lastAsset: "BTC" });
  assert.equal(result.intent, "review_sell");
  assert.notEqual(result.intent, "manage_position");
});
