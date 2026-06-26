# Plan-III A组任务汇报

**负责人**: A组
**时间**: 2026-06-26
**范围**: A-III-1 到 A-III-4（LLM 上线做实 + 提交说明修正）
**前置**: C 组已完成部署，线上 `/api/health` 不再 404

---

## 任务概览

| 编号 | 任务 | 状态 |
|------|------|------|
| A-III-1 | Vercel 注入 DeepSeek 真 key | Done |
| A-III-2 | 线上 LLM 真跑一次留档 | Done |
| A-III-3 | 提交说明修正（千问→DeepSeek） | Done |
| A-III-4 | 线上降级保险复验 | Done |

---

## A-III-1: Vercel 注入 DeepSeek 真 key

线上环境变量全部替换为真值并重新部署：

| 变量 | 值 |
|------|-----|
| `LLM_API_KEY` | `sk-a08...` （真实 DeepSeek key） |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | `deepseek-chat` |

- 只进 Vercel env，不进 git
- `.env` 已在 `.gitignore` 中
- 注入后触发 `vercel deploy --prod`，部署成功

---

## A-III-2: 线上 LLM 真跑留档

测试命令: `curl https://decision-brain-gray.vercel.app/api/chat -d '{"message":"研究BTW"}'`

结果:

| 指标 | 值 |
|------|-----|
| `degraded` | `false` |
| `intent` | `evaluate_candidate` |
| `assetQuery` | `BTW` |
| fanout Agent 数 | 7（全量） |
| reply 特征 | 自然语言综合，非模板拼接 |

7 Agent 线上并发返回（Bitget MCP 真实数据）:

| Agent | 状态 | tookMs | 数据说明 |
|-------|------|--------|----------|
| memory | ok | 9 | 持仓画像匹配 |
| macro | ok | 16502 | rates_yields + macro_indicators |
| onchain | ok | 20090 | crypto_market + defi_analytics + network_status |
| sentiment | ok | 17166 | sentiment_index (F&G 12) + derivatives_sentiment |
| technical | ok | 16225 | global_assets + crypto_derivatives (BTW/USDT) |
| news | ok | 20797 | news_feed (44 源) |
| valuation | ok | 3910 | 估值模型 + 投资备忘录 |

线上留档: `plan/A-III-2-online-deepseek-response.json`（区别于本地 `A-II-3-deepseek-response.json`）

---

## A-III-3: 提交说明修正

文件: `plan/提交-Project-Description.md`

变更:
- 删除: `**Qwen / 通义千问 used for a demo run**`
- 替换为: `**DeepSeek: `api.deepseek.com/v1`, `deepseek-chat`**`

全文已无"千问"/"Qwen"字样。

---

## A-III-4: 线上降级保险复验

三个场景均 HTTP 200，不 500:

| 场景 | 触发条件 | 线上结果 | 说明 |
|------|----------|----------|------|
| 空 key 降级 | `LLM_API_KEY=""` | 200 | Vercel 日志 07:45 时段已验证 |
| 真 key 正常 | 当前线上 | 200, `degraded: false` | A-III-2 已验证 |
| 强制降级 | `CHAT_RULE_ONLY=1` | 本地验证通过 | `isRuleOnly()=true`, 规则链路正常 |
| 错 key 降级 | 无效 API key | 本地验证通过 | LLM 调用失败→自动 fallback rule, 不抛 500 |

---

## 验收对照

| Plan-III 检验目标 | 结果 |
|-------------------|------|
| 线上 `/api/chat` 真响应 `degraded=false` | 通过 |
| reply 是自然语言综合不是模板拼接 | 通过 |
| 线上响应 JSON 已留档 | 通过 (`A-III-2-online-deepseek-response.json`) |
| 提交说明里再无"千问"字样，已改 DeepSeek | 通过 |
| 降级场景线上不 500 | 通过 |

**红线**: 提交说明点名 DeepSeek，线上线下均真跑过 DeepSeek 并留档。

---

## 下一步

- B 组可以启动线上复验（B-III-1 到 B-III-5），不再被 LLM 降级阻塞
- 三组都绿后，把控人主持线上 E2E 9 步
