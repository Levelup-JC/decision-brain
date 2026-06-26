import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const home = process.env.DECISION_BRAIN_HOME_DIR || homedir();

const candidates = [
  { label: "claude-global", path: join(home, ".claude", "mcp.json") },
  { label: "claude-template", path: join(home, ".claude", "templates", ".mcp.json") },
  { label: "gemini-antigravity", path: join(home, ".gemini", "antigravity", "mcp_config.json") },
  { label: "vscode-homebrew", path: join(home, "homebrew", ".vscode", "mcp.json") },
  { label: "ecc-workspace", path: join(home, "Desktop", "everything claude code", "ECC", ".mcp.json") }
];

function classifyConfigShape(parsed) {
  if (parsed?.mcpServers && typeof parsed.mcpServers === "object") {
    return "mcpServers";
  }
  if (parsed?.servers && typeof parsed.servers === "object") {
    return "servers";
  }
  return "empty_or_unknown";
}

function recommendationScore(candidate) {
  let score = 0;

  if (candidate.label === "claude-global") {
    score += 100;
  } else if (candidate.label === "ecc-workspace") {
    score += 80;
  } else if (candidate.label === "gemini-antigravity") {
    score += 50;
  } else if (candidate.label === "claude-template") {
    score += 40;
  } else if (candidate.label === "vscode-homebrew") {
    score += 20;
  }

  if (candidate.shape === "mcpServers") {
    score += 15;
  } else if (candidate.shape === "servers") {
    score += 10;
  }

  if (candidate.serverCount > 0) {
    score += 5;
  }

  return score;
}

function buildReason(candidate) {
  const reasons = [];

  if (candidate.label === "claude-global") {
    reasons.push("这是全局 Claude MCP 配置，最适合长期给龙虾/Agent 使用");
  } else if (candidate.label === "ecc-workspace") {
    reasons.push("这是工作区级 MCP 配置，适合只在某个项目环境里启用");
  } else if (candidate.label === "gemini-antigravity") {
    reasons.push("这是 Gemini/Antigravity 配置入口，适合明确知道龙虾走这条链路时使用");
  }

  if (candidate.shape === "mcpServers") {
    reasons.push("当前文件已经使用标准 mcpServers 结构");
  } else if (candidate.shape === "servers") {
    reasons.push("当前文件使用 VS Code 风格 servers 结构，安装脚本也能兼容");
  } else {
    reasons.push("当前文件为空或结构未知，适合初始化为新配置");
  }

  return reasons.join("；");
}

async function inspectCandidate(candidate) {
  await access(candidate.path);

  let raw = "";
  let parsed = {};
  let parseError = null;

  try {
    raw = await readFile(candidate.path, "utf8");
    parsed = raw.trim() ? JSON.parse(raw) : {};
  } catch (error) {
    parseError = error instanceof Error ? error.message : "unknown_parse_error";
    parsed = {};
  }

  const shape = classifyConfigShape(parsed);
  const serverCount =
    shape === "mcpServers"
      ? Object.keys(parsed.mcpServers || {}).length
      : shape === "servers"
        ? Object.keys(parsed.servers || {}).length
        : 0;

  return {
    ...candidate,
    shape,
    serverCount,
    parseError,
    score: 0,
    recommended: false,
    reason: ""
  };
}

const found = [];

for (const candidate of candidates) {
  try {
    found.push(await inspectCandidate(candidate));
  } catch {
    continue;
  }
}

for (const candidate of found) {
  candidate.score = recommendationScore(candidate);
  candidate.reason = buildReason(candidate);
}

found.sort((a, b) => b.score - a.score);

if (found[0]) {
  found[0].recommended = true;
}

process.stdout.write(`${JSON.stringify({ found, recommended: found[0] || null }, null, 2)}\n`);
