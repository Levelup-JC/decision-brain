# Plan-III 固化交付与上线作战计划

**项目**: Decision Brain — Bitget Hackathon S1 (Trading Agent 赛道)
**阶段**: 第三阶段 — 成果固化、部署做实、收尾提交
**指挥**: 把控人
**日期**: 2026-06-26
**前置**: Plan-II 三组代码已交付且本地联调通过（M-II-1 达成），但 M-II-2 部署为虚、M-II-3 收尾未动

---

## 0. 把控人验证结论（Plan-III 起点）

对三组报告做了真实核对，结论如下：

| 维度 | 报告声称 | 实测 | 判定 |
|------|---------|------|------|
| A 后端 + DeepSeek | 真跑、留档、29/30 测试 | 本地 health/state 正常，DeepSeek JSON 真实，`npm test` 30 跑 29 过 1 挂（lobster 路径豁免） | 属实 |
| B 前端翻真 | `USE_MOCK=false`、UI 齐 | `dashboard.js:7=false`，8 模块根路径全 200 | 属实 |
| C Vercel 部署 | 公网 `/api/health` ok | **线上全路径 404 NOT_FOUND** | 代码真，部署挂 |

### 两个硬卡点（本阶段必须先解）

1. **Plan-II 成果全部未进 git** —— `api/`、`chat-orchestrator.mjs`、6 个 UI 模块、`vercel.json` 等全是未跟踪文件，10 个改动文件未 commit。Vercel 从 GitHub 拉的是旧代码，这是线上 404 的根因，也是成果丢失的最大风险。
2. **线上 Demo 实际不可用** —— `decision-brain-gray.vercel.app` 全路由 404，提交表单的 Demo URL 不能用现状。

### 仍遗留的 Plan-II 待办（已诚实列出，未完成）

- Vercel KV 未创建（当前文件模式 `/tmp`，冷启动会丢）
- Vercel `LLM_API_KEY` 仍是占位值，未替换 DeepSeek 环境变量
- E2E 9 步把控人从未主持
- Demo 未录、提交表单未填
- 提交说明仍写"千问"，需改 DeepSeek

---

## 1. 本阶段唯一目标

把 Plan-II"本地能跑但线上是虚的"成果，变成**一条进了 git、公网真可访问、录得下来、提交得出去**的可信交付。

里程碑节奏：

- **M-III-1（固化）**：所有 Plan-II 代码 commit + push 到 `Levelup-JC/decision-brain`，git 工作区干净，无密钥泄漏。
- **M-III-2（上线做实）**：Vercel 从最新 GitHub 重新部署，公网 `/api/health` + `/` + `/api/chat` 全部真实可达，KV 持久化生效，LLM 环境变量 注入。
- **M-III-3（收尾提交）**：把控人主持 E2E 9 步全过 + 录 Demo + 改提交说明 + 填表单三项。

---

## 2. 任务分工

| 组 | 本阶段职责 | 依赖 |
|----|-----------|------|
| **A** | DeepSeek 环境变量配置 Vercel env、复跑线上 LLM 一次留档、修提交说明 | 依赖 C 部署做实 |
| **B** | 线上环境前端复验（翻 false 后线上三栏正常、无 console error、降级提示） | 依赖 C 部署做实 |
| **C** | git 固化 + Vercel 重新部署 + KV 创建 + 持久化线上实测 | 无（先行，关键路径起点） |
| **All** | 把控人主持线上 E2E 9 步、终审、录 Demo、填表单 | 依赖三组合流 |

**红线不变**（沿用 Plan-II §6）：不假造数据、不碰交易 Tools/私钥、密钥不进 git、不改契约只改代码、不重写后端。

---

## 3. 各组任务卡 + 交付指标

### C 组 — 固化与上线（关键路径起点）

| 编号 | 任务 | 交付指标（达标定义） |
|------|------|---------------------|
| C-III-1 | git 固化 Plan-II 成果 | `git add` 所有 Plan-II 新增/改动文件（**排除 `node_modules/`、`.env`、`.vercel/`**），按 Conventional Commits 提交（`feat: Plan-II 真链路联调 + Vercel 部署适配`），push 到 `Levelup-JC/decision-brain`，`git status` 干净 |
| C-III-2 | 密钥泄漏复查 | `git grep -iE "sk-[a-zA-Z0-9]{10,}"` 空；确认 `.env` 在 `.gitignore` 且未跟踪 |
| C-III-3 | Vercel 从最新 GitHub 重新部署 | 触发 production 部署，build 无 error，部署后 `/api/health` 返回 ok（**不再 404**） |
| C-III-4 | 静态资源线上可达 | 线上 `/`、`/dashboard.js`、8 个 UI 模块全 HTTP 200 |
| C-III-5 | Vercel KV 创建 + 持久化实测 | Dashboard 建 KV → 自动注入 `KV_REST_API_URL`/`KV_REST_API_TOKEN` → evaluate 一个资产 → 重新部署/冷启动 → `/api/state` 资产仍在 |

**C 组红线**：commit 前逐文件核对，绝不把 `node_modules`、`.env`、`.vercel` 推上去。

### A 组 — LLM 上线做实

| 编号 | 任务 | 交付指标 |
|------|------|---------|
| A-III-1 | Vercel 配置 DeepSeek 环境变量 | `vercel env` 中 `LLM_API_KEY` 配置 DeepSeek 环境变量（只进 env，不进 git） |
| A-III-2 | 线上 LLM 真跑一次留档 | 线上 `/api/chat -d '{"message":"研究BTW"}'` → `degraded=false`、intent 正确、agentResults 非空，存一份线上响应 JSON（区别于本地的 `A-II-3`） |
| A-III-3 | 提交说明修正 | 删"千问/Qwen"那句，改为 DeepSeek（`api.deepseek.com/v1`, `deepseek-chat`），更新 `提交-Project-Description.md` |
| A-III-4 | 线上降级保险复验 | 线上误填错 key 或 `CHAT_RULE_ONLY` 场景仍 HTTP 200 自动降级，不 500 |

**A 组红线**：线上那一跑必须真，截图/JSON 留档；提交说明点名什么模型就必须真跑过那个。

### B 组 — 线上前端复验

| 编号 | 任务 | 交付指标 |
|------|------|---------|
| B-III-1 | 线上真连接 | 公网 URL 开页面，顶部"已连接"，无 console error |
| B-III-2 | 线上委员会冒泡 | 输入"研究 BTW"，7 Agent 卡片独立 loading + tookMs，不一次性刷出 |
| B-III-3 | 线上资产看板 | evaluate 后右栏资产数变化 + count-up 动画 |
| B-III-4 | 线上诚实标注 | 主观字段空时灰标"待补充"，无 null/undefined |
| B-III-5 | 线上降级提示 | 后端降级时顶部"规则模式"小标，功能不挂 |

**B 组红线**：不为好看在前端假造后端没给的字段。

---

## 4. 测试指标（每组先自测，再交叉验）

### C 组自测（TC-III）

| 编号 | 测什么 | 操作 | 通过标准 |
|------|--------|------|----------|
| TC-III-1 | git 干净 | `git status` | 无未跟踪业务文件，无密钥 |
| TC-III-2 | 线上健康 | `curl {url}/api/health` | 返回 ok（非 404） |
| TC-III-3 | 线上首页 | 开 `{url}/` | 三栏正常，无 404 |
| TC-III-4 | KV 持久化 | evaluate → 重新部署 → `/api/state` | 资产仍在 |
| TC-III-5 | 回退可用 | localtunnel/ngrok | 出公网 URL 兜底 |

### A 组自测（TA-III）

| 编号 | 测什么 | 操作 | 通过标准 |
|------|--------|------|----------|
| TA-III-1 | 线上真分类 | `curl {url}/api/chat -d '{"message":"研究BTW"}'` | `degraded=false`，intent 正确 |
| TA-III-2 | 线上真综合 | 看 reply 字段 | 自然语言综合，非模板拼接 |
| TA-III-3 | 线上降级兜底 | 触发降级 | HTTP 200，不 500 |

### B 组自测（TB-III）

| 编号 | 测什么 | 操作 | 通过标准 |
|------|--------|------|----------|
| TB-III-1 | 线上连接 | 开公网页面 | "已连接"，无 console error |
| TB-III-2 | 线上委员会 | 输入"研究 BTW" | 7 Agent 独立冒泡 |
| TB-III-3 | 线上诚实标注 | 看 BTW 卡片 | 空字段灰标"待补充" |

### 端到端联合验收（E2E，把控人主持，三组在场，**在公网 URL 上跑**）

沿用 Plan-II §3.4 的 9 步（E1–E9），但这次必须在**线上公网 URL**上跑，不是本地：

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

---

## 5. 执行顺序与依赖（关键路径）

```
C-III-1 git 固化 push ──→ C-III-3 Vercel 重新部署 ──→ C-III-4 静态资源可达
       │                          │
C-III-2 密钥复查 ─────────┘          ↓
                              A-III-1 注入环境变量
                                     │
                  ┌──────────────────┼──────────────────┐
                  ↓                   ↓                  ↓
            A-III-2 线上LLM留档   B-III-1~5 线上复验   C-III-5 KV持久化
                  └──────────────────┼──────────────────┘
                                     ↓
                        【M-III-2 上线做实达成】
                                     ↓
              把控人主持线上 E2E 9 步 + A-III-3 改提交说明
                                     ↓
                        录 Demo + 填提交表单三项
                                     ↓
                          【M-III-3 提交完成】
```

**关键路径瓶颈**：C-III-1 git 固化是一切的前提——不推代码，Vercel 永远拉的是旧代码、永远 404。A/B 的线上复验都必须等 C-III-3 部署做实之后才能开始。

---

## 6. 把控人终审清单（Plan-III）

- [ ] Plan-II 全部代码已 commit + push，`git status` 干净
- [ ] `git grep` 无明文密钥，`.env`/`.vercel`/`node_modules` 未进 git
- [ ] 线上 `/api/health` 返回 ok（**不再 404**）
- [ ] 线上 `/` 三栏正常、无 console error
- [ ] 线上 `/api/chat` 真响应结构对齐 v2 §3，`degraded=false`
- [ ] Vercel KV 创建，持久化线上实测通过
- [ ] Vercel `LLM_API_KEY` 已配置为 DeepSeek 环境变量
- [ ] 线上 DeepSeek 真跑一次并留档
- [ ] 线上 E2E 9 步全过
- [ ] 多 Agent 并发观感成立 + Bitget 5 Skill 显形 ≥1 次
- [ ] 主观字段诚实"待补充"
- [ ] 提交说明已把千问改为 DeepSeek
- [ ] 提交表单 Demo URL / GitHub / 录屏 三项填齐

---

## 7. 风险与保险

| 风险 | 触发 | 保险动作 |
|------|------|----------|
| push 失败（token scope） | 之前 commit 历史显示 workflow token 受限 | C 组用 `.github` workflow 临时移除策略，或确认 token 含 `repo` scope |
| Vercel 重新部署仍 404 | 路由/入口配置问题 | 排查 `api/index.mjs` 与 `vercel.json` 入口是否匹配；本地 `vercel build` 验证 `filePathMap` 含 UI；兜底 localtunnel 出公网 URL |
| KV 当天建不出来 | Dashboard 操作卡住 | 文件模式 `/tmp` 兜底，Demo 录制时一次会话内不冷启动即可 |
| DeepSeek 线上超时 | 网络波动 | 已有 15s 超时 + 规则降级，录制时可重试 |
| 误推 node_modules/.env | git add 范围过大 | C-III-1 逐文件 `git add`，commit 前 `git status` 复核 |

---

## 8. 关键命令速查

```bash
# C-III-1 git 固化（逐项 add，勿用 git add .）
cd 源代码
git add api/ vercel.json src/agent-runner.mjs src/chat-orchestrator.mjs \
        src/file-backend.mjs src/kv-backend.mjs src/llm-client.mjs \
        src/storage-backend.mjs src/ui/*.js \
        .gitignore package.json package-lock.json \
        src/data-store.mjs src/index.mjs src/paths.mjs src/server.mjs \
        src/services/api-service.mjs src/ui/dashboard.html src/ui/dashboard.js
git status                                   # 复核：无 node_modules/.env/.vercel
git commit -m "feat: Plan-II 真链路联调 + Vercel 部署适配"
git push

# C-III-3 重新部署
vercel deploy --prod

# 验证线上（应非 404）
curl https://decision-brain-gray.vercel.app/api/health
curl https://decision-brain-gray.vercel.app/api/state

# 回退兜底
npx localtunnel --port 4177
```

---

> Plan-III 为第三阶段唯一权威依据。核心是把 Plan-II"本地真、线上虚"的状态扭正：先 C 组固化 git 并重新部署做实，再 A/B 线上复验，最后把控人线上 E2E + 录 Demo + 提交。接口契约仍以 v2 文档 §3 为准。
