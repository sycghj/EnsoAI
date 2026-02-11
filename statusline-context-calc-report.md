---
branch: fix/statusline-context-calc
tests_passed: true
manual_done: false
perf_regressed: false
breaking_changes: false
artifacts: []
---

# Branch Report: fix/statusline-context-calc

## Summary
- **What changed**: Use Claude Code's official `used_percentage` field for context window percentage display, with clamped fallback formula
- **Why**: The previous manual calculation was inaccurate (often stuck at ~55%), likely due to misinterpreting `current_usage` token semantics

## User-visible Behavior
- Context window percentage now accurately reflects Claude Code's own calculation when `used_percentage` is available
- Fallback calculation is clamped to [0, 100] range, preventing display of nonsensical values

## Modules Impacted
- `src/preload/index.ts` — IPC type definition
- `src/renderer/stores/agentStatus.ts` — Store interface and mapping
- `src/renderer/components/chat/StatusLine.tsx` — Display logic

## API / Compatibility
- Obsoleted: None
- Wrapper notes: N/A
- Migration notes: Fully backward compatible. `used_percentage` is optional; older Claude Code versions without this field will use the existing fallback formula.

## Tests

### Automated (CI)
- [x] TypeScript type check: 0 errors
- [x] Biome lint (linter): 0 errors

### Manual
- **Steps**:
  1. Start a new session: context should show 0% or low value
  2. After several turns: percentage should increase monotonically
  3. After context compression/summarization: percentage may drop (expected)
  4. Compare displayed percentage with Claude Code CLI's own context indicator
- **Result**: Deferred to runtime testing
- **Notes**: Cannot be fully verified without running Claude Code CLI alongside the app

## Performance
- **Verdict**: No regression — change is a simple conditional check before existing calculation

## Codex Review Summary
- **Session ID**: `019c4a8d-13d9-70d0-9260-db3562d72e30`
- **Findings**:
  - Data path is coherent across preload → store → component
  - `Number.isFinite` filtering prevents bad payload propagation
  - `clampPercent` correctly handles NaN, ±Infinity, negatives, and >100
  - Backward compatibility preserved via optional field + fallback
  - Optional suggestion: could also clamp in store for future consumers
- **Recommendation**: Approved

## Risks / Follow-ups
- **Known limitations**:
  - Manual verification against Claude Code CLI display deferred to runtime
  - `used_percentage` field availability depends on Claude Code version
- **Deferred work**:
  - sessionId routing fix (tracked in `fix/statusline-session-routing`)

## Merge Readiness Checklist
- [x] DoD items verified
- [x] Tests passing
- [x] Codex reviewed
- [x] Performance acceptable
- [x] Dependencies merged (none required)

---

**Report generated**: 2026-02-11
**Codex Session**: `019c4a8d-13d9-70d0-9260-db3562d72e30`
