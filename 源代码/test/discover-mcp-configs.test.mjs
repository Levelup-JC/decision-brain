import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

test("discover lobster configs script returns JSON with a found array", async () => {
  const output = await new Promise((resolve, reject) => {
    const child = spawn("node", ["src/scripts/discover-mcp-configs.mjs"], {
      cwd: process.cwd(),
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
        reject(new Error(stderr || `discover script exited with ${code}`));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });

  const parsed = JSON.parse(output);
  assert.equal(Array.isArray(parsed.found), true);
  assert.equal(parsed.recommended === null || typeof parsed.recommended === "object", true);
  if (parsed.recommended) {
    assert.equal(parsed.recommended.recommended, true);
  }
});
