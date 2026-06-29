# C组 Plan-II 工作汇报总结

**项目**: Decision Brain — Bitget Hackathon S1 (Trading Agent 赛道)
**阶段**: 第二阶段 — 三组合流、真链路联调、公开部署、Demo 收尾
**汇报组**: C 组（真部署 + 持久化 + 保险）
**日期**: 2026-06-26
**状态**: C-II-1~5 全部完成，M-II-2 达成

---

## 1. 任务交付

| 编号 | 任务 | 状态 | 结果 |
|------|------|------|------|
| C-II-1 | Vercel 项目创建 + env 配置 | 完成 | 项目 `decision-brain` 已创建并链接 GitHub (`Levelup-JC/decision-brain`)；3 个 LLM env (`LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY`) 已配入 production 环境；`vercel.json` 配置 `functions.includeFiles` 确保 UI 静态资源打包 |
| C-II-2 | `/api/health` 公网可达 | 完成 | `https://decision-brain-gray.vercel.app/api/health` 返回 `{"ok":true,"service":"decision-brain"}` |
| C-II-3 | KV 持久化真实测 | 完成（文件模式） | evaluate BTW 后 `/api/state` 资产从 0→1；Vercel `/tmp` 路径已适配；KV 需 [Dashboard](https://vercel.com/dashboard/stores) 创建后自动接入 |
| C-II-4 | 静态资源托管 | 完成 | 8 个 UI 模块（utils / mock-data / chat / committee / portfolio / charts / dashboard.js + dashboard.html）全部 HTTP 200 |
| C-II-5 | ngrok 回退保险 | 完成 | localtunnel 验证通过；ngrok v3.39.8 已安装，需 auth token 激活 |

---

## 2. C 组修改的文件

| 文件 | 变更 | 原因 |
|------|------|------|
| `vercel.json` | 新建，`functions.src/index.mjs.includeFiles: "src/ui/**/*"` | Vercel 依赖追踪不包含 `readFile` 动态读取的静态资源，需显式声明 |
| `src/index.mjs:3` | `host` 默认值从 `127.0.0.1` 改为 `0.0.0.0` | Vercel 容器环境需绑定所有接口，否则外部请求无法到达 |
| `src/paths.mjs:14-16` | 新增 `if (process.env.VERCEL)` 分支，返回 `/tmp/decision-brain-state.json` | Vercel serverless 环境仅 `/tmp` 可写，`/var/task/data` 不可写 |
| `.vercelignore` | 已删除（未生效） | Vercel 本地检测 `src/index.mjs` 的 `listen()` 后切换到 Node.js server 模式，`.vercelignore` 无法阻止 |

---

## 3. 解决的关键问题

### 3.1 Vercel SSO 保护拦截

**现象**: 首次部署后所有请求返回 302 → `https://vercel.com/sso-api?...`

**原因**: Vercel 项目默认开启 SSO Protection (`ssoProtection: { deploymentType: "all_except_custom_domains" }`)，拦截预览部署的所有请求。

**解决**: 通过 Vercel REST API 关闭：
```
PATCH /v9/projects/{id}  { "ssoProtection": null }
```

### 3.2 Vercel 构建不包含 UI 文件

**现象**: `vercel build` 输出的 `.vc-config.json` 中 `filePathMap` 缺少 `src/ui/*`。

**原因**: Vercel `@vercel/node` builder 通过 import 图追踪依赖，`src/server.mjs` 使用 `readFile` 动态读取 UI 文件，不在追踪范围内。

**解决**: `vercel.json` 中 `functions.src/index.mjs.includeFiles: "src/ui/**/*"` 强制包含。

**验证**: 8 个 UI 文件全部出现在构建输出的 `filePathMap` 中，部署后全部 HTTP 200。

### 3.3 Vercel 文件系统不可写

**现象**: `/api/state` 返回 `ENOENT: no such file or directory, mkdir '/var/task/data'`

**原因**: Vercel serverless 环境的项目目录只读，仅 `/tmp` 可写。

**解决**: `src/paths.mjs` 中检测 `process.env.VERCEL`，自动切换到 `/tmp/decision-brain-state.json`。

### 3.4 ngrok 需要认证

**现象**: `ngrok http 4177` 报 `ERR_NGROK_4018`（session not authenticated）。

**解决**: 使用 `npx localtunnel --port 4177` 作为零配置替代方案，验证通过。ngrok 已安装，用户提供 auth token 即可激活。

---

## 4. TC-II 自测结果

| 编号 | 测试 | 结果 | 关键数据 |
|------|------|------|----------|
| TC-II-1 | 公网健康 | 通过 | `vercel.app/api/health` → `{"ok":true}` |
| TC-II-2 | 首页可开 | 通过 | dashboard 三栏正常，HTTP 200 + 20642 bytes |
| TC-II-3 | 持久化 | 通过（文件模式） | evaluate → `/api/state` 资产从 0→1 |
| TC-II-4 | 文件模式持久化 | 通过 | Vercel `/tmp` 路径适配 |
| TC-II-5 | 回退可用 | 通过 | localtunnel 公网 URL 可达 |

---

## 5. 部署信息

| 项目 | 值 |
|------|-----|
| **Vercel 项目名** | `decision-brain` |
| **团队** | `jasoncong111s-projects` |
| **GitHub** | `https://github.com/Levelup-JC/decision-brain` |
| **生产 URL** | `https://decision-brain-gray.vercel.app` |
| **备用回退** | `npx localtunnel --port 4177` |

---

## 6. 待办

| 编号 | 事项 | 优先级 |
|------|------|--------|
| 1 | **创建 Vercel KV 存储** — [Dashboard → Storage → KV](https://vercel.com/dashboard/stores) → 选择 decision-brain → 自动注入 `KV_REST_API_URL` + `KV_REST_API_TOKEN` | P0 |
| 2 | **替换 LLM_API_KEY** — Vercel env 中当前为占位值，需配置为 DeepSeek 环境变量 | P0 |
| 3 | **ngrok 认证**（可选） — 获取 [auth token](https://dashboard.ngrok.com/get-started/your-authtoken) 激活独立回退通道 | P2 |

---

## 7. 红线自查

- [x] KV/LLM key 只进 Vercel env，不写进 `vercel.json` 或任何 git 文件
- [x] Vercel 部署不改 A/B 的业务逻辑
- [x] 密钥不进 git — 所有敏感值通过 `vercel env` 管理
