import { HttpMcpClient } from "./http-mcp-client.mjs";
import { McpClient } from "./mcp-client.mjs";
import { parseCryptoMarket, parseDexMarket } from "./market-data-parse.mjs";
import { getCurrentCollector } from "../trace-collector.mjs";

// ── 5 Bitget Skills → market-data MCP tool mapping ──────────────────────

export const BITGET_SKILLS = [
  {
    key: "macro",
    skill: "macro-analyst",
    roleInDecision: "macro_context",
    title: "Macro environment",
    // market-data MCP tools used for this skill
    mcpTools: ["macro_indicators", "rates_yields", "cross_asset"],
    // Default action per tool
    defaultCalls: [
      { tool: "macro_indicators", args: { action: "multi_indicator" } },
      { tool: "rates_yields", args: { action: "rates_snapshot" } },
    ],
  },
  {
    key: "marketIntel",
    skill: "market-intel",
    roleInDecision: "market_intel",
    title: "Market intelligence",
    mcpTools: ["defi_analytics", "network_status", "crypto_market"],
    defaultCalls: [
      { tool: "crypto_market", args: { action: "trending" } },
      { tool: "defi_analytics", args: { action: "tvl_rank", limit: 5 } },
      { tool: "network_status", args: { action: "eth_gas" } },
    ],
  },
  {
    key: "news",
    skill: "news-briefing",
    roleInDecision: "news_briefing",
    title: "News briefing",
    mcpTools: ["news_feed", "social_trending", "tradfi_news"],
    defaultCalls: [
      { tool: "news_feed", args: { action: "latest", feeds: "all", limit: 5 } },
    ],
  },
  {
    key: "sentiment",
    skill: "sentiment-analyst",
    roleInDecision: "sentiment_context",
    title: "Sentiment analysis",
    mcpTools: ["sentiment_index", "derivatives_sentiment"],
    defaultCalls: [
      { tool: "sentiment_index", args: { action: "current" } },
      { tool: "derivatives_sentiment", args: { action: "long_short", symbol: "BTCUSDT" } },
    ],
  },
  {
    key: "technical",
    skill: "technical-analysis",
    roleInDecision: "technical_context",
    title: "Technical analysis",
    mcpTools: ["technical_analysis", "crypto_derivatives", "global_assets"],
    defaultCalls: [
      { tool: "global_assets", args: { action: "price", symbol: "BTC-USD" } },
      { tool: "crypto_derivatives", args: { action: "ticker_24h", symbol: "BTC/USDT" } },
    ],
  },
];

// ── Connection status tracking ──────────────────────────────────────────

let marketDataClient = null;
let marketDataAvailable = false;
let marketDataTools = [];
let connectionChecked = false;

const MARKET_DATA_DEFAULT_URL = "https://datahub.noxiaohao.com/mcp";
const MARKET_DATA_DEFAULT_TIMEOUT_MS = 20000;
const MARKET_DATA_DEFAULT_RETRY_COUNT = 2;
const MAJOR_CRYPTO_SYMBOLS = new Set(["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "TRX", "SUI"]);
const CHAIN_ALIASES = new Map([
  ["arb", "arbitrum"],
  ["arbitrum", "arbitrum"],
  ["base", "base"],
  ["bsc", "bsc"],
  ["bnb", "bsc"],
  ["bnb chain", "bsc"],
  ["bnbchain", "bsc"],
  ["bitcoin", "bitcoin"],
  ["btc", "bitcoin"],
  ["eth", "ethereum"],
  ["ethereum", "ethereum"],
  ["mainnet", "ethereum"],
  ["matic", "polygon"],
  ["op", "optimism"],
  ["optimism", "optimism"],
  ["polygon", "polygon"],
  ["sol", "solana"],
  ["solana", "solana"],
]);

function getMarketDataUrl() {
  return process.env.MARKET_DATA_MCP_URL || MARKET_DATA_DEFAULT_URL;
}

function getMarketDataTimeoutMs() {
  const parsed = Number(process.env.MARKET_DATA_MCP_TIMEOUT_MS || MARKET_DATA_DEFAULT_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : MARKET_DATA_DEFAULT_TIMEOUT_MS;
}

function getMarketDataRetryCount() {
  const parsed = Number(process.env.MARKET_DATA_MCP_RETRY_COUNT || MARKET_DATA_DEFAULT_RETRY_COUNT);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : MARKET_DATA_DEFAULT_RETRY_COUNT;
}

// ── Public API ───────────────────────────────────────────────────────────

export function createBitgetAdapter() {
  return {
    name: "bitget-market-data-adapter",

    // ── Connection management ──────────────────────────────────────────

    async ensureConnected() {
      if (connectionChecked && marketDataAvailable) {
        return { connected: true, tools: marketDataTools };
      }

      const url = getMarketDataUrl();
      connectionChecked = true;

      try {
        marketDataClient = new HttpMcpClient({
          url,
          timeoutMs: getMarketDataTimeoutMs(),
          retryCount: getMarketDataRetryCount(),
        });
        await marketDataClient.start();
        marketDataTools = await marketDataClient.listTools();
        marketDataAvailable = marketDataTools.length > 0;
        return { connected: true, tools: marketDataTools };
      } catch (err) {
        marketDataAvailable = false;
        marketDataClient = null;
        return { connected: false, error: err.message };
      }
    },

    getConnectionStatus() {
      if (marketDataAvailable) {
        return {
          connected: true,
          mode: "market-data-http-mcp",
          url: getMarketDataUrl(),
          timeoutMs: getMarketDataTimeoutMs(),
          retryCount: getMarketDataRetryCount(),
          toolCount: marketDataTools.length,
          skills: BITGET_SKILLS.map((s) => s.skill),
        };
      }

      // Check for Bitget trading MCP (stdio, needs credentials)
      const bitgetCmd = parseBitgetCommand();
      if (bitgetCmd) {
        return {
          connected: false,
          mode: "bitget-trading-mcp-configured-but-not-connected",
          command: [bitgetCmd.command, ...bitgetCmd.args].join(" "),
          note: "Trading MCP requires API credentials (BITGET_API_KEY, etc.)",
          skills: BITGET_SKILLS.map((s) => s.skill),
        };
      }

      return {
        connected: false,
        mode: "not_configured",
        missingUrl: "MARKET_DATA_MCP_URL env or default datahub URL",
        installHint:
          "Market-data MCP is public (no API key). Install bitget-skill-hub: npm install -g bitget-skill-hub",
        skills: BITGET_SKILLS.map((s) => s.skill),
      };
    },

    // ── Research refresh (called by agent or refresh_research tool) ─────

    async refreshResearch(asset, traceCollector) {
      const { connected, error } = await this.ensureConnected();

      if (!connected) {
        return {
          ok: false,
          sourceType: "market_data_not_connected",
          connectionStatus: this.getConnectionStatus(),
          error,
          sources: BITGET_SKILLS.map((skill) => ({
            sourceType: "not_connected",
            skill: skill.skill,
            roleInDecision: skill.roleInDecision,
            title: skill.title,
            keyClaim: `Market data MCP not connected: ${error || "unknown error"}`,
          })),
        };
      }

      // Build tool name set for quick lookup
      const toolNames = new Set(marketDataTools.map((t) => t.name));

      // Run default calls for each skill in parallel (limit concurrency)
      const sources = [];
      const CONCURRENCY = 3;

      for (let i = 0; i < BITGET_SKILLS.length; i += CONCURRENCY) {
        const batch = BITGET_SKILLS.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((skill) => this._runSkillQueries(skill, toolNames, asset, traceCollector))
        );
        for (const result of results) {
          if (result.status === "fulfilled") {
            sources.push(result.value);
          } else {
            sources.push({
              sourceType: "skill_error",
              error: result.reason?.message || String(result.reason),
            });
          }
        }
      }

      const ok = sources.some((s) => s.sourceType === "market_data_mcp");

      return {
        ok,
        sourceType: ok ? "market_data_mcp" : "market_data_partial",
        connectionStatus: this.getConnectionStatus(),
        availableTools: marketDataTools.map((t) => t.name),
        sources,
      };
    },

    async resolveSymbol(symbol, traceCollector) {
      const { connected, error } = await this.ensureConnected();

      if (!connected) {
        return {
          ok: false,
          error: error || "market_data_not_connected",
          connectionStatus: this.getConnectionStatus(),
          sourceType: "market_data_not_connected",
          sources: [],
        };
      }

      try {
        const lookup = await lookupAssetMarketData(marketDataClient, symbol, traceCollector);
        const identity = buildResolvedIdentity(lookup);

        return {
          ok: Boolean(identity.name || identity.contractAddress || identity.price !== null),
          ...identity,
          sourceType: "market_data_mcp",
          sources: buildLookupSources(lookup),
        };
      } catch (lookupError) {
        return {
          ok: false,
          error: lookupError.message,
          connectionStatus: this.getConnectionStatus(),
          sourceType: "market_data_error",
          sources: [],
        };
      }
    },

    async enrichAsset(asset, traceCollector) {
      const { connected, error } = await this.ensureConnected();

      if (!connected) {
        return {
          ok: false,
          error: error || "market_data_not_connected",
          connectionStatus: this.getConnectionStatus(),
          sourceType: "market_data_not_connected",
          currentMetrics: {
            marketCap: null,
            fdv: null,
            price: null,
          },
          liquidityNote: "Market data MCP not connected.",
          listedExchanges: [],
          sources: [],
        };
      }

      try {
        const lookup = await lookupAssetMarketData(marketDataClient, asset, traceCollector);
        const identity = buildResolvedIdentity(lookup);
        const dexCandidate = lookup.dexCandidate || null;
        const dexParsed = lookup.dexParsed || {};
        const currentMetrics = {
          marketCap: firstFinite([
            identity.marketCap,
            readNumber(dexCandidate?.marketCap),
            readNumber(dexCandidate?.fdv),
          ]),
          fdv: firstFinite([
            identity.fdv,
            readNumber(dexCandidate?.fdv),
            readNumber(dexCandidate?.fullyDilutedValuation),
          ]),
          price: firstFinite([
            identity.price,
            dexParsed.price,
          ]),
        };
        const listedExchanges = uniqueStrings(identity.listedExchanges || []);

        return {
          ok: true,
          sourceType: "market_data_mcp",
          identity,
          currentMetrics,
          liquidityNote: buildLiquidityNote(dexCandidate, dexParsed, identity),
          listedExchanges,
          sources: buildLookupSources(lookup),
        };
      } catch (lookupError) {
        return {
          ok: false,
          error: lookupError.message,
          connectionStatus: this.getConnectionStatus(),
          sourceType: "market_data_error",
          currentMetrics: {
            marketCap: null,
            fdv: null,
            price: null,
          },
          liquidityNote: `Market data lookup failed: ${lookupError.message}`,
          listedExchanges: [],
          sources: [],
        };
      }
    },

    async _runSkillQueries(skill, availableToolNames, asset, traceCollector) {
      const tc = traceCollector || getCurrentCollector();
      const results = [];

      for (const call of skill.defaultCalls) {
        if (!availableToolNames.has(call.tool)) {
          results.push({
            tool: call.tool,
            available: false,
            keyClaim: `${call.tool} not available in market-data MCP`,
          });
          continue;
        }

        try {
          // Inject asset context into args where relevant
          const args = { ...call.args };
          if (asset?.symbol && call.tool === "crypto_derivatives") {
            args.symbol = `${asset.symbol}/USDT`;
          }
          if (asset?.symbol && call.tool === "global_assets") {
            args.symbol = asset.symbol.includes("-") ? asset.symbol : `${asset.symbol}-USD`;
          }
          if (asset?.symbol && call.tool === "technical_analysis") {
            args.symbol = asset.symbol.includes("/")
              ? asset.symbol
              : `${asset.symbol}/USDT`;
          }

          const result = await retryMcpCall(marketDataClient, call.tool, args, tc, 2);
          results.push({
            tool: call.tool,
            available: true,
            sourceType: "market_data_mcp",
            keyClaim: result.text?.slice(0, 500) || JSON.stringify(result.raw).slice(0, 500),
            fullResult: result.text,
          });
        } catch (err) {
          results.push({
            tool: call.tool,
            available: true,
            sourceType: "market_data_error",
            keyClaim: `Error calling ${call.tool}: ${err.message}`,
          });
        }
      }

      return {
        sourceType: results.some((r) => r.sourceType === "market_data_mcp")
          ? "market_data_mcp"
          : "market_data_unavailable",
        skill: skill.skill,
        roleInDecision: skill.roleInDecision,
        title: skill.title,
        mcpTools: skill.mcpTools,
        results,
      };
    },

    getSkillNotes() {
      if (marketDataAvailable) {
        return {
          macro: `market-data MCP connected (${marketDataTools.length} tools). macro_indicators + rates_yields available.`,
          marketIntel: "market-data MCP connected. defi_analytics + network_status + crypto_market available.",
          news: "market-data MCP connected. news_feed (44 sources) + social_trending available.",
          sentiment: "market-data MCP connected. sentiment_index + derivatives_sentiment available.",
          technical: "market-data MCP connected. technical_analysis (23 indicators) + crypto_derivatives available.",
        };
      }

      return {
        macro: "Market data not yet connected. Run bitget-skill-hub install.",
        marketIntel: "Market data not yet connected.",
        news: "Market data not yet connected.",
        sentiment: "Market data not yet connected.",
        technical: "Market data not yet connected.",
      };
    },

    async scanDailySignals(asset, traceCollector) {
      const { connected } = await this.ensureConnected();
      if (!connected) {
        return {
          summary: `${asset?.symbol || "unknown"} daily scan skipped: market-data MCP not connected.`,
          highlights: [],
        };
      }

      // Run a lightweight daily scan using sentiment + macro tools
      try {
        let sentimentResult, macroResult;
        if (traceCollector) {
          [sentimentResult] = await traceCollector.call("sentiment_index", { action: "current" }, () =>
            marketDataClient.callTool("sentiment_index", { action: "current" })
          );
          [macroResult] = await traceCollector.call("macro_indicators", { action: "multi_indicator" }, () =>
            marketDataClient.callTool("macro_indicators", { action: "multi_indicator" })
          );
        } else {
          sentimentResult = await marketDataClient.callTool("sentiment_index", { action: "current" });
          macroResult = await marketDataClient.callTool("macro_indicators", { action: "multi_indicator" });
        }

        return {
          summary: `Daily scan for ${asset?.symbol || "unknown"}: market-data MCP active.`,
          highlights: [
            sentimentResult.text?.slice(0, 200) || "sentiment data available",
            macroResult.text?.slice(0, 200) || "macro data available",
          ],
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        return {
          summary: `Daily scan failed: ${err.message}`,
          highlights: [],
        };
      }
    },

    // Clean up
    close() {
      if (marketDataClient) {
        marketDataClient.close();
        marketDataClient = null;
        marketDataAvailable = false;
        connectionChecked = false;
      }
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function parseBitgetCommand() {
  const raw = String(process.env.BITGET_MCP_COMMAND || "").trim();
  if (!raw) return null;
  const parts = raw.split(/\s+/);
  return { command: parts[0], args: parts.slice(1) };
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeChainName(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (!normalized) {
    return null;
  }

  return CHAIN_ALIASES.get(normalized) || normalized.replace(/\s+/g, "_");
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (values || [])
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().replace(/[$,%]/g, "").replace(/,/g, "");
  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

// B组: Application-level retry with exponential backoff for MCP tool calls.
// HTTP-level retry exists in HttpMcpClient, but MCP servers can return
// successful HTTP responses with empty/invalid content under load. This
// catches those cases at the application layer.
async function retryMcpCall(client, tool, args, tc, maxRetries = 2) {
  let lastError = null;
  let totalAttempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let result;
      if (tc) {
        [result] = await tc.call(tool, args, () =>
          client.callTool(tool, args)
        );
      } else {
        result = await client.callTool(tool, args);
      }

      // Check if the result is valid (not empty/inconclusive)
      const text = result?.text || "";
      const isEmpty = !text || text.length < 10;
      const isError = /\b(unknown|error|failed|unavailable)\b/i.test(text) && text.length < 100;

      if (!isEmpty && !isError) {
        return result;
      }

      // Result looks invalid — retry
      lastError = new Error(`MCP returned inconclusive result: ${text.slice(0, 80)}`);
      totalAttempts = attempt + 1;
    } catch (err) {
      lastError = err;
      totalAttempts = attempt + 1;
    }

    if (attempt < maxRetries) {
      const delay = 300 * Math.pow(2, attempt); // 300ms, 600ms
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  lastError.retryCount = totalAttempts;
  lastError.retriesExhausted = true;
  throw lastError;
}

function firstFinite(values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function safeJsonParse(value) {
  if (typeof value !== "string") {
    return isObject(value) || Array.isArray(value) ? value : null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeLookupInput(input) {
  if (typeof input === "string") {
    const query = input.trim();
    return {
      query,
      preferredSymbol: query.toUpperCase(),
      preferredName: null,
      preferredChain: null,
      contractAddress: /^0x[a-fA-F0-9]{40}$/.test(query) ? query : null,
    };
  }

  const query = readString(input?.symbol) || readString(input?.name) || readString(input?.contractAddress) || "";
  return {
    query,
    preferredSymbol: readString(input?.symbol)?.toUpperCase() || query.toUpperCase() || null,
    preferredName: readString(input?.name),
    preferredChain: normalizeChainName(input?.chain),
    contractAddress: readString(input?.contractAddress),
  };
}

function extractCryptoCandidates(payload) {
  if (Array.isArray(payload?.coins)) {
    return payload.coins.filter(isObject);
  }

  if (Array.isArray(payload?.data?.coins)) {
    return payload.data.coins.filter(isObject);
  }

  return [];
}

function extractDexCandidates(payload) {
  if (Array.isArray(payload)) {
    return payload.filter(isObject);
  }

  if (Array.isArray(payload?.pairs)) {
    return payload.pairs.filter(isObject);
  }

  if (Array.isArray(payload?.data?.pairs)) {
    return payload.data.pairs.filter(isObject);
  }

  return [];
}

function scoreCryptoCandidate(candidate, context) {
  const symbol = readString(candidate?.symbol)?.toUpperCase() || null;
  const name = readString(candidate?.name)?.toLowerCase() || "";
  const rank = readNumber(candidate?.market_cap_rank ?? candidate?.rank);
  let score = 0;

  if (context.preferredSymbol && symbol === context.preferredSymbol) {
    score += 100;
  }
  if (context.query && symbol === context.query.toUpperCase()) {
    score += 90;
  }
  if (context.preferredName && name === context.preferredName.toLowerCase()) {
    score += 80;
  }
  if (context.query && name === context.query.toLowerCase()) {
    score += 60;
  }
  if (context.query && name.includes(context.query.toLowerCase())) {
    score += 25;
  }
  if (rank !== null) {
    score += Math.max(0, 60 - Math.min(rank, 60));
    score += rank <= 500 ? 10 : 0;
  }
  if (readNumber(candidate?.current_price) !== null) {
    score += 5;
  }
  if (readNumber(candidate?.market_cap) !== null) {
    score += 5;
  }

  return score;
}

function pickBestCryptoCandidate(candidates, context) {
  return [...candidates]
    .sort((left, right) => {
      const scoreDelta = scoreCryptoCandidate(right, context) - scoreCryptoCandidate(left, context);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      const leftRank = readNumber(left?.market_cap_rank ?? left?.rank);
      const rightRank = readNumber(right?.market_cap_rank ?? right?.rank);
      if (leftRank !== null && rightRank !== null && leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const leftMarketCap = readNumber(left?.market_cap) || 0;
      const rightMarketCap = readNumber(right?.market_cap) || 0;
      return rightMarketCap - leftMarketCap;
    })[0] || null;
}

function scoreDexCandidate(candidate, context) {
  const baseToken = isObject(candidate?.baseToken) ? candidate.baseToken : candidate;
  const symbol = readString(baseToken?.symbol || candidate?.symbol)?.toUpperCase() || null;
  const name = readString(baseToken?.name || candidate?.name)?.toLowerCase() || "";
  const address = readString(baseToken?.address || candidate?.address || candidate?.tokenAddress);
  const chain = normalizeChainName(candidate?.chainId || candidate?.chain || candidate?.network);
  const liquidity = readNumber(candidate?.liquidity?.usd ?? candidate?.liquidityUsd) || 0;
  const volume = readNumber(candidate?.volume?.h24 ?? candidate?.volume24h ?? candidate?.volumeUsd24h) || 0;
  const marketCap = readNumber(candidate?.marketCap) || 0;
  const fdv = readNumber(candidate?.fdv) || 0;
  let score = 0;

  if (context.contractAddress && address?.toLowerCase() === context.contractAddress.toLowerCase()) {
    score += 250;
  }
  if (context.preferredChain && chain === context.preferredChain) {
    score += 100;
  }
  if (context.preferredName && name === context.preferredName.toLowerCase()) {
    score += 90;
  }
  if (context.query && name === context.query.toLowerCase()) {
    score += 70;
  }
  if (context.preferredSymbol && symbol === context.preferredSymbol) {
    score += 60;
  }
  if (context.query && symbol === context.query.toUpperCase()) {
    score += 40;
  }
  if (context.preferredName && name.includes(context.preferredName.toLowerCase())) {
    score += 20;
  }
  if (context.query && name.includes(context.query.toLowerCase())) {
    score += 10;
  }
  if (liquidity > 0) {
    score += Math.min(25, Math.log10(liquidity + 1) * 4);
  }
  if (volume > 0) {
    score += Math.min(15, Math.log10(volume + 1) * 2);
  }
  if (marketCap > 0) {
    score += 8;
  }
  if (fdv > 0) {
    score += 4;
  }

  return score;
}

function pickBestDexCandidate(candidates, context) {
  return [...candidates]
    .sort((left, right) => {
      const scoreDelta = scoreDexCandidate(right, context) - scoreDexCandidate(left, context);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      const leftLiquidity = readNumber(left?.liquidity?.usd ?? left?.liquidityUsd) || 0;
      const rightLiquidity = readNumber(right?.liquidity?.usd ?? right?.liquidityUsd) || 0;
      if (leftLiquidity !== rightLiquidity) {
        return rightLiquidity - leftLiquidity;
      }

      const leftMarketCap = readNumber(left?.marketCap) || 0;
      const rightMarketCap = readNumber(right?.marketCap) || 0;
      return rightMarketCap - leftMarketCap;
    })[0] || null;
}

function chooseDexQuery(context, cryptoCandidate) {
  if (context.contractAddress) {
    return context.contractAddress;
  }

  const preferredName = readString(cryptoCandidate?.name) || context.preferredName;
  if (preferredName && preferredName.length >= 3) {
    return preferredName;
  }

  return context.query;
}

async function lookupAssetMarketData(client, input, traceCollector) {
  const tc = traceCollector || getCurrentCollector();
  const context = normalizeLookupInput(input);
  const cryptoResponse = await retryMcpCall(client, "crypto_market", { action: "search", query: context.query }, tc, 2);
  const cryptoPayload = safeJsonParse(cryptoResponse.text);
  const cryptoCandidates = extractCryptoCandidates(cryptoPayload);
  const cryptoCandidate = pickBestCryptoCandidate(cryptoCandidates, context);
  const parsedCrypto = parseCryptoMarket(cryptoPayload || cryptoResponse.text, {
    query: context.preferredSymbol || context.query,
  });

  const dexQuery = chooseDexQuery(context, cryptoCandidate);
  const dexArgs = {
    action: "search",
    query: dexQuery,
  };
  if (context.preferredChain) {
    dexArgs.chain = context.preferredChain;
  }

  // Fetch real price/marketCap from price endpoint using matched coin ID
  let pricePayload = null;
  if (cryptoCandidate?.id) {
    try {
      let priceResponse;
      if (tc) {
        [priceResponse] = await tc.call("crypto_market", { action: "price", coin_ids: cryptoCandidate.id }, () =>
          client.callTool("crypto_market", { action: "price", coin_ids: cryptoCandidate.id })
        );
      } else {
        priceResponse = await client.callTool("crypto_market", { action: "price", coin_ids: cryptoCandidate.id });
      }
      pricePayload = safeJsonParse(priceResponse.text);
    } catch {
      // price fetch is best-effort; fall through to other sources
    }
  }

  const dexResponse = await retryMcpCall(client, "dex_market", dexArgs, tc, 2);
  const dexPayload = safeJsonParse(dexResponse.text);
  const dexCandidates = extractDexCandidates(dexPayload);
  const dexContext = {
    ...context,
    preferredName: readString(cryptoCandidate?.name) || context.preferredName,
    preferredSymbol: readString(cryptoCandidate?.symbol)?.toUpperCase() || context.preferredSymbol,
  };
  const dexCandidate = pickBestDexCandidate(dexCandidates, dexContext);
  const parsedDex = parseDexMarket(dexCandidate || dexPayload || dexResponse.text, {
    query: dexContext.preferredSymbol || context.query,
  });

  return {
    context,
    dexArgs,
    cryptoResponse,
    cryptoPayload,
    cryptoCandidate,
    parsedCrypto,
    pricePayload,
    dexResponse,
    dexPayload,
    dexCandidate,
    parsedDex,
  };
}

function classifyAssetType(identity) {
  const symbol = readString(identity?.symbol)?.toUpperCase();
  const chain = normalizeChainName(identity?.chain);
  const rank = readNumber(identity?.rank);
  const hasListedExchange = Array.isArray(identity?.listedExchanges) && identity.listedExchanges.length > 0;
  const hasOnchainIdentity = Boolean(identity?.contractAddress || chain);

  if ((symbol && MAJOR_CRYPTO_SYMBOLS.has(symbol)) || (rank !== null && rank <= 30)) {
    return "major_crypto";
  }

  if (hasListedExchange) {
    return "cex_alt";
  }

  if (hasOnchainIdentity) {
    return "onchain_token";
  }

  if (rank !== null) {
    return "cex_alt";
  }

  return "unclassified_asset";
}

function buildResolvedIdentity(lookup) {
  const cryptoCandidate = lookup.cryptoCandidate || {};
  const dexCandidate = lookup.dexCandidate || {};
  const baseToken = isObject(dexCandidate.baseToken) ? dexCandidate.baseToken : {};
  const parsedCrypto = lookup.parsedCrypto || {};
  const parsedDex = lookup.parsedDex || {};
  const symbol =
    readString(cryptoCandidate.symbol)?.toUpperCase() ||
    readString(baseToken.symbol)?.toUpperCase() ||
    parsedCrypto.symbol ||
    lookup.context.preferredSymbol ||
    null;
  const name =
    readString(cryptoCandidate.name) ||
    readString(baseToken.name) ||
    parsedCrypto.name ||
    null;
  const chain =
    normalizeChainName(lookup.context.preferredChain) ||
    normalizeChainName(dexCandidate.chainId || dexCandidate.chain || dexCandidate.network) ||
    parsedDex.chain ||
    null;

  // Chain confidence: DEX-only attribution is unreliable for chain identity
  // (e.g. a Solana memecoin named "DOGE" may outrank real Dogecoin in DEX search)
  let chainSource = null;
  let chainConfidence = "none";
  if (lookup.context.preferredChain) {
    chainSource = "user_specified";
    chainConfidence = "high";
  } else if (chain) {
    const hasCryptoData = cryptoCandidate && Boolean(cryptoCandidate.id || cryptoCandidate.symbol);
    if (hasCryptoData) {
      chainSource = "dex_market";
      chainConfidence = "medium";
    } else {
      chainSource = "dex_market";
      chainConfidence = "low";
    }
  }
  const contractAddress =
    readString(lookup.context.contractAddress) ||
    readString(baseToken.address || dexCandidate.address || dexCandidate.tokenAddress) ||
    parsedDex.contractAddress ||
    null;
  const listedExchanges = uniqueStrings(parsedCrypto.listedExchanges || []);
  // Extract price data from crypto_market price endpoint
  const priceData = lookup.pricePayload && cryptoCandidate?.id
    ? (lookup.pricePayload[cryptoCandidate.id] || null)
    : null;
  const marketCap = firstFinite([
    readNumber(priceData?.usd_market_cap),
    parsedCrypto.marketCap,
    readNumber(cryptoCandidate.market_cap),
    readNumber(dexCandidate.marketCap),
  ]);
  const fdv = firstFinite([
    readNumber(priceData?.usd_market_cap),
    parsedCrypto.fdv,
    readNumber(dexCandidate.fdv),
  ]);
  const price = firstFinite([
    readNumber(priceData?.usd),
    parsedCrypto.price,
    parsedDex.price,
    readNumber(cryptoCandidate.current_price),
    readNumber(dexCandidate.priceUsd),
  ]);
  const liquidityUsd = firstFinite([
    readNumber(dexCandidate?.liquidity?.usd),
    readNumber(dexCandidate?.liquidityUsd),
    parsedDex.liquidityUsd,
  ]);
  const volume24h = firstFinite([
    readNumber(dexCandidate?.volume?.h24),
    readNumber(dexCandidate?.volume24h),
    parsedDex.volume24h,
  ]);
  const rank = firstFinite([
    parsedCrypto.rank,
    readNumber(cryptoCandidate.market_cap_rank),
    readNumber(cryptoCandidate.rank),
  ]);

  const identity = {
    symbol,
    name,
    chain,
    chainSource,
    chainConfidence,
    contractAddress,
    assetType: null,
    marketCap,
    fdv,
    price,
    liquidityUsd,
    volume24h,
    rank,
    listedExchanges,
  };

  identity.assetType = classifyAssetType(identity);
  return identity;
}

function formatCompactUsd(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  if (Math.abs(value) >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`;
  }
  if (Math.abs(value) >= 1e6) {
    return `$${(value / 1e6).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1e3) {
    return `$${(value / 1e3).toFixed(2)}K`;
  }
  if (Math.abs(value) >= 1) {
    return `$${value.toFixed(2)}`;
  }
  return `$${value.toFixed(6)}`;
}

function buildLiquidityNote(dexCandidate, parsedDex, identity) {
  if (!dexCandidate && !parsedDex?.liquidityUsd) {
    return "No DEX liquidity snapshot returned by market-data MCP for this asset.";
  }

  const chain =
    normalizeChainName(dexCandidate?.chainId || dexCandidate?.chain || dexCandidate?.network) ||
    parsedDex?.chain ||
    identity?.chain ||
    "unknown";
  const dex = readString(dexCandidate?.dexId || dexCandidate?.dex || parsedDex?.dex) || "unknown_dex";
  const liquidity = firstFinite([
    readNumber(dexCandidate?.liquidity?.usd),
    readNumber(dexCandidate?.liquidityUsd),
    parsedDex?.liquidityUsd,
  ]);
  const volume24h = firstFinite([
    readNumber(dexCandidate?.volume?.h24),
    readNumber(dexCandidate?.volume24h),
    parsedDex?.volume24h,
  ]);
  const marketCap = firstFinite([
    readNumber(dexCandidate?.marketCap),
    identity?.marketCap,
  ]);
  const fdv = firstFinite([
    readNumber(dexCandidate?.fdv),
    identity?.fdv,
  ]);

  const parts = [`DEX snapshot on ${chain} via ${dex}`];
  if (liquidity !== null) {
    parts.push(`liquidity ${formatCompactUsd(liquidity)}`);
  }
  if (volume24h !== null) {
    parts.push(`24h volume ${formatCompactUsd(volume24h)}`);
  }
  if (marketCap !== null) {
    parts.push(`market cap ${formatCompactUsd(marketCap)}`);
  }
  if (fdv !== null) {
    parts.push(`FDV ${formatCompactUsd(fdv)}`);
  }
  return parts.join(", ");
}

function buildLookupSources(lookup) {
  const identity = buildResolvedIdentity(lookup);
  const cryptoSummary = [
    identity.name || lookup.context.query,
    identity.rank !== null ? `rank #${identity.rank}` : null,
    identity.price !== null ? `price ${formatCompactUsd(identity.price)}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const dexLiquidity = firstFinite([
    readNumber(lookup.dexCandidate?.liquidity?.usd),
    readNumber(lookup.dexCandidate?.liquidityUsd),
    lookup.parsedDex?.liquidityUsd,
  ]);
  const dexSummary = [
    identity.chain || "unknown chain",
    lookup.parsedDex?.dex || readString(lookup.dexCandidate?.dexId),
    dexLiquidity !== null ? `liquidity ${formatCompactUsd(dexLiquidity)}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return [
    {
      sourceType: "market_data_mcp",
      tool: "crypto_market",
      query: lookup.context.query,
      keyClaim: cryptoSummary || `crypto_market search returned data for ${lookup.context.query}`,
      rawText: lookup.cryptoResponse.text,
    },
    {
      sourceType: "market_data_mcp",
      tool: "dex_market",
      query: lookup.dexArgs.query,
      chain: lookup.dexArgs.chain || null,
      keyClaim: dexSummary || `dex_market search returned data for ${lookup.dexArgs.query}`,
      rawText: lookup.dexResponse.text,
    },
  ];
}
