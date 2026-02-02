# CCB Enso Backend 文档索引

## 📚 文档导航

### 0. 集成状态报告 ⭐ 最新
**文件**: [`ccb-integration-status.md`](./ccb-integration-status.md)

**内容**：
- 当前实现进度 (90%)
- 最新修改记录
- 已完成和待完成模块
- 下一步计划
- 验收标准检查清单

**适合**：快速了解当前实现状态和进度

---

### 1. 项目总结
**文件**: [`ccb-enso-backend-summary.md`](./ccb-enso-backend-summary.md)

**内容**：
- 本次会话的完整工作记录
- 技术分析总结
- 关键决策记录
- 经验教训

**适合**：快速了解项目背景和成果

---

### 2. 设计文档
**文件**: [`ccb-enso-backend-design.md`](./ccb-enso-backend-design.md)

**内容**：
- 需求分析
- 技术障碍详解（tmux 为什么不可行）
- CCB 协作机制深度解析
- 完整的架构设计
- RPC 协议定义
- Enso 端实现框架
- CCB 端实现框架
- 测试计划
- FAQ 和故障排查

**适合**：技术评审、架构讨论、实施参考

---

### 3. 实施指南
**文件**: [`ccb-enso-backend-implementation-prompt.md`](./ccb-enso-backend-implementation-prompt.md)

**内容**：
- 下一个实施会话的详细 Prompt
- 阶段 1 (MVP) 任务分解
- Day 1: Enso 端实现
- Day 2: CCB 端实现
- 集成测试流程
- 调试指南
- 检查清单

**适合**：开始实施时使用，直接按步骤执行

---

## 🎯 快速开始

### 如果你是第一次接触这个项目

1. **阅读顺序**：
   ```
   集成状态 → 总结文档 → 设计文档 → 实施指南
   ```

2. **理解关键点**：
   - 当前进度？→ 集成状态报告
   - 为什么 tmux 不可行？→ 设计文档第 1.2 节
   - Enso Backend 是什么？→ 设计文档第 2.1 节
   - 如何实施？→ 实施指南

### 如果你准备开始实施

1. **准备工作**：
   - [x] 阅读设计文档，理解架构
   - [x] 检查环境（Enso 和 CCB 代码库）
   - [ ] 准备调试工具

2. **当前状态**（2026-02-01）：
   - [x] Enso RPC Server 已完成
   - [x] CCB 启动 IPC 已完成
   - [x] 多 Pane UI 已完成
   - [ ] 端到端测试待验证

### 如果你需要技术细节

- **RPC 协议**：设计文档第 2.2 节
- **代码框架**：设计文档第 2.3、2.4 节
- **错误处理**：设计文档附录 7.2 节
- **调试方法**：实施指南"调试指南"部分

---

## 📊 项目概览

### 目标

在 EnsoAI 应用中集成 CCB，实现多 AI agent (Claude/Codex/Gemini/OpenCode) 协作。

### 环境

- Windows 系统（非 WSL）
- PowerShell
- Enso (node-pty/ConPTY)

### 选定方案

**方案 2: 为 CCB 开发 Enso Backend**

### 核心架构

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
│           │ spawn('ccb', ['up'])                            │
│           │                                                 │
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

### 实施周期

- **阶段 1 (MVP)**: ✅ 已完成
- **阶段 2 (完整功能)**: ⚠️ 进行中
- **阶段 3 (优化)**: 待开始

---

## 🔑 关键技术决策

### 1. 为什么不用 tmux？

**根本原因**：Windows ConPTY ≠ POSIX PTY（架构性差异，不可逾越）

详见：设计文档第 1.2 节

### 2. 为什么不仿照 hapi/happy？

**本质区别**：hapi/happy 是单 PTY 命令包装，不涉及多 pane 管理

详见：总结文档"Hapi/Happy 对比分析"部分

### 3. 为什么选择 JSON-RPC over TCP？

- 简单、跨语言、易调试
- 本地连接性能足够（<10ms）
- 可扩展性强

详见：设计文档第 2.2 节

### 4. 为什么选择方案 B (RPC 创建 Pane)？

- CCB 完全掌控 pane 生命周期
- Session 文件正常工作
- 避免 Enso 需要知道 CCB 配置

详见：集成状态报告 2.1 节

---

## ✅ 验收标准

### MVP (阶段 1) ✅ 已完成

- [x] RPC Server 正常启动和监听
- [x] 环境变量正确传递给子进程
- [x] IPC 通道 Main ↔ Renderer 连通
- [x] 多 Pane UI 渲染正常 (2x2 固定布局)
- [x] Agent 选择器显示 CCB 选项
- [x] CCB 启动 IPC 接口
- [x] 选择 CCB agent 时自动启动 CCB

### 端到端验证 (阶段 2) ⚠️ 进行中

- [ ] CCB 能通过 RPC 创建 pane
- [ ] CCB 能向 pane 注入文本
- [ ] Enso 终端正常显示和交互
- [ ] cask/gask/oask 工具正常工作

### 优化完善 (阶段 3)

- [ ] 性能达标（RPC < 10ms, 文本注入 < 50ms）
- [ ] UI 体验良好（布局合理、响应流畅）
- [ ] Settings 页面配置可用

---

## 📁 相关文件

### 文档

| 文件 | 说明 |
|------|------|
| `ccb-integration-status.md` | ⭐ 集成状态报告（最新） |
| `ccb-enso-backend-summary.md` | 项目总结 |
| `ccb-enso-backend-design.md` | 设计文档 |
| `ccb-enso-backend-implementation-prompt.md` | 实施指南 |

### 代码（已创建）

**Enso 端（Main Process）**:
| 文件 | 说明 |
|------|------|
| `src/main/services/ccb/EnsoRPCServer.ts` | RPC 服务器 |
| `src/main/services/ccb/core.ts` | 核心业务逻辑 |
| `src/main/services/ccb/protocol.ts` | 协议验证 |
| `src/main/services/ccb/transport.ts` | NDJSON 传输 |
| `src/main/services/ccb/types.ts` | 类型定义 |
| `src/main/ipc/ccb.ts` | CCB 进程管理 IPC |

**Enso 端（Renderer Process）**:
| 文件 | 说明 |
|------|------|
| `src/renderer/stores/ccbPanes.ts` | Zustand 状态管理 |
| `src/renderer/components/chat/CCBPaneLayout.tsx` | 多 Pane 布局 |
| `src/renderer/components/chat/CCBPaneTerminal.tsx` | 终端组件 |

**CCB 端（Python）**:
| 文件 | 说明 |
|------|------|
| `lib/enso_rpc_client.py` | RPC 客户端 |
| `lib/enso_backend.py` | EnsoBackend 实现 |
| `lib/terminal.py` | 终端检测 |

---

## 🤝 协作工具

本项目使用了以下 MCP 工具：

- **Codex MCP**: CCB 代码库分析、代码审查
- **Web Search**: 查找相关项目和文档
- **Web Fetch**: 获取 GitHub 仓库信息

---

## 📞 支持

如有问题，请：

1. 查看 FAQ（设计文档附录 7.4）
2. 查看调试指南（实施指南"调试指南"部分）
3. 检查错误代码（设计文档附录 7.2）

---

**文档版本**: v2.0
**最后更新**: 2026-02-01
**状态**: Enso 端完成，端到端验证中
