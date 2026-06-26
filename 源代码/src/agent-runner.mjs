import { getAdapters } from "./adapters/index.mjs";
import { BITGET_SKILLS } from "./adapters/bitget-adapter.mjs";
import { resolveAssetIdentity } from "./services/asset-service.mjs";
import {
  evaluateCandidate,
  lookupPortfolioMemoryApi,
  refreshResearch,
} from "./services/api-service.mjs";
import { getAssetInfo } from "./services/asset-info-service.mjs";
import { createTraceCollector, setCurrentCollector, clearCurrentCollector } from "./trace-collector.mjs";

const BITGET_ROLE_MAP = Object.fromEntries(
  BITGET_SKILLS.map((s) => [s.key, s])
);

const ROLE_TO_BITGET_KEY = {
  macro: "macro",
  onchain: "marketIntel",
  sentiment: "sentiment",
  technical: "technical",
  news: "news",
};

function headlineFromMemory(result) {
  const p = result.portfolioMemoryProfile || {};
  const assetLabel = result.asset?.symbol || result.asset || null;
  return [
    p.suggestedIntentClass ? `意图: ${p.suggestedIntentClass}` : null,
    assetLabel ? `资产: ${assetLabel}` : null,
  ]
    .filter(Boolean)
    .join("，") || "记忆查询完成";
}

function headlineFromBitget(result, skillKey) {
  const skill = BITGET_ROLE_MAP[skillKey];
  if (!result.ok) return `${skill?.title || skillKey}: 数据源未连接`;
  const sources = result.sources || [];
  const relevant = sources.filter((s) => s.skill === skill?.skill);
  if (relevant.length === 0) {
    const anyClaim = sources.find((s) => s.results?.length) || sources[0];
    if (anyClaim?.results?.length) {
      const first = anyClaim.results[0];
      return `${skill?.title || skillKey}: ${(first.keyClaim || "").slice(0, 120)}`;
    }
    return `${skill?.title || skillKey}: 数据已获取`;
  }
  const claims = relevant.flatMap((s) => (s.results || []).map((r) => r.keyClaim));
  return `${skill?.title || skillKey}: ${(claims[0] || "数据已获取").slice(0, 120)}`;
}

function headlineFromValuation(result) {
  const zone = result.decisionLicense?.valuationZone || result.valuationModel?.zone;
  const label = result.decisionLicense?.label || "估值完成";
  return zone ? `估值区间: ${zone} — ${label}` : label;
}

export async function runAgent(role, assetQuery) {
  const startedAt = Date.now();

  if (role === "memory") {
    const result = await lookupPortfolioMemoryApi({ assetQuery });
    return {
      role: "memory",
      status: "ok",
      headline: headlineFromMemory(result),
      data: {
        portfolioMemoryProfile: result.portfolioMemoryProfile,
        asset: result.asset,
      },
      tookMs: Date.now() - startedAt,
    };
  }

  if (role === "valuation") {
    const result = await evaluateCandidate({ assetQuery });
    return {
      role: "valuation",
      status: "ok",
      headline: headlineFromValuation(result),
      data: {
        decisionLicense: result.decisionLicense,
        valuationModel: result.valuationModel,
        investmentMemo: result.investmentMemo,
      },
      tookMs: Date.now() - startedAt,
    };
  }

  if (role === "asset_info") {
    try {
      const info = await getAssetInfo(assetQuery);
      const metrics = info.currentMetrics;
      const priceStr = metrics.price != null ? `$${metrics.price}` : "暂无";
      const mcapStr = metrics.marketCap != null
        ? `$${(metrics.marketCap / 1e9).toFixed(1)}B`
        : "暂无";
      const fdvStr = metrics.fdv != null
        ? `$${(metrics.fdv / 1e9).toFixed(1)}B`
        : "暂无";
      const status = info.mcpOk ? "ok" : "degraded";

      return {
        role: "asset_info",
        status,
        headline: info.mcpOk
          ? `${info.name || info.symbol}: 价格${priceStr} 市值${mcapStr} FDV ${fdvStr}`
          : `${info.name || info.symbol}: 暂无法获取实时数据`,
        data: {
          symbol: info.symbol,
          name: info.name,
          assetType: info.assetType,
          chain: info.chain,
          currentMetrics: metrics,
          listedExchanges: info.listedExchanges,
          mcpOk: info.mcpOk,
          error: info.error,
          cached: info.cached,
        },
        _trace: info.trace || [],
        tookMs: info.tookMs,
      };
    } catch (err) {
      return {
        role: "asset_info",
        status: "error",
        headline: `asset_info: 执行失败 — ${err.message}`,
        data: {
          currentMetrics: { price: null, marketCap: null, fdv: null },
          sources: [],
        },
        tookMs: Date.now() - startedAt,
      };
    }
  }

  const bitgetKey = ROLE_TO_BITGET_KEY[role];
  if (bitgetKey) {
    try {
      const result = await refreshResearch({ assetQuery });
      const skill = BITGET_ROLE_MAP[bitgetKey];
      const relevantSources = (result.createdSources || []).filter(
        (s) => s.author && s.author.includes(skill?.skill || bitgetKey)
      );

      const allSourcesOk = result.bitget?.ok;
      return {
        role,
        status: allSourcesOk ? "ok" : "degraded",
        headline: allSourcesOk
          ? `${skill?.title || role}: 数据已刷新 (${relevantSources.length} 条来源)`
          : `${skill?.title || role}: 数据源未连接`,
        data: {
          bitgetStatus: result.bitget,
          sources: relevantSources,
        },
        tookMs: Date.now() - startedAt,
      };
    } catch (err) {
      return {
        role,
        status: "error",
        headline: `${role}: 执行失败 — ${err.message}`,
        data: {},
        tookMs: Date.now() - startedAt,
      };
    }
  }

  return {
    role,
    status: "error",
    headline: `Unknown agent role: ${role}`,
    data: {},
    tookMs: Date.now() - startedAt,
  };
}

export async function runFanoutAgents(fanout, assetQuery, context = {}) {
  if (!fanout.length) return { agentResults: [], trace: [] };
  const focusedAsset = assetQuery || context.lastAsset;

  const allTraces = [];

  const results = await Promise.allSettled(
    fanout.map(async (role) => {
      const tc = createTraceCollector(role);
      setCurrentCollector(tc);
      try {
        const result = await runAgent(role, focusedAsset || assetQuery);
        allTraces.push(...tc.drain());
        // Merge cached trace entries from agent (e.g. asset_info cache hit);
        // skip non-cached to avoid doubling entries already captured by tc.drain()
        if (result._trace && result._trace.length) {
          for (const t of result._trace) {
            if (t.cached) allTraces.push(t);
          }
        }
        return result;
      } finally {
        clearCurrentCollector();
      }
    })
  );

  const agentResults = results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { role: "unknown", status: "error", headline: String(r.reason), data: {}, tookMs: 0 }
  );

  return { agentResults, trace: allTraces };
}
