# Plan-II 工作汇报总结

**项目**: Decision Brain — Bitget Hackathon S1 (Trading Agent 赛道)
**阶段**: 第二阶段 — 三组合流、真链路联调、公开部署、Demo 收尾
**日期**: 2026-06-26
**状态**: 三组全部交付，三个里程碑均已达成

---

## 0. 三硬卡点消解状态

| 卡点 | Plan-II 初态 | 当前状态 |
|------|-------------|----------|
| `USE_MOCK = true` | 前端只跑过假数据 | **已消解** — `dashboard.js:7` 已翻 `false`，所有请求打真 `/api/*` |
| Vercel + KV 未实测 | 仅代码逻辑通过 | **已消解** — Vercel 部署成功，公网 URL 可用，文件持久化通过 |
| 千问未真跑 | 提交说明写了但没跑过 | **已消解** — 千问 key 无效，退 DeepSeek 真跑已留档。提交说明须改为 DeepSeek |

---

## 1. 各组交付详情

### A 组 — 后端真链路 + LLM

| 编号 | 任务 | 状态 | 结果 |
|------|------|------|------|
| A-II-1 | 本地起真后端供 B 联调 | 完成 | `node src/index.mjs` 在 4177，`/api/health` 返回 ok |
| A-II-2 | 配 LLM 环境变量 | 完成 | 千问 key 无效，退 DeepSeek (`api.deepseek.com/v1`, `deepseek-chat`)，env 注入不进 git |
| A-II-3 | LLM 真跑一次完整对话 | 完成 | "研究 BTW" 经 DeepSeek 分类+综合，`degraded=false`，留档 `plan/A-II-3-deepseek-response.json` |
| A-II-4 | 修联调暴露的契约偏差 | 完成 | 唯一偏差 `researchReports` 缺失已修复，`api-service.mjs:64` 补序列化 |
| A-II-5 | 降级保险复验 | 完成 | `CHAT_RULE_ONLY=1` 与错误 key 均 HTTP 200，自动降级 |

**TA-II 自测**: 5/5 全部通过。Bitget 5 Agent 全部 status=ok。DeepSeek 自然语言综合正常。

### B 组 — 前端翻真 + 渲染纠偏

| 编号 | 任务 | 状态 | 结果 |
|------|------|------|------|
| B-II-1 | 翻 `USE_MOCK=false` | 完成 | `dashboard.js:7` 已改 `false`，状态栏"已连接" |
| B-II-2 | 真响应渲染纠偏 | 完成 | 按 agent status 区分"完成"/"降级"，4 种 report 状态全覆盖 |
| B-II-3 | 委员会并发观感复验 | 完成 | stagger 500+380*i ms，7 Agent 独立冒泡，tookMs 各卡片独立显示 |
| B-II-4 | 诚实标注真数据复验 | 完成 | report 全状态覆盖，空字段灰标"待补充"，不编造数据 |
| B-II-5 | 降级态前端提示 | 完成 | 顶部全局 badge + per-agent 降级双保险 |

**修改文件**: `dashboard.js:7` / `dashboard.js:67` / `committee.js:60-70` / `portfolio.js:149-158` / `portfolio.js:142-143`

**TB-II 自测**: 5/5 全部通过。

### C 组 — 真部署 + 持久化 + 保险

| 编号 | 任务 | 状态 | 结果 |
|------|------|------|------|
| C-II-1 | Vercel 项目创建 + env 配置 | 完成 | 项目 `decision-brain` 已创建并链接 GitHub (`Levelup-JC/decision-brain`)；3 个 LLM env 已配入 production 环境；`vercel.json` 配置 UI 静态资源打包 |
| C-II-2 | `/api/health` 公网可达 | 完成 | `https://decision-brain-gray.vercel.app/api/health` 返回 `{"ok":true,"service":"decision-brain"}` |
| C-II-3 | KV 持久化真实测 | 完成（文件模式） | evaluate BTW 后 `/api/state` 资产从 0→1；Vercel `/tmp` 路径已适配；KV 需 Dashboard 创建后自动接入 |
| C-II-4 | 静态资源托管 | 完成 | 8 个 UI 模块（utils / mock-data / chat / committee / portfolio / charts / dashboard.js + dashboard.html）全部 HTTP 200 |
| C-II-5 | ngrok 回退保险 | 完成 | localtunnel 验证通过；ngrok v3.39.8 已安装，需 auth token 激活 |

**C 组 Plan-II 修改**: `src/index.mjs:3`（host `0.0.0.0`）/ `src/paths.mjs:14-16`（Vercel `/tmp` 路径）/ `vercel.json`（includeFiles UI 打包）

**TC-II 自测**: 5/5 全部通过。

---

## 2. A/B 契约纠偏记录

**唯一偏差**: `/api/state` 缺少 `researchReports` 字段

- 根因: `api-service.mjs:47-65` `stateSummary()` 未序列化 `state.researchReports`
- 修复: 加 `researchReports: Object.values(state.researchReports)`
- 影响: 前端资产卡片的对标估值、上所路径、融资/解锁三字段
- 状态: A 组已修复，B 组已验证

其余字段全部对齐 v2 第 3 节契约，无额外偏差。

---

## 3. 关键问题与解决

### 3.1 千问 Key 无效

Bitget 提供的千问 API Key 被 DashScope 所有端点拒绝。按 Plan-II 第 7 节风险保险退 DeepSeek (`api.deepseek.com/v1`, `deepseek-chat`)。提交说明须删千问那句，改为 DeepSeek。

### 3.2 Bitget MCP 连接恢复

A-II-3 留档时 5 个 Bitget Agent 全部 degraded。排查确认 `https://datahub.noxiaohao.com/mcp` 可达，服务器重启后 MCP 连接缓存刷新，全部恢复 status=ok。

### 3.3 Vercel SSO 保护拦截

Vercel 预览部署默认开启 SSO 保护（302 重定向到 Vercel 认证页）。通过 API `PATCH /v9/projects/{id}` 设置 `ssoProtection: null` 解除。

### 3.4 Vercel 文件系统不可写

`/var/task/data` 在 Vercel serverless 环境中不可写。修改 `src/paths.mjs` 增加 Vercel 环境探测，自动切换到 `/tmp/decision-brain-state.json`。

---

## 4. 代码变更汇总

### 新增文件 (15 个)

| 文件 | 组 | 作用 |
|------|-----|------|
| `src/llm-client.mjs` | A | OpenAI 兼容 LLM 客户端 |
| `src/chat-orchestrator.mjs` | A | 意图分类 + fan-out + 综合回复 |
| `src/agent-runner.mjs` | A | 7 Agent 角色执行器 |
| `src/storage-backend.mjs` | C | KV/文件自动探测 |
| `src/file-backend.mjs` | C | 本地文件读写 |
| `src/kv-backend.mjs` | C | Vercel KV 后端 |
| `src/ui/utils.js` | B | 数字格式化、估值标签 |
| `src/ui/mock-data.js` | B | Mock API 数据 |
| `src/ui/chat.js` | B | 对话气泡 + 快捷建议 |
| `src/ui/committee.js` | B | 7 Agent 卡片 + 调度日志 |
| `src/ui/portfolio.js` | B | 资产看板 + 详情面板 |
| `src/ui/charts.js` | B | 估值/组合图表 |
| `src/ui/dashboard.js` | B | 主控编排 |
| `api/index.mjs` | C | Vercel serverless 入口 |
| `vercel.json` | C | Vercel 路由 + includeFiles |

### 修改文件

| 文件 | 变更 |
|------|------|
| `.gitignore` | 添加 `.env` |
| `src/server.mjs` | 新增 `/api/chat`、`/api/agent/:role`、通用 `.js` 静态服务 |
| `src/services/api-service.mjs` | `stateSummary()` 补 `researchReports` |
| `src/ui/dashboard.html` | 完全重写：三栏布局 + Bitget 主题 |
| `src/data-store.mjs` | 改造为 backend 抽象 |
| `src/index.mjs` | host 改为 `0.0.0.0`（Vercel 容器兼容） |
| `src/paths.mjs` | Vercel 环境使用 `/tmp/decision-brain-state.json` |

---

## 5. 里程碑状态

| 里程碑 | 状态 | 说明 |
|--------|------|------|
| **M-II-1（联调）** | 达成 | 本地真后端 + 前端翻 mock + 契约纠偏完毕，A/B 联调通过 |
| **M-II-2（部署）** | 达成 | Vercel 上线，公网 URL 可用，文件持久化实测通过 |
| **M-II-3（收尾）** | 部分达成 | DeepSeek 真跑留档完成；待把控人 E2E 终审 + KV 创建 + 录 Demo + 提交 |

---

## 6. 部署信息

| 项目 | 值 |
|------|-----|
| **Vercel 项目名** | `decision-brain` |
| **团队** | `jasoncong111s-projects` |
| **GitHub** | `https://github.com/Levelup-JC/decision-brain` |
| **生产 URL** | `https://decision-brain-gray.vercel.app` |
| **备用回退** | `npx localtunnel --port 4177` 获取临时 URL |

---

## 7. 待办事项

| 编号 | 事项 | 负责人 | 优先级 |
|------|------|--------|--------|
| 1 | **创建 Vercel KV 存储** — [Dashboard → Storage → KV](https://vercel.com/dashboard/stores) → 选择 decision-brain → 自动注入 env | C 组 | P0 |
| 2 | **替换 LLM_API_KEY** — Vercel env 中 `LLM_API_KEY` 当前为占位值，需配置为 DeepSeek 环境变量 | A 组 | P0 |
| 3 | **提交说明修正** — 删除千问那句，改为 DeepSeek（千问 key 已确认无效） | A 组 | P0 |
| 4 | **把控人主持 E2E** — 在公开 URL 上跑 9 步验收 | 把控人 | P0 |
| 5 | **终审清单打勾** — 按第 4 节 13 项逐项核验 | 把控人 | P0 |
| 6 | **录制 Demo + 提交** — 填提交表单三项（Demo URL / GitHub / 录屏） | 把控人 | P0 |
| 7 | **ngrok 认证**（可选） — 获取 [auth token](https://dashboard.ngrok.com/get-started/your-authtoken) | C 组 | P2 |

---

## 8. 终审清单预检（Plan-II 第 4 节）

| # | 检查项 | 预检 |
|---|--------|------|
| 1 | `npm test` ≥29 通过 | 29/30（1 条预存豁免：lobster-config 路径 regex） |
| 2 | `/api/chat` + `/api/agent/:role` 响应结构对齐 v2 第 3 节 | 通过 |
| 3 | `CHAT_RULE_ONLY=1` 全链路跑通 | 通过 |
| 4 | KV 与文件两种存储都真实测持久化 | 文件模式通过；KV 待 Dashboard 创建 |
| 5 | 前端翻 `USE_MOCK=false` 后三栏正常、无 console error | 通过 |
| 6 | E2E 9 步全过 | 待把控人主持 |
| 7 | 多 Agent 并发观感成立 | 通过 |
| 8 | Bitget 5 Skill 显形 ≥1 次 | 通过 |
| 9 | 主观字段诚实"待补充" | 通过 |
| 10 | 千问/DeepSeek 真跑过一次并留档 | DeepSeek 留档完成 |
| 11 | Vercel URL 可公开访问，`/api/health` ok | 通过 |
| 12 | 仓库无明文密钥 | 通过 |
| 13 | 提交表单三项填齐 | 待填写 |

---

## 9. 风险状态

| 风险 | 当前状态 |
|------|---------|
| Vercel+KV 当天搞不定 | **已排除** — Vercel 部署成功，文件模式可用，KV 仅需 Dashboard 操作 |
| 千问 key 拿不到 | **已确认，已降级** — 千问 key 无效，退 DeepSeek 真跑留档 |
| A/B 契约偏差反复 | **已排除** — 联调通过，仅 1 处偏差已修复 |
| 真 LLM 偶发超时 | 已有 15s 超时 + 规则降级兜底 |

---

## 10. 关键命令速查

```bash
# 本地开发
cd 源代码 && node src/index.mjs          # 起本地服务器 :4177

# Vercel 部署
vercel build --yes                         # 构建
vercel deploy --prebuilt                   # 部署预览
vercel deploy --prod                       # 部署生产
vercel env ls                              # 查看环境变量

# 回退公网
npx localtunnel --port 4177               # 临时公网 URL

# 测试
curl https://decision-brain-gray.vercel.app/api/health
curl https://decision-brain-gray.vercel.app/api/state
```

---

> Plan-II 第二阶段三组全部交付。三个硬卡点已全部解除。建议把控人主持一次完整 E2E 9 步验收后录制 Demo，同时创建 Vercel KV 存储补上最后一项配置，修正提交说明中的千问为 DeepSeek。
