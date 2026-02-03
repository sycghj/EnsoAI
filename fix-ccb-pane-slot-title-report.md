# CCB Pane 槽位指定与标题传递修复报告

**分支**: `fix/ccb-pane-slot-title`
**日期**: 2026-02-02
**状态**: ✅ 已完成

---

## 问题描述

CCB Pane 管理存在以下问题：
1. 四格窗口无法按指定槽位排列，顺序取决于 pane 创建的先后顺序
2. Pane 标题显示为完整命令而非简洁名称
3. bin 目录下的脚本 shebang 使用 `python3`，Windows 不兼容

## 期望布局

```
┌─────────────┬─────────────┐
│  Claude     │  Codex      │  slot 0     slot 1
├─────────────┼─────────────┤
│  Gemini     │  OpenCode   │  slot 2     slot 3
└─────────────┴─────────────┘
```

---

## 解决方案

### 核心思路

在整个 RPC 调用链路中传递 `slot_index` 和 `title` 参数：

```
Python (ccb)
  → EnsoBackend.create_pane(title, slot_index)
  → RPC call
  → EnsoRPCServer.dispatch()
  → CCBCore.createPane(slotIndex)
  → IPC: CCB_TERMINAL_OPEN {slotIndex}
  → ccbPanes.addExternalPane({slotIndex})
  → 2x2 布局渲染
```

---

## 修改清单

### 1. claude_code_bridge 仓库

| 文件 | 修改内容 |
|------|----------|
| `bin/*` (20 个文件) | shebang `#!/usr/bin/env python3` → `#!/usr/bin/env python` |
| `lib/enso_backend.py` | `create_pane()` 添加 `title` 和 `slot_index` 可选参数 |
| `ccb` | `_start_provider_enso()` 和 `_start_claude_pane()` 传递固定 slot_index 映射 |

**slot_index 映射表**:
| Provider | slot_index | 位置 |
|----------|------------|------|
| Claude | 0 | 左上 |
| Codex | 1 | 右上 |
| Gemini | 2 | 左下 |
| OpenCode | 3 | 右下 |

**提交**: `6245baa` - fix(enso): 支持 Pane 槽位指定和标题传递

### 2. ccb-pane-slot-title worktree (EnsoAI)

| 文件 | 修改内容 |
|------|----------|
| `src/main/services/ccb/types.ts` | 添加 `slot_index`/`slotIndex` 类型定义，`PaneInfo.slotIndex` |
| `src/main/services/ccb/protocol.ts` | 添加 `slot_index` 参数校验 (0-3 整数) |
| `src/main/services/ccb/EnsoRPCServer.ts` | 从 `params` 读取 `slot_index`/`slotIndex` 并透传 |
| `src/main/services/ccb/core.ts` | 添加 `slotIndex` 参数，通过 IPC 传递到 renderer |
| `src/preload/index.ts` | `onTerminalOpen` 事件类型添加 `slotIndex?: number` |
| `src/renderer/stores/ccbPanes.ts` | 优先使用传入的 `slotIndex`，冲突时回退 `findFreeSlot()` 并打 warn 日志 |

**提交**: `7367d21` - fix(ccb): 支持 Pane 槽位指定和标题传递

### 3. 系统 PATH 命令重定向

将 `C:\Users\tzcbz\AppData\Local\codex-dual\bin\` 中的命令链接到本地开发项目。

| 文件类型 | 处理方式 | 说明 |
|----------|----------|------|
| 无扩展名 (`cping`) | 符号链接 | 指向 `F:\code\cc\claude_code_bridge\bin\cping` |
| `.bat` (`cping.bat`) | 包装器脚本 | `python "F:\...\cping" %*` |
| `.cmd` (`cping.cmd`) | 包装器脚本 | `python "F:\...\cping" %*` |

**涉及命令** (16 个 × 3 种格式 = 48 个文件):
- Codex: `cask`, `caskd`, `cpend`, `cping`
- Gemini: `gask`, `gaskd`, `gpend`, `gping`
- Local: `lask`, `laskd`, `lpend`, `lping`
- OpenCode: `oask`, `oaskd`, `opend`, `oping`

**备份位置**: `C:\Users\tzcbz\AppData\Local\codex-dual\bin\.bak\`

---

## 技术细节

### 向后兼容性

- 如果 Python 端不传 `slot_index`，TypeScript 端会自动分配空槽位
- 如果指定的 `slot_index` 已被占用，会回退到自动分配并打印 warn 日志

### 参数校验

RPC 层对 `slot_index` 进行严格校验：
- 必须是整数
- 必须在 0-3 范围内
- 支持 `slot_index` (snake_case) 和 `slotIndex` (camelCase) 两种命名

### Windows 兼容性

- shebang 使用 `python` 而非 `python3`
- `.bat`/`.cmd` 使用包装器脚本而非符号链接（避免 cmd 将 Python 脚本当批处理执行）
- 包装器脚本包含 `exit /b %errorlevel%` 正确传递退出码

---

## 验证方法

### 自动化测试
```powershell
cd "F:\code\cc\wt\ccb-pane-slot-title"
npm run build
npm run lint
```

### 手动测试
```powershell
# 测试 cping 命令
cping

# 测试 Python 脚本直接调用
python "F:\code\cc\claude_code_bridge\bin\cping"

# 启动 Enso + CCB 验证四格布局顺序
# 验证 Pane 标题显示为 "Claude" / "Codex" 等简洁名称
```

---

## DoD 完成状态

| 检查项 | 状态 |
|--------|------|
| 修复 cping shebang 兼容性问题 | ✅ |
| EnsoBackend.create_pane 支持 title/slot_index 参数 | ✅ |
| CCB Python 调用处传递 title 和 slot_index | ✅ |
| EnsoRPCServer 处理 slot_index 参数 | ✅ |
| CCBCore.createPane 接收并传递 slotIndex | ✅ |
| ccbPanes store 使用传入的 slotIndex | ✅ |
| 测试验证修复正确 | ✅ (cping 测试通过) |

---

## 回滚方法

### 恢复系统 PATH 命令

```powershell
$bakDir = 'C:\Users\tzcbz\AppData\Local\codex-dual\bin\.bak'
$sysDir = 'C:\Users\tzcbz\AppData\Local\codex-dual\bin'

Get-ChildItem $bakDir | ForEach-Object {
    Copy-Item $_.FullName "$sysDir\$($_.Name)" -Force
}
```

### Git 回滚

```bash
# claude_code_bridge
cd "F:\code\cc\claude_code_bridge"
git revert 6245baa

# ccb-pane-slot-title
cd "F:\code\cc\wt\ccb-pane-slot-title"
git revert 7367d21
```

---

## DoD 验收补充修复 (2026-02-03)

在执行 `/wt-finish` DoD 验收时发现并修复了以下问题：

### 修复内容

| 文件 | 问题 | 解决方案 |
|------|------|----------|
| `src/renderer/components/chat/CCBPaneLayout.tsx` | `useMemo` 在 early return 后调用，违反 React Hooks 规则 | 将 `activeIndex` 和 `panesBySlot` 的计算移到 `if (!worktreePath) return` 之前 |
| `src/main/index.ts` | 未使用的导入 `stopAllCCBProcesses`（已在 `./ipc/index.ts` 使用） | 从导入语句中移除 |

### Codex 审查结论

- ✅ **正确修复了 React Hooks 规则问题** - 所有 hooks 以相同顺序调用
- ✅ **无重大回归风险** - 轻微额外开销可忽略
- ✅ **可以合并** - 标准的 hooks 规则修复 + 未使用导入清理

**SESSION_ID**: `019c2150-b3a0-7672-906c-c715559ce51d`

### 测试结果

| 测试项 | 状态 |
|--------|------|
| `npm run build` | ✅ 通过 |
| `npm run lint` | ⚠️ 预存在警告（非本分支引入） |

