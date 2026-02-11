import { useCallback, useMemo } from 'react';
import { normalizePath } from '@/App/storage';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useCCBPanesStore } from '@/stores/ccbPanes';
import { CCBPaneTerminal } from './CCBPaneTerminal';

interface CCBPaneLayoutProps {
  isActive?: boolean;
  worktreePath?: string;
}

/**
 * CCB pane layout component (1+2 three-pane).
 * - Claude (slot 0) occupies the top ~66% height.
 * - Codex (slot 1) and Gemini (slot 2) split the bottom ~33%.
 * - Non-active slots are still initialized (attach), but not interactive.
 * - Uses per-worktree state isolation via `worktreePath`.
 */
export function CCBPaneLayout({ isActive = false, worktreePath }: CCBPaneLayoutProps) {
  const { t } = useI18n();
  const worktreeKey = useMemo(() => {
    return worktreePath ? normalizePath(worktreePath) : null;
  }, [worktreePath]);

  const panes = useCCBPanesStore((s) =>
    worktreeKey ? (s.worktrees[worktreeKey]?.panes ?? []) : []
  );
  const layout = useCCBPanesStore((s) => (worktreeKey ? s.worktrees[worktreeKey]?.layout : null));
  const setActivePaneIndex = useCCBPanesStore((s) => s.setActivePaneIndex);
  const removePane = useCCBPanesStore((s) => s.removePane);

  // Handle pane click to activate
  const handlePaneClick = useCallback(
    (index: number) => {
      if (!worktreePath) return;
      setActivePaneIndex(worktreePath, index);
    },
    [setActivePaneIndex, worktreePath]
  );

  // Handle pane exit
  const handlePaneExit = useCallback(
    (paneId: string) => {
      removePane(paneId);
    },
    [removePane]
  );

  // Memoize panes by slot (must be before any early return)
  const activeIndex = layout?.activePaneIndex ?? 0;
  const panesBySlot = useMemo(() => {
    const map = new Map<number, (typeof panes)[number]>();
    for (const pane of panes) {
      map.set(pane.slotIndex, pane);
    }
    return map;
  }, [panes]);

  if (!worktreePath) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm">{t('Select a Worktree')}</p>
          <p className="text-xs opacity-70">{t('Choose a worktree to continue using AI Agent')}</p>
        </div>
      </div>
    );
  }

  const slots = [0, 1, 2] as const;

  const renderSlot = (slotIndex: number) => {
    const pane = panesBySlot.get(slotIndex);
    const isPaneActive = slotIndex === activeIndex;
    const shouldFocus = isActive && isPaneActive;

    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: click is for pane activation
      <div
        key={pane?.pane_id ?? `ccb-slot-${slotIndex}`}
        data-enso-xterm-focus-target={shouldFocus ? 'true' : undefined}
        className={cn(
          'relative flex min-h-0 flex-col overflow-hidden border rounded-md',
          isPaneActive ? 'border-primary/50' : 'border-border/50'
        )}
        onClick={() => handlePaneClick(slotIndex)}
      >
        {/* Pane header with title */}
        <div
          className={cn(
            'flex h-6 shrink-0 items-center justify-between px-2 text-xs border-b',
            isPaneActive
              ? 'bg-accent/50 text-accent-foreground'
              : 'bg-muted/30 text-muted-foreground'
          )}
        >
          <span className="truncate font-medium">{pane?.title ?? 'CCB'}</span>
          <span className="ml-2 opacity-60 shrink-0">
            {pane ? pane.cwd.split(/[/\\]/).pop() : '—'}
          </span>
        </div>

        {/* Terminal content */}
        <div className="flex-1 min-h-0">
          {pane ? (
            <CCBPaneTerminal
              pane={pane}
              isActive={isActive}
              interactive={shouldFocus}
              onExit={() => handlePaneExit(pane.pane_id)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <div className="text-xs opacity-70">{t('Waiting...')}</div>
            </div>
          )}
        </div>

        {/* Inactive overlay */}
        {!isPaneActive && (
          <div className="absolute inset-0 top-6 bg-background/10 pointer-events-none" />
        )}
      </div>
    );
  };

  return (
    <div className="relative h-full w-full" data-enso-xterm-focus-scope="ccb">
      {/* 1+2 layout: Claude top (3fr), Codex+Gemini bottom (2fr) */}
      <div className="grid h-full w-full grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-1">
        {renderSlot(slots[0])}
        <div className="grid min-h-0 grid-cols-2 gap-1">
          {renderSlot(slots[1])}
          {renderSlot(slots[2])}
        </div>
      </div>

      {/* Global empty overlay */}
      {panes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm">{t('Waiting for CCB connection')}</p>
            <p className="text-xs opacity-70">{t('Start CCB to create agent panes via RPC')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
