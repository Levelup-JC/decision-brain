import { elapsed } from "./utils.js";

const AGENT_DEFS = [
  { role: "memory", label: "Memory Agent", icon: "brain" },
  { role: "macro", label: "Macro Agent", icon: "globe" },
  { role: "onchain", label: "Market Intel Agent", icon: "link" },
  { role: "sentiment", label: "Sentiment Agent", icon: "pulse" },
  { role: "technical", label: "Technical Agent", icon: "chart" },
  { role: "news", label: "News Agent", icon: "rss" },
  { role: "valuation", label: "Valuation Agent", icon: "calculator" },
  { role: "asset_info", label: "Asset Info Agent", icon: "info" },
];

const ROLE_LABEL = Object.fromEntries(AGENT_DEFS.map((a) => [a.role, a.label]));
const ROLE_ICON = Object.fromEntries(AGENT_DEFS.map((a) => [a.role, a.icon]));

const ICON_EMOJI = {
  brain: "", globe: "", link: "",
  pulse: "", chart: "", rss: "",
  calculator: "", info: "",
};

// ── Bitget MCP Skills mapping ──────────────────────────────────────

const BITGET_SKILL_MAP = {
  macro:      { key: "macro", skill: "macro-analyst", label: "Macro Analyst", mcpTools: ["macro_indicators", "rates_yields"] },
  onchain:    { key: "marketIntel", skill: "market-intel", label: "Market Intel", mcpTools: ["crypto_market", "defi_analytics", "network_status"] },
  sentiment:  { key: "sentiment", skill: "sentiment-analyst", label: "Sentiment", mcpTools: ["sentiment_index", "derivatives_sentiment"] },
  technical:  { key: "technical", skill: "technical-analysis", label: "Technical", mcpTools: ["technical_analysis", "crypto_derivatives"] },
  news:       { key: "news", skill: "news-briefing", label: "News Briefing", mcpTools: ["news_feed", "social_trending"] },
  asset_info: { key: "assetInfo", skill: null, label: "Asset Info", mcpTools: ["crypto_market", "dex_market"] },
};

// Native Decision Brain agents (not from Bitget)
const NATIVE_AGENTS = {
  memory: "Memory Agent",
  valuation: "Valuation Agent",
};

// MCP tool → Bitget skill lookup
const TOOL_SKILL_MAP = {};
for (const [role, s] of Object.entries(BITGET_SKILL_MAP)) {
  for (const tool of s.mcpTools) {
    TOOL_SKILL_MAP[tool] = s;
  }
}

function bitgetSkillForRole(role) {
  return BITGET_SKILL_MAP[role] || null;
}

function bitgetSkillForTool(toolName) {
  return TOOL_SKILL_MAP[toolName] || null;
}

// ── Bitget Skills Bar ──────────────────────────────────────────────

function initBitgetSkillsBar() {
  const pipe = document.getElementById("bitgetSkillsPipe");
  if (!pipe) return;

  let html = "";
  for (const [role, s] of Object.entries(BITGET_SKILL_MAP)) {
    html += `
      <span class="bitget-skill-chip bs-chip-bitget" data-bs-role="${role}" style="position:relative">
        <span class="bs-chip-dot" id="bsDot-${role}"></span>
        ${s.label}
        <span class="bs-tooltip">${s.mcpTools.join(", ")}</span>
      </span>
    `;
  }
  // Add native agents
  for (const [role, label] of Object.entries(NATIVE_AGENTS)) {
    html += `
      <span class="bitget-skill-chip bs-chip-native" data-bs-role="${role}" style="position:relative">
        <span class="bs-chip-dot" id="bsDot-${role}"></span>
        ${label}
        <span class="bs-tooltip">Decision Brain native</span>
      </span>
    `;
  }
  pipe.innerHTML = html;
}

function activateBitgetChips(roles) {
  document.querySelectorAll(".bitget-skill-chip").forEach((chip) => {
    chip.classList.remove("active");
  });
  for (const role of roles) {
    const chip = document.querySelector(`.bitget-skill-chip[data-bs-role="${role}"]`);
    if (chip) chip.classList.add("active");
  }
}

function setBitgetChipStatus(role, online) {
  const dot = document.getElementById(`bsDot-${role}`);
  if (dot) {
    if (online) dot.classList.remove("off");
    else dot.classList.add("off");
  }
}

function renderSkillBadge(role) {
  const bs = bitgetSkillForRole(role);
  if (bs) {
    const toolsStr = bs.mcpTools.join(", ");
    return `<span class="agent-skill-badge bitget" title="Bitget MCP: ${bs.skill || toolsStr}">${bs.skill || "MCP"}</span>`;
  }
  if (NATIVE_AGENTS[role]) {
    return `<span class="agent-skill-badge native" title="Decision Brain native">DB native</span>`;
  }
  return "";
}

// Module-level dispatch plan map for agent cards
let _dispatchPlanMap = {};

function renderAgentProviderMeta(role) {
  const dp = _dispatchPlanMap[role];
  if (!dp) return "";
  const providerClass = dp.provider === "Bitget MCP" ? "bitget" : "native";
  const toolsStr = dp.tools && dp.tools.length > 0 ? ` · 工具：${dp.tools.join(", ")}` : "";
  return `<div class="agent-provider-meta ${providerClass}">${dp.provider}${dp.skill ? ` · ${dp.skill}` : ""}${toolsStr}</div>`;
}

// ── Core Committee Rendering ────────────────────────────────────────

export function initCommittee() {
  initBitgetSkillsBar();
  renderIdleGrid();
  document.getElementById("roundLabel").textContent = "待命";
}

function renderIdleGrid() {
  const grid = document.getElementById("agentGrid");
  grid.innerHTML = AGENT_DEFS
    .map((a) => `
      <div class="agent-card thinking" data-role="${a.role}">
        <div class="agent-head">
          <span class="agent-icon">${ICON_EMOJI[a.icon] || ""}</span>
          <span class="agent-role">${a.label}${renderSkillBadge(a.role)}</span>
          <span class="agent-status waiting">待命</span>
        </div>
        <div class="agent-headline muted">等待指令...</div>
        <div class="agent-trace" style="display:none"></div>
      </div>
    `).join("");
}

export function fanoutAgents(roles, dispatchPlan) {
  // Store dispatchPlan for agentArrived to use
  _dispatchPlanMap = {};
  if (dispatchPlan && dispatchPlan.length) {
    for (const dp of dispatchPlan) {
      _dispatchPlanMap[dp.role] = dp;
    }
  }

  const grid = document.getElementById("agentGrid");
  const round = document.getElementById("roundLabel");

  grid.querySelectorAll(".agent-card").forEach((card) => {
    card.classList.add("thinking");
    card.classList.remove("running", "done", "error", "glow-border");
    const status = card.querySelector(".agent-status");
    status.className = "agent-status waiting";
    status.textContent = "待命";
    card.querySelector(".agent-headline").innerHTML = '<span class="muted">等待指令...</span>';
    const trace = card.querySelector(".agent-trace");
    if (trace) { trace.style.display = "none"; trace.innerHTML = ""; }
    const timing = card.querySelector(".agent-timing");
    if (timing) timing.remove();
    const badge = card.querySelector(".agent-skill-badge");
    if (badge) badge.remove();
    const meta = card.querySelector(".agent-provider-meta");
    if (meta) meta.remove();
  });

  // Activate Bitget chips for dispatched roles
  activateBitgetChips(roles);

  roles.forEach((role, i) => {
    let card = grid.querySelector(`[data-role="${role}"]`);
    if (!card) {
      card = document.createElement("div");
      card.className = "agent-card";
      card.setAttribute("data-role", role);
      const metaHtml = renderAgentProviderMeta(role);
      card.innerHTML = `
        <div class="agent-head">
          <span class="agent-icon">${ICON_EMOJI[ROLE_ICON[role]] || ""}</span>
          <span class="agent-role">${ROLE_LABEL[role] || role}${renderSkillBadge(role)}</span>
          <span class="agent-status waiting">待命</span>
        </div>
        ${metaHtml}
        <div class="agent-headline muted">等待指令...</div>
        <div class="agent-trace" style="display:none"></div>
      `;
      grid.appendChild(card);
    } else {
      // Add skill badge if missing
      const roleSpan = card.querySelector(".agent-role");
      if (roleSpan && !roleSpan.querySelector(".agent-skill-badge")) {
        roleSpan.insertAdjacentHTML("beforeend", renderSkillBadge(role));
      }
      // Add provider meta if missing
      if (!card.querySelector(".agent-provider-meta")) {
        const metaHtml = renderAgentProviderMeta(role);
        if (metaHtml) {
          const headline = card.querySelector(".agent-headline");
          if (headline) {
            headline.insertAdjacentHTML("beforebegin", metaHtml);
          }
        }
      }
    }

    setTimeout(() => {
      card.classList.add("running", "glow-border");
      card.classList.remove("thinking");
      const status = card.querySelector(".agent-status");
      status.className = "agent-status running pulsing";
      status.textContent = "思考中";
      pulseDataFlow(card);
    }, i * 120);
  });

  round.textContent = `派出 ${roles.length} 位`;
  addDispatchEntry("dispatch", `Chief 派出 ${roles.length} 位 Agent：${roles.join("、")}`);
  addDynamicTraceEntry("dispatch", `Chief 派出 ${roles.length} 位 Agent`);
}

function pulseDataFlow(card) {
  const rect = card.getBoundingClientRect();
  const flow = document.createElement("div");
  flow.className = "data-flow-pulse";
  flow.style.cssText = `
    position: fixed;
    top: ${rect.top + rect.height / 2}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: 2px;
    pointer-events: none;
    z-index: 100;
  `;
  document.body.appendChild(flow);
  requestAnimationFrame(() => {
    flow.style.transform = "scaleX(1.5)";
    flow.style.opacity = "0";
  });
  setTimeout(() => flow.remove(), 600);
}

export function agentArrived(role, headline, tookMs, agentStatus, traceEntries) {
  const grid = document.getElementById("agentGrid");
  let card = grid.querySelector(`.agent-card[data-role="${role}"]`);
  if (!card) {
    card = document.createElement("div");
    card.className = "agent-card";
    card.setAttribute("data-role", role);
    const metaHtml = renderAgentProviderMeta(role);
    card.innerHTML = `
      <div class="agent-head">
        <span class="agent-icon">${ICON_EMOJI[ROLE_ICON[role]] || ""}</span>
        <span class="agent-role">${ROLE_LABEL[role] || role}${renderSkillBadge(role)}</span>
        <span class="agent-status waiting">待命</span>
      </div>
      ${metaHtml}
      <div class="agent-headline muted">等待指令...</div>
      <div class="agent-trace" style="display:none"></div>
    `;
    grid.appendChild(card);
  } else {
    // Ensure provider meta is present
    if (!card.querySelector(".agent-provider-meta")) {
      const metaHtml = renderAgentProviderMeta(role);
      if (metaHtml) {
        const headline = card.querySelector(".agent-headline");
        if (headline) {
          headline.insertAdjacentHTML("beforebegin", metaHtml);
        }
      }
    }
  }

  card.classList.remove("thinking", "running", "glow-border");

  const status = card.querySelector(".agent-status");
  status.classList.remove("pulsing");

  if (agentStatus === "error" || agentStatus === "timeout") {
    card.classList.add("error");
    status.className = "agent-status error";
    status.textContent = agentStatus === "timeout" ? "超时" : "失败";
    setBitgetChipStatus(role, false);
  } else if (agentStatus === "degraded") {
    card.classList.add("done");
    status.className = "agent-status waiting";
    status.textContent = "降级";
  } else {
    card.classList.add("done");
    status.className = "agent-status ok";
    status.textContent = "完成";
    setBitgetChipStatus(role, true);
  }

  card.querySelector(".agent-headline").textContent = headline;

  const existingTiming = card.querySelector(".agent-timing");
  if (existingTiming) existingTiming.remove();
  const timing = document.createElement("div");
  timing.className = "agent-timing";
  timing.textContent = elapsed(tookMs);
  card.appendChild(timing);

  if (traceEntries && traceEntries.length > 0) {
    const traceDiv = card.querySelector(".agent-trace");
    if (traceDiv) {
      traceDiv.style.display = "";
      traceDiv.innerHTML = renderTraceEntries(traceEntries, role);
    }
  }

  addDispatchEntry("arrive", `${role} 返回 · ${elapsed(tookMs)}`);
  addDynamicTraceEntry("arrive", `${ROLE_LABEL[role] || role} 返回 · ${elapsed(tookMs)}`);
}

function renderTraceEntries(entries, agentRole) {
  // Determine provider for trace header
  const dp = _dispatchPlanMap[agentRole];
  const providerLabel = dp?.provider || (NATIVE_AGENTS[agentRole] ? "Decision Brain" : (bitgetSkillForRole(agentRole) ? "Bitget MCP" : ""));
  const providerBadge = providerLabel
    ? `<span class="trace-provider-label ${providerLabel === "Bitget MCP" ? "bitget" : "native"}">${providerLabel}</span>`
    : "";

  const items = entries.map((e) => {
    const statusIcon = e.ok ? "&#9989;" : "&#10060;";
    const cachedBadge = e.cached ? ' <span class="trace-cached">cached</span>' : "";
    const errorText = e.error ? `<div class="trace-error">${escHtml(e.error)}</div>` : "";
    const argsStr = JSON.stringify(e.args || {});
    const snippet = e.rawSnippet
      ? `<div class="trace-snippet">${escHtml(e.rawSnippet)}</div>`
      : "";

    // Bitget skill label for this MCP tool
    const skill = bitgetSkillForTool(e.tool);
    const skillLabel = skill
      ? `<span class="trace-skill-label">${skill.skill}</span>`
      : "";

    return `
      <div class="trace-entry ${e.ok ? "trace-ok" : "trace-fail"}">
        <div class="trace-summary" onclick="this.parentElement.classList.toggle('trace-expanded')">
          <span class="trace-toggle">&#9654;</span>
          ${statusIcon} ${skillLabel}<strong>${escHtml(e.tool)}</strong>
          <span class="trace-args">${escHtml(argsStr)}</span>
          <span class="trace-timing">${e.tookMs}ms</span>
          ${cachedBadge}
        </div>
        <div class="trace-detail">
          ${errorText}
          ${snippet}
        </div>
      </div>
    `;
  });

  return `
    <div class="trace-header">MCP Trace (${entries.length})${providerBadge ? ` · ${providerBadge}` : ""}</div>
    ${items.join("")}
  `;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function markAgentTimeout(role) {
  const card = document.querySelector(`.agent-card[data-role="${role}"]`);
  if (!card) return;

  card.classList.remove("thinking", "running", "glow-border");
  card.classList.add("error");
  const status = card.querySelector(".agent-status");
  status.classList.remove("pulsing");
  status.className = "agent-status error";
  status.textContent = "超时";
  card.querySelector(".agent-headline").textContent = "未在时限内返回";
  setBitgetChipStatus(role, false);
  addDispatchEntry("arrive", `${role} 超时`);
  addDynamicTraceEntry("error", `${ROLE_LABEL[role] || role} 超时未返回`);
}

export function synthesizeChief(reply) {
  addDispatchEntry("synthesize", `Chief 综合委员会意见`);
  addDynamicTraceEntry("synthesize", `Chief 综合委员会意见`);
}

export function addDispatchEntry(type, text) {
  const log = document.getElementById("dispatchLog");
  if (!log) return;
  const entry = document.createElement("div");
  entry.className = "dispatch-entry";
  entry.innerHTML = `<span class="dl-dot ${type}"></span><span>${text}</span>`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function addDynamicTraceEntry(type, text) {
  const feed = document.getElementById("traceFeed");
  if (!feed) return;
  const placeholder = feed.querySelector(".trace-feed-entry.muted");
  if (placeholder) placeholder.remove();

  const entry = document.createElement("div");
  entry.className = `trace-feed-entry ${type}`;
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`;
  entry.textContent = `[${ts}] ${text}`;
  feed.appendChild(entry);
  feed.scrollTop = feed.scrollHeight;
}

export function setDegraded(flag) {
  const badge = document.getElementById("modeBadge");
  if (!badge) return;
  if (flag) {
    badge.textContent = "规则模式";
    badge.className = "mode-badge rule";
  } else {
    badge.textContent = "LIVE";
    badge.className = "mode-badge";
  }
}
