import { DEFAULT_SETTINGS } from "../config.mjs";
import { nowIso, isDue } from "../utils/time.mjs";
import { scanDailyEvents } from "./research-service.mjs";
import { entityId } from "../utils/ids.mjs";

export function runMonitorForState(state, force = false) {
  const currentTime = nowIso();
  const results = [];

  for (const plan of Object.values(state.plans)) {
    if (plan.status !== "active") {
      continue;
    }

    const asset = state.assets[plan.assetId];
    const researchReport = state.researchReports[plan.assetId];
    if (!asset || !researchReport) {
      continue;
    }

    const monitorEntry = state.monitorState[plan.assetId] || {};
    const newsDue = force || isDue(monitorEntry.lastNewsUpdateAt, DEFAULT_SETTINGS.monitorIntervals.newsHours, currentTime);
    const positionDue = force || isDue(monitorEntry.lastPositionUpdateAt, DEFAULT_SETTINGS.monitorIntervals.positionHours, currentTime);

    const result = {
      asset: asset.symbol,
      newsUpdated: false,
      positionUpdated: false,
      skippedBecauseDailyLimit: false
    };

    if (!newsDue && !positionDue) {
      result.skippedBecauseDailyLimit = true;
      results.push(result);
      continue;
    }

    if (newsDue) {
      const event = scanDailyEvents(asset, researchReport);
      state.events[event.id] = event;
      monitorEntry.lastNewsUpdateAt = currentTime;
      result.newsUpdated = true;
      result.reviewTrigger = Boolean(event.reviewTrigger);

      if (event.reviewTrigger && plan.status === "active") {
        plan.status = "needs_review";
        plan.updatedAt = currentTime;
        state.plans[plan.assetId] = plan;
        result.planStatus = "needs_review";
      }
    }

    if (positionDue) {
      monitorEntry.lastPositionUpdateAt = currentTime;
      result.positionUpdated = true;
    }

    monitorEntry.lastRunAt = currentTime;
    state.monitorState[plan.assetId] = monitorEntry;

    state.traces[entityId("trace")] = {
      id: entityId("trace"),
      assetId: plan.assetId,
      userIntent: "daily_monitor",
      finalRecommendation: `${asset.symbol} 已完成今日一次监测`,
      reasons: [
        newsDue ? "今日新闻监测已更新" : "新闻监测未到 24 小时，不重复更新",
        positionDue ? "今日仓位监测已更新" : "仓位监测未到 24 小时，不重复更新",
        result.reviewTrigger ? "重要事件触发了计划复盘" : "暂无需要强制复盘的事件"
      ],
      createdAt: currentTime
    };

    results.push(result);
  }

  return {
    ok: true,
    ranAt: currentTime,
    results
  };
}
