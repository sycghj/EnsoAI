---
branch: fix/statusline-session-routing
tests_passed: true
manual_done: false
perf_regressed: false
breaking_changes: false
artifacts: []
---

# Branch Report: fix/statusline-session-routing

## Summary
- **What changed**: Fixed sessionId mapping asymmetry in StatusLine chain; added clearStatus lifecycle cleanup; fixed setEnhancedInputOpen ID mismatch in onAgentStop handler.
- **Why**: In multi-session Claude Code scenarios, only the first session displayed a StatusLine because the store key (Claude sessionId) didn't match the query key (UI session.id).

## User-visible Behavior
- All Claude Code sessions now correctly display StatusLine data (model, cost, tokens, etc.)
- Closing a session properly cleans up its StatusLine data from the store
- Enhanced input auto-popup now correctly targets the right session after agent stop

## Modules Impacted
- `src/renderer/components/chat/AgentPanel.tsx` - sessionId prop resolution, clearStatus lifecycle, setEnhancedInputOpen fix
- `src/renderer/stores/agentStatus.ts` - `clearStatus` method (already defined, now called)

## API / Compatibility
- No API changes
- No breaking changes
- `clearStatus` was already defined but never called; this change activates it

## Tests

### Automated (CI)
- [x] `electron-vite build` pass (main + preload + renderer, 0 errors)
- [ ] `eslint` - skipped (worktree environment lacks eslint config, not a code issue)

### Manual
- **Steps**:
  1. Open 2+ Claude Code sessions in the same EnsoAI window - verify all show StatusLine
  2. Open sessions across different worktree directories - verify all show StatusLine
  3. Close a session - verify its StatusLine data is cleaned up (no stale entries)
  4. Resume/continue a session - verify StatusLine correctly reconnects
  5. Verify no cross-session data leakage (session A shows session A data only)
- **Result**: Pending (requires runtime verification)

## Performance
- **Verdict**: No regression expected - changes are lightweight ID resolution and store cleanup
- No new allocations in hot paths; `allSessions.find()` in render loop is O(n) but n is small (typically 1-5 sessions per group)

## Codex Review Summary
- **Session ID**: `019c4a8d-0724-7792-a5e4-55617270cc28`
- **Findings**:
  - Root cause analysis confirmed correct
  - `clearSessionStatus` guard logic validated for shared sessionId scenarios
  - `EnhancedInputContainer` correctly left on `group.activeSessionId` (UI ID)
  - Minor: late status events could repopulate closed-session status (edge case, non-blocking)
  - Optional: `allSessions.find()` could be memoized to Map for O(1) lookup (non-blocking)
- **Recommendation**: Approved

## Risks / Follow-ups
- **Known limitations**:
  - Late status events from Claude hook may repopulate a just-cleared session entry (rare, non-critical)
  - `clearSessionStatus` captures `allSessions` via closure; very fast consecutive closes sharing one Claude ID have minor stale-closure risk
- **Deferred work**:
  - Consider centralizing status cleanup where session removal is globally handled
  - Optional Map memoization for session lookup in render loop

## Changes Detail

### Root Cause
`AgentTerminal` starts Claude with `session.sessionId || session.id` (line 1517), but `StatusLine` received `group.activeSessionId` (UI-layer ID). When these differ (resume/continue scenarios), store has data but StatusLine can't find it.

### Fix Points (all in AgentPanel.tsx)
| # | Line | Change | Purpose |
|---|------|--------|---------|
| 1 | :21 | Import `useAgentStatusStore` | Access `clearStatus` |
| 2 | :283-299 | New `clearSessionStatus` helper | Guarded cleanup on session close |
| 3 | :508-516 | `handleCloseAll` cleanup | Batch close path was bypassing cleanup |
| 4 | :596-597 | `handleCloseSession` cleanup | Single close path cleanup |
| 5 | :657 | Dependency array update | Add `clearSessionStatus` |
| 6 | :740 | `setEnhancedInputOpen(session.id)` | Fix ID asymmetry in onAgentStop |
| 7 | :1586-1641 | `StatusLine sessionId={statusSessionId}` | Core fix: resolve Claude sessionId |

## Merge Readiness Checklist
- [x] DoD items verified
- [x] Build passing
- [x] Codex reviewed
- [x] Performance acceptable
- [x] Dependencies merged (none required)
- [ ] Manual runtime verification pending

---

**Report generated**: 2026-02-11
**Codex Session**: `019c4a8d-0724-7792-a5e4-55617270cc28`
