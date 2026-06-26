import { join } from "node:path";
import { homedir } from "node:os";

import { resolveProjectPath } from "../paths.mjs";

export function buildDecisionBrainServerConfig() {
  const home = process.env.DECISION_BRAIN_HOME_DIR || homedir();
  return {
    command: process.execPath || "node",
    args: [resolveProjectPath("src", "mcp-server.mjs")],
    env: {
      DECISION_BRAIN_DATA_DIR: join(home, ".decision-brain-lobster")
    }
  };
}

export function mergeDecisionBrainIntoConfig(existing = {}) {
  const entry = buildDecisionBrainServerConfig();

  if (existing.mcpServers) {
    return {
      ...existing,
      mcpServers: {
        ...existing.mcpServers,
        "decision-brain": entry
      }
    };
  }

  if (existing.servers) {
    return {
      ...existing,
      servers: {
        ...existing.servers,
        "decision-brain": {
          type: "stdio",
          ...entry
        }
      }
    };
  }

  return {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers || {}),
      "decision-brain": entry
    }
  };
}
