# Plan XI — H组 评委 FAQ

> **用途:** 黑客松现场 Q&A 准备，每个问题准备 30s 以内的标准回答

---

## 产品类

### Q1: 这和 ChatGPT 有什么区别？

**A:** ChatGPT 没有长期记忆，每次对话从零开始。Decision Brain 持久化你的仓位、研究、计划，每次决策都基于你的完整投资历史。而且所有数字都可追溯到数据源，不会编造。

**30s version:** Three differences: persistent portfolio memory (ChatGPT forgets), traceable data (every number has a source), and structured plans with valuation tiers (not just text advice).

---

### Q2: 它会自动交易吗？

**A:** 不会。这是设计决策。它只做研究、估值、计划、建议，不做交易执行。私钥、签名、托管这些我们完全不碰。它是交易 Agent 的"大脑"，不是"手"。

**30s version:** No. By design. It's the "brain" for trading agents — research, valuation, plans, advice. No private keys, no execution. The agent using it decides whether to trade.

---

### Q3: 数据从哪来？

**A:** 通过 market-data MCP 协议接入公开市场数据，包括交易所 OHLCV、链上数据、新闻、情绪指标等。目前默认接入 datahub.noxiaohao.com 的公开 MCP 端点，不需要 API key。

**30s version:** Public market data via MCP protocol — exchange OHLCV, on-chain, news, sentiment. Currently using a public MCP endpoint. No API key required for basic data.

---

### Q4: 它对普通人有用还是只对专业交易员有用？

**A:** 目前面向的是用 AI Agent 做投资决策的用户。但核心逻辑——先查记忆、再补研究、再做计划——对任何需要做投资决策的人都有用。Dashboard 的设计也是让非技术人员能看懂。

---

## 技术类

### Q5: 7 个 Agent 是怎么并发的？

**A:** 用 Node.js 的 Promise.allSettled 并发派发，每个 Agent 独立超时。如果一个 Agent 超时，其他正常返回的结果不受影响。不会被最慢的 Agent 拖垮。

**30s version:** Promise.allSettled with per-agent timeouts. If one agent times out, the others still contribute. No single slow agent can block the response.

---

### Q6: 怎么保证数字不是 LLM 编造的？

**A:** 数字不是 LLM 生成的。价格、市值、FDV 这些事实数据走的是规则模板路径（0-LLM 快路径），直接从 MCP 数据源提取到回复模板。LLM 只做意图分类和最终文本合成，不参与数字生成。而且每个数字都能在 trace 里找到来源。

**30s version:** Numbers come from rule-based templates pulling directly from MCP data, not from LLM generation. LLM only handles intent classification and text synthesis. Every number is traceable to its source via the trace panel.

---

### Q7: 和 Bitget 是怎么集成的？

**A:** Bitget 提供了 5 个感知 Skill（宏观分析、市场情报、新闻简报、情绪分析、技术分析），我们通过 MCP 协议映射到 Decision Brain 的 7 个 Agent。Bitget 还有 58 个交易 Tools，但我们不接入——因为我们不做交易执行。

**30s version:** We map Bitget's 5 perception Skills to our 7 committee agents via MCP protocol. We intentionally don't use Bitget's 58 trading tools — we're the brain, not the hand.

---

## 创新/竞争力类

### Q8: 这个项目的护城河是什么？

**A:** 三层。第一层是记忆层——不是聊天上下文，是持久化的仓位、研究、计划状态。第二层是流程层——不是一问一答，而是记忆→研究→估值→计划→监控的完整闭环。第三层是数据纪律——数字可追溯，不编造。这三层组合在一起，不是简单加一个 RAG 或 function call 能替代的。

---

### Q9: 和现有的交易 Bot / 跟单系统有什么区别？

**A:** 交易 Bot 做执行，跟单系统做复制。Decision Brain 做决策治理——它关注的是"为什么买、什么时候加仓、什么时候该重新评估"，而不是"怎么下单"。它是交易 Agent 的前置决策层。

---

### Q10: 未来计划？

**A:** 短期：完善研究深度（融资背景、解锁节奏、上所路径），接入更多数据源。中期：支持多 Agent 协作决策（不同策略的 Agent 共用同一个 Decision Brain）。长期：成为 Agentic Trading 的标准决策中间件。

---

## 容错/边界类

### Q11: 断网怎么办？

**A:** 诚实说不知道。所有 Agent card 变红，Chief 回复明确提示"当前无法获取实时数据"。不会编造任何数字。你可以现场看这个行为——我们演示了断网场景。

---

### Q12: 如果我输入一个不存在的币会怎样？

**A:** 系统会尝试在多个数据源查询，如果都查不到，会明确回复"未找到该资产"。不会假装认识，不会给虚假数据。

---

## 快速应答卡 (30s 以内)

| 问题 | 关键词 |
|------|--------|
| 和 ChatGPT 区别 | 长期记忆 + 可追溯 + 计划闭环 |
| 自动交易吗 | 不，只做决策不做执行 |
| 数据来源 | 公开 MCP，无 API key |
| 数字准确吗 | 规则模板，0 LLM，全部可追溯 |
| 怎么接入 Bitget | 5 个感知 Skill -> MCP -> 7 个 Agent |
| 断网呢 | 诚实说不知道，红态 |
