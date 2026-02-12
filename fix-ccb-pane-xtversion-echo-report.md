---
branch: fix/ccb-pane-xtversion-echo
tests_passed: true
manual_done: false
perf_regressed: false
breaking_changes: false
artifacts: []
---

# Branch Report: fix/ccb-pane-xtversion-echo

## Summary
- **What changed**: Registered a custom CSI handler in xterm.js attach mode to suppress XTVERSION (`CSI > Ps q`) response, preventing `>|xterm.js(VERSION)` echo in CCB panes.
- **Why**: Gemini CLI sends XTVERSION queries on startup; xterm.js responds with a DCS string that Gemini doesn't recognize, echoing it as visible text. Each session/worktree switch causes the string to accumulate.

## User-visible Behavior
- Gemini pane no longer shows `>|xterm.js(6.1.0-beta.144)` on session attach
- No accumulation of echo strings on session/worktree switching
- Claude, Codex, and Shell terminals are unaffected

## Modules Impacted
- `src/renderer/hooks/useXterm.ts` — sole modification target

## API / Compatibility
- Obsoleted: None
- Wrapper notes: None
- Migration notes: None
- Breaking changes: None

## Tests

### Automated (CI)
- [x] `tsc --noEmit` pass (0 errors)
- [x] `biome check` — only pre-existing CRLF line-ending format issue (not introduced by this change)

### Manual
- **Steps**:
  1. Open Gemini pane, verify no `>|xterm.js(...)` text appears
  2. Switch sessions/worktrees 5+ times, verify no accumulation
  3. Open Claude pane, verify normal behavior
  4. Open Codex pane, verify normal behavior
  5. Open Shell terminal, verify normal behavior (new terminal, I/O, resize)
  6. Verify CCB pane attach/detach lifecycle (PTY not killed)
- **Result**: Pending user manual verification

## Performance
- **Metrics**: No performance impact — single CSI handler registration (O(1) setup, O(1) per invocation)
- **Verdict**: No regression

## Codex Review Summary
- **Session ID**: `019c4cfd-67f3-7192-89f8-791defaee835`
- **Findings**:
  1. XTVERSION (`CSI > 0 q`) interception is correct; `{ prefix: '>', final: 'q' }` matches the XTVERSION identifier
  2. `return true` correctly prevents fallthrough to built-in `sendXtVersion()` handler
  3. Handler is scoped to attach mode only (`isAttachMode && attachPtyId` branch); shell terminals unaffected
  4. Lifecycle management (dispose on unmount) is correct and complete
  5. Minor note: handler intercepts all `CSI > Ps q` (not just `Ps=0`) — acceptable since no attach-mode scenario needs XTVERSION responses
  6. Minor note: history replay occurs before handler registration — not a real risk since CCB history contains rendered text, not raw CSI sequences
- **Recommendation**: Approved

## Risks / Follow-ups
- **Known limitations**:
  - Suppresses all `CSI > Ps q` variants in attach mode, not just `Ps=0` (acceptable for CCB use case)
  - xterm.js parser API is stable but could theoretically change in major versions
- **Deferred work**:
  - None

## Merge Readiness Checklist
- [x] DoD items verified (code-level)
- [x] Tests passing (`tsc --noEmit`)
- [x] Codex reviewed
- [x] Performance acceptable
- [x] Dependencies merged (none required)
- [ ] Manual verification by user

---

**Report generated**: 2026-02-12
**Codex Session**: `019c4cfd-67f3-7192-89f8-791defaee835`
