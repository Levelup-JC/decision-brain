import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

test("install lobster config merges Decision Brain into an existing MCP config file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "decision-brain-lobster-config-"));
  const target = join(dir, "mcp_config.json");

  await writeFile(
    target,
    JSON.stringify(
      {
        mcpServers: {
          existing: {
            command: "node",
            args: ["/tmp/existing.js"]
          }
        }
      },
      null,
      2
    )
  );

  await new Promise((resolve, reject) => {
    const child = spawn("node", ["src/scripts/install-lobster-config.mjs", target], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `installer exited with ${code}`));
        return;
      }
      resolve();
    });
  });

  const installed = JSON.parse(await readFile(target, "utf8"));
  assert.ok(installed.mcpServers.existing);
  assert.ok(installed.mcpServers["decision-brain"]);
  assert.match(installed.mcpServers["decision-brain"].args[0], /src\/mcp-server\.mjs$/);
  assert.ok(installed.mcpServers["decision-brain"].args[0].includes("Decision Brain"));
  assert.match(installed.mcpServers["decision-brain"].command, /node$/);
});

test("install lobster config also supports VS Code style servers config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "decision-brain-vscode-config-"));
  const target = join(dir, "mcp.json");

  await writeFile(
    target,
    JSON.stringify(
      {
        servers: {
          Homebrew: {
            type: "stdio",
            command: "brew",
            args: ["mcp-server"]
          }
        }
      },
      null,
      2
    )
  );

  await new Promise((resolve, reject) => {
    const child = spawn("node", ["src/scripts/install-lobster-config.mjs", target], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `installer exited with ${code}`));
        return;
      }
      resolve();
    });
  });

  const installed = JSON.parse(await readFile(target, "utf8"));
  assert.ok(installed.servers.Homebrew);
  assert.ok(installed.servers["decision-brain"]);
  assert.equal(installed.servers["decision-brain"].type, "stdio");
});

test("auto install picks a recommended config target and installs Decision Brain", async () => {
  const dir = await mkdtemp(join(tmpdir(), "decision-brain-auto-install-"));
  const fakeHome = join(dir, "home");
  const targetDir = join(fakeHome, ".claude");
  const target = join(targetDir, "mcp.json");
  await mkdir(targetDir, { recursive: true });

  await writeFile(
    target,
    JSON.stringify(
      {
        mcpServers: {
          existing: {
            command: "node",
            args: ["/tmp/existing.js"]
          }
        }
      },
      null,
      2
    )
  );

  const output = await new Promise((resolve, reject) => {
    const child = spawn("node", ["src/scripts/install-lobster-auto.mjs"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        DECISION_BRAIN_HOME_DIR: fakeHome
      }
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
        reject(new Error(stderr || `auto installer exited with ${code}`));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });

  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.label, "claude-global");

  const installed = JSON.parse(await readFile(target, "utf8"));
  assert.ok(installed.mcpServers["decision-brain"]);
});

test("verify lobster install reports installed targets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "decision-brain-verify-install-"));
  const fakeHome = join(dir, "home");
  const targetDir = join(fakeHome, ".claude");
  const target = join(targetDir, "mcp.json");
  await mkdir(targetDir, { recursive: true });

  await writeFile(
    target,
    JSON.stringify(
      {
        mcpServers: {
          "decision-brain": {
            command: "node",
            args: ["/tmp/decision-brain.js"]
          }
        }
      },
      null,
      2
    )
  );

  const output = await new Promise((resolve, reject) => {
    const child = spawn("node", ["src/scripts/verify-lobster-install.mjs"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        DECISION_BRAIN_HOME_DIR: fakeHome
      }
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
        reject(new Error(stderr || `verify installer exited with ${code}`));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });

  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.installedTargets.some((item) => item.label === "claude-global"));
});
