# A 组完成汇报

**负责人**: （填名字）
**时间**: 2026-06-26
**范围**: A1-A4（A5/A6 由 C 组完成）

---

## 新增文件

| 文件 | 任务 | 说明 |
|------|------|------|
| `src/llm-client.mjs` | A3 | OpenAI 兼容协议客户端，15s 超时保护 |
| `src/chat-orchestrator.mjs` | A1+A4 | 意图分类 + fan-out + 综合回复，含规则降级 |
| `src/agent-runner.mjs` | A2 | 7 个 Agent 角色执行器，映射已有 api-service/bitget-adapter |

## 修改文件

| 文件 | 变更 |
|------|------|
| `src/server.mjs` | 新增 `POST /api/chat` 和 `POST /api/agent/:role` 路由 |
| `src/services/api-service.mjs` | 补充缺失的 `buildResearchReport` import |

## 新增端点

### `POST /api/chat`（§3.1 契约）

请求: `{ "message": "...", "sessionId": "demo-001", "context": {} }`

响应: `{ ok, intent, assetQuery, fanout, agentResults, reply, suggestions, degraded }`

- LLM 可用时优先 LLM 分类+综合，不可用时自动降级规则
- fanout 非空时自动并行执行 Agent 并写回 agentResults
- `CHAT_RULE_ONLY=1` 强制降级，`degraded=true`

### `POST /api/agent/:role`（§3.2 契约）

`:role` ∈ `memory|macro|onchain|sentiment|technical|news|valuation`

请求: `{ "assetQuery": "BTW" }`

响应: `{ ok, role, status, headline, data, tookMs }`

## LLM 配置

全部从环境变量读取，不写进代码：

- `LLM_BASE_URL`（默认 DeepSeek）
- `LLM_API_KEY`
- `LLM_MODEL`（默认 deepseek-chat）
- `CHAT_RULE_ONLY=1`（强制规则降级）

## 验收结果

| 编号 | 测试 | 结果 |
|------|------|------|
| TA1 | `npm test` | 29 pass / 1 fail（预存问题：lobster-config 路径 regex） |
| TA2 | chat→evaluate "研究BTW" | intent=evaluate_candidate，7 Agent 并行返回 |
| TA3 | chat→manage "我持有100个BTW成本0.09" | intent=manage_position，fanout=[memory,valuation] |
| TA4 | /api/agent/sentiment | role=sentiment，headline+tookMs 齐全 |
| TA5 | CHAT_RULE_ONLY=1 | degraded=true，意图正确，链路通 |
| TA6 | LLM 错误密钥 | 不 500，自动降级 |
| TA9 | git grep 密钥 | 无明文密钥 |

## 关键约束

- 编排层只调 api-service/bitget-adapter 已有导出，零新业务逻辑
- JSON 响应结构严格按 §3.1/§3.2
- 与 C 组无耦合：不直接碰 DataStore，全部通过 api-service 间接读写

## 待办

- [ ] Demo 用千问跑一次并在项目说明点名（等 LLM_API_KEY 配成千问）
- [ ] 与 B 组联调（等待 B 组前端就绪）
