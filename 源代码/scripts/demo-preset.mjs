#!/usr/bin/env node

// Demo state preset — injects realistic multi-asset portfolio
// for hackathon demo. Run before the demo:
//   node scripts/demo-preset.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = resolve(__dirname, "..", "data", "state.json");

const now = new Date().toISOString();
const today = now.slice(0, 10);

const demoState = {
  version: 1,

  assets: {
    asset_sol: {
      id: "asset_sol",
      symbol: "SOL",
      name: "Solana",
      assetType: "major_crypto",
      chain: "Solana",
      riskClass: "medium_high",
      tags: ["l1", "solana-ecosystem"],
      aliases: ["sol"],
      createdAt: "2026-06-25T10:00:00.000Z",
      updatedAt: now,
    },
    asset_btc: {
      id: "asset_btc",
      symbol: "BTC",
      name: "Bitcoin",
      assetType: "major_crypto",
      chain: "Bitcoin",
      riskClass: "medium",
      tags: ["store-of-value", "macro"],
      aliases: ["btc"],
      createdAt: "2026-06-25T10:00:00.000Z",
      updatedAt: now,
    },
    asset_eth: {
      id: "asset_eth",
      symbol: "ETH",
      name: "Ethereum",
      assetType: "major_crypto",
      chain: "Ethereum",
      riskClass: "medium_high",
      tags: ["smart-contract", "l1"],
      aliases: ["eth"],
      createdAt: "2026-06-25T10:00:00.000Z",
      updatedAt: now,
    },
  },

  positions: {
    asset_sol: {
      assetId: "asset_sol",
      assetSymbol: "SOL",
      units: 100,
      averageCost: 120,
      costBasisTotal: 12000,
      currentPrice: 142,
      currentValue: 14200,
      portfolioValue: 75000,
      portfolioContextComplete: true,
      peakUnits: 150,
      portfolioPct: 18.9,
      sectorExposurePct: 0,
      cashPct: 0,
      marketCap: 78000000000,
      fdv: 82000000000,
      liquidityUsd: 0,
      dailyVolumeUsd: 0,
      updatedAt: now,
    },
    asset_btc: {
      assetId: "asset_btc",
      assetSymbol: "BTC",
      units: 0.15,
      averageCost: 62000,
      costBasisTotal: 9300,
      currentPrice: 67500,
      currentValue: 10125,
      portfolioValue: 40000,
      portfolioContextComplete: true,
      peakUnits: 0.3,
      portfolioPct: 25.3,
      sectorExposurePct: 0,
      cashPct: 0,
      marketCap: 1330000000000,
      fdv: 1350000000000,
      liquidityUsd: 0,
      dailyVolumeUsd: 0,
      updatedAt: now,
    },
    asset_eth: {
      assetId: "asset_eth",
      assetSymbol: "ETH",
      units: 2,
      averageCost: 2800,
      costBasisTotal: 5600,
      currentPrice: 3200,
      currentValue: 6400,
      portfolioValue: 25000,
      portfolioContextComplete: true,
      peakUnits: 5,
      portfolioPct: 25.6,
      sectorExposurePct: 0,
      cashPct: 0,
      marketCap: 380000000000,
      fdv: 385000000000,
      liquidityUsd: 0,
      dailyVolumeUsd: 0,
      updatedAt: now,
    },
  },

  plans: {
    asset_sol: {
      id: "plan_sol_001",
      assetId: "asset_sol",
      status: "active",
      valuationTiers: {
        conservative: "100-130",
        base: "130-180",
        aggressive: "180-250",
      },
      sellZone: "基准区上方分批止盈 50%，底仓保护 $110",
      addZone: "保守区下方可考虑加仓，单次不超过仓位 20%",
      confirmedAt: "2026-06-25T15:25:00.000Z",
      updatedAt: now,
      nextReviewAt: "2026-07-27T00:00:00.000Z",
      monitoringPolicy: "daily_news_check",
    },
    asset_btc: {
      id: "plan_btc_001",
      assetId: "asset_btc",
      status: "active",
      valuationTiers: {
        conservative: "55000-65000",
        base: "65000-85000",
        aggressive: "85000-120000",
      },
      sellZone: "高估值区分批止盈 30%",
      addZone: "保守区下方加仓，关注宏观流动性",
      confirmedAt: "2026-06-25T14:00:00.000Z",
      updatedAt: now,
      nextReviewAt: "2026-07-27T00:00:00.000Z",
      monitoringPolicy: "daily_news_check",
    },
    asset_eth: {
      id: "plan_eth_001",
      assetId: "asset_eth",
      status: "active",
      valuationTiers: {
        conservative: "2200-2800",
        base: "2800-3800",
        aggressive: "3800-5500",
      },
      sellZone: "基准区上方可考虑减仓",
      addZone: "保守区可加仓",
      confirmedAt: "2026-06-25T16:00:00.000Z",
      updatedAt: now,
      nextReviewAt: "2026-07-27T00:00:00.000Z",
      monitoringPolicy: "daily_news_check",
    },
  },

  valuationModels: {
    asset_sol: {
      assetId: "asset_sol",
      currentMetrics: { fdv: 82000000000, marketCap: 78000000000, price: 142 },
      scenarios: [
        { name: "conservative", targetFdvRange: [60000000000, 95000000000] },
        { name: "base", targetFdvRange: [95000000000, 150000000000] },
        { name: "aggressive", targetFdvRange: [150000000000, 250000000000] },
      ],
    },
    asset_btc: {
      assetId: "asset_btc",
      currentMetrics: { fdv: 1350000000000, marketCap: 1330000000000, price: 67500 },
      scenarios: [
        { name: "conservative", targetFdvRange: [1100000000000, 1300000000000] },
        { name: "base", targetFdvRange: [1300000000000, 1700000000000] },
        { name: "aggressive", targetFdvRange: [1700000000000, 2400000000000] },
      ],
    },
    asset_eth: {
      assetId: "asset_eth",
      currentMetrics: { fdv: 385000000000, marketCap: 380000000000, price: 3200 },
      scenarios: [
        { name: "conservative", targetFdvRange: [260000000000, 340000000000] },
        { name: "base", targetFdvRange: [340000000000, 460000000000] },
        { name: "aggressive", targetFdvRange: [460000000000, 660000000000] },
      ],
    },
  },

  researchReports: {
    asset_sol: {
      assetId: "asset_sol",
      thesis: "Solana 是继以太坊之后最重要的 L1，Firedancer 上线后将大幅提升性能和去中心化程度",
      catalysts: ["Firedancer 客户端 2026H2", "机构 ETF 申请", "DePIN + PayFi 生态增长"],
      risks: ["网络稳定性历史", "FTX 清算抛压", "L2 生态分流"],
      comparablesDraft: { status: "ready", summary: "ETH L1 ($380B FDV), AVAX ($18B), SUI ($22B)" },
      listingPathDraft: { status: "ready", summary: "已在 Binance/Coinbase 等主流交易所" },
      fundingUnlockDraft: { status: "partial", summary: "FTX 清算剩余量约 3000 万 SOL，分批解锁至 2027" },
    },
    asset_btc: {
      assetId: "asset_btc",
      thesis: "数字黄金叙事持续强化，ETF 资金流入 + 减半后供应收缩",
      catalysts: ["ETF 持续净流入", "国家战略储备", "闪电网络增长"],
      risks: ["监管风险", "矿工集中化", "能源 FUD"],
      comparablesDraft: { status: "ready", summary: "黄金 ($18T), ETH ($380B)" },
      listingPathDraft: { status: "ready", summary: "主流交易所 + ETF" },
      fundingUnlockDraft: { status: "ready", summary: "无解锁风险，减半后年度通胀 <1%" },
    },
    asset_eth: {
      assetId: "asset_eth",
      thesis: "L2 生态爆发 + EIP-4844 降费 + 质押率提升",
      catalysts: ["L2 交易量新高", "现货 ETF 资金流入", "Pectra 升级"],
      risks: ["L2 分流价值", "Solana 竞争", "质押集中度"],
      comparablesDraft: { status: "ready", summary: "SOL ($82B), AVAX ($18B), BNB ($95B)" },
      listingPathDraft: { status: "ready", summary: "主流交易所 + ETF" },
      fundingUnlockDraft: { status: "ready", summary: "无重大解锁，质押 ETH 约 27%" },
    },
  },

  events: {
    event_sol_firedancer: {
      id: "event_sol_firedancer",
      assetId: "asset_sol",
      title: "Solana Firedancer 测试网上线",
      type: "development",
      summary: "Jump Crypto 发布 Firedancer v0.1 测试网，TPS 突破 100 万",
      createdAt: "2026-06-25",
    },
    event_btc_etf: {
      id: "event_btc_etf",
      assetId: "asset_btc",
      title: "BTC ETF 连续 15 日净流入",
      type: "market",
      summary: "美国现货 BTC ETF 连续 15 个交易日净流入，累计 +$4.2B",
      createdAt: "2026-06-26",
    },
    event_eth_etf: {
      id: "event_eth_etf",
      assetId: "asset_eth",
      title: "ETH ETF 周流入创历史新高",
      type: "market",
      summary: "ETH 现货 ETF 本周净流入 $1.2B，机构配置加速",
      createdAt: "2026-06-24",
    },
  },

  traces: {
    trace_research_sol: {
      id: "trace_research_sol",
      assetId: "asset_sol",
      userIntent: "研究 SOL 值不值得买",
      finalRecommendation: "保守区，关注 Firedancer 进度",
      reasons: ["FDV 位于保守区", "催化剂强劲", "FTX 抛压需关注"],
      createdAt: "2026-06-25T15:10:00.000Z",
    },
    trace_buy_sol: {
      id: "trace_buy_sol",
      assetId: "asset_sol",
      userIntent: "买入 SOL 100 个 @ $120",
      finalRecommendation: "已记录，draft plan 已生成",
      reasons: ["成本 $120", "保守区入场", "首投"],
      createdAt: "2026-06-25T15:20:00.000Z",
    },
    trace_confirm_sol: {
      id: "trace_confirm_sol",
      assetId: "asset_sol",
      userIntent: "确认 SOL 计划",
      finalRecommendation: "plan active，开始监控",
      reasons: ["三档估值已锁定"],
      createdAt: "2026-06-25T15:25:00.000Z",
    },
  },

  sources: {
    source_sol_1: {
      id: "source_sol_1",
      assetId: "asset_sol",
      assetSymbol: "SOL",
      sourceType: "onchain",
      author: "Solscan",
      title: "Solana 链上数据",
      url: "https://solscan.io/",
      keyClaim: "网络状态正常，TPS 稳定",
      roleInDecision: "supporting_evidence",
      confidenceAtTime: 8,
      createdAt: "2026-06-25T10:00:00.000Z",
    },
    source_btc_1: {
      id: "source_btc_1",
      assetId: "asset_btc",
      assetSymbol: "BTC",
      sourceType: "onchain",
      author: "Mempool",
      title: "BTC 链上数据",
      url: "https://mempool.space/",
      keyClaim: "内存池交易量正常",
      roleInDecision: "supporting_evidence",
      confidenceAtTime: 8,
      createdAt: "2026-06-25T10:00:00.000Z",
    },
    source_eth_1: {
      id: "source_eth_1",
      assetId: "asset_eth",
      assetSymbol: "ETH",
      sourceType: "onchain",
      author: "Etherscan",
      title: "ETH 链上数据",
      url: "https://etherscan.io/",
      keyClaim: "Gas 费用正常",
      roleInDecision: "supporting_evidence",
      confidenceAtTime: 8,
      createdAt: "2026-06-25T10:00:00.000Z",
    },
  },

  monitorState: {},

  settings: {},
};

// Ensure data dir exists
mkdirSync(dirname(STATE_PATH), { recursive: true });

writeFileSync(STATE_PATH, JSON.stringify(demoState, null, 2), "utf-8");
console.log(`Demo state written to ${STATE_PATH}`);
console.log(`  Assets: ${Object.keys(demoState.assets).length} (SOL, BTC, ETH)`);
console.log(`  Positions: ${Object.keys(demoState.positions).length}`);
console.log(`  Plans: ${Object.keys(demoState.plans).length} (all active)`);
console.log(`  Valuation models: ${Object.keys(demoState.valuationModels).length}`);
console.log(`  Research reports: ${Object.keys(demoState.researchReports).length}`);
console.log("\nReady for demo. Start with: npm start");
