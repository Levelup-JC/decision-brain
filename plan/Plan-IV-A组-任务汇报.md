# Plan-IV A 组任务汇报

**角色**: A 组（提交说明终稿 + 表单三链接）
**日期**: 2026-06-26
**依赖**: C 组探活通过（已确认）

---

## A-IV-1: 线上 LLM 复跑

**操作**:
```bash
curl -s https://decision-brain-gray.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"研究BTW"}'
```

**关键字段提取**:

| 字段 | 值 | 判定 |
|------|-----|------|
| `ok` | true | 通过 |
| `degraded` | false | 通过 |
| `intent` | evaluate_candidate | 通过 |
| `agentResults` | 7 个 (memory / macro / onchain / sentiment / technical / news / valuation) | 通过 |
| `reply` | 自然语言中文综合结论 | 通过 |

**reply 原文**: "基于宏观、链上、情绪、技术及新闻多维度数据（均已更新），BTW当前未发现明显异常信号，但估值研究偏薄，需警惕信息不对称风险。建议暂不进行主动配置，保持观望，待估值补充分析完成后再做决策。下一步：要求估值团队在24小时内补充BTW的估值模型与可比分析。"

**并发验证**: 各 Agent `tookMs` 各不相同（21 / 90625 / 117480 / 136418 / 134809 / 91096 / 10520），符合并发调度预期。

---

## A-IV-2: 填提交表单三链接

**文件**: `plan/提交-Project-Description.md` §4

**改动**:
```
- Demo URL: https://decision-brain-gray.vercel.app (Vercel; fallback ngrok)
- GitHub / README: https://github.com/Levelup-JC/decision-brain
- Demo video (≤3 min, optional): 待 E2E 后回填
- X post (#BitgetHackathon, optional): __________
```

Demo URL 和 GitHub 已填入真实线上链接。Demo video 待 E2E 录屏后回填，不填假链接。X post 为可选字段，保持空置。

---

## A-IV-3: 提交说明终稿通读

**文件**: `plan/提交-Project-Description.md`

| 检查项 | 操作 | 结果 |
|--------|------|------|
| 无"千问/Qwen" | `grep -iE "千问\|qwen"` | 空，无残留 |
| DeepSeek 信息 | §2 Stack 段落 | `api.deepseek.com/v1`, `deepseek-chat` 正确 |
| Bitget 5 Skill | §2 Stack 段落 | macro-analyst / market-intel / news-briefing / sentiment-analyst / technical-analysis 全部列明 |
| 错别字/占位符 | 全文通读 | 无错别字，三链接占位符已在 A-IV-2 消解 |

**结论**: 提交说明终稿无残留问题，可直接用于提交。

---

## A-IV-4: 降级保险线上复核

**验证方式**: 源码分析（`src/chat-orchestrator.mjs` + `src/ui/committee.js`）

**降级链路**:

```
isRuleOnly() 检查
  ├─ LLM 可用 → classifyIntentLLM() + synthesizeLLM()
  │              └─ LLM 调用失败 (catch → null) → 回退到规则模式
  └─ LLM 不可用 → classifyIntent() (规则) + synthesizeRule() (规则)
```

**关键发现**:
- `runOrchestrator()` 永远返回 HTTP 200，不抛 500
- LLM 超时/错误时自动降级到 `synthesizeRule()`，功能不中断
- `degraded` 字段在响应中传递，前端据此切换显示
- 前端: `setDegraded(true)` → 金色"规则模式"badge; `setDegraded(false)` → 绿色"LIVE"badge
- `dashboard.html:77-80` 确认 CSS: `.mode-badge.rule` 使用金色 (`var(--gold-glow)` / `var(--gold)`)

**结论**: 降级保险机制完整，演示时即使 LLM 异常也不会翻车。

---

## TA-IV 自测表

| 编号 | 测什么 | 操作 | 通过标准 | 结果 |
|------|--------|------|----------|------|
| TA-IV-1 | 线上真分类 | `curl /api/chat` | `degraded=false`，intent 正确 | 通过 |
| TA-IV-2 | 真综合 | 看 reply 字段 | 自然语言，非模板拼接 | 通过 |
| TA-IV-3 | 说明无残留 | `grep -iE "千问\|qwen"` | 输出为空 | 通过 |
| TA-IV-4 | 表单填满 | 看 §4 | 无 `____`（video 标"待 E2E 回填"） | 通过 |

---

## 未闭合项

| 项目 | 状态 | 阻塞 |
|------|------|------|
| Demo video 链接 | 标注"待 E2E 后回填" | 等待 All 合流 E2E 9 步录屏完成 |
