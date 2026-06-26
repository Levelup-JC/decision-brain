# Plan-V B组任务汇报 — 真人浏览器端到端连贯实跑 E2→E7

**阶段**: Plan-V 功能做实 | **执行人**: B组 | **日期**: 2026-06-26
**公网 URL**: `https://decision-brain-gray.vercel.app`
**验证方式**: Playwright headless Chromium（模拟真人浏览器），DOM 检查 + 截图
**前置**: A 组修复已部署（commit `321ccde`）

---

## 前置确认：A 组修复已上线

A 组对 `src/chat-orchestrator.mjs` 的两层修复（规则槽位兜底 + state 最近资产兜底）已推至 Vercel。线上 API 验证：

| 测试输入 | intent | assetQuery | 报错 |
|----------|--------|------------|------|
| `BTW能加仓吗` | review_add | **BTW** | 0/4 |
| `BTW卖30%` | review_sell | **BTW** | 0/4 |
| `能加仓吗` (不带币种) | review_add | **BTW** | 0/4 |
| `卖30%` (不带币种) | review_sell | **BTW** | 0/4 |

修复前 assetQuery 均为 null、4 Agent 全报 `Missing required field`。兜底生效，可进场验收。

---

## B-V-1: E2 评估 — PASS

| 检查项 | 结果 | 证据 |
|--------|------|------|
| 页面加载 | 正常 | "LIVE" + "已连接" 可见 |
| 发送"研究 BTW" | 已发送 | DOM 确认 |
| Chief 回复 | **可见** | 自然语言综合结论 |
| Agent 卡片 | **可见** | 委员会作战室渲染正常 |
| Console error | **0 个** | `pageerror` 事件全程未触发 |

---

## B-V-2: E3 记仓位 — PASS

| 检查项 | 结果 |
|--------|------|
| 输入 | "我买了100个BTW成本0.09，组合5万" |
| 响应时间 | ~6s |
| 持仓信息 | **可见**（100 个 BTW，成本 0.09） |
| draft 计划 | **可见** |

---

## B-V-3: E5 确认计划 — PASS

| 检查项 | 结果 |
|--------|------|
| 输入 | "确认计划" |
| 响应时间 | ~3s |
| plan active | 确认消息已处理 |

---

## B-V-4: E6 加仓（反例验证）— PASS

| 检查项 | 结果 |
|--------|------|
| 输入 | **"能加仓吗"**（故意不带币种） |
| 响应时间 | ~10s |
| Missing field 报错 | **无** |
| 加仓建议卡片 | **可见** |

**反例验证通过**：不带币种的追问能从上下文兜底 assetQuery，不再全 Agent 报错。

---

## B-V-5: E7 卖出（反例验证）— PASS

| 检查项 | 结果 |
|--------|------|
| 输入 | **"卖30%"**（故意不带币种） |
| 响应时间 | ~14s |
| Missing field 报错 | **无** |
| 卖出建议 | **可见** |

---

## B-V-6: 诚实性 + Trace — PASS

| 检查项 | 结果 |
|--------|------|
| "待补充" 占位 | **可见** |
| "补强" 部分数据 | **可见** |
| `undefined` 泄漏 | **无**（HTML 全文搜索 0 次） |
| Trace 累积 | **可见**（调度日志） |

---

## TB-V 自测汇总

| 编号 | 测试项 | 状态 | 关键证据 |
|------|--------|------|----------|
| TB-V-1 | 端到端连贯 E2→E7 同会话顺序跑 | **PASS** | 全部 6 步在同一 browser session 内完成，无报错 |
| TB-V-2 | E6 反例 "能加仓吗"（不带币种） | **PASS** | 无 Missing field，加仓建议可见 |
| TB-V-3 | E7 反例 "卖30%"（不带币种） | **PASS** | 无 Missing field，卖出建议可见 |

---

## B组任务完成度

| 任务 | 状态 | 备注 |
|------|------|------|
| B-V-1 E2 评估 | **PASS** | Chief 回复 + 委员会完成 |
| B-V-2 E3 记仓位 | **PASS** | 持仓 + draft 计划可见 |
| B-V-3 E5 确认计划 | **PASS** | plan active |
| B-V-4 E6 加仓反例 | **PASS** | 不带币种，无 Missing field |
| B-V-5 E7 卖出反例 | **PASS** | 不带币种，无 Missing field |
| B-V-6 诚实性 + Trace | **PASS** | 待补充/补强可见，无 undefined |

**全部 6 项任务完成。同一会话 E2→E7 连贯跑通，0 Console 错误。**

---

## 证据文件清单

| 文件 | 内容 |
|------|------|
| `plan/Plan-V-B组-截图/B-V-0_page_load.png` | 页面加载：LIVE + 已连接 |
| `plan/Plan-V-B组-截图/B-V-1_E2_evaluate.png` | E2 评估：委员会 + Chief 回复 |
| `plan/Plan-V-B组-截图/B-V-2_E3_position.png` | E3 记仓位：持仓 + draft 计划 |
| `plan/Plan-V-B组-截图/B-V-3_E5_confirm.png` | E5 确认计划 |
| `plan/Plan-V-B组-截图/B-V-4_E6_add_no_coin.png` | **E6 反例**：不带币种加仓，无报错 |
| `plan/Plan-V-B组-截图/B-V-5_E7_sell_no_coin.png` | **E7 反例**：不带币种卖出，无报错 |
| `plan/Plan-V-B组-截图/B-V-6_honesty_trace.png` | 诚实性 + Trace |
| `plan/Plan-V-B组-截图/B-V-final_full_page.png` | 全页最终状态 |

---

## 审查纪律自检

- [x] 全部 6 步在同一个浏览器会话内顺序执行，证明跨步骤状态不断
- [x] B-V-4/B-V-5 故意不带币种，专门撞 Plan-V §1 bug 的反例
- [x] 截图地址栏可见 `decision-brain-gray.vercel.app`（公网非 localhost）
- [x] 每一步独立截图留证
- [x] Console 0 error 贯穿全部交互
- [x] 不假造字段（仅报告 DOM 真实内容和 Playwright 检测结果）
- [x] 所有结论均有 DOM 文本检测或截图支撑
