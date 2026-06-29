import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { classifyIntent, planFanout, runOrchestrator } from "../src/chat-orchestrator.mjs";

// ── Plan XIV Section 5: Dialog Continuity ─────────────────────────────

test("研究 BTC routes to evaluate_candidate with assetQuery", () => {
  const result = classifyIntent("研究 BTC", {});
  assert.equal(result.intent, "evaluate_candidate");
  assert.equal(result.slots.assetQuery, "BTC");
});

test("买一个 routes to manage_position with asset from context", () => {
  const result = classifyIntent("买一个", { lastAsset: "BTC" });
  assert.equal(result.intent, "manage_position");
  assert.equal(result.slots.assetQuery, "BTC");
});

test("直接买一个吧 routes to manage_position with context asset", () => {
  const result = classifyIntent("不想看了，直接买一个吧", { lastAsset: "BTC" });
  assert.equal(result.intent, "manage_position");
  assert.equal(result.slots.assetQuery, "BTC");
  assert.equal(result.slots.units, 1);
});

test("买两个 routes to manage_position with correct units", () => {
  const result = classifyIntent("买两个", { lastAsset: "SOL" });
  assert.equal(result.intent, "manage_position");
  assert.equal(result.slots.assetQuery, "SOL");
  assert.equal(result.slots.units, 2);
});

test("你补充一下 routes to refresh_research", () => {
  const result = classifyIntent("你补充一下", { lastAsset: "BTC" });
  assert.equal(result.intent, "refresh_research");
});

test("我怎么补充？你补充 routes to refresh_research", () => {
  const result = classifyIntent("我怎么补充？你补充", { lastAsset: "BTC" });
  assert.equal(result.intent, "refresh_research");
});

test("帮我补充 routes to refresh_research", () => {
  const result = classifyIntent("帮我补充", { lastAsset: "BTC" });
  assert.equal(result.intent, "refresh_research");
});

test("哪一个？routes to strategy_dialogue (short form)", () => {
  const result = classifyIntent("哪一个？", { lastAsset: "BTC" });
  assert.equal(result.intent, "strategy_dialogue");
});

test("选哪个 routes to strategy_dialogue", () => {
  const result = classifyIntent("选哪个", { lastAsset: "SOL" });
  assert.equal(result.intent, "strategy_dialogue");
});

test("现在的价格就是我的成本 auto-fills from lastPrice", () => {
  const result = classifyIntent("现在的价格就是我的成本", {
    lastAsset: "BTC",
    lastPrice: 60050,
    pendingPosition: { assetQuery: "BTC", units: 1 },
  });
  assert.equal(result.slots.averageCost, 60050);
});

test("现价就是成本 auto-fills from lastPrice", () => {
  const result = classifyIntent("现在的报价就是我的成本", {
    lastAsset: "BTC",
    lastPrice: 60050,
  });
  assert.equal(result.slots.averageCost, 60050);
});

test("6万 parsed as 60000 for cost slot", () => {
  const result = classifyIntent("6万", {
    lastAsset: "BTC",
    pendingPosition: { assetQuery: "BTC", units: 1 },
  });
  assert.equal(result.slots.averageCost, 60000);
});

test("confirm with pendingPosition should confirm via runOrchestrator", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "decision-brain-dc-"));
  const prevDir = process.env.DECISION_BRAIN_DATA_DIR;
  const prevFile = process.env.DECISION_BRAIN_STATE_FILE;
  process.env.DECISION_BRAIN_DATA_DIR = dataDir;
  delete process.env.DECISION_BRAIN_STATE_FILE;

  // Seed empty state
  await writeFile(join(dataDir, "state.json"), JSON.stringify({
    assets: {}, positions: {}, plans: {}, sources: {}, researchReports: {}, valuationModels: {}, traces: {}
  }));

  try {
    const pp = { assetQuery: "BTC", units: 1, averageCost: 60000, confirmed: false };
    const result = await runOrchestrator("确认", "dc-test-confirm", {
      pendingPosition: pp,
      lastAsset: "BTC",
      lastIntent: "manage_position",
    });
    assert.equal(result.intent, "manage_position");
    assert.equal(result.assetQuery, "BTC");
    assert.equal(result.pendingPosition.confirmed, true);
  } finally {
    if (prevDir === undefined) delete process.env.DECISION_BRAIN_DATA_DIR;
    else process.env.DECISION_BRAIN_DATA_DIR = prevDir;
    if (prevFile === undefined) delete process.env.DECISION_BRAIN_STATE_FILE;
    else process.env.DECISION_BRAIN_STATE_FILE = prevFile;
  }
});

test("确认 BTC routes to asset_identity_confirmation", () => {
  const result = classifyIntent("确认 BTC", {});
  assert.equal(result.intent, "asset_identity_confirmation");
  assert.equal(result.slots.assetQuery, "BTC");
});

test("manage_position fanout is [memory, valuation]", () => {
  const fanout = planFanout("manage_position");
  assert.deepEqual(fanout, ["memory", "valuation"]);
});

test("refresh_research fanout includes market agents", () => {
  const fanout = planFanout("refresh_research");
  assert.ok(fanout.includes("macro"));
  assert.ok(fanout.includes("onchain"));
  assert.ok(fanout.includes("sentiment"));
});

// LLM conflict resolution: when LLM says strategy_dialogue but rule says manage_position
test("rule-based manage_position should have correct slots even without LLM", () => {
  // This tests the rule-based path directly (no LLM involved)
  const result = classifyIntent("我直接买一个吧", {
    lastAsset: "BTC",
    lastIntent: "evaluate_candidate",
    recentTurns: [{ role: "user", message: "研究 BTC", intent: "evaluate_candidate", assetQuery: "BTC" }],
  });
  assert.equal(result.intent, "manage_position");
  assert.equal(result.slots.assetQuery, "BTC");
});
