import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = dirname(fileURLToPath(import.meta.url));

export const projectRoot = resolve(srcDir, "..");

export function resolveProjectPath(...segments) {
  return join(projectRoot, ...segments);
}

export function resolveStateFilePath() {
  if (process.env.DECISION_BRAIN_STATE_FILE) {
    return process.env.DECISION_BRAIN_STATE_FILE;
  }
  if (process.env.DECISION_BRAIN_DATA_DIR) {
    return join(process.env.DECISION_BRAIN_DATA_DIR, "state.json");
  }
  if (process.env.VERCEL) {
    return "/tmp/decision-brain-state.json";
  }
  return resolveProjectPath("data", "state.json");
}
