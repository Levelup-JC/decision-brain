# Decision Brain 项目汇总

整理时间：2026-06-25

本文件夹汇总了电脑上所有 Decision Brain 项目相关内容，按来源和用途分类存放。

## 目录结构

### 项目详细清单-6-25-v2.0.md

最新的项目详细清单文档（335行），涵盖：项目目标、已完成工作、当前进度、未完成工作、关键接口和文件路径、接手建议。

这是了解整个项目最核心的入口文件。

### 源代码/

项目主仓库的完整源代码（不含 .git），来源：`Documents/New project/decision-brain/`

| 文件/目录 | 说明 |
|-----------|------|
| README.md | 项目总览 |
| PRD.md | 产品需求文档 |
| PROJECT_STATUS_2026-06-14.md | 6月14日项目状态 |
| LOBSTER_INTEGRATION.md | Lobster 集成说明 |
| LOBSTER_PROMPT.md | Lobster 提示词 |
| src/services/ | 核心服务层（12个服务） |
| src/adapters/ | 外部适配器（Bitget、Surf、MCP等） |
| src/scripts/ | 运行脚本（启动、引导、安装等） |
| src/ui/ | Dashboard 前端 |
| test/ | 测试文件（30个测试用例全部通过） |
| agents/ | Agent 配置 |
| examples/ | 使用示例 |

启动方式：
- HTTP 服务：`npm start`
- MCP 服务：`npm run mcp`
- Dashboard：`http://127.0.0.1:4177/`
- 测试：`npm test`

### OpenClaw交付包/

用于交付给 OpenClaw 等外部 Agent 平台的对接包，来源：`Documents/New project/decision-brain-openclaw-handoff/`

| 文件/目录 | 说明 |
|-----------|------|
| README.zh-CN.md | 交付包总览 |
| SEND_TO_OPENCLAW.zh-CN.md | OpenClaw 发送说明 |
| docs/ | 研究层状态、工具速查表、调用流程、备注 |
| configs/ | MCP 服务器配置模板与打包文件 |
| prompts/ | OpenClaw 系统提示词 |
| scripts/ | 启动脚本（HTTP/MCP） |

### OpenClaw交付包.zip

上述交付包的压缩版本（103KB），来源：`Documents/New project/decision-brain-openclaw-handoff.zip`

### Lobster状态/

Lobster 运行时的状态数据，来源：`~/.decision-brain-lobster/`

- state.json（13.7KB），包含 Lobster 配置和运行时状态

### 其他相关文档/

| 文件 | 说明 | 来源 |
|------|------|------|
| Decision Brain 参赛方案-Bitget黑客松.md | Bitget 黑客松参赛方案 | `Vault/2-Projects/05-Bitget黑客松-Decision-Brain/` |
| Codex-rollout-summary-2026-06-11.md | Codex rollout 摘要（决策大脑 PRD 估值工作流） | `~/.codex/memories/` |

## 项目核心逻辑

**不要让 Agent 每次都从零开始想仓位、研究和计划，而是让它先查记忆，再补研究，再出建议。**

## 原始文件位置对照表

| 桌面路径 | 原始路径 |
|----------|----------|
| 项目详细清单-6-25-v2.0.md | `Documents/New project/Decision Brain 项目详细清单-6-25-v2.0.md` |
| 源代码/ | `Documents/New project/decision-brain/` |
| OpenClaw交付包/ | `Documents/New project/decision-brain-openclaw-handoff/` |
| OpenClaw交付包.zip | `Documents/New project/decision-brain-openclaw-handoff.zip` |
| Lobster状态/ | `~/.decision-brain-lobster/` |
| 其他相关文档/参赛方案 | `Documents/Jason's daily life Vault/2-Projects/05-Bitget黑客松-Decision-Brain/` |
| 其他相关文档/Codex摘要 | `~/.codex/memories/rollout_summaries/` |
