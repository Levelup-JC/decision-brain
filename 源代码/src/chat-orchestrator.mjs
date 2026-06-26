import { chatCompletion, isRuleOnly } from "./llm-client.mjs";
import { store } from "./data-store.mjs";

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
  review_add: ["memory", "valuation", "sentiment", "technical"],
  review_sell: ["memory", "valuation", "sentiment", "technical"],
  refresh_research: ["macro", "onchain", "sentiment", "technical", "news"],
  lookup_memory: ["memory"],
  confirm_plan: [],
  run_monitor: [],
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
]);

function extractSlotsRule(message, context = {}) {
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
  if (!slots.assetQuery && context.lastAsset) {
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

  if (/监测|monitor|daily/.test(lower)) return "run_monitor";

  if (/归档|archive/.test(lower)) return "archive";

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
  const slots = extractSlotsRule(message, context);
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
      return `${assetLabel} 已写入持仓，已生成 draft 投资计划，请确认。`;
    case "review_add":
      return `${assetLabel} 加仓建议：${summary}`;
    case "review_sell":
      return `${assetLabel} 卖出分析：${summary}`;
    case "refresh_research":
      return `${assetLabel} 研究数据已刷新。${summary}`;
    case "lookup_memory":
      return `${assetLabel} 的持仓记忆：${summary}`;
    case "lookup_asset_info":
      return summary || `${assetLabel} 的资产信息查询已发起，请等待数据返回。`;
    case "smalltalk":
      return "我是 Decision Brain 首席决策官，随时为你服务。你可以让我研究资产、管理仓位或给出投资建议。";
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
    const raw = await chatCompletion(systemPrompt, message, { temperature: 0.1, maxTokens: 300 });
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
  };
}

function normalizeDollarNumber(text) {
  const match = String(text || "").match(/\$(\d[\d,.]*(?:\.\d+)?)\s*([BMKTbmkt])?/);
  if (!match) return null;
  const base = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const suffix = (match[2] || "").toUpperCase();
  const multiplier = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[suffix] || 1;
  return base * multiplier;
}

function dollarNumbersIn(text) {
  const matches = String(text || "").match(/\$\d[\d,.]*(?:\.\d+)?\s*[BMKTbmkt]?/g) || [];
  return matches
    .map((m) => ({ raw: m, value: normalizeDollarNumber(m) }))
    .filter((m) => m.value != null);
}

function allowedMetricDollarValues(metrics) {
  return [metrics?.price, metrics?.marketCap, metrics?.fdv]
    .filter(Boolean)
    .flatMap((value) => dollarNumbersIn(value).map((n) => n.value));
}

function hasOnlyAllowedDollarNumbers(reply, metrics) {
  const replyNumbers = dollarNumbersIn(reply);
  if (!replyNumbers.length) return true;
  const allowed = allowedMetricDollarValues(metrics);
  if (!allowed.length) return false;
  return replyNumbers.every((rn) =>
    allowed.some((an) => Math.abs(rn.value - an) / Math.max(rn.value, an) < 0.01)
  );
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
  return `${name} 当前价格为 ${price}，市值为 ${marketCap}，FDV 为 ${fdv}。这些数字来自本轮 asset_info trace；如果需要交易判断，应继续补充链上、情绪和估值上下文。`;
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
        `  dataSourceOk: ${metrics.mcpOk ? "true" : "false"}`,
        ``,
        `CRITICAL: When mentioning price, market cap, or FDV in your reply, you MUST use the exact numbers above.`,
        `If any field is "UNAVAILABLE", say "该数据暂未获取到" — do NOT guess or fabricate.`,
      ].join("\n")
    : "";

  const systemPrompt = `You are the Chief Investment Officer of Decision Brain, an AI investment committee. Given agent reports, session context, and user intent, write a concise final recommendation (2-5 sentences, Chinese). Be specific, reference the agent findings, and end with actionable next step.

HARD CONSTRAINT: Price, market cap, and FDV numbers MUST be cited verbatim from the agent reports section labeled "REAL-TIME MARKET DATA". If a number is marked UNAVAILABLE, state that the data is currently unavailable rather than inventing a value. Never fabricate market data.`;

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

${metricsBlock ? `${metricsBlock}\n` : ""}Agent Reports:
${agentSummary || "No agent reports available."}

Write the Chief's final recommendation:`;

  try {
    const reply = await chatCompletion(systemPrompt, userMessage, { temperature: 0.5, maxTokens: 600 });
    if (reply) return reply;
  } catch {
    // fall through to rule
  }
  return null;
}

function generateSuggestions(intent, slots, context = {}) {
  const asset = slots.assetQuery || context.lastAsset;
  const base = [];
  if (intent === "evaluate_candidate" && asset) {
    base.push(`研究 ${asset} 是否值得买`);
    base.push(`我持有 ${asset}，记录仓位`);
  }
  if (intent === "manage_position" && asset) {
    base.push(`确认 ${asset} 投资计划`);
    base.push(`刷新 ${asset} 研究数据`);
  }
  if (intent === "review_add" && asset) {
    base.push(`看 ${asset} 加仓建议`);
  }
  if (intent === "review_sell" && asset) {
    base.push(`卖 30%`);
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
    const ruleSlots = extractSlotsRule(message, context);
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

  // A-VI-2: sell+pct fast path & degraded both skip initial LLM synthesis
  // (initial reply is replaced by synthesizeWithResults after agent fanout anyway)
  const reply = (degraded || sellPctFast)
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
  const degraded = isRuleOnly();
  if (degraded) {
    return synthesizeRule(intent, agentResults, slots, context);
  }
  const llm = await synthesizeLLM(intent, agentResults, slots, context);
  if (intent === "lookup_asset_info") {
    const metrics = extractAssetMetrics(agentResults);
    if (!llm || !hasOnlyAllowedDollarNumbers(llm, metrics)) {
      return synthesizeAssetInfoRule(agentResults, slots, context);
    }
  }
  return llm || synthesizeRule(intent, agentResults, slots, context);
}
