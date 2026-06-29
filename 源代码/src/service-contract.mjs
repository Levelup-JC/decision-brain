import {
  archiveAsset,
  buildCapabilities,
  confirmPlan,
  evaluateCandidate,
  getAssetContext,
  getPortfolioSummary,
  getStateSummary,
  lookupPortfolioMemoryApi,
  logSource,
  managePosition,
  refreshResearch,
  reviewAddIntent,
  reviewSellIntent,
  runDailyMonitor
} from "./services/api-service.mjs";
import { exportMarkdown, getSessionLog } from "./services/conversation-log-service.mjs";

export async function callTool(name, args = {}) {
  switch (name) {
    case "health":
      return { ok: true, service: "decision-brain" };
    case "capabilities":
      return buildCapabilities();
    case "state":
      return getStateSummary();
    case "get_portfolio_summary":
      return getPortfolioSummary();
    case "lookup_portfolio_memory":
      return lookupPortfolioMemoryApi(args);
    case "get_position_memory":
      return getAssetContext(args.assetQuery || args.asset);
    case "evaluate_candidate":
      return evaluateCandidate(args);
    case "manage_position":
      return managePosition(args);
    case "record_sell_execution":
      return managePosition({ ...args, action: "sell" });
    case "refresh_research":
      return refreshResearch(args);
    case "confirm_plan":
      return confirmPlan(args);
    case "confirm_investment_thesis": {
      const ctx = await getAssetContext(args.assetQuery || args.asset);
      if (!ctx.position) throw new Error(`No position found for ${args.assetQuery}`);
      return managePosition({
        assetQuery: args.assetQuery,
        units: ctx.position.units,
        averageCost: ctx.position.averageCost,
        originalThesis: args.thesis || ctx.memorySummary.originalThesis,
        investmentGoal: args.investmentGoal || ctx.memorySummary.investmentGoal,
        targetUnits: args.targetUnits ?? ctx.memorySummary.targetUnits,
      });
    }
    case "review_panic_sell": {
      const ctx = await getAssetContext(args.assetQuery || args.asset);
      return {
        ok: true,
        asset: args.assetQuery,
        panicDetected: true,
        goalProgress: ctx.memorySummary.goalProgress,
        originalThesis: ctx.memorySummary.originalThesis,
        floorRule: ctx.memorySummary.floorRule,
        recommendation: "回看投资初心和计划边界后再决定",
      };
    }
    case "export_decision_context":
      return {
        ok: true,
        sessionLog: getSessionLog(args.sessionId || "demo-001"),
        markdown: exportMarkdown(args.sessionId || "demo-001"),
      };
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
    },
    {
      name: "get_portfolio_summary",
      description: "返回完整组合摘要，包含仓位、计划、目标进度和投资目标字段",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "get_position_memory",
      description: "返回某个资产的完整仓位记忆，包含目标、thesis、底仓规则和进度",
      inputSchema: {
        type: "object",
        properties: {
          assetQuery: { type: "string" }
        },
        required: ["assetQuery"]
      }
    },
    {
      name: "confirm_investment_thesis",
      description: "确认/更新投资 thesis 和目标，写入仓位记忆并绑定到计划",
      inputSchema: {
        type: "object",
        properties: {
          assetQuery: { type: "string" },
          thesis: { type: "string" },
          investmentGoal: { type: "string" },
          targetUnits: { type: "number" }
        },
        required: ["assetQuery"]
      }
    },
    {
      name: "review_panic_sell",
      description: "恐慌卖出护栏：回看投资初心、目标进度、thesis 是否失效，给出克制选项",
      inputSchema: {
        type: "object",
        properties: {
          assetQuery: { type: "string" }
        },
        required: ["assetQuery"]
      }
    },
    {
      name: "record_sell_execution",
      description: "记录已执行的卖出，更新仓位和记忆",
      inputSchema: {
        type: "object",
        properties: {
          assetQuery: { type: "string" },
          units: { type: "number" },
          price: { type: "number" }
        },
        required: ["assetQuery"]
      }
    },
    {
      name: "export_decision_context",
      description: "导出会话日志和决策上下文为 Markdown，用于复盘和 trace",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" }
        }
      }
    }
  ];
}
