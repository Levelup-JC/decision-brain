# A 组 — Plan-V 工作报告

**角色**: A 组（根因诊断 + 修复 review_add / review_sell）
**日期**: 2026-06-26
**状态**: 5/5 任务全部完成，Vercel 公网验证通过

---

## A-V-1: 复跑确认 Bug 现象

在公网 `decision-brain-gray.vercel.app` 执行三次 curl，结果与 Plan-V §1 表格一致：

```
=== BTW能加仓吗 ===
intent= review_add assetQuery= None 报错= 4 / 4

=== BTW卖30% ===
intent= review_sell assetQuery= None 报错= 4 / 4

=== 能加仓吗 ===
intent= review_add assetQuery= None 报错= 4 / 4
```

**结论**: Bug 可复现。带币种和不带币种的 review_add/review_sell 均 assetQuery=None，4 个 Agent 全部报 `Missing required field: assetQuery`。

---

## A-V-2: 查清最终根因

两层叠加 bug，位于 `src/chat-orchestrator.mjs`：

### Layer 1 — LLM 分类器丢槽位（主因）

- **位置**: `runOrchestrator()` 第 226–227 行
- **机制**: 非降级模式下，`classifyIntentLLM(message)` 先执行。LLM 成功分类 intent 为 `review_add`/`review_sell`，但返回 `assetQuery: null`。由于 LLM 结果非 null，短路逻辑直接采用 LLM 结果，**规则型槽位提取 `extractSlotsRule()` 永远不会执行**。
- **证据**: 规则型槽位提取的 ticker 正则 `/\b([A-Z]{2,8})\b/`（第 47 行）经 Node.js 实测，对 `BTW能加仓吗` 和 `BTW卖30%` 均返回 `["BTW", "BTW"]` — 它能正确提取，只是没机会跑。

### Layer 2 — 缺少状态兜底（次因）

- **位置**: `runOrchestrator()` 第 221 行，`context` 参数声明但完全未使用
- **机制**: 即使两层分类器都提取不到 assetQuery，也没有从 DataStore 的 traces/positions 中查找当前会话最近聚焦的资产。用户在前一步已评估 BTW 的情况下追问"能加仓吗"，系统不知道该用户在说 BTW。

### 代码行号引用

| 位置 | 行号 | 内容 |
|------|------|------|
| `chat-orchestrator.mjs` | 47 | `extractSlotsRule()` ticker 正则 `/\b([A-Z]{2,8})\b/` — 正确但未被调用 |
| `chat-orchestrator.mjs` | 226–227 | LLM 结果短路逻辑 — `llmResult \|\| classifyIntent(message)` |
| `chat-orchestrator.mjs` | 221 | `context = {}` — 参数声明但未使用 |
| `server.mjs` | 146 | `runFanoutAgents(orchestration.fanout, orchestration.assetQuery)` — 传 null 给 Agent |

---

## A-V-3: 修复带币种提取

### 修改文件

仅 `src/chat-orchestrator.mjs`，+30 行。

### 修改内容（Layer 1）

在 `runOrchestrator()` 分类完成后、fanout 执行前插入规则槽位合并逻辑：

```javascript
// Merge rule-based slots when LLM misses fields (Layer 1 fix)
if (!classification.slots.assetQuery) {
  const ruleSlots = extractSlotsRule(message);
  if (ruleSlots.assetQuery) {
    classification.slots.assetQuery = ruleSlots.assetQuery;
  }
}
```

### 修复后验证（Vercel 公网）

```
=== BTW能加仓吗 ===
intent= review_add assetQuery= BTW errors= 0 / 4

=== BTW卖30% ===
intent= review_sell assetQuery= BTW errors= 0 / 4
```

**红线圈守**: 未改 v2 §3 契约、未动 `INTENT_FANOUT` 定义、未改 `server.mjs`。

---

## A-V-4: 修复无币种兜底

### 修改内容（Layer 2）

在 Layer 1 合并后仍为 null 时，从 DataStore 最近 trace 查找聚焦资产：

```javascript
// Fallback to state's most recent focused asset (Layer 2 fix)
if (!classification.slots.assetQuery) {
  try {
    const state = await store.load();
    const recentTraces = Object.values(state.traces || {});
    if (recentTraces.length > 0) {
      const newest = recentTraces.reduce((a, b) =>
        (b.createdAt || "") > (a.createdAt || "") ? b : a
      );
      if (newest.assetId) {
        const asset = state.assets[newest.assetId];
        if (asset?.symbol) {
          classification.slots.assetQuery = asset.symbol;
        }
      }
    }
  } catch {
    // State unavailable; proceed without fallback
  }
}
```

### 修复后验证（Vercel 公网，前置已评估 BTW）

```
=== 能加仓吗 ===
intent= review_add assetQuery= BTW errors= 0 / 4

=== 卖30% ===
intent= review_sell assetQuery= BTW errors= 0 / 4
```

回复包含完整 BTW 加仓/卖出建议卡片，无 `Missing required field` 错误。

**红线圈守**: 未改 v2 §3 请求/响应契约，state load 失败时静默跳过不抛异常。

---

## A-V-5: 回归不破坏

### E2 / E3 / E5 复跑（Vercel 公网）

| 步骤 | 输入 | intent | assetQuery | errors |
|------|------|--------|------------|--------|
| E2 评估 | 研究 BTW | evaluate_candidate | BTW | 0 / 7 |
| E3 记仓位 | 我买了100个BTW成本0.09 | manage_position | BTW | 0 / 2 |
| E5 确认计划 | 确认计划 | confirm_plan | BTW | 0 / 0 |

### 测试基线

```
npm test → 30 tests, 29 pass, 1 fail
```

1 个失败为预存故障：`lobster-config.test.mjs` MCP 路径正则匹配问题，与本次改动零交集。

---

## 改动总结

| 维度 | 详情 |
|------|------|
| 修改文件 | 仅 `src/chat-orchestrator.mjs` |
| 新增行数 | +30 行（含 1 行 import） |
| 新增 import | `import { store } from "./data-store.mjs"` |
| 修改函数 | `runOrchestrator()` 一处 |
| GitHub commit | `321ccde` — `fix: review_add/review_sell assetQuery extraction with two-layer fallback` |
| 契约变化 | 无 |
| 后端架构变化 | 无 |

---

## 交付清单对照

- [x] A-V-1: 复跑确认 E6/E7 bug 现象（assetQuery=None + 4/4 errors），三组响应证据齐
- [x] A-V-2: 查清最终根因（Layer 1 LLM 短路 + Layer 2 无状态兜底），代码行号引用齐
- [x] A-V-3: `BTW能加仓吗` / `BTW卖30%` 修复后 assetQuery=BTW，Vercel 公网复跑通过
- [x] A-V-4: `能加仓吗` / `卖30%` 不带币种能从上下文兜底，agentResults 无 Missing field，Vercel 公网复跑通过
- [x] A-V-5: E2 / E3 / E5 回归正常，npm test 29 pass（1 个预存失败无关）
- [x] 红线守满：仅动 `chat-orchestrator.mjs`，不改契约、不重写后端、不假造数据
