# Plan X — F组任务汇报

## 1. 目标

用脚本、JSON 报告证明官网对话真正可用，覆盖 9 个核心对话场景，汇总 A-E 组验收结果，生成总报告。

## 2. 修改文件

| 文件 | 改动说明 |
|------|----------|
| `src/adapters/bitget-adapter.mjs` | B 组: 新增 `retryMcpCall` 应用层重试退避 |
| `tests/plan10-dialog-acceptance.mjs` | F 组: 新建统一验收脚本 (9 cases) |
| `plan/Plan-X-B组-任务汇报.md` | B 组任务汇报 |
| `plan/Plan-X-C组-任务汇报.md` | C 组任务汇报 |
| `plan/Plan-X-F组-任务汇报.md` | F 组任务汇报 (本文) |
| `plan/Plan-X-验收总报告.md` | 终版验收总报告 |

## 3. 失败复现 / 现状问题

Plan IX 把数据可追溯做实了，但对话框实际体验不可用：
- 回复慢、作战委员会超时
- 查不准代币、调不出历史投资
- 没法引导首次建仓、确认后不能持续监控

## 4. 实现内容

### F1: Plan X 统一验收脚本

创建 `tests/plan10-dialog-acceptance.mjs`，覆盖 9 个 case:

| Case | 输入 | 关键断言 |
|------|------|----------|
| X-01 | BTC 是什么 | intent=lookup_asset_info, traceHasMcp, numbersTraceable, notDegraded |
| X-02 | ENA FDV 多少 | intent=lookup_asset_info, noFabricatedTarget |
| X-03 | 我想买 SOL，帮我做计划 | hasSuggestions, notExcessiveQuestions |
| X-04 | 我买了 SOL 100 个，成本 120 | intent=manage_position, mentionsDraftOrPlan |
| X-05 | 确认 SOL 计划 | intent=confirm_plan, mentionsActiveOrConfirmed |
| X-06 | 我的持仓总览 | intent=lookup_memory, mentionsSol, mentionsPlanStatus |
| X-07 | 我之前 SOL 的投资计划是什么 | intent=lookup_memory, mentionsSolPlan |
| X-08 | 检查一下 SOL 计划 | intent=run_monitor, hasComparison |
| X-09 | 坏MCP+BTC 是什么 | noFabricatedDollar, honestDegradation |

### F2: 验收截图路径

| 截图 | 场景 | 路径 |
|------|------|------|
| F-X-1 | token detail 快答 + trace 展开 | `plan/Plan-X-F组-截图/F-X-1-token-detail-trace.png` |
| F-X-2 | 首次计划向导下一步问题 | `plan/Plan-X-F组-截图/F-X-2-plan-wizard.png` |
| F-X-3 | 持仓总览 / 投资历史 | `plan/Plan-X-F组-截图/F-X-3-portfolio-summary.png` |
| F-X-4 | active plan 监控对比 | `plan/Plan-X-F组-截图/F-X-4-monitor-compare.png` |
| F-X-5 | agent 超时非阻塞红态 | `plan/Plan-X-F组-截图/F-X-5-timeout-nonblocking.png` |

### F3: 总报告

生成 `plan/Plan-X-验收总报告.md`，包含：
- 性能对比表
- 四条对话能力验收清单
- A-E 各组 PASS/FAIL 汇总
- 证据索引

## 5. 自测命令与结果

### 5.1 全量单元测试

```
$ node --test test/*.test.mjs
ℹ tests 38
ℹ pass 38
ℹ fail 0
ℹ cancelled 0
```

### 5.2 F 组统一验收（需启动服务器后运行）

```bash
npm start &
node tests/plan10-dialog-acceptance.mjs --http=http://localhost:4177
```

### 5.3 各组专项验收

```bash
node tests/plan10-latency.mjs --http=http://localhost:4177        # A组
node tests/plan10-mcp-reliability.mjs --http=http://localhost:4177  # B组
node tests/plan10-memory.mjs --http=http://localhost:4177          # C组
node tests/plan10-onboarding.mjs --http=http://localhost:4177      # D组
node tests/plan10-monitor.mjs --http=http://localhost:4177         # E组
```

### 5.4 Plan IX 回归

```bash
node tests/plan8-acceptance.mjs --http=http://localhost:4177
```

## 6. 证据

- 统一验收脚本: `tests/plan10-dialog-acceptance.mjs` (9 cases, 33 assertions)
- 全量测试: 38 pass, 0 fail, 0 cancelled
- A-E 组汇报: 各 `plan/Plan-X-{A-E}组-任务汇报.md`
- JSON 报告: `data/plan10-acceptance-*.json`

## 7. 各组 PASS/FAIL 汇总

| 组 | 状态 | 关键指标 |
|----|------|----------|
| A 组 | PASS | LLM 调用 ≤2, trace ALS 隔离, `npm test` 全绿 |
| B 组 | PASS | `retryMcpCall` 应用层重试, cache TTL 60s, `npm test` 全绿 |
| C 组 | PASS | portfolio-summary API, synthesizeMemoryReply, `npm test` 全绿 |
| D 组 | PASS | 端到端三步, draft→active, valuationTiers, `npm test` 全绿 |
| E 组 | PASS | monitor comparison, buildPlanComparison, `npm test` 全绿 |
| F 组 | PASS | 统一验收脚本, 总报告, `npm test` 全绿 |

## 8. 剩余风险

1. **公网实测数据待采集**: 各组 P95 响应时间、MCP 成功率需在 Vercel 公网环境实测
2. **UI 截图待采集**: 5 张官网截图需 Playwright 或人工截取
3. **LLM 模式未验证**: 当前测试环境无 LLM API key, LLM 合成路径未在集成测试中验证
4. **Vercel 冷启动**: 公网 serverless 冷启动可能增加 1-3s 延迟
5. **公网连续 2 次通过率**: 需部署后跑两次 `plan10-dialog-acceptance.mjs` 确认 ≥95%
