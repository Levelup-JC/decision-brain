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
  "strategy_dialogue",
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
  strategy_dialogue: ["asset_info", "memory"],
  unknown: [],
};

// Task 2.1: Full dispatch metadata for each agent role
const AGENT_DISPATCH_META = {
  macro: {
    label: "Macro Agent",
    provider: "Bitget MCP",
    skill: "macro-analyst",
    tools: ["macro_indicators", "rates_yields"],
    reason: "判断宏观流动性和风险偏好",
  },
  onchain: {
    label: "Market Intel Agent",
    provider: "Bitget MCP",
    skill: "market-intel",
    tools: ["crypto_market", "defi_analytics", "network_status"],
    reason: "分析链上数据和市场情报",
  },
  news: {
    label: "News Agent",
    provider: "Bitget MCP",
    skill: "news-briefing",
    tools: ["news_feed", "social_trending"],
    reason: "追踪相关新闻和社会情绪",
  },
  sentiment: {
    label: "Sentiment Agent",
    provider: "Bitget MCP",
    skill: "sentiment-analyst",
    tools: ["sentiment_index", "derivatives_sentiment"],
    reason: "评估市场情绪和衍生品数据",
  },
  technical: {
    label: "Technical Agent",
    provider: "Bitget MCP",
    skill: "technical-analysis",
    tools: ["technical_analysis", "crypto_derivatives"],
    reason: "技术指标分析和价格形态",
  },
  asset_info: {
    label: "Asset Info Agent",
    provider: "Bitget MCP",
    skill: null,
    tools: ["crypto_market", "dex_market"],
    reason: "获取资产基本信息和实时数据",
  },
  valuation: {
    label: "Valuation Agent",
    provider: "Decision Brain",
    skill: "valuation engine",
    tools: [],
    reason: "计算估值区间和决策建议",
  },
  memory: {
    label: "Memory Agent",
    provider: "Decision Brain",
    skill: "local memory layer",
    tools: [],
    reason: "检索本地记忆和投资历史",
  },
};

export function buildDispatchPlan(fanout) {
  return fanout.map((role) => ({
    role,
    ...(AGENT_DISPATCH_META[role] || {
      label: `${role} Agent`,
      provider: "Decision Brain",
      skill: null,
      tools: [],
      reason: `${role} 本地处理`,
    }),
  }));
}

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
  const slots = { assetQuery: null, units: null, averageCost: null, sellPct: null, reason: null };

  const pctMatch = message.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) slots.sellPct = parseFloat(pctMatch[1]);

  const unitsMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:个|枚|u|units)/i);
  if (unitsMatch) slots.units = parseFloat(unitsMatch[1]);

  const costMatch = message.match(/(?:成本|价格|均价|cost|price)\s*[：:=\s]*(\d+(?:\.\d+)?)/i);
  if (costMatch) slots.averageCost = parseFloat(costMatch[1]);

  // Extract buying reason after 因为/理由是/看好/觉得/认为
  const reasonMatch = message.match(/(?:因为|理由是|看好|觉得|认为|原因是)[：:\s]*(.+)/i);
  if (reasonMatch) slots.reason = reasonMatch[1].trim();

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
  // Also skip for market-wide queries that should not be pinned to a single asset
  const NO_LAST_ASSET_INTENTS = new Set(["smalltalk", "unknown"]);
  const isMarketWide = /大盘|市场.*怎么|行情.*怎么|看.*行情|整个.*市场|全部.*币|今天.*市场|现在.*市场/.test(message);
  if (!slots.assetQuery && context.lastAsset && !isMarketWide && (!intent || !NO_LAST_ASSET_INTENTS.has(intent))) {
    slots.assetQuery = context.lastAsset;
  }

  return slots;
}

function classifyIntentRule(message) {
  const lower = message.toLowerCase();

  if (/你好|hello|hi\b|hey\b|谢谢|thanks|help/.test(lower)) return "smalltalk";

  if (/研究|分析一下|估值|值不值得|evaluate|research|analyze|能不能买|可以买|想买|要买|打算买/.test(lower)) {
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

  if (/怕踏空|追高|犹豫|拿着|继续拿|还能拿|怎么调整|整理.*思路|下一步|等什么信号|复盘|为什么买|叙事|风险|怎么办|该怎么办|怎么处理|策略|设计/.test(lower)) {
    return "strategy_dialogue";
  }

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

  const hasResults = agentResults.length > 0;

  switch (intent) {
    case "evaluate_candidate": {
      const evidence = hasResults
        ? agentResults.filter((r) => r.headline).map((r) => r.headline)
        : ["多 Agent 研究已触发，正在采集宏观、链上、情绪、技术面和估值数据"];
      return `【当前状态】\n正在对 ${assetLabel} 进行多维度研究评估。\n\n【关键证据】\n${evidence.map((e, i) => `${i + 1}. ${e}`).join("\n") || "1. 数据采集中"}\n\n【风险与缺口】\n${hasResults ? "需结合估值模型和本地计划进行综合判断" : "实时数据和估值模型尚未返回"}\n\n【下一步建议】\n建议先完成估值模型再决定是否建仓，可先记录观察仓位。\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。`;
    }
    case "manage_position": {
      if (slots._canceled) return "已取消持仓记录。你可以随时重新记录。";

      const pp = context.pendingPosition;
      const asset = slots.assetQuery || pp?.assetQuery || "该资产";
      const units = slots.units || pp?.units;
      const cost = slots.averageCost ?? pp?.averageCost;
      const reason = slots.reason || pp?.reason;

      if (pp?.confirmed) {
        const reasonLine = reason ? `\n购买理由: ${reason}` : "";
        return `已记录 ${asset} 持仓：${units} 个，成本 $${cost}。${reasonLine}\n\n持仓已写入 Decision Brain 本地记忆，draft 投资计划已生成。请确认计划以激活持续监控。`;
      }

      if (units && cost && reason) {
        return `${asset} 持仓已记录：${units} 个，成本 $${cost}。\n购买理由: ${reason}\n\n请确认以上信息无误？回复"确认"完成记录，回复"取消"放弃。`;
      }

      if (units && cost && !reason) {
        return `${asset} 持仓已记录：${units} 个，成本 $${cost}。\n\n请告诉我你的购买理由是什么？为什么看好 ${asset}？`;
      }

      if (units && !cost) {
        return `${asset} 持仓已记录：${units} 个。请提供你的买入成本价格。`;
      }

      return `${asset} 持仓信息采集中，请提供数量和成本价格。`;
    }
    case "confirm_plan":
      return `${assetLabel} 投资计划已确认并激活。现在可以开始持续监控：检查实时数据与计划阈值的对比、获取加减仓建议。`;
    case "review_add": {
      const addCmp = context._planCmp?.comparison;
      const addZoneInfo = addCmp
        ? `\n当前估值区间: ${addCmp.zoneLabel}，实时价格 ${addCmp.currentPrice || "暂无"}，FDV ${addCmp.currentFdv || "暂无"}`
        : "";
      if (addCmp) {
        return `【当前状态】\n正在评估 ${assetLabel} 的加仓机会。${addZoneInfo}\n\n【关键证据】\n${evidenceList(agentResults)}\n\n【风险与缺口】\n加仓需确认 thesis 依然有效，且仓位不超过上限。\n\n【下一步建议】\n${addCmp.zoneAction}\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。`;
      }
      return `【当前状态】\n正在评估 ${assetLabel} 的加仓机会。${addZoneInfo}\n\n【关键证据】\n${evidenceList(agentResults)}\n\n【风险与缺口】\n暂无实时估值区间数据。\n\n【下一步建议】\n请先获取实时数据后再做加仓判断。\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。`;
    }
    case "review_sell": {
      const sellCmp = context._planCmp?.comparison;
      const sellZoneInfo = sellCmp
        ? `\n当前估值区间: ${sellCmp.zoneLabel}，实时价格 ${sellCmp.currentPrice || "暂无"}，FDV ${sellCmp.currentFdv || "暂无"}`
        : "";
      if (sellCmp) {
        return `【当前状态】\n正在评估 ${assetLabel} 的卖出决策。${sellZoneInfo}\n\n【关键证据】\n${evidenceList(agentResults)}\n\n【风险与缺口】\n卖出需考虑税务、仓位占比和替代标的。\n\n【下一步建议】\n${sellCmp.zoneAction}\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。`;
      }
      return `【当前状态】\n正在评估 ${assetLabel} 的卖出决策。${sellZoneInfo}\n\n【关键证据】\n${evidenceList(agentResults)}\n\n【风险与缺口】\n暂无实时估值区间数据。\n\n【下一步建议】\n请先获取实时数据后再做卖出判断。\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。`;
    }
    case "run_monitor":
      return `【当前状态】\n正在对 ${assetLabel} 执行监控检查，获取实时数据并与计划阈值对比。\n\n【关键证据】\n1. 已识别资产：${assetLabel}\n2. 已触发 asset_info + memory Agent\n3. 实时数据与本地计划阈值正在加载中\n\n【风险与缺口】\n尚未获取实时价格、FDV 及计划阈值对比结果。\n\n【下一步建议】\n等待数据返回后，对比实时数据与计划阈值再给出具体建议。\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。`;
    case "refresh_research":
      return `${assetLabel} 研究数据已刷新。${summary}`;
    case "lookup_memory":
      if (slots.assetQuery) {
        return `${assetLabel} 的持仓记录与投资计划：${summary || "已查询，详细信息请稍后查看"}`;
      }
      return "正在调取你的全部投资组合与计划状态...";
    case "lookup_asset_info":
      return summary || `${assetLabel} 的资产信息查询已发起，请等待数据返回。`;
    case "strategy_dialogue":
      return `【当前状态】\n用户正在围绕 ${assetLabel} 进行策略讨论。\n\n【关键证据】\n1. 已识别资产：${assetLabel}\n2. 已触发 memory + asset_info Agent\n3. 本地记忆与市场数据正在加载中\n\n【风险与缺口】\n尚未获取实时价格、FDV 及活跃计划状态。\n\n【下一步建议】\n等待 Agent 返回后，对比实时数据与本地计划阈值再给出具体建议。\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。`;
    case "smalltalk":
      return "我是 Decision Brain 首席决策官。你可以让我：研究某个资产是否值得买、记录你的持仓、查看持仓总览、或确认投资计划。";
    default:
      return "我理解你是在做投资决策讨论，但还需要先定位资产或计划。你可以直接说「我手里的 SOL 还能拿吗」、「按我的 SOL 计划下一步等什么信号」，或先让我查看持仓总览。";
  }
}

function evidenceList(agentResults) {
  const withHeadlines = agentResults.filter((r) => r.headline);
  if (withHeadlines.length === 0) return "1. 数据采集中";
  return withHeadlines.map((r, i) => `${i + 1}. ${r.headline}`).join("\n");
}

async function classifyIntentLLM(message, context = {}) {
  const recentDigest = recentTurnsDigest(context.recentTurns);
  const focusedAsset = context.lastAsset || "";

  const systemPrompt = `You are an investment agent intent classifier. Given a user message (Chinese or English), output ONLY a JSON object:
{
  "intent": "one of: lookup_memory, evaluate_candidate, manage_position, refresh_research, confirm_plan, review_add, review_sell, run_monitor, log_source, archive, get_context, smalltalk, lookup_asset_info, strategy_dialogue, unknown",
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
- strategy_dialogue: open-ended investment discussion, anxiety, hold/add/sell reasoning, plan interpretation, "what should I wait for", "I'm afraid of chasing", "can I still hold it"
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
    if (position.reason) lines.push(`购买理由: ${position.reason}`);
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

  const structuredIntents = ["strategy_dialogue", "evaluate_candidate", "review_add", "review_sell", "run_monitor"];
  const useStructuredFormat = structuredIntents.includes(intent);

  const formatRequirement = useStructuredFormat
    ? `\nREPLY FORMAT REQUIREMENT:\nYou MUST structure your reply using these exact section headers:\n【当前状态】\n... (1-2 sentences describing the current situation)\n\n【关键证据】\n1. ...\n2. ...\n3. ...\n(numbered list of key evidence from agent reports)\n\n【风险与缺口】\n... (what's missing or what could go wrong)\n\n【下一步建议】\n... (actionable next step)\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。\n\nCRITICAL: The last line MUST be exactly "数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。"`
    : `\nREPLY FORMAT: Write a concise reply (2-5 sentences, Chinese). For lookup_asset_info, you MUST end with: "这些数字来自本轮 asset_info trace。"`;

  const systemPrompt = `You are the Chief Investment Officer of Decision Brain, an AI investment committee. Given agent reports, session context, and user intent, write a final recommendation in Chinese. Be specific, reference the agent findings, and end with actionable next step.${formatRequirement}

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

function buildDialogFrame(intent, assetQuery, method, context = {}) {
  const confidence = method === "llm" ? "high"
    : (intent === "unknown" ? "low" : "medium");

  const asset = assetQuery || context.lastAsset || null;

  const situationMap = {
    evaluate_candidate: asset ? `用户正在评估 ${asset} 的投资价值` : "用户正在评估候选资产",
    strategy_dialogue: asset ? `用户正在围绕 ${asset} 做投资策略讨论` : "用户正在进行开放式投资策略讨论",
    manage_position: asset ? `用户正在记录 ${asset} 的持仓信息` : "用户正在记录持仓信息",
    confirm_plan: asset ? `用户正在确认 ${asset} 的投资计划` : "用户正在确认投资计划",
    review_add: asset ? `用户正在评估 ${asset} 的加仓机会` : "用户正在评估加仓机会",
    review_sell: asset ? `用户正在评估 ${asset} 的卖出决策` : "用户正在评估卖出决策",
    run_monitor: asset ? `用户正在检查 ${asset} 的监控状态` : "用户正在检查监控状态",
    lookup_asset_info: asset ? `用户正在查询 ${asset} 的基本信息` : "用户正在查询资产信息",
    lookup_memory: "用户正在查看投资组合与记忆",
    refresh_research: asset ? `用户正在刷新 ${asset} 的研究数据` : "用户正在刷新研究数据",
    smalltalk: "用户正在进行对话寒暄",
    unknown: "用户意图尚不明确",
    log_source: "用户正在记录信息来源",
    archive: "用户正在归档资产",
    get_context: "用户正在获取上下文",
  };

  const nextActionMap = {
    evaluate_candidate: "run_research",
    strategy_dialogue: "compare_plan_with_live_data",
    manage_position: "record_position",
    confirm_plan: "activate_plan",
    review_add: "compare_plan_with_live_data",
    review_sell: "compare_plan_with_live_data",
    run_monitor: "compare_plan_with_live_data",
    lookup_asset_info: "fetch_asset_data",
    lookup_memory: "query_memory",
    refresh_research: "run_research",
    log_source: "record_source",
    archive: "archive_asset",
    get_context: "fetch_context",
    smalltalk: null,
    unknown: null,
  };

  const userSituation = situationMap[intent] || "用户正在进行投资对话";
  const nextAction = nextActionMap[intent] || null;

  const intentsNeedingAsset = new Set([
    "evaluate_candidate", "manage_position", "review_add", "review_sell",
    "confirm_plan", "run_monitor", "lookup_asset_info", "strategy_dialogue",
  ]);

  const shouldAskClarifyingQuestion =
    (intent === "unknown" && !asset) ||
    (intentsNeedingAsset.has(intent) && !asset);

  const missingFields = [];
  if (intentsNeedingAsset.has(intent) && !asset) {
    missingFields.push("assetQuery");
  }
  // Plan XI 1.3: strategy_dialogue always needs activePlan for full context
  if (intent === "strategy_dialogue") {
    missingFields.push("activePlan");
  }

  return {
    intent,
    assetQuery: assetQuery || null,
    confidence,
    userSituation,
    missingFields,
    nextAction,
    shouldAskClarifyingQuestion,
  };
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
  // LLM often misses averageCost/units even when explicitly in the message
  {
    const ruleSlots = extractSlotsRule(message, context, classification.intent);
    if (!classification.slots.assetQuery && ruleSlots.assetQuery) {
      classification.slots.assetQuery = ruleSlots.assetQuery;
    }
    if (!classification.slots.units && ruleSlots.units) {
      classification.slots.units = ruleSlots.units;
    }
    if (!classification.slots.averageCost && ruleSlots.averageCost) {
      classification.slots.averageCost = ruleSlots.averageCost;
    }
    if (!classification.slots.sellPct && ruleSlots.sellPct) {
      classification.slots.sellPct = ruleSlots.sellPct;
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

  // ── Pending position confirmation flow ──────────────────────────
  let pendingPosition = context.pendingPosition || null;
  const isConfirmMsg = /^(确认|是的|对|好|可以|行|confirm|yes|ok|yep|没问题|就这样|确认记录|确认购买)\b/i.test(message.trim());
  const isCancelMsg = /^(取消|不要|算了|cancel|no|不)/i.test(message.trim());

  if (pendingPosition && !pendingPosition.confirmed) {
    if (isCancelMsg) {
      pendingPosition = null; // Discard pending
      classification.intent = "manage_position";
      classification.slots._canceled = true;
    } else if (isConfirmMsg) {
      pendingPosition = { ...pendingPosition, confirmed: true };
      classification.intent = "manage_position";
      classification.slots.assetQuery = pendingPosition.assetQuery;
      classification.slots.units = pendingPosition.units;
      classification.slots.averageCost = pendingPosition.averageCost;
      classification.slots.reason = pendingPosition.reason;
    } else {
      // User provided more info — merge into pending position, keep manage_position intent
      classification.intent = "manage_position";
      const newSlots = extractSlotsRule(message, context, intent);

      // Smart merge: detect what the user is providing
      const plainNumber = message.match(/^[\$￥]?\s*(\d+(?:\.\d+)?)\s*$/);
      const unitsMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:个|枚|u|units)/i);
      const costMatch = message.match(/(?:\d+(?:\.\d+)?)\s*(?:成本|价格|均价|cost|price|元|美元|u)/i);

      let mergedUnits = slots.units || newSlots.units || pendingPosition.units;
      let mergedCost = slots.averageCost ?? newSlots.averageCost ?? pendingPosition.averageCost;
      let mergedReason = pendingPosition.reason || newSlots.reason || null;

      if (unitsMatch && !mergedUnits) {
        // User provided units
        mergedUnits = parseFloat(unitsMatch[1]);
      } else if (plainNumber && mergedCost == null && !mergedReason) {
        // Plain number when cost is missing → treat as cost
        mergedCost = parseFloat(plainNumber[1]);
      } else if (plainNumber && mergedUnits == null) {
        mergedUnits = parseFloat(plainNumber[1]);
      } else if (costMatch && mergedCost == null) {
        mergedCost = parseFloat(costMatch[1]);
      } else if (!mergedReason) {
        // Anything else when reason is missing → treat as reason
        mergedReason = message;
      }

      pendingPosition = {
        ...pendingPosition,
        assetQuery: slots.assetQuery || newSlots.assetQuery || pendingPosition.assetQuery,
        units: mergedUnits,
        averageCost: mergedCost,
        reason: mergedReason,
      };
    }
  }

  // Create pendingPosition for new manage_position requests
  if (!pendingPosition && intent === "manage_position" && slots.assetQuery && !slots._canceled) {
    pendingPosition = {
      assetQuery: slots.assetQuery,
      units: slots.units || null,
      averageCost: slots.averageCost ?? null,
      reason: slots.reason || null,
      confirmed: false,
    };
  }

  // A-VI-2: sell+pct uses reduced fanout to stay under 8s
  // Confirmation/cancellation: skip fanout entirely
  let fanout;
  if (pendingPosition?.confirmed || slots._canceled) {
    fanout = [];
  } else {
    fanout = sellPctFast ? SELL_FAST_FANOUT : planFanout(intent);
  }

  // Pass updated pendingPosition into context for synthesizeRule / synthesizeWithResults
  context.pendingPosition = pendingPosition;

  // A-X-A2: Skip initial LLM synthesis when fanout will run — the result
  // is always replaced by synthesizeWithResults in server.mjs anyway.
  const hasFanout = fanout.length > 0;
  const reply = (degraded || sellPctFast || hasFanout)
    ? synthesizeRule(intent, [], slots, context)
    : (await synthesizeLLM(intent, [], slots, context)) || synthesizeRule(intent, [], slots, context);

  const suggestions = generateSuggestions(intent, slots, context);
  const dispatchPlan = buildDispatchPlan(fanout);
  const dialogFrame = buildDialogFrame(intent, slots.assetQuery, method, context);

  return {
    ok: true,
    intent,
    assetQuery: slots.assetQuery,
    slots,
    fanout,
    dispatchPlan,
    dialogFrame,
    agentResults: [],
    reply,
    suggestions,
    pendingPosition,
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

  // manage_position with fanout results — confirmation preview, evaluate reason
  if (intent === "manage_position" && context.pendingPosition && !context.pendingPosition.confirmed) {
    const pp = context.pendingPosition;
    const agentSummary = agentResults
      .filter((r) => r.headline)
      .map((r) => `${r.role}: ${r.headline}`)
      .join("\n");
    const metrics = extractAssetMetrics(agentResults);

    if (pp.units && pp.averageCost != null && pp.reason) {
      // All info present — show confirmation with reason evaluation
      const priceLine = metrics?.price ? `\n当前市价: ${metrics.price}` : "";
      const mcapLine = metrics?.marketCap ? `\n市值: ${metrics.marketCap}` : "";
      return `${pp.assetQuery} 持仓已记录：${pp.units} 个，成本 $${pp.averageCost}${priceLine}${mcapLine}\n购买理由: ${pp.reason}\n\n委员会研究摘要:\n${agentSummary || "暂无额外研究数据"}\n\n确认以上信息请回复"确认"，取消请回复"取消"。`;
    }

    if (pp.units && pp.averageCost != null && !pp.reason) {
      return `${pp.assetQuery} 持仓已记录：${pp.units} 个，成本 $${pp.averageCost}。\n\n请告诉我你的购买理由是什么？为什么看好 ${pp.assetQuery}？`;
    }

    return synthesizeRule(intent, agentResults, slots, context);
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
