import { store } from "../data-store.mjs";
import {
  confirmPlan,
  getAssetContext,
  managePosition,
  reviewAddIntent,
  reviewSellIntent,
  runDailyMonitor
} from "../services/api-service.mjs";

const shouldReset = process.argv.includes("--reset");
const assetQuery = process.argv.slice(2).find((arg) => !arg.startsWith("--")) || "BTW";

if (shouldReset) {
  await store.clear();
}

const managed = await managePosition({
  assetQuery,
  units: 500,
  averageCost: 1,
  currentPrice: 1,
  portfolioValue: 10000,
  naturalLanguagePlan: "2x 回本金，3x 卖 30%，保留历史最高持仓 20% 底仓"
});

const confirmed = await confirmPlan({ assetQuery });
const monitor = await runDailyMonitor({});
const addReview = await reviewAddIntent({
  assetQuery,
  portfolioValue: 10000
});
const sellReview = await reviewSellIntent({
  assetQuery,
  requestedSellPct: 30
});
const context = await getAssetContext(assetQuery);

const payload = {
  managed: {
    asset: managed.asset.symbol,
    assetType: managed.asset.assetType,
    chain: managed.asset.chain,
    planStatus: managed.plan.status,
    researchSummary: managed.researchReport.summary,
    currentMetrics: managed.researchReport.currentMetrics,
    thesis: managed.researchReport.thesis
  },
  confirmed: {
    planStatus: confirmed.plan.status
  },
  monitor,
  addReview,
  sellReview,
  contextSummary: context.memorySummary
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
