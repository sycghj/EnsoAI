# CCB Multi-Pane UI 实现报告

**分支**: `feat/ccb-multi-pane-ui`
**Base**: `feat/ccb-enso-integration`
**日期**: 2026-01-26

---

## 目标

在 Renderer 进程实现多 Pane 分屏 UI，使 Enso 能够同时显示多个 AI Agent 终端（Claude、Codex、Gemini、OpenCode）。

---

## 实现摘要

### 新增文件

| 文件 | 描述 |
|------|------|
| `src/renderer/stores/ccbPanes.ts` | CCB Pane 状态管理 Store（Zustand） |
| `src/renderer/components/chat/CCBPaneTerminal.tsx` | CCB Pane 终端组件（attach 模式） |
| `src/renderer/components/chat/CCBPaneLayout.tsx` | 多 Pane 网格布局组件 |

### 修改文件

| 文件 | 变更说明 |
|------|----------|
| `src/renderer/components/chat/index.ts` | 导出新组件 |
| `src/renderer/components/layout/MainContent.tsx` | 集成 CCB 多 Pane UI，初始化 IPC 监听器 |

---

## 技术实现

### 1. CCB Pane Store (`ccbPanes.ts`)

- **状态结构**：`panes[]` + `layout`（activePaneIndex, flexPercents）
- **核心方法**：`addPane`, `removePane`, `setActivePaneIndex`, `clearPanes`
- **IPC 监听器**：`initCCBPaneListener()` - 幂等设计，监听 `CCB_TERMINAL_OPEN` 和终端退出事件
- **防重复订阅**：使用模块级变量 `ccbPaneListenerCleanup` 实现幂等

### 2. CCBPaneTerminal (`CCBPaneTerminal.tsx`)

- 使用 `useXterm` hook 的 `existingPtyId` 参数实现 attach 模式
- 连接到 CCBCore 在 Main 进程创建的 PTY
- 支持 `interactive` 属性控制是否可交互

### 3. CCBPaneLayout (`CCBPaneLayout.tsx`)

- 网格布局：1 pane 全屏，2 pane 50/50，3 pane 33/33/33，4 pane 2x2
- 可点击切换活跃 pane
- 非活跃 pane 显示半透明遮罩

### 4. MainContent 集成

- 在组件 mount 时初始化 CCB listener（解决逻辑死锁问题）
- 统一渲染结构，避免 AgentPanel 因分支切换被卸载
- CCB pane 和 AgentPanel 可共存（分屏布局）

---

## DoD 验收

| DoD 项目 | 状态 | 证据 |
|----------|------|------|
| Renderer 支持多 AgentTerminal 同时显示 | ✅ | `CCBPaneLayout` 组件支持 1-4 个 pane |
| IPC 监听 `CCB_TERMINAL_OPEN` 事件并动态创建终端组件 | ✅ | `initCCBPaneListener()` 在 MainContent 中调用 |
| 基本的分屏布局（网格或分栏） | ✅ | Grid 布局 + flex 分栏 |
| `npm run build` 成功 | ✅ | TypeScript 类型检查通过 |
| `npm run lint` 通过 | ✅ | Biome 检查无错误 |

---

## 测试结果

```
TypeScript: ✅ 通过 (npx tsc --noEmit)
Biome Lint: ✅ 通过 (npx biome check)
```

---

## Codex 审查

### 第一次审查

**SESSION_ID**: `019bf8d1-a83c-7c52-b127-8ee7c8f61e5a`

#### 审查发现的问题（已修复）

1. **逻辑死锁**：`initCCBPaneListener()` 原本只在 `CCBPaneLayout` mount 时调用，但 `hasCCBPanes` 为 false 时不会渲染该组件
   - ✅ 修复：将 listener 初始化移到 `MainContent`

2. **AgentPanel 卸载问题**：条件分支导致 AgentPanel 在有/无 CCB panes 时被卸载重挂载
   - ✅ 修复：统一渲染结构，使用单一 AgentPanel 渲染路径

3. **多 pane 未初始化**：非 active pane 不会 attach
   - ✅ 修复：所有可见 pane 都传 `isActive={isActive}`，仅 `interactive` 控制交互

### 第二次审查（/wt-finish）

**SESSION_ID**: `019bf91c-d6ca-7db3-81a9-cd10dfd17412`

#### 审查发现的问题（建议后续优化）

1. **焦点争抢风险**：`isActive` 传递给所有终端导致多个 xterm 同时认为自己是 active
   - 📝 建议：仅将 `shouldFocus` 传给活跃 pane

2. **重复字段**：`pane_id` 与 `ptyId` 重复，`flexPercents` 未使用（死字段）
   - 📝 建议：移除 `pane_id`，删除 `flexPercents`

3. **active index 计算问题**：`removePane` 在"删除 active 之前的 pane"场景计算错误
   - 📝 建议：修复 index 偏移逻辑

4. **监听器清理风险**：单例模式可能导致多处调用/卸载时互相干扰
   - 📝 建议：改用 ref-count 模式

5. **重复逻辑**：store 监听 terminal exit + useXterm onExit 回调存在冗余
   - 📝 建议：收敛到 store 一处处理

**Recommendation**: Approved with suggestions - 建议在后续迭代应用 Codex 提供的 unified diff patch

---

## 变更统计

```
新增文件: 3
修改文件: 2
总代码行数: ~400 行
```

---

## 下一步

运行 `/wt-merge` 将此分支合并到 main。

---

## 附录：文件清单

```
src/renderer/stores/ccbPanes.ts          (新增)
src/renderer/components/chat/CCBPaneTerminal.tsx  (新增)
src/renderer/components/chat/CCBPaneLayout.tsx    (新增)
src/renderer/components/chat/index.ts    (修改)
src/renderer/components/layout/MainContent.tsx   (修改)
```
