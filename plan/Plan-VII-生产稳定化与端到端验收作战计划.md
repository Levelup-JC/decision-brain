# Plan-VII — 生产稳定化与端到端验收作战计划

> 版本：V1  日期：2026-06-26
> 范围：在 Plan-VI 上下文断层修复基础上，闭环「前端输入框冻结」「sell fanout 超时」「合成层资产串味」三类遗留问题，并把测试从「修复确认」升级为「生产环境端到端验收」。
> 红线不变：不假造数据、不碰交易 Tools/私钥、密钥不进 git、不为单题 pass 改命题。

---

## 0. 当前进展评估（Plan-VI 收口盘点）

读完 A/B/C 三组 Plan-VI 汇报，结论如下：

### 已确认完成
| 项 | 证据 | 责任组 |
|----|------|--------|
| P0-A 上下文断层修复 | E2「它是什么」、E4「以太坊呢」从 FAIL → PASS（API + Playwright 双验证） | A 组 |
| 上下文三层贯通 | 前端 sessionContext / prompt 注入 / 规则兜底，commit `cdffec9` 已推送 | A 组 |
| sessionId 无状态归一 | `_stateless` 标记落地，消除 B/C 矛盾 | A 组 |
| BSTC 测试基线 | 32 题命题集 + 自动跑分脚本 + 基线归档，32/32 PASS | C 组 |
| 网页端连贯验收 | E1-E7 链路 Playwright 验证，4/6 PASS | B 组 |

### 仍未闭环（Plan-VII 主线）
| 编号 | 现象 | 根因 | 严重度 | 来源 |
|------|------|------|--------|------|
| **P0-C** | **前端对话两三轮后输入框卡死，无法继续输入** | `chat.js` 的 `send()` 无 try/finally，`sendChat()` 内多个 fetch 任一失败/超时 → input 永久 `disabled` | **P0** | 用户实测反馈 |
| **P0-B'** | sell+pct 本地实测 16-25s，Vercel 10s 超时 | review_sell 仍触发 7-agent fanout；A-VI-2 精简 fanout（2 agent）尚未公网验证 | **P0** | B 组 Plan-VI |
| P1-A | E4 切 ETH 后回复混入 BTC 数据（合成层串味） | synthesizeLLM 的 agent 报告未透传 focusedAsset，A-VI-4 已改但未公网验证 | P1 | B 组 Plan-VI |
| P1-B | BSTC 仅进程内跑分，未走 HTTP/Vercel | runner 自维护 context，未验证生产链路 | P1 | C 组 Plan-VI |
| P2 | E1 首响应 33s 冷启动 | 7-agent fanout 冷启动无预热 | P2 | B 组 Plan-VI |

**核心判断**：P0-C（输入框冻结）和 P0-B'（sell 超时）是同一条因果链——sell 慢 → Vercel 超时 → fetch 抛错 → 前端无兜底 → 输入框死锁。修复 sell 时延能缓解症状，但**前端必须独立做容错**，否则任何一次网络抖动/500 都会复现冻结。这是 Plan-VII 的最高优先级。

---

## 1. P0-C 输入框冻结问题定位（已查明，供 B 组实现参考）

### 根因链
`src/ui/chat.js` 第 13-27 行 `send()`：

```
input.disabled = true; btn.disabled = true;
if (chatCallback) await chatCallback(text);   // ← 抛错则中断
input.disabled = false; btn.disabled = false;  // ← 永远到不了
```

`sendChat()`（dashboard.js）内含 `fetch("/api/chat")`、`r.json()`、`updateSessionContext()`、`fetch("/api/state")` 等多个可失败点。任一抛异常（超时 / 500 / JSON 解析失败 / resp 字段 undefined），`send()` 后半段不执行，输入框与按钮永久禁用。

### 为什么是「两三轮后」
前一两轮 sell/evaluate 较快返回；当累积 context 触发 review_sell 全量 fanout（16-25s）超过 Vercel 10s 函数上限，该轮 fetch 失败 → 死锁。与 P0-B' 强相关。

### 修复方向（仅供参考，B 组自行决定实现）
1. `send()` 用 `try/finally` 包裹，`finally` 中无条件恢复 input/btn 状态。
2. `sendChat()` 内 fetch 增加超时与 `try/catch`，失败时给用户可见错误气泡，而非静默死锁。
3. 可选：请求中显示「思考中」loading 态，超时后自动取消并允许重试。

> 注意：此处只给方向，不给代码。B 组需自己读代码、自己实现、自己测。

---

## 2. Plan-VII 总目标

1. **前端永不死锁**：任意网络异常 / 超时 / 后端 500，输入框必须在请求结束后恢复可输入，并给用户明确反馈。
2. **sell 公网达标**：不带币种的「卖30%」在 `decision-brain-gray.vercel.app` 实测 ≤ 8s 返回合理结果，连续 10 次 0 超时。
3. **合成层不串味**：切换资产后（BTC→ETH）回复只含目标资产数据，无 BTC 残留。
4. **生产链路验收**：BSTC 通过真实 HTTP（curl + 公网 URL）重跑，pass_rate 不低于进程内基线。
5. **长会话稳定**：连续 15 轮跨资产对话，输入框无冻结、无内存泄漏、Console 0 error。

---

## 3. 三组任务分配

### A 组 — 后端时延与合成层（核心修复组）

#### A-VII-1（P0）sell fanout 公网时延达标
- **改什么**：验证并落实 A-VI-2 的 `SELL_FAST_FANOUT`（memory+sentiment 2 agent），确认 Vercel 部署后生效。
- **功能点自检清单**：
  - [ ] 「卖30%」（带 BTC context）公网 TTFB ≤ 8s
  - [ ] 「卖一半」（带 context）公网 TTFB ≤ 8s
  - [ ] 精简 fanout 后回复仍包含资产名 + 卖出比例 + 时机判断，不空泛
  - [ ] 完整 review_sell（非快速路径，如「我想卖点币」无比例）仍走原 fanout，不被误降级
- **如何测**：部署后用 `curl -w "%{time_total}"` 连打 10 次同一 sell 输入，记录每次耗时。
- **如何检测达标**：10 次全部 < 8s 视为 PASS；任一 ≥ 8s 记 FAIL 并附耗时分布。
- **降级预案**：若 2-agent 仍超时，启用 8s 硬超时保护 → 超时即返回 `synthesizeRule` 兜底结果（带 degraded 标记），保证永不超过 Vercel 上限。

#### A-VII-2（P1）合成层资产串味修复
- **改什么**：确认 A-VI-4 的 `runFanoutAgents(..., context)` 透传 `focusedAsset` 在公网生效；检查 synthesizeLLM 的 prompt 是否只喂当前 focusedAsset 的 agent 报告。
- **功能点自检清单**：
  - [ ] BTC context 下问「以太坊呢」→ 回复只含 ETH 数据，0 处 BTC 价格/指标
  - [ ] 切换后 agent 报告的 headline 资产名与 assetQuery 一致
  - [ ] 连续切换 BTC→ETH→SOL，每轮回复资产纯净
- **如何测**：API 链测试，逐轮累积 context，grep 回复文本中是否出现非目标资产 ticker。
- **如何检测**：回复含目标资产 ✓ 且 不含其他资产 ticker ✓ 才算 PASS。

#### A-VII-3（P2）首轮冷启动预热
- **改什么**：评估 E1 首响应 33s 是否可通过 DataStore 预热 / agent 连接池复用降低。**此项为优化，非阻塞，若代价大可推迟 Plan-VIII。**
- **功能点自检清单**：
  - [ ] 首轮 evaluate TTFB 记录（修复前/后对比）
  - [ ] 若改动，确认不引入新回归
- **如何检测**：首轮 ≤ 15s 为达标（不强求 8s，首轮冷启动可放宽）。

#### A 组红线
- 不动 Agent 调度顺序的核心逻辑（除 sell 降级外）。
- 任何降级路径必须打 `degraded: true`，前端可见。
- 改完必须本地自测 + 推送 commit + 等 Vercel 部署确认，再交 B/C 验证。

---

### B 组 — 前端容错与端到端验收（真人反例组）

#### B-VII-1（P0 最高优先）输入框防死锁修复
- **改什么**：`src/ui/chat.js` + `src/ui/dashboard.js`，按第 1 节方向自行实现容错。
- **功能点自检清单**：
  - [ ] 后端返回 500 → 输入框恢复可输入，显示错误提示气泡
  - [ ] 请求超时（模拟 30s 不返回）→ 输入框恢复，提示「响应超时，请重试」
  - [ ] 网络断开（DevTools offline）→ 输入框恢复，提示网络错误
  - [ ] resp 缺字段（如 reply 为 undefined）→ 不抛错卡死，降级显示
  - [ ] 连续发送 15 条消息 → 每条结束后输入框都能继续输入
  - [ ] 发送中按钮禁用、显示 loading；结束后恢复
- **如何测**：
  1. 用 Chrome DevTools Network 面板模拟 offline / throttle / 500（可用 overrides 或 mock）。
  2. Playwright 脚本连发 15 轮，每轮后断言 `input.disabled === false`。
  3. 手动真机：在公网页面连续对话 15 轮，刻意触发慢 sell。
- **如何检测达标**：上述 6 个自检点全 PASS，且 15 轮压力测试无任何一轮死锁。
- **证据**：每个异常场景截图 + Playwright 报告 JSON + 录屏（可选）。

#### B-VII-2（P0）追问链路 + sell 时延公网复验
- 在 A 组 commit 部署到公网后，重跑 Plan-VI 的 E1→E7 链路 + sell 时延。
- **功能点自检清单**：
  - [ ] E1-E7 全程公网，每步回复含正确资产
  - [ ] E4 切 ETH 回复无 BTC 残留（验证 A-VII-2）
  - [ ] sell 步骤 TTFB < 8s（验证 A-VII-1）
  - [ ] Console 0 error
- **如何测**：Playwright 在 `decision-brain-gray.vercel.app` 真实 DOM 操作，逐轮累积 sessionContext。
- **证据**：8 张公网截图（每步带 TTFB 标注）+ DOM 验证报告 JSON。

#### B-VII-3（P1）长会话稳定性
- **功能点自检清单**：
  - [ ] 连续 15 轮跨资产（BTC/ETH/SOL/PEPE）对话，输入框无冻结
  - [ ] recentTurns 截断在 10 轮内（验证不无限增长）
  - [ ] 页面无明显内存增长（DevTools Memory 快照对比）
- **如何检测**：15 轮全程可输入、Console 0 error、内存增长 < 合理阈值。

#### B 组红线
- 前端容错是本组第一优先级，先于 B-VII-2/3。
- 不得用「假装成功」掩盖后端错误——错误必须对用户可见。
- 时延、Console error 如实记录，假阴性（如 Playwright 超时早于响应）须标注说明。

---

### C 组 — 生产链路回归与守门（守门组）

#### C-VII-1（P0）BSTC HTTP 级别重跑
- **改什么**：把 BSTC runner 从「进程内直调 runOrchestrator」改造为「通过 HTTP `/api/chat` 调用」，验证生产环境上下文透传。
- **功能点自检清单**：
  - [ ] 32 题全部通过真实 HTTP（本地 server 或公网 URL）跑通
  - [ ] 追问链路（bstc-011~020）在 HTTP 无状态/有 sessionId 两种场景下行为符合预期
  - [ ] 反例 sell（bstc-021）HTTP 级别 TTFB < 8s
  - [ ] 产出 `bstc-report-{new_commit}.json`，与进程内基线 diff
- **如何测**：`npm run bstc -- --http=https://decision-brain-gray.vercel.app`（或本地），逐题打 HTTP。
- **如何检测达标**：HTTP 级 pass_rate ≥ 28/32，且不低于进程内基线（32/32）的下浮 2 题容差。
- **关键**：若 HTTP 级跑分 < 进程内，说明生产环境上下文未真正贯通，须回 A 组定位。

#### C-VII-2（P0）输入框冻结自动化回归
- **新增命题**：针对 P0-C 增设 5+ 条「容错命题」纳入 BSTC（或独立 frontend 测试集）。
- **功能点自检清单**：
  - [ ] 模拟 500 后输入框可恢复
  - [ ] 模拟超时后输入框可恢复
  - [ ] 连续 15 轮无死锁（自动化）
  - [ ] 每条命题有明确 assert（如 `input.disabled === false`）
- **如何测**：Playwright + 路由拦截（route.abort / route.fulfill 注入 500）。
- **如何检测**：5 条容错命题全 PASS，纳入 `npm run bstc` 退出码。

#### C-VII-3 基线归档与 CI 门
- **功能点自检清单**：
  - [ ] 产出 `bstc-baseline-VII.json`，记录 HTTP 级 pass_rate / 失败题号 / 平均时延 / sell 时延分布
  - [ ] 与 `bstc-baseline-VI.json` 对比，回归不允许低于 VI
  - [ ] 报告 JSON 非空、含 commit_hash、可 diff
- **如何检测**：基线文件 size > 0、commit 对齐当前部署版本、pass_rate 不退化。

#### C-VII-4 git / 密钥 / 部署复核
- 沿用历版守门项：
  - [ ] `.env` 在 `.gitignore`，密钥扫描 0 命中
  - [ ] commit 已推送、Vercel 部署成功（curl `/api/health` 返回 ok）
  - [ ] 关键证据 JSON 全部非空

#### C 组红线
- 不为 pass 改命题；命题在定义时固定 assert。
- HTTP 级与进程内差异如实记录，差异即风险信号。

---

## 4. 测试设计要求

### 4.1 分层测试金字塔（Plan-VII 升级版）
```
        ┌──────────────────────┐
        │ 公网真机端到端 (B-VII-2)│  ← 把关人可亲自复现
        └──────────────────────┘
      ┌──────────────────────────┐
      │ 前端容错回归 (B/C-VII 容错) │  ← P0-C 专项
      └──────────────────────────┘
    ┌──────────────────────────────┐
    │ BSTC HTTP 级回归 (C-VII-1)     │  ← 生产链路
    └──────────────────────────────┘
  ┌──────────────────────────────────┐
  │ 进程内单元 + curl 反例 (历版基线)   │
  └──────────────────────────────────┘
```

### 4.2 通过门槛
| 门槛 | 标准 | 责任组 |
|------|------|--------|
| 输入框冻结 | 15 轮压测 0 死锁 | B |
| 异常容错 | 500/超时/断网 3 场景全恢复 | B |
| sell 公网时延 | 10 次连打 0 超时（< 8s） | A + B |
| 合成层串味 | 切换资产后 0 残留 ticker | A + B |
| BSTC HTTP pass_rate | ≥ 28/32，不低于 VI 基线 | C |
| Console error | 0 | B |
| 关键证据 JSON | 100% 非空 | C |
| git 密钥扫描 | 0 命中 | C |

### 4.3 执行节奏
1. **B-VII-1 输入框修复先行**（不依赖 A 组，可立即开工）。
2. A-VII-1/2 后端修复 → 推送 → Vercel 部署确认。
3. C-VII-1 HTTP 级 BSTC 跑分 → 任一门槛红，不开 PR。
4. B-VII-2/3 公网真机验收 → 8 截图。
5. C-VII-3 基线归档 + CI 门。

> 任一 P0 门槛红，不进入下一阶段。PR 标题打 `[BSTC HTTP xx/32][freeze-fix]` 标签。

---

## 5. 汇报文件要求（三组统一格式）

每组产出 **一份** Markdown 汇报，命名规范：`Plan-VII-{A|B|C}组-任务汇报.md`，存于 `/plan` 目录。过程文件（脚本、JSON、截图）存于 `Plan-VII-{组}-过程文件/` 与 `Plan-VII-{组}-截图/`。

### 必含章节
```markdown
# Plan-VII {组}组任务汇报

**阶段**: Plan-VII | **执行人**: {组}组 | **日期**: YYYY-MM-DD
**Commit**: {hash} | **测试环境**: {本地端口 / 公网 URL}
**对比基线**: {上一版 commit / 基线文件}

## 1. 任务完成总览
| 任务编号 | 描述 | 状态(DONE/PARTIAL/BLOCKED) | 交付物 |

## 2. 逐任务详情
（每个任务：改了什么 → 功能点自检清单逐项打勾 → 如何测 → 实测结果表）

## 3. 测试结果明细
（表格：输入 / 预期 / 实测 / TTFB / PASS-FAIL，逐条）

## 4. 关键发现
- 已修复：...
- 仍待修复：...（如实写，不粉饰 PARTIAL/FAIL）

## 5. 证据文件清单
| 文件 | 内容 |

## 6. 下一轮行动
（交接给哪个组，待办项）

## 审查纪律自检
- [ ] 无 undefined / 占位 / 假数据
- [ ] FAIL/PARTIAL 如实标注，附根因
- [ ] 时延用真实测量值（curl time_total / Date.now）
- [ ] 修复前后对比明确
- [ ] 证据 JSON 非空、commit 对齐
```

### 汇报红线
- **如实**：FAIL 就写 FAIL，禁止为了好看改成 PASS；假阴性须标注原因。
- **可复现**：每个测试附输入、sessionId、命令、commit，可重放。
- **有证据**：每个 PASS 背后有截图 / JSON / curl 输出，不接受「我看了没问题」。
- **根因导向**：FAIL 必须给根因假设，指向责任组。

---

## 6. 里程碑与截止
| 节点 | 产出 | 责任组 |
|------|------|--------|
| M1（D+0） | B-VII-1 输入框防死锁修复（不依赖 A） | B |
| M2（D+1） | A-VII-1 sell 时延 + A-VII-2 串味修复 PR | A |
| M3（D+1） | C-VII-2 容错命题 + C-VII-1 HTTP runner 改造 | C |
| M4（D+2） | C-VII-1 HTTP 级 BSTC 跑分绿 | C |
| M5（D+2） | B-VII-2/3 公网真机验收 + 8 截图 | B |
| M6（D+3） | C-VII-3 基线归档 + CI 门 + 把关人真机确认 | C + 把关人 |

---

## 7. 风险与缓解
| 风险 | 缓解 |
|------|------|
| sell 2-agent 仍超时 | 8s 硬超时 → 规则兜底（degraded 标记），保证不超 Vercel 上限 |
| 前端容错引入 UI 回归 | B 组改完先跑 B-VII-3 长会话回归再交付 |
| HTTP 级 BSTC 低于进程内 | 即生产上下文未贯通信号，立即回 A 组，不放行 PR |
| DeepSeek 限流 | 跑分前预热，失败重试 1 次，仍失败标红人工复核 |
| 冷启动 33s 无法短期解决 | A-VII-3 降级为 Plan-VIII 候选，不阻塞本版验收 |

---

## 8. 不做事项
- 不接交易 Tools、不留私钥。
- 不重写架构、不动 Agent 核心调度顺序（sell 降级除外）。
- 不为单题 pass 改 BSTC 命题。
- 冷启动深度优化（连接池/预热集群）推迟 Plan-VIII，本版只做轻量评估。

---

## 9. 验收出口
- 前端：15 轮压测 0 死锁，500/超时/断网三场景全恢复，Console 0 error。
- 后端：sell 公网 10 次连打 0 超时，切换资产 0 串味。
- 测试：BSTC HTTP 级 pass_rate ≥ 28/32 且不低于 VI 基线，基线 JSON 落盘可 diff。
- **把关人确认**：在 `decision-brain-gray.vercel.app` 真机连续对话 15 轮以上，输入框始终可用，追问无需重报币种，sell 不卡死。
</content>
</invoke>
