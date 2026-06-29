import { describe, it } from "node:test";
import assert from "node:assert";
import { logTurn, getSessionLog, exportMarkdown, listSessions } from "../src/services/conversation-log-service.mjs";

describe("Conversation Log Service", () => {
  it("logs a turn and retrieves by sessionId", () => {
    const sid = "plan14-test-001";
    logTurn(sid, {
      userMessage: "研究 BTC",
      assistantReply: "正在研究 BTC...",
      intent: "evaluate_candidate",
      assetQuery: "BTC",
      slots: { assetQuery: "BTC" },
      fanout: [{ role: "macro" }, { role: "news" }],
      dispatchPlan: [{ role: "macro", provider: "Bitget MCP", skill: "macro-analyst" }],
      agentResults: [{ role: "macro", status: "ok", headline: "CPI 4.17%" }],
      trace: [{ tool: "macro_indicators", ok: true, tookMs: 1200 }],
      latencyMs: 8000,
      degraded: false,
      error: null,
    });

    const session = getSessionLog(sid);
    assert.equal(session.sessionId, sid);
    assert.equal(session.turns.length, 1);
    assert.equal(session.turns[0].intent, "evaluate_candidate");
    assert.equal(session.turns[0].assetQuery, "BTC");
  });

  it("logs multiple turns for the same session", () => {
    const sid = "plan14-test-002";
    logTurn(sid, { userMessage: "研究 BTC", assistantReply: "OK", intent: "evaluate_candidate" });
    logTurn(sid, { userMessage: "买一个", assistantReply: "确认 1 BTC", intent: "manage_position" });
    logTurn(sid, { userMessage: "确认", assistantReply: "已写入", intent: "confirm_plan" });

    const session = getSessionLog(sid);
    assert.equal(session.turns.length, 3);
    assert.equal(session.turns[0].intent, "evaluate_candidate");
    assert.equal(session.turns[1].intent, "manage_position");
    assert.equal(session.turns[2].intent, "confirm_plan");
  });

  it("exports markdown with all required sections", () => {
    const sid = "plan14-test-003";
    logTurn(sid, {
      userMessage: "我不想看了，直接买一个吧。",
      assistantReply: "BTC 持仓已记录：1 个，成本 $60000。",
      intent: "manage_position",
      assetQuery: "BTC",
      slots: { assetQuery: "BTC", units: 1, averageCost: 60000 },
      pendingPosition: { assetQuery: "BTC", units: 1, averageCost: 60000, reason: "看好BTC", confirmed: false },
      fanout: [{ role: "memory" }, { role: "valuation" }],
      dispatchPlan: [{ role: "memory", provider: "Decision Brain", skill: "local memory layer" }],
      agentResults: [{ role: "memory", status: "ok", headline: "BTC 现有持仓", tookMs: 500 }],
      trace: [{ tool: "state.read", provider: "Decision Brain", ok: true, tookMs: 100 }],
      latencyMs: 5000,
      degraded: false,
      error: null,
    });

    const md = exportMarkdown(sid);
    assert.ok(md.includes("# Decision Brain 对话日志"));
    assert.ok(md.includes(sid));
    assert.ok(md.includes("manage_position"));
    assert.ok(md.includes("BTC 持仓已记录"));
    assert.ok(md.includes("不想看了，直接买一个吧"));
    assert.ok(md.includes("Agent 调度"));
    assert.ok(md.includes("Agent 结果"));
    assert.ok(md.includes("MCP Trace"));
    assert.ok(md.includes("待确认仓位"));
    assert.ok(md.includes("60000"));
  });

  it("returns empty session for unknown id", () => {
    const session = getSessionLog("nonexistent-session");
    assert.equal(session.sessionId, "nonexistent-session");
    assert.equal(session.turns.length, 0);
  });

  it("returns empty markdown for unknown session", () => {
    const md = exportMarkdown("nonexistent-session");
    assert.ok(md.includes("暂无对话记录"));
  });

  it("lists all sessions with turn counts", () => {
    const sessions = listSessions();
    assert.ok(Array.isArray(sessions));
    assert.ok(sessions.length >= 3); // at least the 3 we created above
    const testSession = sessions.find((s) => s.sessionId === "plan14-test-002");
    assert.ok(testSession);
    assert.equal(testSession.turnCount, 3);
  });

  it("includes pendingAssetConfirmation in markdown when present", () => {
    const sid = "plan14-test-004";
    logTurn(sid, {
      userMessage: "我买了 RH999 10 个",
      assistantReply: "无法确认 RH999 身份...",
      intent: "manage_position",
      assetQuery: "RH999",
      pendingAssetConfirmation: {
        originalInput: "RH999",
        resolvedSymbol: "RH999",
        confidence: "low",
        confirmed: false,
      },
      latencyMs: 2000,
    });

    const md = exportMarkdown(sid);
    assert.ok(md.includes("资产身份确认"));
    assert.ok(md.includes("RH999"));
  });

  it("handles error and degraded flags in markdown", () => {
    const sid = "plan14-test-005";
    logTurn(sid, {
      userMessage: "测试",
      assistantReply: "出错",
      intent: "unknown",
      degraded: true,
      error: "LLM timeout",
      latencyMs: 6000,
    });

    const md = exportMarkdown(sid);
    assert.ok(md.includes("Degraded"));
    assert.ok(md.includes("yes"));
    assert.ok(md.includes("LLM timeout"));
  });
});
