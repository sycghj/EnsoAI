import { create } from 'zustand';
import { normalizePath, pathsEqual } from '@/App/storage';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';

// Maximum pane slots for 1+2 layout (Claude + Codex + Gemini)
const MAX_PANE_SLOTS = 3;

type WorktreeKey = string;

/**
 * CCB process status
 */
export type CCBStatus = 'idle' | 'starting' | 'running' | 'error';

/**
 * CCB Pane information received from Main process via IPC.
 */
export interface CCBPane {
  pane_id: string; // Also used as ptyId for terminal data routing
  ptyId: string;
  cwd: string;
  title: string;
  slotIndex: number; // 0..2 fixed slots for 1+2 layout
  createdAt: number;
}

/**
 * Layout configuration for CCB panes.
 */
export interface CCBPaneLayout {
  // Active slot index (0..2)
  activePaneIndex: number;
}

interface WorktreeCCBState {
  panes: CCBPane[];
  layout: CCBPaneLayout;
  cwd: string | null; // original casing cwd used for PTY creation
  ccbStatus: CCBStatus; // CCB process status
  ccbError: string | null; // Error message if status is 'error'
}

type WorktreeStates = Record<WorktreeKey, WorktreeCCBState>;

type ExternalAddResult = 'added' | 'ignored' | 'overflow';

export interface EnsureWorktreePanesOptions {
  desiredCount?: number;
}

interface CCBPanesState {
  worktrees: WorktreeStates;

  // Back-compat selectors for existing callers (should be avoided for new code)
  panes: CCBPane[];
  layout: CCBPaneLayout;

  // Actions
  addExternalPane: (event: {
    ptyId: string;
    cwd: string;
    title?: string;
    slotIndex?: number;
  }) => ExternalAddResult;
  ensureWorktreePanes: (
    worktreePath: string,
    options?: EnsureWorktreePanesOptions
  ) => Promise<void>;
  startCCB: (worktreePath: string) => Promise<{ success: boolean; error?: string }>;
  stopCCB: (worktreePath: string) => Promise<void>;
  closeWorktreeCCB: (worktreePath: string) => Promise<void>;
  getCCBStatus: (worktreePath: string) => CCBStatus;
  updateCCBStatus: (cwd: string, status: CCBStatus, error?: string) => void;
  removePane: (paneId: string) => void;
  setActivePaneIndex: (worktreePath: string, index: number) => void;
  clearPanes: () => void;
}

function clampSlotIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.trunc(index), MAX_PANE_SLOTS - 1));
}

function findFreeSlot(panes: CCBPane[]): number | null {
  const used = new Set(panes.map((p) => p.slotIndex));
  for (let i = 0; i < MAX_PANE_SLOTS; i += 1) {
    if (!used.has(i)) return i;
  }
  return null;
}

function hasPaneId(worktrees: WorktreeStates, paneId: string): boolean {
  for (const state of Object.values(worktrees)) {
    if (state.panes.some((p) => p.pane_id === paneId)) return true;
  }
  return false;
}

/**
 * Check if an agent ID is a CCB agent (handles -hapi/-happy suffixes).
 */
function isCCBAgent(agentId: string): boolean {
  const baseId = agentId.endsWith('-hapi')
    ? agentId.slice(0, -5)
    : agentId.endsWith('-happy')
      ? agentId.slice(0, -6)
      : agentId;
  return baseId === 'ccb';
}

/**
 * Resolve the worktree key for a pane's cwd.
 * Prefers an existing worktree entry whose cwd is the longest prefix of paneCwd.
 * This avoids accidentally creating separate worktree states for subdirectories.
 */
function resolveWorktreeKeyForPaneCwd(worktrees: WorktreeStates, paneCwd: string): WorktreeKey {
  const paneKey = normalizePath(paneCwd);
  let bestKey: WorktreeKey = paneKey;
  let bestPrefixLen = -1;

  for (const [key, wt] of Object.entries(worktrees)) {
    const base = wt.cwd ? normalizePath(wt.cwd) : key;
    if (paneKey === base || paneKey.startsWith(`${base}/`)) {
      if (base.length > bestPrefixLen) {
        bestPrefixLen = base.length;
        bestKey = key;
      }
    }
  }

  return bestKey;
}

const ensureInFlightByWorktree = new Map<WorktreeKey, Promise<void>>();

export const useCCBPanesStore = create<CCBPanesState>((set, get) => ({
  worktrees: {},

  // Back-compat selectors for existing callers (should be avoided for new code)
  panes: [],
  layout: { activePaneIndex: 0 },

  addExternalPane: (event) => {
    // Ignore duplicates (never destroy a PTY we already track)
    if (hasPaneId(get().worktrees, event.ptyId)) return 'ignored';

    let result: ExternalAddResult = 'added';
    let activityWorktreePath: string | null = null;

    set((state) => {
      const key = resolveWorktreeKeyForPaneCwd(state.worktrees, event.cwd);
      const prev = state.worktrees[key] ?? {
        panes: [],
        layout: { activePaneIndex: 0 },
        cwd: null,
        ccbStatus: 'idle',
        ccbError: null,
      };
      // Re-check inside set (race-safe)
      if (hasPaneId(state.worktrees, event.ptyId)) {
        result = 'ignored';
        return state;
      }

      // Prefer specified slotIndex if provided and not already taken
      const requestedSlotIndex =
        typeof event.slotIndex === 'number' ? clampSlotIndex(event.slotIndex) : null;

      const slotConflict =
        requestedSlotIndex !== null && prev.panes.some((p) => p.slotIndex === requestedSlotIndex);

      if (slotConflict) {
        console.warn(
          `[CCB] Requested slot ${requestedSlotIndex} already occupied, falling back to auto-assign`
        );
      }

      const slotIndex =
        requestedSlotIndex !== null && !slotConflict
          ? requestedSlotIndex
          : findFreeSlot(prev.panes);

      if (slotIndex === null) {
        result = 'overflow';
        return state;
      }

      const nextPanes: CCBPane[] = [
        ...prev.panes,
        {
          pane_id: event.ptyId,
          ptyId: event.ptyId,
          cwd: event.cwd,
          title: event.title ?? 'CCB Terminal',
          slotIndex,
          createdAt: Date.now(),
        },
      ];

      // Track worktree path for CCB activity
      activityWorktreePath = prev.cwd ?? event.cwd;

      return {
        ...state,
        worktrees: {
          ...state.worktrees,
          [key]: {
            ...prev,
            panes: nextPanes,
            layout: { activePaneIndex: slotIndex },
            cwd: prev.cwd ?? event.cwd,
          },
        },
      };
    });

    // Notify activity store that CCB is active for this worktree
    if (activityWorktreePath && result === 'added') {
      useWorktreeActivityStore.getState().setCCBActive(activityWorktreePath, true);
    }

    return result;
  },

  ensureWorktreePanes: async (worktreePath, _options) => {
    // Note: With CCB RPC approach (方案 B), panes are created by CCB Python side
    // via RPC create_pane calls. This function only initializes the worktree state
    // and waits for CCB to create panes through the RPC server.
    // The desiredCount option is ignored - pane count is determined by CCB.

    const key = normalizePath(worktreePath);

    const existingInFlight = ensureInFlightByWorktree.get(key);
    if (existingInFlight) return existingInFlight;

    const task = (async () => {
      // Ensure worktree state exists and capture cwd (preserve original casing if possible)
      set((state) => {
        const prev = state.worktrees[key];
        if (prev) {
          return prev.cwd
            ? state
            : {
                ...state,
                worktrees: { ...state.worktrees, [key]: { ...prev, cwd: worktreePath } },
              };
        }
        return {
          ...state,
          worktrees: {
            ...state.worktrees,
            [key]: {
              panes: [],
              layout: { activePaneIndex: 0 },
              cwd: worktreePath,
              ccbStatus: 'idle',
              ccbError: null,
            },
          },
        };
      });

      // Panes will be created by CCB via RPC create_pane calls.
      // The CCB_TERMINAL_OPEN IPC event (handled by initCCBPaneListener) will
      // trigger addExternalPane to add panes to the UI as they are created.
    })().finally(() => {
      ensureInFlightByWorktree.delete(key);
    });

    ensureInFlightByWorktree.set(key, task);
    return task;
  },

  startCCB: async (worktreePath) => {
    const key = normalizePath(worktreePath);
    const current = get().worktrees[key];

    // Check if already starting or running
    if (current?.ccbStatus === 'starting' || current?.ccbStatus === 'running') {
      return { success: true };
    }

    // Update status to starting
    set((state) => {
      const prev = state.worktrees[key] ?? {
        panes: [],
        layout: { activePaneIndex: 0 },
        cwd: worktreePath,
        ccbStatus: 'idle',
        ccbError: null,
      };
      return {
        ...state,
        worktrees: {
          ...state.worktrees,
          [key]: { ...prev, ccbStatus: 'starting', ccbError: null, cwd: prev.cwd ?? worktreePath },
        },
      };
    });

    try {
      const result = await window.electronAPI.ccb.start({ cwd: worktreePath });

      if (result.success) {
        useWorktreeActivityStore.getState().setCCBActive(worktreePath, true);
        set((state) => {
          const prev = state.worktrees[key];
          if (!prev) return state;
          return {
            ...state,
            worktrees: {
              ...state.worktrees,
              [key]: { ...prev, ccbStatus: 'running', ccbError: null },
            },
          };
        });
      } else {
        useWorktreeActivityStore.getState().setCCBActive(worktreePath, false);
        set((state) => {
          const prev = state.worktrees[key];
          if (!prev) return state;
          return {
            ...state,
            worktrees: {
              ...state.worktrees,
              [key]: { ...prev, ccbStatus: 'error', ccbError: result.error ?? 'Unknown error' },
            },
          };
        });
      }

      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      useWorktreeActivityStore.getState().setCCBActive(worktreePath, false);
      set((state) => {
        const prev = state.worktrees[key];
        if (!prev) return state;
        return {
          ...state,
          worktrees: {
            ...state.worktrees,
            [key]: { ...prev, ccbStatus: 'error', ccbError: error },
          },
        };
      });
      return { success: false, error };
    }
  },

  stopCCB: async (worktreePath) => {
    const key = normalizePath(worktreePath);
    await window.electronAPI.ccb.stop(worktreePath);
    useWorktreeActivityStore.getState().setCCBActive(worktreePath, false);

    set((state) => {
      const prev = state.worktrees[key];
      if (!prev) return state;
      return {
        ...state,
        worktrees: {
          ...state.worktrees,
          [key]: { ...prev, ccbStatus: 'idle', ccbError: null },
        },
      };
    });
  },

  closeWorktreeCCB: async (worktreePath) => {
    const rootKey = normalizePath(worktreePath);
    const snapshot = get().worktrees;
    const keysToClose = Object.keys(snapshot).filter(
      (k) => k === rootKey || k.startsWith(`${rootKey}/`)
    );

    // Collect pane IDs to destroy
    const paneIds: string[] = [];
    for (const key of keysToClose) {
      const wt = snapshot[key];
      if (!wt) continue;
      for (const pane of wt.panes) {
        paneIds.push(pane.ptyId);
      }
    }

    // Optimistically clear UI state so the grid closes immediately
    if (keysToClose.length > 0) {
      set((state) => {
        const next = { ...state.worktrees };
        for (const key of keysToClose) {
          delete next[key];
        }
        return { ...state, worktrees: next };
      });
    }

    useWorktreeActivityStore.getState().setCCBActive(worktreePath, false);

    // Remove CCB agent sessions for this worktree to prevent auto-restart
    const {
      removeSession,
      removeGroupState,
      updateGroupState,
      setActiveId,
    } = useAgentSessionsStore.getState();

    // Get CCB session IDs from fresh state
    const ccbSessionIds = useAgentSessionsStore
      .getState()
      .sessions.filter((s) => pathsEqual(s.cwd, worktreePath) && isCCBAgent(s.agentId))
      .map((s) => s.id);

    // Remove CCB sessions
    for (const id of ccbSessionIds) {
      removeSession(id);
    }

    // Handle group state and activeId cleanup
    if (ccbSessionIds.length > 0) {
      const removed = new Set(ccbSessionIds);
      // Re-read sessions after removal to get accurate remaining count
      const remainingSessions = useAgentSessionsStore
        .getState()
        .sessions.filter((s) => pathsEqual(s.cwd, worktreePath));

      if (remainingSessions.length === 0) {
        setActiveId(worktreePath, null);
        removeGroupState(worktreePath);
      } else {
        // Ensure group state doesn't reference removed session ids
        updateGroupState(worktreePath, (state) => {
          if (state.groups.length === 0) return state;

          const groupsBefore = state.groups.length;
          const nextGroups = state.groups
            .map((g) => {
              const sessionIds = g.sessionIds.filter((sid) => !removed.has(sid));
              const activeSessionId =
                g.activeSessionId && sessionIds.includes(g.activeSessionId)
                  ? g.activeSessionId
                  : (sessionIds[0] ?? null);
              return { ...g, sessionIds, activeSessionId };
            })
            .filter((g) => g.sessionIds.length > 0);

          const activeGroupId = nextGroups.some((g) => g.id === state.activeGroupId)
            ? state.activeGroupId
            : (nextGroups[0]?.id ?? null);

          const flexPercents =
            nextGroups.length === groupsBefore
              ? state.flexPercents
              : nextGroups.length > 0
                ? nextGroups.map(() => 100 / nextGroups.length)
                : [];

          return { groups: nextGroups, activeGroupId, flexPercents };
        });

        // Fix activeId if it was pointing to a removed CCB session
        const activeKey = normalizePath(worktreePath);
        const currentActiveId = useAgentSessionsStore.getState().activeIds[activeKey];
        if (currentActiveId && removed.has(currentActiveId)) {
          setActiveId(worktreePath, remainingSessions[0]?.id ?? null);
        }
      }
    }

    // Stop CCB to avoid new panes being created while we tear down PTYs
    try {
      await window.electronAPI.ccb.stop(worktreePath);
    } catch (err) {
      console.warn('[CCB] Failed to stop CCB:', err);
    }

    // Destroy all PTYs
    if (paneIds.length > 0) {
      await Promise.allSettled(paneIds.map((id) => window.electronAPI.terminal.destroy(id)));
    }
  },

  getCCBStatus: (worktreePath) => {
    const key = normalizePath(worktreePath);
    return get().worktrees[key]?.ccbStatus ?? 'idle';
  },

  updateCCBStatus: (cwd, status, error) => {
    const key = normalizePath(cwd);
    set((state) => {
      const prev = state.worktrees[key];
      if (!prev) return state;
      return {
        ...state,
        worktrees: {
          ...state.worktrees,
          [key]: { ...prev, ccbStatus: status, ccbError: error ?? null },
        },
      };
    });
  },

  removePane: (paneId) => {
    const pathsToDeactivate: string[] = [];

    set((state) => {
      let changed = false;
      const nextWorktrees: WorktreeStates = { ...state.worktrees };

      for (const [key, wt] of Object.entries(state.worktrees)) {
        const index = wt.panes.findIndex((p) => p.pane_id === paneId);
        if (index === -1) continue;

        changed = true;
        const nextPanes = wt.panes.filter((p) => p.pane_id !== paneId);
        const activePaneIndex = clampSlotIndex(wt.layout.activePaneIndex);
        nextWorktrees[key] = { ...wt, panes: nextPanes, layout: { activePaneIndex } };

        // If this was the last pane, mark worktree for deactivation
        if (nextPanes.length === 0 && wt.cwd) {
          pathsToDeactivate.push(wt.cwd);
        }
      }

      return changed ? { ...state, worktrees: nextWorktrees } : state;
    });

    // Deactivate CCB for worktrees that no longer have panes
    for (const worktreePath of pathsToDeactivate) {
      useWorktreeActivityStore.getState().setCCBActive(worktreePath, false);
    }
  },

  setActivePaneIndex: (worktreePath, index) =>
    set((state) => {
      const key = normalizePath(worktreePath);
      const wt = state.worktrees[key];
      if (!wt) return state;

      return {
        ...state,
        worktrees: {
          ...state.worktrees,
          [key]: {
            ...wt,
            layout: {
              ...wt.layout,
              activePaneIndex: clampSlotIndex(index),
            },
          },
        },
      };
    }),

  clearPanes: () =>
    set({
      worktrees: {},
      panes: [],
      layout: { activePaneIndex: 0 },
    }),
}));

/**
 * Initialize CCB pane listener.
 * Should be called once in the app initialization.
 * Returns cleanup function.
 */
export function initCCBPaneListener(): () => void {
  // Make init idempotent to avoid accidental double subscriptions.
  if (ccbPaneListenerCleanup) return ccbPaneListenerCleanup;

  const { addExternalPane, removePane, updateCCBStatus } = useCCBPanesStore.getState();
  const { registerAgentCloseHandler, registerTerminalCloseHandler } =
    useWorktreeActivityStore.getState();

  // Register CCB close handler for both agent and terminal close events
  const handleCloseCCB = (worktreePath: string) => {
    void useCCBPanesStore.getState().closeWorktreeCCB(worktreePath);
  };
  const cleanupAgentClose = registerAgentCloseHandler(handleCloseCCB);
  const cleanupTerminalClose = registerTerminalCloseHandler(handleCloseCCB);

  // Listen for new pane creation
  const unsubscribeOpen = window.electronAPI.ccb.onTerminalOpen((event) => {
    console.log('[CCB] Received CCB_TERMINAL_OPEN event:', event);
    const result = addExternalPane(event);
    console.log('[CCB] addExternalPane result:', result);
    if (result === 'overflow') {
      // Slots are full for this worktree: destroy the extra PTY to avoid leaks.
      void window.electronAPI.terminal.destroy(event.ptyId);
    }
  });

  // Listen for terminal exit to remove panes
  const unsubscribeExit = window.electronAPI.terminal.onExit((event) => {
    removePane(event.id);
  });

  // Listen for CCB status changes from main process
  const unsubscribeStatus = window.electronAPI.ccb.onStatusChanged((event) => {
    updateCCBStatus(event.cwd, event.status as CCBStatus, event.error);
  });

  ccbPaneListenerCleanup = () => {
    unsubscribeOpen();
    unsubscribeExit();
    unsubscribeStatus();
    cleanupAgentClose();
    cleanupTerminalClose();
    ccbPaneListenerCleanup = null;
  };

  return ccbPaneListenerCleanup;
}

let ccbPaneListenerCleanup: (() => void) | null = null;
