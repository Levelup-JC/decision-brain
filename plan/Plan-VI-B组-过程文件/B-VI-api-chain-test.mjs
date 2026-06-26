import { writeFileSync } from "fs";
import { join } from "path";

const URL = "http://localhost:4177/api/chat";

async function sendMsg(message, ctx) {
  const t0 = Date.now();
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId: "bvi-chain-test", context: ctx }),
  });
  const data = await r.json();
  const ttfb = Date.now() - t0;
  return { ...data, ttfb };
}

const results = [];

// Build context gradually
let ctx = { lastAsset: null, lastIntent: null, lastPrice: null, recentTurns: [] };

// E1: BTC initial
console.log("\n=== E1: 比特币怎么样 ===");
let resp = await sendMsg("比特币怎么样", ctx);
results.push({
  test: "E1 比特币怎么样",
  pass: resp.assetQuery === "BTC",
  assetQuery: resp.assetQuery,
  intent: resp.intent,
  ttfb: resp.ttfb,
  snippet: resp.reply.substring(0, 200),
});
console.log(`  assetQuery=${resp.assetQuery} intent=${resp.intent} ttfb=${resp.ttfb}ms`);

// Update context from response
ctx.lastAsset = resp.assetQuery || ctx.lastAsset;
ctx.lastIntent = resp.intent || ctx.lastIntent;
ctx.recentTurns.push({ role: "user", message: "比特币怎么样", intent: resp.intent, assetQuery: resp.assetQuery });

// E2: "它是什么" — MUST resolve to BTC
console.log("\n=== E2: 它是什么 ===");
resp = await sendMsg("它是什么", ctx);
const e2_btc = /比特币|BTC|Bitcoin/i.test(resp.reply);
const e2_stale = /未识别资产|不知道这是什么|无法识别|没有指定|请提供资产/i.test(resp.reply);
results.push({
  test: "E2 它是什么 (追问BTC)",
  pass: !e2_stale && e2_btc && resp.assetQuery === "BTC",
  assetQuery: resp.assetQuery,
  intent: resp.intent,
  ttfb: resp.ttfb,
  snippet: resp.reply.substring(0, 200),
});
console.log(`  assetQuery=${resp.assetQuery} intent=${resp.intent} hasBTC=${e2_btc} stale=${e2_stale} ttfb=${resp.ttfb}ms`);

// Update context
ctx.lastAsset = resp.assetQuery || ctx.lastAsset;
ctx.lastIntent = resp.intent || ctx.lastIntent;
ctx.recentTurns.push({ role: "user", message: "它是什么", intent: resp.intent, assetQuery: resp.assetQuery });

// E3: "能加仓吗" — MUST be about BTC
console.log("\n=== E3: 能加仓吗 ===");
resp = await sendMsg("能加仓吗", ctx);
const e3_stale = /未识别资产|不知道|无法识别|没有指定|请提供资产|Missing required field/i.test(resp.reply);
const e3_btc = /比特币|BTC|Bitcoin/i.test(resp.reply);
results.push({
  test: "E3 能加仓吗 (追问BTC)",
  pass: !e3_stale && (e3_btc || resp.assetQuery === "BTC"),
  assetQuery: resp.assetQuery,
  intent: resp.intent,
  ttfb: resp.ttfb,
  snippet: resp.reply.substring(0, 200),
});
console.log(`  assetQuery=${resp.assetQuery} intent=${resp.intent} hasBTC=${e3_btc} ttfb=${resp.ttfb}ms`);

// Update context
ctx.lastAsset = resp.assetQuery || ctx.lastAsset;
ctx.lastIntent = resp.intent || ctx.lastIntent;
ctx.recentTurns.push({ role: "user", message: "能加仓吗", intent: resp.intent, assetQuery: resp.assetQuery });

// E7: "卖一半" — MUST be about BTC
console.log("\n=== E7: 卖一半 ===");
resp = await sendMsg("卖一半", ctx);
const e7_stale = /未识别资产|不知道|无法识别|没有指定|请提供资产|Missing required field/i.test(resp.reply);
const e7_btc = /比特币|BTC|Bitcoin/i.test(resp.reply);
const e7_sell = /卖|卖出|减仓|止盈|止损|仓位|减持/i.test(resp.reply);
results.push({
  test: "E7 卖一半 (追问BTC)",
  pass: !e7_stale && (e7_btc || resp.assetQuery === "BTC") && resp.ttfb < 8000,
  assetQuery: resp.assetQuery,
  intent: resp.intent,
  ttfb: resp.ttfb,
  snippet: resp.reply.substring(0, 200),
});
console.log(`  assetQuery=${resp.assetQuery} intent=${resp.intent} hasBTC=${e7_btc} ttfb=${resp.ttfb}ms`);

// Update context
ctx.lastAsset = resp.assetQuery || ctx.lastAsset;
ctx.lastIntent = resp.intent || ctx.lastIntent;
ctx.recentTurns.push({ role: "user", message: "卖一半", intent: resp.intent, assetQuery: resp.assetQuery });

// E4: "以太坊呢" — MUST switch to ETH
console.log("\n=== E4: 以太坊呢 ===");
resp = await sendMsg("以太坊呢", ctx);
const e4_stale = /未识别资产|不知道这是什么|无法识别/i.test(resp.reply);
const e4_eth = /以太坊|ETH|Ethereum/i.test(resp.reply);
results.push({
  test: "E4 以太坊呢 (切换到ETH)",
  pass: !e4_stale && e4_eth && resp.assetQuery === "ETH",
  assetQuery: resp.assetQuery,
  intent: resp.intent,
  ttfb: resp.ttfb,
  snippet: resp.reply.substring(0, 200),
});
console.log(`  assetQuery=${resp.assetQuery} intent=${resp.intent} hasETH=${e4_eth} ttfb=${resp.ttfb}ms`);

// Update context
ctx.lastAsset = resp.assetQuery || ctx.lastAsset;
ctx.lastIntent = resp.intent || ctx.lastIntent;
ctx.recentTurns.push({ role: "user", message: "以太坊呢", intent: resp.intent, assetQuery: resp.assetQuery });

// E5: "卖 30%" — MUST be about ETH (sell+pct fast path)
console.log("\n=== E5: 卖 30% ===");
resp = await sendMsg("卖 30%", ctx);
const e5_stale = /未识别资产|不知道|无法识别|没有指定|请提供资产|Missing required field/i.test(resp.reply);
const e5_eth = /以太坊|ETH|Ethereum/i.test(resp.reply);
const e5_sell = /卖|卖出|减仓|止盈|止损|仓位|30/i.test(resp.reply);
results.push({
  test: "E5 卖 30% (追问ETH, sell+pct fast path)",
  pass: !e5_stale && (e5_eth || resp.assetQuery === "ETH") && resp.ttfb < 8000,
  assetQuery: resp.assetQuery,
  intent: resp.intent,
  ttfb: resp.ttfb,
  snippet: resp.reply.substring(0, 200),
});
console.log(`  assetQuery=${resp.assetQuery} intent=${resp.intent} hasETH=${e5_eth} ttfb=${resp.ttfb}ms`);

// SUMMARY
console.log("\n========== B-VI API Chain Test SUMMARY ==========");
let pass = 0, fail = 0;
for (const r of results) {
  const icon = r.pass ? "PASS" : "FAIL";
  console.log(`${icon} ${r.test} | assetQuery=${r.assetQuery} | intent=${r.intent} | ttfb=${r.ttfb}ms`);
  console.log(`  Reply: ${r.snippet.substring(0, 120)}...`);
  if (r.pass) pass++; else fail++;
}
console.log(`\n  ${pass} PASS / ${fail} FAIL / ${results.length} total`);

const report = {
  timestamp: new Date().toISOString(),
  url: URL,
  results,
  summary: { pass, fail, total: results.length }
};
writeFileSync(join(import.meta.dirname, "B-VI-api-chain-report.json"), JSON.stringify(report, null, 2));
