# Plan XIII 安全终审报告

> **审查时间：** 2026-06-28
> **审查人：** 负责人 4
> **审查范围：** 全部 Git tracked 文件、untracked 敏感文件、zip 压缩包内容、环境变量文件、绝对路径

---

## 1. 终审结论

**是否允许上传 GitHub：有条件允许**（条件见第 6 节硬性阻塞项）

当前仓库代码层面无真实 API key、私钥、助记词进入 Git tracked 文件。两项阻塞项（Demo 视频、封面图）暂未完成，完成后即可上传。

---

## 2. 扫描命令与完整结果

### 2.1 `git status --short`

关键文件：
- `Lobster状态/state.json` — M（已修改），**Git tracked**
- `OpenClaw交付包.zip` — M（已修改），**Git tracked**
- `源代码/.env` — **不在 git status 中**（`.gitignore` 保护）
- 多个 `plan/` 下 untracked 文件

### 2.2 `git ls-files | rg '(\.env|state\.json|\.zip$)'`

**实际输出（修正旧报告错误）：**

```
Lobster状态/state.json
源代码/src/ui/demo-state.json
```

**修正说明：** Plan XII 安全审查报告第 2.2 节声称此命令"无输出"，该结论**错误**。`Lobster状态/state.json` 自早期提交起即为 Git tracked 文件。`.gitignore` 中的 `Lobster状态/state.json` 规则仅阻止新文件被添加，无法追溯移除已 tracked 文件。

另外 `git ls-files | rg '\.zip'` 确认：
```
OpenClaw交付包.zip
```
该 zip 文件同样被 Git tracked。

**`.env` 文件未被 Git tracked**（`git ls-files | rg '\.env'` 无输出），`.gitignore` 保护有效。

### 2.3 Secret / Keyword 扫描

扫描范围：API key、私钥、Bearer token、交易所凭证、密码字段、助记词、seed phrase 等常见敏感信息模式。具体规则不在公开文档中记录。

**命中项分析：**

| 命中类型 | 文件 | 性质 |
|---|---|---|
| `BITGET_MCP_COMMAND="npx bitget-mcp-server"` | `源代码/README.md:302`, `LOBSTER_INTEGRATION.md:59` | 文档示例环境变量名，非环境变量 |
| `BITGET_SKILLS`, `BITGET_ROLE_MAP`, `ROLE_TO_BITGET_KEY` 等 | 多个源代码文件 | 代码常量名，非敏感值 |
| 安全扫描正则表达式本身 | Plan 文档 | 计划/报告中的安全要求描述 |

**无真实 API key、私钥、助记词被提交到仓库 tracked 文件中。**

### 2.4 本机绝对路径扫描

`rg '/Users/'` 命中文件：

| 文件 | 路径数 | 性质 |
|---|---|---|
| `源代码/PROJECT_STATUS_2026-06-14.md` | ~20 条 | 历史状态文档（非可执行配置），指向旧项目路径 |
| `其他相关文档/` | 若干 | 历史参考文档/参赛方案 |
| `plan/` 下多个计划文件 | ~10 条 | 计划文档内的文件路径引用 |

**源代码 `src/` 目录下无任何 `/Users/` 绝对路径**（单独 `rg '/Users/' 源代码/src/` 确认为空）。

**可执行配置（shell scripts, MCP configs）中无个人绝对路径。**

---

## 3. 关键文件逐项检查

### 3.1 `源代码/.env`

- **Git tracked：否**（`.gitignore` 有 `.env` 规则且生效）
- **内容：** 不记录任何 API key 值；本地 .env 不应提交
- **风险：** 低。文件未被 Git tracked，不会进入仓库。但**建议上传前轮换该 API key**，确保即使意外提交也无效。

### 3.2 `Lobster状态/state.json`

- **Git tracked：是**
- **当前内容状态：** Demo placeholder（人工确认）
  - `"note": "Public demo placeholder. Do not commit personal runtime state..."`
  - 所有 `assets`、`positions`、`plans` 等字段已清空为空对象 `{}`
  - 仅保留 `settings` 默认值和 `version: 1`
- **Diff 分析：** 从旧版本（含 SOL 真实持仓数据、估值模型、研究报告、事件记录）改为当前空 placeholder。旧敏感数据已从工作区清除。
- **风险：** 低。内容为 demo placeholder，无真实持仓数据。但该文件**仍被 Git tracked**，未来修改需要人工确认。

### 3.3 `源代码/src/ui/demo-state.json`

- **Git tracked：是**
- **内容：** Demo 示例数据（BTC/ETH/SOL 的示例持仓、计划、估值模型）
- **`"demo": true`** 标记明确
- **风险：** 无。纯示例数据，无真实持仓。

### 3.4 `OpenClaw交付包.zip`

- **Git tracked：是**（文件大小 17KB）
- **解压内容：** 19 个文件
  - `configs/` — bundle 配置使用占位路径，无个人路径
  - `scripts/` — 启动脚本使用相对路径
  - `docs/`, `prompts/` — 文档和提示词
  - `README.zh-CN.md`, `SEND_TO_OPENCLAW.zh-CN.md`
- **解压后扫描：** 无 API key、私钥、助记词、本机绝对路径
- **建议：** 改为 GitHub Release 分发更佳，但当前内容安全，作为 tracked 文件提交不影响安全。

### 3.5 `assets/demo-cover.png`

- **是否存在：否**（`glob **/assets/demo-cover.png` 无匹配）
- **状态：阻塞项**

### 3.6 Demo 视频链接

- README 中视频链接：`https://github.com/Levelup-JC/decision-brain/releases/download/demo-v1/decision-brain-demo.mp4`
- **Release 是否存在：否**（`gh release view demo-v1 --repo Levelup-JC/decision-brain` 返回 "release not found"）
- **状态：阻塞项**

---

## 4. 发现的问题与风险

| # | 风险 | 严重级别 | 文件 | 处理建议 |
|---|---|---|---|---|
| 1 | `Lobster状态/state.json` 虽为 demo placeholder，但仍被 Git tracked | 低 | `Lobster状态/state.json` | 提交前人工再次确认内容为 placeholder |
| 2 | 本地 `.env` 不应提交任何 API key | 中 | `源代码/.env`（untracked） | 建议轮换该 key；已受 `.gitignore` 保护 |
| 3 | Demo 视频 Release 不存在 | **P0 阻塞** | GitHub Release | 需录制并上传 |
| 4 | `assets/demo-cover.png` 不存在 | **P0 阻塞** | `assets/demo-cover.png` | 需制作 |
| 5 | Plan XIII 截图目录为空 | P1 | `plan/Plan-XIII-截图/` | 需负责人 3 提供 |
| 6 | `PROJECT_STATUS_2026-06-14.md` 含旧项目绝对路径 | 低 | `源代码/PROJECT_STATUS_2026-06-14.md` | 历史文档，不影响安全；后续可清理 |
| 7 | Old Plan XII 报告 2.2 节结论有误 | 文档 | `plan/Plan-XII-安全审查报告.md` | 已在本报告中修正 |

---

## 5. `.gitignore` 有效性验证

| 规则 | 预期保护文件 | 实际效果 |
|---|---|---|
| `data/state.json` | 运行时状态 | 有效（untracked） |
| `Lobster状态/state.json` | Lobster 运行时状态 | **部分有效**（阻止新 add，但文件已 tracked） |
| `.env` | 环境变量 | **有效**（`源代码/.env` untracked） |
| `*.pem`, `*.key` | 私钥文件 | 仓库中无此类文件 |
| `源代码/data/*.json` | 测试输出 | 有效 |

---

## 6. 上传前硬性阻塞项（最终检查表）

| # | 检查项 | 状态 |
|---|---|---|
| 1 | `npm test` 通过（54/54） | ✅ 通过 |
| 2 | `npm run test:plan12` 通过（7/7） | ✅ 通过 |
| 3 | Plan XIII 布局验收通过（10/10） | ✅ 通过 |
| 4 | Demo 视频链接真实可打开 | ❌ Release 不存在 |
| 5 | `assets/demo-cover.png` 存在 | ❌ 不存在 |
| 6 | `源代码/.env` 未被 tracked | ✅ 通过 |
| 7 | 无真实 API key、私钥、助记词进入 tracked | ✅ 通过 |
| 8 | `Lobster状态/state.json` 已人工确认是 demo placeholder | ✅ 通过 |
| 9 | `OpenClaw交付包.zip` 已确认无敏感信息 | ✅ 通过 |
| 10 | README 说明项目为什么做、架构、Bitget MCP | ✅ 已更新 |

**阻塞项仅有 #4 和 #5**，均为 Demo 展示资料。代码和配置层面已全部通过安全审查。

---

## 7. 与 Plan XII 安全报告的关键差异

| 检查项 | Plan XII 报告 | Plan XIII 实际 | 修正 |
|---|---|---|---|
| `git ls-files` 检查 state.json | 声称"无输出" | 实际输出 `Lobster状态/state.json` 和 `demo-state.json` | **已修正** |
| `OpenClaw交付包.zip` 分发方式 | 建议改为 Release | 仍未改为 Release，但内容已确认为安全 | 可接受 |
| `assets/demo-cover.png` | 未制作 | 仍未制作 | 仍为阻塞项 |
| 视频链接 | 无效 | 仍无效 | 仍为阻塞项 |
| `源代码/.env` API key | 建议轮换 | 尚未轮换 | 建议仍有效 |
