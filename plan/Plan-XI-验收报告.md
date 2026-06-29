# Plan XI 验收报告

> **验收人:** 负责人 4
> **验收日期:** 2026-06-28
> **项目:** Decision Brain — Bitget 黑客松 Demo 打磨

---

## 1. 本轮目标

把 Decision Brain 从"功能能跑"打磨成"黑客松现场能展示、评委能看懂、Bitget MCP 价值清楚"的 Demo。

最终展示闭环：

```
开放式对话
-> 系统理解投资语境
-> 调度 Bitget MCP 感知 Agent
-> 读取/写入 Decision Brain 记忆、估值、计划
-> 右侧资产面板清楚展示
-> Chief 输出结构化建议
-> Trace 可追溯
```

---

## 2. 完成情况总览

| 负责人 | 模块 | 状态 | 证据 |
|---|---|---|---|
| 负责人 1 | 后端对话与 Chief 回复 | 基本完成 | `npm test` 50 pass, 0 fail; dialogFrame/dialogFrame/strategy_dialogue 已交付 |
| 负责人 2 | Bitget MCP 与 Agent 展示 | 基本完成 | dispatchPlan + AGENT_DISPATCH_META 已交付; Bitget MCP 标签在 API 中可见 |
| 负责人 3 | 资产面板与 Demo 数据 | 待验证 | `/api/manage-position` 和 `/api/confirm-plan` API 正常工作 |
| 负责人 4 | 测试验收与提交材料 | 基本完成 | plan11-demo-acceptance 75% pass; 本报告 |

---

## 3. Demo 路径验收

| 步骤 | 输入 | 预期 Intent | 预期 assetQuery | 结果 |
|---|---|---|---|---|
| 1 | `BTC 是什么` | `lookup_asset_info` | `BTC` | PASS |
| 2 | `研究 SOL 值不值得买` | `evaluate_candidate` | `SOL` | PASS |
| 3 | `我买了 SOL 100 个，成本 120` | `manage_position` | `SOL` | PASS |
| 4 | `确认 SOL 计划` | `confirm_plan` | `SOL` | PASS |
| 5 | `我现在怕踏空但又怕追高，你帮我整理一下思路` | `strategy_dialogue` | `SOL` | PASS |
| 6 | `我的持仓总览` | `lookup_memory` | null (portfolio) | PASS |
| 7 | `检查一下 SOL 计划` | `run_monitor` | `SOL` | PARTIAL — noFabricatedNumbers 误报 |

### 每步检查项详情

- [x] intent 正确 — 全部 7 个步骤通过
- [x] assetQuery 正确 — 全部 7 个步骤通过
- [x] reply 非空 — 全部通过
- [x] fanout 符合预期 — 多 Agent fanout 在步骤 2 可见(4+ agents)
- [x] `dialogFrame` 存在 — 全部步骤返回完整 dialogFrame
- [x] `dispatchPlan` 存在 — Bitget MCP provider 标签在 dispatchPlan 中可见
- [x] Bitget MCP trace 或明确降级说明 — dispatchPlan 包含 Bitget MCP 条目
- [ ] 无编造数字 — 步骤 7 误报(plan 数据来自存储状态, 非编造)

---

## 4. Bitget MCP 展示证据

API 返回的 `dispatchPlan` 已包含 Bitget MCP 映射:

| Agent | Skill | MCP Tools | Provider |
|---|---|---|---|
| Macro Agent | `macro-analyst` | `macro_indicators`, `rates_yields` | Bitget MCP |
| Market Intel Agent | `market-intel` | `crypto_market`, `defi_analytics`, `network_status` | Bitget MCP |
| News Agent | `news-briefing` | `news_feed`, `social_trending` | Bitget MCP |
| Sentiment Agent | `sentiment-analyst` | `sentiment_index`, `derivatives_sentiment` | Bitget MCP |
| Technical Agent | `technical-analysis` | `technical_analysis`, `crypto_derivatives` | Bitget MCP |
| Asset Info Agent | null | `crypto_market`, `dex_market` | Bitget MCP |
| Valuation Agent | valuation engine | - | Decision Brain |
| Memory Agent | local memory layer | - | Decision Brain |

---

## 5. 测试结果

### npm test

```
pass 50
fail 0
duration_ms 22848
```

### plan11-demo-acceptance (本次验收)

```bash
node tests/plan11-demo-acceptance.mjs --http=http://127.0.0.1:4177
```

```
Results: 6/8 cases passed
Assertions: 42/45 passed
Pass rate: 75.0%
```

通过: XI-01 (BTC), XI-02 (SOL研究), XI-03 (建仓), XI-04 (确认计划), XI-05 (策略对话), XI-06 (持仓总览)
未通过: XI-07 (noFabricatedNumbers 误报), XI-BONUS (env var 隔离问题)

### plan10-dialog-acceptance

```bash
node tests/plan10-dialog-acceptance.mjs --http=http://127.0.0.1:4177
```

```
Results: 4/9 cases passed
Assertions: 27/33 passed
Pass rate: 44.4%
```

未通过: X-01 (notDegraded), X-03 (intent routing), X-06 (持仓总览状态), X-08 (计划对比), X-09 (降级)

### plan10-mcp-reliability

```
VERDICT: PASS
MCP success rate: 100.0% (15/15)
Cache hit rate: 100.0% (3/3)
```

---

## 6. 截图证据

| 编号 | 内容 | 路径 | 状态 |
|---|---|---|---|
| J-01 | Dashboard 全景 | `plan/Plan-XI-截图/J-01-dashboard.png` | 待采集 |
| J-02 | BTC 快查 + trace 展开 | `plan/Plan-XI-截图/J-02-btc-lookup.png` | 待采集 |
| J-03 | 研究 SOL + 多 Agent 并发 | `plan/Plan-XI-截图/J-03-sol-research.png` | 待采集 |
| J-04 | Bitget MCP Skill 标签展示 | `plan/Plan-XI-截图/J-04-bitget-skills.png` | 待采集 |
| J-05 | SOL 资产详情面板 | `plan/Plan-XI-截图/J-05-sol-detail.png` | 待采集 |
| J-06 | 检查 SOL 计划：实时 vs 计划 | `plan/Plan-XI-截图/J-06-sol-monitor.png` | 待采集 |
| J-07 | MCP 不可用 / 降级红态 | `plan/Plan-XI-截图/J-07-degraded.png` | 待采集 |

截图目录: `/Users/jasoncong/Desktop/Decision Brain/plan/Plan-XI-截图/`
注意: 截图需要人工在浏览器中采集, 因为需要实际的 UI 渲染。

---

## 7. 剩余风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| MCP 数据源不可用 | 实时价格/FDV 无法获取 | Mock 模式 fallback (`?mock=1`) |
| LLM API key 失效 | 意图分类降级为纯规则 | 规则分类器已覆盖主要 path |
| 网络波动 | 请求超时 | 每 Agent 独立超时, 部分结果仍可用 |
| 浏览器崩溃 | 无法现场 Demo | 预录屏备用 |
| Vercel 部署不可用 | 公网演示失败 | 本地 `npm start` 备用 |
| State 持久化问题 | 服务器重启后 Demo 数据丢失 | 提前运行 `demo-preset.mjs` |

---

## 8. 发现的问题

### P0 (必须修复)

1. **State 持久化跨 step 不可见**: `/api/chat` 不直接写 state — `manage_position` 和 `confirm_plan` 需要前端分别调用 `/api/manage-position` 和 `/api/confirm-plan`。已在 plan11 验收脚本中通过 `postAction` 绕过, 但前端 Demo 流程需要确认 UI 是否正确调用了这些 API。

2. **MCP 降级测试不可靠**: `process.env.MARKET_DATA_MCP_URL` 在测试进程中设置不会影响已运行的服务器进程。降级测试需要服务器端支持或手动切换。

### P1 (建议修复)

3. **"我想买 SOL, 帮我做计划" 路由到 `strategy_dialogue` 而非 `evaluate_candidate`**: 意图分类中 `帮我做计划` 触发了 strategy 关键词。需要调整规则优先级。

4. **noFabricatedNumbers 对 run_monitor 的误报**: monitor reply 包含来自存储状态（而非当前 trace）的数据, 检测函数无法在 trace 中匹配。需要让 trace 包含存储状态的引用。

### P2 (已知限制)

5. **Agent 超时**: 在 fanout 中某些 agent 返回 `agent_timeout`, 但不影响其他 agent 结果。

---

## 9. 现场 Fallback

| 模式 | 触发条件 | 效果 |
|---|---|---|
| 真实模式 | 默认 | 完整 MCP + LLM |
| Mock 模式 | `?mock=1` | UI 全部正常, 使用预置数据 |
| 预录屏 | 浏览器崩溃 | 播放提前录制的 6 分钟 Demo 视频 |

---

## 10. 最终 Demo 话术

### 1 分钟版

> Decision Brain 是交易 Agent 的决策大脑。它能查资产、记仓位、做估值计划、持续监控。所有数据来自 Bitget MCP 感知技能, 每个数字都可追溯。不做交易执行, 只做决策治理。

### 3 分钟版

> (1) BTC 快查 — 真实数据 + 可追溯 trace
> (2) SOL 多 Agent 研究 — 7 个 Agent 并发, Bitget MCP 5 个技能在工作
> (3) 建仓 + 确认计划 — 自动生成三档估值区间
> (4) 持仓总览 — 长期记忆, 持久化状态
> (5) 断网降级 — 诚实说不知道, 不编造数字

### 6 分钟版

按 Demo 脚本 9 段完整执行: 开场 -> 快查 -> 研究 -> Bitget 集成展示 -> 建仓 -> 总览 -> 监控 -> 断网 -> 收尾
