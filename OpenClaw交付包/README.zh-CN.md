# Decision Brain -> OpenClaw 交接包

这是一个给 OpenClaw 使用的 `Decision Brain` 交接包。

目标很简单：

- 让 OpenClaw 把 `Decision Brain` 当作投资决策后端
- 不让 OpenClaw 自己维护一份混乱的影子记忆
- 让仓位、估值、计划、事件、监测和最终建议都走同一套工具链

## 1. 包里有什么

- `runtime/decision-brain/`
  - 可运行代码
  - MCP server
  - HTTP server
  - 示例配置与测试
- `configs/`
  - 可直接参考的 MCP 配置
  - 当前机器可用的 bundle 配置
  - 可改路径的模板配置
- `prompts/`
  - 给 OpenClaw 的推荐系统提示词
- `docs/`
  - 工具速查
  - 调用流程
  - 注意事项
- `scripts/`
  - 本地启动 MCP / HTTP 的辅助脚本

## 2. 推荐接法

推荐优先使用 **MCP / stdio**。

原因：

- OpenClaw 只需要调用工具，不需要额外自己维护状态
- `Decision Brain` 会成为唯一的投资记忆来源
- 不需要手动长期启动一个独立 HTTP 进程

如果 OpenClaw 当前版本不支持 MCP / tool server，再退回 HTTP 方式。

## 3. 最短接入步骤

### 方案 A：OpenClaw 支持 `mcpServers`

1. 打开 `configs/decision-brain.bundle.mcpServers.json`
2. 把里面的 `decision-brain` 配置合并进 OpenClaw 的 MCP 配置
3. 把 `prompts/OPENCLAW_SYSTEM_PROMPT.zh-CN.md` 作为 OpenClaw 的工具调用规则
4. 重启 OpenClaw 或刷新其工具列表

### 方案 B：OpenClaw 支持 `servers`

1. 打开 `configs/decision-brain.bundle.servers.json`
2. 把里面的 `decision-brain` 配置合并进 OpenClaw 的工具配置
3. 同样使用 `prompts/OPENCLAW_SYSTEM_PROMPT.zh-CN.md`
4. 重启 OpenClaw 或刷新其工具列表

### 方案 C：OpenClaw 只支持 HTTP

1. 启动：

```bash
/Users/jasoncong/Documents/New\ project/decision-brain-openclaw-handoff/scripts/start-decision-brain-http.sh
```

2. 让 OpenClaw 走本地 HTTP 调用：

- `GET http://127.0.0.1:4177/api/capabilities`
- `POST http://127.0.0.1:4177/api/manage-position`
- `POST http://127.0.0.1:4177/api/confirm-plan`
- `GET http://127.0.0.1:4177/api/asset-context?asset=SYMBOL`
- `POST http://127.0.0.1:4177/api/review-add-intent`
- `POST http://127.0.0.1:4177/api/review-sell-intent`
- `POST http://127.0.0.1:4177/api/run-daily-monitor`
- `POST http://127.0.0.1:4177/api/log-source`
- `POST http://127.0.0.1:4177/api/archive-asset`

## 4. 当前机器可直接使用的配置

如果这个交接包不移动路径，优先使用：

- `configs/decision-brain.bundle.mcpServers.json`
- `configs/decision-brain.bundle.servers.json`

这两份配置已经指向当前机器上的真实路径。

如果你把整个包移动到了别的位置，改用：

- `configs/decision-brain.template.mcpServers.json`
- `configs/decision-brain.template.servers.json`

把其中的绝对路径替换掉即可。

## 5. OpenClaw 应该怎么调用

OpenClaw 不应该把 `Decision Brain` 当作一个“只在回答时顺手问一下”的插件。

正确用法是：

1. 启动后先调一次 `capabilities`
2. 用户第一次说“我买了 X / 我关注 X”时调 `manage_position`
3. 回答某个资产问题前先调 `get_asset_context`
4. 用户问加仓时调 `review_add_intent`
5. 用户问卖出时调 `review_sell_intent`
6. 看到值得保留的外部研究时调 `log_source`
7. `run_daily_monitor` 一天最多一次
8. 不再跟踪时调 `archive_asset`

详细说明见：

- `docs/TOOL_CHEATSHEET.zh-CN.md`
- `docs/OPENCLAW_CALL_FLOW.zh-CN.md`
- `docs/RESEARCH_LAYER_STATUS.zh-CN.md`
- `docs/NOTES.zh-CN.md`

## 6. 如何快速验证是否接通

让 OpenClaw 连续执行这三类场景：

1. 建仓

```text
我买了 SOL，100 个，成本 120，现价 175，仓位计划是 2x 回本金，3x 卖 30%，保留历史最高持仓 20% 底仓。
```

2. 加仓判断

```text
现在还能不能加仓 SOL？
```

3. 卖出判断

```text
SOL 现在要不要卖一部分？如果卖，卖多少比较合适？
```

如果接通正确，OpenClaw 应该自动走：

- `manage_position`
- `get_asset_context`
- `review_add_intent`
- `review_sell_intent`

## 7. 这包里没有放什么

为了安全，这个交接包 **没有** 放入你的个人敏感配置，例如：

- `~/.openclaw/openclaw.json`
- `~/.openclaw/realclaw-config.json`
- 任何钱包密钥、token、API secret

如果需要对接你自己的 OpenClaw 配置，请只把 `decision-brain` 这一段合并进去，不要把整份个人配置文件发出去。

## 8. 运行要求

- Node.js `>=20`
- 本地文件系统可读写
- 建议使用默认数据目录：
  - `~/.decision-brain-lobster`

`Decision Brain` 当前不依赖自动交易能力，也不依赖私钥。

## 9. 推荐交接顺序

如果你要把这个包发给 OpenClaw 的开发者或配置方，建议一起发下面这些文件：

1. `README.zh-CN.md`
2. `configs/decision-brain.bundle.mcpServers.json`
3. `configs/decision-brain.bundle.servers.json`
4. `prompts/OPENCLAW_SYSTEM_PROMPT.zh-CN.md`
5. `docs/TOOL_CHEATSHEET.zh-CN.md`
6. `docs/OPENCLAW_CALL_FLOW.zh-CN.md`
7. `docs/RESEARCH_LAYER_STATUS.zh-CN.md`
8. `docs/NOTES.zh-CN.md`
9. `runtime/decision-brain/`

这样对方不需要再回原仓库翻资料。
