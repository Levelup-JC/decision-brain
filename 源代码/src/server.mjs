import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

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
              const mcapInfo = p.latestMetrics?.marketCap
                ? `，市值 $${(p.latestMetrics.marketCap / 1e9).toFixed(1)}B` : "";
              return `${i + 1}. ${p.symbol}: 持有 ${p.units} 个${costInfo}，当前价 $${p.currentPrice}${mcapInfo}，计划状态: ${planLabel}${zoneLabel}`;
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
        }
      } else {
        orchestration.agentResults = [];
        orchestration.trace = [];
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
