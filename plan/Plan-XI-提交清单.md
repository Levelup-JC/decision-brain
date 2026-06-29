# Plan XI — 提交材料清单

> **检查时间:** 2026-06-28
> **提交目标:** Bitget 黑客松 S1 (Trading Agent 赛道)

---

## 提交材料 Checklist

### 代码与仓库

- [x] 源代码完整可运行 (`npm start` / `npm run mcp`)
- [x] 50 个测试全部通过 (`npm test`)
- [x] plan11-demo-acceptance.mjs 验收脚本已完成 (75% pass, 42/45 assertions)
- [ ] GitHub 仓库设为公开 / 提交压缩包

### Demo 视频 (目标 6 分钟)

- [ ] 录制屏幕 + 画外音
- [ ] 覆盖 7 个场景: 快查 -> 研究 -> 建仓 -> 总览 -> 监控 -> 策略对话 -> 断网
- [ ] 格式: mp4, <200MB

### 截图 (7 张)

- [ ] J-01: Dashboard 全景三栏布局
- [ ] J-02: BTC 快查 + trace 展开
- [ ] J-03: 研究 SOL + 多 Agent 并发
- [ ] J-04: Bitget MCP Skill 标签展示
- [ ] J-05: SOL 资产详情面板
- [ ] J-06: 检查 SOL 计划: 实时 vs 计划阈值
- [ ] J-07: MCP 不可用 / 降级红态

### 文档

- [x] PRD.md (项目需求文档)
- [x] README.md (项目总览)
- [x] Plan X 验收总报告
- [x] Plan XI Demo 打磨计划
- [x] Plan XI Demo 脚本 (Plan-XI-H组-Demo脚本.md)
- [x] Plan XI 评委 FAQ (Plan-XI-H组-评委FAQ.md)
- [x] Plan XI 性能数据
- [x] Plan XI 验收报告 (Plan-XI-验收报告.md)
- [x] Plan XI 提交清单 (本文件)

### 公网演示

- [ ] 部署到 `https://decision-brain-gray.vercel.app` (或其它公网地址)
- [ ] 本地 Mock 模式验证通过 (`?mock=1`)

---

## 验收结果摘要 (2026-06-28)

| 验收项 | 状态 | 数据 |
|---|---|---|
| npm test | PASS | 50 pass, 0 fail |
| plan11-demo-acceptance | 75% | 6/8 cases, 42/45 assertions |
| plan10-dialog-acceptance | 44% | 4/9 cases, 27/33 assertions |
| plan10-mcp-reliability | PASS | 100% success rate |
| dialogFrame | DELIVERED | 所有 intent 返回完整 dialogFrame |
| dispatchPlan | DELIVERED | Bitget MCP 8 角色映射完整 |
| strategy_dialogue | DELIVERED | 开放式策略问题正确路由 |

---

## 快速验证命令

```bash
# 预设 Demo 状态 (3 资产: SOL/BTC/ETH)
node scripts/demo-preset.mjs

# 启动服务
npm start
# 浏览器打开: http://localhost:4177

# 运行全部单元测试
npm test

# 运行 Demo 验收脚本 (需要先 npm start)
node tests/plan11-demo-acceptance.mjs --http=http://127.0.0.1:4177

# 运行 Plan X 验收脚本
node tests/plan10-dialog-acceptance.mjs --http=http://127.0.0.1:4177
node tests/plan10-mcp-reliability.mjs --http=http://127.0.0.1:4177

# 重置 Demo 状态
curl -X POST http://localhost:4177/api/reset
```
