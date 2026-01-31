import { normalizePath } from '@/App/storage';
import { create } from 'zustand';

// Maximum pane slots for 2x2 layout
const MAX_PANE_SLOTS = 4;

type WorktreeKey = string;

/**
 * CCB Pane information received from Main process via IPC.
 */
export interface CCBPane {
  pane_id: string; // Also used as ptyId for terminal data routing
  ptyId: string;
  cwd: string;
  title: string;
  slotIndex: number; // 0..3 fixed slots for 2x2 layout
  createdAt: number;
}

/**
 * Layout configuration for CCB panes.
 */
export interface CCBPaneLayout {
  // Active slot index (0..3)
  activePaneIndex: number;
}

interface WorktreeCCBState {
  panes: CCBPane[];
  layout: CCBPaneLayout;
  cwd: string | null; // original casing cwd used for PTY creation
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
  addExternalPane: (event: { ptyId: string; cwd: string; title?: string }) => ExternalAddResult;
  ensureWorktreePanes: (worktreePath: string, options?: EnsureWorktreePanesOptions) => Promise<void>;
  removePane: (paneId: string) => void;
  setActivePaneIndex: (worktreePath: string, index: number) => void;
  clearPanes: () => void;
}

function clampSlotIndex(index: number): number {
  return Math.max(0, Math.min(index, MAX_PANE_SLOTS - 1));
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

const ensureInFlightByWorktree = new Map<WorktreeKey, Promise<void>>();

export const useCCBPanesStore = create<CCBPanesState>((set, get) => ({
  worktrees: {},

  // Back-compat selectors for existing callers (should be avoided for new code)
  panes: [],
  layout: { activePaneIndex: 0 },

  addExternalPane: (event) => {
    const key = normalizePath(event.cwd);

    const current = get().worktrees[key] ?? { panes: [], layout: { activePaneIndex: 0 }, cwd: null };

    // Ignore duplicates (never destroy a PTY we already track)
    if (hasPaneId(get().worktrees, event.ptyId)) return 'ignored';

    const slotIndex = findFreeSlot(current.panes);
    if (slotIndex === null) {
      return 'overflow';
    }

    set((state) => {
      const prev = state.worktrees[key] ?? { panes: [], layout: { activePaneIndex: 0 }, cwd: null };
      // Re-check inside set (race-safe)
      if (hasPaneId(state.worktrees, event.ptyId)) {
        return state;
      }
      if (prev.panes.some((p) => p.slotIndex === slotIndex)) {
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

      return {
        ...state,
        worktrees: {
          ...state.worktrees,
          [key]: {
            panes: nextPanes,
            layout: { activePaneIndex: slotIndex },
            cwd: prev.cwd ?? event.cwd,
          },
        },
      };
    });

    return 'added';
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
          return prev.cwd ? state : { ...state, worktrees: { ...state.worktrees, [key]: { ...prev, cwd: worktreePath } } };
        }
        return {
          ...state,
          worktrees: {
            ...state.worktrees,
            [key]: { panes: [], layout: { activePaneIndex: 0 }, cwd: worktreePath },
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

  removePane: (paneId) =>
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
      }

      return changed ? { ...state, worktrees: nextWorktrees } : state;
    }),

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

  const { addExternalPane, removePane } = useCCBPanesStore.getState();

  // Listen for new pane creation
  const unsubscribeOpen = window.electronAPI.ccb.onTerminalOpen((event) => {
    const result = addExternalPane(event);
    if (result === 'overflow') {
      // Slots are full for this worktree: destroy the extra PTY to avoid leaks.
      void window.electronAPI.terminal.destroy(event.ptyId);
    }
  });

  // Listen for terminal exit to remove panes
  const unsubscribeExit = window.electronAPI.terminal.onExit((event) => {
    removePane(event.id);
  });

  ccbPaneListenerCleanup = () => {
    unsubscribeOpen();
    unsubscribeExit();
    ccbPaneListenerCleanup = null;
  };

  return ccbPaneListenerCleanup;
}

let ccbPaneListenerCleanup: (() => void) | null = null;
