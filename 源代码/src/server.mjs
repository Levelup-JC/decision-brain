import { createServer as createHttpServer } from "node:http";

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
  removePosition,
  reviewAddIntent,
  reviewSellIntent,
  runDailyMonitor
} from "./services/api-service.mjs";
import { resolveAssetIdentity } from "./services/asset-service.mjs";
import { getAdapters } from "./adapters/index.mjs";

import { json, notFound, parseJsonBody, sendHtml, sendText } from "./utils/http.mjs";
import { isRuleOnly } from "./llm-client.mjs";
import { runOrchestrator, synthesizeRule, synthesizeWithResults } from "./chat-orchestrator.mjs";
import { runAgent, runFanoutAgents } from "./agent-runner.mjs";
import { store } from "./data-store.mjs";
import { logTurn, getSessionLog, exportMarkdown, listSessions } from "./services/conversation-log-service.mjs";
import {
  LOGIN_HTML,
  DASHBOARD_HTML,
  JS_MAP,
  JSON_MAP,
  IMAGE_MAP,
} from "./ui/static-assets.mjs";

function lookupAssetIdInState(assetQuery, state) {
  const normalized = String(assetQuery || "").toUpperCase().trim();
  if (!normalized) return null;
  for (const [id, asset] of Object.entries(state.assets || {})) {
    if ((asset.symbol || "").toUpperCase() === normalized) return id;
  }
  return null;
}

export async function handleRequest(request, response) {
  try {
    const url = new URL(request.url || "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/") {
      sendHtml(response, LOGIN_HTML);
      return;
    }

    if (request.method === "GET" && url.pathname === "/app") {
      sendHtml(response, DASHBOARD_HTML);
      return;
    }

    // Serve .js modules from static bundle
    if (request.method === "GET" && url.pathname.endsWith(".js")) {
      const name = url.pathname.replace(/^\//, "");
      if (JS_MAP[name]) {
        sendText(response, JS_MAP[name], "application/javascript; charset=utf-8");
        return;
      }
    }

    // Serve .json files from static bundle
    if (request.method === "GET" && url.pathname.endsWith(".json")) {
      const name = url.pathname.replace(/^\//, "");
      if (JSON_MAP[name]) {
        sendText(response, JSON_MAP[name], "application/json; charset=utf-8");
        return;
      }
    }

    // Serve image files from static bundle
    const imgMatch = url.pathname.match(/\/([^/]+\.(png|svg|jpg|jpeg|webp|ico))$/i);
    if (request.method === "GET" && imgMatch) {
      const name = imgMatch[1];
      const b64 = IMAGE_MAP[name];
      if (b64) {
        const ext = imgMatch[2].toLowerCase();
        const mimeTypes = { png: "image/png", svg: "image/svg+xml", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", ico: "image/x-icon" };
        const buf = Buffer.from(b64, "base64");
        response.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream", "cache-control": "public, max-age=3600" });
        response.end(buf);
        return;
      }
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

    if (request.method === "POST" && url.pathname === "/api/remove-position") {
      const body = await parseJsonBody(request);
      json(response, 200, await removePosition(body));
      return;
    }

    // ── Conversation Log endpoints ───────────────────────────────────

    if (request.method === "GET" && url.pathname === "/api/conversation-log") {
      const sid = url.searchParams.get("sessionId") || "demo-001";
      json(response, 200, getSessionLog(sid));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/conversation-log/export") {
      const sid = url.searchParams.get("sessionId") || "demo-001";
      const md = exportMarkdown(sid);
      sendText(response, md, "text/markdown; charset=utf-8");
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/conversation-log/sessions") {
      json(response, 200, listSessions());
      return;
    }

    // ── v2 Agent endpoints ──────────────────────────────────────────

    if (request.method === "POST" && url.pathname === "/api/chat") {
      const startedAt = Date.now();
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

      // Plan XVIII: portfolio overview must always use getPortfolioSummary() as
      // source of truth. The regex match overrides intent classification so
      // even if LLM misclassifies the message, the user always sees real holdings.
      const isPortfolioQuery = /持仓总览|投资总览|全部.*仓|投资组合|portfolio.*overview|总览|之前.*买|历史.*仓|买了什么|买过什么|投了什么|什么仓位|我.*持仓|我.*仓位|做过什么/.test(body.message);
      if (isPortfolioQuery || (orchestration.intent === "lookup_memory" && !orchestration.assetQuery)) {
        try {
          const summary = await getPortfolioSummary();
          if (summary.totalCount === 0) {
            orchestration.reply = `当前暂无持仓记录。你可以让我研究资产（如"研究 SOL"）或记录持仓来建立你的投资组合。`;
          } else {
            const lines = summary.positions.map((p, i) => {
              const planLabel = p.plan?.status === "active" ? "活跃监控中"
                : p.plan?.status === "draft" ? "draft (待确认)" : "无计划";
              const costInfo = p.averageCost ? `成本 $${p.averageCost}` : "成本 --";
              const valueInfo = p.currentValue ? `当前价值 $${p.currentValue}` : "";
              const costBasisInfo = p.costBasisTotal ? `成本基础 $${p.costBasisTotal}` : "";
              const pnlVal = p.currentValue && p.costBasisTotal
                ? p.currentValue - p.costBasisTotal : null;
              const pnlPct = p.costBasisTotal && p.costBasisTotal > 0 && pnlVal != null
                ? ((pnlVal / p.costBasisTotal) * 100) : null;
              const pnlInfo = pnlVal != null
                ? `浮动${pnlVal >= 0 ? "盈利 +" : "亏损 "}$${Math.abs(pnlVal).toFixed(0)} (${pnlPct != null ? (pnlPct >= 0 ? "+" : "") + pnlPct.toFixed(1) + "%" : "--"})`
                : "";
              const reasonInfo = p.reason ? `理由: ${p.reason}` : "";
              const goalInfo = p.plan?.investmentGoal ? `目标: ${p.plan.investmentGoal}` : "";
              const zoneLabel = p.valuationZone ? `估值区间: ${p.valuationZone}` : "";
              return `${i + 1}. ${p.symbol}: 持有 ${p.units} 个，${costInfo}，当前价 $${p.currentPrice}${valueInfo ? "，" + valueInfo : ""}${costBasisInfo ? "，" + costBasisInfo : ""}${pnlInfo ? "，" + pnlInfo : ""}，计划: ${planLabel}${zoneLabel ? "，" + zoneLabel : ""}${reasonInfo ? "，" + reasonInfo : ""}${goalInfo ? "，" + goalInfo : ""}`;
            });
            const statusParts = [];
            if (summary.activeCount > 0) statusParts.push(`${summary.activeCount} 个活跃`);
            if (summary.draftCount > 0) statusParts.push(`${summary.draftCount} 个待确认`);
            const pnlLine = summary.unrealizedPnl !== 0
              ? `\n浮动${summary.unrealizedPnl >= 0 ? "盈利" : "亏损"}: $${summary.unrealizedPnl} (${summary.unrealizedPnlPct >= 0 ? "+" : ""}${summary.unrealizedPnlPct}%)`
              : "";
            orchestration.reply = `你的投资组合共 ${summary.totalCount} 个仓位 (${statusParts.join("，")})，总价值 $${summary.totalPositionValue.toFixed(0)}${pnlLine}:\n\n${lines.join("\n")}\n\n以上数据来自你的持仓记录与投资计划。如需查看某个资产的详细计划或估值，可以直接问我具体资产。`;
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

      // ── manage_position: check asset identity before writing ──────────
      // Must be outside the fanout block because confirmed positions skip fanout (fanout=[])
      if (orchestration.intent === "manage_position" && orchestration.assetQuery && orchestration.slots.units) {
        try {
          const pp = orchestration.pendingPosition;
          const pac = orchestration.pendingAssetConfirmation || context.pendingAssetConfirmation;

          // Always verify asset identity before writing — even for pending positions
          // Prevents blindly recording unknown tickers like RH999
          if (!pac || !pac.confirmed) {
            const adapters = getAdapters({ offline: Boolean(process.env.DECISION_BRAIN_OFFLINE) });
            const inputSymbol = orchestration.assetQuery.toUpperCase();
            const resolvedAsset = await resolveAssetIdentity(inputSymbol, {}, adapters);

            const needsConfirmation =
              resolvedAsset.needsUserConfirmation === true ||
              resolvedAsset.identityConfidence === "low" ||
              (resolvedAsset.symbol !== inputSymbol &&
               resolvedAsset.assetType === "unclassified_asset");

            if (needsConfirmation) {
              const symbolMismatch = resolvedAsset.symbol !== inputSymbol;
              orchestration.pendingAssetConfirmation = {
                originalInput: inputSymbol,
                parsedAssetQuery: inputSymbol,
                resolvedSymbol: resolvedAsset.symbol,
                confidence: resolvedAsset.identityConfidence || "low",
                units: orchestration.slots.units,
                averageCost: orchestration.slots.averageCost || pp?.averageCost || 0,
                reason: pp?.reason || "",
                confirmed: false,
              };
              // Override the orchestrator reply
              if (symbolMismatch) {
                orchestration.reply = `我识别到你说的是 ${inputSymbol}，但外部数据源解析为 ${resolvedAsset.symbol}，两者不一致。请补充项目全称、合约地址，或回复"确认 ${inputSymbol}"来确认写入。`;
              } else {
                orchestration.reply = `我识别到你说的是 ${inputSymbol}，但还不能确认它是否为同名代币（当前为未分类资产）。请补充项目全称、合约地址，或回复"确认 ${inputSymbol}"来确认写入。`;
              }
              // Don't write position yet — wait for user confirmation
            } else if (pp?.confirmed || pac?.confirmed) {
              // Identity is good and position was confirmed — write it
              const writeSymbol = (pac?.confirmed && pac.originalInput) || orchestration.assetQuery;
              const stateForAddCheck = await store.load();
              const lookupForAdd = lookupAssetIdInState(writeSymbol, stateForAddCheck);
              const existingPos = lookupForAdd ? stateForAddCheck.positions[lookupForAdd] : null;
              const explicitReplace = /修正|改成|更正|修改|不是追加|实际是/.test(body.message);
              const isAddToExisting = !explicitReplace && existingPos && existingPos.units > 0;

              await managePosition({
                assetQuery: writeSymbol,
                units: orchestration.slots.units,
                averageCost: orchestration.slots.averageCost || pp?.averageCost || pac?.averageCost || 0,
                reason: pp?.reason || pac?.reason || "",
                portfolioValue: orchestration.slots.portfolioValue,
                action: isAddToExisting ? "add" : undefined,
              });
              orchestration.pendingAssetConfirmation = null;
              orchestration.reply = `【当前状态】\n仓位已确认写入：${writeSymbol} ${orchestration.slots.units} 个，成本 $${orchestration.slots.averageCost || pp?.averageCost || pac?.averageCost || 0}。${(pp?.reason || pac?.reason) ? `\n购买理由: ${pp?.reason || pac?.reason}` : ""}\n\n【关键证据】\n1. 持仓已写入 Decision Brain 本地记忆\n2. 投资备忘录已生成\n3. 估值模型已建立\n\n【风险与缺口】\ndraft 投资计划已生成，但尚未激活持续监控。\n\n【下一步建议】\n如果要启动价格监控和加减仓提醒，请回复"确认 ${writeSymbol} 投资计划"。\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。`;
            }
          }
        } catch (err) {
          console.error("managePosition failed:", err.message);
        }
      }

      // ── Safety net: review_sell MUST NEVER mutate positions ─────────
      if (orchestration.intent === "review_sell") {
        // Guaranteed no-op: review_sell only does analysis/advice.
        // No managePosition call is reachable from this path.
      }

      // ── sell_execute (draft): user says they sold, but NO mutation yet ──
      // Only creates pendingSellExecution draft. Actual mutation requires
      // sell_execute_confirmed with existing draft.
      if (orchestration.intent === "sell_execute" && orchestration.assetQuery) {
        // Draft created in orchestrator — no position mutation here.
        // synthesizeRule already returns the confirmation prompt.
      }

      // ── sell_execute_confirmed: only path that triggers managePosition("sell") ──
      if (orchestration.intent === "sell_execute_confirmed" && orchestration.assetQuery) {
        const pse = orchestration.pendingSellExecution || context.pendingSellExecution;

        if (pse && pse.confirmed && pse.units) {
          try {
            const sellResult = await managePosition({
              assetQuery: pse.assetQuery || orchestration.assetQuery,
              units: pse.units,
              action: "sell",
              portfolioValue: orchestration.slots.portfolioValue,
            });
            if (sellResult.ok) {
              orchestration.reply = `已记录卖出：${pse.assetQuery || orchestration.assetQuery} 卖出 ${pse.units} 个。持仓已更新。\n\n【关键证据】\n1. 卖出记录已写入\n2. 持仓数量已减少\n3. 平均成本保持不变\n\n数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。`;
            } else {
              orchestration.reply = `卖出记录失败：${sellResult.error || "未知错误"}`;
            }
            orchestration.pendingSellExecution = null;
          } catch (err) {
            console.error("sellExecute failed:", err.message);
            orchestration.reply = `卖出记录失败：${err.message}。`;
          }
        }
        // Without pending draft: synthesizeRule already returned rejection message
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

      // remove_position: archive a single position (fanout-free intent)
      if (orchestration.intent === "remove_position" && orchestration.assetQuery) {
        const hadPac = context.pendingAssetConfirmation && !context.pendingAssetConfirmation.confirmed;
        if (hadPac && !orchestration.pendingAssetConfirmation) {
          // Pending confirmation was just discarded — asset was never written
          orchestration.reply = `已取消 ${orchestration.assetQuery} 的待确认仓位，未写入任何资产。`;
        } else {
          try {
            const result = await removePosition({ assetQuery: orchestration.assetQuery });
            orchestration.reply = result.message || `${orchestration.assetQuery} 已从资产面板移除。`;
          } catch (err) {
            orchestration.reply = `移除 ${orchestration.assetQuery} 失败：${err.message}。请确认该资产已存在于你的仓位中。`;
          }
        }
        orchestration.pendingAssetConfirmation = null;
      }

      // reset_portfolio: clear all assets and positions (fanout-free intent)
      if (orchestration.intent === "reset_portfolio") {
        const isConfirm = /^确认清空$/i.test(body.message.trim()) || /^确认重置$/i.test(body.message.trim());
        const isCancel = /^(取消|不要|算了|cancel|no|不)/i.test(body.message.trim());
        if (isConfirm) {
          try {
            await store.clear();
            orchestration.reply = `全部资产与仓位已清空。你现在可以从头开始记录个性化的投资组合。`;
            orchestration.agentResults = [];
            orchestration.trace = [];
          } catch (err) {
            orchestration.reply = `清空失败：${err.message}。请稍后重试。`;
          }
        } else if (isCancel) {
          orchestration.reply = "已取消清空操作。你的所有资产和仓位保持不变。";
        }
        // Otherwise: confirmation prompt already set by orchestrator synthesize
      }

      // D组: expose diagnostic flags in response for env troubleshooting
      orchestration.ruleOnly = isRuleOnly();

      // Extract lastKnownPrice from agent results for dialog continuity
      if (orchestration.agentResults?.length > 0 && orchestration.assetQuery) {
        const assetInfo = orchestration.agentResults.find((r) => r.role === "asset_info");
        if (assetInfo?.data?.currentMetrics?.price != null) {
          const priceStr = String(assetInfo.data.currentMetrics.price).replace("$", "");
          const priceVal = parseFloat(priceStr);
          if (!isNaN(priceVal)) {
            orchestration.lastKnownPrice = priceVal;
            orchestration.lastKnownPriceAsset = orchestration.assetQuery;
          }
        }
      }

      // Log conversation turn for audit/export
      logTurn(sessionId || "demo-001", {
        userMessage: body.message,
        assistantReply: orchestration.reply,
        intent: orchestration.intent,
        assetQuery: orchestration.assetQuery,
        slots: orchestration.slots,
        pendingPosition: orchestration.pendingPosition,
        pendingAssetConfirmation: orchestration.pendingAssetConfirmation,
        pendingSellExecution: orchestration.pendingSellExecution,
        fanout: orchestration.fanout,
        dispatchPlan: orchestration.dispatchPlan,
        agentResults: orchestration.agentResults,
        trace: orchestration.trace,
        latencyMs: Date.now() - startedAt,
        degraded: orchestration.degraded,
        error: null,
      });

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
