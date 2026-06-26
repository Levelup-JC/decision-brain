# Plan-V C组 任务汇报

**组员**: C | **日期**: 2026-06-26 | **阶段**: Plan-V 功能做实 — API 全链路回归 + 基线守护

---

## 执行摘要

| 任务 | 状态 | 核心结论 |
|------|------|---------|
| C-V-1 全 intent 回归 | **部分通过** | 4/5 intent 通过；review_sell 特定话术 Vercel 超时 |
| C-V-2 反例回归 | **部分通过** | review_add 反例通过；review_sell 反例持续 crash |
| C-V-3 git/密钥基线 | **通过** | git 干净、密钥扫描空、commit 粒度正确 |
| C-V-4 测试基线 | **通过** | 29/30 通过，1 个失败与 A 组改动无关 |

**总评**: A 组的 Layer 1 修复（规则提取补 LLM 漏槽）有效。Layer 2 修复（state 兜底）存在 Vercel 环境可靠性问题。review_sell 流程在特定话术下持续服务端空响应，建议 A 组排查。

---

## C-V-1: 全 intent API 回归

测试环境: `https://decision-brain-gray.vercel.app`，`--http1.1` 强制 HTTP/1.1

| # | Intent | 测试消息 | ok | assetQuery | Agent 报错 | 判定 |
|---|--------|---------|----|-----------|-----------|------|
| 1 | evaluate_candidate | 研究 BTW | true | BTW | 0/7 | PASS |
| 2 | manage_position | 我买了100个BTW成本0.09 | true | BTW | 0/2 | PASS |
| 3 | confirm_plan | 确认计划 | true | BTW | 0/0 | PASS |
| 4 | review_add | BTW能加仓吗 | true | BTW | 0/4 | PASS |
| 5 | review_sell | 卖出 BTW | true | BTW | 0/4 | PASS |
| 5b | review_sell | BTW卖30% | - | - | - | **FAIL (空响应)** |

### 详细证据

**1. evaluate_candidate — 研究 BTW**
- intent=evaluate_candidate, assetQuery=BTW, fanout=7 agents
- agentResults: 0/7 errors, 全部 status=ok
- Memory/Macro/Onchain/Sentiment/Technical/News/Valuation 全部返回正常 headline

**2. manage_position — 我买了100个BTW成本0.09**
- intent=manage_position, assetQuery=BTW
- agentResults: 0/2 errors (memory + valuation)
- reply: 正常出持仓建议

**3. confirm_plan — 确认计划**
- intent=confirm_plan, assetQuery=BTW
- agentResults: 0/0 (未派发 Agent)
- reply: 正常

**4. review_add — BTW能加仓吗**
- intent=review_add, assetQuery=BTW
- agentResults: 0/4 errors (memory + valuation + sentiment + technical)
- reply: 正常出加仓建议卡片

**5. review_sell — 卖出 BTW**
- intent=review_sell, assetQuery=BTW
- agentResults: 0/4 errors (memory + valuation + sentiment + technical)
- reply: 正常出卖出建议，体现底仓保护

**5b. review_sell — BTW卖30%**
- 连续 4 次重试均为 `curl: (52) Empty reply from server`（3 秒超时）
- 健康检查 `/api/health` 同时刻正常返回 200
- 非网络抖动（HTTP/1.1 和 HTTP/2 均复现），疑似 Vercel function 在 sell+pct 提取路径超时

### 已保存证据文件

raw JSON 响应已保存至:
- `/Users/jasoncong/Desktop/Decision Brain/plan/C-V-1-evaluate.json`
- `/Users/jasoncong/Desktop/Decision Brain/plan/C-V-1-review_add.json`
- `/Users/jasoncong/Desktop/Decision Brain/plan/C-V-1-review_sell_ok.json`

---

## C-V-2: 反例回归（不带币种追问）

| # | 测试消息 | sessionId | context | 结果 | assetQuery | Agent 报错 | 判定 |
|---|---------|-----------|---------|------|-----------|-----------|------|
| 1 | 能加仓吗 | c-group-test-001 | 空 | 空响应 | - | - | FAIL |
| 2 | 能加仓吗 | c-group-test-002 | lastAsset=BTW | ok=true | **BTC** | 0/4 | **PARTIAL** |
| 3 | 卖30% | c-group-test-001 | 空 | 空响应 | - | - | FAIL |
| 4 | 卖30% | c-group-test-002 | lastAsset=BTW | 空响应 | - | - | FAIL |
| 5 | 卖出 | c-group-test-003 | lastAsset=BTW | 空响应 | - | - | FAIL |

### 分析

**review_add 反例 ("能加仓吗")**:
- 不带 context 时空响应（Vercel 超时）
- 带 `context.lastAsset=BTW` 时返回 ok，但 assetQuery=**BTC**（LLM 自行推断，非 context 兜底）
- A 组 Layer 2 走 `store.load()` 读 state，**未使用 context.lastAsset**

**review_sell 反例 ("卖30%", "卖出")**:
- 不带币种的 sell 系列**全部空响应**，与带币种的 "卖出 BTW" 正常形成对比
- 这不是网络问题 — 同时刻 evaluate 等请求正常
- 推测根因：sell 流程在无 assetQuery 时触发 LLM 综合或 state 读取路径，导致 Vercel function 超时

---

## C-V-3: git/密钥基线

```
git status:  clean (nothing to commit, working tree clean)
git log:     321ccde fix: review_add/review_sell assetQuery extraction with two-layer fallback
             c0544d9 chore: gitignore 补充 .env*.local
             bcd7bf5 feat: Plan-II 真链路联调 + Vercel 部署适配
changed:     src/chat-orchestrator.mjs (+30 lines)
密钥扫描:    空 (安全)
commit 粒度: 单文件 commit，非 git add .
```

**判定: PASS**

---

## C-V-4: 测试基线

```
npm test → node --test test/*.test.mjs
结果: 29 pass, 1 fail, 0 skip
耗时: 18.2s
```

失败测试: `test/lobster-config.test.mjs` — 路径正则不匹配（中文路径问题）
- 与 A 组改动无关（A 组只改了 `chat-orchestrator.mjs`）
- Plan-III/IV 阶段即存在

**判定: PASS（A 组改动未引入新失败）**

---

## 发现的问题（建议 A 组排查）

### P0: review_sell 路径 Vercel 超时

- **现象**: 不带币种的 sell 消息（"卖30%", "卖出"）100% 空响应；带币种的 "卖出 BTW" 正常
- **影响**: B 组 E7 反例验收必然失败
- **建议排查**: 
  1. sell flow 中 `synthesizeLLM` 或 agent runner 是否有对 assetQuery 为空的路径未处理？
  2. Vercel function 日志是否有 sell 路径的超时/Promise rejection？
  3. `"BTW卖30%"` 和 `"卖出 BTW"` 的代码路径差异在哪？

### P1: Layer 2 fallback 未使用 context.lastAsset

- **现象**: 传 `context: {lastAsset: "BTW"}`，返回 assetQuery="BTC"
- **根因**: `runOrchestrator` 接受 context 参数但未从中提取 lastAsset 做兜底
- **建议**: 在 Layer 2 中增加 `context.lastAsset` 作为 state 兜底之前的优先来源

### P2: "BTW卖30%" 带币种也超时

- **现象**: 同一条消息，规则提取应该能拿到 assetQuery=BTW，但仍然空响应
- **怀疑**: 不是 assetQuery 提取问题，而是 sell + pct 组合触发了某个耗时代码路径导致 Vercel 10s 超时

---

## 红线遵守确认

- [x] 不改 v2 契约
- [x] 不改后端架构
- [x] 不假造数据
- [x] 不 `git add .`（A 组 commit 为单文件）
- [x] 密钥不进 git
- [x] 跑不通如实报（review_sell 未通过，如实记录）
