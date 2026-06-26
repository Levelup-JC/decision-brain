import { elapsed } from "./utils.js";

const AGENT_DEFS = [
  { role: "memory", label: "Memory" },
  { role: "macro", label: "Macro" },
  { role: "onchain", label: "On-chain" },
  { role: "sentiment", label: "Sentiment" },
  { role: "technical", label: "Technical" },
  { role: "news", label: "News" },
  { role: "valuation", label: "Valuation" },
  { role: "asset_info", label: "Asset Info" },
];

const ROLE_LABEL = Object.fromEntries(AGENT_DEFS.map((a) => [a.role, a.label]));

export function initCommittee() {
  renderIdleGrid();
  document.getElementById("roundLabel").textContent = "待命";
}

function renderIdleGrid() {
  const grid = document.getElementById("agentGrid");
  grid.innerHTML = AGENT_DEFS
    .map((a) => `
      <div class="agent-card thinking" data-role="${a.role}">
        <div class="agent-head">
          <span class="agent-role">${a.label}</span>
          <span class="agent-status waiting">待命</span>
        </div>
        <div class="agent-headline muted">等待指令...</div>
        <div class="agent-trace" style="display:none"></div>
      </div>
    `).join("");
}

export function fanoutAgents(roles) {
  const grid = document.getElementById("agentGrid");
  const round = document.getElementById("roundLabel");

  // Reset all cards
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
  });

  // Show and activate only dispatched roles
  roles.forEach((role) => {
    let card = grid.querySelector(`[data-role="${role}"]`);
    if (!card) {
      // Dynamically create card for unknown roles
      card = document.createElement("div");
      card.className = "agent-card";
      card.setAttribute("data-role", role);
      card.innerHTML = `
        <div class="agent-head">
          <span class="agent-role">${ROLE_LABEL[role] || role}</span>
          <span class="agent-status waiting">待命</span>
        </div>
        <div class="agent-headline muted">等待指令...</div>
        <div class="agent-trace" style="display:none"></div>
      `;
      grid.appendChild(card);
    }

    card.classList.add("running", "glow-border");
    card.classList.remove("thinking");
    const status = card.querySelector(".agent-status");
    status.className = "agent-status running pulsing";
    status.textContent = "思考中";
  });

  round.textContent = `派出 ${roles.length} 位`;
  addDispatchEntry("dispatch", `Chief 派出 ${roles.length} 位 Agent：${roles.join("、")}`);
}

export function agentArrived(role, headline, tookMs, agentStatus, traceEntries) {
  const grid = document.getElementById("agentGrid");
  let card = grid.querySelector(`.agent-card[data-role="${role}"]`);
  if (!card) {
    // Create card if it doesn't exist (dynamic roles)
    card = document.createElement("div");
    card.className = "agent-card";
    card.setAttribute("data-role", role);
    card.innerHTML = `
      <div class="agent-head">
        <span class="agent-role">${ROLE_LABEL[role] || role}</span>
        <span class="agent-status waiting">待命</span>
      </div>
      <div class="agent-headline muted">等待指令...</div>
      <div class="agent-trace" style="display:none"></div>
    `;
    grid.appendChild(card);
  }

  card.classList.remove("thinking", "running", "glow-border");

  const status = card.querySelector(".agent-status");
  status.classList.remove("pulsing");

  if (agentStatus === "error" || agentStatus === "timeout") {
    card.classList.add("error");
    status.className = "agent-status error";
    status.textContent = agentStatus === "timeout" ? "超时" : "失败";
  } else if (agentStatus === "degraded") {
    card.classList.add("done");
    status.className = "agent-status waiting";
    status.textContent = "降级";
  } else {
    card.classList.add("done");
    status.className = "agent-status ok";
    status.textContent = "完成";
  }

  card.querySelector(".agent-headline").textContent = headline;

  // Timing
  const existingTiming = card.querySelector(".agent-timing");
  if (existingTiming) existingTiming.remove();
  const timing = document.createElement("div");
  timing.className = "agent-timing";
  timing.textContent = elapsed(tookMs);
  card.appendChild(timing);

  // Trace expansion
  if (traceEntries && traceEntries.length > 0) {
    const traceDiv = card.querySelector(".agent-trace");
    if (traceDiv) {
      traceDiv.style.display = "";
      traceDiv.innerHTML = renderTraceEntries(traceEntries);
    }
  }

  addDispatchEntry("arrive", `${role} 返回 · ${elapsed(tookMs)}`);
}

function renderTraceEntries(entries) {
  const items = entries.map((e) => {
    const statusIcon = e.ok ? "&#9989;" : "&#10060;";
    const cachedBadge = e.cached ? ' <span class="trace-cached">cached</span>' : "";
    const errorText = e.error ? `<div class="trace-error">${escHtml(e.error)}</div>` : "";
    const argsStr = JSON.stringify(e.args || {});
    const snippet = e.rawSnippet
      ? `<div class="trace-snippet">${escHtml(e.rawSnippet)}</div>`
      : "";

    return `
      <div class="trace-entry ${e.ok ? "trace-ok" : "trace-fail"}">
        <div class="trace-summary" onclick="this.parentElement.classList.toggle('trace-expanded')">
          <span class="trace-toggle">&#9654;</span>
          ${statusIcon} <strong>${escHtml(e.tool)}</strong>
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
    <div class="trace-header">MCP 工具调用 (${entries.length})</div>
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
}

export function synthesizeChief(reply) {
  addDispatchEntry("synthesize", `Chief 综合委员会意见`);
}

export function addDispatchEntry(type, text) {
  const log = document.getElementById("dispatchLog");
  const entry = document.createElement("div");
  entry.className = "dispatch-entry";
  entry.innerHTML = `<span class="dl-dot ${type}"></span><span>${text}</span>`;
  log.appendChild(entry);
  document.getElementById("committeeBody").scrollTop = document.getElementById("committeeBody").scrollHeight;
}

export function setDegraded(flag) {
  const badge = document.getElementById("modeBadge");
  if (flag) {
    badge.textContent = "规则模式";
    badge.className = "mode-badge rule";
  } else {
    badge.textContent = "LIVE";
    badge.className = "mode-badge";
  }
}
