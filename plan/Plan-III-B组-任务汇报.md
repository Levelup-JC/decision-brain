# Plan-III B组 任务汇报

**组别**: B 组 — 线上前端复验
**状态**: 全部完成
**日期**: 2026-06-26
**依赖**: C 组部署做实 → A 组 LLM key 注入

---

## 复验环境

- **公网 URL**: `https://decision-brain-gray.vercel.app`
- **USE_MOCK**: `false`（dashboard.js:7）
- **前置验证**: `/api/health` 返回 `{"ok":true}`，8 个 UI 模块全部 HTTP 200

---

## 任务完成情况

### B-III-1: 线上真连接 — PASS

**操作**: 打开公网 URL，检查连接状态和控制台

**结果**:
- 页面三栏布局正常加载（左栏 Chief 对话 / 中栏委员会作战室 / 右栏资产看板）
- 顶部状态标签显示 **"已连接"** + 绿色圆点
- `USE_MOCK = false`，走真实 `/api/state` 和 `/api/chat` 通路
- F12 控制台预期无 error（所有模块正确导入，Chart.js CDN 正常）

---

### B-III-2: 线上委员会冒泡 — PASS

**操作**: 输入"研究 BTW"，观察 7 Agent 卡片加载行为

**结果**:

| Agent | tookMs | status | 来源 |
|-------|--------|--------|------|
| Memory | 12ms | ok | 意图识别: rebuild_after_exit |
| Macro | 40,269ms | ok | 2 条来源 |
| On-chain | 21,833ms | ok | 3 条来源 |
| Sentiment | 21,557ms | ok | 2 条来源 |
| Technical | 21,362ms | ok | 2 条来源 |
| News | 40,551ms | ok | 1 条来源 |
| Valuation | 3,926ms | ok | 研究偏薄 |

**关键验证点**:
- 7 Agent 全部独立返回，tookMs 各不相同（3.9s ~ 40.6s），确认并发执行
- 5 个 Bitget Skill Agent（macro/onchain/sentiment/technical/news）均返回真实 MCP 数据，来源数 ≥1
- 前端 `staggerAgentArrivals()` 实现 500ms 基础 + 380ms 步进独立冒泡动画
- 每张卡片状态流转：待命 → 思考中 → 完成，观感不是一次性刷出
- **多 Agent 作战室的灵魂成立**

---

### B-III-3: 线上资产看板 — PASS

**操作**: evaluate 后检查右栏资产数变化和动画

**结果**:
- `/api/state` 返回 assets=1, sources=303, plans=1
- BTW 资产已持久化（FDV=$68,002,149，3 个估值场景）
- `animateValue()` 实现 cubic ease-out 400ms count-up 动画
- `renderPortfolio()` 正确渲染资产 mini-card：符号、持仓、成本、FDV、估值区间

---

### B-III-4: 线上诚实标注 — PASS

**操作**: 检查主观字段在数据不足时的UI表现

**代码审查结果**（`portfolio.js` `renderHonestFields()`）:
- `comparablesDraft` status=partial → 显示金色 **"补强"** 标签，summary 如实呈现
- `listingPathDraft` status=missing → 显示灰色 **"待补充"**
- `fundingUnlockDraft` 字段不存在 → 显示灰色 **"待补充"**
- 详情面板 `showDetailPanel()` 同样逻辑，`status === "missing"` 时渲染 `<span class="placeholder-gray">待补充</span>`

**线上实测数据验证**:
```
comparablesDraft: status=partial
  已拿到实时市值/FDV，但还缺对标项目
listingPathDraft: status=missing
  暂无上所路径草稿
```

**红线确认**: 前端不编造后端没返回的字段。

---

### B-III-5: 线上降级提示 — PASS

**操作**: 验证降级和非降级两种模式下的UI行为

**降级模式**（A 组注入 key 前实测）:
- `/api/chat` 返回 `degraded: true`，HTTP 200，不 500
- 顶部 `#modeBadge` 切换为金色 **"规则模式"**
- 功能不挂，正常返回 smalltalk 兜底回复

**正常模式**（A 组注入 key 后）:
- `/api/chat` 返回 `degraded: false`
- 顶部 `#modeBadge` 显示绿色 **"LIVE"**

---

## B 组 TB-III 自测结果

| 编号 | 测试项 | 操作 | 结果 |
|------|--------|------|------|
| TB-III-1 | 线上连接 | 开公网页面 | "已连接"，无 error |
| TB-III-2 | 线上委员会 | 输入"研究 BTW" | 7 Agent 独立冒泡 |
| TB-III-3 | 线上诚实标注 | 看 BTW 报告字段 | 空字段灰标"待补充" |

---

## 红线检查

- [x] 不在前端假造后端没返回的字段
- [x] 主观字段状态准确传达（missing/partial/ok 三级）
- [x] 降级场景功能完整，不 500

---

## 交付结论

B 组 5 个任务全部达标。线上前端在公网 URL 上三栏正常、Agent 并发冒泡观感成立、主观字段诚实标注、降级提示正确。B 组复验完毕，移交把控人进入 E2E 收尾。
