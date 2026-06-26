# Lobster 集成说明

## 目标

让龙虾把 Decision Brain 当作一个“投资顾问后端”调用，而不是让龙虾自己维护碎片化记忆。

Decision Brain 负责：

- 资产记忆
- 项目调研
- 对标估值
- 投资计划状态
- 每日一次监测
- 最终投资建议

龙虾负责：

- 与用户对话
- 将用户意图映射到接口调用
- 读取 Decision Brain 的建议并转成自然语言

## 两种接入方式

### 方式 A：直接调 HTTP

适合龙虾已经有本地 HTTP 调用能力的情况。

### 方式 B：调本地 MCP

适合龙虾更像一个工具调用型 Agent 的情况。

启动：

```bash
cd decision-brain
npm run mcp
```

MCP 工具名与 HTTP 能力一一对应：

- `capabilities`
- `manage_position`
- `refresh_research`
- `confirm_plan`
- `get_asset_context`
- `review_add_intent`
- `review_sell_intent`
- `run_daily_monitor`
- `log_source`
- `archive_asset`

## Bitget Skill 接入

Decision Brain 已经预留 `refresh_research` 作为 Bitget 五个分析 Skill 的统一入口。

真实调用前需要先让运行 Decision Brain 的环境能启动 Bitget MCP Server，并设置：

```bash
export BITGET_MCP_COMMAND="npx bitget-mcp-server"
```

如果你的 Bitget MCP 启动命令不同，就把 `BITGET_MCP_COMMAND` 改成对应命令。

`refresh_research` 会尝试调用：

- `macro-analyst`
- `market-intel`
- `news-briefing`
- `sentiment-analyst`
- `technical-analysis`

调用结果会写回 Decision Brain 的来源账本，后续 `get_asset_context`、`review_add_intent`、`review_sell_intent` 都会读取这些来源。

如果没有配置 `BITGET_MCP_COMMAND`，`refresh_research` 不会假装已经拿到真实数据，而是会返回 `connectionStatus.mode = "not_configured"`，并写入 5 条 `bitget_skill_not_configured` 来源，用来提醒当前还缺真实 Bitget Skill 连接。

## 启动建议

如果你准备把它长期给龙虾用，建议单独给它一个数据目录：

```bash
cd decision-brain
export DECISION_BRAIN_DATA_DIR="$HOME/.decision-brain-lobster"
npm start
```

更省事的方式：

```bash
cd decision-brain
npm run start:lobster
```

如果你走 MCP：

```bash
cd decision-brain
export DECISION_BRAIN_DATA_DIR="$HOME/.decision-brain-lobster"
npm run mcp
```

更省事的方式：

```bash
cd decision-brain
npm run mcp:lobster
```

这样龙虾的投资记忆和你本地临时测试数据不会混在一起。

可直接参考的样例文件：

- [examples/lobster-mcp.config.example.json](/Users/jasoncong/Documents/New%20project/decision-brain/examples/lobster-mcp.config.example.json)
- [examples/http-demo.sh](/Users/jasoncong/Documents/New%20project/decision-brain/examples/http-demo.sh)

如果你不想手工改路径，直接执行：

```bash
cd decision-brain
npm run bootstrap:lobster
```

它会输出一份带当前机器真实路径的 MCP 配置 JSON。
这份 JSON 会优先写入当前 Node 运行时的绝对路径，减少不同客户端里的 PATH 差异。

如果你已经知道龙虾的 MCP 配置文件路径，可以直接安装：

```bash
cd decision-brain
npm run install:lobster -- /absolute/path/to/mcp_config.json
```

它会自动把 `decision-brain` 合并进现有配置，而不会覆盖其他 MCP server。
如果目标文件使用的是 VS Code 风格的 `servers` 结构，安装脚本也会自动兼容。

如果你不想手工挑目标路径，也可以直接：

```bash
cd decision-brain
npm run install:lobster:auto
```

它会根据本机已发现的 MCP 配置，优先选择最推荐的目标进行安装，并输出安装原因。

安装后如果你想核实哪些入口已经挂上了 `decision-brain`，可以执行：

```bash
cd decision-brain
npm run verify:lobster
```

如果你暂时不确定龙虾读的是哪个配置文件，可以先执行：

```bash
cd decision-brain
npm run discover:lobster
```

它会列出这台机器上已存在的常见 MCP 配置候选路径。

## 推荐调用模式

### 1. 用户第一次说“我建仓了某个项目”

如果龙虾刚接上这个后端，建议先调一次：

```text
GET /api/capabilities
```

它会返回：

- 服务定位
- 每日监测频率限制
- 推荐工作流
- 工具清单

调用：

```text
POST /api/manage-position
```

请求示例：

```json
{
  "assetQuery": "SOL",
  "units": 100,
  "averageCost": 120,
  "currentPrice": 175,
  "portfolioValue": 50000,
  "naturalLanguagePlan": "2x 回本金，3x 卖 30%，5x 再卖 30%，保留历史最高持仓 20% 底仓"
}
```

预期结果：

- 资产被纳入管理
- 生成研究摘要
- 生成对标估值
- 生成 `draft` 计划

随后建议立刻调用一次：

```text
POST /api/refresh-research
```

请求示例：

```json
{
  "assetQuery": "SOL"
}
```

如果 Bitget MCP 已配置，这一步会调用五个 Bitget Skill 补齐宏观、链上/机构情报、新闻、情绪和技术面信息。
如果未配置，它会明确返回未连接状态，龙虾不应该把这当成真实研究。

### 2. 用户确认计划

调用：

```text
POST /api/confirm-plan
```

请求示例：

```json
{
  "assetQuery": "SOL"
}
```

预期结果：

- 计划切换为 `active`
- 后续监测按每天一次运行

### 3. 龙虾在回答前读取上下文

调用：

```text
GET /api/asset-context?asset=SOL
```

这个接口是最重要的。它会返回：

- 资产信息
- 仓位
- 研究摘要
- 上所状态、潜在上所路径、融资 / 流动性信息
- 对标估值
- 当前计划
- 最近事件
- 最近 Trace
- 当前记忆总结

龙虾不要自己重新组织碎片记忆，优先使用这里的聚合结果。

### 4. 用户说“我想加仓”

调用：

```text
POST /api/review-add-intent
```

请求示例：

```json
{
  "assetQuery": "SOL",
  "portfolioValue": 50000
}
```

返回建议里重点可读字段：

- `finalRecommendation`
- `suggestedAction`
- `coreReasons`
- `keyRisks`
- `whatChangesAdvice`
- `priceCurveState`
- `structuredAdvice`

### 5. 用户说“我想卖出”

调用：

```text
POST /api/review-sell-intent
```

请求示例：

```json
{
  "assetQuery": "SOL",
  "requestedSellPct": 80,
  "thesisInvalidated": false
}
```

补充说明：

- 如果龙虾已经确认原始 thesis 明显失效，可以传 `thesisInvalidated: true`
- 否则默认让 Decision Brain 结合估值、事件、底仓和价格曲线给建议

### 6. 每日一次监测

调用：

```text
POST /api/run-daily-monitor
```

请求示例：

```json
{}
```

说明：

- 新闻和仓位监测默认 24 小时一次
- 未到时间时，接口会跳过更新，避免过度频繁
- 如果重要事件触发复盘，计划状态会自动切到 `needs_review`

### 6.5 龙虾在研究过程中补来源

调用：

```text
POST /api/log-source
```

请求示例：

```json
{
  "assetQuery": "SOL",
  "sourceType": "tweet",
  "author": "Some Analyst",
  "title": "SOL 生态活跃线程",
  "keyClaim": "开发者活跃和用户留存仍然强于同类高 beta L1",
  "roleInDecision": "supporting_evidence",
  "confidenceAtTime": 7
}
```

作用：

- 给资产追加结构化来源
- 后续 `asset-context` 会把这些来源一起返回
- 方便龙虾长期维持干净的 source ledger

### 7. 资产结束跟踪时归档

调用：

```text
POST /api/archive-asset
```

请求示例：

```json
{
  "assetQuery": "SOL"
}
```

作用：

- 计划状态切成 `archived`
- 清掉该资产监测状态
- 避免旧资产继续混在 active 记忆里

## 一条最推荐的龙虾工作流

```text
用户第一次提到一个项目
→ manage-position
→ get-asset-context
→ 龙虾解释调研和 draft 计划
→ 用户确认后 confirm-plan
→ 每天一次 run-daily-monitor
→ 用户问加仓时 review-add-intent
→ 用户问卖出时 review-sell-intent
→ 龙虾补外部研究时 log-source
→ 项目不再跟踪时 archive-asset
```

这个顺序的核心价值是：

1. 资产记忆永远在 Decision Brain 里，而不是散在龙虾对话上下文中。
2. 每次建议都基于统一上下文，而不是重新拼接碎片信息。
3. 每日监测频率天然受控，不会过度频繁。

## 接口设计原则

1. 龙虾永远通过 `assetQuery` 指定资产，不直接猜内部 id。
2. 龙虾回答用户前，优先读取 `asset-context`。
3. 每日监测由龙虾或调度器每天调用一次即可，不需要更频繁。
4. 归档不用删除历史数据，只改变状态，保留 Trace 和复盘能力。
5. 龙虾的新调研和引用来源，应尽量回写 `log-source`，不要停留在一次性上下文里。
6. 价格曲线只能作为辅助判断，不要只因为“涨很多”或“跌很多”就跳过估值、事件和 thesis。
