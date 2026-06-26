import { DEFAULT_SETTINGS } from "../config.mjs";
import { detectValuationZone } from "./valuation-service.mjs";

function currentPortfolioPct(position, totalPortfolioValue) {
  if (!totalPortfolioValue || totalPortfolioValue <= 0) {
    return Number(position.portfolioPct || 0);
  }
  const currentValue = Number(position.currentValue || position.units * position.currentPrice || position.costBasisTotal || 0);
  return currentValue / totalPortfolioValue;
}

function maxAllocationFor(position, asset) {
  const riskClass = asset.riskClass || position.riskClass || "high";
  return DEFAULT_SETTINGS.maxAllocationByRiskClass[riskClass] || 0.03;
}

function formatPct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatCompactUsd(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }
  if (number >= 1_000_000_000) {
    return `$${(number / 1_000_000_000).toFixed(2)}B`;
  }
  if (number >= 1_000_000) {
    return `$${(number / 1_000_000).toFixed(2)}M`;
  }
  if (number >= 1_000) {
    return `$${(number / 1_000).toFixed(2)}K`;
  }
  return `$${number.toFixed(number >= 1 ? 2 : 6)}`;
}

function detectPriceCurveState(position, valuationModel) {
  const currentPrice = Number(position.currentPrice || 0);
  const averageCost = Number(position.averageCost || 0);
  const valuationZone = detectValuationZone(valuationModel);
  const multiple = averageCost > 0 ? currentPrice / averageCost : 1;

  if (valuationZone === "aggressive" && multiple >= 2) {
    return {
      key: "vertical_markup",
      label: "高位加速段",
      description: "价格已经远离成本并进入高估值区域，更容易触发情绪化追高或冲顶回落。"
    };
  }

  if ((valuationZone === "base" || valuationZone === "between_base_and_aggressive") && multiple >= 1.3) {
    return {
      key: "extended_uptrend",
      label: "上涨延伸段",
      description: "价格仍在上行，但已经明显脱离舒适加仓区，更适合审视估值和仓位。"
    };
  }

  if ((valuationZone === "below_conservative" || valuationZone === "conservative") && multiple <= 0.9) {
    return {
      key: "pullback_zone",
      label: "回撤观察段",
      description: "价格处于回撤或压缩阶段，更适合结合 thesis 判断是否值得继续观察或小幅加仓。"
    };
  }

  return {
    key: "range_or_transition",
    label: "震荡过渡段",
    description: "价格没有进入明显单边阶段，建议更多参考估值位置和事件变化。"
  };
}

function latestEventSummary(latestEvent) {
  if (!latestEvent) {
    return "暂无新的事件触发";
  }
  return latestEvent.reviewTrigger
    ? `${latestEvent.title}，并已触发复盘`
    : `${latestEvent.title}，目前仍以观察为主`;
}

function buildAdviceEnvelope({
  finalRecommendation,
  suggestedAction,
  reasons,
  risks,
  whatChangesAdvice,
  nextReminder,
  portfolioContextComplete,
  priceCurveState,
  valuationZone,
  extra = {}
}) {
  return {
    finalRecommendation,
    suggestedAction,
    reasons,
    coreReasons: reasons,
    keyRisks: risks,
    whatChangesAdvice,
    nextReminder,
    portfolioContextComplete,
    priceCurveState,
    valuationZone,
    structuredAdvice: {
      headline: finalRecommendation,
      action: suggestedAction,
      rationale: reasons,
      risks,
      whatChangesAdvice,
      nextReminder
    },
    ...extra
  };
}

export function buildAddRecommendation({
  asset,
  position,
  valuationModel,
  plan,
  totalPortfolioValue,
  researchReport,
  latestEvent,
  researchContext
}) {
  const portfolioPct = currentPortfolioPct(position, totalPortfolioValue);
  const maxAllocation = maxAllocationFor(position, asset);
  const remainingRoom = Math.max(0, maxAllocation - portfolioPct);
  const valuationZone = detectValuationZone(valuationModel);
  const priceCurveState = detectPriceCurveState(position, valuationModel);
  const portfolioContextComplete = Boolean(
    totalPortfolioValue > 0 || position.portfolioContextComplete
  );
  const sectorExposurePct = Number(position.sectorExposurePct || 0);
  const thesis = researchReport?.thesis || [];
  const risks = (researchReport?.risks || []).slice(0, 3);
  const researchSignals = researchContext?.extractedSignals || {};
  const researchBlocked = researchContext?.readiness === "blocked";
  const comparablesDraft = researchReport?.comparablesDraft || null;
  const listingPathDraft = researchReport?.listingPathDraft || null;
  const fundingUnlockDraft = researchReport?.fundingUnlockDraft || null;
  const reasons = [
    `当前仓位约占组合 ${(portfolioPct * 100).toFixed(1)}%`,
    `当前估值区域为 ${valuationZone}`,
    `当前价格状态为 ${priceCurveState.label}`,
    `该资产风险等级为 ${asset.riskClass}`
  ];

  let finalRecommendation = "不建议加仓";
  let suggestedMaxAddPct = 0;
  let suggestedAction = "暂不加仓";
  const whatChangesAdvice = [];

  if (researchBlocked) {
    finalRecommendation = "先补基础研究，不建议现在直接加仓";
    reasons.push(`研究状态为 ${researchContext.readinessLabel}`);
    reasons.push(`当前缺少：${researchContext.missingBasics.join("、")}`);
    suggestedAction = "先补项目基础信息，再重新评估";
    whatChangesAdvice.push(...(researchContext.nextSteps || []));
  } else if (plan.status !== "active") {
    finalRecommendation = "当前计划还未确认，先确认计划，再决定是否加仓";
    reasons.push("计划状态为 draft，监控和加仓边界尚未最终确认");
    suggestedAction = "先确认计划";
    whatChangesAdvice.push("用户确认 draft 计划并进入 active 状态");
  } else if (plan.status === "needs_review") {
    finalRecommendation = "当前计划需要复盘，先不要直接加仓";
    reasons.push("最近事件已触发 needs_review，应该先复盘 thesis 和事件影响");
    suggestedAction = "先复盘，不直接加仓";
    whatChangesAdvice.push("完成本轮复盘并确认 thesis 没有被削弱");
  } else if (valuationZone === "below_conservative") {
    finalRecommendation = "可以小幅加仓";
    suggestedMaxAddPct = Number((Math.min(remainingRoom, maxAllocation * 0.5) * 100).toFixed(2));
    reasons.push("当前估值低于保守区间，有更好的风险回报比");
    suggestedAction = suggestedMaxAddPct > 0 ? `建议加仓不超过总组合 ${suggestedMaxAddPct}%` : "可以观察但暂不扩大仓位";
    whatChangesAdvice.push("价格重新回到基准估值以上时，不再适合主动追加");
  } else if (valuationZone === "conservative") {
    finalRecommendation = "可以加一点，但不要追太大";
    suggestedMaxAddPct = Number((Math.min(remainingRoom, maxAllocation * 0.35) * 100).toFixed(2));
    reasons.push("当前估值位于保守区间，适合小幅加仓");
    suggestedAction = suggestedMaxAddPct > 0 ? `建议加仓不超过总组合 ${suggestedMaxAddPct}%` : "暂不加仓";
    whatChangesAdvice.push("如果后续出现更强确定性利好，可重新评估加仓上限");
  } else if (valuationZone === "base") {
    finalRecommendation = "可以非常小幅加仓，但优先等待更好的位置";
    suggestedMaxAddPct = Number((Math.min(remainingRoom, maxAllocation * 0.15) * 100).toFixed(2));
    reasons.push("当前估值已进入基准区间，不适合大额追高");
    suggestedAction = suggestedMaxAddPct > 0 ? `若要加仓，最好控制在总组合 ${suggestedMaxAddPct}% 以内` : "等待更好的位置";
    whatChangesAdvice.push("回撤到保守估值区间，或 thesis 明显增强时再考虑加仓");
  } else {
    finalRecommendation = "不建议继续加仓";
    reasons.push("当前估值已经偏高，应优先保护收益和等待确认");
    suggestedAction = "暂不加仓";
    whatChangesAdvice.push("只有在估值回落或出现新的强 catalyst 时才重新讨论");
  }

  if (portfolioPct >= maxAllocation) {
    if (!researchBlocked) {
      finalRecommendation = "不建议加仓";
      suggestedAction = "仓位已接近上限，暂不加仓";
    }
    suggestedMaxAddPct = 0;
    reasons.push(`当前仓位已接近或超过该风险等级建议上限 ${(maxAllocation * 100).toFixed(1)}%`);
  }

  if (sectorExposurePct >= DEFAULT_SETTINGS.sectorExposureWarning) {
    if (!researchBlocked) {
      finalRecommendation = "不建议继续加仓";
      suggestedAction = "控制同赛道暴露，暂不加仓";
    }
    suggestedMaxAddPct = 0;
    reasons.push(`同赛道暴露约为 ${formatPct(sectorExposurePct)}，已经偏高`);
    whatChangesAdvice.push("同赛道暴露下降，或该资产 thesis 明显强于同赛道其他仓位");
  }

  if (!portfolioContextComplete) {
    reasons.push("当前缺少完整组合规模，建议仅把这次判断当作单资产视角参考");
    whatChangesAdvice.push("补充总组合规模后，可得到更可靠的加仓上限");
  }

  const currentFdv = Number(valuationModel?.currentMetrics?.fdv || 0);
  const currentMarketCap = Number(valuationModel?.currentMetrics?.marketCap || 0);
  if (currentFdv > 0) {
    reasons.push(`当前 FDV 约为 ${formatCompactUsd(currentFdv)}`);
  }
  if (currentMarketCap > 0 && currentMarketCap !== currentFdv) {
    reasons.push(`当前市值约为 ${formatCompactUsd(currentMarketCap)}`);
  }

  if (researchContext?.readiness === "thin") {
    reasons.push(`研究状态为 ${researchContext.readinessLabel}`);
    reasons.push(`仍待补充：${researchContext.missingBasics.join("、")}`);
    whatChangesAdvice.push(...(researchContext.nextSteps || []).slice(0, 2));
    if (suggestedMaxAddPct > 0) {
      suggestedMaxAddPct = Number(Math.min(suggestedMaxAddPct, 1).toFixed(2));
      suggestedAction = `如坚持要加，先控制在总组合 ${suggestedMaxAddPct}% 以内`;
      if (!/谨慎|不要追/.test(finalRecommendation)) {
        finalRecommendation = "可以观察或极小幅试仓，但先把研究补全更重要";
      }
    }
  }

  if (comparablesDraft?.status && comparablesDraft.status !== "ready") {
    reasons.push(`对标估值状态：${comparablesDraft.summary}`);
  }
  if (listingPathDraft?.status && listingPathDraft.status !== "ready") {
    reasons.push(`上所路径状态：${listingPathDraft.summary}`);
  }
  if (fundingUnlockDraft?.status && fundingUnlockDraft.status !== "ready") {
    reasons.push(`融资/解锁状态：${fundingUnlockDraft.summary}`);
  }

  if (thesis[0]) {
    reasons.push(`当前主要 thesis：${thesis[0]}`);
  }
  if (researchSignals.coreThesis?.[0]) {
    reasons.push(`补充 thesis 线索：${researchSignals.coreThesis[0]}`);
  }
  if (researchSignals.valuationAnchors?.[0]) {
    reasons.push(`估值锚点线索：${researchSignals.valuationAnchors[0]}`);
  }
  if (researchSignals.marketFacts?.[0]) {
    reasons.push(`市场事实：${researchSignals.marketFacts[0]}`);
  }
  if (researchSignals.exchangeSignals?.[0]) {
    reasons.push(`上所/分发线索：${researchSignals.exchangeSignals[0]}`);
  }
  if (researchSignals.liquiditySignals?.[0]) {
    reasons.push(`流动性线索：${researchSignals.liquiditySignals[0]}`);
  }

  reasons.push(`最近事件状态：${latestEventSummary(latestEvent)}`);

  const nextReminder =
    plan.nextReviewAt || "等待价格回到更低估值区间，或等待新的确定性 catalyst";

  return {
    ok: true,
    asset: asset.symbol,
    suggestedMaxAddPct,
    ...buildAdviceEnvelope({
      finalRecommendation,
      suggestedAction,
      reasons,
      risks,
      whatChangesAdvice,
      nextReminder,
      portfolioContextComplete,
      priceCurveState,
      valuationZone
    })
  };
}

export function buildSellRecommendation({
  asset,
  position,
  valuationModel,
  plan,
  requestedSellPct,
  researchReport,
  latestEvent,
  thesisInvalidated = false
}) {
  const valuationZone = detectValuationZone(valuationModel);
  const priceCurveState = detectPriceCurveState(position, valuationModel);
  const currentUnits = Number(position.units || 0);
  const floorUnits = Number(plan.floorRule.minimumUnits || 0);
  const proposedSellUnits = Number((currentUnits * (requestedSellPct / 100)).toFixed(4));
  const remainingUnits = Number((currentUnits - proposedSellUnits).toFixed(4));
  const floorViolation = remainingUnits < floorUnits;
  const averageCost = Number(position.averageCost || 0);
  const currentPrice = Number(position.currentPrice || 0);
  const unrealizedMultiple = averageCost > 0 ? currentPrice / averageCost : 1;
  const catalysts = researchReport?.catalysts || [];
  const risks = (researchReport?.risks || []).slice(0, 3);
  const comparablesDraft = researchReport?.comparablesDraft || null;
  const fundingUnlockDraft = researchReport?.fundingUnlockDraft || null;
  const reasons = [
    `当前估值区域为 ${valuationZone}`,
    `当前价格状态为 ${priceCurveState.label}`,
    `卖出后剩余 ${remainingUnits}，底仓要求至少 ${floorUnits}`
  ];
  const currentFdv = Number(valuationModel?.currentMetrics?.fdv || 0);
  if (currentFdv > 0) {
    reasons.push(`当前 FDV 约为 ${formatCompactUsd(currentFdv)}`);
  }

  let suggestedSellPctRange = [0, 0];
  let finalRecommendation = "暂缓卖出";
  let suggestedAction = "暂缓卖出";
  const whatChangesAdvice = [];

  if (thesisInvalidated) {
    finalRecommendation = "原始 thesis 已失效，可以更积极地减仓或退出";
    suggestedSellPctRange = [50, 100];
    suggestedAction = "优先根据流动性分批退出";
    reasons.push("你已经明确指出 thesis 失效，风险管理优先级高于估值等待");
    whatChangesAdvice.push("如果 thesis 被重新验证成立，才重新考虑保留更高底仓");
  } else if (plan.status !== "active") {
    finalRecommendation = "当前计划还未确认，先确认计划后再决定是否大幅卖出";
    reasons.push("计划状态为 draft");
    suggestedAction = "先确认计划";
    whatChangesAdvice.push("先把计划确认成 active，再按计划卖出");
  } else if (plan.status === "needs_review") {
    finalRecommendation = "当前计划需要复盘，建议先做事件复核，再决定是否大幅卖出";
    suggestedSellPctRange = [10, 30];
    suggestedAction = "先复盘，必要时小幅减仓";
    reasons.push("最近事件已经触发 needs_review，应该先核实利空或利好是否改变 thesis");
    whatChangesAdvice.push("复盘确认事件影响后，再决定是否扩大卖出比例");
  } else if (valuationZone === "base") {
    finalRecommendation = "建议部分止盈，不建议一次性清仓";
    suggestedSellPctRange = [20, 30];
    reasons.push("当前已进入基准估值区间，部分卖出合理");
    suggestedAction = "建议先卖出 20%-30%";
    whatChangesAdvice.push("如果后续进入更高估值区间，可继续分批止盈");
  } else if (valuationZone === "aggressive" || valuationZone === "between_base_and_aggressive") {
    finalRecommendation = "建议分批卖出，优先保护收益";
    suggestedSellPctRange = [30, 50];
    reasons.push("当前估值明显偏高，适合更积极地分批卖出");
    suggestedAction = "建议先卖出 30%-50%";
    whatChangesAdvice.push("如果重大利好仍未兑现，可保留底仓继续等待");
  } else if (valuationZone === "below_conservative") {
    finalRecommendation = "不建议情绪化卖出，除非 thesis 已失效";
    suggestedSellPctRange = [0, 10];
    reasons.push("当前仍处于偏低估值区域，卖出更像 panic sell");
    suggestedAction = "如无 thesis 失效，暂不大幅卖出";
    whatChangesAdvice.push("除非 thesis 被破坏，否则等待更好估值或事件确认");
  } else {
    finalRecommendation = "可以小幅减仓，但不建议大额卖出";
    suggestedSellPctRange = [10, 20];
    reasons.push("当前尚未到强卖出区，更适合观察和轻仓处理");
    suggestedAction = "建议先卖出 10%-20%";
    whatChangesAdvice.push("进入基准估值区间或出现重大利好兑现后，再提高卖出比例");
  }

  if (floorViolation) {
    finalRecommendation = "不建议一次性卖出这么多，至少保留底仓";
    reasons.push("当前卖出请求会违反历史最高持仓底仓规则");
    suggestedSellPctRange = [Math.max(0, suggestedSellPctRange[0] - 10), Math.max(10, suggestedSellPctRange[1] - 10)];
    suggestedAction = `建议把卖出控制在 ${suggestedSellPctRange[0]}%-${suggestedSellPctRange[1]}%`;
    whatChangesAdvice.push("只有在 thesis 明确失效时，才考虑打破底仓规则");
  }

  if (unrealizedMultiple >= 2 && !thesisInvalidated) {
    reasons.push(`当前约为 ${unrealizedMultiple.toFixed(2)}x，已接近或达到回本金讨论区间`);
  }
  if (comparablesDraft?.status && comparablesDraft.status !== "ready") {
    reasons.push(`对标估值仍未完全补齐：${comparablesDraft.summary}`);
  }
  if (fundingUnlockDraft?.status && fundingUnlockDraft.status !== "ready") {
    reasons.push(`融资/解锁仍需补充：${fundingUnlockDraft.summary}`);
  }

  if (catalysts[0]) {
    reasons.push(`当前仍需观察的 catalyst：${catalysts[0]}`);
  }

  reasons.push(`最近事件状态：${latestEventSummary(latestEvent)}`);

  const nextReminder =
    latestEvent?.reviewTrigger
      ? "先完成本轮事件复盘，再判断是否继续卖出"
      : "等待下一次关键事件、估值区间变化或时间复盘节点";

  return {
    ok: true,
    asset: asset.symbol,
    requestedSellPct,
    suggestedSellPctRange,
    floorViolation,
    unrealizedMultiple: Number(unrealizedMultiple.toFixed(2)),
    ...buildAdviceEnvelope({
      finalRecommendation,
      suggestedAction,
      reasons,
      risks,
      whatChangesAdvice,
      nextReminder,
      portfolioContextComplete: true,
      priceCurveState,
      valuationZone
    })
  };
}
