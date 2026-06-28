import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── State fallback path ──────────────────────────────────────────────

test("smalltalk should not inherit the last focused asset from stored traces", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "decision-brain-context-"));
  const previousDataDir = process.env.DECISION_BRAIN_DATA_DIR;
  const previousStateFile = process.env.DECISION_BRAIN_STATE_FILE;

  process.env.DECISION_BRAIN_DATA_DIR = dataDir;
  delete process.env.DECISION_BRAIN_STATE_FILE;

  await writeFile(join(dataDir, "state.json"), JSON.stringify({
    assets: {
      "asset-btc": { id: "asset-btc", symbol: "BTC" }
    },
    positions: {},
    plans: {},
    sources: {},
    researchReports: {},
    traces: {
      "trace-1": {
        id: "trace-1",
        assetId: "asset-btc",
        createdAt: "2026-06-26T10:00:00.000Z"
      }
    }
  }, null, 2));

  try {
    const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
    const result = await runOrchestrator("你好", "ctx-smalltalk", {});

    assert.equal(result.intent, "smalltalk");
    assert.equal(result.assetQuery, null);
    assert.doesNotMatch(result.reply, /BTC|市场数据|FDV|市值/);
  } finally {
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
  }
});

test("sell review can still inherit the last focused asset from stored traces", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "decision-brain-context-"));
  const previousDataDir = process.env.DECISION_BRAIN_DATA_DIR;
  const previousStateFile = process.env.DECISION_BRAIN_STATE_FILE;

  process.env.DECISION_BRAIN_DATA_DIR = dataDir;
  delete process.env.DECISION_BRAIN_STATE_FILE;

  await writeFile(join(dataDir, "state.json"), JSON.stringify({
    assets: {
      "asset-sol": { id: "asset-sol", symbol: "SOL" }
    },
    positions: {},
    plans: {},
    sources: {},
    researchReports: {},
    traces: {
      "trace-1": {
        id: "trace-1",
        assetId: "asset-sol",
        createdAt: "2026-06-26T10:00:00.000Z"
      }
    }
  }, null, 2));

  try {
    const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
    const result = await runOrchestrator("卖 30%", "ctx-sell", {});

    assert.equal(result.intent, "review_sell");
    assert.equal(result.assetQuery, "SOL");
  } finally {
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
  }
});

// ── context.lastAsset path (the real bug for P1-3) ───────────────────

test("smalltalk should not inherit context.lastAsset", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("你好", "ctx-smalltalk-la", {
    lastAsset: "BTC",
    lastIntent: "lookup_asset_info",
  });

  assert.equal(result.intent, "smalltalk");
  assert.equal(result.assetQuery, null);
  assert.doesNotMatch(result.reply, /BTC|市场数据|FDV|市值/);
});

test("smalltalk should not inherit context.lastAsset (English)", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("Hello", "ctx-smalltalk-en", {
    lastAsset: "ETH",
    lastIntent: "lookup_asset_info",
  });

  assert.equal(result.intent, "smalltalk");
  assert.equal(result.assetQuery, null);
  assert.doesNotMatch(result.reply, /ETH/);
});

test("review_add can still inherit context.lastAsset", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("加仓吗", "ctx-add", {
    lastAsset: "SOL",
    lastIntent: "lookup_asset_info",
  });

  assert.equal(result.intent, "review_add");
  assert.equal(result.assetQuery, "SOL");
});

test("review_sell can still inherit context.lastAsset", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("卖 30%", "ctx-sell", {
    lastAsset: "BTC",
    lastIntent: "lookup_asset_info",
  });

  assert.equal(result.intent, "review_sell");
  assert.equal(result.assetQuery, "BTC");
});

test("大盘 should not trigger lookup_asset_info even with lastAsset context", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("今天大盘怎么样", "ctx-market", {
    lastAsset: "BTC",
    lastIntent: "lookup_asset_info",
  });

  assert.notEqual(result.intent, "lookup_asset_info");
});

test("open-ended investment anxiety should route to strategy discussion with context asset", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("我现在有点怕踏空，但又怕追高，你帮我整理一下思路", "ctx-strategy", {
    lastAsset: "SOL",
    lastIntent: "manage_position",
    recentTurns: [
      { message: "我买了 SOL 100 个成本 120", intent: "manage_position", assetQuery: "SOL" },
    ],
  });

  assert.equal(result.intent, "strategy_dialogue");
  assert.equal(result.assetQuery, "SOL");
  assert.deepEqual(result.fanout, ["asset_info", "memory"]);
  assert.doesNotMatch(result.reply, /委员会成员尚未返回意见/);
});

test("open-ended hold question should not become unknown", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("我手里的那个还能继续拿吗？", "ctx-hold", {
    lastAsset: "BTC",
    lastIntent: "lookup_memory",
  });

  assert.equal(result.intent, "strategy_dialogue");
  assert.equal(result.assetQuery, "BTC");
  assert.deepEqual(result.fanout, ["asset_info", "memory"]);
  assert.doesNotMatch(result.reply, /委员会成员尚未返回意见/);
});

// ── Plan XI 负责人 1: dialogFrame & market-wide blocking ──────────────

test("market-wide query should not inherit lastAsset (今天大盘怎么样)", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("今天大盘怎么样", "ctx-market-wide-1", {
    lastAsset: "BTC",
    lastIntent: "lookup_asset_info",
  });

  assert.equal(result.assetQuery, null);
});

test("market-wide query should not inherit lastAsset (现在市场怎么样)", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("现在市场怎么样", "ctx-market-wide-2", {
    lastAsset: "ETH",
    lastIntent: "lookup_asset_info",
  });

  assert.equal(result.assetQuery, null);
});

test("market-wide query should not inherit lastAsset (帮我看看行情)", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("帮我看看行情", "ctx-market-wide-3", {
    lastAsset: "SOL",
    lastIntent: "lookup_asset_info",
  });

  assert.equal(result.assetQuery, null);
});

test("怕踏空但又怕追高 should route to strategy_dialogue", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("我怕踏空但又怕追高，你帮我整理一下思路", "ctx-fomo", {
    lastAsset: "SOL",
    lastIntent: "manage_position",
  });

  assert.equal(result.intent, "strategy_dialogue");
  assert.equal(result.assetQuery, "SOL");
});

test("我手里的那个还能拿吗 should inherit lastAsset and route to strategy_dialogue", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("我手里的那个还能拿吗", "ctx-hold-2", {
    lastAsset: "ETH",
    lastIntent: "lookup_memory",
  });

  assert.equal(result.intent, "strategy_dialogue");
  assert.equal(result.assetQuery, "ETH");
});

test("dialogFrame should exist in runOrchestrator response", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("研究 SOL 是否值得买", "ctx-df-1", {
    lastAsset: null,
    lastIntent: null,
  });

  assert.ok(result.dialogFrame);
  assert.equal(result.dialogFrame.intent, "evaluate_candidate");
  assert.equal(result.dialogFrame.assetQuery, "SOL");
  assert.ok(["high", "medium", "low"].includes(result.dialogFrame.confidence));
  assert.ok(typeof result.dialogFrame.userSituation === "string");
  assert.ok(result.dialogFrame.userSituation.length > 0);
  assert.ok(Array.isArray(result.dialogFrame.missingFields));
  assert.ok(typeof result.dialogFrame.shouldAskClarifyingQuestion === "boolean");
});

test("dialogFrame should have low confidence for unknown intent", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("???", "ctx-df-2", {});

  assert.equal(result.intent, "unknown");
  assert.equal(result.dialogFrame.confidence, "low");
  assert.equal(result.dialogFrame.shouldAskClarifyingQuestion, true);
});

test("Chief reply for strategy_dialogue should contain structured sections", async () => {
  const { synthesizeRule } = await import("../src/chat-orchestrator.mjs");
  const reply = synthesizeRule("strategy_dialogue", [], { assetQuery: "SOL" }, {});

  assert.match(reply, /【当前状态】/);
  assert.match(reply, /【关键证据】/);
  assert.match(reply, /【风险与缺口】/);
  assert.match(reply, /【下一步建议】/);
  assert.match(reply, /数据来源：Bitget MCP \+ Decision Brain 本地记忆/);
  assert.match(reply, /以上不是自动交易指令/);
});

test("Chief reply for evaluate_candidate should contain structured sections", async () => {
  const { synthesizeRule } = await import("../src/chat-orchestrator.mjs");
  const reply = synthesizeRule("evaluate_candidate", [], { assetQuery: "BTC" }, {});

  assert.match(reply, /【当前状态】/);
  assert.match(reply, /【关键证据】/);
  assert.match(reply, /【风险与缺口】/);
  assert.match(reply, /【下一步建议】/);
  assert.match(reply, /数据来源：Bitget MCP \+ Decision Brain 本地记忆/);
  assert.match(reply, /以上不是自动交易指令/);
});

test("Chief reply for smalltalk should NOT require structured format", async () => {
  const { synthesizeRule } = await import("../src/chat-orchestrator.mjs");
  const reply = synthesizeRule("smalltalk", [], {}, {});

  assert.doesNotMatch(reply, /【当前状态】/);
  assert.match(reply, /Decision Brain/);
});

test("我想买 SOL should route to evaluate_candidate", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("我想买 SOL", "ctx-want-buy", {});

  assert.equal(result.intent, "evaluate_candidate");
  assert.equal(result.assetQuery, "SOL");
});

test("我想买 ETH should route to evaluate_candidate", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("我想买 ETH", "ctx-want-buy-eth", {});

  assert.equal(result.intent, "evaluate_candidate");
  assert.equal(result.assetQuery, "ETH");
});

test("Chief reply for run_monitor should contain structured sections", async () => {
  const { synthesizeRule } = await import("../src/chat-orchestrator.mjs");
  const reply = synthesizeRule("run_monitor", [], { assetQuery: "SOL" }, {});

  assert.match(reply, /【当前状态】/);
  assert.match(reply, /【关键证据】/);
  assert.match(reply, /【风险与缺口】/);
  assert.match(reply, /【下一步建议】/);
  assert.match(reply, /数据来源：Bitget MCP \+ Decision Brain 本地记忆/);
  assert.match(reply, /以上不是自动交易指令/);
});

test("dialogFrame for strategy_dialogue should include activePlan in missingFields", async () => {
  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("我手里的那个还能拿吗", "ctx-ap-missing", {
    lastAsset: "BTC",
    lastIntent: "lookup_memory",
  });

  assert.equal(result.intent, "strategy_dialogue");
  assert.ok(result.dialogFrame.missingFields.includes("activePlan"));
});
