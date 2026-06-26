# Plan-V 功能做实作战计划

**项目**: Decision Brain — Bitget Hackathon S1（Trading Agent 赛道）
**阶段**: 第五阶段 — **把功能做实**（修复跨步骤状态缺口，让端到端 9 步真能连贯跑通）
**指挥**: 把控人
**日期**: 2026-06-26
**前置**: Plan-IV 已达成 M-IV-1（git 净 + 说明终稿 + Demo URL/GitHub 已填 + 前端 E1/E2 实证）；但**端到端 E3–E9 从没人连贯跑过，复核发现 review_add / review_sell 存在真功能缺口**

> **致 A / B / C 三位**：这份文件是本阶段唯一权威依据，自成一体，不需要读历史聊天记录。先读 §0 背景和 §1 现状（含已定位的 bug），再跳到 §3 找"你负责的那一组任务卡"。接口契约一律以 `plan/前端交互-架构与对接文档-v2.md`（下称 **v2 文档**）§3 为准。**本阶段不录制、不提交，唯一目标是把功能做实。**

---

## 0. 项目背景（30 秒读懂你在做什么）

Decision Brain 是一个**加密资产决策辅助系统**，不是交易机器人。用户问"研究某个币值不值得买"，后端并发调度 7 个 Agent（记忆 / 宏观 / 链上 / 情绪 / 技术 / 新闻 / 估值），其中 5 个吃 Bitget 的 Skill + MCP 真实数据，最后由 Chief Agent 用 LLM（DeepSeek）综合成自然语言结论，前端三栏实时展示"多 Agent 作战室"的并发观感。

- **红线（沿用全程，不可碰）**：不假造数据、不碰交易 Tools/私钥、密钥不进 git、**不改契约只改代码**、不重写后端。
- **源代码目录**：`/Users/jasoncong/Desktop/Decision Brain/源代码`
- **线上地址**：`https://decision-brain-gray.vercel.app`
- **GitHub**：`https://github.com/Levelup-JC/decision-brain`（main，commit `c0544d9`）

---

## 1. 当前真实现状（把控人 2026-06-26 逐步实测，已定位 bug）

把控人把 E2–E7 在线上逐步实跑（不是看报告），结果如下。**E6/E7 是真功能缺口，会在演示第 6、7 步当场翻车**：

| 步 | 输入 | 实测结果 | 状态 |
|----|------|---------|------|
| E2 评估 | 研究BTW | 45s、7 Agent、degraded=false、自然语言结论 | 通 |
| E3 记仓位 | 我买了100个**BTW**成本0.09 | intent=manage_position、assetQuery=BTW、回复正常 | 通 |
| E5 确认计划 | 确认计划 | intent=confirm_plan、回复正常 | 通 |
| **E6 加仓** | **BTW**能加仓吗 | intent=review_add、**assetQuery=None**、4 Agent 全报错 `Missing required field: assetQuery` | **坏** |
| **E7 卖出** | **BTW**卖30% | intent=review_sell、**assetQuery=None**、4 Agent 全报错 | **坏** |

### 已定位的根因（两层叠加，给各组省排查时间）

1. **没有"当前资产"兜底**：`src/server.mjs:146` 跑 Agent 时直接用 `orchestration.assetQuery`，为 null 即报错。前端 `src/ui/dashboard.js:23` 发的是 `context: {}`（空）——所以浏览器和 curl 一样，问"能加仓吗"时系统不知道是哪个币。
2. **review_add / review_sell 连写了币种也提不出**：`BTW能加仓吗`/`BTW卖30%` 明明带了 BTW，分类后 assetQuery 仍为 null。而 evaluate / manage_position 能正确提取 BTW——说明缺口集中在这两个 intent 的槽位提取/上下文解析路径。槽位规则提取在 `src/chat-orchestrator.mjs` 的 `extractSlotsRule()`（ticker 正则在第 47 行附近）。

> **注意**：以上 bug 定位由把控人提供，作为各组排查起点，**但各组必须自己复跑确认现象、自己定位最终根因再动手**，不许直接照抄结论改一行了事。

### 其他已确认健康（本阶段不用动）

- git 干净（`c0544d9`）、密钥扫描空；线上 /api/health、/、/api/state 全 200；evaluate 链路 45s 内返回不超时；HTTP/2 偶发 `framing layer` 抖动属网络层，重试即好，非功能 bug。

---

## 2. 本阶段唯一目标与里程碑

把"单步能跑、跨步骤会断"修成"**端到端 9 步连贯跑通**"。本阶段是修复战，**不录制、不提交**。

- **M-V-1（根因确认）**：A 组复跑 E6/E7 确认现象，把"assetQuery 为何为空"的最终根因查清（是规则正则漏、还是 LLM 分类丢槽、还是缺上下文兜底），产出根因报告。**先诊断，后改代码。**
- **M-V-2（功能修复）**：在**不改契约、不重写后端**前提下修复 review_add / review_sell：(a) 带币种时能正确提取 assetQuery；(b) 不带币种时能从 state 最近聚焦资产兜底；修复后 E6/E7 能正常出加仓/卖出建议卡片（含底仓保护）。
- **M-V-3（端到端验收）**：B 组真人浏览器**一个连续会话内**从 E2 走到 E7 全程跑通并逐步截图；C 组复跑全部 9 步 API + 守住 git/密钥/测试基线。三组确认"端到端连贯，无报错"。

---

## 3. 各组任务卡 + 交付指标（找到带你名字的那一组）

> **本阶段验收纪律（针对上一轮翻车教训新增，必须遵守）**：
> 1. **每一步独立举证**：不许"跑了 E2 就报全部完成"。点名给你的每个 E 步，都要单独留证据（响应字段 / 截图）。
> 2. **必须测反例输入**：不光测"顺利输入"，要测"不带币种""跨步骤追问"这种真实对话，专门撞 bug。
> 3. **端到端连贯**：E3–E7 必须在**同一个会话**里顺序跑，证明跨步骤状态没断——这正是上一轮分段抽查漏掉的地方。
> 4. **跑不通如实报**：任何一步失败，如实记录现象+升级，严禁假报 PASS。把控人会亲手复跑你的关键声称。

### A 组 — 根因诊断 + 修复 review_add / review_sell（关键路径，核心任务）

> 你是本阶段主力。先**诊断**（确认 bug、查清根因），再**最小修复**。修的是 §1 那两层缺口。

| 编号 | 任务 | 交付指标（达标定义） | 必须留的证据 |
|------|------|---------------------|------------|
| A-V-1 | 复跑确认 bug 现象 | 线上各打一次：`BTW能加仓吗`、`BTW卖30%`、`能加仓吗`（不带币种），确认 assetQuery 是否为 null、Agent 是否报 `Missing required field: assetQuery` | 三次响应的 intent + assetQuery + 报错 Agent 数粘贴 |
| A-V-2 | 查清最终根因 | 定位 assetQuery 为空的真正源头：是 `extractSlotsRule()` 正则漏 review_add/sell 的句式？是 LLM 分类丢槽位？还是根本缺"当前资产"上下文兜底？给出明确结论 | 根因说明 + 相关代码行号引用 |
| A-V-3 | 修复带币种提取 | 改 `src/chat-orchestrator.mjs`，让 `BTW能加仓吗`/`BTW卖30%` 能正确提出 `assetQuery=BTW`。**只改槽位提取逻辑，不改契约、不动 fanout 定义** | 改后复跑该两句，assetQuery=BTW 的响应粘贴 + diff |
| A-V-4 | 修复无币种兜底 | 让不带币种的追问能从 state 最近聚焦资产兜底（路径自定，但**不改 v2 §3 的请求/响应契约**）。修复后 `能加仓吗`（前面评估过 BTW）能出建议、不报 Missing field | 改后复跑，agentResults 无 `Missing required field` 错误的响应粘贴 + diff |
| A-V-5 | 回归不破坏 | 修完确认 E2 评估 / E3 记仓位 / E5 确认计划仍正常；本地 `npm test`（若有）仍全绿 | E2/E3/E5 复跑 + 测试输出粘贴 |

**A 组红线**：只动 `chat-orchestrator.mjs`（必要时 `server.mjs` 的 assetQuery 取值）这类**业务逻辑最小面**，**绝不改 v2 §3 契约、不重写后端架构、不假造数据**。改完每处都要复跑举证，不收"应该好了"。

---

### B 组 — 真人浏览器端到端连贯实跑 E2→E7（A 组修完后验收）

> **上一轮的教训**：B 组只跑了 E1/E2 就报完成，E3–E7 没碰，结果 E6/E7 的 bug 一直没暴露。本阶段你必须在**同一个连续会话**里，用浏览器打开公网 URL，从评估一路走到卖出，**每步独立截图**。这是端到端验收关。

| 编号 | 任务 | 交付指标（达标定义） | 必须留的证据 |
|------|------|---------------------|------------|
| B-V-1 | E2 评估 | 浏览器输入"研究 BTW"，7 Agent 逐个亮起、Chief 综合 | 截图：委员会全部完成 + Chief 回复 |
| B-V-2 | E3 记仓位 | 同会话输入"我买了100个BTW成本0.09，组合5万"，右栏持仓变化 + draft 计划 | 截图：右栏持仓 + draft 计划 |
| B-V-3 | E5 确认计划 | 同会话输入"确认计划"，计划 draft → active | 截图：计划 active |
| B-V-4 | **E6 加仓（反例验证）** | 同会话输入"**能加仓吗**"（**故意不带币种**），出现加仓建议卡片、**不报"缺少资产信息"** | 截图：加仓建议卡片（无报错） |
| B-V-5 | **E7 卖出（反例验证）** | 同会话输入"**卖30%**"（不带币种），出现卖出建议且体现**底仓保护** | 截图：卖出建议卡片 |
| B-V-6 | 诚实性 + Trace | 全程左栏 Trace 累积；BTW 主观字段显"待补充"，无 null/undefined | 截图：Trace + "待补充"字段 |

**B 组红线**：截图地址栏必须可见 `decision-brain-gray.vercel.app`（公网非 localhost）。B-V-4/B-V-5 **必须故意不带币种**，这是专门撞 §1 bug 的反例——若 A 组没修好，你这里就该如实报"未通过 + 现象"，不许换成带币种话术蒙混。

---

### C 组 — 全链路 API 回归 + 基线守护（A 组改完后兜底复核）

> 你负责用 API 把 9 个 intent 全过一遍（B 组验前端，你验后端契约），并守住 git/密钥/测试三条基线，确保 A 组改代码没引入新问题。

| 编号 | 任务 | 交付指标（达标定义） | 必须留的证据 |
|------|------|---------------------|------------|
| C-V-1 | 全 intent 回归 | A 组修完后，按 v2 §3 逐个 `curl /api/chat` 打全部主要 intent（evaluate / manage_position / confirm_plan / review_add / review_sell），每个 `ok=true`、intent 分类对、**agentResults 无 Missing field 错误** | 每个 intent 的 intent+assetQuery+报错数粘贴（建议存 `C-V-1-online-*.json`） |
| C-V-2 | 反例回归 | 专打"不带币种追问"：`能加仓吗`、`卖30%`，确认 A 组兜底生效，不再 4 Agent 全错 | 两次响应粘贴 |
| C-V-3 | git/密钥基线 | A 组改完 commit 后：`git status` 干净、按文件 commit（不 `git add .`）、`git grep -iE "sk-[a-zA-Z0-9]{12,}"` 仍空 | `git status` + `git log --oneline -3` + 密钥扫描（空） |
| C-V-4 | 测试基线 | 本地 `npm test`（或项目实际测试命令）跑一遍，确认 A 组改动后测试仍全绿 | 测试输出粘贴（通过数 / 总数） |

**C 组红线**：只 commit 该 commit 的文件，**绝不 `git add .`**，commit 前 `git status` 复核。发现 A 组改动让测试变红或引入密钥，立刻打回 A 组，不许放行。

---

## 4. 执行顺序与依赖（关键路径）

```
A-V-1 复跑确认 bug ──→ A-V-2 查清根因 ──→ A-V-3 修带币种提取
                                          A-V-4 修无币种兜底
                                          A-V-5 回归不破坏
                                               │
                              （A 组改完，通知 B/C 验收）
                                               │
                          ┌────────────────────┴────────────────────┐
                          ↓                                          ↓
              B-V-1~6 浏览器端到端连贯跑 E2→E7         C-V-1~4 API 全 intent 回归 + 基线守护
              （含 E6/E7 反例：故意不带币种）           （含反例回归 + git/密钥/测试）
                          └────────────────────┬────────────────────┘
                                               ↓
                          【M-V-3 端到端验收达成：9 步连贯，无报错】
                                               ↓
                              （功能做实，本阶段收口——录制/提交另议）
```

**关键路径瓶颈**：A 组是一切前置——A 不把 E6/E7 修通，B/C 验收必然失败。B 组的 E6/E7 反例截图与 C 组的反例 API 回归，是验证 A 组真修好的"双保险"。

---

## 5. 测试与自测要点（每组先自测，把控人再交叉复核）

> **本阶段最重要的纪律：端到端连贯 + 反例输入 + 每步独立举证。** 上一轮就是因为"分段抽查、没测反例、跑完 E2 就报完成"才漏掉 E6/E7。

### A 组自测（TA-V）

| 编号 | 测什么 | 操作 | 通过标准 |
|------|--------|------|----------|
| TA-V-1 | 带币种提取 | `curl -d '{"message":"BTW能加仓吗"}'` | assetQuery=BTW（非 null） |
| TA-V-2 | 无币种兜底 | 先评估 BTW，再 `curl -d '{"message":"能加仓吗"}'` | agentResults 无 Missing field 错误 |
| TA-V-3 | 卖出修复 | `curl -d '{"message":"BTW卖30%"}'` | assetQuery=BTW、出卖出建议、底仓保护体现 |
| TA-V-4 | 回归 | 复跑 E2/E3/E5 | 三步仍正常，未被改坏 |

### B 组自测（TB-V）

| 编号 | 测什么 | 操作 | 通过标准 |
|------|--------|------|----------|
| TB-V-1 | 端到端连贯 | 同会话 E2→E3→E5→E6→E7 顺序跑 | 全程无报错，**截图** |
| TB-V-2 | E6 反例 | 输入"能加仓吗"（不带币种） | 出加仓建议、不报缺资产，**截图** |
| TB-V-3 | E7 反例 | 输入"卖30%"（不带币种） | 出卖出建议、底仓保护，**截图** |

### C 组自测（TC-V）

| 编号 | 测什么 | 操作 | 通过标准 |
|------|--------|------|----------|
| TC-V-1 | 全 intent | 逐个 curl 5 类 intent | 全 ok=true、无 Missing field |
| TC-V-2 | 反例 API | curl"能加仓吗"/"卖30%" | 兜底生效，不全错 |
| TC-V-3 | 基线 | git status + 密钥扫描 + npm test | 干净 + 空 + 全绿 |

---

## 6. 防止重蹈覆辙：本阶段强制审查纪律

> 历史教训：报告说"完成"，实测有 bug。根因是**测试是分段抽查、没测反例、跑完 E2 就报全部完成**。Plan-V 把纪律写死：

1. **声称必须可复跑**：说"修好了"就附复跑后 assetQuery=BTW、无 Missing field 的响应；说"前端通"就附**公网 URL 截图**；不收"应该好了""代码里改了所以应该能跑"。
2. **必须测反例**：E6/E7 必须用"不带币种的追问"去撞 bug，不许换成带币种话术规避。
3. **端到端连贯**：E3–E7 必须同一会话顺序跑，证明跨步骤状态不断。
4. **改代码守红线**：只动业务逻辑最小面，不改契约、不重写后端、不假造字段；改完逐文件 commit，绝不 `git add .`。
5. **跑不通如实报**：失败立即如实记录+升级，严禁假报 PASS。
6. **把控人复核**：每组交完，把控人亲手复跑你的关键声称，对不上打回重做。

---

## 7. 把控人终审清单（Plan-V 功能做实，10 项全绿才收口）

- [ ] A 组复跑确认 E6/E7 bug 现象（assetQuery=null + Missing field），有响应证据
- [ ] A 组查清最终根因，有代码行号引用
- [ ] `BTW能加仓吗` / `BTW卖30%` 修复后 assetQuery=BTW（把控人现场复跑）
- [ ] 不带币种的"能加仓吗"能从上下文兜底，agentResults 无 Missing field（把控人现场复跑）
- [ ] E6 出加仓建议卡片、E7 出卖出建议（含底仓保护）
- [ ] A 组回归：E2/E3/E5 修后仍正常
- [ ] B 组同一会话端到端 E2→E7 全过，每步独立公网截图齐
- [ ] B 组 E6/E7 反例（不带币种）截图，无"缺少资产信息"报错
- [ ] C 组全 intent + 反例 API 回归通过，无 Missing field
- [ ] C 组基线守护：git 干净、密钥扫描空、`npm test` 全绿

---

## 8. 关键命令速查

```bash
# A-V-1 复跑确认 bug（强制 http1.1 避开 framing 抖动）
for MSG in "BTW能加仓吗" "BTW卖30%" "能加仓吗"; do
  echo "=== $MSG ==="
  curl -s --http1.1 --max-time 120 -H "Content-Type: application/json" \
       -d "{\"message\":\"$MSG\"}" https://decision-brain-gray.vercel.app/api/chat \
  | python3 -c "import json,sys;d=json.load(sys.stdin);ar=d.get('agentResults',[]);print('intent=',d.get('intent'),'assetQuery=',d.get('assetQuery'),'报错=',len([a for a in ar if a.get('status')=='error']),'/',len(ar))"
done

# A-V-2 看槽位提取 / 分类逻辑
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
sed -n '35,95p' src/chat-orchestrator.mjs        # extractSlotsRule + classifyIntentRule
sed -n '135,160p' src/server.mjs                 # /api/chat 路由 + runFanoutAgents 取 assetQuery

# A-V-5 / C-V-4 回归测试（项目实际命令为准）
npm test

# C-V-3 git/密钥基线
git status && git log --oneline -3 && git grep -iE "sk-[a-zA-Z0-9]{12,}"
```

---

> Plan-V 为第五阶段唯一权威依据。核心是**把功能做实**：A 组诊断并修复 review_add / review_sell 的 assetQuery 缺口（带币种能提取 + 不带币种能兜底），B 组真人浏览器同一会话端到端跑 E2→E7（含反例截图），C 组 API 全 intent 回归 + 守 git/密钥/测试基线。本阶段不录制、不提交，端到端 9 步连贯无报错即收口。接口契约以 v2 文档 §3 为准，红线沿用全程不变。
