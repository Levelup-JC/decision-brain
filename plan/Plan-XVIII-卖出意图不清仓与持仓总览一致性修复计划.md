# Plan XVIII -- 卖出意图不清仓与持仓总览一致性修复计划

更新时间：2026-06-29

负责人数量：4 个以内

当前目标：修复 Demo 中最影响可信度的 P0 问题：用户表达“想卖 / 卖 30% / 可以卖吗 / 先卖 15%”时，系统只能进入卖出复盘和计划评估，不能修改或清空持仓；只有用户明确说“已经卖出”并二次确认后，才允许写入卖出记录并更新资产面板。

---

## 1. 本轮问题结论

这轮真实对话暴露的问题不是单纯回复质量问题，而是“意图评估”和“资产执行”边界没有守住。

用户流程：

1. 用户先记录 BTC：`我想买一个BTC，成本价在8万美金。`
2. 用户补充买入理由：`BTC回调了比较多了...个人想囤到一个比特币。`
3. 用户确认写入。
4. 用户恐慌表达：`我现在觉得比特币都跌到6万了，我想卖掉一半...怕它跌到3万。`
5. 用户继续说：`卖 30%`、`可以卖吗？`、`好，先卖15%。`
6. 用户问：`看我的持仓总览`
7. 系统返回：`当前暂无持仓记录。`

必须修复的底层规则：

- `review_sell` 是“卖出复盘/建议”，不能调用任何会修改仓位的函数。
- `sell_execute` 是“已发生卖出记录”，也必须先进入 pending draft，不能一句话直接改仓位。
- `确认记录卖出` 只有在存在 pending sell draft 且信息完整时，才允许减少仓位。
- `看我的持仓总览` 必须读取 `getPortfolioSummary()` 这类持久化事实源，不能读会话推断结果。
- `刷新全部研究` 只能刷新研究和 Agent trace，不能清空持仓、pending sell、pending position。

---

## 2. 本轮 Demo 标准行为

这组对话必须成为回归测试脚本：

```text
研究 BTC
我想买一个BTC，成本价在8万美金。
我当时觉得BTC回调了比较多了，所以我才买的。然后我也个人想囤到一个比特币。
确认。
我现在呢，觉得比特币都跌到6万了，我想卖掉一半的比特币，我怕它跌到3万。
卖 30%
可以卖吗？
好，先卖15%。
刷新全部研究
看我的持仓总览
```

预期结果：

- BTC 仓位仍然存在。
- 持仓总览显示 BTC `1` 个，成本 `$80000`。
- Agent 回复必须回顾用户原始买入理由和目标：`回调较多`、`想囤到一个比特币`。
- 系统可以建议分批、暂停、复盘 thesis，但不能把 `好，先卖15%` 当成已经成交。
- 如果用户想真正记录卖出，系统应追问或生成确认文案：`你是要记录已经卖出的 0.15 BTC 吗？确认后回复"确认记录卖出"。`
- 只有用户明确回复 `确认记录卖出` 后，BTC 数量才从 `1` 变成 `0.85`。

---

## 3. 负责人分工

### 负责人 1：卖出意图状态机与写入护栏

负责范围：

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/chat-orchestrator.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/server.mjs`
- 必要时补充 `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/api-service.mjs`

目标：

把卖出相关表达拆成 3 层，不允许混用。

1. `review_sell`
   - 用户只是想卖、准备卖、问能不能卖、说卖多少比例。
   - 例子：`我想卖掉一半`、`卖 30%`、`可以卖吗`、`好，先卖15%`、`怕跌到3万想清仓`。
   - 只能生成建议、复盘和 pending sell review。
   - 绝对不能调用 `managePosition({ action: "sell" })`。

2. `sell_execute_draft`
   - 用户明确说已经发生了卖出，但还没二次确认。
   - 例子：`我已经卖了 0.15 BTC`、`刚刚卖出15% BTC，帮我记录`。
   - 系统只生成待确认草稿：资产、卖出数量、卖出比例、估算剩余数量。
   - 回复必须要求：`确认记录卖出` 或 `取消`。

3. `sell_execute_confirmed`
   - 用户在 pending sell draft 存在时回复：`确认记录卖出`。
   - 这一步才允许调用 `managePosition({ action: "sell" })`。

具体任务：

- 修改分类规则：`卖 30%`、`好，先卖15%` 必须稳定进入 `review_sell`，不能进入执行分支。
- 对 `确认记录卖出` 增加上下文校验：没有 pending sell draft 时，回复“没有待确认卖出记录”，不能修改任何资产。
- pending sell draft 必须存放在对话上下文或返回给前端的结构里，字段至少包括：
  - `assetQuery`
  - `sellPct`
  - `units`
  - `sourceMessage`
  - `requiresConfirmation: true`
  - `createdAt`
- 明确写入白名单：只有 `sell_execute_confirmed` 可以调用 `managePosition(action: "sell")`。
- 在代码中增加一处保护：如果当前 intent 是 `review_sell`，即使 slots 里有 `sellPct` 或 `units`，也直接禁止仓位 mutation。

自检目标：

- 在本地跑一次 transcript replay，确认 `review_sell` 期间 `state.positions` 没有变化。
- 手动打印或断言每轮 intent：
  - `我想卖掉一半...` -> `review_sell`
  - `卖 30%` -> `review_sell`
  - `可以卖吗？` -> `review_sell`
  - `好，先卖15%。` -> `review_sell` 或 `sell_execute_draft`，但不能 mutation
  - `我已经卖了0.15 BTC，帮我记录` -> `sell_execute_draft`
  - `确认记录卖出` -> `sell_execute_confirmed`

验收条件：

- 运行新增测试后，卖出 review 的所有步骤中 BTC 数量始终是 `1`。
- 只有二次确认后，BTC 数量变成 `0.85`。
- 如果没有 pending sell draft，单独输入 `确认记录卖出` 不会修改仓位。

---

### 负责人 2：持仓总览、资产面板与数据一致性

负责范围：

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/api-service.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/server.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/portfolio.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.js`

目标：

保证左侧对话、后端 state、右侧资产面板、持仓总览回复使用同一个事实源。

具体任务：

- `看我的持仓总览` 必须调用 `getPortfolioSummary()`，不能根据最近意图、最近资产、Agent 回复或 mock 数据判断。
- `review_sell`、`refresh_research`、`run_monitor` 后必须重新拉取 portfolio summary，但不能清空已有 positions。
- 右侧资产面板显示优先级：
  1. `/api/portfolio-summary`
  2. `/api/state` 中的 active positions
  3. demo fallback，只能在完全离线且没有真实 summary 时使用
- 持仓总览里必须展示：
  - symbol
  - units
  - averageCost
  - currentPrice
  - currentValue
  - costBasisTotal
  - unrealizedPnl / unrealizedPnlPct
  - original reason / plan goal
- 修复“卖出 review 后持仓总览为空”的直接原因：检查是否有某个分支错误调用了 `store.clear()`、`removePosition()`、`managePosition(action:"sell")`，或者前端把空的临时结果覆盖了真实 summary。
- 对右侧资产面板增加空状态区分：
  - 真无持仓：显示“当前暂无持仓”
  - summary 请求失败：显示“持仓读取失败，请重试”
  - 正在刷新：保留上一次持仓，不要闪成空

自检目标：

- 先写入 BTC 1 个，成本 80000。
- 连续发送 5 条卖出 review 类消息。
- 每条消息后都调用 `/api/portfolio-summary`。
- 每次都必须看到 BTC still exists。
- 右侧 UI 不能闪成“暂无持仓”。

验收条件：

- `看我的持仓总览` 返回 BTC 1 个，成本 80000。
- `刷新全部研究` 后持仓仍然存在。
- API 和右侧面板显示一致。
- 如果网络或 Agent 失败，资产面板保留上次有效数据，并显示轻量错误提示，不清空。

---

### 负责人 3：恐慌卖出回复质量与 Demo 叙事

负责范围：

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/chat-orchestrator.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/portfolio-memory-service.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/recommendation-service.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVII-Demo脚本.md`

目标：

把“恐慌卖出时回忆初心”做成 Demo 亮点，而不是普通行情建议。

具体任务：

- `review_sell` 回复必须先读 Memory Agent / portfolio memory：
  - 当前持仓数量
  - 成本价
  - 原始买入理由
  - 投资目标
  - 是否有 targetUnits
  - 是否有 floorRule
  - 当前浮盈浮亏
- 回复结构固定为：
  1. `先别急着执行`
  2. `我先帮你回放当初买入这笔 BTC 的理由`
  3. `当前发生了什么变化`
  4. `原计划是否失效`
  5. `你有三个选择`
  6. `如果你仍要记录卖出，我会先生成待确认记录，不会直接改仓位`
- 修复价格口径矛盾：
  - 用户说“跌到6万”，系统不能回复“当前价约3万”。
  - 如果实时数据和用户口述冲突，必须写明：`你口述的是 6 万；实时数据源显示约 X；以下先按你口述场景做压力测试。`
- 禁止在建议中制造过度确定性：
  - 不要说“建议一定暂时持有不动”。
  - 改成“如果你的目标仍是囤够 1 BTC，那么此刻不应该因为恐慌直接执行；可以选择分批、设置复盘条件、或确认 thesis 失效后再卖。”
- 把 Bitget MCP 的展示点写进回复：
  - Asset Info Agent：当前价格/市值/基础市场数据
  - Sentiment Agent：恐惧贪婪、衍生品情绪
  - Technical Agent：关键支撑/压力
  - Memory Agent：本地投资初心和目标，不来自 Bitget，但与 Bitget 数据结合生成建议

自检目标：

- 使用同一段对话，确认 panic sell 回复包含：
  - `8万`
  - `6万`
  - `回调比较多`
  - `囤到一个比特币`
  - `不会直接改仓位`
  - `确认记录卖出`
- 回复不能重复两次“研究 BTC”的模板化内容。
- 回复不能要求用户“你补充数据”，而是系统自己调用可用 Agent；不可用时说明降级。

验收条件：

- 演示时用户说“我怕跌到3万想卖”，系统能明显表现出：它记得用户为什么买，也知道现在是在情绪驱动下偏离策略。
- Agent 作战室能看到 Memory、Asset Info、Sentiment、Technical 被调用或亮起。
- 回复末尾明确：这不是自动交易指令，不会直接下单或改仓位。

---

### 负责人 4：回归测试、对话导出、README 与最终验收

负责范围：

- `/Users/jasoncong/Desktop/Decision Brain/源代码/tests`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/conversation-log-service.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/README.md`
- `/Users/jasoncong/Desktop/Decision Brain/README-目录说明.md`
- `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVII-Demo脚本.md`
- `/Users/jasoncong/Desktop/Decision Brain/plan/项目完整介绍-简历与Demo素材.md`

目标：

让本轮问题以后不能复发，并把它整理成最终 Demo 和 GitHub README 的核心亮点。

具体任务：

- 新增测试文件：
  - `tests/plan18-sell-review-no-mutation.test.mjs`
  - `tests/plan18-portfolio-overview-after-sell-review.test.mjs`
  - `tests/plan18-conversation-replay.test.mjs`
- 新增 npm script：
  - `test:plan18`
- 测试必须覆盖：
  1. 记录 BTC 1 个，成本 80000。
  2. 确认后持仓 summary 有 BTC。
  3. `我想卖掉一半...怕跌到3万` 不改变仓位。
  4. `卖 30%` 不改变仓位。
  5. `可以卖吗？` 不改变仓位。
  6. `好，先卖15%。` 不改变仓位。
  7. `刷新全部研究` 不改变仓位。
  8. `看我的持仓总览` 仍显示 BTC 1 个。
  9. `我已经卖了0.15 BTC，帮我记录` 只生成 pending sell draft。
  10. `确认记录卖出` 后 BTC 变成 0.85。
- 对话导出：
  - UI 必须能导出当前测试对话 Markdown。
  - 后端必须能按 sessionId 读取完整对话日志。
  - 导出的 Markdown 中必须包含每轮 intent、assetQuery、agent fanout、是否 mutation。
- README 更新重点：
  - 项目为什么做：解决普通投资者买入时有逻辑、下跌时忘记逻辑的问题。
  - Bitget 工具包怎么用：用 MCP skills 提供市场、情绪、技术、链上信息；Decision Brain 用本地 memory/harness 约束投资决策流程。
  - Harness 怎么体现：固定测试脚本重放用户真实行为，验证 Agent 没有把“想卖”误判成“已卖”。
  - Demo 价值：不是自动交易，而是投资原则记忆、复盘和情绪护栏。
- 安全检查：
  - README 和日志不能提交 API key、私钥、真实账户信息、交易所 token、个人敏感数据。
  - 对话导出文件如果用于 GitHub，只能放 demo session，不放真实资产隐私。

自检目标：

- `npm run test:plan18` 全部通过。
- `npm run test:plan16:all` 仍通过。
- 如时间允许，跑一次 `npm test` 并记录仍失败的非本轮问题。
- 导出一份对话记录，例如：
  - `/Users/jasoncong/Desktop/Decision Brain/源代码/logs/decision-brain-demo-plan18.md`
- README 中出现“恐慌卖出护栏 / 投资初心 / Bitget MCP / Harness replay”四个关键词或对应段落。

验收条件：

- 负责人 4 必须提交一份最终验收报告：
  - `plan/Plan-XVIII-验收报告.md`
- 报告必须贴出：
  - 测试命令
  - 测试结果
  - 关键 transcript replay
  - portfolio summary JSON 关键字段
  - README 更新位置
  - 安全检查结论

---

## 4. 必须新增的验收用例

### 用例 A：卖出 review 不能清仓

初始状态：

```json
{
  "symbol": "BTC",
  "units": 1,
  "averageCost": 80000,
  "reason": "BTC回调较多，目标是囤到一个比特币"
}
```

输入：

```text
我现在觉得比特币跌到6万了，我想卖掉一半，我怕它跌到3万。
```

预期：

- intent: `review_sell`
- BTC units: `1`
- 回复包含原始理由和目标
- 回复包含“不直接记录卖出/不直接改仓位”

### 用例 B：短句卖出比例不能执行

输入：

```text
卖 30%
```

预期：

- intent: `review_sell`
- slots.sellPct: `30`
- BTC units: `1`
- 不调用 `managePosition(action:"sell")`

### 用例 C：确认咨询不能执行

输入：

```text
可以卖吗？
```

预期：

- intent: `review_sell`
- BTC units: `1`
- 回复继续复盘计划，不清空资产

### 用例 D：口语“先卖15%”不能直接执行

输入：

```text
好，先卖15%。
```

预期：

- 不允许直接 mutation。
- 系统可以回复：
  - `我先帮你生成卖出复盘/待确认记录`
  - `如果你已经完成交易，请回复"我已经卖了0.15 BTC，帮我记录"`
  - `确认记录卖出后我才会更新持仓`

### 用例 E：明确已卖出 + 二次确认才执行

输入：

```text
我已经卖了0.15 BTC，帮我记录。
确认记录卖出
```

预期：

- 第一条只生成 pending sell draft，BTC units 仍是 `1`。
- 第二条才执行，BTC units 变成 `0.85`。
- averageCost 仍为 `80000`。
- currentValue 和 portfolio summary 重新计算。

### 用例 F：刷新研究不能影响仓位

输入：

```text
刷新全部研究
看我的持仓总览
```

预期：

- refresh 后 BTC 仍存在。
- 持仓总览显示 BTC 1 个或确认卖出后的 0.85 个，取决于是否已经二次确认。
- 不允许返回 `当前暂无持仓记录`。

---

## 5. 最终 Demo 演示话术

演示时按下面脚本讲：

```text
这一段是 Decision Brain 的核心价值：它不是帮用户冲动下单，而是帮用户记住自己为什么买。

我先记录一笔 BTC：成本 8 万美金，理由是 BTC 已经明显回调，我的目标是长期囤到 1 个 BTC。

接下来我模拟真实投资者最常见的状态：价格跌到 6 万，我开始恐慌，甚至担心跌到 3 万，想卖掉一半。

这里系统不会直接把我的仓位卖掉，也不会把资产面板清空。它会先调用 Memory Agent 读出我当初的投资理由和目标，再结合 Bitget MCP 的市场、情绪和技术数据，判断这次卖出是 thesis 失效，还是情绪驱动。

如果我只是说“卖 30%”“可以卖吗”“先卖15%”，它都只会进入复盘和待确认，不会修改仓位。只有我明确说“我已经卖了0.15 BTC，帮我记录”，再回复“确认记录卖出”，系统才会更新持仓。

这个机制就是我们的 Harness：用一套固定的真实对话路径，验证 Agent 不会把建议误当执行，也不会把恐慌表达误当成交事实。
```

演示输入顺序：

```text
研究 BTC
我想买一个BTC，成本价在8万美金。
我当时觉得BTC回调了比较多了，所以我才买的。然后我也个人想囤到一个比特币。
确认。
我现在呢，觉得比特币都跌到6万了，我想卖掉一半的比特币，我怕它跌到3万。
卖 30%
可以卖吗？
好，先卖15%。
看我的持仓总览
我已经卖了0.15 BTC，帮我记录。
确认记录卖出
看我的持仓总览
```

右侧面板要观察：

- Memory Agent 被点亮：说明它读到了原始投资理由。
- Asset Info Agent 被点亮：说明 Bitget MCP 提供市场基础数据。
- Sentiment Agent 被点亮：说明 Bitget MCP 提供情绪/衍生品上下文。
- Technical Agent 被点亮：说明系统评估支撑压力，而不是只听用户恐慌。
- 资产面板在 review 阶段不变，确认记录卖出后才从 `1 BTC` 变成 `0.85 BTC`。

---

## 6. 给团队的直接对接话术

你可以直接复制下面这段发给团队：

```text
大家看最新计划：

/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVIII-卖出意图不清仓与持仓总览一致性修复计划.md

本轮只解决一个 P0 主线：用户说“想卖 / 卖30% / 可以卖吗 / 先卖15%”时，系统只能做卖出复盘，绝对不能清空或修改持仓。只有用户明确说“已经卖出”，并回复“确认记录卖出”后，才能更新仓位。

负责人 1：做卖出意图状态机和写入护栏。
负责人 2：做持仓总览、资产面板和 portfolio summary 一致性。
负责人 3：做恐慌卖出回复质量，把“记得我为什么买”做成 Demo 亮点。
负责人 4：做 Plan XVIII 回归测试、对话导出、README 和最终验收报告。

每个人只看自己负责的部分，完成后必须按计划里的“自检目标”和“验收条件”贴结果，不要只说完成了。
```

---

## 7. 本轮完成定义

本轮不是“回复看起来更聪明”就算完成。

必须同时满足：

- 卖出 review 不改变仓位。
- 已卖出记录必须二次确认。
- 持仓总览不会因为 review 分支变空。
- 右侧资产面板不会闪空。
- panic sell 回复能回顾原始投资理由和目标。
- Bitget MCP 的市场/情绪/技术数据在 Agent 作战室可见。
- 对话可以导出，便于复盘问题。
- README 把项目价值讲清楚：记住投资初心，防止恐慌时偏离原则。
