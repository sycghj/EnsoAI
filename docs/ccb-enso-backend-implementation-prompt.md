# CCB Enso Backend 实现会话 - Prompt

## 会话目标

实现 CCB Enso Backend，使 EnsoAI 应用能够作为 CCB 的终端复用器，支持多 AI agent 协作。

---

## 背景信息

请先阅读以下文档以了解完整上下文：

1. **设计文档**: `F:\code\cc\EnsoAI\docs\ccb-enso-backend-design.md`
   - 包含完整的需求分析、技术方案、架构设计
   - 详细的 API 规范和实现计划

2. **关键技术决策**:
   - **不使用 tmux**: 由于 Windows ConPTY 与 POSIX PTY 的根本差异，tmux 方案不可行
   - **选择方案 2**: 为 CCB 开发专门的 Enso Backend
   - **通信协议**: JSON-RPC 2.0 over TCP (localhost)
   - **实施周期**: 约 5 个工作日

3. **项目结构**:
   - **Enso 端**: `F:\code\cc\EnsoAI` (TypeScript/Electron)
   - **CCB 端**: `F:\code\cc\claude_code_bridge` (Python)

---

## 当前任务：阶段 1 - MVP 实现（2 天）

### 目标

验证 Enso ↔ CCB RPC 通信的可行性，实现最小可用原型。

### 验收标准

- ✅ CCB 能通过 RPC 让 Enso 创建新 pane
- ✅ CCB 能向指定 pane 注入文本
- ✅ 在 Enso 终端中看到注入的文本并能正常交互

---

## Enso 端实现任务（Day 1）

### 1. 创建核心文件结构

请创建以下文件：

```
src/main/
├── services/
│   └── ccb/
│       ├── EnsoRPCServer.ts       # RPC 服务器主类
│       ├── PaneManager.ts         # Pane 生命周期管理
│       └── types.ts               # TypeScript 类型定义
└── ipc/
    └── ccb.ts                     # IPC handlers（Main ↔ Renderer）
```

### 2. 实现 RPC Server (EnsoRPCServer.ts)

**要求**：

- 使用 Node.js `net` 模块创建 TCP Server
- 监听 localhost:8765（或自动查找可用端口）
- 实现 JSON-RPC 2.0 协议解析
- 生成随机 UUID token 用于鉴权
- 实现以下方法：
  - `create_pane(command, cwd, title?, env?)`
  - `send_text(pane_id, text, add_newline?)`
  - `is_alive(pane_id)`

**关键代码参考**: 设计文档第 2.3.2 节

**注意事项**：
- 所有 RPC 请求必须携带有效 token
- 错误处理要符合 JSON-RPC 2.0 规范
- 使用 try-catch 包裹所有异步操作

### 3. 实现 Pane Manager (PaneManager.ts)

**要求**：

- 封装 PtyManager 的调用
- 为每个 pane 分配唯一 ID（格式：`enso-pane-{timestamp}-{random}`）
- 缓存 pane 的输出（最多 1000 行）
- 监听 PTY 的 `data` 和 `exit` 事件
- 通过 IPC 通知 Renderer 进程更新 UI

**数据结构**：
```typescript
interface PaneInfo {
  pane_id: string;
  ptyId: string;
  title: string;
  cwd: string;
  command: string;
  alive: boolean;
  pid?: number;
  outputBuffer: string[];
}
```

### 4. 类型定义 (types.ts)

定义所有 RPC 协议相关的 TypeScript 类型，参考设计文档第 2.2.1 节。

### 5. 启动 RPC Server

在 `src/main/index.ts` 中：

```typescript
import { EnsoRPCServer } from './services/ccb/EnsoRPCServer';

// 创建主窗口后
const rpcServer = new EnsoRPCServer(mainWindow);
const { port, token, host } = rpcServer.getConnectionInfo();

// 将连接信息通过环境变量传递给子进程
process.env.ENSO_RPC_HOST = host;
process.env.ENSO_RPC_PORT = String(port);
process.env.ENSO_RPC_TOKEN = token;

// 应用退出时清理
app.on('before-quit', () => {
  rpcServer.close();
});
```

### 6. 测试

创建简单的测试脚本验证 RPC Server：

```typescript
// test-rpc-server.ts
const client = net.connect(port, host, () => {
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'create_pane',
    params: {
      token: token,
      command: 'echo "Hello from RPC"',
      cwd: process.cwd()
    }
  };
  client.write(JSON.stringify(request) + '\n');
});
```

---

## CCB 端实现任务（Day 2）

### 1. 创建核心文件

请在 CCB 项目中创建以下文件：

```
lib/
├── enso_rpc_client.py     # RPC 客户端
└── enso_backend.py        # Enso Backend 实现
```

### 2. 实现 RPC Client (enso_rpc_client.py)

**要求**：

- 使用 Python `socket` 模块
- 从环境变量读取连接信息：
  - `ENSO_RPC_HOST` (默认 127.0.0.1)
  - `ENSO_RPC_PORT` (默认 8765)
  - `ENSO_RPC_TOKEN` (必须)
- 实现连接重试（最多 3 次）
- 实现 `call(method, params)` 方法
- 超时时间设置为 5 秒

**关键代码参考**: 设计文档第 2.4.2 节

### 3. 实现 Enso Backend (enso_backend.py)

**要求**：

- 继承 `TerminalBackend` 类
- 实现以下方法：
  - `create_pane(command, cwd, title=None, env=None)` → pane_id
  - `send_text(pane_id, text, add_newline=False)`
  - `is_alive(pane_id)` → bool
  - `get_current_pane_id()` → Optional[str]
  - `set_current_pane_id(pane_id)`

**关键代码参考**: 设计文档第 2.4.2 节

### 4. 修改 lib/terminal.py

在现有代码中添加 Enso 检测：

```python
def _inside_enso() -> bool:
    """检查是否在 Enso 环境中运行"""
    return bool(os.environ.get('ENSO_RPC_TOKEN', '').strip())

def detect_terminal() -> Optional[str]:
    """检测终端类型"""
    # 优先检查 Enso
    if _inside_enso():
        return 'enso'

    # 原有的 tmux/wezterm 检测...
    if _inside_tmux():
        return 'tmux'
    if _inside_wezterm():
        return 'wezterm'

    return None

def get_backend_for_terminal(terminal: str) -> TerminalBackend:
    """获取对应的 Backend"""
    if terminal == 'enso':
        from .enso_backend import EnsoBackend
        return EnsoBackend()
    # 原有的 tmux/wezterm 处理...
```

### 5. 测试 CCB 集成

创建测试脚本：

```python
# test_enso_backend.py
import os
from lib.terminal import detect_terminal, get_backend_for_terminal

# 设置环境变量（模拟 Enso 传递的值）
os.environ['ENSO_RPC_HOST'] = '127.0.0.1'
os.environ['ENSO_RPC_PORT'] = '8765'
os.environ['ENSO_RPC_TOKEN'] = 'test-token-123'

# 检测终端
terminal = detect_terminal()
print(f"Detected terminal: {terminal}")  # 应该输出 'enso'

# 创建 backend
backend = get_backend_for_terminal(terminal)

# 测试创建 pane
pane_id = backend.create_pane(
    command='echo "Hello from CCB"',
    cwd=os.getcwd(),
    title='Test Pane'
)
print(f"Created pane: {pane_id}")

# 测试发送文本
backend.send_text(pane_id, 'ls -la', add_newline=True)

# 测试检查存活
is_alive = backend.is_alive(pane_id)
print(f"Pane alive: {is_alive}")
```

---

## 集成测试（完成后）

### 端到端测试流程

1. **启动 Enso**
   - 确认 RPC Server 已启动
   - 确认环境变量已设置

2. **在 Enso 中运行 CCB**
   ```powershell
   # 在 Enso 的终端中
   ccb claude
   ```

3. **验证点**
   - ✅ CCB 检测到 `enso` 终端类型
   - ✅ CCB 创建 pane 成功
   - ✅ Enso UI 中出现新的终端 pane
   - ✅ Claude 正常启动并可以交互

4. **测试文本注入**
   - 在另一个终端运行测试脚本
   - 向 Claude pane 注入文本
   - 验证 Claude 收到并响应

---

## 调试指南

### 启用调试日志

**Enso 端**:
```typescript
// 在 EnsoRPCServer.ts 中
const DEBUG = process.env.ENSO_RPC_DEBUG === '1';
if (DEBUG) {
  console.log('[RPC Server] Request:', request);
  console.log('[RPC Server] Response:', response);
}
```

**CCB 端**:
```python
# 在 enso_rpc_client.py 中
import os
DEBUG = os.environ.get('ENSO_RPC_DEBUG') == '1'
if DEBUG:
    print(f"[RPC Client] Request: {request}")
    print(f"[RPC Client] Response: {response}")
```

### 常见问题排查

**问题 1: 连接被拒绝**
- 检查 RPC Server 是否启动
- 检查端口是否正确
- 检查防火墙设置

**问题 2: Token 验证失败**
- 检查环境变量是否正确传递
- 打印 token 值对比

**问题 3: Pane 创建失败**
- 检查 PtyManager 是否正常工作
- 检查命令和 cwd 是否有效
- 查看 Electron 控制台错误日志

---

## 实现检查清单

### Enso 端 (Day 1)

- [ ] `types.ts` - RPC 协议类型定义
- [ ] `EnsoRPCServer.ts` - TCP Server + JSON-RPC 解析
- [ ] `PaneManager.ts` - PTY 管理 + 输出缓存
- [ ] `ccb.ts` - IPC handlers
- [ ] `index.ts` - 启动 RPC Server
- [ ] Token 生成和验证
- [ ] 错误处理
- [ ] 基础测试

### CCB 端 (Day 2)

- [ ] `enso_rpc_client.py` - Socket 客户端 + RPC 调用
- [ ] `enso_backend.py` - Backend 实现
- [ ] `terminal.py` - 添加 Enso 检测
- [ ] 连接重试机制
- [ ] 错误处理
- [ ] 基础测试

### 集成测试

- [ ] Enso 启动正常
- [ ] RPC Server 监听正常
- [ ] CCB 能检测到 Enso 环境
- [ ] create_pane 成功
- [ ] send_text 成功
- [ ] is_alive 正常工作
- [ ] 端到端流程通畅

---

## 关键注意事项

### 1. 路径处理

- Windows 路径使用反斜杠 `\`
- Python 和 TypeScript 之间路径传递要保持一致
- 使用 `path.resolve()` 和 `os.path.abspath()` 确保绝对路径

### 2. 编码问题

- 确保所有文本使用 UTF-8 编码
- Socket 通信使用 `.encode('utf-8')` 和 `.decode('utf-8')`
- 处理换行符差异（\n vs \r\n）

### 3. 错误处理

- 所有 RPC 调用都要有超时
- Socket 异常要妥善处理
- 连接断开后要清理资源

### 4. 安全性

- Token 仅在启动时生成一次
- 仅监听 localhost，不暴露到网络
- 验证所有 RPC 请求的 token

---

## 下一步（阶段 2 - Day 3-4）

完成 MVP 后，继续实现：

1. **完整的 RPC 方法**
   - `get_text` - 读取 pane 输出
   - `list` - 列出所有 panes
   - `kill` - 终止 pane

2. **UI 多 pane 布局**
   - 在 Renderer 进程实现分屏 UI
   - 支持多个 AgentTerminal 同时显示
   - 基本的布局管理（网格/分栏）

3. **Session 文件支持**
   - 读写 `.ccb_config/.xxx-session` 文件
   - 支持 CCB daemon 集成

4. **测试 cask/gask 工具**
   - 验证跨 agent 通信
   - 测试完整的协作流程

---

## 参考资料

- 设计文档: `F:\code\cc\EnsoAI\docs\ccb-enso-backend-design.md`
- Enso 现有代码: `F:\code\cc\EnsoAI\src`
- CCB 现有代码: `F:\code\cc\claude_code_bridge`
- JSON-RPC 2.0 规范: https://www.jsonrpc.org/specification
- node-pty 文档: https://github.com/microsoft/node-pty

---

## 成功标准

**MVP 完成的标志**:

1. ✅ 在 Enso 中运行 `ccb claude`，Claude 正常启动
2. ✅ 可以在 Claude pane 中正常交互
3. ✅ 通过测试脚本向 pane 注入文本，Claude 能收到
4. ✅ 没有崩溃或严重错误
5. ✅ 基本的调试日志清晰可读

**准备好进入阶段 2 的标志**:

1. ✅ 所有 MVP 检查清单完成
2. ✅ 端到端测试通过
3. ✅ 代码已提交到 git
4. ✅ 简单的使用文档已编写

---

**会话开始时请确认**：

1. 你已经阅读了设计文档
2. 你理解了 tmux 方案不可行的原因
3. 你理解了 Enso Backend 的架构
4. 你已经准备好开始 MVP 实现

**祝实施顺利！有任何问题随时提问。**
