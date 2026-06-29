# Decision Brain

> **Bitget 黑客松参赛项目** — 给交易 Agent 装上长期记忆、仓位上下文、估值纪律和可追溯建议。

## 为什么做 Decision Brain

交易 Agent 最大的问题不是"能不能下单"，而是：
- **缺少长期记忆** — 每轮对话从零开始，记不住用户的仓位和计划
- **缺少仓位上下文** — 不知道用户已经持有什么、成本多少、当初为什么买
- **缺少估值纪律** — 市场信息直接变成买卖建议，没有计划层和估值锚
- **缺少可追溯建议** — 建议说不清依据，没法复盘

Decision Brain 是 Agent 的"投资大脑"：用户开放式表达（混杂情绪、仓位、资产简称、计划、风险）进来，先理解意图，再调度工具，最后给出有上下文的建议。

## 目前完成的工作

- 本地 HTTP 服务 + MCP 工具接口
- Dashboard Demo（三列布局：左侧 Chief 对话 + 中间资产实时主看板 + 右侧 Agent 作战室）
- 资产实时主看板：组合估值、持仓、纳入资产、计划数、资产列表、趋势图
- 多 Agent 委员会展示（宏观/情报/新闻/情绪/技术面等 8 个 Agent 状态灯）
- Bitget MCP Skill 展示层（5 个 Skill 统一入口，调用时高亮）
- 仓位 / 计划 / 估值 / Trace 记忆层
- 资产面板实时同步（对话写入后中间主看板立即更新）
- 发光趋势曲线（Bitget 主题色 `#00F0B5`）
- Panic Sell 护栏：识别恐慌卖出情绪，回看买入理由、计划边界和底仓规则后再做卖出建议
- 对话智能去重：同一资产连续追问不重复输出完整研报，模糊表达多样化路由
- **Plan XVI 新增**：仓位记忆与目标追踪（investmentGoal, targetUnits, goalProgress）
- **Plan XVI 新增**：投资初心护栏（Thesis Guard）：5-part 恐慌卖出回复结构，区分想卖/因跌想卖/准备卖/已经卖
- **Plan XVI 新增**：Thesis Guard Harness Demo（`npm run demo:thesis-guard`），固定剧本验证
- 本地测试套件（182 测试用例全部通过）

## 当前仍在打磨

- Demo 视频录制与封面图制作
- Plan XIII 演示截图补齐
- K 线接入真实 Bitget MCP 数据流（当前已具备 adapter 框架）

## 测试状态

- `npm test`: 54/54 通过
- `npm run test:plan12`: 7/7 通过
- `npm run test:plan14:all`: 35/35 通过（对话日志 + 对话承接 + 加权成本）
- `npm run test:plan15:all`: 64/64 通过（对话去重 + 恐慌卖出护栏 + 模糊表达路由 + 卖出意图行为）
- `npm run test:plan16`: 22/22 通过（仓位记忆 + 投资初心护栏 + 卖出意图分层 + 加权成本 + 资产识别）
- `npm run test:plan16:dialog-quality`: 28/28 通过（6项对话智能自检：承接 + 护栏 + 计划卖出边界 + 记录确认 + 模糊表达多样性）
- `npm run test:plan16:all`: 50/50 通过
- 总计: 210 测试用例全部通过

## 架构

```
Chat Orchestrator（对话编排）
  → Agent Fanout（多 Agent 并行调度，右侧 Agent 作战室展示）
    → Bitget MCP Adapter（宏观/情报/新闻/情绪/技术面）
    → Surf Research Adapter（项目调研）
  → Portfolio Memory（仓位记忆层 → 中间资产主看板）
  → Valuation / Plan Engine（估值与计划引擎）
  → Dashboard UI（三列：Chief 对话 | 资产主看板 | Agent 作战室）
  → Trace / Evidence Ledger（可追溯证据账本）
```

这些架构解决的需求：
- **防止 Agent 每轮从零开始** — Portfolio Memory 持久化仓位和计划
- **防止草率买卖建议** — Valuation / Plan Engine 提供估值锚和计划确认
- **统一状态管理** — 仓位、计划、估值、监测走同一数据源
- **展示 Bitget MCP 能力** — 5 个 Skill 统一入口，评委可直接看到调用链路

## 快速运行

```bash
cd 源代码
npm install
npm start
```

打开 `http://127.0.0.1:4177/` 查看 Dashboard。

## Demo 视频

[![Decision Brain Demo](assets/demo-cover.png)](https://github.com/Levelup-JC/decision-brain/releases/download/demo-v1/decision-brain-demo.mp4)

视频内容：开放式对话 → Bitget MCP / Agent 调度 → 资产面板更新 → 发光曲线 → Trace 可追溯

## 明确不做什么

- 不自动交易
- 不保存私钥
- 不托管资金
- 不承诺收益

## 目录结构

| 目录/文件 | 说明 |
|---|---|
| `源代码/` | 项目主仓库（HTTP 服务 + MCP 服务 + Dashboard UI + 测试） |
| `OpenClaw交付包/` | OpenClaw 等外部 Agent 平台对接包 |
| `Lobster状态/` | Lobster 运行时的 demo placeholder 状态 |
| `plan/` | 各阶段开发计划与验收报告 |
| `其他相关文档/` | 参赛方案、历史参考文档 |

## 安全说明

- `.env`、API key、钱包私钥、助记词、运行时状态均不进入仓库
- 所有配置使用环境变量或占位符，不硬编码个人路径
- 提交前有专人安全审查
