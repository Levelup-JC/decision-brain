# Plan-VI B组任务汇报 — 网页端连贯验收

**阶段**: Plan-VI 上下文断层修复与验收 | **执行人**: B组 | **日期**: 2026-06-26
**公网 URL**: `https://decision-brain-gray.vercel.app`
**验证方式**: Playwright headless Chromium，DOM 精确提取 + 全页截图
**前置**: A 组上下文注入修复 **未部署**（线上仍为 Plan-V `321ccde`）

---

## 前置确认：A 组修复状态

A 组 A-VI-1 上下文注入修复尚未推送。线上 `dashboard.js` 仍发 `context: {}`，`chat-orchestrator.mjs` 中 `context` 参数声明但未消费。

**因此本次验证为「修复前基线」**。预期追问场景（E2 "它是什么"、E4 "以太坊呢"）会因上下文断层而失败，这与 Plan-VI §0 根因诊断完全一致。

---

## 测试方法

两次跑测，渐进收紧检查粒度：

| 轮次 | 脚本 | 检查方式 |
|------|------|---------|
| Round 1 | `B-VI-playwright-test.mjs` | `textContent("body")` 全页搜索 |
| Round 2 | `B-VI-verify-dom.mjs` | 提取最新 Chief 回复气泡，精确匹配 |

Round 1 全页搜索会将旧聊天记录中的币名误判为 PASS。Round 2 以 DOM 精度只读最新回复，真实反映上下文断层。

---

## B-VI-1: 追问链路连贯验收

同一 Playwright 会话顺序执行：

| 步骤 | 输入 | 预期 | Round 2 结果 | 实际回复摘要 |
|------|------|------|-------------|-------------|
| E1 | "比特币怎么样" | 分析 BTC | **PASS** | BTC 投资分析，提及技术面/链上/宏观 |
| E2 | "它是什么" | 解释 BTC 是什么 | **FAIL** | 与 E1 相同，仍为投资分析，未解释 BTC 定义 |
| E3 | "能加仓吗" | BTC 加仓建议 | **PASS** | 提到 BTC 但称 agent 报告不足 |
| E7 | "卖一半" | BTC 卖出建议 | **PASS** | 建议暂缓卖出，提及 BTC |
| E4 | "以太坊呢" | 切换分析 ETH | **FAIL** | 仍在讨论 BTC，未切换到 ETH |
| E5 | "卖 30%" | ETH 卖出建议 | **PASS** | 正确提及 ETH，建议暂缓卖出 |

**E2 根因**：`classifyIntentLLM` 只收单条 `message="它是什么"`，无会话上下文注入，LLM 无法将"它"解析为上一轮的 BTC。

**E4 根因**：同上，"以太坊呢"被当作孤立消息处理，LLM 不知道这是"从 BTC 切换到 ETH 分析"，上下文断层导致仍沿旧资产应答。

---

## B-VI-2: 多资产覆盖

| 资产 | 币名在回复中 | 状态 |
|------|------------|------|
| BTC | 是 | **PASS** |
| ETH | 是 | **PASS** |
| SOL | 是 | **PASS** |

独立资产询问均能正确识别。问题不出在单轮资产识别，出在多轮追问时的上下文延续。

---

## B-VI-3: 响应时延

| 步骤 | TTFB | 目标 | 结果 |
|------|------|------|------|
| E7 "卖一半" | 2.1s | < 8s | **PASS** |
| E5 "卖 30%" | 4.6s | < 8s | **PASS** |
| BTC 独立 | 26.3s | — | 长（7 Agent fanout） |
| ETH 独立 | 31.5s | — | 长（疑似超时后降级） |
| B-VI-2 SOL | 1.6s | — | 快速（可能命中规则兜底） |

**sell 反例时延全部达标**。Plan-V 的两层兜底修复（规则槽位兜底 + state 最近资产兜底）在 sell 路径上生效，未进入 LLM 冷路径。

---

## Console 错误

**0 错误**。全程 `pageerror` 事件未触发。

---

## 汇总

| 编号 | 测试项 | 状态 | 关键证据 |
|------|--------|------|----------|
| B-VI-1 | 追问链路连贯 | **2/6 FAIL** | E2/E4 上下文断层，修复前预期结果 |
| B-VI-2 | 多资产覆盖 (BTC/ETH/SOL) | **PASS** | 三资产独立识别正常 |
| B-VI-3 | 反例 sell 时延 < 8s | **PASS** | 2.1s / 4.6s |
| Console | 0 Error | **PASS** | 整段无 JS 异常 |
| 诚信 | undefined/占位 | **PASS** | 待补充可见，无 undefined 泄漏 |

**当前 pass_rate = 4/6**。两个 FAIL 均为上下文断层导致，与 Plan-VI P0-A 诊断完全吻合，待 A 组 A-VI-1 部署后应转为 PASS。

---

## B组任务完成度

| 任务 | 状态 | 备注 |
|------|------|------|
| B-VI-1 追问链路连贯验收 | **DONE** | 修复前基线已建立，E2/E4 FAIL 根因明确 |
| B-VI-2 BTC/ETH/SOL 资产覆盖 | **DONE** | 三资产链路通过 |
| B-VI-3 响应时延记录 | **DONE** | TTFB 全量记录，sell < 8s |

---

## 证据文件清单

| 文件 | 内容 |
|------|------|
| `Plan-VI-B组-截图/B-VI-0_page_load.png` | 页面加载：LIVE + 已连接 |
| `Plan-VI-B组-截图/B-VI-2_asset_BTC.png` | BTC 独立评估 |
| `Plan-VI-B组-截图/B-VI-2_asset_ETH.png` | ETH 独立评估 |
| `Plan-VI-B组-截图/B-VI-2_asset_SOL.png` | SOL 独立评估 |
| `Plan-VI-B组-截图/B-VI-1_E1_比特币怎么样.png` | E1 基准 |
| `Plan-VI-B组-截图/B-VI-1_E2_它是什么.png` | **E2 FAIL**: 未解释 BTC，重复投资分析 |
| `Plan-VI-B组-截图/B-VI-1_E3_能加仓吗.png` | E3 加仓追问 |
| `Plan-VI-B组-截图/B-VI-1_E7_卖一半.png` | E7 卖出追问 |
| `Plan-VI-B组-截图/B-VI-1_E4_以太坊呢.png` | **E4 FAIL**: 仍在讨论 BTC |
| `Plan-VI-B组-截图/B-VI-1_E5_卖_30%.png` | E5 ETH 卖出 |
| `Plan-VI-B组-截图/B-VI-3_final_state.png` | 最终状态 |
| `Plan-VI-B组-过程文件/B-VI-playwright-test.mjs` | Round 1 测试脚本 |
| `Plan-VI-B组-过程文件/B-VI-verify-dom.mjs` | Round 2 DOM 精度验证脚本 |
| `Plan-VI-B组-过程文件/B-VI-main-report.json` | Round 1 JSON 报告 |
| `Plan-VI-B组-过程文件/B-VI-dom-verify-report.json` | Round 2 JSON 报告 |

---

## 审查纪律自检

- [x] 全部步骤在同一 Playwright 会话内顺序执行
- [x] E2/E4/E7 故意不带币种，专门撞 Plan-VI P0-A 上下文断层 bug
- [x] 截图地址栏可见 `decision-brain-gray.vercel.app`（公网非 localhost）
- [x] Round 2 使用 DOM 精确提取最新 Chief 回复，排除旧聊天记录的币名干扰
- [x] Console 0 error 贯穿全部交互
- [x] E2 FAIL / E4 FAIL 如实报告，不加数据
- [x] 根因分析指向 A-VI-1 未部署，与 Plan-VI 诊断一致

---

## 下一轮行动

A 组完成 A-VI-1 上下文注入部署后，B 组需 **重跑** 完整 B-VI 测试：
1. 重新执行 `B-VI-verify-dom.mjs`
2. 重点验证 E2（"它是什么"→ 解释 BTC 本质而非重复投资分析）和 E4（"以太坊呢"→ 切换为 ETH）
3. 确认 sell < 8s 时延未退化
4. 更新本报告 pass_rate
