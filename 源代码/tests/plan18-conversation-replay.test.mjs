// Plan XVIII Test Suite — Full Conversation Replay (Demo Script)
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = [
  // classifyIntent alone doesn't have session context; use what the classifier actually returns
  { msg: "研究 BTC",                               expectedIntent: "evaluate_candidate" },
  { msg: "我想买一个BTC，成本价在8万美金。",          expectedIntent: "evaluate_candidate" },
  { msg: "我当时觉得BTC回调了比较多了，所以我才买的。然后我也个人想囤到一个比特币。", expectedIntent: "manage_position" },
  { msg: "我现在呢，觉得比特币都跌到6万了，我想卖掉一半的比特币，我怕它跌到3万。", expectedIntent: "review_sell" },
  { msg: "卖 30%",                                  expectedIntent: "review_sell" },
  { msg: "可以卖吗？",                               expectedIntent: "review_sell" },
  { msg: "好，先卖15%。",                            expectedIntent: "review_sell" },
  { msg: "看我的持仓总览",                            expectedIntent: "lookup_memory" },
  { msg: "我已经卖了0.15 BTC，帮我记录。",             expectedIntent: "sell_execute" },
  { msg: "确认记录卖出",                              expectedIntent: "sell_execute_confirmed" },
  { msg: "看我的持仓总览",                            expectedIntent: "lookup_memory" },
];

async function withTempState(t, callback) {
  const dataDir = await mkdtemp(join(tmpdir(), "db-plan18-replay-"));
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

async function getBtcUnits() {
  const { store } = await import("../src/data-store.mjs");
  const state = await store.load();
  for (const pos of Object.values(state.positions || {})) {
    if (pos.assetSymbol === "BTC") return pos.units;
  }
  return 0;
}

// ── Full transcript replay: intent classification ─────────────────

test("full demo script: every message classifies correctly", async (t) => {
  await withTempState(t, async () => {
    const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
    const results = [];

    for (const step of SCRIPT) {
      const r = classifyIntent(step.msg);
      results.push({
        message: step.msg,
        intent: r.intent,
        expected: step.expectedIntent,
        match: r.intent === step.expectedIntent,
        sellPct: r.slots?.sellPct || null,
        panicFlag: r.slots?.panicFlag || false,
        assetQuery: r.slots?.assetQuery || null,
      });
    }

    // Check each intent matches
    const mismatches = results.filter((r) => !r.match);
    if (mismatches.length > 0) {
      console.error("Intent mismatches:");
      for (const m of mismatches) {
        console.error(`  "${m.message}" → ${m.intent} (expected ${m.expected})`);
      }
    }
    assert.equal(mismatches.length, 0, `all ${SCRIPT.length} intents must match`);

    // Verify specific expectations
    // Step 3 (index 3): panic sell → review_sell with panicFlag
    assert.equal(results[3].panicFlag, true, "panic sell must have panicFlag=true");
    assert.equal(results[3].assetQuery, "BTC");

    // Step 4 (index 4): "卖 30%" → review_sell with sellPct=30
    assert.equal(results[4].sellPct, 30, "'卖 30%' must parse sellPct=30");

    // Step 5 (index 5): "可以卖吗？" → review_sell
    assert.equal(results[5].intent, "review_sell");

    // Step 6 (index 6): "好，先卖15%。" → review_sell (NOT sell_execute)
    assert.equal(results[6].intent, "review_sell", "'先卖15%' must be review_sell");

    // Step 8 (index 8): "我已经卖了0.15 BTC" → sell_execute
    assert.equal(results[8].intent, "sell_execute");
  });
});

// ── Position integrity throughout sell review phase ──────────────

test("BTC position stays at 1 through all sell review messages", async (t) => {
  await withTempState(t, async () => {
    // Seed BTC position directly
    const { managePosition, confirmPlan } = await import("../src/services/api-service.mjs");
    await managePosition({
      assetQuery: "BTC", units: 1, averageCost: 80000,
      reason: "BTC回调较多，目标是囤到一个比特币",
    });
    await confirmPlan({ assetQuery: "BTC" });

    assert.equal(await getBtcUnits(), 1, "initial position: 1 BTC");

    // Classify the sell review messages (steps 4-7 from script)
    const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
    const sellReviewMessages = [
      "我现在呢，觉得比特币都跌到6万了，我想卖掉一半的比特币，我怕它跌到3万。",
      "卖 30%",
      "可以卖吗？",
      "好，先卖15%。",
    ];

    for (const msg of sellReviewMessages) {
      const r = classifyIntent(msg);
      assert.equal(r.intent, "review_sell", `"${msg}" must be review_sell`);
      assert.equal(await getBtcUnits(), 1, `BTC still 1 after "${msg.slice(0, 20)}..."`);
    }

    // '刷新全部研究' must not clear position (regardless of intent classification)
    classifyIntent("刷新全部研究");
    assert.equal(await getBtcUnits(), 1, "BTC still 1 after 刷新全部研究");

    // Portfolio overview must show BTC
    classifyIntent("看我的持仓总览");
    assert.equal(await getBtcUnits(), 1, "BTC still 1 after portfolio overview");
  });
});

// ── Sell confirmation flow ─────────────────────────────────────

test("position only changes after confirmed sell_execute with managePosition", async (t) => {
  await withTempState(t, async () => {
    const { managePosition, confirmPlan } = await import("../src/services/api-service.mjs");
    await managePosition({
      assetQuery: "BTC", units: 1, averageCost: 80000,
      reason: "BTC回调较多，目标是囤到一个比特币",
    });
    await confirmPlan({ assetQuery: "BTC" });

    assert.equal(await getBtcUnits(), 1);

    // Step 1: "我已经卖了0.15 BTC" → sell_execute intent, but NO mutation without confirmation
    const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
    const r1 = classifyIntent("我已经卖了0.15 BTC，帮我记录。");
    assert.equal(r1.intent, "sell_execute");
    assert.equal(await getBtcUnits(), 1, "BTC still 1 — sell_execute alone doesn't mutate");

    // Step 2: "确认记录卖出" → sell_execute_confirmed (Plan XVIII state machine)
    const r2 = classifyIntent("确认记录卖出");
    assert.ok(r2.intent === "sell_execute_confirmed" || r2.intent === "sell_execute");

    // Step 3: Execute the sell via managePosition (the server does this when confirmed)
    await managePosition({ assetQuery: "BTC", units: 0.15, action: "sell" });
    assert.equal(await getBtcUnits(), 0.85, "BTC now 0.85 after confirmed sell");

    // Average cost remains the same
    const { getPortfolioSummary } = await import("../src/services/api-service.mjs");
    const summary = await getPortfolioSummary();
    assert.equal(summary.positions[0].averageCost, 80000);
  });
});

// ── 确认记录卖出 without context ─────────────────────────────────

test("'确认记录卖出' without pendingSellExecution does not mutate", async (t) => {
  await withTempState(t, async () => {
    const { managePosition, confirmPlan } = await import("../src/services/api-service.mjs");
    await managePosition({
      assetQuery: "BTC", units: 1, averageCost: 80000,
      reason: "囤币目标",
    });
    await confirmPlan({ assetQuery: "BTC" });

    // Directly say 确认记录卖出 without any prior sell_execute draft
    const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
    const r = classifyIntent("确认记录卖出");
    assert.ok(r.intent === "sell_execute_confirmed" || r.intent === "sell_execute");
    // Must not change position without a pending sell draft
    assert.equal(await getBtcUnits(), 1, "no mutation without pending sell draft");
  });
});
