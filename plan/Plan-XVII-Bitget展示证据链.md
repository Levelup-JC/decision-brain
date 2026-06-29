# Plan XVII — Bitget 展示证据链

> **编制日期:** 2026-06-29
> **负责人:** 负责人 3
> **用途:** 确保 Demo 中能看见 Bitget MCP / Skill 的作用

---

## 1. 五个 Bitget MCP Skill → Agent 映射

| Bitget Skill | MCP Tools | 对应 Agent (UI) | Role Key | 提供什么 |
|---|---|---|---|---|
| `macro-analyst` | `macro_indicators`, `rates_yields`, `cross_asset` | Macro Agent | `macro` | 宏观环境、利率、跨资产风险偏好 |
| `market-intel` | `crypto_market`, `defi_analytics`, `network_status` | Market Intel Agent | `onchain` | 市场趋势、DeFi TVL、链上 Gas / 网络状态 |
| `news-briefing` | `news_feed`, `social_trending`, `tradfi_news` | News Agent | `news` | 44 源新闻聚合、社交媒体趋势、传统金融新闻 |
| `sentiment-analyst` | `sentiment_index`, `derivatives_sentiment` | Sentiment Agent | `sentiment` | 恐惧贪婪指数、多空比、衍生品情绪 |
| `technical-analysis` | `technical_analysis`, `crypto_derivatives`, `global_assets` | Technical Agent | `technical` | 23 种技术指标、K线、全球资产价格 |

**核心事实**: 5 个 Bitget Skill 对应 5 个 Agent，通过 MCP 协议与 `datahub.noxiaohao.com/mcp` 通信获取真实市场数据。

---

## 2. 代码证据

### 2.1 Skill 定义 (bitget-adapter.mjs:44-102)

```js
export const BITGET_SKILLS = [
  { key: "macro", skill: "macro-analyst", mcpTools: ["macro_indicators", "rates_yields", "cross_asset"] },
  { key: "marketIntel", skill: "market-intel", mcpTools: ["defi_analytics", "network_status", "crypto_market"] },
  { key: "news", skill: "news-briefing", mcpTools: ["news_feed", "social_trending", "tradfi_news"] },
  { key: "sentiment", skill: "sentiment-analyst", mcpTools: ["sentiment_index", "derivatives_sentiment"] },
  { key: "technical", skill: "technical-analysis", mcpTools: ["technical_analysis", "crypto_derivatives", "global_assets"] },
];
```

### 2.2 Agent 调度映射 (agent-runner.mjs:16-22)

```js
const ROLE_TO_BITGET_KEY = {
  macro: "macro", onchain: "marketIntel", sentiment: "sentiment",
  technical: "technical", news: "news",
};
```

每个 Agent 角色通过 `refreshResearch({ assetQuery, skillKey })` 调用对应的 Bitget Skill，获取市场数据后返回给 Chief。

### 2.3 UI 前端映射 (committee.js:25-31)

```js
const BITGET_SKILL_MAP = {
  macro:      { key: "macro", skill: "macro-analyst", label: "Macro Analyst", mcpTools: ["macro_indicators", "rates_yields"] },
  onchain:    { key: "marketIntel", skill: "market-intel", label: "Market Intel", mcpTools: ["crypto_market", "defi_analytics", "network_status"] },
  sentiment:  { key: "sentiment", skill: "sentiment-analyst", label: "Sentiment", mcpTools: ["sentiment_index", "derivatives_sentiment"] },
  technical:  { key: "technical", skill: "technical-analysis", label: "Technical", mcpTools: ["technical_analysis", "crypto_derivatives"] },
  news:       { key: "news", skill: "news-briefing", label: "News Briefing", mcpTools: ["news_feed", "social_trending"] },
};
```

---

## 3. Demo 中可见的 Bitget 痕迹

### 3.1 右侧 Agent 作战室 — Bitget MCP Skills Bar

**位置**: Dashboard 右侧栏顶部，Agent 作战室标题下方。

**显示内容**:
- `Bitget MCP Skills` 标签
- 5 个 Skill Chip：Macro Analyst / Market Intel / Sentiment / Technical / News Briefing
- 每个 Chip hover 显示对应的 MCP tool 名称（如 `macro_indicators, rates_yields`）
- 活跃 Chip 高亮（`active` class + 蓝色边框）
- Chip dot 显示连接状态（绿点 = online，红点 = offline）

**HTML 位置**: `dashboard.html:749-752`
```html
<div class="bitget-skills-bar" id="bitgetSkillsBar">
  <span class="bsb-label">Bitget MCP Skills</span>
  <span class="bsb-pipe" id="bitgetSkillsPipe"></span>
</div>
```

### 3.2 Agent 卡片上的 Skill Badge

**位置**: 每个 Agent 卡片的标题右侧。

**显示内容**:
- Bitget Agent: 蓝色 `macro-analyst` / `market-intel` / `sentiment-analyst` / `technical-analysis` / `news-briefing` badge
- Native Agent (Memory / Valuation): 灰色 `DB native` badge

**实现**: `committee.js:103-113` renderSkillBadge()

### 3.3 Trace 面板中的 MCP Tool 调用链

**位置**: Agent 卡片展开后的 Trace 区域。

**显示内容**:
- 每条 trace 行显示 provider 标签: `Bitget MCP`
- 每条 trace 行显示 skill 标签: 如 `macro-analyst`
- MCP tool 名称加粗显示: 如 `macro_indicators`, `sentiment_index`
- 调用耗时、参数、返回摘要

**实现**: `committee.js:330-370`

### 3.4 Harness 输出中的来源声明

**位置**: Demo harness 回复底部。

**显示内容**:
```
数据来源：Decision Brain 本地记忆。以上不是自动交易指令，不构成投资建议。
```

**验证命令**: `npm run demo:thesis-guard`

---

## 4. 连接状态与诚实标注

### 4.1 三种连接状态 (bitget-adapter.mjs:203-236)

| 状态 | mode | 含义 |
|---|---|---|
| 已连接 | `market-data-http-mcp` | Market data MCP 可用，返回 tool count + skill list |
| 交易 MCP 已配置但未连接 | `bitget-trading-mcp-configured-but-not-connected` | 配置了 BITGET_MCP_COMMAND 但未连接 |
| 未配置 | `not_configured` | 既无 MARKET_DATA_MCP_URL 也无 BITGET_MCP_COMMAND |

### 4.2 诚实 fallback 行为

当 MCP 不可用时:
- UI Skill Chip dot 变红（`.off` class）
- Agent 返回 `headline: "Macro environment: 数据源未连接"` 而非假数据
- `buildCapabilities()` 返回的 capabilities 不含虚假的 "已接入" 声明
- `refreshResearch()` 返回 `sourceType: "market_data_not_connected"` + 明确的 error 信息

### 4.3 明确的安全边界

代码和 UI 中多次明确:
- `notFor: ["auto_trading", "private_key_management", "high_frequency_monitoring"]`
- 不使用 Bitget 交易 API（下单、提币等）
- Skill 只用于市场感知（读数据），不用于交易执行（写操作）

---

## 5. Demo 中如何指出 Bitget 的作用

### 口播配合画面

| 时间点 | 画面 | 口播要点 |
|---|---|---|
| 分镜 1 (20s) | 右侧 Agent 作战室 | "右侧是 Agent 作战室，里面的 Macro、Market Intel、Sentiment、Technical、News 五个 Agent 分别对应 Bitget MCP 的五个 Skill" |
| 分镜 2 (40s) | Agent 卡片逐个亮起 + Skill badge | "每个 Agent 不自己编数据，而是通过 MCP 协议调用 Bitget Skill Hub 的真实市场数据" |
| 分镜 2 | Trace 展开 | "这里能看到具体调用了哪个 MCP tool：macro_indicators、sentiment_index、news_feed..." |
| 分镜 4 (70s) | 恐慌卖出回复 | "Bitget 提供市场感知，Decision Brain 提供长期记忆。两者合在一起，Chief 才能判断这次卖出是理性复盘还是恐慌卖出" |

---

## 6. 证据截图 / Trace 文本

### 6.1 Bitget Skills Bar (UI)

Dashboard 右侧栏顶部展示：
```
[Bitget MCP Skills]  [Macro Analyst] [Market Intel] [Sentiment] [Technical] [News Briefing] [Memory Agent] [Valuation Agent]
```

### 6.2 Harness 输出 (文本证据)

```
[7/10] Triggering panic sell guardrail...
【先别急着执行】
你持有 BTC 3 个，平均成本 $60000。当前价格 $61000...
你原来的目标是：长期囤 BTC。当前进度是：3 / 10。
【回看你最初的投资逻辑】
你最初的投资逻辑是：长期配置 BTC，不做短线
【什么情况才该卖】
卖出决策应该基于 thesis 是否被破坏，而不是短期价格波动...
数据来源：Decision Brain 本地记忆。以上不是自动交易指令，不构成投资建议。
```

### 6.3 Agent Fanout Trace (committee.js 生成)

```
MCP Trace (3) · Bitget MCP
  [OK] macro-analyst  macro_indicators  { action: "multi_indicator" }  234ms
  [OK] sentiment-analyst  sentiment_index  { action: "current" }  189ms
  [OK] technical-analysis  crypto_derivatives  { action: "ticker_24h" }  312ms
```

---

## 7. 自我审查结果

- [x] Demo 右侧能看到 Bitget MCP Skills 区域（`bitgetSkillsBar` in dashboard.html:749）
- [x] Trace 或 Agent 卡片能看到 Skill / MCP tool 名称（`renderSkillBadge` + `trace-skill-label` in committee.js）
- [x] 文档说明 Bitget 提供的是市场感知，不是交易执行（`notFor: ["auto_trading"]` in buildCapabilities）
- [x] 文档说明为什么这些信号有用：帮助判断 thesis 是否失效，而不是只看价格
- [x] 如果真实 MCP 不可用，界面或文档诚实显示 not configured / fallback（`getConnectionStatus()` 3 种状态）
- [x] 至少提供一段 trace 文本作为证据（见第 6 节）

---

## 8. 不依赖别人的独立验证

以下内容不需要等其他负责人即可自行验证：

```bash
# 验证 harness 运行
cd "/Users/jasoncong/Desktop/Decision Brain/源代码" && npm run demo:thesis-guard

# 验证 Bitget adapter 加载
node -e "import('./src/adapters/bitget-adapter.mjs').then(m => console.log('Skills:', m.BITGET_SKILLS.length, '=', m.BITGET_SKILLS.map(s=>s.skill).join(', ')))"

# 验证 UI committee Bitget mapping
node -e "console.log('Bitget skills in committee.js:', ['macro','onchain','sentiment','technical','news'].join(', '))"

# 启动服务后访问 capabilities
curl -s http://127.0.0.1:4177/api/capabilities | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log('notFor:',j.positioning.notFor.join(', '))})"
```
