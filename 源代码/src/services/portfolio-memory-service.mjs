import { readdir, readFile } from "node:fs/promises";

import { resolveAssetFromQuery } from "./asset-service.mjs";
import { resolveProjectPath } from "../paths.mjs";

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeAlias(value) {
  return String(value || "").trim().toLowerCase();
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function buildMatch({
  sourceType,
  matchStrength,
  assetId = null,
  assetSymbol = null,
  status = "unknown",
  details = {},
  positionSnapshot = null
}) {
  return {
    sourceType,
    matchStrength,
    assetId,
    assetSymbol,
    status,
    details,
    positionSnapshot
  };
}

function collectAssetMatches(asset, state) {
  const matches = [];
  const symbol = normalizeSymbol(asset.symbol);
  const aliases = new Set([symbol, ...(asset.aliases || []).map(normalizeAlias)]);

  const stateAsset = state.assets?.[asset.id];
  const statePosition = state.positions?.[asset.id] || null;
  const statePlan = state.plans?.[asset.id] || null;
  const stateResearch = state.researchReports?.[asset.id] || null;
  const relatedTraces = Object.values(state.traces || {}).filter((trace) => trace.assetId === asset.id);

  if (stateAsset) {
    matches.push(
      buildMatch({
        sourceType: "decision_brain_asset",
        matchStrength: statePosition ? "exact_current" : "exact_historical",
        assetId: asset.id,
        assetSymbol: asset.symbol,
        status: statePlan?.status || (statePosition ? "positioned" : "known"),
        details: {
          aliases: unique([...(stateAsset.aliases || []), symbol]),
          hasPriorResearch: Boolean(stateResearch),
          traceCount: relatedTraces.length
        },
        positionSnapshot: statePosition
          ? {
              units: statePosition.units,
              averageCost: statePosition.averageCost,
              currentPrice: statePosition.currentPrice,
              currentValue: statePosition.currentValue,
              peakUnits: statePosition.peakUnits
            }
          : null
      })
    );
  }

  for (const candidate of Object.values(state.assets || {})) {
    if (!candidate || candidate.id === asset.id) {
      continue;
    }

    const candidateSymbol = normalizeSymbol(candidate.symbol);
    const candidateAliases = new Set([candidateSymbol, ...(candidate.aliases || []).map(normalizeAlias)]);
    const hasAliasOverlap = [...aliases].some((value) => candidateAliases.has(value));
    const matchesContract =
      asset.contractAddress &&
      candidate.contractAddress &&
      normalizeAlias(asset.contractAddress) === normalizeAlias(candidate.contractAddress);

    if (!hasAliasOverlap && !matchesContract) {
      continue;
    }

    const candidatePosition = state.positions?.[candidate.id] || null;
    const candidatePlan = state.plans?.[candidate.id] || null;
    const candidateResearch = state.researchReports?.[candidate.id] || null;

    matches.push(
      buildMatch({
        sourceType: "decision_brain_alias",
        matchStrength: matchesContract ? "contract_match" : "alias_match",
        assetId: candidate.id,
        assetSymbol: candidate.symbol,
        status: candidatePlan?.status || (candidatePosition ? "positioned" : "known"),
        details: {
          aliases: unique(candidate.aliases || []),
          hasPriorResearch: Boolean(candidateResearch)
        },
        positionSnapshot: candidatePosition
          ? {
              units: candidatePosition.units,
              averageCost: candidatePosition.averageCost,
              currentPrice: candidatePosition.currentPrice,
              currentValue: candidatePosition.currentValue,
              peakUnits: candidatePosition.peakUnits
            }
          : null
      })
    );
  }

  return matches;
}

async function readCsvPortfolioFiles(asset) {
  const projectRoot = resolveProjectPath();
  const rootEntries = await readdir(projectRoot, { withFileTypes: true });
  const symbol = normalizeSymbol(asset.symbol);
  const matches = [];

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (!/(portfolio|holding|transaction|normalized|cmc|coinmarketcap)/i.test(entry.name)) {
      continue;
    }

    const candidatePath = resolveProjectPath(entry.name, "transactions.csv");
    try {
      const raw = await readFile(candidatePath, "utf8");
      const lines = raw.split(/\r?\n/).filter(Boolean);
      if (lines.length <= 1) {
        continue;
      }

      const header = lines[0].toLowerCase();
      if (!/(symbol|coin|asset|currency|name)/.test(header)) {
        continue;
      }

      const matchedRows = lines.slice(1).filter((line) => new RegExp(`(^|,|")${symbol}($|,|")`, "i").test(line));
      if (!matchedRows.length) {
        continue;
      }

      matches.push(
        buildMatch({
          sourceType: "local_portfolio_csv",
          matchStrength: "symbol_match",
          assetSymbol: asset.symbol,
          status: "external_history",
          details: {
            file: candidatePath,
            matchedRows: matchedRows.length
          }
        })
      );
    } catch {
      continue;
    }
  }

  return matches;
}

function classifyIntentFromMatches(matches) {
  const current = matches.find((match) => match.positionSnapshot && match.status !== "archived");
  const archived = matches.find((match) => match.status === "archived");
  const historical = matches.find((match) => !match.positionSnapshot && match.status !== "unknown");

  if (current) {
    return "add_to_existing";
  }
  if (archived) {
    return "resume_archived_watch";
  }
  if (historical) {
    return "rebuild_after_exit";
  }
  return "unknown";
}

function confidenceFromMatches(matches) {
  if (matches.some((match) => match.matchStrength === "exact_current")) {
    return "high";
  }
  if (matches.some((match) => ["exact_historical", "contract_match", "alias_match"].includes(match.matchStrength))) {
    return "medium";
  }
  if (matches.length > 0) {
    return "low";
  }
  return "none";
}

export async function lookupPortfolioMemory(assetQuery, state, options = {}) {
  const asset = resolveAssetFromQuery(assetQuery, state.assets || {});
  const stateMatches = collectAssetMatches(asset, state);
  const externalMatches = options.includeExternalSources === false ? [] : await readCsvPortfolioFiles(asset);
  const matches = [...stateMatches, ...externalMatches];
  const suggestedIntentClass = classifyIntentFromMatches(matches);
  const hasCurrentPosition = matches.some((match) => Boolean(match.positionSnapshot) && match.status !== "archived");
  const hasHistoricalPosition = matches.some((match) => match.sourceType !== "decision_brain_asset" || match.status !== "unknown");
  const isArchived = matches.some((match) => match.status === "archived");
  const hasPriorResearch = matches.some((match) => Boolean(match.details?.hasPriorResearch));
  const knownAliases = unique([
    asset.symbol,
    ...(asset.aliases || []),
    ...matches.flatMap((match) => match.details?.aliases || [])
  ]);
  const confidence = confidenceFromMatches(matches);
  const requiresUserConfirmation = !hasCurrentPosition && suggestedIntentClass === "unknown";

  return {
    asset,
    portfolioMemoryProfile: {
      hasCurrentPosition,
      hasHistoricalPosition,
      isArchived,
      hasPriorResearch,
      knownAliases,
      matchedSources: matches,
      confidence,
      suggestedIntentClass,
      requiresUserConfirmation,
      allowUnconfirmedHistoryFlow: Boolean(options.allowUnconfirmedHistoryFlow),
      confirmationPrompt: requiresUserConfirmation
        ? `没有查到 ${asset.symbol} 的明确持仓历史。请确认这是第一次买，还是以前买过但当前未录入。`
        : null
    }
  };
}
