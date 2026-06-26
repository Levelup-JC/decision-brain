# Plan-VI — 上下文断层修复与端到端验收作战计划

> 版本：V1  日期：2026-06-26
> 范围：在 Plan-V 基础上闭环"上下文断层"问题，并建立可回归的测试基线。
> 红线不变：不假造数据、不碰交易 Tools/私钥、密钥不进 git。

---

## 0. 背景与 V 版遗留

V 版完成两层根因修复（LLM 分类器丢槽位短路 + DataStore 兜底），E2-E7 连贯跑通。但暴露三类遗留：

| 编号 | 现象 | 根因假设 | 严重度 |
|------|------|---------|--------|
| P0-A | 网页问"它是什么"不知道比特币 | 编排层 `context={}` 声明未用，LLM 分类器只收单条 message，无会话/聚焦资产注入 | P0 |
| P0-B | sell+pct 在 Vercel 超时，反例 sell 全空 | LLM 兜底路径耗时，Vercel 10s 函数超时；或 context 未传递触发冷路径 | P0 |
| P1   | B 组 PASS vs C 组 FAIL 矛盾 | Playwright 自带会话态、curl 无 sessionId → 兜底分支差异 | P1 |
| P2   | evaluate.json / review_sell_ok.json 等关键证据 0 字节 | C 组写入逻辑失败或异步未落盘 | P1 |

**核心判断**：P0-A 和 P0-B 同源——**编排层把会话上下文和 LLM prompt 隔绝了**。数据源有（Bitget Skill 已接、evaluate 正常返回 BTC），但没注入到分类/synthesize 的 prompt 上下文里。这是 Plan-VI 的主线。

---

## 1. Plan-VI 总目标

1. **上下文贯通**：让 LLM 分类器、Agent 调度、Chief 综合三个环节都能拿到 `lastAsset / lastIntent / 会话近 N 轮`。
2. **反例 sell 不超时**：不带币种的 "卖30%" 在 Vercel 下 ≤ 8s 返回合理结果。
3. **追问不懵**：聚焦 BTC 后追问"它是什么/能加仓吗/卖一半"——全部沿聚焦资产应答，无需用户重报币种。
4. **可回归测试基线**：建立 30+ 条命陋试题 + 自动跑分脚本，每次部署一键执行。
5. **证据落盘**：所有测试结果 JSON 非空、可复核、版本对齐 commit hash。

---

## 2. 三组任务分配

### A 组 — 编排层上下文贯通（核心修复组）

**A-VI-1（P0 主修复）**：`chat-orchestrator.mjs` 上下文注入
- 现状：行 221 `context = {}` 声明未用，前端 `dashboard.js` 发空 `context: {}`。
- 目标：
  - 前端 `dashboard.js` 维护 `context = { lastAsset, lastIntent, lastPrice, recentTurns[] }`，每次请求带上。
  - 后端 `runOrchestrator(message, context)` 真正消费：
    - `classifyIntentLLM` 签名加 `context`，prompt 增加会话段 `<recent_turns>` 和 `<focused_asset>`。
    - 规则兜底 `extractSlotsRule()` 优先读 `context.lastAsset`。
    - 七个 Agent 调用时透传 `context.focusedAsset`，缺失才各自 fetch。
    - Chief synthesize prompt 注入 `<session_context>` 段。
- 验收：BSTC 30 题全程追问不重报币种，全部沿 lastAsset 应答。

**A-VI-2（P0 超时）**：sell+pct 在 Vercel ≤ 8s
- 排查 LLM 兜底分支耗时（DeepSeek 单次调用 p95）。
- 方案候选（按代价排序）：
  1. 反例 sell 直接走规则兜底（不进 LLM 分类），单次 ≤ 200ms。
  2. 升级 Vercel Function Pro Plan 超时到 60s。
  3. LLM 分类 + 兜底并行 race，先到先用。
- 默认走方案 1，超时硬保护在 8s。

**A-VI-3（P1 B/C 矛盾归一）**：sessionId 规范
- 定义 `/api/chat` 契约：无 sessionId 视为"无状态一次性请求"，走最保守规则兜底；有 sessionId 则读 DataStore。
- curl 测试必须显式带 `x-session-id`，否则映射到孤立会话。
- 归一 B/C 两组测试输入，sessionId 缺失 = 反例 = 期望规则兜底。

**A-VI-4**：提交记录补齐关键证据
- 所有 `run_example.mjs`/测试脚本输出必须 `await fs.writeFile` 后再 process.exit，禁止流式未 flush。
- 每次写入后校验文件大小 > 0，否则抛错重跑。

### B 组 — 网页端连贯验收（真人反例组）

**B-VI-1**：追问链路连贯验收
- 同一 Playwright 会话从 E1 到 E9 跑完，刻意构造追问场景：
  - E1 "比特币怎么样" → E2 "它是什么" → E3 "能加仓吗" → E7 "卖一半" → E4 "以太坊呢" → E5 "卖 30%"
  - 每一步 answer 必须含币种（BTC/ETH），不能答"未识别资产"。
- 8 张公网截图，Console 0 error。

**B-VI-2**：BTC 之外的资产覆盖
- 至少跑 BTC、ETH、SOL 三条资产链路，验证不是 BTC-only 硬编码。

**B-VI-3**：响应时延记录
- 每步记录 TTFB，反例 sell 必须 < 8s。把时延写进截图说明。

### C 组 — 测试基线与回归（守门组）

**C-VI-1**：BSTC 命题集建立（核心交付物）
- 30+ 道命陋试题，分类覆盖：
  - 直问资产（10）：BTC、ETH、SOL、PEPE、缺失币种、错拼币种
  - 追问链路（10）：focused_asset 沿用、跨资产切换、空 context 兜底
  - 反例意图（6）：sell+pct、sell+空、buy+空、加仓+空、问性质、问建议
  - 长会话（4）：10 轮以上聚焦漂移、跨主题切换
- 每题定义：`{ id, inputs[], expected: { asset, intent, agent_results?, no_timeout }, assert_fn }`。

**C-VI-2**：自动跑分脚本
- `tests/bstc-runner.mjs`：读 BSTC 集合 → 顺序打 `/api/chat` → 采集响应 → 跑 assert_fn → 输出 `bstc-report-{commit_hash}.json`。
- 部署后一键执行：`npm run bstc` 或 GitHub Action。
- 失败题打印差异 diff，便于 A 组定位。

**C-VI-3**：BSTC 基线首次跑分
- 跑通后产出 `bstc-baseline-VI.json`，记录 pass_rate、失败题号、平均时延。
- 后续回归基线不允许低于当前 pass_rate。

**C-VI-4**：git / 密钥 / 测试基线复核
- 沿用 V 版守门项，新增一项：BSTC 跑分必须纳入 CI（PR 前必须绿）。

---

## 3. 测试设计要求

### 3.1 分层测试金字塔

```
        ┌─────────────┐
        │ BSTC 30题 E2E│  ← 主验收门，网页行为级
        └─────────────┘
      ┌───────────────────┐
      │ API 反例回归 (curl) │  ← C-VI-1 命题集核心
      └───────────────────┘
    ┌────────────────────────┐
    │ 单元：extractSlotsRule  │  ← 纯函数级
    │ 单元：context 透传       │
    └────────────────────────┘
```

### 3.2 BSTC 命题原则

1. **反例优先**：每一条规则都有正例和反例成对出现，反例覆盖 LLM 易钻空子的输入。
2. **链路连贯**：至少 1/3 命题是多轮追问，单轮单题不超过 20 条。
3. **时延断言**：反例 sell 必须断言 `ttfb < 8000ms`。
4. **可复现**：每题固定 sessionId、固定输入，结果可重放。
5. **非空证据**：JSON 输出非空、含 commit_hash、可 diff。

### 3.3 测试通过门槛

| 门槛 | 标准 |
|------|------|
| BSTC pass_rate | ≥ 28/30 |
| 反例 sell 超时率 | 0 |
| Console error | 0 |
| 关键证据 JSON | 100% 非空 |
| 单元测试 | 29/30 以上 PASS |
| git 密钥扫描 | 0 命中 |

### 3.4 执行节奏

- A 组提交修复 → C 组跑 BSTC → B 组网页推理验证 → C 组基线归档。
- 任一门槛红，不开 PR；PR 标题打 `[BSTC 28/30]` 标签。

---

## 4. 关于"比特币是什么"问题的优化路径

### 4.1 根因复述
数据源有（Bitget 5 Skill + market-data MCP 已接、evaluate 正常返回 BTC），问题不在数据层。问题在**编排层把上下文和 LLM prompt 隔绝**：
- `classifyIntentLLM` 只收单条 `message`，无会话历史。
- `context` 字段声明却未消费。
- LLM 无依据时倾向答"我不知道这是什么币"。

### 4.2 修复三层
1. **会话状态层**：前端 dashboard 维护 lastAsset/lastIntent/recentTurns，后端 DataStore 真持久化（Vercel KV 已就绪）。
2. **Prompt 注入层**：classifyIntentLLM / synthesize 的 prompt 注入 `<recent_turns>` 和 `<focused_asset>` 段。
3. **兜底层**：规则型 `extractSlotsRule` 优先读 context，避免 LLM 失灵时空答。

### 4.3 长期优化（Plan-VII 候选，不入本版工作量）
- 引入轻量知识库层：CoinGecko ID 对应的中文名符号映射，"比特币/BTC/Bitcoin" 三态统一归一。
- Agent 端口 fan-out 限速，避免 Vercel 函数超时。
- 增设"澄清追问"意图：当 assetQuery 提不出且 context 空时，反问"你想问哪个资产？"而非空答。

---

## 5. 里程碑与截止

| 节点 | 产出 | 责任组 |
|------|------|--------|
| M1（D+1） | A-VI-1 上下文贯通 PR | A |
| M2（D+2） | BSTC 30 题命题集 + 跑分脚本 | C |
| M3（D+3） | 反例 sell 超时修复 + 单元/反例回归绿 | A + C |
| M4（D+4） | 网页端连贯验收 + 8 截图 | B |
| M5（D+5） | BSTC 基线归档 + CI 接入 | C |

---

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| DeepSeek API 限流/超时 | BSTC 题跑分前预热，失败重试 1 次，仍失败标红人工复核 |
| Vercel KV 冷启动丢 state | sessionId 强约束，DataStore 写入幂等校验 |
| BSTC 命题主观偏差 | A/B/C 三组各贡献 10 题，交叉评审后定稿 |
| 修复 A-VI-1 引入新回归 | C-VI-1 必须先就绪，作为 PR 前置门 |

---

## 7. 不做事项

- 不接交易 Tools、不留私钥。
- 不重写架构，不动 Agent 调度顺序。
- 不为了一题 pass 修改 BSTC 命题。
- 不在 V 版遗留的超时问题上叠加新功能。

---

## 8. 验收出口

- BSTC pass_rate ≥ 28/30，反例 sell 0 超时。
- B 组网页推荐追问链路 8 张截图全 PASS，Console 0 error。
- C 组基线 JSON 落盘可 diff，commit_hash 对齐。
- 把关人确认可在 `decision-brain-gray.vercel.app` 真机追问 BTC 无需重报币种。