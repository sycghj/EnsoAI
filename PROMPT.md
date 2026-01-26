---
branch: feat/ccb-multi-pane-ui
base: feat/ccb-enso-integration
depends_on:
  - feat/ccb-enso-integration
modules:
  - src/renderer/components/chat/
  - src/renderer/stores/
  - src/preload/
priority: P1
estimate_days: [1, 2]
dod:
  - "Renderer 支持多 AgentTerminal 同时显示"
  - "IPC 监听 ccb:pane-created 事件并动态创建终端组件"
  - "基本的分屏布局（网格或分栏）"
  - "构建成功 + Lint 通过"
tests:
  commands:
    - npm run build
    - npm run lint
---

# Branch Prompt: feat/ccb-multi-pane-ui

## Goal

在 Renderer 进程实现多 Pane 分屏 UI，使 Enso 能够同时显示多个 AI Agent 终端（Claude、Codex、Gemini、OpenCode）。

## Scope (In)

- 监听 `CCB_TERMINAL_OPEN` IPC 事件，动态创建 AgentTerminal 组件
- 实现多 Pane 布局组件（支持 2-4 个终端同时显示）
- Pane 标题显示 provider 名称
- 基本的布局管理（网格布局）

## Non-Goals (Out)

- RPC Server 和 Main 进程逻辑（已在 `feat/ccb-enso-integration` 完成）
- CCB Python 端代码
- 拖拽调整 Pane 大小（未来增强）
- 保存/恢复布局（未来增强）

## Modules Impacted

- `src/renderer/components/chat/` - 终端组件
- `src/renderer/stores/` - 状态管理
- `src/preload/index.ts` - IPC 暴露

## Dependencies

- Base branch: `feat/ccb-enso-integration`
- Depends on: `feat/ccb-enso-integration` (RPC Server 和 IPC 通道)
- Blocked by: 无

## Implementation Plan

### 1. 理解现有 IPC 通道

根据 `feat/ccb-enso-integration` 的报告：
```
CCBCore.createPane() → webContents.send(CCB_TERMINAL_OPEN) → Renderer UI
```

检查 `src/preload/index.ts` 中暴露的 `api.ccb.onTerminalOpen()` 接口。

### 2. 创建多 Pane 布局组件

```typescript
// src/renderer/components/chat/MultiPaneLayout.tsx
interface PaneInfo {
  pane_id: string;
  ptyId: string;
  title: string;
}

export function MultiPaneLayout() {
  const [panes, setPanes] = useState<PaneInfo[]>([]);

  useEffect(() => {
    // 监听 CCB 创建 pane 事件
    window.api.ccb.onTerminalOpen((event, data) => {
      setPanes(prev => [...prev, data]);
    });

    window.api.ccb.onTerminalClose((event, data) => {
      setPanes(prev => prev.filter(p => p.pane_id !== data.pane_id));
    });
  }, []);

  return (
    <div className="grid grid-cols-2 gap-2">
      {panes.map(pane => (
        <AgentTerminal key={pane.pane_id} pane={pane} />
      ))}
    </div>
  );
}
```

### 3. 布局策略

| Pane 数量 | 布局 |
|-----------|------|
| 1 | 全屏 |
| 2 | 左右分栏 (1:1) |
| 3 | 左 1 + 右上下 2 |
| 4 | 2×2 网格 |

### 4. 集成到现有 UI

确定多 Pane 布局在 Enso UI 中的位置和触发条件。

## Test Plan

### Automated (CI)

- [ ] `npm run build` 构建成功
- [ ] `npm run lint` 无错误

### Manual

- [ ] 启动 Enso，通过 RPC 创建多个 pane
- [ ] 验证 UI 中出现多个终端窗口
- [ ] 验证 pane 标题正确显示
- [ ] 验证关闭 pane 时 UI 正确更新

## Risks

- 现有 UI 架构可能需要调整以适配多 Pane
- 终端组件可能需要调整尺寸和样式

## Commands (copy/paste)

```powershell
# 进入 worktree
Set-Location "F:\code\cc\wt\ccb-multi-pane-ui"

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

- [ ] Renderer 支持多 AgentTerminal 同时显示
- [ ] IPC 监听 `CCB_TERMINAL_OPEN` 事件并动态创建终端组件
- [ ] 基本的分屏布局（网格或分栏）
- [ ] `npm run build` 成功
- [ ] `npm run lint` 通过
- [ ] report.md 完成
