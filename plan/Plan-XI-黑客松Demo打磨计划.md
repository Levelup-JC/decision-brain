# Plan XI -- Decision Brain 黑客松 Demo 收口执行计划

> **制定日期:** 2026-06-27  
> **最新提示:** 2026-06-28 起，下一轮执行请看最新版 Plan XII：`/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XII-资产同步与UI打磨计划.md`。  
> **使用方式:** 这是 Plan XI 的历史收口入口；后续资产同步、总估值、发光曲线和 UI 打磨，以 Plan XII 为准。  
> **文件路径:** `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XI-黑客松Demo打磨计划.md`

---

## 0. 总目标

把 Decision Brain 从“功能能跑”打磨成“黑客松现场能展示、评委能看懂、Bitget MCP 价值清楚”的 Demo。

最终展示闭环：

```text
开放式对话
-> 系统理解投资语境
-> 调度 Bitget MCP 感知 Agent
-> 读取/写入 Decision Brain 记忆、估值、计划
-> 右侧资产面板清楚展示
-> Chief 输出结构化建议
-> Trace 可追溯
```

核心叙事：

```text
Bitget MCP Skills 负责市场感知；
Decision Brain 负责记忆、估值、计划和建议；
多 Agent 委员会把市场事实变成可追溯的投资判断。
```

---

## 1. 4 个负责人分工

| 负责人 | 模块 | 一句话目标 |
|---|---|---|
| 负责人 1 | 后端对话与 Chief 回复 | 让开放式投资问题能被理解，并输出稳定结构化建议 |
| 负责人 2 | Bitget MCP 与 Agent 展示 | 让评委清楚看到 Bitget MCP Skills 在工作 |
| 负责人 3 | 资产面板与 Demo 数据 | 让右侧资产、仓位、计划展示清楚，Demo 数据真实可读 |
| 负责人 4 | 测试验收与提交材料 | 保证现场路径稳定，有测试、有截图、有报告、有备用方案 |

不要再使用 G/H/I/J 作为执行分组。历史文件名里如果仍出现 H 组等字样，只作为旧文档参考，不作为本轮分工依据。

---

## 2. Demo 必须跑通的 7 步

负责人 4 最终验收时必须按这个顺序跑：

| 步骤 | 输入 | 展示目标 |
|---|---|---|
| 1 | `BTC 是什么` | 快速查资产信息，显示真实数据和 trace |
| 2 | `研究 SOL 值不值得买` | 多 Agent 并发，展示 Bitget MCP 感知层 |
| 3 | `我买了 SOL 100 个，成本 120` | 写入仓位，生成 draft plan |
| 4 | `确认 SOL 计划` | draft plan 变 active |
| 5 | `我现在怕踏空但又怕追高，你帮我整理一下思路` | 开放式策略问题被正确理解 |
| 6 | `我的持仓总览` | 展示长期记忆和组合状态 |
| 7 | `检查一下 SOL 计划` | 实时数据 vs 本地计划阈值对比 |

可选加分场景：

```text
模拟 MCP 不可用 -> 系统诚实降级，不编造价格、市值、FDV。
```

---

## 3. 负责人 1：后端对话与 Chief 回复

### 目标

解决“对话框 AI 不够智能、开放式交流理解差”的问题。

### 需要修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/chat-orchestrator.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/test/chat-orchestrator-context.test.mjs`

### 任务 1.1：新增 `dialogFrame`

每次 `/api/chat` 返回里增加：

```js
dialogFrame: {
  intent,
  assetQuery,
  confidence,
  userSituation,
  missingFields,
  nextAction,
  shouldAskClarifyingQuestion
}
```

字段要求：

| 字段 | 要求 |
|---|---|
| `intent` | 与最终 intent 一致 |
| `assetQuery` | 能识别资产时填 symbol；不能识别时为 null |
| `confidence` | `high` / `medium` / `low` |
| `userSituation` | 用一句中文说明用户当前投资处境 |
| `missingFields` | 数组，列出缺少的信息，例如 `portfolioValue`、`activePlan`、`liveData` |
| `nextAction` | 下一步动作，例如 `run_research`、`record_position`、`compare_plan_with_live_data` |
| `shouldAskClarifyingQuestion` | 只有缺少关键资产或关键仓位信息时才为 true |

示例：

```js
dialogFrame: {
  intent: "strategy_dialogue",
  assetQuery: "SOL",
  confidence: "high",
  userSituation: "用户正在围绕 SOL 做追高和踏空风险权衡",
  missingFields: [],
  nextAction: "compare_plan_with_live_data",
  shouldAskClarifyingQuestion: false
}
```

### 任务 1.2：强化开放式策略问题识别

以下输入必须进入 `strategy_dialogue`，不能进入 `unknown`：

- `我怕踏空但又怕追高`
- `我手里的那个还能拿吗`
- `下一步等什么信号`
- `现在该怎么办`
- `帮我整理一下思路`
- `这个币是不是该复盘了`

有 `context.lastAsset` 时，策略问题可以继承最近资产；但以下输入不能继承历史资产：

- `你好`
- `谢谢`
- `今天大盘怎么样`
- `现在市场怎么样`
- `帮我看看行情`

### 任务 1.3：调整 `strategy_dialogue` fanout

当前基础规则可以保留，但要更精确：

```js
strategy_dialogue:
  已有本地 position 或 plan -> ["asset_info", "memory", "valuation"]
  没有本地计划 -> ["asset_info", "memory"]
```

如果实现上暂时无法同步判断本地 plan，可以先保持 `["asset_info", "memory"]`，但必须在 `dialogFrame.missingFields` 标出 `activePlan` 缺失。

### 任务 1.4：统一 Chief 回复格式

以下 intent 的最终回复必须使用固定结构：

- `strategy_dialogue`
- `evaluate_candidate`
- `review_add`
- `review_sell`
- `run_monitor`

格式：

```text
【当前状态】
...

【关键证据】
1. ...
2. ...
3. ...

【风险与缺口】
...

【下一步建议】
...

数据来源：Bitget MCP + Decision Brain 本地记忆。以上不是自动交易指令。
```

`lookup_asset_info` 可以短一些，但必须包含：

```text
这些数字来自本轮 asset_info trace。
```

### 检测要点

必须通过：

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
npm test
```

新增或确认测试：

- `你好` 不继承 BTC/SOL
- `今天大盘怎么样` 不变成单资产查询
- `我手里的那个还能拿吗` 能继承最近资产
- `怕踏空但又怕追高` 进入 `strategy_dialogue`
- `/api/chat` 返回 `dialogFrame`
- Chief 回复包含 `当前状态 / 关键证据 / 风险与缺口 / 下一步建议`

### 完成标准

- `npm test` 全绿
- 开放式策略问题不再进入 `unknown`
- `/api/chat` 返回 `dialogFrame`
- Chief 回复结构稳定，不再是散乱模板话术

---

## 4. 负责人 2：Bitget MCP 与 Agent 展示

### 目标

解决“评委看不出 Bitget MCP 到底发挥了什么作用”的问题。

### 需要修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/chat-orchestrator.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/server.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/committee.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.html`

### 任务 2.1：新增 `dispatchPlan`

每次 `/api/chat` 返回里增加：

```js
dispatchPlan: [
  {
    role: "macro",
    label: "Macro Agent",
    provider: "Bitget MCP",
    skill: "macro-analyst",
    tools: ["macro_indicators", "rates_yields"],
    reason: "判断宏观流动性和风险偏好"
  }
]
```

所有被 fanout 的 Agent 都应该有对应 `dispatchPlan` 条目。

### 任务 2.2：固定 Agent 到 Bitget Skill 的映射

必须按这个映射展示：

| Agent role | 展示名称 | provider | skill/tools |
|---|---|---|---|
| `macro` | Macro Agent | Bitget MCP | `macro-analyst`: `macro_indicators`, `rates_yields` |
| `onchain` | Market Intel Agent | Bitget MCP | `market-intel`: `crypto_market`, `defi_analytics`, `network_status` |
| `news` | News Agent | Bitget MCP | `news-briefing`: `news_feed`, `social_trending` |
| `sentiment` | Sentiment Agent | Bitget MCP | `sentiment-analyst`: `sentiment_index`, `derivatives_sentiment` |
| `technical` | Technical Agent | Bitget MCP | `technical-analysis`: `technical_analysis`, `crypto_derivatives` |
| `asset_info` | Asset Info Agent | Bitget MCP | `crypto_market`, `dex_market` |
| `valuation` | Valuation Agent | Decision Brain | valuation engine |
| `memory` | Memory Agent | Decision Brain | local memory layer |

### 任务 2.3：Agent 卡片展示 Bitget MCP 信息

中间面板卡片不能只显示：

```text
Macro
思考中
```

必须能显示：

```text
Macro Agent
Bitget MCP · macro-analyst
工具：macro_indicators, rates_yields
完成 · 1.2s
```

Decision Brain 原生 Agent 显示：

```text
Memory Agent
Decision Brain · local memory layer
```

### 任务 2.4：Trace 展示可读化

Trace 展开区必须显示：

- tool 名
- args
- tookMs
- ok / fail
- raw snippet
- cached 标记
- 所属 provider：`Bitget MCP` 或 `Decision Brain`

### 检测要点

输入：

```text
研究 SOL 值不值得买
```

中间面板必须能看见：

- Macro Agent -> Bitget MCP
- Market Intel Agent -> Bitget MCP
- News Agent -> Bitget MCP
- Sentiment Agent -> Bitget MCP
- Technical Agent -> Bitget MCP

输入：

```text
BTC 是什么
```

必须能看到：

- Asset Info Agent
- `crypto_market` 或相关 MCP trace

### 测试命令

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
npm test
node tests/plan10-mcp-reliability.mjs --http=http://127.0.0.1:4177
node tests/plan10-dialog-acceptance.mjs --http=http://127.0.0.1:4177
```

### 完成标准

- `/api/chat` 返回 `dispatchPlan`
- UI 能显示 Bitget MCP + Skill 名 + tools
- Trace 能展开查看具体 MCP 调用
- MCP 不可用时明确显示降级，不编造数据

---

## 5. 负责人 3：资产面板与 Demo 数据

### 目标

解决“右侧资产整理很乱、Demo 数据不可靠”的问题。

### 需要修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/portfolio.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/scripts/demo-preset.mjs`

### 任务 3.1：修复手动仓位表单 bug

当前错误：

```js
asset: symbol
```

必须改成：

```js
assetQuery: symbol
```

否则 `/api/manage-position` 不会按后端契约识别资产。

### 任务 3.2：修复 `demo-preset.mjs`

当前风险：脚本写入的是数组结构：

```js
assets: []
positions: []
plans: []
```

但后端核心读取通常需要对象字典：

```js
assets: {
  asset_sol: {...}
}
positions: {
  asset_sol: {...}
}
plans: {
  asset_sol: {...}
}
```

必须改成后端真实可读结构：

```js
{
  version: 1,
  assets: {
    asset_sol: {...},
    asset_btc: {...},
    asset_eth: {...}
  },
  positions: {
    asset_sol: {...},
    asset_btc: {...},
    asset_eth: {...}
  },
  plans: {
    asset_sol: {...},
    asset_btc: {...},
    asset_eth: {...}
  },
  researchReports: {},
  valuationModels: {},
  sources: {},
  events: {},
  traces: {},
  monitorState: {}
}
```

### 任务 3.3：右侧资产列表改用 `/api/portfolio-summary`

现在右侧主要读 `/api/state` 原始数据，容易乱。

调整为：

- 顶部计数可以继续读 `/api/state`
- 资产列表优先读 `/api/portfolio-summary`
- 点击详情再读 `/api/asset-context?asset=SOL`

### 任务 3.4：资产卡片重排

每张资产卡片展示：

```text
SOL · Solana
Active / Draft / Archived

持仓：100 个
成本：$120
当前价：$142
FDV：$82B

估值区间：保守区 / 基准区 / 乐观区
研究状态：可用 / 偏薄 / 阻塞
下一次复查：2026-07-xx
```

状态标签：

- `Active`
- `Draft`
- `Needs Review`
- `Research Thin`
- `MCP Unavailable`
- `Portfolio Missing`

### 任务 3.5：详情面板改用 `/api/asset-context`

点击资产后展示：

- thesis
- catalysts
- risks
- valuation tiers
- active plan
- add zone
- sell zone
- recent sources
- recent traces
- missing basics

### 检测要点

必须验证：

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
node scripts/demo-preset.mjs
npm start
```

然后打开：

```text
http://127.0.0.1:4177
```

检查：

- 右侧能看到 SOL/BTC/ETH
- 点击 SOL 详情正常
- `我的持仓总览` 能读到 preset 数据
- `确认 SOL 计划` 不报 `Plan not found`
- 手动添加仓位成功写入后端

### 测试命令

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
npm test
node tests/plan10-memory.mjs --http=http://127.0.0.1:4177
```

### 完成标准

- `demo-preset.mjs` 写入真实后端可读 state
- 表单传 `assetQuery`
- 右侧不再重复堆“待补充”
- 资产详情来自 `/api/asset-context`

---

## 6. 负责人 4：测试验收与提交材料

### 目标

保证现场不翻车，有测试、有截图、有报告、有备用方案。

### 需要新增或更新的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan11-demo-acceptance.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XI-验收报告.md`
- `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XI-提交清单.md`
- `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XI-Demo脚本.md`
- `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XI-评委FAQ.md`

### 任务 4.1：新增 Plan XI 验收脚本

新增：

```text
/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan11-demo-acceptance.mjs
```

覆盖 7 步 Demo 路径：

```text
1. BTC 是什么
2. 研究 SOL 值不值得买
3. 我买了 SOL 100 个，成本 120
4. 确认 SOL 计划
5. 我现在怕踏空但又怕追高，你帮我整理一下思路
6. 我的持仓总览
7. 检查一下 SOL 计划
```

每一步检查：

- intent 是否正确
- assetQuery 是否正确
- reply 是否非空
- fanout 是否符合预期
- `dialogFrame` 是否存在
- `dispatchPlan` 是否存在
- 是否有 Bitget MCP trace 或明确降级说明
- 是否没有编造数字

### 任务 4.2：跑本地 HTTP 验收

启动：

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
npm start
```

验收：

```bash
node tests/plan11-demo-acceptance.mjs --http=http://127.0.0.1:4177
node tests/plan10-dialog-acceptance.mjs --http=http://127.0.0.1:4177
node tests/plan10-mcp-reliability.mjs --http=http://127.0.0.1:4177
```

### 任务 4.3：截图清单

截图目录：

```text
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XI-截图/
```

必须产出：

| 编号 | 内容 |
|---|---|
| J-01 | Dashboard 全景 |
| J-02 | BTC 快查 + trace 展开 |
| J-03 | 研究 SOL + 多 Agent 并发 |
| J-04 | Bitget MCP Skill 标签展示 |
| J-05 | SOL 资产详情面板 |
| J-06 | 检查 SOL 计划：实时 vs 计划 |
| J-07 | MCP 不可用 / 降级红态 |

### 任务 4.4：最终验收报告

新增：

```text
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XI-验收报告.md
```

格式：

```markdown
# Plan XI 验收报告

## 1. 本轮目标

## 2. 完成情况总览
| 负责人 | 模块 | 状态 | 证据 |

## 3. Demo 路径验收
| 步骤 | 输入 | 预期 | 实际 | 结果 |

## 4. Bitget MCP 展示证据
列出出现过的 Skill 和 MCP tool。

## 5. 测试结果
- npm test
- plan11-demo-acceptance
- plan10-dialog-acceptance
- mcp reliability

## 6. 截图证据
列出截图路径。

## 7. 剩余风险
网络、MCP、LLM key、部署状态。

## 8. 最终 Demo 话术
1 分钟版 / 3 分钟版 / 6 分钟版。
```

### 完成标准

- `npm test` 全绿
- `plan11-demo-acceptance` 通过
- 有截图清单
- 有最终验收报告
- 有现场 fallback：
  - 真实模式
  - mock 模式
  - 预录屏

---

## 7. 执行顺序

严格按这个顺序推进：

1. **负责人 3 先修数据基础**
   - 修 `demo-preset.mjs`
   - 修 `assetQuery` bug
   - 确认 `/api/portfolio-summary`
   - 确认 `/api/asset-context`

2. **负责人 1 做后端对话结构**
   - `dialogFrame`
   - `strategy_dialogue`
   - Chief 回复格式
   - fanout 规则

3. **负责人 2 做 Bitget MCP 可视化**
   - `dispatchPlan`
   - Agent 卡片 Skill 展示
   - MCP tool 展示
   - trace 可读性

4. **负责人 4 做最终验收**
   - `plan11-demo-acceptance.mjs`
   - 截图
   - 验收报告
   - Demo runbook 最终版

---

## 8. 每个负责人交付格式

每个人完成任务后，必须按这个格式回复：

```markdown
## 今日完成
- ...

## 修改文件
- ...

## 验证命令
- ...

## 测试结果
- ...

## 发现的问题
- ...

## 下一步
- ...
```

---

## 9. 最终完成标准

全部完成后，必须满足：

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
npm test
```

结果必须是：

```text
pass 40+
fail 0
```

并且通过：

```bash
node tests/plan11-demo-acceptance.mjs --http=http://127.0.0.1:4177
```

现场 Demo 必须能展示：

1. `BTC 是什么`：真实数据 + trace
2. `研究 SOL 值不值得买`：Bitget MCP 多 Agent
3. `我买了 SOL 100 个，成本 120`：写入仓位 + draft plan
4. `确认 SOL 计划`：draft -> active
5. `怕踏空但怕追高`：开放式策略理解
6. `我的持仓总览`：长期记忆
7. `检查 SOL 计划`：实时数据 vs 本地计划
8. MCP 不可用：诚实降级，不编造

---

## 10. 给协作者的对接说明

你只需要发这句话：

```text
请看这个计划文件：/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XI-黑客松Demo打磨计划.md
你是负责人 X，按对应章节执行。完成后按第 8 节格式回复。
```

把 `X` 换成 1、2、3、4 即可。
