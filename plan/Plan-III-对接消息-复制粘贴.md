# Plan-III 对接消息 - 复制粘贴版

配套文档：`Plan-III-固化交付与上线作战计划.md`（同目录）
用法：把下面对应的段落直接复制发给对应的人，并告诉他们去看 Plan-III 文档里属于自己的章节。

---

## 谁对接什么（一句话分工 + 顺序）

| 组 | 负责人 | 本阶段对接内容 | 看 Plan-III 哪几节 | 何时启动 |
|----|--------|---------------|-------------------|---------|
| **C** | （填名字） | git 固化 push + Vercel 重新部署 + KV 创建 | §3 C组 / §4 TC-III / §8 命令 | **最先**（关键路径起点） |
| **A** | （填名字） | DeepSeek 环境变量配置 + 线上 LLM 留档 + 改提交说明 | §3 A组 / §4 TA-III | 等 C-III-3 部署做实后 |
| **B** | （填名字） | 线上前端复验（连接/委员会/诚实标注/降级） | §3 B组 / §4 TB-III | 等 C-III-3 部署做实后 |
| **把控人** | 你 | 线上 E2E 9 步 + 终审 + 录 Demo + 填表单 | §4 E2E / §6 终审清单 | 三组合流后 |

> 核心顺序：**C 先固化并部署做实 → A/B 并行线上复验 → 你主持 E2E 收尾**。不要并行启动，C 没把线上 404 修好，A/B 的线上复验全都打不开页面。

---

## 复制段 0 —— 发给所有人（总群公告）

各位，Plan-II 三组代码我验过了，本地都真、都能跑，但有两个收尾硬伤被报告盖住了，Plan-III 就专门解这两个：

1. Plan-II 写的所有新代码（后端编排、6 个 UI 模块、vercel.json）**根本没进 git**，全是未跟踪文件。Vercel 从 GitHub 拉的还是旧代码，所以现在线上 URL 全路径 404。
2. 提交表单的 Demo URL 现状打不开。

Plan-III 一句话目标：把"本地真、线上虚"扭成"进了 git、公网真能开、录得下来、交得出去"。

顺序是串的，别抢跑：
- C 组先做——把代码 commit+push、Vercel 重新部署、建 KV。这是关键路径起点。
- C 部署做实（线上 /api/health 不再 404）之后，A 组注入环境变量、B 组线上复验，并行。
- 三组都绿了我来主持线上 E2E 9 步、录 Demo、填表单。

红线不变：不假造数据、不碰交易和私钥、密钥不进 git、不改契约只改代码。
交付回来我按 Plan-III §6 终审清单逐条验。

---

## 复制段 1 —— 单独发给 C 组（关键路径起点，先动）

你是这阶段的起点，A/B 都等你。打开 Plan-III 文档看 §3 C组、§4 TC-III、§8 命令速查。

你的 5 个任务（C-III-1 到 C-III-5）：

1. **git 固化**（最关键）——把 Plan-II 所有新文件 commit + push 到 `Levelup-JC/decision-brain`。
   - 用 §8 给的逐文件 `git add` 命令，**绝对不要 `git add .`**。
   - commit 前必须 `git status` 复核：确认 `node_modules/`、`.env`、`.vercel/` 没被加进去。
   - commit message 用 `feat: Plan-II 真链路联调 + Vercel 部署适配`。
2. **密钥复查**——`git grep -iE "sk-[a-zA-Z0-9]{10,}"` 必须为空，确认 `.env` 在 `.gitignore` 且未跟踪。
3. **Vercel 重新部署**——push 完触发 production 部署，build 无 error。
4. **静态资源线上可达**——线上 `/`、`/dashboard.js`、8 个 UI 模块全 200。
5. **建 KV + 持久化实测**——Dashboard 建 KV 自动注入 env，evaluate 一个资产 → 冷启动/重新部署 → `/api/state` 资产仍在。

**你的检验目标（达标才算完）**：
- `git status` 干净，无业务文件未跟踪，无密钥泄漏
- `curl https://decision-brain-gray.vercel.app/api/health` 返回 `{"ok":true}` —— **不再 404**，这是你这阶段最硬的一条
- 线上 `/` 三栏页面能打开，无 404
- KV 建好，evaluate 后冷启动数据不丢

风险提示：之前 commit 历史显示 push 卡过 workflow token scope，如果 push 报权限错，看 §7 风险表的处理。Vercel 重新部署后还 404 的话，排查 `api/index.mjs` 入口和 `vercel.json` 路由是否匹配，兜底用 `npx localtunnel --port 4177`。

部署做实（health 不再 404）后立刻通知 A 和 B 启动。

---

## 复制段 2 —— 单独发给 A 组（等 C 部署做实后动）

等 C 组通知"线上 health 不再 404"你再开工。打开 Plan-III 看 §3 A组、§4 TA-III。

你的 4 个任务（A-III-1 到 A-III-4）：

1. **配置 DeepSeek 环境变量**——Vercel env 里 `LLM_API_KEY` 现在是占位值，通过 Vercel 环境变量配置。只进 env，绝不进 git。
2. **线上 LLM 真跑留档**——线上 `curl {url}/api/chat -d '{"message":"研究BTW"}'`，确认 `degraded=false`、intent 正确、agentResults 非空，存一份**线上**响应 JSON（跟本地那份 `A-II-3` 区分开）。
3. **改提交说明**——`提交-Project-Description.md` 里把"千问/Qwen"那句删掉，改成 DeepSeek（`api.deepseek.com/v1`, `deepseek-chat`）。千问 key 已确认无效，写它就是造假。
4. **线上降级复验**——误填错 key 或 `CHAT_RULE_ONLY` 场景，线上仍 HTTP 200 自动降级，不 500。

**你的检验目标（达标才算完）**：
- 线上 `/api/chat` 真响应 `degraded=false`，reply 是自然语言综合不是模板拼接
- 线上响应 JSON 已留档
- 提交说明里再无"千问"字样，已改 DeepSeek
- 降级场景线上不 500

红线：提交说明点名什么模型，就必须真跑过那个模型并留档。

---

## 复制段 3 —— 单独发给 B 组（等 C 部署做实后动）

等 C 组通知"线上页面能打开"你再开工。这次不是本地，是在**公网 URL** 上复验。打开 Plan-III 看 §3 B组、§4 TB-III。

你的 5 个任务（B-III-1 到 B-III-5）：

1. **线上真连接**——公网 URL 开页面，顶部"已连接"，无 console error。
2. **线上委员会冒泡**——输入"研究 BTW"，7 个 Agent 卡片独立 loading + 各自 tookMs，不是一次性刷出来。
3. **线上资产看板**——evaluate 后右栏资产数变化 + count-up 动画。
4. **线上诚实标注**——主观字段空时灰标"待补充"，没有 null/undefined。
5. **线上降级提示**——后端降级时顶部"规则模式"小标，功能不挂。

**你的检验目标（达标才算完）**：
- 公网页面三栏正常、F12 控制台无 error
- 7 Agent 在线上仍是并发独立冒泡的观感（这是多 Agent 作战室的灵魂）
- 主观字段诚实"待补充"，前端不编后端没给的数据

红线：不为了好看在前端假造后端没返回的字段。

---

## 复制段 4 —— 你（把控人）自己的收尾清单

三组都绿了之后你来收尾，按 Plan-III §4 E2E + §6 终审：

1. **主持线上 E2E 9 步**（E1–E9，在公网 URL 上跑，不是本地）：从"研究 BTW"到加仓、卖出全链路，确认多 Agent 并发观感 + Bitget 5 Skill 显形 ≥1 次 + 主观字段诚实。
2. **过 §6 终审清单 13 项**——逐条打勾，重点是线上 health 不再 404、KV 持久化、提交说明已改 DeepSeek、无密钥泄漏。
3. **录 Demo**——在公网 URL 上录一遍 E2E。
4. **填提交表单三项**——Demo URL / GitHub / 录屏。

到这里 M-III-3 提交完成，Plan-III 收官。
