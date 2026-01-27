# Branch Report: feat/ccb-agent-selector

## Summary
将 CCB (Claude Code Backend) 添加到 Agent 选择器 UI，使用户能在界面中看到并选择 CCB agent。

## Changes

| File | Change |
|------|--------|
| `src/shared/types/cli.ts` | `BuiltinAgentId` 添加 `'ccb'` |
| `src/renderer/components/chat/SessionBar.tsx` | `AGENT_INFO` 添加 CCB 条目 |
| `src/renderer/components/chat/AgentPanel.tsx` | `AGENT_INFO` 添加 CCB 条目 |
| `src/renderer/stores/settings.ts` | `BUILTIN_AGENT_IDS` + `defaultAgentSettings` 添加 CCB |
| `src/renderer/components/settings/constants.ts` | `BUILTIN_AGENT_INFO` + `BUILTIN_AGENTS` 添加 CCB |
| `src/main/services/cli/CliDetector.ts` | `BUILTIN_AGENT_CONFIGS` 添加 CCB |

## Test Results

| Test | Result |
|------|--------|
| `npm run typecheck` | ✅ PASS |
| `npm run lint` | ⚠️ 既有格式问题（CRLF/LF），与本次变更无关 |
| Settings 页面显示 CCB | ✅ PASS (手动验证) |
| SessionBar 可选择 CCB | ✅ PASS (手动验证) |
| AgentPanel 可显示 CCB | ✅ PASS (手动验证) |

## DoD Checklist

- [x] Add 'ccb' to BuiltinAgentId type
- [x] Add CCB to all AGENT_INFO definitions
- [x] Add CCB to BUILTIN_AGENT_IDS and BUILTIN_AGENTS arrays
- [x] Add CCB default settings
- [x] Add CCB to BUILTIN_AGENT_CONFIGS (CliDetector)
- [x] TypeScript type check passes
- [x] UI displays CCB in Agent selector

## Codex Review

- **Status**: ✅ APPROVED
- **SESSION_ID**: `019bfe10-162f-7631-abad-d0e610801a4c`
- **Findings**:
  - 类型安全性 OK（`Record<BuiltinAgentId, ...>` 强类型约束）
  - Settings 迁移逻辑完善（deep-merge 自动补齐缺失 key）
  - 启动链路通用化（无硬编码路由）
- **Suggestions** (non-blocking):
  - 建议将 `SessionBar.tsx` / `AgentPanel.tsx` 的 `AGENT_INFO` 改为 `Record<BuiltinAgentId, ...>` 以增强类型安全

## Risks

- **低风险**: CCB CLI 未安装时，UI 仍会显示但标记为不可用（符合预期行为）

## Next Steps

1. 用户确认后提交
2. 运行 `/wt-merge` 合并到主干
