function uniq(items) {
  return Array.from(new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)));
}

function isMockSource(source) {
  const sourceType = String(source?.sourceType || "").toLowerCase();
  const roleInDecision = String(source?.roleInDecision || "").toLowerCase();
  return (
    sourceType.includes("mock") ||
    sourceType.includes("not_connected") ||
    sourceType.includes("not_configured") ||
    sourceType.includes("unavailable") ||
    roleInDecision === "research_seed"
  );
}

function sourceFingerprint(source) {
  return [
    source?.id || "",
    source?.sourceType || "",
    source?.roleInDecision || "",
    source?.title || "",
    source?.keyClaim || ""
  ].join("|");
}

function sourceSignal(source) {
  return String(source?.keyClaim || source?.title || "").trim();
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function textHasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function isPlaceholderText(value) {
  const text = normalizeText(value);
  if (!text) {
    return true;
  }

  return textHasAny(text, [
    /fallback research profile/,
    /should be enriched by bitget or surf adapters/,
    /需要补充真实项目研究/,
    /等待用户补充项目背景/,
    /等待外部研究适配器接入/,
    /^待补充$/,
    /^unknown$/,
    /^暂无$/
  ]);
}

function readReportArray(items) {
  return Array.isArray(items) ? items.filter((item) => !isPlaceholderText(item)) : [];
}

function pushIfMatch(bucket, source, shouldInclude) {
  if (!shouldInclude) {
    return;
  }

  const signal = sourceSignal(source);
  if (signal && !isPlaceholderText(signal)) {
    bucket.push(signal);
  }
}

function extractSignalsFromSources(sources) {
  const extracted = {
    coreThesis: [],
    valuationAnchors: [],
    liquiditySignals: [],
    exchangeSignals: [],
    fundingSignals: [],
    riskSignals: [],
    marketFacts: []
  };

  for (const source of sources) {
    const role = normalizeText(source?.roleInDecision);
    const text = normalizeText(`${source?.title || ""} ${source?.keyClaim || ""}`);

    pushIfMatch(
      extracted.coreThesis,
      source,
      textHasAny(role, [/core_thesis/, /thesis/, /project_profile/]) ||
        textHasAny(text, [/thesis/, /叙事/, /赛道/, /定位/, /产品/, /采用/, /增长/, /用户/, /生态/, /项目背景/])
    );
    pushIfMatch(
      extracted.valuationAnchors,
      source,
      textHasAny(role, [/valuation/, /comparable/, /anchor/]) ||
        textHasAny(text, [/估值/, /fdv/, /市值/, /market cap/, /对标/, /comparable/, /倍数/])
    );
    pushIfMatch(
      extracted.liquiditySignals,
      source,
      textHasAny(role, [/liquidity/, /market_structure/]) ||
        textHasAny(text, [/流动性/, /成交/, /volume/, /depth/, /做市/, /liquidity/, /滑点/, /承接/, /盘口/])
    );
    pushIfMatch(
      extracted.exchangeSignals,
      source,
      textHasAny(role, [/exchange/, /listing/, /catalyst/]) ||
        textHasAny(text, [/上所/, /交易所/, /binance/, /coinbase/, /bitget/, /bybit/, /okx/, /kucoin/, /kraken/, /listing/])
    );
    pushIfMatch(
      extracted.fundingSignals,
      source,
      textHasAny(role, [/funding/, /unlock/, /tokenomics/]) ||
        textHasAny(text, [/融资/, /backer/, /investor/, /funding/, /unlock/, /vesting/, /tokenomics/, /筹码/, /解锁/])
    );
    pushIfMatch(
      extracted.riskSignals,
      source,
      textHasAny(role, [/risk/, /warning/]) ||
        textHasAny(text, [/风险/, /risk/, /hack/, /监管/, /下架/, /解锁/, /抛压/, /砸盘/, /liquidity/])
    );
    pushIfMatch(
      extracted.marketFacts,
      source,
      textHasAny(role, [/supporting_evidence/, /market_structure/, /liquidity/, /exchange/]) ||
        textHasAny(text, [/price/, /rank/, /market cap/, /fdv/, /liquidity/, /volume/, /dex/, /链/, /chain/])
    );
  }

  return {
    coreThesis: uniq(extracted.coreThesis).slice(0, 3),
    valuationAnchors: uniq(extracted.valuationAnchors).slice(0, 3),
    liquiditySignals: uniq(extracted.liquiditySignals).slice(0, 3),
    exchangeSignals: uniq(extracted.exchangeSignals).slice(0, 3),
    fundingSignals: uniq(extracted.fundingSignals).slice(0, 3),
    riskSignals: uniq(extracted.riskSignals).slice(0, 3),
    marketFacts: uniq(extracted.marketFacts).slice(0, 3)
  };
}

function buildNextSteps(missingBasics) {
  const suggestions = {
    "资产类型/链/合约或交易对": "先确认它到底是股票、CEX 代币还是链上代币，并补充链、合约或交易对信息",
    "项目基础 thesis / 赛道定位": "补一句这个项目到底做什么、为什么值得持有，以及 thesis 成立依赖什么",
    "对标项目或估值锚点": "补至少 1-2 个对标项目，或者给出一个你认可的 FDV / 市值锚点",
    "流动性 / 成交承接": "补充流动性、成交量、做市质量或大额卖出时的承接情况",
    "上所现状 / 潜在上所路径": "补充目前已上哪些所、理论上还有哪些所可能上，以及为什么",
    "融资背景 / 解锁与筹码": "补充融资背景、投资方、解锁节奏和潜在抛压"
  };

  return missingBasics.map((item) => suggestions[item]).filter(Boolean);
}

export function researchReadinessLabel(readiness) {
  const labels = {
    blocked: "研究未完成",
    thin: "研究偏薄",
    usable: "研究可用"
  };
  return labels[readiness] || "未知";
}

export function buildResearchContext({ asset, researchReport, recentSources = [] }) {
  const sourceMap = new Map();
  for (const source of [...(recentSources || []), ...(researchReport?.sources || [])]) {
    if (!source) {
      continue;
    }
    sourceMap.set(sourceFingerprint(source), source);
  }

  const allSources = Array.from(sourceMap.values());
  const mockSources = allSources.filter(isMockSource);
  const manualSources = allSources.filter((source) => !isMockSource(source));
  const extractedSignals = extractSignalsFromSources(manualSources);
  const reportThesis = readReportArray(researchReport?.thesis);
  const reportComparables = Array.isArray(researchReport?.comparables) ? researchReport.comparables : [];

  const usesFallbackProfile =
    isPlaceholderText(researchReport?.summary) ||
    reportComparables.length === 0 &&
      textHasAny(normalizeText(researchReport?.summary), [/fallback research profile/, /should be enriched by bitget or surf adapters/]);

  const assetIdentityReady = !(
    asset?.assetType === "unclassified_asset" &&
    !asset?.chain &&
    !asset?.contractAddress
  );
  const thesisReady = (reportThesis.length > 0 && !usesFallbackProfile) || extractedSignals.coreThesis.length > 0;
  const valuationReady = reportComparables.length > 0 || extractedSignals.valuationAnchors.length > 0;
  const liquidityReady =
    !isPlaceholderText(researchReport?.liquidityNote) || extractedSignals.liquiditySignals.length > 0;
  const exchangeReady =
    (Array.isArray(researchReport?.listedExchanges) && researchReport.listedExchanges.length > 0) ||
    (Array.isArray(researchReport?.potentialExchanges) && researchReport.potentialExchanges.length > 0) ||
    !isPlaceholderText(researchReport?.exchangePathHypothesis) ||
    extractedSignals.exchangeSignals.length > 0;
  const fundingReady =
    !isPlaceholderText(researchReport?.funding) || extractedSignals.fundingSignals.length > 0;

  const missingBasics = [];
  if (!assetIdentityReady) {
    missingBasics.push("资产类型/链/合约或交易对");
  }
  if (!thesisReady) {
    missingBasics.push("项目基础 thesis / 赛道定位");
  }
  if (!valuationReady) {
    missingBasics.push("对标项目或估值锚点");
  }
  if (!liquidityReady) {
    missingBasics.push("流动性 / 成交承接");
  }
  if (!exchangeReady) {
    missingBasics.push("上所现状 / 潜在上所路径");
  }
  if (!fundingReady) {
    missingBasics.push("融资背景 / 解锁与筹码");
  }

  const coveredManualCategories = [
    extractedSignals.coreThesis.length > 0,
    extractedSignals.valuationAnchors.length > 0,
    extractedSignals.liquiditySignals.length > 0,
    extractedSignals.exchangeSignals.length > 0,
    extractedSignals.fundingSignals.length > 0
  ].filter(Boolean).length;

  let readiness = "usable";
  if ((usesFallbackProfile && manualSources.length === 0) || (missingBasics.length >= 4 && manualSources.length === 0)) {
    readiness = "blocked";
  } else if (missingBasics.length >= 2 || !valuationReady || coveredManualCategories < 2 || usesFallbackProfile) {
    readiness = "thin";
  }

  const summary =
    readiness === "blocked"
      ? "当前仍是 mock/fallback 研究，基础信息不足，不能直接据此做加仓判断。"
      : readiness === "thin"
        ? "已补充部分研究，但关键信息还不够完整，更适合先补信息再讨论仓位动作。"
        : "基础 thesis、估值锚点和关键交易结构信息已基本具备，可作为仓位讨论输入。";

  return {
    readiness,
    readinessLabel: researchReadinessLabel(readiness),
    summary,
    usesFallbackProfile,
    missingBasics,
    nextSteps: buildNextSteps(missingBasics),
    sourceBreakdown: {
      totalSources: allSources.length,
      mockSources: mockSources.length,
      manualSources: manualSources.length,
      manualCategoryCoverage: coveredManualCategories
    },
    extractedSignals
  };
}
