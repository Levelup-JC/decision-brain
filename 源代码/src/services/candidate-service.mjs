import { entityId } from "../utils/ids.mjs";
import { nowIso } from "../utils/time.mjs";
import { buildResearchContext } from "./research-context-service.mjs";
import { buildValuationModel } from "./valuation-service.mjs";
import { buildDraftPlan } from "./plan-service.mjs";
import { buildResearchReport } from "./research-service.mjs";

function mapIntentToInvestmentContext(intentClass, portfolioMemoryProfile, position) {
  if (intentClass === "add_to_existing" && position) {
    return Number(position.currentPrice || 0) >= Number(position.averageCost || 0)
      ? "add_to_winner"
      : "average_down_review";
  }
  if (intentClass === "resume_archived_watch") {
    return "resume_watch_only";
  }
  if (intentClass === "rebuild_after_exit") {
    return "reentry_after_exit";
  }
  return "first_buy";
}

function buildDecisionLicense(researchContext, portfolioMemoryProfile) {
  if (portfolioMemoryProfile.requiresUserConfirmation && !portfolioMemoryProfile.allowUnconfirmedHistoryFlow) {
    return {
      key: "blocked",
      label: "需确认持仓历史",
      reason: portfolioMemoryProfile.confirmationPrompt
    };
  }

  if (researchContext.readiness === "blocked") {
    return {
      key: "blocked",
      label: "研究未完成",
      reason: researchContext.summary
    };
  }

  if (researchContext.readiness === "thin") {
    return {
      key: "draftable",
      label: "研究偏薄",
      reason: researchContext.summary
    };
  }

  return {
    key: "actionable",
    label: "可形成建议",
    reason: researchContext.summary
  };
}

function buildDecisionPack({ asset, researchReport, researchContext, portfolioMemoryProfile }) {
  return {
    assetIdentity: {
      symbol: asset.symbol,
      assetType: asset.assetType,
      chain: asset.chain,
      contractAddress: asset.contractAddress
    },
    thesis: researchReport.thesis || [],
    valuationAnchors: researchReport.comparables || [],
    riskFlags: researchReport.risks || [],
    eventMap: {
      catalysts: researchReport.catalysts || [],
      listedExchanges: researchReport.listedExchanges || [],
      potentialExchanges: researchReport.potentialExchanges || [],
      exchangePathHypothesis: researchReport.exchangePathHypothesis || null
    },
    liquidityProfile: {
      note: researchReport.liquidityNote || null,
      marketStructureNote: researchReport.marketStructureNote || null
    },
    structuredResearch: {
      comparablesDraft: researchReport.comparablesDraft || null,
      listingPathDraft: researchReport.listingPathDraft || null,
      fundingUnlockDraft: researchReport.fundingUnlockDraft || null
    },
    sourceQuality: researchContext,
    portfolioMemoryProfile
  };
}

function buildInvestmentMemo({
  asset,
  researchReport,
  researchContext,
  portfolioMemoryProfile,
  investmentContextClass,
  position,
  valuationModel
}) {
  const currentFdv = Number(valuationModel?.currentMetrics?.fdv || 0);
  const maxTotalAllocation =
    asset.riskClass === "low" ? 0.12 :
      asset.riskClass === "medium" ? 0.08 :
        asset.riskClass === "medium_high" ? 0.05 :
          0.03;
  const suggestedInitialAllocation = investmentContextClass === "first_buy"
    ? Math.min(maxTotalAllocation, asset.assetType === "onchain_token" ? 0.01 : 0.02)
    : Math.min(maxTotalAllocation, 0.01);

  const priorPositionSummary = portfolioMemoryProfile.hasCurrentPosition
    ? `当前已有仓位，约 ${position?.units || 0} 单位，成本 ${position?.averageCost || 0}。`
    : portfolioMemoryProfile.hasHistoricalPosition
      ? `${asset.symbol} 过去曾出现于本地仓位画像中，但当前没有确认中的持仓。`
      : "当前未检出明确历史持仓记录。";

  const deltaFromLastThesis = portfolioMemoryProfile.hasPriorResearch
    ? "本次判断会在既有 thesis 基础上重新评估估值、事件和流动性。"
    : "本次判断属于新的基础研究，不依赖既有 thesis。";
  const extractedSignals = researchContext?.extractedSignals || {};
  const factualInputs = [
    researchReport.currentMetrics?.marketCap ? `当前市值约 ${researchReport.currentMetrics.marketCap}` : null,
    researchReport.currentMetrics?.fdv ? `当前 FDV 约 ${researchReport.currentMetrics.fdv}` : null,
    researchReport.currentMetrics?.price ? `当前价格约 ${researchReport.currentMetrics.price}` : null,
    extractedSignals.marketFacts?.[0] || null,
    extractedSignals.liquiditySignals?.[0] || null,
    extractedSignals.exchangeSignals?.[0] || null
  ].filter(Boolean);
  const researchGaps = [
    researchReport.comparablesDraft?.status !== "ready" ? researchReport.comparablesDraft?.nextStep : null,
    researchReport.listingPathDraft?.status === "missing" ? researchReport.listingPathDraft?.nextStep : null,
    researchReport.fundingUnlockDraft?.status !== "ready" ? researchReport.fundingUnlockDraft?.nextStep : null
  ].filter(Boolean);

  return {
    id: entityId("memo"),
    assetId: asset.id,
    assetSymbol: asset.symbol,
    investmentContextClass,
    why_buy: researchReport.thesis || [],
    valuation_anchor: {
      currentFdv,
      comparables: researchReport.comparables || []
    },
    risk_map: researchReport.risks || [],
    position_rule: {
      suggestedInitialAllocation,
      maxTotalAllocation,
      addConditions: researchContext.readiness === "usable"
        ? ["估值回到更有利区间", "thesis 增强", "流动性与事件支持"]
        : ["研究补全后再讨论后续加仓"],
      doNotAddConditions: ["研究状态 blocked", "流动性恶化", "价格曲线已进入追高段"]
    },
    thesis_invalidator: [
      "核心 thesis 被证伪",
      "上所/分发路径明显受阻",
      "流动性或承接显著恶化"
    ],
    factual_inputs: factualInputs,
    research_gaps: researchGaps,
    structured_research: {
      comparablesDraft: researchReport.comparablesDraft || null,
      listingPathDraft: researchReport.listingPathDraft || null,
      fundingUnlockDraft: researchReport.fundingUnlockDraft || null
    },
    prior_position_summary: priorPositionSummary,
    delta_from_last_thesis: deltaFromLastThesis,
    createdAt: nowIso()
  };
}

export async function evaluateCandidateState({ asset, state, portfolioMemoryProfile, body = {}, options = {}, enrichment = null }) {
  const existingResearchReport = state.researchReports[asset.id];
  const researchReport = await buildResearchReport(asset, existingResearchReport, enrichment);
  state.researchReports[asset.id] = researchReport;

  for (const source of researchReport.sources || []) {
    state.sources[source.id] = {
      ...source,
      assetId: asset.id,
      assetSymbol: asset.symbol,
      roleInDecision: source.roleInDecision || "research_seed",
      createdAt: source.createdAt || nowIso()
    };
  }

  const recentSources = Object.values(state.sources || {})
    .filter((source) => source.assetId === asset.id)
    .slice(-10);
  const researchContext = buildResearchContext({
    asset,
    researchReport,
    recentSources
  });
  const position = state.positions[asset.id] || null;
  const investmentContextClass = mapIntentToInvestmentContext(
    portfolioMemoryProfile.suggestedIntentClass,
    portfolioMemoryProfile,
    position
  );
  const license = buildDecisionLicense(researchContext, portfolioMemoryProfile);

  let valuationModel = state.valuationModels[asset.id] || null;
  let positionPlaybook = state.plans[asset.id] || null;
  if (license.key !== "blocked" || (options.allowDegradedPlanForPosition && position)) {
    const pseudoPosition = position || {
      assetId: asset.id,
      assetSymbol: asset.symbol,
      units: Number(body.units || 0),
      averageCost: Number(body.averageCost || 0),
      currentPrice: Number(body.currentPrice || body.averageCost || 0),
      currentValue: Number((Number(body.units || 0) * Number(body.currentPrice || body.averageCost || 0)).toFixed(2)),
      portfolioValue: Number(body.portfolioValue || 0),
      portfolioContextComplete: body.portfolioValue !== undefined,
      peakUnits: Number(body.units || 0),
      portfolioPct: 0,
      sectorExposurePct: Number(body.sectorExposurePct || 0),
      cashPct: Number(body.cashPct || 0),
      marketCap: Number(body.marketCap || researchReport.currentMetrics?.marketCap || 0),
      fdv: Number(body.fdv || researchReport.currentMetrics?.fdv || 0),
      liquidityUsd: Number(body.liquidityUsd || 0),
      dailyVolumeUsd: Number(body.dailyVolumeUsd || 0),
      updatedAt: nowIso()
    };

    valuationModel = buildValuationModel(asset, pseudoPosition, researchReport, state.valuationModels[asset.id]);
    state.valuationModels[asset.id] = valuationModel;
    positionPlaybook = buildDraftPlan(asset, pseudoPosition, valuationModel, body.naturalLanguagePlan, state.plans[asset.id], options.investmentGoalOverrides || {});
    state.plans[asset.id] = positionPlaybook;
  }

  const decisionPack = buildDecisionPack({
    asset,
    researchReport,
    researchContext,
    portfolioMemoryProfile
  });
  const investmentMemo = buildInvestmentMemo({
    asset,
    researchReport,
    researchContext,
    portfolioMemoryProfile,
    investmentContextClass,
    position,
    valuationModel
  });

  state.traces[entityId("trace")] = {
    id: entityId("trace"),
    assetId: asset.id,
    userIntent: "evaluate_candidate",
    finalRecommendation:
      license.key === "blocked"
        ? `${asset.symbol} 暂不建议直接建仓，需先补历史确认或基础研究`
        : `${asset.symbol} 已形成候选资产判断，可继续进入建仓或加仓讨论`,
    reasons: [
      `持仓画像意图：${portfolioMemoryProfile.suggestedIntentClass}`,
      `研究状态：${researchContext.readinessLabel}`,
      `决策许可：${license.label}`
    ],
    createdAt: nowIso()
  };

  return {
    ok: true,
    asset,
    portfolioMemoryProfile,
    investmentContextClass,
    decisionLicense: license,
    decisionPack,
    investmentMemo,
    positionPlaybook,
    valuationModel,
    researchReport,
    researchContext,
    requiresUserConfirmation: portfolioMemoryProfile.requiresUserConfirmation && !portfolioMemoryProfile.allowUnconfirmedHistoryFlow,
    confirmationPrompt: portfolioMemoryProfile.requiresUserConfirmation && !portfolioMemoryProfile.allowUnconfirmedHistoryFlow
      ? portfolioMemoryProfile.confirmationPrompt
      : null
  };
}
