---
cssclasses:
  - project-note
project: Decision Brain
track: Bitget AI Hackathon S1 — Trading Agent
status: 方案确定，待实施
author: Claude Opus 4.8
created: 2026-06-17
deadline: 2026-06-25
tags: [Bitget, Hackathon, DecisionBrain, MCP, TradingAgent]
---

# Decision Brain 参赛方案：让 evaluate_candidate 默认吃真实市场数据

> 本文档为 **Bitget AI Hackathon S1（Trading Agent 赛道）** 参赛项目 Decision Brain 的实施方案。
> 由 Claude Opus 4.8 整理 · 2026-06-17 · 提交截止 2026-06-25

## 关联笔记
- [[Bitget AI Base Camp Hackathon S1]] — 黑客松完整信息
- [[Bitget Market-Data MCP 使用指南]] — 5 个感知 Skill 的底层数据源（2026-06-15 实测）
- [[Upgrade Lab Bitget AI Hackathon Entry]] — 早期"AI 投资委员会框架"构想（已放弃，本项目为准）

---

## 一、为什么做这件事（Context）

Decision Brain 是参加 Bitget AI Hackathon S1（Trading Agent 赛道，提交截止 2026-06-25）的正式项目。评审 60% 看技术实现+产品完成度，20% 看真实调用量，基线要求是"Demo 真实可运行、有可验证使用证据"。

项目的记忆层、流程层、建议层已搭好且 `npm test` 29/29 通过，但有一个致命断层：

**主入口 `evaluate_candidate` 实际上全程跑 mock 数据，从不拉真实市场数据。**

### 根因（已读码确认）
- `evaluateCandidateState` (candidate-service.mjs:142) → `buildResearchReport` (research-service.mjs:123) 无条件注入两条 mock 源（`bitget_skill_mock` :157、`surf_mock` :163），并用硬编码 `mockProfiles`（仅 SOL/ENA/ZORA）或 `buildFallbackProfile`。
- 真实数据只在单独调用 `refresh_research` 时才进 source ledger，且 `bitget-adapter.refreshResearch` 的 `defaultCalls` (bitget-adapter.mjs:15-62) **全是大盘宏观调用**（BTC/USDT、F&G、CPI），从不针对被评估的那个具体资产调 `crypto_market(search)` / `dex_market`。
- 因此 `BTW` 这类 token 在 `asset-service.inferAssetType` (asset-service.mjs:59) 被正则 `/^[A-Z]{1,5}$/` 直接判成 `unclassified_asset`，研究永远 `blocked`，建议被收紧。

### 好消息（obsidian 2026-06-15 实测文档确认）
market-data MCP（`https://datahub.noxiaohao.com/mcp`，19 个工具，**公开、无需 API Key**）已在线，`bitget-adapter` 已通过可用的 `HttpMcpClient` 连上。实测真实返回：F&G=20、BTC=$66,611，且 BTW 经 `crypto_market(search)`→bitway #179 → `dex_market(search, chain:bsc)`→BSC Uniswap V3 $0.091。

**结论：每资产的身份/价格/链/市值是可获取的，只差接进主流程。** PROJECT_STATUS 里写的"Bitget 没接上"其实是 6-14 到 6-15 之间的时间差误会。

### 范围决策（已与用户确认）
1. decision-brain 是正式参赛项目（不是早期"AI 投资委员会框架"那份旧构想）。
2. 核心目标：**能跑通的端到端 Demo**（提资产→查仓→意图→真实研究→memo/playbook→建议）。
3. Surf adapter（mock）用 market-data MCP 真数据替代价格/市值/链/新闻/情绪。
4. **诚实原则**：MCP 给不了的字段（融资轮次、解锁表、why_buy thesis、对标估值这类主观判断）一律标 `"待补充"`/missing，**绝不假造**。这恰好契合评审"真实可运行"基线。

---

## 二、实现方案（最小但完整）

### 核心原则
- `evaluate_candidate` 调用链内联做两步真实 MCP 拉取：**身份解析** + **资产数据增强**，把结果作为数据向下传递。
- 保持 `buildResearchReport` / `evaluateCandidateState` 内部可同步、可离线测试——真实数据从参数注入，而非在内部发网络请求。
- 测试通过 offline 开关跳过网络，保持 29/29 绿。

### 1. MCP 文本解析器（纯函数，离线可测）
新建 **`src/adapters/market-data-parse.mjs`**（无网络、纯同步）：
- `parseCryptoMarket(text)` → `{ name, rank, price, marketCap, fdv, listedExchanges }`
- `parseDexMarket(text)` → `{ chain, contractAddress, price, liquidityUsd, volume24h }`
- 实现：`try JSON.parse(text) catch → 正则兜底`（`HttpMcpClient.callTool` 返回 `{raw,text}`，text 通常是 stringified JSON，见 http-mcp-client.mjs:123）。
- 为它单独写一个离线单测（喂固定 BTW 样本字符串），增加测试数但不依赖网络。

### 2. bitget-adapter 增加两个按资产的方法
在 `src/adapters/bitget-adapter.mjs` 新增：
- `resolveSymbol(symbol)`：跑 `crypto_market(action:"search",query)`，命中后按需跑 `dex_market(action:"search",query,chain)`，用解析器返回 `{name,chain,contractAddress,assetType,marketCap,price,rank}`。
- `enrichAsset(asset)`：跑 `crypto_market(price)` + `dex_market(token/search)`，返回 `{ currentMetrics:{marketCap,fdv,price}, liquidityNote, listedExchanges, sources:[{sourceType:"market_data_mcp",...}] }`。
- 这两个方法**只调按资产的工具**，不重跑 5 个宏观 skill（避免慢+限流）。

### 3. 异步身份解析（不改坏现有同步调用）
`resolveAssetFromQuery` (asset-service.mjs:80) 是同步的，被 confirmPlan/logSource/archiveAsset 等 5 处使用——**不要改成 async**。改为**新增**：
- `resolveAssetIdentity(assetQuery, existingAssets, adapters)`（async）：先调同步 `resolveAssetFromQuery` 拿基础记录；若 `assetType==="unclassified_asset"` 且未增强，调 `adapters.bitget.resolveSymbol`，把 `name/chain/contractAddress/assetType/marketCap/price` 合并上去。assetType 映射：有 CEX 上所→`cex_alt`，仅链上/DEX→`onchain_token`，头部排名→`major_crypto`。
- 调用位置放在 **`api-service.mjs`**（`evaluateCandidate` ~:234、`managePosition` ~:246 已在 `store.update(async…)` 内且已 `await lookupPortfolioMemory`），在 lookup 之后、`evaluateCandidateState` 之前插入 `asset = await resolveAssetIdentity(...)`。保持 candidate-service 同步可测。

### 4. 研究路径改线（采用内联增强，方案 a）
- `api-service` 在 evaluate 时调 `enrichment = await adapters.bitget.enrichAsset(asset)`，传给 `evaluateCandidateState({..., enrichment})`。
- `evaluateCandidateState` (candidate-service.mjs:140) 参数增加可选 `enrichment`，转发给 `buildResearchReport`。
- `buildResearchReport(asset, existingReport, enrichment)` (research-service.mjs:123)：当 `enrichment` 存在时，用**真实** `currentMetrics`、`liquidityNote`（来自 dex 流动性/成交量）、`listedExchanges`（来自 crypto_market tickers），并把 :154-168 那两条 mock 源替换为真实 `market_data_mcp` 源；`mockProfiles` 仅在无增强时兜底；`funding`/解锁/thesis 等主观字段保持 `"待补充"`，不假造。
- 真实 `currentMetrics.marketCap/fdv` 自然流入 `buildValuationModel`(:194)、`buildInvestmentMemo`(:90)、`managePosition` 仓位字段、`recommendation-service` 估值分区——下游已读 `researchReport.currentMetrics`，无需大改。

### 5. 保持 29 测试绿（offline 注入）
`getAdapters()` (index.mjs:4) 无参，被 research-service:124,176 与 api-service:349 调用。
- 改为 `getAdapters({ offline } = {})`；当 `offline` 或 `process.env.DECISION_BRAIN_OFFLINE` 时，返回 bitget 桩：`enrichAsset/resolveSymbol/ensureConnected` 同步返回 `{connected:false}`/`null`，不实例化 `HttpMcpClient`。
- 在 test/decision-brain.test.mjs 的 `withTempState` (:28) 里设 `process.env.DECISION_BRAIN_OFFLINE="1"`（在已有 `after` 清理）。这样增强被跳过，`buildResearchReport` 走原 mock 路径，断言不变。
- 已容忍 `not_configured`/`not_connected` 的测试（:348 BTW fallback、:382 refresh、:403/:412）被 offline 桩满足。

### 会破坏的点（已规避）
- (i) 把 `resolveAssetFromQuery` 改 async 会破坏 confirmPlan:445/logSource:617/archiveAsset:658 → 用独立 async 新函数规避。
- (ii) `evaluate candidate asks for confirmation` 测试(:223) 期望 AAVE→`blocked`；若增强翻转 readiness 会破。→ offline 在测试里禁用增强，保持 blocked。
- (iii) `assetIdentityReady` (research-context-service.mjs:171) 以 `unclassified_asset`+无 chain 为 blocked 依据；真实解析会设 chain 翻转它——Demo 想要的效果，测试里被 offline 中和。

---

## 三、关键文件
| 文件 | 改动 |
|------|------|
| `src/adapters/market-data-parse.mjs` | **新建** 纯函数解析器 |
| `src/adapters/bitget-adapter.mjs` | 新增 `resolveSymbol` / `enrichAsset` |
| `src/services/asset-service.mjs` | 新增 async `resolveAssetIdentity`（不动现有同步函数） |
| `src/adapters/index.mjs` | `getAdapters({offline})` + 离线桩 |
| `src/services/research-service.mjs` | `buildResearchReport` 接受并消费 `enrichment` |
| `src/services/candidate-service.mjs` | `evaluateCandidateState` 透传 `enrichment` |
| `src/services/api-service.mjs` | evaluate/manage 内联调身份解析+增强 |
| `test/decision-brain.test.mjs` | `withTempState` 设 offline 环境变量 |

---

## 四、分阶段任务（约 8 天，每步带验证）
- **D1** 写 `market-data-parse.mjs` + 离线单测。验证：`node scripts/test-btw-mcp.mjs`（实连）打印解析出的 BTW 价格/链。
- **D2** bitget-adapter 加 `resolveSymbol`/`enrichAsset`。验证：扩展 test-btw 脚本，确认 BSC + $0.091。
- **D3** asset-service 加 async `resolveAssetIdentity`。验证：`npm test` 仍 29/29（离线路径未动）。
- **D4** `getAdapters({offline})` + 桩 + 测试设环境变量。验证：`npm test` 29/29。
- **D5** 把 `enrichment` 串through `buildResearchReport`/`evaluateCandidateState`。验证：`npm test` 29/29。
- **D6** api-service 内联调身份解析+增强。验证（实连）：`npm start`，`curl -s localhost:4177/api/evaluate-candidate -d '{"assetQuery":"BTW"}'` 显示真实 marketCap/chain，readiness 不再 `blocked`。
- **D7** 确认真值传入 valuation/memo/recommendation；funding/解锁/thesis 标 `"待补充"`。验证：curl review-add-intent 反映真实估值分区。
- **D8** MCP 端到端：跑 lookup→evaluate→manage→confirm→review 全链路（实连）；最终 `npm test` 29/29 + demo 脚本干净。Dashboard 标注哪些是真数据/哪些待补充（为录 Demo 视频做准备）。

---

## 五、验证总览
- 离线回归：`npm test`（必须保持 29/29，+ 解析器新单测）。
- 实连冒烟：`node scripts/test-btw-mcp.mjs` 打印 BTW 真实身份+价格。
- 端到端 HTTP：`npm start` 后 curl `/api/evaluate-candidate`（BTW），确认 `currentMetrics.marketCap>0`、`chain` 非空、`decisionLicense.key !== "blocked"`、`listedExchanges` 来自真实数据、主观字段为 `"待补充"`。

---

*方案整理：Claude Opus 4.8 · 2026-06-17 · 项目路径 `/Users/jasoncong/Documents/New project/decision-brain`*
