import { addChatBubble, renderSuggestions, onChatSend, initChat } from "./chat.js";
import { initCommittee, fanoutAgents, agentArrived, synthesizeChief, setDegraded, markAgentTimeout } from "./committee.js";
import { initPortfolio, startPolling, setStateCache, setRefreshCallback, renderPortfolio, stopPolling } from "./portfolio.js";
import { renderKlineChart, hideKlineChart, renderPortfolioChart } from "./charts.js";
import { mockChatAPI, mockStateAPI } from "./mock-data.js";

const USE_MOCK = (() => {
  const p = new URLSearchParams(window.location.search);
  return p.get("mock") === "1" || p.get("mock") === "true";
})();

const USE_DEMO = (() => {
  const p = new URLSearchParams(window.location.search);
  return p.get("demo") === "1" || p.get("demo") === "true";
})();

// Last known good state cache for offline resilience
let lastGoodState = null;
// Plan XVIII: cache last valid portfolio summary so UI never flashes empty
let lastGoodPortfolioSummary = null;

// Preloaded demo state (loaded from demo-state.json)
let demoStateCache = null;

async function loadDemoState() {
  if (demoStateCache) return demoStateCache;
  try {
    const r = await fetch("/demo-state.json");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    demoStateCache = await r.json();
    return demoStateCache;
  } catch (err) {
    console.error("loadDemoState failed:", err);
    // Fall back to mock data
    return mockStateAPI();
  }
}

// Session context maintained across requests for context continuity
const sessionContext = {
  lastAsset: null,
  lastIntent: null,
  lastPrice: null,
  recentTurns: [],
  pendingPosition: null,
  pendingAssetConfirmation: null,
  pendingResetConfirmation: null,
  lastResearchSummary: null,
};
const MAX_RECENT_TURNS = 10;

function updateSessionContext(message, resp) {
  sessionContext.lastIntent = resp.intent || sessionContext.lastIntent;
  if (resp.assetQuery) {
    sessionContext.lastAsset = resp.assetQuery;
  }
  // Track last known price for dialog continuity (e.g., "现在的价格就是我的成本")
  if (resp.lastKnownPrice != null) {
    sessionContext.lastPrice = resp.lastKnownPrice;
  }
  // Track pending position for confirmation flow
  if (resp.pendingPosition !== undefined) {
    sessionContext.pendingPosition = resp.pendingPosition;
  }
  // Track pending asset confirmation for identity verification flow
  if (resp.pendingAssetConfirmation !== undefined) {
    sessionContext.pendingAssetConfirmation = resp.pendingAssetConfirmation;
  }
  // Track pending reset confirmation
  if (resp.pendingResetConfirmation !== undefined) {
    sessionContext.pendingResetConfirmation = resp.pendingResetConfirmation;
  }
  // Track last research summary for dedup (Plan XV)
  if (resp.lastResearchSummary) {
    sessionContext.lastResearchSummary = resp.lastResearchSummary;
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
  if (USE_DEMO) return loadDemoState();
  if (USE_MOCK) return mockStateAPI();
  try {
    const r = await fetch("/api/state");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const state = await r.json();
    lastGoodState = state;
    return state;
  } catch (err) {
    console.error("fetchState failed, using cache:", err.message);
    if (lastGoodState) {
      setDegraded(true);
      return lastGoodState;
    }
    throw err;
  }
}

async function fetchPortfolioSummary() {
  if (USE_DEMO || USE_MOCK) return null;
  try {
    const r = await fetch("/api/portfolio-summary");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const summary = await r.json();
    if (summary?.ok && summary.totalCount >= 0) {
      lastGoodPortfolioSummary = summary;
    }
    return summary;
  } catch (err) {
    console.error("fetchPortfolioSummary failed:", err.message);
    return lastGoodPortfolioSummary;
  }
}

function updateStatusLabel() {
  const label = document.getElementById("statusLabel");
  const badge = document.getElementById("modeBadge");
  if (USE_DEMO) {
    label.textContent = "Demo 模式";
    badge.textContent = "DEMO";
    badge.className = "mode-badge";
  } else if (USE_MOCK) {
    label.textContent = "Mock 模式";
    badge.textContent = "MOCK";
    badge.className = "mode-badge rule";
  } else {
    label.textContent = "已连接";
    badge.textContent = "LIVE";
    badge.className = "mode-badge";
  }
}

// Connection flow animation: particle from dispatch area to agent cards
function animateFlowToAgents(roles) {
  const grid = document.getElementById("agentGrid");
  roles.forEach((role, i) => {
    setTimeout(() => {
      const card = grid.querySelector(`.agent-card[data-role="${role}"]`);
      if (!card) return;
      const cardRect = card.getBoundingClientRect();
      const dot = document.createElement("div");
      dot.className = "flow-dot";
      dot.style.left = "50%";
      dot.style.top = (cardRect.top + cardRect.height / 2) + "px";
      document.body.appendChild(dot);
      setTimeout(() => dot.remove(), 800);
    }, 80 + i * 60);
  });
}

// Reset demo to initial state
async function resetDemo() {
  stopPolling();
  sessionContext.lastAsset = null;
  sessionContext.lastIntent = null;
  sessionContext.lastPrice = null;
  sessionContext.recentTurns = [];
  sessionContext.pendingPosition = null;
  sessionContext.pendingAssetConfirmation = null;
  sessionContext.pendingResetConfirmation = null;
  sessionContext.lastResearchSummary = null;
  lastGoodState = null;
  lastGoodPortfolioSummary = null;

  document.getElementById("chatList").innerHTML = `
    <div class="chat-msg chief">
      我是 Chief 决策官。我能帮你研究资产、记录持仓、生成估值计划，并持续监控你的投资组合。
    </div>
    <div class="onboarding-hint" id="onboardingHint">
      <div class="oh-title">你可以这样开始</div>
      <span class="oh-cmd">研究 BTC</span>
      <span class="oh-cmd">查看我的持仓</span>
      <span class="oh-cmd">SOL 值得买吗</span>
    </div>`;
  document.getElementById("suggestionsRow").innerHTML = "";

  // Re-wire onboarding chips
  document.querySelectorAll(".onboarding-hint .oh-cmd").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.getElementById("chatInput").value = chip.textContent;
      document.getElementById("chatSendBtn").click();
    });
  });

  initCommittee();
  document.getElementById("dispatchLog").innerHTML =
    '<h3>Chief 调度日志</h3><div class="dispatch-entry"><span class="dl-dot"></span><span class="muted">等待首轮派发...</span></div>';
  const traceFeed = document.getElementById("traceFeed");
  if (traceFeed) {
    traceFeed.innerHTML = '<div class="trace-feed-entry muted">等待 Agent 调度...</div>';
  }
  setDegraded(false);

  // Re-enable chat input
  document.getElementById("chatInput").disabled = false;
  document.getElementById("chatSendBtn").disabled = false;
  document.getElementById("chatSendBtn").textContent = "发送";

  try {
    await refreshPortfolioViews();
  } catch (err) {
    console.error("reset refreshPortfolioViews failed:", err);
  }

  startPolling(fetchState, fetchPortfolioSummary, 5000);
  updateStatusLabel();
}

// Unified refresh: fetches state + portfolio summary, updates all views.
// Used by sendChat, boot, resetDemo, and portfolio submitTrade callback.
async function refreshPortfolioViews(preferredAsset) {
  try {
    const state = await fetchState();
    const portfolioSummary = await fetchPortfolioSummary();
    setStateCache(state);
    renderPortfolio(state, portfolioSummary);
    renderPortfolioChart(portfolioSummary?.positions || Object.values(state.positions || {}));
    const asset =
      preferredAsset ||
      sessionContext.lastAsset ||
      portfolioSummary?.positions?.[0]?.symbol ||
      (Object.values(state.positions || {})[0]?.assetSymbol);
    if (asset) renderKlineChart(asset);
    else hideKlineChart();
  } catch (err) {
    console.error("refreshPortfolioViews failed:", err);
  }
}

async function sendChat(message) {
  const ABORT_MS = 25000;
  const t0 = performance.now();
  let resp;
  if (USE_MOCK || USE_DEMO) {
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
            pendingPosition: sessionContext.pendingPosition,
            pendingAssetConfirmation: sessionContext.pendingAssetConfirmation,
            pendingResetConfirmation: sessionContext.pendingResetConfirmation,
            lastResearchSummary: sessionContext.lastResearchSummary,
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

  const latencyMs = Math.round(performance.now() - t0);

  // Update session context from response
  updateSessionContext(message, resp);

  // F8: Chief dispatch
  if (resp.fanout && resp.fanout.length) {
    fanoutAgents(resp.fanout, resp.dispatchPlan || []);
    animateFlowToAgents(resp.fanout);

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
  addChatBubble("chief", reply, suggestions, latencyMs);

  synthesizeChief(reply);
  setDegraded(!!resp.degraded);

  // Refresh state & charts via unified function
  setTimeout(() => refreshPortfolioViews(sessionContext.lastAsset), 600);
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

  // Init 3D Brain Wireframe (ambient visual, non-functional)
  if (typeof BrainWireframe !== 'undefined') {
    new BrainWireframe({
      container: '#brain-canvas-container',
      inputSelector: '#chatInput',
    });
  }

  onChatSend(sendChat);

  // Wire up onboarding hint chips
  document.querySelectorAll(".onboarding-hint .oh-cmd").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.getElementById("chatInput").value = chip.textContent;
      document.getElementById("chatSendBtn").click();
    });
  });

  // Initial state via unified refresh
  await refreshPortfolioViews();

  // Wire up portfolio submitTrade callback
  setRefreshCallback(refreshPortfolioViews);

  // F3: Live polling
  startPolling(fetchState, fetchPortfolioSummary, 5000);

  document.getElementById("statusLabel").textContent = USE_DEMO ? "Demo 模式" : (USE_MOCK ? "Mock 模式" : "已连接");
  const badge = document.getElementById("modeBadge");
  if (USE_DEMO) {
    badge.textContent = "DEMO";
    badge.className = "mode-badge";
  } else if (USE_MOCK) {
    badge.textContent = "MOCK";
    badge.className = "mode-badge rule";
  }

  // Reset button
  document.getElementById("resetBtn").addEventListener("click", () => {
    if (confirm("确定要重置 Demo 状态吗？")) resetDemo();
  });

  // Export conversation button
  document.getElementById("exportChatBtn").addEventListener("click", async () => {
    const sid = "demo-001";
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const filename = `decision-brain-${sid}-${ts}.md`;

    try {
      const resp = await fetch(`/api/conversation-log/export?sessionId=${encodeURIComponent(sid)}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const blob = new Blob([text], { type: "text/markdown; charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("导出对话失败:", err.message);
      alert("导出失败: " + err.message);
    }
  });
}

boot();
