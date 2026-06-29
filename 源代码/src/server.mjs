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
  removePosition,
  reviewAddIntent,
  reviewSellIntent,
  runDailyMonitor
} from "./services/api-service.mjs";
import { resolveAssetIdentity } from "./services/asset-service.mjs";
import { getAdapters } from "./adapters/index.mjs";
import { resolveProjectPath } from "./paths.mjs";
import { json, notFound, parseJsonBody, sendHtml, sendText } from "./utils/http.mjs";
import { isRuleOnly } from "./llm-client.mjs";
import { runOrchestrator, synthesizeRule, synthesizeWithResults } from "./chat-orchestrator.mjs";
import { runAgent, runFanoutAgents } from "./agent-runner.mjs";
import { store } from "./data-store.mjs";
import { logTurn, getSessionLog, exportMarkdown, listSessions } from "./services/conversation-log-service.mjs";

const uiDir = resolveProjectPath("src", "ui");

const FALLBACK_LOGIN = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>升级实验室 — 你的投资 Agent 团队</title>
<link rel="icon" href="decision-brain-logo.png">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#202124;color:#e8eaed;font-family:"Google Sans","Roboto",system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center}
.hero-logo{width:80px;height:auto;margin-bottom:24px}
h1{font-size:3rem;font-weight:900;text-transform:uppercase;letter-spacing:.15em;margin-bottom:12px}
h1 span{color:#8ab4f8}
.sub{font-size:12px;color:#8ab4f8;text-transform:uppercase;letter-spacing:.3em;margin-bottom:48px;opacity:.8}
.btn{background:transparent;border:1px solid #8ab4f8;color:#8ab4f8;padding:16px 48px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.25em;cursor:pointer;transition:all .3s}
.btn:hover{background:#8ab4f8;color:#202124;box-shadow:0 0 40px rgba(138,180,248,.1)}
</style></head><body>
<img class="hero-logo" src="decision-brain-logo.png" alt="Decision Brain">
<h1>你的投资<span> Agent </span>团队</h1>
<div class="sub">升级实验室出品</div>
<button class="btn" onclick="location.href='/app'">立即体验</button>
</body></html>`;

function lookupAssetIdInState(assetQuery, state) {
  const normalized = String(assetQuery || "").toUpperCase().trim();
  if (!normalized) return null;
  for (const [id, asset] of Object.entries(state.assets || {})) {
    if ((asset.symbol || "").toUpperCase() === normalized) return id;
  }
  return null;
}

async function serveDashboard(response) {
  const html = await readFile(join(uiDir, "dashboard.html"), "utf8");
  sendHtml(response, html);
}

async function serveStaticFile(response, filePath, contentType) {
  const content = await readFile(filePath, "utf8");
  sendText(response, content, contentType);
}

async function serveBinaryFile(response, filePath, contentType) {
  const content = await readFile(filePath);
  response.writeHead(200, { "content-type": contentType, "cache-control": "public, max-age=3600" });
  response.end(content);
}

export async function handleRequest(request, response) {
  try {
    const url = new URL(request.url || "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/") {
      try {
        const html = await readFile(join(uiDir, "login.html"), "utf8");
        sendHtml(response, html);
      } catch {
        sendHtml(response, FALLBACK_LOGIN);
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/app") {
      try {
        await serveDashboard(response);
      } catch {
        sendHtml(response, FALLBACK_LOGIN.replace("location.href='/app'", "location.href='/'"));
      }
      return;
    }

    // Serve any .js module from ui/
    if (request.method === "GET" && url.pathname.endsWith(".js") && !url.pathname.includes("..")) {
      try {
        const filePath = join(uiDir, url.pathname.replace(/^\//, ""));
        await serveStaticFile(response, filePath, "application/javascript; charset=utf-8");
      } catch { /* silently skip missing files on Vercel */ }
      return;
    }

    // Serve .json files from ui/ (demo-state.json etc.)
    if (request.method === "GET" && url.pathname.endsWith(".json") && !url.pathname.includes("..")) {
      try {
        const filePath = join(uiDir, url.pathname.replace(/^\//, ""));
        await serveStaticFile(response, filePath, "application/json; charset=utf-8");
      } catch { /* silently skip */ }
      return;
    }

    // Serve image files from ui/
    const imgExt = url.pathname.match(/\.(png|svg|jpg|jpeg|webp|ico)$/i);
    if (request.method === "GET" && imgExt && !url.pathname.includes("..")) {
      try {
        const filePath = join(uiDir, url.pathname.replace(/^\//, ""));
        const mimeTypes = { png: "image/png", svg: "image/svg+xml", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", ico: "image/x-icon" };
        await serveBinaryFile(response, filePath, mimeTypes[imgExt[1].toLowerCase()] || "application/octet-stream");
      } catch { /* silently skip missing images on Vercel */ }
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

      // ── sell_execute: record executed sell, reduce position ──────────
      if (orchestration.intent === "sell_execute" && orchestration.assetQuery) {
        const pse = orchestration.pendingSellExecution || context.pendingSellExecution;
        const isConfirmMsg = /^确认记录卖出$/i.test(body.message.trim());

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
        } else if (isConfirmMsg && pse && !pse.units) {
          orchestration.reply = `请先说明卖出数量，例如"已经卖了 1 个 BTC"。`;
        }
        // Otherwise: confirmation prompt already set by orchestrator synthesizeRule
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
