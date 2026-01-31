# CCB Enso Backend 集成状态报告

**更新日期**: 2026-01-31
**状态**: ⚠️ Enso 端完成，等待 CCB Python 端通过 RPC 创建 Pane

---

## 一、当前实现状态总览

```
┌─────────────────────────────────────────────────────────────┐
│                    CCB 功能实现进度                          │
├─────────────────────────────────────────────────────────────┤
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░  80%              │
├─────────────────────────────────────────────────────────────┤
│  [✓] Enso RPC 服务器         已完成                          │
│  [✓] 多 Pane UI 渲染层       已完成                          │
│  [✓] Pane 状态管理           已完成 (方案 B 重构)             │
│  [✓] IPC 通信机制            已完成                          │
│  [✓] Agent 选择器 UI 集成    已完成                          │
│  [✓] ENSO_PANE_ID 环境变量   已完成                          │
│  [⚠] CCB 端 Enso 支持        需验证 RPC 创建 Pane 流程        │
│  [ ] 端到端功能测试          待验证                          │
│  [ ] Settings 配置页面       待实现                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、最新修改 (2026-01-31)

### 2.0 Pane 创建策略重构：方案 B ✅ (NEW)

**问题**: CCB UI 显示 4 个窗口，但只显示空的 PowerShell 提示符，没有运行 agent

**根因分析**:
- `ensureWorktreePanes` 主动创建 4 个空 PTY
- 但没有传递 `initialCommand` 参数
- 所以 PTY 只显示 PowerShell 提示符

**架构决策**:

用户选择 **方案 B** - CCB Python 端通过 RPC 创建 Pane

| 方案 | 描述 | 选择 |
|------|------|------|
| 方案 A | Enso 主动创建 PTY 并执行预配置命令 | ❌ |
| **方案 B** | CCB Python 端通过 RPC `create_pane` 创建 | ✅ |

**修改内容**:

| 文件 | 修改 |
|------|------|
| `src/renderer/stores/ccbPanes.ts` | 移除主动创建空 PTY 逻辑，等待 RPC 创建 |
| `src/renderer/components/chat/CCBPaneLayout.tsx` | 空状态显示 "Waiting for CCB connection" |

**当前流程**:

```
Enso 启动
    ↓
RPC Server 启动 (127.0.0.1:8765) ✅
    ↓
用户选择 CCB agent
    ↓
UI 显示 2x2 空格子，提示 "Waiting for CCB connection"
    ↓
【CCB Python 端】调用 RPC create_pane(command="claude", ...)
    ↓
CCBCore.createPane 创建 PTY 并执行命令
    ↓
IPC CCB_TERMINAL_OPEN → addExternalPane → UI 显示终端
```

---

### 2.1 CCB Enso 环境检测与启动支持 ✅

**问题**: CCB 启动时报错 "CCB must run inside tmux or WezTerm"

**根因分析**:
1. 系统全局 `ccb.bat` 指向旧版本（无 Enso 支持）
2. CCB 主脚本缺少 Enso 分支处理
3. EnsoAI PtyManager 未注入 `ENSO_PANE_ID` 环境变量

**解决方案**:

#### EnsoAI 侧修改

| 文件 | 修改内容 |
|------|----------|
| `src/main/services/terminal/PtyManager.ts:376` | 在 `rawEnv` 中添加 `ENSO_PANE_ID: id` |

#### CCB 侧修改 (10 处)

| 文件 | 位置 | 修改内容 |
|------|------|----------|
| `ccb` | 行 564 | `__init__` 添加 `self.enso_panes = {}` |
| `ccb` | 行 830 | `_detect_terminal_type()` 允许 `enso` 强制值 |
| `ccb` | 行 668-669 | `_current_pane_id()` 添加 Enso 分支 |
| `ccb` | 行 700-701 | `_provider_pane_id()` 添加 Enso 分支 |
| `ccb` | 行 923-926 | `_start_provider()` 添加 Enso 分支调用 |
| `ccb` | 行 1017-1069 | 新增 `_start_provider_enso()` 方法 |
| `ccb` | 行 2907-2916 | `run_up()` 添加 `inside_enso` 校验 |
| `ccb` | 行 2938 | 错误文案添加 "or Enso" |
| `ccb` | 行 2132-2145 | `_start_cmd_pane()` 添加 Enso 分支 |
| `ccb` | 行 2919-2933 | `cleanup()` 添加 Enso 分支 |
| `lib/claude_session_resolver.py` | 行 337 | 添加 `ENSO_PANE_ID` 支持 |

#### 全局 ccb.bat 修改

```batch
# C:\Users\tzcbz\AppData\Local\codex-dual\bin\ccb.bat
# 修改为指向本地开发版本
%PYTHON% "F:\code\cc\claude_code_bridge\ccb" %*
```

---

### 2.1 Enso 端 RPC 服务器 ✅

| 文件 | 行数 | 功能 |
|------|------|------|
| `src/main/services/ccb/EnsoRPCServer.ts` | 266 | JSON-RPC 2.0 TCP 服务器，端口 8765-8814 自动回退 |
| `src/main/services/ccb/core.ts` | 226 | CCBCore 核心业务逻辑，Pane 生命周期管理 |
| `src/main/services/ccb/protocol.ts` | 174 | RPC 协议验证，请求参数校验 |
| `src/main/services/ccb/transport.ts` | 125 | NDJSON 传输层，1MB 缓冲区保护 |
| `src/main/services/ccb/types.ts` | 45 | TypeScript 类型定义 |

**支持的 RPC 方法**:
- `create_pane` - 创建新的 PTY pane
- `send_text` - 向 pane 注入文本
- `is_alive` - 检查 pane 存活状态
- `get_text` - 获取 pane 输出（缓存 1000 行 + 64KB tail）
- `list` - 列出所有 panes
- `kill` - 销毁指定 pane

### 2.2 主进程集成 ✅

| 位置 | 功能 |
|------|------|
| `src/main/index.ts:234-265` | RPC Server 启动，环境变量设置 |
| `src/main/ipc/index.ts:64-69` | 应用关闭时清理 |

**环境变量传递机制**:
```typescript
process.env.ENSO_RPC_HOST = host;    // 127.0.0.1
process.env.ENSO_RPC_PORT = port;    // 8765+
process.env.ENSO_RPC_TOKEN = token;  // UUID
```

### 2.3 渲染进程 UI 层 ✅

| 文件 | 功能 |
|------|------|
| `src/renderer/stores/ccbPanes.ts` | Zustand 状态管理，Pane 增删改查 |
| `src/renderer/components/chat/CCBPaneLayout.tsx` | 多 Pane 网格布局 (1-4 pane) |
| `src/renderer/components/chat/CCBPaneTerminal.tsx` | 终端渲染，附加到已存在的 PTY |
| `src/renderer/components/layout/MainContent.tsx` | 主布局集成点 |

### 2.4 单端测试 ✅

| 文件 | 说明 |
|------|------|
| `test-ccb-rpc.js` | NDJSON RPC 客户端测试脚本 |

**测试覆盖**:
- [x] TCP 连接建立
- [x] `create_pane` 创建 pane
- [x] `send_text` 注入命令
- [x] `is_alive` 存活检查
- [x] `list` 列出所有 panes

---

## 三、未完成模块

### 3.1 Agent 选择器 UI 集成 ❌

**问题**: CCB 未作为可选 Agent 暴露给用户。

**需要修改的文件**:

| 文件 | 位置 | 修改内容 |
|------|------|----------|
| `src/renderer/components/chat/SessionBar.tsx` | 第 58-67 行 | `AGENT_INFO` 添加 `ccb` 条目 |
| `src/renderer/components/chat/AgentPanel.tsx` | 第 36-44 行 | `AGENT_INFO` 添加 `ccb` 条目 |
| `src/renderer/stores/settings.ts` | 第 144-152 行 | `BUILTIN_AGENT_IDS` 添加 `'ccb'` |
| `src/renderer/stores/settings.ts` | 第 598-606 行 | `defaultAgentSettings` 添加 CCB 默认配置 |
| `src/renderer/components/settings/AgentSettings.tsx` | 第 41-49 行 | `BUILTIN_AGENTS` 添加 `'ccb'` |

### 3.2 CCB 端实现状态 ⚠️

根据设计文档，CCB 端需要实现：
- `lib/enso_rpc_client.py` - JSON-RPC 客户端
- `lib/enso_backend.py` - TerminalBackend 接口实现
- `lib/terminal.py` - 集成 EnsoBackend

**状态**: 用户确认已实现并完成单端测试，待联调验证。

### 3.3 端到端联调联测 ❌

**待测试场景**:
1. CCB Python 客户端 → Enso RPC Server 通信
2. `cask`/`gask`/`oask` 工具调用
3. 多 Pane 同时运行和切换
4. 输出缓存和日志读取

---

## 四、下一步计划

### Phase 1: 验证 CCB Python 端 RPC 创建 Pane (优先级: P0)

```
目标: 确保 CCB Python 端能通过 RPC 创建 agent pane

步骤:
1. 确认 CCB Python 端 EnsoBackend 实现
2. 验证 _start_provider_enso() 调用 RPC create_pane
3. 测试 CCB up 命令是否成功创建 pane
4. 确认 UI 正确显示创建的终端

关键代码路径:
- CCB: _start_provider_enso() → EnsoBackend.create_pane()
- Enso: CCBCore.createPane() → PtyManager.create(initialCommand)
- UI: CCB_TERMINAL_OPEN IPC → addExternalPane()
```

### Phase 2: 端到端联调 (优先级: P0)

```
目标: 验证完整的 CCB 多 agent 协作流程

测试场景:
1. CCB up claude codex - 启动两个 agent
2. 在 Claude 中调用 cask 工具
3. 验证 Codex pane 收到任务
4. 验证结果返回 Claude
```

### Phase 3: 功能完善 (优先级: P1)

```
目标: 完善用户体验

步骤:
1. Settings 页面添加 CCB 配置项
2. 多 Pane 布局优化
3. 错误处理和用户提示
4. 性能优化
```

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
│  │  └─ Transport   │     │                             │   │
│  └────────┬────────┘     └─────────────────────────────┘   │
│           │ TCP:8765                                        │
│           │ JSON-RPC 2.0                                    │
└───────────┼─────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                      CCB (Python)                            │
├─────────────────────────────────────────────────────────────┤
│  enso_rpc_client.py ──▶ enso_backend.py ──▶ terminal.py    │
│                                                             │
│  caskd / gaskd / oaskd (daemon 进程)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 六、相关文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 设计文档 | `docs/ccb-enso-backend-design.md` | 完整技术设计 |
| 实施指南 | `docs/ccb-enso-backend-implementation-prompt.md` | 分阶段实施步骤 |
| 项目总结 | `docs/ccb-enso-backend-summary.md` | 项目背景和决策 |
| 集成报告 | `ccb-enso-integration-report.md` | feat/ccb-enso-integration 分支报告 |
| 多 Pane UI 报告 | `ccb-multi-pane-ui-report.md` | UI 实现报告 |
| 输出缓存报告 | `ccb-output-buffer-report.md` | 输出缓存实现报告 |

---

## 七、验收标准

### MVP 验收 (当前阶段)
- [x] RPC Server 正常启动和监听
- [x] 环境变量正确传递给子进程
- [x] IPC 通道 Main ↔ Renderer 连通
- [x] 多 Pane UI 渲染正常 (2x2 固定布局)
- [x] Agent 选择器显示 CCB 选项
- [x] Enso 端等待 CCB RPC 创建 Pane (方案 B)
- [ ] **CCB Python 端通过 RPC 创建 agent pane**

### 完整功能验收
- [ ] cask/gask/oask 工具正常工作
- [ ] 多个 agent 同时运行
- [ ] 输出缓存正确读取
- [ ] Settings 页面配置可用

---

**下次会话提示**: 验证 CCB Python 端 `_start_provider_enso()` 是否正确调用 RPC `create_pane` 方法。
