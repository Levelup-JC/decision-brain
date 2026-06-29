import { store } from "../data-store.mjs";
import { resolveAssetFromQuery, resolveAssetIdentity } from "./asset-service.mjs";
import { detectValuationZone } from "./valuation-service.mjs";
import { buildAddRecommendation, buildSellRecommendation } from "./recommendation-service.mjs";
import { buildResearchContext } from "./research-context-service.mjs";
import { buildResearchReport } from "./research-service.mjs";
import { getAdapters } from "../adapters/index.mjs";
import { entityId } from "../utils/ids.mjs";
import { nowIso } from "../utils/time.mjs";
import { runMonitorForState } from "./monitor-service.mjs";
import { lookupPortfolioMemory } from "./portfolio-memory-service.mjs";
import { evaluateCandidateState } from "./candidate-service.mjs";

async function resolveAssetWithLiveIdentity(asset, adapters, shouldEnrich = true) {
  const resolvedAsset = await resolveAssetIdentity(asset, {}, adapters);
  const enrichment =
    shouldEnrich && typeof adapters?.bitget?.enrichAsset === "function"
      ? await adapters.bitget.enrichAsset(resolvedAsset)
      : null;

  return {
    asset: resolvedAsset,
    enrichment: enrichment?.ok ? enrichment : null,
  };
}

function applyEnrichmentToPosition(position, enrichment) {
  if (!enrichment?.ok) {
    return position;
  }

  return {
    ...position,
    marketCap: Number(enrichment.currentMetrics?.marketCap || position.marketCap || 0),
    fdv: Number(enrichment.currentMetrics?.fdv || position.fdv || 0),
    liquidityUsd: Number(enrichment.identity?.liquidityUsd || position.liquidityUsd || 0),
    dailyVolumeUsd: Number(enrichment.identity?.volume24h || position.dailyVolumeUsd || 0),
  };
}

function requireField(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required field: ${fieldName}`);
  }
}

function stateSummary(state) {
  return {
    ok: true,
    counts: {
      assets: Object.keys(state.assets).length,
      positions: Object.keys(state.positions).length,
      sources: Object.keys(state.sources || {}).length,
      plans: Object.keys(state.plans).length,
      events: Object.keys(state.events).length,
      traces: Object.keys(state.traces).length
    },
    assets: Object.values(state.assets),
    positions: Object.values(state.positions),
    sources: Object.values(state.sources || {}),
    plans: Object.values(state.plans),
    valuationModels: Object.values(state.valuationModels),
    researchReports: Object.values(state.researchReports),
    recentEvents: Object.values(state.events).slice(-10),
    recentTraces: Object.values(state.traces).slice(-10)
  };
}

export async function getStateSummary() {
  const state = await store.load();
  return stateSummary(state);
}

export async function getPortfolioSummary() {
  const state = await store.load();
  const allPositions = Object.values(state.positions || {});

  const activePositions = allPositions.filter((pos) => {
    if (pos.status === "archived") return false;
    const plan = state.plans[pos.assetId];
    return !plan || plan.status !== "archived";
  });

  const result = activePositions.map((pos) => {
    const plan = state.plans[pos.assetId] || null;
    const valuationModel = state.valuationModels[pos.assetId] || null;
    const asset = state.assets[pos.assetId] || null;

    let valuationTiers = null;
    if (plan?.valuationTiers) {
      valuationTiers = plan.valuationTiers;
    } else if (valuationModel?.scenarios) {
      valuationTiers = {
        conservative: valuationModel.scenarios[0]?.targetFdvRange || null,
        base: valuationModel.scenarios[1]?.targetFdvRange || null,
        aggressive: valuationModel.scenarios[2]?.targetFdvRange || null,
      };
    }

    return {
      symbol: pos.assetSymbol || asset?.symbol || "unknown",
      assetId: pos.assetId,
      units: pos.units,
      averageCost: pos.averageCost,
      currentPrice: pos.currentPrice,
      currentValue: Number(pos.currentValue || 0),
      costBasisTotal: Number(pos.costBasisTotal || 0),
      reason: pos.reason || null,
      status: plan?.status || "unmanaged",
      plan: plan
        ? {
            id: plan.id,
            status: plan.status,
            confirmedAt: plan.confirmedAt || null,
            valuationTiers,
            nextReviewAt: plan.nextReviewAt || null,
            monitoringPolicy: plan.monitoringPolicy || null,
            // Plan XVI: investment goal fields
            investmentGoal: plan.investmentGoal || null,
            targetUnits: plan.targetUnits ?? null,
            originalThesis: plan.originalThesis || null,
            timeHorizon: plan.timeHorizon || null,
            goalProgress: (plan.targetUnits != null)
              ? { current: pos.units, target: plan.targetUnits, label: `${pos.units} / ${plan.targetUnits}` }
              : null,
            floorRule: plan.userFloorRule || plan.floorRule || null,
            sellRules: plan.sellRules || [],
            panicGuard: plan.panicGuard || { enabled: true, lastTriggeredAt: null },
          }
        : null,
      valuationZone: valuationModel ? detectValuationZone(valuationModel) : null,
      latestMetrics: {
        marketCap: pos.marketCap || null,
        fdv: pos.fdv || null,
        dailyVolumeUsd: pos.dailyVolumeUsd || null,
      },
      portfolioValue: Number(pos.portfolioValue || 0),
      portfolioPct: pos.portfolioPct || null,
      updatedAt: pos.updatedAt || null,
    };
  });

  const totalPositionValue = result.reduce((sum, p) => sum + p.currentValue, 0);
  const totalCostBasis = result.reduce((sum, p) => sum + p.costBasisTotal, 0);
  const unrealizedPnl = Number((totalPositionValue - totalCostBasis).toFixed(2));
  const unrealizedPnlPct = totalCostBasis > 0
    ? Number(((unrealizedPnl / totalCostBasis) * 100).toFixed(2))
    : 0;

  return {
    ok: true,
    positions: result,
    totalPositionValue,
    totalCostBasis,
    unrealizedPnl,
    unrealizedPnlPct,
    totalCount: result.length,
    activeCount: result.filter((p) => p.plan?.status === "active").length,
    draftCount: result.filter((p) => p.plan?.status === "draft").length,
  };
}

export async function lookupPortfolioMemoryApi(body) {
  requireField(body.assetQuery, "assetQuery");
  const state = await store.load();
  const result = await lookupPortfolioMemory(body.assetQuery, state);

  return {
    ok: true,
    asset: result.asset,
    portfolioMemoryProfile: result.portfolioMemoryProfile
  };
}

export async function getAssetContext(assetQuery) {
  requireField(assetQuery, "assetQuery");
  const state = await store.load();
  const lookup = await lookupPortfolioMemory(assetQuery, state);
  const asset = lookup.asset;
  const position = state.positions[asset.id] || null;
  const researchReport = state.researchReports[asset.id] || null;
  const valuationModel = state.valuationModels[asset.id] || null;
  const plan = state.plans[asset.id] || null;
  const recentEvents = Object.values(state.events)
    .filter((event) => event.assetId === asset.id)
    .slice(-5);
  const recentSources = Object.values(state.sources || {})
    .filter((source) => source.assetId === asset.id)
    .slice(-10);
  const recentTraces = Object.values(state.traces)
    .filter((trace) => trace.assetId === asset.id)
    .slice(-5);
  const monitorState = state.monitorState[asset.id] || null;
  const researchContext = buildResearchContext({
    asset,
    researchReport,
    recentSources
  });

  return {
    ok: true,
    asset,
    position,
    researchReport,
    valuationModel,
    plan,
    recentSources,
    recentEvents,
    recentTraces,
    monitorState,
    researchContext,
    portfolioMemoryProfile: lookup.portfolioMemoryProfile,
    historicalStatus: lookup.portfolioMemoryProfile.suggestedIntentClass,
    memorySummary: {
      status: plan?.status || "unmanaged",
      thesis: researchReport?.thesis || [],
      catalysts: researchReport?.catalysts || [],
      risks: researchReport?.risks || [],
      listedExchanges: researchReport?.listedExchanges || [],
      potentialExchanges: researchReport?.potentialExchanges || [],
      sourceCount: recentSources.length,
      researchReadiness: researchContext.readiness,
      researchReadinessLabel: researchContext.readinessLabel,
      missingBasics: researchContext.missingBasics,
      valuationZone: valuationModel ? detectValuationZone(valuationModel) : "unknown",
      nextReviewAt: plan?.nextReviewAt || null,
      lastNewsUpdateAt: monitorState?.lastNewsUpdateAt || null,
      lastPositionUpdateAt: monitorState?.lastPositionUpdateAt || null,
      portfolioContextComplete: Boolean(position?.portfolioContextComplete),
      latestEventTitle: recentEvents[recentEvents.length - 1]?.title || null,
      // Plan XVI: investment goal fields
      investmentGoal: plan?.investmentGoal || null,
      targetUnits: plan?.targetUnits ?? null,
      originalThesis: plan?.originalThesis || position?.reason || null,
      timeHorizon: plan?.timeHorizon || null,
      goalProgress: (plan?.targetUnits != null && position?.units != null)
        ? { current: position.units, target: plan.targetUnits, label: `${position.units} / ${plan.targetUnits}` }
        : null,
      floorRule: plan?.userFloorRule || plan?.floorRule || null,
    }
  };
}

export function buildCapabilities() {
  return {
    ok: true,
    service: "decision-brain",
    positioning: {
      role: "investment_decision_brain",
      notFor: ["auto_trading", "private_key_management", "high_frequency_monitoring"],
      monitoringCadence: {
        news: "once_per_24h",
        position: "once_per_24h"
      },
      supportedAssets: ["stocks", "major_crypto", "cex_tokens", "onchain_tokens"],
      adviceStyle: "final_investment_recommendation"
    },
    agentPlaybook: {
      alwaysReadContextBeforeAdvice: true,
      preferredAssetIdentifier: "assetQuery",
      workflow: [
        "lookup-portfolio-memory before deciding whether this is a first buy, add, re-entry, or resume-watch case",
        "evaluate-candidate when the user first asks whether an asset is worth buying or watching",
        "manage-position when the user already bought or wants to bind a live position to the candidate thesis",
        "confirm-plan after the user accepts the generated draft plan",
        "get-asset-context before answering any follow-up question about that asset",
        "review-add-intent when the user asks whether to add",
        "review-sell-intent when the user asks whether to sell",
        "run-daily-monitor once per day",
        "log-source whenever the agent reads an external source worth keeping",
        "archive-asset when the asset is no longer actively managed"
      ],
      memoryRules: [
        "do not keep a separate shadow memory outside Decision Brain",
        "write long-lived research evidence back through log-source",
        "do not poll run-daily-monitor more than once every 24 hours unless force is explicitly needed"
      ],
      recommendationRules: [
        "use price curve only as one input, never as the only reason",
        "call refresh-research before advice when researchReadiness is blocked or thin",
        "check valuation, events, thesis state, and floor rule before suggesting a sell",
        "check portfolio allocation and sector exposure before suggesting an add"
      ]
    },
    tools: [
      {
        name: "lookup-portfolio-memory",
        method: "POST",
        path: "/api/lookup-portfolio-memory",
        purpose: "在任何建议前先查当前仓位、历史资产、归档状态和可接入本地组合来源"
      },
      {
        name: "evaluate-candidate",
        method: "POST",
        path: "/api/evaluate-candidate",
        purpose: "对候选资产生成 Decision Pack、Investment Memo 和初始仓位建议"
      },
      {
        name: "manage-position",
        method: "POST",
        path: "/api/manage-position",
        purpose: "把实际持仓绑定到候选判断，并在需要时自动补全研究、估值和 draft 计划"
      },
      {
        name: "refresh-research",
        method: "POST",
        path: "/api/refresh-research",
        purpose: "调用 Bitget Skill 调研资产，并把来源写回 Decision Brain"
      },
      {
        name: "confirm-plan",
        method: "POST",
        path: "/api/confirm-plan",
        purpose: "确认 draft 计划并启动 active 监控"
      },
      {
        name: "review-add-intent",
        method: "POST",
        path: "/api/review-add-intent",
        purpose: "基于仓位和估值给加仓建议"
      },
      {
        name: "review-sell-intent",
        method: "POST",
        path: "/api/review-sell-intent",
        purpose: "基于仓位、底仓和估值给卖出建议"
      },
      {
        name: "run-daily-monitor",
        method: "POST",
        path: "/api/run-daily-monitor",
        purpose: "执行每日一次的新闻和仓位监测"
      },
      {
        name: "log-source",
        method: "POST",
        path: "/api/log-source",
        purpose: "给某个资产追加结构化来源记录，供龙虾长期记忆和后续复盘使用"
      },
      {
        name: "get-asset-context",
        method: "GET",
        path: "/api/asset-context?asset=SYMBOL",
        purpose: "读取某个资产的完整记忆上下文，方便龙虾持续调用"
      },
      {
        name: "archive-asset",
        method: "POST",
        path: "/api/archive-asset",
        purpose: "归档某个资产的计划和监测状态，避免记忆混乱"
      }
    ]
  };
}

export async function evaluateCandidate(body) {
  requireField(body.assetQuery, "assetQuery");

  return store.update(async (state) => {
    const lookup = await lookupPortfolioMemory(body.assetQuery, state);
    const adapters = getAdapters({ offline: Boolean(process.env.DECISION_BRAIN_OFFLINE) });
    const resolved = await resolveAssetWithLiveIdentity(lookup.asset, adapters);
    const asset = resolved.asset;
    state.assets[asset.id] = asset;

    return await evaluateCandidateState({
      asset,
      state,
      portfolioMemoryProfile: lookup.portfolioMemoryProfile,
      body,
      enrichment: resolved.enrichment
    });
  });
}

export async function managePosition(body) {
  requireField(body.assetQuery, "assetQuery");

  return store.update(async (state) => {
    const initialLookup = await lookupPortfolioMemory(body.assetQuery, state, {
      allowUnconfirmedHistoryFlow: true
    });
    const adapters = getAdapters({ offline: Boolean(process.env.DECISION_BRAIN_OFFLINE) });
    const resolved = await resolveAssetWithLiveIdentity(initialLookup.asset, adapters);
    const asset = resolved.asset;
    state.assets[asset.id] = asset;
    const existingResearchReport = state.researchReports[asset.id];

    // Plan XVI: block position write when asset identity is unconfirmed
    // Unknown tickers (e.g. "BTW") must be confirmed by user before writing
    const identityUnconfirmed =
      asset.assetType === "unclassified_asset" &&
      asset.identityConfidence !== "high" &&
      !existingResearchReport;
    if (identityUnconfirmed && !body.allowUnconfirmedAsset) {
      return {
        ok: false,
        error: `无法确认 ${body.assetQuery} 的资产身份。请补充项目全称、合约地址或链，系统确认后再记录仓位。`,
        code: "IDENTITY_UNCONFIRMED",
        asset,
        identity: {
          inputSymbol: initialLookup.asset?.symbol || body.assetQuery,
          resolvedSymbol: asset.symbol,
          identityConfidence: asset.identityConfidence || "low",
          needsUserConfirmation: true,
        },
      };
    }

    const existingPosition = state.positions[asset.id];

    // "sell" action: reduce units from existing position. Keep averageCost unchanged.
    // "add" action: merge additional units into existing position with weighted average cost.
    // Default (no action): absolute replace — units and cost are the new totals.
    const shouldSell =
      body.action === "sell" &&
      existingPosition &&
      existingPosition.units > 0 &&
      body.units !== undefined && body.units !== null;

    const shouldAddToExisting =
      body.action === "add" &&
      existingPosition &&
      existingPosition.units > 0 &&
      body.units !== undefined && body.units !== null;

    let units;
    let averageCost;
    let actualCostBasisTotal;

    if (shouldSell) {
      const soldUnits = Number(body.units || 0);
      if (soldUnits > Number(existingPosition.units)) {
        return {
          ok: false,
          error: `卖出数量 (${soldUnits}) 超过当前持仓 (${existingPosition.units})，无法执行。请检查卖出数量。`,
          code: "OVERSELL"
        };
      }
      units = Number(existingPosition.units) - soldUnits;
      averageCost = Number(existingPosition.averageCost || 0);
      actualCostBasisTotal = Number((units * averageCost).toFixed(2));
    } else if (shouldAddToExisting) {
      const additionalUnits = Number(body.units || 0);
      const additionalCostEach = body.averageCost !== undefined && body.averageCost !== null
        ? Number(body.averageCost)
        : Number(existingPosition.averageCost || 0);
      const existingCostBasis = Number(existingPosition.costBasisTotal
        || existingPosition.units * existingPosition.averageCost
        || 0);

      units = Number(existingPosition.units) + additionalUnits;
      actualCostBasisTotal = Number((existingCostBasis + additionalUnits * additionalCostEach).toFixed(2));
      averageCost = units > 0
        ? Number((actualCostBasisTotal / units).toFixed(4))
        : Number(existingPosition.averageCost || 0);
    } else {
      units = Number(body.units ?? existingPosition?.units ?? 0);
      averageCost = Number(body.averageCost ?? existingPosition?.averageCost ?? 0);
      actualCostBasisTotal = Number((units * averageCost).toFixed(2));
    }

    const currentPrice = Number(body.currentPrice ?? existingPosition?.currentPrice ?? averageCost);
    const currentValue = Number((units * currentPrice).toFixed(2));
    const portfolioValueExplicitlyProvided = body.portfolioValue !== undefined && body.portfolioValue !== null;
    const portfolioValue = Number(
      portfolioValueExplicitlyProvided
        ? body.portfolioValue
        : existingPosition?.portfolioValue || currentValue || 0
    );
    const portfolioPct = portfolioValue > 0 ? currentValue / portfolioValue : Number(existingPosition?.portfolioPct || 0);
    const peakUnits = Math.max(Number(existingPosition?.peakUnits || 0), units);

    // Append reason when adding to existing position; otherwise replace
    const reason = body.reason
      ? (existingPosition?.reason && shouldAddToExisting
          ? existingPosition.reason + "；追加：" + body.reason
          : body.reason)
      : (existingPosition?.reason || "");
    const position = {
      assetId: asset.id,
      assetSymbol: asset.symbol,
      units,
      averageCost,
      costBasisTotal: actualCostBasisTotal,
      currentPrice,
      currentValue,
      portfolioValue,
      portfolioContextComplete: portfolioValueExplicitlyProvided || Boolean(existingPosition?.portfolioContextComplete),
      peakUnits,
      portfolioPct,
      sectorExposurePct: Number(body.sectorExposurePct || existingPosition?.sectorExposurePct || 0),
      cashPct: Number(body.cashPct || existingPosition?.cashPct || 0),
      marketCap: Number(body.marketCap || existingResearchReport?.currentMetrics?.marketCap || existingPosition?.marketCap || 0),
      fdv: Number(body.fdv || existingResearchReport?.currentMetrics?.fdv || existingPosition?.fdv || 0),
      liquidityUsd: Number(body.liquidityUsd || existingPosition?.liquidityUsd || 0),
      dailyVolumeUsd: Number(body.dailyVolumeUsd || existingPosition?.dailyVolumeUsd || 0),
      reason,
      updatedAt: nowIso()
    };
    const enrichedPosition = applyEnrichmentToPosition(position, resolved.enrichment);
    state.positions[asset.id] = enrichedPosition;
    const lookup = await lookupPortfolioMemory(body.assetQuery, state, {
      allowUnconfirmedHistoryFlow: true,
      contextIntent: shouldSell ? "review_sell" : null,
    });
    // Plan XVI: extract investment goal fields from body
    const investmentGoalOverrides = {};
    if (body.investmentGoal) investmentGoalOverrides.investmentGoal = body.investmentGoal;
    if (body.targetUnits != null) investmentGoalOverrides.targetUnits = Number(body.targetUnits);
    if (body.originalThesis) investmentGoalOverrides.originalThesis = body.originalThesis;
    if (body.timeHorizon) investmentGoalOverrides.timeHorizon = body.timeHorizon;
    if (body.floorRule) investmentGoalOverrides.floorRule = body.floorRule;
    if (body.sellRules) investmentGoalOverrides.sellRules = body.sellRules;

    const evaluated = await evaluateCandidateState({
      asset,
      state,
      portfolioMemoryProfile: lookup.portfolioMemoryProfile,
      body,
      options: {
        allowDegradedPlanForPosition: true,
        investmentGoalOverrides,
      },
      enrichment: resolved.enrichment
    });
    const researchReport = evaluated.researchReport;
    const valuationModel = evaluated.valuationModel;
    const plan = evaluated.positionPlaybook;

    state.traces[entityId("trace")] = {
      id: entityId("trace"),
      assetId: asset.id,
      userIntent: "manage_position",
      finalRecommendation: plan
        ? `${asset.symbol} 已生成 draft 投资计划，等待确认`
        : `${asset.symbol} 已写入仓位，但当前仍需先补历史确认或基础研究`,
      reasons: [
        "已完成资产识别和仓位写入",
        `持仓画像意图：${lookup.portfolioMemoryProfile.suggestedIntentClass}`,
        evaluated.decisionLicense.label,
        plan ? "计划需要用户确认后才正式进入 active" : "当前未生成正式计划"
      ],
      createdAt: nowIso()
    };

    return {
      ok: true,
      asset,
      portfolioMemoryProfile: lookup.portfolioMemoryProfile,
      investmentContextClass: evaluated.investmentContextClass,
      decisionLicense: evaluated.decisionLicense,
      decisionPack: evaluated.decisionPack,
      investmentMemo: evaluated.investmentMemo,
      position: enrichedPosition,
      researchReport,
      valuationModel,
      plan,
      requiresUserConfirmation: evaluated.requiresUserConfirmation,
      confirmationPrompt: evaluated.confirmationPrompt,
      identity: {
        inputSymbol: initialLookup.asset?.symbol || body.assetQuery,
        resolvedSymbol: asset.symbol,
        identityConfidence: asset.symbol === body.assetQuery.toUpperCase() ? "high" : "low",
        needsUserConfirmation: asset.symbol !== body.assetQuery.toUpperCase(),
      },
      message: `${asset.symbol} 已经进入管理流程，当前计划状态为 ${plan?.status || "not_ready"}`
    };
  });
}

export async function refreshResearch(body) {
  requireField(body.assetQuery, "assetQuery");

  return store.update(async (state) => {
    const adapters = getAdapters({ offline: Boolean(process.env.DECISION_BRAIN_OFFLINE) });
    const asset = await resolveAssetIdentity(body.assetQuery, state.assets, adapters);
    state.assets[asset.id] = asset;
    const bitgetResult = await adapters.bitget.refreshResearch(asset, undefined, body.skillKey);
    const createdSources = [];

    for (const source of bitgetResult.sources || []) {
      // Handle nested results (new market-data MCP adapter format)
      if (source.results && Array.isArray(source.results)) {
        for (const r of source.results) {
          const normalizedSource = {
            id: entityId("source"),
            assetId: asset.id,
            assetSymbol: asset.symbol,
            sourceType: r.sourceType || source.sourceType || bitgetResult.sourceType || "bitget_skill",
            author: `${source.skill || "bitget_skill"} / ${r.tool || "unknown_tool"}`,
            title: source.title || source.skill || "Bitget Skill",
            url: r.url || null,
            keyClaim: r.keyClaim || "Bitget Skill returned no text content.",
            roleInDecision: source.roleInDecision || "supporting_evidence",
            confidenceAtTime: r.sourceType === "market_data_mcp" ? (Number(body.confidenceAtTime || 8)) : 0,
            createdAt: nowIso()
          };
          state.sources[normalizedSource.id] = normalizedSource;
          createdSources.push(normalizedSource);
        }
      } else {
        // Legacy flat source format
        const normalizedSource = {
          id: entityId("source"),
          assetId: asset.id,
          assetSymbol: asset.symbol,
          sourceType: source.sourceType || bitgetResult.sourceType || "bitget_skill",
          author: source.skill || "bitget_skill",
          title: source.title || source.skill || "Bitget Skill",
          url: source.url || null,
          keyClaim: source.keyClaim || "Bitget Skill returned no text content.",
          roleInDecision: source.roleInDecision || "supporting_evidence",
          confidenceAtTime: source.ok === false ? 0 : Number(body.confidenceAtTime || 7),
          createdAt: nowIso()
        };
        state.sources[normalizedSource.id] = normalizedSource;
        createdSources.push(normalizedSource);
      }
    }

    const researchReport = state.researchReports[asset.id] || await buildResearchReport(asset);
    state.researchReports[asset.id] = researchReport;
    const recentSources = Object.values(state.sources || {})
      .filter((source) => source.assetId === asset.id)
      .slice(-10);
    const researchContext = buildResearchContext({
      asset,
      researchReport,
      recentSources
    });

    state.traces[entityId("trace")] = {
      id: entityId("trace"),
      assetId: asset.id,
      userIntent: "refresh_research",
      finalRecommendation: bitgetResult.ok
        ? `${asset.symbol} 已通过 ${bitgetResult.connectionStatus?.mode || "Bitget"} 刷新研究`
        : `${asset.symbol} 尚未连接数据源，已生成待补调研项`,
      reasons: [
        `Bitget adapter mode: ${bitgetResult.connectionStatus?.mode || "unknown"}`,
        `新增来源 ${createdSources.length} 条`,
        `研究状态：${researchContext.readinessLabel}`
      ],
      createdAt: nowIso()
    };

    return {
      ok: true,
      asset,
      bitget: {
        ok: bitgetResult.ok,
        sourceType: bitgetResult.sourceType,
        connectionStatus: bitgetResult.connectionStatus,
        availableTools: bitgetResult.availableTools || []
      },
      createdSources,
      researchContext,
      message: bitgetResult.ok
        ? `${asset.symbol} 已完成 Bitget Skill 调研写回`
        : `${asset.symbol} 尚未连接数据源；请确认 market-data MCP 已配置或设置 BITGET_MCP_COMMAND`
    };
  });
}

export async function confirmPlan(body) {
  requireField(body.assetQuery || body.planId, "assetQuery or planId");

  return store.update(async (state) => {
    let plan = null;
    if (body.planId) {
      plan = Object.values(state.plans).find((item) => item.id === body.planId);
    } else {
      const asset = resolveAssetFromQuery(body.assetQuery, state.assets);
      plan = state.plans[asset.id];
    }

    if (!plan) {
      throw new Error("Plan not found");
    }

    plan.status = "active";
    plan.confirmedAt = nowIso();
    plan.updatedAt = nowIso();
    state.plans[plan.assetId] = plan;
    state.monitorState[plan.assetId] = state.monitorState[plan.assetId] || {};

    state.traces[entityId("trace")] = {
      id: entityId("trace"),
      assetId: plan.assetId,
      userIntent: "confirm_plan",
      finalRecommendation: "计划已确认并进入 active 监控",
      reasons: ["后续新闻和仓位监测将按 24 小时节奏运行"],
      createdAt: nowIso()
    };

    return {
      ok: true,
      plan,
      monitoringPolicy: plan.monitoringPolicy
    };
  });
}

export async function reviewAddIntent(body) {
  requireField(body.assetQuery, "assetQuery");

  return store.update(async (state) => {
    const lookup = await lookupPortfolioMemory(body.assetQuery, state);
    const asset = lookup.asset;
    const position = state.positions[asset.id];
    const valuationModel = state.valuationModels[asset.id];
    const plan = state.plans[asset.id];
    const researchReport = state.researchReports[asset.id];
    const latestEvent = Object.values(state.events)
      .filter((event) => event.assetId === asset.id)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
    const recentSources = Object.values(state.sources || {})
      .filter((source) => source.assetId === asset.id)
      .slice(-10);
    const researchContext = buildResearchContext({
      asset,
      researchReport,
      recentSources
    });

    if (lookup.portfolioMemoryProfile.requiresUserConfirmation) {
      return {
        ok: true,
        asset: asset.symbol,
        portfolioMemoryProfile: lookup.portfolioMemoryProfile,
        intentResolution: "confirmation_required",
        finalRecommendation: "需要先确认你是否曾持有这个资产，再判断这是首投还是加仓",
        suggestedAction: "先确认持仓历史",
        reasons: [lookup.portfolioMemoryProfile.confirmationPrompt]
      };
    }

    if (!position || !valuationModel || !plan) {
      const evaluated = await evaluateCandidateState({
        asset,
        state,
        portfolioMemoryProfile: lookup.portfolioMemoryProfile,
        body
      });

      return {
        ok: true,
        asset: asset.symbol,
        portfolioMemoryProfile: lookup.portfolioMemoryProfile,
        intentResolution: lookup.portfolioMemoryProfile.suggestedIntentClass,
        finalRecommendation: "当前没有可直接执行的持仓加仓路径，先完成候选资产判断",
        suggestedAction: "先看候选资产结论，再决定是否建仓或回补",
        reasons: [
          `系统判定当前更像：${lookup.portfolioMemoryProfile.suggestedIntentClass}`,
          evaluated.decisionLicense.reason
        ],
        decisionLicense: evaluated.decisionLicense,
        investmentMemo: evaluated.investmentMemo
      };
    }

    const result = buildAddRecommendation({
      asset,
      position,
      valuationModel,
      plan,
      totalPortfolioValue: Number(body.portfolioValue || 0),
      researchReport,
      latestEvent,
      researchContext
    });
    result.portfolioMemoryProfile = lookup.portfolioMemoryProfile;
    result.intentResolution = lookup.portfolioMemoryProfile.suggestedIntentClass;

    state.traces[entityId("trace")] = {
      id: entityId("trace"),
      assetId: asset.id,
      userIntent: "review_add_intent",
      finalRecommendation: result.finalRecommendation,
      reasons: result.reasons,
      createdAt: nowIso()
    };

    return result;
  });
}

export async function reviewSellIntent(body) {
  requireField(body.assetQuery, "assetQuery");
  requireField(body.requestedSellPct, "requestedSellPct");

  return store.update(async (state) => {
    const lookup = await lookupPortfolioMemory(body.assetQuery, state, { contextIntent: "review_sell" });
    const asset = lookup.asset;
    const position = state.positions[asset.id];
    const valuationModel = state.valuationModels[asset.id];
    const plan = state.plans[asset.id];
    const researchReport = state.researchReports[asset.id];
    const latestEvent = Object.values(state.events)
      .filter((event) => event.assetId === asset.id)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];

    if (!position || !valuationModel || !plan) {
      throw new Error(`No managed position found for ${asset.symbol}`);
    }

    const result = buildSellRecommendation({
      asset,
      position,
      valuationModel,
      plan,
      requestedSellPct: Number(body.requestedSellPct),
      researchReport,
      latestEvent,
      thesisInvalidated: Boolean(body.thesisInvalidated)
    });
    result.portfolioMemoryProfile = lookup.portfolioMemoryProfile;
    result.intentResolution = lookup.portfolioMemoryProfile.suggestedIntentClass;

    state.traces[entityId("trace")] = {
      id: entityId("trace"),
      assetId: asset.id,
      userIntent: `review_sell_intent:${body.requestedSellPct}%`,
      finalRecommendation: result.finalRecommendation,
      reasons: result.reasons,
      createdAt: nowIso()
    };

    return result;
  });
}

export async function runDailyMonitor(body) {
  return store.update(async (state) => {
    return runMonitorForState(state, Boolean(body.force));
  });
}

export async function logSource(body) {
  requireField(body.assetQuery, "assetQuery");
  requireField(body.title, "title");
  requireField(body.keyClaim, "keyClaim");

  return store.update(async (state) => {
    const asset = resolveAssetFromQuery(body.assetQuery, state.assets);
    if (!state.assets[asset.id]) {
      throw new Error(`No managed asset found for ${asset.symbol}`);
    }

    const source = {
      id: entityId("source"),
      assetId: asset.id,
      assetSymbol: asset.symbol,
      sourceType: body.sourceType || "manual_note",
      author: body.author || "user_or_lobster",
      title: body.title,
      url: body.url || null,
      keyClaim: body.keyClaim,
      roleInDecision: body.roleInDecision || "supporting_evidence",
      confidenceAtTime: Number(body.confidenceAtTime || 0),
      createdAt: nowIso()
    };

    state.sources[source.id] = source;

    state.traces[entityId("trace")] = {
      id: entityId("trace"),
      assetId: asset.id,
      userIntent: "log_source",
      finalRecommendation: `${asset.symbol} 已新增来源记录`,
      reasons: [`来源标题：${source.title}`],
      createdAt: nowIso()
    };

    return {
      ok: true,
      source
    };
  });
}

export async function archiveAsset(body) {
  requireField(body.assetQuery, "assetQuery");

  return store.update(async (state) => {
    const asset = resolveAssetFromQuery(body.assetQuery, state.assets);
    const plan = state.plans[asset.id];

    if (!plan) {
      throw new Error(`No managed asset found for ${asset.symbol}`);
    }

    plan.status = "archived";
    plan.updatedAt = nowIso();
    state.plans[asset.id] = plan;
    delete state.monitorState[asset.id];

    state.traces[entityId("trace")] = {
      id: entityId("trace"),
      assetId: asset.id,
      userIntent: "archive_asset",
      finalRecommendation: `${asset.symbol} 已归档，不再继续自动监测`,
      reasons: ["计划状态已切换为 archived", "每日监测状态已清理"],
      createdAt: nowIso()
    };

    return {
      ok: true,
      asset,
      plan
    };
  });
}

export async function removePosition(body) {
  requireField(body.assetQuery, "assetQuery");

  return store.update(async (state) => {
    const asset = resolveAssetFromQuery(body.assetQuery, state.assets);
    const position = state.positions[asset.id];
    const plan = state.plans[asset.id];

    if (position) {
      position.status = "archived";
      position.archivedAt = nowIso();
      position.updatedAt = nowIso();
      state.positions[asset.id] = position;
    }

    if (plan) {
      plan.status = "archived";
      plan.updatedAt = nowIso();
      state.plans[asset.id] = plan;
    }

    if (state.monitorState[asset.id]) {
      delete state.monitorState[asset.id];
    }

    state.traces[entityId("trace")] = {
      id: entityId("trace"),
      assetId: asset.id,
      userIntent: "remove_position",
      finalRecommendation: `${asset.symbol} 已从当前资产面板移除（软归档），可随时恢复。`,
      reasons: [
        position ? "仓位已标记为 archived" : "未找到活跃仓位",
        plan ? "投资计划已归档" : "未找到活跃计划",
        "每日监测状态已清理",
      ],
      createdAt: nowIso()
    };

    return {
      ok: true,
      asset,
      removed: Boolean(position || plan),
      message: position
        ? `${asset.symbol} 已从资产面板移除，相关记录已归档保留。`
        : `${asset.symbol} 未找到活跃仓位，无需移除。`,
    };
  });
}

export async function fetchOhlcvData(assetSymbol, days = 30) {
  const adapters = getAdapters({ offline: Boolean(process.env.DECISION_BRAIN_OFFLINE) });
  if (typeof adapters.bitget?.fetchOhlcv !== "function") return null;
  return adapters.bitget.fetchOhlcv(assetSymbol, days);
}
