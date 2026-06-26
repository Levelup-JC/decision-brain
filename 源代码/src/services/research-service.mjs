import { entityId, stableId } from "../utils/ids.mjs";
import { nowIso } from "../utils/time.mjs";
import { getAdapters } from "../adapters/index.mjs";

const mockProfiles = {
  SOL: {
    summary: "Solana is tracked as a high-beta major crypto with ecosystem and ETF-style catalyst sensitivity.",
    currentMetrics: {
      marketCap: 75000000000,
      fdv: 102000000000
    },
    thesis: [
      "生态活跃与开发者心智仍然较强",
      "如果风险偏好回升，主流 L1 可能继续获得资金关注",
      "潜在 ETF 或机构叙事会影响估值上限"
    ],
    catalysts: [
      "生态活跃度提升",
      "机构流入和 ETF 相关叙事",
      "主流资金轮动回到高 beta L1"
    ],
    risks: [
      "BTC 风险偏好转弱",
      "生态活跃放缓",
      "短期上涨过快后的获利回吐"
    ],
    comparables: [
      { symbol: "ETH", type: "category_leader", marketCap: 420000000000, fdv: 420000000000, reason: "同为主流智能合约资产" },
      { symbol: "AVAX", type: "direct_comparable", marketCap: 16000000000, fdv: 19000000000, reason: "同类高 beta L1" },
      { symbol: "SUI", type: "aspirational_comparable", marketCap: 8000000000, fdv: 22000000000, reason: "新叙事高 beta L1 对照" }
    ],
    exchangeStatus: "major_cex_listed",
    funding: "mature_ecosystem",
    liquidityNote: "主流流动性较好，适合用估值和阶段来管理仓位",
    listedExchanges: ["Bitget", "Binance", "Coinbase"],
    potentialExchanges: ["ETF / 机构入口扩张"],
    exchangePathHypothesis: "对 SOL 来说重点不在新增上所，而在新增机构入口和叙事通道。",
    marketStructureNote: "主流资金轮动和风险偏好会显著影响估值抬升空间。",
    factualSignals: ["主流交易所均已覆盖", "生态和机构叙事持续被市场跟踪"],
    inferredSignals: ["若机构入口继续扩张，估值上限可能继续上修"]
  },
  ENA: {
    summary: "Ethena is tracked as a high-risk CEX alt tied to stablecoin, synthetic yield, and narrative durability.",
    currentMetrics: {
      marketCap: 2200000000,
      fdv: 6200000000
    },
    thesis: [
      "稳定币收益叙事若持续，ENA 有估值扩张空间",
      "大所流动性与资金费率环境会显著影响表现",
      "如果 TVL 和采用继续增长，基准估值会被上修"
    ],
    catalysts: ["TVL 提升", "产品采用扩张", "叙事重新升温"],
    risks: ["监管压力", "收益模型不被市场持续买单", "高 beta 回撤"],
    comparables: [
      { symbol: "MKR", type: "category_leader", marketCap: 2500000000, fdv: 2600000000, reason: "稳定币治理类龙头对照" },
      { symbol: "LDO", type: "direct_comparable", marketCap: 1400000000, fdv: 1600000000, reason: "收益和治理叙事可对照" },
      { symbol: "PENDLE", type: "aspirational_comparable", marketCap: 900000000, fdv: 1100000000, reason: "收益产品叙事对照" }
    ],
    exchangeStatus: "major_cex_listed",
    funding: "venture_backed",
    liquidityNote: "流动性较强，但叙事回撤时波动会放大",
    listedExchanges: ["Bitget", "Binance", "Bybit"],
    potentialExchanges: ["Coinbase"],
    exchangePathHypothesis: "已具备主流流动性，后续更多取决于产品数据和合规路径，而不是单纯新增上所。",
    marketStructureNote: "稳定币和收益类叙事对市场情绪切换较敏感。",
    factualSignals: ["已获得主流交易所流动性", "机构与高关注叙事仍在"],
    inferredSignals: ["若合规和产品数据同步改善，估值中枢有机会继续上修"]
  },
  ZORA: {
    summary: "Zora is tracked as a high-risk onchain social/creator asset where liquidity, attention, and exchange path matter more than pure multiple targets.",
    currentMetrics: {
      marketCap: 180000000,
      fdv: 620000000
    },
    thesis: [
      "如果 creator/social 叙事继续扩散，ZORA 有被重新定价的空间",
      "Base 生态和社交分发若继续增强，估值中枢有望抬升",
      "交易所流动性和新增分发渠道会显著影响上限"
    ],
    catalysts: ["Base 生态扩张", "社交/creator 叙事升温", "新增上所或流动性改善"],
    risks: ["流动性不足", "叙事退潮", "持仓集中和拉高出货风险"],
    comparables: [
      { symbol: "DEGEN", type: "direct_comparable", marketCap: 180000000, fdv: 400000000, reason: "Base 生态注意力资产对照" },
      { symbol: "FRIEND", type: "downside_comparable", marketCap: 90000000, fdv: 300000000, reason: "社交叙事冷却后的下行对照" },
      { symbol: "BLUR", type: "category_leader", marketCap: 450000000, fdv: 900000000, reason: "创作者/内容交易 attention 资产对照" }
    ],
    exchangeStatus: "mixed_listing",
    funding: "venture_backed_with_distribution_optionality",
    liquidityNote: "流动性和交易所路径对估值中枢影响很大，需要持续跟踪",
    listedExchanges: ["Bitget"],
    potentialExchanges: ["Binance", "Coinbase"],
    exchangePathHypothesis: "理论上存在融资和分发背景支撑，但是否能继续上更大所仍取决于活跃度、合规和流动性承接能力。",
    marketStructureNote: "注意力、流动性深度和做市质量比传统倍数目标更重要。",
    factualSignals: ["已在 Bitget 等渠道获得基础流动性", "Base 生态与 creator 叙事具备分发想象空间"],
    inferredSignals: ["若活跃度和分发继续扩张，新增上所预期仍可能被重新交易"]
  }
};

function buildFallbackProfile(asset) {
  return {
    summary: `${asset.symbol} is currently using a fallback research profile and should be enriched by Bitget or Surf adapters.`,
    currentMetrics: {
      marketCap: 0,
      fdv: 0
    },
    thesis: ["需要补充真实项目研究", "先按高风险资产处理，避免过大仓位"],
    catalysts: ["等待用户补充项目背景", "等待外部研究适配器接入"],
    risks: ["当前研究资料不足", "估值结论可信度有限"],
    comparables: [],
    exchangeStatus: "unknown",
    funding: "unknown",
    liquidityNote: "流动性未知，需要确认",
    listedExchanges: [],
    potentialExchanges: [],
    exchangePathHypothesis: "待补充",
    marketStructureNote: "待补充",
    factualSignals: [],
    inferredSignals: ["当前多数判断仍属推断，需要更多事实来源支撑"],
    comparablesDraft: {
      status: "missing",
      summary: "暂无对标估值草稿，需要补 1-2 个可比较项目。",
      items: [],
      nextStep: "补至少 1-2 个对标项目，或者给出一个你认可的 FDV / 市值锚点"
    },
    listingPathDraft: {
      status: "missing",
      summary: "暂无上所路径草稿。",
      currentListings: [],
      potentialListings: [],
      rationale: "待补充",
      nextStep: "补充目前已上哪些所、理论上还有哪些所可能上，以及为什么"
    },
    fundingUnlockDraft: {
      status: "missing",
      summary: "暂无融资与解锁草稿。",
      fundingBackground: "待补充",
      unlockRisk: "待补充",
      tokenomicsNotes: [],
      nextStep: "补充融资背景、投资方、解锁节奏和潜在抛压"
    }
  };
}

function buildStructuredResearchDrafts(profile, enrichment, surfDossier) {
  const marketCap = Number(enrichment?.currentMetrics?.marketCap || profile.currentMetrics?.marketCap || 0);
  const fdv = Number(enrichment?.currentMetrics?.fdv || profile.currentMetrics?.fdv || 0);
  const listedExchanges = enrichment?.listedExchanges || profile.listedExchanges || [];
  const potentialExchanges = profile.potentialExchanges || [];
  const liquidityNote = enrichment?.liquidityNote || profile.liquidityNote || "待补充";

  const comparablesDraft = profile.comparables?.length
    ? {
        status: "ready",
        summary: `已具备 ${profile.comparables.length} 个对标项目，可直接进入估值讨论。`,
        items: profile.comparables,
        nextStep: null
      }
    : {
        status: marketCap > 0 || fdv > 0 ? "partial" : "missing",
        summary:
          marketCap > 0 || fdv > 0
            ? `已拿到实时市值/FDV（市值 ${marketCap || "暂无"}，FDV ${fdv || "暂无"}），但还缺对标项目。`
            : "暂无对标估值草稿，需要补 1-2 个可比较项目。",
        items: [],
        nextStep: "补至少 1-2 个对标项目，或者给出一个你认可的 FDV / 市值锚点"
      };

  const listingPathDraft =
    listedExchanges.length || potentialExchanges.length
      ? {
          status: potentialExchanges.length ? "partial" : "ready",
          summary: `当前已识别 ${listedExchanges.length} 个已上所线索，${potentialExchanges.length} 个潜在上所方向。`,
          currentListings: listedExchanges,
          potentialListings: potentialExchanges,
          rationale: profile.exchangePathHypothesis || surfDossier?.exchangePath || "待补充",
          nextStep: potentialExchanges.length ? null : "补充理论上还有哪些所可能上，以及为什么"
        }
      : {
          status: "missing",
          summary: "暂无上所路径草稿。",
          currentListings: [],
          potentialListings: [],
          rationale: profile.exchangePathHypothesis || surfDossier?.exchangePath || "待补充",
          nextStep: "补充目前已上哪些所、理论上还有哪些所可能上，以及为什么"
        };

  const fundingUnlockDraft =
    profile.funding && profile.funding !== "unknown"
      ? {
          status: "partial",
          summary: "已有融资背景占位，但还缺解锁与抛压细节。",
          fundingBackground: surfDossier?.fundingBackground || profile.funding,
          unlockRisk: "待补充",
          tokenomicsNotes: [],
          nextStep: "补充解锁节奏、投资方成本和潜在抛压"
        }
      : {
          status: "missing",
          summary: "暂无融资与解锁草稿。",
          fundingBackground: surfDossier?.fundingBackground || "待补充",
          unlockRisk: "待补充",
          tokenomicsNotes: [],
          nextStep: "补充融资背景、投资方、解锁节奏和潜在抛压"
        };

  return {
    comparablesDraft,
    listingPathDraft,
    fundingUnlockDraft
  };
}

function buildEnrichedSummary(asset, profile, enrichment) {
  const identity = enrichment?.identity || {};
  const currentMetrics = enrichment?.currentMetrics || {};
  const listedExchanges = enrichment?.listedExchanges || [];
  const assetLabel = identity.name || asset.name || asset.symbol;

  const facts = [
    identity.chain ? `链: ${identity.chain}` : null,
    currentMetrics.price ? `价格已获取` : null,
    currentMetrics.marketCap ? `市值已获取` : null,
    currentMetrics.fdv ? `FDV已获取` : null,
    listedExchanges.length ? `已识别 ${listedExchanges.length} 个上所线索` : null
  ].filter(Boolean);

  if (facts.length === 0) {
    return profile.summary;
  }

  return `${assetLabel} 已接入 market-data MCP 真实市场数据，当前重点事实：${facts.join("，")}。`;
}

function buildEnrichedCurrentMetrics(profile, enrichment) {
  return {
    marketCap: Number(enrichment?.currentMetrics?.marketCap || profile.currentMetrics?.marketCap || 0),
    fdv: Number(enrichment?.currentMetrics?.fdv || profile.currentMetrics?.fdv || 0),
    price: Number(enrichment?.currentMetrics?.price || profile.currentMetrics?.price || 0)
  };
}

function buildEnrichedSources(asset, existingReport, enrichment, surfDossier, profile) {
  const marketSources = (enrichment?.sources || []).map((source, index) => ({
    id: existingReport?.sources?.[index]?.id || entityId("source"),
    sourceType: source.sourceType || "market_data_mcp",
    author: source.tool || "market_data_mcp",
    title: source.title || `${asset.symbol} ${source.tool || "market data"}`,
    keyClaim: source.keyClaim || profile.summary,
    roleInDecision: "supporting_evidence"
  }));

  if (marketSources.length > 0) {
    return [
      ...marketSources,
      {
        id: existingReport?.sources?.[marketSources.length]?.id || entityId("source"),
        sourceType: "surf_mock",
        author: "Decision Brain Surf Mock Adapter",
        title: `${asset.symbol} project dossier`,
        keyClaim: surfDossier.projectSummary,
        roleInDecision: "project_profile"
      }
    ];
  }

  return [
    {
      id: existingReport?.sources?.[0]?.id || entityId("source"),
      sourceType: "bitget_skill_mock",
      author: "Decision Brain Mock Adapter",
      title: `${asset.symbol} research seed`,
      keyClaim: profile.summary,
      roleInDecision: "research_seed"
    },
    {
      id: existingReport?.sources?.[1]?.id || entityId("source"),
      sourceType: "surf_mock",
      author: "Decision Brain Surf Mock Adapter",
      title: `${asset.symbol} project dossier`,
      keyClaim: surfDossier.projectSummary,
      roleInDecision: "project_profile"
    }
  ];
}

export function buildResearchReport(asset, existingReport, enrichment = null) {
  const adapters = getAdapters();
  const skillNotes = adapters.bitget.getSkillNotes(asset);
  const surfDossier = adapters.surf.buildProjectDossier(asset);
  const profile = mockProfiles[asset.symbol] || buildFallbackProfile(asset);
  const reportId = stableId("research", { assetId: asset.id, symbol: asset.symbol });
  const usesEnrichment = Boolean(enrichment?.ok);
  const currentMetrics = usesEnrichment
    ? buildEnrichedCurrentMetrics(profile, enrichment)
    : profile.currentMetrics;
  const listedExchanges = usesEnrichment
    ? (enrichment.listedExchanges || profile.listedExchanges || [])
    : (profile.listedExchanges || []);
  const liquidityNote = usesEnrichment
    ? (enrichment.liquidityNote || profile.liquidityNote)
    : profile.liquidityNote;
  const sources = buildEnrichedSources(asset, existingReport, enrichment, surfDossier, profile);
  const structuredDrafts = buildStructuredResearchDrafts(profile, enrichment, surfDossier);

  return {
    id: existingReport?.id || reportId,
    assetId: asset.id,
    assetSymbol: asset.symbol,
    summary: usesEnrichment ? buildEnrichedSummary(asset, profile, enrichment) : profile.summary,
    skillNotes,
    surfDossier,
    thesis: profile.thesis,
    catalysts: profile.catalysts,
    risks: profile.risks,
    currentMetrics,
    comparables: profile.comparables.map((comparable) => ({
      id: entityId("cmp"),
      ...comparable
    })),
    funding: profile.funding,
    exchangeStatus: profile.exchangeStatus,
    listedExchanges,
    potentialExchanges: profile.potentialExchanges || [],
    exchangePathHypothesis: profile.exchangePathHypothesis,
    liquidityNote,
    marketStructureNote: profile.marketStructureNote,
    factualSignals: profile.factualSignals || [],
    inferredSignals: profile.inferredSignals || [],
    comparablesDraft: structuredDrafts.comparablesDraft,
    listingPathDraft: structuredDrafts.listingPathDraft,
    fundingUnlockDraft: structuredDrafts.fundingUnlockDraft,
    sources,
    createdAt: existingReport?.createdAt || nowIso(),
    refreshedAt: nowIso()
  };
}

export function scanDailyEvents(asset, researchReport) {
  const adapters = getAdapters({ offline: Boolean(process.env.DECISION_BRAIN_OFFLINE) });
  const rawDailySignals = adapters.bitget.scanDailySignals(asset);
  const dailySignals =
    rawDailySignals && typeof rawDailySignals.then === "function"
      ? {
          summary: `${asset.symbol} 每日监测暂未等待异步 market-data 结果，当前先按本地研究状态继续监控。`,
          highlights: []
        }
      : {
          summary: rawDailySignals?.summary || `${asset.symbol} 每日监测暂无新增 market-data 摘要。`,
          highlights: Array.isArray(rawDailySignals?.highlights) ? rawDailySignals.highlights : []
        };
  const triggerKeywords = ["下架", "attack", "hack", "监管", "解锁", "liquidity", "复盘", "恶化", "depeg"];
  const triggerSignals = [
    ...(dailySignals.highlights || []),
    ...(researchReport.inferredSignals || []),
    ...(researchReport.risks || [])
  ];
  const reviewTrigger = triggerSignals.some((item) =>
    triggerKeywords.some((keyword) => String(item || "").toLowerCase().includes(keyword.toLowerCase()))
  );

  return {
    id: entityId("event"),
    assetId: asset.id,
    type: "daily_monitor",
    title: `${asset.symbol} 每日监测摘要`,
    summary: `${dailySignals.summary} 重点关注：${researchReport.catalysts[0] || "无新增 catalyst"}。`,
    sentiment: "neutral",
    relevanceScore: 0.4,
    pricedInAssessment: "unknown",
    factualSignals: dailySignals.highlights.slice(0, 2),
    inferredSignals: researchReport.inferredSignals?.slice(0, 1) || [],
    reviewTrigger,
    sourceType: "daily_monitor",
    createdAt: nowIso()
  };
}
