import { chatCompletion, isRuleOnly } from "./llm-client.mjs";
import { store } from "./data-store.mjs";
import { detectValuationZone } from "./services/valuation-service.mjs";

const VALID_INTENTS = [
  "lookup_memory",
  "evaluate_candidate",
  "manage_position",
  "refresh_research",
  "confirm_plan",
  "review_add",
  "review_sell",
  "run_monitor",
  "log_source",
  "archive",
  "get_context",
  "smalltalk",
  "lookup_asset_info",
  "unknown",
];

const INTENT_FANOUT = {
  evaluate_candidate: ["memory", "macro", "onchain", "sentiment", "technical", "news", "valuation"],
  manage_position: ["memory", "valuation"],
  review_add: ["asset_info", "memory", "valuation", "sentiment", "technical"],
  review_sell: ["asset_info", "memory", "valuation", "sentiment", "technical"],
  refresh_research: ["macro", "onchain", "sentiment", "technical", "news"],
  lookup_memory: ["memory"],
  confirm_plan: [],
  run_monitor: ["asset_info", "memory"],
  log_source: [],
  archive: [],
  get_context: [],
  smalltalk: [],
  lookup_asset_info: ["asset_info"],
  unknown: [],
};

// A-VI-2: reduced fanout for sell fast path — memory+sentiment only (≤5s)
// drops valuation/technical to keep total request under Vercel 10s limit
const SELL_FAST_FANOUT = ["memory", "sentiment"];

const STATE_ASSET_FALLBACK_INTENTS = new Set([
  "lookup_memory",
  "manage_position",
  "confirm_plan",
  "review_add",
  "review_sell",
  "run_monitor",
]);

// Fast-path: sell+pct bypasses LLM classification entirely
function isSellPctFastPath(message) {
  const lower = message.toLowerCase();
  return (
    /卖|减仓|清仓|止盈|止损|sell|reduce|exit/.test(lower) &&
    /\d+\s*%/.test(message)
  );
}

function recentTurnsDigest(recentTurns) {
  if (!recentTurns || !recentTurns.length) return "";
  return recentTurns
    .slice(-5)
    .map((t) => `用户: "${t.message}" → 意图:${t.intent || "?"} 资产:${t.assetQuery || "无"}`)
    .join("\n");
}

const TICKER_NAME_MAP = {
  // Chinese names
  "比特币": "BTC", "以太坊": "ETH", "以太": "ETH", "狗狗币": "DOGE",
  "瑞波": "XRP", "莱特": "LTC", "柚子": "EOS", "波场": "TRX",
  "门罗": "XMR", "达世": "DASH", "小蚁": "NEO", "量子": "QTUM",
  "唯链": "VET", "索拉纳": "SOL", "艾达": "ADA", "雪崩": "AVAX",
  "波卡": "DOT", "马蹄": "MATIC", "链接": "LINK", "大饼": "BTC",
  "二饼": "ETH", "姨太": "ETH", "辣条": "LTC",
  // English coin names (case-insensitive)
  "bitcoin": "BTC", "ethereum": "ETH", "solana": "SOL", "dogecoin": "DOGE",
  "ripple": "XRP", "litecoin": "LTC", "cardano": "ADA", "avalanche": "AVAX",
  "polkadot": "DOT", "polygon": "MATIC", "tron": "TRX", "chainlink": "LINK",
  "ethena": "ENA",
};

const LOWER_STOPWORDS = new Set([
  "what", "is", "the", "a", "an", "and", "for", "are", "but", "not",
  "you", "all", "can", "had", "her", "was", "one", "our", "out",
  "has", "have", "been", "some", "them", "then", "than", "this",
  "that", "with", "when", "will", "would", "which", "their", "there",
  "about", "could", "should", "these", "those", "from", "your", "they",
  "does", "says", "said", "like", "make", "just", "also", "more",
  "much", "very", "well", "many", "such", "only", "other", "new",
  "now", "get", "got", "its", "how", "who", "why", "where", "tell",
  "know", "want", "need", "look", "see", "think", "show", "find",
  "does", "too", "use", "may", "way", "day", "part", "any", "into",
  "hello", "hi", "hey", "thanks", "help", "test",
]);

function extractSlotsRule(message, context = {}, intent = null) {
  const slots = { assetQuery: null, units: null, averageCost: null, sellPct: null };

  const pctMatch = message.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) slots.sellPct = parseFloat(pctMatch[1]);

  const unitsMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:个|枚|u|units)/i);
  if (unitsMatch) slots.units = parseFloat(unitsMatch[1]);

  const costMatch = message.match(/(?:成本|价格|均价|cost|price)\s*[：:=\s]*(\d+(?:\.\d+)?)/i);
  if (costMatch) slots.averageCost = parseFloat(costMatch[1]);

  // Name → ticker (Chinese + English, case-insensitive)
  const lowerMsg = message.toLowerCase();
  for (const [name, ticker] of Object.entries(TICKER_NAME_MAP)) {
    if (lowerMsg.includes(name.toLowerCase())) {
      slots.assetQuery = ticker;
      break;
    }
  }

  // Case-insensitive ticker: uppercase first, then lowercase fallback with stopwords
  if (!slots.assetQuery) {
    const upperMatch = message.match(/\b([A-Z]{2,8})\b/);
    if (upperMatch && upperMatch[1] !== "AI" && upperMatch[1] !== "OK") {
      slots.assetQuery = upperMatch[1];
    } else {
      const lowerMatches = lowerMsg.match(/\b[a-z]{2,8}\b/g);
      if (lowerMatches) {
        for (const w of lowerMatches) {
          if (w !== "ai" && w !== "ok" && !LOWER_STOPWORDS.has(w)) {
            slots.assetQuery = w.toUpperCase();
            break;
          }
        }
      }
    }
  }

  // Layer 1: prioritize context.lastAsset when message has no ticker
  // Skip for intents where asset context is irrelevant (smalltalk, unknown)
  const NO_LAST_ASSET_INTENTS = new Set(["smalltalk", "unknown"]);
  if (!slots.assetQuery && context.lastAsset && (!intent || !NO_LAST_ASSET_INTENTS.has(intent))) {
    slots.assetQuery = context.lastAsset;
  }

  return slots;
}

function classifyIntentRule(message) {
  const lower = message.toLowerCase();

  if (/你好|hello|hi\b|hey\b|谢谢|thanks|help/.test(lower)) return "smalltalk";

  if (/研究|分析一下|估值|值不值得|evaluate|research|analyze|能不能买|可以买/.test(lower)) {
    return "evaluate_candidate";
  }

  if (/买了|持有|建仓|开仓|已?买入|bought|hold|position|记录.*仓|添加.*仓/.test(lower) &&
      /\d+/.test(message)) {
    return "manage_position";
  }

  if (/确认|confirm|approve/.test(lower) && /计划|plan/.test(lower)) return "confirm_plan";

  if (/加仓|加不加|能加|可以加|add.*position|increase/.test(lower)) return "review_add";

  if (/卖|减仓|清仓|止盈|止损|sell|reduce|exit/.test(lower)) return "review_sell";

  if (/刷新|refresh|更新.*数据|重新.*查/.test(lower)) return "refresh_research";

  if (/监测|monitor|daily|检查.*计划|运行.*监控|计划.*状态|check.*plan/.test(lower)) return "run_monitor";

  if (/归档|archive/.test(lower)) return "archive";

  if (/持仓|仓位|投资组合|买了什么|买过什么|投了什么|持有.*什么|之前.*买/.test(lower)) return "lookup_memory";

  if (/计划|plan/.test(lower) && /是什么|查看|详情|detail|怎么样|状态/.test(lower)) return "lookup_memory";

  if (/查一下|查看|状态|context|portfolio|memory|记忆/.test(lower)) return "lookup_memory";

  if (/记录.*来源|log.*source|保存.*链接/.test(lower)) return "log_source";

  if (/context|上下文/.test(lower)) return "get_context";

  if (/是什么|什么是|什么币|介绍|了解|查一下|what is|tell me about|怎么样|多少|fdv|市值|价格/.test(lower) &&
      !/大盘|市场|行情|整个|全部|今天/.test(lower) &&
      /[A-Za-z]{2,8}|比特币|以太|狗狗|瑞波|莱特|柚子|波场|门罗|达世|小蚁|量子|唯链|索拉纳|艾达|雪崩|波卡|马蹄|链接|大饼|二饼|姨太|辣条/.test(message)) {
    return "lookup_asset_info";
  }

  return "unknown";
}

export function classifyIntent(message, context = {}) {
  const intent = classifyIntentRule(message);
  const slots = extractSlotsRule(message, context, intent);
  return { intent, slots, method: "rule" };
}

export function planFanout(intent) {
  return INTENT_FANOUT[intent] || [];
}

export function synthesizeRule(intent, agentResults, slots, context = {}) {
  const assetLabel = slots.assetQuery || context.lastAsset || "该资产";
  const headlines = agentResults
    .filter((r) => r.headline)
    .map((r) => `【${r.role}】${r.headline}`);

  const summary = headlines.length > 0
    ? headlines.join("；")
    : "委员会成员尚未返回意见";

  switch (intent) {
    case "evaluate_candidate":
      return `委员会已对 ${assetLabel} 完成调研。${summary}。综合来看，建议先完成估值模型再决定是否建仓。`;
    case "manage_position":
      return `${assetLabel} 已写入持仓，已生成含三档估值的 draft 投资计划。请确认计划以激活持续监控。`;
    case "confirm_plan":
      return `${assetLabel} 投资计划已确认并激活。现在可以开始持续监控：检查实时数据与计划阈值的对比、获取加减仓建议。`;
    case "review_add": {
      const addCmp = context._planCmp?.comparison;
      const addZoneInfo = addCmp
        ? `，当前估值区间: ${addCmp.zoneLabel}，实时价格 ${addCmp.currentPrice || "暂无"}，FDV ${addCmp.currentFdv || "暂无"}`
        : "";
      return `${assetLabel} 加仓建议：${summary}${addZoneInfo}`;
    }
    case "review_sell": {
      const sellCmp = context._planCmp?.comparison;
      const sellZoneInfo = sellCmp
        ? `，当前估值区间: ${sellCmp.zoneLabel}，实时价格 ${sellCmp.currentPrice || "暂无"}，FDV ${sellCmp.currentFdv || "暂无"}`
        : "";
      return `${assetLabel} 卖出分析：${summary}${sellZoneInfo}`;
    }
    case "run_monitor":
      return `${assetLabel} 监控检查已发起，正在获取实时数据并与计划阈值对比...`;
    case "refresh_research":
      return `${assetLabel} 研究数据已刷新。${summary}`;
    case "lookup_memory":
      if (slots.assetQuery) {
        return `${assetLabel} 的持仓记录与投资计划：${summary || "已查询，详细信息请稍后查看"}`;
      }
      return "正在调取你的全部投资组合与计划状态...";
    case "lookup_asset_info":
      return summary || `${assetLabel} 的资产信息查询已发起，请等待数据返回。`;
    case "smalltalk":
      return "我是 Decision Brain 首席决策官。你可以让我：研究某个资产是否值得买、记录你的持仓、查看持仓总览、或确认投资计划。";
    default:
      return summary || "收到，请问你希望我做什么？";
  }
}

async function classifyIntentLLM(message, context = {}) {
  const recentDigest = recentTurnsDigest(context.recentTurns);
  const focusedAsset = context.lastAsset || "";

  const systemPrompt = `You are an investment agent intent classifier. Given a user message (Chinese or English), output ONLY a JSON object:
{
  "intent": "one of: lookup_memory, evaluate_candidate, manage_position, refresh_research, confirm_plan, review_add, review_sell, run_monitor, log_source, archive, get_context, smalltalk, lookup_asset_info, unknown",
  "assetQuery": "ticker or null",
  "units": number or null,
  "averageCost": number or null,
  "sellPct": number or null
}

Intent guide:
- lookup_memory: checking portfolio/history before any action
- evaluate_candidate: researching whether an asset is worth buying
- manage_position: recording a position (bought, holding X units at cost Y)
- confirm_plan: confirming a draft investment plan
- review_add: asking whether to add to existing position
- review_sell: asking whether to sell/reduce
- refresh_research: refreshing market data
- lookup_asset_info: asking what an asset is, its price/marketCap/FDV, or a factual introduction (e.g. "what is BTC", "ENA FDV how much", "tell me about SOL"). Use this for factual single-asset queries, NOT for market-wide questions.
- smalltalk: greeting, thanks, chitchat

CRITICAL session context — use this to resolve pronouns ("it", "this", "that") and intent continuity:
<focused_asset>${focusedAsset || "none"}</focused_asset>
<recent_turns>
${recentDigest || "(no history)"}
</recent_turns>

When the user says "it", "this coin", "that asset" without naming a ticker, use <focused_asset> as the assetQuery.
When the user asks "can I add more", "should I sell half" without naming an asset, refer to <focused_asset>.`;

  try {
    const raw = await chatCompletion(systemPrompt, message, { temperature: 0.1, maxTokens: 300, timeoutMs: 3500 });
    if (!raw) return null;
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!VALID_INTENTS.includes(parsed.intent)) return null;
    return {
      intent: parsed.intent,
      slots: {
        assetQuery: parsed.assetQuery || focusedAsset || null,
        units: typeof parsed.units === "number" ? parsed.units : null,
        averageCost: typeof parsed.averageCost === "number" ? parsed.averageCost : null,
        sellPct: typeof parsed.sellPct === "number" ? parsed.sellPct : null,
      },
      method: "llm",
    };
  } catch {
    return null;
  }
}

function extractAssetMetrics(agentResults) {
  const assetInfo = agentResults.find((r) => r.role === "asset_info");
  if (!assetInfo?.data?.currentMetrics) return null;
  const m = assetInfo.data.currentMetrics;
  return {
    price: m.price != null ? `$${m.price}` : null,
    marketCap: m.marketCap != null ? `$${(m.marketCap / 1e9).toFixed(1)}B` : null,
    fdv: m.fdv != null ? `$${(m.fdv / 1e9).toFixed(1)}B` : null,
    name: assetInfo.data.name || null,
    symbol: assetInfo.data.symbol || null,
    mcpOk: assetInfo.data.mcpOk,
    chain: assetInfo.data.chain || null,
    chainConfidence: assetInfo.data.chainConfidence || "none",
  };
}

function synthesizeAssetInfoRule(agentResults, slots, context = {}) {
  const metrics = extractAssetMetrics(agentResults);
  const assetLabel = metrics?.symbol || slots.assetQuery || context.lastAsset || "该资产";
  const name = metrics?.name && metrics.name !== assetLabel ? `${metrics.name} (${assetLabel})` : assetLabel;

  if (!metrics || !metrics.mcpOk) {
    return `${name} 当前暂无法获取实时价格、市值或 FDV，本轮不应给出具体估值结论。请稍后重试或检查数据源连接。`;
  }

  const price = metrics.price || "该数据暂未获取到";
  const marketCap = metrics.marketCap || "该数据暂未获取到";
  const fdv = metrics.fdv || "该数据暂未获取到";
  const chainNote = (metrics.chain && metrics.chainConfidence === "low")
    ? `链归属(${metrics.chain})仍需确认。`
    : (metrics.chain ? `运行在 ${metrics.chain}。` : "");
  return `${name} 当前价格为 ${price}，市值为 ${marketCap}，FDV 为 ${fdv}。${chainNote}这些数字来自本轮 asset_info trace；如果需要交易判断，应继续补充链上、情绪和估值上下文。`;
}

function formatCompactUsd(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return null;
  if (number >= 1_000_000_000) return `$${(number / 1_000_000_000).toFixed(2)}B`;
  if (number >= 1_000_000) return `$${(number / 1_000_000).toFixed(2)}M`;
  if (number >= 1_000) return `$${(number / 1_000).toFixed(2)}K`;
  return `$${number.toFixed(2)}`;
}

// E组: 加载 plan 并与实时 agent 数据对比，输出结构化差异
async function buildPlanComparison(agentResults, assetQuery) {
  const metrics = extractAssetMetrics(agentResults);
  if (!metrics || !metrics.mcpOk) {
    return { hasLiveData: false, comparison: null, reason: "实时数据暂不可用" };
  }

  let state;
  try {
    state = await store.load();
  } catch {
    return { hasLiveData: true, comparison: null, reason: "无法读取本地计划状态" };
  }

  const assetEntry = Object.values(state.assets || {}).find(
    (a) => (a.symbol || "").toUpperCase() === (assetQuery || "").toUpperCase()
  );
  if (!assetEntry) {
    return { hasLiveData: true, comparison: null, reason: `未找到 ${assetQuery} 的本地记录` };
  }

  const plan = state.plans?.[assetEntry.id];
  if (!plan) {
    return { hasLiveData: true, comparison: null, reason: `未找到 ${assetQuery} 的投资计划`, planStatus: "none" };
  }

  const valuationModel = state.valuationModels?.[assetEntry.id];
  const position = state.positions?.[assetEntry.id];

  const currentPrice = metrics.price ? parseFloat(metrics.price.replace("$", "")) : null;
  const currentFdv = metrics.fdv ? parseFloat(metrics.fdv.replace("$", "")) * 1e9 : null;

  const tiers = [];
  if (valuationModel?.scenarios) {
    for (const scenario of valuationModel.scenarios) {
      const fdvRange = scenario.targetFdvRange || [];
      const priceRange = scenario.impliedPriceRange || [];
      const zoneLabel = { conservative: "保守估值区", base: "基准估值区", aggressive: "乐观估值区" }[scenario.name] || scenario.name;
      tiers.push({
        name: scenario.name,
        label: zoneLabel,
        fdvRange,
        fdvFormatted: fdvRange.length === 2 ? `${formatCompactUsd(fdvRange[0])} — ${formatCompactUsd(fdvRange[1])}` : "暂无",
        priceFormatted: priceRange.length === 2 ? `$${priceRange[0]} — $${priceRange[1]}` : "暂无",
        implication: scenario.planImplication || "",
      });
    }
  }

  let currentZone = "unknown";
  let zoneLabel = "未知";
  if (currentFdv && tiers.length > 0) {
    const cons = tiers.find((t) => t.name === "conservative");
    const base = tiers.find((t) => t.name === "base");
    const aggr = tiers.find((t) => t.name === "aggressive");
    if (cons?.fdvRange?.length === 2 && currentFdv <= cons.fdvRange[0]) {
      currentZone = "below_conservative"; zoneLabel = "低于保守估值区";
    } else if (cons?.fdvRange?.length === 2 && currentFdv <= cons.fdvRange[1]) {
      currentZone = "conservative"; zoneLabel = "保守估值区内";
    } else if (base?.fdvRange?.length === 2 && currentFdv <= base.fdvRange[1]) {
      currentZone = "base"; zoneLabel = "基准估值区内";
    } else if (aggr?.fdvRange?.length === 2 && currentFdv >= aggr.fdvRange[0]) {
      currentZone = "aggressive"; zoneLabel = "乐观估值区内";
    } else {
      currentZone = "between_base_and_aggressive"; zoneLabel = "基准与乐观估值之间";
    }
  }

  const positionSnapshot = position ? {
    units: position.units, averageCost: position.averageCost,
    currentValue: position.currentValue, peakUnits: position.peakUnits,
  } : null;

  let zoneAction = "请结合最新 thesis 和市场情况综合判断。";
  if (currentZone === "below_conservative") zoneAction = "估值低于保守区，如 thesis 有效可考虑小幅加仓。";
  else if (currentZone === "conservative") zoneAction = "估值处于保守区，适合持有观察，可小幅加仓。";
  else if (currentZone === "base") zoneAction = "估值进入基准区，可考虑部分止盈或持有。";
  else if (currentZone === "aggressive" || currentZone === "between_base_and_aggressive") zoneAction = "估值偏高，建议优先分批止盈，不追高。";

  return {
    hasLiveData: true,
    comparison: {
      currentPrice: metrics.price,
      currentFdv: metrics.fdv,
      currentMarketCap: metrics.marketCap,
      currentPriceRaw: currentPrice,
      currentFdvRaw: currentFdv,
      currentZone,
      zoneLabel,
      planStatus: plan.status,
      planAddZone: plan.addZone || "",
      planHoldZone: plan.holdZone || "",
      planSellZone: plan.sellZone || "",
      planAggressiveZone: plan.aggressiveZone || "",
      tiers,
      position: positionSnapshot,
      zoneAction,
    },
    reason: null,
  };
}


// C组: 加载 plan/valuation 详情，生成单资产投资历史回复
async function synthesizeMemoryReply(agentResults, slots, context = {}) {
  const assetQuery = slots.assetQuery || context.lastAsset;
  if (!assetQuery) {
    return synthesizeRule("lookup_memory", agentResults, slots, context);
  }

  let state;
  try {
    state = await store.load();
  } catch {
    return synthesizeRule("lookup_memory", agentResults, slots, context);
  }

  const assetEntry = Object.values(state.assets || {}).find(
    (a) => (a.symbol || "").toUpperCase() === assetQuery.toUpperCase()
  );
  if (!assetEntry) {
    return `${assetQuery} 暂无本地持仓记录或投资计划。你可以先研究该资产（如"研究 ${assetQuery}"）或记录仓位。`;
  }

  const position = state.positions[assetEntry.id] || null;
  const plan = state.plans[assetEntry.id] || null;
  const valuationModel = state.valuationModels[assetEntry.id] || null;

  if (!position && !plan) {
    return `${assetQuery} 已被系统记录但暂无持仓或投资计划。你可以说"我买了 ${assetQuery} X 个，成本 Y"来写入仓位。`;
  }

  const lines = [];
  if (position) {
    lines.push(`${assetQuery} 持仓: ${position.units} 个，成本 $${position.averageCost}，当前价 $${position.currentPrice}，当前市值 $${(position.currentValue || 0).toFixed(0)}。`);
    if (position.peakUnits) lines.push(`历史最高持仓: ${position.peakUnits} 个。`);
    if (position.marketCap) lines.push(`市值: $${(position.marketCap / 1e9).toFixed(1)}B。`);
    if (position.fdv) lines.push(`FDV: $${(position.fdv / 1e9).toFixed(1)}B。`);
  }

  if (plan) {
    const statusLabel = plan.status === "active" ? "活跃监控中"
      : plan.status === "draft" ? "draft (待确认)"
      : plan.status;
    lines.push(`投资计划状态: ${statusLabel}`);
    if (plan.confirmedAt) lines.push(`确认时间: ${plan.confirmedAt}`);
    if (plan.nextReviewAt) lines.push(`下次复查: ${plan.nextReviewAt}`);
    if (plan.monitoringPolicy) {
      const mp = plan.monitoringPolicy;
      const mpLines = [];
      if (mp.addThresholdPct != null) mpLines.push(`加仓阈值: ${mp.addThresholdPct}%`);
      if (mp.sellThresholdPct != null) mpLines.push(`减仓阈值: ${mp.sellThresholdPct}%`);
      if (mp.maxPositionPct != null) mpLines.push(`最大仓位: ${mp.maxPositionPct}%`);
      if (mpLines.length > 0) lines.push(`监控策略: ${mpLines.join("，")}`);
    }
  }

  let valuationZone = null;
  if (valuationModel) {
    valuationZone = detectValuationZone(valuationModel);
  }
  if (valuationZone) {
    const zoneLabels = {
      below_conservative: "低于保守估值",
      conservative: "保守估值区间",
      base: "基准估值区间",
      aggressive: "乐观估值区间",
      between_base_and_aggressive: "基准与乐观之间",
    };
    lines.push(`当前估值区间: ${zoneLabels[valuationZone] || valuationZone}`);
  }

  if (valuationModel?.scenarios) {
    lines.push("三档估值 (FDV):");
    const tierLabels = ["保守", "基准", "乐观"];
    for (let i = 0; i < valuationModel.scenarios.length; i++) {
      const s = valuationModel.scenarios[i];
      const fdvRange = s.targetFdvRange
        ? `$${(s.targetFdvRange[0] / 1e9).toFixed(1)}B - $${(s.targetFdvRange[1] / 1e9).toFixed(1)}B`
        : "未计算";
      const priceRange = s.impliedPriceRange
        ? `$${s.impliedPriceRange[0]} - $${s.impliedPriceRange[1]}`
        : "未计算";
      lines.push(`  ${tierLabels[i]}: FDV ${fdvRange}，隐含价格 ${priceRange}。${s.planImplication || ""}`);
    }
    lines.push("以上估值数字可追溯至对应 trace 记录。");
  } else if (!valuationModel && plan) {
    lines.push("估值模型尚未建立，建议先补充研究数据。");
  }

  if (!plan) {
    lines.push(`该资产暂无投资计划。你可以说"确认 ${assetQuery} 计划"如果已有 draft 计划。`);
  }

  return lines.join("\n");
}

function synthesizeMonitorReply(planCmp, assetLabel) {
  const cmp = planCmp.comparison;
  if (!cmp) {
    return `${assetLabel}: ${planCmp.reason || "暂无法完成监控对比"}。`;
  }
  if (cmp.planStatus === "none" || !cmp.planStatus) {
    return `${assetLabel} 尚未创建投资计划。你可以先研究该资产、记录持仓，然后确认计划来启动持续监控。`;
  }
  if (cmp.planStatus === "draft") {
    return `${assetLabel} 当前计划仍为 draft 状态，尚未激活持续监控。请先确认计划。`;
  }
  if (cmp.planStatus === "archived") {
    return `${assetLabel} 计划已归档，不再自动监控。如需恢复，请重新激活。`;
  }

  const lines = [
    `${assetLabel} 实时监控对比：`,
    ``,
    `【实时数据】当前价格 ${cmp.currentPrice || "暂无"}，FDV ${cmp.currentFdv || "暂无"}，市值 ${cmp.currentMarketCap || "暂无"}`,
    `当前估值区间: ${cmp.zoneLabel}`,
    ``,
    `【计划阈值】`,
  ];
  for (const tier of cmp.tiers) {
    lines.push(`  ${tier.label}: FDV ${tier.fdvFormatted}, 参考价 ${tier.priceFormatted} — ${tier.implication}`);
  }
  lines.push("");
  lines.push(`【计划规则】`);
  lines.push(`  加仓区: ${cmp.planAddZone || "未设定"}`);
  lines.push(`  卖出区: ${cmp.planSellZone || "未设定"}`);
  if (cmp.position) {
    lines.push(`【当前持仓】${cmp.position.units} 个, 均价 $${cmp.position.averageCost}, 市值 $${cmp.position.currentValue}`);
  }
  lines.push("");
  lines.push(`结论: ${cmp.zoneAction}`);
  lines.push("以上数字来自本轮实时数据与本地计划阈值对比，不构成交易执行指令。");

  return lines.join("\n");
}

function buildPlanComparisonBlock(planCmp) {
  const cmp = planCmp.comparison;
  if (!cmp) return "";
  const lines = [
    `PLAN VS REAL-TIME COMPARISON (from local state + live MCP data):`,
    `  planStatus: ${cmp.planStatus || "none"}`,
    `  currentZone: ${cmp.zoneLabel}`,
    `  currentPrice: ${cmp.currentPrice || "UNAVAILABLE"}`,
    `  currentFdv: ${cmp.currentFdv || "UNAVAILABLE"}`,
  ];
  for (const tier of cmp.tiers) {
    lines.push(`  ${tier.label}: FDV ${tier.fdvFormatted}, Price ${tier.priceFormatted}`);
  }
  lines.push(`  zoneAction: ${cmp.zoneAction}`);
  if (cmp.position) {
    lines.push(`  position: ${cmp.position.units} units @ $${cmp.position.averageCost}, value $${cmp.position.currentValue}`);
  }
  return lines.join("\n");
}

async function synthesizeLLM(intent, agentResults, slots, context = {}) {
  const agentSummary = agentResults
    .filter((r) => r.headline)
    .map((r) => `${r.role}: ${r.headline}`)
    .join("\n");

  const recentDigest = recentTurnsDigest(context.recentTurns);
  const focusedAsset = slots.assetQuery || context.lastAsset || "unknown";

  const metrics = extractAssetMetrics(agentResults);
  const metricsBlock = metrics
    ? [
        `REAL-TIME MARKET DATA (must cite verbatim, do NOT fabricate):`,
        `  symbol: ${metrics.symbol || focusedAsset}`,
        `  name: ${metrics.name || "unknown"}`,
        `  price: ${metrics.price || "UNAVAILABLE"}`,
        `  marketCap: ${metrics.marketCap || "UNAVAILABLE"}`,
        `  FDV: ${metrics.fdv || "UNAVAILABLE"}`,
        `  chain: ${metrics.chain || "unknown"}`,
        `  chainConfidence: ${metrics.chainConfidence || "none"} (high=verified, medium=likely, low=unverified)`,
        `  dataSourceOk: ${metrics.mcpOk ? "true" : "false"}`,
        ``,
        `CRITICAL: When mentioning price, market cap, or FDV in your reply, you MUST use the exact numbers above.`,
        `If any field is "UNAVAILABLE", say "该数据暂未获取到" — do NOT guess or fabricate.`,
        ``,
        `CHAIN ATTRIBUTION RULES:`,
        `- If chainConfidence is "high" or "medium": you MAY state the chain as fact (e.g. "runs on Ethereum").`,
        `- If chainConfidence is "low" or "none": you MUST say "链归属仍需确认" and MUST NOT assert a specific chain.`,
      ].join("\n")
    : "";

  const systemPrompt = `You are the Chief Investment Officer of Decision Brain, an AI investment committee. Given agent reports, session context, and user intent, write a concise final recommendation (2-5 sentences, Chinese). Be specific, reference the agent findings, and end with actionable next step.

HARD CONSTRAINTS:
1. Price, market cap, and FDV numbers MUST be cited verbatim from the agent reports section labeled "REAL-TIME MARKET DATA". If a number is marked UNAVAILABLE, state that the data is currently unavailable rather than inventing a value. Never fabricate market data.
2. Do NOT generate entry prices, target prices, stop-loss levels, take-profit levels, or pullback price levels (e.g. "目标价$X", "止损$X", "回调至$X", "入场$X"). These are trading execution parameters and MUST NOT appear unless they exist in the REAL-TIME MARKET DATA block above.
3. When REAL-TIME MARKET DATA fields are marked UNAVAILABLE, do not mention any specific dollar amounts, market cap figures, or FDV figures in your reply.
4. Follow the CHAIN ATTRIBUTION RULES in the data block: only assert a chain as fact when chainConfidence is "high" or "medium". When chainConfidence is "low" or "none", say "链归属仍需确认" instead of claiming a specific chain.
5. When a PLAN VS REAL-TIME COMPARISON block is present: compare the real-time price/FDV against the plan's tier thresholds. State which valuation zone the asset is currently in (e.g. "当前处于保守估值区内"). Reference the zone's implication when making your recommendation. Do NOT fabricate thresholds or prices — use only what appears in the data blocks.`;

  const userMessage = `Intent: ${intent}
Asset: ${focusedAsset}
Units: ${slots.units || "N/A"}
Cost: ${slots.averageCost || "N/A"}

<session_context>
Focused asset: ${focusedAsset}
Last intent: ${context.lastIntent || "none"}
Recent turns:
${recentDigest || "(none)"}
</session_context>

${metricsBlock ? `${metricsBlock}\n` : ""}${context._planComparisonBlock ? `${context._planComparisonBlock}\n` : ""}Agent Reports:
${agentSummary || "No agent reports available."}

Write the Chief's final recommendation:`;

  try {
    const reply = await chatCompletion(systemPrompt, userMessage, { temperature: 0.5, maxTokens: 600, timeoutMs: 6000 });
    if (reply) return reply;
  } catch {
    // fall through to rule
  }
  return null;
}

function generateSuggestions(intent, slots, context = {}) {
  const asset = slots.assetQuery || context.lastAsset;
  const base = [];

  // New session / first interaction: brief onboarding guidance
  const isNewSession = !context.lastAsset && !context.lastIntent &&
    (!context.recentTurns || context.recentTurns.length === 0);

  if (intent === "smalltalk" || (intent === "unknown" && isNewSession)) {
    base.push("研究 BTC 是否值得买");
    base.push("我持有 ETH，记录仓位");
  }

  if (intent === "lookup_asset_info" && asset) {
    base.push(`研究 ${asset} 是否值得买`);
    base.push(`我持有 ${asset}，记录仓位`);
  }

  if (intent === "evaluate_candidate" && asset) {
    base.push(`我买了 ${asset}，记录仓位`);
    base.push(`刷新 ${asset} 研究数据`);
  }

  if (intent === "manage_position" && asset) {
    base.push(`确认 ${asset} 投资计划`);
    base.push(`刷新 ${asset} 研究数据`);
  }

  if (intent === "confirm_plan" && asset) {
    base.push(`运行监控 ${asset}`);
    base.push(`现在 ${asset} 能加仓吗`);
    base.push(`${asset} 该减仓吗`);
  }

  if (intent === "review_add" && asset) {
    base.push(`看 ${asset} 加仓建议`);
    base.push(`${asset} 该减仓吗`);
  }

  if (intent === "review_sell" && asset) {
    base.push(`卖 30%`);
    base.push(`现在 ${asset} 能加仓吗`);
  }

  if (intent === "run_monitor" && asset) {
    base.push(`现在 ${asset} 能加仓吗`);
    base.push(`${asset} 该减仓吗`);
    base.push(`刷新 ${asset} 研究数据`);
  }

  base.push("刷新全部研究");
  base.push("看我的持仓总览");
  return [...new Set(base)].slice(0, 5);
}

export async function runOrchestrator(message, sessionId, context = {}) {
  // A-VI-3: stateless requests (no sessionId) → rule-only
  const degraded = isRuleOnly() || context._stateless === true;

  // A-VI-2: sell+pct fast path — skip LLM entirely, ≤200ms
  const sellPctFast = !degraded && isSellPctFastPath(message);

  let classification;
  if (!degraded && !sellPctFast) {
    const llmResult = await classifyIntentLLM(message, context);
    classification = llmResult || classifyIntent(message, context);
  } else {
    classification = classifyIntent(message, context);
  }

  // Merge rule-based slots when LLM misses fields (Layer 1 fix)
  if (!classification.slots.assetQuery) {
    const ruleSlots = extractSlotsRule(message, context, classification.intent);
    if (ruleSlots.assetQuery) {
      classification.slots.assetQuery = ruleSlots.assetQuery;
    }
  }

  // Fallback to state's most recent focused asset (Layer 2 fix — DataStore)
  // Skip for stateless requests (no sessionId)
  if (
    !classification.slots.assetQuery &&
    !context._stateless &&
    STATE_ASSET_FALLBACK_INTENTS.has(classification.intent)
  ) {
    try {
      const state = await store.load();
      const recentTraces = Object.values(state.traces || {});
      if (recentTraces.length > 0) {
        const newest = recentTraces.reduce((a, b) =>
          (b.createdAt || "") > (a.createdAt || "") ? b : a
        );
        if (newest.assetId) {
          const asset = state.assets[newest.assetId];
          if (asset?.symbol) {
            classification.slots.assetQuery = asset.symbol;
          }
        }
      }
    } catch {
      // State unavailable; proceed without fallback
    }
  }

  const { intent, slots, method } = classification;
  // A-VI-2: sell+pct uses reduced fanout to stay under 8s
  const fanout = sellPctFast ? SELL_FAST_FANOUT : planFanout(intent);

  // A-X-A2: Skip initial LLM synthesis when fanout will run — the result
  // is always replaced by synthesizeWithResults in server.mjs anyway.
  const hasFanout = fanout.length > 0;
  const reply = (degraded || sellPctFast || hasFanout)
    ? synthesizeRule(intent, [], slots, context)
    : (await synthesizeLLM(intent, [], slots, context)) || synthesizeRule(intent, [], slots, context);

  const suggestions = generateSuggestions(intent, slots, context);

  return {
    ok: true,
    intent,
    assetQuery: slots.assetQuery,
    slots,
    fanout,
    agentResults: [],
    reply,
    suggestions,
    degraded: degraded || method === "rule",
    ruleOnly: isRuleOnly(),
    sessionId,
  };
}

export async function synthesizeWithResults(intent, agentResults, slots, context = {}) {
  // No-LLM fast paths first (work even when LLM_API_KEY is unset):
  // A-X-A5: lookup_asset_info uses rule-based template directly
  if (intent === "lookup_asset_info") {
    return synthesizeAssetInfoRule(agentResults, slots, context);
  }
  // C组: lookup_memory with specific asset → load plan/valuation details
  if (intent === "lookup_memory" && slots.assetQuery) {
    return synthesizeMemoryReply(agentResults, slots, context);
  }
  // E组: run_monitor — 实时数据 vs 计划阈值对比, no LLM needed
  if (intent === "run_monitor") {
    const assetLabel = slots.assetQuery || context.lastAsset || "未知资产";
    const planCmp = await buildPlanComparison(agentResults, assetLabel);
    if (!planCmp.hasLiveData && planCmp.reason) {
      return `${assetLabel}: ${planCmp.reason}`;
    }
    return synthesizeMonitorReply(planCmp, assetLabel);
  }

  // Below here: paths that need LLM
  // E组: load plan comparison for review_add/review_sell before degraded check,
  // so it's available in rule-based fallback too
  if (intent === "review_add" || intent === "review_sell") {
    const assetLabel = slots.assetQuery || context.lastAsset;
    if (assetLabel) {
      const planCmp = await buildPlanComparison(agentResults, assetLabel);
      if (planCmp.comparison) {
        context._planComparisonBlock = buildPlanComparisonBlock(planCmp);
        context._planCmp = planCmp;
      }
    }
  }

  const degraded = isRuleOnly();
  if (degraded) {
    return synthesizeRule(intent, agentResults, slots, context);
  }

  const llm = await synthesizeLLM(intent, agentResults, slots, context);
  return llm || synthesizeRule(intent, agentResults, slots, context);
}
