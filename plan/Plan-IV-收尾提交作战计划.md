# Plan-IV 收尾提交作战计划

**项目**: Decision Brain — Bitget Hackathon S1（Trading Agent 赛道）
**阶段**: 第四阶段 — 收尾做实、终审、录 Demo、提交表单
**指挥**: 把控人
**日期**: 2026-06-26
**前置**: Plan-III 已达成 M-III-1（git 固化）+ M-III-2（线上做实），M-III-3（收尾提交）未动

> **致新加入的 A / B / C 三位**：你们是接替上一轮的三个人。这份文件是本阶段唯一权威依据，自成一体，不需要你读历史聊天记录。先读完 §0 背景和 §1 现状，再跳到 §3 找"你负责的那一组任务卡"。接口契约一律以 `plan/前端交互-架构与对接文档-v2.md`（下称 **v2 文档**）§3 为准。

---

## 0. 项目背景（30 秒读懂你在做什么）

Decision Brain 是一个**加密资产决策辅助系统**，不是交易机器人。它做的事：用户问"研究某个币值不值得买"，后端并发调度 7 个 Agent（记忆 / 宏观 / 链上 / 情绪 / 技术 / 新闻 / 估值），其中 5 个吃 Bitget 的 Skill + MCP 真实数据，最后由 Chief Agent 用 LLM（DeepSeek）综合成自然语言结论，前端三栏实时展示"多 Agent 作战室"的并发观感。

- **红线（沿用全程，不可碰）**：不假造数据、不碰交易 Tools/私钥、密钥不进 git、不改契约只改代码、不重写后端。
- **源代码目录**：`/Users/jasoncong/Desktop/Decision Brain/源代码`
- **线上地址**：`https://decision-brain-gray.vercel.app`
- **GitHub**：`https://github.com/Levelup-JC/decision-brain`（main 分支）

---

## 1. 当前真实现状（把控人 2026-06-26 亲手实测，非报告转述）

上一轮三组报告都写"全部完成"，但把控人逐条复跑后，真实情况是 **M-III-1 / M-III-2 已做实，M-III-3 完全没动**。下面是实测证据，作为 Plan-IV 的起点：

| 维度 | 实测结果 | 状态 |
|------|---------|------|
| git 固化 | commit `bcd7bf5` 已在 main；secret 扫描空；`.env`/`.vercel`/`node_modules` 均在 `.gitignore` | 已做实 |
| 线上健康 | `/api/health` → `{"ok":true}`、`/` → 200、`/api/state` → 200（assets=1, sources=303, plans=1） | 已做实，不再 404 |
| 线上 LLM | 现场 `curl /api/chat -d '{"message":"研究BTW"}'` → `degraded=false`、intent=evaluate_candidate、7 Agent、reply 是自然语言综合 | 已做实 |
| 提交说明 | `提交-Project-Description.md` 已无"千问/Qwen"，DeepSeek 已写明 | 已做实 |

### 仍未关闭的三个缺口（Plan-IV 要全部干掉）

1. **提交表单三链接全空** —— `提交-Project-Description.md` §4 里 `Demo URL: ____`、`GitHub / README: ____`、`Demo video: ____` 都是占位符，没填。
2. **一笔改动没提交** —— `源代码/.gitignore` 多了一行 `.env*.local` 未 commit，`git status` 显示 ` M .gitignore`，严格说工作区不干净。
3. **线上 E2E 9 步从没主持过** —— 上一轮所谓"前端复验"部分是"代码审查 / 预期无 error"，不是真人浏览器实跑；端到端 9 步把控人一次都没在公网 URL 上主持过，没有录屏证据。

### 已知技术隐患（不是缺口，但录 Demo 要绕开）

- **KV 是文件模式 `/tmp` 兜底，不是真持久化**：Vercel serverless 冷启动会丢数据。**录 Demo 必须在一次连续会话内完成，中途别等太久导致冷启动。**

---

## 2. 本阶段唯一目标与里程碑

把"线上真能跑"变成"**提交得出去、别人点开就能复现**的可信交付"。本阶段基本不写新代码，是收尾战。

- **M-IV-1（收尾做实）**：git 工作区真干净；提交表单三链接填满；提交说明终稿过一遍。
- **M-IV-2（终审与录制）**：把控人主持**线上公网 URL** 上的 E2E 9 步全过，全程录屏作为 Demo。
- **M-IV-3（提交完成）**：录屏剪到 ≤3 分钟，三链接落到提交表单，把控人终审清单 13 项全绿，正式提交。

---

## 3. 各组任务卡 + 交付指标（找到带你名字的那一组）

> **每张任务卡都给了"达标定义"和"必须留的证据"。没有证据 = 没完成，把控人不收口头"done"。**

### C 组 — git 收口 + 录制环境演练（关键路径起点）

| 编号 | 任务 | 交付指标（达标定义） | 必须留的证据 |
|------|------|---------------------|------------|
| C-IV-1 | 提交遗留的 `.gitignore` 改动 | `cd 源代码 && git add .gitignore && git commit -m "chore: gitignore 补充 .env*.local" && git push`，之后 `git status` 输出**完全为空** | `git status` 截图/粘贴，显示 `working tree clean` |
| C-IV-2 | 密钥泄漏复查（再做一次，别信上一轮） | `git grep -iE "sk-[a-zA-Z0-9]{12,}"` 输出为空；确认 `.env`/`.vercel`/`node_modules` 仍未跟踪 | 命令输出（空）粘贴 |
| C-IV-3 | 线上三路探活（给 A/B 解依赖前自查一遍） | `curl -s -o /dev/null -w "%{http_code}" {url}/api/health`、`/`、`/api/state` 全部返回 `200` | 三个 HTTP 码粘贴 |
| C-IV-4 | 录制窗口演练（绕开冷启动陷阱） | 连续会话内：evaluate 一个资产 → 立刻 `/api/state` 看资产在 → 记录从首次请求到数据可见耗时，确认 Demo 录制能在该窗口内一气呵成 | 演练记录：时间线 + 是否丢数据结论 |

**C 组红线**：只 commit `.gitignore` 这一个文件，**别用 `git add .`**，别误推任何新文件。

---

### A 组 — 提交说明终稿 + 表单三链接

| 编号 | 任务 | 交付指标（达标定义） | 必须留的证据 |
|------|------|---------------------|------------|
| A-IV-1 | 线上 LLM 复跑一次（自己确认没退化） | `curl {url}/api/chat -d '{"message":"研究BTW"}'` → `degraded=false`、intent 正确、agentResults 长度=7、reply 是自然语言 | 响应关键字段粘贴（degraded/intent/agents 数） |
| A-IV-2 | 填提交表单三链接 | 编辑 `plan/提交-Project-Description.md` §4：Demo URL 填线上地址、GitHub 填仓库地址、Demo video 等 C/All 录完后回填，三处不留 `____` | 改后的 §4 全文粘贴 |
| A-IV-3 | 提交说明终稿过一遍 | 通读 `提交-Project-Description.md`：无"千问/Qwen"、DeepSeek 信息（`api.deepseek.com/v1`, `deepseek-chat`）正确、Bitget 5 Skill 名字写全、无明显错别字/占位符 | 通读结论 + 改动点列表 |
| A-IV-4 | 降级保险线上复核（防止演示时翻车） | 确认线上即使 LLM 超时/错误也是 HTTP 200 自动降级到规则模式，不 500；知道降级时前端会显示"规则模式"金标 | 复核说明（怎么验的） |

**A 组红线**：提交说明点名哪个模型，线上就必须真跑过哪个。Demo video 链接要等 E2E 录完才有，先占位标注"待 E2E 后回填"，**别瞎填一个假链接**。

---

### B 组 — 真人浏览器线上复验（这次必须真跑，不收代码审查）

> **上一轮的教训**：B 组上轮部分结论是"预期无 error""代码审查显示…"，不是真人打开浏览器看到的。Plan-IV 要求 B 组**真的用浏览器打开公网 URL**，肉眼看到、截图为证。

| 编号 | 任务 | 交付指标（达标定义） | 必须留的证据 |
|------|------|---------------------|------------|
| B-IV-1 | 线上真连接 | 浏览器开 `{url}/`，顶部显示"已连接"+绿点，F12 控制台**无红色 error** | 截图：页面顶部 + F12 Console |
| B-IV-2 | 委员会并发冒泡 | 输入"研究 BTW"，7 个 Agent 卡片**逐个**亮起（各自 loading + tookMs 不同），不是一次性刷出 | 截图：冒泡中途 + 全部完成 |
| B-IV-3 | 资产看板动画 | evaluate 后右栏资产数变化、有 count-up 数字动画、mini-card 渲染正确 | 截图：右栏资产卡片 |
| B-IV-4 | 诚实标注 | BTW 卡片主观字段：缺数据显示灰色"待补充"、部分数据显示"补强"，无 `null`/`undefined` 露出 | 截图：含"待补充"字样的字段 |
| B-IV-5 | 降级提示 | 知道并能描述：后端降级时顶部切"规则模式"金标、功能不挂；正常时显示"LIVE"绿标 | 截图：当前模式标 |

**B 组红线**：不为好看在前端假造后端没返回的字段；截图必须是公网 URL（地址栏可见 `decision-brain-gray.vercel.app`），不是 `localhost`。

---

### All（三组合流）— 把控人主持线上 E2E 9 步 + 录 Demo

> 这是 M-IV-2 的核心，**必须在公网 URL 上跑**，把控人主持、三组在场，全程录屏。录屏即 Demo 素材。E2E 跑通等于一次性证明"线上真能用"。

| 步 | 操作 | 通过标准 |
|----|------|----------|
| E1 | 重置状态 → 开公网 URL | 页面加载，三栏正常 |
| E2 | "研究 BTW 值不值得买" | 5+ Agent 并发亮起、各自返回、Chief 综合 |
| E3 | "我买了100个成本0.09，组合5万" | 右栏仓位 + draft 计划 + 数字动画 |
| E4 | 点"刷新全部 Agent" | Bitget 5 Skill 再跑，来源数增加 |
| E5 | "确认计划" | draft → active |
| E6 | "能加仓吗" | 加仓建议卡片 |
| E7 | "卖30%" | 卖出建议（底仓保护） |
| E8 | 全程看 Trace + Chief 调度日志 | 实时累积，并发观感明显 |
| E9 | 全程检查诚实性 | 主观字段"待补充"，Bitget Skill 显形 ≥1 次 |

**E2E 通过定义**：9 步线上无报错 + 多 Agent 并发观感成立 + Bitget 显形 + 主观字段诚实。
**录制要求**：一次连续会话内跑完（绕开 KV 冷启动），录屏剪到 ≤3 分钟，回填到 A-IV-2 的 Demo video 链接。

---

## 4. 执行顺序与依赖（关键路径）

```
C-IV-1 git 收口 ──┐
C-IV-2 密钥复查    ├─→ C-IV-3 线上探活（确认 A/B 可上）
                  │            │
                  │   ┌────────┴────────┐
                  │   ↓                 ↓
                  │  A-IV-1 线上复跑   B-IV-1~5 浏览器复验（截图）
                  │  A-IV-3 说明终稿       │
                  │  A-IV-4 降级复核       │
                  └───────────┬───────────┘
                              ↓
                  【M-IV-1 收尾做实达成：git 净 + 说明终稿 + 前端实证】
                              ↓
              把控人主持线上 E2E 9 步（三组在场）+ 全程录屏
                              ↓
                  【M-IV-2 终审与录制达成】
                              ↓
        录屏剪 ≤3min → 回填 A-IV-2 Demo video 链接 → 提交表单
                              ↓
                  【M-IV-3 提交完成】
```

**关键路径瓶颈**：C-IV-3 探活是 A/B 的前置（确认线上没退化才开工）；A-IV-2 的 Demo video 链接是 E2E 录制的下游，必须 E2E 跑完才能回填——所以 A 组先把另两个链接填了，video 留到最后。

---

## 5. 测试与自测要点（每组先自测，把控人再交叉复核）

> **本阶段最重要的纪律：一切"完成"都要有可复跑的证据，把控人不信口头"done"。** 下面三组各自的自测表，做完把证据贴进你那份任务汇报。

### C 组自测（TC-IV）

| 编号 | 测什么 | 操作 | 通过标准 |
|------|--------|------|----------|
| TC-IV-1 | git 干净 | `git status` | 输出 `working tree clean` |
| TC-IV-2 | 无密钥 | `git grep -iE "sk-[a-zA-Z0-9]{12,}"` | 输出为空 |
| TC-IV-3 | 线上三路 | `curl` health / `/` / state | 全 200 |
| TC-IV-4 | 录制窗口 | evaluate → 立刻 state | 数据可见，记录耗时 |

### A 组自测（TA-IV）

| 编号 | 测什么 | 操作 | 通过标准 |
|------|--------|------|----------|
| TA-IV-1 | 线上真分类 | `curl /api/chat -d '{"message":"研究BTW"}'` | `degraded=false`，intent 正确 |
| TA-IV-2 | 真综合 | 看 reply 字段 | 自然语言，非模板拼接 |
| TA-IV-3 | 说明无残留 | `grep -iE "千问|qwen" 提交-Project-Description.md` | 输出为空 |
| TA-IV-4 | 表单填满 | 看 §4 | 无 `____`（video 可标"待 E2E 回填"）|

### B 组自测（TB-IV）

| 编号 | 测什么 | 操作 | 通过标准 |
|------|--------|------|----------|
| TB-IV-1 | 线上连接 | 浏览器开公网页 | "已连接"，Console 无 error，**截图** |
| TB-IV-2 | 委员会冒泡 | 输入"研究 BTW" | 7 Agent 独立冒泡，**截图** |
| TB-IV-3 | 诚实标注 | 看 BTW 卡片 | 空字段灰标"待补充"，**截图** |

---

## 6. 防止重蹈覆辙：本阶段强制审查纪律

> 上一轮翻车的根因是"报告说 done，实测不是"（上上轮甚至报告说部署 ok、实测全 404）。Plan-IV 把审查纪律前置、写死，每个人交付前自己先按这条过一遍：

1. **声称必须可复跑**：说"线上 ok"就附 `curl` 的 HTTP 码；说"degraded=false"就附那次响应的字段；说"前端正常"就附**公网 URL 的截图**——不收"预期无 error""代码审查显示"。
2. **线上和本地分开留档**：线上响应单独存（命名带 `online`），别和本地混为一谈。
3. **截图要看得见地址栏**：B 组所有截图必须能看到 `decision-brain-gray.vercel.app`，证明是公网不是 `localhost`。
4. **逐文件 commit**：C 组只 add 该 add 的文件，commit 前 `git status` 复核，绝不 `git add .`。
5. **不假造字段**：前端只渲染后端真返回的字段，缺就显示"待补充"，不编。
6. **把控人复核机制**：每组交完自己的任务汇报后，把控人会**亲手复跑你的关键声称**（不是看你的报告）。复跑对不上，打回重做。所以你自己交之前，先假设把控人会重打一遍——确保打得出来。

---

## 7. 把控人终审清单（Plan-IV，13 项全绿才提交）

- [ ] `源代码` `git status` 干净（`.gitignore` 已提交）
- [ ] `git grep` 无明文密钥，`.env`/`.vercel`/`node_modules` 未进 git
- [ ] 线上 `/api/health`、`/`、`/api/state` 全 200（把控人现场复跑）
- [ ] 线上 `/api/chat` `degraded=false`、结构对齐 v2 §3（把控人现场复跑）
- [ ] B 组 5 张公网 URL 截图齐（连接 / 冒泡 / 资产 / 待补充 / 模式标）
- [ ] 提交说明无"千问/Qwen"，DeepSeek 信息正确
- [ ] 提交说明 Bitget 5 Skill 名字写全
- [ ] 线上 E2E 9 步全过（把控人主持、公网 URL、三组在场）
- [ ] 多 Agent 并发观感成立 + Bitget 5 Skill 显形 ≥1 次
- [ ] 主观字段诚实"待补充"
- [ ] Demo 录屏完成、剪到 ≤3 分钟
- [ ] 提交表单 Demo URL / GitHub / 录屏 三链接填齐（无占位符）
- [ ] 正式提交，留存提交回执/截图

---

## 8. 关键命令速查

```bash
# C-IV-1 git 收口（只提交 .gitignore 一个文件）
cd "/Users/jasoncong/Desktop/Decision Brain/源代码"
git add .gitignore
git commit -m "chore: gitignore 补充 .env*.local"
git push
git status                       # 必须 working tree clean

# C-IV-2 密钥复查
git grep -iE "sk-[a-zA-Z0-9]{12,}"   # 期望：空

# C-IV-3 / TA-IV-1 线上探活与真跑
curl -s -o /dev/null -w "%{http_code}\n" https://decision-brain-gray.vercel.app/api/health
curl -s -o /dev/null -w "%{http_code}\n" https://decision-brain-gray.vercel.app/
curl -s -o /dev/null -w "%{http_code}\n" https://decision-brain-gray.vercel.app/api/state
curl -s https://decision-brain-gray.vercel.app/api/chat \
     -H "Content-Type: application/json" \
     -d '{"message":"研究BTW"}'

# A-IV-3 说明残留复查
grep -inE "千问|qwen" "/Users/jasoncong/Desktop/Decision Brain/plan/提交-Project-Description.md"  # 期望：空
```

---

> Plan-IV 为第四阶段唯一权威依据。核心是把 Plan-III"线上做实但没收尾"的状态收口：先 C 组 git 收口 + 探活，再 A/B 各自做实并留证据，最后把控人主持线上 E2E 9 步并录 Demo、填表单、提交。接口契约以 v2 文档 §3 为准，红线沿用全程不变。
