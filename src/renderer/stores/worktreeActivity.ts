import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useAgentSessionsStore } from './agentSessions';

// Agent activity state for tree sidebar display
export type AgentActivityState = 'idle' | 'running' | 'waiting_input' | 'completed';

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
  activityStates: Record<string, AgentActivityState>; // Agent activity states per worktree

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

  // Activity state tracking
  setActivityState: (worktreePath: string, state: AgentActivityState) => void;
  getActivityState: (worktreePath: string) => AgentActivityState;
  clearActivityState: (worktreePath: string) => void;

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
    activityStates: {},

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

    // Activity state methods
    setActivityState: (worktreePath, state) =>
      set((prev) => {
        const currentState = prev.activityStates[worktreePath] || 'idle';

        // Skip update if state hasn't changed to avoid unnecessary re-renders
        if (currentState === state) return prev;

        // Define state transition priority (higher number = higher priority)
        const STATE_PRIORITY: Record<AgentActivityState, number> = {
          idle: 0,
          running: 1,
          waiting_input: 2,
          completed: 3,
        };

        // Allow state transitions based on priority rules:
        // 1. Always allow transition to higher priority state
        // 2. Allow transition from completed back to running (new task starts)
        // 3. Block downgrade transitions (except completed → running)
        const canTransition =
          STATE_PRIORITY[state] > STATE_PRIORITY[currentState] ||
          (currentState === 'completed' && state === 'running');

        if (!canTransition) {
          const pathShort = worktreePath.split('/').slice(-2).join('/');
          console.log(
            `[WorktreeActivity] ${pathShort}: blocked ${currentState} → ${state} (priority)`
          );
          return prev;
        }

        const pathShort = worktreePath.split('/').slice(-2).join('/');
        console.log(`[WorktreeActivity] ${pathShort} → ${state}`);
        return { activityStates: { ...prev.activityStates, [worktreePath]: state } };
      }),

    getActivityState: (worktreePath) => {
      return get().activityStates[worktreePath] || 'idle';
    },

    clearActivityState: (worktreePath) =>
      set((prev) => {
        const { [worktreePath]: _, ...rest } = prev.activityStates;
        return { activityStates: rest };
      }),

    clearWorktree: (worktreePath) =>
      set((state) => {
        // Clean up session mappings - agentSessions handles session cleanup
        const { [worktreePath]: _, ...restActivities } = state.activities;
        const { [worktreePath]: __, ...restActivityStates } = state.activityStates;
        return { activities: restActivities, activityStates: restActivityStates };
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

/**
 * Initialize agent activity state listener
 * Listens for agent stop, ask user question, and user prompt submit notifications
 * Call this once on app startup
 */
export function initAgentActivityListener(): () => void {
  // Listen for user prompt submit notification -> set 'running'
  const unsubPreToolUse = window.electronAPI.notification.onPreToolUse(
    (data: { sessionId: string; toolName: string; cwd?: string }) => {
      // Try to get cwd from data, or fallback to finding it from session
      let cwd = data.cwd;
      if (!cwd) {
        // Fallback: find session by sessionId to get cwd
        const session = useAgentSessionsStore
          .getState()
          .sessions.find((s) => s.sessionId === data.sessionId || s.id === data.sessionId);
        if (session?.cwd) {
          cwd = session.cwd;
          console.log(
            `[WorktreeActivity] PreToolUse hook found cwd from session: ${cwd.split('/').slice(-2).join('/')}`
          );
        } else {
          console.warn(
            `[WorktreeActivity] UserPromptSubmit hook missing cwd: session ${data.sessionId.slice(0, 8)}`
          );
          return;
        }
      }

      useWorktreeActivityStore.getState().setActivityState(cwd, 'running');
    }
  );

  // Listen for agent stop notification -> set 'completed'
  const unsubStop = window.electronAPI.notification.onAgentStop(
    (data: { sessionId: string; cwd?: string }) => {
      // Try to get cwd from data, or fallback to finding it from session
      let cwd = data.cwd;
      if (!cwd) {
        // Fallback: find session by sessionId to get cwd
        const session = useAgentSessionsStore
          .getState()
          .sessions.find((s) => s.sessionId === data.sessionId || s.id === data.sessionId);
        if (session?.cwd) {
          cwd = session.cwd;
          console.log(
            `[WorktreeActivity] Stop hook found cwd from session: ${cwd.split('/').slice(-2).join('/')}`
          );
        } else {
          console.warn(
            `[WorktreeActivity] Stop hook missing cwd: session ${data.sessionId.slice(0, 8)}`
          );
          return;
        }
      }

      useWorktreeActivityStore.getState().setActivityState(cwd, 'completed');
    }
  );

  // Listen for ask user question notification -> set 'waiting_input'
  const unsubAsk = window.electronAPI.notification.onAskUserQuestion(
    (data: { sessionId: string; cwd?: string }) => {
      // Try to get cwd from data, or fallback to finding it from session
      let cwd = data.cwd;
      if (!cwd) {
        // Fallback: find session by sessionId to get cwd
        const session = useAgentSessionsStore
          .getState()
          .sessions.find((s) => s.sessionId === data.sessionId || s.id === data.sessionId);
        if (session?.cwd) {
          cwd = session.cwd;
          console.log(
            `[WorktreeActivity] AskUserQuestion hook found cwd from session: ${cwd.split('/').slice(-2).join('/')}`
          );
        } else {
          console.warn(
            `[WorktreeActivity] AskUserQuestion hook missing cwd: session ${data.sessionId.slice(0, 8)}`
          );
          return;
        }
      }

      useWorktreeActivityStore.getState().setActivityState(cwd, 'waiting_input');
    }
  );

  return () => {
    unsubPreToolUse();
    unsubStop();
    unsubAsk();
  };
}
