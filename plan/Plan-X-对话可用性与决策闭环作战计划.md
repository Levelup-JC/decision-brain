# Plan X — 对话可用性与决策闭环作战计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan IX 把"数据可追溯、验收可复跑"做实了，但官网对话框实际体验仍然不可用：回复慢、作战委员会超时、查不准代币、调不出历史投资、没法引导首次建仓、确认后不能持续监控。Plan X 不再修小 bug，而是从架构上根治超时，并把对话主路径的四件事做实：**查得准、记得住、领得动、管得住**。

**Architecture:** 本轮核心是**砍掉串行 LLM 浪费、把超时预算重新分配到 Vercel 10s 以内、修复并发 trace 串台**，然后在稳定的链路上把"单资产详情 / 投资历史 / 首次方案引导 / 持续监控"四条对话路径打通。所有改动必须先有失败复现（慢、超时、查不到、答不准），再做最小修复，最后用响应时间 + trace + 端到端对话脚本闭环验收。

**Tech Stack:** Node.js ESM, node:test, HTTP `/api/chat`, MCP stdio server, market-data MCP (datahub.noxiaohao.com), Vercel gray deployment, Playwright UI smoke, Decision Brain local JSON state.

---

## 0. 当前代码检查结论

本计划基于 2026-06-27 上午的本地代码复查。

### 0.1 已确认的链路现状

- `/api/chat` 单次请求最多串行触发 **3-4 次 LLM 调用**：`classifyIntentLLM` → `runOrchestrator` 内的初始 `synthesizeLLM`（拿空 agentResults 合成）→ fanout（7s race）→ `synthesizeWithResults` 再合成一次。
- `src/chat-orchestrator.mjs:494` 的初始 `synthesizeLLM` 结果**总是被** `server.mjs:187` 的 `synthesizeWithResults` 覆盖，属于纯浪费往返。
- `src/llm-client.mjs:16` LLM 超时设为 **15000ms**，大于 Vercel serverless 函数 10s 上限，单次慢调用即可让整个 `/api/chat` 超时。
- `src/server.mjs:155` fanout 用固定 **7000ms** Promise.race，超时即整体降级、丢弃所有已返回的 agent 结果。
- `src/agent-runner.mjs:188` 在 `Promise.allSettled` 并发 map 内调用全局 `setCurrentCollector(tc)` / `clearCurrentCollector()`，并发执行时 collector 互相覆盖，trace 归属可能串台。
- `lookup_asset_info` 也走完整的"fanout + 最终 LLM 合成"路径，单资产事实查询被不必要地拖慢。
- `lookup_memory` 的 fanout 仅 `["memory"]`，无法一次性调出"全部持仓 + 各自计划状态 + 历史估值"。
- 首次建仓引导（evaluate → manage_position → draft → confirm → active）链路存在，但没有作为一条被验证的连续对话流。
- 持续监控（run_monitor / review_add / review_sell）缺少"实时数据 vs active plan 阈值对比"的对话产出。

### 0.2 本轮必须解决的问题

| 编号 | 严重度 | 现象 | 根因判断 | 归属 |
|------|--------|------|----------|------|
| P0-1 | 高 | 对话框回复慢，委员会经常卡满 7s 后降级 | 串行多次 LLM + LLM 超时 15s > Vercel 10s + fanout 固定 7s | A 组 |
| P0-2 | 高 | 单资产"BTC 是什么"也要等委员会，慢 | `lookup_asset_info` 走了完整 fanout + 最终 LLM 合成 | A 组 |
| P0-3 | 高 | 连续快速查 ENA/DOGE/AAVE，MCP 偶发 `unknown/ok:false` | MCP 无重试退避、缓存只覆盖 BTC/ETH/SOL | B 组 |
| P0-4 | 中 | trace 归属可能串台，证据可信度存疑 | 并发共享全局 collector | A 组 |
| P1-1 | 高 | 问"我之前买过什么 / 我的 SOL 计划"答不全 | `lookup_memory` fanout 太窄，无投资历史聚合 | C 组 |
| P1-2 | 高 | 新用户不知道下一步，走不完第一次建仓 | 缺少被验证的引导闭环和 draft plan 内容 | D 组 |
| P1-3 | 高 | 确认计划后没有持续监控产出 | run_monitor/review_* 缺"实时 vs 计划"对比 | E 组 |

### 0.3 本轮不做事项

- 不新增自动交易执行、不碰私钥、不接入 Bitget 58 个交易 Tools。
- 不在 prompt 或测试里写死任何币的市场数值。
- 不为了过验收放宽数字可追溯断言（沿用 Plan IX 标准）。
- 不把网络/MCP 偶发失败标成业务 PASS。
- 不引入 React 或重写前端框架，沿用原生页面增量改造。

### 0.4 黑客松 MVP 边界（沿用并强化 Plan IX）

> Decision Brain 是交易 Agent 的决策治理层：先查真实数据，留下可追溯过程，生成可确认计划，最后只给建议，不替用户执行交易。

Plan X 在此基础上明确**对话可用性的硬指标**：

| 能力 | MVP 标准 | 验收方式 |
|------|----------|----------|
| 单资产快查 | `BTC 是什么` P95 响应 < 4s，数字可追溯 | 10 次连续请求响应时间统计 + trace |
| 委员会不超时 | `研究 SOL` 类 fanout P95 < 9s，不触发 fanout_timeout | 响应时间 + `degraded=false` |
| 投资历史调取 | `我的持仓总览` 一次返回全部仓位 + 计划状态 + 估值档 | API JSON 结构化全量 |
| 首次建仓引导 | 新 session 走完 研究→记录→确认，plan 从无→draft→active | 端到端对话脚本 |
| 持续监控 | active plan 存在时，监控/加减仓给"实时 vs 计划"对比建议 | 对话产出含阈值对比 + 可追溯数字 |
| 失败诚实 | 数据源断开时不编数字，trace 有失败 | 沿用 Plan IX 断网断言 |
| 一键验收 | 本地 + 公网稳定复跑 | `npm test` + Plan X acceptance 全绿 |

#### 推荐黑客松 Demo 路径（Plan X 终版）

1. `BTC 是什么` → 4s 内返回真实价格/市值/FDV，展开 trace 看 MCP 调用。
2. `研究一下 SOL 值不值得买` → 委员会多 agent 并发返回，不超时，给估值结论。
3. `我买了 SOL 100 个，成本 120` → 写入持仓，生成含三档估值的 draft plan。
4. `确认 SOL 计划` → plan 从 draft 变 active。
5. `我的持仓总览` → 一次列出全部仓位 + 各自计划状态 + 估值档。
6. `现在 SOL 能加仓吗` → 读 active plan + 实时价，给"当前 vs 计划阈值"对比建议。
7. 断开 MCP 再问 `BTC 是什么` → 明确说暂无实时数据，红态 trace。

---

## 1. 分组与文件边界

| 组 | 目标 | 主要文件 |
|----|------|----------|
| A 组 | 超时根治：砍浪费 LLM、分级超时、单资产快路径、修 trace 串台 | `src/chat-orchestrator.mjs`, `src/llm-client.mjs`, `src/server.mjs`, `src/agent-runner.mjs`, `src/trace-collector.mjs` |
| B 组 | MCP 数据可靠性：重试退避、全币缓存、限流保护 | `src/adapters/bitget-adapter.mjs`, `src/services/asset-info-service.mjs` |
| C 组 | 投资历史贯通：聚合持仓+计划+估值，对话可调出 | `src/chat-orchestrator.mjs`, `src/services/*`, `src/server.mjs`（新增 portfolio 聚合） |
| D 组 | 首次建仓引导闭环：研究→记录→draft→确认→active 连续流 | `src/chat-orchestrator.mjs`（suggestions/draft plan 内容）, `src/services/plan-service.mjs` 或对应文件 |
| E 组 | 持续监控与主动建议：实时 vs active plan 阈值对比 | `src/chat-orchestrator.mjs`, `src/services/monitor-service.mjs` 或对应文件, `src/agent-runner.mjs` |

> **边界纪律**：每组只改本组边界文件。A 组与 C/D/E 都会动 `chat-orchestrator.mjs`，因此 **A 组先合并**，其余组在 A 组合并后的版本上改，避免冲突。联调顺序见第 8 节。

---

## 2. A 组 — 超时根治与单资产快路径

**目标:** 把 `/api/chat` 的端到端响应压进 Vercel 10s 预算内，消除"委员会必然卡 7s"的结构缺陷，并让单资产事实查询走快路径。

### Task A1: 写失败复现（响应时间基线）

- [ ] 新增 `test/chat-latency.test.mjs` 或脚本 `tests/plan10-latency.mjs`，对本地 HTTP 连续发 10 次 `BTC 是什么`、5 次 `研究 SOL`，记录每次 `tookMs`（客户端测量）与 `degraded`。
- [ ] Run:

```bash
npm start &
node tests/plan10-latency.mjs --http=http://localhost:4177
```

Expected before fix: 单资产 P95 明显 > 4s；`研究 SOL` 频繁 `degraded=true` 且 trace 含 `fanout_timeout`。

### Task A2: 删除浪费的初始 LLM 合成

- [ ] `src/chat-orchestrator.mjs` 的 `runOrchestrator`：初始 `reply` 不再调用 `synthesizeLLM`。当有 fanout 时，初始 `reply` 用轻量 `synthesizeRule` 占位（反正会被 `synthesizeWithResults` 覆盖）；无 fanout 的意图（smalltalk/confirm_plan 等）才保留必要的单次合成。
- [ ] 目标：有 fanout 的请求从 3 次 LLM 降到 2 次（classify + 最终合成）。

### Task A3: LLM 分级超时

- [ ] `src/llm-client.mjs` 的 `chatCompletion` 接受 `timeoutMs` 参数，默认值改为 **8000ms**（< Vercel 10s）。
- [ ] classify 调用传 `timeoutMs: 3500`，最终 synthesize 传 `timeoutMs: 6000`。两者之和留出 fanout 与网络余量。

### Task A4: fanout 超时按意图预算 + 保留已返回结果

- [ ] `src/server.mjs`：`FANOUT_TIMEOUT_MS` 不再固定 7000。单资产/窄 fanout 用 4000，多 agent（evaluate_candidate）用 6500。
- [ ] **超时时不再丢弃全部结果**：`runFanoutAgents` 内每个 agent 独立超时（如 5000ms），超时的标 `ok:false/timeout`，已返回的正常并入 `agentResults`。`server.mjs` 用部分结果做合成，只有全部失败才整体降级。

### Task A5: 单资产快路径（lookup_asset_info 不走最终 LLM）

- [ ] `lookup_asset_info` 命中时：fanout 仅 `["asset_info"]`，且**默认用 `synthesizeAssetInfoRule` 规则模板直接出回复**，不调最终 LLM（数字本来就要求规则模板可追溯）。
- [ ] 仅当用户问题明显需要解释（如"为什么"）时才追加 1 次受限 LLM，且超时 4000ms。
- [ ] 目标：`BTC 是什么` 仅 1 次 MCP + 0 次 LLM，P95 < 4s。

### Task A6: 修复 trace collector 并发串台

- [ ] `src/agent-runner.mjs` + `src/trace-collector.mjs`：不再用全局 `setCurrentCollector`/`clearCurrentCollector` 在并发 map 内共享。改为把 collector 作为显式参数传入 `runAgent(role, asset, collector)`，或用 `AsyncLocalStorage` 隔离每个并发分支。
- [ ] 保证 N 个 agent 并发时，每条 trace 的 `agentRole` 与真实执行 agent 一致。

### Task A7: 自测与考核

- [ ] Run:

```bash
node tests/plan10-latency.mjs --http=http://localhost:4177
node --test test/chat-orchestrator-context.test.mjs
npm test
```

**考核指标:**
- `BTC 是什么` 本地 P95 < 4s，10 次内 0 次 `degraded`。
- `研究 SOL` 本地 P95 < 9s，不出现 `fanout_timeout`（除非真断网）。
- fanout 部分超时时，已返回 agent 结果仍进入最终回复。
- 并发 trace 的 `agentRole` 无串台（构造 3 agent 并发用例断言）。
- `npm test` 全绿。

**提交标准:**
- `Plan-X-A组-任务汇报.md` 必须贴：修复前 / 修复后 `plan10-latency` 的 P95 对比表、LLM 调用次数对比、trace 串台修复前后对比、`npm test` 摘要。

---

## 3. B 组 — MCP 数据可靠性

**目标:** 连续快速请求不同代币时，MCP 调用成功率 > 95%，消除 datahub 偶发 `unknown/ok:false`。

### Task B1: 失败复现

- [ ] 写脚本连续无间隔请求 `ENA / DOGE / AAVE` 各 5 次，统计 `traceHasMcp` 成功率。
- [ ] Run:

```bash
node tests/plan10-mcp-reliability.mjs --http=http://localhost:4177
```

Expected before fix: 快速请求下成功率明显 < 95%，出现 `tool:"unknown", ok:false`。

### Task B2: MCP 调用重试与退避

- [ ] `src/adapters/bitget-adapter.mjs`：MCP 工具调用失败（含 `unknown`、网络错误、限流）时指数退避重试最多 2 次（如 300ms / 800ms）。
- [ ] 重试记录写入 trace（`retryCount` 字段），不得伪装成首次成功。

### Task B3: 全币短缓存 + 限流保护

- [ ] `src/services/asset-info-service.mjs`：缓存从仅 BTC/ETH/SOL 扩展到**任意查过的 symbol**，TTL 60s。
- [ ] 增加进程内简单限流/串行化：对同一 MCP endpoint 的并发调用做小队列或最小间隔，避免快速 fanout 自我限流。

### Task B4: 自测与考核

- [ ] Run:

```bash
node tests/plan10-mcp-reliability.mjs --http=http://localhost:4177
node tests/plan8-acceptance.mjs --http=http://localhost:4177
```

**考核指标:**
- ENA/DOGE/AAVE 连续快速请求 `traceHasMcp` 成功率 > 95%。
- 缓存命中时 trace `cached:true`，二次查询明显更快。
- 沿用 Plan IX：数字仍可追溯，断网仍不编造。

**提交标准:**
- `Plan-X-B组-任务汇报.md` 必须贴：重试退避前后成功率对比、缓存命中日志、`retryCount` 示例、Plan8 acceptance 不退化证明。

---

## 4. C 组 — 投资历史贯通

**目标:** 用户问"我之前买过什么 / 我的 SOL 计划是什么 / 我的持仓总览"时，一次性返回结构化的全部投资历史：仓位、成本、对应 draft/active 计划、历史估值档、关键 trace。

### Task C1: 失败复现

- [ ] 预置 state（2-3 个仓位 + 各自计划），问 `我的持仓总览`、`我的 SOL 计划是什么`。
- [ ] Run:

```bash
node tests/plan10-memory.mjs --http=http://localhost:4177
```

Expected before fix: 回复不全，缺计划状态或估值，只回单一资产。

### Task C2: 投资历史聚合

- [ ] 新增聚合能力：`lookup_memory`（无具体资产时）返回所有持仓概览；`get_context` 返回完整投资设计快照。
- [ ] 新增 `/api/portfolio-summary`（复用现有 state，不新增存储），输出 `{positions:[{symbol,units,avgCost,plan:{status,valuationTiers},latestMetrics}], totalCount}`。
- [ ] 对话层：`我的持仓总览` 命中 `lookup_memory` 全量分支，回复结构化列出每个仓位 + 计划状态。

### Task C3: 单资产历史

- [ ] `我的 SOL 计划是什么` → 返回 SOL 的仓位 + 该资产的 draft/active plan 明细 + 上次估值档（数字可追溯）。

### Task C4: 自测与考核

- [ ] Run:

```bash
node tests/plan10-memory.mjs --http=http://localhost:4177
npm test
```

**考核指标:**
- `我的持仓总览` 返回全部仓位数量正确，每个含计划状态。
- `我的 SOL 计划` 返回该资产计划明细 + 可追溯估值数字。
- 无仓位时诚实回复"暂无持仓记录"，不编造。

**提交标准:**
- `Plan-X-C组-任务汇报.md` 必须贴：预置 state、`portfolio-summary` JSON、两类查询的 `replyFull`。

---

## 5. D 组 — 首次建仓引导闭环

**目标:** 全新 session 的用户能被系统一步步领着走完第一次投资方案：研究资产 → 记录仓位 → 生成含三档估值的 draft plan → 确认 → active。

### Task D1: 失败复现

- [ ] 全新 session 跑 `研究 SOL` → `我买了 SOL 100 个成本 120` → `确认 SOL 计划`，检查每步是否有清晰下一步引导、draft plan 是否含估值内容。
- [ ] Run:

```bash
node tests/plan10-onboarding.mjs --http=http://localhost:4177
```

Expected before fix: draft plan 内容单薄、缺三档估值/仓位建议，suggestions 引导不连贯。

### Task D2: draft plan 内容做实

- [ ] `manage_position` 生成 draft plan 时，写入：三档估值（保守/中性/乐观，来自 valuation agent，数字可追溯）、建议仓位区间、关注的入场/止盈/止损区间（仅当来自 valuation/technical 的可追溯数据）。
- [ ] 不可追溯的价位一律不写（沿用 Plan IX 数字纪律）。

### Task D3: 引导话术与下一步

- [ ] 每步回复末尾给明确下一步（`generateSuggestions` 强化）：研究后引导"记录仓位"，记录后引导"确认计划"，确认后引导"看监控 / 加减仓建议"。
- [ ] 新 session 首次交互给一句简短引导（你可以让我：研究资产 / 记录持仓 / 查看持仓）。

### Task D4: 自测与考核

- [ ] Run:

```bash
node tests/plan10-onboarding.mjs --http=http://localhost:4177
```

**考核指标:**
- 端到端走完三步，`plan.status` 依次为 无 → `draft` → `active`。
- draft plan 含三档估值，且所有数字可在 trace 找到来源。
- 每步 suggestions 指向正确的下一步。

**提交标准:**
- `Plan-X-D组-任务汇报.md` 必须贴：三步的 `replyFull`、每步 `plan.status`、draft plan 的估值数字与 trace 来源对照。

---

## 6. E 组 — 持续监控与主动建议

**目标:** 计划 active 后，监控 / 加仓 / 减仓查询能基于"实时数据 vs active plan 阈值"给出对比和建议，理由和数字可追溯，不自动交易。

### Task E1: 失败复现

- [ ] 预置 active plan（含估值/阈值），跑 `运行监控 SOL`、`现在 SOL 能加仓吗`、`SOL 该减仓吗`。
- [ ] Run:

```bash
node tests/plan10-monitor.mjs --http=http://localhost:4177
```

Expected before fix: 回复缺"当前价 vs 计划阈值"对比，只给泛泛建议。

### Task E2: 实时 vs 计划对比

- [ ] `run_monitor`：读 active plan + 实时 metrics（asset_info），输出对比（当前价/市值 vs 计划档位），并标注是否触及加/减仓阈值。
- [ ] `review_add` / `review_sell`：基于该对比 + 仓位 + 情绪/技术，给"建议 + 理由 + 风险"，明确不替用户下单。

### Task E3: 监控提示文案

- [ ] 当实时数据偏离计划阈值（如跌破保守档、突破乐观档），回复用明确文案提示，并指向建议动作（仅建议）。
- [ ] 无 active plan 时诚实引导用户先建仓/确认计划。

### Task E4: 自测与考核

- [ ] Run:

```bash
node tests/plan10-monitor.mjs --http=http://localhost:4177
npm test
```

**考核指标:**
- `运行监控 SOL` 返回"当前 vs 计划"对比，数字可追溯。
- `能加仓吗` / `该减仓吗` 给可追溯建议 + 风险，无交易执行动作。
- 无 active plan 时引导先确认计划，不强行给监控。

**提交标准:**
- `Plan-X-E组-任务汇报.md` 必须贴：预置 active plan、三类查询的 `replyFull`、对比数字与 trace 来源对照。

---

## 7. 统一测试内容、自查标准和提交标准

### 7.1 每组必须先自查

| 自查类型 | 要求 |
|----------|------|
| 失败复现 | 先贴出修复前的慢/超时/查不到/答不准证据（命令 + 输出 / JSON） |
| 最小修复 | 只改本组边界文件，不顺手扩功能 |
| 回归验证 | 跑本组专项脚本 + 相关 Plan8/Plan9 acceptance + `npm test` |

每组汇报必须包含：

```text
1. 修改文件
2. 失败复现命令与输出
3. 修复后验证命令与输出
4. 实际输出摘要（含响应时间 / replyFull / trace）
5. 证据路径（脚本 JSON / 截图 / 日志）
6. 剩余风险
```

### 7.2 必跑测试矩阵

| 场景 | 输入 / 命令 | 通过标准 |
|------|-------------|----------|
| 单资产快查 | `BTC 是什么` ×10 | P95 < 4s，0 次 degraded，数字可追溯 |
| 委员会不超时 | `研究 SOL` ×5 | P95 < 9s，无 fanout_timeout（非断网） |
| MCP 可靠 | ENA/DOGE/AAVE 快速 ×5 | traceHasMcp 成功率 > 95% |
| 投资历史 | `我的持仓总览` | 全部仓位 + 计划状态结构化返回 |
| 单资产历史 | `我的 SOL 计划是什么` | 返回计划明细 + 可追溯估值 |
| 首次引导 | 研究→记录→确认 三步 | plan 无→draft→active，估值可追溯 |
| 持续监控 | `运行监控 SOL` | 当前 vs 计划对比，数字可追溯 |
| 加减仓 | `能加仓吗` / `该减仓吗` | 可追溯建议 + 风险，无交易执行 |
| Smalltalk | `你好` | 不继承资产，不输出市场数据（沿用 Plan IX） |
| 断网诚实 | 坏 MCP URL 后 `BTC 是什么` | 无美元数字，trace 失败，UI 红态 |
| 全量测试 | `npm test` | fail 0, cancelled 0 |

### 7.3 统一提交标准

- 有对应 `Plan-X-{A-E}组-任务汇报.md`。
- 汇报含命令输出摘要，不只写自然语言。
- 新增/修改测试能单独运行。
- 不降低 Plan IX 既有断言（数字可追溯、断网诚实）。
- 不新增 mock 伪装真实数据。
- 不把密钥 / Vercel token 写入 git。
- 跨组共改 `chat-orchestrator.mjs` 时遵守第 8 节合并顺序。

### 7.4 不合格提交示例（直接退回）

- 只说"已优化"，没有响应时间前后对比。
- 单资产查询仍走完整 fanout + 最终 LLM。
- 投资历史只返回单一资产、缺计划状态。
- draft plan 出现 trace 找不到来源的价位。
- 监控建议没有"实时 vs 计划"对比。
- `npm test` 有失败但报告写"主流程不影响"。

---

## 8. 最终联调顺序

### 8.1 合并顺序（避免 chat-orchestrator 冲突）

1. **A 组先合并**（链路提速 + 快路径 + trace 修复是底座）。
2. C / D / E 在 A 组合并后的版本上改 `chat-orchestrator.mjs`。
3. B 组独立于 orchestrator，可并行。

### 8.2 本地联调

- [ ] A 组：`node tests/plan10-latency.mjs --http=http://localhost:4177` 达标。
- [ ] B 组：`node tests/plan10-mcp-reliability.mjs` 成功率 > 95%。
- [ ] C/D/E：各自 plan10 专项脚本全过。
- [ ] 全员：`npm test` 全绿 + `node tests/plan8-acceptance.mjs --http=http://localhost:4177` 不退化。

### 8.3 公网联调

- [ ] 部署灰度到 `https://decision-brain-gray.vercel.app`。
- [ ] 连续两次公网跑：

```bash
node tests/plan8-acceptance.mjs --http=https://decision-brain-gray.vercel.app
node tests/plan10-latency.mjs --http=https://decision-brain-gray.vercel.app
```

- [ ] C 组在公网页面截图：单资产快查 trace、持仓总览、监控对比。

### 8.4 把关人验收口径

把关人按第 0.4 节 Demo 路径测 7 句话，重点看：

1. `BTC 是什么` 4s 内返回，trace 可展开。
2. `研究 SOL` 委员会不超时。
3. 走完 记录→确认，计划 draft→active。
4. `我的持仓总览` 一次列全。
5. `SOL 能加仓吗` 给"实时 vs 计划"对比建议。
6. 断网后 `BTC 是什么` 不编数字。

---

## 9. 每组交付文件命名

- A 组：`plan/Plan-X-A组-任务汇报.md`
- B 组：`plan/Plan-X-B组-任务汇报.md`
- C 组：`plan/Plan-X-C组-任务汇报.md`
- D 组：`plan/Plan-X-D组-任务汇报.md`
- E 组：`plan/Plan-X-E组-任务汇报.md`
- 总报告（汇报给你）：`plan/Plan-X-验收总报告.md`

每份组报告必须包含第 7.1 节六要素。

---

## 10. 如何汇报给你（用户验收出口）

把关人/你只需要看一份 **`Plan-X-验收总报告.md`**，它必须包含：

### 10.1 一张性能对比表（核心）

| 场景 | Plan IX（修复前） | Plan X（修复后） | 达标 |
|------|------------------|------------------|------|
| `BTC 是什么` P95 响应 | （填实测） | （填实测，目标 <4s） | ✓/✗ |
| `研究 SOL` P95 响应 | （填实测） | （填实测，目标 <9s） | ✓/✗ |
| 委员会超时率 | （填实测） | （填实测，目标 ~0%） | ✓/✗ |
| MCP traceHasMcp 成功率 | （填实测） | （填实测，目标 >95%） | ✓/✗ |
| 每请求 LLM 调用次数 | 3-4 | 目标 ≤2 | ✓/✗ |

### 10.2 四条对话能力验收清单

- [ ] 查得准：单资产数字可追溯 + P95 达标。
- [ ] 记得住：持仓总览 / 单资产计划可调出。
- [ ] 领得动：新 session 走完 draft→active。
- [ ] 管得住：active plan 下监控给实时 vs 计划对比。

### 10.3 证据索引

- 各组 `Plan-X-{A-E}组-任务汇报.md` 链接。
- plan10 系列脚本输出 JSON 路径。
- 公网两次 acceptance JSON 路径。
- 公网 UI 截图路径（单资产 trace / 持仓总览 / 监控对比 / 断网红态）。

---

## 11. Plan X 放行标准

Plan X 只有在以下全部满足时才能宣布完成：

- `npm test` 全绿，`fail 0`，`cancelled 0`。
- `BTC 是什么` 本地与公网 P95 < 4s，0 次无故 degraded。
- `研究 SOL` 类 P95 < 9s，不触发 fanout_timeout（非断网）。
- 每请求 LLM 调用 ≤ 2 次，trace 无并发串台。
- ENA/DOGE/AAVE 快速请求 MCP 成功率 > 95%。
- `我的持仓总览` / `我的 SOL 计划` 返回结构化全量。
- 新 session 端到端走完 研究→记录→确认，plan 无→draft→active。
- active plan 下监控/加减仓给"实时 vs 计划"可追溯对比建议。
- 沿用 Plan IX：数字全可追溯，断网不编造，三态截图齐全。
- `Plan-X-验收总报告.md` 性能对比表与四条能力清单全部 ✓。
