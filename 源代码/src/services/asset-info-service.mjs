import { getAdapters } from "../adapters/index.mjs";
import { resolveAssetFromQuery } from "./asset-service.mjs";
import { getCurrentCollector } from "../trace-collector.mjs";

const CACHE_TTL_MS = 60_000;
const CACHEABLE_SYMBOLS = new Set(["BTC", "ETH", "SOL"]);

const cache = new Map();

function getCached(symbol) {
  const key = symbol.toUpperCase();
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache(symbol, data) {
  const key = symbol.toUpperCase();
  if (CACHEABLE_SYMBOLS.has(key)) {
    cache.set(key, { data, ts: Date.now() });
  }
}

function formatCompactUsd(value) {
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

export async function getAssetInfo(assetQuery) {
  const startedAt = Date.now();
  const symbol = String(assetQuery || "").toUpperCase();

  const cached = getCached(symbol);
  if (cached) {
    return {
      ...cached,
      cached: true,
      trace: (cached._trace || []).map((t) => ({ ...t, cached: true })),
    };
  }

  const adapters = getAdapters();
  const tc = getCurrentCollector();
  let enrichment = null;
  let mcpOk = false;

  try {
    const asset = resolveAssetFromQuery(symbol, {});
    enrichment = await adapters.bitget.enrichAsset(asset, tc);
    mcpOk = enrichment?.ok === true;
  } catch (err) {
    enrichment = {
      ok: false,
      error: err.message,
      currentMetrics: { marketCap: null, fdv: null, price: null },
      listedExchanges: [],
      sources: [],
    };
  }

  const currentMetrics = enrichment?.currentMetrics || {};
  const price = currentMetrics.price ?? null;
  const marketCap = currentMetrics.marketCap ?? null;
  const fdv = currentMetrics.fdv ?? null;

  // Snapshot trace collector (don't drain — runFanoutAgents owns drain)
  const traceSnapshot = tc ? tc.snapshot() : [];

  const result = {
    symbol,
    name: enrichment?.identity?.name || symbol,
    assetType: enrichment?.identity?.assetType || "unclassified_asset",
    chain: enrichment?.identity?.chain || null,
    currentMetrics: { price, marketCap, fdv },
    listedExchanges: enrichment?.listedExchanges || [],
    mcpOk,
    error: enrichment?.error || null,
    _trace: traceSnapshot,
    cached: false,
    tookMs: Date.now() - startedAt,
  };

  setCache(symbol, result);

  return { ...result, trace: traceSnapshot };
}
