---
branch: feat/ccb-output-buffer
base: feat/ccb-enso-backend
depends_on: []
modules:
  - src/main/services/ccb/core.ts
priority: P2
estimate_days: [0.3, 0.5]
dod:
  - "getText() 返回最近 N 行输出"
  - "缓存不超过 1000 行"
  - "CCB get_text RPC 调用返回有效内容"
perf:
  threshold_ratio: 1.10
tests:
  commands:
    - npm run build
    - npm run test
---

# Branch Prompt: feat/ccb-output-buffer

## Goal
实现 CCB RPC Server 的 `get_text` 方法，使 CCB daemon 能够读取 pane 的输出内容。

## Scope (In)
- 在 `CCBCore.createPane()` 的 `onData` 回调中缓存输出
- 实现 `CCBCore.getText()` 方法
- 限制缓存大小（最多 1000 行或可配置）

## Non-Goals (Out)
- UI 相关改动
- 其他 RPC 方法的修改
- CCB Python 端改动

## Modules Impacted
- `src/main/services/ccb/core.ts`

## Dependencies
- Base branch: feat/ccb-enso-backend
- Depends on: 无
- Blocked by: 无

## Technical Details

### 当前实现 (core.ts:104-107)

```typescript
getText(_paneId: string, _lines = 100): { text: string; total_lines: number } {
  // TODO(ccb): output buffering
  return { text: '', total_lines: 0 };
}
```

### 目标实现

```typescript
getText(paneId: string, lines = 100): { text: string; total_lines: number } {
  const pane = this.panes.get(paneId);
  if (!pane) {
    throw new Error(`Pane not found: ${paneId}`);
  }

  const buffer = pane.outputBuffer;
  const total_lines = buffer.length;
  const text = buffer.slice(-lines).join('');

  return { text, total_lines };
}
```

### PaneInfo.outputBuffer 改进

```typescript
// 在 createPane() 的 onData 回调中:
(data) => {
  // 按行分割并缓存
  const lines = data.split(/\r?\n/);
  pane.outputBuffer.push(...lines);

  // 限制缓存大小
  const MAX_BUFFER_LINES = 1000;
  if (pane.outputBuffer.length > MAX_BUFFER_LINES) {
    pane.outputBuffer = pane.outputBuffer.slice(-MAX_BUFFER_LINES);
  }

  // Forward to renderer...
}
```

## Test Plan

### Automated (CI)
- [ ] 构建成功 (`npm run build`)
- [ ] 单元测试通过

### Manual
- [ ] 启动 Enso
- [ ] 使用 `test-ccb-rpc.js` 测试 `get_text` RPC 调用
- [ ] 验证返回的文本内容正确

## Done When (DoD)
- [ ] `getText()` 返回实际 pane 输出
- [ ] 缓存限制生效（不超过 1000 行）
- [ ] 构建成功
- [ ] report.md 完成
