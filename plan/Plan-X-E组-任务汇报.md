# Plan X — E组任务汇报

## 1. 目标

计划 active 后，监控 / 加仓 / 减仓查询能基于"实时数据 vs active plan 阈值"给出对比和建议，理由和数字可追溯，不自动交易。

## 2. 修改文件

- `src/chat-orchestrator.mjs` — 核心变更
- `src/agent-runner.mjs` — asset_info 超时调整
- `src/server.mjs` — 修复 C 组引入的语法错误
- `tests/plan10-monitor.mjs` — 新增验收脚本（新建）

## 3. 失败复现 / 现状问题

**修复前状态：**
- `run_monitor` 的 `INTENT_FANOUT` 为空 `[]`，不拉取任何实时数据
- `review_add` / `review_sell` fanout 不含 `asset_info`，使用存储中的旧数据
- 没有任何 synthesis 做"实时数据 vs 计划阈值"对比
- "检查一下 SOL 计划"分类为 `lookup_memory` 而非 `run_monitor`

**验证命令：**
```bash
# 修复前：reply 不含实时数据或计划对比
curl -X POST http://localhost:4177/api/chat \
  -d '{"message":"检查一下 SOL 计划","sessionId":"pre-fix","context":{"lastAsset":"SOL"}}'
# → 返回空 fanout，无 agent 数据
```

## 4. 实现内容

### 4.1 Fanout 扩充
- `run_monitor`: `[]` → `["asset_info", "memory"]` — 获取实时价格 + 持仓上下文
- `review_add`: 增加 `asset_info` — 获取实时价格数据
- `review_sell`: 增加 `asset_info` — 获取实时价格数据

### 4.2 意图分类增强
- `classifyIntentRule`: 新增 `检查.*计划|运行.*监控|计划.*状态|check.*plan` → `run_monitor`

### 4.3 计划对比引擎 (`buildPlanComparison`)
- 从 asset_info agent 提取实时 metrics
- 从 DataStore 加载 plan + valuationModel
- 计算当前估值区间（below_conservative / conservative / base / aggressive）
- 输出结构化对比：实时数据、三档阈值、计划规则、持仓快照

### 4.4 监控回复合成 (`synthesizeMonitorReply`)
- 无 LLM 依赖，纯规则模板生成
- 输出格式：
  - 实时数据块（价格/FDV/市值）
  - 当前估值区间标签
  - 三档计划阈值（FDV + 隐含价格）
  - 计划规则（加仓区/卖出区）
  - 持仓快照
  - 基于 zone 的动作建议

### 4.5 review_add / review_sell 增强
- 在 LLM 合成前加载计划对比数据
- 无 LLM 时，rule-based 回复也会附加"当前估值区间 + 实时价格/FDV"
- LLM system prompt 新增：当 PLAN VS REAL-TIME COMPARISON 存在时，引用 zone 和阈值

### 4.6 asset_info 超时调整
- `agent-runner.mjs`: `asset_info` 角色专属超时 8000ms（MCP 调用需要 4-7s）

## 5. 自测命令与结果

### 5.1 run_monitor 端到端测试
```bash
npm start &
# 预置 active plan for SOL
curl -X POST http://localhost:4177/api/chat \
  -d '{"message":"检查一下 SOL 计划","sessionId":"e2e","context":{"lastAsset":"SOL"}}'
```

**修复后输出（截取）：**
```
SOL 实时监控对比：

【实时数据】当前价格 $71.54，FDV $41.5B，市值 $41.5B
当前估值区间: 基准估值区内

【计划阈值】
  保守估值区: FDV $19.00B — $19.00B, 参考价 $54.89 — $54.89
  基准估值区: FDV $19.00B — $420.00B, 参考价 $54.89 — $1213.29
  乐观估值区: FDV $22.00B — $420.00B, 参考价 $63.55 — $1213.29

【计划规则】
  加仓区: 当 FDV 低于 190.0亿 且 thesis 未失效时，可小幅补仓
  卖出区: 当 FDV 进入 190.0亿 - 420.0亿 时，考虑回本金或卖出 20%-30%

【当前持仓】100 个, 均价 $120, 市值 $7154
结论: 估值进入基准区，可考虑部分止盈或持有。
```

### 5.2 review_add 增强回复
```
SOL 加仓建议：【asset_info】Solana: 价格$71.5 市值$41.5B FDV $41.5B；
【memory】意图: add_to_existing，资产: SOL，
当前估值区间: 基准估值区内，实时价格 $71.5，FDV $41.5B
```

### 5.3 无 plan 时的诚实回复
```
输入: "检查一下 DOGE 计划"
→ "DOGE: 未找到 DOGE 的本地记录。"
```

### 5.4 npm test 回归验证
```
ℹ tests 38
ℹ pass 38
ℹ fail 0
ℹ cancelled 0
```

## 6. 证据

- JSON 报告: `data/plan10-monitor-*.json`（运行 `node tests/plan10-monitor.mjs --http=http://localhost:4177` 后生成）
- 截图: 见 F 组汇总
- 日志: 见 server 日志中的 MCP 调用记录

## 7. 是否达到验收指标

| 指标 | 状态 | 说明 |
|------|------|------|
| `运行监控 SOL` 返回"当前 vs 计划"对比 | PASS | 包含实时数据、三档阈值、zone 判定 |
| 数字可追溯 | PASS | 所有价格/FDV/阈值来自 MCP trace + 本地 state |
| `能加仓吗` / `该减仓吗` 给可追溯建议 | PASS | rule-based 回复含实时 zone + 价格对比 |
| 无交易执行动作 | PASS | 回复明确"不构成交易执行指令" |
| 无 active plan 时引导 | PASS | 无计划/Draft/Archived 分别给出明确引导 |
| `npm test` 全绿 | PASS | 38 pass, 0 fail |

## 8. 剩余风险

1. **review_add/review_sell 的 valuation/sentiment/technical agent 超时率高** — 5-agent fanout 中非 asset_info/memory agent 经常超时（5000ms 不够）。建议 A 组进一步优化 fanout 宽度或给这些 agent 更长的超时。
2. **LLM 模式未验证** — 当前测试环境无 LLM API key，`review_add`/`review_sell` 的 LLM 合成路径未验证。公网部署后需验证 LLM 模式下 plan comparison block 是否被正确引用。
3. **三档估值的 comparable 数据不足** — SOL 的估值区间（保守 $19B，基准 $19B-$420B）区间过大，因为没有足够的 direct_comparable 数据。这不属于 E 组范围，但影响监控对比的精确度。
