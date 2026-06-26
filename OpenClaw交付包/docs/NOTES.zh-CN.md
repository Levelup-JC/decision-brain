# 注意事项

## 1. 这是决策后端，不是自动交易器

`Decision Brain` 当前明确不做：

- 自动交易
- 私钥管理
- 托管
- 高频盯盘

OpenClaw 不要把它描述成“自动帮你执行买卖”的系统。

## 2. 价格曲线只是输入之一

OpenClaw 不能只看价格涨跌就给建议。

必须同时结合：

- 对标估值
- 计划状态
- thesis 是否失效
- 事件与 catalyst
- 底仓规则

## 2.1 研究层仍可能是 mock / fallback

当前版本的 `Decision Brain` 已经接通链路，但不代表每个资产都有真实完整研究。

如果返回内容里出现下面信息：

- `sourceType: bitget_skill_mock`
- `sourceType: surf_mock`
- `fallback research profile`
- `should be enriched by Bitget or Surf adapters`

OpenClaw 必须把它解释为：

```text
该资产当前研究资料不足，仍处于 mock / fallback 状态。
```

不要把它说成：

```text
该资产已经完成真实 Bitget / Surf 研究。
```

对 `BTW` 这类 fallback 资产，优先用 `log_source` 补用户 thesis 和真实来源，再给建议。

## 3. 不要维护影子记忆

长期有效的投资信息应该回写到 `Decision Brain`：

- 仓位
- 计划
- 来源
- 事件
- 决策 trace

OpenClaw 自己的上下文只能做临时组织，不能替代长期记忆。

## 4. 每日监测有节奏限制

- `run_daily_monitor` 默认 24 小时最多一次
- 重复调用被跳过是正常行为

不要把它当秒级轮询系统。

## 5. 建议始终使用独立数据目录

推荐默认目录：

```text
~/.decision-brain-lobster
```

这样可以避免：

- 你的本地测试数据
- OpenClaw 的正式记忆

混在一起。

## 6. 不要把个人密钥配置打包发出去

本交接包没有包含这些内容：

- `~/.openclaw/openclaw.json`
- `~/.openclaw/realclaw-config.json`
- 任何 API key
- 任何钱包私钥

如果要发给其他人，只发本包，不发你自己的私密配置。

## 7. 如果 OpenClaw 不支持 MCP

如果当前 OpenClaw 版本只有自定义 skill 配置，而没有 MCP / tool server 接口：

- 不要硬把 `Decision Brain` 塞进 `skills.entries`
- 应该加一个薄适配层
- 或者先走 HTTP 方式

## 8. 如果路径变了，记得改配置

`configs/decision-brain.bundle.*.json` 是按当前交接包路径生成的。

如果你把这个包移动到别的位置：

- 重新改 `args` 里的绝对路径
- 或改用 `configs/decision-brain.template.*.json`

## 9. 最稳的交付方式

最稳的是把这个整个文件夹或 zip 一起发给对方。

不要只发一段 prompt，因为真正需要的是：

- 运行代码
- 配置
- 调用规范
- 注意事项
