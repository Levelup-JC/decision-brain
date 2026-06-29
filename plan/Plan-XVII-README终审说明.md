# Plan XVII — README 终审说明

> **撰写人:** 负责人 2  
> **日期:** 2026-06-29  
> **关联文件:** `/Users/jasoncong/Desktop/Decision Brain/源代码/README.md`

---

## 一、README 更新内容

### 1.1 新增 "解决的核心痛点" 章节

在"为什么不是自动交易机器人"之后，新增独立章节，明确列出 4 个核心痛点：

1. Agent 没有长期记忆
2. 用户忘记当初为什么买
3. 缺少估值纪律
4. 建议不可追溯

末尾点出核心价值："市场波动时，先拉回用户自己的目标和 thesis，而不是跟着当下情绪走。"

### 1.2 新增 "Bitget MCP Skills 如何发挥作用" 章节

明确 5 个 Skill → Agent 的映射表格：

| Skill | Agent | 感知方向 | Demo 作用 |
|---|---|---|---|
| macro-analyst | Macro Agent | 宏观环境、利率、风险偏好 | risk-on/risk-off 判断 |
| market-intel | Market Intel Agent | 链上数据、市场情报 | 机构/大户行为信号 |
| news-briefing | News Agent | 新闻事件、社交趋势 | 短期叙事和事件驱动 |
| sentiment-analyst | Sentiment Agent | 恐惧贪婪、衍生品情绪 | 极端情绪量化 |
| technical-analysis | Technical Agent | 价格结构、技术指标 | 价格形态和关键位 |

明确区分：Bitget MCP Skills 只提供市场感知，不使用交易 API；Decision Brain 只做决策层，不执行交易。

### 1.3 更新测试数据

- 测试套件计数更新：182 → 210
- Plan XVI 测试分拆：core 22 + dialog-quality 28 = 50

### 1.4 更新 package.json

新增 `test:plan16:dialog-quality` 命令，更新 `test:plan16:all` 以包含全部 Plan XVI 测试。

### 1.5 更新 README-目录说明.md

同步更新测试状态表和测试计数。

---

## 二、自我审查结果

按 Plan XVII 第 7 节清单逐项检查：

| 检查项 | 结果 | 证据 |
|---|---|---|
| 第一屏能看懂"为什么做" | 通过 | README 第 3-7 行：一句话定位 + "用户忘记自己当初为什么买" |
| 明确写出用户痛点 | 通过 | "解决的核心痛点" 章节，4 条明确痛点，"回撤后忘记买入初衷和估值纪律" |
| 明确写出 5 个 Bitget MCP Skills 方向 | 通过 | "Bitget MCP Skills 如何发挥作用" 表格，5 行完整映射 |
| 明确写出不自动交易、不保存私钥 | 通过 | 两处：第 14-18 行 + 第 62-67 行 |
| 有 `npm run demo:thesis-guard` | 通过 | 第 186 行 + 投资初心护栏章节 |
| 有 `npm run test:plan16` | 通过 | 第 456 行 + 新增 `test:plan16:dialog-quality` |
| 无敏感路径/token/key | 通过 | 全文 grep `/Users/`, `sk-`, `ghp_`, private key pattern → 零匹配 |

---

## 三、测试验证结果

```
npm run test:plan16                → 22/22 通过
npm run test:plan16:dialog-quality → 28/28 通过
npm run test:plan16:all            → 50/50 通过
```

全部 Plan XV + Plan XVI 测试: **113/113 通过**（上一轮已确认）。

---

## 四、改动文件

1. `/Users/jasoncong/Desktop/Decision Brain/源代码/README.md` — 新增"解决的核心痛点"和"Bitget MCP Skills 如何发挥作用"两节，更新测试计数
2. `/Users/jasoncong/Desktop/Decision Brain/源代码/package.json` — 新增 `test:plan16:dialog-quality` 命令，更新 `test:plan16:all`
3. `/Users/jasoncong/Desktop/Decision Brain/README-目录说明.md` — 同步更新测试状态和计数

---

## 五、仍有的风险

1. README 中架构图的 Mermaid 渲染依赖 GitHub 支持；若评委所在平台不支持 Mermaid，需补充静态截图
2. Demo 视频封面 `assets/demo-cover.png` 路径引用需确认实际文件存在

---

## 六、是否阻断最终 Demo

**不阻断。**

原因：
- 全部 7 项自我审查通过
- README 第一屏即可理解项目定位和价值
- Bitget MCP Skills 的 5 个方向、Agent 映射、不交易声明均完整
- Demo 和测试命令可复制运行
- 零敏感信息泄露
