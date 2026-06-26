# Tool Cheatsheet

## 工具清单

### `capabilities`

用途：

- 读取服务定位
- 读取推荐工作流
- 读取监测频率限制

建议：

- OpenClaw 初次接入或重启后先调用一次

### `manage_position`

用途：

- 纳入一个新资产
- 记录仓位
- 自动生成研究、估值和 draft 计划

最小参数：

```json
{
  "assetQuery": "SOL"
}
```

常用完整参数：

```json
{
  "assetQuery": "SOL",
  "units": 100,
  "averageCost": 120,
  "currentPrice": 175,
  "portfolioValue": 50000,
  "naturalLanguagePlan": "2x 回本金，3x 卖 30%，保留历史最高持仓 20% 底仓"
}
```

### `confirm_plan`

用途：

- 把 `draft` 计划转成 `active`

常用参数：

```json
{
  "assetQuery": "SOL"
}
```

### `get_asset_context`

用途：

- 获取某资产完整记忆上下文

这是最重要的接口。

必须在这些场景先调用：

- 用户问“现在怎么看 X”
- 用户问“要不要加仓 X”
- 用户问“要不要卖 X”
- 用户问“这个项目目前处于什么阶段”

参数：

```json
{
  "assetQuery": "SOL"
}
```

### `review_add_intent`

用途：

- 给出最终加仓建议

参数：

```json
{
  "assetQuery": "SOL",
  "portfolioValue": 50000
}
```

重点阅读返回字段：

- `finalRecommendation`
- `suggestedAction`
- `coreReasons`
- `keyRisks`
- `whatChangesAdvice`
- `priceCurveState`
- `structuredAdvice`

### `review_sell_intent`

用途：

- 给出最终卖出建议

参数：

```json
{
  "assetQuery": "SOL",
  "requestedSellPct": 25,
  "thesisInvalidated": false
}
```

重点阅读返回字段：

- `finalRecommendation`
- `suggestedAction`
- `coreReasons`
- `keyRisks`
- `whatChangesAdvice`
- `priceCurveState`
- `structuredAdvice`

### `run_daily_monitor`

用途：

- 执行每日一次新闻和仓位监测

参数：

```json
{
  "force": false
}
```

注意：

- 默认 24 小时内重复调用会跳过

### `log_source`

用途：

- 把外部研究、新闻、推文、判断来源写回长期记忆

参数示例：

```json
{
  "assetQuery": "SOL",
  "sourceType": "tweet",
  "author": "Some Analyst",
  "title": "SOL 机构入口观察",
  "url": "https://example.com/post",
  "keyClaim": "若机构入口扩张，SOL 估值上限有继续上修空间",
  "roleInDecision": "supporting_evidence",
  "confidenceAtTime": 7
}
```

### `archive_asset`

用途：

- 停止继续跟踪某个资产
- 保留历史，但结束 active 监测

参数：

```json
{
  "assetQuery": "SOL"
}
```

## OpenClaw 的最小工具纪律

1. 不要在没读 `get_asset_context` 的情况下直接回答买卖问题。
2. 不要把长期研究只存在 OpenClaw 自己上下文里，要写回 `log_source`。
3. 不要把价格曲线当唯一决策源。
4. 不要高频调用 `run_daily_monitor`。
