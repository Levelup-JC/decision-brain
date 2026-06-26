import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function runNodeScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"]
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
const installScriptPath = fileURLToPath(new URL("./install-lobster-config.mjs", import.meta.url));

const discoveredRaw = await runNodeScript(discoverScriptPath);
const discovered = JSON.parse(discoveredRaw);
const recommended = discovered.recommended;

if (!recommended?.path) {
  process.stderr.write("No MCP config candidate found for automatic install.\n");
  process.exit(1);
}

await runNodeScript(installScriptPath, [recommended.path]);

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      installedTo: recommended.path,
      label: recommended.label,
      reason: recommended.reason
    },
    null,
    2
  )}\n`
);
