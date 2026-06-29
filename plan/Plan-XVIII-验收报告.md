# Plan XVIII — 最终验收报告

**负责人 4：回归测试、对话导出、README 与最终验收**

**日期：2026-06-29**

---

## 1. 测试命令与结果

### 测试命令

```bash
npm run test:plan18
```

### 测试结果

```
✔ full demo script: every message classifies correctly
✔ BTC position stays at 1 through all sell review messages
✔ position only changes after confirmed sell_execute with managePosition
✔ '确认记录卖出' without pendingSellExecution does not mutate
✔ getPortfolioSummary returns BTC 1 after seed
✔ portfolio summary still shows BTC after sell review messages
✔ portfolio summary still shows BTC after refresh_research
✔ portfolio summary contains all required fields
✔ after confirmed sell, portfolio summary reflects reduced units
✔ GET /api/portfolio-summary returns consistent JSON
✔ UC-A: panic sell '我想卖掉一半' → review_sell, BTC stays at 1
✔ UC-B: '卖 30%' → review_sell (fast-path), BTC stays at 1
✔ UC-B2: '卖15%' → review_sell, BTC stays at 1
✔ UC-C: '可以卖吗？' → review_sell, BTC stays at 1
✔ UC-C2: 'BTC可以卖吗' → review_sell, BTC stays at 1
✔ UC-D: '好，先卖15%。' → review_sell, no position mutation
✔ UC-E: '我已经卖了0.15 BTC，帮我记录' → sell_execute draft, NOT mutate yet
✔ UC-F: '刷新全部研究' is not a sell intent, BTC stays at 1
✔ '确认记录卖出' without pending sell draft → sell_execute_confirmed, no mutation
✔ 5 consecutive sell review messages do NOT change BTC position

ℹ tests 28
ℹ pass 28
ℹ fail 0
```

### plan16 回归测试

```bash
npm run test:plan16:all
```

```
ℹ tests 114 (plan16: 22 + plan16:dialog-quality: 28 + plan15: 64)
ℹ pass 114
ℹ fail 0
```

plan16-thesis-guard.test.mjs 中的两处断言因 Plan XVIII 新增的 `sell_execute_confirmed` 意图和恐慌卖出回复格式更新而调整，所有测试通过。

---

## 2. 新增测试文件

| 文件 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `tests/plan18-sell-review-no-mutation.test.mjs` | 10 | 用例 A-F：卖出 review 不改变仓位 |
| `tests/plan18-portfolio-overview-after-sell-review.test.mjs` | 6 | 持仓总览一致性、字段完整性、API 验证 |
| `tests/plan18-conversation-replay.test.mjs` | 4 | 完整对话重放、intent 分类、确认流程 |
| `tests/plan18-portfolio-consistency.mjs` | 8 | portfolio summary、卖出后均价、刷新研究不改仓位 |

npm script：`test:plan18`（28 个测试）

---

## 3. 关键 Transcript Replay

完整 Demo 对话意图分类重放结果：

| 用户消息 | 分类意图 | sellPct | panicFlag |
|----------|----------|---------|-----------|
| 研究 BTC | evaluate_candidate | - | - |
| 我想买一个BTC，成本价在8万美金。 | evaluate_candidate | - | - |
| 我当时觉得BTC回调了比较多了... | manage_position | - | - |
| 我现在呢，觉得比特币都跌到6万了，我想卖掉一半... | review_sell | - | **true** |
| 卖 30% | review_sell | **30** | - |
| 可以卖吗？ | review_sell | - | - |
| 好，先卖15%。 | review_sell | 15 | - |
| 看我的持仓总览 | lookup_memory | - | - |
| 我已经卖了0.15 BTC，帮我记录。 | sell_execute | - | - |
| 确认记录卖出 | sell_execute_confirmed | - | - |
| 看我的持仓总览 | lookup_memory | - | - |

**关键验证点：**
- 步骤 4-7（恐慌卖出阶段）：所有消息 intent 均为 `review_sell`，BTC 仓位保持 1 个不变
- 步骤 8（持仓总览）：BTC 仍存在，units=1, averageCost=80000
- 步骤 9（已卖出）：intent 为 `sell_execute`，但不可直接 mutation
- 步骤 10（确认记录卖出）：intent 为 `sell_execute_confirmed`

---

## 4. Portfolio Summary JSON 关键字段

种子后的 portfolio summary：

```json
{
  "ok": true,
  "totalCount": 1,
  "activeCount": 1,
  "draftCount": 0,
  "positions": [
    {
      "symbol": "BTC",
      "units": 1,
      "averageCost": 80000,
      "currentPrice": 80000,
      "reason": "BTC回调较多，目标是囤到一个比特币"
    }
  ]
}
```

卖出 review 阶段结束后，portfolio summary 保持不变。

确认卖出 `managePosition({ action:"sell", units:0.15 })` 后：

```json
{
  "symbol": "BTC",
  "units": 0.85,
  "averageCost": 80000
}
```

`averageCost` 不受卖出影响（预期行为）。

---

## 5. 对话导出

- 导出文件：`logs/decision-brain-demo-plan18.md`
- 包含 11 轮完整对话，含 intent、assetQuery、slots (sellPct/panicFlag)、pendingSellExecution
- `conversation-log-service.mjs` 已更新，支持 `pendingSellExecution` 字段导出
- `server.mjs` 的 `logTurn` 调用已添加 `pendingSellExecution` 参数

---

## 6. README 更新位置

以下四处已更新（`源代码/README.md`）：

1. **恐慌卖出护栏**：第 5 条核心能力，描述三层状态机（review_sell → sell_execute → sell_execute_confirmed）
2. **Harness 回归验证**：第 6 条核心能力，描述固定脚本自动化测试
3. **Bitget MCP 市场感知层**：第 7 条核心能力，描述 5 个 Agent 的分工
4. **测试套件统计**：更新为 238 测试用例（新增 Plan XVIII 28 个）

---

## 7. 安全检查结论

- 无 API key、私钥、真实账户信息泄露
- 对话导出文件 `logs/decision-brain-demo-plan18.md` 仅含 demo 脚本，无真实资产隐私
- `data/state.json` 继续通过 `.gitignore` 排除
- `conversation-logs.json` 不进入 Git 仓库
- 本次所有修改均不涉及凭证或敏感数据

---

## 8. 全量测试补充

本次最终复验已补跑核心测试：

```bash
npm test
```

结果：

```
ℹ tests 54
ℹ pass 54
ℹ fail 0
```

此前 BTW 演示资产相关 `Plan not found` 失败已修复：测试和 demo fixture 对未知演示币显式传入 `allowUnconfirmedAsset: true`，真实用户路径仍保留未知资产确认保护。

---

## 9. 完成定义对照

| 条件 | 状态 |
|------|------|
| 卖出 review 不改变仓位 | 通过 |
| 已卖出记录必须二次确认 | 通过（sell_execute_confirmed） |
| 持仓总览不会因为 review 分支变空 | 通过 |
| panic sell 回复包含投资初心 | 通过（负责人 3） |
| Bitget MCP 数据在 Agent 作战室可见 | 通过（已有） |
| 对话可以导出 | 通过（含 pendingSellExecution） |
| README 讲清项目价值 | 通过（四个关键词） |
| 测试全部通过 | 通过（npm test: 54/54, plan18: 28/28, plan16:all: 114/114） |

---

**结论：本轮 P0 主线已验收通过。**
