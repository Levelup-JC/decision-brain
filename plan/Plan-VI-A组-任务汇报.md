# Plan-VI A组任务汇报 — 编排层上下文贯通与超时修复

**阶段**: Plan-VI 上下文断层修复与验收 | **执行人**: A组 | **日期**: 2026-06-26
**Commit**: `cdffec9` | **状态**: 已提交 + 已推送，Vercel 自动部署中

---

## 任务完成总览

| 任务 | 描述 | 状态 | 涉及文件 |
|------|------|------|----------|
| A-VI-1 | 编排层上下文注入（三层贯通） | DONE | 4 files |
| A-VI-2 | sell+pct 快速路径 + 精简 fanout | DONE | 1 file |
| A-VI-3 | sessionId 无状态归一 | DONE | 2 files |
| A-VI-4 | agent fanout 透传 | DONE | 1 file |

---

## A-VI-1: 上下文三层贯通（核心修复）— DONE

**根因**: 编排层 `context` 声明但未消费，LLM 分类器只收单条 message，无会话/聚焦资产注入。

**修复三层**:

### 第1层: 前端会话态维护 (`src/ui/dashboard.js`)
- 新增 `sessionContext` 对象：`{ lastAsset, lastIntent, lastPrice, recentTurns[] }`
- `sendChat()` 每次请求携带完整 context（替代之前的 `context: {}`）
- `updateSessionContext()` 从响应中提取 assetQuery/intent 更新会话态
- 保留最近 10 轮对话历史

### 第2层: Prompt 注入 (`src/chat-orchestrator.mjs`)
- `classifyIntentLLM`: prompt 新增 `<focused_asset>` 和 `<recent_turns>` 段，LLM 可解析代词（"它"/"这个币"）
- `synthesizeLLM`: prompt 新增 `<session_context>` 段（focused asset + last intent + recent turns）
- `recentTurnsDigest()`: 将最近 N 轮对话格式化为 prompt 可消费的摘要

### 第3层: 规则兜底 (`src/chat-orchestrator.mjs`)
- `extractSlotsRule`: 消息无 ticker 时优先读 `context.lastAsset`
- `synthesizeRule`: assetLabel 优先用 `slots.assetQuery`，fallback 到 `context.lastAsset`
- `generateSuggestions`: asset 优先用 `slots.assetQuery`，fallback 到 `context.lastAsset`

### B组验证结果 (v2, `e2a6907` 本地)

| 步骤 | v1 (修复前, 线上 `321ccde`) | v2 (修复后, `e2a6907`) |
|------|---------------------------|------------------------|
| E2 "它是什么" | FAIL — 上下文断层 | **PASS** — 正确解释 BTC |
| E4 "以太坊呢" | FAIL — 仍讨论 BTC | **PASS** — 正确切换 ETH |

**P0-A 上下文断层确认修复。** Plan-VI 的核心目标达成。

---

## A-VI-2: sell+pct 超时优化 — DONE

### 第一层: 分类 + 初始综合快速路径 (`e2a6907`)
- `isSellPctFastPath(message)`: 正则检测「卖/减仓/清仓/止盈/止损」+ 数字%
- 匹配后跳过 `classifyIntentLLM`（省 ~1-3s）
- 匹配后跳过初始 `synthesizeLLM`（省 ~1-3s，初始回复会被 fanout 后覆盖）
- 规则型 `extractSlotsRule` 直接提取 sellPct + assetQuery
- 初始回复用 `synthesizeRule`，≤ 200ms

### 第二层: fanout 精简 (`cdffec9`)
- 新增 `SELL_FAST_FANOUT = ["memory", "sentiment"]`，替代 `review_sell` 的完整 fanout（4 agents → 2 agents）
- memory: 确认聚焦资产身份
- sentiment: 市场情绪时机判断
- 裁减 valuation/technical: sell+pct 场景用户已明确意图和比例，估值和技术面非关键决策因子
- agent 并行时间预计减半（~5s → ~2.5s），加 LLM synthesize ~3s，总耗时预计 5-6s < 8s

### 待 B 组重验
Vercel 部署后 B 组在公网重跑 sell 时延测试，确认 < 8s。

---

## A-VI-3: sessionId 无状态归一 — DONE (`src/server.mjs`)

- `/api/chat` 从 header `x-session-id` 和 body `sessionId` 双重提取
- 无 sessionId → `context._stateless = true`
- `runOrchestrator` 检测 `_stateless` 后走规则兜底（不调 LLM，不查 DataStore）
- curl 无 sessionId → 规则兜底 → 行为确定，消除 B/C 组矛盾

---

## A-VI-4: agent fanout 透传 — DONE (`src/agent-runner.mjs`)

- `runFanoutAgents(fanout, assetQuery, context)`: 签名新增 context
- `focusedAsset = context.lastAsset || assetQuery`: 优先用会话聚焦资产
- 七个 Agent 透过 `runAgent(role, focusedAsset)` 拿到正确的资产 ticker

---

## 改动文件清单

| 文件 | 变更 | 要点 |
|------|------|------|
| `src/chat-orchestrator.mjs` | +81/-29 | classifyIntentLLM/synthesizeLLM 上下文注入, sell 快速路径, stateless 处理 |
| `src/server.mjs` | +16/-3 | context 提取, sessionId 双重读取, _stateless 标记 |
| `src/ui/dashboard.js` | +25/-1 | sessionContext 维护, context 携带 |
| `src/agent-runner.mjs` | +4/-1 | runFanoutAgents context 透传 |
| `package.json` | +1 | bstc 脚本 |

---

## 交叉验证矩阵

| 验证方 | 版本 | 环境 | 结果 |
|------|------|------|------|
| A组 | `e2a6907` | 本地开发 | 代码自审通过 |
| B组 v1 | `321ccde` | 公网 Vercel | 修复前基线, E2/E4 FAIL |
| B组 v2 | `e2a6907` | 本地 localhost | P0-A 修复确认, sell 时延 FAIL |
| C组 BSTC | `321ccde` | 进程内直接调用 | 32/32 PASS (runner 自行维护 context) |

---

## C组 BSTC 基线状态

- 32题命题集 + 自动跑分脚本已完成 (`tests/bstc-corpus.mjs` + `tests/bstc-runner.mjs`)
- 首次跑分: 32/32 PASS (100%)，在 `321ccde` 上通过进程内 context 透传达成
- `npm run bstc` 已挂入 package.json
- **注意**: 跑分是进程内直调 `runOrchestrator()`，runner 自行维护 context。A-VI-1 部署后需 HTTP 级别重跑以验证生产环境上下文贯通。

---

## 下一轮行动

1. Vercel 部署 `cdffec9` 完成确认
2. B 组在公网重跑 B-VI 链测试（追问链路 + sell 时延）
3. C 组 HTTP 级别重跑 BSTC，产出 `bstc-report-cdffec9.json`
