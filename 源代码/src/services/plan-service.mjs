import { entityId, stableId } from "../utils/ids.mjs";
import { addDays, nowIso } from "../utils/time.mjs";

function formatCompactNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) {
    return "暂无";
  }

  if (number >= 1_0000_0000_0000) {
    return `${(number / 1_0000_0000_0000).toFixed(number >= 10_0000_0000_0000 ? 0 : 1)}万亿`;
  }
  if (number >= 1_0000_0000) {
    return `${(number / 1_0000_0000).toFixed(number >= 1000_0000_0000 ? 0 : 1)}亿`;
  }
  if (number >= 1_0000) {
    return `${(number / 1_0000).toFixed(number >= 100_0000 ? 0 : 1)}万`;
  }
  return number.toLocaleString("zh-CN");
}

function formatRange(range) {
  if (!Array.isArray(range) || range.length !== 2) {
    return "暂无";
  }
  return `${formatCompactNumber(range[0])} - ${formatCompactNumber(range[1])}`;
}

function parseTargets(planText) {
  const targets = [];
  const normalized = String(planText || "");
  const multipleRegex = /(\d+(?:\.\d+)?)x[^0-9]*(?:卖|sell)[^0-9]*(\d+)%/gi;
  const principalRegex = /(\d+(?:\.\d+)?)x[^。；;\n]*(回本金|recover principal)/i;

  const principalMatch = normalized.match(principalRegex);
  if (principalMatch) {
    targets.push({
      id: entityId("target"),
      type: "principal_recovery",
      multiple: Number(principalMatch[1])
    });
  }

  for (const match of normalized.matchAll(multipleRegex)) {
    targets.push({
      id: entityId("target"),
      type: "sell_pct",
      multiple: Number(match[1]),
      sellPct: Number(match[2])
    });
  }

  return targets;
}

function parseFloorRatio(planText, asset) {
  const normalized = String(planText || "");
  const match = normalized.match(/(?:保留|底仓|floor)[^0-9]*(\d+)%/i);
  if (match) {
    return Number(match[1]) / 100;
  }

  if (asset.assetType === "major_crypto") {
    return 0.2;
  }
  if (asset.assetType === "unclassified_asset") {
    return 0.25;
  }
  if (asset.assetType === "onchain_token") {
    return 0.1;
  }
  return 0.15;
}

export function buildDraftPlan(asset, position, valuationModel, naturalLanguagePlan, existingPlan) {
  const targets = parseTargets(naturalLanguagePlan);
  const floorRatio = parseFloorRatio(naturalLanguagePlan, asset);
  const conservative = valuationModel.scenarios.find((item) => item.name === "conservative");
  const base = valuationModel.scenarios.find((item) => item.name === "base");
  const aggressive = valuationModel.scenarios.find((item) => item.name === "aggressive");

  const plan = existingPlan || {
    id: stableId("plan", { assetId: asset.id, floorRatio, naturalLanguagePlan }),
    assetId: asset.id,
    assetSymbol: asset.symbol,
    createdAt: nowIso()
  };

  return {
    ...plan,
    status: existingPlan?.status || "draft",
    rawInstruction: naturalLanguagePlan || "系统基于估值模型生成默认计划",
    valuationId: valuationModel.id,
    floorRule: {
      basis: "peak_units",
      ratio: floorRatio,
      minimumUnits: Number((position.peakUnits * floorRatio).toFixed(4))
    },
    addZone: conservative
      ? `当 FDV 低于 ${formatCompactNumber(conservative.targetFdvRange[0])} 且 thesis 未失效时，可小幅补仓`
      : "等待更便宜的保守估值区域",
    holdZone: base
      ? `当估值位于 ${formatCompactNumber(conservative?.targetFdvRange[1])} 到 ${formatCompactNumber(base.targetFdvRange[1])} 之间时持有观察`
      : "按原 thesis 持有观察",
    sellZone: base
      ? `当 FDV 进入 ${formatRange(base.targetFdvRange)} 时，考虑回本金或卖出 20%-30%`
      : "达到阶段性目标时分批卖出",
    aggressiveZone: aggressive
      ? `当 FDV 进入 ${formatRange(aggressive.targetFdvRange)} 时，优先分批卖出`
      : "估值明显高于同类项目时优先分批卖出",
    targets,
    reviewRules: [
      "每天最多更新一次新闻和仓位监测",
      "重大利好利空出现时进入 needs_review",
      "90 天 thesis 没有进展时强制复盘"
    ],
    monitoringPolicy: {
      newsHours: 24,
      positionHours: 24
    },
    nextReviewAt: addDays(nowIso(), 30),
    updatedAt: nowIso()
  };
}
