const CHAIN_ALIASES = new Map([
  ["arb", "arbitrum"],
  ["arbitrum", "arbitrum"],
  ["base", "base"],
  ["bsc", "bsc"],
  ["bnb chain", "bsc"],
  ["bnbchain", "bsc"],
  ["bitcoin", "bitcoin"],
  ["btc", "bitcoin"],
  ["eth", "ethereum"],
  ["ethereum", "ethereum"],
  ["mainnet", "ethereum"],
  ["op", "optimism"],
  ["optimism", "optimism"],
  ["polygon", "polygon"],
  ["matic", "polygon"],
  ["sol", "solana"],
  ["solana", "solana"],
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPath(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (current === undefined || current === null ? undefined : current[key]), object);
}

function uniq(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function parseWithSuffix(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)\s*([kmbt])$/i);
  if (!match) {
    return null;
  }

  const base = Number(match[1]);
  const suffix = match[2].toLowerCase();
  const multiplier =
    suffix === "k" ? 1e3 :
      suffix === "m" ? 1e6 :
        suffix === "b" ? 1e9 :
          1e12;

  return Number.isFinite(base) ? base * multiplier : null;
}

function parseLooseNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const directWithSuffix = parseWithSuffix(value);
  if (directWithSuffix !== null) {
    return directWithSuffix;
  }

  const cleaned = value
    .trim()
    .replace(/[$,%]/g, "")
    .replace(/,/g, "")
    .replace(/\s+(usd|usdt|million|billion|trillion)$/i, "");

  const normalizedWithWords = cleaned
    .replace(/\s*billion$/i, "b")
    .replace(/\s*million$/i, "m")
    .replace(/\s*thousand$/i, "k")
    .replace(/\s*trillion$/i, "t");

  const wordSuffix = parseWithSuffix(normalizedWithWords);
  if (wordSuffix !== null) {
    return wordSuffix;
  }

  const match = normalizedWithWords.match(/-?[0-9]+(?:\.[0-9]+)?(?:e-?[0-9]+)?/i);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNumber(object, paths) {
  for (const path of paths) {
    const parsed = parseLooseNumber(getPath(object, path));
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function firstString(object, paths) {
  for (const path of paths) {
    const value = getPath(object, path);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeChainName(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  return CHAIN_ALIASES.get(normalized) || normalized.replace(/\s+/g, "_") || null;
}

function detectChainFromText(text) {
  const lowered = String(text || "").toLowerCase();
  for (const [alias, canonical] of CHAIN_ALIASES.entries()) {
    const pattern = new RegExp(`(^|[^a-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");
    if (pattern.test(lowered)) {
      return canonical;
    }
  }
  return null;
}

function normalizeInput(input) {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) {
      return { data: null, rawText: "" };
    }

    try {
      return {
        data: JSON.parse(trimmed),
        rawText: trimmed,
      };
    } catch {
      return { data: null, rawText: trimmed };
    }
  }

  if (isObject(input) || Array.isArray(input)) {
    return {
      data: input,
      rawText: JSON.stringify(input),
    };
  }

  return {
    data: null,
    rawText: String(input || ""),
  };
}

function collectObjects(value, results = [], seen = new Set()) {
  if (!value || typeof value !== "object") {
    return results;
  }

  if (seen.has(value)) {
    return results;
  }
  seen.add(value);

  if (isObject(value)) {
    results.push(value);
  }

  const entries = Array.isArray(value) ? value : Object.values(value);
  for (const entry of entries) {
    collectObjects(entry, results, seen);
  }

  return results;
}

function scoreRecord(record, query, numericPaths) {
  let score = 0;
  const symbol = firstString(record, ["symbol", "baseToken.symbol", "token.symbol"]);
  const name = firstString(record, ["name", "baseToken.name", "token.name"]);
  const normalizedQuery = String(query || "").trim().toLowerCase();

  if (normalizedQuery) {
    if (String(symbol || "").toLowerCase() === normalizedQuery) {
      score += 10;
    }
    if (String(name || "").toLowerCase() === normalizedQuery) {
      score += 8;
    }
    if (String(name || "").toLowerCase().includes(normalizedQuery)) {
      score += 4;
    }
  }

  for (const path of numericPaths) {
    if (firstNumber(record, [path]) !== null) {
      score += 1;
    }
  }

  if (firstString(record, ["id", "baseToken.address", "address", "tokenAddress"])) {
    score += 1;
  }

  return score;
}

function pickBestRecord(records, query, numericPaths) {
  return records
    .map((record) => ({ record, score: scoreRecord(record, query, numericPaths) }))
    .sort((a, b) => b.score - a.score)[0]?.record || null;
}

function extractListedExchanges(record) {
  const tickers = getPath(record, "tickers");
  if (!Array.isArray(tickers)) {
    return [];
  }

  return uniq(
    tickers.map((ticker) => {
      if (!ticker) {
        return null;
      }
      return (
        firstString(ticker, [
          "market.name",
          "market.identifier",
          "exchange",
          "exchangeName",
          "name",
        ]) || null
      );
    })
  );
}

function extractTextNumber(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (!match) {
      continue;
    }

    const candidate = match[1] || match[2] || match[0];
    const parsed = parseLooseNumber(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

export function parseCryptoMarket(input, options = {}) {
  const { data, rawText } = normalizeInput(input);
  const objects = collectObjects(data);
  const candidates = objects.filter((record) => {
    const hasName = Boolean(firstString(record, ["name"]));
    const hasSymbol = Boolean(firstString(record, ["symbol"]));
    const hasMarketMetric =
      firstNumber(record, [
        "current_price",
        "price",
        "market_cap",
        "fully_diluted_valuation",
        "market_cap_rank",
        "rank",
      ]) !== null;

    return (hasName || hasSymbol) && hasMarketMetric;
  });

  const selected = pickBestRecord(candidates, options.query, [
    "current_price",
    "market_cap",
    "fully_diluted_valuation",
    "market_cap_rank",
  ]);

  if (selected) {
    return {
      name: firstString(selected, ["name"]),
      symbol: firstString(selected, ["symbol"])?.toUpperCase() || null,
      rank: firstNumber(selected, ["market_cap_rank", "rank"]),
      price: firstNumber(selected, ["current_price", "price", "price_usd", "usd"]),
      marketCap: firstNumber(selected, ["market_cap", "marketCap"]),
      fdv: firstNumber(selected, ["fully_diluted_valuation", "fdv", "fullyDilutedValuation"]),
      listedExchanges: extractListedExchanges(selected),
    };
  }

  return {
    name: firstString({ rawText }, ["rawText"]),
    symbol: String(options.query || "").trim().toUpperCase() || null,
    rank: extractTextNumber(rawText, [/#\s*([0-9]+)/i, /rank[^0-9]*([0-9]+)/i]),
    price: extractTextNumber(rawText, [
      /price[^0-9$]*\$?\s*([0-9.,]+(?:e-?[0-9]+)?)/i,
      /\$([0-9.,]+(?:e-?[0-9]+)?)/,
    ]),
    marketCap: extractTextNumber(rawText, [
      /market cap[^0-9$]*\$?\s*([0-9.,]+\s*[kmbt]?)/i,
      /mcap[^0-9$]*\$?\s*([0-9.,]+\s*[kmbt]?)/i,
    ]),
    fdv: extractTextNumber(rawText, [
      /fdv[^0-9$]*\$?\s*([0-9.,]+\s*[kmbt]?)/i,
      /fully diluted valuation[^0-9$]*\$?\s*([0-9.,]+\s*[kmbt]?)/i,
    ]),
    listedExchanges: [],
  };
}

export function parseDexMarket(input, options = {}) {
  const { data, rawText } = normalizeInput(input);
  const objects = collectObjects(data);
  const candidates = objects.filter((record) => {
    const hasAddress = Boolean(
      firstString(record, ["baseToken.address", "address", "tokenAddress", "pairAddress"])
    );
    const hasPrice = firstNumber(record, ["priceUsd", "price", "price_usd"]) !== null;
    const hasLiquidity = firstNumber(record, ["liquidity.usd", "liquidityUsd"]) !== null;
    const hasChain = Boolean(firstString(record, ["chainId", "chain", "network"]));

    return hasAddress || ((hasPrice || hasLiquidity) && hasChain);
  });

  const selected = pickBestRecord(candidates, options.query, [
    "priceUsd",
    "liquidity.usd",
    "volume.h24",
  ]);

  if (selected) {
    return {
      chain: normalizeChainName(firstString(selected, ["chainId", "chain", "network"])),
      contractAddress: firstString(selected, [
        "baseToken.address",
        "address",
        "tokenAddress",
        "pairAddress",
      ]),
      price: firstNumber(selected, ["priceUsd", "price", "price_usd"]),
      liquidityUsd: firstNumber(selected, ["liquidity.usd", "liquidityUsd"]),
      volume24h: firstNumber(selected, ["volume.h24", "volume24h", "volume.usd24h"]),
      dex: firstString(selected, ["dexId", "dex", "exchangeName", "exchange"]),
    };
  }

  const contractAddress = String(rawText || "").match(/0x[a-fA-F0-9]{40}/)?.[0] || null;

  return {
    chain: detectChainFromText(rawText),
    contractAddress,
    price: extractTextNumber(rawText, [
      /price[^0-9$]*\$?\s*([0-9.,]+(?:e-?[0-9]+)?)/i,
      /\$([0-9.,]+(?:e-?[0-9]+)?)/,
    ]),
    liquidityUsd: extractTextNumber(rawText, [
      /liquidity[^0-9$]*\$?\s*([0-9.,]+\s*[kmbt]?)/i,
    ]),
    volume24h: extractTextNumber(rawText, [
      /volume(?:\s*24h)?[^0-9$]*\$?\s*([0-9.,]+\s*[kmbt]?)/i,
      /24h[^0-9$]*volume[^0-9$]*\$?\s*([0-9.,]+\s*[kmbt]?)/i,
    ]),
    dex: firstString({ rawText }, ["rawText"])?.match(/uniswap v3|uniswap|pancakeswap|raydium|aerodrome/i)?.[0] || null,
  };
}
