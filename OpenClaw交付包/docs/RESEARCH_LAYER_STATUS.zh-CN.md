# 研究层状态说明

## 结论

当前版本的 `Decision Brain`：

- 工具链路已经接通
- 本地记忆、计划、估值和建议流程已经可用
- 但研究层对非预置资产仍可能是 mock / fallback

所以不能说：

```text
现在已经用了真实 Bitget 数据源。
```

更准确的说法是：

```text
Decision Brain 已经接通，但当前资产如果出现 mock / fallback 标记，说明研究资料仍是占位，需要补充真实来源或用户 thesis。
```

## 怎么识别 mock / fallback

如果 `get_asset_context` 或研究报告里出现：

- `sourceType: bitget_skill_mock`
- `sourceType: surf_mock`
- `fallback research profile`
- `should be enriched by Bitget or Surf adapters`

说明该资产的研究层还不是完整真实数据。

## 对 BTW 这类资产该怎么处理

短期优先级：

1. 先让用户补充 BTW 的 thesis
2. OpenClaw 调用 `log_source` 写入长期记忆
3. 再调用 `get_asset_context`
4. 再调用 `review_add_intent` 或 `review_sell_intent`

原因：

- adapter 接入需要开发周期
- 但 `log_source` 已经可用
- 先写入 thesis 可以马上改善建议质量

## 推荐的 `log_source` 输入

```json
{
  "assetQuery": "BTW",
  "sourceType": "user_thesis",
  "author": "user",
  "title": "BTW 建仓 thesis",
  "keyClaim": "这里写用户为什么买 BTW、看重什么 catalyst、担心什么风险",
  "roleInDecision": "core_thesis",
  "confidenceAtTime": 6
}
```

如果有外部链接：

```json
{
  "assetQuery": "BTW",
  "sourceType": "project_research",
  "author": "OpenClaw research",
  "title": "BTW 项目研究来源",
  "url": "https://example.com",
  "keyClaim": "这里写这条来源能证明什么",
  "roleInDecision": "supporting_evidence",
  "confidenceAtTime": 7
}
```

## 什么时候需要补 adapter

当你希望 OpenClaw 能自动完成这些事情时，就应该补 adapter：

- 自动查项目官网 / 文档 / 社媒
- 自动查融资背景
- 自动查上所状态
- 自动查潜在上所路径
- 自动查流动性
- 自动找对标项目
- 自动生成研究摘要

## 推荐路线

第一阶段：

- 不急着做真实 adapter
- 先把用户 thesis 和真实链接通过 `log_source` 写进去
- 让决策链路马上可用

第二阶段：

- 接真实 Bitget Agent Hub Skill
- 接真实 Surf / web research adapter
- 替换 mock sourceType

第三阶段：

- 让 `manage_position` 在建仓时自动触发真实研究
- 让 `run_daily_monitor` 每天只更新真实增量信息
