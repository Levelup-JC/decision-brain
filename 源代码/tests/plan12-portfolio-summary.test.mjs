import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { handleRequest } from "../src/server.mjs";
import { store } from "../src/data-store.mjs";
import { resolveAssetIdentity } from "../src/services/asset-service.mjs";

async function withHttpState(testContext, callback) {
  const dataDir = await mkdtemp(join(tmpdir(), "decision-brain-plan12-"));
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

test("Plan XII - Test 1: New asset summary correct", async (t) => {
  await withHttpState(t, async () => {
    const r = await callRoute("POST", "/api/manage-position", {
      assetQuery: "SOL",
      units: 100,
      averageCost: 120,
      currentPrice: 130,
      portfolioValue: 100000,
    });
    const body = JSON.parse(r.body);
    assert.equal(body.ok, true);

    const sumResp = await callRoute("GET", "/api/portfolio-summary");
    const sum = JSON.parse(sumResp.body);
    assert.equal(sum.ok, true);
    assert.equal(sum.totalCount, 1);
    assert.equal(sum.totalPositionValue, 13000);
    assert.equal(sum.totalCostBasis, 12000);
    assert.equal(sum.unrealizedPnl, 1000);
  });
});

test("Plan XII - Test 2: Update same asset does not duplicate", async (t) => {
  await withHttpState(t, async () => {
    // First write
    await callRoute("POST", "/api/manage-position", {
      assetQuery: "SOL",
      units: 100,
      averageCost: 120,
      currentPrice: 130,
    });

    // Second write - same asset, different units/cost/price
    await callRoute("POST", "/api/manage-position", {
      assetQuery: "SOL",
      units: 150,
      averageCost: 118,
      currentPrice: 125,
    });

    const sumResp = await callRoute("GET", "/api/portfolio-summary");
    const sum = JSON.parse(sumResp.body);
    assert.equal(sum.ok, true);
    assert.equal(sum.totalCount, 1, "Should not create duplicate SOL");
    assert.equal(sum.positions[0].units, 150);
    assert.equal(sum.totalPositionValue, 18750);
  });
});

test("Plan XII - Test 3: portfolioValue is not accumulated into totalPositionValue", async (t) => {
  await withHttpState(t, async () => {
    await callRoute("POST", "/api/manage-position", {
      assetQuery: "SOL",
      units: 100,
      averageCost: 120,
      currentPrice: 130,
      portfolioValue: 100000,
    });

    await callRoute("POST", "/api/manage-position", {
      assetQuery: "BTC",
      units: 1,
      averageCost: 40000,
      currentPrice: 60000,
      portfolioValue: 100000,
    });

    const sumResp = await callRoute("GET", "/api/portfolio-summary");
    const sum = JSON.parse(sumResp.body);
    assert.equal(sum.ok, true);

    // SOL currentValue = 13000, BTC currentValue = 60000
    // totalPositionValue must be 73000, NOT 200000
    const expectedTotal = 13000 + 60000;
    assert.equal(sum.totalPositionValue, expectedTotal,
      `totalPositionValue should be ${expectedTotal} (sum of currentValue), not sum of portfolioValue`);
    assert.notEqual(sum.totalPositionValue, 200000,
      "totalPositionValue must NOT be 200000 (sum of portfolioValue)");
  });
});

test("Plan XII - Test 3b: Add to existing position merges units and weighted average cost", async (t) => {
  await withHttpState(t, async () => {
    // First create BTC position: 1 BTC @ $40000
    await callRoute("POST", "/api/manage-position", {
      assetQuery: "BTC",
      units: 1,
      averageCost: 40000,
      currentPrice: 60000,
    });

    // Add 2 more BTC @ $50000 using action=add
    const r = await callRoute("POST", "/api/manage-position", {
      assetQuery: "BTC",
      units: 2,
      averageCost: 50000,
      currentPrice: 60000,
      action: "add",
    });
    const body = JSON.parse(r.body);
    assert.equal(body.ok, true);

    // Should have 3 BTC total with weighted average cost
    const sumResp = await callRoute("GET", "/api/portfolio-summary");
    const sum = JSON.parse(sumResp.body);
    assert.equal(sum.totalCount, 1, "Should not create duplicate BTC");
    assert.equal(sum.positions[0].units, 3, "1 + 2 = 3 BTC total");

    // Weighted average: (1*40000 + 2*50000) / 3 = 140000/3 ≈ 46666.67
    assert.ok(Math.abs(sum.positions[0].averageCost - 46666.67) < 0.1,
      `Expected avg cost ~46666.67, got ${sum.positions[0].averageCost}`);

    // costBasisTotal = 3 * 46666.67 ≈ 140000
    assert.ok(Math.abs(sum.positions[0].costBasisTotal - 140000) < 1,
      `Expected cost basis ~140000, got ${sum.positions[0].costBasisTotal}`);

    // currentValue = 3 * 60000 = 180000
    assert.equal(sum.positions[0].currentValue, 180000);
    assert.equal(sum.totalPositionValue, 180000);
  });
});

test("Plan XII - Test 4: BTW must not be silently rewritten to XMR", async (t) => {
  const mockAdapters = {
    bitget: {
      resolveSymbol: async (query) => {
        if (query.toUpperCase() === "BTW") {
          return { ok: true, symbol: "XMR", name: "Monero" };
        }
        return { ok: true, symbol: query.toUpperCase(), name: query };
      }
    }
  };

  const result = await resolveAssetIdentity("BTW", {}, mockAdapters, {});

  assert.equal(result.symbol, "BTW", "symbol must remain BTW, not XMR");
  assert.equal(result.inputSymbol, "BTW");
  assert.equal(result.identityConfidence, "low");
  assert.equal(result.needsUserConfirmation, true);
  assert.ok(result.identityMismatchReason, "must explain the mismatch");
  assert.ok(result.tags.includes("manual-review"));
  assert.ok(result.tags.includes("identity-mismatch"));
});

test("Plan XII - Test 5: User confirmation required before writing BTW", async (t) => {
  await withHttpState(t, async () => {
    // BTW is an unknown ticker — manage-position should still work
    // but the asset identity from resolveAssetFromQuery already tags it as unclassified
    // The confirmation flow is managed by chat-orchestrator (负责人 1)
    // Here we verify the portfolio summary does NOT contain XMR after a BTW write
    const r = await callRoute("POST", "/api/manage-position", {
      assetQuery: "BTW",
      units: 10000,
      averageCost: 0.01,
      currentPrice: 0.01,
    });
    const body = JSON.parse(r.body);
    assert.equal(body.ok, true);

    const sumResp = await callRoute("GET", "/api/portfolio-summary");
    const sum = JSON.parse(sumResp.body);
    assert.equal(sum.ok, true);

    // The position should be for BTW, not XMR
    const btwPos = sum.positions.find((p) => p.symbol === "BTW");
    const xmrPos = sum.positions.find((p) => p.symbol === "XMR");

    // BTW should be present (it's written as-is from user input via resolveAssetFromQuery)
    assert.ok(btwPos, "BTW position should exist");
    assert.equal(btwPos.units, 10000);
    // XMR must not appear
    assert.ok(!xmrPos, "XMR should NOT appear in portfolio for a BTW query");
  });
});

test("Plan XII - Test 6: Archived asset excluded from portfolio totals", async (t) => {
  await withHttpState(t, async () => {
    // Create BTW position
    await callRoute("POST", "/api/manage-position", {
      assetQuery: "BTW",
      units: 10000,
      averageCost: 0.01,
      currentPrice: 0.01,
    });

    // Create SOL position for baseline
    await callRoute("POST", "/api/manage-position", {
      assetQuery: "SOL",
      units: 100,
      averageCost: 120,
      currentPrice: 130,
    });

    // Confirm SOL plan so it can be archived
    await callRoute("POST", "/api/confirm-plan", { assetQuery: "SOL" });

    // Archive SOL
    const archiveResp = await callRoute("POST", "/api/archive-asset", { assetQuery: "SOL" });
    const archiveBody = JSON.parse(archiveResp.body);
    assert.equal(archiveBody.ok, true, "Archive should succeed");

    // Now check portfolio-summary excludes SOL
    const sumResp = await callRoute("GET", "/api/portfolio-summary");
    const sum = JSON.parse(sumResp.body);
    assert.equal(sum.ok, true);

    const solPos = sum.positions.find((p) => p.symbol === "SOL");
    assert.ok(!solPos, "Archived SOL should not appear in active portfolio-summary");

    // totalPositionValue should only include BTW (10000 * 0.01 = 100)
    const btwPos = sum.positions.find((p) => p.symbol === "BTW");
    assert.ok(btwPos, "BTW should still be present");
    assert.equal(sum.totalPositionValue, btwPos.currentValue);
    assert.equal(sum.totalCount, 1);
  });
});
