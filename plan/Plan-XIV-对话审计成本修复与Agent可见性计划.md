# Plan XIV -- 对话审计、成本修复与 Agent 可见性计划

> **制定日期:** 2026-06-28  
> **最新版对接入口:** `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIV-对话审计成本修复与Agent可见性计划.md`  
> **使用方式:** 你只需要把这个文件路径发给协作者，并告诉对方“你是负责人 1/2/3/4”。对方只看对应负责人章节即可开工。  
> **重要约束:** 本轮继续只使用“负责人 1-4”，不要使用 G/H/I/J，也不要新增更多负责人。

---

## 0. 当前进展核对

### 已完成或基本完成

- Plan XIII 已经有人继续交付，当前仓库存在：
  - `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIII-验收报告.md`
  - `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIII-安全终审报告.md`
  - `/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan13-layout-acceptance.mjs`
  - `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIII-截图/`
- Plan XIII 截图目录当前实际已有 6 张截图：
  - `desktop-assets-main.png`
  - `desktop-agent-war-room.png`
  - `desktop-after-buy-sol.png`
  - `desktop-after-agent-dispatch.png`
  - `mobile-assets-first.png`
  - `mobile-agent-war-room.png`
- 当前已验证：
  - `npm test`：54/54 通过。
  - `npm run test:plan12`：7/7 通过。
- Plan XII 专项测试里已经覆盖 API 层的加权平均成本：
  - `1 BTC @ 40000`
  - 再 `add 2 BTC @ 50000`
  - 期望平均成本约 `46666.67`

### 当前仍有问题

- `npm run test:plan13:layout -- --http=http://localhost:4177` 需要本地服务运行；当前沙箱环境启动 `npm start` 被 `EPERM 0.0.0.0:4177` 拦截，负责人 4 必须在可运行服务的本机环境复验。
- `plan/Plan-XIII-验收报告.md` 中写 Plan XIII 截图缺失，但实际截图目录已有 6 张，报告需要复验更新。
- `assets/demo-cover.png` 仍未发现。
- Demo 视频文件或有效 Release 链接仍未发现。

---

## 1. 用户真实对话问题诊断

用户提供的 BTC 测试对话暴露了 9 个问题：

### 问题 1：没有可导出的对话流程

当前测试后无法导出完整对话，也无法在后台按 session 追踪：

- 用户说了什么。
- Chief 回复了什么。
- 当时识别出的 intent 是什么。
- slots 是什么。
- fanout 调了哪些 Agent。
- 哪些 MCP tool 成功或失败。
- 哪一步写入了持仓。
- 哪一步没有写入。

这会导致测试发现问题后只能靠手工复制聊天框，无法稳定复现。

### 问题 2：“直接买一个吧”没有进入交易槽位流程

用户先说 `研究 BTC`，系统知道当前焦点是 BTC。随后用户说：

```text
不想看了，直接买一个吧。
```

系统应该理解为：

```text
assetQuery = BTC
intent = manage_position 或 prepare_buy_position
units = 1
averageCost = 当前 BTC 实时报价
需要用户确认
```

但实际系统继续输出大段研究报告，说明它没有把“直接买一个”当作连续任务。

### 问题 3：“这样你补充一下 / 我怎么补充？你补充”语义处理错误

用户让系统补充数据时，系统一会说数据不可用，一会又说数据正常，体验前后矛盾。

正确逻辑应该是：

- 如果系统说“需要补充数据”，下一步应自动触发 `refresh_research` 或对应 Agent。
- 不应该让用户自己补市场数据。
- 如果 MCP 不可用，应明确说明“我能补哪些、哪些工具不可用”，而不是来回反转。

### 问题 4：“哪一个？”没有理解成追问建议选项

用户问：

```text
哪一个？
```

这是对上一轮“下一步建议”的追问。系统应该回答：

```text
如果你现在要做一个动作，我建议先做“小额试探买入/记录 1 BTC 仓位”，而不是继续泛泛研究。
```

实际系统又重新复述 BTC 状态，缺少对话承接。

### 问题 5：“买一个”仍然没有执行

用户明确说：

```text
买一个
```

系统仍然输出研究报告，没有进入“确认 1 个 BTC，成本按当前价”的流程。

### 问题 6：“现在的价格就是我的成本”没有被自动回填

用户说：

```text
一个，现在买，现在的价格就是我的成本。
现在的价格就是我的成本。
```

系统仍然重复问“请提供成本价格”。这是槽位填充失败。

正确逻辑：

- 如果 `pendingPosition.assetQuery = BTC`
- 且最近一次 BTC 实时报价存在，如 `$60050`
- 用户说“现在的价格就是我的成本”
- 则 `averageCost = lastKnownPrice(BTC)`
- 不应继续追问成本。

### 问题 7：确认后仍提示“draft 计划需要确认”

用户最后回复：

```text
确认
```

系统写入持仓后又说“draft 计划需要确认后才能激活”。这里至少要区分两个确认：

- 确认仓位写入。
- 确认投资计划 active。

不能让用户感觉“刚确认完又让我确认一次”。回复应明确：

```text
仓位已确认写入。下一步如果你想启动监控，请回复“确认 BTC 投资计划”。
```

### 问题 8：平均成本在真实对话追加买入时没有变化

底层 API 已支持 `action: "add"` 的加权平均成本，但用户真实测试时看到：

- 新资产数量增加。
- 平均成本没有随追加买入变化。

说明自然语言路径没有稳定把“又买了 / 加仓 / 追加”转成 `action: "add"`，或前端刷新/显示使用了旧成本。

### 问题 9：右侧 Agent 动态被挤到底部，看不到启动过程

当前右侧 `addDispatchEntry()` 会把 `warRoomBody.scrollTop = warRoomBody.scrollHeight`，导致 Agent 作战室自动滚到底部。

用户想看到的是：

- 右侧顶部 Agent 卡片固定可见。
- 谁启动，谁亮。
- 动态日志可以在下面滚动，但不能把 Agent 状态卡挤出视野。

---

## 2. 本轮目标

Plan XIV 的目标是把 Demo 从“能跑功能”升级成“能复盘、能连续理解、能可信记录仓位、能看见 Agent 调度”。

必须完成 4 件事：

1. **对话全流程可记录、可导出、可复盘。**
2. **连续对话能理解用户短句，尤其是买入/补充/确认/成本回填。**
3. **追加买入必须正确更新数量、加权平均成本、总成本和组合估值。**
4. **右侧 Agent 作战室顶部固定可见，动态日志不再把 Agent 卡片挤走。**

---

## 3. 负责人分工总览

| 负责人 | 模块 | 一句话目标 | 主要文件 |
|---|---|---|---|
| 负责人 1 | 对话审计、导出与复盘 | 后台记录每轮对话和 Agent trace，前端提供导出按钮，测试问题可复盘 | `server.mjs`, `dashboard.js`, `dashboard.html`, 新增 `conversation-log-service.mjs` |
| 负责人 2 | 连续对话理解与槽位回填 | 修复“买一个”“现在价格就是成本”“你补充”“哪一个”等短句理解 | `chat-orchestrator.mjs`, `server.mjs`, tests |
| 负责人 3 | 平均成本与资产更新闭环 | 自然语言追加买入必须触发加权平均成本，前端显示同步变化 | `api-service.mjs`, `chat-orchestrator.mjs`, `portfolio.js`, tests |
| 负责人 4 | Agent 可见性、验收与报告更新 | 右侧 Agent 顶部固定可见，动态日志独立滚动，并完成完整复验报告 | `committee.js`, `dashboard.html`, `dashboard.js`, tests, reports |

执行顺序：

```text
负责人 1 先补审计记录
-> 负责人 2 修连续对话语义
-> 负责人 3 修追加买入和成本显示
-> 负责人 4 修右侧可见性并做端到端复验
```

可以并行，但最终验收必须按这个顺序复测。

---

## 4. 负责人 1：对话审计、导出与复盘

### 目标

测试时每一次对话都要能导出，后台也要能按 session 查到完整流程。以后用户发现“AI 回答不对”，不能再靠手工复制聊天框。

### 需要修改或新增的文件

- 新增：`/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/conversation-log-service.mjs`
- 修改：`/Users/jasoncong/Desktop/Decision Brain/源代码/src/server.mjs`
- 修改：`/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.js`
- 修改：`/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.html`
- 新增：`/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan14-conversation-log.test.mjs`

### 必须完成的功能

- [ ] 每次 `/api/chat` 请求都要写一条 conversation turn。
- [ ] 每条 turn 必须包含：
  - `sessionId`
  - `turnId`
  - `createdAt`
  - `userMessage`
  - `assistantReply`
  - `intent`
  - `assetQuery`
  - `slots`
  - `pendingPosition`
  - `pendingAssetConfirmation`
  - `fanout`
  - `dispatchPlan`
  - `agentResults`
  - `trace`
  - `latencyMs`
  - `degraded`
  - `error`
- [ ] 新增接口：`GET /api/conversation-log?sessionId=demo-001`
- [ ] 新增接口：`GET /api/conversation-log/export?sessionId=demo-001&format=markdown`
- [ ] Markdown 导出必须包含：
  - 对话正文
  - 每轮 intent / slots
  - Agent 调度结果
  - MCP trace 摘要
  - 最终资产写入动作
- [ ] 前端 Chief 对话 header 增加“导出对话”按钮。
- [ ] 点击导出按钮后下载 `.md` 文件，文件名建议：
  - `decision-brain-demo-001-YYYYMMDD-HHmm.md`
- [ ] 如果接口失败，前端必须显示或 console 输出明确错误。
- [ ] Reset Demo 时不要默认清空日志，除非用户点“清空日志”。

### 建议数据结构

```js
{
  sessionId: "demo-001",
  turns: [
    {
      turnId: "turn_...",
      createdAt: "2026-06-28T15:16:39.000Z",
      userMessage: "确认",
      assistantReply: "【当前状态】BTC 已写入持仓...",
      intent: "manage_position",
      assetQuery: "BTC",
      slots: { assetQuery: "BTC", units: 1, averageCost: 60000 },
      pendingPosition: null,
      pendingAssetConfirmation: null,
      fanout: [],
      dispatchPlan: [],
      agentResults: [],
      trace: [],
      latencyMs: 8000,
      degraded: false,
      error: null
    }
  ]
}
```

### 自检输入

在浏览器输入：

```text
研究 BTC
不想看了，直接买一个吧。
现在的价格就是我的成本。
确认
```

然后点击“导出对话”。

### 自检目标

- [ ] 下载得到 Markdown 文件。
- [ ] Markdown 里能看到 4 轮用户消息和 4 轮 Chief 回复。
- [ ] 每轮都有 intent。
- [ ] 能看到第二轮是否识别为买入/记录仓位。
- [ ] 能看到 pendingPosition 如何变化。
- [ ] 能看到最后是否写入持仓。
- [ ] 后台 `GET /api/conversation-log?sessionId=demo-001` 返回 JSON。

---

## 5. 负责人 2：连续对话理解与槽位回填

### 目标

修复 BTC 对话里最刺眼的问题：用户说短句时，系统要沿用上下文继续推进任务，而不是每次重新输出研究报告。

### 需要修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/chat-orchestrator.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/server.mjs`
- 新增：`/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan14-dialog-continuity.test.mjs`

### 必须完成的功能

- [ ] `研究 BTC` 后，必须保存 `lastAsset = BTC` 和 `lastKnownPrice.BTC`。
- [ ] 用户说 `不想看了，直接买一个吧` 时，必须理解为：
  - `intent = manage_position` 或 `prepare_buy_position`
  - `assetQuery = BTC`
  - `units = 1`
  - `averageCost = lastKnownPrice.BTC`，如果有最近报价
  - 进入待确认仓位流程
- [ ] 用户说 `买一个` 时，如果 `lastAsset = BTC`，同样按 `BTC 1 个` 处理。
- [ ] 用户说 `一个` 时，如果当前 `pendingPosition` 缺数量，则填 `units = 1`。
- [ ] 用户说 `现在的价格就是我的成本` 时，如果最近有该资产报价，必须填入 `averageCost = lastKnownPrice[asset]`。
- [ ] 用户说 `6万` 时，如果 pendingPosition 缺成本，必须解析为 `60000`。
- [ ] 用户说 `这样你补充一下` / `我怎么补充？你补充` 时，必须触发补数据流程，而不是要求用户自己补市场数据。
- [ ] 用户说 `哪一个？` 时，必须回答上一步建议里的可选动作，不要重新开始研究。
- [ ] 用户说 `确认` 时，如果当前是仓位确认，只确认仓位；回复必须明确下一步可选“确认 BTC 投资计划”，不要含糊地让用户重复确认。

### 必须新增的测试场景

```text
研究 BTC
不想看了，直接买一个吧。
确认
```

预期：

- 第二轮进入 pendingPosition。
- pendingPosition assetQuery = BTC。
- pendingPosition units = 1。
- 如果第一轮有价格，pendingPosition averageCost = 最近价格。
- 第三轮写入持仓。

```text
研究 BTC
我买了 BTC，记录仓位
一个，现在买，现在的价格就是我的成本。
确认
```

预期：

- 不重复问“请提供成本价格”。
- 使用最近 BTC 价格作为成本。
- 回复中明确“仓位已确认写入”。

```text
研究 BTC
这样你补充一下。
我怎么补充？你补充。
```

预期：

- 触发 `refresh_research` 或相关 Agent fanout。
- 回复不能说“请用户补充实时市场数据”。

```text
研究 BTC
不想看了，直接买一个吧。
哪一个？
```

预期：

- 回答“建议确认 1 BTC 试探仓位 / 或先补充数据”这类选项。
- 不输出完整 BTC 研究报告。

### 自检目标

- [ ] 用户短句不再变成泛泛研究。
- [ ] 成本可以从“现在价格”自动回填。
- [ ] 对话不会重复追问已经给过的信息。
- [ ] 确认语义区分“确认仓位”和“确认投资计划”。

---

## 6. 负责人 3：平均成本与资产更新闭环

### 目标

用户每次新增同一资产时，资产数量、平均成本、总成本、当前价值、组合总估值都必须同步更新。不能只变数量，不变平均成本。

### 需要修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/api-service.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/chat-orchestrator.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/server.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/portfolio.js`
- 新增：`/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan14-average-cost-dialog.test.mjs`

### 必须完成的功能

- [ ] API 层继续保留加权平均成本公式：

```text
newAverageCost = (oldUnits * oldAverageCost + addUnits * addCost) / (oldUnits + addUnits)
```

- [ ] 自然语言里这些表达必须触发 `action = "add"`：
  - `又买了`
  - `再买了`
  - `加仓`
  - `追加`
  - `补仓`
  - `买多`
  - 同一资产已有 position，用户说 `我买了 X 个 SYMBOL 成本 Y`
- [ ] 如果用户明确说“改成 / 修正为 / 实际是 / 不是追加”，才走 replace。
- [ ] 前端资产卡显示的 `averageCost` 必须来自最新 `portfolio-summary`。
- [ ] 前端必须显示 `costBasisTotal` 或至少确保详情里能看到总成本。
- [ ] 总估值必须使用 `sum(currentValue)`，不能使用 `portfolioValue` 累加。
- [ ] 写入成功后 `refreshPortfolioViews()` 必须刷新中间资产主看板。

### 必须新增的自然语言测试

```text
我买了 BTC 1 个，成本 60000
确认
我又买了 BTC 1 个，成本 70000
确认
查看我的持仓
```

预期：

- BTC 只有一张资产卡。
- units = 2。
- averageCost = 65000。
- costBasisTotal = 130000。

```text
我买了 SOL 100 个，成本 120
确认
加仓 SOL 50 个，成本 180
确认
查看我的持仓
```

预期：

- SOL 只有一张资产卡。
- units = 150。
- averageCost = 140。
- costBasisTotal = 21000。

```text
把 SOL 持仓修正为 80 个，成本 100
确认
```

预期：

- 走 replace，不是 add。
- units = 80。
- averageCost = 100。

### 自检目标

- [ ] API 直调加权成本通过。
- [ ] `/api/chat` 自然语言加权成本通过。
- [ ] 前端中间资产主看板显示新均价。
- [ ] 导出的对话日志能看到 `action = add` 或等价字段。

---

## 7. 负责人 4：Agent 可见性、验收与报告更新

### 目标

右侧 Agent 作战室必须让用户看见“谁被启动、谁正在跑、谁完成”。动态日志可以滚动，但不能把 Agent 状态卡挤到不可见位置。

### 需要修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/committee.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.html`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan13-layout-acceptance.mjs`
- 新增：`/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan14-war-room-visibility.mjs`
- 更新：`/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIV-验收报告.md`

### 必须完成的功能

- [ ] 右侧 Agent 卡片区域固定在右侧顶部。
- [ ] `warRoomBody` 不允许在每次日志追加时自动滚到底部。
- [ ] `addDispatchEntry()` 只能滚动 `dispatchLog` 内部，不能滚动整个右侧列。
- [ ] `addDynamicTraceEntry()` 只能滚动 `traceFeed` 内部。
- [ ] 被调用 Agent 必须在 1 秒内亮起。
- [ ] 多个 Agent 必须按顺序或近似顺序启动，让用户能看到动态变化。
- [ ] 动态 Trace 保留下拉/滚动能力，但不能抢走顶部 Agent 区。
- [ ] 如果右侧高度不够，Agent 区仍优先可见，日志区和 trace 区缩小并内部滚动。
- [ ] 移动端顺序仍保持：
  1. Chief 对话
  2. 资产主看板
  3. Agent 作战室
- [ ] 更新 Plan XIII 验收报告里“截图缺失”的过期描述，或在 Plan XIV 验收报告里明确修正。

### 建议实现方式

右侧结构建议变为：

```css
.col-war-room .col-body {
  display: grid;
  grid-template-rows: auto auto auto minmax(80px, 1fr) minmax(80px, 1fr);
  overflow: hidden;
}

.agent-status-panel {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--bg-surface);
}

.dispatch-log,
.trace-feed {
  overflow-y: auto;
}
```

`committee.js` 里要改掉这段行为：

```js
const body = document.getElementById("warRoomBody");
if (body) body.scrollTop = body.scrollHeight;
```

改成只滚日志容器：

```js
log.scrollTop = log.scrollHeight;
```

### 必须验收的浏览器场景

```text
SOL 值得买吗？
今天市场怎么样？
我买了 BTC 1 个，成本 60000
确认
```

验收点：

- [ ] 每轮发送后，右侧顶部 Agent 卡片仍然可见。
- [ ] 被调用 Agent 会亮。
- [ ] 调度日志在自己的框里滚动。
- [ ] 动态 Trace 在自己的框里滚动。
- [ ] 不需要用户手动往上拉才能看到 Agent 启动。

### 必须运行的命令

在可以启动本地服务的环境里运行：

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
npm test
npm run test:plan12
npm start
```

服务启动后另开终端运行：

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
npm run test:plan13:layout -- --http=http://localhost:4177
node tests/plan14-war-room-visibility.mjs --http=http://localhost:4177
```

注意：如果当前环境不能监听 `0.0.0.0:4177`，不要写“验收通过”。必须换到可启动服务的本地环境复验。

---

## 8. 最终交付回复格式

每个负责人完成后，必须按下面格式回复：

```text
我是负责人 X，Plan XIV 对应任务已完成。

1. 我改了哪些文件
- 文件 1：改了什么
- 文件 2：改了什么

2. 我完成了哪些功能
- 功能 1
- 功能 2
- 功能 3

3. 我如何自测
- 命令：xxx
- 结果：通过/失败，具体数量
- 浏览器路径：xxx
- 截图路径：xxx
- 导出的对话日志路径：xxx

4. 我发现的风险
- 风险 1：如果没有，写“无”
- 风险 2：如果没有，写“无”

5. 需要下一位负责人注意
- 注意点 1
- 注意点 2
```

负责人 4 的最终回复必须额外包含：

```text
是否允许进入最终 Demo 录制：是/否
是否允许上传 GitHub：是/否
如果否，阻塞项是：
- 阻塞项 1
- 阻塞项 2
```

---

## 9. 你可以直接复制给他们的对接消息

### 给负责人 1

```text
请看这个计划文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIV-对话审计成本修复与Agent可见性计划.md

你是负责人 1。你的任务是做对话审计、后台记录和导出功能。测试时每一轮用户消息、Chief 回复、intent、slots、Agent fanout、trace、最终写入动作都必须能导出复盘。请只看第 4 节执行，完成后按第 8 节格式回复。
```

### 给负责人 2

```text
请看这个计划文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIV-对话审计成本修复与Agent可见性计划.md

你是负责人 2。你的任务是修连续对话理解：买一个、直接买一个、现在价格就是成本、你补充、哪一个、确认等短句都要按上下文推进，不要重新输出泛泛研究报告。请只看第 5 节执行，完成后按第 8 节格式回复。
```

### 给负责人 3

```text
请看这个计划文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIV-对话审计成本修复与Agent可见性计划.md

你是负责人 3。你的任务是修平均成本和资产更新闭环：自然语言追加买入必须触发加权平均成本，资产数量、均价、总成本、组合估值和前端显示都要同步更新。请只看第 6 节执行，完成后按第 8 节格式回复。
```

### 给负责人 4

```text
请看这个计划文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIV-对话审计成本修复与Agent可见性计划.md

你是负责人 4。你的任务是修右侧 Agent 作战室可见性，并做最终复验：Agent 卡片必须固定在右侧顶部，动态日志只在自己的区域滚动，不能把 Agent 启动状态挤到页面下方。还要更新验收报告，复跑 npm test、Plan XII、Plan XIII layout、Plan XIV war-room 测试。请只看第 7 节执行，完成后按第 8 节格式回复，并明确是否允许进入最终 Demo 录制和上传 GitHub。
```

---

## 10. 本轮验收成功标准

- [ ] 可以从前端导出当前 session 的完整对话 Markdown。
- [ ] 后台可以查询当前 session 的完整 conversation log JSON。
- [ ] 导出日志里能看到每轮 intent、slots、fanout、trace、写入动作。
- [ ] `研究 BTC -> 不想看了，直接买一个吧` 能进入 1 BTC 待确认仓位。
- [ ] `现在的价格就是我的成本` 能自动使用最近 BTC 价格。
- [ ] `这样你补充一下 / 我怎么补充？你补充` 能触发系统补数据，而不是要求用户手动补市场数据。
- [ ] `哪一个？` 能回答上一轮建议里的选项。
- [ ] 同一资产追加买入后，平均成本按加权公式变化。
- [ ] 中间资产主看板显示最新数量、均价、总成本、当前价值。
- [ ] 右侧 Agent 卡片始终在顶部可见。
- [ ] 调度日志和动态 Trace 只在各自区域滚动。
- [ ] `npm test` 通过。
- [ ] `npm run test:plan12` 通过。
- [ ] `npm run test:plan13:layout -- --http=http://localhost:4177` 在服务运行时通过。
- [ ] Plan XIV 新增测试全部通过。
- [ ] Plan XIV 验收报告与实际文件状态一致，不再出现“截图已存在但报告说缺失”的错位。
