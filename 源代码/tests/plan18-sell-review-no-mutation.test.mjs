// Plan XVIII Test Suite — Sell Review Must Not Mutate Positions
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
  const dataDir = await mkdtemp(join(tmpdir(), "db-plan18-sell-"));
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

async function getBtcUnits() {
  const { store } = await import("../src/data-store.mjs");
  const state = await store.load();
  for (const pos of Object.values(state.positions || {})) {
    if (pos.assetSymbol === "BTC") return pos.units;
  }
  return null;
}

// ── Use Case A: 恐慌卖出不能清仓 ──────────────────────────────────

test("UC-A: panic sell '我想卖掉一半' → review_sell, BTC stays at 1", async (t) => {
  await withTempState(t, async () => {
    await seedBtc();
    assert.equal(await getBtcUnits(), 1);

    const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
    const r = classifyIntent("我现在觉得比特币跌到6万了，我想卖掉一半，我怕它跌到3万。");
    assert.equal(r.intent, "review_sell");
    assert.equal(r.slots.assetQuery, "BTC");
    assert.equal(r.slots.panicFlag, true);

    // Position must NOT have changed
    assert.equal(await getBtcUnits(), 1);
  });
});

// ── Use Case B: 短句卖出比例不能执行 ──────────────────────────────

test("UC-B: '卖 30%' → review_sell (fast-path), BTC stays at 1", async (t) => {
  await withTempState(t, async () => {
    await seedBtc();
    assert.equal(await getBtcUnits(), 1);

    const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
    const r = classifyIntent("卖 30%");
    assert.equal(r.intent, "review_sell");
    assert.equal(r.slots.sellPct, 30);

    // Position must NOT have changed
    assert.equal(await getBtcUnits(), 1);
  });
});

test("UC-B2: '卖15%' → review_sell, BTC stays at 1", async (t) => {
  await withTempState(t, async () => {
    await seedBtc();
    const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
    const r = classifyIntent("卖15%");
    assert.equal(r.intent, "review_sell");
    assert.equal(await getBtcUnits(), 1);
  });
});

// ── Use Case C: 确认咨询不能执行 ──────────────────────────────────

test("UC-C: '可以卖吗？' → review_sell, BTC stays at 1", async (t) => {
  await withTempState(t, async () => {
    await seedBtc();
    assert.equal(await getBtcUnits(), 1);

    const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
    const r = classifyIntent("可以卖吗？");
    assert.equal(r.intent, "review_sell");
    assert.equal(await getBtcUnits(), 1);
  });
});

test("UC-C2: 'BTC可以卖吗' → review_sell, BTC stays at 1", async (t) => {
  await withTempState(t, async () => {
    await seedBtc();
    const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
    const r = classifyIntent("BTC可以卖吗");
    assert.equal(r.intent, "review_sell");
    assert.equal(r.slots.assetQuery, "BTC");
    assert.equal(await getBtcUnits(), 1);
  });
});

// ── Use Case D: 口语"先卖15%"不能直接执行 ─────────────────────────

test("UC-D: '好，先卖15%。' → review_sell, no position mutation", async (t) => {
  await withTempState(t, async () => {
    await seedBtc();
    assert.equal(await getBtcUnits(), 1);

    const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
    const r = classifyIntent("好，先卖15%。");
    // Must classify as review_sell, NOT sell_execute
    assert.equal(r.intent, "review_sell");
    assert.equal(await getBtcUnits(), 1);
  });
});

// ── Use Case E: 明确已卖出 + 二次确认才执行 ──────────────────────

test("UC-E: '我已经卖了0.15 BTC，帮我记录' → sell_execute draft, NOT mutate yet", async (t) => {
  await withTempState(t, async () => {
    await seedBtc();
    assert.equal(await getBtcUnits(), 1);

    const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
    const r = classifyIntent("我已经卖了0.15 BTC，帮我记录。");
    assert.equal(r.intent, "sell_execute");
    assert.equal(r.slots.assetQuery, "BTC");

    // Intent is sell_execute but position must NOT change without confirmation
    assert.equal(await getBtcUnits(), 1);
  });
});

// ── Use Case F: 刷新研究不能影响仓位 ─────────────────────────────

test("UC-F: '刷新全部研究' is not a sell intent, BTC stays at 1", async (t) => {
  await withTempState(t, async () => {
    await seedBtc();
    assert.equal(await getBtcUnits(), 1);

    const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
    const r = classifyIntent("刷新全部研究");
    // "刷新全部研究" must NOT be classified as sell_execute or remove_position
    assert.notEqual(r.intent, "sell_execute");
    assert.notEqual(r.intent, "remove_position");
    assert.equal(await getBtcUnits(), 1);
  });
});

// ── 没有 pending sell draft 时确认记录卖出不能修改仓位 ──────────

test("'确认记录卖出' without pending sell draft → sell_execute_confirmed, no mutation", async (t) => {
  await withTempState(t, async () => {
    await seedBtc();
    assert.equal(await getBtcUnits(), 1);

    const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
    const r = classifyIntent("确认记录卖出");
    // Plan XVIII: 确认记录卖出 → sell_execute_confirmed (only with pending draft context)
    assert.ok(r.intent === "sell_execute_confirmed" || r.intent === "sell_execute");
    // Without a pending sell draft context, this must not change position
    assert.equal(await getBtcUnits(), 1);
  });
});

// ── 连续卖出 review 消息后仓位不变 ────────────────────────────────

test("5 consecutive sell review messages do NOT change BTC position", async (t) => {
  await withTempState(t, async () => {
    await seedBtc();
    assert.equal(await getBtcUnits(), 1);

    const { classifyIntent } = await import("../src/chat-orchestrator.mjs");
    const messages = [
      "我想卖掉一半",
      "卖 30%",
      "可以卖吗？",
      "好，先卖15%。",
      "我怕跌到3万想清仓",
    ];

    for (const msg of messages) {
      const r = classifyIntent(msg);
      assert.equal(r.intent, "review_sell", `${msg} → ${r.intent}, expected review_sell`);
    }

    assert.equal(await getBtcUnits(), 1, "BTC still 1 after 5 sell review messages");
  });
});
