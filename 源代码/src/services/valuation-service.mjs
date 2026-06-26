import { entityId, stableId } from "../utils/ids.mjs";
import { nowIso } from "../utils/time.mjs";

function metricValue(comparable, key) {
  return Number(comparable[key] || 0);
}

function summarizeRange(values, fallbackBase, multipliers) {
  const filtered = values.filter((value) => Number.isFinite(value) && value > 0);
  if (filtered.length === 0) {
    return [
      Math.round(fallbackBase * multipliers[0]),
      Math.round(fallbackBase * multipliers[1])
    ];
  }
  return [Math.min(...filtered), Math.max(...filtered)];
}

function inferRanges(researchReport, currentMetrics, asset) {
  const direct = researchReport.comparables.filter((item) => item.type === "direct_comparable");
  const leaders = researchReport.comparables.filter((item) => item.type === "category_leader");
  const upside = researchReport.comparables.filter((item) => item.type === "aspirational_comparable");
  const downside = researchReport.comparables.filter((item) => item.type === "downside_comparable");
  const fdvBase = currentMetrics.fdv || currentMetrics.marketCap || 100000000;
  const mcapBase = currentMetrics.marketCap || fdvBase;

  const conservativeFdv = summarizeRange(
    [...direct, ...downside].map((item) => metricValue(item, "fdv")),
    fdvBase,
    [0.8, 1.2]
  );
  const baseFdv = summarizeRange(
    [...direct, ...leaders].map((item) => metricValue(item, "fdv")),
    fdvBase,
    [1.5, 2.5]
  );
  const aggressiveFdv = summarizeRange(
    [...leaders, ...upside].map((item) => metricValue(item, "fdv")),
    fdvBase,
    [3, 5]
  );

  const conservativeMcap = summarizeRange(
    [...direct, ...downside].map((item) => metricValue(item, "marketCap")),
    mcapBase,
    [0.8, 1.2]
  );
  const baseMcap = summarizeRange(
    [...direct, ...leaders].map((item) => metricValue(item, "marketCap")),
    mcapBase,
    [1.5, 2.5]
  );
  const aggressiveMcap = summarizeRange(
    [...leaders, ...upside].map((item) => metricValue(item, "marketCap")),
    mcapBase,
    [3, 5]
  );

  const currentPrice = Number(currentMetrics.currentPrice || 0);
  const impliedPrice = (range, baseMetric) => {
    if (!currentPrice || !baseMetric) {
      return null;
    }
    return range.map((value) => Number(((value / baseMetric) * currentPrice).toFixed(4)));
  };

  return {
    conservative: {
      targetMarketCapRange: conservativeMcap,
      targetFdvRange: conservativeFdv,
      impliedPriceRange: impliedPrice(conservativeFdv, fdvBase),
      requiredConditions: ["thesis 持续有效", "流动性不恶化"],
      planImplication: "只有在保守估值下沿附近，才考虑小幅补仓"
    },
    base: {
      targetMarketCapRange: baseMcap,
      targetFdvRange: baseFdv,
      impliedPriceRange: impliedPrice(baseFdv, fdvBase),
      requiredConditions: ["核心 catalyst 按预期兑现", "交易所流动性稳定或改善"],
      planImplication: "进入基准区间后，考虑回本金或卖出 20%-30%"
    },
    aggressive: {
      targetMarketCapRange: aggressiveMcap,
      targetFdvRange: aggressiveFdv,
      impliedPriceRange: impliedPrice(aggressiveFdv, fdvBase),
      requiredConditions: ["出现强 catalyst", "上所或采用明显提升", "市场风险偏好支持扩张"],
      planImplication: "进入乐观区间后，分批卖出，除非强证据继续增强"
    }
  };
}

export function buildValuationModel(asset, position, researchReport, existingModel) {
  const inferredFdvFromComparables = researchReport.comparables.length
    ? Math.min(
        ...researchReport.comparables
          .map((item) => Number(item.fdv || 0))
          .filter((value) => Number.isFinite(value) && value > 0)
      )
    : 0;
  const inferredMarketCapFromComparables = researchReport.comparables.length
    ? Math.min(
        ...researchReport.comparables
          .map((item) => Number(item.marketCap || 0))
          .filter((value) => Number.isFinite(value) && value > 0)
      )
    : 0;

  const currentMetrics = {
    currentPrice: Number(position.currentPrice || position.averageCost || 0),
    marketCap: Number(
      position.marketCap ||
        researchReport.currentMetrics?.marketCap ||
        inferredMarketCapFromComparables ||
        100000000
    ),
    fdv: Number(
      position.fdv ||
        researchReport.currentMetrics?.fdv ||
        inferredFdvFromComparables ||
        100000000
    ),
    liquidityUsd: Number(position.liquidityUsd || 0),
    dailyVolumeUsd: Number(position.dailyVolumeUsd || 0)
  };
  const ranges = inferRanges(researchReport, currentMetrics, asset);

  return {
    id: existingModel?.id || stableId("valuation", { assetId: asset.id, currentMetrics }),
    assetId: asset.id,
    assetSymbol: asset.symbol,
    comparables: researchReport.comparables,
    currentMetrics,
    scenarios: [
      {
        id: entityId("scenario"),
        name: "conservative",
        ...ranges.conservative
      },
      {
        id: entityId("scenario"),
        name: "base",
        ...ranges.base
      },
      {
        id: entityId("scenario"),
        name: "aggressive",
        ...ranges.aggressive
      }
    ],
    confidence: researchReport.comparables.length >= 2 ? 0.68 : 0.45,
    createdAt: existingModel?.createdAt || nowIso(),
    refreshedAt: nowIso()
  };
}

export function detectValuationZone(valuationModel) {
  const currentFdv = Number(valuationModel.currentMetrics.fdv || 0);
  const [cMin, cMax] = valuationModel.scenarios[0].targetFdvRange;
  const [bMin, bMax] = valuationModel.scenarios[1].targetFdvRange;
  const [aMin] = valuationModel.scenarios[2].targetFdvRange;

  if (currentFdv <= cMin) {
    return "below_conservative";
  }
  if (currentFdv <= cMax) {
    return "conservative";
  }
  if (currentFdv <= bMax) {
    return "base";
  }
  if (currentFdv >= aMin) {
    return "aggressive";
  }
  return "between_base_and_aggressive";
}
