// B-VI-3: Sell latency test
const URL = "http://localhost:4177/api/chat";
const results = [];

const sellTests = [
  { msg: "卖 30%", ctx: { lastAsset: "BTC", lastIntent: "evaluate_candidate", recentTurns: [{ role: "user", message: "比特币怎么样", intent: "evaluate_candidate", assetQuery: "BTC" }] }, expectedAsset: "BTC" },
  { msg: "卖一半", ctx: { lastAsset: "BTC", lastIntent: "evaluate_candidate", recentTurns: [{ role: "user", message: "比特币怎么样", intent: "evaluate_candidate", assetQuery: "BTC" }] }, expectedAsset: "BTC" },
  { msg: "卖 50%", ctx: { lastAsset: "ETH", lastIntent: "evaluate_candidate", recentTurns: [{ role: "user", message: "以太坊怎么样", intent: "evaluate_candidate", assetQuery: "ETH" }] }, expectedAsset: "ETH" },
];

for (const t of sellTests) {
  console.log(`\n=== "${t.msg}" (expected: ${t.expectedAsset}) ===`);
  const start = Date.now();
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: t.msg, sessionId: "bvi-sell-latency", context: t.ctx }),
  });
  const data = await r.json();
  const ttfb = Date.now() - start;
  const pass = data.assetQuery === t.expectedAsset;
  const under8s = ttfb < 8000;
  console.log(`  assetQuery=${data.assetQuery} intent=${data.intent} ttfb=${ttfb}ms under8s=${under8s}`);
  results.push({
    test: t.msg,
    pass: pass && under8s,
    assetQuery: data.assetQuery,
    ttfb,
    under8s,
    snippet: data.reply.substring(0, 150),
  });
}

console.log("\n=== B-VI-3 Sell Latency SUMMARY ===");
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"} ${r.test} | asset=${r.assetQuery} | ttfb=${r.ttfb}ms | under 8s=${r.under8s}`);
}
