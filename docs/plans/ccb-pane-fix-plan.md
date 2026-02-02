# CCB Pane 管理问题修复计划

**创建日期**: 2026-02-02
**状态**: 待执行

## 问题摘要

| # | 问题 | 根因 | 影响 |
|---|------|------|------|
| 1 | cping 在 Windows 无法运行 | shebang 使用 `python3` | 连接测试失败 |
| 2 | 四格窗口排列顺序不可控 | 不传递 `slot_index` 参数 | 布局与预期不符 |
| 3 | Pane 标题显示为完整命令 | 不传递 `title` 参数 | UI 显示混乱 |

## 期望布局

```
┌─────────────┬─────────────┐
│  Claude     │  Codex      │  slot 0     slot 1
│             │             │
├─────────────┼─────────────┤
│  Gemini     │  OpenCode   │  slot 2     slot 3
│             │             │
└─────────────┴─────────────┘
```

## 修复任务

### Task 1: 修复 cping shebang 兼容性问题

**文件**: `F:\code\cc\claude_code_bridge\bin\cping`

**修改**:
```diff
-#!/usr/bin/env python3
+#!/usr/bin/env python
```

---

### Task 2: 修改 EnsoBackend.create_pane 添加 title/slot_index 参数

**文件**: `F:\code\cc\claude_code_bridge\lib\enso_backend.py`

**修改** (L53-82):
```python
def create_pane(
    self,
    cmd: str,
    cwd: str,
    direction: str = "right",
    percent: int = 50,
    parent_pane: Optional[str] = None,
    title: Optional[str] = None,        # 新增
    slot_index: Optional[int] = None,   # 新增
) -> str:
    """
    Create a new pane and run command inside it.

    Note: Enso RPC does not support split direction/percent/parent_pane parameters.
    These are accepted for API compatibility but ignored.

    Args:
        cmd: Command to run in the new pane
        cwd: Working directory for the pane
        direction: Ignored (Enso handles layout internally)
        percent: Ignored
        parent_pane: Ignored
        title: Display title for the pane
        slot_index: Fixed slot position (0-3 for 2x2 layout)

    Returns:
        The pane_id of the newly created pane
    """
    payload = {"command": cmd or "", "cwd": cwd or ""}
    if title is not None:
        payload["title"] = title
    if slot_index is not None:
        payload["slot_index"] = slot_index

    result = self.rpc.call("create_pane", payload)
    if isinstance(result, dict):
        pane_id = str(result.get("pane_id") or "").strip()
        if pane_id:
            return pane_id
    raise RuntimeError(f"Enso create_pane returned invalid result: {result!r}")
```

---

### Task 3: 修改 CCB Python 调用处传递 title 和 slot_index

**文件**: `F:\code\cc\claude_code_bridge\ccb`

**添加常量映射**:
```python
# Provider 到 slot index 的映射
PROVIDER_SLOT_MAP = {
    "claude": 0,
    "codex": 1,
    "gemini": 2,
    "opencode": 3,
}
```

**修改调用点** (L1041 附近):
```python
pane_id = backend.create_pane(
    full_cmd,
    str(Path.cwd()),
    direction=use_direction,
    percent=50,
    parent_pane=use_parent,
    title=provider.capitalize(),
    slot_index=PROVIDER_SLOT_MAP.get(provider),
)
```

---

### Task 4: 修改 EnsoRPCServer 处理 slot_index 参数

**文件**: `F:\code\cc\EnsoAI\src\main\services\ccb\EnsoRPCServer.ts`

**修改** (L194-201):
```typescript
case 'create_pane': {
  const slotIndex = typeof params.slot_index === 'number'
    ? params.slot_index
    : undefined;
  const { pane_id, title } = this.core.createPane({
    command: params.command as string,
    cwd: params.cwd as string,
    title: params.title,
    env: params.env,
    slotIndex,
  });
  return { pane_id, title };
}
```

---

### Task 5: 修改 CCBCore.createPane 接收并传递 slotIndex

**文件**: `F:\code\cc\EnsoAI\src\main\services\ccb\core.ts`

**修改函数签名** (L22-27):
```typescript
createPane(options: {
  command: string;
  cwd: string;
  title?: string;
  env?: Record<string, string>;
  slotIndex?: number;  // 新增
}): { pane_id: string; title: string }
```

**修改 IPC 事件** (L83-90):
```typescript
this.mainWindow.webContents.send(IPC_CHANNELS.CCB_TERMINAL_OPEN, {
  ptyId,
  cwd: options.cwd,
  title,
  slotIndex: options.slotIndex,  // 新增
});
```

---

### Task 6: 修改 ccbPanes store 使用传入的 slotIndex

**文件**: `F:\code\cc\EnsoAI\src\renderer\stores\ccbPanes.ts`

**修改 addExternalPane 事件类型** (L58):
```typescript
addExternalPane: (event: {
  ptyId: string;
  cwd: string;
  title?: string;
  slotIndex?: number;  // 新增
}) => ExternalAddResult;
```

**修改槽位分配逻辑** (L105-108):
```typescript
// 优先使用传入的 slotIndex，否则自动分配
let slotIndex: number | null =
  typeof event.slotIndex === 'number' &&
  event.slotIndex >= 0 &&
  event.slotIndex < MAX_PANE_SLOTS
    ? event.slotIndex
    : null;

// 检查指定 slot 是否已被占用
if (slotIndex !== null && current.panes.some(p => p.slotIndex === slotIndex)) {
  slotIndex = null; // 回退到自动分配
}

if (slotIndex === null) {
  slotIndex = findFreeSlot(current.panes);
}

if (slotIndex === null) {
  return 'overflow';
}
```

---

### Task 7: 更新测试用例并验证修复

**测试文件**: `F:\code\cc\claude_code_bridge\test\test_enso_backend.py`

**新增测试**:
```python
def test_enso_backend_create_pane_with_title_and_slot():
    """Test EnsoBackend.create_pane passes title and slot_index."""
    from enso_backend import EnsoBackend

    mock_rpc = MagicMock(spec=EnsoRPCClient)
    mock_rpc.call.return_value = {"pane_id": "new-pane-123"}
    backend = EnsoBackend(rpc=mock_rpc)

    pane_id = backend.create_pane(
        "bash", "/home/user",
        title="Claude", slot_index=0
    )

    assert pane_id == "new-pane-123"
    mock_rpc.call.assert_called_once_with(
        "create_pane",
        {"command": "bash", "cwd": "/home/user", "title": "Claude", "slot_index": 0}
    )
```

---

## 验证步骤

1. **cping 测试**:
   ```bash
   python "F:\code\cc\claude_code_bridge\bin\cping"
   ```

2. **启动 Enso + CCB** 验证:
   - Claude 在 slot 0 (左上)
   - Codex 在 slot 1 (右上)
   - Gemini 在 slot 2 (左下)
   - OpenCode 在 slot 3 (右下)

3. **验证标题显示**: 应为 "Claude" / "Codex" 等简洁名称

---

## 设计原则遵循

- **KISS**: 最小化改动，仅添加必要参数
- **YAGNI**: 不添加未来可能用到的功能
- **DRY**: 使用 `PROVIDER_SLOT_MAP` 避免硬编码重复
- **兼容性**: 所有新参数都是可选的，不破坏现有调用
