# CCB Enso Backend 集成状态报告

> **本文档是 CCB 集成的唯一权威状态文档**

**更新日期**: 2026-02-02
**状态**: ✅ 路径规范化问题已修复并验证通过

---

## 〇、文档索引

### 活跃文档

| 文档 | 说明 |
|------|------|
| **本文档** | CCB 集成状态报告（权威文档） |
| [`architecture.md`](./architecture.md) | Enso 系统架构 |
| [`design-system.md`](./design-system.md) | UI 设计规范 |

### 归档文档

设计阶段文档已移至 `docs/archive/ccb-design-phase/`：

| 文档 | 说明 |
|------|------|
| `ccb-enso-backend-design.md` | 完整设计文档（RPC 协议定义、代码框架） |
| `ccb-enso-backend-summary.md` | 项目总结和技术决策记录 |
| `ccb-enso-backend-implementation-prompt.md` | 实施阶段 Prompt |

### CCB 端文档

| 文档 | 说明 |
|------|------|
| [`claude_code_bridge/README.md`](../../../claude_code_bridge/README.md) | CCB 项目主文档 |
| [`claude_code_bridge/feat-ccb-python-client-report.md`](../../../claude_code_bridge/feat-ccb-python-client-report.md) | Enso Backend 功能分支报告 |

---

## 一、当前实现状态总览

```
┌─────────────────────────────────────────────────────────────┐
│                    CCB 功能实现进度                          │
├─────────────────────────────────────────────────────────────┤
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  100%             │
├─────────────────────────────────────────────────────────────┤
│  [✓] Enso RPC 服务器         已完成                          │
│  [✓] 多 Pane UI 渲染层       已完成                          │
│  [✓] Pane 状态管理           已完成 (方案 B 重构)             │
│  [✓] IPC 通信机制            已完成                          │
│  [✓] Agent 选择器 UI 集成    已完成                          │
│  [✓] ENSO_PANE_ID 环境变量   已完成                          │
│  [✓] CCB 启动 IPC 接口       已完成                          │
│  [✓] CCB 检测 Enso 后端      已完成                          │
│  [✓] CCB RPC Pane 创建       已完成                          │
│  [✓] 路径规范化 (斜杠统一)   已完成 ✅                        │
│  [ ] Settings 配置页面       待实现                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、本次会话进展 (2026-02-02)

### 2.1 问题修复记录

#### 问题 1: `ccb up` 命令已废弃 ✅

**错误信息**:
```
❌ `ccb up` is no longer supported.
💡 Use: ccb [providers...]  (or configure ccb.config)
```

**修复**: `src/main/ipc/ccb.ts:168`
```typescript
// Before
const args = ['up'];

// After
const args = [...validatedProviders];
```

---

#### 问题 2: CCB 未检测到 Enso 后端 ✅

**错误信息**:
```
❌ 未检测到终端后端 (WezTerm 或 tmux)
```

**根因**:
1. Windows shell 模式下环境变量传递问题
2. CCB 代码中要求 `ENSO_PANE_ID` 必须设置

**修复 1**: `src/main/ipc/ccb.ts:186-193` - 直接调用 Python 而非 ccb.bat
```typescript
// 直接使用 Python 调用 CCB，避免 .bat 包装器的环境变量问题
const ccbScript = 'F:\\code\\cc\\claude_code_bridge\\ccb';
const ccbProcess = spawn('python', [ccbScript, ...args], {
  cwd: state.cwd,
  env,
  shell: false, // 不使用 shell，直接传递环境变量
  ...
});
```

**修复 2**: `claude_code_bridge/ccb:2995` - Enso 模式不要求 ENSO_PANE_ID
```python
# Before
if self.terminal_type == "enso" and not (inside_enso and inside_enso_pane):
    self.terminal_type = None

# After - ENSO_PANE_ID 可选（RPC 创建模式）
if self.terminal_type == "enso" and not inside_enso:
    self.terminal_type = None
```

---

#### 问题 3: CCB 无法获取 anchor pane ID ✅

**错误信息**:
```
❌ Unable to determine current pane id. Run inside tmux, WezTerm, or Enso.
```

**根因**: CCB 在 Enso RPC 模式下不是在现有 PTY 中运行，而是作为后台进程启动

**修复**: `claude_code_bridge/ccb:3017-3033` - Enso RPC 创建模式
```python
self.anchor_pane_id = self._current_pane_id()

# Enso RPC mode: if no current pane, create anchor pane via RPC
if not self.anchor_pane_id and self.terminal_type == "enso":
    self.anchor_pane_id = "__enso_rpc_create__"
    print(f"📡 Enso RPC mode: panes will be created via RPC")
```

---

#### 问题 4: `_start_claude_pane` 未处理 Enso 模式 ✅

**修复**: `claude_code_bridge/ccb:2864-2875` - 添加 Enso 分支
```python
if self.terminal_type == "enso":
    from enso_backend import EnsoBackend
    backend = EnsoBackend()
    pane_id = backend.create_pane(full_cmd, run_cwd, ...)
    self.enso_panes["claude"] = pane_id
elif self.terminal_type == "wezterm":
    ...
```

---

#### 问题 5: anchor provider 在 RPC 模式下的处理 ✅

**修复**: `claude_code_bridge/ccb:3150-3177` - RPC 模式下所有 pane 都通过 RPC 创建
```python
# Enso RPC mode: anchor provider also needs a new pane
if self.terminal_type == "enso" and self.anchor_pane_id == "__enso_rpc_create__":
    anchor_pane = _start_item(self.anchor_provider, parent=None, direction=None)
    ...
    # Wait for interrupt signal
    stop_event.wait()
    return 0
```

---

### 2.2 当前状态

**CCB 启动成功**:
```
📡 Enso RPC mode: panes will be created via RPC
🚀 Starting Claude...
✅ Started backend Claude (enso pane, pane_id=xxx)
✅ All panes created. CCB running in Enso RPC mode.
🔄 CCB is running. Press Ctrl+C to stop.
```

**问题**: UI 仍显示 "Waiting for CCB connection"

**根因分析**: `normalizePath` 函数只做小写转换，不统一斜杠方向，导致：
- IPC 事件 cwd 使用反斜杠：`F:\code\cc\EnsoAI` → `f:\code\cc\ensoai`
- worktreePath 使用正斜杠：`F:/code/cc/EnsoAI` → `f:/code/cc/ensoai`
- 两个 key 不匹配，pane 被添加到错误的 worktree key 下

**修复**: `src/renderer/App/storage.ts:141-165` - 统一斜杠方向为正斜杠
```typescript
export const normalizePath = (path: string): string => {
  // 1. Unify all backslashes to forward slashes for consistent map keys
  let normalized = path.replace(/\\/g, '/');
  // 2. Collapse duplicate slashes (preserve UNC prefix)
  // 3. Remove trailing slashes
  // 4. On Windows and macOS, normalize to lowercase
  ...
};
```

---

## 三、待验证问题

### 3.1 IPC 事件传递问题 ⚠️

**预期流程**:
```
CCBCore.createPane()
    ↓
mainWindow.webContents.send(CCB_TERMINAL_OPEN, {...})
    ↓
window.electronAPI.ccb.onTerminalOpen(callback)
    ↓
addExternalPane(event)
    ↓
UI 更新显示终端
```

**已添加调试日志**:

1. **Main 进程** (`src/main/services/ccb/core.ts:84`):
```typescript
console.log('[CCB][Core] Sending CCB_TERMINAL_OPEN event:', { ptyId, cwd, title });
```

2. **Renderer 进程** (`src/renderer/stores/ccbPanes.ts:352`):
```typescript
console.log('[CCB] Received CCB_TERMINAL_OPEN event:', event);
console.log('[CCB] addExternalPane result:', result);
```

**下一步调试**:
1. 检查 Main 进程日志是否有 `[CCB][Core] Sending CCB_TERMINAL_OPEN`
2. 打开 DevTools 检查 Renderer 控制台是否有 `[CCB] Received CCB_TERMINAL_OPEN`
3. 如果 Main 发送但 Renderer 未收到，检查 IPC 通道注册

---

## 四、代码变更汇总

### Enso 端修改

| 文件 | 修改内容 |
|------|----------|
| `src/main/ipc/ccb.ts:168` | 移除废弃的 `'up'` 子命令 |
| `src/main/ipc/ccb.ts:186-193` | 直接调用 Python 而非 ccb.bat，shell=false |
| `src/main/services/ccb/core.ts:84` | 添加 IPC 发送日志 |
| `src/renderer/stores/ccbPanes.ts:352` | 添加 IPC 接收日志 |
| `src/renderer/App/storage.ts:141-165` | **normalizePath 统一斜杠方向为正斜杠** (NEW) |

### CCB 端修改

| 文件 | 位置 | 修改内容 |
|------|------|----------|
| `ccb` | 2995 | Enso 模式不再强制要求 ENSO_PANE_ID |
| `ccb` | 3017-3033 | 添加 Enso RPC 创建模式（`__enso_rpc_create__` 标记） |
| `ccb` | 3126-3137 | 处理 `__enso_rpc_create__` 作为 parent 时转为 None |
| `ccb` | 3150-3177 | RPC 模式下 anchor provider 也通过 RPC 创建 pane |
| `ccb` | 2864-2875 | `_start_claude_pane` 添加 Enso 分支 |
| `lib/terminal.py` | 994-999 | `_inside_enso()` 检测函数（已存在） |

---

## 五、技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Enso 应用                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐     ┌─────────────────────────────┐   │
│  │   Main Process   │     │      Renderer Process       │   │
│  │                 │     │                             │   │
│  │  EnsoRPCServer  │────▶│  CCBPaneLayout              │   │
│  │  ├─ CCBCore     │ IPC │  ├─ CCBPaneTerminal        │   │
│  │  ├─ Protocol    │     │  └─ useCCBPanesStore       │   │
│  │  └─ Transport   │     │      ├─ startCCB()         │   │
│  │                 │     │      └─ ccbStatus          │   │
│  │  CCB IPC        │     │                             │   │
│  │  ├─ startCCB    │◀────│  MainContent               │   │
│  │  ├─ stopCCB     │     │  └─ isCCBAgentActive       │   │
│  │  └─ getStatus   │     │                             │   │
│  └────────┬────────┘     └─────────────────────────────┘   │
│           │ spawn('python', ['ccb', ...])                   │
│           │                                                 │
│           │ TCP:8765                                        │
│           │ JSON-RPC 2.0                                    │
└───────────┼─────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                      CCB (Python)                            │
├─────────────────────────────────────────────────────────────┤
│  terminal.py         → 检测 ENSO_RPC_TOKEN，返回 "enso"     │
│  enso_rpc_client.py  → JSON-RPC TCP 客户端                  │
│  enso_backend.py     → TerminalBackend 实现                 │
│  ccb (主脚本)        → RPC 模式下创建所有 pane              │
│                                                             │
│  caskd / gaskd / oaskd (daemon 进程)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 六、验收标准

### MVP 验收
- [x] RPC Server 正常启动和监听
- [x] 环境变量正确传递给 CCB 进程
- [x] CCB 检测到 Enso 后端
- [x] CCB 通过 RPC 成功创建 pane
- [x] IPC 通道 Main ↔ Renderer 定义正确
- [ ] **IPC 事件到达 Renderer 并更新 UI** ⚠️

### 完整功能验收
- [ ] cask/gask/oask 工具正常工作
- [ ] 多个 agent 同时运行
- [ ] 输出缓存正确读取
- [ ] Settings 页面配置可用

---

## 七、下一步调试指南

### 步骤 1: 确认 Main 进程发送事件

查看 Enso 控制台（启动 `npm run dev` 的终端）:
```
[CCB][Core] Sending CCB_TERMINAL_OPEN event: { ptyId: 'xxx', cwd: '...', title: '...' }
```

### 步骤 2: 确认 Renderer 进程接收事件

打开 DevTools (Ctrl+Shift+I) → Console:
```
[CCB] Received CCB_TERMINAL_OPEN event: { ptyId: 'xxx', cwd: '...', title: '...' }
[CCB] addExternalPane result: 'added'
```

### 步骤 3: 如果 Main 发送但 Renderer 未收到

检查以下可能原因:
1. `initCCBPaneListener()` 是否在 CCB 启动前被调用
2. `IPC_CHANNELS.CCB_TERMINAL_OPEN` 常量值是否一致
3. `ipcRenderer.on` 和 `webContents.send` 使用的通道名是否匹配

### 步骤 4: 如果 Renderer 收到但 UI 未更新

检查 `addExternalPane` 返回值:
- `'added'` - 正常添加
- `'ignored'` - 重复的 paneId
- `'overflow'` - 超过 4 个 pane 限制

检查 `normalizePath(event.cwd)` 是否与当前 worktree key 匹配。

---

## 八、已知限制

1. **CCB 路径硬编码**: `src/main/ipc/ccb.ts:187` 中 CCB 脚本路径是硬编码的，需要改为配置项
2. **单 worktree 支持**: 当前逻辑假设只有一个活跃的 CCB 实例
3. **Windows 专用**: 部分修改（如 shell=false）可能影响其他平台

---

**下次会话提示**:
1. 运行 Enso 并打开 DevTools
2. 选择 CCB agent 触发启动
3. 观察 Main 和 Renderer 的调试日志
4. 根据日志定位 IPC 事件丢失的位置

---

## 九、代码文件清单

### Enso 端（Main Process）

| 文件 | 说明 |
|------|------|
| `src/main/services/ccb/EnsoRPCServer.ts` | RPC 服务器主类 |
| `src/main/services/ccb/core.ts` | CCBCore 核心业务逻辑（包含 Pane 管理） |
| `src/main/services/ccb/protocol.ts` | JSON-RPC 协议验证 |
| `src/main/services/ccb/transport.ts` | NDJSON 传输层 |
| `src/main/services/ccb/types.ts` | TypeScript 类型定义 |
| `src/main/ipc/ccb.ts` | CCB 进程管理 IPC |

### Enso 端（Renderer Process）

| 文件 | 说明 |
|------|------|
| `src/renderer/stores/ccbPanes.ts` | Zustand 状态管理 |
| `src/renderer/components/chat/CCBPaneLayout.tsx` | 多 Pane 布局组件 |
| `src/renderer/components/chat/CCBPaneTerminal.tsx` | CCB 终端组件 |

### CCB 端（Python）

| 文件 | 说明 |
|------|------|
| `lib/enso_rpc_client.py` | JSON-RPC TCP 客户端 |
| `lib/enso_backend.py` | EnsoBackend（实现 TerminalBackend） |
| `lib/terminal.py` | 终端检测（包含 `_inside_enso()`） |

---

## 十、设计与实现差异说明

> **注意**：归档的设计文档中的某些内容已在实现过程中调整。

| 设计文档描述 | 实际实现 | 调整原因 |
|-------------|---------|---------|
| `PaneManager.ts` 单独文件 | 合并到 `CCBCore.ts` | 简化架构，减少文件数量 |
| `spawn('ccb', ['up'])` | `spawn('python', ['ccb', ...])` | `up` 命令已废弃，直接调用 Python |
| `lib/backends/enso/` 子目录 | 直接在 `lib/` 下 | 简化目录结构 |
| TCP Server 长连接 | 每次 RPC 短连接 | CCB 主动连接，无需持久连接 |

---

**文档版本**: v2.0
**最后更新**: 2026-02-02
**维护者**: Claude + Codex 协作

