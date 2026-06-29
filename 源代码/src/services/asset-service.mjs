import { assetIdFromQuery, slugify } from "../utils/ids.mjs";
import { nowIso } from "../utils/time.mjs";

const knownAssets = {
  btc: {
    symbol: "BTC",
    name: "Bitcoin",
    assetType: "major_crypto",
    chain: "bitcoin",
    riskClass: "medium",
    tags: ["store-of-value", "macro"]
  },
  eth: {
    symbol: "ETH",
    name: "Ethereum",
    assetType: "major_crypto",
    chain: "ethereum",
    riskClass: "medium_high",
    tags: ["smart-contract", "l1"]
  },
  sol: {
    symbol: "SOL",
    name: "Solana",
    assetType: "major_crypto",
    chain: "solana",
    riskClass: "medium_high",
    tags: ["l1", "solana-ecosystem"]
  },
  ena: {
    symbol: "ENA",
    name: "Ethena",
    assetType: "cex_alt",
    chain: "ethereum",
    riskClass: "high",
    tags: ["stablecoin", "yield", "ethena"]
  },
  zora: {
    symbol: "ZORA",
    name: "Zora",
    assetType: "onchain_token",
    chain: "base",
    riskClass: "high",
    tags: ["creator", "social", "base"]
  }
};

function inferAssetType(query) {
  if (/^0x[a-fA-F0-9]{40}$/.test(query)) {
    return {
      symbol: `${query.slice(0, 6)}...${query.slice(-4)}`,
      name: "Onchain Token",
      assetType: "onchain_token",
      chain: "evm",
      riskClass: "high",
      tags: ["onchain", "speculative"]
    };
  }

  if (/^[A-Z]{1,5}$/.test(query)) {
    return {
      symbol: query,
      name: query,
      assetType: "unclassified_asset",
      chain: null,
      riskClass: "high",
      tags: ["manual-review", "unclassified"]
    };
  }

  return {
    symbol: query.toUpperCase(),
    name: query,
    assetType: "cex_alt",
    chain: null,
    riskClass: "high",
    tags: ["manual-review"]
  };
}

function inferRiskClass(assetType) {
  if (assetType === "major_crypto") {
    return "medium_high";
  }
  if (assetType === "cex_alt") {
    return "high";
  }
  if (assetType === "onchain_token") {
    return "high";
  }
  return "high";
}

function uniqStrings(values) {
  return Array.from(
    new Set(
      (values || [])
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function mergeTags(...groups) {
  return uniqStrings(groups.flat()).slice(0, 12);
}

function mergeAliases(...groups) {
  return uniqStrings(groups.flat());
}

export function resolveAssetFromQuery(assetQuery, existingAssets) {
  const normalized = slugify(assetQuery);
  const known = knownAssets[normalized] || inferAssetType(String(assetQuery || "").trim());
  const existing = Object.values(existingAssets).find((asset) => {
    return (
      asset.symbol?.toLowerCase() === String(known.symbol).toLowerCase() ||
      asset.aliases?.includes(normalized) ||
      asset.contractAddress === assetQuery
    );
  });

  if (existing) {
    return {
      ...existing,
      aliases: Array.from(new Set([...(existing.aliases || []), normalized]))
    };
  }

  return {
    id: assetIdFromQuery(known.symbol || assetQuery),
    symbol: known.symbol,
    name: known.name,
    assetType: known.assetType,
    chain: known.chain,
    contractAddress: /^0x[a-fA-F0-9]{40}$/.test(assetQuery) ? assetQuery : null,
    riskClass: known.riskClass,
    tags: known.tags,
    aliases: normalized ? [normalized] : [],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

export async function resolveAssetIdentity(assetQueryOrAsset, existingAssets = {}, adapters = {}, opts = {}) {
  const rawInput = typeof assetQueryOrAsset === "string"
    ? String(assetQueryOrAsset).trim()
    : String(assetQueryOrAsset?.symbol || assetQueryOrAsset?.contractAddress || "").trim();

  const baseAsset =
    typeof assetQueryOrAsset === "string"
      ? resolveAssetFromQuery(assetQueryOrAsset, existingAssets)
      : {
          ...resolveAssetFromQuery(
            assetQueryOrAsset?.contractAddress || assetQueryOrAsset?.symbol || assetQueryOrAsset?.name || "",
            existingAssets
          ),
          ...(assetQueryOrAsset || {}),
          aliases: mergeAliases(
            resolveAssetFromQuery(
              assetQueryOrAsset?.contractAddress || assetQueryOrAsset?.symbol || assetQueryOrAsset?.name || "",
              existingAssets
            ).aliases || [],
            assetQueryOrAsset?.aliases || []
          ),
        };

  const userInputSymbol = /^0x[a-fA-F0-9]{40}$/.test(rawInput) ? baseAsset.symbol : rawInput.toUpperCase();

  const shouldEnrichIdentity =
    opts.forceEnrich === true ||
    baseAsset.assetType === "unclassified_asset" ||
    (!baseAsset.chain && !baseAsset.contractAddress);

  if (!shouldEnrichIdentity || typeof adapters?.bitget?.resolveSymbol !== "function") {
    return {
      ...baseAsset,
      inputSymbol: userInputSymbol,
      identityConfidence: knownAssets[rawInput.toLowerCase()] ? "high" : "medium",
      needsUserConfirmation: !knownAssets[rawInput.toLowerCase()] && baseAsset.assetType === "unclassified_asset",
      identityMismatchReason: null,
      updatedAt: nowIso(),
    };
  }

  try {
    const resolved = await adapters.bitget.resolveSymbol(
      baseAsset.contractAddress || baseAsset.symbol || baseAsset.name
    );

    if (!resolved?.ok) {
      return {
        ...baseAsset,
        inputSymbol: userInputSymbol,
        identityConfidence: knownAssets[rawInput.toLowerCase()] ? "high" : "low",
        needsUserConfirmation: !knownAssets[rawInput.toLowerCase()],
        identityMismatchReason: null,
        updatedAt: nowIso(),
      };
    }

    const resolvedSymbol = String(resolved.symbol || "").toUpperCase().trim();
    const baseSymbol = String(baseAsset.symbol || "").toUpperCase().trim();
    const symbolsDiffer = resolvedSymbol && baseSymbol && resolvedSymbol !== baseSymbol;

    if (symbolsDiffer && !knownAssets[rawInput.toLowerCase()]) {
      return {
        ...baseAsset,
        inputSymbol: userInputSymbol,
        resolvedSymbol: resolvedSymbol,
        identityConfidence: "low",
        needsUserConfirmation: true,
        identityMismatchReason: `用户输入 ${userInputSymbol}，外部解析返回 ${resolvedSymbol}，两者不一致，需要用户确认`,
        tags: mergeTags(baseAsset.tags || [], ["manual-review", "identity-mismatch"]),
        updatedAt: nowIso(),
      };
    }

    const mergedAssetType =
      resolved.assetType && resolved.assetType !== "unclassified_asset"
        ? resolved.assetType
        : baseAsset.assetType;

    return {
      ...baseAsset,
      symbol: resolved.symbol || baseAsset.symbol,
      name: resolved.name || baseAsset.name,
      assetType: mergedAssetType,
      chain: resolved.chain || baseAsset.chain,
      contractAddress: resolved.contractAddress || baseAsset.contractAddress,
      riskClass: baseAsset.riskClass === "high"
        ? inferRiskClass(mergedAssetType)
        : baseAsset.riskClass,
      tags: mergeTags(
        baseAsset.tags || [],
        resolved.chain ? [resolved.chain] : [],
        mergedAssetType === "major_crypto" ? ["major-crypto"] : [],
        mergedAssetType === "cex_alt" ? ["cex-listed"] : [],
        mergedAssetType === "onchain_token" ? ["onchain"] : []
      ),
      aliases: mergeAliases(
        baseAsset.aliases || [],
        slugify(resolved.symbol || ""),
        slugify(resolved.name || ""),
        resolved.contractAddress || null
      ),
      inputSymbol: userInputSymbol,
      resolvedSymbol: resolvedSymbol || resolved.symbol || null,
      identityConfidence: knownAssets[rawInput.toLowerCase()] ? "high" : "medium",
      needsUserConfirmation: !knownAssets[rawInput.toLowerCase()] && baseAsset.assetType === "unclassified_asset",
      identityMismatchReason: null,
      updatedAt: nowIso(),
    };
  } catch {
    return {
      ...baseAsset,
      inputSymbol: userInputSymbol,
      identityConfidence: knownAssets[rawInput.toLowerCase()] ? "high" : "medium",
      needsUserConfirmation: !knownAssets[rawInput.toLowerCase()],
      identityMismatchReason: null,
      updatedAt: nowIso(),
    };
  }
}
