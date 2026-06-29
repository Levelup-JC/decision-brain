# Plan XVI -- 仓位记忆 Skill 与投资初心护栏 Harness 计划

> **制定日期:** 2026-06-28  
> **最新版对接入口:** `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVI-仓位记忆Skill与投资初心护栏Harness计划.md`  
> **使用方式:** 你只需要把这个文件路径发给协作者，并告诉对方“你是负责人 1/2/3/4”。对方只看自己对应章节即可开工。  
> **重要约束:** 本轮只使用“负责人 1-4”，不要使用 G/H/I/J，也不要新增更多负责人。

---

## 0. 本轮为什么要做

Decision Brain 的核心价值不是“又一个行情聊天机器人”，而是做交易 Agent 和用户之间的**长期决策记忆层**。

普通 AI 很容易在用户情绪变化时跟着当下语境跑：用户上涨时想追高，它就分析上涨；用户下跌时想卖出，它就分析下跌。这样无法解决真实投资里最常见的问题：用户忘记自己当初为什么买、目标是什么、什么条件下才应该卖。

本轮要把 Decision Brain 升级成一个能展示给评委看的 Demo：

```text
用户有长期目标：比如囤 10 个 BTC。
系统记得当前进度：比如已经有 3 个 BTC。
系统记得投资初心：比如长期配置 BTC，不做短线。
当市场下跌、用户想恐慌卖出时，系统先回看目标、thesis、底仓规则和计划边界。
如果 thesis 没失效，系统明确提醒这更像情绪化卖出，并给出克制的可执行选择。
```

这就是本项目和普通交易助手的区别：**Decision Brain 不是执行器，而是带长期记忆和纪律约束的投资决策大脑。**

---

## 1. 本轮总目标

Plan XVI 是 Plan XV 的增强，不推翻已有工作。

继续保留并融合已有能力：

- 资产实时面板
- Agent 作战室
- Bitget MCP Skill 高亮
- 对话导出
- 仓位记录
- 平均成本与总估值更新
- Plan XV 的对话去重和恐慌卖出护栏

本轮新增核心能力：

1. 记录用户每个资产的目标仓位，例如“我要囤 10 个 BTC”。
2. 记录用户最初投资逻辑，例如“长期配置 BTC，不做短线”。
3. 用户想卖时，先回看目标、当前进度、thesis、底仓规则。
4. 区分“想卖”“准备卖”“已经卖”。
5. 用 harness 固定跑出 Demo 主线，避免现场演示不稳定。
6. 通过 MCP / Skill 接口让其他 Agent 可以调用这套能力。
7. README 必须讲清楚项目为什么存在、解决什么问题、Bitget MCP Skill 如何发挥作用。

核心原则：

```text
Decision Brain Core 是唯一事实源。
Skill / MCP 只负责暴露能力。
Harness 只负责演示和测试。
不允许 Skill 或 Harness 另建影子记忆。
```

---

## 2. 并行分工总览

本轮四个负责人可以同时开工，不要互相等待。

| 负责人 | 模块 | 一句话目标 | 独立性要求 |
|---|---|---|---|
| 负责人 1 | 核心记忆与仓位模型 | 让系统真的记住目标仓位、投资初心、底仓规则，并保证买入/卖出/加仓后资产数据正确 | 先按本计划定义字段实现，接口可先兼容旧字段 |
| 负责人 2 | 对话智能与投资初心护栏 | 让 Chief 在恐慌卖出时回看目标、当前进度、thesis 和计划边界 | 可先用 mock memory/context 写测试，不等待负责人 1 完成 |
| 负责人 3 | MCP / Skill 包装与 Harness | 把这套能力包装成可调用流程，并做一条稳定 Demo 剧本 | 可先基于现有 HTTP/MCP 工具和 fixture 编排，不等待 UI 完成 |
| 负责人 4 | README、测试、验收与安全 | 把项目为什么做讲清楚，并负责最终质量门禁和安全检查 | 可先更新 README 结构和验收清单，不等待前三人代码完成 |

并行规则：

- 每个人只修改自己职责内文件。
- 不要大规模重构别人的模块。
- 如需新增字段，统一使用第 3 节定义的字段名。
- 如果某个依赖尚未完成，先用 fixture/mock 写自测，最后再切真实接口。
- 每个人必须提交自测结果，不允许只说“已完成”。

---

## 3. 统一字段和行为契约

四个负责人都按这个契约执行，避免互相等待和互相猜。

### 3.1 仓位记忆字段

在现有 asset / position / plan / memory 体系里补充或映射以下字段：

```js
{
  investmentGoal: "长期囤 BTC",
  targetUnits: 10,
  currentUnits: 3,
  goalProgress: {
    current: 3,
    target: 10,
    label: "3 / 10"
  },
  originalThesis: "长期配置 BTC，不做短线",
  timeHorizon: "长期",
  floorRule: {
    minimumUnits: 2,
    reason: "保留长期底仓"
  },
  sellRules: [
    "thesis 失效时复盘",
    "达到估值止盈区时分批卖出",
    "不得因单日下跌直接清仓"
  ],
  panicGuard: {
    enabled: true,
    lastTriggeredAt: null
  }
}
```

要求：

- `currentUnits` 必须来自真实 position，不允许手填一份影子数据。
- `goalProgress` 可以运行时计算，不一定要持久化。
- `originalThesis` 可以优先来自 research report / position reason / confirmed plan。
- 如果缺字段，系统要追问用户补充，不要编造。

### 3.2 卖出意图分层

必须区分四类输入：

| 用户表达 | 归类 | 是否改仓位 | 正确动作 |
|---|---|---|---|
| “我想卖 BTC” | sell_review | 否 | 进入卖出复盘 |
| “跌得好厉害，我想卖 BTC” | panic_sell_review | 否 | 触发投资初心护栏 |
| “我准备卖 1 个 BTC” | planned_sell_review | 否 | 检查底仓和计划边界，要求确认 |
| “我已经卖了 1 个 BTC” | sell_execution_record | 是，但需确认 | 二次确认后记录卖出 |

### 3.3 Harness 定义

Harness 是固定 Demo / 测试剧本运行器，不是新产品功能。

推荐脚本：

```text
npm run demo:thesis-guard
npm run test:plan16
```

固定主线：

```text
1. 重置 Demo 状态
2. 写入用户目标：长期囤 10 BTC
3. 写入当前仓位：已有 3 BTC，平均成本 60000
4. 写入投资逻辑：长期配置 BTC，不做短线
5. 模拟市场下跌
6. 用户说：跌得好厉害，我想卖掉 BTC
7. 系统触发恐慌卖出护栏
8. 右侧 Agent 作战室展示 Memory / Valuation / Sentiment / Technical / Chief 调用
9. 导出完整对话和 trace
10. 自动检查关键字段是否出现
```

---

## 4. 负责人 1：核心记忆与仓位模型

### 目标

让 Decision Brain Core 成为唯一可信仓位记忆源。买入、加仓、卖出、目标仓位、投资初心都必须能落到现有状态体系里，并能被资产面板和后续 Agent 读取。

### 主要工作

- 在现有 position / plan / memory 体系里增加或映射：
  - `investmentGoal`
  - `targetUnits`
  - `goalProgress`
  - `originalThesis`
  - `timeHorizon`
  - `floorRule`
  - `sellRules`
  - `panicGuard`
- 修复新增买入和加仓后的加权平均成本。
- 修复卖出后的数量、总估值、浮盈亏、资产面板同步。
- 修复未知代币识别：
  - 用户说“买了 10000 个 BTW”时，如果系统无法确认 BTW 是什么资产，必须追问。
  - 不允许把 BTW 自动写成 XMR 或其他资产。
- 确保 `lookup_portfolio_memory` 在卖出场景返回卖出相关 intent，不返回 `add_to_existing`。

### 建议关注文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/portfolio-memory-service.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/api-service.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/plan-service.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/portfolio.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/tests/`

### 自检目标

负责人 1 交付前必须自己验证：

- [ ] 买入 1 BTC 后，资产面板显示 1 BTC。
- [ ] 再买 1 BTC，平均成本按加权公式正确变化。
- [ ] 卖出 1 BTC 后，数量减少，总估值减少。
- [ ] 设置目标 10 BTC 后，资产上下文能返回 `targetUnits = 10`。
- [ ] 当前已有 3 BTC 时，能显示或返回 `goalProgress.label = "3 / 10"`。
- [ ] 输入“买了 10000 个 BTW”时，系统追问资产身份，不写入 XMR。
- [ ] 卖出场景里 Memory Agent 不返回 `add_to_existing`。

### 交付物

- 代码改动列表
- 新增或更新的测试
- 一段自测对话或 API 输出
- 是否影响旧接口的说明

---

## 5. 负责人 2：对话智能与投资初心护栏

### 目标

让 Chief Agent 在用户恐慌卖出时，不再输出普通行情报告，而是回看用户的原始目标、当前进度、投资 thesis、底仓规则和计划边界。

### 主要工作

- 强化连续对话承接：
  - `研究 BTC` 后再问 `BTC 是否值得买`，不能重复第一轮基础信息。
- 强化模糊表达处理：
  - “哪一个？”
  - “我有点慌”
  - “不想看了”
  - “现在怎么办”
  - 这些表达要结合上下文追问或推进，不要套同一模板。
- 实现投资初心护栏回复结构：
  - 原目标是什么
  - 当前进度是多少
  - 原 thesis 是什么
  - thesis 是否失效
  - 当前卖出是否像 panic sell
  - 给出 2-3 个克制选项
- 区分四种卖出意图：
  - 想卖
  - 因下跌想卖
  - 准备卖
  - 已经卖
- 已经卖出时，不要只给建议，要进入记录确认流程。

### 建议关注文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/chat-orchestrator.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/recommendation-service.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/conversation-log-service.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/tests/`

### 标准回复样例

用户：

```text
跌得好厉害，我想把 BTC 卖掉。
```

系统必须接近这个结构：

```text
先别急着执行。

你原来的目标是：长期囤 10 个 BTC。
当前进度是：3 / 10。
你最初的投资逻辑是：长期配置 BTC，不做短线。

现在需要先判断：这个 thesis 是否失效？
如果只是短期价格下跌，而 thesis 没有失效，这更像恐慌卖出。

建议：
1. 暂不卖，先按原计划观察
2. 如果必须降风险，只卖小比例
3. 设置复查条件，而不是情绪化清仓
```

### 自检目标

负责人 2 交付前必须自己验证：

- [ ] `研究 BTC` 后再问 `BTC 是否值得买`，系统承接上一轮，不重复基础介绍。
- [ ] `跌得好厉害，我想卖 BTC` 触发投资初心护栏。
- [ ] 恐慌卖出回复包含目标仓位、当前进度、原 thesis、thesis 是否失效。
- [ ] `我准备卖 1 个 BTC` 先检查底仓和计划边界，不直接改仓位。
- [ ] `我已经卖了 1 个 BTC` 进入记录确认，不输出普通卖出建议。
- [ ] 模糊短句不会反复输出同一套四段式报告。

### 交付物

- 对话样例 5 条
- 新增或更新的对话质量测试
- 说明哪些 intent 被新增或调整

---

## 6. 负责人 3：MCP / Skill 包装与 Harness

### 目标

把“仓位记忆 + 投资初心护栏”包装成外部 Agent 可调用的能力，并做一条稳定的 Demo harness，让黑客松现场不靠运气。

### 主要工作

- 基于现有 HTTP/MCP 能力包装或补充以下工具语义：
  - `get_position_memory`
  - `confirm_investment_thesis`
  - `review_panic_sell`
  - `record_sell_execution`
  - `export_decision_context`
- 注意：可以先映射到现有工具，不强制立即拆出全新接口；但能力语义必须清楚。
- 新增 thesis guard harness：
  - 重置状态
  - 写入目标 10 BTC
  - 写入当前 3 BTC
  - 写入原始 thesis
  - 模拟下跌和恐慌卖出
  - 导出 Markdown 对话复盘
  - 输出 Agent trace
- 在 harness 输出里体现 Bitget MCP Skill 的作用：
  - Memory Agent：读取长期记忆
  - Valuation Agent：检查估值区间
  - Sentiment / Technical Agent：解释市场短期波动
  - Chief Agent：综合并阻止情绪化卖出
- 右侧 Agent 作战室继续显示 Agent 逐个亮起，Bitget MCP Skill 高亮继续保留。

### 建议关注文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/service-contract.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/mcp-server.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/scripts/`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/committee.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/tests/`

### 自检目标

负责人 3 交付前必须自己验证：

- [ ] 一条命令能跑完整 thesis guard Demo。
- [ ] Harness 输出里能看到目标 10 BTC。
- [ ] Harness 输出里能看到当前 3 BTC。
- [ ] Harness 输出里能看到原始 thesis。
- [ ] Harness 输出里能看到 panic sell 识别。
- [ ] Harness 输出没有直接建议清仓。
- [ ] Agent trace 里能看到 Memory / Valuation / Sentiment 或 Technical / Chief 的调用顺序。
- [ ] MCP / Skill 能力说明能被 README 直接引用。

### 交付物

- harness 脚本
- harness 输出样例
- MCP / Skill 能力映射说明
- Demo 运行命令

---

## 7. 负责人 4：README、测试、验收与安全

### 目标

负责人 4 是本轮最终质量门禁，也是 README 分析员。必须把项目为什么做、已经做了什么、架构是什么、Bitget MCP Skill 怎么体现、harness 怎么证明 Demo 稳定讲清楚。

### README 必须讲清楚的问题

README 不是普通安装说明，它是 GitHub 参赛页，必须回答：

1. **为什么做 Decision Brain？**
   - 交易 Agent 需要长期记忆和纪律约束。
   - 用户容易在市场波动中忘记最初目标。
   - 普通聊天 AI 容易跟随当下情绪，不能管理长期计划。

2. **Decision Brain 解决什么问题？**
   - 记住仓位、成本、目标、投资 thesis。
   - 在加仓/卖出前回看估值、事件、thesis、底仓规则。
   - 让 Bitget MCP Skill 的市场感知变成可解释的投资委员会流程。

3. **为什么不是自动交易机器人？**
   - 不保存私钥。
   - 不自动下单。
   - 只做研究、记忆、计划、复盘和建议。

4. **Bitget MCP Skill 如何发挥作用？**
   - Macro / Market Intel / News / Sentiment / Technical 作为感知层。
   - Decision Brain 把这些信号交给不同 Agent，再由 Chief 综合。
   - UI 右侧 Agent 作战室和 trace 里要能看见调用链。

5. **Harness 证明了什么？**
   - 固定跑“目标 10 BTC、当前 3 BTC、市场下跌、用户想卖”的主线。
   - 验证系统能回看投资初心，而不是输出普通行情分析。

6. **目前完成了哪些工作？**
   - 资产面板
   - Agent 作战室
   - 对话导出
   - 仓位更新
   - 对话去重
   - 恐慌卖出护栏
   - 本轮新增的目标仓位和投资初心护栏

### 测试与验收任务

- 新增或整理 Plan XVI 测试入口：
  - `npm run test:plan16`
  - `npm run demo:thesis-guard`
- 复验已有测试：
  - `npm test`
  - `npm run test:plan15:quality`
  - Plan XII / XIII / XIV 相关测试，如当前环境支持浏览器服务
- 生成验收报告：
  - `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVI-验收报告.md`
- 生成安全终审报告：
  - `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVI-安全终审报告.md`

### 安全检查清单

必须检查：

- [ ] `.env`
- [ ] API key
- [ ] state 文件
- [ ] 对话导出
- [ ] 截图
- [ ] 视频
- [ ] README 中是否暴露本地敏感路径或 token
- [ ] Git tracked 文件里是否有密钥、cookie、私钥、真实账户数据

### 自检目标

负责人 4 交付前必须自己验证：

- [ ] README 第一屏能讲清楚项目为什么做。
- [ ] README 能讲清楚 Bitget MCP Skill 的作用。
- [ ] README 能讲清楚 Decision Brain 不是交易执行器。
- [ ] README 能讲清楚仓位记忆和投资初心护栏。
- [ ] `npm test` 通过，或明确记录失败原因和负责归属。
- [ ] `npm run test:plan16` 通过，或明确记录失败原因和负责归属。
- [ ] 安全报告明确写出“是否允许上传 GitHub”。

### 交付物

- README 更新
- Plan XVI 验收报告
- Plan XVI 安全终审报告
- 最终是否允许录制 Demo / 上传 GitHub 的结论

---

## 8. 全局测试场景

四个负责人最终都要围绕这些场景收敛。

### 场景 1：目标仓位记录

输入：

```text
我要长期囤 10 个 BTC。
```

通过标准：

- 写入 `targetUnits = 10`
- 写入 `investmentGoal`
- 后续能被 asset context 读到

### 场景 2：当前进度显示

前置：

```text
当前已有 3 BTC。
目标是 10 BTC。
```

通过标准：

- 返回或显示 `3 / 10`
- 不把目标仓位当成真实持仓

### 场景 3：恐慌卖出护栏

输入：

```text
跌得好厉害，我想卖掉 BTC。
```

通过标准：

- 不直接改仓位
- 回看目标仓位
- 回看当前进度
- 回看原始 thesis
- 判断 thesis 是否失效
- 明确提示 panic sell 风险

### 场景 4：已卖出记录

输入：

```text
我已经卖了 1 个 BTC。
```

通过标准：

- 系统先确认是否记录
- 用户确认后减少持仓数量
- 总估值同步变化
- 对话日志记录本次卖出

### 场景 5：加权平均成本

输入：

```text
我买了 1 个 BTC，成本 60000。
我又买了 1 个 BTC，成本 50000。
```

通过标准：

- 当前数量为 2
- 平均成本为 55000
- 总成本为 110000

### 场景 6：未知资产识别

输入：

```text
我买了 10000 个 BTW。
```

通过标准：

- 不写成 XMR
- 不自动猜资产
- 要求用户确认 BTW 的资产身份、链或合约

### 场景 7：对话导出

通过标准：

- Markdown 导出包含：
  - 用户输入
  - 系统回复
  - fanout
  - trace
  - 调用过的 Agent
  - 关键仓位变化

### 场景 8：Agent 可见性

通过标准：

- 恐慌卖出流程中，右侧作战室顶部能看到 Agent 状态。
- 被调用 Agent 会逐个亮起。
- Bitget MCP Skill chip 继续高亮。

---

## 9. 对接话术

你可以直接复制下面的话发给协作者。

### 发给负责人 1

```text
看这个文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVI-仓位记忆Skill与投资初心护栏Harness计划.md

你是负责人 1。你的任务是核心记忆与仓位模型：目标仓位、投资 thesis、底仓规则、平均成本、卖出后资产同步、未知代币确认。请只看第 4 节执行，并按第 10 节格式回复。
```

### 发给负责人 2

```text
看这个文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVI-仓位记忆Skill与投资初心护栏Harness计划.md

你是负责人 2。你的任务是对话智能与投资初心护栏：恐慌卖出时回看原目标、当前进度、原 thesis 和计划边界，并区分想卖、准备卖、已经卖。请只看第 5 节执行，并按第 10 节格式回复。
```

### 发给负责人 3

```text
看这个文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVI-仓位记忆Skill与投资初心护栏Harness计划.md

你是负责人 3。你的任务是 MCP / Skill 包装与 harness：把仓位记忆和投资初心护栏做成可调用能力，并做一条稳定 Demo 剧本。请只看第 6 节执行，并按第 10 节格式回复。
```

### 发给负责人 4

```text
看这个文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVI-仓位记忆Skill与投资初心护栏Harness计划.md

你是负责人 4。你的任务是 README、测试、验收和安全：补 Plan XVI 测试、更新参赛 README、检查敏感信息、输出验收报告。请只看第 7 节执行，并按第 10 节格式回复。
```

---

## 10. 每个负责人的最终回复格式

每个人完成后必须按这个格式回复，方便统一验收：

```text
我是负责人 X。

完成内容：
1.
2.
3.

自测结果：
1.
2.
3.

改动文件：
1.
2.
3.

仍有风险：
1.
2.

需要其他负责人注意：
1.
2.

是否可以进入最终集成验收：
可以 / 不可以
原因：
```

---

## 11. 最终验收门槛

只有同时满足以下条件，才能进入最终 Demo 录制和 GitHub 上传：

- [ ] 四个负责人都按第 10 节提交完成回复。
- [ ] 负责人 1 的仓位模型自测通过。
- [ ] 负责人 2 的对话护栏自测通过。
- [ ] 负责人 3 的 harness 能稳定跑通。
- [ ] 负责人 4 的 README、测试、验收、安全报告完成。
- [ ] `npm test` 通过，或失败项有明确原因和负责人。
- [ ] `npm run test:plan16` 通过，或失败项有明确原因和负责人。
- [ ] README 可以作为 GitHub 参赛页。
- [ ] 安全终审报告明确允许公开上传。

