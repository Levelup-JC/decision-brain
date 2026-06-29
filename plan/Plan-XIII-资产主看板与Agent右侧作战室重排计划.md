# Plan XIII -- 资产主看板与 Agent 右侧作战室重排计划

> **制定日期:** 2026-06-28  
> **最新版对接入口:** `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIII-资产主看板与Agent右侧作战室重排计划.md`  
> **使用方式:** 你只需要把这个文件路径发给协作者，并告诉对方“你是负责人 1/2/3/4”。对方只看自己对应章节即可开工。  
> **重要约束:** 本轮继续只使用“负责人 1-4”，不要使用 G/H/I/J，也不要拆出更多小组。

---

## 0. 当前完成进展核对

### 已完成或基本完成

- Plan XII 的核心代码交付已经进入可验收状态。
- `npm test` 当前验证结果：54/54 通过。
- `npm run test:plan12` 当前验证结果：7/7 通过。
- `plan/Plan-XII-截图/` 已经有 6 张截图：
  - `desktop-1440x1000.png`
  - `mobile-390x844.png`
  - `add-sol-position.png`
  - `update-sol-position.png`
  - `glow-curve.png`
  - `portfolio-overview.png`
- 当前代码已经具备：
  - 左侧对话后统一刷新资产视图的入口。
  - `portfolio-summary` 汇总口径。
  - BTW 这类未知资产不应被静默改写成 XMR 的测试保护。
  - 发光曲线版本的趋势图。
  - README 和安全审查报告的初版。

### 仍然不能直接上传的点

- Demo 视频还没有完成并上传，README 里的视频 Release 链接当前仍是预留入口。
- `assets/demo-cover.png` 没有发现实际文件，需要补。
- `Lobster状态/state.json` 当前是 Git tracked 文件，提交前必须人工确认内容确实是 demo placeholder。
- `OpenClaw交付包.zip` 当前是 Git tracked 文件，提交前必须确认压缩包里没有真实 key、本机路径、个人配置。
- `plan/Plan-XII-安全审查报告.md` 中关于 `git ls-files | rg '(\.env|state\.json|\.zip$)'` 的描述需要修正：当前实际能看到 tracked `Lobster状态/state.json`，不能继续写“无输出”。

---

## 1. 本轮目标

把 Decision Brain 的 Demo 从“功能都在，但信息层级有点散”，调整为“现场一眼能看懂资产变化和 Agent 调度”。

本轮界面策略：

1. **资产实时面板优先。**  
   资产是演示里最关键的结果区。用户左侧说买入、更新、删除、确认资产身份之后，页面最显眼的位置必须马上显示资产、数量、成本、当前价值、组合总估值变化。

2. **K 线保留在原来的主展示位置。**  
   当前 Bitget 主题发光曲线可以保留，不要退回蜡烛线。曲线应继续保持简洁、发光、低噪音。

3. **Agent 作战室移动到最右侧。**  
   右侧不再作为资产面板主位置，而是变成 Agent 调度与可观测性区。

4. **右侧上方显示 Agent 调用状态。**  
   哪个 Agent 被调用，哪个 Agent 卡片就亮起；没被调用的保持低亮待命。

5. **调度制度、Bitget MCP skill、调度日志也放到右侧。**  
   右侧需要说明 Chief 为什么调这些 Agent、哪些 Agent 对应 Bitget MCP skill、每次调度发生了什么。

6. **动态变化区域放到右侧底部。**  
   例如数据流、MCP trace、Agent 返回、Chief 综合等动态日志放到底部，避免抢占资产主看板。

最终 Demo 视觉结构：

```text
┌────────────────────────────────────────────────────────────────────┐
│ Topbar: Decision Brain / LIVE / Reset                              │
├──────────────┬─────────────────────────────────────┬───────────────┤
│ 左侧 Chief    │ 中间资产主看板 + K线趋势              │ 右侧 Agent 作战室 │
│ 对话输入输出   │                                     │               │
│              │ 1. 组合总估值 / 持仓数 / 纳入资产       │ 1. Agent 状态灯  │
│              │ 2. 资产列表 / 数量 / 成本 / 当前价值     │ 2. 调度制度      │
│              │ 3. 资产详情 / 删除或归档入口            │ 3. Bitget Skill │
│              │ 4. 发光趋势线保留                       │ 4. 调度日志      │
│              │                                     │ 5. 动态 Trace   │
└──────────────┴─────────────────────────────────────┴───────────────┘
```

---

## 2. 负责人分工总览

| 负责人 | 模块 | 一句话目标 | 主要文件 |
|---|---|---|---|
| 负责人 1 | 资产实时主看板与状态刷新 | 把资产面板从“右侧辅助信息”升级为“中间主结果区”，并保证对话后实时刷新 | `dashboard.html`, `dashboard.js`, `portfolio.js`, `charts.js` |
| 负责人 2 | Agent 右侧作战室与调度展示 | 把 Agent 卡片、调度制度、Bitget MCP skill、调度日志、动态 trace 重排到最右侧 | `dashboard.html`, `committee.js`, `dashboard.js` |
| 负责人 3 | 视觉统一与演示质感 | 做 Google 空气感布局、圆润、留白、发光状态、响应式，不破坏现有功能 | `dashboard.html`, `portfolio.js`, `charts.js` |
| 负责人 4 | 验收、README、视频、安全终审 | 重新跑测试、补截图、修安全报告、确认 GitHub 参赛页可公开 | tests, README, `plan/Plan-XIII-验收报告.md`, `plan/Plan-XIII-安全终审报告.md` |

推荐执行顺序：

```text
负责人 1 先移动资产主看板
-> 负责人 2 再移动 Agent 作战室和调度区
-> 负责人 3 统一视觉和响应式
-> 负责人 4 做验收、截图、README、视频、安全终审
```

可以并行，但合并顺序建议按上面执行。原因是本轮核心是信息架构，不是单纯美化；先定区域，再做视觉。

---

## 3. 负责人 1：资产实时主看板与状态刷新

### 目标

让资产实时面板成为中间主展示区域。评委看 Demo 时，左侧对话一发生资产动作，中间主区就能立刻看到资产变化。

### 需要修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.html`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/portfolio.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/charts.js`

### 必须完成的功能

- [ ] 将 `实时资产看板` 从当前右侧列移动到中间主列。
- [ ] 中间主列顶部显示四个核心统计：
  - 组合估值
  - 持仓资产数
  - 纳入研究资产数
  - 计划数或待复查数
- [ ] 资产列表必须在中间主列可见，不需要滚到右侧才能看到。
- [ ] 资产卡片必须显示：
  - symbol
  - asset name
  - 持仓数量
  - 平均成本
  - 当前价格
  - 当前价值
  - 盈亏比例
  - valuation zone
  - research status
- [ ] 用户左侧对话新增资产后，中间资产列表必须自动新增。
- [ ] 用户左侧对话更新已有资产数量后，中间资产卡不得重复，必须更新原卡片。
- [ ] 用户左侧对话删除或归档资产后，中间资产卡必须消失或进入归档态，组合总估值同步变化。
- [ ] 资产详情面板继续可用，点击资产卡能展开或显示详情。
- [ ] 手动记录交易表单可以保留，但必须放到资产主看板的次级位置，不要压过资产列表。
- [ ] K 线趋势图保留在中间主列，位置靠近当前选中资产，不能移动到右侧。
- [ ] `refreshPortfolioViews()` 仍然是唯一刷新入口，不要新增另一套状态刷新逻辑。

### 建议 DOM 结构

在 `dashboard.html` 中把中间列改为资产主工作区：

```html
<div class="col col-center col-assets">
  <div class="col-header">
    实时资产看板
    <span id="assetRefreshState" class="header-pill">实时同步</span>
  </div>
  <div class="col-body" id="assetWorkbenchBody">
    <section class="portfolio-hero" id="rightStats"></section>
    <section class="asset-list-panel">
      <div id="assetMiniList"></div>
    </section>
    <div class="detail-panel" id="detailPanel"></div>
    <div class="chart-box" id="klineChartBox">
      <div class="chart-title" id="klineChartTitle">趋势</div>
      <div id="klineChart"></div>
    </div>
    <div class="trade-form" id="tradeForm"></div>
    <div class="chart-box" id="portfolioChartBox"></div>
  </div>
</div>
```

注意：可以不完全照抄上面的 HTML，但最终页面必须符合“资产在中间主区”。

### 自检输入

在浏览器里按顺序输入：

```text
我买了 SOL 100 个，成本 120
我又买了 SOL 50 个，成本 130
查看我的持仓
我买了 10000 个 BTW，成本 0.01
确认 BTW
删除 BTW
```

### 自检目标

- [ ] SOL 第一次输入后出现在中间资产主看板。
- [ ] SOL 第二次输入后仍然只有一张资产卡。
- [ ] SOL 数量正确累计或按当前产品口径正确更新。
- [ ] 组合估值随 SOL 数量变化。
- [ ] BTW 未确认前不能被写成 XMR。
- [ ] 确认 BTW 后，中间资产卡显示 BTW。
- [ ] 删除 BTW 后，中间资产主看板立刻刷新。
- [ ] K 线仍显示在中间，不出现在最右侧。

---

## 4. 负责人 2：Agent 右侧作战室与调度展示

### 目标

把右侧改造成 Agent 调度与可观测性区。它不再承担资产主看板，而是专门解释“Chief 调了谁、为什么调、哪个 Bitget MCP skill 被用到、调用过程发生了什么”。

### 需要修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.html`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/committee.js`

### 必须完成的功能

- [ ] 将 `委员会作战室` 从中间列移动到最右侧。
- [ ] 右侧顶部保留 Agent 状态灯或 Agent 卡片。
- [ ] 被调用的 Agent 必须亮起，未调用的 Agent 必须保持低亮待命。
- [ ] Agent 状态至少包括：
  - 待命
  - 思考中
  - 完成
  - 降级
  - 失败或超时
- [ ] 右侧必须加入“调度制度”区域，用简短结构展示 Chief 调度原则。
- [ ] 右侧必须保留 Bitget MCP Skills 映射区域。
- [ ] 右侧必须保留 Chief 调度日志。
- [ ] 右侧底部必须放动态变化区域，包括 MCP trace、Agent 返回、Chief 综合。
- [ ] `addDispatchEntry()` 写入日志时，滚动目标要从旧的 `committeeBody` 改成右侧作战室的实际滚动容器。
- [ ] `fanoutAgents()` 和 `agentArrived()` 的 DOM 查询不能因为列移动而失效。
- [ ] 右侧不要放资产列表、组合估值、交易表单。

### 右侧建议结构

```html
<div class="col col-right col-war-room">
  <div class="col-header">
    Agent 作战室
    <span id="roundLabel">待命</span>
  </div>
  <div class="col-body" id="warRoomBody">
    <section class="agent-status-panel">
      <div class="agent-grid" id="agentGrid"></div>
    </section>
    <section class="dispatch-policy">
      <h3>调度制度</h3>
      <div>Memory 先查历史，Bitget MCP 补市场，Valuation 做估值，Chief 最后综合。</div>
    </section>
    <section class="bitget-skills-bar" id="bitgetSkillsBar">
      <span class="bsb-label">Bitget MCP Skills</span>
      <span class="bsb-pipe" id="bitgetSkillsPipe"></span>
    </section>
    <section class="dispatch-log" id="dispatchLog"></section>
    <section class="dynamic-trace" id="dynamicTrace"></section>
  </div>
</div>
```

注意：动态 trace 可以继续复用每个 Agent 卡片内部的 trace，也可以额外汇总到底部。但最终右侧底部必须能看到“动态过程”。

### 调度制度文案建议

页面内文案要短，不要像说明书。建议使用 4 条：

```text
1. Memory 先确认用户历史仓位与计划
2. Bitget MCP 补齐市场、技术、新闻、情绪信号
3. Valuation 把信号转成估值区间与动作边界
4. Chief 只输出可解释建议，不自动交易
```

### 自检输入

```text
SOL 值得买吗？
今天市场怎么样？
我买了 10000 个 BTW，成本 0.01
查看我的持仓
```

### 自检目标

- [ ] 输入 `SOL 值得买吗？` 后，右侧能看到多个 Agent 被点亮。
- [ ] 输入 `今天市场怎么样？` 后，右侧 Macro / Market / News / Sentiment 相关 Agent 有状态变化。
- [ ] 输入资产写入类消息后，右侧 Memory / Asset Info / Valuation 等相关 Agent 状态变化。
- [ ] 调度日志显示 Chief 派出哪些 Agent。
- [ ] Bitget MCP skill chip 能随相关 Agent 调用高亮。
- [ ] 动态 trace 在右侧底部，不挤占中间资产主看板。

---

## 5. 负责人 3：视觉统一与演示质感

### 目标

在不改变核心业务逻辑的前提下，把页面做成更适合黑客松展示的版本：空气感、圆润、清爽、可扫描，同时保持 Bitget 主色发光线。

### 需要修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.html`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/portfolio.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/charts.js`

### 必须完成的功能

- [ ] 三列比例建议调整为：
  - 左侧 Chief 对话：320px-360px
  - 中间资产主看板：剩余主宽度
  - 右侧 Agent 作战室：360px-420px
- [ ] 中间资产主看板视觉优先级最高。
- [ ] 资产统计卡要更大、更清楚，组合估值最突出。
- [ ] 资产列表不要太密，卡片间距、圆角、阴影要更像 Google 产品的轻量层级。
- [ ] 右侧 Agent 卡片可以更紧凑，但亮起状态必须明显。
- [ ] 调度制度、调度日志、动态 trace 应该像工具面板，不要像正文说明。
- [ ] K 线继续使用 Bitget 主题色 `#00F0B5` 或当前 CSS 变量 `--bitget-primary`。
- [ ] K 线不要恢复蜡烛图、成交量柱、EMA 等复杂元素。
- [ ] 移动端不能直接隐藏资产主看板；小屏顺序应该是：
  1. Chief 对话
  2. 资产主看板
  3. Agent 作战室
- [ ] 所有按钮和状态文字不能溢出。
- [ ] 不要加入大段功能说明文字，不要做营销 Landing Page。

### 视觉检查点

- [ ] 页面第一眼能看到“资产总估值”和资产列表。
- [ ] 页面第一眼能看到右侧 Agent 状态灯。
- [ ] 被调用 Agent 的亮起效果明显，但不刺眼。
- [ ] Bitget 发光线在中间可见。
- [ ] 页面不是单一蓝黑色，Bitget 绿色只是主光源，不要全屏都变绿色。
- [ ] 圆角统一，卡片不要套卡片。
- [ ] 桌面 1440x1000 无遮挡。
- [ ] 移动 390x844 无文本重叠。

### 截图要求

负责人 3 完成后，把截图保存到：

`/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIII-截图/`

至少保存：

- `desktop-assets-main.png`
- `desktop-agent-war-room.png`
- `desktop-after-buy-sol.png`
- `desktop-after-agent-dispatch.png`
- `mobile-assets-first.png`
- `mobile-agent-war-room.png`

---

## 6. 负责人 4：验收、README、视频、安全终审

### 目标

确认 Plan XIII 改完之后，Demo 可以作为 GitHub 参赛页公开展示。负责人 4 不只看测试绿不绿，还要确认“评委打开页面能不能看懂”。

### 需要新增或修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIII-验收报告.md`
- `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIII-安全终审报告.md`
- `/Users/jasoncong/Desktop/Decision Brain/README-目录说明.md`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/README.md`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan13-layout-acceptance.mjs`

### 必须完成的验收

- [ ] 跑 `npm test`，记录总数和结果。
- [ ] 跑 `npm run test:plan12`，确保 Plan XII 的资产同步保护没有被 Plan XIII 破坏。
- [ ] 新增 Plan XIII 布局验收脚本，至少检查：
  - `实时资产看板` 在中间主列。
  - `Agent 作战室` 在右侧列。
  - `调度制度` 在右侧列。
  - `Chief 调度日志` 在右侧列。
  - `klineChartBox` 仍在中间主列。
  - `assetMiniList` 不在右侧列。
- [ ] 用浏览器或 Playwright 检查：
  - 新增 SOL 后资产主看板更新。
  - 更新 SOL 后不重复。
  - 未知 BTW 不写成 XMR。
  - 确认 BTW 后显示 BTW。
  - 删除或归档后资产主看板刷新。
  - Agent 被调用时右侧亮起。
  - 调度日志写入右侧。
- [ ] 确认 Plan XIII 截图齐全。
- [ ] 更新 README，把新布局写进去：
  - 左侧 Chief 对话
  - 中间资产实时主看板
  - 中间 Bitget 发光趋势线
  - 右侧 Agent 作战室
  - Bitget MCP skill 在右侧如何展示
  - 不自动交易，只做可解释决策和资产记忆
- [ ] 补 Demo 视频和封面图：
  - `assets/demo-cover.png`
  - GitHub Release 视频链接有效

### 安全终审必须重新检查

负责人 4 必须重新执行并写入报告：

```bash
cd "/Users/jasoncong/Desktop/Decision Brain"
git status --short
git ls-files | rg '(\.env|state\.json|\.zip$)'
rg -n 'sk-or-v1-|sk-[A-Za-z0-9_-]{20,}|BEGIN .*PRIVATE KEY|Authorization: Bearer|OPENAI_API_KEY=|LLM_API_KEY=|BITGET_.*=|password\s*[:=]|secret\s*[:=]|mnemonic|seed phrase' .
rg -n '/Users/' .
```

安全结论里必须明确写：

- `源代码/.env` 是否被 tracked。
- `Lobster状态/state.json` 是否被 tracked，以及内容是否为 demo placeholder。
- `OpenClaw交付包.zip` 是否被 tracked，以及是否建议改为 Release 分发。
- README 中的视频链接是否真实可打开。
- `assets/demo-cover.png` 是否存在。
- 是否发现真实 API key、私钥、助记词。
- 是否存在可执行配置里的本机绝对路径。

### 上传前硬性阻塞项

以下任意一项不满足，不允许上传 GitHub 最终参赛页面：

- [ ] `npm test` 通过。
- [ ] `npm run test:plan12` 通过。
- [ ] Plan XIII 布局验收通过。
- [ ] Demo 视频链接真实可打开。
- [ ] `assets/demo-cover.png` 存在。
- [ ] `源代码/.env` 未被 tracked。
- [ ] 无真实 API key、私钥、助记词。
- [ ] `Lobster状态/state.json` 已人工确认是 demo placeholder。
- [ ] `OpenClaw交付包.zip` 已人工确认无敏感信息，或改为 Release 分发。
- [ ] README 明确说明项目为什么做、完成了什么、架构是什么、Bitget MCP skill 如何体现。

---

## 7. 最终交付回复格式

每个负责人完成后，必须按下面格式回复，不要只说“已完成”：

```text
我是负责人 X，Plan XIII 对应任务已完成。

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

4. 我发现的风险
- 风险 1：如果没有，写“无”
- 风险 2：如果没有，写“无”

5. 需要下一位负责人注意
- 注意点 1
- 注意点 2
```

负责人 4 的最终回复必须额外包含：

```text
是否允许上传 GitHub：是/否
如果否，阻塞项是：
- 阻塞项 1
- 阻塞项 2
```

---

## 8. 你可以直接复制给他们的对接消息

### 给负责人 1

```text
请看这个计划文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIII-资产主看板与Agent右侧作战室重排计划.md

你是负责人 1。你的任务是把资产实时面板升级为中间主看板，并保证左侧对话买入、更新、确认、删除资产后，中间资产主看板实时刷新。请只看第 3 节执行，完成后按第 7 节格式回复。
```

### 给负责人 2

```text
请看这个计划文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIII-资产主看板与Agent右侧作战室重排计划.md

你是负责人 2。你的任务是把 Agent 作战室移动到最右侧，并把 Agent 状态灯、调度制度、Bitget MCP skill、Chief 调度日志、动态 trace 都放到右侧。请只看第 4 节执行，完成后按第 7 节格式回复。
```

### 给负责人 3

```text
请看这个计划文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIII-资产主看板与Agent右侧作战室重排计划.md

你是负责人 3。你的任务是做视觉统一和演示质感：Google 空气感、圆润、清爽、资产主看板优先、右侧 Agent 亮起明显、K 线保留 Bitget 发光曲线。请只看第 5 节执行，完成后按第 7 节格式回复。
```

### 给负责人 4

```text
请看这个计划文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XIII-资产主看板与Agent右侧作战室重排计划.md

你是负责人 4。你的任务是做 Plan XIII 验收、README 更新、Demo 视频和封面检查、安全终审。特别注意重新检查 state.json、zip、.env、真实密钥、本机路径，不要沿用旧安全报告结论。请只看第 6 节执行，完成后按第 7 节格式回复，并明确写“是否允许上传 GitHub”。
```

---

## 9. 本轮验收成功标准

Plan XIII 只有在以下结果都满足时才算完成：

- [ ] 左侧对话仍能正常使用。
- [ ] 中间第一眼看到资产实时主看板。
- [ ] 中间资产主看板能实时反映买入、更新、确认、删除。
- [ ] K 线保留在中间主区，并保持 Bitget 发光曲线。
- [ ] 右侧第一眼看到 Agent 作战室。
- [ ] 被调用 Agent 会亮起。
- [ ] 右侧能看到调度制度。
- [ ] 右侧能看到 Bitget MCP skill 映射和高亮。
- [ ] 右侧能看到 Chief 调度日志。
- [ ] 右侧底部能看到动态 trace 或动态调用过程。
- [ ] 桌面和移动截图都无明显遮挡、重叠、溢出。
- [ ] `npm test` 通过。
- [ ] `npm run test:plan12` 通过。
- [ ] Plan XIII 布局验收脚本通过。
- [ ] README 能作为 GitHub 参赛页说明项目价值、架构、完成度和 Bitget MCP 展示方式。
- [ ] 视频、封面、安全终审全部通过后，才允许最终上传。
