import test from "node:test";
import assert from "node:assert/strict";

import { parseCryptoMarket, parseDexMarket } from "../src/adapters/market-data-parse.mjs";

test("parseCryptoMarket extracts identity and market metrics from structured search result", () => {
  const sample = {
    coins: [
      {
        id: "bitway",
        symbol: "BTW",
        name: "Bitway",
        market_cap_rank: 179,
        current_price: 0.091,
        market_cap: 91000000,
        fully_diluted_valuation: 120000000,
        tickers: [
          { market: { name: "Bitget" } },
          { market: { name: "MEXC" } },
        ],
      },
    ],
  };

  const parsed = parseCryptoMarket(sample, { query: "BTW" });

  assert.equal(parsed.name, "Bitway");
  assert.equal(parsed.symbol, "BTW");
  assert.equal(parsed.rank, 179);
  assert.equal(parsed.price, 0.091);
  assert.equal(parsed.marketCap, 91000000);
  assert.equal(parsed.fdv, 120000000);
  assert.deepEqual(parsed.listedExchanges, ["Bitget", "MEXC"]);
});

test("parseDexMarket extracts chain, address, price, liquidity, and volume from dex pair data", () => {
  const sample = {
    pairs: [
      {
        chainId: "bsc",
        dexId: "uniswap-v3",
        priceUsd: "0.091",
        liquidity: { usd: 245000 },
        volume: { h24: 125000 },
        baseToken: {
          symbol: "BTW",
          name: "Bitway",
          address: "0x1234567890abcdef1234567890abcdef12345678",
        },
      },
    ],
  };

  const parsed = parseDexMarket(sample, { query: "BTW" });

  assert.equal(parsed.chain, "bsc");
  assert.equal(parsed.contractAddress, "0x1234567890abcdef1234567890abcdef12345678");
  assert.equal(parsed.price, 0.091);
  assert.equal(parsed.liquidityUsd, 245000);
  assert.equal(parsed.volume24h, 125000);
  assert.equal(parsed.dex, "uniswap-v3");
});
