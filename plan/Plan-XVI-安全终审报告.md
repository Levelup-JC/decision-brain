# Plan XVI 安全终审报告

> **审查日期:** 2026-06-28
> **审查人:** 负责人 4
> **审查范围:** 全部 Git tracked 文件、新增 Plan XVI 代码、Demo harness 输出、敏感文件检查

---

## 1. 终审结论

**是否允许上传 GitHub：允许**

当前仓库代码层面无真实 API key、私钥、助记词进入 Git tracked 文件。Plan XVI 新增代码无外部网络请求，无敏感信息。两项阻塞项（Demo 视频、封面图）为录制产物，不影响代码安全。

---

## 2. 扫描命令与完整结果

### 2.1 `git ls-files` 敏感文件扫描

```
git ls-files | grep -iE '(\.env|\.pem|\.key|credentials|secret|token|password)'
→ (无输出)
```

**无 .env、私钥、凭证文件进入 Git tracked。**

### 2.2 `git ls-files` state.json 检查

```
Lobster状态/state.json
源代码/src/ui/demo-state.json
```

- `Lobster状态/state.json`: demo placeholder（diff 显示旧 SOL 持仓数据已清除，仅保留空结构 + note）
- `源代码/src/ui/demo-state.json`: `"demo": true` 标记明确，纯示例数据

### 2.3 `.gitignore` 有效性

| 规则 | 预期保护 | 实际效果 |
|---|---|---|
| `.env` | 源代码/.env | 有效（untracked） |
| `data/state.json` | 运行时状态 | 有效（untracked） |
| `Lobster状态/state.json` | Lobster 状态 | 部分有效（阻止新 add，文件已 tracked） |
| `*.pem`, `*.key` | 私钥文件 | 仓库中无此类文件 |

**建议:** `源代码/demos/` 目录加入 `.gitignore`（demo harness 输出不应提交）。

### 2.4 本机绝对路径扫描

```
grep -r '/Users/' 源代码/src/
→ (无输出)
```

**源代码 `src/` 目录下无任何 `/Users/` 绝对路径。**

### 2.5 OpenClaw 交付包扫描

- `OpenClaw交付包.zip` 内容已确认：configs 使用占位符，scripts 使用相对路径
- 无 API key、私钥、本机绝对路径

---

## 3. Plan XVI 新增代码安全审查

| 新增文件 | 审查结果 |
|---|---|
| `src/scripts/demo-thesis-guard.mjs` | 本地 demo 脚本，无外部网络请求，无敏感信息 |
| `tests/plan16-thesis-guard.test.mjs` | 测试文件，使用临时目录，不泄露状态 |
| `demos/thesis-guard-demo.md` | Demo 输出，未被 git tracked |

| 修改文件 | 审查结果 |
|---|---|
| `package.json` | 仅新增 test scripts，无敏感配置 |
| `README-目录说明.md` | 文档更新，无敏感信息 |
| `源代码/README.md` | 文档更新，无敏感信息 |

---

## 4. 安全清单逐项检查

| # | 检查项 | 状态 |
|---|---|---|
| 1 | `.env` 文件在 .gitignore | 通过 |
| 2 | API key 不硬编码 | 通过（环境变量注入） |
| 3 | state 文件保护 | 通过（运行时 state 被 gitignore） |
| 4 | 对话导出无敏感信息 | 通过（仅投资建议文本） |
| 5 | 截图无敏感信息 | N/A（无当前截图） |
| 6 | 视频无敏感信息 | N/A（视频通过 Release 分发） |
| 7 | README 无敏感路径或 token | 通过 |
| 8 | Git tracked 无密钥/cookie/私钥/真实账户数据 | 通过 |
| 9 | 钱包私钥/助记词不保存 | 通过（项目明确定位为非托管） |
| 10 | 配置无个人绝对路径 | 通过 |
| 11 | 无 eval() 用户输入 | 通过 |
| 12 | 无 SQL 拼接 | 通过（JSON 文件存储） |
| 13 | 无硬编码 IP/URL | 通过 |
| 14 | 服务仅绑定 localhost | 通过 |

---

## 5. 发现的风险

| # | 风险 | 严重级别 | 处理建议 |
|---|---|---|---|
| 1 | `Lobster状态/state.json` 仍被 Git tracked | 低 | 已确认为 demo placeholder，提交前人工再确认 |
| 2 | 本地 `.env` 不应提交任何 API key | 中 | `.gitignore` 保护有效；建议轮换该 key |
| 3 | `源代码/demos/` 未被 gitignore | 低 | 建议加入 `.gitignore`，demo 输出不应提交 |
| 4 | Demo 视频 Release 不存在 | P0 阻塞 | 需录制并上传 |
| 5 | `assets/demo-cover.png` 不存在 | P0 阻塞 | 需制作 |

---

## 6. 与 Plan XIII 安全报告的关键差异

| 检查项 | Plan XIII 状态 | Plan XVI 状态 |
|---|---|---|
| 测试套件 | 139 通过 | 182 通过 |
| Plan XVI harness | 不存在 | 稳定跑通，7/7 检查通过 |
| README 参赛页 | 部分 | 完整（六大问题全部覆盖） |
| 视频/封面图 | 缺失 | 仍缺失（持续阻塞项） |
| state.json placeholder | 已确认 | 已确认（旧数据已清除） |

---

## 7. 上传前硬性阻塞项

| # | 检查项 | 状态 |
|---|---|---|
| 1 | `npm test` 通过 (54/54) | 通过 |
| 2 | `npm run test:plan16` 通过 (22/22) | 通过 |
| 3 | `npm run test:plan15:all` 通过 (64/64) | 通过 |
| 4 | `npm run demo:thesis-guard` 通过 | 通过 |
| 5 | 无真实 API key 进入 tracked | 通过 |
| 6 | 无绝对路径在 src/ | 通过 |
| 7 | `.env` 未被 tracked | 通过 |
| 8 | Lobster state.json 为 placeholder | 通过 |
| 9 | README 可作为参赛页 | 通过 |
| 10 | Demo 视频链接有效 | 缺失 |
| 11 | `assets/demo-cover.png` 存在 | 缺失 |

**代码层面全部通过。仅阻塞项 #10、#11 为 Demo 展示资料。**

---

## 8. 上传前最终确认流程

提交前必须执行：

1. `git status --short` 确认无意外文件
2. `git ls-files | grep -iE '(\.env|\.pem|\.key|credentials)'` 确认无敏感文件
3. 人工确认 `Lobster状态/state.json` 为 demo placeholder
4. 确认 README 视频链接有效
5. 确认 `assets/demo-cover.png` 存在
6. 建议轮换本地 `.env` 中的 API key
