# 发给 OpenClaw 的交接说明

你好，这里是 `Decision Brain` 的 OpenClaw 接入包。

## 你会拿到什么

这个包里已经包含：

- 可运行的 `Decision Brain` 代码
- MCP / stdio 配置
- OpenClaw 的系统提示词
- 工具速查表
- 调用流程
- 注意事项

你不需要再去原仓库翻资料。

## 目标

请把 `Decision Brain` 接成 OpenClaw 的投资决策后端，而不是让 OpenClaw 自己维护一份碎片化投资记忆。

职责分工：

- `Decision Brain` 负责：
  - 资产记忆
  - 项目调研
  - 对标估值
  - 计划状态
  - 每日监测
  - 最终投资建议
- OpenClaw 负责：
  - 与用户对话
  - 触发工具
  - 把结构化建议整理成自然语言

## 当前研究层状态

请注意：当前版本已经接通了工具链，但研究来源还分两层：

- 链路层：MCP / HTTP / 记忆 / 计划 / 建议链路已经可用
- 研究质量层：对 `SOL`、`ENA`、`ZORA` 有内置示例 profile；对 `BTW` 等其他资产，默认会落到 fallback profile

如果返回里看到：

- `sourceType: bitget_skill_mock`
- `sourceType: surf_mock`
- `fallback research profile`
- `should be enriched by Bitget or Surf adapters`

这代表当前研究不是完整真实的 Bitget / Surf 数据，而是 mock / fallback 占位。

OpenClaw 输出时必须如实说明：

```text
当前链路已接通，但该资产研究资料仍是 fallback / mock 状态，需要补充真实来源或用户 thesis 后再提高建议置信度。
```

短期正确动作：

1. 用 `log_source` 把用户提供的 BTW thesis、来源、判断依据写入长期记忆
2. 再调用 `get_asset_context` 和加仓 / 卖出 review

中长期动作：

1. 补真实 Bitget / Surf adapter
2. 把 mock sourceType 替换成真实 sourceType
3. 让研究摘要、对标项目、流动性、上所路径来自真实资料

## 推荐安装方式

优先使用 **MCP / stdio**。

### 如果你的 OpenClaw 支持 `mcpServers`

把下面这个文件里的 `decision-brain` 项合并进你的 OpenClaw MCP 配置：

- `configs/decision-brain.bundle.mcpServers.json`

合并前需要把配置里的占位路径替换成你的本机真实路径。也可以改用：

- `configs/decision-brain.template.mcpServers.json`

并把里面的绝对路径替换成你本机实际路径。

### 如果你的 OpenClaw 支持 `servers`

把下面这个文件里的 `decision-brain` 项合并进你的 OpenClaw 工具配置：

- `configs/decision-brain.bundle.servers.json`

合并前需要把配置里的占位路径替换成你的本机真实路径。也可以改用：

- `configs/decision-brain.template.servers.json`

并替换绝对路径。

### 如果你的 OpenClaw 暂时不支持 MCP

退回 HTTP 调用：

```bash
./scripts/start-decision-brain-http.sh
```

然后调用本地接口：

- `GET /api/capabilities`
- `POST /api/manage-position`
- `POST /api/confirm-plan`
- `GET /api/asset-context?asset=SYMBOL`
- `POST /api/review-add-intent`
- `POST /api/review-sell-intent`
- `POST /api/run-daily-monitor`
- `POST /api/log-source`
- `POST /api/archive-asset`

## OpenClaw 必须遵守的调用规则

1. 启动后先调一次 `capabilities`
2. 用户第一次说“我买了 X / 我关注 X”时调 `manage_position`
3. 回答某个资产问题前先调 `get_asset_context`
4. 用户问加仓时调 `review_add_intent`
5. 用户问卖出时调 `review_sell_intent`
6. 有长期价值的新研究必须通过 `log_source` 写回去
7. `run_daily_monitor` 一天最多一次
8. 不再跟踪的资产调 `archive_asset`

## 不要这样做

- 不要在没读 `get_asset_context` 的情况下直接回答买卖问题
- 不要只看价格曲线就给建议
- 不要自己维护一份影子记忆
- 不要把它描述成自动交易系统
- 不要引入私钥、托管、自动清仓等超出当前能力的内容

## 建议你优先看的文件

1. `README.zh-CN.md`
2. `prompts/OPENCLAW_SYSTEM_PROMPT.zh-CN.md`
3. `docs/TOOL_CHEATSHEET.zh-CN.md`
4. `docs/OPENCLAW_CALL_FLOW.zh-CN.md`
5. `docs/NOTES.zh-CN.md`

## 最小验证流程

请至少测试这三句话：

1. `我买了 SOL，100 个，成本 120，现价 175`
2. `现在还能不能加仓 SOL？`
3. `SOL 现在要不要卖一部分？`

如果接通正常，OpenClaw 应该会自动触发：

- `manage_position`
- `get_asset_context`
- `review_add_intent`
- `review_sell_intent`

## 额外说明

这个包不包含任何个人敏感配置，不要要求提供：

- OpenClaw 私人配置原文件
- API key
- 钱包私钥
- passphrase

如果你需要我配合调整成你当前 OpenClaw 的配置格式，只需要告诉我：

- 你使用的是 `mcpServers`、`servers`，还是别的工具配置结构
- 你实际解压后的目录路径
