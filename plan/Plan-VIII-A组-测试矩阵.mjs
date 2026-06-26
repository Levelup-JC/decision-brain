// Plan-VIII A组 — 意图路由与ticker抽取测试矩阵
// 用法: node Plan-VIII-A组-测试矩阵.mjs
// 纯函数测试，不依赖网络/服务

import { classifyIntent } from "../源代码/src/chat-orchestrator.mjs";

const TEST_MATRIX = [
  // ── 正向：应命中 lookup_asset_info ──
  { input: "BTC 是什么",       expectIntent: "lookup_asset_info", expectAsset: "BTC",  label: "中文事实查询" },
  { input: "btc是什么",         expectIntent: "lookup_asset_info", expectAsset: "BTC",  label: "小写无空格" },
  { input: "介绍下以太坊",       expectIntent: "lookup_asset_info", expectAsset: "ETH",  label: "中文币名映射" },
  { input: "SOL 怎么样",        expectIntent: "lookup_asset_info", expectAsset: "SOL",  label: "怎么样查询" },
  { input: "ENA 的 FDV 是多少",  expectIntent: "lookup_asset_info", expectAsset: "ENA",  label: "FDV查询" },
  { input: "what is Bitcoin",   expectIntent: "lookup_asset_info", expectAsset: "BTC",  label: "英文查询" },
  { input: "ETH 市值多少",       expectIntent: "lookup_asset_info", expectAsset: "ETH",  label: "市值查询" },

  // ── 红线：必须不命中 lookup_asset_info ──
  { input: "今天大盘怎么样",     expectIntent: "!lookup_asset_info", expectAsset: null, label: "大盘防误触" },
  { input: "卖 30%",            expectIntent: "review_sell",       expectAsset: null, label: "卖出快路径" },
  { input: "你好",              expectIntent: "smalltalk",         expectAsset: null, label: "问候语" },
];

let pass = 0;
let fail = 0;

for (const tc of TEST_MATRIX) {
  const { intent, slots } = classifyIntent(tc.input, {});
  const assetOk = tc.expectAsset === null || slots.assetQuery === tc.expectAsset;

  let intentOk;
  if (tc.expectIntent.startsWith("!")) {
    intentOk = intent !== tc.expectIntent.slice(1);
  } else {
    intentOk = intent === tc.expectIntent;
  }

  const ok = intentOk && assetOk;
  const mark = ok ? "PASS" : "FAIL";

  if (ok) pass++; else fail++;

  console.log(`[${mark}] ${tc.label}`);
  console.log(`       输入: "${tc.input}"`);
  console.log(`       期望: intent=${tc.expectIntent}, assetQuery=${tc.expectAsset ?? "(any/null)"}`);
  console.log(`       实际: intent=${intent}, assetQuery=${slots.assetQuery ?? "null"}`);
  if (!ok) {
    if (!intentOk) console.log(`       >>> intent 不匹配!`);
    if (!assetOk) console.log(`       >>> assetQuery 不匹配! 期望=${tc.expectAsset}, 实际=${slots.assetQuery}`);
  }
  console.log("");
}

console.log("=".repeat(50));
console.log(`结果: ${pass}/${TEST_MATRIX.length} PASS, ${fail} FAIL`);
console.log(pass === TEST_MATRIX.length ? "✅ 全部通过" : "❌ 存在失败用例");

// 额外: 误触回归 — 确认常见交易指令未被截胡
console.log("");
console.log("── 误触回归（快速抽查）──");
const REGRESSION = [
  ["卖 30% BTC", "review_sell"],
  ["加仓 ETH", "review_add"],
  ["刷新研究数据", "refresh_research"],
  ["帮我查一下持仓", "lookup_memory"],
];
for (const [msg, expected] of REGRESSION) {
  const { intent } = classifyIntent(msg, {});
  const ok = intent === expected;
  console.log(`  [${ok ? "PASS" : "FAIL"}] "${msg}" → ${intent}${ok ? "" : ` (期望 ${expected})`}`);
}

process.exit(fail > 0 ? 1 : 0);
