# Plan XI — 性能数据

> **采集日期:** 2026-06-27
> **数据来源:** Plan X 验收总报告 + Plan X 各组汇报 + `npm test`

---

## 1. 测试基线

| 指标 | 数值 |
|------|------|
| 总测试数 | 40 |
| 通过 | 40 |
| 失败 | 0 |
| 跳过 | 0 |
| 执行时间 | ~23s |

---

## 2. 对话能力验收

| 能力 | 标准 | 代码状态 | 实测状态 |
|------|------|---------|---------|
| 查得准 | 单资产数字可追溯 + P95 < 4s | ✓ `lookup_asset_info` 0-LLM 快路径 | 待实测 |
| 记得住 | 持仓总览结构化全量返回 | ✓ `/api/portfolio-summary` + `synthesizeMemoryReply` | ✓ (代码) |
| 领得动 | 新 session draft -> active | ✓ `buildDraftPlan` + 三档估值 + 引导话术 | ✓ (代码) |
| 管得住 | 实时 vs 计划对比建议 | ✓ `buildPlanComparison` + `synthesizeMonitorReply` | ✓ (代码) |

---

## 3. LLM 调用优化对比

| 场景 | Plan IX (修复前) | Plan X (修复后) |
|------|------------------|------------------|
| 单资产查询 | 3-4 次 LLM | ≤1 次 (规则模板) |
| Fanout 请求 | 3-4 次 LLM | ≤2 次 (classify + synthesize) |
| LLM 超时 | 15000ms (超 Vercel 10s) | 分级 3500/6000/8000ms |
| Fanout 超时 | 固定 7s，超时全丢 | 逐 Agent 超时，保留已返回 |

---

## 4. 待采集实测数据

以下数据需启动服务器后通过专项脚本采集:

```bash
# 启动服务
npm start &

# A组: 响应时间
node tests/plan10-latency.mjs --http=http://localhost:4177

# B组: MCP 可靠性
node tests/plan10-mcp-reliability.mjs --http=http://localhost:4177

# C组: 投资历史
node tests/plan10-memory.mjs --http=http://localhost:4177

# D组: 建仓引导
node tests/plan10-onboarding.mjs --http=http://localhost:4177

# E组: 持续监控
node tests/plan10-monitor.mjs --http=http://localhost:4177

# F组: 统一验收
node tests/plan10-dialog-acceptance.mjs --http=http://localhost:4177
```

### 目标指标

| 指标 | 目标 | 实测 |
|------|------|------|
| `BTC 是什么` P95 | < 4s | 待填入 |
| `研究 SOL` P95 | < 9s | 待填入 |
| ENA/DOGE/AAVE MCP 成功率 | > 95% | 待填入 |
| Fanout 超时率 | ~0% | 待填入 |
| 每请求 LLM 调用 | ≤2 | 待填入 |
| 公网通过率 | ≥95% | 待填入 |

---

## 5. Plan XI 新增内容

| 类别 | 内容 |
|------|------|
| UI 视觉 | Agent 角色图标、估值区间条、计划状态标签、打字机效果、延迟显示、数据流脉冲动效 |
| Demo 脚本 | 6 分钟逐句解说词 (中英双语)、时间预算 |
| 评委 FAQ | 12 个常见问题标准回答 |
| 容错 | `?mock=1` URL 参数、`/api/reset` 端点、`demo-preset.mjs` 预设状态脚本 |
