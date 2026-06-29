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
  "sell_execute",
  "run_monitor",
  "log_source",
  "archive",
  "get_context",
  "smalltalk",
  "lookup_asset_info",
  "strategy_dialogue",
  "asset_identity_confirmation",
  "correct_asset_identity",
  "remove_position",
  "reset_portfolio",
  "unknown",
];

const INTENT_FANOUT = {
  evaluate_candidate: ["memory", "macro", "onchain", "sentiment", "technical", "news", "valuation"],
  manage_position: ["memory", "valuation"],
  review_add: ["asset_info", "memory", "valuation", "sentiment", "technical"],
  review_sell: ["asset_info", "memory", "valuation", "sentiment", "technical"],
  sell_execute: ["memory"],
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
  asset_identity_confirmation: [],
  correct_asset_identity: [],
  remove_position: [],
  reset_portfolio: [],
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
  "sell_execute",
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
  const slots = { assetQuery: null, units: null, averageCost: null, sellPct: null, reason: null, correctAssetQuery: null };

  const pctMatch = message.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) slots.sellPct = parseFloat(pctMatch[1]);

  const unitsMatch = message.match(/((?:\d+(?:\.\d+)?)|[一二两三四五六七八九十])\s*(?:个|枚|u|units)/i);
  if (unitsMatch) {
    const v = unitsMatch[1];
    const cn = { '一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };
    slots.units = cn[v] ?? parseFloat(v);
  }

  const costMatch = message.match(/(?:成本|价格|均价|cost|price)\s*[：:=\s]*(\d+(?:\.\d+)?)/i);
  if (costMatch) slots.averageCost = parseFloat(costMatch[1]);

  // Parse "X万" / "Xw" / "X万美元" as cost (e.g., "6万" → 60000, "6.5万" → 65000)
  if (!slots.averageCost) {
    const wanMatch = message.match(/(\d+(?:\.\d+)?)\s*(万|[wW])\s*(?:美元|美金|美|元)?(?:\s|$|，|。|！|？|,|\.|!|\?|$)/);
    if (wanMatch) {
      slots.averageCost = parseFloat(wanMatch[1]) * 10000;
    }
  }

  // Auto-fill cost from lastKnownPrice when user says "now price is my cost"
  if (!slots.averageCost && context.lastPrice != null) {
    if (/(?:现在|当前|目前).*(?:价格|报价).*(?:就是|就是我的|是我的|当成).*(?:成本|买入价|价格)/.test(message) ||
        /(?:价格|报价).*(?:就是|当成|作为).*(?:成本|买入价)/.test(message)) {
      slots.averageCost = context.lastPrice;
    }
  }

  // Extract buying reason after 因为/理由是/看好/觉得/认为
  const reasonMatch = message.match(/(?:因为|理由是|看好|觉得|认为|原因是)[：:\s]*(.+)/i);
  if (reasonMatch) slots.reason = reasonMatch[1].trim();

  // Extract correct ticker for correct_asset_identity: "不是 XMR，是 BTW"
  if (intent === "correct_asset_identity") {
    const correctMatch = message.match(/(?:是|应该是|正确的|才对)\s*([A-Za-z]{2,8})/i);
    if (correctMatch) slots.correctAssetQuery = correctMatch[1].toUpperCase();
  }

  // Extract ticker for asset_identity_confirmation: "确认 BTW"
  if (intent === "asset_identity_confirmation") {
    const confirmMatch = message.match(/确认\s*([A-Za-z0-9]{2,8})/i);
    if (confirmMatch) slots.assetQuery = confirmMatch[1].toUpperCase();
  }

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

  // Panic sell detection: emotional/distress sell expressions
  if (intent === "review_sell") {
    const panicPatterns = [
      /跌.*(?:厉害|惨|麻|疼|怕|慌|急)/,
      /(?:怕|担心|害怕|慌|着急|受不了|扛不住|撑不住).*(?:跌|卖|清|抛|割)/,
      /(?:跌麻|跌怕|跌疼|亏麻|亏怕)/,
      /(?:想|有点想|想要).*(?:卖|清仓|抛|割|止损|走)/,
      /(?:情绪|心态|害怕|焦虑|崩溃).*(?:卖|清|抛)/,
      /(?:受不了|顶不住|熬不住|撑不住).*(?:了|想|要)/,
      /(?:太|很|好|非常).*(?:跌|惨|恐怖|吓人)/,
      /(?:清仓|全卖|全抛|全割|清掉|割肉|斩仓)/,
      /(?:现在|立刻|马上|赶紧).*(?:卖|清|抛|割|出)/,
      /(?:恐慌|暴跌|崩盘|熊市).*(?:卖|清|出|逃)/,
      /(?:帮.*看|帮.*判断).*(?:要不要|该不该|是否).*(?:卖|清|止)/,
    ];
    slots.panicFlag = panicPatterns.some((re) => re.test(message));

    // Planned sell: user explicitly preparing to sell with quantity (not panic, not already executed)
    if (!slots.panicFlag) {
      const plannedPatterns = [
        /准备卖/,
        /打算卖/,
        /计划卖/,
        /想卖掉/,  // without emotional distress
        /想要卖.+(?:个|枚)/,
        /想卖.*\d+\s*(?:个|枚|%)/,  // "想卖 1 个 BTC" (not panic)
      ];
      slots.plannedSellFlag = plannedPatterns.some((re) => re.test(message));
    }
  }

  return slots;
}

function classifyIntentRule(message) {
  const lower = message.toLowerCase();

  if (/你好|hello|hi\b|hey\b|谢谢|thanks|help/.test(lower)) return "smalltalk";

  // Asset identity confirmation: "确认 BTW", "确认 BTC"
  if (/^确认\s*[A-Za-z0-9]{2,8}$/i.test(message.trim())) return "asset_identity_confirmation";

  // Correct asset identity: "不是 XMR，是 BTW", "刚才识别错了", "不是这个"
  if (/(?:不是|不对|错了|识别错|搞错|弄错).*(?:是|应该是|正确的|才对)/.test(lower) ||
      /刚才.*识别.*错/.test(lower) ||
      /(?:不是|不对).*(?:这个|那个)/.test(lower)) return "correct_asset_identity";

  // Reset portfolio: "清空所有资产", "重置全部仓位", "清除整个投资组合"
  // Also fire on confirmation "确认清空" or standalone "清空全部"
  if (/^确认记录卖出$/i.test(message.trim())) return "sell_execute";
  if (/^确认清空$/i.test(message.trim()) || /^确认重置$/i.test(message.trim())) return "reset_portfolio";
  if (/(?:清空|清除|重置|reset|clear).*(?:所有|全部|整个|all|everything|全部|整个)/.test(lower) &&
      /(?:资产|仓位|投资组合|持仓|position|portfolio|asset)/.test(lower)) return "reset_portfolio";
  if (/(?:所有|全部|整个|all|everything).*(?:清空|清除|重置)/.test(lower) &&
      /(?:资产|仓位|投资组合|持仓|position|portfolio|asset|面板)/.test(lower)) return "reset_portfolio";
  if (/(?:重新|重来|从头).*(?:整理|开始|来过)/.test(lower) &&
      /(?:资产|仓位|投资组合|portfolio|全部|所有|整个)/.test(lower)) return "reset_portfolio";

  // Remove position: "删掉", "移除", "删除", "去掉" + asset/position
  if (/(?:删掉|移除|删除|去掉|清理|拿掉).*(?:资产|仓位|那个|这个|那个|错误|刚才)/.test(lower) ||
      /(?:删除|移除).*(?:position|asset|仓位)/.test(lower)) return "remove_position";

  // "你补充一下" / "帮我查" / "你帮我补" → refresh_research (system fills data, not user)
  if (/(?:你|帮我|替我|系统|帮我).*(?:补充|查一下|更新一下|刷新一下|补全|帮忙).*(?:数据|信息|市场|一下|这个|那个|资料)/.test(lower) ||
      /我怎么补充/.test(lower) ||
      /^(?:帮|替|给).*(?:查|补|更新|刷新)/.test(lower)) {
    return "refresh_research";
  }

  // "哪一个？" / "哪个？" → strategy_dialogue (answer previous round's options)
  if (/^哪个[一]?[？?]?$/.test(message.trim()) || /^哪一个[？?]?$/.test(message.trim())) {
    return "strategy_dialogue";
  }

  // Plan XV: fuzzy short messages → strategy_dialogue with context
  // 追问选项型: "这个呢？", "那这个呢？"
  if (/^(这个|那个|那这个|那那个)呢[？?]?$/.test(message.trim())) return "strategy_dialogue";
  // 焦虑安抚型: "我有点慌", "跌麻了", "我受不了了", "撑不住了"
  if (/(?:有点慌|跌麻了|受不[了啦]|撑不住|怕.*跌|慌了|焦虑|紧张|睡不着)/.test(lower) &&
      !/(?:卖|清仓|清掉|抛|割肉|止损|想出)/.test(lower)) return "strategy_dialogue";
  // 焦虑安抚型: "那怎么办？", "该怎么办？", "怎么处理？"
  if (/^(那|这|那现在)?(怎么|咋)(办|搞|处理|弄)[？?]?$/.test(message.trim()) ||
      /该怎么办[？?]?$/.test(message.trim())) return "strategy_dialogue";
  // 信息不足型: "看不懂", "看不懂了", "这啥"
  if (/^(我?看不懂|没看懂|看不明白|这啥|这是啥|什么情况|不太懂|我?看不明白)[！!。.]*$/.test(message.trim())) return "strategy_dialogue";
  // 不想看了/不看了/不想管了 — frustration without explicit sell
  if (/^(我?不想看了|不看了|不想管了|懒得看了|没眼看|不想关注了)[！!。.]*$/.test(message.trim())) return "strategy_dialogue";
  // 信息不足型: "你说人话", "说人话", "说简单点"
  if (/(?:说(?:人话|简单点|通俗点)|用人话|白话|听不懂)/.test(lower)) return "smalltalk";
  // 执行确认型: "直接告诉我", "别废话"
  if (/(?:直接告诉|别废话|讲重点|说重点|干脆点)/.test(lower)) return "strategy_dialogue";

  if (/研究|分析一下|估值|值不值得|evaluate|research|analyze|能不能买|可以买|想买|要买|打算买/.test(lower)) {
    return "evaluate_candidate";
  }

  if (/买了|持有|建仓|开仓|已?买入|bought|hold|记录.*仓|添加.*仓/.test(lower) &&
      /\d+/.test(message)) {
    return "manage_position";
  }

  // Casual口语 buy with quantity: "买一个btc", "买3个sol", "买入btc"
  // Must not collide with evaluate_candidate (想买/要买/打算买 etc. caught above)
  if (/买.*[个只枚\d一二两三四五六七八九十]|买入/.test(lower) &&
      !/研究|值不值得|分析|能不能买|想买|要买|打算买|可以买/.test(lower)) {
    return "manage_position";
  }

  if (/确认|confirm|approve/.test(lower) && /计划|plan/.test(lower)) return "confirm_plan";

  // Add-position recording: quantity-bearing add phrases route to manage_position
  // "加仓 50 个 SOL", "追加 100 个", "补仓 50 个", "买多 20 个"
  if (/(?:又买了|再买了|追加|补仓|买多|加仓|又买|再买|加一点|加点|补一点|补点).*\d/.test(lower) ||
      /\d.*(?:个|枚|u|units).*(?:追加|补仓|买多|加仓)/.test(lower)) {
    return "manage_position";
  }

  // "修正" / "改成" / "更正" — replace (not add), route to manage_position
  if (/(?:修正|改成|更正|修改|不是追加|实际是).*(?:持仓|仓位|资产|成本|个数|数量|价格)/.test(lower) ||
      /把.*(?:持仓|仓位|资产).*(?:修正|改成|更正|修改)/.test(lower)) {
    return "manage_position";
  }

  // review_add: asking whether to add (no quantity in message)
  if (/(?:加仓|加不加|能加|可以加|add.*position|increase)/.test(lower) && !/\d/.test(message)) return "review_add";

  // sell_execute: user has already sold, wants to record it
  // "我已经卖了 1 个 BTC", "卖了 1 个 BTC，记录", "已经卖出了"
  if (/(?:已经卖了|已经卖出|卖了.*记录|已?卖出了|已售出|sold)/.test(lower) && /\d/.test(message)) {
    return "sell_execute";
  }

  // panic / emotional sell expressions → review_sell (do NOT change position)
  // "我有点想卖", "跌得好厉害想卖", "恐慌", "受不了了"
  if (/(?:有点想卖|想.*卖|恐慌|受不了|撑不住|害怕|担心.*卖|跌.*想卖|跌.*卖|亏.*卖)/.test(lower)) {
    return "review_sell";
  }

  if (/卖|减仓|清仓|止盈|止损|sell|reduce|exit/.test(lower)) return "review_sell";

  if (/刷新|refresh|更新.*数据|重新.*查/.test(lower)) return "refresh_research";

  // Dialog continuity: user asks system to supplement data
  if (/(?:你|系统|帮我|替我).*(?:补充|补上|补齐|查一下|查查)/.test(lower) ||
      /(?:补充|补上|补齐).*(?:一下|数据|信息|研究)/.test(lower) ||
      /我怎么补充/.test(lower)) return "refresh_research";

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

  // Short dialog continuity: user asks "which one" after system suggestions
  if (/^(哪一个|哪个|选哪个|哪一个呢)\s*[？?]?\s*$/i.test(message.trim())) return "strategy_dialogue";

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

// Panic sell guardrail: 5-part reply that references original thesis, plan boundaries, and floor rules
async function buildPanicSellReply(assetQuery, position, plan, valuationModel, currentPrice) {
  const assetLabel = assetQuery || "该资产";
  const units = position?.units ?? "?";
  const avgCost = position?.averageCost != null ? `$${position.averageCost}` : "未知";
  const reason = position?.reason || null;
  const thesis = valuationModel?.thesis || [];
  const sellZone = plan?.sellZone || "未设定";
  const floorRule = plan?.userFloorRule || plan?.floorRule;
  const floorUnits = floorRule?.minimumUnits;
  const thesisInvalidators = plan?.thesisInvalidators || [];

  // Plan XVI: investment goal fields from plan
  const investmentGoal = plan?.investmentGoal || null;
  const targetUnits = plan?.targetUnits ?? null;
  const originalThesis = plan?.originalThesis || reason || null;

  const priceLine = currentPrice != null ? `当前价格 $${currentPrice}` : "";
  const costLine = `平均成本 ${avgCost}`;
  const unrealized = currentPrice != null && position?.averageCost != null
    ? `${(((currentPrice - position.averageCost) / position.averageCost) * 100).toFixed(1)}%`
    : null;

  // Part 1: 先别急着执行
  let reply = `【先别急着执行】\n`;
  reply += `你持有 ${assetLabel} ${units} 个，${costLine}。${priceLine}${unrealized ? `，浮动 ${unrealized}` : ""}。\n`;
  reply += `在做出卖出决定之前，请先回看你的原始投资逻辑。市场下跌时的情绪化操作是散户亏损的主要原因。\n`;

  // Plan XVI: show goal progress when target is set
  if (targetUnits != null) {
    const goalLabel = investmentGoal || `囤 ${targetUnits} 个 ${assetLabel}`;
    reply += `\n你原来的目标是：${goalLabel}。\n`;
    reply += `当前进度是：${units} / ${targetUnits}${typeof units === "number" && units >= targetUnits ? " (已达标)" : ""}。\n`;
  }

  // Part 2: 回看你最初的投资逻辑
  reply += `\n【回看你最初的投资逻辑】\n`;
  if (originalThesis) {
    reply += `你最初的投资逻辑是：${originalThesis}\n`;
  } else if (thesis.length > 0) {
    reply += `你为 ${assetLabel} 设定的 thesis：${thesis.join("；")}\n`;
  } else {
    reply += `我还没有你的原始投资逻辑。如果你补充一条 thesis，我能更准确地判断当前下跌是否改变了基本面。\n`;
  }

  // Plan XVI: thesis validity question
  reply += `\n现在需要先判断：这个 thesis 是否失效？\n`;
  if (thesisInvalidators.length > 0) {
    reply += `你此前设定的 thesis 失效条件：${thesisInvalidators.join("；")}\n`;
  }
  reply += `如果只是短期价格下跌，而 thesis 没有失效，这更像恐慌卖出。\n`;

  // Part 3: 计划边界
  reply += `\n【计划边界】\n`;
  if (plan && plan.status === "active") {
    reply += `你的 ${assetLabel} 投资计划当前为 active 状态。\n`;
    if (sellZone) reply += `卖出区设定：${sellZone}\n`;
    if (floorUnits != null) reply += `底仓要求：至少保留 ${floorUnits} 个 ${assetLabel}\n`;
    if (plan.monitoringPolicy?.sellThresholdPct != null) {
      reply += `监控减仓阈值：${plan.monitoringPolicy.sellThresholdPct}%\n`;
    }
  } else {
    reply += `${assetLabel} 暂无 active 投资计划，缺少卖出边界参考。建议先确认计划，再做卖出决策。\n`;
  }

  // Part 4: 什么情况才该卖
  reply += `\n【什么情况才该卖】\n`;
  reply += `卖出决策应该基于 thesis 是否被破坏，而不是短期价格波动。以下情况才应认真考虑卖出：\n`;
  reply += `1. 你的投资逻辑已经不成立（thesis invalidated）\n`;
  reply += `2. 估值已进入你设定的卖出区${sellZone !== "未设定" ? `（${sellZone}）` : ""}\n`;
  reply += `3. 仓位占比过大，需要分散风险\n`;
  reply += `4. 发现了更值得配置的替代标的\n`;

  // Part 5: 克制选项 (Plan XVI: numbered options)
  reply += `\n【现在建议】\n`;
  if (originalThesis || thesis.length > 0) {
    reply += `1. 暂不卖，先按原计划观察\n`;
    if (floorUnits != null && units !== "?" && units > floorUnits) {
      reply += `2. 如果必须降风险，只卖小比例，至少保留 ${floorUnits} 个底仓\n`;
      reply += `3. 设置复查条件，而不是情绪化清仓\n`;
    } else {
      reply += `2. 如果必须操作，设置复查条件而不是情绪化卖出\n`;
      reply += `3. 冷静后重新评估 thesis 和估值区间\n`;
    }
  } else {
    reply += `1. 先补一条投资 thesis，再做卖出判断\n`;
    reply += `2. 在没有 thesis 的情况下，暂不做大幅卖出操作\n`;
    reply += `3. 可以设定一个价格或时间条件来复查\n`;
  }
  reply += `\n\n数据来源：Decision Brain 本地记忆。以上不是自动交易指令，不构成投资建议。`;

  return reply;
}

// Planned sell boundary check: verify floor rules and plan boundaries before allowing execution
function buildPlannedSellReply(assetLabel, position, plan, slots) {
  const currentUnits = position?.units ?? "?";
  const floorRule = plan?.userFloorRule || plan?.floorRule;
  const floorUnits = floorRule?.minimumUnits;
  const sellUnits = slots.units ?? null;
  const sellPct = slots.sellPct ?? null;
  const planStatus = plan?.status || "none";

  let lines = [];
  lines.push(`【先确认计划边界】`);
  lines.push(`你准备卖出 ${assetLabel}，当前持仓 ${currentUnits} 个。`);

  if (floorUnits != null && typeof currentUnits === "number" && sellUnits != null) {
    const remainingAfter = currentUnits - sellUnits;
    if (remainingAfter < floorUnits) {
      lines.push(`\n警示：本次卖出后剩余 ${remainingAfter} 个，低于底仓要求 ${floorUnits} 个。`);
      lines.push(`底仓理由：${floorRule?.reason || "保留长期底仓"}`);
      lines.push(`建议将卖出数量控制在 ${currentUnits - floorUnits} 个以内。`);
    } else {
      lines.push(`卖出后剩余 ${remainingAfter} 个，不低于底仓 ${floorUnits} 个，数量上可以通过。`);
    }
  } else if (sellPct != null && typeof currentUnits === "number" && floorUnits != null) {
    const sellAmount = Math.round(currentUnits * sellPct / 100);
    const remainingAfter = currentUnits - sellAmount;
    if (remainingAfter < floorUnits) {
      lines.push(`\n警示：卖出 ${sellPct}% 后剩余约 ${remainingAfter} 个，低于底仓 ${floorUnits} 个。`);
      lines.push(`建议降低卖出比例。`);
    }
  }

  if (planStatus === "archived") {
    lines.push(`\n该资产投资计划已归档，建议先确认是否重新激活后再操作。`);
  } else if (planStatus === "draft") {
    lines.push(`\n该资产投资计划仍为 draft 状态。建议先确认计划，再按计划执行卖出。`);
  }

  // Check thesis — from plan
  const originalThesis = plan?.originalThesis || position?.reason || null;
  if (originalThesis) {
    lines.push(`\n【回看投资逻辑】`);
    lines.push(`你的原始 thesis：${originalThesis}`);
    lines.push(`在卖出前，请确认这个 thesis 是否仍然成立。如果 thesis 仍然有效，这次卖出是否只是短期市场波动驱动的？`);
  }

  lines.push(`\n【下一步】`);
  lines.push(`1. 确认底仓和计划边界检查通过`);
  lines.push(`2. 确认 thesis 状态`);
  lines.push(`3. 如果确认要卖出，请说"我已经卖了 ${assetLabel}"，我会进入记录确认流程`);

  lines.push(`\n\n数据来源：Decision Brain 本地记忆。以上不是自动交易指令。`);

  return lines.join("\n");
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
      const reason = (slots.reason || pp?.reason) || null;

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
      if (slots.panicFlag) {
        return `【先别急着执行】\n你正在考虑卖出 ${assetLabel}。在做出决定之前，请先回看你的原始投资目标和计划边界。\n\n【回看你最初的投资逻辑】\n请检查你当初为什么投资 ${assetLabel}，这个理由是否依然成立。如果只是短期价格下跌而 thesis 没有失效，这更像恐慌卖出。\n\n【计划边界】\n请确认你的 ${assetLabel} 投资计划中设定的卖出区和底仓规则。\n\n【建议】\n1. 暂不卖，先按原计划观察\n2. 如果必须降风险，只卖小比例\n3. 设置复查条件，而不是情绪化清仓\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。`;
      }
      if (slots.plannedSellFlag) {
        const sellQty = slots.units ? ` ${slots.units} 个` : (slots.sellPct ? ` ${slots.sellPct}%` : "");
        return `【先确认计划边界】\n你准备卖出 ${assetLabel}${sellQty}。在记录执行之前，请先检查：\n\n1. 当前底仓要求是否允许这次卖出\n2. 卖出后剩余仓位是否低于计划设定的最低持有量\n3. 这次卖出是否在你的投资计划卖出区内\n4. 你的原始 thesis 是否仍然有效\n\n请确认以上检查通过后再执行。如果确认要卖出，请说"我已经卖了${sellQty ? ` ${assetLabel}` : ""}"，我会进入记录确认流程。\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。`;
      }
      if (sellCmp) {
        return `【当前状态】\n正在评估 ${assetLabel} 的卖出决策。${sellZoneInfo}\n\n【关键证据】\n${evidenceList(agentResults)}\n\n【风险与缺口】\n卖出需考虑税务、仓位占比和替代标的。\n\n【下一步建议】\n${sellCmp.zoneAction}\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。`;
      }
      return `【当前状态】\n正在评估 ${assetLabel} 的卖出决策。${sellZoneInfo}\n\n【关键证据】\n${evidenceList(agentResults)}\n\n【风险与缺口】\n暂无实时估值区间数据。\n\n【下一步建议】\n请先获取实时数据后再做卖出判断。\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。`;
    }
    case "sell_execute": {
      const soldUnits = slots.units || 0;
      const sellPct = slots.sellPct;
      const qtyStr = soldUnits > 0 ? ` ${soldUnits} 个` : (sellPct ? ` ${sellPct}%` : "");
      return `【当前状态】\n你已卖出 ${assetLabel}${qtyStr}。要记录这笔卖出吗？记录后你的 ${assetLabel} 持仓数量和成本将自动更新。\n\n请回复"确认记录卖出"来写入，或回复"取消"。\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。`;
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
    case "asset_identity_confirmation": {
      const confirmAsset = slots.assetQuery || context.pendingAssetConfirmation?.originalInput || "该资产";
      return `已确认 ${confirmAsset} 的身份，正在将仓位写入你的投资组合。`;
    }
    case "correct_asset_identity": {
      const wrongAsset = slots.assetQuery || context.pendingAssetConfirmation?.resolvedSymbol || "该资产";
      const correctAsset = slots.correctAssetQuery || context.pendingAssetConfirmation?.originalInput || "该资产";
      return `已理解：不是 ${wrongAsset}，而是 ${correctAsset}。正在修正资产身份并更新仓位。`;
    }
    case "remove_position": {
      const removeAsset = slots.assetQuery || context.lastAsset || "该资产";
      return `正在从你的资产面板中移除 ${removeAsset}。相关记录会归档保留，可随时恢复。`;
    }
    case "reset_portfolio": {
      if (slots._canceled) return "已取消清空操作。你的所有资产和仓位保持不变。";
      return `正在清空你的全部资产面板与仓位记录。所有数据将被彻底清除，不可恢复。请回复"确认清空"继续，回复"取消"放弃。`;
    }
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
  "intent": "one of: lookup_memory, evaluate_candidate, manage_position, refresh_research, confirm_plan, review_add, review_sell, run_monitor, log_source, archive, get_context, smalltalk, lookup_asset_info, strategy_dialogue, asset_identity_confirmation, correct_asset_identity, remove_position, reset_portfolio, unknown",
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
- reset_portfolio: user wants to clear/reset ALL assets and positions (NOT single-asset removal). Keywords: 清空所有资产, 全部清空, 重置投资组合, 清除所有仓位, clear all, reset portfolio
- smalltalk: greeting, thanks, chitchat

CRITICAL session context — use this to resolve pronouns ("it", "this", "that") and intent continuity:
<focused_asset>${focusedAsset || "none"}</focused_asset>
<recent_turns>
${recentDigest || "(no history)"}
</recent_turns>

When the user says "it", "this coin", "that asset" without naming a ticker, use <focused_asset> as the assetQuery.
When the user asks "can I add more", "should I sell half" without naming an asset, refer to <focused_asset>.

RESEARCH DEDUP (CRITICAL):
- If the user asks "研究 X 是否值得买", "X 值不值得买", "X 能买吗", "判断X", and the session context shows X was just researched (lookup_asset_info with the same asset), you MUST output intent=evaluate_candidate, NOT intent=lookup_asset_info.
- If the user says "刚才查过 BTC 了" or similar, and asks for a judgment, output intent=evaluate_candidate with that asset.

CONTEXT CONTINUITY — SHORT SENTENCES (CRITICAL):
- "买一个", "先买一个", "买一个吧", "直接买一个", "那就买一个", "不想看了直接买一个吧", "不想看了买一个" with no ticker → intent=manage_position, assetQuery=<focused_asset>, units=1
- "买N个" or "买N只" (e.g. "买两个", "买3个") → intent=manage_position, assetQuery=<focused_asset>, units=N
- "现在的价格就是我的成本", "现价买入", "市价成本" → intent=manage_position (fill cost from latest price)
- "你补充一下", "帮我补充数据", "帮我查一下", "系统补充" → intent=refresh_research, assetQuery=<focused_asset>
- "哪一个?", "哪个?" → intent=strategy_dialogue (user is asking to choose from options in previous reply)
- "确认" or "确认。" when recent_turns show a pending position → intent=manage_position (confirming the pending position)
- "确认计划" or "确认 X 投资计划" → intent=confirm_plan
- "就这样", "可以", "行", "好" when a confirmation question was just asked → use the intent from recent_turns`;

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

export function synthesizeAssetInfoRule(agentResults, slots, context = {}) {
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

  // Extract actual research data from agent sources for the LLM to cite
  const researchData = agentResults
    .filter((r) => r.data?.findings?.length || r.data?.sources?.length)
    .map((r) => {
      const roleLabel = AGENT_DISPATCH_META[r.role]?.label || r.role;
      const claims = (r.data?.findings || []).slice(0, 3);
      if (claims.length > 0) {
        return `[${roleLabel}]\n${claims.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}`;
      }
      // Fallback: extract keyClaim from sources
      const srcClaims = (r.data?.sources || [])
        .map((s) => s.keyClaim)
        .filter(Boolean)
        .slice(0, 3);
      if (srcClaims.length > 0) {
        return `[${roleLabel}]\n${srcClaims.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}`;
      }
      return null;
    })
    .filter(Boolean)
    .join("\n\n");

  // Extract source URLs for clickable links
  const sourceUrls = agentResults
    .filter((r) => r.data?.sourceUrls?.length)
    .flatMap((r) => r.data.sourceUrls)
    .filter(Boolean)
    .slice(0, 5);

  const sourceUrlsBlock = sourceUrls.length > 0
    ? [
        `SOURCE LINKS (include these as clickable markdown links in your reply):`,
        sourceUrls.map((s, i) => `  ${i + 1}. [${s.title || "来源链接"}](${s.url})`).join("\n"),
        ``,
        `CRITICAL: When citing a specific fact or claim, include the corresponding source link as a markdown hyperlink. For example: "根据[来源标题](https://...)，CPI数据..."`,
        `Do NOT use generic phrases like "N条来源显示". Instead, cite specific sources with their links.`,
      ].join("\n")
    : "";

  const researchBlock = researchData || sourceUrlsBlock
    ? [
        `RESEARCH DATA (actual findings from agents — cite these, do NOT fabricate):`,
        researchData || "(no structured findings available)",
        ``,
        sourceUrlsBlock,
        ``,
        `CRITICAL: Use the specific numbers, trends, and facts above in your reply.`,
        `If a section above only has generic placeholders like "数据已刷新", acknowledge the gap.`,
        `When source links are provided, you MUST include them as markdown links in your reply.`,
      ].join("\n")
    : "";

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

DEDUP INSTRUCTION:
If the session context indicates the same asset was just researched (lookup_asset_info or evaluate_candidate for the same ticker in recent turns): do NOT repeat basic price/market cap/FDV info. Instead, use a bridging sentence like "刚才已经查过 X 的基础信息，这一轮我直接判断是否值得买。" Only reference price briefly if needed (e.g. "当前仍在约 $X 附近"). Advance the conversation — don't re-deliver what was already said.

CONTEXT CONTINUITY (CRITICAL):
- When the user asks "值得买吗"/"能不能买"/"可以买吗" right after researching the same asset, you MUST directly give a buy/sell judgment based on the research data you already have. Do NOT say "建议先研究" or trigger another research cycle.
- The session context shows what was already covered. Build on it, don't restart.`;

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

${metricsBlock ? `${metricsBlock}\n` : ""}${context._planComparisonBlock ? `${context._planComparisonBlock}\n` : ""}${researchBlock ? `${researchBlock}\n` : ""}Agent Reports:
${agentSummary || "No agent reports available."}

FUZZY MESSAGE STYLES:
When the user's message is short, emotional, or vague, adapt your reply style:
- "哪一个?" "这个呢?" → Give 2-3 options based on previous context. Be concise.
- "我有点慌" "跌麻了" "受不了了" → Acknowledge emotion first ("我理解你现在很焦虑"), then ground in data. Do NOT output a full 4-section report. Instead, check their original thesis and goal progress.
- "不想看了" "不看了" "没眼看" → Acknowledge the frustration. Remind them of their original goal and thesis. Ask if they want to step away temporarily or need a specific check. Don't jump to sell advice.
- "看不懂" "你说人话" "说简单点" → Translate the previous analysis into 1-2 plain sentences. No jargon.
- "直接告诉我" "别废话" → Give the bottom line in one sentence. Skip 【关键证据】 and 【风险与缺口】.
- "那怎么办" "该怎么办" → Give actionable next step. Reference existing plan if available.`;

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
    sell_execute: asset ? `用户已经卖出 ${asset}，要求记录` : "用户已经卖出资产，要求记录",
    run_monitor: asset ? `用户正在检查 ${asset} 的监控状态` : "用户正在检查监控状态",
    lookup_asset_info: asset ? `用户正在查询 ${asset} 的基本信息` : "用户正在查询资产信息",
    lookup_memory: "用户正在查看投资组合与记忆",
    refresh_research: asset ? `用户正在刷新 ${asset} 的研究数据` : "用户正在刷新研究数据",
    smalltalk: "用户正在进行对话寒暄",
    unknown: "用户意图尚不明确",
    log_source: "用户正在记录信息来源",
    archive: "用户正在归档资产",
    get_context: "用户正在获取上下文",
    asset_identity_confirmation: asset ? `用户正在确认 ${asset} 的资产身份` : "用户正在确认资产身份",
    correct_asset_identity: "用户正在修正资产身份识别",
    remove_position: asset ? `用户正在移除 ${asset} 的仓位` : "用户正在移除仓位",
    reset_portfolio: "用户正在清空全部资产与仓位",
  };

  const nextActionMap = {
    evaluate_candidate: "run_research",
    strategy_dialogue: "compare_plan_with_live_data",
    manage_position: "record_position",
    confirm_plan: "activate_plan",
    review_add: "compare_plan_with_live_data",
    review_sell: "compare_plan_with_live_data",
    sell_execute: "record_sell_execution",
    run_monitor: "compare_plan_with_live_data",
    lookup_asset_info: "fetch_asset_data",
    lookup_memory: "query_memory",
    refresh_research: "run_research",
    log_source: "record_source",
    archive: "archive_asset",
    get_context: "fetch_context",
    asset_identity_confirmation: "confirm_asset_identity",
    correct_asset_identity: "correct_asset_identity",
    remove_position: "remove_position",
    reset_portfolio: "reset_portfolio",
    smalltalk: null,
    unknown: null,
  };

  const userSituation = situationMap[intent] || "用户正在进行投资对话";
  const nextAction = nextActionMap[intent] || null;

  const intentsNeedingAsset = new Set([
    "evaluate_candidate", "manage_position", "review_add", "review_sell",
    "sell_execute", "confirm_plan", "run_monitor", "lookup_asset_info", "strategy_dialogue",
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

  // When pendingAssetConfirmation exists, prefer rule-based intent for identity confirmation/correction
  if (context.pendingAssetConfirmation && !context.pendingAssetConfirmation.confirmed) {
    const ruleClassification = classifyIntent(message, context);
    if (ruleClassification.intent === "asset_identity_confirmation" || ruleClassification.intent === "correct_asset_identity" || ruleClassification.intent === "remove_position") {
      classification = ruleClassification;
    }
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

  // Conflict resolution: When rule-based classifier detects a strong buy/position
  // or refresh signal that the LLM missed (common with short context-dependent
  // messages like "买一个", "你补充一下"), prefer the rule-based result.
  if (!degraded && classification.method !== "rule") {
    const ruleClassification = classifyIntent(message, context);
    const ruleIsManagePosition = ruleClassification.intent === "manage_position";
    const ruleIsRefreshResearch = ruleClassification.intent === "refresh_research";

    const llmMissedBuy = ruleIsManagePosition &&
      (classification.intent === "strategy_dialogue" || classification.intent === "evaluate_candidate" || classification.intent === "unknown") &&
      ruleClassification.slots.assetQuery;

    const llmMissedRefresh = ruleIsRefreshResearch &&
      (classification.intent === "smalltalk" || classification.intent === "unknown" || classification.intent === "strategy_dialogue");

    if (llmMissedBuy || llmMissedRefresh) {
      classification = {
        intent: ruleClassification.intent,
        slots: { ...ruleClassification.slots, ...classification.slots },
        method: "rule_override",
      };
    }

    // Plan XV dedup: same asset was just researched → upgrade follow-up to evaluate_candidate
    const prevResearch = context.lastResearchSummary;
    if (prevResearch && prevResearch.assetQuery) {
      const targetAsset = prevResearch.assetQuery;
      const prevBasicInfo = prevResearch.lastBasicInfoAt;
      const isFollowUp = /值得买|能买吗|能不能买|要不要买|该不该买|买不买|值得投|可以买|判断.*值|分析.*值|估值|建仓/.test(message);
      const llmDroppedToBasic = classification.intent === "lookup_asset_info" && classification.slots.assetQuery === targetAsset;
      const llmDroppedToUnknown = classification.intent === "unknown" && classification.slots.assetQuery === targetAsset;
      if (prevBasicInfo && isFollowUp && (llmDroppedToBasic || llmDroppedToUnknown)) {
        classification = {
          intent: "evaluate_candidate",
          slots: { ...classification.slots, assetQuery: targetAsset },
          method: "rule_override",
        };
      }
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
  // Strip trailing punctuation for confirmation/cancellation matching (Chinese 。！？ and English .!?)
  const msgNoPunct = message.trim().replace(/[。！？.!?\s]+$/g, "");
  const isConfirmMsg = /^(确认|是的|对|好|可以|行|confirm|yes|ok|yep|没问题|就这样|确认记录|确认购买|确认记录卖出)$/i.test(msgNoPunct);
  const isCancelMsg = /^(取消|不要|算了|cancel|no|不)$/i.test(msgNoPunct);

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
    } else if (slots.assetQuery && pendingPosition.assetQuery &&
               slots.assetQuery.toUpperCase() !== pendingPosition.assetQuery.toUpperCase()) {
      // User switched to a different asset — discard old pending, start fresh
      pendingPosition = null;
    } else {
      // User provided more info — merge into pending position, keep manage_position intent
      classification.intent = "manage_position";
      const newSlots = extractSlotsRule(message, context, intent);

      // Smart merge: detect what the user is providing
      // Parse numbers with Chinese/English unit suffixes: 5万→50000, 3.5w→35000, 2k→2000, 1.5亿→150M
      function parseLenientNumber(s) {
        const m = s.match(/^[\$￥]?\s*(\d+(?:\.\d+)?)\s*(万|[wW]|[kK]|[mM]|亿)?\s*$/);
        if (!m) return null;
        let v = parseFloat(m[1]);
        const suffix = m[2];
        if (suffix === "万" || suffix === "w" || suffix === "W") v *= 10000;
        else if (suffix === "k" || suffix === "K") v *= 1000;
        else if (suffix === "m" || suffix === "M") v *= 1000000;
        else if (suffix === "亿") v *= 100000000;
        return v;
      }
      const plainNumber = parseLenientNumber(message);
      const unitsMatch = message.match(/((?:\d+(?:\.\d+)?)|[一二两三四五六七八九十])\s*(?:个|枚|u|units)/i);
      const costMatch = message.match(/(?:\d+(?:\.\d+)?)\s*(?:万|[wW]|[kK])?\s*(?:成本|价格|均价|cost|price|元|美元|u)|(?:成本|价格|均价|cost|price)\s*[：:=\s]*(\d+(?:\.\d+)?)/i);

      let mergedUnits = slots.units || newSlots.units || pendingPosition.units;
      let mergedCost = slots.averageCost ?? newSlots.averageCost ?? pendingPosition.averageCost;
      let mergedReason = pendingPosition.reason || newSlots.reason || null;

      // When cost is still missing, prioritize treating any number-like input as cost
      const needsCost = mergedUnits != null && mergedCost == null;

      // Auto-fill cost from lastKnownPrice when user says price-is-my-cost
      if (mergedCost == null && context.lastPrice != null) {
        const isPriceAsCostMsg = /(?:现在|当前|目前).*(?:价格|报价).*(?:就是|就是我的|是我的|当成).*(?:成本|买入价|价格)/.test(message) ||
          /(?:价格|报价).*(?:就是|当成|作为).*(?:成本|买入价)/.test(message) ||
          /(?:现价|市价|当前价).*(?:买|成本|入)/.test(message) ||
          /(?:就按|就按现在|就用).*(?:现在|当前|市场|市价).*(?:价格|价)/.test(message);
        if (isPriceAsCostMsg) {
          mergedCost = context.lastPrice;
        }
      }

      if (unitsMatch && !mergedUnits) {
        // User provided units (supports Chinese numerals like 一/两)
        const cnUnits = { '一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };
        mergedUnits = cnUnits[unitsMatch[1]] ?? parseFloat(unitsMatch[1]);
      } else if (needsCost && plainNumber != null) {
        // Pending position is waiting for cost → number-like input is cost, not reason
        mergedCost = plainNumber;
      } else if (plainNumber != null && mergedCost == null && !mergedReason) {
        mergedCost = plainNumber;
      } else if (plainNumber != null && mergedUnits == null) {
        mergedUnits = plainNumber;
      } else if (costMatch && mergedCost == null) {
        mergedCost = parseFloat(costMatch[1] || costMatch[2]);
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

  // ── Pending reset confirmation flow ──────────────────────────
  let pendingResetConfirmation = context.pendingResetConfirmation || null;
  if (pendingResetConfirmation) {
    if (isCancelMsg) {
      pendingResetConfirmation = null;
      classification.intent = "reset_portfolio";
      classification.slots._canceled = true;
    } else if (isConfirmMsg) {
      classification.intent = "reset_portfolio";
      pendingResetConfirmation = null;
    } else {
      // User said something else while reset is pending — treat as unrelated
      pendingResetConfirmation = null;
    }
  }
  if (classification.intent === "reset_portfolio" && !isConfirmMsg && !isCancelMsg) {
    pendingResetConfirmation = true;
  }

  // ── Pending asset confirmation flow ──────────────────────────
  let pendingAssetConfirmation = context.pendingAssetConfirmation || null;

  if (pendingAssetConfirmation && !pendingAssetConfirmation.confirmed) {
    if (intent === "asset_identity_confirmation") {
      // User confirmed the asset identity (e.g. "确认 BTW")
      pendingAssetConfirmation = { ...pendingAssetConfirmation, confirmed: true };
      // Treat as manage_position with the original input
      classification.intent = "manage_position";
      classification.slots.assetQuery = pendingAssetConfirmation.originalInput;
      classification.slots.units = pendingAssetConfirmation.units;
      classification.slots.averageCost = pendingAssetConfirmation.averageCost;
    } else if (intent === "correct_asset_identity") {
      // User corrected: "不是 XMR，是 BTW"
      const correctTicker = slots.correctAssetQuery || pendingAssetConfirmation.originalInput;
      pendingAssetConfirmation = {
        ...pendingAssetConfirmation,
        confirmed: true,
        originalInput: correctTicker,
        resolvedSymbol: correctTicker,
      };
      classification.intent = "manage_position";
      classification.slots.assetQuery = correctTicker;
      classification.slots.units = pendingAssetConfirmation.units;
      classification.slots.averageCost = pendingAssetConfirmation.averageCost;
    } else if (intent === "remove_position") {
      // User wants to remove the pending asset
      pendingAssetConfirmation = null;
    } else if (isCancelMsg) {
      pendingAssetConfirmation = null;
    } else {
      // User said something else — keep pending but reclassify
      // Don't override the pending confirmation
    }
  }

  // ── Pending sell execution flow ────────────────────────────────
  let pendingSellExecution = context.pendingSellExecution || null;
  if (pendingSellExecution && !pendingSellExecution.confirmed) {
    if (isCancelMsg) {
      pendingSellExecution = null;
      classification.intent = "sell_execute";
      classification.slots._canceled = true;
    } else if (intent === "sell_execute" && isConfirmMsg) {
      pendingSellExecution = { ...pendingSellExecution, confirmed: true };
    }
  }

  // Create pendingSellExecution for new sell_execute requests
  if (!pendingSellExecution && intent === "sell_execute" && slots.assetQuery && !slots._canceled) {
    pendingSellExecution = {
      assetQuery: slots.assetQuery,
      units: slots.units || null,
      sellPct: slots.sellPct || null,
      confirmed: false,
    };
  }

  // A-VI-2: sell+pct uses reduced fanout to stay under 8s
  // Confirmation/cancellation: skip fanout entirely
  let fanout;
  if (pendingPosition?.confirmed || slots._canceled) {
    fanout = [];
  } else {
    fanout = sellPctFast ? SELL_FAST_FANOUT : planFanout(classification.intent);
  }

  // Pass updated pendingPosition / pendingSellExecution into context
  context.pendingPosition = pendingPosition;
  context.pendingSellExecution = pendingSellExecution;

  // A-X-A2: Skip initial LLM synthesis when fanout will run — the result
  // is always replaced by synthesizeWithResults in server.mjs anyway.
  const hasFanout = fanout.length > 0;
  // Fanout-free intents that always use rule synthesis (no LLM needed):
  const forceRule = intent === "reset_portfolio";
  const reply = (degraded || sellPctFast || hasFanout || forceRule)
    ? synthesizeRule(intent, [], slots, context)
    : (await synthesizeLLM(intent, [], slots, context)) || synthesizeRule(intent, [], slots, context);

  const suggestions = generateSuggestions(intent, slots, context);
  const dispatchPlan = buildDispatchPlan(fanout);
  const dialogFrame = buildDialogFrame(intent, slots.assetQuery, method, context);

  const prevResearch = context.lastResearchSummary;
  const lastResearchSummary = buildLastResearchSummary(intent, slots.assetQuery, reply, prevResearch);

  return {
    ok: true,
    intent: classification.intent,
    assetQuery: classification.slots.assetQuery,
    slots: classification.slots,
    fanout,
    dispatchPlan,
    dialogFrame,
    agentResults: [],
    reply,
    suggestions,
    pendingPosition,
    pendingAssetConfirmation,
    pendingResetConfirmation,
    pendingSellExecution,
    lastResearchSummary,
    degraded: degraded || method === "rule",
    ruleOnly: isRuleOnly(),
    sessionId,
  };
}


function buildLastResearchSummary(intent, assetQuery, reply, prev) {
  const researchIntents = new Set(['lookup_asset_info', 'evaluate_candidate', 'refresh_research', 'review_add', 'review_sell']);
  if (!assetQuery || !researchIntents.has(intent)) return prev || null;

  const now = new Date().toISOString();
  const facts = extractResearchFacts(reply, intent);
  const nextStep = extractNextStep(reply);

  return {
    assetQuery,
    lastBasicInfoAt: intent === 'lookup_asset_info' ? now : (prev?.lastBasicInfoAt || null),
    lastDecisionAnalysisAt: intent === 'evaluate_candidate' || intent === 'review_add' || intent === 'review_sell' ? now : (prev?.lastDecisionAnalysisAt || null),
    lastMentionedFacts: facts || prev?.lastMentionedFacts || '',
    lastSuggestedNextStep: nextStep || prev?.lastSuggestedNextStep || '',
  };
}

function extractResearchFacts(reply, intent) {
  if (!reply) return "";
  if (intent === "lookup_asset_info") {
    const m = reply.match(/当前价格[:：]?\s*\$?\s*[\d,.]+[KMB]?/i);
    return m ? m[0] : reply.slice(0, 200).replace(/\n/g, " ");
  }
  const evidenceMatch = reply.match(/【关键证据】\s*\n([\s\S]*?)(?:\n【|$)/);
  return evidenceMatch ? evidenceMatch[1].trim().slice(0, 300) : reply.slice(0, 200).replace(/\n/g, " ");
}
function extractNextStep(reply) {
  if (!reply) return "";
  const m = reply.match(/【下一步建议】\s*\n([\s\S]*?)(?:\n数据来源|\n$|$)/);
  return m ? m[1].trim().slice(0, 200) : "";
}


export async function synthesizeWithResults(intent, agentResults, slots, context = {}) {
  // No-LLM fast paths first (work even when LLM_API_KEY is unset):
  // A-X-A5: lookup_asset_info uses rule-based template directly
  if (intent === "lookup_asset_info") {
    return synthesizeAssetInfoRule(agentResults, slots, context);
  }
  // reset_portfolio — 全局清空, 需用户二次确认
  if (intent === "reset_portfolio") {
    return `正在清空你的全部资产面板与仓位记录。所有数据将被彻底清除，不可恢复。\n\n请回复"确认清空"继续，回复"取消"放弃。`;
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

    const reason = pp.reason || null;

    if (pp.units && pp.averageCost != null && reason) {
      // All info present — show confirmation with reason evaluation
      const priceLine = metrics?.price ? `\n当前市价: ${metrics.price}` : "";
      const mcapLine = metrics?.marketCap ? `\n市值: ${metrics.marketCap}` : "";
      return `${pp.assetQuery} 持仓已记录：${pp.units} 个，成本 $${pp.averageCost}${priceLine}${mcapLine}\n购买理由: ${reason}\n\n委员会研究摘要:\n${agentSummary || "暂无额外研究数据"}\n\n确认以上信息请回复"确认"，取消请回复"取消"。`;
    }

    if (pp.units && pp.averageCost != null && !reason) {
      return `${pp.assetQuery} 持仓已记录：${pp.units} 个，成本 $${pp.averageCost}。\n\n请告诉我你的购买理由是什么？为什么看好 ${pp.assetQuery}？`;
    }

    return synthesizeRule(intent, agentResults, slots, context);
  }

  // Panic sell guardrail: load position/plan/thesis data and build 5-part reply
  if (intent === "review_sell" && slots.panicFlag) {
    const assetLabel = slots.assetQuery || context.lastAsset;
    if (assetLabel) {
      try {
        const state = await store.load();
        const assetEntry = Object.values(state.assets || {}).find(
          (a) => (a.symbol || "").toUpperCase() === assetLabel.toUpperCase()
        );
        if (assetEntry) {
          const position = state.positions?.[assetEntry.id] || null;
          const plan = state.plans?.[assetEntry.id] || null;
          const valuationModel = state.valuationModels?.[assetEntry.id] || null;
          const currentPrice = position?.currentPrice
            || agentResults.find((r) => r.role === "asset_info")?.data?.currentMetrics?.price
            || null;
          return buildPanicSellReply(assetLabel, position, plan, valuationModel, currentPrice);
        }
      } catch {
        // Fall through to standard review_sell if state load fails
      }
    }
  }

  // Planned sell boundary check: load position/plan, check floor rules, require confirmation
  if (intent === "review_sell" && slots.plannedSellFlag) {
    const assetLabel = slots.assetQuery || context.lastAsset;
    if (assetLabel) {
      try {
        const state = await store.load();
        const assetEntry = Object.values(state.assets || {}).find(
          (a) => (a.symbol || "").toUpperCase() === assetLabel.toUpperCase()
        );
        if (assetEntry) {
          const position = state.positions?.[assetEntry.id] || null;
          const plan = state.plans?.[assetEntry.id] || null;
          return buildPlannedSellReply(assetLabel, position, plan, slots);
        }
      } catch {
        // Fall through
      }
    }
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
