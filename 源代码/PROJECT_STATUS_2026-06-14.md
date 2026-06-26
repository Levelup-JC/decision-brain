# Decision Brain 项目进展说明

更新时间：2026-06-14

## 1. 这个项目为什么要做

Decision Brain 的目标不是自动交易，也不是再造一个行情面板。

它要解决的是一个更核心的问题：

**当用户说“我想买 X”“我想加仓 X”“我想卖一点 X”的时候，Agent 不应该只看价格，也不应该要求用户每次重新解释全部背景。**

它应该先知道：

- 这个资产你现在有没有仓
- 你以前有没有买过
- 之前有没有写过 thesis / memo / 计划
- 当前研究是不是完整
- 现在这次行为到底是首投、加仓、回补，还是重新关注

所以 Decision Brain 被设计成一个可被 Agent 装载的“投资决策大脑”，负责四层能力：

1. **记忆层**  
   统一记录资产、仓位、研究、来源、计划、事件、trace，不让 Agent 在对话上下文里临时记忆。

2. **研究层**  
   对资产形成基础研究、对标估值、事件图谱、风险图谱。

3. **计划层**  
   把判断沉淀成 draft / active 的 position playbook，而不是一次性口头建议。

4. **建议层**  
   在“加仓 / 卖出 / 继续持有”时，基于仓位、估值、事件、thesis 状态给出最终投资建议。

一句话说，Decision Brain 不是交易末端，而是 **Agent 的金融记忆与决策中台**。

---

## 2. 我们为什么这样设计

### 2.1 先查仓，再研究，再建议

用户实际使用时不会每次都说完整背景。

最常见的情况是：

- “我想买 BTW”
- “这个能不能加仓”
- “卖 20% 可以吗”

如果系统直接按字面理解，很容易误判：

- 把加仓当首投
- 把回补当新标的
- 把已经研究过的资产当作第一次看

所以我们把产品主流程改成了：

`用户提资产 -> portfolio memory lookup -> 自动归类意图 -> 候选研究 -> memo/playbook -> 建议`

这就是目前 V4 方案的核心。

### 2.2 Bitget 负责能力增强，Decision Brain 负责记忆和决策

Bitget 黑客松给了三类资源：

- 交易 / 账户 / 下单能力
- 5 个分析 Skill
- MCP 接入能力

这些很有价值，但它们不适合直接替代 Decision Brain 本身。

原因是：

- Bitget Skill 更像“分析工作流”与“外部数据增强”
- Decision Brain 要负责的是“本地长期记忆 + 计划状态 + 决策复用”

所以我们当前的定位是：

- **Bitget**：数据、分析、接入能力
- **Decision Brain**：记忆层、计划层、建议层

### 2.3 价格曲线不能成为唯一理由

用户多次强调过，价格走势只是辅助输入，不能直接替代判断。

所以当前规则明确约束：

- 价格曲线只能作为一个输入
- 加仓必须同时看仓位、估值、研究状态、事件状态
- 卖出必须同时看底仓规则、估值区间、事件和 thesis 状态

这个原则已经写进 capabilities 和 recommendation rules 里。

---

## 3. 目前已经做了什么

## 3.1 已经完成的产品骨架

本地服务已经具备完整的 HTTP 和 MCP 双入口：

- HTTP 服务：`npm start`
- MCP 服务：`npm run mcp`

项目定位、能力说明、运行方式、龙虾接入流程都已经写进：

- [README.md](/Users/jasoncong/Documents/New%20project/decision-brain/README.md)
- [LOBSTER_INTEGRATION.md](/Users/jasoncong/Documents/New%20project/decision-brain/LOBSTER_INTEGRATION.md)
- [PRD.md](/Users/jasoncong/Documents/New%20project/decision-brain/PRD.md)

## 3.2 已经完成的核心流程改造

### A. 新增 `portfolio memory lookup`

已经新增统一前置查询层：

- 文件：[portfolio-memory-service.mjs](/Users/jasoncong/Documents/New%20project/decision-brain/src/services/portfolio-memory-service.mjs)

它现在会先查：

- Decision Brain 当前 `positions`
- `assets`
- `plans`
- `traces`
- 本地可扫描到的组合/交易 CSV 来源

输出的 `portfolioMemoryProfile` 已经包含：

- `hasCurrentPosition`
- `hasHistoricalPosition`
- `isArchived`
- `hasPriorResearch`
- `knownAliases`
- `matchedSources`
- `confidence`
- `suggestedIntentClass`

### B. 新增候选资产主入口 `evaluate_candidate`

已经新增：

- 文件：[candidate-service.mjs](/Users/jasoncong/Documents/New%20project/decision-brain/src/services/candidate-service.mjs)

这个入口现在负责：

- 结合持仓画像判断当前属于哪种投资上下文
- 生成 `decisionPack`
- 生成 `investmentMemo`
- 生成 `positionPlaybook`
- 给出 `decisionLicense`

并引入了：

- `investmentContextClass`
  - `first_buy`
  - `add_to_winner`
  - `average_down_review`
  - `reentry_after_exit`
  - `resume_watch_only`

### C. 所有关键建议前都已经接入持仓画像

当前这些接口已经接入 `lookupPortfolioMemory`：

- `lookup_portfolio_memory`
- `evaluate_candidate`
- `manage_position`
- `review_add_intent`
- `review_sell_intent`
- `get_asset_context`

对应代码集中在：

- [api-service.mjs](/Users/jasoncong/Documents/New%20project/decision-brain/src/services/api-service.mjs)

### D. 用户历史不明确时，会保守确认

第一版已经实现：

- 如果查不到当前仓
- 也查不到明确历史
- 系统不会擅自判定为首投
- 会要求用户确认“是不是第一次买”

这部分逻辑已经落在：

- [portfolio-memory-service.mjs](/Users/jasoncong/Documents/New%20project/decision-brain/src/services/portfolio-memory-service.mjs)
- [candidate-service.mjs](/Users/jasoncong/Documents/New%20project/decision-brain/src/services/candidate-service.mjs)

## 3.3 已经完成的 Bitget 接入骨架

当前 Bitget 这层已经不是空白，已经做了第一层接线：

- 文件：[bitget-adapter.mjs](/Users/jasoncong/Documents/New%20project/decision-brain/src/adapters/bitget-adapter.mjs)
- 文件：[mcp-client.mjs](/Users/jasoncong/Documents/New%20project/decision-brain/src/adapters/mcp-client.mjs)

已经定义了 5 个 Bitget Skill：

- `macro-analyst`
- `market-intel`
- `news-briefing`
- `sentiment-analyst`
- `technical-analysis`

并且已经支持：

- 通过 `BITGET_MCP_COMMAND` 启动真实 Bitget MCP Server
- 列出可用 tools
- 调用对应 skill
- 把返回内容写回本地 `source ledger`

也就是说：

**链路骨架已经接好，但当前机器上还没有把真实 Bitget MCP 和凭证完全配起来。**

## 3.4 已经完成的研究状态识别

当前系统已经能识别“研究是否足够支撑建议”，而不是盲目给建议。

- 文件：[research-context-service.mjs](/Users/jasoncong/Documents/New%20project/decision-brain/src/services/research-context-service.mjs)

当前会区分：

- `usable`
- `thin`
- `blocked`

并能识别 mock/fallback 来源，避免系统把占位研究误当成真实研究。

## 3.5 已经完成的加仓 / 卖出建议层

目前建议层已经可以基于以下维度给建议：

- 当前仓位占比
- 风险等级
- 估值区间
- price curve state
- 研究状态
- 当前 thesis
- 最近事件状态

相关逻辑位于：

- [recommendation-service.mjs](/Users/jasoncong/Documents/New%20project/decision-brain/src/services/recommendation-service.mjs)

## 3.6 Dashboard 和本地服务已经可跑

本地页面入口：

- `http://127.0.0.1:4177/`

页面已经能跑，服务也能启动。

---

## 4. 已经验证过什么

目前测试套件是绿的。

最近一次测试结果：

- `npm test`
- **29 / 29 通过**

测试已经覆盖了这些关键行为：

- 当前已有仓时，用户说“我想买 X”，系统自动归类为加仓路径
- 当前无仓但曾归档时，自动归类为重新关注
- 当前无仓、无归档、无历史时，系统要求确认
- `portfolio memory lookup` 能识别当前持仓、历史资产、归档资产
- `evaluate_candidate` 会根据 `investmentContextClass` 改变输出
- `review_add_intent` 不会把无仓误判为加仓
- `refresh_research` 会诚实暴露 Bitget 未连接状态
- HTTP / MCP 契约和龙虾配置脚本可用

相关测试文件包括：

- [decision-brain.test.mjs](/Users/jasoncong/Documents/New%20project/decision-brain/test/decision-brain.test.mjs)
- [http-server.test.mjs](/Users/jasoncong/Documents/New%20project/decision-brain/test/http-server.test.mjs)
- [mcp-server-contract.test.mjs](/Users/jasoncong/Documents/New%20project/decision-brain/test/mcp-server-contract.test.mjs)

---

## 5. 目前遇到的主要问题

## 5.1 Bitget 只是“接好了口”，还没有真正吃满

这是当前最大的现实问题。

虽然 Bitget adapter、MCP client、`refresh_research` 都写了，但当前问题是：

- 本机还没有完整配置真实 `bitget-mcp-server`
- 没有完整接入真实凭证运行链路
- 所以当前 `refresh_research` 大多数场景还是返回 `not_configured`

这意味着：

- Bitget Skill 现在还没真正参与到日常研究里
- 现在更多是“可接入状态”，不是“已稳定使用状态”

## 5.2 Surf / 外部 research adapter 仍然是 mock

当前 Surf 适配器还是占位实现：

- [surf-adapter.mjs](/Users/jasoncong/Documents/New%20project/decision-brain/src/adapters/surf-adapter.mjs)

这带来的问题是：

- 项目事件
- 基本面
- 融资背景
- 上所路径
- 解锁/筹码

这些最关键的研究信息，现在还没有被真实自动补齐。

## 5.3 研究层还没有形成“Bitget 优先 + 缺口补全”的最终形态

我们已经把问题想清楚了，但还没有完全实现到代码里。

当前最正确的方向应该是：

`Bitget skill first -> gap detection -> public enrichment -> memo`

但现在实际状态还不是这样。

现在的现实情况更像是：

- Bitget 链路有骨架
- Surf 还是 mock
- fallback 研究仍然大量存在

所以系统会出现：

- `researchReadiness = blocked`
- `finalRecommendation = 先补基础研究，不建议现在直接加仓`

这个结果逻辑上没错，但产品体验还不够强。

## 5.4 某些资产识别还不够智能

最典型的例子是 `BTW`。

当前 `BTW` 会被识别成：

- `unclassified_asset`

这暴露出两个问题：

1. 资产识别策略还不够 crypto-aware
2. 当研究信息缺失时，系统无法稳定推断它到底是股票、CEX token 还是链上 token

这会进一步影响：

- 风险等级
- 初始仓位建议
- 对标估值逻辑
- 后续上所 / 流动性判断

## 5.5 基础研究与建议层已经衔接，但“事实补全”能力还不够强

当前系统已经能在研究不足时收紧建议，这是好的。

但另一面是：

- 系统知道自己不知道
- 却还不够会自己把不知道的东西补齐

这就是当前版本最本质的缺口。

---

## 6. 目前我们已经想清楚的关键结论

### 6.1 Skill 不是 API，MCP 也不是 API

这个问题已经被我们彻底澄清了。

- **Skill** 是工作流 / 能力封装
- **MCP** 是工具协议 / 接入协议
- **API** 是其中某些底层数据源或私有能力的调用方式

所以不应该把三者混为一谈。

### 6.2 Bitget Skill 很有价值，但不能完全替代基础研究层

我们已经去核过 Bitget 官方文档和 skill 文档，结论是：

- 它很适合做新闻、市场情绪、技术面、宏观、部分链上/结构化分析
- 但它不是完整的项目基本面数据库
- 官方文档自己也承认很多内容是 proxy，不是 direct data

所以最合理的结构不是“只靠 Bitget”，而是：

- **Bitget 做第一轮扫描和增强**
- **公共研究层做缺口补全**

### 6.3 Decision Brain 的真正价值在“本地长期记忆 + 决策复用”

这也是我们和普通研究 bot、普通看盘 bot 的根本区别：

- 我们不是一次性回答
- 我们是把一个资产的判断持续沉淀为：
  - memo
  - plan
  - source ledger
  - events
  - traces
  - asset context

这才是产品最值钱的部分。

---

## 7. 当前项目的真实状态判断

如果用一句话概括当前阶段：

**Decision Brain 的记忆层、流程层、建议层已经搭起来并通过测试；但真实研究层还没有完全打通，尤其是 Bitget Skill 的实接和公共研究补全还在半成品状态。**

换句话说：

- **不是概念阶段了**
- **也不是可上线完成态**
- **现在处于“产品骨架已成 + 研究能力待打通”的中后期 MVP 阶段**

---

## 8. 下一步最应该做什么

按优先级，我认为下一步应该是：

1. **把 Bitget MCP 真正接起来**
   - 配真实 `bitget-mcp-server`
   - 配凭证
   - 让 `refresh_research` 真能调用 5 个 skill

2. **把研究流改成 Bitget 优先**
   - Bitget skill 先扫一轮
   - 判断哪些字段已经够
   - 缺口再走公共补全

3. **补一层真实 public enrichment**
   - 官网 / 白皮书
   - 融资背景
   - 合约 / 链
   - 上所现状 / 潜在上所
   - tokenomics / unlock
   - 对标项目

4. **优化资产识别**
   - 至少让 `BTW` 这类 token 不再默认掉成 `unclassified_asset`

5. **把 dashboard 对研究状态表达得更清楚**
   - 哪些是 Bitget 真数据
   - 哪些是 mock / fallback
   - 哪些字段缺失
   - 为什么当前建议被 block

---

## 9. 一个很实在的结论

现在这个项目最值得肯定的地方，不是“已经什么都做好了”，而是：

**我们已经把真正难的那部分产品逻辑想清楚并编码了。**

尤其是这几个关键点：

- 先查仓位历史，再判断意图
- 把研究、计划、建议串起来
- 不让 Agent 维护影子记忆
- 不让价格曲线单独主导建议
- 在研究不足时明确收紧建议

这些都是正确方向，而且已经进代码了。

现在剩下的主要不是“再想一个故事”，而是把研究层真正打通，把 Bitget 和公共补全能力吃满。
