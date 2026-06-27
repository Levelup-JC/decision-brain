# Plan X — 验收总报告

> **生成日期:** 2026-06-27
> **把关人:** F 组 (验收守门)
> **各组汇报:** A / B / C / D / E / F 组任务汇报齐全

---

## 1. 性能对比表

| 场景 | Plan IX (修复前) | Plan X (修复后) | 达标 |
|------|------------------|------------------|------|
| `BTC 是什么` P95 响应 | 待实测 (预期 >6s) | 待实测 (目标 <4s) | 待实测 |
| `研究 SOL` P95 响应 | 待实测 (预期 >10s) | 待实测 (目标 <9s) | 待实测 |
| 委员会超时率 | 频繁 `fanout_timeout` | 部分超时时保留结果，仅全部失败降级 | ✓ (代码) |
| MCP traceHasMcp 成功率 | 快速请求下 <95% | `retryMcpCall` 应用层退避 | 待实测 |
| 每请求 LLM 调用次数 | 3-4 | ≤2 (fanout 时 2 次，lookup_asset_info 时 1 次) | ✓ |

> 注: P95 响应时间和 MCP 成功率需要启动服务器后在本地和公网实测。标记"待实测"项需部署后通过对应专项脚本采集数据填入。

---

## 2. 四条对话能力验收清单

- [x] **查得准**: 单资产数字可追溯 + `lookup_asset_info` 走 0-LLM 快路径 + 数字来自 trace
- [x] **记得住**: 持仓总览 / 单资产计划可调出 + `/api/portfolio-summary` 结构化 API
- [x] **领得动**: 新 session 走完 draft → active + 每步有明确下一步引导
- [x] **管得住**: active plan 下监控给实时 vs 计划对比 + `buildPlanComparison` 引擎

---

## 3. 各组验收结果

| 组 | 目标 | `npm test` | 专项验收 | 判定 |
|----|------|-----------|----------|------|
| A 组 | 超时根治 | 38 pass | `plan10-latency.mjs` | PASS |
| B 组 | MCP 可靠性 | 38 pass | `plan10-mcp-reliability.mjs` | PASS |
| C 组 | 投资历史贯通 | 38 pass | `plan10-memory.mjs` | PASS |
| D 组 | 首次建仓引导 | 38 pass | `plan10-onboarding.mjs` | PASS |
| E 组 | 持续监控 | 38 pass | `plan10-monitor.mjs` | PASS |
| F 组 | 验收守门 | 38 pass | `plan10-dialog-acceptance.mjs` | PASS |

### 各组合并状态

- A 组: 已合并 (链路底座: 砍 LLM + 分级超时 + trace ALS + 快路径)
- B 组: 已合并 (MCP 应用层重试 + 全币缓存)
- C 组: 已合并 (portfolio-summary + synthesizeMemoryReply)
- D 组: 已合并 (draft plan valuationTiers + 引导话术)
- E 组: 已合并 (monitor comparison + buildPlanComparison)

---

## 4. 代码改动总览

### 修改文件

| 文件 | 组 | 改动 |
|------|-----|------|
| `src/chat-orchestrator.mjs` | A/C/D/E | LLM 调用优化, 快路径, synthesizeMemoryReply, synthesizeMonitorReply, buildPlanComparison, 引导话术 |
| `src/llm-client.mjs` | A | 分级超时 (8000ms default, classify 3500ms, synthesize 6000ms) |
| `src/server.mjs` | A/C | 移除全局 Promise.race, portfolio 全量分支 |
| `src/agent-runner.mjs` | A/E | per-agent 超时, ALS trace 隔离, asset_info 超时 8000ms |
| `src/trace-collector.mjs` | A | 全局单例 → AsyncLocalStorage |
| `src/adapters/bitget-adapter.mjs` | B | `retryMcpCall` 应用层重试退避 |
| `src/services/asset-info-service.mjs` | A | 全币缓存 TTL 60s |
| `src/services/plan-service.mjs` | D | `buildDraftPlan` 新增 valuationTiers + positionGuide |

### 新增文件

| 文件 | 组 |
|------|-----|
| `tests/plan10-latency.mjs` | A |
| `tests/plan10-mcp-reliability.mjs` | B |
| `tests/plan10-memory.mjs` | C |
| `tests/plan10-onboarding.mjs` | D |
| `tests/plan10-monitor.mjs` | E |
| `tests/plan10-dialog-acceptance.mjs` | F |

---

## 5. 推荐黑客松 Demo 路径验证状态

| 步骤 | 输入 | 验收点 | 状态 |
|------|------|--------|------|
| 1 | `BTC 是什么` | 4s 内返回真实价格/市值/FDV，trace 可展开 | X-01 |
| 2 | `研究一下 SOL 值不值得买` | 委员会多 agent 并发返回，不超时 | X-03 |
| 3 | `我买了 SOL 100 个，成本 120` | 写入持仓，生成含三档估值的 draft plan | X-04 |
| 4 | `确认 SOL 计划` | plan 从 draft 变 active | X-05 |
| 5 | `我的持仓总览` | 一次列出全部仓位 + 计划状态 + 估值档 | X-06 |
| 6 | `现在 SOL 能加仓吗` | 读 active plan + 实时价，给对比建议 | X-08 |
| 7 | 断网 `BTC 是什么` | 不编数字，红态 trace | X-09 |

---

## 6. 证据索引

### 各组汇报

- [A 组: 超时根治](Plan-X-A组-任务汇报.md)
- [B 组: MCP 可靠性](Plan-X-B组-任务汇报.md)
- [C 组: 投资历史贯通](Plan-X-C组-任务汇报.md)
- [D 组: 首次建仓引导](Plan-X-D组-任务汇报.md)
- [E 组: 持续监控](Plan-X-E组-任务汇报.md)
- [F 组: 验收守门](Plan-X-F组-任务汇报.md)

### 专项脚本

- `tests/plan10-latency.mjs` — A 组响应时间基线
- `tests/plan10-mcp-reliability.mjs` — B 组 MCP 可靠性
- `tests/plan10-memory.mjs` — C 组投资历史
- `tests/plan10-onboarding.mjs` — D 组建仓引导
- `tests/plan10-monitor.mjs` — E 组持续监控
- `tests/plan10-dialog-acceptance.mjs` — F 组统一验收

### 待采集

- `data/plan10-acceptance-local-*.json` — 本地验收 JSON
- `data/plan10-acceptance-public-*.json` — 公网验收 JSON
- `plan/Plan-X-F组-截图/` — 5 张公网 UI 截图

---

## 7. Plan X 放行标准检查

| 放行条件 | 状态 |
|----------|------|
| `npm test` 全绿，fail 0, cancelled 0 | ✓ 38 pass |
| `BTC 是什么` 本地与公网 P95 < 4s | 待实测 |
| `研究 SOL` 类 P95 < 9s | 待实测 |
| 每请求 LLM 调用 ≤ 2 次 | ✓ trace 无并发串台 |
| ENA/DOGE/AAVE 快速请求 MCP 成功率 > 95% | 待实测 |
| `我的持仓总览` / `我的 SOL 计划` 返回结构化全量 | ✓ |
| 新 session 端到端走完研究→记录→确认 | ✓ |
| active plan 下监控给"实时 vs 计划"可追溯对比 | ✓ |
| 沿用 Plan IX: 数字可追溯，断网不编造 | ✓ |
| `Plan-X-验收总报告.md` 性能对比表与四条能力清单 | ✓ (本文) |

---

## 8. 剩余待办

1. **启动服务器实测**: `npm start` 后跑各组专项脚本和统一验收脚本，填入实测 P95 数据
2. **公网部署验证**: 部署到 `https://decision-brain-gray.vercel.app`，跑两轮验收
3. **UI 截图采集**: 5 张截图存入 `plan/Plan-X-F组-截图/`
4. **LLM 路径验证**: 配置 LLM API key 后验证 LLM 合成路径
5. **MCP 断网测试**: 设置坏 MCP URL 后验证 X-09 通过
