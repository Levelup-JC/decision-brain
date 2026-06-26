// B-VI-2: Multi-asset coverage test (BTC, ETH, SOL)
const URL = "http://localhost:4177/api/chat";
const results = [];

for (const asset of ["BTC", "ETH", "SOL"]) {
  const labels = { BTC: "比特币", ETH: "以太坊", SOL: "Solana" };
  const tickers = { BTC: /比特币|BTC|Bitcoin/i, ETH: /以太坊|ETH|Ethereum/i, SOL: /SOL|Solana/i };
  
  console.log(`\n=== ${labels[asset]} 怎么样 ===`);
  const t0 = Date.now();
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `${labels[asset]}怎么样`,
      sessionId: `bvi-multi-${asset}`,
      context: { lastAsset: null, lastIntent: null, lastPrice: null, recentTurns: [] }
    }),
  });
  const data = await r.json();
  const ttfb = Date.now() - t0;
  const hasAsset = tickers[asset].test(data.reply);
  console.log(`  assetQuery=${data.assetQuery} intent=${data.intent} hasAsset=${hasAsset} ttfb=${ttfb}ms`);
  results.push({
    test: `${labels[asset]}独立评估`,
    pass: hasAsset && data.assetQuery === asset,
    assetQuery: data.assetQuery,
    ttfb,
    snippet: data.reply.substring(0, 150),
  });
}

console.log("\n=== B-VI-2 Multi-Asset SUMMARY ===");
let pass = 0;
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"} ${r.test}`);
  if (r.pass) pass++;
}
console.log(`  ${pass}/${results.length} PASS`);
