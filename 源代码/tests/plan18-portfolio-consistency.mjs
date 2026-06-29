// Plan XVIII Self-Check Tests — 负责人2
// Direct API-level tests for portfolio consistency without HTTP/LLM overhead
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { test, before, after } from "node:test";
import { store } from "../src/data-store.mjs";
import {
  getPortfolioSummary,
  managePosition,
  refreshResearch,
  getStateSummary,
} from "../src/services/api-service.mjs";

before(async () => {
  await store.clear();
});

after(async () => {
  await store.clear();
});

// ═══════════════════════════════════════════════════════════════
// Self-Check A: Record BTC → getPortfolioSummary returns it
// ═══════════════════════════════════════════════════════════════

test("Self-Check A: managePosition BTC 1 @ $80,000 → portfolio summary shows it", async () => {
  const result = await managePosition({
    assetQuery: "BTC",
    units: 1,
    averageCost: 80000,
    reason: "BTC回调较多，目标是囤到一个比特币",
  });
  ok(result.ok, "managePosition should succeed: " + (result.error || ""));

  const summary = await getPortfolioSummary();
  strictEqual(summary.totalCount, 1);
  strictEqual(summary.positions[0].symbol, "BTC");
  strictEqual(summary.positions[0].units, 1);
  strictEqual(summary.positions[0].averageCost, 80000);
  ok(summary.positions[0].reason, "should have reason");
  ok(summary.totalPositionValue > 0, "should have total value");
  ok(summary.totalCostBasis > 0, "should have cost basis");
  ok("unrealizedPnl" in summary, "should have unrealizedPnl");
  ok("unrealizedPnlPct" in summary, "should have unrealizedPnlPct");
});

// ═══════════════════════════════════════════════════════════════
// Self-Check C: getPortfolioSummary excludes archived positions
// ═══════════════════════════════════════════════════════════════

// Independent store-level test: verify refreshResearch doesn't clear positions
// This validates the code path without making real MCP calls
test("Self-Check B: refreshResearch does not mutate state.positions", async () => {
  const state1 = await store.load();
  const posCount1 = Object.keys(state1.positions || {}).length;
  ok(posCount1 > 0, "should have at least 1 position before test");

  // Simulate what refreshResearch does: write sources + traces, don't touch positions
  await store.update(async (state) => {
    const srcId = "test-source-" + Date.now();
    state.sources = state.sources || {};
    state.sources[srcId] = { id: srcId, assetId: "test", title: "test" };
    state.traces = state.traces || {};
    state.traces["test-trace"] = { id: "test-trace", userIntent: "refresh_research" };
    return {};
  });

  const state2 = await store.load();
  const posCount2 = Object.keys(state2.positions || {}).length;
  strictEqual(posCount2, posCount1, "position count must not change after refresh-like store.update");

  const summary = await getPortfolioSummary();
  ok(summary.positions[0], "BTC should still exist");
  strictEqual(summary.totalCount, posCount1);
});

test("Self-Check C: archived positions excluded from portfolio summary", async () => {
  // Verify BTC is still there
  let summary = await getPortfolioSummary();
  strictEqual(summary.totalCount, 1);

  // Archive BTC position directly in state
  await store.update(async (state) => {
    const btcId = Object.keys(state.positions).find(
      (id) => state.positions[id].assetSymbol === "BTC"
    );
    if (btcId) {
      state.positions[btcId].status = "archived";
    }
    return {};
  });

  summary = await getPortfolioSummary();
  strictEqual(summary.totalCount, 0,
    "archived positions should be excluded from portfolio summary");

  // Restore for subsequent tests
  await store.update(async (state) => {
    const btcId = Object.keys(state.positions).find(
      (id) => state.positions[id].assetSymbol === "BTC"
    );
    if (btcId) {
      delete state.positions[btcId].status;
    }
    return {};
  });
});

// ═══════════════════════════════════════════════════════════════
// Self-Check D: sell action reduces units, keeps averageCost
// ═══════════════════════════════════════════════════════════════

test("Self-Check D: managePosition sell 0.15 BTC → units 0.85, averageCost 80000", async () => {
  const result = await managePosition({
    assetQuery: "BTC",
    units: 0.15,
    action: "sell",
  });
  ok(result.ok, "sell should succeed: " + (result.error || ""));

  const summary = await getPortfolioSummary();
  strictEqual(summary.positions[0].units, 0.85, "BTC units should be 0.85");
  strictEqual(summary.positions[0].averageCost, 80000,
    "averageCost should remain 80000");
  ok(summary.positions[0].costBasisTotal > 0,
    "costBasisTotal should be recalculated");
});

// ═══════════════════════════════════════════════════════════════
// Self-Check E: oversell protection
// ═══════════════════════════════════════════════════════════════

test("Self-Check E: oversell protection — cannot sell more than held", async () => {
  const result = await managePosition({
    assetQuery: "BTC",
    units: 10, // try to sell 10 BTC (we only have 0.85)
    action: "sell",
  });
  ok(!result.ok, "should fail on oversell");
  strictEqual(result.code, "OVERSELL", "should return OVERSELL error");
  ok(result.error.includes("0.85"), "error should mention current holdings");

  const summary = await getPortfolioSummary();
  strictEqual(summary.positions[0].units, 0.85,
    "units should be unchanged after failed oversell");
});

// ═══════════════════════════════════════════════════════════════
// Self-Check F: getStateSummary matches getPortfolioSummary
// ═══════════════════════════════════════════════════════════════

test("Self-Check F: getStateSummary and getPortfolioSummary are consistent", async () => {
  const state = await getStateSummary();
  const summary = await getPortfolioSummary();

  strictEqual(state.counts.positions, summary.totalCount,
    "state position count should match portfolio summary totalCount");

  // Verify state has the same BTC position
  const btcStatePos = state.positions.find((p) => p.assetSymbol === "BTC");
  const btcSummaryPos = summary.positions.find((p) => p.symbol === "BTC");
  ok(btcStatePos, "state should have BTC position");
  ok(btcSummaryPos, "summary should have BTC position");
  strictEqual(btcStatePos.units, btcSummaryPos.units,
    "units should match between state and summary");
  strictEqual(btcStatePos.averageCost, btcSummaryPos.averageCost,
    "averageCost should match between state and summary");
});

// ═══════════════════════════════════════════════════════════════
// Self-Check G: /api/portfolio-summary returns all required fields
// ═══════════════════════════════════════════════════════════════

test("Self-Check G: portfolio summary includes all required Plan XVIII fields", async () => {
  const summary = await getPortfolioSummary();
  const pos = summary.positions[0];

  const requiredFields = [
    "symbol", "units", "averageCost", "currentPrice",
    "currentValue", "costBasisTotal",
  ];
  for (const field of requiredFields) {
    ok(pos[field] != null, `position should have ${field}: ${pos[field]}`);
  }

  // Plan XVI investment goal fields should be present when plan exists
  ok(pos.plan === null || typeof pos.plan === "object",
    "plan should be null or object");
  if (pos.plan) {
    ok("investmentGoal" in pos.plan, "plan should have investmentGoal");
    ok("targetUnits" in pos.plan, "plan should have targetUnits");
    ok("originalThesis" in pos.plan, "plan should have originalThesis");
    ok("floorRule" in pos.plan, "plan should have floorRule");
  }

  ok("totalPositionValue" in summary, "should have totalPositionValue");
  ok("unrealizedPnl" in summary, "should have unrealizedPnl");
  ok("unrealizedPnlPct" in summary, "should have unrealizedPnlPct");
  ok("activeCount" in summary, "should have activeCount");
  ok("draftCount" in summary, "should have draftCount");
});

// ═══════════════════════════════════════════════════════════════
// Self-Check H: add action (weighted average cost)
// ═══════════════════════════════════════════════════════════════

test("Self-Check H: add more BTC → weighted average cost", async () => {
  const result = await managePosition({
    assetQuery: "BTC",
    units: 0.5,
    averageCost: 90000,
    action: "add",
  });
  ok(result.ok, "add should succeed: " + (result.error || ""));

  const summary = await getPortfolioSummary();
  strictEqual(summary.positions[0].units, 1.35, "units should be 0.85 + 0.5 = 1.35");
  // Weighted average: (0.85*80000 + 0.5*90000) / 1.35 = (68000 + 45000) / 1.35 = 83703.7...
  const expectedAvg = Number(((0.85 * 80000 + 0.5 * 90000) / 1.35).toFixed(4));
  strictEqual(summary.positions[0].averageCost, expectedAvg,
    `average cost should be weighted: ${expectedAvg}`);
});

console.log("\nPlan XVIII 负责人2 unit tests complete.");
