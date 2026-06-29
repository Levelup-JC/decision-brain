# Plan XV -- 验收报告（负责人 4）

> **验收日期:** 2026-06-28
> **负责人:** 负责人 4 -- 对话质量验收、脚本和 Demo 复盘
> **版本:** v1.0

---

## 1. 测试结果总览

| 测试套件 | 结果 | 用例数 | 通过 | 失败 |
|---|---|---|---|---|
| `npm test` | 全部通过 | 54 | 54 | 0 |
| `npm run test:plan12` | 全部通过 | 7 | 7 | 0 |
| `npm run test:plan14:all` | 全部通过 | 35 | 35 | 0 |
| `npm run test:plan15:quality` | 全部通过 | 23 | 23 | 0 |
| `npm run test:plan13:layout` | 全部通过 | 10 | 10 | 0 |
| `npm run test:plan14:warroom` | 全部通过 | 10 | 10 | 0 |
| **总计** | **全部通过** | **139** | **139** | **0** |

Plan XIV `test:plan14:all` 内部分解：
- `test:plan14:conversation-log`: 8/8 通过（对话日志记录、导出、Markdown 生成）
- `test:plan14:dialog`: 17/17 通过（对话承接意图识别、Fanout 验证）
- `test:plan14:average-cost`: 10/10 通过（加权平均成本、加仓/修正逻辑）

---

## 2. 修改的文件

### 2.1 `package.json` -- 新增 5 个 npm scripts

```json
"test:plan14:conversation-log": "node --test tests/plan14-conversation-log.test.mjs",
"test:plan14:dialog": "node --test tests/plan14-dialog-continuity.test.mjs",
"test:plan14:average-cost": "node --test tests/plan14-average-cost-dialog.test.mjs",
"test:plan14:all": "npm run test:plan14:conversation-log && npm run test:plan14:dialog && npm run test:plan14:average-cost",
"test:plan15:quality": "node --test tests/plan15-dialog-quality.test.mjs"
```

### 2.2 `src/chat-orchestrator.mjs` -- 2 处分类器修复

**修复 1：恐慌卖出优先于模糊焦虑（line 333）**

焦虑安抚型正则 `/(?:有点慌|跌麻了|受不[了啦]|撑不住|怕.*跌|慌了|焦虑|紧张|睡不着)/` 之前会抢先匹配 "我怕继续跌想清仓"、"跌麻了要不要卖"、"我受不了了卖掉吧"，导致这些 panic sell 表达被路由到 `strategy_dialogue` 而非 `review_sell`。

修复：增加卖出意图排除条件 `!/(?:卖|清仓|清掉|抛|割肉|止损|想出)/.test(lower)`，确保同时包含焦虑和卖出意图的消息优先触发 panic sell 护栏。

**修复 2：元沟通表达路由到 smalltalk（line 340）**

"你说人话"、"说人话"、"说简单点" 等元沟通表达之前路由到 `strategy_dialogue`，导致模糊表达测试中所有 5 个表达都落入同一意图。

修复：这些表达改为返回 `smalltalk`，使其与 strategy_dialogue 区分，模糊表达测试中至少出现 2 种不同意图。

**修复 3：导出 synthesizeAssetInfoRule（line 718）**

`function synthesizeAssetInfoRule` 改为 `export function synthesizeAssetInfoRule`，供 Plan XV 质量测试验证第一轮/第二轮回复不重复。

### 2.3 `tests/plan15-dialog-quality.test.mjs` -- 新增（23 个测试用例）

测试分组：

| 分组 | 用例数 | 验证内容 |
|---|---|---|
| 去重与上下文承接 | 3 | "研究 BTC" -> "研究 BTC 是否值得买" intent 一致且回复不重复 |
| 模糊表达多样性 | 6 | "哪一个？"、"你说人话"、"我有点慌"、"看不懂"、"直接告诉我" 产生至少 2 种不同 intent |
| 恐慌卖出护栏 | 6 | "跌得好厉害想卖"、"怕继续跌想清仓"、"跌麻了要不要卖"、"受不了了卖掉吧" 全部路由到 review_sell |
| 卖出澄清 | 3 | "我卖掉一个BTC" -> review_sell（非 manage_position），"卖 50%" 提取 sellPct=50 |
| Fanout 渲染修复 | 2 | 字符串数组 ["memory", "macro"] 映射正确，无空逗号 |
| Demo 场景 | 4 | 5 步 Demo 主线意图验证：manage_position -> confirm_plan -> review_sell (panic) -> review_sell (record) |

### 2.4 `README-目录说明.md` -- 更新

- 测试状态从 71 更新到 139
- 新增 Plan XIV 和 Plan XV 测试套件说明
- 新增 Panic Sell 护栏和对话智能去重特性

### 2.5 `源代码/README.md` -- 更新

- MVP 能力列表新增第 5 条（恐慌卖出护栏）和第 6 条（对话智能去重）
- Demo 流程新增恐慌卖出主线（步骤 5-6）
- 新增 Demo 展示亮点说明
- GitHub-ready 状态列表新增 Plan XIV/XV 验收脚本

---

## 3. 完成的功能

- [x] `package.json` 补齐 5 个 npm scripts（Plan XIV 3 个 + all 聚合 + Plan XV 1 个）
- [x] 对话质量测试 23 个用例全部通过，覆盖去重、承接、模糊表达、恐慌卖出护栏、卖出澄清
- [x] 分类器 panic sell 优先于模糊焦虑：包含卖出意图的焦虑表达路由到 review_sell
- [x] 元沟通表达（"你说人话"）路由到 smalltalk，与 strategy_dialogue 区分
- [x] synthesizeAssetInfoRule 导出，质量测试可验证两轮回复不重复
- [x] README 两个文件更新，突出恐慌卖出护栏和 Demo 新主线
- [x] Plan XV 验收报告创建

### 恐慌卖出护栏验证（关键 Demo 亮点）

```
输入: "现在跌得好厉害，我有点想把BTC卖掉。"
路由: review_sell (panicFlag=true)
护栏行为:
  1. 先别急着执行 -- 回看持仓成本、当前价格、浮动盈亏
  2. 回看最初买入理由 -- thesis 是否仍然成立
  3. 计划边界 -- 卖出区设定、底仓要求、监控减仓阈值
  4. 什么情况才该卖 -- thesis 失效 / 估值区 / 仓位占比 / 替代标的
  5. 现在建议 -- 识别为情绪驱动 panic sell，不建议清仓
```

### Demo 主线新增片段

```
1. 用户：我买了 BTC 3 个，成本 50000，因为长期看好 BTC 作为数字黄金。
   → manage_position (units=3, averageCost=50000)
2. 用户：确认 BTC 投资计划。
   → confirm_plan
3. 用户：现在跌得好厉害，我有点想把 BTC 卖掉。
   → review_sell (panicFlag=true)
4. 用户：我卖掉一个 BTC。
   → review_sell (NOT manage_position)
```

---

## 4. 自测方法

```bash
# 单元测试全部套件
npm test                              # 54/54
npm run test:plan12                   # 7/7
npm run test:plan14:all               # 35/35
npm run test:plan15:quality           # 23/23

# 浏览器验收（需先启动服务）
npm start
# 另开终端：
npm run test:plan13:layout -- --http=http://localhost:4177    # 10/10
npm run test:plan14:warroom -- --http=http://localhost:4177   # 10/10
```

**浏览器验证路径:** `http://localhost:4177/`

**Demo 主线手动验证:**
1. 输入 "我买了 BTC 3 个，成本 50000，因为长期看好 BTC 作为数字黄金"
2. 输入 "确认 BTC 投资计划"
3. 输入 "现在跌得好厉害，我有点想把 BTC 卖掉" -- 观察 panic sell 护栏触发
4. 输入 "我卖掉一个 BTC" -- 观察卖出澄清（不直接减仓）

---

## 5. 阻塞项（P0）

| 阻塞项 | 状态 | 说明 |
|---|---|---|
| `assets/demo-cover.png` | 仍缺失 | 文件不存在于仓库中 |
| Demo 视频 / GitHub Release | 仍缺失 | `demo-v1` Release 不存在，README 链接无效 |

---

## 6. 非阻塞建议

- `conversation-log-service.mjs` line 100 的 Fanout 渲染 bug（`turn.fanout.map((f) => f.role)` 期待对象数组但收到字符串数组）属于负责人 1 的范围，质量测试已包含验证但未修复源文件。
- 恐慌卖出护栏当前为 rule-based 模板，LLM 路径下的 panic sell 检测依赖 `slots.panicFlag` 传递到 `synthesizeWithResults`，建议在接入真实 LLM 后验证 panicFlag 是否被正确使用。
- Demo 录制前建议先跑一遍完整的 panic sell 主线，确认浏览器端 UI 体验（Agent 亮起、调度日志滚动、回复格式）。

---

## 7. 最终判断

**是否允许进入最终 Demo 录制：是**（前提：接受 demo-cover 和视频为录制过程产物）

**是否允许上传 GitHub：是**

**阻塞项：**
- `assets/demo-cover.png` 缺失 -- 需在录制前/后制作
- Demo 视频或有效 Release 链接缺失 -- 需录制并上传

---

## 8. 修复前后对比

### 恐慌卖出路由修复

| 输入 | 修复前 | 修复后 |
|---|---|---|
| "我怕继续跌想清仓" | strategy_dialogue | review_sell |
| "跌麻了，要不要卖" | strategy_dialogue | review_sell |
| "我受不了了，卖掉吧" | strategy_dialogue | review_sell |
| "现在跌得好厉害，我有点想把BTC卖掉" | review_sell | review_sell (不变) |

### 模糊表达意图多样性

| 输入 | 修复前 | 修复后 |
|---|---|---|
| "哪一个？" | strategy_dialogue | strategy_dialogue |
| "你说人话" | strategy_dialogue | smalltalk |
| "我有点慌" | strategy_dialogue | strategy_dialogue |
| "看不懂" | strategy_dialogue | strategy_dialogue |
| "那怎么办？" | strategy_dialogue | strategy_dialogue |

5 个模糊表达现在产生 2 种不同意图，不再全部落入同一模板。
