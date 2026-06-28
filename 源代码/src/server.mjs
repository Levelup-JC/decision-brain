import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  archiveAsset,
  buildCapabilities,
  confirmPlan,
  evaluateCandidate,
  fetchOhlcvData,
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
import { resolveProjectPath } from "./paths.mjs";
import { json, notFound, parseJsonBody, sendHtml, sendText } from "./utils/http.mjs";
import { isRuleOnly } from "./llm-client.mjs";
import { runOrchestrator, synthesizeRule, synthesizeWithResults } from "./chat-orchestrator.mjs";
import { runAgent, runFanoutAgents } from "./agent-runner.mjs";
import { store } from "./data-store.mjs";

const uiDir = resolveProjectPath("src", "ui");

async function serveDashboard(response) {
  const html = await readFile(join(uiDir, "dashboard.html"), "utf8");
  sendHtml(response, html);
}

async function serveStaticFile(response, filePath, contentType) {
  const content = await readFile(filePath, "utf8");
  sendText(response, content, contentType);
}

export async function handleRequest(request, response) {
  try {
    const url = new URL(request.url || "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/") {
      await serveDashboard(response);
      return;
    }

    // Serve any .js module from ui/
    if (request.method === "GET" && url.pathname.endsWith(".js") && !url.pathname.includes("..")) {
      const filePath = join(uiDir, url.pathname.replace(/^\//, ""));
      await serveStaticFile(response, filePath, "application/javascript; charset=utf-8");
      return;
    }

    // Serve .json files from ui/ (demo-state.json etc.)
    if (request.method === "GET" && url.pathname.endsWith(".json") && !url.pathname.includes("..")) {
      const filePath = join(uiDir, url.pathname.replace(/^\//, ""));
      await serveStaticFile(response, filePath, "application/json; charset=utf-8");
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      json(response, 200, { ok: true, service: "decision-brain" });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/reset") {
      await store.clear();
      json(response, 200, { ok: true, message: "State reset" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/capabilities") {
      json(response, 200, buildCapabilities());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/portfolio-summary") {
      json(response, 200, await getPortfolioSummary());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/state") {
      json(response, 200, await getStateSummary());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ohlcv") {
      const asset = url.searchParams.get("asset") || "BTC";
      const days = Number(url.searchParams.get("days") || 30);
      const data = await fetchOhlcvData(asset, days);
      if (!data) {
        json(response, 502, { ok: false, error: "OHLCV data unavailable" });
        return;
      }
      json(response, 200, { ok: true, asset, days, data });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/asset-context") {
      json(response, 200, await getAssetContext(url.searchParams.get("asset")));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/lookup-portfolio-memory") {
      const body = await parseJsonBody(request);
      json(response, 200, await lookupPortfolioMemoryApi(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/evaluate-candidate") {
      const body = await parseJsonBody(request);
      json(response, 200, await evaluateCandidate(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/manage-position") {
      const body = await parseJsonBody(request);
      json(response, 200, await managePosition(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/refresh-research") {
      const body = await parseJsonBody(request);
      json(response, 200, await refreshResearch(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/confirm-plan") {
      const body = await parseJsonBody(request);
      json(response, 200, await confirmPlan(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/review-add-intent") {
      const body = await parseJsonBody(request);
      json(response, 200, await reviewAddIntent(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/review-sell-intent") {
      const body = await parseJsonBody(request);
      json(response, 200, await reviewSellIntent(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/run-daily-monitor") {
      const body = await parseJsonBody(request);
      json(response, 200, await runDailyMonitor(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/log-source") {
      const body = await parseJsonBody(request);
      json(response, 200, await logSource(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/archive-asset") {
      const body = await parseJsonBody(request);
      json(response, 200, await archiveAsset(body));
      return;
    }

    // ── v2 Agent endpoints ──────────────────────────────────────────

    if (request.method === "POST" && url.pathname === "/api/chat") {
      const body = await parseJsonBody(request);
      const headerSid = request.headers["x-session-id"];
      const sessionId = body.sessionId || headerSid || "";
      const context = body.context || {};

      // A-VI-3: no sessionId → stateless one-shot → conservative rule-only
      if (!sessionId) {
        context._stateless = true;
      }

      if (!body.message) {
        json(response, 400, { ok: false, error: "Missing required field: message" });
        return;
      }

      const orchestration = await runOrchestrator(body.message, sessionId || "stateless", context);

      // C组: lookup_memory with no specific asset → portfolio overview, skip fanout
      // Also trigger when message is clearly a portfolio-wide query even if
      // Layer 2 fallback assigned a recent asset (e.g. "我的持仓总览" → BTC from traces)
      const isPortfolioQuery = /持仓总览|投资总览|全部.*仓|投资组合|portfolio.*overview|总览|之前.*买|历史.*仓|买了什么|买过什么|投了什么|什么仓位|我.*持仓|我.*仓位|做过什么/.test(body.message);
      if (orchestration.intent === "lookup_memory" && (!orchestration.assetQuery || isPortfolioQuery)) {
        try {
          const summary = await getPortfolioSummary();
          if (summary.totalCount === 0) {
            orchestration.reply = `当前暂无持仓记录。你可以让我研究资产（如"研究 SOL"）或记录持仓来建立你的投资组合。`;
          } else {
            const lines = summary.positions.map((p, i) => {
              const planLabel = p.plan?.status === "active" ? "活跃监控中"
                : p.plan?.status === "draft" ? "draft (待确认)" : "无计划";
              const zoneLabel = p.valuationZone ? `，估值区间: ${p.valuationZone}` : "";
              const costInfo = p.averageCost ? `，成本 $${p.averageCost}` : "";
              const reasonInfo = p.reason ? `，理由: ${p.reason}` : "";
              const mcapInfo = p.latestMetrics?.marketCap
                ? `，市值 $${(p.latestMetrics.marketCap / 1e9).toFixed(1)}B` : "";
              return `${i + 1}. ${p.symbol}: 持有 ${p.units} 个${costInfo}，当前价 $${p.currentPrice}${mcapInfo}，计划状态: ${planLabel}${zoneLabel}${reasonInfo}`;
            });
            const statusParts = [];
            if (summary.activeCount > 0) statusParts.push(`${summary.activeCount} 个活跃`);
            if (summary.draftCount > 0) statusParts.push(`${summary.draftCount} 个待确认`);
            orchestration.reply = `你的投资组合共 ${summary.totalCount} 个仓位 (${statusParts.join("，")}):\n\n${lines.join("\n")}\n\n以上数据来自你的持仓记录与投资计划。如需查看某个资产的详细计划或估值，可以直接问我具体资产。`;
          }
        } catch {
          orchestration.reply = "暂时无法读取持仓数据，请稍后重试。";
        }
        orchestration.agentResults = [];
        orchestration.trace = [];
      } else if (orchestration.fanout.length > 0) {
        // Per-agent timeouts are handled inside runFanoutAgents;
        // partial results are preserved (timeout agents get error markers)
        const fanoutResult = await runFanoutAgents(orchestration.fanout, orchestration.assetQuery, context);
        orchestration.agentResults = fanoutResult.agentResults;
        orchestration.trace = fanoutResult.trace || [];

        const allFailed = orchestration.agentResults.every(
          (r) => r.status === "error" || r.status === "degraded"
        );

        if (allFailed && orchestration.agentResults.length > 0) {
          orchestration.degraded = true;
          orchestration.reply = synthesizeRule(
            orchestration.intent,
            orchestration.agentResults,
            { assetQuery: orchestration.assetQuery, ...orchestration.slots },
            context
          );
        } else {
          const reply = await synthesizeWithResults(
            orchestration.intent,
            orchestration.agentResults,
            { assetQuery: orchestration.assetQuery, ...orchestration.slots },
            context
          );
          orchestration.reply = reply;

          // manage_position: record as soon as we have asset + units
          // (portfolio updates immediately; cost/reason enriched incrementally)
          if (orchestration.intent === "manage_position" && orchestration.assetQuery && orchestration.slots.units) {
            try {
              const pp = orchestration.pendingPosition;
              await managePosition({
                assetQuery: orchestration.assetQuery,
                units: orchestration.slots.units,
                averageCost: orchestration.slots.averageCost || pp?.averageCost || 0,
                reason: pp?.reason || "",
                portfolioValue: orchestration.slots.portfolioValue,
              });
              // Only show "已写入" reply on confirmation or when all info is present
              if (pp?.confirmed) {
                orchestration.reply = `【当前状态】\n${orchestration.assetQuery} 已写入持仓：${orchestration.slots.units} 个，成本 $${orchestration.slots.averageCost || pp?.averageCost || 0}。${pp?.reason ? `\n购买理由: ${pp.reason}` : ""}\n\n【关键证据】\n1. 持仓已写入 Decision Brain 本地记忆\n2. 投资备忘录已生成\n3. 估值模型已建立\n\n【风险与缺口】\ndraft 计划需要确认后才能激活持续监控。\n\n【下一步建议】\n确认 ${orchestration.assetQuery} 投资计划以激活持续监控。\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。`;
              }
            } catch (err) {
              console.error("managePosition failed:", err.message);
            }
          }

          // Inject state-reference trace for run_monitor plan comparison
          if (orchestration.intent === "run_monitor" && orchestration.assetQuery) {
            orchestration.trace.push({
              tool: "state.read",
              provider: "Decision Brain",
              args: { operation: "plan_comparison", asset: orchestration.assetQuery },
              tookMs: 0,
              ok: true,
              rawSnippet: "读取本地投资计划、估值模型与持仓数据，生成实时对比",
            });
          }
        }
      } else {
        orchestration.agentResults = [];
        orchestration.trace = [];
      }

      // confirm_plan: actually confirm the draft plan in state
      if (orchestration.intent === "confirm_plan" && orchestration.assetQuery) {
        try {
          const confirmResult = await confirmPlan({ assetQuery: orchestration.assetQuery });
          orchestration.reply = `【当前状态】\n${orchestration.assetQuery} 投资计划已从 draft 切换为 active，持续监控已启动。\n\n【关键证据】\n1. 计划状态已确认：${confirmResult.plan?.status || "active"}\n2. 监控策略：${typeof confirmResult.monitoringPolicy === "string" ? confirmResult.monitoringPolicy : "每日新闻+仓位检查"}\n\n【风险与缺口】\n监控依赖于 Bitget MCP 数据可用性；如 MCP 不可用将降级为本地阈值对比。\n\n【下一步建议】\n可以随时运行"检查 ${orchestration.assetQuery} 计划"来查看实时数据与计划阈值的对比。\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。`;
        } catch (err) {
          orchestration.reply = `【当前状态】\n${orchestration.assetQuery} 计划确认失败：${err.message}。\n\n【下一步建议】\n请确认该资产已有 draft 计划，或先通过"我买了 ${orchestration.assetQuery} X 个，成本 Y"创建持仓和计划。`;
        }
      }

      // D组: expose diagnostic flags in response for env troubleshooting
      orchestration.ruleOnly = isRuleOnly();

      json(response, 200, orchestration);
      return;
    }

    const agentMatch = url.pathname.match(/^\/api\/agent\/(memory|macro|onchain|sentiment|technical|news|valuation)$/);
    if (request.method === "POST" && agentMatch) {
      const role = agentMatch[1];
      const body = await parseJsonBody(request);
      const { assetQuery } = body;
      if (!assetQuery) {
        json(response, 400, { ok: false, error: "Missing required field: assetQuery" });
        return;
      }
      const result = await runAgent(role, assetQuery);
      json(response, 200, result);
      return;
    }

    notFound(response);
  } catch (error) {
    json(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown server error"
    });
  }
}

export function createServer() {
  return createHttpServer(handleRequest);
}
