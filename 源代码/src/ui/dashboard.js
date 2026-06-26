import { addChatBubble, renderSuggestions, onChatSend, initChat } from "./chat.js";
import { initCommittee, fanoutAgents, agentArrived, synthesizeChief, setDegraded, markAgentTimeout } from "./committee.js";
import { initPortfolio, startPolling, setStateCache, renderPortfolio } from "./portfolio.js";
import { renderValuationChart, renderPortfolioChart } from "./charts.js";
import { mockChatAPI, mockStateAPI } from "./mock-data.js";

const USE_MOCK = false;

// Session context maintained across requests for context continuity
const sessionContext = {
  lastAsset: null,
  lastIntent: null,
  lastPrice: null,
  recentTurns: [],
};
const MAX_RECENT_TURNS = 10;

function updateSessionContext(message, resp) {
  sessionContext.lastIntent = resp.intent || sessionContext.lastIntent;
  if (resp.assetQuery) {
    sessionContext.lastAsset = resp.assetQuery;
  }
  sessionContext.recentTurns.push({
    role: "user",
    message,
    intent: resp.intent || "unknown",
    assetQuery: resp.assetQuery || null,
  });
  if (sessionContext.recentTurns.length > MAX_RECENT_TURNS) {
    sessionContext.recentTurns = sessionContext.recentTurns.slice(-MAX_RECENT_TURNS);
  }
}

async function fetchState() {
  if (USE_MOCK) return mockStateAPI();
  const r = await fetch("/api/state");
  return r.json();
}

async function sendChat(message) {
  const ABORT_MS = 25000;
  let resp;
  if (USE_MOCK) {
    resp = await mockChatAPI(message);
  } else {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ABORT_MS);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          sessionId: "demo-001",
          context: {
            lastAsset: sessionContext.lastAsset,
            lastIntent: sessionContext.lastIntent,
            lastPrice: sessionContext.lastPrice,
            recentTurns: sessionContext.recentTurns,
          },
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (!r.ok) {
        throw new Error(`服务器错误 (${r.status})`);
      }

      resp = await r.json();
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new Error("响应超时，请重试");
      }
      throw new Error(err.message || "网络请求失败");
    }
  }

  // Update session context from response
  updateSessionContext(message, resp);

  // F8: Chief dispatch
  if (resp.fanout && resp.fanout.length) {
    fanoutAgents(resp.fanout);

    if (resp.agentResults && resp.agentResults.length) {
      staggerAgentArrivals(resp.agentResults, resp.trace || []);
    } else if (resp.trace && resp.trace.length) {
      // Timeout case: trace has timeout markers for each fanout role
      const timedOutRoles = new Set(
        resp.trace.filter((t) => t.error === "fanout_timeout").map((t) => t.agentRole)
      );
      timedOutRoles.forEach((role) => markAgentTimeout(role));
    }
  }

  // Chief's synthesized reply + suggestions
  const reply = resp.reply || "(未获取到回复)";
  const suggestions = resp.suggestions || [];
  addChatBubble("chief", reply, suggestions);

  synthesizeChief(reply);
  setDegraded(!!resp.degraded);

  // Refresh state & charts (best-effort, don't block on failure)
  try {
    const state = await fetchState();
    setStateCache(state);
    setTimeout(() => {
      renderPortfolio(state);
      const valn = (state.valuationModels || [])[0];
      if (valn) renderValuationChart(valn);
      renderPortfolioChart(state.positions || []);
    }, 600);
  } catch (err) {
    console.error("fetchState failed:", err);
  }
}

function staggerAgentArrivals(agentResults, trace) {
  const STAGGER_BASE = 500;
  const STAGGER_STEP = 380;

  agentResults.forEach((agent, i) => {
    setTimeout(() => {
      // Collect trace entries for this agent role
      const roleTraces = (trace || []).filter((t) => t.agentRole === agent.role);
      // Also check agent.data.sources for trace-like data
      const dataSources = agent.data?.sources || [];
      const combinedTraces = roleTraces.length > 0
        ? roleTraces
        : (Array.isArray(dataSources) ? dataSources.filter((s) => s.tool) : []);
      agentArrived(agent.role, agent.headline, agent.tookMs, agent.status, combinedTraces);
    }, STAGGER_BASE + i * STAGGER_STEP);
  });
}

async function boot() {
  initChat();
  initCommittee();
  initPortfolio();

  onChatSend(sendChat);

  // Initial state
  const state = await fetchState();
  setStateCache(state);
  renderPortfolio(state);

  const valn = (state.valuationModels || [])[0];
  if (valn) renderValuationChart(valn);
  renderPortfolioChart(state.positions || []);

  // F3: Live polling
  startPolling(fetchState, 5000);

  document.getElementById("statusLabel").textContent = USE_MOCK ? "Mock 模式" : "已连接";
}

boot();
