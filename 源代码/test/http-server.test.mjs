import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { handleRequest } from "../src/server.mjs";
import { store } from "../src/data-store.mjs";

async function withHttpState(testContext, callback) {
  const dataDir = await mkdtemp(join(tmpdir(), "decision-brain-http-"));
  const previousDataDir = process.env.DECISION_BRAIN_DATA_DIR;
  const previousStateFile = process.env.DECISION_BRAIN_STATE_FILE;

  process.env.DECISION_BRAIN_DATA_DIR = dataDir;
  delete process.env.DECISION_BRAIN_STATE_FILE;
  store.resetCache();
  await store.clear();

  testContext.after(async () => {
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
  });

  return callback();
}

function makeRequest(method, url, body) {
  const chunks = body ? [Buffer.from(JSON.stringify(body))] : [];
  const request = Readable.from(chunks);
  request.method = method;
  request.url = url;
  request.headers = body ? { "content-type": "application/json" } : {};
  return request;
}

function makeResponseCapture() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(chunk = "") {
      this.body += chunk;
    }
  };
}

async function callRoute(method, url, body) {
  const request = makeRequest(method, url, body);
  const response = makeResponseCapture();
  await handleRequest(request, response);
  return response;
}

test("http request handler serves dashboard and lobster workflow endpoints", async (t) => {
  await withHttpState(t, async () => {
    const dashboard = await callRoute("GET", "/");
    assert.equal(dashboard.statusCode, 200);
    assert.match(dashboard.body, /Decision Brain/);

    const health = await callRoute("GET", "/api/health");
    assert.equal(health.statusCode, 200);
    assert.equal(JSON.parse(health.body).ok, true);

    const lookup = await callRoute("POST", "/api/lookup-portfolio-memory", {
      assetQuery: "SOL"
    });
    const lookupJson = JSON.parse(lookup.body);
    assert.equal(lookupJson.ok, true);
    assert.equal(lookupJson.portfolioMemoryProfile.requiresUserConfirmation, true);

    const candidate = await callRoute("POST", "/api/evaluate-candidate", {
      assetQuery: "SOL"
    });
    const candidateJson = JSON.parse(candidate.body);
    assert.equal(candidateJson.ok, true);
    assert.equal(Boolean(candidateJson.portfolioMemoryProfile), true);
    assert.equal(candidateJson.requiresUserConfirmation, true);

    const managed = await callRoute("POST", "/api/manage-position", {
      assetQuery: "SOL",
      units: 100,
      averageCost: 120,
      currentPrice: 175,
      portfolioValue: 50000,
      naturalLanguagePlan: "2x 回本金，3x 卖 30%，保留历史最高持仓 20% 底仓"
    });
    const managedJson = JSON.parse(managed.body);
    assert.equal(managedJson.ok, true);
    assert.equal(managedJson.plan.status, "draft");

    const refreshed = await callRoute("POST", "/api/refresh-research", {
      assetQuery: "SOL"
    });
    const refreshedJson = JSON.parse(refreshed.body);
    assert.equal(refreshedJson.ok, true);
    assert.ok(
      ["market-data-http-mcp", "not_configured"].includes(refreshedJson.bitget.connectionStatus.mode),
      `Expected bitget mode to be market-data-http-mcp or not_configured, got ${refreshedJson.bitget.connectionStatus.mode}`
    );

    const confirmed = await callRoute("POST", "/api/confirm-plan", {
      assetQuery: "SOL"
    });
    const confirmedJson = JSON.parse(confirmed.body);
    assert.equal(confirmedJson.ok, true);
    assert.equal(confirmedJson.plan.status, "active");

    const firstMonitor = await callRoute("POST", "/api/run-daily-monitor", {});
    const firstMonitorJson = JSON.parse(firstMonitor.body);
    assert.equal(firstMonitorJson.ok, true);
    assert.equal(firstMonitorJson.results[0].newsUpdated, true);

    const secondMonitor = await callRoute("POST", "/api/run-daily-monitor", {});
    const secondMonitorJson = JSON.parse(secondMonitor.body);
    assert.equal(secondMonitorJson.ok, true);
    assert.equal(secondMonitorJson.results[0].skippedBecauseDailyLimit, true);

    const context = await callRoute("GET", "/api/asset-context?asset=SOL");
    const contextJson = JSON.parse(context.body);
    assert.equal(contextJson.ok, true);
    assert.equal(contextJson.asset.symbol, "SOL");
    assert.equal(contextJson.plan.status, "active");
    assert.ok(Array.isArray(contextJson.recentEvents));
    assert.equal(contextJson.portfolioMemoryProfile.hasCurrentPosition, true);
  });
});
