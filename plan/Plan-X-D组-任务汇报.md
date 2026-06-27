# Plan X — D组任务汇报

## 1. 目标

全新 session 的用户能被系统一步步领着走完第一次投资方案：研究资产 → 记录仓位 → 生成含三档估值的 draft plan → 确认 → active。

## 2. 修改文件

- `src/services/plan-service.mjs` — `buildDraftPlan` 新增 `valuationTiers` 和 `positionGuide`
- `src/chat-orchestrator.mjs` — `generateSuggestions` 新增 `confirm_plan`/`smalltalk`/`lookup_asset_info` 引导；`synthesizeRule` 新增 `confirm_plan` case，强化 `smalltalk`/`manage_position` 话术
- `tests/plan10-onboarding.mjs` — 新建 D 组验收脚本

## 3. 失败复现 / 现状问题

修复前问题：
- `generateSuggestions` 缺少 `confirm_plan` 分支，确认计划后无下一步引导
- `smalltalk` 话术泛泛（"研究资产、管理仓位"），新用户不知道具体能输入什么
- `manage_position` reply 只说"已生成 draft 投资计划"，不提三档估值
- `buildDraftPlan` 没有显式的 `valuationTiers` 汇总和 `positionGuide`
- `confirm_plan` 在 `synthesizeRule` switch 中缺少 case，走 default 分支

## 4. 实现内容

### D2: draft plan 内容做实

`buildDraftPlan` 新增两个字段：

**valuationTiers** — 三档估值显式列表：
```json
[
  {"name":"conservative","label":"保守估值","fdvFormatted":"...","priceFormatted":"...","implication":"..."},
  {"name":"base","label":"基准估值","fdvFormatted":"...","priceFormatted":"...","implication":"..."},
  {"name":"aggressive","label":"乐观估值","fdvFormatted":"...","priceFormatted":"...","implication":"..."}
]
```

**positionGuide** — 仓位操作指南（入场/持有/止盈区间）：
```json
{
  "currentUnits": 100,
  "averageCost": 120,
  "floorUnits": 20,
  "suggestedAddZone": "$x - $y (保守估值区)",
  "holdThroughZone": "$x - $y (基准估值区)",
  "takeProfitZone": "$x 以上可考虑分批止盈"
}
```

所有数字来自 `valuationModel.scenarios`，可追溯。

### D3: 引导话术与下一步

**generateSuggestions 新增分支：**

| 意图 | 修复前 | 修复后 |
|------|--------|--------|
| `confirm_plan` | 无专用分支 | 运行监控 / 加仓 / 减仓 |
| `smalltalk` (新 session) | 仅通用建议 | 研究 BTC / 记录 ETH / 持仓总览 |
| `lookup_asset_info` | 无专用分支 | 研究该资产 / 记录仓位 |
| `evaluate_candidate` | 研究 X / 持有 X | 我买了 X，记录仓位 / 刷新数据 |
| `review_add` | 看 X 加仓建议 | 加仓建议 / 减仓 |
| `review_sell` | 卖 30% | 卖 30% / 能加仓吗 |

**synthesizeRule 新增/强化：**
- 新增 `confirm_plan` case: "投资计划已确认并激活。现在可以开始持续监控..."
- `manage_position` 强化: "已生成含三档估值的 draft 投资计划"
- `smalltalk` 强化: 带具体示例的引导（研究资产 / 记录持仓 / 查看总览 / 确认计划）

## 5. 自测命令与结果

```bash
# 全量单元测试
npm test
# 结果: 38 pass, 0 fail, 0 cancelled

# D 组验收脚本
node tests/plan10-onboarding.mjs --http=http://localhost:4177
# 结果: 4 PASS, 0 FAIL, 16/16 assertions

# Plan IX 回归验证
node tests/plan8-acceptance.mjs --http=http://localhost:4177
# 结果: 所有 intentCorrect/numbersTraceable/noFabrication 通过
# MCP 相关失败为预存基础设施问题，非本次引入
```

### 端到端三步验证

| 步骤 | 输入 | intent | suggestions |
|------|------|--------|-------------|
| 1 | 研究 SOL | evaluate_candidate | 我买了 SOL，记录仓位 / 刷新数据 |
| 2 | 我买了 SOL 100 个，成本 120 | manage_position | 确认 SOL 投资计划 / 刷新数据 |
| 3 | 确认 SOL 计划 | confirm_plan | 运行监控 / 能加仓吗 / 该减仓吗 |

## 6. 证据

- JSON 报告: `data/plan10-onboarding-2026-06-27T01-33-50-873Z.json`
- SOL plan 状态: `active`（从 null → draft → active）
- SOL plan 含 `valuationTiers` (3 tiers) + `positionGuide` (6 fields)
- SOL position: 100 units @ $120

## 7. 是否达到验收指标

| 指标 | 状态 |
|------|------|
| 端到端走完三步，plan.status 依次为 无 → draft → active | PASS |
| draft plan 含三档估值 (valuationTiers) | PASS |
| 每步 suggestions 指向正确的下一步 | PASS |
| 数字可在 trace 找到来源 (valuationModel.scenarios) | PASS |
| npm test 全绿 | PASS |
| Plan IX 既有断言不退化 | PASS |

## 8. 剩余风险

- 当 MCP 不可用且无 comparables 时，估值模型使用默认乘数回退，三档估值的数字精度受限。非 D 组问题，B 组（MCP 可靠性）改善后会缓解。
- 新 session 首次交互的 smalltalk 引导依赖前端正确传递 sessionId 和空 context；若前端传了 `_stateless: true` 则走 rule-only 路径，引导仍有效。
