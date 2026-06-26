import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createBitgetAdapter } from "../src/adapters/bitget-adapter.mjs";
import { HttpMcpClient } from "../src/adapters/http-mcp-client.mjs";
import { parseCryptoMarket, parseDexMarket } from "../src/adapters/market-data-parse.mjs";

function encodeMessage(message) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

async function runLiveMarketDataCheck() {
  const client = new HttpMcpClient({
    url: process.env.MARKET_DATA_MCP_URL || "https://datahub.noxiaohao.com/mcp",
    timeoutMs: Number(process.env.MARKET_DATA_MCP_TIMEOUT_MS || 20000),
    retryCount: Number(process.env.MARKET_DATA_MCP_RETRY_COUNT || 2),
  });

  try {
    await client.start();
    const crypto = await client.callTool("crypto_market", {
      action: "search",
      query: "BTW",
    });
    const dex = await client.callTool("dex_market", {
      action: "search",
      query: "BTW",
      chain: "bsc",
    });

    return {
      ok: true,
      cryptoRaw: crypto.text,
      dexRaw: dex.text,
      parsedCrypto: parseCryptoMarket(crypto.text, { query: "BTW" }),
      parsedDex: parseDexMarket(dex.text, { query: "BTW" }),
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  } finally {
    client.close();
  }
}

async function runAdapterCheck() {
  const adapter = createBitgetAdapter();

  try {
    const resolved = await adapter.resolveSymbol("BTW");
    const enriched = await adapter.enrichAsset({
      symbol: "BTW",
      name: resolved.name || "BTW",
      chain: resolved.chain || "bsc",
      contractAddress: resolved.contractAddress || null,
    });

    return {
      resolved,
      enriched,
    };
  } finally {
    adapter.close();
  }
}

async function createClient() {
  const dataDir = await mkdtemp(join(tmpdir(), "decision-brain-btw-mcp-"));
  const child = spawn("node", ["src/mcp-server.mjs"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      DECISION_BRAIN_DATA_DIR: dataDir
    }
  });

  let buffer = Buffer.alloc(0);
  const pending = new Map();

  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
      const separatorIndex = buffer.indexOf("\r\n\r\n");
      if (separatorIndex === -1) {
        break;
      }

      const headerText = buffer.slice(0, separatorIndex).toString("utf8");
      const contentLengthLine = headerText
        .split("\r\n")
        .find((line) => line.toLowerCase().startsWith("content-length:"));
      const contentLength = Number(contentLengthLine?.split(":")[1]?.trim() || 0);
      const bodyStart = separatorIndex + 4;

      if (!Number.isFinite(contentLength) || contentLength <= 0) {
        buffer = buffer.slice(bodyStart);
        continue;
      }

      if (buffer.length < bodyStart + contentLength) {
        break;
      }

      const body = buffer.slice(bodyStart, bodyStart + contentLength).toString("utf8");
      buffer = buffer.slice(bodyStart + contentLength);
      const parsed = JSON.parse(body);

      if (parsed.id !== undefined && pending.has(parsed.id)) {
        pending.get(parsed.id).resolve(parsed);
        pending.delete(parsed.id);
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  function send(message) {
    return new Promise((resolve, reject) => {
      pending.set(message.id, { resolve, reject });
      child.stdin.write(encodeMessage(message));
    });
  }

  async function callTool(id, name, args) {
    const response = await send({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: {
        name,
        arguments: args
      }
    });

    if (response.error) {
      throw new Error(`${name}: ${response.error.message}`);
    }

    return JSON.parse(response.result.content[0].text);
  }

  await send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {}
  });

  return {
    dataDir,
    child,
    callTool,
    close() {
      child.kill();
    }
  };
}

const client = await createClient();

try {
  const liveMarketData = await runLiveMarketDataCheck();
  const adapterCheck = await runAdapterCheck();
  const capabilities = await client.callTool(2, "capabilities", {});
  const managed = await client.callTool(3, "manage_position", {
    assetQuery: "BTW",
    units: 500,
    averageCost: 1,
    currentPrice: 1,
    portfolioValue: 10000
  });
  const contextBeforeConfirm = await client.callTool(4, "get_asset_context", {
    assetQuery: "BTW"
  });
  const confirmed = await client.callTool(5, "confirm_plan", {
    assetQuery: "BTW"
  });
  const contextAfterConfirm = await client.callTool(6, "get_asset_context", {
    assetQuery: "BTW"
  });
  const addReview = await client.callTool(7, "review_add_intent", {
    assetQuery: "BTW",
    portfolioValue: 10000
  });

  process.stdout.write(
    JSON.stringify(
      {
        dataDir: client.dataDir,
        liveMarketData,
        adapterCheck,
        scenario: {
          statement: "BTW 投 500 美金",
          interpretation: {
            assetQuery: "BTW",
            units: 500,
            averageCost: 1,
            currentPrice: 1,
            portfolioValue: 10000,
            currentValueUsd: 500,
            portfolioPct: 0.05
          }
        },
        capabilities: {
          monitoringCadence: capabilities.positioning.monitoringCadence,
          supportedAssets: capabilities.positioning.supportedAssets,
          recommendationRules: capabilities.agentPlaybook.recommendationRules
        },
        managePosition: {
          asset: managed.asset,
          position: managed.position,
          researchSummary: managed.researchReport.summary,
          sourceTypes: managed.researchReport.sources.map((item) => item.sourceType),
          planStatus: managed.plan.status,
          addZone: managed.plan.addZone,
          holdZone: managed.plan.holdZone,
          sellZone: managed.plan.sellZone
        },
        contextBeforeConfirm: {
          asset: contextBeforeConfirm.asset,
          memorySummary: contextBeforeConfirm.memorySummary,
          researchSummary: contextBeforeConfirm.researchReport.summary,
          thesis: contextBeforeConfirm.researchReport.thesis,
          catalysts: contextBeforeConfirm.researchReport.catalysts,
          risks: contextBeforeConfirm.researchReport.risks,
          sourceTypes: contextBeforeConfirm.recentSources.map((item) => item.sourceType),
          valuationModel: contextBeforeConfirm.valuationModel
        },
        confirmPlan: {
          planStatus: confirmed.plan.status,
          monitoringPolicy: confirmed.monitoringPolicy
        },
        contextAfterConfirm: {
          memorySummary: contextAfterConfirm.memorySummary
        },
        reviewAddIntent: addReview
      },
      null,
      2
    )
  );
} finally {
  client.close();
}
