// Mock API responses per §3 contract for self-testing without backend.
// When backend is ready, swap these for real fetch() calls.

const MOCK_LATENCY = { min: 300, max: 1400 };

function jitter() {
  return MOCK_LATENCY.min + Math.random() * (MOCK_LATENCY.max - MOCK_LATENCY.min);
}

export async function mockChatAPI(message) {
  await new Promise(r => setTimeout(r, jitter()));

  const lowered = message.toLowerCase();
  let intent = "smalltalk";
  let fanout = ["memory", "valuation"];
  let reply = "收到。请告诉我你想怎么操作？（研究资产 / 记录持仓 / 确认计划 / 加仓 / 卖出建议）";

  if (lowered.includes("研究") || lowered.includes("research") || lowered.includes("btw") || lowered.includes("评估") || lowered.includes("analyze")) {
    intent = "evaluate_candidate";
    fanout = ["memory", "onchain", "sentiment", "technical", "news", "valuation"];
    reply = "委员会意见：BTW 身份已确认（BSC 链），情绪偏恐惧（F&G=26），技术面中性。估值方面对标数据待补强，保守区 FDV $35M-$80M。建议先观察情绪拐点，确认对标后再决策。";
  } else if (lowered.includes("持有") || lowered.includes("position") || lowered.includes("买了") || lowered.includes("仓位") || lowered.includes("成本") || lowered.includes("bought")) {
    intent = "manage_position";
    fanout = ["memory", "valuation"];
    reply = "已记录仓位。BTW 100 个，成本 $0.09。与现有组合整合完毕，draft 计划已生成。";
  } else if (lowered.includes("确认") || lowered.includes("confirm") || lowered.includes("计划") || lowered.includes("plan")) {
    intent = "confirm_plan";
    fanout = ["memory", "valuation"];
    reply = "计划已确认，draft 转 active。按计划执行即可。";
  } else if (lowered.includes("加仓") || lowered.includes("add") || lowered.includes("增持") || lowered.includes("more")) {
    intent = "review_add";
    fanout = ["memory", "valuation", "sentiment"];
    reply = "加仓建议：当前 F&G 恐惧区 + 估值处于保守区下方，若对标数据补齐后估值合理，可考虑分批加仓。核心风险：流动性浅、上所路径未确认。";
  } else if (lowered.includes("卖") || lowered.includes("sell") || lowered.includes("减仓") || lowered.includes("reduce")) {
    intent = "review_sell";
    fanout = ["memory", "valuation", "technical"];
    reply = "卖出建议：当前仓位尚有浮盈空间，技术面无明显反转信号。建议保留底仓（约 50%），分批止盈。底仓保护线设在成本价 $0.09。";
  }

  const agentResults = fanout.map(role => ({
    role,
    status: "ok",
    headline: agentHeadline(role),
    data: {},
    tookMs: Math.round(200 + Math.random() * 800)
  }));

  return {
    ok: true,
    intent,
    assetQuery: "BTW",
    fanout,
    agentResults,
    reply,
    suggestions: suggestionForIntent(intent, fanout),
    degraded: false
  };
}

function agentHeadline(role) {
  const lines = {
    memory: "历史仓位：首投 BTW，无加仓记录，当前持有 100 个",
    macro: "宏观信号：全球流动性偏紧，BTC 主导率 54%，山寨季未到",
    onchain: "BTW 在 BSC，FDV $52M，24h 交易量 $1.8M，流动性适中",
    sentiment: "F&G=26 恐惧区，多空比 0.82（偏空），社交讨论热度低",
    technical: "BTW/USDT 日线 MA20 下方，RSI=42 中性偏弱，无明确买卖信号",
    news: "近 7 天 BTW 相关新闻 3 条，无重大利好/利空，叙事热度一般",
    valuation: "FDV $52M，对标均值 $120M，保守区 $35M-$80M，当前位于保守区"
  };
  return lines[role] || "分析完成";
}

function suggestionForIntent(intent, fanout) {
  const base = ["刷新全部 Agent", "查看资产看板"];
  if (intent === "evaluate_candidate") return ["生成持仓计划", ...base];
  if (intent === "manage_position") return ["确认计划", "查看加仓建议", ...base];
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
    counts: { assets: 1, positions: 1, plans: 1, traces: 2 },
    assets: [
      { id: "btw", symbol: "BTW", name: "BitWarden Token", assetType: "token", chain: "BSC" }
    ],
    positions: [
      { assetId: "btw", units: 100, averageCost: 0.09, currentPrice: 0.105, peakUnits: 100, portfolioValue: 50000 }
    ],
    plans: [
      { assetId: "btw", status: "draft", sellZone: "保守区分批止盈 50%，底仓保护 $0.09" }
    ],
    valuationModels: [
      {
        assetId: "btw",
        currentMetrics: { fdv: 52_000_000, marketCap: 18_000_000 },
        scenarios: [
          { name: "conservative", targetFdvRange: [35_000_000, 80_000_000] },
          { name: "base", targetFdvRange: [80_000_000, 180_000_000] },
          { name: "aggressive", targetFdvRange: [180_000_000, 350_000_000] }
        ]
      }
    ],
    recentEvents: [
      { assetId: "btw", title: "BTW 社区治理提案通过", type: "governance", summary: "社区投票通过 V2 代币经济模型调整", createdAt: "2026-06-25 14:30" }
    ],
    recentTraces: [
      { userIntent: "研究 BTW 值不值得买", finalRecommendation: "保守区，观察情绪拐点", reasons: ["F&G=26", "保守区估值", "对标待补强"], createdAt: "2026-06-25 15:10" },
      { userIntent: "买入 BTW 100 个", finalRecommendation: "已记录", reasons: ["首投", "成本 $0.09"], createdAt: "2026-06-25 15:05" }
    ],
    sources: [
      { assetId: "btw", type: "onchain", url: "https://bscscan.com/token/0x..." }
    ],
    researchReports: [
      {
        assetId: "btw",
        comparablesDraft: { status: "partial", summary: "对标项目 A: $120M FDV, B: $85M FDV" },
        listingPathDraft: { status: "missing" },
        fundingUnlockDraft: { status: "partial", summary: "种子轮已解锁 80%，无大额解锁风险" }
      }
    ]
  };
}
