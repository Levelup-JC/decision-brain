# B 组前端 -- 完成报告

**项目**: Decision Brain -- Bitget Hackathon S1 (Trading Agent 赛道)
**负责人**: B 组 (前端委员会作战室)
**日期**: 2026-06-26
**状态**: B1-B5 全部完成，可独立运行 (Mock 模式)，等待 A 组联调

---

## 1. 交付概览

### 1.1 新建文件 (7 个 JS 模块)

| 文件 | 行数 | 功能 |
|------|------|------|
| `src/ui/utils.js` | 51 | 数字格式化、估值区间标签、耗时显示 |
| `src/ui/mock-data.js` | 137 | Mock POST /api/chat、/api/agent/:role、GET /api/state |
| `src/ui/chat.js` | 61 | F1 对话气泡 + F4 快捷建议按钮 |
| `src/ui/committee.js` | 105 | F2 7 张 Agent 卡片 + F8 调度日志 + F9 独立 loading/耗时 |
| `src/ui/portfolio.js` | 215 | F3 资产看板轮询 + F5 交易表单 + F10 诚实标注 + 展开详情面板 |
| `src/ui/charts.js` | 188 | F6 估值分区条形图 + F7 组合估值曲线 |
| `src/ui/dashboard.js` | 94 | 主控：编排整个流程 + Mock/Real 切换 |

### 1.2 修改文件 (2 个)

| 文件 | 变更 |
|------|------|
| `src/ui/dashboard.html` | 完全重写：三栏布局 + Bitget 青蓝 `#00F0FF` + 比特币金 `#F7931A` 浅色主题皮肤 |
| `src/server.mjs` | 单文件路由改为通用 `*.js` 静态文件服务，支持所有新模块 |

### 1.3 代码规模

- **UI 模块**: 8 文件，1536 行
- **HTML**: 685 行 (含完整 CSS)
- **总体**: 10 文件修改/新增

---

## 2. 功能点完成情况

### P0 (不做没 Demo)

| 编号 | 功能 | 状态 |
|------|------|------|
| F1 | 与 Chief 对话 (输入 -> /api/chat -> 消息气泡) | Done |
| F2 | 委员会作战室 (N 个 Agent 卡片，思考中骨架 -> 意见淡入) | Done |
| F3 | 资产看板 poll /api/state (5s)，数字实时变化 + count-up 动画 | Done |
| F4 | 快捷建议按钮 (chat.suggestions)，点击即发送 | Done |
| F5 | 记录交易表单 (units/cost/price/portfolioValue -> manage-position) | Done |

### P1 (酷炫 + 拿分)

| 编号 | 功能 | 状态 |
|------|------|------|
| F6 | 估值分区条形图 (Chart.js，红黄绿分区，当前 FDV 胶囊标签) | Done |
| F7 | 组合估值变化曲线 (渐变填充，Bitget 青蓝色) | Done |
| F8 | Chief 调度日志 (派出/返回/综合 时间线，彩色圆点标识) | Done |
| F9 | 各 Agent 卡片独立 loading/耗时 (tookMs) 显示 | Done |
| F10 | 诚实标注：thesis/融资等主观字段灰标"待补充"，partial 黄标"补强" | Done |

### 额外

| 编号 | 功能 | 状态 |
|------|------|------|
| -- | 可展开详情面板 (点击资产卡片展开完整信息) | Done |
| -- | 数字 count-up 动画 (ease-out 缓动) | Done |
| -- | Agent 卡片三态切换 (待命灰/思考金发光/完成青蓝+scale弹入) | Done |

---

## 3. UI 设计方案 (基于 UI Design Skill 问卷)

| 设计维度 | 选择 |
|---------|------|
| 页面类型 | Dashboard / Application UI |
| 主要目标 | 帮 Crypto Trader 看数据、做投资决策 |
| 目标受众 | Crypto Traders |
| 整体气质 | Showcase-led (展示导向，炫酷 Demo 级观感) |
| 内容组织 | Card-based modules (卡片化) |
| 信息密度 | Complete but clean (信息完整但排版干净) |
| 配色方向 | Light + cool accent (浅色底 + 冷色点缀) |
| 品牌色 | Bitget Blue `#00F0FF` (亮青蓝) |
| 辅助强调色 | Bitcoin Gold `#F7931A` (比特币金) |
| 字体 | 全无衬线 (Inter / 系统字体) |
| 动效 | Strong motion (强动效) |
| 按钮 | 圆角实心 |
| 设备 | Desktop first |
| 主工作区 | Charts and metrics (图表和指标为核心) |
| 详情模式 | Expandable side panel (可展开侧栏) |

### 配色系统

```
--bg:       #F2F4F8  浅灰底
--panel:    #FFFFFF  白色卡片
--accent:   #00F0FF  Bitget 青蓝 (按钮、链接、完成态)
--gold:     #F7931A  比特币金 (思考态、警告、价格变动)
--ok:       #00C853  状态绿
--risk:     #FF5252  风险红
--ink:      #1A2332  主文字 (深海军灰)
--muted:    #94A3B8  辅助文字
```

### 动效系统

- `fadeUp`: 0.4s，12px 上移入场 (消息、日志条目)
- `cardArrive`: 0.5s，缩放 0.95->1.02->1 弹入 (Agent 完成)
- `shimmer`: 2s 循环扫光 (Agent 思考中骨架)
- `numberPop`: 0.5s 数字跳动 (估值/持仓变化)
- `glowBorder`: 2s 循环发光边框 (Agent 运行中)
- `slideDown`: 0.3s 下滑展开 (详情面板)

---

## 4. Agent 卡片状态机

```
待命 (Standby)
  ├─ 灰色左边框
  ├─ 灰色 "待命" 标签
  └─ "等待指令..." 灰色文字

    ↓ fanoutAgents(roles)

思考中 (Running)
  ├─ 金色左边框 + glowBorder 发光动画
  ├─ 金色 "思考中" 标签 + pulse 脉冲
  └─ shimmer 扫光骨架动画

    ↓ agentArrived(role, headline, tookMs)

完成 (Done)
  ├─ 青蓝色左边框
  ├─ 青蓝色 "完成" 标签
  ├─ cardArrive 缩放弹入动画
  ├─ 意见文字 + 耗时 (等宽字体)
  └─ 调度日志追加 "XX 返回 · 320ms"
```

---

## 5. 界面布局

```
+------------------------------------------------------------------+
| DECISION BRAIN  |  LIVE  |  ● 就绪                                 | 顶栏
+-------------+--------------------+-------------------------------+
| Chief 对话   | 委员会作战室          | 实时资产看板                     |
|             |                    |                               |
| [消息气泡]    | [Memory] [Macro]   |  纳入资产: 1   持仓: 1          |
| [消息气泡]    | [On-chain] [Sentiment]| 计划: 1   组合估值: $50K       |
|             | [Technical] [News] |                               |
| [快捷建议]    | [Valuation]        |  BTW              保守区       |
|             |                    |  持有: 100 | 成本: 0.09 | FDV: 52M |
| [输入框]     | Chief 调度日志       |  对标估值: 待补充               |
| [发送]       | · Chief 派出 5 位... |  上所路径: 待补充               |
|             | · onchain 返回 320ms|                               |
|             | · sentiment 返回... |  [记录交易表单]                  |
|             | · Chief 综合        |                               |
|             |                    |  [组合估值曲线图]                |
|             | [估值分区条形图]      |                               |
+-------------+--------------------+-------------------------------+
```

---

## 6. 对接状态

| 依赖 | 状态 |
|------|------|
| `/api/chat` 契约 | Mock 已按 §3.1 实现，A 组 ready 后翻 `USE_MOCK=false` |
| `/api/agent/:role` | Mock 已按 §3.2 实现 |
| `/api/state` | Mock 已实现，API 已联调通过 |
| 皮肤 | Bitget 青蓝 `#00F0FF` + 比特币金 `#F7931A` 浅色主题 |
| 自测 | 零后端依赖，打开 `localhost:4177` 即可全功能演示 |

---

## 7. 测试

- **现有测试**: 29/30 通过 (1 个预存失败：lobster-config 路径正则，与前端无关)
- **新增代码**: 0 个测试回归
- **自测方式**: `cd 源代码 && node src/index.mjs && open http://localhost:4177/`
  - 输入 "研究 BTW" -> 委员会卡片逐个亮起
  - 输入 "我持有 100 个 BTW 成本 0.09" -> 记录仓位
  - 右侧点击资产 -> 展开详情面板
  - 调度日志实时追加

---

## 8. 下一步 (联调)

1. A 组 `/api/chat` 和 `/api/agent/:role` 真接口 ready
2. 翻 `dashboard.js` 中 `USE_MOCK = false`
3. 跑 §7.3 端到端 9 步验收
4. Vercel 部署 + `/api/health` 验证

---

## 9. 红线自查

| 红线 | 状态 |
|------|------|
| 不假造数据 | Pass -- 主观字段灰标 "待补充" |
| 不碰交易 Tools / 私钥 | Pass -- 仅前端展示 |
| 密钥不进 git | Pass -- 无密钥相关代码 |
| 后端 service 零业务改动 | Pass -- 仅改 server.mjs 路由 |
| 单源零 CORS | Pass -- 全部同源 /api/* |
