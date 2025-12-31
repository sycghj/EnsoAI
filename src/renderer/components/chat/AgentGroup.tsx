import { Plus, Sparkles } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { AgentTerminal } from './AgentTerminal';
import { type Session, SessionBar } from './SessionBar';
import type { AgentGroup as AgentGroupType } from './types';

interface AgentGroupProps {
  group: AgentGroupType;
  sessions: Session[]; // All sessions for current worktree (filtered by groupSessionIds)
  isActive: boolean;
  isGroupActive: boolean;
  enabledAgents: string[];
  customAgents: Array<{ id: string; name: string; command: string }>;
  agentSettings: Record<
    string,
    { enabled: boolean; isDefault: boolean; customPath?: string; customArgs?: string }
  >;
  agentInfo: Record<string, { name: string; command: string }>;
  onSessionSelect: (sessionId: string) => void;
  onSessionClose: (sessionId: string) => void;
  onSessionNew: () => void;
  onSessionNewWithAgent: (agentId: string, agentCommand: string) => void;
  onSessionRename: (sessionId: string, name: string) => void;
  onSessionReorder: (fromIndex: number, toIndex: number) => void;
  onSessionInitialized: (sessionId: string) => void;
  onSessionActivated: (sessionId: string) => void;
  onSessionTerminalTitleChange: (sessionId: string, title: string) => void;
  onGroupClick: () => void;
  onSplit: () => void;
  canMerge: boolean;
  onMerge: () => void;
}

export function AgentGroup({
  group,
  sessions,
  isActive,
  isGroupActive,
  enabledAgents,
  customAgents,
  agentSettings,
  agentInfo,
  onSessionSelect,
  onSessionClose,
  onSessionNew,
  onSessionNewWithAgent,
  onSessionRename,
  onSessionReorder,
  onSessionInitialized,
  onSessionActivated,
  onSessionTerminalTitleChange,
  onGroupClick,
  onSplit,
  canMerge,
  onMerge,
}: AgentGroupProps) {
  const { t } = useI18n();
  const [showAgentMenu, setShowAgentMenu] = useState(false);

  // Filter sessions belonging to this group
  const groupSessions = useMemo(() => {
    const sessionIdSet = new Set(group.sessionIds);
    return sessions.filter((s) => sessionIdSet.has(s.id));
  }, [sessions, group.sessionIds]);

  const activeSessionId = group.activeSessionId;
  const hasNoSessions = groupSessions.length === 0;

  const handleSelectSession = useCallback(
    (id: string) => {
      onSessionSelect(id);
      onGroupClick();
    },
    [onSessionSelect, onGroupClick]
  );

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: click is supplementary, terminals inside handle focus
    <div className="relative flex h-full w-full flex-col" onClick={onGroupClick}>
      {/* Inactive overlay */}
      {!isGroupActive && (
        <div className="absolute inset-0 z-10 bg-background/10 pointer-events-none" />
      )}

      {/* Terminal Content */}
      <div className="relative flex-1">
        {groupSessions.map((session) => {
          const isSessionVisible = activeSessionId === session.id;
          const isTerminalActive = isActive && isGroupActive && isSessionVisible;

          return (
            <div
              key={session.id}
              className={
                isSessionVisible
                  ? 'h-full w-full'
                  : 'absolute inset-0 opacity-0 pointer-events-none'
              }
            >
              <AgentTerminal
                cwd={session.cwd}
                sessionId={session.id}
                agentCommand={session.agentCommand || 'claude'}
                customPath={session.customPath}
                customArgs={session.customArgs}
                environment={session.environment || 'native'}
                initialized={session.initialized}
                activated={session.activated}
                isActive={isTerminalActive}
                onInitialized={() => onSessionInitialized(session.id)}
                onActivated={() => onSessionActivated(session.id)}
                onExit={() => onSessionClose(session.id)}
                onTerminalTitleChange={(title) => onSessionTerminalTitleChange(session.id, title)}
                onSplit={onSplit}
                canMerge={canMerge}
                onMerge={onMerge}
                onFocus={onGroupClick}
              />
            </div>
          );
        })}

        {/* Empty state */}
        {hasNoSessions && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted-foreground bg-background">
            <Sparkles className="h-12 w-12 opacity-50" />
            <p className="text-sm">{t('No agent sessions')}</p>
            <div
              className="relative"
              onMouseEnter={() => setShowAgentMenu(true)}
              onMouseLeave={() => setShowAgentMenu(false)}
            >
              <Button variant="outline" size="sm" onClick={onSessionNew}>
                <Plus className="mr-2 h-4 w-4" />
                {t('New Session')}
              </Button>
              {showAgentMenu && enabledAgents.length > 0 && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full pt-1 z-50 min-w-40">
                  <div className="rounded-lg border bg-popover p-1 shadow-lg">
                    <div className="px-2 py-1 text-xs text-muted-foreground">
                      {t('Select Agent')}
                    </div>
                    {enabledAgents.map((agentId) => {
                      const isHapi = agentId.endsWith('-hapi');
                      const isHappy = agentId.endsWith('-happy');
                      const baseId = isHapi
                        ? agentId.slice(0, -5)
                        : isHappy
                          ? agentId.slice(0, -6)
                          : agentId;
                      const customAgent = customAgents.find((a) => a.id === baseId);
                      const baseName = customAgent?.name ?? agentInfo[baseId]?.name ?? baseId;
                      const name = isHapi
                        ? `${baseName} (Hapi)`
                        : isHappy
                          ? `${baseName} (Happy)`
                          : baseName;
                      const isDefault = agentSettings[agentId]?.isDefault;
                      return (
                        <button
                          type="button"
                          key={agentId}
                          onClick={() => {
                            onSessionNewWithAgent(
                              agentId,
                              customAgent?.command ?? agentInfo[baseId]?.command ?? 'claude'
                            );
                            setShowAgentMenu(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          <span>{name}</span>
                          {isDefault && (
                            <span className="text-xs text-muted-foreground">{t('(default)')}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating session bar for this group */}
      {!hasNoSessions && (
        <SessionBar
          sessions={groupSessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onCloseSession={onSessionClose}
          onNewSession={onSessionNew}
          onNewSessionWithAgent={onSessionNewWithAgent}
          onRenameSession={onSessionRename}
          onReorderSessions={onSessionReorder}
        />
      )}
    </div>
  );
}
