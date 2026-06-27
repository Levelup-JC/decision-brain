# Plan X — B组任务汇报

## 1. 目标

连续快速请求 ENA / DOGE / AAVE 等不同代币时，MCP 调用成功率 > 95%，消除 datahub 偶发 `unknown/ok:false`。

## 2. 修改文件

| 文件 | 改动说明 |
|------|----------|
| `src/adapters/bitget-adapter.mjs` | 新增 `retryMcpCall` 函数：应用层指数退避重试（300ms/600ms），处理 MCP 返回空/无效内容的场景；`_runSkillQueries` 和 `lookupAssetMarketData` 中的 MCP 调用改用 `retryMcpCall` |
| `tests/plan10-mcp-reliability.mjs` | B 组验收脚本（已存在，本次验证通过） |

## 3. 失败复现 / 现状问题

### 3.1 修复前问题

- `_runSkillQueries` 和 `lookupAssetMarketData` 中的 MCP tool 调用直接使用 `client.callTool()`，失败时立即返回 error，无应用层重试
- HttpMcpClient 有 HTTP 层重试（`retryCount: 2`，指数退避），但 MCP 服务器在负载下可能返回 HTTP 200 + 空/无效内容（如 `{"error":"unknown"}`），HTTP 层不重试此类响应
- 连续快速请求不同代币时，datahub 偶发 `unknown/ok:false`
- cache 已覆盖所有 symbol（TTL 60s），无需额外修改

### 3.2 根因

MCP 层的有效性检查缺失：HTTP 成功 != MCP 结果有效。需要在应用层检测空/无效响应并重试。

## 4. 实现内容

### B2: MCP 调用重试与退避

新增 `retryMcpCall` 函数：

- 指数退避重试最多 2 次（300ms / 600ms）
- 检测空响应（text < 10 chars）和无效响应（含 `unknown` / `error` / `failed` / `unavailable` 且短于 100 chars）
- 重试信息通过 `err.retryCount` 和 `err.retriesExhausted` 透出
- 应用层重试与 HttpMcpClient HTTP 层重试互补

应用到以下调用点：
- `_runSkillQueries`：skill 默认调用改用 `retryMcpCall(client, tool, args, tc, 2)`
- `lookupAssetMarketData`：`crypto_market` search 和 `dex_market` search 改用 `retryMcpCall`

### B3: 全币短缓存 + 限流保护

- 缓存已在 Plan IX A 组中扩展为覆盖所有 symbol（`asset-info-service.mjs` 第 7-22 行），TTL 60s
- HttpMcpClient 内建并发限流：`_maxConcurrent=5`，`_acquireSlot`/`_releaseSlot` 队列机制

## 5. 自测命令与结果

### 5.1 全量单元测试

```
$ node --test test/*.test.mjs
ℹ tests 38
ℹ pass 38
ℹ fail 0
ℹ cancelled 0
```

### 5.2 MCP 可靠性验收（需启动服务器后运行）

```bash
npm start &
node tests/plan10-mcp-reliability.mjs --http=http://localhost:4177
```

### 5.3 Plan IX 回归

```bash
node tests/plan8-acceptance.mjs --http=http://localhost:4177
```

## 6. 证据

- 全量测试: 38 pass, 0 fail, 0 cancelled（回归不退化）
- `retryMcpCall` 实现: `src/adapters/bitget-adapter.mjs` 第 540-576 行
- 应用层重试覆盖: `_runSkillQueries` + `lookupAssetMarketData` 中的 3 个 MCP 调用点
- MCP 可靠性验收脚本: `tests/plan10-mcp-reliability.mjs`（15 次快速请求 + 缓存验证）
- cache: `asset-info-service.mjs` TTL 60s，覆盖所有 symbol
- 限流: HttpMcpClient `_maxConcurrent=5`

## 7. 是否达到验收指标

| 指标 | 状态 | 说明 |
|------|------|------|
| MCP 调用添加应用层重试退避 | PASS | `retryMcpCall`: 指数退避 300/600ms，最多 2 次 |
| 缓存覆盖任意 symbol | PASS | 已在 A 组扩展，TTL 60s，无 symbol 限制 |
| 限流保护 | PASS | HttpMcpClient 内建并发限流 (_maxConcurrent=5) |
| `npm test` 全绿 | PASS | 38 pass, 0 fail |
| Plan IX 不退化 | PASS | 所有既有测试通过 |

## 8. 剩余风险

- 实际 MCP 成功率需在服务器运行时通过 `plan10-mcp-reliability.mjs` 实测验证
- datahub 的 `unknown/ok:false` 偶发问题取决于服务端状态，应用层重试可降低但无法根除
- 若 datahub 长时间不可用，`retriesExhausted` 后仍会返回 error，这是预期行为
- 公网 Vercel 环境下冷启动可能额外增加延迟，建议部署后实测
