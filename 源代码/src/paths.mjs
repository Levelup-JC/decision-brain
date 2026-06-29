import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = dirname(fileURLToPath(import.meta.url));

export const projectRoot = resolve(srcDir, "..");

export function resolveProjectPath(...segments) {
  const primary = join(projectRoot, ...segments);
  if (!process.env.VERCEL) return primary;

  // Vercel: repo layout may differ from build layout. Try alternatives.
  if (existsSync(primary)) return primary;

  const alt = join("/var/task", ...segments);
  if (existsSync(alt)) return alt;

  // Also try without the outermost directory name
  const basename = primary.split("/").filter(Boolean).pop();
  const stripped = join(projectRoot, "..", ...segments);
  if (existsSync(stripped)) return stripped;

  return primary;
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
