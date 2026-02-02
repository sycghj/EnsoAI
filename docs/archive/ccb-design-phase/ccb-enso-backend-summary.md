# CCB Enso Backend 项目总结

## 会话成果

本次会话通过与 Codex MCP 的深度协作，完成了以下工作：

### 1. 需求分析 ✅

**用户目标**：
- 在 EnsoAI 应用中集成 CCB (Claude Code Bridge)
- 实现多 AI agent（Claude、Codex、Gemini、OpenCode）协作
- 在 Windows + PowerShell + Enso (node-pty) 环境中工作

**环境约束**：
- Windows 系统（非 WSL）
- PowerShell 作为默认 shell
- Enso 使用 node-pty (ConPTY) 创建 PTY
- 所有交互必须在 Enso UI 中可见

### 2. 技术障碍分析 ✅

**Tmux 方案的深度技术分析**：

通过系统架构层面的分析，明确了 tmux 在目标环境中的**不可行性根源**：

```
[ 应用层 ] CCB 调用 tmux 命令
     ↓          ✓ 可解决
[ 兼容层 ] MSYS2/Cygwin POSIX 模拟
     ↓          ⚠️ 部分可解决
[ 系统层 ] Windows ConPTY ≠ POSIX PTY
     ↓          ❌ 不可逾越（架构性差异）
[ 内核层 ] Windows NT ≠ Unix 内核
                ❌ 根本性障碍
```

**关键发现**：
1. tmux 依赖完整的 POSIX PTY/termios 语义体系
2. Windows ConPTY 与 POSIX PTY 是两套**根本不同**的终端抽象
3. MSYS2/Cygwin 的兼容层在嵌套环境中极不稳定
4. 嵌套终端模拟（Enso → MSYS2 → tmux）会导致语义损坏

**结论**：放弃 tmux 方案是正确的技术决策，不是实现问题，而是架构性障碍。

### 3. CCB 协作机制深度解析 ✅

**通信架构**：
```
Claude (PTY 1) → cask → caskd daemon
                          ↓
                    .ccb_config/session 文件
                          ↓
                    terminal backend
                          ↓
Codex (PTY 2) ← send_text() ← backend
       ↓
  log 文件 → daemon 读取 → 返回 Claude
```

**核心依赖**：
1. Session 文件：记录 pane ID
2. Daemon 进程：TCP 监听，转发请求
3. Terminal Backend：提供 send_text/is_alive 等能力
4. 日志文件：daemon 解析回复

**独立 agent 无法协作的原因**：
- ❌ 缺少 session 文件
- ❌ 缺少 daemon 桥接
- ❌ 缺少终端注入能力
- ⚠️ 只能"人肉协作"（复制粘贴）

### 4. Hapi/Happy 对比分析 ✅

**关键发现**：hapi/happy **不能**作为参考

```typescript
// Hapi/Happy 只是"命令前缀"
hapi claude --session-id xxx    // 单个 PTY
happy codex                      // 单个 PTY

// ❌ 不提供多 pane 管理
// ❌ 不提供跨 agent 通信
```

**为什么集成简单**：
- 它们不需要多 pane 协作
- 只是在单个 PTY 中启动一个命令
- 与 CCB 的需求完全不同

### 5. 方案选择与评估 ✅

评估了三种实现方案：

| 方案 | 难度 | 工作量 | 功能完整性 | 推荐度 |
|------|------|--------|-----------|--------|
| 方案 1: 命令前缀（仿 hapi/happy） | ⭐ | 1 小时 | ❌ 无协作 | ❌ |
| **方案 2: Enso Backend for CCB** | ⭐⭐⭐ | **3-5 天** | ✅ 完整 | ✅ **推荐** |
| 方案 3: Enso 重写桥接层 | ⭐⭐⭐⭐⭐ | 2-3 周 | ✅ 完整 | ❌ |

**选定方案**：方案 2 - 为 CCB 开发专门的 Enso Backend

**理由**：
- ✅ 最佳投入产出比（3-5 天 vs 2-3 周）
- ✅ 复用 CCB 现有生态（cask/gask/oask、roles.json）
- ✅ 保持架构清晰，不重复造轮
- ✅ 可分阶段实施，风险可控

### 6. 详细设计文档 ✅

生成了完整的设计文档：`ccb-enso-backend-design.md`

**内容包括**：
1. 项目背景和需求分析
2. 技术障碍详细分析
3. 方案选择和对比
4. **架构设计**（RPC 协议、接口定义）
5. **Enso 端实现**（TypeScript 代码框架）
6. **CCB 端实现**（Python 代码框架）
7. **分阶段实施计划**（MVP → 完整功能 → 优化）
8. 测试计划
9. 兼容性和维护策略
10. FAQ 和故障排查

**核心架构**：
```
Enso RPC Server (TypeScript)
      ↕ JSON-RPC 2.0 over TCP
CCB EnsoBackend (Python)
      ↕ TerminalBackend 接口
caskd/gaskd/oaskd daemons
```

### 7. 实施指南文档 ✅

生成了详细的实施 Prompt：`ccb-enso-backend-implementation-prompt.md`

**阶段 1 任务（MVP - 2 天）**：

**Enso 端**（Day 1）：
- EnsoRPCServer.ts - TCP Server + JSON-RPC
- PaneManager.ts - PTY 管理 + 输出缓存
- types.ts - 类型定义
- 启动和测试

**CCB 端**（Day 2）：
- enso_rpc_client.py - Socket 客户端
- enso_backend.py - Backend 实现
- terminal.py 修改 - Enso 检测
- 集成测试

**验收标准**：
- ✅ CCB 能创建 pane
- ✅ CCB 能注入文本
- ✅ Enso 终端正常显示和交互

---

## 关键技术决策

### 1. 为什么选择 JSON-RPC over TCP？

- ✅ 简单、成熟、易于调试
- ✅ 跨语言支持好（TypeScript ↔ Python）
- ✅ 对本地通信足够高效（<10ms 延迟）
- ✅ 可扩展性强

### 2. 为什么不用 WebSocket？

- 对本地进程间通信，TCP 已足够简单
- 不需要 WebSocket 的双向推送
- 减少依赖和复杂度

### 3. 为什么不用 Unix Domain Socket？

- Windows 对 UDS 支持不完善
- TCP localhost 性能已满足需求

### 4. Token 鉴权机制

- 每次 Enso 启动生成新 token (UUID)
- 仅监听 127.0.0.1，不暴露网络
- 通过环境变量传递给 CCB

---

## 项目文件清单

### 已生成文档

1. **`docs/ccb-enso-backend-design.md`** (21KB)
   - 完整的设计文档
   - 技术分析和架构设计
   - 代码框架和实施计划

2. **`docs/ccb-enso-backend-implementation-prompt.md`** (15KB)
   - 下一个会话的详细 Prompt
   - 分步实施指南
   - 检查清单和调试指南

### 已修改文件

3. **`C:\Users\tzcbz\shell\ccb_start_fixed.ps1`**
   - 伪造 WezTerm 环境（WEZTERM_PANE）
   - 默认在当前 PTY 运行（不启动新窗口）
   - 支持单 provider 模式

### Enso 源码修改（Codex 完成）

4. **`src/renderer/components/chat/AgentTerminal.tsx`**
   - 添加了 `ENSOAI_INTEGRATED_TERMINAL` 环境变量注入
   - 支持 hapi/happy 环境（为后续 Enso Backend 做准备）

5. **`src/main/services/cli/CliDetector.ts`**
   - 版本检测时注入 `ENSOAI_INTEGRATED_TERMINAL=1`

6. **`src/main/utils/shell.ts`**
   - 支持传递额外环境变量

---

## 待实施任务

### 阶段 1: MVP（2 天）

**Enso 端**：
- [ ] 创建 `src/main/services/ccb/` 目录结构
- [ ] 实现 `EnsoRPCServer.ts`
- [ ] 实现 `PaneManager.ts`
- [ ] 实现 `types.ts`
- [ ] 修改 `src/main/index.ts` 启动 RPC Server
- [ ] 基础测试

**CCB 端**：
- [ ] 创建 `lib/enso_rpc_client.py`
- [ ] 创建 `lib/enso_backend.py`
- [ ] 修改 `lib/terminal.py` 添加 Enso 检测
- [ ] 基础测试

**集成测试**：
- [ ] 端到端流程验证
- [ ] create_pane 成功
- [ ] send_text 成功
- [ ] 交互正常

### 阶段 2: 完整功能（2 天）

- [ ] 实现 get_text/list/kill 方法
- [ ] UI 多 pane 布局
- [ ] Session 文件支持
- [ ] Daemon 集成测试

### 阶段 3: 优化完善（1 天）

- [ ] 性能优化
- [ ] UI 优化
- [ ] 错误处理完善
- [ ] 文档和调试指南

---

## 技术亮点

### 1. 系统架构层面的深度分析

不仅分析了"tmux 为什么不工作"，而是从：
- 内核层（Windows NT vs Unix）
- 系统层（ConPTY vs POSIX PTY）
- 兼容层（MSYS2/Cygwin）
- 应用层（CCB 使用方式）

四个层次精确定位了**不可逾越的技术障碍**。

### 2. CCB 协作机制的完整解析

通过源码分析，完整还原了：
- 多 agent 通信流程
- Daemon 桥接机制
- Session 文件作用
- Log reader 原理

明确了"独立启动 agent"无法协作的本质原因。

### 3. 精确的方案对比和选择

不是简单的"能不能做"，而是：
- 实现难度量化（⭐ 评级）
- 工作量估算（天数）
- 功能完整性评估
- 长期维护成本考虑

给出了**有充分技术依据**的推荐方案。

### 4. 可执行的实施计划

不是"空中楼阁"的设计，而是：
- 分阶段实施（MVP → 完整 → 优化）
- 详细的代码框架（可直接使用）
- 具体的验收标准
- 完整的检查清单

确保下一个会话可以**直接开始实施**。

---

## 关键经验总结

### 1. 深入分析比快速尝试更重要

如果没有系统架构层面的分析，可能会：
- 花几天时间尝试让 tmux "跑起来"
- 遇到各种诡异的兼容性问题
- 最终还是放弃，浪费时间

**通过深度分析**，直接确定 tmux 方案不可行，节省了大量时间。

### 2. 理解现有方案的本质

Hapi/Happy 看起来"集成简单"，但如果不理解它们：
- 只是单 PTY 的命令包装
- 不涉及多 pane 管理
- 与 CCB 的需求完全不同

可能会误以为"仿照它们就能实现多 agent 协作"。

### 3. 选择合适的协作工具

通过与 Codex MCP 的协作：
- 快速理解 CCB 的复杂代码库
- 验证技术方案的可行性
- 获得详细的实现建议

比单独分析效率提升了数倍。

### 4. 文档先行，代码后行

先生成详细的设计文档和实施指南：
- 确保方向正确
- 减少返工
- 便于评审和讨论
- 为后续实施提供清晰指引

---

## 后续步骤

### 立即行动

1. **阅读文档**
   - 仔细阅读 `ccb-enso-backend-design.md`
   - 理解架构和接口设计

2. **准备环境**
   - 确保 Enso 和 CCB 代码库都是最新版本
   - 安装必要的依赖

3. **开始实施**
   - 按照 `ccb-enso-backend-implementation-prompt.md` 开始
   - 先完成 Enso 端（Day 1）
   - 再完成 CCB 端（Day 2）

### 中期计划（完成 MVP 后）

1. **完善功能**（阶段 2）
   - 实现完整的 RPC 方法
   - 开发 UI 多 pane 布局
   - 集成 daemon 和 session 文件

2. **优化体验**（阶段 3）
   - 性能优化
   - UI/UX 改进
   - 调试工具和日志

### 长期规划

1. **与 CCA 深度集成**
   - 支持 roles.json 配置
   - 自动化工作流
   - 状态栏显示

2. **扩展功能**
   - 更多 RPC 方法（resize、attach）
   - UI 布局保存/恢复
   - 性能监控和分析

3. **贡献到上游**
   - 考虑将 Enso Backend 贡献到 CCB
   - 或作为 plugin/extension 发布

---

## 感谢

本次会话成功得益于：

1. **Codex MCP 的深度协作**
   - 快速分析复杂代码库
   - 提供详细的技术洞察
   - 验证方案可行性

2. **系统化的分析方法**
   - 从底层到应用层的完整分析
   - 量化的方案对比
   - 可执行的实施计划

3. **充分的技术讨论**
   - 不断提问和深入
   - 多角度验证
   - 找到最优解

---

**项目状态**: 设计完成，待实施
**预计完成时间**: 5 个工作日
**下一步**: 开始阶段 1 MVP 实施

**祝实施顺利！** 🚀
