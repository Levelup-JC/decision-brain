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
