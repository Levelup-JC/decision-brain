# Plan XII -- 资产同步、发光曲线与 Google 空气感 UI 收口计划

> **制定日期:** 2026-06-28  
> **最新版对接入口:** `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XII-资产同步与UI打磨计划.md`  
> **使用方式:** 你只需要把这个文件路径发给协作者，并告诉对方“你是负责人 1/2/3/4”。对方只看对应负责人章节即可开工。  
> **重要约束:** 本轮只使用“负责人 1-4”，不要再使用 G/H/I/J 或历史小组名称。

---

## 0. 本轮目标

把 Decision Brain 当前 Demo 从“看起来能跑”打磨到“现场演示时资产状态可信、图表清爽、界面有高级感”。

本轮必须解决 5 个明确问题：

1. 左侧对话确认买入或记录仓位后，右侧资产面板必须立即更新。
2. 新增资产、原有资产数量变化、成本变化、当前估值变化，都必须同步影响资产列表和组合总估值。
3. 当前 K 线图要从蜡烛线、成交量柱、EMA 组合，改成一条简洁的 Bitget 主题色发光曲线。
4. 整体 UI 要继续向 Google 产品的空气感、圆润、留白、轻量层级靠拢。
5. 未知或低置信度代币不能被系统擅自改写成另一个资产；例如用户说 `我买了 10000 个 BTW` 时，不能在右侧错误显示成 `XMR`，必须先让用户确认资产身份，并且支持用户用自然语言删除/移除错误资产。
6. GitHub 项目页就是参赛页，README 必须完整说明项目为什么做、完成了什么、基于什么架构、解决什么需求；提交前必须有专人做敏感信息和本机路径审查。

最终 Demo 体验：

```text
用户在左侧说“我买了 SOL 100 个，成本 120”
-> Chief 理解为仓位写入
-> 后端更新 SOL position
-> 右侧资产面板新增或更新 SOL
-> 持仓数量、成本、当前价值、组合估值同步变化
-> 中间图表显示 SOL 的一条简洁发光趋势线
-> 页面整体视觉清爽、圆润、易读
```

未知代币的正确体验：

```text
用户说“我买了 10000 个 BTW，成本 0.01”
-> 系统识别到 BTW 不是高置信度资产
-> 不立即写入 XMR 或其他相似资产
-> 询问用户确认：你说的是 BTW 这个 ticker，还是某个合约地址/项目全称？
-> 用户确认后才写入 BTW
-> 如果用户说“删掉刚才那个 XMR / 删除错误资产”，系统能归档或移除错误仓位，并刷新右侧面板
```

---

## 1. 当前进展核对

### 已经具备

- 主对接计划已从历史 G/H/I/J 改成 4 个负责人模式。
- 当前主计划文件是 `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XI-黑客松Demo打磨计划.md`。
- 前端已经存在三栏 Demo 页面：
  - 左侧 Chief 对话：`/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.js`
  - 中间 Agent / 图表区：`/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/charts.js`
  - 右侧资产面板：`/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/portfolio.js`
  - 页面样式：`/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.html`
- 后端已有资产相关接口：
  - `GET /api/state`
  - `GET /api/portfolio-summary`
  - `POST /api/manage-position`
  - `GET /api/asset-context`
  - `GET /api/ohlcv`
- `dashboard.js` 在 `sendChat()` 后已经尝试重新拉取 `state` 和 `portfolioSummary`，说明刷新入口有了，但数据源和渲染逻辑仍不稳定。

### 当前主要问题

- `portfolio.js` 的组合总估值仍从 `state.positions` 计算，并且把 `positions` 当数组使用；后端实际状态里 `positions` 经常是对象 map，这会导致总估值或资产数量不更新。
- `portfolioSummary.positions` 已经是右侧面板更适合使用的数据源，但当前只在资产列表里优先使用，没有成为统计区、组合图、选中资产的统一数据源。
- `submitTrade()` 写入后只乐观修改本地 `counts.positions`，没有重新拉取 `/api/state` 和 `/api/portfolio-summary`，会造成新增资产和估值不同步。
- `dashboard.js` 给 `renderPortfolioChart(state.positions || [])` 传入的仍可能是对象，不是数组；组合图数据可能为空或错误。
- `charts.js` 仍在渲染蜡烛线、成交量柱、EMA、价格线，视觉复杂且不符合本轮要求。
- `dashboard.html` 已有 Google dark theme 变量，但间距、层级、卡片密度、右侧信息结构还不够空气感。
- `asset-service.mjs` 会对未知 ticker 做 identity enrichment；如果外部解析返回了另一个 symbol，当前缺少“原始用户输入 vs 解析结果”的置信度检查，可能出现 `BTW` 被写成 `XMR` 这种错配。
- `chat-orchestrator.mjs` 已能识别 `archive`，后端也有 `/api/archive-asset`，但当前没有覆盖“删掉刚才错加的资产 / 移除这个仓位 / 不是 XMR 是 BTW”这类自然语言修正闭环，右侧面板也没有明确的删除/归档后刷新要求。

---

## 2. 负责人分工总览

| 负责人 | 模块 | 一句话目标 | 主要文件 |
|---|---|---|---|
| 负责人 1 | 对话到仓位写入、确认与删除闭环 | 左侧买入/更新/删除后，右侧面板无需刷新页面就更新，且未知代币先确认再写入 | `chat-orchestrator.mjs`, `dashboard.js`, `portfolio.js`, `server.mjs`, `api-service.mjs` |
| 负责人 2 | 资产身份、数据模型与估值计算 | 统一 asset identity 和 positions 数据结构，确保 BTW 不会错写成 XMR，数量、成本、总估值都算对 | `asset-service.mjs`, `api-service.mjs`, `portfolio-memory-service.mjs`, `portfolio.js`, tests |
| 负责人 3 | 发光曲线与 Google 空气感 UI | 把 K 线改成 Bitget 主题发光线，并整体提升界面质感 | `charts.js`, `dashboard.html`, `portfolio.js` |
| 负责人 4 | 验收、README、视频与安全审查 | 用脚本、截图、README、视频入口和安全报告证明 Demo 可公开提交 | tests, README, `.gitignore`, `plan/Plan-XII-验收报告.md` |

执行顺序：

```text
负责人 2 先统一数据口径
-> 负责人 1 接上左侧对话后的刷新闭环
-> 负责人 3 做图表和 UI
-> 负责人 4 做 README、视频入口、安全审查和全链路验收
```

负责人可以并行，但合并顺序必须按上面来，否则 UI 可能基于错误数据源继续改。

---

## 3. 负责人 1：对话到仓位写入、确认与删除闭环

### 目标

解决“左侧对话确认购入某个资产后，右侧资产面板不会更新”的问题，并补上未知代币确认、错加资产删除/归档闭环。

### 需要修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/chat-orchestrator.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/portfolio.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/server.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/api-service.mjs`

### 必须完成的功能

- [ ] 用户在左侧输入 `我买了 SOL 100 个，成本 120` 后，后端必须产生或更新 SOL position。
- [ ] `sendChat()` 收到成功响应后必须调用统一刷新函数，例如 `refreshPortfolioViews({ preferredAsset })`。
- [ ] 统一刷新函数必须同时拉取：
  - `GET /api/state`
  - `GET /api/portfolio-summary`
- [ ] 刷新后必须同步更新：
  - 右侧统计卡：纳入资产、持仓、计划、组合估值
  - 右侧资产列表：SOL 出现或数量变化
  - 右侧资产详情点击态
  - 组合小图
  - 中间趋势图的当前资产
- [ ] 如果同一资产已存在，再输入 `我买了 SOL 150 个，成本 118`，必须更新原有 SOL，不允许重复生成第二个 SOL 卡片。
- [ ] `submitTrade()` 手动表单写入后也必须使用同一个刷新函数，不能只改本地 `counts.positions`。
- [ ] 如果刷新接口失败，页面可以保留旧状态，但必须在 console 输出明确错误，不能静默显示假成功。
- [ ] 用户输入未知 ticker 时，如果资产身份低置信度或外部解析结果和用户原始 ticker 不一致，不能直接写入 position。
- [ ] 低置信度资产必须进入 `pendingAssetConfirmation` 状态，Chief 需要追问确认，例如：`我识别到你说的是 BTW，但还不能确认它是否为同名代币。请补充项目全称、合约地址，或回复“确认 BTW”。`
- [ ] 用户回复 `确认 BTW` 后，才允许写入 BTW position。
- [ ] 用户说 `不是 XMR，是 BTW`、`刚才识别错了`、`删掉刚才那个 XMR`、`移除这个错误资产` 时，必须识别为修正/删除意图。
- [ ] 删除或归档成功后，必须复用同一个刷新函数，让右侧资产列表和组合总估值立即变化。

### 自检输入

按顺序在浏览器里测试：

```text
我买了 SOL 100 个，成本 120
我的持仓总览
我买了 SOL 150 个，成本 118
我的持仓总览
我买了 10000 个 BTW，成本 0.01
确认 BTW
删掉刚才那个错误资产
```

### 自检目标

- [ ] 第一次输入后，右侧出现 SOL。
- [ ] SOL 持仓数量显示 `100`。
- [ ] 成本显示 `$120` 或等价美元格式。
- [ ] 组合估值不再是 `--`，并且大于 0。
- [ ] 第二次输入后，SOL 仍只有一张卡片。
- [ ] SOL 持仓数量更新为 `150`。
- [ ] 组合估值重新计算。
- [ ] 不需要手动刷新浏览器。
- [ ] 输入 `我买了 10000 个 BTW，成本 0.01` 时，如果系统没有高置信度识别 BTW，不能把右侧资产写成 XMR。
- [ ] 未确认前，右侧资产列表不新增错误资产。
- [ ] 用户确认 BTW 后，右侧显示 BTW，而不是 XMR。
- [ ] 用户要求删除/移除错误资产后，右侧资产卡消失或变成归档状态，并且总估值同步减少。

### 建议实现要点

- 在 `dashboard.js` 新增一个统一函数：

```js
async function refreshPortfolioViews(preferredAsset) {
  const state = await fetchState();
  const portfolioSummary = await fetchPortfolioSummary();
  setStateCache(state);
  renderPortfolio(state, portfolioSummary);
  renderPortfolioChart(portfolioSummary?.positions || Object.values(state.positions || {}));
  const asset =
    preferredAsset ||
    sessionContext.lastAsset ||
    portfolioSummary?.positions?.[0]?.symbol ||
    Object.values(state.positions || {})[0]?.assetSymbol;
  if (asset) renderKlineChart(asset);
  else hideKlineChart();
}
```

- `sendChat()`、`boot()`、`resetDemo()` 都应该复用这个函数。
- `portfolio.js` 的 `submitTrade()` 成功后应触发外部传入的刷新回调，或者直接重新拉取 summary；不要再只做 `stateCache.counts.positions += 1`。
- `chat-orchestrator.mjs` 需要新增或增强这些 intent：
  - `asset_identity_confirmation`
  - `correct_asset_identity`
  - `remove_position` 或复用 `archive`，但回复里要让用户知道这是从当前资产面板移除/归档。
- `sessionContext` 需要保存 `pendingAssetConfirmation`，至少包含：

```js
{
  originalInput: "BTW",
  parsedAssetQuery: "BTW",
  resolvedSymbol: "XMR",
  confidence: "low",
  units: 10000,
  averageCost: 0.01
}
```

- 当 `parsedAssetQuery !== resolvedSymbol`，且用户没有明确确认，不允许调用 `/api/manage-position` 完成写入。
- 删除动作优先做软删除或归档；如果产品决定彻底删除，也必须保留 trace，方便 Demo 解释系统如何纠错。

### 检测命令

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
npm test
```

如果负责人 4 已经提供验收脚本，还要跑：

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
node tests/plan12-portfolio-ui-acceptance.mjs --http=http://127.0.0.1:4177
```

### 完成标准

- 新增资产和更新资产都能立即反映到右侧面板。
- 右侧面板不再依赖手动刷新。
- 同一资产不会重复出现。
- 未知资产不会被静默改写成另一个 symbol。
- 错误资产可以被自然语言删除/归档。
- 所有现有测试通过。

---

## 4. 负责人 2：资产身份、数据模型与估值计算

### 目标

解决“新增资产、原有资产数量变化、组合总估值没有正确更新”的问题，并建立资产身份识别的置信度口径，避免 BTW 被写成 XMR。

### 需要修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/asset-service.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/api-service.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/services/portfolio-memory-service.mjs`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/portfolio.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/charts.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/test/http-server.test.mjs`
- 新增：`/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan12-portfolio-summary.test.mjs` 或合并进现有测试文件

### 必须完成的功能

- [ ] 明确 `positions` 在前端统一使用数组：
  - 后端原始 state 可以继续是对象 map。
  - 前端渲染前必须使用 `portfolioSummary.positions` 或 `Object.values(state.positions || {})`。
- [ ] `GET /api/portfolio-summary` 返回组合汇总字段：
  - `totalPositionValue`
  - `totalCostBasis`
  - `unrealizedPnl`
  - `unrealizedPnlPct`
  - `totalCount`
  - `activeCount`
  - `draftCount`
- [ ] `totalPositionValue` 必须用每个 position 的 `currentValue` 求和，不能把每个 position 上的 `portfolioValue` 累加。
- [ ] `portfolioValue` 如果表示用户总组合规模，只能用于计算 `portfolioPct`，不能作为持仓总估值累加。
- [ ] `portfolio.js` 的顶部统计必须优先使用 `portfolioSummary.totalPositionValue`。
- [ ] 如果 summary 缺失，前端 fallback 才从 positions 数组求 `currentValue`。
- [ ] `renderPortfolioChart()` 必须接收数组，且数据使用 `currentValue` 或 summary 汇总，不再依赖错误的 `portfolioValue` 累加。
- [ ] `state.counts.positions` 和 `portfolioSummary.totalCount` 不一致时，右侧持仓数量优先显示 `portfolioSummary.totalCount`。
- [ ] `resolveAssetIdentity()` 必须返回资产识别元信息：
  - `inputSymbol`
  - `resolvedSymbol`
  - `identityConfidence`: `high` / `medium` / `low`
  - `needsUserConfirmation`
  - `identityMismatchReason`
- [ ] 如果用户原始输入是短 ticker，例如 `BTW`，外部解析返回另一个 ticker，例如 `XMR`，默认必须标记 `needsUserConfirmation: true`，不能直接覆盖成 XMR。
- [ ] 对未知 ticker 的默认策略是“保留用户输入 symbol + manual-review 标签”，不是替换成外部猜测 symbol。
- [ ] `GET /api/portfolio-summary` 必须排除已删除/已归档的 active position，或明确返回 `status: archived` 并让前端默认不计入总估值。
- [ ] 新增删除/归档后的 summary 口径：被删除/归档资产不计入 `totalPositionValue`、`totalCostBasis`、`totalCount`。

### 数据口径

| 字段 | 含义 | 是否参与组合估值 |
|---|---|---|
| `units` | 当前持有数量 | 是，参与 `currentValue` |
| `averageCost` | 平均成本 | 是，参与成本 |
| `currentPrice` | 当前价格 | 是，参与 `currentValue` |
| `currentValue` | 当前持仓价值，`units * currentPrice` | 是 |
| `costBasisTotal` | 当前成本，`units * averageCost` | 是 |
| `portfolioValue` | 用户填写的整体组合规模或上下文资产规模 | 否，不可累加 |
| `portfolioPct` | 当前资产占组合比例 | 否，只展示 |
| `inputSymbol` | 用户原始输入的 ticker，例如 BTW | 否，用于资产身份校验 |
| `resolvedSymbol` | 外部数据源解析出的 ticker，例如 XMR | 否，仅在高置信度时可写入 |
| `identityConfidence` | 资产身份置信度 | 否，低置信度时必须用户确认 |
| `status` | active / archived / deleted | 否，但决定是否计入右侧总估值 |

### 必须补的测试

测试 1：新增资产 summary 正确

```js
// 输入：SOL units=100 averageCost=120 currentPrice=130
// 期望：
// totalCount === 1
// totalPositionValue === 13000
// totalCostBasis === 12000
// unrealizedPnl === 1000
```

测试 2：更新同一资产不重复

```js
// 第一次 manage-position: SOL 100, cost 120, price 130
// 第二次 manage-position: SOL 150, cost 118, price 125
// 期望：
// positions.length === 1
// positions[0].units === 150
// totalPositionValue === 18750
```

测试 3：不能错误累加 portfolioValue

```js
// 两个 position 都带 portfolioValue=100000
// SOL currentValue=13000
// BTC currentValue=60000
// 期望 totalPositionValue === 73000
// 禁止得到 200000
```

测试 4：BTW 不允许被静默改写成 XMR

```js
// 输入：assetQuery=BTW
// 模拟外部 resolveSymbol 返回 resolved.symbol=XMR
// 期望：
// asset.symbol === "BTW"
// asset.identityConfidence === "low"
// asset.needsUserConfirmation === true
// 不创建 XMR position
```

测试 5：用户确认后才写入 BTW

```js
// 第一步：manage-position BTW 10000, cost 0.01，且 identity low
// 期望：返回 confirmationRequired，不写入 active position
// 第二步：confirm asset identity BTW
// 期望：positions 中出现 BTW，且不出现 XMR
```

测试 6：删除/归档资产不计入总估值

```js
// 先创建 BTW currentValue=100
// 再 archive/remove BTW
// 期望：
// portfolio-summary active positions 不包含 BTW
// totalPositionValue 减少 100
```

### 自检目标

- [ ] `/api/portfolio-summary` 返回的 totals 与右侧 UI 一致。
- [ ] 新增 SOL 后，`totalPositionValue` 变化。
- [ ] 更新 SOL 数量后，`totalPositionValue` 再次变化。
- [ ] 两个资产同时存在时，总估值等于两个资产 `currentValue` 之和。
- [ ] `BTW` 低置信度时不会被写成 `XMR`。
- [ ] 删除/归档资产不计入总估值。
- [ ] `npm test` 通过。

### 检测命令

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
npm test
```

可选手工接口检查：

```bash
curl -sS -X POST http://127.0.0.1:4177/api/manage-position \
  -H 'Content-Type: application/json' \
  -d '{"assetQuery":"SOL","units":100,"averageCost":120,"currentPrice":130,"portfolioValue":100000}'

curl -sS http://127.0.0.1:4177/api/portfolio-summary
```

### 完成标准

- summary 数据口径清楚。
- asset identity 口径清楚。
- 右侧 UI 和接口 totals 一致。
- 原有资产更新不会生成重复卡片。
- 总估值计算不再错误使用 `portfolioValue` 累加。
- 低置信度资产必须先确认，不能直接写入错误 symbol。

---

## 5. 负责人 3：发光曲线与 Google 空气感 UI

### 目标

解决“K 线丑、数据太多、UI 还不够高级”的问题。

### 需要修改的文件

- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/charts.js`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/dashboard.html`
- `/Users/jasoncong/Desktop/Decision Brain/源代码/src/ui/portfolio.js`

### K 线改造要求

把当前 `renderKlineChart(asset, days = 30)` 的视觉结果改成：

```text
一条简洁的价格趋势线
+ Bitget 主题色主线
+ 柔和 glow 发光层
+ 很轻的下方渐变面积
+ 极弱网格或无网格
+ 不展示蜡烛线
+ 不展示成交量柱
+ 不展示 EMA
+ 不展示拥挤价格线
```

### 必须完成的图表功能

- [ ] 保留函数名 `renderKlineChart()`，避免改动调用方。
- [ ] 仍然从 `GET /api/ohlcv?asset=SYMBOL&days=30` 取数据。
- [ ] 使用 `close` 价格生成 line series。
- [ ] 主色新增 CSS 或 JS 变量：
  - 建议名：`--bitget-primary`
  - 建议默认值：`#00F0B5`
  - 如果项目里已有 Bitget 官方素材，以素材主色为准。
- [ ] 使用两层或三层 line series 制造 glow：
  - glow 层：更粗、更透明
  - main 层：更细、更亮
  - optional area 层：低透明渐变
- [ ] 图表高度建议从 `380-420px` 收敛到 `260-320px`，减少压迫感。
- [ ] 坐标轴和网格只保留必要刻度，颜色降低到很弱。
- [ ] 空数据时显示简洁状态：`SOL 趋势数据暂不可用`。

### UI 空气感要求

整体风格方向：

```text
Google-like
更大留白
更圆润
更轻的边框
更少的强对比背景块
更清楚的信息层级
```

必须完成：

- [ ] 三栏之间 gap 从当前偏紧状态调整为更舒展的间距。
- [ ] 卡片圆角统一到 `16px-20px` 区间；小徽标保持轻量圆角。
- [ ] 右侧资产卡 `asset-mini` 降低信息密度，第一屏优先显示：
  - symbol/name
  - 当前价格
  - 持仓数量
  - 当前价值
  - 计划状态
- [ ] 次要信息如 FDV、研究状态、复查日期可以折到第二行，颜色更淡。
- [ ] 右侧统计卡数字要更醒目，但不能拥挤。
- [ ] 输入框、按钮、chips 保持圆润，但文字不能溢出。
- [ ] 页面不要添加大面积紫蓝渐变、装饰光球、复杂背景。
- [ ] 移动端不允许内容互相遮挡。

### 建议 CSS 变量

在 `dashboard.html` 的 `:root` 里增加或调整：

```css
--bitget-primary: #00F0B5;
--bitget-glow: rgba(0, 240, 181, 0.42);
--surface-soft: rgba(255, 255, 255, 0.055);
--surface-air: rgba(255, 255, 255, 0.035);
--radius-xl: 20px;
--shadow-soft: 0 18px 48px rgba(0, 0, 0, 0.22);
```

### 自检目标

- [ ] 页面中看不到蜡烛线。
- [ ] 页面中看不到成交量柱。
- [ ] 页面中看不到 EMA 线。
- [ ] 中间图表只有一条主要趋势曲线，并有明显但不刺眼的发光效果。
- [ ] 曲线主色符合 Bitget 主题。
- [ ] 右侧资产面板比当前更清爽，信息不乱堆。
- [ ] 1440px 桌面宽度下三栏都不挤。
- [ ] 390px 手机宽度下没有文字或卡片重叠。

### 检测命令

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
npm test
```

如果本机有 Playwright，负责人 4 会补充截图脚本。UI 负责人需要至少提供两张截图给负责人 4：

- 桌面视图：`1440x1000`
- 手机视图：`390x844`

### 完成标准

- 图表视觉从“交易软件 K 线”变成“Demo 级趋势洞察线”。
- UI 有更明显的 Google 空气感和圆润感。
- 资产面板信息层级清晰，不再乱。

---

## 6. 负责人 4：验收、README、视频与安全审查

### 目标

把本轮结果变成可以公开提交到 GitHub 黑客松页面的材料：README 讲清楚项目、视频可访问、敏感信息已清理、Demo 路径可验收。

### 需要创建或修改的文件

- 新增：`/Users/jasoncong/Desktop/Decision Brain/源代码/tests/plan12-portfolio-ui-acceptance.mjs`
- 新增：`/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XII-验收报告.md`
- 新增：`/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XII-安全审查报告.md`
- 可选新增截图目录：`/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XII-截图/`
- 修改：`/Users/jasoncong/Desktop/Decision Brain/README-目录说明.md`
- 修改：`/Users/jasoncong/Desktop/Decision Brain/源代码/README.md`
- 修改：`/Users/jasoncong/Desktop/Decision Brain/源代码/LOBSTER_INTEGRATION.md`
- 修改：`/Users/jasoncong/Desktop/Decision Brain/.gitignore`

### README 必须完成的内容

GitHub 项目页是最终参赛页，README 不是普通说明文档，必须承担评委第一入口的作用。

根目录 README：`/Users/jasoncong/Desktop/Decision Brain/README-目录说明.md`

- [ ] 第一屏说明项目名称、黑客松方向、核心一句话价值。
- [ ] 解释为什么要做 Decision Brain：
  - 交易 Agent 最大问题不是“能不能下单”，而是缺少长期记忆、仓位上下文、估值纪律和可追溯建议。
  - 用户开放式表达经常混杂情绪、仓位、资产简称、计划和风险，系统需要先理解，再调度工具。
- [ ] 写清楚目前已经完成的工作：
  - 本地 HTTP 服务
  - MCP 工具接口
  - Dashboard Demo
  - 多 Agent 委员会展示
  - Bitget MCP skill 展示层
  - 仓位/计划/估值/trace 记忆层
  - 资产面板和演示脚本
- [ ] 写清楚当前仍在打磨的问题：
  - 资产识别确认
  - 资产面板同步
  - 发光趋势图
  - UI 空气感
  - README/视频/安全提交
- [ ] 写清楚架构：
  - `Chat Orchestrator`
  - `Agent Fanout`
  - `Bitget MCP Adapter`
  - `Portfolio Memory`
  - `Valuation / Plan Engine`
  - `Dashboard UI`
  - `Trace / Evidence Ledger`
- [ ] 写清楚这些架构解决什么需求：
  - 防止 Agent 每轮从零开始
  - 防止把市场信息直接变成草率买卖建议
  - 让用户的仓位、计划、估值和监测有统一状态
  - 让评委能看到 Bitget MCP skills 的作用
- [ ] 放清楚快速运行命令和 Demo 路径。
- [ ] 放清楚“不做什么”：
  - 不自动交易
  - 不保存私钥
  - 不托管资金
  - 不承诺收益

产品 README：`/Users/jasoncong/Desktop/Decision Brain/源代码/README.md`

- [ ] 保留运行方式和 API 说明。
- [ ] 删除所有本机绝对路径链接，改成相对路径。
- [ ] 补充当前架构图或 Mermaid 图。
- [ ] 补充 demo 视频入口。
- [ ] 补充安全说明：`.env`、runtime state、API key、钱包密钥不进入仓库。

### README 视频方案

GitHub README 可以展示视频，但要按稳定性分级：

方案 A，推荐：

```markdown
[![Decision Brain Demo](assets/demo-cover.png)](https://github.com/Levelup-JC/decision-brain/releases/download/demo-v1/decision-brain-demo.mp4)
```

优点：GitHub 渲染稳定，封面可控，视频可以放 GitHub Release 或外部公开链接。

方案 B，可选：

```html
<video src="assets/decision-brain-demo.mp4" controls width="100%"></video>
```

风险：GitHub 对 README 中 video 标签的渲染和大文件加载不如封面链接稳定。

本轮要求：

- [ ] 至少完成方案 A：封面图 + 视频链接。
- [ ] 如果视频文件较大，不要直接塞进主仓库；优先放 GitHub Release。
- [ ] README 中写明视频内容：
  - 开放式对话
  - Bitget MCP / Agent 调度
  - 资产面板更新
  - 发光曲线
  - Trace 可追溯

### 上传前安全审查

负责人 4 必须在上传 GitHub 前做安全审查，未通过不能上传。

必须检查：

- [ ] `.env`、`.env.local`、`.env*.local` 不在 git tracked 文件里。
- [ ] `data/state.json` 不在 git tracked 文件里。
- [ ] `Lobster状态/state.json` 如果仍 tracked，内容必须是公开 demo placeholder，不能是真实运行状态。
- [ ] 不提交个人 API key。
- [ ] 不提交钱包私钥、助记词、seed phrase、keystore。
- [ ] 不提交 OpenClaw / Lobster / Vercel / ngrok / GitHub 的 token。
- [ ] 不提交个人机器绝对路径作为可执行配置，例如 `/Users/jasoncong/...`。
- [ ] bundle 配置只能使用占位符或相对脚本，不允许写死个人 home 路径。
- [ ] README 里的链接必须是 GitHub 可访问的相对路径或公开 URL。
- [ ] `.zip` 包如果要提交，必须先解压检查内部是否有敏感配置。

必须运行的扫描命令：

```bash
cd "/Users/jasoncong/Desktop/Decision Brain"
git status --short
git ls-files | rg '(^|/)(\\.env|\\.env\\.|state\\.json$|.*\\.zip$)'
rg -n --hidden --glob '!**/node_modules/**' --glob '!**/.git/**' --glob '!**/package-lock.json' --glob '!**/*.png' --glob '!**/*.zip' \
  'sk-or-v1-|sk-[A-Za-z0-9_-]{20,}|BEGIN .*PRIVATE KEY|Authorization: Bearer|OPENAI_API_KEY=|LLM_API_KEY=|BITGET_.*=|password\\s*[:=]|secret\\s*[:=]|mnemonic|seed phrase|/Users/' .
```

如果命中：

- 真密钥、token、私钥、助记词：立刻删除或替换为占位符，并确认历史提交是否需要清理。
- `.env`：加入 `.gitignore`，不得提交。
- 运行时 state：改为 demo placeholder，或从 git tracked 文件中移除。
- 本机绝对路径：README 改相对路径，配置改占位符或脚本动态路径。

### 安全审查报告格式

在 `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XII-安全审查报告.md` 写：

```markdown
# Plan XII 安全审查报告

## 1. 结论

- 是否允许上传 GitHub：允许 / 不允许
- 审查时间：
- 审查人：

## 2. 扫描命令

- `git status --short`：
- `git ls-files | rg ...`：
- `rg secret scan`：

## 3. 发现的问题

| 风险 | 文件 | 处理结果 |
|---|---|---|
| 本机绝对路径 | ... | 已改为相对路径/占位符 |
| runtime state | ... | 已改为 placeholder |

## 4. 上传前阻塞项

- P0：
- P1：

## 5. 最终确认

- `.env` 未提交：是/否
- API key 未提交：是/否
- 私钥/助记词未提交：是/否
- 本机绝对路径已处理：是/否
- README 链接可打开：是/否
```

### 必须验收的路径

路径 1：新增资产

```text
输入：我买了 SOL 100 个，成本 120
期望：右侧出现 SOL，数量 100，总估值变化
```

路径 2：更新已有资产

```text
输入：我买了 SOL 150 个，成本 118
期望：右侧仍只有一个 SOL，数量变成 150，总估值变化
```

路径 3：持仓总览

```text
输入：我的持仓总览
期望：Chief 回复与右侧资产列表一致
```

路径 4：趋势图

```text
点击或选中 SOL
期望：中间图表是发光曲线，不是蜡烛线
```

路径 5：UI

```text
桌面 1440x1000
手机 390x844
期望：无重叠、无文字溢出、右侧资产信息可读
```

路径 6：README

```text
打开 GitHub 项目首页
期望：评委能在 README 里看懂为什么做、做了什么、架构是什么、怎么运行、视频在哪里
```

路径 7：安全审查

```text
运行安全扫描命令
期望：没有真实密钥、私钥、助记词、token；没有会作为配置执行的个人机器绝对路径
```

### 验收脚本要求

`plan12-portfolio-ui-acceptance.mjs` 至少检查：

- [ ] `POST /api/manage-position` 写入 SOL 100。
- [ ] `GET /api/portfolio-summary` 返回 SOL，`units=100`。
- [ ] 再次 `POST /api/manage-position` 写入 SOL 150。
- [ ] `GET /api/portfolio-summary` 返回只有一个 SOL，`units=150`。
- [ ] `totalPositionValue` 等于 positions 的 `currentValue` 求和。
- [ ] `totalPositionValue` 不等于错误累加的 `portfolioValue`。

如果脚本能接浏览器，再增加：

- [ ] 页面 `#assetMiniList` 中出现 SOL。
- [ ] `#statPortfolio` 不为 `--`。
- [ ] `#klineChart` 存在 canvas。
- [ ] 页面 DOM 中没有 candlestick/volume 专用 series 的可见痕迹。

### 验收命令

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
npm test
```

启动本地服务：

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
npm start
```

服务启动后运行：

```bash
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
node tests/plan12-portfolio-ui-acceptance.mjs --http=http://127.0.0.1:4177
```

### 验收报告格式

在 `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XII-验收报告.md` 写：

```markdown
# Plan XII 验收报告

## 1. 验收结论

- 结论：通过 / 未通过
- 验收时间：
- 验收人：

## 2. 命令结果

- `npm test`：
- `node tests/plan12-portfolio-ui-acceptance.mjs --http=http://127.0.0.1:4177`：

## 3. 功能路径

| 路径 | 结果 | 证据 |
|---|---|---|
| 新增 SOL | 通过/未通过 | 截图或接口返回 |
| 更新 SOL 数量 | 通过/未通过 | 截图或接口返回 |
| 总估值更新 | 通过/未通过 | 截图或接口返回 |
| 发光曲线 | 通过/未通过 | 截图 |
| UI 空气感 | 通过/未通过 | 桌面/手机截图 |
| README 完整性 | 通过/未通过 | GitHub 页面或本地预览 |
| 视频入口 | 通过/未通过 | README 链接 |
| 安全审查 | 通过/未通过 | `Plan-XII-安全审查报告.md` |

## 4. 剩余问题

- P0：
- P1：
- P2：

## 5. Demo 备用说明

- 如果 live MCP 不可用：
- 如果图表数据不可用：
- 如果写入接口失败：
- 如果视频无法播放：
```

### 完成标准

- 有明确验收结论。
- 有命令结果。
- 有截图或接口证据。
- 有 README 和视频入口检查结果。
- 有安全审查报告。
- P0 问题必须为 0。
- 如果有 P1，必须写清楚是否影响黑客松现场演示。

---

## 7. 最终交付回复格式

每个负责人完成后，只允许按下面格式回复，方便用户收口：

```markdown
## 负责人 X 完成报告

### 1. 我负责的范围

- ...

### 2. 已完成

- ...

### 3. 修改文件

- `/Users/jasoncong/Desktop/Decision Brain/...`

### 4. 自检结果

- 新增资产同步：通过/未通过
- 更新资产数量：通过/未通过
- 总估值更新：通过/未通过
- 发光曲线：通过/未通过
- UI 无重叠：通过/未通过
- README 完整性：通过/未通过
- 视频入口：通过/未通过
- 安全审查：通过/未通过
- `npm test`：通过/未运行/失败

### 5. 剩余风险

- 无 / ...

### 6. 需要下一个负责人注意

- ...
```

负责人 4 最终汇总时使用：

```markdown
## Plan XII 最终验收回复

### 结论

通过 / 未通过

### 可演示路径

1. ...
2. ...
3. ...

### 测试证据

- `npm test`：
- Plan XII 验收脚本：
- 截图：
- README：
- 视频：
- 安全审查：

### 仍需注意

- ...
```

---

## 8. 用户对接话术

你后续只需要这样对接：

```text
请看这个计划文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XII-资产同步与UI打磨计划.md

你是负责人 X，按对应章节执行。
完成后按第 7 节“负责人 X 完成报告”格式回复。
不要看 G/H/I/J 旧分组。
```

如果对方是 UI 负责人，就发：

```text
请看这个计划文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XII-资产同步与UI打磨计划.md

你是负责人 3，重点做发光曲线和 Google 空气感 UI。
完成后按第 7 节格式回复。
```

如果对方是验收负责人，就发：

```text
请看这个计划文件：
/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XII-资产同步与UI打磨计划.md

你是负责人 4，重点做验收脚本、截图、README、视频入口、安全审查和最终验收报告。
完成后按第 7 节格式回复。
```

---

## 9. 本轮不做的事

- 不做真实自动交易。
- 不做复杂量化回测。
- 不重构整个项目架构。
- 不新增超过 4 个负责人。
- 不继续扩散历史 G/H/I/J 分组。
- 不把 K 线做成专业交易终端，本轮只做 Demo 级趋势展示。
- 不在 GitHub 公开仓库提交真实 `.env`、API key、钱包密钥、助记词、个人运行时状态或个人机器可执行绝对路径。
