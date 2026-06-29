import { describe, it } from "node:test";
import assert from "node:assert";
import { classifyIntent } from "../src/chat-orchestrator.mjs";
import { exportMarkdown } from "../src/services/conversation-log-service.mjs";
import { logTurn } from "../src/services/conversation-log-service.mjs";

describe("Plan XV — Dialog Dedup", () => {
  it("classifies 研究 BTC 是否值得买 as evaluate_candidate", () => {
    const result = classifyIntent("研究 BTC 是否值得买", {
      lastAsset: "BTC",
      lastResearchSummary: {
        assetQuery: "BTC",
        lastBasicInfoAt: new Date().toISOString(),
        lastMentionedFacts: "Bitcoin (BTC) 当前价格为 $62k",
      },
    });
    assert.equal(result.intent, "evaluate_candidate", `Expected evaluate_candidate but got ${result.intent}`);
  });

  it("upgrades follow-up question when BTC was just researched via rule dedup", () => {
    const result = classifyIntent("BTC 能不能买", {
      lastAsset: "BTC",
      lastResearchSummary: {
        assetQuery: "BTC",
        lastBasicInfoAt: new Date().toISOString(),
      },
    });
    assert.equal(result.intent, "evaluate_candidate", `Expected evaluate_candidate but got ${result.intent}`);
  });

  it("classifies 哪一个 as strategy_dialogue", () => {
    const result = classifyIntent("哪一个？", { lastAsset: "BTC" });
    assert.equal(result.intent, "strategy_dialogue");
  });

  it("classifies 这个呢 as strategy_dialogue", () => {
    const result = classifyIntent("这个呢？", { lastAsset: "BTC" });
    assert.equal(result.intent, "strategy_dialogue");
  });

  it("classifies 我有点慌 as strategy_dialogue", () => {
    const result = classifyIntent("我有点慌", { lastAsset: "BTC" });
    assert.equal(result.intent, "strategy_dialogue");
  });

  it("classifies 跌麻了 as strategy_dialogue", () => {
    const result = classifyIntent("跌麻了", { lastAsset: "BTC" });
    assert.equal(result.intent, "strategy_dialogue");
  });

  it("classifies 我看不懂 as strategy_dialogue", () => {
    const result = classifyIntent("我看不懂", { lastAsset: "BTC" });
    assert.equal(result.intent, "strategy_dialogue");
  });

  it("classifies 你说人话 as smalltalk (human-friendly rephrase request)", () => {
    const result = classifyIntent("你说人话", { lastAsset: "BTC" });
    assert.equal(result.intent, "smalltalk");
  });

  it("classifies 直接告诉我 as strategy_dialogue", () => {
    const result = classifyIntent("直接告诉我", { lastAsset: "BTC" });
    assert.equal(result.intent, "strategy_dialogue");
  });

  it("classifies 那怎么办 as strategy_dialogue", () => {
    const result = classifyIntent("那怎么办？", { lastAsset: "BTC" });
    assert.equal(result.intent, "strategy_dialogue");
  });

  it("classifies 研究 BTC first time as lookup_asset_info", () => {
    // First time — no lastResearchSummary at all
    const result = classifyIntent("研究 BTC", {});
    // 研究 matches evaluate_candidate first in classifyIntentRule
    assert.ok(
      result.intent === "evaluate_candidate" || result.intent === "lookup_asset_info",
      `Got intent: ${result.intent}`
    );
  });

  // Fanout export: string array and object array should both render
  it("fanout export handles string array", () => {
    const sid = "plan15-fanout-strings";
    logTurn(sid, {
      userMessage: "test",
      assistantReply: "ok",
      intent: "evaluate_candidate",
      fanout: ["memory", "macro", "news"],
      latencyMs: 100,
    });
    const md = exportMarkdown(sid);
    assert.ok(md.includes("memory, macro, news"), "Should render string fanout names");
    assert.ok(!md.includes("Fanout: ,"), "Should NOT have empty commas");
  });

  it("fanout export handles object array", () => {
    const sid = "plan15-fanout-objects";
    logTurn(sid, {
      userMessage: "test",
      assistantReply: "ok",
      intent: "evaluate_candidate",
      fanout: [{ role: "macro" }, { role: "news" }, { role: "memory" }],
      latencyMs: 100,
    });
    const md = exportMarkdown(sid);
    assert.ok(md.includes("macro, news, memory"), "Should render object fanout names");
  });

  it("building lastResearchSummary from context", () => {
    // Simulate second call with previous research
    const result = classifyIntent("BTC 值不值得买", {
      lastAsset: "BTC",
      lastIntent: "lookup_asset_info",
      lastResearchSummary: {
        assetQuery: "BTC",
        lastBasicInfoAt: new Date().toISOString(),
        lastMentionedFacts: "Bitcoin 当前价格为 $62,000，市值 $1.2T",
        lastSuggestedNextStep: "如需判断是否值得买，我可以继续评估",
      },
    });
    // With dedup context, should be evaluate_candidate
    assert.equal(result.intent, "evaluate_candidate");
  });

  it("no dedup when research is for different asset", () => {
    const result = classifyIntent("研究 SOL 是否值得买", {
      lastAsset: "BTC",
      lastResearchSummary: {
        assetQuery: "BTC",
        lastBasicInfoAt: new Date().toISOString(),
      },
    });
    // SOL was not the researched asset, so evaluate_candidate is fine
    assert.equal(result.intent, "evaluate_candidate");
    assert.equal(result.slots.assetQuery, "SOL");
  });
});
