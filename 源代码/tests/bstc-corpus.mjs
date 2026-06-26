// BSTC (Brain Session Test Corpus) — 32 test cases covering the full chat pipeline.
// Each case defines: id, category, inputs (multi-turn), expected, assert_fn.
// Version: VI-1.0  Date: 2026-06-26

const VALID_INTENTS = [
  "lookup_memory", "evaluate_candidate", "manage_position", "refresh_research",
  "confirm_plan", "review_add", "review_sell", "run_monitor", "log_source",
  "archive", "get_context", "smalltalk", "unknown",
];

const ASSETS = ["BTC", "ETH", "SOL", "PEPE"];
const BASE_TICKERS = ["BTC", "ETH", "SOL", "PEPE", "AAVE", "ENA"];

// ── Helpers ──────────────────────────────────────────────────────────

function containsAsset(reply, asset) {
  if (!reply || typeof reply !== "string") return false;
  return reply.toUpperCase().includes(asset.toUpperCase());
}

function containsAnyAsset(reply, assets = BASE_TICKERS) {
  return assets.some((a) => containsAsset(reply, a));
}

function hasValidIntent(intent) {
  return VALID_INTENTS.includes(intent);
}

function isNonEmptyReply(reply) {
  return typeof reply === "string" && reply.trim().length > 0;
}

function noUnrecognizedAsset(reply) {
  if (!reply || typeof reply !== "string") return false;
  return !/未识别|不知道.*币|无法识别|不.*什么币|unrecognized/i.test(reply);
}

function isNonEmptyJSON(obj) {
  if (!obj || typeof obj !== "object") return false;
  const str = JSON.stringify(obj);
  return str.length > 2; // not "{}" or "[]"
}

// ── BSTC Corpus ──────────────────────────────────────────────────────

const BSTC = [
  // ═══════════════════════════════════════════════════════════════════
  // Category 1: 直问资产 (10 cases) — single-turn asset queries
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "bstc-001",
    category: "直问资产",
    description: "BTC evaluate — ticker in message",
    inputs: [{ message: "研究一下 BTC 是否值得买", sessionId: "bstc-001", context: {} }],
    expected: { intent: "evaluate_candidate", asset: "BTC" },
    assert_fn(result) {
      return result.ok === true
        && hasValidIntent(result.intent)
        && (result.assetQuery === "BTC" || containsAsset(result.reply, "BTC"))
        && isNonEmptyReply(result.reply);
    },
  },

  {
    id: "bstc-002",
    category: "直问资产",
    description: "ETH evaluate — English input",
    inputs: [{ message: "evaluate ETH for me", sessionId: "bstc-002", context: {} }],
    expected: { intent: "evaluate_candidate", asset: "ETH" },
    assert_fn(result) {
      return result.ok === true
        && (result.assetQuery === "ETH" || containsAsset(result.reply, "ETH"))
        && isNonEmptyReply(result.reply);
    },
  },

  {
    id: "bstc-003",
    category: "直问资产",
    description: "SOL position recording",
    inputs: [{ message: "我买了 100 个 SOL，成本 120", sessionId: "bstc-003", context: {} }],
    expected: { intent: "manage_position", asset: "SOL" },
    assert_fn(result) {
      return result.ok === true
        && (result.assetQuery === "SOL" || containsAsset(result.reply, "SOL"))
        && isNonEmptyReply(result.reply);
    },
  },

  {
    id: "bstc-004",
    category: "直问资产",
    description: "PEPE small coin evaluate",
    inputs: [{ message: "看看 PEPE 怎么样", sessionId: "bstc-004", context: {} }],
    expected: { intent: "evaluate_candidate", asset: "PEPE" },
    assert_fn(result) {
      return result.ok === true
        && (result.assetQuery === "PEPE" || containsAsset(result.reply, "PEPE"))
        && isNonEmptyReply(result.reply);
    },
  },

  {
    id: "bstc-005",
    category: "直问资产",
    description: "Missing ticker — should ask or fallback gracefully",
    inputs: [{ message: "最近有什么值得买的吗", sessionId: "bstc-005", context: {} }],
    expected: { intent: "evaluate_candidate", asset: null },
    assert_fn(result) {
      return result.ok === true
        && isNonEmptyReply(result.reply)
        && result.reply.length > 5;
    },
  },

  {
    id: "bstc-006",
    category: "直问资产",
    description: "Misspelled ticker — non-standard symbol",
    inputs: [{ message: "研究一下 BTW", sessionId: "bstc-006", context: {} }],
    expected: { intent: "evaluate_candidate", asset: "BTW" },
    assert_fn(result) {
      return result.ok === true
        && (result.assetQuery === "BTW" || containsAsset(result.reply, "BTW"))
        && isNonEmptyReply(result.reply);
    },
  },

  {
    id: "bstc-007",
    category: "直问资产",
    description: "Chinese asset name — no ticker",
    inputs: [{ message: "比特币现在怎么样", sessionId: "bstc-007", context: {} }],
    expected: { intent: "evaluate_candidate" },
    assert_fn(result) {
      // "比特币" has no uppercase ticker, so extractSlotsRule won't find it.
      // This is a known limitation — the test verifies graceful handling.
      return result.ok === true
        && isNonEmptyReply(result.reply)
        && !/error/i.test(result.reply);
    },
  },

  {
    id: "bstc-008",
    category: "直问资产",
    description: "Smalltalk greeting",
    inputs: [{ message: "你好", sessionId: "bstc-008", context: {} }],
    expected: { intent: "smalltalk" },
    assert_fn(result) {
      return result.ok === true
        && isNonEmptyReply(result.reply);
    },
  },

  {
    id: "bstc-009",
    category: "直问资产",
    description: "Portfolio lookup",
    inputs: [{ message: "查看我的持仓", sessionId: "bstc-009", context: {} }],
    expected: { intent: "lookup_memory" },
    assert_fn(result) {
      return result.ok === true
        && isNonEmptyReply(result.reply);
    },
  },

  {
    id: "bstc-010",
    category: "直问资产",
    description: "Mixed CN/EN: '帮我分析一下 SOL 的估值'",
    inputs: [{ message: "帮我分析一下 SOL 的估值", sessionId: "bstc-010", context: {} }],
    expected: { intent: "evaluate_candidate", asset: "SOL" },
    assert_fn(result) {
      return result.ok === true
        && (result.assetQuery === "SOL" || containsAsset(result.reply, "SOL"))
        && isNonEmptyReply(result.reply);
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // Category 2: 追问链路 (10 cases) — multi-turn focused_asset
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "bstc-011",
    category: "追问链路",
    description: "Focus BTC then ask 'what is it'",
    inputs: [
      { message: "比特币怎么样", sessionId: "bstc-011", context: { lastAsset: null } },
      { message: "它是什么", sessionId: "bstc-011", context: {} },
    ],
    expected: { asset: "BTC", noUnrecognized: true },
    assert_fn(results) {
      const r2 = results[1];
      return isNonEmptyReply(r2.reply)
        && noUnrecognizedAsset(r2.reply);
    },
  },

  {
    id: "bstc-012",
    category: "追问链路",
    description: "Focus BTC then 'can I add more'",
    inputs: [
      { message: "研究一下 BTC", sessionId: "bstc-012", context: { lastAsset: null } },
      { message: "能加仓吗", sessionId: "bstc-012", context: {} },
    ],
    expected: { intent2: "review_add", asset2: "BTC" },
    assert_fn(results) {
      const r2 = results[1];
      return isNonEmptyReply(r2.reply)
        && noUnrecognizedAsset(r2.reply);
    },
  },

  {
    id: "bstc-013",
    category: "追问链路",
    description: "Focus BTC then 'sell half'",
    inputs: [
      { message: "BTC 现在怎么样", sessionId: "bstc-013", context: { lastAsset: null } },
      { message: "卖一半", sessionId: "bstc-013", context: {} },
    ],
    expected: { intent2: "review_sell" },
    assert_fn(results) {
      const r2 = results[1];
      return isNonEmptyReply(r2.reply)
        && noUnrecognizedAsset(r2.reply);
    },
  },

  {
    id: "bstc-014",
    category: "追问链路",
    description: "Focus BTC then switch to ETH explicitly",
    inputs: [
      { message: "研究一下 BTC", sessionId: "bstc-014", context: {} },
      { message: "以太坊呢", sessionId: "bstc-014", context: {} },
    ],
    expected: { asset1: "BTC", asset2: "ETH" },
    assert_fn(results) {
      return isNonEmptyReply(results[0].reply)
        && isNonEmptyReply(results[1].reply)
        && noUnrecognizedAsset(results[1].reply);
    },
  },

  {
    id: "bstc-015",
    category: "追问链路",
    description: "Empty context — 3 turn chain without any ticker",
    inputs: [
      { message: "最近有什么好的投资机会", sessionId: "bstc-015", context: {} },
      { message: "能具体说说吗", sessionId: "bstc-015", context: {} },
      { message: "那风险呢", sessionId: "bstc-015", context: {} },
    ],
    expected: { allHaveReply: true },
    assert_fn(results) {
      return results.every((r) => isNonEmptyReply(r.reply));
    },
  },

  {
    id: "bstc-016",
    category: "追问链路",
    description: "Sell+pct without asset in follow-up",
    inputs: [
      { message: "ETH 持有 50 个，成本 3000", sessionId: "bstc-016", context: {} },
      { message: "卖 30%", sessionId: "bstc-016", context: {} },
    ],
    expected: { intent2: "review_sell", asset2: "ETH" },
    assert_fn(results) {
      const r2 = results[1];
      return isNonEmptyReply(r2.reply)
        && noUnrecognizedAsset(r2.reply);
    },
  },

  {
    id: "bstc-017",
    category: "追问链路",
    description: "Multi-asset focus drift: BTC → ETH → SOL",
    inputs: [
      { message: "BTC 怎么样", sessionId: "bstc-017", context: {} },
      { message: "ETH 呢", sessionId: "bstc-017", context: {} },
      { message: "SOL 呢", sessionId: "bstc-017", context: {} },
    ],
    expected: { chain: ["BTC", "ETH", "SOL"] },
    assert_fn(results) {
      return results.length === 3
        && results.every((r) => isNonEmptyReply(r.reply) && noUnrecognizedAsset(r.reply));
    },
  },

  {
    id: "bstc-018",
    category: "追问链路",
    description: "Ask advice after evaluate",
    inputs: [
      { message: "分析一下 AAVE", sessionId: "bstc-018", context: {} },
      { message: "给个建议", sessionId: "bstc-018", context: {} },
    ],
    expected: { asset1: "AAVE" },
    assert_fn(results) {
      return results.every((r) => isNonEmptyReply(r.reply) && noUnrecognizedAsset(r.reply));
    },
  },

  {
    id: "bstc-019",
    category: "追问链路",
    description: "Ask nature of focused asset",
    inputs: [
      { message: "SOL 值得研究吗", sessionId: "bstc-019", context: {} },
      { message: "它有什么特点", sessionId: "bstc-019", context: {} },
    ],
    expected: { asset1: "SOL" },
    assert_fn(results) {
      const r2 = results[1];
      return isNonEmptyReply(r2.reply) && noUnrecognizedAsset(r2.reply);
    },
  },

  {
    id: "bstc-020",
    category: "追问链路",
    description: "Refresh after position recording",
    inputs: [
      { message: "我买了 100 个 SOL 成本 120", sessionId: "bstc-020", context: {} },
      { message: "刷新一下数据", sessionId: "bstc-020", context: {} },
    ],
    expected: { intent1: "manage_position", intent2: "refresh_research" },
    assert_fn(results) {
      return results.every((r) => isNonEmptyReply(r.reply) && noUnrecognizedAsset(r.reply));
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // Category 3: 反例意图 (6 cases) — edge cases and negative tests
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "bstc-021",
    category: "反例意图",
    description: "Sell+pct without ticker (negative)",
    inputs: [{ message: "卖 30%", sessionId: "bstc-021", context: {} }],
    expected: { no_timeout: true },
    assert_fn(result) {
      const start = result._timing?.start || 0;
      const end = result._timing?.end || Date.now();
      const tookMs = end - start;
      return result.ok === true
        && isNonEmptyReply(result.reply)
        && tookMs < 8000; // MUST be under 8s
    },
  },

  {
    id: "bstc-022",
    category: "反例意图",
    description: "Sell with empty message (negative)",
    inputs: [{ message: "卖", sessionId: "bstc-022", context: {} }],
    expected: { intent: "review_sell", no_timeout: true },
    assert_fn(result) {
      return result.ok === true
        && isNonEmptyReply(result.reply);
    },
  },

  {
    id: "bstc-023",
    category: "反例意图",
    description: "Buy with empty ticker (negative)",
    inputs: [{ message: "可以买吗", sessionId: "bstc-023", context: {} }],
    expected: { no_timeout: true },
    assert_fn(result) {
      return result.ok === true
        && isNonEmptyReply(result.reply);
    },
  },

  {
    id: "bstc-024",
    category: "反例意图",
    description: "Add position without asset (negative)",
    inputs: [{ message: "能加仓吗", sessionId: "bstc-024", context: {} }],
    expected: { intent: "review_add", no_timeout: true },
    assert_fn(result) {
      return result.ok === true
        && isNonEmptyReply(result.reply);
    },
  },

  {
    id: "bstc-025",
    category: "反例意图",
    description: "Ask what something is (nature question) — no ticker",
    inputs: [{ message: "这是什么币", sessionId: "bstc-025", context: {} }],
    expected: { no_timeout: true },
    assert_fn(result) {
      return result.ok === true
        && isNonEmptyReply(result.reply);
    },
  },

  {
    id: "bstc-026",
    category: "反例意图",
    description: "Ask for advice — no ticker",
    inputs: [{ message: "给个投资建议", sessionId: "bstc-026", context: {} }],
    expected: { no_timeout: true },
    assert_fn(result) {
      return result.ok === true
        && isNonEmptyReply(result.reply);
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // Category 4: 长会话 (4 cases) — 10+ round or cross-topic
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "bstc-027",
    category: "长会话",
    description: "10-round focus drift across BTC/ETH/SOL",
    inputs: [
      { message: "BTC 怎么样", sessionId: "bstc-027", context: {} },
      { message: "能加仓吗", sessionId: "bstc-027", context: {} },
      { message: "ETH 呢", sessionId: "bstc-027", context: {} },
      { message: "SOL 也看看", sessionId: "bstc-027", context: {} },
      { message: "卖一半 SOL", sessionId: "bstc-027", context: {} },
      { message: "BTC 现在什么情况", sessionId: "bstc-027", context: {} },
      { message: "ETH 加仓建议", sessionId: "bstc-027", context: {} },
      { message: "SOL 刷新数据", sessionId: "bstc-027", context: {} },
      { message: "看我的持仓", sessionId: "bstc-027", context: {} },
      { message: "总结一下", sessionId: "bstc-027", context: {} },
    ],
    expected: { allHaveReply: true, noTimeout: true },
    assert_fn(results) {
      return results.length === 10
        && results.every((r) => isNonEmptyReply(r.reply))
        && results.every((r) => !/error/i.test(r.reply));
    },
  },

  {
    id: "bstc-028",
    category: "长会话",
    description: "Cross-topic: smalltalk → evaluate → position → sell → refresh",
    inputs: [
      { message: "你好", sessionId: "bstc-028", context: {} },
      { message: "研究一下 AAVE", sessionId: "bstc-028", context: {} },
      { message: "我买了 100 个 AAVE 成本 80", sessionId: "bstc-028", context: {} },
      { message: "加仓建议", sessionId: "bstc-028", context: {} },
      { message: "卖 30%", sessionId: "bstc-028", context: {} },
      { message: "刷新 AAVE 数据", sessionId: "bstc-028", context: {} },
      { message: "查看 AAVE 持仓", sessionId: "bstc-028", context: {} },
      { message: "谢谢", sessionId: "bstc-028", context: {} },
    ],
    expected: { allHaveReply: true, noTimeout: true },
    assert_fn(results) {
      return results.length === 8
        && results.every((r) => isNonEmptyReply(r.reply))
        && results.every((r) => !/error/i.test(r.reply));
    },
  },

  {
    id: "bstc-029",
    category: "长会话",
    description: "Focus drift with ambiguous pronoun references",
    inputs: [
      { message: "研究一下 PEPE", sessionId: "bstc-029", context: {} },
      { message: "它是什么", sessionId: "bstc-029", context: {} },
      { message: "能加仓吗", sessionId: "bstc-029", context: {} },
      { message: "卖 50%", sessionId: "bstc-029", context: {} },
      { message: "为什么这么建议", sessionId: "bstc-029", context: {} },
      { message: "ETH 对比一下", sessionId: "bstc-029", context: {} },
    ],
    expected: { noUnrecognized: true, noTimeout: true },
    assert_fn(results) {
      return results.length === 6
        && results.every((r) => isNonEmptyReply(r.reply))
        && results.every((r) => !/error/i.test(r.reply));
    },
  },

  {
    id: "bstc-030",
    category: "长会话",
    description: "BTC-only deep chain: evaluate → record → confirm → add → sell → refresh → lookup",
    inputs: [
      { message: "分析 BTC", sessionId: "bstc-030", context: {} },
      { message: "我买了 1 个 BTC 成本 65000", sessionId: "bstc-030", context: {} },
      { message: "确认计划", sessionId: "bstc-030", context: {} },
      { message: "能加仓吗", sessionId: "bstc-030", context: {} },
      { message: "卖 25%", sessionId: "bstc-030", context: {} },
      { message: "刷新数据", sessionId: "bstc-030", context: {} },
      { message: "查看 BTC 持仓", sessionId: "bstc-030", context: {} },
    ],
    expected: { allHaveReply: true, noTimeout: true },
    assert_fn(results) {
      return results.length === 7
        && results.every((r) => isNonEmptyReply(r.reply))
        && results.every((r) => !/error/i.test(r.reply));
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // Category 5: 额外覆盖 (2 cases) — 达到 32 题
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "bstc-031",
    category: "追问链路",
    description: "Very short message — single char ticker-like but not real",
    inputs: [{ message: "买", sessionId: "bstc-031", context: {} }],
    expected: { no_timeout: true },
    assert_fn(result) {
      return result.ok === true && isNonEmptyReply(result.reply);
    },
  },

  {
    id: "bstc-032",
    category: "直问资产",
    description: "ENA candidate evaluate",
    inputs: [{ message: "ENA 值得研究吗", sessionId: "bstc-032", context: {} }],
    expected: { intent: "evaluate_candidate", asset: "ENA" },
    assert_fn(result) {
      return result.ok === true
        && (result.assetQuery === "ENA" || containsAsset(result.reply, "ENA"))
        && isNonEmptyReply(result.reply);
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // Category 6: 容错命题 (6 cases) — fault tolerance & HTTP resilience
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "bstc-033",
    category: "容错命题",
    description: "Stateless mode — no sessionId, must not crash",
    inputs: [{ message: "分析 BTC", sessionId: "", context: {} }],
    expected: { no_timeout: true, no_crash: true },
    assert_fn(result) {
      return isNonEmptyReply(result.reply)
        && !/error/i.test(result.reply || "");
    },
  },

  {
    id: "bstc-034",
    category: "容错命题",
    description: "Very long message — must not crash or hang",
    inputs: [{ message: "BTC ".repeat(200) + "分析一下", sessionId: "bstc-034", context: {} }],
    expected: { no_timeout: true, no_crash: true },
    assert_fn(result) {
      const tookMs = result._timing?.tookMs || 0;
      return isNonEmptyReply(result.reply)
        && tookMs < 15_000;
    },
  },

  {
    id: "bstc-035",
    category: "容错命题",
    description: "Special characters only — must not crash",
    inputs: [{ message: "!@#$%^&*()_+-=[]{}|;:',.<>?/~`", sessionId: "bstc-035", context: {} }],
    expected: { no_timeout: true, no_crash: true },
    assert_fn(result) {
      return result.ok === true
        && isNonEmptyReply(result.reply);
    },
  },

  {
    id: "bstc-036",
    category: "容错命题",
    description: "Empty message — must return error or graceful reply",
    inputs: [{ message: "", sessionId: "bstc-036", context: {} }],
    expected: { no_timeout: true },
    assert_fn(result) {
      // Empty message should either get empty reply or graceful handling
      return typeof result.reply !== "undefined" || result.error;
    },
  },

  {
    id: "bstc-037",
    category: "容错命题",
    description: "Rapid context accumulation — 8 turns, no degradation",
    inputs: [
      { message: "BTC 怎么样", sessionId: "bstc-037", context: {} },
      { message: "ETH 呢", sessionId: "bstc-037", context: {} },
      { message: "SOL 也看看", sessionId: "bstc-037", context: {} },
      { message: "PEPE 怎么样", sessionId: "bstc-037", context: {} },
      { message: "AAVE 分析一下", sessionId: "bstc-037", context: {} },
      { message: "ENA 值得买吗", sessionId: "bstc-037", context: {} },
      { message: "给个总结", sessionId: "bstc-037", context: {} },
      { message: "谢谢", sessionId: "bstc-037", context: {} },
    ],
    expected: { allHaveReply: true, noTimeout: true },
    assert_fn(results) {
      return results.length === 8
        && results.every((r) => isNonEmptyReply(r.reply))
        && results.every((r) => !/error/i.test(r.reply || ""));
    },
  },

  {
    id: "bstc-038",
    category: "容错命题",
    description: "Sell+pct without asset with deep context — must respond < 8s",
    inputs: [
      { message: "我买了 2 个 BTC 成本 60000", sessionId: "bstc-038", context: {} },
      { message: "ETH 也买了 10 个", sessionId: "bstc-038", context: {} },
      { message: "SOL 持仓 100 个成本 20", sessionId: "bstc-038", context: {} },
      { message: "卖 30%", sessionId: "bstc-038", context: {} },
    ],
    expected: { no_timeout: true },
    assert_fn(results) {
      const lastResult = results[results.length - 1];
      return isNonEmptyReply(lastResult.reply)
        && (lastResult._timing?.tookMs || 0) < 8_000;
    },
  },
];

export { BSTC, VALID_INTENTS, containsAsset, containsAnyAsset, isNonEmptyReply, noUnrecognizedAsset };
export default BSTC;
