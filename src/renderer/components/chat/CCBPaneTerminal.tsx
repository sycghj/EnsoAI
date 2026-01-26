import { useCallback } from 'react';
import { useXterm } from '@/hooks/useXterm';
import { cn } from '@/lib/utils';
import type { CCBPane } from '@/stores/ccbPanes';

interface CCBPaneTerminalProps {
  pane: CCBPane;
  isActive?: boolean;
  interactive?: boolean;
  onExit?: () => void;
}

/**
 * CCB Pane Terminal component that attaches to an existing PTY session.
 * Unlike AgentTerminal, this component doesn't create a new PTY - it attaches
 * to one created by CCBCore in the main process.
 */
export function CCBPaneTerminal({
  pane,
  isActive = false,
  interactive = true,
  onExit,
}: CCBPaneTerminalProps) {
  const handleExit = useCallback(() => {
    onExit?.();
  }, [onExit]);

  const { containerRef, isLoading, settings } = useXterm({
    cwd: pane.cwd,
    existingPtyId: pane.ptyId, // Attach mode - use existing PTY from CCBCore
    isActive,
    onExit: handleExit,
  });

  return (
    <div
      className="relative h-full w-full"
      style={{ backgroundColor: settings.theme.background, contain: 'strict' }}
    >
      <div
        ref={containerRef}
        className={cn('h-full w-full', !interactive && 'pointer-events-none')}
      />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"
              style={{ color: settings.theme.foreground, opacity: 0.5 }}
            />
            <span style={{ color: settings.theme.foreground, opacity: 0.5 }} className="text-sm">
              Connecting...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
