---
branch: fix/ccb-codex-input-confirm
tests_passed: true
manual_done: false
perf_regressed: false
breaking_changes: false
artifacts: []
---

# Branch Report: fix/ccb-codex-input-confirm

## Summary
- **What changed**: 在 `send_text` RPC 协议中添加可配置的 `newline_delay_ms` 参数，允许不同 TUI 框架指定回车键发送前的延迟时间
- **Why**: Codex CLI 使用 ink/React TUI 框架，其渲染周期可能超过之前硬编码的 50ms 延迟，导致确认对话框无法正确接收输入

## User-visible Behavior
- Bridge (cask) 通过 RPC 向 Codex CLI 发送确认文本时，现在使用 200ms 延迟（之前 50ms），提高 Codex TUI 正确处理输入的可靠性
- Gemini CLI 和 Claude 不受影响，仍使用默认 50ms 延迟

## Modules Impacted

### TypeScript (EnsoAI repo - this worktree)
- `src/main/services/ccb/types.ts` — `EnsoRPCRequest.params` 新增 `newline_delay_ms` 字段
- `src/main/services/ccb/protocol.ts` — 参数验证（整数，0–2000）
- `src/main/services/ccb/core.ts` — `sendText()` 接受可配置延迟，防御性 clamp
- `src/main/services/ccb/EnsoRPCServer.ts` — RPC 调度传递 `newline_delay_ms`

### Python (claude_code_bridge repo - separate)
- `claude_code_bridge/lib/enso_backend.py` — `send_text()` 支持 `newline_delay_ms` 参数
- `claude_code_bridge/lib/codex_comm.py` — Codex 通信层使用 200ms 延迟（可通过 `CCB_CODEX_NEWLINE_DELAY_MS` 环境变量配置）

## API / Compatibility
- **后向兼容**: 旧调用方不传 `newline_delay_ms` → 走默认值 50ms，行为不变
- **参数校验**: 整数，范围 0–2000，非必填
- **防御性**: `core.ts` 对 `NaN`/`Infinity` 做 `Number.isFinite()` 守卫，异常值回退到 50ms
- Migration notes: 无需迁移

## Tests

### Automated (CI)
- [x] `pnpm build` — ✅ 通过（main 530ms, preload 46ms, renderer 33.42s）
- [x] `pnpm lint` — ⚠️ 仅 CRLF 行尾格式警告（仓库预存问题，与本次变更无关）

### Manual
- **Steps**:
  1. 启动 CCB，确保 Codex pane 正常创建
  2. 通过 cask 发送问题给 Codex
  3. 当 Codex 弹出确认对话框时，通过 Bridge 发送确认
  4. 验证 Codex 成功接收确认并继续执行
  5. 同时验证 Gemini 的确认流程仍然正常
- **Result**: 待手动验证（需要运行中的 CCB + Codex 环境）

## Performance
- **Metrics**: 无性能回归。仅修改 `setTimeout` 延迟值，不引入额外计算
- **Verdict**: No regression

## Codex Review Summary
- **Session ID**: `019c46a0-90e8-7a02-b71a-f51d2024a34d`
- **Findings**:
  - 后向兼容性 OK：旧调用方不传参数走默认 50ms
  - 发现 protocol（`> 0`）与 core（`Math.max(0, ...)`）的 0 值处理不一致 → **已修复**，统一为 `>= 0`
  - 建议添加 `Number.isInteger()` 校验 → **已采纳**
  - 建议 core 层添加 `Number.isFinite()` 防御 → **已采纳**
- **Recommendation**: Approved（已采纳全部改进建议）

## Risks / Follow-ups
- **Known limitations**:
  - 200ms 延迟是经验值，未经 Codex CLI 实际环境验证。可通过 `CCB_CODEX_NEWLINE_DELAY_MS` 环境变量调整
  - Python bridge 修改在独立 repo (`claude_code_bridge`)，需同步部署
- **Deferred work**:
  - 手动测试待完成（需 CCB + Codex 运行环境）
  - 若 200ms 仍不足，可能需要逐字符发送方案（PROMPT.md 假设 3）

## 附：Worktree 环境问题发现

### node-gyp / pnpm install 在新 worktree 中失败

**问题**: 新创建的 git worktree 运行 `pnpm install` 时，`@electron/rebuild` → `node-gyp` 报 `Could not find any Visual Studio installation to use`。

**根因**: 主 worktree 的 `node_modules` 是用 **`npm install`** 安装的（有 `.package-lock.json`，无 `.pnpm/`），原生模块已预编译。新 worktree 用 `pnpm install` 需要从零编译，但 `@electron/rebuild` 的 worker 子进程不继承项目级 `.npmrc` 和环境变量中的 VS 路径配置。

**影响**: 所有新 git worktree 的首次 `pnpm install` 都会失败。

**临时解决方案**: `pnpm install --ignore-scripts && pnpm build`

**根治建议**（建议在主分支文档/配置更新）：
1. 将 `.npmrc` 加入 git 追踪（包含 `msvs_version` 和 `msbuild_path`）
2. 或在 `wt-create` 流程中自动从主 worktree 复制 `.npmrc`
3. 长期：统一主 worktree 使用 `pnpm install`，清理残留的 npm `node_modules`

## Merge Readiness Checklist
- [x] DoD items verified (TypeScript 侧)
- [x] Tests passing (`pnpm build`)
- [x] Codex reviewed (Session: `019c46a0-90e8-7a02-b71a-f51d2024a34d`)
- [x] Performance acceptable
- [ ] Manual test with Bridge auto-confirm flow (需实际环境)
- [ ] Dependencies merged (Python bridge 需同步)

---

**Report generated**: 2026-02-10
**Codex Session**: `019c46a0-90e8-7a02-b71a-f51d2024a34d`
