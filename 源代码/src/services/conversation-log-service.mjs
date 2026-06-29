import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveProjectPath } from "../paths.mjs";

const LOG_FILE = resolveProjectPath("data", "conversation-logs.json");

let sessions = {};

let turnCounter = 0;

function nextTurnId() {
  turnCounter += 1;
  return `turn_${String(turnCounter).padStart(4, "0")}_${Date.now()}`;
}

async function persist() {
  try {
    await mkdir(dirname(LOG_FILE), { recursive: true });
    await writeFile(LOG_FILE, JSON.stringify(sessions, null, 2), "utf8");
  } catch (err) {
    console.error("conversation-log-service: persist failed", err.message);
  }
}

async function restore() {
  try {
    const raw = await readFile(LOG_FILE, "utf8");
    sessions = JSON.parse(raw);
    const maxN = Object.values(sessions).flatMap((s) => s.turns || []).reduce((max, t) => {
      const m = String(t.turnId || "").match(/^turn_(\d+)_/);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    turnCounter = maxN;
  } catch {
    sessions = {};
  }
}

// Initialize on import
restore();

export function logTurn(sessionId, turnData) {
  if (!sessionId) return null;
  if (!sessions[sessionId]) {
    sessions[sessionId] = { sessionId, turns: [] };
  }
  const entry = {
    turnId: nextTurnId(),
    createdAt: new Date().toISOString(),
    ...turnData,
  };
  sessions[sessionId].turns.push(entry);
  persist();
  return entry;
}

export function getSessionLog(sessionId) {
  return sessions[sessionId] || { sessionId, turns: [] };
}

export function exportMarkdown(sessionId) {
  const session = sessions[sessionId];
  if (!session || !session.turns.length) {
    return `# Decision Brain 对话日志\n\n**Session:** ${sessionId}\n\n> 暂无对话记录。\n`;
  }

  const lines = [
    `# Decision Brain 对话日志`,
    ``,
    `**Session:** ${sessionId}`,
    `**导出时间:** ${new Date().toISOString()}`,
    `**总轮次:** ${session.turns.length}`,
    ``,
    `---`,
    ``,
  ];

  for (const turn of session.turns) {
    lines.push(`## Turn ${turn.turnId}`);
    lines.push(`- **时间:** ${turn.createdAt}`);
    lines.push(`- **Intent:** ${turn.intent || "unknown"}`);
    lines.push(`- **Asset:** ${turn.assetQuery || "N/A"}`);
    lines.push(`- **Slots:** \`${JSON.stringify(turn.slots || {})}\``);
    lines.push(`- **Latency:** ${turn.latencyMs || "N/A"}ms`);
    lines.push(`- **Degraded:** ${turn.degraded ? "yes" : "no"}`);
    if (turn.error) lines.push(`- **Error:** ${turn.error}`);
    lines.push(``);
    lines.push(`### 用户消息`);
    lines.push(``);
    lines.push(turn.userMessage || "(empty)");
    lines.push(``);
    lines.push(`### Chief 回复`);
    lines.push(``);
    lines.push(turn.assistantReply || "(empty)");
    lines.push(``);

    if (turn.fanout && turn.fanout.length > 0) {
      lines.push(`### Agent 调度`);
      lines.push(``);
      lines.push(`Fanout: ${turn.fanout.map((f) => typeof f === "string" ? f : (f.role || f.label || "?")).join(", ")}`);
      lines.push(``);
      if (turn.dispatchPlan && turn.dispatchPlan.length > 0) {
        for (const dp of turn.dispatchPlan) {
          lines.push(`- **${dp.role}**: ${dp.provider || "unknown"} ${dp.skill ? `(${dp.skill})` : ""}`);
        }
        lines.push(``);
      }
    }

    if (turn.agentResults && turn.agentResults.length > 0) {
      lines.push(`### Agent 结果`);
      lines.push(``);
      for (const ar of turn.agentResults) {
        const statusIcon = ar.status === "ok" ? "+" : ar.status === "error" ? "x" : "~";
        lines.push(`- [${statusIcon}] **${ar.role}**: ${ar.headline || "no headline"} (${ar.tookMs || "?"}ms)`);
      }
      lines.push(``);
    }

    if (turn.trace && turn.trace.length > 0) {
      lines.push(`### MCP Trace`);
      lines.push(``);
      for (const t of turn.trace) {
        const ok = t.ok ? "+" : "x";
        lines.push(`- [${ok}] ${t.tool || "unknown"} ${t.args ? JSON.stringify(t.args) : ""} (${t.tookMs || "?"}ms)`);
        if (t.error) lines.push(`  - Error: ${t.error}`);
        if (t.rawSnippet) lines.push(`  - ${t.rawSnippet.slice(0, 200)}`);
      }
      lines.push(``);
    }

    if (turn.pendingPosition) {
      lines.push(`### 待确认仓位`);
      lines.push(``);
      lines.push(`- Asset: ${turn.pendingPosition.assetQuery || "N/A"}`);
      lines.push(`- Units: ${turn.pendingPosition.units || "N/A"}`);
      lines.push(`- Cost: ${turn.pendingPosition.averageCost || "N/A"}`);
      lines.push(`- Reason: ${turn.pendingPosition.reason || "N/A"}`);
      lines.push(`- Confirmed: ${turn.pendingPosition.confirmed ? "yes" : "no"}`);
      lines.push(``);
    }

    if (turn.pendingAssetConfirmation) {
      const pac = turn.pendingAssetConfirmation;
      lines.push(`### 资产身份确认`);
      lines.push(``);
      lines.push(`- Original: ${pac.originalInput || "N/A"}`);
      lines.push(`- Resolved: ${pac.resolvedSymbol || "N/A"}`);
      lines.push(`- Confirmed: ${pac.confirmed ? "yes" : "no"}`);
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(``);
  }

  return lines.join("\n");
}

export function listSessions() {
  return Object.keys(sessions).map((sid) => ({
    sessionId: sid,
    turnCount: sessions[sid]?.turns?.length || 0,
    lastTurnAt: sessions[sid]?.turns?.slice(-1)[0]?.createdAt || null,
  }));
}
