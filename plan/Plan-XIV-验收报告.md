# Plan XIV — 验收报告（负责人 4）

> **验收日期:** 2026-06-28  
> **负责人:** 负责人 4 — Agent 可见性、验收与报告更新  
> **版本:** v1.0

---

## 1. 测试结果总览

| 测试套件 | 结果 | 详情 |
|---|---|---|
| `npm test` | 54/54 通过 | 单元测试全部通过 |
| `npm run test:plan12` | 7/7 通过 | Plan XII 组合摘要与加权成本 |
| `npm run test:plan13:layout` | 10/10 通过 | 三列布局验证 |
| `npm run test:plan14:warroom` | 10/10 通过 | Agent 可见性验证（新增） |
| **总计** | **81/81** | **全部通过** |

---

## 2. 修改的文件

### 2.1 `src/ui/committee.js` — 修复滚动行为

**修改：** `addDispatchEntry` 函数中，将 `document.getElementById("warRoomBody").scrollTop = ...` 改为 `log.scrollTop = log.scrollHeight`。

- 之前：每次追加调度日志时自动滚动整个右侧列到最底部，导致 Agent 卡片被挤出视野。
- 之后：只滚动调度日志容器内部，Agent 卡片区域保持可见。

### 2.2 `src/ui/dashboard.html` — CSS 布局修复

**修改：**
- `.agent-status-panel` 添加 `position: sticky; top: 0; z-index: 2; background: var(--bg-surface); padding-bottom: 4px;`
- `.col-war-room .col-body` 添加独立 `overflow-y: auto`
- `.dispatch-log` 和 `.trace-feed` 保持 `overflow-y: auto`（已有）

效果：Agent 卡片区在用户滚动时固定在右侧顶部，调度日志和 Trace 日志只在各自区域内滚动。

### 2.3 `tests/plan14-war-room-visibility.mjs` — 新增测试

10 个测试用例验证：
- Agent 面板使用 sticky 定位
- Agent 卡片在 agent-status-panel 内
- 调度日志和 Trace Feed 独立滚动
- 移动端布局顺序正确（Chief → 资产 → Agent）
- committee.js 不再滚动 warRoomBody

### 2.4 `package.json` — 新增脚本

- `"test:plan14:warroom": "node tests/plan14-war-room-visibility.mjs"`

### 2.5 `plan/Plan-XIII-验收报告.md` — 报告更新

- 修正 "Plan XIII 截图缺失" 为 "已就绪（6 张）"，与实际文件状态一致。

---

## 3. 完成的功能

- [x] 右侧 Agent 卡片区域固定在右侧顶部
- [x] `addDispatchEntry()` 只滚动 `dispatchLog` 内部，不滚动整个右侧列
- [x] `addDynamicTraceEntry()` 只滚动 `traceFeed` 内部（此前已正确）
- [x] 被调用 Agent 在 1 秒内亮起（stagger 120ms/card，8 张卡共计约 840ms）
- [x] 调度日志在自己的框里滚动
- [x] 动态 Trace 在自己的框里滚动
- [x] Agent 卡片始终可见，不需用户手动上拉
- [x] 移动端顺序保持：Chief 对话 → 资产主看板 → Agent 作战室
- [x] Plan XIII 验收报告截图状态已修正
- [x] Plan XIV 验收报告已创建

---

## 4. 如何自测

```bash
# 单元测试
npm test                              # 54/54 通过

# Plan XII 组合测试
npm run test:plan12                   # 7/7 通过

# 启动服务后运行：
npm start

# 另开终端：
npm run test:plan13:layout -- --http=http://localhost:4177   # 10/10 通过
npm run test:plan14:warroom -- --http=http://localhost:4177  # 10/10 通过
```

**浏览器验证路径:** `http://localhost:4177/`

**验证操作:**
1. 输入 "研究 BTC" 发送
2. 观察右侧 Agent 卡片在调度过程中是否保持可见
3. 观察调度日志是否在自己的框内滚动
4. 输入 "SOL 值得买吗" 发送
5. 重复观察

---

## 5. 阻塞项（P0）

| 阻塞项 | 状态 | 说明 |
|---|---|---|
| `assets/demo-cover.png` | ❌ 仍缺失 | 文件不存在于仓库中 |
| Demo 视频 / GitHub Release | ❌ 仍缺失 | `demo-v1` Release 不存在，README 链接无效 |

---

## 6. 非阻塞建议

- 调度制度（dispatch-policy）和 Bitget MCP Skills 区也随 warRoomBody 滚动，在长对话中可能被滚出视野。如果后续需要，可将它们也设为 sticky 或移入 agent-status-panel。
- 当前 Agent 卡片 stagger 时间为 120ms/card，总共约 840ms。如需更快亮起，可缩短 stagger 间隔。

---

## 7. 最终判断

**是否允许进入最终 Demo 录制：是**（前提：接受 demo-cover 和视频为录制过程产物）

**是否允许上传 GitHub：是**

**阻塞项：**
- `assets/demo-cover.png` 缺失 — 需在录制前/后制作
- Demo 视频或有效 Release 链接缺失 — 需录制并上传
