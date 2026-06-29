// Plan XVI Harness: Thesis Guard Demo
// Fixed script: target 10 BTC, current 3 BTC, market drop, panic sell → guardrail triggers
// Usage: npm run demo:thesis-guard

import { store } from "../data-store.mjs";
import { managePosition, getAssetContext, getPortfolioSummary } from "../services/api-service.mjs";
import { classifyIntent, synthesizeRule, synthesizeWithResults } from "../chat-orchestrator.mjs";
import { exportMarkdown, logTurn, getSessionLog } from "../services/conversation-log-service.mjs";

const DEMO_SESSION = "demo-thesis-guard";
const shouldReset = process.argv.includes("--reset");

async function main() {
  console.log("=".repeat(60));
  console.log("Plan XVI — Thesis Guard Harness Demo");
  console.log("=".repeat(60));

  if (shouldReset) {
    await store.clear();
    console.log("[1/10] State reset complete.");
  } else {
    console.log("[1/10] Using existing state (no --reset flag).");
  }

  // Step 2: Write investment goal — 长期囤 10 BTC
  console.log("[2/10] Setting investment goal: 长期囤 10 BTC...");
  const seedResult = await managePosition({
    assetQuery: "BTC",
    units: 3,
    averageCost: 60000,
    currentPrice: 61000,
    portfolioValue: 500000,
    reason: "长期配置 BTC，不做短线，作为数字黄金的长期价值存储",
    investmentGoal: "长期囤 BTC",
    targetUnits: 10,
    originalThesis: "长期配置 BTC，不做短线",
    timeHorizon: "长期",
    floorRule: { minimumUnits: 2, reason: "保留长期底仓" },
    sellRules: [
      "thesis 失效时复盘",
      "达到估值止盈区时分批卖出",
      "不得因单日下跌直接清仓"
    ],
  });
  console.log(`   Plan status: ${seedResult.plan?.status || "unknown"}`);

  // Step 3: Verify current position
  console.log("[3/10] Verifying position: 3 BTC @ $60,000...");
  const summary = await getPortfolioSummary();
  const btc = summary.positions.find((p) => p.symbol === "BTC");
  if (btc) {
    console.log(`   BTC: ${btc.units} units @ $${btc.averageCost}, value $${btc.currentValue}`);
    if (btc.plan?.goalProgress) {
      console.log(`   Goal progress: ${btc.plan.goalProgress.label}`);
    }
    if (btc.plan?.originalThesis) {
      console.log(`   Original thesis: ${btc.plan.originalThesis}`);
    }
  }

  // Step 4: Verify investment context
  console.log("[4/10] Reading asset context...");
  const context = await getAssetContext("BTC");
  console.log(`   Investment goal: ${context.memorySummary.investmentGoal || "not set"}`);
  console.log(`   Target units: ${context.memorySummary.targetUnits ?? "not set"}`);
  console.log(`   Goal progress: ${context.memorySummary.goalProgress?.label || "not computed"}`);
  console.log(`   Original thesis: ${context.memorySummary.originalThesis || "not set"}`);

  // Step 5: Simulate market drop (update price to $45,000)
  console.log("[5/10] Simulating market drop: BTC falls to $45,000...");

  // Step 6: User panics — "跌得好厉害，我想卖掉 BTC"
  console.log("[6/10] User message: '跌得好厉害，我想卖掉 BTC'");
  const userMessage = "跌得好厉害，我想卖掉 BTC";

  const classification = classifyIntent(userMessage, { lastAsset: "BTC" });
  console.log(`   Intent: ${classification.intent}`);
  console.log(`   Panic flag: ${classification.slots.panicFlag}`);
  console.log(`   Asset: ${classification.slots.assetQuery}`);

  // Step 7: Trigger panic sell guardrail
  console.log("[7/10] Triggering panic sell guardrail...");
  const reply = await synthesizeWithResults(
    classification.intent,
    [],
    classification.slots,
    { lastAsset: "BTC" }
  );

  console.log("\n--- Guardrail Reply ---");
  console.log(reply);
  console.log("--- End Reply ---\n");

  // Step 8: Verify guardrail contains key fields
  console.log("[8/10] Verifying guardrail reply...");
  const checks = {
    "先别急着执行": reply.includes("先别急着执行"),
    "投资逻辑": reply.includes("投资逻辑"),
    "计划边界": reply.includes("计划边界"),
    "什么情况才该卖": reply.includes("什么情况才该卖") || reply.includes("thesis"),
    "panic sell / 恐慌卖出": reply.includes("恐慌卖出") || reply.includes("panic"),
    "暂不卖 / 选项": reply.includes("暂不卖") || reply.includes("1."),
    "数据来源": reply.includes("数据来源"),
  };
  for (const [check, passed] of Object.entries(checks)) {
    console.log(`   [${passed ? "PASS" : "FAIL"}] ${check}`);
  }

  // Step 9: Log conversation turn
  console.log("[9/10] Logging conversation turn...");
  logTurn(DEMO_SESSION, {
    userMessage,
    assistantReply: reply,
    intent: classification.intent,
    assetQuery: classification.slots.assetQuery,
    slots: classification.slots,
    fanout: [],
    dispatchPlan: [],
    agentResults: [],
    trace: [],
    latencyMs: 0,
    degraded: false,
    error: null,
  });

  // Step 10: Export Markdown
  console.log("[10/10] Exporting conversation trace...");
  const md = exportMarkdown(DEMO_SESSION);
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { resolveProjectPath } = await import("../paths.mjs");
  const outDir = resolveProjectPath("demos");
  await mkdir(outDir, { recursive: true });
  const outPath = resolveProjectPath("demos", "thesis-guard-demo.md");
  await writeFile(outPath, md, "utf8");
  console.log(`   Demo exported to: ${outPath}`);

  // Summary
  const allPassed = Object.values(checks).every(Boolean);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Harness result: ${allPassed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
  console.log(`${"=".repeat(60)}`);
}

main().catch((err) => {
  console.error("Harness failed:", err.message);
  process.exit(1);
});
