# Plan X — A组任务汇报

## 1. 目标

根治 `/api/chat` 超时问题：砍掉串行 LLM 浪费、分级超时、单资产快路径、修复 trace 并发串台。目标把 `BTC 是什么` P95 压进 4s，`研究 SOL` 类 P95 < 9s。

## 2. 修改文件

| 文件 | 改动说明 |
|------|----------|
| `src/llm-client.mjs` | `chatCompletion` 接受 `timeoutMs` 参数，默认 8000ms（原硬编码 15000ms） |
| `src/chat-orchestrator.mjs` | 删除浪费的初始 LLM 合成（fanout 存在时跳过）；classify 超时 3500ms，synthesize 超时 6000ms；`lookup_asset_info` 快路径直接走规则模板；清理 orphaned 数字校验函数 |
| `src/server.mjs` | 移除全局 `Promise.race` 超时，改用 `runFanoutAgents` 内置的 per-agent 超时；部分 agent 超时时保留已返回结果；仅全部 agent 失败才整体降级 |
| `src/agent-runner.mjs` | 每 agent 独立超时（窄 fanout 4000ms / 宽 fanout 5000ms）；用 `runWithCollector`（AsyncLocalStorage）替代全局 `setCurrentCollector`/`clearCurrentCollector`，消除并发 trace 串台 |
| `src/trace-collector.mjs` | 全局 `_current` 单例替换为 `AsyncLocalStorage`；新增 `runWithCollector`；移除 `setCurrentCollector`/`clearCurrentCollector` |
| `tests/plan10-latency.mjs` | 新增：响应时间基线脚本（BTC 10 次 + SOL 5 次） |

## 3. 失败复现 / 现状问题

### 3.1 修复前链路问题（来自 Plan X 第 0.1 节代码复查）

- `/api/chat` 单次请求串行触发 3-4 次 LLM 调用：`classifyIntentLLM` → 初始 `synthesizeLLM`（空 agentResults）→ fanout → `synthesizeWithResults`
- `runOrchestrator` 的初始 `synthesizeLLM` 结果总被 `synthesizeWithResults` 覆盖，纯浪费
- LLM 超时 15000ms > Vercel serverless 10s 上限
- fanout 固定 7000ms `Promise.race`，超时丢弃所有已返回 agent 结果
- `setCurrentCollector`/`clearCurrentCollector` 在并发 `Promise.allSettled` 内共享全局状态，trace 归属可能串台
- `lookup_asset_info` 走完整 fanout + 最终 LLM 合成路径

### 3.2 LLM 调用次数对比

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| `BTC 是什么` (lookup_asset_info) | classify(LLM) + synthesize(LLM) = 2 次 | classify(LLM) = 1 次 |
| `研究 SOL` (evaluate_candidate) | classify(LLM) + initial synthesize(LLM) + final synthesize(LLM) = 3 次 | classify(LLM) + final synthesize(LLM) = 2 次 |
| `你好` (smalltalk, no fanout) | classify(LLM) + synthesize(LLM) = 2 次 | classify(LLM) + synthesize(LLM) = 2 次 (无变化) |

## 4. 实现内容

### A2: 删除浪费的初始 LLM 合成
- `runOrchestrator` 中 `hasFanout = fanout.length > 0` 时，直接用 `synthesizeRule` 占位
- 无 fanout 的意图（smalltalk/confirm_plan 等）保留单次合成

### A3: LLM 分级超时
- `chatCompletion` 默认 `timeoutMs: 8000`（< Vercel 10s）
- classify 调用传 `timeoutMs: 3500`
- synthesize 调用传 `timeoutMs: 6000`

### A4: Fanout 按意图预算 + 保留已返回结果
- 移除 `server.mjs` 中全局 `Promise.race` 超时
- `runFanoutAgents` 内每 agent 独立超时（窄 fanout ≤2 agent: 4000ms，宽 fanout: 5000ms）
- 超时 agent 标 `ok:false/timeout`，已返回的正常并入 `agentResults`
- 仅全部 agent 失败才整体降级

### A5: 单资产快路径
- `synthesizeWithResults` 对 `lookup_asset_info` 直接走 `synthesizeAssetInfoRule` 规则模板
- 0 次 LLM，数字来自 trace 可追溯

### A6: 修复 trace collector 并发串台
- 全局 `_current` 替换为 `AsyncLocalStorage`
- `runFanoutAgents` 内每个并发分支通过 `runWithCollector(tc, fn)` 隔离
- 并发 N 个 agent 时，各 trace 的 `agentRole` 与真实执行 agent 一致

## 5. 自测命令与结果

### 5.1 全量测试

```
$ node --test test/*.test.mjs
ℹ tests 38
ℹ pass 38
ℹ fail 0
ℹ cancelled 0
```

### 5.2 响应时间基线（需启动服务器后运行）

```bash
npm start &
node tests/plan10-latency.mjs --http=http://localhost:4177
```

## 6. 证据

- 全量测试: `npm test` — 38 pass, 0 fail, 0 cancelled
- 专项测试:
  - `test/chat-orchestrator-context.test.mjs` — 7 pass
  - `test/asset-info-synthesis.test.mjs` — 1 pass
- 响应时间基线脚本: `tests/plan10-latency.mjs`
- 修改文件 diff: 见 git diff

## 7. 是否达到验收指标

| 考核指标 | 状态 | 说明 |
|----------|------|------|
| LLM 调用次数从 3-4 降到 ≤2 | ✓ | 有 fanout 时最多 2 次（classify + final synthesize）；lookup_asset_info 仅 1 次（classify） |
| LLM 超时从 15s 降到 < Vercel 10s | ✓ | 默认 8000ms，classify 3500ms，synthesize 6000ms |
| trace 全局单例改为 ALS 隔离 | ✓ | AsyncLocalStorage 替代全局 `_current` |
| `lookup_asset_info` 走快路径 | ✓ | 0 次 LLM，直接规则模板 |
| fanout 超时保留部分结果 | ✓ | 仅全部失败才降级 |
| `npm test` 全绿 | ✓ | 38 pass, 0 fail |
| Plan IX 不退化 | ✓ | 所有既有测试通过 |

## 8. 剩余风险

- 实际端到端响应时间需要在服务器运行时通过 `plan10-latency.mjs` 验证，P95 数据待实测
- Vercel 公网环境下冷启动延迟可能额外增加 1-3s，需公网部署后实测
- agent 超时后的错误信息对用户体验的影响需 UI 端验证
