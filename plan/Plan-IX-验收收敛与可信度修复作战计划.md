# Plan IX — 验收收敛与可信度修复作战计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Plan VIII 已经接通的数据管线和可观测链路收敛成稳定、可复跑、可给把关人验收的版本，并修掉当前暴露的代码与测试问题。

**Architecture:** 本轮不再扩功能，优先修复“数字不可追溯、验收不稳定、MCP/Lobster 合约测试失败、前端证据不足”四类问题。所有修复必须先有失败复现，再做最小代码改动，最后用本地 + 公网 + UI 证据闭环。

**Tech Stack:** Node.js ESM, node:test, HTTP `/api/chat`, MCP stdio server, Vercel gray deployment, Playwright UI smoke, Decision Brain local JSON state.

---

## 0. 当前代码检查结论

本计划基于 2026-06-26 晚上的本地代码与公网复验。

### 0.1 已确认已经做出来的部分

- `src/chat-orchestrator.mjs` 已新增 `lookup_asset_info` 意图和 `asset_info` fanout。
- `src/services/asset-info-service.mjs` 已新增资产事实管线，并接入 60s BTC/ETH/SOL 缓存。
- `src/trace-collector.mjs` 已实现 trace schema：`{agentRole, tool, args, ok, tookMs, cached, rawSnippet, error}`。
- `src/server.mjs` 已在 `/api/chat` response 暴露 `trace` 和 `ruleOnly`。
- `src/ui/committee.js` 已改为支持动态 agent 卡片、trace 展开、失败/超时状态。

### 0.2 当前必须修复的 bug / 风险

| 编号 | 严重度 | 现象 | 根因判断 | 归属 |
|------|--------|------|----------|------|
| P0-1 | 高 | 当前公网 `node tests/plan8-acceptance.mjs --http=https://decision-brain-gray.vercel.app` 复跑为 `25/30`，不是稳定全绿 | 公网网络/代理偶发失败 + 业务输出仍有不可追溯数字 | D 组主责，B 组协作 |
| P0-2 | 高 | ENA 用例 `numbersTraceable=false` | LLM 在最终回复里额外生成了 trace 中没有的价格/阈值，例如“若市值回调至...” | B 组 |
| P0-3 | 高 | D 组脚本没有严格覆盖 Plan VIII 原定的断网/超时验收 | `p8-ob-03` 只断言“不崩溃”，没有断言 timeout trace；`--degraded` 不在默认 9 条内 | D 组 |
| P1-1 | 中 | `npm test` 中 `lobster-config.test.mjs` 失败 | 测试断言写死旧路径 `/decision-brain/src/mcp-server.mjs`，但当前真实路径是 `/Decision Brain/源代码/src/mcp-server.mjs` | E 组 |
| P1-2 | 中 | `mcp-server-contract.test.mjs` manage_position 调用超时等待 `当前计划状态为 draft` | MCP stdio 测试没有稳定解析单条 JSON-RPC response，也可能被耗时初始化/输出顺序影响 | E 组 |
| P1-3 | 中 | “你好” 会被近期资产回退污染，回复 BTC 数据缺失建议 | `runOrchestrator` 对所有意图都可从 state 最近 trace 回填 `assetQuery`，smalltalk 不应回填 | A 组 |
| P1-4 | 中 | DOGE/AAVE 回复出现链归属明显不可信内容，如 DOGE 被说成 Solana | 外部数据/合成层对 identity.chain 没有可信度防护，LLM 仍会把低可信字段写成确定事实 | B 组 |
| P1-5 | 中 | C 组缺少前端三态截图和 Vercel `[MCP]` 日志证据 | 只有代码和 API JSON，不足以证明把关人视角可见 | C 组 |

### 0.3 本轮不做事项

- 不新增交易执行功能。
- 不把所有 unknown 都调 MCP。
- 不在 prompt 或测试里写死 BTC/ETH/SOL/ENA 的市场数值。
- 不为了让测试过而放宽验收命题。
- 不把网络偶发失败直接标成业务 PASS；公网验收必须可连续复跑。

### 0.4 黑客松 MVP 边界

本项目在黑客松里的核心叙事不是“全自动交易机器人”，而是：

> Decision Brain 是交易 Agent 的决策治理层：先查真实数据，留下可追溯过程，生成可确认计划，最后只给建议，不替用户执行交易。

#### 必须做到

| 能力 | MVP 标准 | 验收方式 |
|------|----------|----------|
| 单资产事实查询 | `BTC 是什么` 返回真实价格、市值、FDV | 回复数字能在 `trace.rawSnippet` 或 `agentResults.asset_info.data.currentMetrics` 找到来源 |
| 过程可观测 | 页面能看到本轮实际调用的 MCP/Bitget 工具、入参、耗时、返回片段 | UI 截图 + API `trace` JSON |
| 仓位记忆 | `我买了 SOL 100 个，成本 120` 写入 position | API / MCP response 里有 `assetSymbol=SOL` 和 position 明细 |
| Draft 计划 | 建仓后生成 draft plan | `plan.status=draft` |
| 用户确认 | 用户确认后 plan 变 active | `confirm_plan` 后 `plan.status=active` |
| 加仓/卖出建议 | 只给建议、理由和风险，不自动交易 | 回复里无交易执行动作，无私钥/下单工具 |
| 失败态诚实 | 数据源断开时明确说明暂无法获取实时数据 | 回复不出现任何美元价格/市值/FDV；trace 有 `ok:false` |
| 一键验收 | 本地和公网都能稳定复跑 | `npm test` + Plan IX acceptance 全绿 |

#### 明确舍弃 / 降级

| 内容 | 处理方式 | 原因 |
|------|----------|------|
| 自动交易执行 | 舍弃 | 黑客松 MVP 聚焦治理和确认，不碰资金执行风险 |
| 7 个 agent 默认全量并发 | 降级 | 只展示本轮实际 fanout，避免假热闹和超时 |
| 长尾币全覆盖 | 降级 | Demo 主资产限定 BTC / ETH / SOL / ENA，长尾只作为 best-effort |
| 复杂每日 scheduler | 降级 | 保留手动 `run_daily_monitor`，不要求真实定时任务 |
| Lobster/OpenClaw 深度演示 | 附加项 | 只有 `npm test` 全绿后才放进 demo；否则不进入主路径 |
| 完整投研报告系统 | 舍弃 | 保留三档估值、仓位计划、确认流程即可 |
| LLM 自由生成交易价位 | 舍弃 | 关键事实回复优先规则模板，LLM 只做解释和摘要 |
| 大量前端装饰 | 舍弃 | UI 只服务输入、回复、trace、计划状态四件事 |

#### 推荐黑客松 Demo 路径

1. `BTC 是什么`
   - 看真实价格/市值/FDV。
   - 展开页面 trace，看 MCP 工具调用。
2. `我买了 SOL 100 个，成本 120`
   - 看仓位写入。
   - 看 draft plan 生成。
3. `确认 SOL 计划`
   - 看 plan 从 `draft` 变为 `active`。
4. `现在能加仓 SOL 吗`
   - 看系统先读记忆、估值、计划状态，再给建议。
5. 模拟 MCP 失败后再问 `BTC 是什么`
   - 看它明确说暂无实时数据，并在页面红态展示失败 trace。

---

## 1. 分组与文件边界

| 组 | 目标 | 主要文件 |
|----|------|----------|
| A 组 | 修复意图/上下文污染，保证 smalltalk 和无资产查询不会被最近资产污染 | `src/chat-orchestrator.mjs`, `test/http-server.test.mjs` 或新增 `test/chat-orchestrator-context.test.mjs` |
| B 组 | 修复数字不可追溯和低可信身份字段进入最终回复的问题 | `src/chat-orchestrator.mjs`, `src/services/asset-info-service.mjs`, `src/adapters/bitget-adapter.mjs`, `tests/plan8-acceptance.mjs` |
| C 组 | 补齐网页把关人视角证据：实际 fanout 卡、trace 展开、超时/失败红态、日志 | `src/ui/committee.js`, `src/ui/dashboard.js`, `src/ui/dashboard.html`, `plan/Plan-IX-C组-截图/` |
| D 组 | 重写验收守门：默认覆盖数据正确性、trace、断网、超时、公网连续复跑 | `tests/plan8-acceptance.mjs`, `data/plan9-acceptance-*.json`, `plan/Plan-IX-D组-任务汇报.md` |
| E 组 | 修复 Lobster/MCP contract 测试并确保 `npm test` 全绿 | `test/lobster-config.test.mjs`, `test/mcp-server-contract.test.mjs`, `src/scripts/mcp-config-utils.mjs`, `src/mcp-server.mjs` |

---

## 2. A 组 — 意图与上下文污染修复

**目标:** “你好 / 谢谢 / help / 大盘怎么样” 这类非单资产问题不得被最近资产回填污染，不得触发不相关的 BTC 回复。

**已知根因:** `runOrchestrator` 在 `classification.slots.assetQuery` 为空时会从 `state.traces` 找最近资产，并且没有排除 `smalltalk`、`unknown`、`refresh_research` 等非单资产意图。

**Files:**
- Modify: `/Users/jasoncong/Desktop/Decision Brain/源代码/src/chat-orchestrator.mjs`
- Test: `/Users/jasoncong/Desktop/Decision Brain/源代码/test/chat-orchestrator-context.test.mjs`

### Task A1: 写失败测试

- [ ] 新增 `test/chat-orchestrator-context.test.mjs`，覆盖最近 trace 存在时的 smalltalk。

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("smalltalk should not inherit the last focused asset from stored traces", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "decision-brain-context-"));
  process.env.DECISION_BRAIN_DATA_DIR = dataDir;

  await writeFile(join(dataDir, "state.json"), JSON.stringify({
    assets: { "asset-btc": { id: "asset-btc", symbol: "BTC" } },
    positions: {},
    plans: {},
    sources: {},
    researchReports: {},
    traces: {
      "trace-1": { id: "trace-1", assetId: "asset-btc", createdAt: "2026-06-26T10:00:00.000Z" }
    }
  }, null, 2));

  const { runOrchestrator } = await import("../src/chat-orchestrator.mjs");
  const result = await runOrchestrator("你好", "ctx-smalltalk", {});

  assert.equal(result.intent, "smalltalk");
  assert.equal(result.assetQuery, null);
  assert.match(result.reply, /你好|您好|可以帮你/i);
  assert.doesNotMatch(result.reply, /BTC|市场数据|FDV|市值/);
});
```

- [ ] Run:

```bash
node --test test/chat-orchestrator-context.test.mjs
```

Expected before fix: FAIL because `assetQuery` may become `BTC` or reply mentions BTC.

### Task A2: 最小实现

- [ ] 在 `runOrchestrator` 中只允许这些意图使用最近资产回退：`review_add`, `review_sell`, `manage_position`, `confirm_plan`, `run_monitor`, `lookup_memory`。
- [ ] 不允许 `smalltalk`, `unknown`, `lookup_asset_info`, `refresh_research` 在没有显式资产时从 state 回填。

Implementation direction:

```js
const STATE_ASSET_FALLBACK_INTENTS = new Set([
  "review_add",
  "review_sell",
  "manage_position",
  "confirm_plan",
  "run_monitor",
  "lookup_memory"
]);

// only use state fallback when STATE_ASSET_FALLBACK_INTENTS.has(classification.intent)
```

### Task A3: 自测与考核

- [ ] Run:

```bash
node --test test/chat-orchestrator-context.test.mjs
```

Expected: PASS.

- [ ] Run:

```bash
node tests/plan8-acceptance.mjs --http=http://localhost:4177
```

Expected: `p8-ob-04` 的 reply 不再出现 BTC 数据缺失建议。

**考核指标:**
- `你好` intent=`smalltalk`, `assetQuery=null`。
- `卖 30%` 仍可继承最近资产。
- `加仓吗` 仍可继承最近资产。
- 大盘问题不触发 `lookup_asset_info`。

**提交标准:**
- `Plan-IX-A组-任务汇报.md` 必须贴出失败前和修复后的 `node --test test/chat-orchestrator-context.test.mjs` 输出摘要。
- 必须列出 4 条手工输入的实际 intent / assetQuery：`你好`、`卖 30%`、`加仓吗`、`今天大盘怎么样`。
- 不允许只写“已修复”，必须给到命令、结果和涉及文件。

---

## 3. B 组 — 数字可追溯与事实可信度修复

**目标:** 最终回复里出现的美元价格、市值、FDV、目标价、回调价位等所有数字，要么能在 trace/raw metrics 中找到来源，要么不允许出现。

**已知复现:** 当前公网报告 `/Users/jasoncong/Desktop/Decision Brain/源代码/data/plan8-acceptance-2026-06-26T11-31-28-854Z.json` 中 `p8-dc-04` 的 ENA 用例 `numbersTraceable=false`。

**Files:**
- Modify: `/Users/jasoncong/Desktop/Decision Brain/源代码/src/chat-orchestrator.mjs`
- Modify: `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/asset-info-service.mjs`
- Optional Modify: `/Users/jasoncong/Desktop/Decision Brain/源代码/src/adapters/bitget-adapter.mjs`
- Test: `/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan8-acceptance.mjs`

### Task B1: 增强失败用例

- [ ] 在 `tests/plan8-acceptance.mjs` 新增 ENA 的严格断言：回复里不能出现 trace 以外的美元数字。
- [ ] 把 `caseReport` 增加 `replyFull` 和 `tracePreview`，避免只存 200 字导致问题无法复盘。

Required report fields:

```js
replyFull: result.reply || result.error || "",
tracePreview: Array.isArray(result.trace)
  ? result.trace.map((t) => ({
      agentRole: t.agentRole,
      tool: t.tool,
      ok: t.ok,
      cached: t.cached,
      rawSnippet: t.rawSnippet
    }))
  : []
```

- [ ] Run:

```bash
node tests/plan8-acceptance.mjs --http=https://decision-brain-gray.vercel.app --verbose
```

Expected before fix: ENA or DOGE may fail strict traceability.

### Task B2: 限制最终回复数字来源

- [ ] 在 `synthesizeLLM` 的 prompt 中加入禁止项：不得生成 entry/target/stop-loss/回调价位，除非这些字段存在于 structured metrics。
- [ ] 对 `lookup_asset_info` 增加 deterministic fallback：若 LLM 回复含不可追溯 dollar number，丢弃 LLM 回复，改用规则模板。

Rule template requirement:

```text
{name} ({symbol}) 当前价格为 {price}，市值为 {marketCap}，FDV 为 {fdv}。这些数字来自本轮 asset_info trace；如果需要交易判断，应继续补充链上、情绪和估值上下文。
```

Unavailable fields:

```text
{name} ({symbol}) 当前暂未获取到实时 {field}，本轮不应给出具体价格或估值结论。
```

### Task B3: 低可信 identity 字段保护

- [ ] 对 `chain`、`assetType` 增加可信度字段：只有来自明确 identity source 且非 fallback 时，最终回复才能写“在某链上运行”。
- [ ] 如果 identity 来源是 fallback 或字段冲突，回复只能写“链归属仍需确认”，不得写成确定事实。

### Task B4: 自测与考核

- [ ] Run local:

```bash
node tests/plan8-acceptance.mjs
```

Expected: `Total: 100.0%`.

- [ ] Run public twice:

```bash
node tests/plan8-acceptance.mjs --http=https://decision-brain-gray.vercel.app
node tests/plan8-acceptance.mjs --http=https://decision-brain-gray.vercel.app
```

Expected: 两次均 `30/30` 或 Plan IX 新版断言全绿；若有 fetch failed，D 组必须重试并记录网络错误，不得吞掉。

**考核指标:**
- ENA `numbersTraceable=true` 连续 3 次。
- DOGE 回复不得出现 “Solana” 这类未确认链归属。
- 所有 `$...` 数字均能在 `trace.rawSnippet` 或 `agentResults.asset_info.data.currentMetrics` 找到来源。
- 断网时不出现任何具体美元价格、市值、FDV。

**提交标准:**
- `Plan-IX-B组-任务汇报.md` 必须包含 ENA 连续 3 次验收结果，每次列出 `replyFull` 中的全部 `$...` 数字和对应 trace 来源。
- 必须包含 DOGE/AAVE 链归属自查结果：如果来源不可信，回复必须写“链归属仍需确认”。
- 必须说明是否使用 deterministic fallback；若使用，列出触发条件。
- 不允许为了过验收删除数字追溯断言。

---

## 4. C 组 — 前端可观测证据补齐

**目标:** 把关人打开网页输入 “BTC 是什么”，必须能亲眼看到本轮只派出 `asset_info`，并能展开查看 MCP 工具名、入参、耗时、返回片段。失败和超时必须红态可见。

**Files:**
- Modify: `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/committee.js`
- Modify: `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.js`
- Modify: `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.html`
- Create evidence folder: `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-IX-C组-截图/`

### Task C1: UI 正常态验证

- [ ] 启动本地服务：

```bash
npm start
```

Expected: service listening on local port.

- [ ] 用 Playwright 输入 `BTC 是什么`，截图保存：

```bash
node plan/Plan-IX-C组-过程文件/c-ui-normal.mjs
```

Required screenshot:

```text
plan/Plan-IX-C组-截图/C-IX-1-btc-asset-info-trace.png
```

图片必须可见：
- 只亮 `Asset Info` 或本轮实际 fanout。
- 卡片里可见 `crypto_market` 或 `dex_market`。
- 可见 `args`、`tookMs`、`rawSnippet`。

### Task C2: UI 失败/断网态验证

- [ ] 使用坏的 MCP URL 启动：

```bash
MARKET_DATA_MCP_URL=http://127.0.0.1:1/bad npm start
```

- [ ] 输入 `BTC 是什么`，截图保存：

```text
plan/Plan-IX-C组-截图/C-IX-2-mcp-fail-red-card.png
```

Required visible state:
- 卡片红态或明确失败态。
- 文案包含“数据源未连接 / 暂无法获取实时数据 / 失败”之一。
- trace 里有 `ok:false` 或 error。

### Task C3: UI 超时态验证

- [ ] 构造 fanout timeout 场景，截图保存：

```text
plan/Plan-IX-C组-截图/C-IX-3-timeout-red-card.png
```

Required visible state:
- 对应 agent 卡片显示 “超时”。
- 不停留在“思考中”。

### Task C4: 自测与考核

- [ ] 提交 `Plan-IX-C组-任务汇报.md`，必须包含三张截图路径和对应输入。
- [ ] 附一段本地终端日志，包含 `[MCP] crypto_market ... ok ...ms` 或失败日志。

**考核指标:**
- 正常态、失败态、超时态三张截图齐全。
- 页面中实际 fanout 与 API response `fanout` 一致。
- trace 展开内容不是 mock，不允许手写占位串。

**提交标准:**
- `Plan-IX-C组-任务汇报.md` 必须包含三张截图的绝对路径。
- 每张截图必须标注对应输入、环境变量、服务 URL。
- 必须附 API response 片段，证明截图中的 agent 卡片与 response `fanout` / `trace.agentRole` 一致。
- 必须附至少一条 `[MCP]` 成功日志和一条失败日志。

---

## 5. D 组 — 验收脚本升级与公网守门

**目标:** 验收脚本本身要成为把关人的唯一准入标准，不能只测“不崩溃”。默认测试必须覆盖数据正确性、数字可追溯、真实 MCP trace、断网不编造、超时 trace、公网连续复跑。

**Files:**
- Modify: `/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan8-acceptance.mjs`
- Create or write reports: `/Users/jasoncong/Desktop/Decision Brain/源代码/data/plan9-acceptance-*.json`
- Create: `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-IX-D组-任务汇报.md`

### Task D1: 把 Plan VIII 放宽项改成硬断言

- [ ] `p8-ob-03` 改名为 `p9-ob-timeout-trace`，断言必须包含：

```js
timeoutTrace: (r) => Array.isArray(r.trace) && r.trace.some((t) => t.ok === false && t.error === "fanout_timeout"),
degradedTrue: (r) => r.degraded === true,
hasReply: (r) => isNonEmptyReply(r.reply)
```

- [ ] 把断网反例从 `--degraded` 独立模式纳入默认验收，断言必须包含：

```js
noDollarNumbers: (r) => !/\$\d/.test(r.reply || ""),
hasUnavailableText: (r) => /暂无|无法获取|数据源未连接|unavailable|not connected/i.test(r.reply || ""),
traceHasFailure: (r) => Array.isArray(r.trace) && r.trace.some((t) => t.ok === false)
```

### Task D2: 网络失败分类

- [ ] `fetch failed` 不得伪装成业务 FAIL，也不得吞掉。报告中新增：

```js
transportError: Boolean(result.error && /fetch failed|ETIMEDOUT|ECONNRESET|AbortError/i.test(result.error)),
businessEvaluated: !transportError
```

- [ ] 公网验收如果 transport error 发生，自动重试同一 case 最多 2 次；最终仍失败才记 FAIL。

### Task D3: 本地与公网连续复跑

- [ ] 本地：

```bash
node tests/plan8-acceptance.mjs
```

Expected: 100%.

- [ ] 公网连续两次：

```bash
node tests/plan8-acceptance.mjs --http=https://decision-brain-gray.vercel.app
node tests/plan8-acceptance.mjs --http=https://decision-brain-gray.vercel.app
```

Expected: 两次均 100%，且 `ruleOnly=false`。

### Task D4: 自测与考核

- [ ] `Plan-IX-D组-任务汇报.md` 必须列出：
  - 本地报告 JSON 文件名。
  - 公网第 1 次报告 JSON 文件名。
  - 公网第 2 次报告 JSON 文件名。
  - 每次 `Data / Obs / Fault` 维度通过率。
  - `ruleOnly`、`degraded`、transport retry 次数。

**考核指标:**
- 默认验收必须包含断网和超时，不再依赖额外 flag。
- 公网连续 2 次全绿。
- 每条 case 有完整 `replyFull` 和 `tracePreview`。

**提交标准:**
- `Plan-IX-D组-任务汇报.md` 必须列出所有 report JSON 的绝对路径。
- 每份 report 必须包含 `summary`、`transportError`、`retryCount`、`ruleOnly`、`degraded`。
- 如果公网失败是 transport error，必须贴出重试记录；如果重试后仍失败，不能标 PASS。
- 默认验收脚本必须覆盖断网和超时，不允许把它们放在额外 flag 里规避。

---

## 6. E 组 — Lobster/MCP 合约测试修复

**目标:** `npm test` 必须全绿；Lobster 配置测试和 MCP stdio contract 测试不能再依赖脆弱路径或脆弱字符串等待。

**Files:**
- Modify: `/Users/jasoncong/Desktop/Decision Brain/源代码/test/lobster-config.test.mjs`
- Modify: `/Users/jasoncong/Desktop/Decision Brain/源代码/test/mcp-server-contract.test.mjs`
- Optional Modify: `/Users/jasoncong/Desktop/Decision Brain/源代码/src/mcp-server.mjs`
- Optional Modify: `/Users/jasoncong/Desktop/Decision Brain/源代码/src/scripts/mcp-config-utils.mjs`

### Task E1: 修复 Lobster 路径断言

- [ ] 当前失败：

```text
Expected: /decision-brain\/src\/mcp-server\.mjs$/
Actual: /Users/jasoncong/Desktop/Decision Brain/源代码/src/mcp-server.mjs
```

- [ ] 测试不应写死目录名，改为断言：

```js
assert.match(installed.mcpServers["decision-brain"].args[0], /src\/mcp-server\.mjs$/);
assert.ok(installed.mcpServers["decision-brain"].args[0].includes("Decision Brain"));
```

- [ ] Run:

```bash
node --test test/lobster-config.test.mjs
```

Expected: 4/4 PASS.

### Task E2: 修复 MCP stdio 测试等待方式

- [ ] 不再用全局 stdoutBuffer 正则等 `当前计划状态为 draft`。
- [ ] 新增 JSON-RPC frame parser，按 `id` 等待响应，再解析 `result.content[0].text`。
- [ ] 对 `tools/call manage_position` 的断言改为结构化 JSON：

```js
const text = response.result.content[0].text;
const payload = JSON.parse(text);
assert.equal(payload.ok, true);
assert.equal(payload.asset.symbol, "SOL");
assert.equal(payload.plan.status, "draft");
assert.match(payload.message, /当前计划状态为 draft/);
```

- [ ] Run:

```bash
node --test test/mcp-server-contract.test.mjs
```

Expected: all tests PASS and process exits without pending promise.

### Task E3: 全量测试

- [ ] Run:

```bash
npm test
```

Expected:

```text
fail 0
cancelled 0
```

**考核指标:**
- `npm test` 全绿。
- MCP stdio 测试不超过 15s。
- 没有 pending promise / hung process。
- 配置测试兼容中文目录和英文目录。

**提交标准:**
- `Plan-IX-E组-任务汇报.md` 必须贴出 `node --test test/lobster-config.test.mjs`、`node --test test/mcp-server-contract.test.mjs`、`npm test` 三条命令的结果摘要。
- MCP stdio 测试必须按 JSON-RPC response `id` 解析，不允许继续用全局 stdout 正则等待业务文案。
- Lobster 配置测试不得写死 `decision-brain` 目录名，必须兼容 `/Decision Brain/源代码`。

---

## 7. 统一测试内容、自查标准和提交标准

### 7.1 每组必须先自查

每个组提交前都必须完成三类自查：

| 自查类型 | 要求 |
|----------|------|
| 失败复现 | 先贴出修复前失败命令或历史失败 JSON，说明 bug 不是猜的 |
| 最小修复 | 只改本组边界内文件，不顺手扩功能 |
| 回归验证 | 至少跑本组专项测试 + 相关 acceptance case |

每组汇报必须包含：

```text
1. 修改文件
2. 失败复现命令
3. 修复后验证命令
4. 实际输出摘要
5. 截图 / JSON / 日志证据路径
6. 剩余风险
```

### 7.2 必跑测试矩阵

| 场景 | 输入 / 命令 | 通过标准 |
|------|-------------|----------|
| 单资产事实查询 | `BTC 是什么` | intent=`lookup_asset_info`，trace 含 MCP，数字可追溯 |
| ENA FDV | `ENA 的 FDV 是多少` | FDV 非 0，回复不出现额外目标价/回调价 |
| 大盘误触防护 | `今天大盘怎么样` | 不命中 `lookup_asset_info` |
| Smalltalk | `你好` | 不继承 BTC，不输出市场数据建议 |
| 仓位写入 | `我买了 SOL 100 个，成本 120` 或 MCP `manage_position` | position 写入，plan.status=`draft` |
| 计划确认 | `confirm_plan` | plan.status=`active` |
| 加仓建议 | `现在能加仓 SOL 吗` | 读取已有仓位/计划后给建议，不自动交易 |
| 断网诚实 | 坏 `MARKET_DATA_MCP_URL` 后问 `BTC 是什么` | 无美元数字，trace 有失败，UI 红态 |
| 超时处理 | 构造 fanout timeout | trace 有 `fanout_timeout`，UI 不停在思考中 |
| MCP/Lobster | `npm test` | fail 0, cancelled 0 |

### 7.3 统一提交标准

任何组员的“完成”必须同时满足：

- 有对应 `Plan-IX-X组-任务汇报.md`。
- 汇报里有命令输出摘要，不只写自然语言。
- 新增或修改的测试能单独运行。
- 不降低既有验收断言。
- 不新增 mock 伪装真实数据。
- 不把密钥、私钥、Vercel token 写入 git。
- 不改动其他组文件，除非汇报里说明原因。

### 7.4 不合格提交示例

以下情况直接退回：

- 只说“已完成”，没有命令、截图或 JSON。
- 公网只跑一次，而且失败后解释为网络问题但没有重试记录。
- UI 截图只截回复，没有截 trace 展开区。
- 回复里出现新的价格/目标价，但 trace 找不到来源。
- 断网场景仍输出 `$...` 数字。
- `npm test` 有失败但报告写“主流程不影响”。

---

## 8. 最终联调顺序

### 8.1 本地联调

- [ ] E 组先跑：

```bash
npm test
```

必须全绿后进入下一步。

- [ ] D 组跑：

```bash
node tests/plan8-acceptance.mjs
```

必须 100% 后进入下一步。

- [ ] C 组跑 UI smoke，产出三张截图。

### 8.2 公网联调

- [ ] 部署灰度版本到 `https://decision-brain-gray.vercel.app`。
- [ ] D 组连续跑两次：

```bash
node tests/plan8-acceptance.mjs --http=https://decision-brain-gray.vercel.app
node tests/plan8-acceptance.mjs --http=https://decision-brain-gray.vercel.app
```

- [ ] C 组在公网页面截图正常态和失败态。

### 8.3 把关人验收口径

把关人只需要测三句话：

1. `BTC 是什么`
   - 回复 BTC 市值是万亿级。
   - 页面能展开看到真实 MCP 工具调用。
   - 回复数字能在 trace 找到来源。

2. `ENA 的 FDV 是多少`
   - 回复只出现可追溯的价格/市值/FDV。
   - 不出现额外目标价、回调价、止损价。

3. 断开 MCP 后再问 `BTC 是什么`
   - 明确说暂无法获取实时数据。
   - 不编任何具体价格、市值、FDV。
   - 卡片红态，trace 有失败记录。

---

## 9. 每组交付文件命名

- A 组：`plan/Plan-IX-A组-任务汇报.md`
- B 组：`plan/Plan-IX-B组-任务汇报.md`
- C 组：`plan/Plan-IX-C组-任务汇报.md` + `plan/Plan-IX-C组-截图/`
- D 组：`plan/Plan-IX-D组-任务汇报.md` + `data/plan9-acceptance-*.json`
- E 组：`plan/Plan-IX-E组-任务汇报.md`

每份汇报必须包含：

- 改了哪些文件。
- 失败复现命令。
- 修复后验证命令。
- 实际输出摘要。
- 剩余风险。

---

## 10. Plan IX 放行标准

Plan IX 只有在以下全部满足时才能宣布完成：

- `npm test` 全绿，`fail 0`，`cancelled 0`。
- 本地 Plan IX 验收 100%。
- 公网 Plan IX 验收连续 2 次 100%，`ruleOnly=false`。
- UI 正常、断网、超时三态截图齐全。
- Vercel 或本地终端有 `[MCP]` 成功和失败日志证据。
- `你好` 不再回复 BTC。
- ENA / DOGE / AAVE 不再出现不可追溯价格或低可信链归属断言。
- 所有组员汇报里的 PASS 都有 JSON、截图、命令输出之一作为证据。
