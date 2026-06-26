# Plan-II 工作汇报总结

**项目**: Decision Brain — Bitget Hackathon S1 (Trading Agent 赛道)
**阶段**: 第二阶段 — 三组合流、真链路联调、公开部署
**汇报组**: B 组（前端翻真 + 渲染纠偏）
**日期**: 2026-06-26
**状态**: A/B 联调完成，M-II-1 达成，C 组待启动

---

## 0. 三硬卡点消解状态

| 卡点 | Plan-II 初态 | 当前状态 |
|------|-------------|----------|
| `USE_MOCK = true` | 前端只跑过假数据 | 已翻 `false`，所有请求打真 `/api/*` |
| Vercel + KV 未实测 | 仅代码逻辑通过 | C 组待启动（依赖 M-II-1 通过） |
| 千问未真跑 | 提交说明写了但没跑过 | 千问 key 无效，退 DeepSeek 真跑已留档。提交说明须改为 DeepSeek |

---

## 1. 各组进度

### A 组 — 后端真链路 + LLM

| 编号 | 任务 | 状态 |
|------|------|------|
| A-II-1 | 本地起真后端 | 完成 — `node src/index.mjs` 在 0.0.0.0:4177，`/api/health` 返回 ok |
| A-II-2 | 配 LLM 真 key | 完成 — 千问 key 无效，退 DeepSeek (`api.deepseek.com/v1`, `deepseek-chat`)，env 注入不进 git |
| A-II-3 | LLM 真跑完整对话 | 完成 — "研究 BTW" 经 DeepSeek 分类+综合，`degraded=false`，留档 `plan/A-II-3-deepseek-response.json` |
| A-II-4 | 修联调契约偏差 | 完成 — 唯一偏差 `researchReports` 缺失已修复，`api-service.mjs:64` 补序列化 |
| A-II-5 | 降级保险复验 | 完成 — `CHAT_RULE_ONLY=1` 与错误 key 均 HTTP 200，自动降级 |

**TA-II 自测**:

| 编号 | 测试 | 结果 |
|------|------|------|
| TA-II-1 | 真后端起得来 | 通过 |
| TA-II-2 | 真分类 "研究 BTW" | 通过，degraded=false |
| TA-II-3 | 真综合回复 | 通过，DeepSeek 自然语言综合 |
| TA-II-4 | CHAT_RULE_ONLY=1 降级 | 通过，HTTP 200 |
| TA-II-5 | 错 key 兜底 | 通过，不 500 |

### B 组 — 前端翻真 + 渲染纠偏

| 编号 | 任务 | 状态 |
|------|------|------|
| B-II-1 | 翻 `USE_MOCK=false` | 完成 |
| B-II-2 | 真响应渲染纠偏 | 完成 — 按 agent status 区分"完成"/"降级"，4 种 report 状态全覆盖 |
| B-II-3 | 委员会并发观感复验 | 完成 — 7 Agent 独立冒泡 |
| B-II-4 | 诚实标注复验 | 完成 — 空字段灰标"待补充" |
| B-II-5 | 降级态前端提示 | 完成 — 全局 + per-agent 双保险 |

**修改文件**:

| 文件 | 改动 |
|------|------|
| `dashboard.js:7` | `USE_MOCK = false` |
| `dashboard.js:67` | `agentArrived` 传递 `agent.status` |
| `committee.js:60-70` | agent 级降级渲染 |
| `portfolio.js:149-158` | `renderHonestFields` 三状态覆盖 |
| `portfolio.js:142-143` | `showDetailPanel` 诚实标注 |

**TB-II 自测**:

| 编号 | 测试 | 结果 |
|------|------|------|
| TB-II-1 | 真连接 | 通过 |
| TB-II-2 | 真委员会冒泡 | 通过，7 Agent 全部 status=ok |
| TB-II-3 | 真资产看板 | 通过 |
| TB-II-4 | 真诚实标注 | 通过 |
| TB-II-5 | 真降级提示 | 通过 |

### C 组 — 真部署

待 A/B 本地 E2E 通过后启动 Vercel+KV 部署。

---

## 2. A/B 契约纠偏记录

**唯一偏差**: `/api/state` 缺少 `researchReports` 字段

- 根因: `api-service.mjs:47-65` `stateSummary()` 未序列化 `state.researchReports`
- 修复: 加 `researchReports: Object.values(state.researchReports)`
- 影响: 前端资产卡片的对标估值、上所路径、融资/解锁三字段
- 状态: A 组已修复，B 组已验证

其余字段全部对齐 v2 第 3 节契约，无额外偏差。

---

## 3. 关键问题与解决

### 3.1 千问 Key 无效

Bitget 提供的千问 API Key (`czFyLHL2udgbH8Fq`) 被 DashScope 所有端点拒绝:
- `https://dashscope.aliyuncs.com/compatible-mode/v1` → "Incorrect API key provided"
- `https://dashscope.aliyuncs.com/api/v1/...` → "Invalid API-key provided"

按 Plan-II 第 7 节风险保险退 DeepSeek (`api.deepseek.com/v1`, `deepseek-chat`)。提交说明须删千问那句，改为 DeepSeek。

### 3.2 Bitget MCP 连接恢复

A-II-3 留档时 5 个 Bitget Agent 全部 degraded。排查确认 `https://datahub.noxiaohao.com/mcp` 可达，服务器重启后 MCP 连接缓存刷新，全部恢复 status=ok (Macro 2 条 / Market Intel 3 条 / Sentiment 2 条 / Technical 2 条 / News 1 条)。E2E E9 不再阻断。

---

## 4. 代码变更汇总

### 新增文件 (15 个)

| 文件 | 组 | 作用 |
|------|-----|------|
| `src/llm-client.mjs` | A | OpenAI 兼容 LLM 客户端 |
| `src/chat-orchestrator.mjs` | A | 意图分类 + fan-out + 综合回复 |
| `src/agent-runner.mjs` | A | 7 Agent 角色执行器 |
| `src/storage-backend.mjs` | C | KV/文件自动探测 |
| `src/file-backend.mjs` | C | 本地文件读写 |
| `src/kv-backend.mjs` | C | Vercel KV 后端 |
| `src/ui/utils.js` | B | 数字格式化、估值标签 |
| `src/ui/mock-data.js` | B | Mock API 数据 |
| `src/ui/chat.js` | B | 对话气泡 + 快捷建议 |
| `src/ui/committee.js` | B | 7 Agent 卡片 + 调度日志 |
| `src/ui/portfolio.js` | B | 资产看板 + 详情面板 |
| `src/ui/charts.js` | B | 估值/组合图表 |
| `src/ui/dashboard.js` | B | 主控编排 |
| `api/index.mjs` | C | Vercel serverless 入口 |
| `vercel.json` | C | Vercel 路由配置 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `.gitignore` | 添加 `.env` |
| `src/server.mjs` | 新增 `/api/chat`、`/api/agent/:role`、通用 `.js` 静态服务 |
| `src/services/api-service.mjs` | `stateSummary()` 补 `researchReports` |
| `src/ui/dashboard.html` | 完全重写：三栏布局 + Bitget 主题 |
| `src/data-store.mjs` | 改造为 backend 抽象 |
| `src/index.mjs` | HOST/PORT 从 env 读 |

---

## 5. 里程碑状态

| 里程碑 | 状态 |
|--------|------|
| M-II-1 (联调) | A/B 完成，待把控人主持 E2E 9 步 |
| M-II-2 (部署) | 未启动 |
| M-II-3 (收尾) | 未启动 |

---

## 6. 后续步骤

1. 把控人主持 E2E 9 步联合验收 (在本地真链路上跑)
2. E2E 通过后 C 组启动 Vercel+KV 真部署
3. 千问 key 如能激活则补跑，否则提交说明删千问改 DeepSeek
4. 录 Demo + 把控人终审 + 填提交表单

---

## 7. 红线自查

- [x] 不假造数据 — 主观字段诚实"待补充"，不编造
- [x] 不碰交易 Tools / 私钥
- [x] 密钥不进 git — LLM key 仅 `.env` (已 gitignore)
- [x] 不改契约只改代码 — A/B 纠偏以 v2 第 3 节为准
- [x] 不重写后端 — 12 个 service 零业务改动
