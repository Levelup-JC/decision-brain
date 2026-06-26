# Plan-VIII A组 — 任务汇报

> 角色：意图路由与 ticker 抽取
> 日期：2026-06-26
> 状态：**PASS (10/10)**

---

## 1. 改动清单

**仅修改 1 个文件**：`源代码/src/chat-orchestrator.mjs`

| 编号 | 改动内容 | 行区间 |
|------|---------|--------|
| A-1 | `VALID_INTENTS` 新增 `"lookup_asset_info"` | L17 |
| A-2 | `INTENT_FANOUT` 新增 `lookup_asset_info: ["asset_info"]` | L34 |
| A-3 | `classifyIntentRule` 在 `unknown` 前插入事实查询规则（关键词 + 资产名 + 大盘排除） | L141-145 |
| A-4 | `synthesizeRule` 新增 `lookup_asset_info` case | L183-184 |
| A-5 | `classifyIntentLLM` system prompt 增加 `lookup_asset_info` 意图说明和示例 | L213 |
| A-6 | `CN_TICKER_MAP` → `TICKER_NAME_MAP`：增加英文币名（bitcoin→BTC 等） | L59-66 |
| A-7 | `extractSlotsRule`：中文名→ticker 映射改为大小写不敏感；小写正则增加 LOWER_STOPWORDS 过滤 | L80-98 |

## 2. 测试矩阵结果

| # | 输入 | 期望意图 | 期望 AssetQuery | 实际意图 | 实际 AssetQuery | 结果 |
|---|------|---------|-----------------|---------|-----------------|------|
| 1 | BTC 是什么 | lookup_asset_info | BTC | lookup_asset_info | BTC | PASS |
| 2 | btc是什么 | lookup_asset_info | BTC | lookup_asset_info | BTC | PASS |
| 3 | 介绍下以太坊 | lookup_asset_info | ETH | lookup_asset_info | ETH | PASS |
| 4 | SOL 怎么样 | lookup_asset_info | SOL | lookup_asset_info | SOL | PASS |
| 5 | ENA 的 FDV 是多少 | lookup_asset_info | ENA | lookup_asset_info | ENA | PASS |
| 6 | what is Bitcoin | lookup_asset_info | BTC | lookup_asset_info | BTC | PASS |
| 7 | ETH 市值多少 | lookup_asset_info | ETH | lookup_asset_info | ETH | PASS |
| 8 | 今天大盘怎么样 | !lookup_asset_info | — | unknown | null | PASS |
| 9 | 卖 30% | review_sell | — | review_sell | null | PASS |
| 10 | 你好 | smalltalk | — | smalltalk | null | PASS |

**硬红线验证**：大盘/卖/你好三类输入均 0 命中 `lookup_asset_info`。PASS。

## 3. 误触回归抽查

| 输入 | 期望 | 实际 | 结果 |
|------|------|------|------|
| 卖 30% BTC | review_sell | review_sell | PASS |
| 加仓 ETH | review_add | review_add | PASS |
| 帮我查一下持仓 | lookup_memory | lookup_memory | PASS |

> 注："刷新研究数据" 被 `evaluate_candidate` 的 `研究` 模式抢先匹配，此为原有问题（`研究` 在 e-commerce_candidate 规则中过于宽松），非本组改动引入，不在本组修复范围。

## 4. 已知局限

- `TICKER_NAME_MAP` 覆盖约 30 个主流币，长尾小币需靠 ticker 正则兜底
- `LOWER_STOPWORDS` 覆盖约 70 个英文常用词，极端情况下可能有漏网之词
- 英文币名匹配依赖精确子串（"bitcoin" 匹配 "Bitcoin" 但不匹配 "btc" 缩写），后者由 ticker 正则兜底

## 5. 对其他组的接口契约

- **向 B 组提供**：intent=`lookup_asset_info` + fanout=`["asset_info"]` + assetQuery=ticker
- **向 C 组提供**：分类方法标注 `method: "rule"`（规则命中时），trace 逻辑不受 A 组影响
- **向 D 组提供**：10 条意图测试矩阵可作为回归断言基准
