import {
  archiveAsset,
  buildCapabilities,
  confirmPlan,
  evaluateCandidate,
  getAssetContext,
  getStateSummary,
  lookupPortfolioMemoryApi,
  logSource,
  managePosition,
  refreshResearch,
  reviewAddIntent,
  reviewSellIntent,
  runDailyMonitor
} from "./services/api-service.mjs";

export async function callTool(name, args = {}) {
  switch (name) {
    case "health":
      return { ok: true, service: "decision-brain" };
    case "capabilities":
      return buildCapabilities();
    case "state":
      return getStateSummary();
    case "lookup_portfolio_memory":
      return lookupPortfolioMemoryApi(args);
    case "evaluate_candidate":
      return evaluateCandidate(args);
    case "manage_position":
      return managePosition(args);
    case "refresh_research":
      return refreshResearch(args);
    case "confirm_plan":
      return confirmPlan(args);
    case "get_asset_context":
      return getAssetContext(args.assetQuery || args.asset);
    case "review_add_intent":
      return reviewAddIntent(args);
    case "review_sell_intent":
      return reviewSellIntent(args);
    case "run_daily_monitor":
      return runDailyMonitor(args);
    case "log_source":
      return logSource(args);
    case "archive_asset":
      return archiveAsset(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function listTools() {
  return [
    {
      name: "capabilities",
      description: "返回服务定位、调用工作流、监测频率约束和全部工具清单",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "lookup_portfolio_memory",
      description: "在任何建议前先查当前仓位、历史资产、归档状态和可接入本地组合来源",
      inputSchema: {
        type: "object",
        properties: {
          assetQuery: { type: "string" }
        },
        required: ["assetQuery"]
      }
    },
    {
      name: "evaluate_candidate",
      description: "对候选资产生成 Decision Pack、Investment Memo 和初始仓位建议",
      inputSchema: {
        type: "object",
        properties: {
          assetQuery: { type: "string" },
          units: { type: "number" },
          averageCost: { type: "number" },
          currentPrice: { type: "number" },
          portfolioValue: { type: "number" },
          naturalLanguagePlan: { type: "string" }
        },
        required: ["assetQuery"]
      }
    },
    {
      name: "manage_position",
      description: "把实际持仓绑定到候选判断，并在需要时自动补全研究、估值和 draft 计划",
      inputSchema: {
        type: "object",
        properties: {
          assetQuery: { type: "string" },
          units: { type: "number" },
          averageCost: { type: "number" },
          currentPrice: { type: "number" },
          portfolioValue: { type: "number" },
          naturalLanguagePlan: { type: "string" }
        },
        required: ["assetQuery"]
      }
    },
    {
      name: "refresh_research",
      description: "调用 Bitget 五个分析 Skill 刷新资产研究，并把结果写回 Decision Brain 来源账本",
      inputSchema: {
        type: "object",
        properties: {
          assetQuery: { type: "string" },
          confidenceAtTime: { type: "number" }
        },
        required: ["assetQuery"]
      }
    },
    {
      name: "confirm_plan",
      description: "确认 draft 计划，切换为 active 并开始每日监测节奏",
      inputSchema: {
        type: "object",
        properties: {
          assetQuery: { type: "string" },
          planId: { type: "string" }
        }
      }
    },
    {
      name: "get_asset_context",
      description: "返回某个资产的完整记忆上下文，适合龙虾在回答用户前读取",
      inputSchema: {
        type: "object",
        properties: {
          assetQuery: { type: "string" }
        },
        required: ["assetQuery"]
      }
    },
    {
      name: "review_add_intent",
      description: "基于仓位、组合暴露、价格曲线、估值区间和计划状态给最终加仓建议",
      inputSchema: {
        type: "object",
        properties: {
          assetQuery: { type: "string" },
          portfolioValue: { type: "number" }
        },
        required: ["assetQuery"]
      }
    },
    {
      name: "review_sell_intent",
      description: "基于仓位、底仓规则、价格曲线、估值区间、事件和 thesis 状态给最终卖出建议",
      inputSchema: {
        type: "object",
        properties: {
          assetQuery: { type: "string" },
          requestedSellPct: { type: "number" },
          thesisInvalidated: { type: "boolean" }
        },
        required: ["assetQuery", "requestedSellPct"]
      }
    },
    {
      name: "run_daily_monitor",
      description: "执行每日一次新闻和仓位监测；24 小时内重复调用会自动跳过",
      inputSchema: {
        type: "object",
        properties: {
          force: { type: "boolean" }
        }
      }
    },
    {
      name: "log_source",
      description: "给某个资产追加结构化来源记录",
      inputSchema: {
        type: "object",
        properties: {
          assetQuery: { type: "string" },
          sourceType: { type: "string" },
          author: { type: "string" },
          title: { type: "string" },
          url: { type: "string" },
          keyClaim: { type: "string" },
          roleInDecision: { type: "string" },
          confidenceAtTime: { type: "number" }
        },
        required: ["assetQuery", "title", "keyClaim"]
      }
    },
    {
      name: "archive_asset",
      description: "归档资产，停止其 active 监测",
      inputSchema: {
        type: "object",
        properties: {
          assetQuery: { type: "string" }
        },
        required: ["assetQuery"]
      }
    }
  ];
}
