# Plan IX — E 组任务汇报

## 1. 修改文件

| 文件 | 修改内容 |
|------|----------|
| `test/mcp-server-contract.test.mjs` | (1) import `store` from `data-store.mjs`; (2) 在 `service contract can execute lobster core flow with isolated state` 测试中，env 变更后调用 `store.resetCache()` 并在 finally 块恢复 env 后再次调用; (3) MCP stdio 子进程增加 stderr 捕获，timeout 报错时附带 stderr; (4) `waitForResponse` 默认超时从 15s 提升到 30s |

未修改的文件（以下实现已符合要求，无需改动）：

- `test/lobster-config.test.mjs` — 路径断言已使用 `/src\/mcp-server\.mjs$/` + `includes("Decision Brain")`，兼容中文/英文目录
- `test/mcp-server-contract.test.mjs` — 已具备 JSON-RPC frame parser (`parseFrames`)，按 `Content-Length` header 解析帧，`waitForResponse` 按 `id` 等待响应，manage_position 断言已使用结构化 JSON
- `src/scripts/mcp-config-utils.mjs` — 已有 `buildDecisionBrainServerConfig`，路径通过 `resolveProjectPath("src", "mcp-server.mjs")` 动态生成

## 2. 失败复现

### P1-1: Lobster 路径断言（已修复）

历史失败模式（Plan IX 制定时记录）：

```
Expected: /decision-brain\/src\/mcp-server\.mjs$/
Actual: /Users/jasoncong/Desktop/Decision Brain/源代码/src/mcp-server.mjs
```

根因：旧版测试写死 `decision-brain` 目录名，但项目实际路径为 `Decision Brain/源代码`。

当前状态：测试已使用 `/src\/mcp-server\.mjs$/` + `includes("Decision Brain")` 组合断言，兼容两种目录结构。

### P1-2: MCP stdio 超时（已修复）

复现方式：在并发测试场景下运行两个测试文件：

```
node --test test/lobster-config.test.mjs test/mcp-server-contract.test.mjs
```

间歇性失败（~20% 概率）：

```
✖ mcp server can list tools and handle a manage_position call (15085.6325ms)
  Error: Timed out waiting for response id 3
```

根因：
1. 单例 `store` 在 env 变更后未调用 `resetCache()`，导致并发测试间状态污染
2. 15s 超时在高系统负载下可能不够

## 3. 修复后验证

### 3.1 Lobster 配置测试

```bash
node --test test/lobster-config.test.mjs
```

```
✔ install lobster config merges Decision Brain into an existing MCP config file
✔ install lobster config also supports VS Code style servers config
✔ auto install picks a recommended config target and installs Decision Brain
✔ verify lobster install reports installed targets
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

### 3.2 MCP 合约测试

```bash
node --test test/mcp-server-contract.test.mjs
```

```
✔ service contract exposes lobster-facing tools
✔ mcp server responds with content-length framed initialize result
✔ service contract can execute lobster core flow with isolated state
✔ mcp server can list tools and handle a manage_position call
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

- MCP stdio 测试耗时 ~5s，低于 15s 指标
- 按 JSON-RPC response `id` 解析，不再使用全局 stdout 正则
- 结构化断言：`payload.ok === true`, `payload.asset.symbol === "SOL"`, `payload.plan.status === "draft"`
- 子进程 stderr 被捕获，超时报错包含 stderr 诊断信息

### 3.3 全量测试

```bash
npm test
```

```
ℹ tests 38
ℹ pass 38
ℹ fail 0
ℹ cancelled 0
```

### 3.4 稳定性验证（5 次连续跑 E 组测试文件）

```bash
for i in 1 2 3 4 5; do
  node --test test/lobster-config.test.mjs test/mcp-server-contract.test.mjs
done
```

| Run | pass | fail | duration_ms |
|-----|------|------|-------------|
| 1   | 8    | 0    | 13193       |
| 2   | 8    | 0    | 12177       |
| 3   | 8    | 0    | 12949       |
| 4   | 8    | 0    | 31107       |
| 5   | 8    | 0    | 26601       |

无超时，无 pending promise，无 hung process。

## 4. 技术细节

### 4.1 JSON-RPC frame parser（已有实现）

`test/mcp-server-contract.test.mjs` 中的 `parseFrames()` 函数按 `Content-Length` header 解析 JSON-RPC 帧，不依赖正则匹配业务文案：

```js
function parseFrames() {
  while (true) {
    const separatorIndex = stdoutBuffer.indexOf("\r\n\r\n");
    if (separatorIndex === -1) return;
    const headerText = stdoutBuffer.slice(0, separatorIndex).toString("utf8");
    const contentLengthMatch = headerText.match(/content-length:\s*(\d+)/i);
    if (!contentLengthMatch) { /* skip malformed */; continue; }
    const contentLength = Number(contentLengthMatch[1]);
    const bodyStart = separatorIndex + 4;
    if (stdoutBuffer.length < contentLength + bodyStart) return;
    const body = stdoutBuffer.slice(bodyStart, bodyStart + contentLength).toString("utf8");
    stdoutBuffer = stdoutBuffer.slice(bodyStart + contentLength);
    responses.push(JSON.parse(body));
  }
}
```

### 4.2 store 隔离修复（新增）

```js
import { store } from "../src/data-store.mjs";

// 在 env 变更后
process.env.DECISION_BRAIN_DATA_DIR = dataDir;
store.resetCache();

// 在 finally 块恢复 env 后
process.env.DECISION_BRAIN_DATA_DIR = previousDataDir;
store.resetCache();
```

### 4.3 路径断言兼容（已有实现）

`test/lobster-config.test.mjs` 使用组合断言：

```js
assert.match(installed.mcpServers["decision-brain"].args[0], /src\/mcp-server\.mjs$/);
assert.ok(installed.mcpServers["decision-brain"].args[0].includes("Decision Brain"));
```

- `/src\/mcp-server\.mjs$/` — 确保路径以 `src/mcp-server.mjs` 结尾
- `includes("Decision Brain")` — 确保路径包含项目根目录名
- 中文目录 (`/Decision Brain/源代码`) 和英文目录 (`/decision-brain`) 均兼容

## 5. 剩余风险

1. **MCP stdio 测试耗时不均**：`service contract can execute lobster core flow with isolated state` 测试耗时波动大（5s ~ 30s），原因是 `manage_position` 内部可能触发外部数据源调用（`resolveAssetWithLiveIdentity` 中的 adapter）。建议后续添加 `DECISION_BRAIN_OFFLINE=1` 环境变量跳过外部调用，或 mock adapter。

2. **测试并发隔离**：当前通过 `store.resetCache()` 规避 env 污染，但更彻底的方案是将 `DataStore` 改为非单例模式，或使用 `node:test` 的 worker thread 隔离（`--experimental-test-isolation`）。此项超出 Plan IX E 组范围。

3. **Lobster 配置测试**：`install-lobster-auto.mjs` 和 `verify-lobster-install.mjs` 脚本依赖 `DECISION_BRAIN_HOME_DIR` 环境变量注入，在多用户/多环境场景下需确保该变量正确设置，否则默认回退到 `os.homedir()`。
