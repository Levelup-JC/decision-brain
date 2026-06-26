import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });

    const stdout = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `${scriptPath} exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });
}

const discoverScriptPath = fileURLToPath(new URL("./discover-mcp-configs.mjs", import.meta.url));
const discoveredRaw = await runNodeScript(discoverScriptPath);
const discovered = JSON.parse(discoveredRaw);

const verified = (discovered.found || []).map((entry) => {
  return {
    label: entry.label,
    path: entry.path,
    recommended: Boolean(entry.recommended),
    shape: entry.shape,
    reason: entry.reason,
    hasDecisionBrain: false
  };
});

// Re-read each config directly so we can verify whether decision-brain was really installed.
for (const item of verified) {
  try {
    const raw = await readFile(item.path, "utf8");
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    item.hasDecisionBrain = Boolean(
      parsed?.mcpServers?.["decision-brain"] || parsed?.servers?.["decision-brain"]
    );
  } catch {
    item.hasDecisionBrain = false;
  }
}

const installedTargets = verified.filter((item) => item.hasDecisionBrain);

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      installedTargets,
      recommendedTarget: verified.find((item) => item.recommended) || null
    },
    null,
    2
  )}\n`
);
