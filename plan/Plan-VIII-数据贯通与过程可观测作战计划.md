# Plan VIII — 数据贯通与过程可观测作战计划（下午冲刺·权威版）

> 版本：V2（接管重写）  日期：2026-06-26
> 起草依据：已通读 `源代码/src` 主干（chat-orchestrator / agent-runner / server / bitget-adapter / asset-service / research-service / llm-client / ui/*），所有根因均经源码核实，非转述。
> 本版定位：**取代上一份「Bitget 工具贯通修复」草稿**。上一稿只解决「问题一（数据不准）」，几乎没碰「问题二（过程不可见）」——而后者才是把关人无法验收的真正卡点。本版把两个问题并列为同等优先级。
> 约束：**最多 4 人并行 / 今天下午完成 / 只写 Plan 不写代码**。

---

## 0. 把关人原话拆解（两个独立问题，不可混为一谈）

| 编号 | 把关人原话 | 本质 | 现状判断 |
|------|-----------|------|---------|
| **问题一** | "连 BTC 是什么都不知道，FDV 查出来十亿，不准确" | **数据正确性**：事实类提问拿不到真实行情，LLM 编造 | 已定位，根因在意图路由 + 富化跳过 + 合成层喂的是摘要而非原始数字 |
| **问题二** | "中间一堆 agent 文字，只有几个状态变化，看不出有没有调 Bitget，没有日志，没法确认它到底干没干" | **过程可观测性**：调用链对用户和把关人完全是黑盒 | **几乎是空白**，是本版最高价值增量 |

> 核心判断：**问题二比问题一更致命**。即使问题一修好，只要把关人看不到「这一轮到底调了哪个 Bitget 工具、入参是什么、返回了什么」，他依然无法确认系统是真干活还是又在编。所以本版的验收出口是「**可证明**」，不是「**听起来对**」。

---

## 1. 源码级根因（已核实，附文件:行，开发无需再查）

### 1.1 问题一：数据正确性断链

| 编号 | 现象 | 根因（已核实） | 文件:行 |
|------|------|--------------|---------|
| D-1 | "BTC 是什么" 落到 `unknown` intent | `classifyIntentRule` 无任何「事实查询/介绍类」规则，最后 `return "unknown"` | `chat-orchestrator.mjs:114` |
| D-2 | `unknown` intent 不派任何 agent | `INTENT_FANOUT.unknown = []`（空 fanout，零数据） | `chat-orchestrator.mjs:33` |
| D-3 | 即便派出 agent，也只拿到泛行情 | `BITGET_SKILLS` 的 `defaultCalls` 是 trending / defi_tvl / eth_gas / 全局情绪，**没有"针对该 ticker 的身份+市值+FDV+价格"调用** | `bitget-adapter.mjs:16-64` |
| D-4 | 大币被跳过身份富化 | `shouldEnrichIdentity` 仅当 `unclassified_asset` 或无链无合约时才富化；BTC 是 `major_crypto` 且有 chain → **直接 return，不调 Bitget** | `asset-service.mjs:164-173` |
| D-5 | 合成层只看到一句话摘要，看不到数字 | `synthesizeLLM` 把 agentResults 压成 `role: headline` 字符串喂给 LLM，**原始 marketCap/fdv/price 根本没进 prompt** → LLM 只能瞎编 | `chat-orchestrator.mjs:210-214` |
| D-6 | 兜底档案市值=0 | `mockProfiles` 无 BTC/ETH，落 `buildFallbackProfile`（marketCap:0, fdv:0） | `research-service.mjs:100-110` |

**D-1→D-2→D-5 是主链**：意图不识别 → 不派数据 agent → 合成层无数字可引 → 幻觉。D-3/D-4 是即使走对路径数据也拿不全的次链。

### 1.2 问题二：过程不可观测

| 编号 | 现象 | 根因（已核实） | 文件:行 |
|------|------|--------------|---------|
| O-1 | 中间面板只有 7 张固定卡 + 模糊状态 | `committee.js` 写死 7 个 AGENT_DEFS，headline 来自后端 `headlineFromBitget`，只输出"数据已刷新 (N 条来源)"这类话术，**不含工具名/入参/真实数字** | `committee.js:3-11`、`agent-runner.mjs:33-48,98-109` |
| O-2 | 看不到具体调了哪个 MCP 工具 | API 返回的 `agentResults[].data` 里虽有 `sources`，但**前端完全没渲染**，`staggerAgentArrivals` 只用了 headline/tookMs/status | `dashboard.js:115-124` |
| O-3 | fanout 超时后中间面板"假装无事" | server 端 7s 超时 → `orchestration.agentResults = []` → 前端 `if (resp.agentResults)` 不成立 → **卡片永远停在"思考中"，无任何错误提示** | `server.mjs:163-171`、`dashboard.js:87` |
| O-4 | 后端无结构化调用日志 | `bitget-adapter` / `agent-runner` 全程无 `console.log`，Vercel Functions 日志里看不到「是否真的发起了 MCP HTTP 请求」 | 全局缺失 |
| O-5 | 把关人无法事后追溯 | API response 不含「本轮工具调用清单 + 耗时 + 成败 + 原始返回片段」的结构化 trace | `server.mjs:185` 仅返回 orchestration |

**结论**：适配器代码是通的（`/api/refresh-research`、`/api/agent/{role}` 在用），但**对话主干没把它接进来，且接进来的部分也没把过程暴露给前端和日志**。本版不重写适配器，只做「接入 + 暴露」。

### 1.3 已澄清：输入框冻结**不是**本版任务

`chat.js:23-33` 的 `send()` 已有 `try/finally` 无条件恢复 input/btn；`dashboard.js:46-77` 的 `sendChat` 已有 25s `AbortController` + try/catch + 错误气泡。**Plan-VII 已修复，本版不重复投入。** 若把关人仍遇冻结，归为回归在 D 组验收时附带验证即可，不单列工作量。

---

## 2. 目标架构（我的思路，不照搬上一稿）

设计原则：**一条「事实查询」请求，从输入到回复，每一跳都留痕、可见、可追溯，且数字只能引用、不能编造。**

```
用户输入 "BTC 是什么 / FDV 多少"
   │
   ▼
[A组] 意图路由层  ──► 识别 lookup_asset_info，正则抽 ticker(BTC)
   │                  （新增意图 + fanout 映射）
   ▼
[B组] 资产事实管线 ──► 新增 asset_info agent role
   │                  内部强制调 bitget.resolveSymbol + enrichAsset
   │                  产出结构化档案 {symbol,name,price,marketCap,fdv,24h,chain,exchanges}
   │                  大币也强制富化（修 D-4）
   │                  拿不到 → 明确返回"暂无实时数据"，禁止编造
   ▼
[B组] 合成层改造  ──► synthesizeLLM 注入 asset_info 的**原始数字**（修 D-5）
   │                  system prompt 硬约束："价格/市值/FDV 必须逐字引用 agent_reports，缺失就说缺失"
   ▼
[C组] 可观测层    ──► 全链产出 toolCallTrace[]：每个 MCP 调用的 {tool,args,ok,tookMs,rawSnippet}
   │                  ① 写进 API response.trace
   │                  ② 后端 console.log（Vercel 日志可查）
   │                  ③ 前端中间面板动态渲染：调了哪个工具、入参、耗时、成败、原始返回
   │                  ④ 超时/失败卡片显式变红，不再"假装思考中"（修 O-3）
   ▼
[D组] 环境+降级+回归 ──► 核对线上 env；降级路径打 degraded 标记且 trace 可见；
                      写"5问数据正确性 + 4项可观测性"双维度回归脚本，断言到字段级
```

**关键解耦**：
- A 组只动 `chat-orchestrator.mjs` 的分类与 fanout 表，**不依赖 B/C 代码**，可立即开工。
- C 组的 trace 数据结构是 A/B/D 的「契约」，需在 13:15 同步时**先敲定 schema**（见 §5），之后各组并行。
- D 组的回归脚本骨架不依赖实现，可先写断言。

---

## 3. 四人分工（每人：目标 → 改什么 → 自检清单 → 怎么测 → 达标判据）

### A 组 — 意图路由与 ticker 抽取（1 人，轻量先行）

**目标**：让"X 是什么 / 介绍下 X / X 怎么样 / FDV 多少 / 市值多少"这类事实提问，**100% 命中新意图 `lookup_asset_info` 并正确抽出 ticker**，不再落 `unknown`。

**改什么（仅 `chat-orchestrator.mjs`）**：
1. `VALID_INTENTS` 增加 `"lookup_asset_info"`。
2. `INTENT_FANOUT` 增加 `lookup_asset_info: ["asset_info"]`（新 role，B 组实现）。
3. `classifyIntentRule` 在 `unknown` 之前插入事实查询规则：中英文 `是什么|什么币|介绍|了解|查一下.*(币|价格|市值|fdv)|what is|tell me about|怎么样|多少`。
4. `classifyIntentLLM` 的 system prompt 的 intent guide 补一条 `lookup_asset_info` 说明，并在示例里加 "what is BTC" → lookup_asset_info。
5. `extractSlotsRule` 的 ticker 正则增强：当前 `\b([A-Z]{2,8})\b` 漏掉小写输入（"btc 是什么"）；补一层「常见币名→ticker」映射 + 小写转大写兜底。

**功能点自检清单**：
- [ ] "BTC 是什么" → intent=`lookup_asset_info`, assetQuery=`BTC`
- [ ] "btc是什么"（小写无空格） → assetQuery=`BTC`
- [ ] "介绍下以太坊" → assetQuery=`ETH`（中文名映射）
- [ ] "SOL 怎么样" → `lookup_asset_info`, `SOL`
- [ ] "ENA 的 FDV 是多少" → `lookup_asset_info`, `ENA`
- [ ] "今天大盘怎么样" → **不**命中 lookup_asset_info（应走 refresh_research/smalltalk，不误触单币富化）
- [ ] "卖 30%" → 仍走 review_sell 快路径，未被新规则截胡
- [ ] "你好" → smalltalk，未被截胡

**怎么测**：写一个最小测试矩阵（10 条输入 → 期望 intent + 期望 assetQuery 的表格），用 `node` 直接调 `classifyIntent(msg, {})` 跑一遍打印对照。**纯函数，不需起服务、不依赖 B/C。**

**达标判据**：10 条全部命中期望（intent + assetQuery 双对）。任一错判记 FAIL 并附输入。**误触类（大盘/卖/你好）必须 0 命中 lookup_asset_info**——这条是硬红线，防止滥调 MCP 耗配额。

**交付物**：`Plan-VIII-A组-任务汇报.md` + 测试矩阵表（10 行）+ 跑通的 console 输出截图。

---

### B 组 — 资产事实数据管线（1 人，主攻坚）

**目标**：新增 `asset_info` agent，**对 BTC/ETH/SOL/ENA 等返回真实 price/marketCap/FDV/24h，且这些数字必须真正进入最终回复**；拿不到时明确说"暂无实时数据"，**断网/限流也绝不编造数字**。

**改什么**：
- 新增 `src/services/asset-info-service.mjs`（新文件）：封装 `resolveSymbol` + `enrichAsset`，输出结构化档案。
- `agent-runner.mjs`：`runAgent` 增加 `asset_info` 分支，调上面的 service。
- `asset-service.mjs:164`：`shouldEnrichIdentity` 增加条件——当调用方传入 `intent === 'lookup_asset_info'`（或显式 `forceEnrich` 标志）时，大币也富化（修 D-4）。
- `chat-orchestrator.mjs:210-214`：`synthesizeLLM` 改造——把 `asset_info` 的 `data.currentMetrics`（原始数字）拼进 prompt，不再只喂 headline（修 D-5）；system prompt 加硬约束。

**功能点自检清单**：
- [ ] `runAgent('asset_info', 'BTC')` 返回含 `currentMetrics.price/marketCap/fdv` 真实数值（非 0、非 null、量级合理：BTC marketCap 应在 1e12 量级，**不是十亿**）
- [ ] ETH / SOL 同样返回合理量级数字
- [ ] ENA（中长尾）通过 resolveSymbol 拿到，FDV 非 0
- [ ] 最终 `/api/chat` 回复文本里出现的市值/价格数字，能在同一 response 的 `agentResults` / `trace` 中**逐字找到来源**（不可凭空多出数字）
- [ ] 模拟 MCP 不可达（改 env 指向坏 URL）→ 回复明确含"暂无法获取实时数据"类措辞，**回复中无任何具体价格/市值数字**
- [ ] 大币富化开关只在 `lookup_asset_info` 下打开，evaluate/sell 等路径行为不变（防回归）
- [ ] 加 60s LRU 缓存 BTC/ETH/SOL，连续问同一币第二次不重复打 MCP（看 trace 里 `cached:true`）

**怎么测**：
1. 单元层：`node` 直调 `runAgent('asset_info','BTC')`，打印返回 JSON，核对数字量级。
2. 链路层：本地起 `npm start`，`curl -X POST localhost:PORT/api/chat -d '{"message":"BTC是什么","sessionId":"t1"}'`，grep 回复里的数字 + 在 response.trace 里反查来源。
3. 断网层：临时 `MARKET_DATA_MCP_URL=http://127.0.0.1:1/bad` 重跑，确认不编造。

**达标判据**：上述 7 项全 PASS。**最硬的一条**：回复中每个市值/价格数字都能在 trace 找到出处（可追溯性），以及断网场景 0 编造。任一不满足记 FAIL。

**交付物**：`Plan-VIII-B组-任务汇报.md` + `asset_info` 返回样例 JSON + 三层测试的 curl 输出/截图 + 断网场景证据。

**红线**：合成 prompt 里**绝不写死 BTC 市值常量**，数字一律运行时注入；LLM 函数调用不稳就走 B 组兜底——代码层强制调一次 `asset_info` 把结果塞进 prompt，不依赖 LLM 主动调工具。

---

### C 组 — 全链可观测性（1 人，本版最高价值）

**目标**：把关人在网页中间面板能**亲眼看到**「这一轮 Chief 调了哪几个 agent、每个 agent 调了哪个 Bitget/MCP 工具、入参是什么、耗时多少、成功还是失败、返回的原始数字片段」；Vercel 日志里能 grep 到每次 MCP HTTP 调用；超时/失败的卡片**显式变红报错**，不再假装思考中。

**改什么**：
- 定义 `toolCallTrace` 数据结构（见 §5，13:15 全员对齐后冻结）。
- `bitget-adapter.mjs` / `agent-runner.mjs`：每次 MCP 调用前后 push 一条 trace 记录 + `console.log("[MCP]", tool, args, ok, ms)`（修 O-4）。
- `server.mjs:185`：API response 增加 `trace` 字段（修 O-5）。
- `committee.js` + `dashboard.js`：中间面板从「7 张固定卡」升级为「**按本轮实际 fanout 动态渲染** + 每张卡可展开看工具调用明细」；`staggerAgentArrivals` 消费 `agent.data.sources` / trace（修 O-1/O-2）。
- 超时/失败处理（修 O-3）：`server.mjs` 超时分支也回传 `trace`（标记 timeout）；前端对未返回的 agent 显式置「超时/失败」红态。

**功能点自检清单**：
- [ ] `/api/chat` response 含 `trace` 数组，每条 `{agentRole, tool, args, ok, tookMs, rawSnippet}` 字段齐全、非空
- [ ] 问"BTC是什么"时，trace 里**至少一条** `tool` 为 Bitget/market-data MCP 工具（如 crypto_market/dex_market），`ok:true`
- [ ] 后端 console（本地终端 / Vercel 日志）能看到 `[MCP] crypto_market ... ok 320ms` 类日志行
- [ ] 中间面板**只渲染本轮实际派出的 agent**（lookup_asset_info 只亮 asset_info 卡，不再 7 张全亮）
- [ ] 点击/展开 agent 卡，能看到该 agent 调用的工具名 + 入参 + 耗时 + 原始返回片段
- [ ] fanout 超时 → 对应卡片变红显示"超时/未返回"，面板不再停在"思考中"
- [ ] MCP 失败（断网）→ 卡片显示"数据源未连接"红态 + trace 里 `ok:false` + error 文案
- [ ] degraded（规则模式）→ 面板有明确"规则模式"标识（modeBadge 已有，确认联动）

**怎么测**：
1. API 层：`curl` 打 "BTC是什么"，`jq '.trace'` 看结构；断言 trace 非空且含 MCP 工具。
2. 日志层：本地 `npm start` 终端观察 `[MCP]` 日志；部署后看 Vercel Functions 日志。
3. UI 层：Playwright 在本地/公网页面输入"BTC是什么"，截图中间面板，断言：(a) 只亮 asset_info 卡，(b) 卡内可见工具名，(c) 故意断网后卡片变红。
4. 超时层：临时把 MCP timeout 调大于 server 7s，触发超时分支，截图红态卡。

**达标判据**：8 项全 PASS。**最硬两条**：①response.trace 里能看到真实 MCP 工具调用且 ok:true（证明真调了）；②断网/超时时卡片显式报错（证明不再黑盒假装）。这两条直接对应把关人"没法确认它干没干"的诉求。

**交付物**：`Plan-VIII-C组-任务汇报.md` + trace 结构样例 JSON + 中间面板正常/超时/断网三态截图 + Vercel 日志截图（含 `[MCP]` 行）。

**红线**：trace 里的 `rawSnippet` 截断到合理长度（如 200 字），但必须是**真实返回**，不许塞占位串；前端展示不许 mock。

---

### D 组 — 环境、降级与双维度回归守门（1 人）

**目标**：保证线上 env 正确（否则 B/C 全白做）；降级路径可见且不偷偷编造；产出**「5 问数据正确性 + 4 项可观测性」双维度回归脚本**，断言到字段级，作为把关人验收的唯一权威依据。

**改什么 / 做什么**：
1. 核对线上 Vercel env：`LLM_API_KEY`、`LLM_BASE_URL`、`MARKET_DATA_MCP_URL=https://datahub.noxiaohao.com/mcp`、`CHAT_RULE_ONLY=0`。输出一张「期望值 vs 实际值」核对表。
2. 核查 `isRuleOnly()` 判定（`llm-client.mjs:6`）：确认线上不是因为缺 key 而静默降级；在 response/trace 暴露 `ruleOnly` 判定结果便于排查。
3. 写回归脚本 `tests/plan8-acceptance.mjs`（或并入 bstc），两维度：
   - **数据正确性 5 问**：BTC/ETH/SOL/ENA 各一问 + "大盘怎么样"误触防护；每问断言：intent 正确 + trace 含 MCP 调用 + 回复数字可在 trace 追溯 + 回复不含"小币/十亿市值"误判。
   - **可观测性 4 项**：response.trace 非空；trace 含真实 MCP 工具；超时场景回传 timeout trace；断网场景 ok:false 且回复不编造。

**功能点自检清单**：
- [ ] env 核对表 4 项全部「期望=实际」，任一不符标红并给修正命令
- [ ] response 暴露 `ruleOnly` / `degraded` 判定，线上实测 `ruleOnly=false`
- [ ] 5 问数据正确性脚本：5/5 PASS（含误触防护）
- [ ] 4 项可观测性脚本：4/4 PASS
- [ ] 脚本对每条产出 `{input, intent, traceHasMcp, numbersTraceable, fabricationDetected, pass}` 明细
- [ ] 断网/超时两个反例场景脚本可一键复跑

**怎么测**：脚本本身即测试。先本地 `node tests/plan8-acceptance.mjs` 跑绿，再 `--http=https://decision-brain-gray.vercel.app` 对公网跑一遍。

**达标判据**：本地与公网两次跑分，9 条断言（5+4）全绿；公网 `ruleOnly=false`。任一红 → 定位到责任组（intent 错→A，数字错/编造→B，trace 缺→C，env 错→D 自己），不放行。

**交付物**：`Plan-VIII-D组-任务汇报.md` + env 核对表 + 回归脚本 + 本地/公网两次执行记录 JSON。

---

## 4. 一个下午的时间轴

```
13:00–13:15  全员同步：确认两个问题边界、文件边界、谁碰哪个文件（防冲突）
13:15–13:30  ★冻结 trace schema（§5）★ —— C 组主导，A/B/D 确认契约后并行
13:30–15:30  并行开工
             A：意图规则 + ticker 抽取 + fanout 映射（纯函数，最快出活）
             B：asset_info service + 大币富化 + 合成层注入原始数字
             C：trace 埋点 + API 暴露 + 中间面板动态渲染骨架
             D：env 核对 + 回归脚本断言骨架（先写断言，桩数据先行）
15:30–15:50  第一次联调：A 的 intent → B 的 asset_info → C 的 trace 串起来
             （curl "BTC是什么"，看 response 同时有真实数字 + 非空 trace）
15:50–17:00  并行收尾
             A：补测试矩阵到 10 条
             B：缓存 + 断网降级 + 可追溯性自检
             C：超时/断网红态 + Vercel 日志验证 + 三态截图
             D：跑 5 问 + 4 项，红的回填责任组
17:00–17:45  全员联调：D 组脚本本地全绿
17:45–18:15  灰度部署 → D 组 --http 对公网跑，9 条全绿
18:15–18:30  把关人真机验收：输入"BTC是什么"，亲眼看中间面板出现 MCP 工具调用 + 真实市值
```

**文件边界（防止四人互相踩）**：
- A：`chat-orchestrator.mjs`（分类/slots/fanout 表）
- B：`asset-info-service.mjs`（新）、`agent-runner.mjs`、`asset-service.mjs:164`、`chat-orchestrator.mjs:210-244`（合成层）
- C：`bitget-adapter.mjs`（埋点）、`server.mjs:185`、`committee.js`、`dashboard.js`
- D：`vercel.json` env、`tests/plan8-acceptance.mjs`（新）
- **冲突点预警**：A 和 B 都碰 `chat-orchestrator.mjs`——A 改上半段（分类/fanout），B 改下半段（synthesize）。约定 13:15 各自划定行区间，避免覆盖。

---

## 5. ★ trace 数据结构契约（13:15 冻结，全员遵守）★

这是 A/B/C/D 之间的接口契约，**先定结构再并行**，避免下午联调时对不上。

```
// /api/chat response 顶层新增字段
trace: [
  {
    agentRole: "asset_info",        // 哪个 agent 发起的
    tool: "crypto_market",          // 调的 MCP 工具名（必填，真实）
    args: { action: "search", query: "BTC" },  // 入参（必填）
    ok: true,                       // 成败（必填）
    tookMs: 320,                    // 耗时（必填）
    cached: false,                  // 是否命中缓存
    rawSnippet: "...前200字真实返回...",  // 原始返回片段（成则有，败则 error 文案）
    error: null                     // 失败时填错误信息
  },
  ...
]

// 同时每条 console.log("[MCP]", tool, JSON.stringify(args), ok, tookMs+"ms")
```

约定：
- B 组的 `asset_info` 产出的 `data.sources` 必须能被 C 组映射成上述 trace 条目。
- 前端 `committee.js` 按 `trace[].agentRole` 分组渲染到对应卡片的展开区。
- D 组断言直接读这个结构的字段（`traceHasMcp = trace.some(t => t.ok && KNOWN_MCP_TOOLS.includes(t.tool))`）。

---

## 6. 验收出口（把关人这一关怎么算过）

**数据正确性（问题一）**：
- "BTC/ETH/SOL 是什么" → 回复含真实价格/市值/FDV，BTC 市值量级正确（万亿级，不是十亿）
- "ENA FDV 多少" → 真实数字，非 0
- 断网时 → 明说"暂无实时数据"，不编造

**过程可观测（问题二）—— 本版核心**：
- 中间面板**只亮本轮实际派出的 agent**，能展开看到「调了哪个 MCP 工具 + 入参 + 耗时 + 真实返回片段」
- response.trace 非空且含 ok:true 的真实 MCP 调用
- Vercel 日志能 grep 到 `[MCP]` 行
- 超时/断网 → 卡片**显式变红报错**，不再黑盒假装思考

**把关人一句话验收标准**：
> 我输入"BTC是什么"，回复给出的市值是对的（万亿级）；中间面板我能看到它确实调了某个 Bitget/MCP 工具、花了多少毫秒、返回了什么；我故意断网，它会红着脸告诉我没数据，而不是继续编。

D 组的 9 条断言（5 数据 + 4 观测）本地+公网双绿，即视为 Plan-VIII 达标。

---

## 7. 风险与缓解（只列今天用得上的）

| 风险 | 缓解 |
|------|------|
| LLM 函数调用不稳，不主动调工具 | B 组**代码层强制**调一次 asset_info，结果塞 prompt，不依赖 LLM 自主调用 |
| MCP 限流 | B 组 60s LRU 缓存 BTC/ETH/SOL；trace 标 `cached:true` |
| A/B 同改 chat-orchestrator 冲突 | 13:15 划定行区间，A 上半段 B 下半段，分别 commit 后再 merge |
| 前端动态渲染来不及 | C 组保底：先把 trace 以 JSON 折叠块渲染在面板底部（丑但可见），余力再做卡片展开美化 |
| trace schema 中途想改 | 13:15 冻结后**当天不改**；不够用就加字段不删字段 |
| 时间不够砍什么 | 可砍：C 组卡片展开美化（降级为 JSON 折叠块）、B 组 mockProfiles 补 BTC（正常路径走实时即可）。**不可砍**：A 意图、B 实时数字+可追溯、C trace 暴露+断网红态、D 9 条断言 |

---

## 8. 不做事项（防跑偏）

- 不重写 Bitget 适配器（它是通的，只接入 + 暴露）。
- 不在合成 prompt 写死任何市值常量（数字一律运行时注入）。
- 不把 `unknown` 一律调 MCP（靠 `lookup_asset_info` 精准命中，省配额）。
- 不重复修输入框冻结（Plan-VII 已修，D 组顺带回归即可）。
- 不为单条断言 pass 改命题；9 条断言今天定死。
- 不碰交易 Tools、不留私钥、密钥不进 git。

---

## 9. 交付物清单（今天下班前齐）

1. 本计划（已交付）
2. A 组：`Plan-VIII-A组-任务汇报.md` + 10 行意图测试矩阵 + console 截图
3. B 组：`Plan-VIII-B组-任务汇报.md` + asset_info 样例 JSON + 三层 curl 证据 + 断网证据
4. C 组：`Plan-VIII-C组-任务汇报.md` + trace 样例 + 面板三态截图 + Vercel `[MCP]` 日志截图
5. D 组：`Plan-VIII-D组-任务汇报.md` + env 核对表 + `plan8-acceptance.mjs` + 本地/公网双跑记录

> 汇报红线（沿用历版）：FAIL 写 FAIL 不粉饰；每个 PASS 背后有截图/JSON/curl 实证；时延用真实测量；数字可追溯到 trace。
