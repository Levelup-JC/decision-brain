# C组完成报告 — 存储改造 + Vercel部署

完成时间：2026-06-26
负责人：C组（Jason）

---

## 任务范围

从A组拆出 A5（存储双实现）和 A6（Vercel部署），让A组专心做Agent编排和LLM。

---

## 新增文件（5个）

| 文件 | 行数 | 作用 |
|------|------|------|
| `src/storage-backend.mjs` | 18 | 自动探测环境：有KV_REST_API_URL走KV，否则走文件 |
| `src/file-backend.mjs` | 42 | 本地文件读写，原子写入（tmp+rename），含mtime查询 |
| `src/kv-backend.mjs` | 34 | Vercel KV/Upstash Redis，单key存整状态，异常兜底返回null |
| `api/index.mjs` | 3 | Vercel serverless入口，导出handleRequest |
| `vercel.json` | 10 | 全路径路由到/api/index，includeFiles含src/** |

---

## 改造文件（1个）

| 文件 | 改动 |
|------|------|
| `src/data-store.mjs` | 移除fs直接调用，改为调backend.readBlob/writeBlob。DataStore类对外API完全不变（load/save/update/resetCache/clear） |

---

## 未改动（零影响）

- 12个service：零改动
- api-service.mjs：零改动
- bitget-adapter.mjs：零改动
- server.mjs：零改动
- 所有测试文件：零改动

---

## 交付标准核验

| 标准 | 状态 |
|------|------|
| 不设KV环境变量时走文件存储 | 通过 |
| 设KV_REST_API_URL时走KV | 通过（代码逻辑，待Vercel环境实测） |
| 同一套代码，靠环境探测切换 | 通过 |
| evaluate后重启进程，数据持久化（文件模式） | 通过（测试验证） |
| 12个service零改动 | 通过 |
| npm test ≥30通过 | 29/30通过（1个预存失败，lobster config路径regex，与存储无关） |
| 密钥不进git | 通过（LLM key从env读，KV key从env读） |

---

## 与A组接口

DataStore的load/save/update接口完全不变。A组的chat-orchestrator和agent-runner通过api-service.mjs间接读写状态，DataStore对A组透明。A组已确认零改动直接可用。

---

## 部署说明

本地开发照旧：`npm start` → 127.0.0.1:4177

Vercel部署需配5个环境变量：
- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

---

## 新增依赖

`@vercel/kv`（npm install 已完成，仅KV模式触发动态import）
