# CCB Enso Backend 设计文档

## 1. 项目背景

### 1.1 需求概述

用户希望在 EnsoAI 应用中集成 CCB (Claude Code Bridge)，实现多 AI agent 的协作功能。具体需求：

- **环境约束**：
  - Windows 系统（非 WSL）
  - PowerShell 作为 shell
  - Enso 使用 node-pty (ConPTY) 创建 PTY

- **核心目标**：
  - 在 Enso 的 UI 中显示多个 agent 终端（分屏）
  - 支持多 agent 协作（Claude、Codex、Gemini、OpenCode）
  - 保留 CCB 的完整功能（cask/gask/oask/lask 工具链）
  - 所有交互和输出在 Enso 中可见可操作

### 1.2 技术障碍分析

#### tmux 方案的不可行性

经过深入技术分析，tmux 在目标环境中存在**架构性的、不可逾越的障碍**：

**根本原因**（系统层/内核层）：
```
Windows ConPTY ≠ POSIX PTY
├─ 不同的终端抽象体系
├─ 缺少 termios、Unix signals、session control
└─ 嵌套终端模拟导致语义损坏
```

**技术层次分析**：
```
[ 应用层 ] CCB 调用 tmux 命令
     ↓          ✓ 可解决（路径、环境变量）
[ 兼容层 ] MSYS2/Cygwin POSIX 模拟
     ↓          ⚠️ 部分可解决（dll、socket）
[ 系统层 ] Windows ConPTY ≠ POSIX PTY
     ↓          ❌ 不可逾越（语义体系根本不同）
[ 内核层 ] Windows NT ≠ Unix 内核
                ❌ 架构性差异
```

**结论**：tmux 在 Windows + PowerShell + Enso (node-pty) 环境中无法稳定工作。

#### CCB 的协作机制

CCB 的多 agent 协作基于以下架构：

```
┌─────────────┐                  ┌──────────────┐
│   Claude    │──① cask ────────→│  caskd       │
│   (PTY 1)   │                  │  (daemon)    │
└─────────────┘                  └──────────────┘
                                        │
                                        │ ② 查询 session 文件
                                        ↓
                                 ┌──────────────┐
                                 │ .ccb_config/ │
                                 │ .codex-session
                                 │ .gemini-session
                                 └──────────────┘
                                        │
                                        │ ③ 通过 terminal backend
                                        │    注入命令到目标 pane
                                        ↓
┌─────────────┐                  ┌──────────────┐
│   Codex     │←─────────────────│ backend.     │
│   (PTY 2)   │  send_text()     │ send_text()  │
└─────────────┘                  └──────────────┘
       │
       │ ④ 输出写入日志文件
       ↓
┌──────────────────┐
│ ~/.codex/logs/   │
│ conversation.log │──⑤ daemon 读取日志──→ 返回给 Claude
└──────────────────┘
```

**关键依赖**：
1. **Session 文件**：记录每个 provider 的 pane ID
2. **Daemon 进程**：TCP 监听，转发请求
3. **Terminal Backend**：提供 `send_text()`、`is_alive()` 等能力
4. **日志文件**：daemon 通过日志解析回复

**当前支持的 Backend**：
- `TmuxBackend`：依赖 tmux
- `WeztermBackend`：依赖 WezTerm GUI

### 1.3 方案选择

评估了三种方案：

| 方案 | 难度 | 工作量 | 能实现多 agent 协作 | 推荐度 |
|------|------|--------|---------------------|--------|
| 方案 1：仿照 hapi/happy（命令前缀） | ⭐ | 1 小时 | ❌ | ❌ 不推荐 |
| **方案 2：开发 Enso Backend** | ⭐⭐⭐ | **3-5 天** | ✅ | ✅ **强烈推荐** |
| 方案 3：Enso 自己实现桥接 | ⭐⭐⭐⭐⭐ | 2-3 周 | ✅ | ❌ 不推荐 |

**选定方案**：**方案 2 - 为 CCB 开发 Enso Backend**

---

## 2. 方案 2 详细设计

### 2.1 架构概览

```
┌─────────────────────────────────────────────────────────┐
│  Enso 主进程 (Electron Main Process)                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Enso RPC Server (TCP/Named Pipe)                  │  │
│  │  - create_pane()  → 创建新 PTY + UI 分屏          │  │
│  │  - send_text()    → terminal.write()              │  │
│  │  - is_alive()     → 检查 PTY 状态                 │  │
│  │  - get_text()     → 读取 PTY 输出缓存             │  │
│  │  - list()         → 枚举所有 panes                │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │ PTY Manager                                        │  │
│  │  - 管理多个 PTY 会话                               │  │
│  │  - 缓存输出                                        │  │
│  │  - 通知 Renderer 更新 UI                           │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
            ↑ TCP/Named Pipe (RPC)
            │
┌───────────┴─────────────────────────────────────────────┐
│  CCB (Python) - 运行在独立进程                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │ EnsoBackend(TerminalBackend)                      │  │
│  │  - create_pane(command, cwd)                      │  │
│  │  - send_text(pane_id, text)                       │  │
│  │  - is_alive(pane_id)                              │  │
│  │  - get_text(pane_id, lines)                       │  │
│  │  - list()                                          │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │ caskd/gaskd/oaskd/laskd Daemons                   │  │
│  │  - 使用 EnsoBackend 进行跨 pane 通信               │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│  Enso 渲染进程 (Renderer Process)                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Multi-Pane UI Layout                              │  │
│  │  ┌──────────────┐  ┌──────────────┐              │  │
│  │  │ AgentTerminal│  │ AgentTerminal│              │  │
│  │  │   (Claude)   │  │   (Codex)    │              │  │
│  │  └──────────────┘  └──────────────┘              │  │
│  │  ┌──────────────┐  ┌──────────────┐              │  │
│  │  │ AgentTerminal│  │ AgentTerminal│              │  │
│  │  │  (Gemini)    │  │  (OpenCode)  │              │  │
│  │  └──────────────┘  └──────────────┘              │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 核心接口设计

#### 2.2.1 RPC 协议定义

**通信方式**：JSON-RPC 2.0 over TCP

**消息格式**：

```typescript
// 请求格式
interface EnsoRPCRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: 'create_pane' | 'send_text' | 'is_alive' | 'get_text' | 'list' | 'kill';
  params: {
    token: string;           // 鉴权 token
    pane_id?: string;        // pane 标识符（= Enso 的 ptyId）
    command?: string;        // 要执行的命令
    cwd?: string;            // 工作目录
    text?: string;           // 要发送的文本
    lines?: number;          // 读取的行数
    title?: string;          // pane 标题（用于标识）
    env?: Record<string, string>; // 环境变量
  };
}

// 响应格式
interface EnsoRPCResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}
```

#### 2.2.2 API 方法详细定义

**1. create_pane**

创建新的 PTY 会话并在 UI 中显示为分屏 pane。

```typescript
// 请求
{
  method: 'create_pane',
  params: {
    token: string,
    command: string,      // 例如: "claude --session-id xxx"
    cwd: string,          // 工作目录
    title?: string,       // pane 标题，用于后续识别
    env?: Record<string, string>
  }
}

// 响应
{
  result: {
    pane_id: string,      // Enso 分配的 PTY ID
    title: string         // 实际使用的标题
  }
}
```

**2. send_text**

向指定 pane 发送文本（模拟用户输入）。

```typescript
// 请求
{
  method: 'send_text',
  params: {
    token: string,
    pane_id: string,
    text: string,         // 要发送的文本
    add_newline?: boolean // 是否自动添加换行（默认 false）
  }
}

// 响应
{
  result: {
    success: true
  }
}
```

**3. is_alive**

检查 pane 是否仍然活跃。

```typescript
// 请求
{
  method: 'is_alive',
  params: {
    token: string,
    pane_id: string
  }
}

// 响应
{
  result: {
    alive: boolean,
    pid?: number          // 如果 alive 为 true，返回进程 PID
  }
}
```

**4. get_text**

读取 pane 的输出内容。

```typescript
// 请求
{
  method: 'get_text',
  params: {
    token: string,
    pane_id: string,
    lines?: number        // 读取最后 N 行（默认 100）
  }
}

// 响应
{
  result: {
    text: string,         // 输出内容
    total_lines: number   // 总行数
  }
}
```

**5. list**

列出所有活跃的 panes。

```typescript
// 请求
{
  method: 'list',
  params: {
    token: string
  }
}

// 响应
{
  result: {
    panes: Array<{
      pane_id: string,
      title: string,
      alive: boolean,
      pid?: number,
      cwd: string
    }>
  }
}
```

**6. kill**

终止指定 pane。

```typescript
// 请求
{
  method: 'kill',
  params: {
    token: string,
    pane_id: string
  }
}

// 响应
{
  result: {
    success: true
  }
}
```

#### 2.2.3 鉴权机制

**Token 生成和验证**：

1. **Enso 启动时**：
   - 生成随机 token（UUID v4）
   - 通过环境变量 `ENSO_RPC_TOKEN` 传递给 CCB
   - 启动 RPC Server 监听本地端口

2. **CCB 连接时**：
   - 从环境变量读取 token
   - 每次 RPC 请求都携带 token
   - Enso Server 验证 token 一致性

3. **安全措施**：
   - 仅监听 localhost（127.0.0.1）
   - Token 每次 Enso 启动时重新生成
   - 请求超时机制（5 秒）

### 2.3 Enso 端实现

#### 2.3.1 目录结构

```
src/main/
├── services/
│   └── ccb/
│       ├── EnsoRPCServer.ts       # RPC 服务器主类
│       ├── PaneManager.ts         # Pane 生命周期管理
│       └── types.ts               # TypeScript 类型定义
├── ipc/
│   └── ccb.ts                     # IPC handlers（Main ↔ Renderer）
└── index.ts                       # 启动 RPC Server

src/renderer/
└── components/
    └── chat/
        └── MultiPaneLayout.tsx    # 多 pane 布局组件
```

#### 2.3.2 核心代码框架

**EnsoRPCServer.ts**

```typescript
import * as net from 'net';
import { BrowserWindow } from 'electron';
import { PaneManager } from './PaneManager';
import { EnsoRPCRequest, EnsoRPCResponse } from './types';

export class EnsoRPCServer {
  private server: net.Server;
  private paneManager: PaneManager;
  private token: string;
  private port: number;

  constructor(private mainWindow: BrowserWindow) {
    this.token = this.generateToken();
    this.port = this.findAvailablePort();
    this.paneManager = new PaneManager(mainWindow);
    this.server = this.createServer();
  }

  private generateToken(): string {
    // 生成 UUID v4 token
    return crypto.randomUUID();
  }

  private findAvailablePort(): number {
    // 查找可用端口（默认从 8765 开始尝试）
    return 8765;
  }

  private createServer(): net.Server {
    const server = net.createServer((socket) => {
      socket.on('data', async (data) => {
        try {
          const request: EnsoRPCRequest = JSON.parse(data.toString());
          const response = await this.handleRequest(request);
          socket.write(JSON.stringify(response) + '\n');
        } catch (error) {
          const errorResponse: EnsoRPCResponse = {
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32700,
              message: 'Parse error',
              data: error.message
            }
          };
          socket.write(JSON.stringify(errorResponse) + '\n');
        }
      });
    });

    server.listen(this.port, '127.0.0.1');
    return server;
  }

  private async handleRequest(request: EnsoRPCRequest): Promise<EnsoRPCResponse> {
    // 验证 token
    if (request.params.token !== this.token) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32001,
          message: 'Invalid token'
        }
      };
    }

    // 路由到具体方法
    switch (request.method) {
      case 'create_pane':
        return await this.handleCreatePane(request);
      case 'send_text':
        return await this.handleSendText(request);
      case 'is_alive':
        return await this.handleIsAlive(request);
      case 'get_text':
        return await this.handleGetText(request);
      case 'list':
        return await this.handleList(request);
      case 'kill':
        return await this.handleKill(request);
      default:
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32601,
            message: 'Method not found'
          }
        };
    }
  }

  private async handleCreatePane(request: EnsoRPCRequest): Promise<EnsoRPCResponse> {
    const { command, cwd, title, env } = request.params;
    const result = await this.paneManager.createPane({ command, cwd, title, env });
    return {
      jsonrpc: "2.0",
      id: request.id,
      result
    };
  }

  private async handleSendText(request: EnsoRPCRequest): Promise<EnsoRPCResponse> {
    const { pane_id, text, add_newline } = request.params;
    await this.paneManager.sendText(pane_id, text, add_newline);
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: { success: true }
    };
  }

  // ... 其他方法实现

  public getConnectionInfo() {
    return {
      port: this.port,
      token: this.token,
      host: '127.0.0.1'
    };
  }

  public close() {
    this.server.close();
    this.paneManager.closeAll();
  }
}
```

**PaneManager.ts**

```typescript
import { BrowserWindow } from 'electron';
import { PtyManager } from '../terminal/PtyManager';

interface PaneInfo {
  pane_id: string;
  ptyId: string;
  title: string;
  cwd: string;
  command: string;
  alive: boolean;
  pid?: number;
  outputBuffer: string[];  // 缓存最近的输出
}

export class PaneManager {
  private panes: Map<string, PaneInfo> = new Map();
  private ptyManager: PtyManager;

  constructor(private mainWindow: BrowserWindow) {
    this.ptyManager = PtyManager.getInstance();
  }

  async createPane(options: {
    command: string;
    cwd: string;
    title?: string;
    env?: Record<string, string>;
  }): Promise<{ pane_id: string; title: string }> {
    const pane_id = `enso-pane-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const title = options.title || `Pane ${this.panes.size + 1}`;

    // 创建 PTY
    const ptyId = await this.ptyManager.create({
      cwd: options.cwd,
      command: options.command,
      env: options.env,
      cols: 120,
      rows: 30
    });

    // 获取 PID
    const pid = await this.ptyManager.getPid(ptyId);

    // 保存 pane 信息
    const paneInfo: PaneInfo = {
      pane_id,
      ptyId,
      title,
      cwd: options.cwd,
      command: options.command,
      alive: true,
      pid,
      outputBuffer: []
    };
    this.panes.set(pane_id, paneInfo);

    // 监听输出，缓存到 outputBuffer
    this.ptyManager.on('data', ptyId, (data: string) => {
      const pane = this.panes.get(pane_id);
      if (pane) {
        pane.outputBuffer.push(data);
        // 只保留最近 1000 行
        if (pane.outputBuffer.length > 1000) {
          pane.outputBuffer = pane.outputBuffer.slice(-1000);
        }
      }
    });

    // 监听退出
    this.ptyManager.on('exit', ptyId, () => {
      const pane = this.panes.get(pane_id);
      if (pane) {
        pane.alive = false;
        pane.pid = undefined;
      }
    });

    // 通知 Renderer 创建 UI pane
    this.mainWindow.webContents.send('ccb:pane-created', {
      pane_id,
      ptyId,
      title
    });

    return { pane_id, title };
  }

  async sendText(pane_id: string, text: string, add_newline = false): Promise<void> {
    const pane = this.panes.get(pane_id);
    if (!pane) {
      throw new Error(`Pane not found: ${pane_id}`);
    }

    const finalText = add_newline ? text + '\n' : text;
    await this.ptyManager.write(pane.ptyId, finalText);
  }

  async isAlive(pane_id: string): Promise<{ alive: boolean; pid?: number }> {
    const pane = this.panes.get(pane_id);
    if (!pane) {
      return { alive: false };
    }
    return { alive: pane.alive, pid: pane.pid };
  }

  async getText(pane_id: string, lines = 100): Promise<{ text: string; total_lines: number }> {
    const pane = this.panes.get(pane_id);
    if (!pane) {
      throw new Error(`Pane not found: ${pane_id}`);
    }

    const buffer = pane.outputBuffer;
    const total_lines = buffer.length;
    const text = buffer.slice(-lines).join('');

    return { text, total_lines };
  }

  async list(): Promise<Array<{
    pane_id: string;
    title: string;
    alive: boolean;
    pid?: number;
    cwd: string;
  }>> {
    return Array.from(this.panes.values()).map(pane => ({
      pane_id: pane.pane_id,
      title: pane.title,
      alive: pane.alive,
      pid: pane.pid,
      cwd: pane.cwd
    }));
  }

  async kill(pane_id: string): Promise<void> {
    const pane = this.panes.get(pane_id);
    if (!pane) {
      throw new Error(`Pane not found: ${pane_id}`);
    }

    await this.ptyManager.kill(pane.ptyId);
    pane.alive = false;

    // 通知 Renderer 关闭 UI pane
    this.mainWindow.webContents.send('ccb:pane-killed', { pane_id });
  }

  closeAll(): void {
    for (const [pane_id, pane] of this.panes.entries()) {
      if (pane.alive) {
        this.ptyManager.kill(pane.ptyId).catch(() => {});
      }
    }
    this.panes.clear();
  }
}
```

### 2.4 CCB 端实现

#### 2.4.1 目录结构

```
claude_code_bridge/
├── lib/
│   ├── terminal.py              # 修改：添加 EnsoBackend
│   ├── enso_backend.py          # 新增：Enso Backend 实现
│   └── enso_rpc_client.py       # 新增：RPC 客户端
└── ccb                          # 修改：添加 Enso 检测
```

#### 2.4.2 核心代码框架

**lib/enso_rpc_client.py**

```python
import socket
import json
import os
import time
from typing import Any, Dict, Optional

class EnsoRPCClient:
    """Enso RPC 客户端"""

    def __init__(self, host: str = None, port: int = None, token: str = None):
        # 从环境变量读取连接信息
        self.host = host or os.environ.get('ENSO_RPC_HOST', '127.0.0.1')
        self.port = port or int(os.environ.get('ENSO_RPC_PORT', '8765'))
        self.token = token or os.environ.get('ENSO_RPC_TOKEN', '')

        self.socket: Optional[socket.socket] = None
        self.request_id = 0

    def connect(self):
        """连接到 Enso RPC Server"""
        if self.socket:
            return

        max_retries = 3
        for attempt in range(max_retries):
            try:
                self.socket = socket.create_connection(
                    (self.host, self.port),
                    timeout=5.0
                )
                return
            except (ConnectionRefusedError, socket.timeout) as e:
                if attempt < max_retries - 1:
                    time.sleep(0.5)
                else:
                    raise RuntimeError(f"Failed to connect to Enso RPC Server: {e}")

    def call(self, method: str, params: Dict[str, Any]) -> Any:
        """调用 RPC 方法"""
        self.connect()

        # 添加 token
        params['token'] = self.token

        # 构造请求
        self.request_id += 1
        request = {
            'jsonrpc': '2.0',
            'id': self.request_id,
            'method': method,
            'params': params
        }

        # 发送请求
        request_json = json.dumps(request) + '\n'
        self.socket.sendall(request_json.encode('utf-8'))

        # 接收响应
        buffer = b''
        while b'\n' not in buffer:
            chunk = self.socket.recv(4096)
            if not chunk:
                raise RuntimeError("Connection closed by server")
            buffer += chunk

        # 解析响应
        response_json = buffer.decode('utf-8').strip()
        response = json.loads(response_json)

        # 检查错误
        if 'error' in response:
            error = response['error']
            raise RuntimeError(f"RPC Error {error['code']}: {error['message']}")

        return response.get('result')

    def close(self):
        """关闭连接"""
        if self.socket:
            self.socket.close()
            self.socket = None
```

**lib/enso_backend.py**

```python
from typing import Optional, List, Dict, Any
from .terminal import TerminalBackend
from .enso_rpc_client import EnsoRPCClient

class EnsoBackend(TerminalBackend):
    """Enso Terminal Backend

    通过 RPC 与 Enso 通信，实现 pane 管理和文本注入。
    """

    def __init__(self):
        self.client = EnsoRPCClient()
        self._current_pane_cache: Optional[str] = None

    def create_pane(
        self,
        command: str,
        cwd: str,
        title: Optional[str] = None,
        env: Optional[Dict[str, str]] = None
    ) -> str:
        """创建新 pane

        Args:
            command: 要执行的命令
            cwd: 工作目录
            title: pane 标题
            env: 环境变量

        Returns:
            pane_id (str): Enso 分配的 pane ID
        """
        result = self.client.call('create_pane', {
            'command': command,
            'cwd': cwd,
            'title': title,
            'env': env or {}
        })
        return result['pane_id']

    def send_text(self, pane_id: str, text: str, add_newline: bool = False):
        """向指定 pane 发送文本

        Args:
            pane_id: 目标 pane ID
            text: 要发送的文本
            add_newline: 是否自动添加换行
        """
        self.client.call('send_text', {
            'pane_id': pane_id,
            'text': text,
            'add_newline': add_newline
        })

    def is_alive(self, pane_id: str) -> bool:
        """检查 pane 是否存活

        Args:
            pane_id: 目标 pane ID

        Returns:
            bool: pane 是否存活
        """
        result = self.client.call('is_alive', {
            'pane_id': pane_id
        })
        return result['alive']

    def get_text(self, pane_id: str, lines: int = 100) -> str:
        """读取 pane 的输出

        Args:
            pane_id: 目标 pane ID
            lines: 读取行数

        Returns:
            str: pane 输出内容
        """
        result = self.client.call('get_text', {
            'pane_id': pane_id,
            'lines': lines
        })
        return result['text']

    def list_panes(self) -> List[Dict[str, Any]]:
        """列出所有 panes

        Returns:
            List[Dict]: pane 信息列表
        """
        result = self.client.call('list', {})
        return result['panes']

    def kill_pane(self, pane_id: str):
        """终止 pane

        Args:
            pane_id: 目标 pane ID
        """
        self.client.call('kill', {
            'pane_id': pane_id
        })

    def get_current_pane_id(self) -> Optional[str]:
        """获取当前 pane ID

        对于 Enso，"当前 pane" 的概念比较模糊。
        这里简单返回缓存的 pane ID（通常是最后创建的）。
        """
        return self._current_pane_cache

    def set_current_pane_id(self, pane_id: str):
        """设置当前 pane ID（用于缓存）"""
        self._current_pane_cache = pane_id
```

**lib/terminal.py 修改**

```python
# 在 detect_terminal() 函数中添加 Enso 检测
def detect_terminal() -> Optional[str]:
    """检测终端类型

    Returns:
        'tmux', 'wezterm', 'enso', or None
    """
    # 检查 Enso
    if _inside_enso():
        return 'enso'

    # 检查 tmux
    if _inside_tmux():
        return 'tmux'

    # 检查 WezTerm
    if _inside_wezterm():
        return 'wezterm'

    return None

def _inside_enso() -> bool:
    """检查是否在 Enso 环境中运行

    通过检查 ENSO_RPC_TOKEN 环境变量判断
    """
    return bool(os.environ.get('ENSO_RPC_TOKEN', '').strip())

def get_backend_for_terminal(terminal: str) -> TerminalBackend:
    """根据终端类型获取对应的 Backend

    Args:
        terminal: 'tmux', 'wezterm', or 'enso'

    Returns:
        TerminalBackend 实例
    """
    if terminal == 'tmux':
        from .tmux_backend import TmuxBackend
        return TmuxBackend()
    elif terminal == 'wezterm':
        from .wezterm_backend import WeztermBackend
        return WeztermBackend()
    elif terminal == 'enso':
        from .enso_backend import EnsoBackend
        return EnsoBackend()
    else:
        raise ValueError(f"Unknown terminal type: {terminal}")
```

### 2.5 Session 文件格式

CCB 使用 session 文件记录每个 provider 的状态。需要适配 Enso Backend。

**示例：.ccb_config/.codex-session**

```json
{
  "terminal": "enso",
  "pane_id": "enso-pane-1234567890-abc123",
  "cwd": "F:\\code\\cc\\EnsoAI",
  "command": "codex",
  "started_at": "2026-01-21T12:34:56.789Z",
  "pid": 12345
}
```

**关键字段**：
- `terminal`: 设置为 `"enso"`
- `pane_id`: Enso 分配的 pane ID
- 其他字段保持与 tmux/wezterm 一致

---

## 3. 实施计划

### 3.1 分阶段实施

#### 阶段 1：MVP（最小可用原型）- 2 天

**目标**：验证 Enso ↔ CCB RPC 通信可行性

**Enso 端**（1 天）：
- [ ] 实现 `EnsoRPCServer` 基础框架
- [ ] 实现 `create_pane` 方法
- [ ] 实现 `send_text` 方法
- [ ] 实现 `is_alive` 方法
- [ ] Token 生成和验证

**CCB 端**（1 天）：
- [ ] 实现 `EnsoRPCClient`
- [ ] 实现 `EnsoBackend` 基本方法
- [ ] 修改 `detect_terminal()` 添加 Enso 检测
- [ ] 测试基本的 create_pane 和 send_text 功能

**验收标准**：
- ✅ CCB 能通过 RPC 让 Enso 创建新 pane
- ✅ CCB 能向指定 pane 注入文本
- ✅ 在 Enso 终端中看到注入的文本

#### 阶段 2：完整功能 - 2 天

**Enso 端**（1 天）：
- [ ] 实现 `PaneManager` 完整功能
- [ ] 实现 `get_text` 方法（输出缓存）
- [ ] 实现 `list` 方法
- [ ] 实现 `kill` 方法
- [ ] IPC 通信（Main ↔ Renderer）
- [ ] 基础的多 pane UI 布局

**CCB 端**（1 天）：
- [ ] 完善 `EnsoBackend` 所有方法
- [ ] Session 文件读写支持
- [ ] 测试 daemon 集成（caskd/gaskd）
- [ ] 错误处理和重连机制

**验收标准**：
- ✅ 支持多个 pane 同时运行
- ✅ cask/gask/oask 工具能正常工作
- ✅ UI 中显示多个 AgentTerminal

#### 阶段 3：优化和完善 - 1 天

**功能优化**：
- [ ] 性能优化（减少 RPC 调用延迟）
- [ ] UI 分屏布局优化（拖拽、调整大小）
- [ ] 日志和调试信息
- [ ] 边界情况处理

**测试**：
- [ ] 端到端测试（完整的多 agent 协作流程）
- [ ] 压力测试（大量文本注入）
- [ ] 错误恢复测试（网络中断、进程崩溃）

**文档**：
- [ ] 用户使用文档
- [ ] 开发者文档（API 参考）
- [ ] 故障排查指南

### 3.2 时间线

| 阶段 | 工作内容 | 预计时间 | 累计时间 |
|------|----------|----------|----------|
| 阶段 1 | MVP 原型 | 2 天 | 2 天 |
| 阶段 2 | 完整功能 | 2 天 | 4 天 |
| 阶段 3 | 优化完善 | 1 天 | 5 天 |

**总计**：约 **5 个工作日**

### 3.3 风险评估

| 风险项 | 影响 | 概率 | 缓解措施 |
|--------|------|------|----------|
| RPC 通信延迟过高 | 中 | 低 | 使用本地连接、优化序列化 |
| 输出缓存占用内存过大 | 低 | 中 | 限制缓存大小、LRU 策略 |
| UI 分屏布局复杂 | 中 | 中 | 先实现简单网格布局 |
| CCB 代码修改冲突 | 高 | 低 | 最小化修改、保持向后兼容 |
| Token 安全性 | 低 | 低 | 仅本地连接、每次启动重新生成 |

---

## 4. 测试计划

### 4.1 单元测试

**Enso 端**：
- `EnsoRPCServer` 的各个方法
- `PaneManager` 的 pane 生命周期管理
- Token 验证逻辑

**CCB 端**：
- `EnsoRPCClient` 的 RPC 调用
- `EnsoBackend` 的各个方法
- Session 文件读写

### 4.2 集成测试

**场景 1：单 pane 创建和通信**
```python
# 测试步骤
1. 启动 Enso
2. CCB 创建一个 pane（claude）
3. CCB 向 pane 发送文本
4. 验证文本出现在 Enso 终端
```

**场景 2：多 pane 协作**
```python
# 测试步骤
1. 启动 Enso
2. CCB 创建多个 panes（claude, codex, gemini）
3. 在 Claude pane 中调用 cask 工具
4. 验证 Codex pane 收到任务并执行
5. 验证结果返回到 Claude pane
```

**场景 3：Pane 生命周期**
```python
# 测试步骤
1. 创建 pane
2. 检查 is_alive 返回 true
3. 终止 pane 进程
4. 检查 is_alive 返回 false
5. 验证 UI 更新状态
```

### 4.3 端到端测试

**完整的多 agent 协作流程**：

```bash
# 1. 启动 Enso
# 2. 在 Enso 中运行 ccb
ccb claude codex

# 3. 在 Claude 中请求 Codex 执行任务
# (在 Claude pane 输入)
请帮我用 Codex 检查代码中的语法错误

# 4. 验证整个流程
- Claude 调用 cask 工具
- caskd daemon 收到请求
- daemon 通过 EnsoBackend 向 Codex pane 注入命令
- Codex 执行并输出结果
- daemon 读取 Codex 日志
- 结果返回到 Claude pane
```

---

## 5. 兼容性和维护

### 5.1 向后兼容

**对现有 CCB 用户的影响**：
- ✅ 不影响现有的 tmux/wezterm backend
- ✅ Enso backend 作为可选功能
- ✅ 自动检测环境，无需手动配置

**环境检测优先级**：
```
1. Enso (ENSO_RPC_TOKEN 存在)
2. tmux (TMUX 环境变量存在)
3. wezterm (WEZTERM_PANE 环境变量存在)
```

### 5.2 升级路径

**CCB 版本要求**：
- 建议在 CCB fork 中实现 Enso Backend
- 或者作为 plugin/extension 方式加载

**Enso 版本要求**：
- 需要 Enso 源码修改（添加 RPC Server）
- 未来可考虑提供 extension API

### 5.3 长期维护

**代码维护**：
- 保持 Enso Backend 与其他 backend 的接口一致
- 定期同步上游 CCB 更新
- 持续优化性能和稳定性

**功能扩展**：
- 支持更多 RPC 方法（如 resize、attach 等）
- UI 功能增强（拖拽分屏、保存布局）
- 与 CCA 的角色配置深度集成

---

## 6. 参考资料

### 6.1 相关项目

- **CCB (Claude Code Bridge)**: https://github.com/bfly123/claude_code_bridge
- **CCA (Claude Code AutoFlow)**: https://github.com/bfly123/claude_code_autoflow
- **node-pty**: https://github.com/microsoft/node-pty
- **JSON-RPC 2.0 Specification**: https://www.jsonrpc.org/specification

### 6.2 技术文档

- **Windows ConPTY API**: https://docs.microsoft.com/en-us/windows/console/creating-a-pseudoconsole-session
- **Electron IPC**: https://www.electronjs.org/docs/latest/tutorial/ipc
- **Python Socket Programming**: https://docs.python.org/3/library/socket.html

### 6.3 设计决策记录

**为什么选择 JSON-RPC over TCP？**
- 简单、成熟、易于调试
- 跨语言支持（TypeScript ↔ Python）
- 可扩展性好

**为什么不使用 WebSocket？**
- 对于本地进程间通信，TCP 足够简单高效
- 不需要 WebSocket 的双向推送特性
- 减少依赖和复杂度

**为什么不使用 Unix Domain Socket？**
- Windows 对 Unix Domain Socket 支持不完善
- TCP localhost 连接性能已足够

---

## 7. 附录

### 7.1 环境变量清单

| 变量名 | 用途 | 设置者 | 示例值 |
|--------|------|--------|--------|
| `ENSO_RPC_HOST` | RPC Server 地址 | Enso | `127.0.0.1` |
| `ENSO_RPC_PORT` | RPC Server 端口 | Enso | `8765` |
| `ENSO_RPC_TOKEN` | 鉴权 Token | Enso | `550e8400-e29b-41d4-a716-446655440000` |

### 7.2 错误代码清单

| 错误代码 | 含义 | 处理方式 |
|----------|------|----------|
| -32700 | Parse error | 检查 JSON 格式 |
| -32600 | Invalid Request | 检查请求格式 |
| -32601 | Method not found | 检查方法名 |
| -32602 | Invalid params | 检查参数 |
| -32603 | Internal error | 服务器内部错误 |
| -32001 | Invalid token | Token 验证失败 |
| -32002 | Pane not found | Pane ID 不存在 |
| -32003 | Connection failed | 连接 RPC Server 失败 |

### 7.3 性能指标

**目标性能**：
- RPC 调用延迟：< 10ms
- 文本注入延迟：< 50ms
- 内存占用：< 100MB（含所有 panes）
- 支持并发 panes：≥ 10 个

### 7.4 FAQ

**Q: Enso Backend 是否会影响 CCB 在其他环境的使用？**
A: 不会。Enso Backend 仅在检测到 `ENSO_RPC_TOKEN` 时激活，不影响 tmux/wezterm 环境。

**Q: 如果 RPC Server 崩溃怎么办？**
A: CCB 会尝试重连（最多 3 次），如果失败会报错并退出。用户需要重启 Enso。

**Q: 是否支持跨机器的 RPC 连接？**
A: 当前设计仅支持本地连接（127.0.0.1），不建议暴露到网络。

**Q: 如何调试 RPC 通信问题？**
A: 可以设置环境变量 `ENSO_RPC_DEBUG=1` 启用详细日志，查看所有 RPC 请求和响应。

---

**文档版本**: v1.0
**最后更新**: 2026-01-21
**作者**: Claude (Anthropic) + Codex 协作分析
**状态**: 待实施
