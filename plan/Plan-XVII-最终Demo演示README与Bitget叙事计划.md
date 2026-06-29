# Plan XVII -- 最终 Demo 演示、README 与 Bitget 叙事收口计划

> **制定日期:** 2026-06-29  
> **最新版对接入口:** `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVII-最终Demo演示README与Bitget叙事计划.md`  
> **使用方式:** 你只需要把这个文件路径发给协作者，并告诉对方“你是负责人 1/2/3/4”。对方只看自己对应章节即可开工。  
> **重要约束:** 本轮继续只使用“负责人 1-4”，不要使用 G/H/I/J，也不要新增更多负责人。

---

## 0. 最终 Demo 要讲清楚的一句话

Decision Brain 不是自动交易机器人，也不是普通行情聊天助手。

它解决的是一个真实投资痛点：

```text
用户买一个代币时，往往有一个当时的判断：为什么买、估值怎么看、准备持有多久、什么时候该加仓或卖出。
但市场一回撤，用户很容易忘记一开始的投资逻辑，被短期情绪牵着走。
Decision Brain 要做的事，就是把“当初为什么买”和“现在该不该偏离计划”记下来、调出来、解释清楚。
```

最终 Demo 的核心表达：

```text
Bitget MCP Skills 提供市场感知。
Decision Brain 提供长期记忆、估值纪律和计划复盘。
Chief Agent 把两者合在一起，避免用户在波动中忘记自己的投资原则。
```

---

## 1. 当前进展判断

从当前仓库看，项目已经具备最终 Demo 的基本骨架：

- `/Users/jasoncong/Desktop/Decision Brain/源代码/README.md` 已经写入：
  - 为什么做 Decision Brain
  - 仓位记忆与目标追踪
  - 投资初心护栏 Thesis Guard
  - Bitget MCP Skill 与 Agent 作战室
  - `npm run demo:thesis-guard`
- `/Users/jasoncong/Desktop/Decision Brain/README-目录说明.md` 已经写成 GitHub 首页导览风格。
- `/Users/jasoncong/Desktop/Decision Brain/源代码/package.json` 已经包含：
  - `demo:thesis-guard`
  - `test:plan16`
  - `test:plan16:all`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/scripts/demo-thesis-guard.mjs` 已存在。
- `/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan16-thesis-guard.test.mjs` 已存在。
- `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVI-仓位记忆Skill与投资初心护栏Harness计划.md` 已经定义了功能收口。

本轮 Plan XVII 不重做功能，专门解决：

1. 最终 Demo 怎么演示。
2. 演示时怎么说。
3. README 怎么写成参赛页面。
4. Bitget MCP / Skill 怎么突出。
5. 每个负责人怎么自查，不让你再二次兜底。

---

## 2. 最终 Demo 推荐结构

### 2.1 Demo 时长

推荐控制在 3-5 分钟。

不要演示太多分支，只演示一条最能打动评委的主线：

```text
研究 BTC
记录投资目标：长期囤 10 BTC
记录当前仓位：已有 3 BTC，成本 60000
展示 Bitget MCP / Agent 作战室如何补市场感知
用户因为下跌想卖
Decision Brain 回看投资初心和估值纪律
系统不直接交易，而是给出克制建议
最后展示对话导出和 trace
```

### 2.2 Demo 分镜

#### 分镜 1：开场定位，20 秒

画面：

- 打开 Dashboard。
- 指一下三栏：
  - 左侧 Chief 对话
  - 中间资产面板
  - 右侧 Agent 作战室

口播：

```text
Decision Brain 不是自动下单机器人，而是交易 Agent 的长期决策记忆层。
它解决的问题是：用户买一个资产时有自己的逻辑和估值判断，但市场波动后很容易忘记当初为什么买。
我们让 Agent 不只看当下行情，而是能回看仓位、成本、目标、原始 thesis 和计划边界。
```

自查：

- [ ] 第一屏能看到三栏布局。
- [ ] 中间资产面板不是空白或错位。
- [ ] 右侧 Agent 作战室能看到 Agent 状态灯和 Bitget MCP Skills 区域。

#### 分镜 2：研究资产，40 秒

用户输入：

```text
研究 BTC
```

要展示：

- Chief 理解资产。
- 右侧 Agent 逐个亮起。
- Bitget MCP Skills 高亮或 trace 能看到宏观、市场情报、新闻、情绪、技术面。

口播：

```text
这里我们用 Bitget MCP Skills 做市场感知层。
宏观、市场情报、新闻、情绪和技术面，不是由大模型凭空编出来，而是通过 MCP 工具进入不同 Agent。
Decision Brain 再把这些感知结果变成可追溯的决策上下文。
```

自查：

- [ ] 右侧至少能看到 Memory / Macro / Sentiment / Technical / News / Valuation 中多个 Agent 状态变化。
- [ ] Bitget MCP Skill chip 或 trace 中出现 Skill / MCP tool 名称。
- [ ] 回复不要只是一段普通行情总结，要能看出来源或 trace。

#### 分镜 3：记录投资目标和仓位，50 秒

用户输入建议：

```text
我的目标是长期囤 10 个 BTC。
```

然后：

```text
我现在已经有 3 个 BTC，平均成本 60000。我的逻辑是长期配置 BTC，不做短线。
```

要展示：

- 中间资产面板更新 BTC。
- 当前数量、成本、估值变化。
- 资产上下文里有目标和 thesis。

口播：

```text
这一步是 Decision Brain 和普通聊天机器人的关键区别。
它不是只回答“BTC 怎么样”，而是把用户自己的投资目标记下来：
目标是 10 个 BTC，现在是 3 个 BTC，成本是 60000，原始 thesis 是长期配置，不做短线。
后面每一次加仓、卖出、复盘，都会回到这个上下文。
```

自查：

- [ ] 资产面板出现 BTC。
- [ ] BTC 数量是 3。
- [ ] 平均成本是 60000。
- [ ] 目标仓位或上下文能体现 10 BTC。
- [ ] thesis 能在对话或详情中看到。

#### 分镜 4：市场下跌，用户想卖，70 秒

用户输入：

```text
现在跌得好厉害，我有点想把 BTC 卖掉。
```

理想回复必须包含：

- 原始目标：长期囤 10 BTC
- 当前进度：3 / 10
- 原始 thesis：长期配置 BTC，不做短线
- 当前需要判断 thesis 是否失效
- 如果只是价格波动，更像恐慌卖出
- 给出克制选项：暂不卖 / 小比例降风险 / 设置复查条件

口播：

```text
这是 Demo 最重要的一幕。
用户现在不是单纯问行情，而是情绪上想偏离原计划。
Decision Brain 会先把他拉回最初的投资原则：你原来想囤 10 个，现在只有 3 个；你当时的逻辑是长期配置，不是短线。
所以系统不会直接说卖或不卖，而是先判断 thesis 有没有失效。
这就是我们说的投资初心护栏。
```

自查：

- [ ] 回复包含目标、进度、thesis。
- [ ] 回复明确识别 panic sell / 情绪化卖出风险。
- [ ] 没有直接建议清仓。
- [ ] 没有自动修改仓位。
- [ ] 右侧 Agent 作战室能看到本轮调用。

#### 分镜 5：展示 trace 和导出，40 秒

要展示：

- 右侧动态 trace。
- 对话导出 Markdown。
- Harness 输出或 `demo:thesis-guard` 输出。

口播：

```text
最后，这个 Demo 不是只靠现场聊天碰运气。
我们有固定 harness：它会重置状态、写入目标、写入仓位、模拟下跌和恐慌卖出，然后检查系统有没有回看目标、thesis 和计划边界。
所以这个能力既能在 UI 里展示，也能被测试脚本验证。
```

自查：

- [ ] `npm run demo:thesis-guard` 能生成可读输出。
- [ ] 导出内容包含用户输入、系统回复、Agent fanout / trace。
- [ ] 关键句能证明系统回看了投资初心。

---

## 3. README 最终结构

README 必须像参赛页面，而不是普通工程说明。

建议顶层 README 使用这个结构：

```text
# Decision Brain

一句话：
给交易 Agent 装上长期记忆、仓位上下文、估值纪律和投资初心护栏。

## 为什么做
讲用户买币时有初衷、有估值判断、有目标，但回撤时容易忘记。

## 解决什么痛点
1. Agent 没有长期记忆
2. 用户忘记当初为什么买
3. 市场波动导致情绪化卖出
4. 普通行情助手无法结合仓位、成本、估值、计划
5. 建议不可追溯

## 核心 Demo
目标 10 BTC，当前 3 BTC，市场下跌，用户想卖，系统回看 thesis。

## Bitget MCP Skills 怎么用
列出 5 个感知 Skill，说明它们对应右侧 Agent。

## 架构
Chief 对话编排 + Portfolio Memory + Valuation Engine + Bitget MCP Adapter + Agent War Room + Trace。

## 已完成
Dashboard、资产面板、Agent 作战室、Bitget Skill 高亮、仓位记忆、Thesis Guard、Harness、测试。

## 如何运行
npm start
npm run demo:thesis-guard
npm run test:plan16

## 安全边界
不自动交易、不保存私钥、不托管资金。
```

README 自查标准：

- [ ] 第一屏能看懂项目定位。
- [ ] 3 分钟内能看懂为什么它不是普通聊天机器人。
- [ ] 明确写出用户痛点：买入初衷、估值判断、回撤后忘记原则。
- [ ] 明确写出 Bitget MCP Skills 的作用。
- [ ] 明确写出不使用 Bitget 交易 API、不自动交易。
- [ ] Demo 命令和测试命令可复制运行。

---

## 4. Bitget MCP / Skill 叙事方式

### 4.1 不要这样讲

不要只说：

```text
我们接入了 Bitget MCP。
```

这太弱，评委听完不知道它解决了什么。

### 4.2 要这样讲

推荐表达：

```text
Bitget MCP Skills 在这里不是装饰，而是 Decision Brain 的市场感知层。
宏观、市场情报、新闻、情绪、技术分析这些 Skill 分别映射到不同 Agent。
这些 Agent 不直接给交易指令，而是把市场变化、情绪变化和技术状态提供给 Chief。
Chief 再结合用户长期记忆、仓位成本、目标仓位、估值区间和 thesis，决定这次卖出到底是理性复盘，还是恐慌卖出。
```

### 4.3 Demo 中必须显形的 Bitget 点

- [ ] 右侧有 Bitget MCP Skills 区域。
- [ ] Agent 卡片或 trace 显示 Skill / MCP tool。
- [ ] 至少解释 5 个感知方向：
  - Macro：宏观与风险偏好
  - Market Intel：市场与链上情报
  - News：新闻事件
  - Sentiment：恐惧贪婪、情绪和衍生品
  - Technical：价格结构和技术指标
- [ ] 明确说不使用交易 Tools：
  - 不下单
  - 不保存私钥
  - 不托管资金
  - 只做决策层

---

## 5. 四个负责人并行分工

四个负责人可以同时开工，不要互相等待。

| 负责人 | 模块 | 交付目标 | 不依赖别人怎么做 |
|---|---|---|---|
| 负责人 1 | Demo 主线与口播 | 输出最终 Demo 脚本、用户输入、口播词、镜头顺序 | 可直接基于当前 UI 和 `demo:thesis-guard` 写脚本 |
| 负责人 2 | README 参赛页 | 把 README 写成评委能看懂的项目页，突出痛点、架构、Bitget、Demo | 可先改文档，不等功能再补截图/链接 |
| 负责人 3 | Bitget 展示与证据链 | 确保 Demo 里看得到 Bitget MCP Skill、Agent trace、调用链 | 可用现有 trace/mock/fallback 截图，不等 README |
| 负责人 4 | 最终验收与安全 | 跑测试、跑 harness、检查 README、检查敏感信息、给出能否上传结论 | 可按清单逐项验证，不等别人主观确认 |

---

## 6. 负责人 1：Demo 主线与口播

### 任务

- 写最终 Demo 脚本：
  - 3 分钟版
  - 5 分钟版
- 固定用户输入，不要现场自由发挥。
- 写每一步口播词。
- 明确每一步屏幕上要指给评委看的内容。
- 输出最终文件：
  - `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVII-Demo脚本.md`

### 必须包含的 Demo 主线

```text
1. 介绍：Decision Brain 是长期决策记忆层
2. 研究 BTC：展示 Bitget MCP / Agent 作战室
3. 记录目标：长期囤 10 BTC
4. 记录仓位：已有 3 BTC，成本 60000
5. 记录 thesis：长期配置 BTC，不做短线
6. 用户恐慌：跌得好厉害，我想卖 BTC
7. 系统回看：目标、进度、thesis、估值、底仓规则
8. 展示 trace / 导出 / harness
```

### 自我审查

负责人 1 必须自己检查：

- [ ] 口播能在 5 分钟内讲完。
- [ ] 第一段能说清楚项目痛点。
- [ ] 中间能说清楚 Bitget MCP Skills 是市场感知层。
- [ ] 最后一幕能打出“投资初心护栏”的核心价值。
- [ ] 每一步都有明确用户输入，不需要现场临时想。
- [ ] 脚本里没有夸大为“自动赚钱”“自动交易”。

---

## 7. 负责人 2：README 参赛页

### 任务

- 更新最终 GitHub README。
- 重点不是堆功能，而是讲清楚：
  - 为什么做
  - 痛点是什么
  - Bitget 工具怎么用
  - 架构怎么解决痛点
  - Demo 怎么跑
  - 已完成什么
  - 不做什么
- 输出最终检查说明：
  - `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVII-README终审说明.md`

### README 必须出现的核心文案

可以使用或改写这段：

```text
用户买入一个代币时，往往有当时的判断：为什么买、估值怎么看、准备持有多久、什么条件下才应该卖。
但市场回撤后，用户容易被短期波动影响，忘记一开始的投资原则。
Decision Brain 记录仓位、成本、目标仓位、原始 thesis 和估值计划。
当用户想加仓或卖出时，它先回看这些长期上下文，再结合 Bitget MCP Skills 提供的市场感知，给出可追溯的建议。
```

### 自我审查

负责人 2 必须自己检查：

- [ ] README 第一屏能看懂“为什么做”。
- [ ] README 明确写出用户痛点：回撤后忘记买入初衷和估值纪律。
- [ ] README 明确写出 Bitget MCP Skills 的 5 个方向。
- [ ] README 明确写出 Decision Brain 不自动交易、不保存私钥。
- [ ] README 有 Demo 命令：`npm run demo:thesis-guard`。
- [ ] README 有测试命令：`npm run test:plan16`。
- [ ] README 没有本地敏感路径、真实 API key、个人 token。

---

## 8. 负责人 3：Bitget 展示与证据链

### 任务

- 确保最终 Demo 中能看见 Bitget MCP / Skill 的作用。
- 整理一份证据说明：
  - 哪 5 个 Skill 被映射
  - 对应哪些 Agent
  - 在 Demo 中哪里能看到
  - 如果本机没接真实 Bitget MCP，fallback 如何诚实标注
- 输出最终文件：
  - `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVII-Bitget展示证据链.md`

### 必须说明的 Skill 映射

```text
macro-analyst -> Macro Agent -> 宏观环境、风险偏好
market-intel -> Market Intel / Onchain Agent -> 市场、链上、流动性
news-briefing -> News Agent -> 新闻事件
sentiment-analyst -> Sentiment Agent -> 情绪、恐惧贪婪、衍生品
technical-analysis -> Technical Agent -> 技术指标、价格结构
```

### 自我审查

负责人 3 必须自己检查：

- [ ] Demo 右侧能看到 Bitget MCP Skills 区域。
- [ ] Trace 或 Agent 卡片能看到 Skill / MCP tool 名称。
- [ ] 文档说明 Bitget 提供的是市场感知，不是交易执行。
- [ ] 文档说明为什么这些信号有用：帮助判断 thesis 是否失效，而不是只看价格。
- [ ] 如果真实 MCP 不可用，界面或文档诚实显示 not configured / fallback，不假装真实调用。
- [ ] 至少提供一张截图或一段 trace 文本作为证据。

---

## 9. 负责人 4：最终验收、安全和上传判断

### 任务

- 跑最终测试。
- 跑 thesis guard harness。
- 检查 README。
- 检查敏感信息。
- 给出是否可以录 Demo、是否可以上传 GitHub 的结论。
- 输出最终文件：
  - `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVII-最终验收与安全报告.md`

### 必跑命令

在 `/Users/jasoncong/Desktop/Decision Brain/源代码` 下执行：

```bash
npm test
npm run test:plan16
npm run test:plan16:all
npm run demo:thesis-guard
```

如果某条命令失败，必须记录：

```text
失败命令：
失败原因：
是否阻断 Demo：
责任归属：
建议修复：
```

### 安全检查

必须检查：

- [ ] `.env`
- [ ] API key
- [ ] 钱包私钥 / 助记词
- [ ] 真实账户信息
- [ ] `data/state.json`
- [ ] 导出对话日志
- [ ] 截图和视频
- [ ] README 里的本地绝对路径
- [ ] Git tracked 文件里是否有敏感信息

### 自我审查

负责人 4 必须自己检查：

- [ ] 所有测试结果有记录。
- [ ] harness 输出可读。
- [ ] README 可作为 GitHub 参赛页。
- [ ] 安全检查不是空泛描述，而是写明检查项和结果。
- [ ] 明确给出：
  - 是否可以录 Demo
  - 是否可以上传 GitHub
  - 还剩哪些非阻断风险

---

## 10. 最终口播短版

如果只能讲 60 秒，用这版：

```text
Decision Brain 是给交易 Agent 用的长期决策记忆层。

我们发现用户买代币时通常有一个当时的逻辑：为什么买、估值怎么看、准备拿多久、什么条件下卖。
但市场一回撤，人很容易忘记一开始的投资原则，变成情绪化卖出。

所以 Decision Brain 记录用户的仓位、成本、目标仓位、原始 thesis 和估值计划。
当用户想加仓或卖出时，它不会只看当前价格，而是先回看当初的计划。

Bitget MCP Skills 在这里作为市场感知层：宏观、市场情报、新闻、情绪和技术分析分别进入不同 Agent。
Chief Agent 再把这些市场信号和用户自己的长期记忆合并，判断这次卖出是理性复盘，还是恐慌卖出。

我们不自动交易，不保存私钥，只做可追溯的决策建议。
Demo 里你会看到：用户目标是囤 10 个 BTC，目前只有 3 个，市场下跌想卖时，系统会先提醒他回看原始 thesis 和目标，而不是直接清仓。
```

---

## 11. 最终对接话术

### 发给负责人 1

```text
看这个文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVII-最终Demo演示README与Bitget叙事计划.md

你是负责人 1。你的任务是最终 Demo 主线与口播：写 3 分钟版和 5 分钟版演示脚本，固定用户输入、屏幕展示点和口播词。请只看第 6 节执行，完成后按第 12 节格式回复。
```

### 发给负责人 2

```text
看这个文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVII-最终Demo演示README与Bitget叙事计划.md

你是负责人 2。你的任务是 README 参赛页：讲清楚为什么做、解决什么痛点、Bitget MCP Skills 怎么用、Demo 怎么跑、安全边界是什么。请只看第 7 节执行，完成后按第 12 节格式回复。
```

### 发给负责人 3

```text
看这个文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVII-最终Demo演示README与Bitget叙事计划.md

你是负责人 3。你的任务是 Bitget 展示与证据链：确认 Demo 里能看见 Bitget MCP / Skill 的作用，并整理 5 个 Skill 到 Agent 的映射和证据。请只看第 8 节执行，完成后按第 12 节格式回复。
```

### 发给负责人 4

```text
看这个文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XVII-最终Demo演示README与Bitget叙事计划.md

你是负责人 4。你的任务是最终验收、安全和上传判断：跑测试、跑 harness、检查 README、检查敏感信息，并明确是否可以录 Demo 和上传 GitHub。请只看第 9 节执行，完成后按第 12 节格式回复。
```

---

## 12. 每个负责人的最终回复格式

```text
我是负责人 X。

完成内容：
1.
2.
3.

自我审查结果：
1.
2.
3.

交付文件：
1.
2.
3.

测试或验证结果：
1.
2.
3.

仍有风险：
1.
2.

是否阻断最终 Demo：
阻断 / 不阻断
原因：
```

---

## 13. 最终通过标准

只有同时满足以下条件，才能进入最终录制和 GitHub 上传：

- [ ] 负责人 1 提交 Demo 脚本和口播稿。
- [ ] 负责人 2 提交 README 终审说明。
- [ ] 负责人 3 提交 Bitget 展示证据链。
- [ ] 负责人 4 提交最终验收与安全报告。
- [ ] `npm run demo:thesis-guard` 可运行或失败原因不阻断 UI Demo。
- [ ] `npm run test:plan16` 通过。
- [ ] README 第一屏讲清楚为什么做。
- [ ] Demo 能清楚展示“目标 10 BTC、当前 3 BTC、下跌想卖、回看 thesis”。
- [ ] Bitget MCP / Skill 的作用能在界面或 trace 中被指出。
- [ ] 安全报告明确允许上传 GitHub。

