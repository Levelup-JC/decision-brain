# Decision Brain 目录说明

主项目介绍请先看 [README.md](README.md)。那里已经按照黑客松参赛页的方式说明了项目为什么做、解决什么痛点、技术栈、Bitget MCP Skills 如何使用、以及记忆系统如何处理仓位和投资 thesis。

## 目录结构

| 路径 | 说明 |
|---|---|
| `README.md` | GitHub 参赛页主 README，面向评委和外部协作者 |
| `源代码/` | 主应用代码：HTTP 服务、MCP 服务、Dashboard UI、自动化测试和 Demo 支撑脚本 |
| `源代码/README.md` | 开发者视角 README，说明运行方式、接口、记忆系统和测试 |
| `plan/` | 开发计划、验收报告、Demo 脚本、复盘材料 |
| `assets/` | Logo、视觉素材和项目图片 |
| `OpenClaw交付包/` | 外部 Agent 平台对接包 |
| `Lobster状态/` | Demo placeholder 状态，不应放真实运行数据 |
| `其他相关文档/` | 历史参考文档和补充材料 |

## 推荐阅读顺序

1. [README.md](README.md)：先理解项目定位、痛点和架构。
2. [源代码/README.md](源代码/README.md)：需要运行或二次开发时看。
3. `plan/Plan-XVII-Demo脚本.md`：录制 Demo 或现场演示时看。
4. `plan/Plan-XVII-README终审说明.md`：检查 README 叙事、安全边界和公开提交口径时看。

## 当前公开边界

- 项目不自动交易。
- 项目不保存私钥、助记词或交易所密钥。
- `.env`、真实运行状态和个人敏感信息不应提交。
- 对话导出只提交 demo session，不提交真实账户数据。
