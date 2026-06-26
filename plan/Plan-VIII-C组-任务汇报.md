# Plan-VIII-C组-任务汇报.md

> C 组 — 全链可观测性
> 完成时间：2026-06-26

## 1. 实施摘要

按照 Plan-VIII §3 C 组作战计划，完成全链可观测性改造。核心成果：每次 `/api/chat` 请求的 response 新增 `trace` 字段，前端中间面板按实际 fanout 动态渲染 agent 卡片并支持展开查看 MCP 工具调用明细，超时/失败卡片显式变红。

## 2. 修改文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/trace-collector.mjs` | **新建** | trace 数据结构 + current-request 单例模式 |
| `src/adapters/bitget-adapter.mjs` | 修改 | `_runSkillQueries`/`lookupAssetMarketData`/`scanDailySignals` 等所有 MCP 调用点接入 trace collector；方法签名增加可选 `traceCollector` 参数 |
| `src/agent-runner.mjs` | 修改 | `runFanoutAgents` 返回 `{agentResults, trace}`；每个 agent role 创建独立 trace collector |
| `src/server.mjs` | 修改 | `/api/chat` response 增加 `trace` 字段；超时分支产出 timeout trace；空 fanout 设空 trace |
| `src/services/asset-info-service.mjs` | 修改 | 接入 `getCurrentCollector()`，trace 由 collector 统一管理 |
| `src/ui/committee.js` | **重写** | 7 张固定卡 → 动态渲染 + 展开式工具调用明细 + 红态/超时/降级状态 |
| `src/ui/dashboard.js` | 修改 | `staggerAgentArrivals` 接收 trace 数据并分发到对应 agent 卡片；超时场景调 `markAgentTimeout` |
| `src/ui/dashboard.html` | 修改 | 新增 trace 展开/红态/错误状态 CSS |

## 3. trace 数据结构（已冻结）

```json
{
  "agentRole": "asset_info",
  "tool": "crypto_market",
  "args": { "action": "search", "query": "BTC" },
  "ok": true,
  "tookMs": 320,
  "cached": false,
  "rawSnippet": "...前200字真实返回...",
  "error": null
}
```

## 4. 功能点自检

| # | 检查项 | 状态 |
|---|--------|------|
| 1 | `/api/chat` response 含 `trace` 数组，字段齐全 | PASS |
| 2 | "BTC是什么" 的 trace 里含 MCP 工具调用记录 | PASS |
| 3 | 后端 console 输出 `[MCP]` 日志行 | PASS |
| 4 | 中间面板按本轮 fanout 动态渲染 | PASS |
| 5 | 点击 agent 卡可展开查看工具名+入参+耗时+原始返回片段 | PASS |
| 6 | fanout 超时 → 卡片变红显示"超时/未返回" | PASS |
| 7 | MCP 失败 → trace 里 `ok:false` + error 文案 | PASS |
| 8 | degraded 模式 → modeBadge 联动 | PASS |

## 5. 交付物

1. 本汇报文档
2. trace 结构样例（见 §3）
3. `src/trace-collector.mjs` — 供 A/B/D 组引用的契约实现
4. 修改后的源文件（7 个文件）

## 6. 与各组接口

- **A 组**：trace.agentRole 使用 fanout 中的 role（如 `asset_info`），无需额外对接
- **B 组**：`asset-info-service.mjs` 已接入 trace collector，每次 enrichAsset 调用的 MCP 请求自动留痕
- **D 组**：可直接断言 `response.trace.some(t => t.ok && KNOWN_MCP_TOOLS.includes(t.tool))`
