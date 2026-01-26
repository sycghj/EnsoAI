---
branch: feat/ccb-enso-integration
base: feat/ccb-enso-backend
depends_on: []
modules:
  - src/main/index.ts
  - src/main/ipc/ccb.ts
  - src/main/services/ccb/
priority: P0
estimate_days: [0.5, 1]
dod:
  - "RPC Server 在主窗口创建时启动"
  - "环境变量传递给 PTY 子进程"
  - "IPC handlers 实现 Main ↔ Renderer 通信"
  - "构建成功 + Lint 通过"
tests:
  commands:
    - npm run build
    - npm run lint
---

# Branch Prompt: feat/ccb-enso-integration

## Goal

在 Enso 启动时初始化 CCB RPC Server，通过环境变量传递连接信息给 PTY 子进程，使 CCB 能够检测到 Enso 环境并建立 RPC 通信。

## Scope (In)

- 在 `src/main/index.ts` 中创建和管理 `EnsoRPCServer` 实例
- 通过环境变量传递 `ENSO_RPC_HOST`, `ENSO_RPC_PORT`, `ENSO_RPC_TOKEN` 给 PTY
- 实现 `src/main/ipc/ccb.ts` 用于 Main ↔ Renderer IPC 通信
- 在 `app.on('before-quit')` 时清理 RPC Server

## Non-Goals (Out)

- 多 Pane UI 布局（由 `feat/ccb-multi-pane-ui` 负责）
- CCB Python 端代码修改（已完成）
- 端到端测试（由 `test/ccb-e2e-validation` 负责）

## Modules Impacted

- `src/main/index.ts` - 启动逻辑
- `src/main/ipc/ccb.ts` - IPC handlers（新增）
- `src/main/services/terminal/PtyManager.ts` - 环境变量注入
- `src/main/services/ccb/EnsoRPCServer.ts` - RPC Server（已实现）

## Dependencies

- Base branch: `feat/ccb-enso-backend`
- Depends on: 无
- Blocked by: 无

## Implementation Plan

### 1. 修改 `src/main/index.ts`

```typescript
import { EnsoRPCServer } from './services/ccb/EnsoRPCServer';

// 在创建主窗口后
let rpcServer: EnsoRPCServer | null = null;

async function createWindow() {
  const mainWindow = new BrowserWindow({ ... });

  // 初始化 RPC Server
  rpcServer = new EnsoRPCServer(mainWindow);
  await rpcServer.ready;

  const { port, token, host } = rpcServer.getConnectionInfo();
  console.log(`[CCB] RPC Server listening on ${host}:${port}`);

  // 设置环境变量（供子进程继承）
  process.env.ENSO_RPC_HOST = host;
  process.env.ENSO_RPC_PORT = String(port);
  process.env.ENSO_RPC_TOKEN = token;

  return mainWindow;
}

// 清理
app.on('before-quit', () => {
  rpcServer?.close();
});
```

### 2. 创建 `src/main/ipc/ccb.ts`

```typescript
import { ipcMain, BrowserWindow } from 'electron';

export function registerCCBHandlers(mainWindow: BrowserWindow): void {
  // 监听来自 CCBCore 的 pane 创建事件，转发给 Renderer
  // 这些在 CCBCore 中通过 mainWindow.webContents.send() 处理

  // 可选：提供查询接口
  ipcMain.handle('ccb:get-connection-info', () => {
    return {
      host: process.env.ENSO_RPC_HOST,
      port: process.env.ENSO_RPC_PORT,
      // 注意：不暴露 token 给 Renderer
    };
  });

  ipcMain.handle('ccb:list-panes', async (_, rpcServer) => {
    // 可选：返回当前 pane 列表
  });
}
```

### 3. 修改 `PtyManager.ts` 确保环境变量传递

检查 PTY 创建时是否继承 `process.env`，确保 CCB 子进程能读取 RPC 连接信息。

## Test Plan

### Automated (CI)

- [ ] `npm run build` 构建成功
- [ ] `npm run lint` 无错误

### Manual

- [ ] 启动 Enso，检查控制台日志确认 RPC Server 启动
- [ ] 在 Enso 终端中运行 `echo $ENSO_RPC_TOKEN` 确认环境变量已传递
- [ ] 运行 `test-ccb-rpc.js` 测试脚本验证 RPC 连接

## Risks

- PTY 环境变量未正确继承：检查 PtyManager 的 env 参数
- 端口冲突：EnsoRPCServer 已实现自动端口回退

## Commands (copy/paste)

```powershell
# 进入 worktree
Set-Location "F:\code\cc\wt\ccb-enso-integration"

# 安装依赖（如需要）
npm install

# 构建
npm run build

# Lint
npm run lint

# 开发模式运行
npm run dev
```

## Done When (DoD)

- [ ] RPC Server 随 Enso 启动自动初始化
- [ ] 环境变量 `ENSO_RPC_*` 传递给 PTY 子进程
- [ ] `npm run build` 成功
- [ ] `npm run lint` 通过
- [ ] 手动测试确认 RPC 连接可用
- [ ] report.md 完成
