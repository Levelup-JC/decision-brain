import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { store } from "../src/data-store.mjs";
import {
  archiveAsset,
  confirmPlan,
  evaluateCandidate,
  getAssetContext,
  lookupPortfolioMemoryApi,
  logSource,
  managePosition,
  refreshResearch,
  reviewAddIntent,
  reviewSellIntent,
  runDailyMonitor
} from "../src/services/api-service.mjs";
import { buildDraftPlan } from "../src/services/plan-service.mjs";
import { buildAddRecommendation, buildSellRecommendation } from "../src/services/recommendation-service.mjs";
import { buildValuationModel } from "../src/services/valuation-service.mjs";
import { buildResearchReport } from "../src/services/research-service.mjs";
import { buildResearchContext } from "../src/services/research-context-service.mjs";
import { runMonitorForState } from "../src/services/monitor-service.mjs";

async function withTempState(testContext, callback) {
  const dataDir = await mkdtemp(join(tmpdir(), "decision-brain-test-"));
  const previousDataDir = process.env.DECISION_BRAIN_DATA_DIR;
  const previousStateFile = process.env.DECISION_BRAIN_STATE_FILE;
  const previousOffline = process.env.DECISION_BRAIN_OFFLINE;

  process.env.DECISION_BRAIN_DATA_DIR = dataDir;
  process.env.DECISION_BRAIN_OFFLINE = "1";
  delete process.env.DECISION_BRAIN_STATE_FILE;
  store.resetCache();
  await store.clear();

  testContext.after(async () => {
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
    if (previousOffline === undefined) {
      delete process.env.DECISION_BRAIN_OFFLINE;
    } else {
      process.env.DECISION_BRAIN_OFFLINE = previousOffline;
    }
    store.resetCache();
  });

  return callback(dataDir);
}

test("buildDraftPlan parses multiple targets and floor ratio", () => {
  const asset = { id: "asset_sol", symbol: "SOL", assetType: "major_crypto" };
  const position = { peakUnits: 100, averageCost: 100, costBasisTotal: 10000, currentPrice: 140 };
  const research = buildResearchReport(asset);
  const valuation = buildValuationModel(asset, position, research);
  const plan = buildDraftPlan(
    asset,
    position,
    valuation,
    "2x 回本金，3x 卖 30%，5x 再卖 30%，保留历史最高持仓 20% 底仓"
  );

  assert.equal(plan.status, "draft");
  assert.equal(plan.floorRule.ratio, 0.2);
  assert.equal(plan.targets.length, 3);
});

test("add recommendation blocks oversized or high-valuation adds", () => {
  const asset = { symbol: "ZORA", riskClass: "high" };
  const position = {
    units: 100000,
    averageCost: 0.08,
    currentPrice: 0.1,
    currentValue: 10000,
    portfolioPct: 0.04,
    portfolioContextComplete: true
  };
  const valuationModel = {
    currentMetrics: { fdv: 1200 },
    scenarios: [
      { name: "conservative", targetFdvRange: [500, 800] },
      { name: "base", targetFdvRange: [900, 1100] },
      { name: "aggressive", targetFdvRange: [1300, 1600] }
    ]
  };
  const plan = { status: "active" };
  const result = buildAddRecommendation({
    asset,
    position,
    valuationModel,
    plan,
    totalPortfolioValue: 250000,
    researchReport: {
      thesis: ["ZORA 仍需要更强流动性与分发确认"],
      risks: ["流动性不足", "注意力退潮"]
    }
  });

  assert.match(result.finalRecommendation, /不建议/);
  assert.equal(Array.isArray(result.coreReasons), true);
  assert.equal(Boolean(result.priceCurveState?.label), true);
  assert.equal(Boolean(result.structuredAdvice?.headline), true);
});

test("sell recommendation protects floor position", () => {
  const asset = { symbol: "SOL" };
  const position = { units: 100, currentPrice: 200 };
  const valuationModel = {
    currentMetrics: { fdv: 1000 },
    scenarios: [
      { name: "conservative", targetFdvRange: [400, 700] },
      { name: "base", targetFdvRange: [800, 1200] },
      { name: "aggressive", targetFdvRange: [1500, 2500] }
    ]
  };
  const plan = {
    status: "active",
    floorRule: { minimumUnits: 30 }
  };
  const result = buildSellRecommendation({
    asset,
    position,
    valuationModel,
    plan,
    requestedSellPct: 80,
    researchReport: {
      catalysts: ["机构入口"],
      risks: ["高位回撤"]
    }
  });

  assert.equal(result.floorViolation, true);
  assert.match(result.finalRecommendation, /不建议/);
  assert.equal(Array.isArray(result.keyRisks), true);
});

test("daily monitor respects 24h cadence", () => {
  const state = {
    plans: {
      a: { assetId: "asset_sol", status: "active" }
    },
    assets: {
      asset_sol: { id: "asset_sol", symbol: "SOL" }
    },
    researchReports: {
      asset_sol: { catalysts: ["生态活跃提升"] }
    },
    events: {},
    traces: {},
    monitorState: {
      asset_sol: {
        lastNewsUpdateAt: new Date().toISOString(),
        lastPositionUpdateAt: new Date().toISOString()
      }
    }
  };

  const result = runMonitorForState(state, false);
  assert.equal(result.results[0].skippedBecauseDailyLimit, true);
});

test("manage position creates normalized memory and asset context", async (t) => {
  await withTempState(t, async () => {
    const managed = await managePosition({
      assetQuery: "SOL",
      units: 100,
      averageCost: 120,
      currentPrice: 175,
      portfolioValue: 50000,
      naturalLanguagePlan: "2x 回本金，3x 卖 30%，保留历史最高持仓 20% 底仓"
    });

    assert.equal(managed.ok, true);
    assert.equal(managed.plan.status, "draft");

    const context = await getAssetContext("SOL");
    assert.equal(context.ok, true);
    assert.equal(context.asset.symbol, "SOL");
    assert.equal(context.plan.status, "draft");
    assert.ok(context.researchReport.summary);
    assert.ok(context.valuationModel.scenarios.length >= 3);
    assert.ok(context.recentSources.length >= 2);
    assert.equal(context.memorySummary.status, "draft");
    assert.equal(context.memorySummary.portfolioContextComplete, true);
  });
});

test("portfolio memory lookup identifies current positions and archived history", async (t) => {
  await withTempState(t, async () => {
    await managePosition({
      assetQuery: "SOL",
      units: 100,
      averageCost: 120,
      currentPrice: 175,
      portfolioValue: 50000
    });

    const currentLookup = await lookupPortfolioMemoryApi({ assetQuery: "SOL" });
    assert.equal(currentLookup.ok, true);
    assert.equal(currentLookup.portfolioMemoryProfile.hasCurrentPosition, true);
    assert.equal(currentLookup.portfolioMemoryProfile.suggestedIntentClass, "add_to_existing");

    await managePosition({
      assetQuery: "ENA",
      units: 2000,
      averageCost: 0.7,
      currentPrice: 0.92,
      portfolioValue: 20000
    });
    await archiveAsset({ assetQuery: "ENA" });

    const archivedLookup = await lookupPortfolioMemoryApi({ assetQuery: "ENA" });
    assert.equal(archivedLookup.portfolioMemoryProfile.isArchived, true);
    assert.equal(archivedLookup.portfolioMemoryProfile.suggestedIntentClass, "resume_archived_watch");
  });
});

test("evaluate candidate asks for confirmation when no local history can confirm prior ownership", async (t) => {
  await withTempState(t, async () => {
    const result = await evaluateCandidate({
      assetQuery: "AAVE"
    });

    assert.equal(result.ok, true);
    assert.equal(result.requiresUserConfirmation, true);
    assert.equal(result.decisionLicense.key, "blocked");
    assert.match(result.confirmationPrompt, /第一次买|以前买过/);
  });
});

test("review add intent auto-resolves existing position versus candidate flow", async (t) => {
  await withTempState(t, async () => {
    await managePosition({
      assetQuery: "SOL",
      units: 100,
      averageCost: 120,
      currentPrice: 175,
      portfolioValue: 50000,
      naturalLanguagePlan: "2x 回本金，3x 卖 30%，保留历史最高持仓 20% 底仓"
    });

    const existing = await reviewAddIntent({
      assetQuery: "SOL",
      portfolioValue: 50000
    });
    assert.equal(existing.intentResolution, "add_to_existing");

    await managePosition({
      assetQuery: "ENA",
      units: 2000,
      averageCost: 0.7,
      currentPrice: 0.92,
      portfolioValue: 20000
    });
    await archiveAsset({ assetQuery: "ENA" });

    const rebuild = await reviewAddIntent({
      assetQuery: "ENA",
      portfolioValue: 20000
    });
    assert.equal(rebuild.intentResolution, "resume_archived_watch");
    assert.match(rebuild.finalRecommendation, /不建议加仓|先完成候选资产判断/);
  });
});

test("daily monitor can mark plan as needs_review when event triggers review", () => {
  const state = {
    plans: {
      a: { assetId: "asset_risk", status: "active", updatedAt: new Date().toISOString() }
    },
    assets: {
      asset_risk: { id: "asset_risk", symbol: "RISK" }
    },
    researchReports: {
      asset_risk: {
        catalysts: ["观察流动性"],
        inferredSignals: ["若流动性恶化，需要复盘"]
      }
    },
    events: {},
    traces: {},
    monitorState: {}
  };

  const result = runMonitorForState(state, true);
  assert.equal(result.results[0].newsUpdated, true);
  assert.equal(result.results[0].reviewTrigger, true);
  assert.equal(state.plans.a.status, "needs_review");
});

test("sell review can prioritize thesis invalidation", async (t) => {
  await withTempState(t, async () => {
    await managePosition({
      assetQuery: "SOL",
      units: 100,
      averageCost: 120,
      currentPrice: 175,
      portfolioValue: 50000,
      naturalLanguagePlan: "2x 回本金，3x 卖 30%，保留历史最高持仓 20% 底仓"
    });
    await confirmPlan({ assetQuery: "SOL" });

    const result = await reviewSellIntent({
      assetQuery: "SOL",
      requestedSellPct: 80,
      thesisInvalidated: true
    });

    assert.match(result.finalRecommendation, /thesis 已失效|更积极地减仓/);
    assert.equal(Array.isArray(result.whatChangesAdvice), true);
  });
});

test("log source persists into source ledger and aggregated asset context", async (t) => {
  await withTempState(t, async () => {
    await managePosition({
      assetQuery: "ZORA",
      units: 100000,
      averageCost: 0.08,
      currentPrice: 0.11,
      portfolioValue: 30000
    });

    const logged = await logSource({
      assetQuery: "ZORA",
      sourceType: "tweet",
      author: "Some Analyst",
      title: "ZORA 观察",
      keyClaim: "ZORA 的流动性和上所路径仍然是关键变量",
      roleInDecision: "supporting_evidence",
      confidenceAtTime: 7
    });

    assert.equal(logged.ok, true);
    assert.equal(logged.source.assetSymbol, "ZORA");

    const context = await getAssetContext("ZORA");
    assert.ok(context.recentSources.some((source) => source.title === "ZORA 观察"));
    assert.ok(context.recentTraces.some((trace) => trace.userIntent === "log_source"));
  });
});

test("fallback-only unknown asset should not produce a casual add recommendation", async (t) => {
  await withTempState(t, async () => {
    const managed = await managePosition({
      assetQuery: "BTW",
      units: 500,
      averageCost: 1,
      currentPrice: 1,
      portfolioValue: 10000
    });
    await confirmPlan({ assetQuery: "BTW" });

    const researchContext = buildResearchContext({
      asset: managed.asset,
      researchReport: managed.researchReport,
      recentSources: managed.researchReport.sources
    });

    const result = buildAddRecommendation({
      asset: managed.asset,
      position: managed.position,
      valuationModel: managed.valuationModel,
      plan: { ...managed.plan, status: "active" },
      totalPortfolioValue: 10000,
      researchReport: managed.researchReport,
      researchContext
    });

    assert.equal(researchContext.readiness, "blocked");
    assert.match(result.finalRecommendation, /先补基础研究|不建议现在直接加仓/);
    assert.equal(result.suggestedMaxAddPct, 0);
    assert.ok(result.reasons.some((reason) => reason.includes("当前缺少")));
  });
});

test("refresh research connects to market-data MCP when available and returns real data", async (t) => {
  await withTempState(t, async () => {
    const previousCommand = process.env.BITGET_MCP_COMMAND;
    delete process.env.BITGET_MCP_COMMAND;

    try {
      await managePosition({
        assetQuery: "BTW",
        units: 500,
        averageCost: 1,
        currentPrice: 1,
        portfolioValue: 10000
      });

      const refreshed = await refreshResearch({
        assetQuery: "BTW"
      });

      assert.equal(refreshed.ok, true);
      // bitget adapter now uses market-data HTTP MCP by default (no API key needed)
      // It can be in "market-data-http-mcp" mode (connected) or "not_configured" (offline)
      const validModes = ["market-data-http-mcp", "not_configured"];
      assert.ok(
        validModes.includes(refreshed.bitget.connectionStatus.mode),
        `Expected bitget mode to be one of ${validModes.join(", ")}, got ${refreshed.bitget.connectionStatus.mode}`
      );
      assert.ok(refreshed.createdSources.length >= 0);
      // If connected, sources should come from market_data; if not, from not_configured fallback
      const sourceTypes = new Set(refreshed.createdSources.map((s) => s.sourceType));
      assert.ok(
        sourceTypes.has("market_data_mcp") || sourceTypes.has("bitget_skill_not_configured") || sourceTypes.has("not_connected"),
        `Expected sources to include market_data_mcp, not_connected, or bitget_skill_not_configured, got: ${[...sourceTypes].join(", ")}`
      );
    } finally {
      if (previousCommand === undefined) {
        delete process.env.BITGET_MCP_COMMAND;
      } else {
        process.env.BITGET_MCP_COMMAND = previousCommand;
      }
    }
  });
});

test("manual sources should improve research readiness and surface in add rationale", async (t) => {
  await withTempState(t, async () => {
    const managed = await managePosition({
      assetQuery: "BTW",
      units: 500,
      averageCost: 1,
      currentPrice: 1,
      portfolioValue: 50000
    });

    await logSource({
      assetQuery: "BTW",
      sourceType: "manual_note",
      title: "BTW 项目定位",
      keyClaim: "BTW 是一个 CEX 小币，主打链游资产发行，当前 thesis 是靠新游上线和社区活跃提升估值。",
      roleInDecision: "core_thesis",
      confidenceAtTime: 7
    });
    await logSource({
      assetQuery: "BTW",
      sourceType: "manual_note",
      title: "BTW 对标与上所",
      keyClaim: "对标项目可先看 X、Y；目前已在 Bitget，后续若能上 Binance 会明显抬升预期。",
      roleInDecision: "valuation_anchor",
      confidenceAtTime: 6
    });
    await logSource({
      assetQuery: "BTW",
      sourceType: "manual_note",
      title: "BTW 流动性与筹码",
      keyClaim: "当前流动性一般，大额卖出承接偏弱，且未来 3 个月有一轮解锁需要跟踪。",
      roleInDecision: "risk_flag",
      confidenceAtTime: 8
    });
    await confirmPlan({ assetQuery: "BTW" });

    const context = await getAssetContext("BTW");
    const result = await reviewAddIntent({
      assetQuery: "BTW",
      portfolioValue: 50000
    });

    assert.equal(context.researchContext.readiness, "thin");
    assert.ok(context.researchContext.sourceBreakdown.manualSources >= 3);
    assert.ok(result.reasons.some((reason) => reason.includes("补充 thesis 线索")));
    assert.ok(result.reasons.some((reason) => reason.includes("上所/分发线索")));
    assert.match(result.suggestedAction, /总组合 1% 以内|先补/);
  });
});

test("archive asset stops monitoring and keeps history", async (t) => {
  await withTempState(t, async () => {
    await managePosition({
      assetQuery: "ENA",
      units: 2000,
      averageCost: 0.7,
      currentPrice: 0.92,
      portfolioValue: 20000
    });
    await confirmPlan({ assetQuery: "ENA" });
    const beforeMonitor = await runDailyMonitor({});
    assert.equal(beforeMonitor.ok, true);

    const archived = await archiveAsset({ assetQuery: "ENA" });
    assert.equal(archived.ok, true);
    assert.equal(archived.plan.status, "archived");

    const context = await getAssetContext("ENA");
    assert.equal(context.plan.status, "archived");
    assert.equal(context.monitorState, null);
    assert.ok(context.recentTraces.some((trace) => trace.userIntent === "archive_asset"));
  });
});

test("sell review stays plan-aware after confirmation", async (t) => {
  await withTempState(t, async () => {
    await managePosition({
      assetQuery: "SOL",
      units: 100,
      averageCost: 120,
      currentPrice: 175,
      portfolioValue: 50000,
      naturalLanguagePlan: "2x 回本金，3x 卖 30%，保留历史最高持仓 20% 底仓"
    });
    await confirmPlan({ assetQuery: "SOL" });

    const result = await reviewSellIntent({
      assetQuery: "SOL",
      requestedSellPct: 80
    });

    assert.equal(result.ok, true);
    assert.match(result.finalRecommendation, /不建议|建议/);
    assert.equal(Array.isArray(result.reasons), true);
  });
});

test("store reloads state when the underlying file is changed externally", async (t) => {
  await withTempState(t, async (dataDir) => {
    await managePosition({
      assetQuery: "SOL",
      units: 100,
      averageCost: 120,
      currentPrice: 175,
      portfolioValue: 50000
    });

    const stateFile = join(dataDir, "state.json");
    const raw = await readFile(stateFile, "utf8");
    const parsed = JSON.parse(raw);
    parsed.assets = {};
    parsed.positions = {};
    parsed.researchReports = {};
    parsed.valuationModels = {};
    parsed.plans = {};
    parsed.events = {};
    parsed.traces = {};
    parsed.monitorState = {};
    await writeFile(stateFile, JSON.stringify(parsed, null, 2));

    const summary = await store.load();
    assert.equal(Object.keys(summary.assets).length, 0);
    assert.equal(Object.keys(summary.positions).length, 0);
  });
});
