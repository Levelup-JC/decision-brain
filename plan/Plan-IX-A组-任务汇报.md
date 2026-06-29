# Plan IX — A 组任务汇报

## 1. 修改文件

- `src/chat-orchestrator.mjs` — 三处修改
- `test/chat-orchestrator-context.test.mjs` — 增强测试覆盖

## 2. 失败复现

**根因**: `extractSlotsRule` 在 Layer 1 无条件使用 `context.lastAsset`，不区分意图。当 UI 传入 `{lastAsset: "BTC"}` 后用户说"你好"，`extractSlotsRule` 将 `assetQuery` 设为 `"BTC"`，导致 smalltalk 被污染。

复现命令：

```bash
node -e "
const { classifyIntent } = await import('./src/chat-orchestrator.mjs');
// Before fix: assetQuery would be 'BTC' because context.lastAsset leaks into smalltalk
console.log(JSON.stringify(classifyIntent('你好', { lastAsset: 'BTC' })));
"
```

修复前输出: `{"intent":"smalltalk","slots":{"assetQuery":"BTC",...}}` — 错误。

## 3. 修复内容

### 修改 1: `extractSlotsRule` 增加意图参数，限制 `context.lastAsset`

`extractSlotsRule(message, context = {}, intent = null)` — 新增第三个参数。`context.lastAsset` 仅在 intent 不是 `smalltalk`/`unknown` 时生效。

```js
const NO_LAST_ASSET_INTENTS = new Set(["smalltalk", "unknown"]);
if (!slots.assetQuery && context.lastAsset && (!intent || !NO_LAST_ASSET_INTENTS.has(intent))) {
  slots.assetQuery = context.lastAsset;
}
```

### 修改 2: `classifyIntent` 传递意图

```js
const slots = extractSlotsRule(message, context, intent);
```

### 修改 3: `runOrchestrator` 合并步骤传递意图

```js
const ruleSlots = extractSlotsRule(message, context, classification.intent);
```

### 修改 4: stopwords 增加常见问候词

`"hello", "hi", "hey", "thanks", "help", "test"` 加入 `LOWER_STOPWORDS`，防止被误提取为 ticker。

## 4. 修复后验证

### 4.1 专项测试

```bash
node --test test/chat-orchestrator-context.test.mjs
```

输出：

```
✔ smalltalk should not inherit the last focused asset from stored traces
✔ sell review can still inherit the last focused asset from stored traces
✔ smalltalk should not inherit context.lastAsset
✔ smalltalk should not inherit context.lastAsset (English)
✔ review_add can still inherit context.lastAsset
✔ review_sell can still inherit context.lastAsset
✔ 大盘 should not trigger lookup_asset_info even with lastAsset context
ℹ tests 7
ℹ pass 7
ℹ fail 0
```

### 4.2 全量测试

```bash
npm test
```

输出：

```
ℹ tests 38
ℹ pass 38
ℹ fail 0
ℹ cancelled 0
```

### 4.3 手工输入 4 条验证

| 输入 | intent | assetQuery | 是否符合预期 |
|------|--------|------------|-------------|
| `你好` | smalltalk | null | 不再继承 BTC |
| `卖 30%` | review_sell | BTC | 仍可继承最近资产 |
| `加仓吗` | review_add | SOL | 仍可继承最近资产 |
| `今天大盘怎么样` | unknown | null | 不触发 lookup_asset_info |

命令：

```bash
node -e "
const { classifyIntent } = await import('./src/chat-orchestrator.mjs');
const tests = [
  { msg: '你好', ctx: { lastAsset: 'BTC' } },
  { msg: '卖 30%', ctx: { lastAsset: 'BTC' } },
  { msg: '加仓吗', ctx: { lastAsset: 'SOL' } },
  { msg: '今天大盘怎么样', ctx: { lastAsset: 'BTC' } },
];
for (const t of tests) {
  const r = classifyIntent(t.msg, t.ctx);
  console.log(JSON.stringify({ message: t.msg, intent: r.intent, assetQuery: r.slots.assetQuery }));
}
"
```

输出：

```json
{"message":"你好","intent":"smalltalk","assetQuery":null}
{"message":"卖 30%","intent":"review_sell","assetQuery":"BTC"}
{"message":"加仓吗","intent":"review_add","assetQuery":"SOL"}
{"message":"今天大盘怎么样","intent":"unknown","assetQuery":null}
```

## 5. 证据路径

- 测试文件: `test/chat-orchestrator-context.test.mjs`
- 修改文件: `src/chat-orchestrator.mjs`
- 全量测试: `npm test` 输出（38 pass, 0 fail）

## 6. 剩余风险

- `extractSlotsRule` 的小写词 → 大写 ticker 逻辑仍然激进：任何不在 stopwords 中的 2-8 字母小写词都会被当成 ticker。当前只补了常见问候词，其他非 ticker 小写词（如 "status", "error"）可能仍被误提取。建议后续做更系统的 stopwords 补充或引入白名单机制。
- `context.lastAsset` 在 `synthesizeRule` 和 `synthesizeLLM` 中仍有使用（作为 assetLabel fallback），但这些路径在 smalltalk 的 reply 生成中不会输出资产相关内容，风险较低。
