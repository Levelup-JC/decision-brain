import test from "node:test";
import assert from "node:assert/strict";

test("lookup asset info rejects LLM replies with untraceable dollar numbers", async () => {
  const previousApiKey = process.env.LLM_API_KEY;
  const previousRuleOnly = process.env.CHAT_RULE_ONLY;
  const previousBaseUrl = process.env.LLM_BASE_URL;
  const previousFetch = globalThis.fetch;

  process.env.LLM_API_KEY = "test-key";
  delete process.env.CHAT_RULE_ONLY;
  process.env.LLM_BASE_URL = "https://llm.test/v1";

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: "ENA 当前价格为 $0.078171，市值为 $0.7B，若回调至 $0.05 可考虑建仓。"
          }
        }
      ]
    })
  });

  try {
    const { synthesizeWithResults } = await import("../src/chat-orchestrator.mjs");
    const reply = await synthesizeWithResults(
      "lookup_asset_info",
      [
        {
          role: "asset_info",
          status: "ok",
          headline: "Ethena: 价格$0.078171 市值$0.7B FDV $0.7B",
          data: {
            symbol: "ENA",
            name: "Ethena",
            mcpOk: true,
            currentMetrics: {
              price: 0.078171,
              marketCap: 700000000,
              fdv: 700000000
            }
          }
        }
      ],
      { assetQuery: "ENA" },
      {}
    );

    assert.match(reply, /\$0\.078171/);
    assert.match(reply, /\$0\.7B/);
    assert.doesNotMatch(reply, /\$0\.05/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) {
      delete process.env.LLM_API_KEY;
    } else {
      process.env.LLM_API_KEY = previousApiKey;
    }
    if (previousRuleOnly === undefined) {
      delete process.env.CHAT_RULE_ONLY;
    } else {
      process.env.CHAT_RULE_ONLY = previousRuleOnly;
    }
    if (previousBaseUrl === undefined) {
      delete process.env.LLM_BASE_URL;
    } else {
      process.env.LLM_BASE_URL = previousBaseUrl;
    }
  }
});
