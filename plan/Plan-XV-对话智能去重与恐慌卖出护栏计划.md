# Plan XV -- 对话智能去重与恐慌卖出护栏计划

> **制定日期:** 2026-06-28  
> **最新版对接入口:** `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XV-对话智能去重与恐慌卖出护栏计划.md`  
> **使用方式:** 你只需要把这个文件路径发给协作者，并告诉对方“你是负责人 1/2/3/4”。对方只看自己对应章节即可开工。  
> **重要约束:** 本轮继续只使用“负责人 1-4”，不要使用 G/H/I/J，也不要新增更多负责人。

---

## 0. 当前进展核对

### 已完成或基本完成

- Plan XIV 的核心功能已经落到代码层：
  - `源代码/src/services/conversation-log-service.mjs` 已存在。
  - 对话导出文件已经能生成，实际导出文件位于：
    - `/Users/jasoncong/Desktop/decision-brain-demo-001-20260628-1626.md`
  - `源代码/tests/plan14-conversation-log.test.mjs` 已存在。
  - `源代码/tests/plan14-dialog-continuity.test.mjs` 已存在。
  - `源代码/tests/plan14-average-cost-dialog.test.mjs` 已存在。
  - `源代码/tests/plan14-war-room-visibility.mjs` 已存在。
- 当前已验证：
  - `npm test`：54/54 通过。
  - `node --test tests/plan14-conversation-log.test.mjs`：8/8 通过。
  - `node --test tests/plan14-dialog-continuity.test.mjs`：17/17 通过。
  - `node --test tests/plan14-average-cost-dialog.test.mjs`：10/10 通过。
- Plan XIV 验收报告已存在：
  - `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIV-验收报告.md`

### 当前仍然不完整

- `package.json` 只新增了 `test:plan14:warroom`，没有新增：
  - `test:plan14:conversation-log`
  - `test:plan14:dialog`
  - `test:plan14:average-cost`
  - `test:plan14:all`
- `npm run test:plan14:warroom` 直接运行会失败，因为脚本需要 `--http=http://localhost:4177`。
- 当前环境中 `localhost:4177` 没有可访问服务，`npm start` 也遇到过端口/权限问题，因此 Plan XIII/Plan XIV 的浏览器验收必须在可启动服务的环境复验。
- Demo 视频和 `assets/demo-cover.png` 仍未在仓库中发现。

---

## 1. 最新真实对话问题诊断

诊断依据：

`/Users/jasoncong/Desktop/decision-brain-demo-001-20260628-1626.md`

这份导出只有 4 轮，但暴露了 Demo 最关键的对话质量问题。

### 问题 1：`研究 BTC` 和 `研究 BTC 是否值得买` 重复感太强

第 1 轮：

```text
用户：研究 BTC
系统：输出 BTC 当前价格、市值、FDV、链归属等基础信息。
```

第 2 轮：

```text
用户：研究 BTC 是否值得买
系统：又输出一大段研究报告，里面仍大量重复价格、宏观、情绪、新闻、链上缺口。
```

正确体验应该是：

```text
第一轮：基础资产识别 + 一句话说明“如果你要判断能不能买，我会继续调完整委员会”。
第二轮：明确承接“刚才已经查过 BTC 基础信息，现在直接进入买入判断”，不再重复基础介绍。
```

### 问题 2：对很多听不懂或模糊表达，回复模板太像

用户反馈“很多它看不懂的话，回复都一样”。这说明当前 unknown / strategy_dialogue / evaluate_candidate 的回复风格太模板化。

正确体验应该是：

- 如果用户表达模糊，但能继承上下文，系统应该给出上下文相关的澄清。
- 如果用户表达焦虑，系统应该进入投资心理/计划回看，而不是重复数据。
- 如果用户表达执行意图，系统应该进入确认流程。
- 如果真的听不懂，系统应该问一个最小问题，而不是又输出固定四段式报告。

### 问题 3：恐慌卖出没有展示产品核心价值

第 3 轮：

```text
用户：现在跌得好厉害，我有点想把BTC卖掉。
系统：建议维持仓位，但回复还是像普通行情分析。
```

第 4 轮：

```text
用户：我卖掉一个BTC。
系统：建议暂时持有观察，但没有强制拉回最初投资决策。
```

这个其实是 Decision Brain 最适合演示的核心场景：

```text
用户因为短期下跌想卖
-> 系统先识别 panic sell 风险
-> 读取最初买入理由 / 投资 thesis / 估值区间 / 底仓规则
-> 判断 thesis 是否失效
-> 如果没有失效，明确提醒“这更像恐慌卖出”
-> 给出可执行但克制的选项：暂不卖、只卖小比例、设置复查条件
```

当前系统虽然说了“不急于卖”，但没有把“避免用户忘记最初投资决策”这个价值打出来。

### 问题 4：卖出类回复没有区分“询问卖出”和“执行卖出”

用户说：

```text
我有点想把 BTC 卖掉
```

这是情绪型卖出咨询。

用户说：

```text
我卖掉一个 BTC
```

更像执行或记录卖出动作，至少应该二次确认：

```text
你是已经卖出 1 BTC，要我记录？还是你准备卖出 1 BTC，希望我先帮你检查是否违反原计划？
```

当前两者都进入了类似 `review_sell` 报告，没有足够细分。

### 问题 5：Memory Agent 返回 `add_to_existing` 明显不对

在卖出场景里，Agent 结果显示：

```text
memory: 意图: add_to_existing，资产: BTC
```

这会污染 Chief 的判断。卖出场景里 Memory 应该返回：

```text
intentResolution = review_sell / panic_sell_check / sell_execution_check
```

而不是 `add_to_existing`。

### 问题 6：导出日志里 Fanout 显示为空

导出文件中有：

```text
Fanout:
Fanout: , , , , , ,
```

这说明 `conversation-log-service.mjs` 对 `fanout` 的渲染假设是对象数组，但实际可能是字符串数组。这个会降低复盘可读性。

---

## 2. 本轮目标

Plan XV 的目标是把 Decision Brain 从“功能闭环”提升到“对话像一个真正的投资决策大脑”。

必须解决 5 件事：

1. **去重和承接。** 第二次问 BTC 时不要重复第一次的基础信息，要进入更深层判断。
2. **模糊表达不机械。** 听不懂时不能总回复同一套内容，要根据上下文问最小澄清问题。
3. **恐慌卖出护栏。** 用户因下跌想卖时，必须回看最初 thesis、买入理由、计划边界和底仓规则。
4. **卖出意图分层。** 区分“我想卖”“我已经卖”“我准备卖 1 个”“帮我判断能不能卖”。
5. **对话质量可测试。** 新增对话质量验收脚本，直接用导出日志和固定场景测“重复率、承接、恐慌卖出护栏”。

---

## 3. 负责人分工总览

| 负责人 | 模块 | 一句话目标 | 主要文件 |
|---|---|---|---|
| 负责人 1 | 对话去重与上下文承接 | 修复重复研究、模糊短句同质化回复，让 Chief 能承接上一轮 | `chat-orchestrator.mjs`, `conversation-log-service.mjs`, tests |
| 负责人 2 | 恐慌卖出护栏 | 把“想卖/卖掉 BTC”变成产品核心演示：回看 thesis、计划边界、底仓规则 | `chat-orchestrator.mjs`, `recommendation-service.mjs`, `portfolio-memory-service.mjs`, tests |
| 负责人 3 | 卖出/记录卖出数据闭环 | 区分卖出咨询、准备卖出、已卖出记录，避免把卖出误判成加仓 | `chat-orchestrator.mjs`, `api-service.mjs`, `server.mjs`, tests |
| 负责人 4 | 对话质量验收、脚本和 Demo 复盘 | 新增质量测试，修 package scripts，复验导出日志、浏览器、README/Demo 脚本 | `package.json`, tests, README, plan reports |

执行顺序：

```text
负责人 1 先修对话承接和去重
-> 负责人 2 加恐慌卖出护栏
-> 负责人 3 补卖出动作与数据闭环
-> 负责人 4 做质量验收、脚本接入和 Demo 复盘
```

---

## 4. 负责人 1：对话去重与上下文承接

### 目标

同一个资产连续追问时，Chief 必须知道“哪些已经说过”，下一轮应该推进，而不是重新研究一遍。

### 需要修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/chat-orchestrator.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/conversation-log-service.mjs`
- 新增：`/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan15-dialog-dedup.test.mjs`

### 必须完成的功能

- [ ] 在 session context 里保存最近资产的 `lastResearchSummary`：
  - `assetQuery`
  - `lastBasicInfoAt`
  - `lastDecisionAnalysisAt`
  - `lastMentionedFacts`
  - `lastSuggestedNextStep`
- [ ] `研究 BTC` 第一次可以走 `lookup_asset_info` 或基础研究。
- [ ] `研究 BTC 是否值得买` 如果上一轮刚研究过 BTC，必须升级为 `evaluate_candidate`，回复必须以承接句开头：

```text
刚才已经查过 BTC 的基础信息，这一轮我直接判断“现在是否值得买”。
```

- [ ] 第二轮不能大段重复第一轮已经说过的价格、市值、FDV。
- [ ] 如果必须引用价格，只能简短引用：

```text
当前仍在约 $60k 附近。
```

- [ ] 对模糊表达新增分流：
  - `这个呢？`
  - `那怎么办？`
  - `哪一个？`
  - `我有点慌`
  - `看不懂`
  - `你说人话`
  - `直接告诉我`
- [ ] 模糊表达不能全部回同一个模板。至少分为：
  - 追问选项型
  - 焦虑安抚型
  - 执行确认型
  - 信息不足型
  - 普通闲聊型
- [ ] `conversation-log-service.mjs` 导出 `fanout` 时必须兼容字符串数组和对象数组，不能再出现 `Fanout: , , ,`。

### 必须新增的测试

```text
研究 BTC
研究 BTC 是否值得买
```

预期：

- 第二轮 intent = `evaluate_candidate`。
- 第二轮回复包含 `刚才已经查过 BTC` 或等价承接句。
- 第二轮回复不重复完整基础信息句式：`Bitcoin (BTC) 当前价格为...市值...FDV...运行在...`。

```text
研究 BTC
哪一个？
```

预期：

- 回复必须围绕上一轮建议给 2-3 个选项。
- 不能重新输出完整 BTC 研究报告。

```text
研究 BTC
你说人话
```

预期：

- 回复必须简短翻译上一轮结论。
- 不调用完整 7 Agent fanout。

### 自检目标

- [ ] 同一资产连续问不会重复。
- [ ] 模糊短句有上下文承接。
- [ ] 导出 Markdown 的 Fanout 正常显示 agent 名称。

---

## 5. 负责人 2：恐慌卖出护栏

### 目标

把“我现在想卖 BTC”做成 Decision Brain 的核心演示能力：系统不是普通行情助手，而是帮助用户不要在恐慌中忘掉最初投资计划。

### 需要修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/chat-orchestrator.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/recommendation-service.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/portfolio-memory-service.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/api-service.mjs`
- 新增：`/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan15-panic-sell-guard.test.mjs`

### 必须完成的功能

- [ ] 新增或明确 `panic_sell_check` 对话框架。
- [ ] 这些表达必须进入恐慌卖出护栏：

```text
现在跌得好厉害，我有点想把 BTC 卖掉
我怕继续跌，想清仓
跌麻了，要不要卖
我受不了了，卖掉吧
```

- [ ] 回复必须包含固定 5 个部分：
  - `【先别急着执行】`
  - `【回看你最初的买入理由】`
  - `【计划边界】`
  - `【什么情况才该卖】`
  - `【现在建议】`
- [ ] 必须读取并引用：
  - 当前持仓数量
  - 平均成本
  - 当前价格
  - 买入理由 `position.reason`
  - research thesis
  - plan sell zone
  - floor rule / bottom position rule
  - thesis invalidators
- [ ] 如果 thesis 未失效，必须明确说：

```text
这更像情绪驱动的 panic sell，不建议直接清仓。
```

- [ ] 如果用户要卖出具体数量，必须判断是否违反底仓规则。
- [ ] 如果缺少买入理由或 plan，回复不能编造，必须说：

```text
我还没有你的原始买入理由，因此只能做风险提醒；建议先补一条 thesis。
```

- [ ] 回复不能只是“当前估值保守区，建议持有观察”，必须展示“回看初心”的产品价值。

### 必须新增的测试场景

先种子数据：

```text
BTC position:
units = 3
averageCost = 50000
reason = 长期看好 BTC 作为数字黄金和周期核心资产

BTC plan:
status = active
sellZone = 进入基准估值区或 thesis 被破坏才卖
floorRule.minimumUnits = 1
```

输入：

```text
现在跌得好厉害，我有点想把BTC卖掉。
```

预期：

- intent = `review_sell` 或 `panic_sell_check`。
- 回复包含 `先别急着执行`。
- 回复包含 `长期看好 BTC`。
- 回复包含 `panic sell` 或 `情绪驱动`。
- 回复包含 `thesis 是否失效`。
- 回复包含底仓规则。

输入：

```text
我受不了了，想清仓 BTC。
```

预期：

- 回复明确不建议直接清仓，除非 thesis 失效。
- 回复要求确认 thesis 是否被破坏。

### 自检目标

- [ ] 恐慌卖出场景成为 Demo 亮点。
- [ ] 回复里看得到用户最初投资理由。
- [ ] 回复里看得到计划边界。
- [ ] 回复里看得到明确动作建议，而不是泛泛行情分析。

---

## 6. 负责人 3：卖出/记录卖出数据闭环

### 目标

区分“想卖”“准备卖”“已经卖”，避免所有卖出表达都变成同一种 review_sell 报告。

### 需要修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/chat-orchestrator.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/server.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/api-service.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/portfolio.js`
- 新增：`/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan15-sell-intent-actions.test.mjs`

### 必须完成的功能

- [ ] 卖出表达分为 3 类：

| 用户表达 | 类型 | 系统行为 |
|---|---|---|
| `我有点想卖 BTC` | panic / review | 做恐慌卖出护栏，不改仓位 |
| `我准备卖 1 个 BTC` | planned sell | 先做计划检查，问是否确认记录 |
| `我已经卖了 1 个 BTC` | executed sell record | 进入记录卖出确认流程 |

- [ ] `我卖掉一个 BTC` 默认不能直接改仓位，必须问：

```text
你是已经卖出 1 BTC，要我记录？还是准备卖出 1 BTC，希望我先检查是否违反原计划？
```

- [ ] 如果用户回复 `已经卖了，记录`，才更新 position：

```text
newUnits = oldUnits - soldUnits
```

- [ ] 如果卖出数量超过持仓，必须阻止并说明。
- [ ] 卖出后必须更新：
  - units
  - currentValue
  - peakUnits 保留历史最高
  - realized events / traces
  - 资产主看板
- [ ] Memory Agent 在卖出场景不能返回 `add_to_existing`，必须返回 sell/review 相关 resolution。

### 必须新增测试

```text
我有点想卖 BTC
```

预期：

- 不改变持仓。
- 进入 panic sell / review。

```text
我卖掉一个 BTC
```

预期：

- 不立即改变持仓。
- 回复询问“已经卖出还是准备卖出”。

```text
我已经卖了 1 个 BTC，记录
```

预期：

- 持仓数量减少 1。
- 资产看板刷新。
- trace 记录 sell execution。

### 自检目标

- [ ] 卖出不再和加仓混淆。
- [ ] 卖出咨询不改仓位。
- [ ] 已卖出记录才改仓位。
- [ ] 导出日志能看出卖出类型。

---

## 7. 负责人 4：对话质量验收、脚本和 Demo 复盘

### 目标

把“聪不聪明”变成可验收标准。不能只跑功能测试通过，还要用真实 Demo 对话测试重复率、承接、恐慌卖出护栏。

### 需要修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/package.json`
- 新增：`/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan15-dialog-quality.test.mjs`
- 新增：`/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XV-验收报告.md`
- 更新：`/Users/jasoncong/Desktop/Decision Brain/README-目录说明.md`
- 更新：`/Users/jasoncong/Desktop/Decision Brain/源代码/README.md`

### 必须完成的脚本接入

在 `package.json` 增加：

```json
{
  "test:plan14:conversation-log": "node --test tests/plan14-conversation-log.test.mjs",
  "test:plan14:dialog": "node --test tests/plan14-dialog-continuity.test.mjs",
  "test:plan14:average-cost": "node --test tests/plan14-average-cost-dialog.test.mjs",
  "test:plan14:all": "npm run test:plan14:conversation-log && npm run test:plan14:dialog && npm run test:plan14:average-cost",
  "test:plan15:quality": "node --test tests/plan15-dialog-quality.test.mjs"
}
```

### 必须完成的对话质量测试

固定测试脚本至少包含这些场景：

```text
研究 BTC
研究 BTC 是否值得买
```

检查：

- 第二轮不重复第一轮基础介绍。
- 第二轮有承接句。
- 第二轮进入买入判断。

```text
研究 BTC
哪一个？
你说人话
```

检查：

- 两个回复不能完全一样。
- 都不能输出完整四段式行情报告。
- 必须回答上一轮上下文。

```text
现在跌得好厉害，我有点想把BTC卖掉。
```

检查：

- 包含最初买入理由。
- 包含计划边界。
- 包含 panic sell 风险提示。
- 包含明确下一步。

```text
我卖掉一个BTC。
```

检查：

- 不能直接减少仓位。
- 必须澄清“已经卖出还是准备卖出”。

### 必须更新 Demo 脚本

Demo 主线增加一个核心片段：

```text
1. 用户：我买了 BTC 3 个，成本 50000，因为长期看好 BTC 作为数字黄金。
2. 用户：确认 BTC 投资计划。
3. 用户：现在跌得好厉害，我有点想把 BTC 卖掉。
4. 系统：先回看最初买入理由和计划边界，提示这可能是 panic sell。
5. 用户：我卖掉一个 BTC。
6. 系统：先澄清这是已卖出记录，还是准备卖出前检查。
```

这个片段要成为黑客松 Demo 的亮点之一。

### 必须运行的命令

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
npm test
npm run test:plan12
npm run test:plan14:all
npm run test:plan15:quality
```

如果本地服务可启动，还必须运行：

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
npm start
```

另开终端：

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
npm run test:plan13:layout -- --http=http://localhost:4177
npm run test:plan14:warroom -- --http=http://localhost:4177
```

### 自检目标

- [ ] 对话质量测试不是只看 intent，还要检查回复文本质量。
- [ ] Plan XV 验收报告要引用真实导出文件中的问题和修复后对比。
- [ ] README/Demo 脚本里突出“恐慌卖出护栏”。
- [ ] Demo 视频录制前必须跑一遍新的恐慌卖出主线。

---

## 8. 最终交付回复格式

每个负责人完成后，必须按下面格式回复：

```text
我是负责人 X，Plan XV 对应任务已完成。

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
- 导出的对话日志路径：xxx
- 关键回复片段：xxx

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
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XV-对话智能去重与恐慌卖出护栏计划.md

你是负责人 1。你的任务是修对话去重和上下文承接：连续问 BTC 时不要重复研究，模糊短句要根据上下文推进，导出的 Fanout 也要正常显示。请只看第 4 节执行，完成后按第 8 节格式回复。
```

### 给负责人 2

```text
请看这个计划文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XV-对话智能去重与恐慌卖出护栏计划.md

你是负责人 2。你的任务是做恐慌卖出护栏：用户因为下跌想卖 BTC 时，必须回看最初买入理由、投资 thesis、计划边界和底仓规则，明确识别 panic sell 风险。请只看第 5 节执行，完成后按第 8 节格式回复。
```

### 给负责人 3

```text
请看这个计划文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XV-对话智能去重与恐慌卖出护栏计划.md

你是负责人 3。你的任务是修卖出/记录卖出闭环：区分“想卖”“准备卖”“已经卖”，卖出咨询不改仓位，已卖出记录才更新仓位，并且不能把卖出误判成加仓。请只看第 6 节执行，完成后按第 8 节格式回复。
```

### 给负责人 4

```text
请看这个计划文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XV-对话智能去重与恐慌卖出护栏计划.md

你是负责人 4。你的任务是做对话质量验收、脚本接入和 Demo 复盘：补齐 Plan XIV 的 npm scripts，新增 Plan XV 对话质量测试，确认重复研究、模糊短句、恐慌卖出护栏、卖出澄清都通过。请只看第 7 节执行，完成后按第 8 节格式回复，并明确是否允许进入最终 Demo 录制和上传 GitHub。
```

---

## 10. 本轮验收成功标准

- [ ] `研究 BTC -> 研究 BTC 是否值得买` 不再重复基础介绍。
- [ ] 第二轮 BTC 判断有明确承接句。
- [ ] `哪一个？` 能回答上一轮选项，不重新输出完整研究报告。
- [ ] `你说人话` 能简短翻译上一轮结论，不重复模板。
- [ ] `现在跌得好厉害，我有点想把BTC卖掉` 触发恐慌卖出护栏。
- [ ] 恐慌卖出回复包含最初买入理由、thesis、计划边界、底仓规则。
- [ ] 恐慌卖出回复明确提示 panic sell 风险。
- [ ] `我卖掉一个BTC` 不直接改仓位，先澄清已经卖出还是准备卖出。
- [ ] Memory Agent 在卖出场景不再显示 `add_to_existing`。
- [ ] 导出 Markdown 的 `Fanout` 不再显示为空逗号。
- [ ] Plan XIV 的新增测试有 npm script 可一键运行。
- [ ] `npm test` 通过。
- [ ] `npm run test:plan12` 通过。
- [ ] `npm run test:plan14:all` 通过。
- [ ] `npm run test:plan15:quality` 通过。
- [ ] 新导出的 Demo 对话日志能证明上述问题已经修复。
