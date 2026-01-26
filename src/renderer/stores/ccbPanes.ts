import { create } from 'zustand';

/**
 * CCB Pane information received from Main process via IPC.
 */
export interface CCBPane {
  pane_id: string; // Also used as ptyId for terminal data routing
  ptyId: string;
  cwd: string;
  title: string;
  createdAt: number;
}

/**
 * Layout configuration for CCB panes.
 */
export interface CCBPaneLayout {
  // Flex percentages for each pane (horizontal split)
  flexPercents: number[];
  // Active pane index
  activePaneIndex: number;
}

interface CCBPanesState {
  panes: CCBPane[];
  layout: CCBPaneLayout;

  // Actions
  addPane: (pane: Omit<CCBPane, 'createdAt'>) => void;
  removePane: (paneId: string) => void;
  setActivePaneIndex: (index: number) => void;
  clearPanes: () => void;
}

/**
 * Calculate layout percentages based on pane count.
 * - 1 pane: 100%
 * - 2 panes: 50% each
 * - 3 panes: 33.33% each
 * - 4 panes: 25% each
 */
function calculateFlexPercents(paneCount: number): number[] {
  if (paneCount <= 0) return [];
  const percent = 100 / paneCount;
  return Array(paneCount).fill(percent);
}

export const useCCBPanesStore = create<CCBPanesState>((set) => ({
  panes: [],
  layout: {
    flexPercents: [],
    activePaneIndex: 0,
  },

  addPane: (pane) =>
    set((state) => {
      // Check if pane already exists (prevent duplicates)
      if (state.panes.some((p) => p.pane_id === pane.pane_id)) {
        return state;
      }

      const newPanes = [
        ...state.panes,
        {
          ...pane,
          createdAt: Date.now(),
        },
      ];

      return {
        panes: newPanes,
        layout: {
          flexPercents: calculateFlexPercents(newPanes.length),
          activePaneIndex: newPanes.length - 1, // Activate new pane
        },
      };
    }),

  removePane: (paneId) =>
    set((state) => {
      const paneIndex = state.panes.findIndex((p) => p.pane_id === paneId);
      if (paneIndex === -1) return state;

      const newPanes = state.panes.filter((p) => p.pane_id !== paneId);
      const newActivePaneIndex = Math.min(
        state.layout.activePaneIndex,
        Math.max(0, newPanes.length - 1)
      );

      return {
        panes: newPanes,
        layout: {
          flexPercents: calculateFlexPercents(newPanes.length),
          activePaneIndex: newActivePaneIndex,
        },
      };
    }),

  setActivePaneIndex: (index) =>
    set((state) => ({
      layout: {
        ...state.layout,
        activePaneIndex: Math.max(0, Math.min(index, state.panes.length - 1)),
      },
    })),

  clearPanes: () =>
    set({
      panes: [],
      layout: {
        flexPercents: [],
        activePaneIndex: 0,
      },
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

  const { addPane, removePane } = useCCBPanesStore.getState();

  // Listen for new pane creation
  const unsubscribeOpen = window.electronAPI.ccb.onTerminalOpen((event) => {
    addPane({
      pane_id: event.ptyId,
      ptyId: event.ptyId,
      cwd: event.cwd,
      title: event.title ?? 'CCB Terminal',
    });
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
