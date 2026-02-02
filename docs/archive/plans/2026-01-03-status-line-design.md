# Claude Code Status Line 集成设计

## 概述

在每个 Agent Group 底部显示 Claude Code 的实时状态信息（model、context usage、cost 等），支持用户配置显示字段。

## 数据流

```
Claude Code CLI
  → statusLine command (enso-statusline.sh)
  → HTTP POST /status-line
  → ClaudeIdeBridge
  → IPC: AGENT_STATUS_UPDATE
  → agentStatus store
  → StatusLine 组件
```

## Session 关联

应用通过 `--session-id` 参数将自己的 session ID 传递给 Claude Code，因此两者共用同一个 session_id，可直接匹配。

## 实现细节

### 1. Status Line 脚本

**位置**：`~/.claude/hooks/enso-statusline.sh`

```bash
#!/bin/bash
input=$(cat)
PORT=$(ls ~/.claude/ide/*.lock 2>/dev/null | head -1 | xargs -I{} basename {} .lock)
[ -z "$PORT" ] && exit 0
curl -s -X POST "http://127.0.0.1:$PORT/status-line" \
  -H "Content-Type: application/json" \
  -d "$input" >/dev/null 2>&1
echo ""
```

**工作方式**：
- 接收 Claude Code 的 JSON stdin
- 转发到应用的 HTTP 端点
- 返回空行（不覆盖 Claude Code 原生 status line）

### 2. Claude Settings 配置

**位置**：`~/.claude/settings.json`

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/hooks/enso-statusline.sh"
  }
}
```

### 3. 后端扩展 (ClaudeIdeBridge.ts)

添加 `/status-line` POST 端点：

```typescript
if (req.method === 'POST' && req.url === '/status-line') {
  let body = '';
  req.on('data', (chunk) => { body += chunk.toString(); });
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      const sessionId = data.session_id;
      if (sessionId) {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) {
            window.webContents.send(IPC_CHANNELS.AGENT_STATUS_UPDATE, {
              sessionId,
              model: data.model,
              contextWindow: data.context_window,
              cost: data.cost,
              workspace: data.workspace,
            });
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch {
      res.writeHead(400);
      res.end();
    }
  });
  return;
}
```

### 4. IPC 通道

新增：`AGENT_STATUS_UPDATE: 'agent:status:update'`

### 5. 前端数据存储

**文件**：`src/renderer/stores/agentStatus.ts`

```typescript
interface StatusData {
  model: {
    id: string;
    displayName: string;
  };
  contextWindow: {
    totalInputTokens: number;
    totalOutputTokens: number;
    contextWindowSize: number;
    currentUsage: {
      inputTokens: number;
      outputTokens: number;
      cacheCreationInputTokens: number;
      cacheReadInputTokens: number;
    } | null;
  };
  cost: {
    totalCostUsd: number;
    totalDurationMs: number;
    totalLinesAdded: number;
    totalLinesRemoved: number;
  };
  updatedAt: number;
}

interface AgentStatusStore {
  statuses: Record<string, StatusData>;  // key: sessionId
  updateStatus: (sessionId: string, data: Partial<StatusData>) => void;
  clearStatus: (sessionId: string) => void;
}
```

### 6. StatusLine 组件

**文件**：`src/renderer/components/chat/StatusLine.tsx`

**Props**：
```typescript
interface StatusLineProps {
  sessionId: string | null;
}
```

**布局**：
```
┌─────────────────────────────────────────────┐
│ [Opus 4.5] · 45% · $0.05 · 2m · +156/-23   │
└─────────────────────────────────────────────┘
```

**样式**：
- 高度：`h-6`
- 背景：`bg-background/80 backdrop-blur`
- 边框：`border-t border-border`
- 文字：`text-xs text-muted-foreground`
- 无数据时：显示 `--` 或隐藏

### 7. AgentPanel 集成

在每个 group 底部添加 StatusLine：

```tsx
<div className="flex flex-col h-full">
  <div className="flex-1">{/* terminal 区域 */}</div>
  <StatusLine sessionId={group.activeSessionId} />
</div>
```

### 8. 设置配置

**类型**：
```typescript
interface StatusLineSettings {
  enabled: boolean;
  fields: {
    model: boolean;      // 默认 true
    context: boolean;    // 默认 true
    cost: boolean;       // 默认 true
    duration: boolean;   // 默认 false
    lines: boolean;      // 默认 false
  };
}
```

**UI**：Settings 中添加 Status Line 配置区，使用 checkbox 让用户选择显示字段。

### 9. 配置备份与恢复

**备份位置**：`{app.getPath('userData')}/claude-statusline-backup.json`

**数据结构**：
```typescript
{
  originalConfig: StatusLineConfig | null,  // null 表示原本没有配置
  backupTime: string,
}
```

**启用流程**：
1. 读取 `~/.claude/settings.json` 中现有 statusLine 配置
2. 备份到 `{userData}/claude-statusline-backup.json`
3. 创建脚本 `~/.claude/hooks/enso-statusline.sh`
4. 写入我们的 statusLine 配置

**禁用流程**：
1. 读取备份文件
2. 恢复原配置到 `~/.claude/settings.json`（或删除 statusLine 字段）
3. 删除备份文件
4. 删除脚本

### 10. Hook 管理函数

**文件**：`src/main/services/claude/ClaudeHookManager.ts`

```typescript
export function ensureStatusLineHook(): boolean
export function removeStatusLineHook(): boolean
export function isStatusLineHookInstalled(): boolean
```

## 文件清单

| 文件 | 操作 |
|------|------|
| `src/main/services/claude/ClaudeIdeBridge.ts` | 添加 `/status-line` 端点 |
| `src/main/services/claude/ClaudeHookManager.ts` | 添加 statusline hook 管理 |
| `src/shared/types/ipc.ts` | 添加 `AGENT_STATUS_UPDATE` |
| `src/preload/index.ts` | 添加 IPC 监听 |
| `src/renderer/stores/agentStatus.ts` | 新建 |
| `src/renderer/components/chat/StatusLine.tsx` | 新建 |
| `src/renderer/components/chat/AgentPanel.tsx` | 集成 StatusLine |
| `src/renderer/stores/settings.ts` | 添加 statusLineSettings |
| Settings UI | 添加配置面板 |
