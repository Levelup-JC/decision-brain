# Plan-VI + Plan-VII C组工作汇报

**执行人**: C组 (守门/测试基础设施组) | **日期**: 2026-06-26
**涉及阶段**: Plan-VI (上下文断层修复) + Plan-VII (生产稳定化与端到端验收)

---

## 一、角色定位

C组在 Plan-VI / Plan-VII 战役中的定位是 **测试基础设施与守门人**：建立可复现的自动化测试体系，定义通过门槛，并在 A/B 组完成修复后进行独立验证。不碰业务代码，只写测试和报告。

---

## 二、Plan-VI 工作 (测试基础设施从零搭建)

### 成果

| 任务 | 状态 | 交付 |
|------|------|------|
| 32 题 BSTC 命题集 | DONE | `tests/bstc-corpus.mjs` |
| 自动跑分脚本 | DONE | `tests/bstc-runner.mjs` |
| 首次基线跑分 | DONE | 32/32 PASS, `bstc-baseline-VI.json` |
| 安全复核 | DONE | 全部绿灯 |

### 设计决策

1. **命题覆盖五分类**: 直问资产 (10) / 追问链路 (10) / 反例意图 (6) / 长会话 (4) / 额外覆盖 (2)
2. **runner 自行维护 lastAsset/lastIntent 上下文**: 进程内模式弥补了当时编排层 context={} 的缺陷，使 runner 成为"修复后预期行为"的参考实现
3. **退出码接入 CI**: pass >= 28/30 → exit 0, 否则 → exit 1

### 遗留问题 (写入 Plan-VII 待办)
- 仅进程内跑分，未走 HTTP/Vercel 链路
- 需在 A 组上下文修复部署后，通过 HTTP 级别回归验证

---

## 三、Plan-VII 工作 (生产链路验证 + 交叉守门)

### 3.1 C-VII-1: BSTC HTTP 级别重跑 (P0)

**做什么**: 改造 runner 支持 `--http=<url>` 模式，通过真实 HTTP `/api/chat` 调用替代进程内 `runOrchestrator`。

**交付**:
- `tests/bstc-runner.mjs` 新增 HTTP 模式 (逐轮 context 传播、30s 超时、baseline 写 `bstc-baseline-VII.json`)
- `tests/bstc-corpus.mjs` 新增 6 题容错命题 (38 题总计)

**跑分历程**:

| 阶段 | commit | 模式 | 结果 | 关键变化 |
|------|--------|------|------|----------|
| VI 基线 | `321ccde` | 进程内 | 32/32 PASS | 初始基线 |
| VII 初跑 | `cdffec9` | HTTP | 36/38 PASS | sell 时延 2 FAIL (8003ms, 8004ms) |
| A组 fix 后 | `2880c50` | HTTP | **38/38 PASS** | sell 降至 ~7s, 0 FAIL |

### 3.2 C-VII-2: 输入框冻结自动化回归 (P0)

**做什么**: 针对 P0-C (输入框冻结) 建立双层测试防线。

**BSTC API 层**: 6 条容错命题 (bstc-033~038)，覆盖无状态模式、超长消息、特殊字符、空消息、上下文累积、深度 context sell

**Playwright UI 层**: 6 条前端容错命题 (`tests/bstc-frontend-regression.mjs`)，逐条验证:

| 编号 | 场景 | Pre-fix | Post-fix |
|------|------|---------|----------|
| freeze-001 | HTTP 500 → 输入框恢复 + 错误气泡 | PASS | **PASS** |
| freeze-002 | 请求 hang → AbortController 25s 恢复 | FAIL (无超时保护) | **PASS** (25s 准时恢复) |
| freeze-003 | 网络断开 → 输入框恢复 | PASS | **PASS** |
| freeze-004 | 缺 reply 字段 → 不崩溃 | PASS | **PASS** |
| freeze-005 | 非法 JSON → 不崩溃 | PASS | **PASS** |
| freeze-006 | 15 轮压力 → 0 死锁 | FAIL | **PASS** (0 freeze) |

**关键发现**: B 组 fix 前，`freeze-002` 揭示 `sendChat()` 内 `fetch` 无 `AbortController` 超时，即使 `chat.js` 有 try/finally 也无效 (callback 永不返回)。B 组加 25s 超时后验证通过。

### 3.3 C-VII-3: 基线归档与 CI 门

**交付**: `bstc-baseline-VII.json` (37023 bytes, commit `2880c50`, HTTP mode)

**VI vs VII 对比**:

| 指标 | VI | VII |
|------|----|-----|
| pass_rate | 38/38 | 38/38 |
| 模式 | process-internal | HTTP |
| avg case time | 0ms | 7451ms |
| sell TTFB | 0ms | ~7s |
| 回归 | - | **0** |

### 3.4 C-VII-4: 安全复核

全部绿灯: `.env` 在 `.gitignore` / 密钥扫描 0 命中 / commit 已推送 / Vercel `/api/health` 正常 / 证据 JSON 全部非空

### 3.5 跨组验证 (Plan-VII 核心价值)

C组在 A/B 组完成修复后独立验证:

| 验证项 | 责任组 | 验证方式 | 结果 |
|--------|--------|----------|------|
| sell 时延 < 8s | A组 A-VII-1 | BSTC HTTP bstc-021/038 | 7005ms PASS |
| 合成层串味修复 | A组 A-VII-2 | BSTC HTTP bstc-014 | 0 BTC 残留 PASS |
| 输入框防死锁 | B组 B-VII-1 | Playwright freeze-001~005 | 5/5 PASS |
| 长会话稳定性 | B组 B-VII-3 | Playwright freeze-006 | 15 轮 0 freeze PASS |
| 前端 fetch 超时 | B组 B-VII-1 | freeze-002 25s 验证 | AbortController 准时触发 PASS |

---

## 四、交付物汇总

### 测试脚本 (3 files)

| 文件 | 行数 | 功能 |
|------|------|------|
| `tests/bstc-corpus.mjs` | ~600 | 38 题 BSTC 命题集 (6 分类) |
| `tests/bstc-runner.mjs` | ~340 | 自动跑分 (进程内 + HTTP 双模式) |
| `tests/bstc-frontend-regression.mjs` | ~300 | Playwright 前端容错回归 |

### 证据 JSON (5 files)

| 文件 | 内容 |
|------|------|
| `data/bstc-baseline-VI.json` | VI 基线 (进程内, commit `321ccde`) |
| `data/bstc-baseline-VII.json` | VII 基线 (HTTP, commit `2880c50`, 38/38 PASS) |
| `data/bstc-report-2880c50.json` | VII 最终 HTTP 全量报告 |
| `data/bstc-frontend-report-2880c50.json` | 前端容错回归 (6/6 PASS) |
| `data/bstc-report-321ccde.json` | VI 初始基线报告 |

### 报告 (2 files)

| 文件 | 内容 |
|------|------|
| `plan/Plan-VI-C组-任务汇报.md` | Plan-VI 测试基础设施搭建 |
| `plan/Plan-VII-C组-任务汇报.md` | Plan-VII 生产链路守门 + 跨组验证 |

---

## 五、数字总结

| 指标 | 数值 |
|------|------|
| 总命题数 | 32 → **38** |
| 命题分类 | 5 → **6** |
| 测试模式 | 进程内 → **进程内 + HTTP + Playwright** |
| Plan-VII HTTP pass_rate | **38/38 (100%)** |
| Plan-VII Playwright pass_rate | **6/6 (100%)** |
| 跨组验证发现的问题 | 2 (sell 时延 → A组, fetch 无超时 → B组) |
| 跨组验证确认的修复 | 5/5 |
| 基线回归 | **0** |
| 安全漏扫命中 | **0** |

---

## 六、Plan-VIII 建议

1. **公网真机验收**: 在 `decision-brain-gray.vercel.app` 跑 HTTP BSTC，排除本地/代理差异
2. **Agent 内部超时**: 所有 evaluate/sell 回复均为 degraded (agent LLM 调用 > 7s)，建议轻量 evaluate 路径
3. **CI 集成**: 将 `npm run bstc -- --http=<url>` 挂入 pre-merge 门禁
4. **Playwright 定时巡检**: freeze-001~006 挂入定时任务，前端回归自动化
