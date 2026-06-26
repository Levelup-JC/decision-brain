import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

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
import { resolveProjectPath } from "./paths.mjs";
import { json, notFound, parseJsonBody, sendHtml, sendText } from "./utils/http.mjs";
import { isRuleOnly } from "./llm-client.mjs";
import { runOrchestrator, synthesizeRule, synthesizeWithResults } from "./chat-orchestrator.mjs";
import { runAgent, runFanoutAgents } from "./agent-runner.mjs";

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

    if (request.method === "GET" && url.pathname === "/api/capabilities") {
      json(response, 200, buildCapabilities());
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

      if (orchestration.fanout.length > 0) {
        const FANOUT_TIMEOUT_MS = 7000;

        const fanoutPromise = runFanoutAgents(orchestration.fanout, orchestration.assetQuery, context);
        const timeoutPromise = new Promise((resolve) =>
          setTimeout(() => resolve("__FANOUT_TIMEOUT__"), FANOUT_TIMEOUT_MS)
        );

        const raceResult = await Promise.race([fanoutPromise, timeoutPromise]);

        if (raceResult === "__FANOUT_TIMEOUT__") {
          orchestration.agentResults = [];
          orchestration.trace = orchestration.fanout.map((role) => ({
            agentRole: role,
            tool: "unknown",
            args: {},
            ok: false,
            tookMs: FANOUT_TIMEOUT_MS,
            cached: false,
            rawSnippet: "",
            error: "fanout_timeout",
          }));
          orchestration.degraded = true;
          orchestration.reply = synthesizeRule(
            orchestration.intent,
            [],
            { assetQuery: orchestration.assetQuery, ...orchestration.slots },
            context
          );
        } else {
          orchestration.agentResults = raceResult.agentResults;
          orchestration.trace = raceResult.trace || [];

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
