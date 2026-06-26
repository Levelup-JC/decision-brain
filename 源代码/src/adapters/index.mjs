import { createBitgetAdapter } from "./bitget-adapter.mjs";
import { createSurfAdapter } from "./surf-adapter.mjs";

function createOfflineBitgetAdapter() {
  const notConnectedStatus = {
    connected: false,
    mode: "not_configured",
    offline: true,
    skills: [],
  };

  return {
    name: "bitget-offline-adapter",
    async ensureConnected() {
      return { connected: false, error: "offline_mode" };
    },
    getConnectionStatus() {
      return notConnectedStatus;
    },
    getSkillNotes() {
      return {
        macro: "Offline mode enabled. Macro market-data lookup skipped.",
        marketIntel: "Offline mode enabled. Market intel lookup skipped.",
        news: "Offline mode enabled. News lookup skipped.",
        sentiment: "Offline mode enabled. Sentiment lookup skipped.",
        technical: "Offline mode enabled. Technical lookup skipped.",
      };
    },
    async refreshResearch() {
      return {
        ok: false,
        sourceType: "not_connected",
        connectionStatus: notConnectedStatus,
        sources: [
          {
            sourceType: "not_connected",
            skill: "offline_stub",
            roleInDecision: "supporting_evidence",
            title: "Offline mode",
            keyClaim: "Offline mode enabled. Market-data research refresh skipped."
          }
        ],
      };
    },
    async resolveSymbol() {
      return {
        ok: false,
        sourceType: "not_connected",
        connectionStatus: notConnectedStatus,
        sources: [],
      };
    },
    async enrichAsset() {
      return {
        ok: false,
        sourceType: "not_connected",
        connectionStatus: notConnectedStatus,
        currentMetrics: {
          marketCap: null,
          fdv: null,
          price: null,
        },
        liquidityNote: "Offline mode enabled.",
        listedExchanges: [],
        sources: [],
      };
    },
    async scanDailySignals(asset) {
      return {
        summary: `${asset?.symbol || "unknown"} daily scan skipped: offline mode enabled.`,
        highlights: [],
      };
    },
    close() {},
  };
}

export function getAdapters({ offline } = {}) {
  const offlineMode = Boolean(offline || process.env.DECISION_BRAIN_OFFLINE);
  return {
    bitget: offlineMode ? createOfflineBitgetAdapter() : createBitgetAdapter(),
    surf: createSurfAdapter()
  };
}
