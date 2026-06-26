# Plan-VIII-B组-任务汇报

> 角色：B组 — 资产事实数据管线
> 时间：2026-06-26
> 状态：全部 7 项自检通过 + 公网验收 30/30 通过

## 改动清单

| # | 文件 | 改动 | 对应问题 |
|---|------|------|---------|
| 1 | `src/services/asset-info-service.mjs` | **新建** - 封装 enrichAsset，输出结构化档案 + 60s LRU 缓存 | D-3/D-4 |
| 2 | `src/agent-runner.mjs:89-134` | 新增 `asset_info` 分支，调用 asset-info-service | 主链 |
| 3 | `src/services/asset-service.mjs:164-166` | `shouldEnrichIdentity` 增加 `opts.forceEnrich` 条件 | D-4 |
| 4 | `src/chat-orchestrator.mjs:246-306` | `synthesizeLLM` 注入 `asset_info` 的原始数字；system prompt 加硬约束 | D-5 |
| 5 | `src/adapters/bitget-adapter.mjs:773-789` | `lookupAssetMarketData` 增加 crypto_market price 端点调用 | D-3 |
| 6 | `tests/plan8-acceptance.mjs` | D组验收脚本 — 添加 undici ProxyAgent 代理支持 | 公网验收 |

## 7 项自检结果

| # | 检查项 | 结果 | 证据 |
|---|--------|------|------|
| 1 | runAgent('asset_info','BTC') 返回真实 price/marketCap/FDV，BTC marketCap 在万亿量级 | PASS | marketCap=$1,188.8B |
| 2 | ETH/SOL 返回合理量级数字 | PASS | ETH $187.9B, SOL $40.1B |
| 3 | ENA 通过 enrichAsset 拿到数据，FDV 非 0 | PASS | FDV=$0.7B |
| 4 | 回复中数字可在 agentResults 追溯 | PASS | headline 含真实价格/市值，synthesizeLLM 注入 currentMetrics |
| 5 | MCP 不可达时明确说"暂无法获取实时数据"，不编造数字 | PASS | degraded 模式下 status=degraded, price=null |
| 6 | 大币富化只在 lookup_asset_info 下打开，其他路径不变 | PASS | evaluate/sell 路径 regression 测试全绿（17/17） |
| 7 | 60s LRU 缓存 BTC/ETH/SOL，第二次不重复打 MCP | PASS | cached=true, 首次 tookMs ~3000ms |

## 公网验收结果 (2026-06-26)

```
node tests/plan8-acceptance.mjs --http=https://decision-brain-gray.vercel.app

Data: 5/5  Obs: 4/4
Total: 30/30 passed (100.0%)
```

| ID | 描述 | 结果 | 耗时 |
|----|------|------|------|
| p8-dc-01 | BTC — 真实市值/价格 | PASS | ~11.9s |
| p8-dc-02 | ETH — 真实市值/价格 | PASS | ~9.8s |
| p8-dc-03 | SOL — 真实市值/价格 | PASS | ~9.3s |
| p8-dc-04 | ENA — FDV 非 0 | PASS | ~9.5s |
| p8-dc-05 | 大盘误触防护 | PASS | ~10.3s |
| p8-ob-01 | trace 非空 | PASS | ~9.3s |
| p8-ob-02 | trace 含真实 MCP 调用 | PASS | ~9.5s |
| p8-ob-03 | 超时场景 degraded | PASS | ~10.7s |
| p8-ob-04 | ruleOnly 字段暴露 | PASS | ~3.2s |

## 关键数据验证

```
BTC: price=$59,319 marketCap=$1,189.2B FDV=$1,189.2B  [万亿量级 ✓]
ETH: price=$1,557  marketCap=$187.9B   FDV=$187.9B    [千亿量级 ✓]
SOL: price=$69.01  marketCap=$40.1B    FDV=$40.1B     [百亿量级 ✓]
ENA: price=$0.078  marketCap=$0.7B     FDV=$0.7B      [亿级 ✓]
```

## 红线遵守

- 合成 prompt 中**未写死任何市值常量**，数字全部运行时注入
- 大币富化通过 `opts.forceEnrich` 显式控制，非侵入
- `unknown` 意图不调 MCP（只在 `lookup_asset_info` 下精准命中）
- 不碰交易 Tools、不留私钥

## MCP 调用链路

```
用户 "BTC是什么"
  → classifyIntentRule → lookup_asset_info + assetQuery=BTC
  → INTENT_FANOUT → ["asset_info"]
  → runAgent("asset_info", "BTC")
  → getAssetInfo("BTC")
  → bitget.enrichAsset({symbol:"BTC"})
  → crypto_market search "BTC"       [MCP call 1]
  → crypto_market price coin=bitcoin  [MCP call 2] ← 价格端点
  → dex_market search "Bitcoin"      [MCP call 3]
  → currentMetrics: {price, marketCap, fdv} ← 真实数字
  → synthesizeLLM 注入 REAL-TIME MARKET DATA block
  → reply 含真实价格/市值
```

## 缓存 Trace 修复

- 问题：60s 缓存不携带 trace，导致同一大币连续查询时 trace 为空
- 修复：`setCache` 时存储 `_trace: tc.snapshot()`，缓存命中时标记 `cached: true`
- 验证：首次调用 3 条 trace (cached=false)，缓存命中 3 条 trace (cached=true)

## 公网部署

- 部署地址：https://decision-brain-gray.vercel.app
- 环境变量：`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` 已在 Vercel Production 配置
- 部署版本：commit `6e7857e` (Plan-VIII 全组合入)

## 依赖关系

- A 组（意图路由）：已完成，`lookup_asset_info` 意图 + fanout 映射已就位
- C 组（可观测性）：trace collector 已集成到 adapter，`runFanoutAgents` 已返回 trace
- D 组（双维度回归守门）：验收脚本 30/30 通过，支持 HTTP 代理环境
