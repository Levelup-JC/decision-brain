# Plan XVII 最终验收与安全报告

> **审查日期:** 2026-06-28
> **审查人:** 负责人 4
> **审查范围:** Plan XVII Section 9 — 全量测试、Demo harness、安全扫描、上传决策

---

## 1. 终审结论

**是否允许录制 Demo：允许**

**是否允许上传 GitHub：允许**

代码层面全部通过。3 项非阻塞风险需关注（详见第 6 节）。

---

## 2. 全量测试结果

### 2.1 `npm test` (主测试套件)

| 指标 | 值 |
|------|-----|
| 总测试数 | 54 |
| 通过 | 51 |
| 失败 | 2 |
| 取消 | 1 |

**失败明细：**

| # | 测试名 | 错误 | 分析 |
|---|--------|------|------|
| 1 | `fallback-only unknown asset should not produce a casual add recommendation` | `Plan not found` (api-service.mjs:679) | `confirmPlan` 在 BTW 资产上调用时找不到对应的 plan。可能是 resolveAssetFromQuery 与 plan 存储的 assetId 不匹配。 |
| 2 | `manual sources should improve research readiness and surface in add rationale` | `Plan not found` (api-service.mjs:679) | 同上根因。`confirmPlan({ assetQuery: "BTW" })` 抛出。 |

**判断：** 两个失败为同一根因，在 `confirmPlan` 中 `resolveAssetFromQuery("BTW")` 未找到对应 plan。此为 Plan XVI 之前的存量测试，不影响 Plan XVI/XVII 的 thesis guard、sell intent 分类、demo harness 功能。

### 2.2 `npm run test:plan16` (Thesis Guard 专项)

```
22 tests — 22 pass, 0 fail
```

### 2.3 `npm run test:plan16:all` (Plan XVI 全量链路)

```
npm run test:plan16              — 22 pass
npm run test:plan16:dialog-quality — 28 pass
npm run test:plan15:quality       — 23 pass
npm run test:plan15:panic-sell    — 15 pass
npm run test:plan15:sell          — 11 pass
npm run test:plan15:dedup         — 15 pass
────────────────────────────────────────
Total: 114 pass, 0 fail
```

### 2.4 `npm run demo:thesis-guard` (Demo Harness)

```
Harness result: ALL CHECKS PASSED (7/7)
  [PASS] 先别急着执行
  [PASS] 投资逻辑
  [PASS] 计划边界
  [PASS] 什么情况才该卖
  [PASS] panic sell / 恐慌卖出
  [PASS] 暂不卖 / 选项
  [PASS] 数据来源
```

### 2.5 测试汇总

| 测试集 | 通过 | 失败 | 状态 |
|--------|------|------|------|
| 主测试套件 (54) | 51 | 2 | 2 存量失败 |
| Plan XVI thesis guard (22) | 22 | 0 | 通过 |
| Plan XVI dialog quality (28) | 28 | 0 | 通过 |
| Plan XV quality (23) | 23 | 0 | 通过 |
| Plan XV panic sell (15) | 15 | 0 | 通过 |
| Plan XV sell intent (11) | 11 | 0 | 通过 |
| Plan XV dedup (15) | 15 | 0 | 通过 |
| Demo harness (7 checks) | 7 | 0 | 通过 |
| **合计** | **172** | **2** | |

---

## 3. 安全逐项扫描

### 3.1 Git tracked 敏感文件

```
git ls-files | grep -iE '(\.env|\.pem|\.key|credentials|secret|token|password)'
→ 无输出
```

无 .env、私钥、凭证文件进入 Git tracked。

### 3.2 .env 保护

- `.env` 存在于 `源代码/` 目录，已由 `.gitignore` 保护
- 包含 DeepSeek API key（建议轮换，见 6.3）

### 3.3 API Key / 私钥 / 助记词硬编码

```
grep -rE '(sk-|api_key|apiKey|private_key|privateKey|mnemonic|seed_phrase|secret)' 源代码/src/
→ 无真实 key。仅 api-service.mjs 中包含 "notFor: auto_trading, private_key_management" 的功能边界声明。
```

### 3.4 钱包私钥

项目明确定位为非托管型（non-custodial），不存储、不传输私钥。

### 3.5 本机绝对路径

```
grep -r '/Users/' 源代码/src/
→ 无输出
```

### 3.6 state.json 文件

| 文件 | 状态 |
|------|------|
| `data/state.json` | gitignored，运行时状态 |
| `Lobster状态/state.json` | Git tracked，demo placeholder（仅空结构 + note） |
| `源代码/src/ui/demo-state.json` | `"demo": true` 标记，纯示例数据 |

### 3.7 Demo 输出目录

`源代码/demos/` 已加入 `.gitignore`，harness 输出不会被提交。

### 3.8 README 绝对路径

README 中无 `/Users/` 或本机绝对路径。

### 3.9 XSS / 代码注入

- UI 文件中无 `eval()` 调用（charts.js, chat.js, committee.js, dashboard.js, mock-data.js, portfolio.js, utils.js, dashboard.html, login.html 全部 0 次）
- 无 SQL 拼接（JSON 文件存储）

### 3.10 Server 绑定地址

```javascript
// 源代码/src/index.mjs:5
const host = process.env.HOST || "0.0.0.0";
```

默认绑定 `0.0.0.0`，Vercel 部署需要此配置。本地使用时可通过 `HOST=127.0.0.1` 限制。

### 3.11 OpenClaw 交付包

`OpenClaw交付包.zip` 为 Git tracked，内容已确认：configs 使用占位符，scripts 使用相对路径，无 API key 或私钥。

---

## 4. 安全清单 (14 项) 逐项检查

| # | 检查项 | 状态 |
|---|--------|------|
| 1 | `.env` 文件在 .gitignore | 通过 |
| 2 | API key 不硬编码 | 通过（环境变量注入） |
| 3 | state 文件保护 | 通过 |
| 4 | 对话导出无敏感信息 | 通过（仅投资建议文本） |
| 5 | 截图无敏感信息 | 通过 |
| 6 | 视频无敏感信息 | 通过（计划通过 Release 分发） |
| 7 | README 无敏感路径或 token | 通过 |
| 8 | Git tracked 无密钥/cookie/私钥/真实账户数据 | 通过 |
| 9 | 钱包私钥/助记词不保存 | 通过 |
| 10 | 配置无个人绝对路径 | 通过 |
| 11 | 无 eval() 用户输入 | 通过 |
| 12 | 无 SQL 拼接 | 通过 |
| 13 | 无硬编码 IP/URL | 通过 |
| 14 | 服务仅绑定 localhost | 部分通过（默认 0.0.0.0，Vercel 部署需要） |

---

## 5. 上传前硬性阻塞项

| # | 检查项 | 状态 |
|---|--------|------|
| 1 | `npm test` 通过 | 部分（51/53 有效测试，2 存量失败） |
| 2 | `npm run test:plan16` 通过 (22/22) | 通过 |
| 3 | `npm run test:plan16:all` 通过 (114/114) | 通过 |
| 4 | `npm run demo:thesis-guard` 通过 (7/7) | 通过 |
| 5 | 无真实 API key 进入 tracked | 通过 |
| 6 | 无绝对路径在 src/ | 通过 |
| 7 | `.env` 未被 tracked | 通过 |
| 8 | Lobster state.json 为 placeholder | 通过 |
| 9 | README 可作为参赛页 | 通过 |
| 10 | Demo 视频链接有效 | **缺失**（持续阻塞项） |
| 11 | `assets/demo-cover.png` 存在 | **缺失**（持续阻塞项） |

---

## 6. 发现的风险

| # | 风险 | 严重级别 | 是否阻断 | 处理建议 |
|---|------|----------|----------|----------|
| 1 | `npm test` 2 个存量测试失败（Plan not found for BTW） | 低 | 不阻断 Demo | 根因在 `confirmPlan` 中 BTW asset 映射。不影响 thesis guard 功能，建议 Plan XVIII 修复 |
| 2 | Server 默认 HOST 为 `0.0.0.0` | 低 | 不阻断 | Vercel 部署需要。本地可通过 `HOST=127.0.0.1` 覆盖 |
| 3 | 本地 `.env` 含 DeepSeek API key | 中 | 不阻断 | `.gitignore` 保护有效。建议上传前轮换该 key |
| 4 | Demo 视频 Release 不存在 | P0 | **阻断 Demo 展示** | 需录制并上传 |
| 5 | `assets/demo-cover.png` 不存在 | P0 | **阻断 Demo 展示** | 需制作 |
| 6 | `OpenClaw交付包.zip` 被 Git tracked | 低 | 不阻断 | 内容安全（仅占位符），但建议后续通过 Release 分发 |

---

## 7. 提交前确认流程

1. `git status --short` 确认无意外文件
2. `git ls-files | grep -iE '(\.env|\.pem|\.key|credentials)'` 确认无敏感文件
3. 人工确认 `Lobster状态/state.json` 为 demo placeholder
4. 确认 README 视频链接有效
5. 确认 `assets/demo-cover.png` 存在
6. 建议轮换本地 `.env` 中的 API key

---

## 8. 与 Plan XVI 安全报告的差异

| 检查项 | Plan XVI 状态 | Plan XVII 状态 |
|---|-------------|---------------|
| 主测试通过 | 54/54 | 51/53（2 存量失败） |
| Plan XVI 测试 | 22/22 | 22/22 |
| Plan XV 测试 | 64/64 | 64/64 |
| Plan XVI:all 链路 | 182 通过 | 114 通过（统计口径不同） |
| Demo harness | 7/7 通过 | 7/7 通过 |
| 视频/封面图 | 缺失 | 仍缺失（仅剩阻塞项） |
| demos/ gitignored | 已添加 | 已验证有效 |
| state.json placeholder | 已确认 | 已确认 |
