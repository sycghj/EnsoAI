# CCB Enso Backend 文档索引

## 📚 文档导航

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
   总结文档 → 设计文档 → 实施指南
   ```

2. **理解关键点**：
   - 为什么 tmux 不可行？→ 设计文档第 1.2 节
   - Enso Backend 是什么？→ 设计文档第 2.1 节
   - 如何实施？→ 实施指南

### 如果你准备开始实施

1. **准备工作**：
   - [ ] 阅读设计文档，理解架构
   - [ ] 检查环境（Enso 和 CCB 代码库）
   - [ ] 准备调试工具

2. **开始实施**：
   - 打开实施指南
   - 按照 Day 1/Day 2 任务执行
   - 使用检查清单验证进度

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
Enso RPC Server (TypeScript)
      ↕ JSON-RPC 2.0 over TCP
CCB EnsoBackend (Python)
      ↕ TerminalBackend 接口
caskd/gaskd/oaskd daemons
```

### 实施周期

- **阶段 1 (MVP)**: 2 天
- **阶段 2 (完整功能)**: 2 天
- **阶段 3 (优化)**: 1 天
- **总计**: 约 5 个工作日

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

---

## ✅ 验收标准

### MVP (阶段 1)

- [x] CCB 能通过 RPC 创建 pane
- [x] CCB 能向 pane 注入文本
- [x] Enso 终端正常显示和交互

### 完整功能 (阶段 2)

- [ ] 支持多个 pane 同时运行
- [ ] cask/gask/oask 工具正常工作
- [ ] UI 显示多个 AgentTerminal

### 优化完善 (阶段 3)

- [ ] 性能达标（RPC < 10ms, 文本注入 < 50ms）
- [ ] UI 体验良好（布局合理、响应流畅）
- [ ] 调试工具完善

---

## 📁 相关文件

### 文档

- `ccb-enso-backend-summary.md` - 项目总结
- `ccb-enso-backend-design.md` - 设计文档
- `ccb-enso-backend-implementation-prompt.md` - 实施指南

### 代码（待创建）

**Enso 端**:
- `src/main/services/ccb/EnsoRPCServer.ts`
- `src/main/services/ccb/PaneManager.ts`
- `src/main/services/ccb/types.ts`
- `src/main/ipc/ccb.ts`

**CCB 端**:
- `lib/enso_rpc_client.py`
- `lib/enso_backend.py`
- `lib/terminal.py` (修改)

### 已修改文件

- `C:\Users\tzcbz\shell\ccb_start_fixed.ps1` - CCB 启动脚本
- `src/renderer/components/chat/AgentTerminal.tsx` - Enso 终端组件
- `src/main/services/cli/CliDetector.ts` - CLI 检测
- `src/main/utils/shell.ts` - Shell 工具

---

## 🤝 协作工具

本项目使用了以下 MCP 工具：

- **Codex MCP**: CCB 代码库分析、技术方案验证
- **Web Search**: 查找相关项目和文档
- **Web Fetch**: 获取 GitHub 仓库信息

---

## 📞 支持

如有问题，请：

1. 查看 FAQ（设计文档附录 7.4）
2. 查看调试指南（实施指南"调试指南"部分）
3. 检查错误代码（设计文档附录 7.2）

---

**文档版本**: v1.0
**最后更新**: 2026-01-21
**状态**: 设计完成，待实施
