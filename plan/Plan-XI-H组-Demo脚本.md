# Plan XI — H组 Demo 脚本

> **用途:** 黑客松现场 6 分钟 Demo 逐句解说词 + 操作步骤
> **语言:** 中英双语，现场视评委语言切换

---

## 0. Demo 前准备

### 预设状态 (跑一遍预热脚本)

```bash
# 注入 Demo state: SOL/BTC/ETH 各一个 active plan + 历史研究
node scripts/demo-preset.mjs
```

### Dashboard 预热

- 打开 `http://localhost:4177`
- 确认三栏正常渲染
- 确认右上角显示 "LIVE" 绿点

---

## 1. 开场 (Hook) — 30s

### 操作
无操作，Dashboard 静态展示。

### 解说词 (中文)

> Decision Brain 是一个为交易 Agent 构建的投资决策大脑。它不会替你交易，但它会记住你的每一笔投资、研究每一个资产、生成可追溯的估值计划，并在你需要的时候给出基于数据的建议。

### 解说词 (English)

> Decision Brain is an investment decision brain for trading agents. It doesn't trade for you — but it remembers every position, researches every asset, generates traceable valuation plans, and gives data-backed advice when you need it.

### 画面
- 三栏布局全景
- 委员会区 7 张 agent card "待命"
- 右栏资产看板为空 (或预设数据)

---

## 2. 快查 (Speed) — 45s

### 操作
1. 在对话框输入 `BTC 是什么`
2. 按回车发送
3. 等待回复 (目标 < 4s)
4. 回复到达后，点击 Committee 区 Asset Info card 展开 trace

### 解说词 (中文)

> 先从最简单的开始。我问它"BTC 是什么"。注意速度——它不会像通用 Chatbot 那样给一段长篇介绍，而是直接拉取真实链上数据：价格、市值、FDV。右边 Committee 面板可以看到 Asset Info agent 的调用过程。点开 trace，能看到具体调用了哪个 MCP 工具、参数是什么、花了多少毫秒。每一个数字都能追溯到数据源。

### 关键指标展示
- 延迟标签显示 (如 `1.2s` 绿色)
- Trace 展开: MCP 工具名 + 参数 + 延迟

---

## 3. 研究 (Depth) — 60s

### 操作
1. 输入 `研究一下 SOL 值不值得买`
2. 发送
3. Committee 区 7 个 agent card 依次亮起
4. 解说时指向正在变化的 card

### 解说词 (中文)

> 现在来一个真正的决策问题。我说"研究一下 SOL 值不值得买"。
>
> Chief 决策官会把任务拆解，并行派出 7 个 Agent：Memory 查我有没有买过 SOL，Macro 看宏观环境，On-chain 查链上数据，Sentiment 看市场情绪，Technical 做技术分析，News 扫新闻，Valuation 做估值。
>
> 注意看，它们不是顺序执行，而是并发的。每个 Agent 返回时带着自己的数据来源。最终的回复会综合所有 Agent 的结果，给出一个结构化的建议，而不是模糊的"可以买"或"不可以买"。

### 关键画面
- Agent card 从 "待命" -> "思考中(脉冲)" -> "完成(绿)"
- Dispatch 日志滚动
- Chief 合成后给出结构化回复

---

## 4. Bitget MCP 集成展示 — 30s

### 操作
1. 指向 Committee 面板顶部的 **Bitget MCP Skills Bar**
2. 逐一点亮正在工作中的 5 个 Bitget 技能芯片
3. 展开一个 Agent card (如 Macro) 的 trace，指向 MCP 工具名旁的金色 skill 标签

### 解说词 (中文)

> 注意看委员会面板顶部这一排金色的标签——这是 Decision Brain 接入的 5 个 Bitget 感知技能。
>
> Macro Analyst 映射到宏观指标和利率数据，Market Intel 映射到 DeFi 分析和网络状态，News Briefing 映射到新闻和社交趋势，Sentiment 映射到情绪指数和衍生品情绪，Technical Analysis 映射到技术指标和衍生品数据。
>
> 每个 Agent 返回结果时，你可以点开 trace 看到具体的 MCP 工具名称、参数和延迟。金色的标签告诉你这个数据来自哪个 Bitget 技能。整个链路是：Bitget Skill -> MCP 协议 -> Committee Agent -> Chief 综合决策。
>
> 这就是我们和普通 Chatbot 的本质区别——不是黑箱生成文字，而是可追溯的、多源数据驱动的决策流程。

### 解说词 (English)

> Look at the gold chips at the top of the committee panel — these are the 5 Bitget perception skills Decision Brain integrates.
>
> Each maps to specific MCP tools. Macro Analyst pulls macro indicators and rates. Market Intel handles DeFi analytics and network status. Sentiment tracks sentiment indexes and derivatives positioning. Technical runs technical indicators. News Briefing aggregates news and social trends.
>
> When an agent returns, you can expand its trace to see exact MCP tool names and parameters. The gold label tells you which Bitget skill provided the data. The full chain is: Bitget Skill -> MCP protocol -> Committee Agent -> Chief synthesis.
>
> This is the fundamental difference from a black-box chatbot — every piece of advice is backed by traceable, multi-source data.

### 关键画面
- Bitget Skills Bar 5 个金色芯片依次亮起
- Agent card trace 展开，金色 skill 标签可见
- 鼠标 hover 芯片显示 MCP 工具名 tooltip

---

## 5. 建仓 (Action) — 55s

### 操作
1. 输入 `我买了 SOL 100 个，成本 120`
2. 发送，等待回复
3. 指向右栏 — 新出现 SOL 仓位
4. 输入 `确认 SOL 计划`
5. 发送

### 解说词 (中文)

> 假设我决定买入。我告诉系统 "我买了 100 个 SOL，成本 120"。系统会记录这笔持仓，同时自动生成一个包含三档估值的 draft plan。
>
> 看右侧资产看板，SOL 出现了，带着计划状态的标签。注意这个估值区间条——蓝点是我当前买入价的位置，绿色是保守估值区，黄色是基准区，红色是高估值区。
>
> 我确认这个计划后，它从 draft 变成 active，系统开始持续监控。

### 关键画面
- 右栏 SOL 仓位卡片出现
- 估值区间条 + 当前价标记
- Plan badge: Draft -> Active

---

## 6. 总览 (Memory) — 45s

### 操作
1. 输入 `我的持仓总览`
2. 发送

### 解说词 (中文)

> 这是 Decision Brain 和普通 Chatbot 最大的区别之一：它有长期记忆。
>
> 我问"我的持仓总览"，它一次性列出我的全部仓位、每个仓位的计划状态、当前估值区间。它不是从聊天记录里猜，而是从持久化的状态中读取。
>
> 即使我关掉浏览器、过几天再打开，这些数据都还在。

### 关键画面
- 回复结构化列出全部仓位
- 右栏同步更新

---

## 7. 监控 (Ongoing) — 40s

### 操作
1. 输入 `现在 SOL 能加仓吗`
2. 发送

### 解说词 (中文)

> 计划 active 之后，系统在做持续监控。我问 "SOL 能加仓吗"，它不会直接说能或不能。
>
> 它会读我的 active plan——里面有三档估值区间——然后拿实时价格和这些区间对比。如果当前价在保守区内，它会说可以考虑加仓，但也会提示风险。如果在高估值区，它会建议谨慎。
>
> 所有数字都能在 trace 里找到来源。

### 关键画面
- 回复含 "当前价 vs 计划阈值" 对比
- 可追溯数字

---

## 8. 断网 (Honesty) — 30s

### 操作
1. (提前准备: 切到坏 MCP URL 或断网)
2. 输入 `BTC 是什么`
3. 发送

### 解说词 (中文)

> 最后一个场景：如果我们断网了怎么办？
>
> 它会诚实地说"当前无法获取实时数据"，而不是编一个数字。Agent card 会显示红色超时状态。这就是我们的核心原则：数字可追溯，不知道就说不知道。

### 关键画面
- Committee 区 Agent card 红态 "超时"
- 回复不含编造的数字

---

## 9. 收尾 (Close) — 30s

### 解说词 (中文)

> 总结一下：Decision Brain 做四件事——查得准、记得住、领得动、管得住。
>
> 刚才大家看到了 5 个 Bitget 感知技能如何通过 MCP 协议为 7 个 Committee Agent 提供数据，每一个数字都能追溯到源头。它是一个可被 Agent 装载的决策中台，不是另一个行情面板。
>
> 谢谢，欢迎提问。

### 解说词 (English)

> To summarize: Decision Brain does four things — accurate lookup, persistent memory, guided onboarding, and ongoing monitoring.
>
> It's a decision middleware that agents can load, not another price dashboard. We've already integrated Bitget's 5 perception skills.
>
> Thank you. Happy to take questions.

---

## 9. 关键时间节点

| 阶段 | 累计时间 | 不可超 |
|------|---------|--------|
| 开场 | 0:30 | 1:00 |
| 快查 | 1:15 | 1:30 |
| 研究 | 2:15 | 2:30 |
| Bitget 集成 | 2:45 | 3:00 |
| 建仓 | 3:40 | 4:00 |
| 总览 | 4:25 | 4:40 |
| 监控 | 5:05 | 5:20 |
| 断网 | 5:35 | 5:50 |
| 收尾 | 6:00 | 6:30 |

---

## 10. 备用/弹性

- 如果某个环节卡顿超过 10s: 刷新页面，从当前步骤继续
- 如果 MCP 数据源完全不可用: 切到 Mock 模式 (`?mock=1`)，所有视觉动效正常
- 如果浏览器崩溃: 直接播放预录视频
