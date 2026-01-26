import { useCallback } from 'react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useCCBPanesStore } from '@/stores/ccbPanes';
import { CCBPaneTerminal } from './CCBPaneTerminal';

interface CCBPaneLayoutProps {
  isActive?: boolean;
}

/**
 * CCB Multi-Pane Layout component.
 * Listens for CCB_TERMINAL_OPEN events and dynamically renders
 * multiple AgentTerminal-like components in a grid layout.
 *
 * Layout strategy:
 * - 1 pane: full width
 * - 2 panes: horizontal split 50/50
 * - 3 panes: 33.33% each
 * - 4 panes: 2x2 grid (25% each in single row for simplicity)
 */
export function CCBPaneLayout({ isActive = false }: CCBPaneLayoutProps) {
  const { t } = useI18n();
  const panes = useCCBPanesStore((s) => s.panes);
  const layout = useCCBPanesStore((s) => s.layout);
  const setActivePaneIndex = useCCBPanesStore((s) => s.setActivePaneIndex);
  const removePane = useCCBPanesStore((s) => s.removePane);

  // Handle pane click to activate
  const handlePaneClick = useCallback(
    (index: number) => {
      setActivePaneIndex(index);
    },
    [setActivePaneIndex]
  );

  // Handle pane exit
  const handlePaneExit = useCallback(
    (paneId: string) => {
      removePane(paneId);
    },
    [removePane]
  );

  // No panes - show empty state
  if (panes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm">{t('No CCB panes')}</p>
          <p className="text-xs opacity-70">{t('Panes will appear when created via CCB RPC')}</p>
        </div>
      </div>
    );
  }

  // Calculate grid layout based on pane count
  const getGridClass = () => {
    switch (panes.length) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-2';
      case 3:
        return 'grid-cols-3';
      case 4:
        return 'grid-cols-2 grid-rows-2';
      default:
        // For more than 4, use flexible grid
        return 'grid-cols-2';
    }
  };

  return (
    <div className={cn('relative h-full w-full grid gap-1', getGridClass())}>
      {panes.map((pane, index) => {
        const isPaneActive = index === layout.activePaneIndex;
        const shouldFocus = isActive && isPaneActive;

        return (
          // biome-ignore lint/a11y/useKeyWithClickEvents: click is for pane activation
          <div
            key={pane.pane_id}
            className={cn(
              'relative flex flex-col overflow-hidden border rounded-md',
              isPaneActive ? 'border-primary/50' : 'border-border/50'
            )}
            onClick={() => handlePaneClick(index)}
          >
            {/* Pane header with title */}
            <div
              className={cn(
                'flex h-8 shrink-0 items-center justify-between px-3 text-xs border-b',
                isPaneActive
                  ? 'bg-accent/50 text-accent-foreground'
                  : 'bg-muted/30 text-muted-foreground'
              )}
            >
              <span className="truncate font-medium">{pane.title}</span>
              <span className="ml-2 opacity-60 shrink-0">{pane.cwd.split(/[/\\]/).pop()}</span>
            </div>

            {/* Terminal content */}
            <div className="flex-1 min-h-0">
              <CCBPaneTerminal
                pane={pane}
                isActive={isActive}
                interactive={shouldFocus}
                onExit={() => handlePaneExit(pane.pane_id)}
              />
            </div>

            {/* Inactive overlay */}
            {!isPaneActive && (
              <div className="absolute inset-0 top-8 bg-background/10 pointer-events-none" />
            )}
          </div>
        );
      })}
    </div>
  );
}
