import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listTools, callTool } from "../src/service-contract.mjs";
import { store } from "../src/data-store.mjs";

test("service contract exposes lobster-facing tools", async () => {
  const tools = listTools();
  const toolNames = tools.map((tool) => tool.name);

  assert.deepEqual(
    toolNames,
    [
      "capabilities",
      "lookup_portfolio_memory",
      "evaluate_candidate",
      "manage_position",
      "refresh_research",
      "confirm_plan",
      "get_asset_context",
      "review_add_intent",
      "review_sell_intent",
      "run_daily_monitor",
      "log_source",
      "archive_asset"
    ]
  );

  const health = await callTool("health");
  assert.equal(health.ok, true);
});

test("mcp server responds with content-length framed initialize result", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "decision-brain-mcp-"));
  const child = spawn("node", ["src/mcp-server.mjs"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      DECISION_BRAIN_DATA_DIR: dataDir
    }
  });

  const request = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {}
  });
  child.stdin.write(`Content-Length: ${Buffer.byteLength(request, "utf8")}\r\n\r\n${request}`);

  const output = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for MCP response")), 5000);
    const chunks = [];
    child.stdout.on("data", (chunk) => {
      chunks.push(chunk);
      const text = Buffer.concat(chunks).toString("utf8");
      if (/"serverInfo"/.test(text)) {
        clearTimeout(timer);
        resolve(text);
      }
    });
  });

  child.kill();

  assert.match(output, /Content-Length:/);
  assert.match(output, /"serverInfo"/);
});

test("service contract can execute lobster core flow with isolated state", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "decision-brain-contract-"));
  const previousDataDir = process.env.DECISION_BRAIN_DATA_DIR;
  const previousStateFile = process.env.DECISION_BRAIN_STATE_FILE;

  process.env.DECISION_BRAIN_DATA_DIR = dataDir;
  delete process.env.DECISION_BRAIN_STATE_FILE;
  store.resetCache();

  try {
    const lookup = await callTool("lookup_portfolio_memory", {
      assetQuery: "SOL"
    });
    assert.equal(lookup.ok, true);

    const managed = await callTool("manage_position", {
      assetQuery: "SOL",
      units: 100,
      averageCost: 120,
      currentPrice: 175,
      portfolioValue: 50000,
      naturalLanguagePlan: "2x 回本金，3x 卖 30%，保留历史最高持仓 20% 底仓"
    });

    assert.equal(managed.ok, true);

    const confirmed = await callTool("confirm_plan", {
      assetQuery: "SOL"
    });
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.plan.status, "active");

    const context = await callTool("get_asset_context", {
      assetQuery: "SOL"
    });
    assert.equal(context.ok, true);
    assert.equal(context.asset.symbol, "SOL");
    assert.equal(context.plan.status, "active");
  } finally {
    if (previousDataDir === undefined) {
      delete process.env.DECISION_BRAIN_DATA_DIR;
    } else {
      process.env.DECISION_BRAIN_DATA_DIR = previousDataDir;
    }
    if (previousStateFile === undefined) {
      delete process.env.DECISION_BRAIN_STATE_FILE;
    } else {
      process.env.DECISION_BRAIN_STATE_FILE = previousStateFile;
    }
    store.resetCache();
  }
});

test("mcp server can list tools and handle a manage_position call", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "decision-brain-mcp-flow-"));
  const child = spawn("node", ["src/mcp-server.mjs"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      DECISION_BRAIN_DATA_DIR: dataDir
    }
  });

  function send(message) {
    const body = JSON.stringify(message);
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  }

  let stdoutBuffer = Buffer.alloc(0);
  let childStderr = "";
  const responses = [];
  child.stdout.on("data", (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    parseFrames();
  });
  child.stderr.on("data", (chunk) => {
    childStderr += chunk.toString("utf8");
  });

  function parseFrames() {
    while (true) {
      const separatorIndex = stdoutBuffer.indexOf("\r\n\r\n");
      if (separatorIndex === -1) return;

      const headerText = stdoutBuffer.slice(0, separatorIndex).toString("utf8");
      const contentLengthMatch = headerText.match(/content-length:\s*(\d+)/i);
      if (!contentLengthMatch) {
        stdoutBuffer = stdoutBuffer.slice(separatorIndex + 4);
        continue;
      }

      const contentLength = Number(contentLengthMatch[1]);
      const bodyStart = separatorIndex + 4;
      const bodyEnd = bodyStart + contentLength;
      if (stdoutBuffer.length < bodyEnd) return;

      const body = stdoutBuffer.slice(bodyStart, bodyEnd).toString("utf8");
      stdoutBuffer = stdoutBuffer.slice(bodyEnd);
      responses.push(JSON.parse(body));
    }
  }

  async function waitForResponse(id, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        settled = true;
        clearTimeout(timer);
        clearInterval(interval);
        child.off("exit", onExit);
      };
      const check = () => {
        const index = responses.findIndex((response) => response.id === id);
        if (index !== -1) {
          const [response] = responses.splice(index, 1);
          cleanup();
          resolve(response);
          return true;
        }
        return false;
      };
      const onExit = () => {
        if (settled) return;
        cleanup();
        reject(new Error(`Process exited before response id ${id}${childStderr ? `, stderr: ${childStderr.trim()}` : ""}`));
      };
      const timer = setTimeout(() => {
        if (settled) return;
        cleanup();
        reject(new Error(`Timed out waiting for response id ${id}${childStderr ? `, stderr: ${childStderr.trim()}` : ""}`));
      }, timeoutMs);
      const interval = setInterval(() => {
        if (check()) {
          clearInterval(interval);
        }
      }, 20);

      if (check()) {
        return;
      }

      child.on("exit", onExit);
    });
  }

  try {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {}
    });
    const initialized = await waitForResponse(1);
    assert.equal(initialized.result.serverInfo.name, "decision-brain");

    send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    });
    const listed = await waitForResponse(2);
    const toolNames = listed.result.tools.map((tool) => tool.name);
    assert.ok(toolNames.includes("manage_position"));
    assert.ok(toolNames.includes("capabilities"));
    assert.ok(toolNames.includes("lookup_portfolio_memory"));

    send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "manage_position",
        arguments: {
          assetQuery: "SOL",
          units: 100,
          averageCost: 120,
          currentPrice: 175,
          portfolioValue: 50000
        }
      }
    });
    const called = await waitForResponse(3);

    const payload = JSON.parse(called.result.content[0].text);
    assert.equal(payload.ok, true);
    assert.equal(payload.asset.symbol, "SOL");
    assert.equal(payload.plan.status, "draft");
    assert.match(payload.message, /当前计划状态为 draft/);
  } finally {
    child.kill();
  }
});
