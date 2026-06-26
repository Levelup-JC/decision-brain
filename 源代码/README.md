# Decision Brain MVP

Decision Brain 是一个本地优先的投资决策大脑 MVP。它的目标不是自动交易，而是让你的 Agent 在建仓后具备稳定的记忆、对标估值能力、计划确认机制和每天一次的监测节奏。

## 这个 MVP 现在能做什么

1. 记录和管理某个资产的仓位、成本、历史最高持仓和组合占比。
2. 自动生成项目调研摘要和对标估值模型。
3. 生成 `draft` 投资计划，并在确认后切换成 `active`。
4. 基于估值区间、价格曲线、底仓规则、事件和计划状态给出加仓/卖出建议。
5. 每 24 小时最多做一次新闻监测和仓位监测。
6. 保存干净的资产记忆和 Decision Trace。
7. 暴露本地 HTTP JSON 接口，方便龙虾或其他 Agent 调用。

## 这个 MVP 明确不做什么

- 不自动交易
- 不保存私钥
- 不做高频盯盘
- 不做托管

## 本地运行

```bash
cd decision-brain
npm start
```

启动后可访问：

- `http://127.0.0.1:4177/` for the dashboard
- `http://127.0.0.1:4177/api/health` for health
- `http://127.0.0.1:4177/api/capabilities` for tool contracts

如果你希望把状态文件放到别的位置，便于本地多实例或龙虾隔离调用，可以在启动前设置：

```bash
export DECISION_BRAIN_DATA_DIR=/absolute/path/to/decision-brain-data
npm start
```

或者直接指定完整文件路径：

```bash
export DECISION_BRAIN_STATE_FILE=/absolute/path/to/state.json
npm start
```

如果你就是想直接按“给龙虾长期用”的模式启动，不想自己设变量：

```bash
cd decision-brain
npm run start:lobster
```

它会默认使用 `~/.decision-brain-lobster` 作为数据目录。

## MCP 运行

如果龙虾更适合走工具协议而不是直接打 HTTP，可以直接启动本地 MCP 入口：

```bash
cd decision-brain
npm run mcp
```

如果你要直接给龙虾挂 MCP，也可以用：

```bash
cd decision-brain
npm run mcp:lobster
```

它同样会默认使用 `~/.decision-brain-lobster` 作为数据目录。

这个 MCP 入口暴露的工具包括：

- `capabilities`
- `manage_position`
- `confirm_plan`
- `get_asset_context`
- `review_add_intent`
- `review_sell_intent`
- `run_daily_monitor`
- `log_source`
- `archive_asset`

## 每日监测脚本

如果你想让系统每天自己跑一次监测，可以用：

```bash
cd decision-brain
npm run monitor:daily
```

说明：

- 默认会遵守 24 小时节奏
- 如果当天已经跑过，会自动跳过
- 如需强制执行，可直接运行 `node src/scripts/run-daily-monitor.mjs --force`

## 重置状态

如果你想在 demo 前或接入龙虾前清空本地记忆，可以执行：

```bash
cd decision-brain
npm run reset:state
```

这会重建一个干净的标准化状态文件，但不会删除代码和文档。

## 快速演示

如果你想不启 HTTP 服务，直接在本地跑一遍完整核心流程，可以执行：

```bash
cd decision-brain
npm run demo:flow
```

它会自动：

1. 重置状态
2. 纳入一个示例资产
3. 生成 draft 计划
4. 确认计划
5. 运行一次每日监测
6. 输出一份卖出建议和最终上下文摘要

## 龙虾 / Agent 接入

这个 MVP 直接暴露本地 HTTP JSON 接口，龙虾可以把它当作一个“投资顾问后端”来调用。

核心接口：

- `GET /api/capabilities`
- `POST /api/manage-position`
- `POST /api/confirm-plan`
- `POST /api/review-add-intent`
- `POST /api/review-sell-intent`
- `POST /api/run-daily-monitor`
- `GET /api/asset-context?asset=SYMBOL`
- `POST /api/archive-asset`
- `GET /api/state`

推荐调用顺序：

1. `manage-position`
   作用：建仓/关注某资产，写入仓位、生成研究、生成估值、生成 draft 计划。
2. `confirm-plan`
   作用：确认计划并切到 `active`，开始后续监测。
3. `asset-context`
   作用：龙虾每次回答用户前，先拉这个资产的完整记忆上下文。
4. `review-add-intent` / `review-sell-intent`
   作用：用户说“我想加仓/我想卖出”时调用。
5. `log-source`
   作用：把龙虾在研究过程中看到的文章、推文、判断来源追加到资产记忆里。
6. `run-daily-monitor`
   作用：每日调用一次即可，系统会自动限制为 24 小时节奏。
7. `archive-asset`
   作用：资产不再跟踪时归档，避免记忆混乱。

### 给龙虾的最小执行准则

如果你要把它接成“投资顾问脑子”，龙虾这边最好遵守这 6 条：

1. 用户第一次提到某资产时，先调 `manage-position`。
2. 用户每次问“现在怎么看 X”之前，先调 `get-asset-context`。
3. 用户问“能不能加仓”时，调 `review-add-intent`，不要只看价格。
4. 用户问“要不要卖”时，调 `review-sell-intent`，不要自己跳过计划层。
5. 每天最多调用一次 `run-daily-monitor`。
6. 外部调研结论不要只存在龙虾上下文里，要通过 `log-source` 写回 source ledger。
7. 价格曲线只能作为辅助输入，不能跳过估值、事件和 thesis。

如果你要直接照着示例跑 HTTP，可以看：

- [examples/http-demo.sh](/Users/jasoncong/Documents/New%20project/decision-brain/examples/http-demo.sh)
- [examples/lobster-mcp.config.example.json](/Users/jasoncong/Documents/New%20project/decision-brain/examples/lobster-mcp.config.example.json)

如果你想直接生成当前机器可用的龙虾 MCP 配置，可以执行：

```bash
cd decision-brain
npm run bootstrap:lobster
```

它会输出带当前绝对路径的 JSON，可直接复制进你的龙虾 MCP 配置。
输出里会优先使用当前 Node 运行时的绝对路径，减少不同客户端里的 PATH 差异。

如果你已经知道龙虾的 MCP 配置文件路径，也可以直接安装进去：

```bash
cd decision-brain
npm run install:lobster -- /absolute/path/to/mcp_config.json
```

它会保留原有配置，并自动合并 `decision-brain` 这一项。
如果目标配置文件采用的是 `servers` 结构，脚本也会自动兼容。

如果你懒得挑路径，也可以直接自动安装到推荐目标：

```bash
cd decision-brain
npm run install:lobster:auto
```

如果你要在另一个 home 目录或沙盒环境里调试配置发现/安装，可以额外设置：

```bash
export DECISION_BRAIN_HOME_DIR=/custom/home
```

安装后如果你想确认哪些 MCP 配置里已经挂上了 `decision-brain`，可以执行：

```bash
cd decision-brain
npm run verify:lobster
```

如果你不确定这台机器上有哪些常见 MCP 配置文件，可以先执行：

```bash
cd decision-brain
npm run discover:lobster
```

它会列出本机上已找到的常见候选路径。

示例：

```bash
curl -s http://127.0.0.1:4177/api/manage-position \
  -H 'content-type: application/json' \
  -d '{
    "assetQuery": "SOL",
    "units": 100,
    "averageCost": 120,
    "currentPrice": 175,
    "portfolioValue": 50000,
    "naturalLanguagePlan": "2x 回本金，3x 卖 30%，5x 再卖 30%，保留历史最高持仓 20% 底仓"
  }'
```

## 记忆系统

所有状态都保存在 `data/state.json`，并且按固定分区管理：

- `assets`
- `positions`
- `researchReports`
- `sources`
- `valuationModels`
- `plans`
- `events`
- `traces`
- `monitorState`

这样做的目的就是避免记忆混乱。每个资产的仓位、研究、估值、计划、事件、Trace 都按 `assetId` 归一管理。龙虾最稳的读取方式是直接调 `GET /api/asset-context?asset=SYMBOL`，不要自己拼接多个来源。

其中最关键的约束有两个：

1. 所有长期记忆都要回写到 Decision Brain，不让龙虾自己维护一份影子记忆。
2. 所有 active 资产的新闻和仓位监测都走 `monitorState`，默认 24 小时一次。

`researchReports` 里会额外保留这些结构化信息，方便龙虾做更像投顾的解释：

- `listedExchanges`
- `potentialExchanges`
- `exchangePathHypothesis`
- `liquidityNote`
- `factualSignals`
- `inferredSignals`

`review-add-intent` 和 `review-sell-intent` 的返回，会统一带上：

- `finalRecommendation`
- `suggestedAction`
- `coreReasons`
- `keyRisks`
- `whatChangesAdvice`
- `nextReminder`
- `priceCurveState`
- `structuredAdvice`

## 适配器现状

代码结构已经预留：

- Bitget adapters
- Surf research adapters

当前 Bitget adapter 已经支持 `refresh_research` 入口：

- 如果设置了 `BITGET_MCP_COMMAND`，会通过 MCP 调用 Bitget Skill
- 如果未设置，会明确返回 `bitget_skill_not_configured`，不会假装已经拿到真实 Bitget 数据

示例：

```bash
export BITGET_MCP_COMMAND="npx bitget-mcp-server"
```

Surf research adapter 目前仍是 mock fallback，后续需要接真实调研流程。

## 当前 GitHub-ready 状态

当前仓库已经具备：

- 可直接运行的本地 HTTP 服务
- 可直接运行的本地 MCP 服务
- 龙虾专用一键启动脚本
- Lobster MCP 配置样例
- HTTP 调用示例脚本
- GitHub Actions 测试工作流
- 标准化状态存储
- 每日一次监测约束
- 龙虾调用说明
- 基础自动化测试

当前仍然是 MVP 的地方：

- 本机尚未配置真实 Bitget MCP Server 时，Bitget Skill 只会返回未连接状态
- Surf 适配器还是 mock
- 估值逻辑仍偏启发式
- 事件跟踪还没有接真实外部数据源
