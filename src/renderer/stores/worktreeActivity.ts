import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface WorktreeActivity {
  /** Derived total used by UI (agent sessions + CCB). */
  agentCount: number;
  terminalCount: number;
  /** Raw agent sessions count set by AgentPanel. */
  agentSessionsCount: number;
  /** True when CCB panes/CCB session is active for this worktree. */
  ccbActive: boolean;
}

interface DiffStats {
  insertions: number;
  deletions: number;
}

type CloseHandler = (worktreePath: string) => void;

interface WorktreeActivityState {
  activities: Record<string, WorktreeActivity>;
  diffStats: Record<string, DiffStats>;

  // Agent session tracking
  incrementAgent: (worktreePath: string) => void;
  decrementAgent: (worktreePath: string) => void;
  setAgentCount: (worktreePath: string, count: number) => void;
  setCCBActive: (worktreePath: string, active: boolean) => void;

  // Terminal session tracking
  incrementTerminal: (worktreePath: string) => void;
  decrementTerminal: (worktreePath: string) => void;
  setTerminalCount: (worktreePath: string, count: number) => void;

  // Diff stats tracking
  setDiffStats: (worktreePath: string, stats: DiffStats) => void;
  fetchDiffStats: (worktreePaths: string[]) => Promise<void>;

  // Query helpers
  hasActivity: (worktreePath: string) => boolean;
  getActivity: (worktreePath: string) => WorktreeActivity;
  getDiffStats: (worktreePath: string) => DiffStats;

  // Clean up
  clearWorktree: (worktreePath: string) => void;

  // Close handlers - panels register to receive close events
  agentCloseHandlers: Set<CloseHandler>;
  terminalCloseHandlers: Set<CloseHandler>;
  registerAgentCloseHandler: (handler: CloseHandler) => () => void;
  registerTerminalCloseHandler: (handler: CloseHandler) => () => void;
  closeAgentSessions: (worktreePath: string) => void;
  closeTerminalSessions: (worktreePath: string) => void;
}

const defaultActivity: WorktreeActivity = {
  agentCount: 0,
  terminalCount: 0,
  agentSessionsCount: 0,
  ccbActive: false,
};
const defaultDiffStats: DiffStats = { insertions: 0, deletions: 0 };

/**
 * Coerce stored activity to the new shape with derived agentCount.
 * Handles backward compatibility with old shape (missing agentSessionsCount/ccbActive).
 */
function coerceActivity(input: WorktreeActivity | undefined): WorktreeActivity {
  if (!input) return defaultActivity;
  const agentSessionsCount =
    typeof input.agentSessionsCount === 'number'
      ? input.agentSessionsCount
      : typeof input.agentCount === 'number'
        ? input.agentCount
        : 0;
  const terminalCount = typeof input.terminalCount === 'number' ? input.terminalCount : 0;
  const ccbActive = typeof input.ccbActive === 'boolean' ? input.ccbActive : false;
  const agentCount = agentSessionsCount + (ccbActive ? 1 : 0);
  return { agentCount, terminalCount, agentSessionsCount, ccbActive };
}

export const useWorktreeActivityStore = create<WorktreeActivityState>()(
  subscribeWithSelector((set, get) => ({
    activities: {},
    diffStats: {},

    incrementAgent: (worktreePath) =>
      set((state) => {
        const current = coerceActivity(state.activities[worktreePath]);
        const agentSessionsCount = current.agentSessionsCount + 1;
        return {
          activities: {
            ...state.activities,
            [worktreePath]: {
              ...current,
              agentSessionsCount,
              agentCount: agentSessionsCount + (current.ccbActive ? 1 : 0),
            },
          },
        };
      }),

    decrementAgent: (worktreePath) =>
      set((state) => {
        const current = coerceActivity(state.activities[worktreePath]);
        const agentSessionsCount = Math.max(0, current.agentSessionsCount - 1);
        return {
          activities: {
            ...state.activities,
            [worktreePath]: {
              ...current,
              agentSessionsCount,
              agentCount: agentSessionsCount + (current.ccbActive ? 1 : 0),
            },
          },
        };
      }),

    setAgentCount: (worktreePath, count) =>
      set((state) => {
        const current = coerceActivity(state.activities[worktreePath]);
        const agentSessionsCount = Math.max(0, count);
        return {
          activities: {
            ...state.activities,
            [worktreePath]: {
              ...current,
              agentSessionsCount,
              agentCount: agentSessionsCount + (current.ccbActive ? 1 : 0),
            },
          },
        };
      }),

    setCCBActive: (worktreePath, active) =>
      set((state) => {
        const current = coerceActivity(state.activities[worktreePath]);
        const ccbActive = Boolean(active);
        return {
          activities: {
            ...state.activities,
            [worktreePath]: {
              ...current,
              ccbActive,
              agentCount: current.agentSessionsCount + (ccbActive ? 1 : 0),
            },
          },
        };
      }),

    incrementTerminal: (worktreePath) =>
      set((state) => {
        const current = coerceActivity(state.activities[worktreePath]);
        return {
          activities: {
            ...state.activities,
            [worktreePath]: { ...current, terminalCount: current.terminalCount + 1 },
          },
        };
      }),

    decrementTerminal: (worktreePath) =>
      set((state) => {
        const current = coerceActivity(state.activities[worktreePath]);
        return {
          activities: {
            ...state.activities,
            [worktreePath]: { ...current, terminalCount: Math.max(0, current.terminalCount - 1) },
          },
        };
      }),

    setTerminalCount: (worktreePath, count) =>
      set((state) => {
        const current = coerceActivity(state.activities[worktreePath]);
        return {
          activities: {
            ...state.activities,
            [worktreePath]: { ...current, terminalCount: count },
          },
        };
      }),

    setDiffStats: (worktreePath, stats) =>
      set((state) => ({
        diffStats: {
          ...state.diffStats,
          [worktreePath]: stats,
        },
      })),

    fetchDiffStats: async (worktreePaths) => {
      // Fetch diff stats for all worktrees in parallel
      const results = await Promise.all(
        worktreePaths.map(async (path) => {
          try {
            const stats = await window.electronAPI.git.getDiffStats(path);
            return { path, stats };
          } catch {
            return { path, stats: defaultDiffStats };
          }
        })
      );
      // Batch update all stats at once
      set((state) => {
        const newDiffStats = { ...state.diffStats };
        for (const { path, stats } of results) {
          newDiffStats[path] = stats;
        }
        return { diffStats: newDiffStats };
      });
    },

    hasActivity: (worktreePath) => {
      const activity = coerceActivity(get().activities[worktreePath]);
      return activity.agentCount > 0 || activity.terminalCount > 0;
    },

    getActivity: (worktreePath) => {
      return coerceActivity(get().activities[worktreePath]);
    },

    getDiffStats: (worktreePath) => {
      return get().diffStats[worktreePath] || defaultDiffStats;
    },

    clearWorktree: (worktreePath) =>
      set((state) => {
        const { [worktreePath]: _, ...rest } = state.activities;
        return { activities: rest };
      }),

    // Close handler registry
    agentCloseHandlers: new Set(),
    terminalCloseHandlers: new Set(),

    registerAgentCloseHandler: (handler) => {
      get().agentCloseHandlers.add(handler);
      return () => {
        get().agentCloseHandlers.delete(handler);
      };
    },

    registerTerminalCloseHandler: (handler) => {
      get().terminalCloseHandlers.add(handler);
      return () => {
        get().terminalCloseHandlers.delete(handler);
      };
    },

    closeAgentSessions: (worktreePath) => {
      for (const handler of get().agentCloseHandlers) {
        handler(worktreePath);
      }
    },

    closeTerminalSessions: (worktreePath) => {
      for (const handler of get().terminalCloseHandlers) {
        handler(worktreePath);
      }
    },
  }))
);

// Subscribe to activities changes and notify main process
useWorktreeActivityStore.subscribe(
  (state) => state.activities,
  (activities) => {
    // Get all worktree paths that have activity (green light)
    const activeWorktrees = Object.entries(activities)
      .filter(([, activity]) => activity.agentCount > 0 || activity.terminalCount > 0)
      .map(([path]) => path);

    // Notify main process
    window.electronAPI?.worktree.activate(activeWorktrees);
  },
  {
    equalityFn: (a, b) => {
      // Compare active worktree paths
      const getActivePaths = (activities: Record<string, WorktreeActivity>) =>
        Object.entries(activities)
          .filter(([, act]) => act.agentCount > 0 || act.terminalCount > 0)
          .map(([path]) => path)
          .sort()
          .join(',');
      return getActivePaths(a) === getActivePaths(b);
    },
  }
);
