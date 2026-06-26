import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

test("demo flow resets state and defaults to BTW when only --reset is passed", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "decision-brain-demo-"));

  const output = await new Promise((resolve, reject) => {
    const child = spawn("node", ["src/scripts/demo-flow.mjs", "--reset"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DECISION_BRAIN_DATA_DIR: dataDir
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8") || `demo flow exited with ${code}`));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });

  const parsed = JSON.parse(output);
  assert.equal(parsed.managed.asset, "BTW");
  assert.equal(parsed.confirmed.planStatus, "active");
  assert.equal(parsed.monitor.ok, true);
});
