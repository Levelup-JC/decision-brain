// Mock API responses per §3 contract for self-testing without backend.
// When backend is ready, swap these for real fetch() calls.

const MOCK_LATENCY = { min: 300, max: 1400 };

function jitter() {
  return MOCK_LATENCY.min + Math.random() * (MOCK_LATENCY.max - MOCK_LATENCY.min);
}

// Mock MCP trace entries matching the trace-collector schema:
// { agentRole, tool, args, ok, tookMs, cached, rawSnippet, error }
function buildMockTraces(fanout, assetQuery) {
  const sym = assetQuery || "BTC";
  const traceDefs = {
    macro: [
      { tool: "macro_indicators", args: { action: "multi_indicator" }, ok: true, tookMs: 320, rawSnippet: '{"cpi":{"value":2.8,"trend":"declining"},"nonfarm_payrolls":{"value":175000},"gdp_growth":{"value":2.4}}' },
      { tool: "rates_yields", args: { action: "yield_curve" }, ok: true, tookMs: 280, rawSnippet: '{"t2y":"4.12","t10y":"4.28","spread_10y2y":"0.16","fed_funds":"4.50"}' },
    ],
    onchain: [
      { tool: "crypto_market", args: { action: "ohlcv", coin_id: sym.toLowerCase(), vs_currency: "usd", days: 30 }, ok: true, tookMs: 450, rawSnippet: `{"symbol":"${sym}","current_price":91200,"market_cap":1920000000000,"fdv":1920000000000}` },
      { tool: "defi_analytics", args: { action: "protocol", protocol: sym.toLowerCase() }, ok: true, tookMs: 380, rawSnippet: '{"tvl":5000000000,"category":"Layer 1","chains":["Ethereum","Solana"]}' },
      { tool: "network_status", args: { action: "eth_gas" }, ok: true, tookMs: 210, rawSnippet: '{"safeLow":12,"average":18,"fast":25,"baseFee":"15.2 Gwei"}' },
    ],
    sentiment: [
      { tool: "sentiment_index", args: { action: "current" }, ok: true, tookMs: 180, rawSnippet: '{"value":62,"classification":"Greed","timestamp":"2026-06-28T12:00:00Z"}' },
      { tool: "derivatives_sentiment", args: { action: "long_short", symbol: `${sym}USDT` }, ok: true, tookMs: 350, rawSnippet: '{"longRatio":0.54,"shortRatio":0.46,"openInterest":"$12.5B"}' },
    ],
    technical: [
      { tool: "technical_analysis", args: { action: "full_analysis", symbol: `${sym}/USDT`, timeframe: "1d" }, ok: true, tookMs: 520, rawSnippet: '{"rsi":58,"macd":"bullish","bollingerPosition":"middle","ma50":"above","ma200":"above"}' },
      { tool: "crypto_derivatives", args: { action: "klines", symbol: `${sym}/USDT`, timeframe: "4h", limit: 50 }, ok: true, tookMs: 400, rawSnippet: '{"lastClose":91200,"volume24h":28500000000,"high24h":92500,"low24h":89800}' },
    ],
    news: [
      { tool: "news_feed", args: { action: "latest", keyword: sym, limit: 5 }, ok: true, tookMs: 410, rawSnippet: `"${sym} ETF sees $2.1B weekly inflow - institutional demand accelerating"` },
      { tool: "social_trending", args: { action: "trending", platform: "github" }, ok: true, tookMs: 290, rawSnippet: `"${sym} developer activity up 15% QoQ, trending #3 on GitHub crypto repos"` },
    ],
    asset_info: [
      { tool: "crypto_market", args: { action: "price", coin_ids: sym.toLowerCase(), vs_currency: "usd" }, ok: true, tookMs: 350, rawSnippet: `{"id":"${sym.toLowerCase()}","symbol":"${sym.toLowerCase()}","current_price":91200,"market_cap":1920000000000,"fdv":1920000000000}` },
      { tool: "dex_market", args: { action: "search", query: sym }, ok: true, tookMs: 280, rawSnippet: `"DEX pairs for ${sym}: ${sym}/USDT liquidity $480M on Orca, $320M on Raydium"` },
    ],
  };

  const traces = [];
  for (const role of fanout) {
    const roleTraces = traceDefs[role];
    if (roleTraces) {
      for (const t of roleTraces) {
        traces.push({
          agentRole: role,
          tool: t.tool,
          args: t.args,
          ok: t.ok,
          tookMs: t.tookMs + Math.round(Math.random() * 100),
          cached: false,
          rawSnippet: t.rawSnippet,
          error: t.error || null,
        });
      }
    }
  }
  return traces;
}

// Mock dispatch plan matching orchestrator format
function buildMockDispatchPlan(fanout) {
  const META = {
    macro:      { label: "Macro Agent", provider: "Bitget MCP", skill: "macro-analyst", tools: ["macro_indicators", "rates_yields"], reason: "判断宏观流动性和风险偏好" },
    onchain:    { label: "Market Intel Agent", provider: "Bitget MCP", skill: "market-intel", tools: ["crypto_market", "defi_analytics", "network_status"], reason: "分析链上数据和市场情报" },
    sentiment:  { label: "Sentiment Agent", provider: "Bitget MCP", skill: "sentiment-analyst", tools: ["sentiment_index", "derivatives_sentiment"], reason: "评估市场情绪和衍生品数据" },
    technical:  { label: "Technical Agent", provider: "Bitget MCP", skill: "technical-analysis", tools: ["technical_analysis", "crypto_derivatives"], reason: "技术指标分析和价格形态" },
    news:       { label: "News Agent", provider: "Bitget MCP", skill: "news-briefing", tools: ["news_feed", "social_trending"], reason: "追踪相关新闻和社会情绪" },
    asset_info: { label: "Asset Info Agent", provider: "Bitget MCP", skill: null, tools: ["crypto_market", "dex_market"], reason: "获取资产基本信息和实时数据" },
    valuation:  { label: "Valuation Agent", provider: "Decision Brain", skill: "valuation engine", tools: [], reason: "计算估值区间和决策建议" },
    memory:     { label: "Memory Agent", provider: "Decision Brain", skill: "local memory layer", tools: [], reason: "检索本地记忆和投资历史" },
  };
  return fanout.map((role) => ({ role, ...(META[role] || { label: `${role} Agent`, provider: "Decision Brain", skill: null, tools: [], reason: `${role} local` }) }));
}

export async function mockChatAPI(message) {
  await new Promise(r => setTimeout(r, jitter()));

  const lowered = message.toLowerCase();
  let intent = "smalltalk";
  let fanout = ["memory", "valuation"];
  let reply = "收到。请告诉我你想怎么操作？（研究资产 / 记录持仓 / 确认计划 / 加仓 / 卖出建议）";
  let assetQuery = null;

  // Detect asset from message
  const detectAsset = () => {
    if (lowered.includes("btc") || lowered.includes("bitcoin")) return "BTC";
    if (lowered.includes("eth") || lowered.includes("ethereum")) return "ETH";
    if (lowered.includes("sol")) return "SOL";
    return "BTC";
  };

  if (lowered.includes("研究") || lowered.includes("research") || lowered.includes("评估") || lowered.includes("analyze") || lowered.includes("分析")) {
    intent = "evaluate_candidate";
    assetQuery = detectAsset();
    fanout = ["memory", "onchain", "sentiment", "technical", "news", "valuation"];
    const headlines = assetHeadlines(assetQuery);
    reply = `委员会意见：${assetQuery} 身份已确认。${headlines.valuation}。${headlines.sentiment}。综合建议：${assetQuery === "BTC" ? "基准区持有，ETF 持续流入提供支撑，建议继续观察。" : assetQuery === "ETH" ? "基准区下沿，L2 生态增长强劲，可考虑分批加仓。" : "保守区上沿，Firedancer 上线是长期利好，等待确认上升趋势。"}`;
  } else if (lowered.includes("持仓") || lowered.includes("总览") || lowered.includes("portfolio") || lowered.includes("我的")) {
    intent = "portfolio_overview";
    fanout = ["memory", "valuation"];
    assetQuery = null;
    reply = "当前持仓总览：BTC 0.15 个 (成本 $87,500，现价 $91,200)，ETH 2.5 个 (成本 $3,800，现价 $4,150)，SOL 50 个 (成本 $142，现价 $168)。组合总估值约 $32,455。BTC/ETH 计划 active，SOL 计划 draft。";
  } else if (lowered.includes("持有") || lowered.includes("position") || lowered.includes("买了") || lowered.includes("仓位") || lowered.includes("成本") || lowered.includes("bought")) {
    intent = "manage_position";
    assetQuery = detectAsset();
    fanout = ["memory", "valuation"];
    reply = `已记录仓位。${assetQuery} 已纳入持仓。与现有组合整合完毕，draft 计划已生成。`;
  } else if (lowered.includes("确认") || lowered.includes("confirm") || lowered.includes("计划") || lowered.includes("plan")) {
    intent = "confirm_plan";
    assetQuery = detectAsset();
    fanout = ["memory", "valuation"];
    reply = `${assetQuery} 计划已确认，draft 转 active。按计划执行即可。`;
  } else if (lowered.includes("加仓") || lowered.includes("add") || lowered.includes("增持") || lowered.includes("more")) {
    intent = "review_add";
    assetQuery = detectAsset();
    fanout = ["memory", "valuation", "sentiment"];
    reply = `加仓建议 (${assetQuery})：${assetQuery === "SOL" ? "当前处于保守区上沿，F&G 恐惧区 + Firedancer 利好未完全定价。若突破 $200 确认上升趋势，可考虑分批加仓。核心风险：FTX 遗产清算卖压、Solana 网络稳定性。" : assetQuery === "BTC" ? "当前基准区估值合理，ETF 持续流入。$85,000 以下可考虑加仓。核心风险：宏观流动性收紧、美元走强。" : "当前基准区下沿，L2 生态 TVL 创新高。$3,800 以下可考虑加仓。核心风险：质押解锁抛压、L1 竞争加剧。"}`;
  } else if (lowered.includes("卖") || lowered.includes("sell") || lowered.includes("减仓") || lowered.includes("reduce")) {
    intent = "review_sell";
    assetQuery = detectAsset();
    fanout = ["memory", "valuation", "technical"];
    reply = `卖出建议 (${assetQuery})：当前仓位尚有浮盈空间，技术面无明显反转信号。建议保留底仓（约 50%），分批止盈。底仓保护线设在成本价附近。`;
  }

  const agentResults = fanout.map(role => ({
    role,
    status: "ok",
    headline: agentHeadline(role, assetQuery),
    data: {},
    tookMs: Math.round(200 + Math.random() * 800)
  }));

  // Build mock dispatchPlan matching orchestrator format
  const dispatchPlan = buildMockDispatchPlan(fanout);
  const trace = buildMockTraces(fanout, assetQuery);

  return {
    ok: true,
    intent,
    assetQuery,
    fanout,
    dispatchPlan,
    agentResults,
    trace,
    reply,
    suggestions: suggestionForIntent(intent, fanout),
    degraded: false
  };
}

function assetHeadlines(asset) {
  if (asset === "BTC") return {
    valuation: "BTC FDV $1.92T，基准区 $1.6T-$2.5T，当前估值合理",
    sentiment: "F&G=62 中性偏贪婪，多空比 1.15，ETF 周流入 $2.1B"
  };
  if (asset === "ETH") return {
    valuation: "ETH FDV $498B，基准区 $420B-$650B，处于下沿附近",
    sentiment: "F&G=62，L2 TVL 突破 $50B，开发者活跃度领先"
  };
  if (asset === "SOL") return {
    valuation: "SOL FDV $96B，保守区 $60B-$100B，处于上沿",
    sentiment: "F&G=62，Firedancer 上线提振信心，社交讨论热度上升"
  };
  return {
    valuation: "FDV 待确认，需更多数据支持估值判断",
    sentiment: "市场数据有限，建议补充链上数据和社交情绪指标"
  };
}

function agentHeadline(role, asset) {
  const sym = asset || "BTC";
  const lines = {
    btc: {
      memory: `历史仓位：BTC 持有 0.15 个，成本 $87,500，当前浮盈 4.2%`,
      macro: "宏观信号：美联储暂停加息，全球流动性中性偏松，BTC 主导率 52%",
      onchain: "BTC 链上活跃地址 980K/日，交易所余额持续下降，HODL 情绪强",
      sentiment: "F&G=62 中性偏贪婪，多空比 1.15，ETF 周流入 $2.1B [source: CoinShares]",
      technical: "BTC/USD 日线 MA50 上方，RSI=58 中性，支撑位 $85,000，阻力位 $98,000",
      news: "近 7 天 BTC 相关重大新闻 12 条，ETF 流入 + 主权基金配置为主流叙事 [trace:1]",
      valuation: `BTC FDV $1.92T，基准区 $1.6T-$2.5T，当前估值合理，与黄金市值比 0.15x`
    },
    eth: {
      memory: "历史仓位：ETH 持有 2.5 个，成本 $3,800，当前浮盈 9.2%",
      macro: "宏观信号：DeFi TVL 回升至 $85B，ETH 质押率 27%，生态健康",
      onchain: "ETH L2 日交易量 12M 笔，Arbitrum 主导 L2 市场份额 38%",
      sentiment: "F&G=62，开发者活跃度全链第一，L2 叙事持续升温 [source: Electric Capital]",
      technical: "ETH/USD 日线 MA20 上方，RSI=55，支撑位 $3,800，阻力位 $4,500",
      news: "ETH ETF 月流入 $850M，机构配置比例从 2% 升至 5% [trace:2]",
      valuation: "ETH FDV $498B，基准区 $420B-$650B，下沿附近，相对 BTC 估值合理"
    },
    sol: {
      memory: "历史仓位：SOL 持有 50 个，成本 $142，当前浮盈 18.3%",
      macro: "Solana 生态 TVL $8.2B，日活跃地址 2.4M，开发者增长 35% QoQ",
      onchain: "SOL 日交易量 45M 笔，TPS 平均 3,200，网络正常运行 180 天",
      sentiment: "F&G=62，Firedancer 上线提振信心，社交讨论热度月增 80% [source: LunarCrush]",
      technical: "SOL/USD 日线 MA20 上方，RSI=62，支撑位 $140，阻力位 $200",
      news: "Firedancer 客户端正式上线主网，TPS 理论峰值提升至 1M [trace:3]",
      valuation: "SOL FDV $96B，保守区 $60B-$100B，处于上沿，Firedancer 利好部分已定价"
    }
  };
  const key = sym.toLowerCase();
  return (lines[key] && lines[key][role]) || `分析完成：${sym}`;
}

function suggestionForIntent(intent, fanout) {
  const base = ["刷新全部 Agent", "查看资产看板"];
  if (intent === "evaluate_candidate") return ["生成持仓计划", "查看加仓建议", ...base];
  if (intent === "manage_position") return ["确认计划", "查看加仓建议", ...base];
  if (intent === "portfolio_overview") return ["研究 BTC", "SOL 能加仓吗", ...base];
  if (intent === "review_add") return ["生成持仓计划", "确认计划", ...base];
  if (intent === "review_sell") return ["确认计划", ...base];
  if (fanout.length >= 5) return ["生成持仓计划", "查看加仓建议", ...base];
  return base;
}

export async function mockAgentAPI(role, assetQuery) {
  await new Promise(r => setTimeout(r, jitter()));
  return {
    ok: true,
    role,
    status: "ok",
    headline: agentHeadline(role),
    data: {},
    tookMs: Math.round(200 + Math.random() * 800)
  };
}

export async function mockStateAPI() {
  return {
    counts: { assets: 3, positions: 3, plans: 3, traces: 6 },
    assets: [
      { id: "btc", symbol: "BTC", name: "Bitcoin", assetType: "token", chain: "Bitcoin" },
      { id: "eth", symbol: "ETH", name: "Ethereum", assetType: "token", chain: "Ethereum" },
      { id: "sol", symbol: "SOL", name: "Solana", assetType: "token", chain: "Solana" }
    ],
    positions: [
      { assetId: "btc", units: 0.15, averageCost: 87500, currentPrice: 91200, peakUnits: 0.15, portfolioValue: 13680 },
      { assetId: "eth", units: 2.5, averageCost: 3800, currentPrice: 4150, peakUnits: 2.5, portfolioValue: 10375 },
      { assetId: "sol", units: 50, averageCost: 142, currentPrice: 168, peakUnits: 50, portfolioValue: 8400 }
    ],
    plans: [
      { assetId: "btc", status: "active", sellZone: "基准区上沿分批止盈 30%，底仓保护 $85,000" },
      { assetId: "eth", status: "active", sellZone: "基准区内持有，突破 $4,500 加仓 20%" },
      { assetId: "sol", status: "draft", sellZone: "保守区建仓，突破 $200 确认上升趋势后加仓" }
    ],
    valuationModels: [
      {
        assetId: "btc",
        currentMetrics: { fdv: 1_920_000_000_000, marketCap: 1_920_000_000_000 },
        scenarios: [
          { name: "conservative", targetFdvRange: [1_200_000_000_000, 1_600_000_000_000] },
          { name: "base", targetFdvRange: [1_600_000_000_000, 2_500_000_000_000] },
          { name: "aggressive", targetFdvRange: [2_500_000_000_000, 4_000_000_000_000] }
        ]
      },
      {
        assetId: "eth",
        currentMetrics: { fdv: 498_000_000_000, marketCap: 498_000_000_000 },
        scenarios: [
          { name: "conservative", targetFdvRange: [300_000_000_000, 420_000_000_000] },
          { name: "base", targetFdvRange: [420_000_000_000, 650_000_000_000] },
          { name: "aggressive", targetFdvRange: [650_000_000_000, 1_000_000_000_000] }
        ]
      },
      {
        assetId: "sol",
        currentMetrics: { fdv: 96_000_000_000, marketCap: 96_000_000_000 },
        scenarios: [
          { name: "conservative", targetFdvRange: [60_000_000_000, 100_000_000_000] },
          { name: "base", targetFdvRange: [100_000_000_000, 180_000_000_000] },
          { name: "aggressive", targetFdvRange: [180_000_000_000, 350_000_000_000] }
        ]
      }
    ],
    recentEvents: [
      { assetId: "btc", title: "BTC ETF 周流入 $2.1B", type: "flow", summary: "机构持续增持，ETF 总规模突破 $120B", createdAt: "2026-06-26 09:30" },
      { assetId: "eth", title: "ETH L2 生态 TVL 创新高", type: "ecosystem", summary: "Arbitrum + Optimism TVL 合计突破 $50B", createdAt: "2026-06-25 18:00" },
      { assetId: "sol", title: "Solana Firedancer 客户端上线", type: "tech", summary: "Jump Crypto 开发的新验证者客户端正式上线主网", createdAt: "2026-06-24 14:00" }
    ],
    recentTraces: [
      { userIntent: "研究 BTC 当前估值", finalRecommendation: "基准区，持有", reasons: ["ETF 持续流入", "基准区估值合理"], createdAt: "2026-06-26 10:15" },
      { userIntent: "ETH 能加仓吗", finalRecommendation: "基准区下沿，可考虑", reasons: ["L2 生态增长", "估值不贵"], createdAt: "2026-06-25 16:30" },
      { userIntent: "研究 SOL 投资价值", finalRecommendation: "保守区上沿，观察", reasons: ["Firedancer 利好", "估值待确认"], createdAt: "2026-06-24 15:00" }
    ],
    sources: [
      { assetId: "btc", type: "onchain", url: "https://www.blockchain.com/explorer" },
      { assetId: "eth", type: "onchain", url: "https://etherscan.io" },
      { assetId: "sol", type: "onchain", url: "https://solscan.io" }
    ],
    researchReports: [
      {
        assetId: "btc",
        comparablesDraft: { status: "ready", summary: "数字黄金定位明确，对标黄金 $13T 市值" },
        listingPathDraft: { status: "ready", summary: "全球主流交易所已上线，ETF 已获批" },
        fundingUnlockDraft: { status: "ready", summary: "无大额解锁风险，日发行量约 450 BTC" }
      },
      {
        assetId: "eth",
        comparablesDraft: { status: "partial", summary: "智能合约平台龙头，对标 SOL/AVAX 等 L1" },
        listingPathDraft: { status: "ready", summary: "全球主流交易所已上线，ETF 已获批" },
        fundingUnlockDraft: { status: "partial", summary: "质押解锁持续，日均解锁约 20K ETH" }
      },
      {
        assetId: "sol",
        comparablesDraft: { status: "partial", summary: "高性能 L1，对标 ETH/APTOS/SUI 等" },
        listingPathDraft: { status: "ready", summary: "全球主流交易所已上线" },
        fundingUnlockDraft: { status: "partial", summary: "FTX 遗产清算可能带来短期卖压" }
      }
    ]
  };
}
