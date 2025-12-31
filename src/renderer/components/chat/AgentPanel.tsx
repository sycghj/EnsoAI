import { Plus, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizePath, pathsEqual } from '@/App/storage';
import { ResizeHandle } from '@/components/terminal/ResizeHandle';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { matchesKeybinding } from '@/lib/keybinding';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useCodeReviewContinueStore } from '@/stores/codeReviewContinue';
import { BUILTIN_AGENT_IDS, useSettingsStore } from '@/stores/settings';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { AgentGroup } from './AgentGroup';
import type { Session } from './SessionBar';
import type { AgentGroupState, AgentGroup as AgentGroupType } from './types';
import { createInitialGroupState } from './types';

interface AgentPanelProps {
  repoPath: string; // repository path (workspace identifier)
  cwd: string; // current worktree path
  isActive?: boolean;
  onSwitchWorktree?: (worktreePath: string) => void;
}

// Agent display names and commands
const AGENT_INFO: Record<string, { name: string; command: string }> = {
  claude: { name: 'Claude', command: 'claude' },
  codex: { name: 'Codex', command: 'codex' },
  droid: { name: 'Droid', command: 'droid' },
  gemini: { name: 'Gemini', command: 'gemini' },
  auggie: { name: 'Auggie', command: 'auggie' },
  cursor: { name: 'Cursor', command: 'cursor-agent' },
  opencode: { name: 'OpenCode', command: 'opencode' },
};

function getDefaultAgentId(
  agentSettings: Record<string, { enabled: boolean; isDefault: boolean }>
): string {
  // Find the default agent
  for (const [id, config] of Object.entries(agentSettings)) {
    if (config.isDefault && config.enabled) {
      return id;
    }
  }
  // Fallback to first enabled builtin agent
  for (const id of BUILTIN_AGENT_IDS) {
    if (agentSettings[id]?.enabled) {
      return id;
    }
  }
  // Ultimate fallback
  return 'claude';
}

function createSession(
  repoPath: string,
  cwd: string,
  agentId: string,
  customAgents: Array<{ id: string; name: string; command: string }>,
  agentSettings: Record<
    string,
    { enabled: boolean; isDefault: boolean; customPath?: string; customArgs?: string }
  >
): Session {
  // Handle Hapi and Happy agent IDs
  // e.g., 'claude-hapi' -> base is 'claude', 'claude-happy' -> base is 'claude'
  const isHapi = agentId.endsWith('-hapi');
  const isHappy = agentId.endsWith('-happy');
  const baseId = isHapi ? agentId.slice(0, -5) : isHappy ? agentId.slice(0, -6) : agentId;

  // Check if it's a custom agent
  const customAgent = customAgents.find((a) => a.id === baseId);
  const info = customAgent
    ? { name: customAgent.name, command: customAgent.command }
    : AGENT_INFO[baseId] || { name: 'Claude', command: 'claude' };

  // Build display name with environment suffix
  const displayName = isHapi ? `${info.name} (Hapi)` : isHappy ? `${info.name} (Happy)` : info.name;

  // Determine environment
  const environment = isHapi ? 'hapi' : isHappy ? 'happy' : 'native';

  // Get custom path and args from settings (for builtin agents)
  const agentConfig = agentSettings[baseId];
  const customPath = agentConfig?.customPath;
  const customArgs = agentConfig?.customArgs;

  return {
    id: crypto.randomUUID(),
    name: displayName,
    agentId,
    agentCommand: info.command,
    customPath,
    customArgs,
    initialized: false,
    repoPath,
    cwd,
    environment,
  };
}

// Per-worktree group states
type WorktreeGroupStates = Record<string, AgentGroupState>;

export function AgentPanel({ repoPath, cwd, isActive = false, onSwitchWorktree }: AgentPanelProps) {
  const { t } = useI18n();
  const { agentSettings, agentDetectionStatus, customAgents, agentKeybindings, hapiSettings } =
    useSettingsStore();
  const defaultAgentId = useMemo(() => getDefaultAgentId(agentSettings), [agentSettings]);
  const { setAgentCount, registerAgentCloseHandler } = useWorktreeActivityStore();

  // Group state management per worktree
  const [worktreeGroupStates, setWorktreeGroupStates] = useState<WorktreeGroupStates>({});

  // Use zustand store for sessions - state persists even when component unmounts
  const allSessions = useAgentSessionsStore((state) => state.sessions);
  const addSession = useAgentSessionsStore((state) => state.addSession);
  const removeSession = useAgentSessionsStore((state) => state.removeSession);
  const updateSession = useAgentSessionsStore((state) => state.updateSession);
  const setActiveId = useAgentSessionsStore((state) => state.setActiveId);

  // Get current worktree's group state
  const currentGroupState = useMemo(() => {
    if (!cwd) return createInitialGroupState();
    const normalizedCwd = normalizePath(cwd);
    return worktreeGroupStates[normalizedCwd] || createInitialGroupState();
  }, [cwd, worktreeGroupStates]);

  const { groups, activeGroupId } = currentGroupState;

  // Update group state helper
  const updateCurrentGroupState = useCallback(
    (updater: (state: AgentGroupState) => AgentGroupState) => {
      if (!cwd) return;
      const normalizedCwd = normalizePath(cwd);
      setWorktreeGroupStates((prev) => ({
        ...prev,
        [normalizedCwd]: updater(prev[normalizedCwd] || createInitialGroupState()),
      }));
    },
    [cwd]
  );

  // Filter sessions for current repo+worktree (for SessionBar display, sorted by displayOrder)
  const currentWorktreeSessions = useMemo(() => {
    return allSessions
      .filter((s) => s.repoPath === repoPath && pathsEqual(s.cwd, cwd))
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [allSessions, repoPath, cwd]);

  // Empty state agent menu
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [installedAgents, setInstalledAgents] = useState<Set<string>>(new Set());

  // Build installed agents set from persisted detection status
  useEffect(() => {
    const enabledAgentIds = Object.keys(agentSettings).filter((id) => agentSettings[id]?.enabled);
    const newInstalled = new Set<string>();

    for (const agentId of enabledAgentIds) {
      // Handle Hapi agents: check if base CLI is detected as installed
      if (agentId.endsWith('-hapi')) {
        if (!hapiSettings.enabled) continue;
        const baseId = agentId.slice(0, -5);
        if (agentDetectionStatus[baseId]?.installed) {
          newInstalled.add(agentId);
        }
        continue;
      }

      // Handle Happy agents: check if base CLI is detected as installed
      if (agentId.endsWith('-happy')) {
        const baseId = agentId.slice(0, -6);
        if (agentDetectionStatus[baseId]?.installed) {
          newInstalled.add(agentId);
        }
        continue;
      }

      // Regular agents: use persisted detection status
      if (agentDetectionStatus[agentId]?.installed) {
        newInstalled.add(agentId);
      }
    }

    setInstalledAgents(newInstalled);
  }, [agentSettings, agentDetectionStatus, hapiSettings.enabled]);

  // Filter to only enabled AND installed agents
  const enabledAgents = useMemo(() => {
    return Object.keys(agentSettings).filter((id) => {
      if (!agentSettings[id]?.enabled || !installedAgents.has(id)) return false;
      if (id.endsWith('-hapi') && !hapiSettings.enabled) return false;
      return true;
    });
  }, [agentSettings, installedAgents, hapiSettings.enabled]);

  // Sync initialized agent session counts to worktree activity store
  useEffect(() => {
    // Always set current worktree count (even if 0)
    if (cwd) {
      const count = allSessions.filter((s) => s.cwd === cwd && s.initialized).length;
      setAgentCount(cwd, count);
    }
  }, [allSessions, cwd, setAgentCount]);

  // Register close handler for external close requests
  useEffect(() => {
    const handleCloseAll = (worktreePath: string) => {
      // Close all initialized sessions for this worktree
      const initializedSessions = allSessions.filter(
        (s) => s.cwd === worktreePath && s.initialized
      );
      if (initializedSessions.length === 0) return;

      // Remove initialized sessions
      for (const session of initializedSessions) {
        removeSession(session.id);
      }

      // Remove group state for this worktree
      const normalizedPath = normalizePath(worktreePath);
      setWorktreeGroupStates((prev) => {
        const newStates = { ...prev };
        delete newStates[normalizedPath];
        return newStates;
      });

      // Set count to 0
      setAgentCount(worktreePath, 0);
    };

    return registerAgentCloseHandler(handleCloseAll);
  }, [registerAgentCloseHandler, setAgentCount, allSessions, removeSession]);

  // Handle new session in active group
  const handleNewSession = useCallback(
    (targetGroupId?: string) => {
      const newSession = createSession(repoPath, cwd, defaultAgentId, customAgents, agentSettings);
      addSession(newSession);

      // Add session to group
      updateCurrentGroupState((state) => {
        const groupId = targetGroupId || state.activeGroupId || state.groups[0]?.id;
        if (!groupId) {
          // No groups exist - create first group with this session
          const newGroup: AgentGroupType = {
            id: crypto.randomUUID(),
            sessionIds: [newSession.id],
            activeSessionId: newSession.id,
          };
          return {
            groups: [newGroup],
            activeGroupId: newGroup.id,
            flexPercents: [100],
          };
        }

        return {
          ...state,
          groups: state.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  sessionIds: [...g.sessionIds, newSession.id],
                  activeSessionId: newSession.id,
                }
              : g
          ),
        };
      });
    },
    [
      repoPath,
      cwd,
      defaultAgentId,
      customAgents,
      agentSettings,
      addSession,
      updateCurrentGroupState,
    ]
  );

  // Handle close session
  const handleCloseSession = useCallback(
    (id: string, groupId?: string) => {
      const session = allSessions.find((s) => s.id === id);
      if (!session) return;

      // Remove the session from Zustand store
      removeSession(id);

      // Update group state
      updateCurrentGroupState((state) => {
        const targetGroupId = groupId || state.groups.find((g) => g.sessionIds.includes(id))?.id;
        if (!targetGroupId) return state;

        const group = state.groups.find((g) => g.id === targetGroupId);
        if (!group) return state;

        const newSessionIds = group.sessionIds.filter((sid) => sid !== id);

        // If group becomes empty, remove the group
        if (newSessionIds.length === 0) {
          const newGroups = state.groups.filter((g) => g.id !== targetGroupId);

          if (newGroups.length === 0) {
            // All groups empty - reset state
            return createInitialGroupState();
          }

          // Recalculate flex percentages
          const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

          // Update active group if needed
          let newActiveGroupId = state.activeGroupId;
          if (state.activeGroupId === targetGroupId) {
            const removedIndex = state.groups.findIndex((g) => g.id === targetGroupId);
            const newIndex = Math.min(removedIndex, newGroups.length - 1);
            newActiveGroupId = newGroups[newIndex]?.id || null;
          }

          return {
            groups: newGroups,
            activeGroupId: newActiveGroupId,
            flexPercents: newFlexPercents,
          };
        }

        // Update active session in group if needed
        let newActiveSessionId = group.activeSessionId;
        if (group.activeSessionId === id) {
          const closedIndex = group.sessionIds.indexOf(id);
          const newIndex = Math.min(closedIndex, newSessionIds.length - 1);
          newActiveSessionId = newSessionIds[newIndex];
        }

        return {
          ...state,
          groups: state.groups.map((g) =>
            g.id === targetGroupId
              ? { ...g, sessionIds: newSessionIds, activeSessionId: newActiveSessionId }
              : g
          ),
        };
      });
    },
    [allSessions, removeSession, updateCurrentGroupState]
  );

  // Handle session selection
  const handleSelectSession = useCallback(
    (id: string, groupId?: string) => {
      setActiveId(cwd, id);

      updateCurrentGroupState((state) => {
        const targetGroupId = groupId || state.groups.find((g) => g.sessionIds.includes(id))?.id;
        if (!targetGroupId) return state;

        return {
          ...state,
          groups: state.groups.map((g) =>
            g.id === targetGroupId ? { ...g, activeSessionId: id } : g
          ),
          activeGroupId: targetGroupId,
        };
      });
    },
    [cwd, setActiveId, updateCurrentGroupState]
  );

  // 监听通知点击，激活对应 session 并切换 worktree
  useEffect(() => {
    const unsubscribe = window.electronAPI.notification.onClick((sessionId) => {
      const session = allSessions.find((s) => s.id === sessionId);
      if (session && !pathsEqual(session.cwd, cwd) && onSwitchWorktree) {
        onSwitchWorktree(session.cwd);
      }
      handleSelectSession(sessionId);
    });
    return unsubscribe;
  }, [handleSelectSession, allSessions, cwd, onSwitchWorktree]);

  // 监听 Claude stop hook 通知，发送精确的完成通知
  useEffect(() => {
    const unsubscribe = window.electronAPI.notification.onAgentStop(({ sessionId }) => {
      const session = allSessions.find((s) => s.id === sessionId);
      if (session) {
        const projectName = session.cwd.split('/').pop() || 'Unknown';
        const agentName = AGENT_INFO[session.agentId]?.name || session.agentCommand;
        // Use terminal title as body, fall back to project name
        const notificationBody = session.terminalTitle || projectName;
        window.electronAPI.notification.show({
          title: t('{{command}} completed', { command: agentName }),
          body: notificationBody,
          sessionId,
        });
      }
    });
    return unsubscribe;
  }, [allSessions, t]);

  // 监听 code review 继续对话请求
  const pendingSessionId = useCodeReviewContinueStore((s) => s.pendingSessionId);
  const clearContinueRequest = useCodeReviewContinueStore((s) => s.clearRequest);

  useEffect(() => {
    if (pendingSessionId && cwd) {
      // 创建新 session 继续 code review 对话
      const newSession: Session = {
        id: pendingSessionId, // 使用 code review 的 sessionId
        name: 'Code Review',
        agentId: 'claude',
        agentCommand: 'claude',
        initialized: true, // 已初始化，使用 --resume
        repoPath,
        cwd,
        environment: 'native',
      };
      addSession(newSession);

      // Add to active group or create new group
      updateCurrentGroupState((state) => {
        const groupId = state.activeGroupId || state.groups[0]?.id;
        if (!groupId) {
          const newGroup: AgentGroupType = {
            id: crypto.randomUUID(),
            sessionIds: [pendingSessionId],
            activeSessionId: pendingSessionId,
          };
          return {
            groups: [newGroup],
            activeGroupId: newGroup.id,
            flexPercents: [100],
          };
        }

        return {
          ...state,
          groups: state.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  sessionIds: [...g.sessionIds, pendingSessionId],
                  activeSessionId: pendingSessionId,
                }
              : g
          ),
        };
      });

      clearContinueRequest();
    }
  }, [pendingSessionId, cwd, repoPath, addSession, updateCurrentGroupState, clearContinueRequest]);

  const handleNextSession = useCallback(() => {
    const activeGroup = groups.find((g) => g.id === activeGroupId);
    if (!activeGroup || activeGroup.sessionIds.length <= 1) return;

    const currentIndex = activeGroup.sessionIds.indexOf(activeGroup.activeSessionId || '');
    const nextIndex = (currentIndex + 1) % activeGroup.sessionIds.length;
    const nextSessionId = activeGroup.sessionIds[nextIndex];

    setActiveId(cwd, nextSessionId);
    updateCurrentGroupState((state) => ({
      ...state,
      groups: state.groups.map((g) =>
        g.id === activeGroupId ? { ...g, activeSessionId: nextSessionId } : g
      ),
    }));
  }, [groups, activeGroupId, cwd, setActiveId, updateCurrentGroupState]);

  const handlePrevSession = useCallback(() => {
    const activeGroup = groups.find((g) => g.id === activeGroupId);
    if (!activeGroup || activeGroup.sessionIds.length <= 1) return;

    const currentIndex = activeGroup.sessionIds.indexOf(activeGroup.activeSessionId || '');
    const prevIndex = currentIndex <= 0 ? activeGroup.sessionIds.length - 1 : currentIndex - 1;
    const prevSessionId = activeGroup.sessionIds[prevIndex];

    setActiveId(cwd, prevSessionId);
    updateCurrentGroupState((state) => ({
      ...state,
      groups: state.groups.map((g) =>
        g.id === activeGroupId ? { ...g, activeSessionId: prevSessionId } : g
      ),
    }));
  }, [groups, activeGroupId, cwd, setActiveId, updateCurrentGroupState]);

  const handleInitialized = useCallback(
    (id: string) => {
      updateSession(id, { initialized: true });
    },
    [updateSession]
  );

  const handleActivated = useCallback(
    (id: string) => {
      updateSession(id, { activated: true });
    },
    [updateSession]
  );

  const handleRenameSession = useCallback(
    (id: string, name: string) => {
      updateSession(id, { name });
    },
    [updateSession]
  );

  const handleReorderSessions = useCallback(
    (groupId: string, fromIndex: number, toIndex: number) => {
      updateCurrentGroupState((state) => ({
        ...state,
        groups: state.groups.map((g) => {
          if (g.id !== groupId) return g;
          const newSessionIds = [...g.sessionIds];
          const [removed] = newSessionIds.splice(fromIndex, 1);
          newSessionIds.splice(toIndex, 0, removed);
          return { ...g, sessionIds: newSessionIds };
        }),
      }));
    },
    [updateCurrentGroupState]
  );

  const handleNewSessionWithAgent = useCallback(
    (agentId: string, agentCommand: string, targetGroupId?: string) => {
      // Handle Hapi and Happy agent IDs
      const isHapi = agentId.endsWith('-hapi');
      const isHappy = agentId.endsWith('-happy');
      const baseId = isHapi ? agentId.slice(0, -5) : isHappy ? agentId.slice(0, -6) : agentId;

      // Get agent name for display
      const customAgent = customAgents.find((a) => a.id === baseId);
      const baseName = customAgent?.name ?? AGENT_INFO[baseId]?.name ?? 'Agent';
      const name = isHapi ? `${baseName} (Hapi)` : isHappy ? `${baseName} (Happy)` : baseName;

      // Determine environment
      const environment = isHapi ? 'hapi' : isHappy ? 'happy' : 'native';

      // Get custom path and args from settings (for builtin agents)
      const agentConfig = agentSettings[baseId];
      const customPath = agentConfig?.customPath;
      const customArgs = agentConfig?.customArgs;

      const newSession: Session = {
        id: crypto.randomUUID(),
        name,
        agentId,
        agentCommand,
        customPath,
        customArgs,
        initialized: false,
        repoPath,
        cwd,
        environment,
      };

      addSession(newSession);

      // Add to target group or active group
      updateCurrentGroupState((state) => {
        const groupId = targetGroupId || state.activeGroupId || state.groups[0]?.id;
        if (!groupId) {
          const newGroup: AgentGroupType = {
            id: crypto.randomUUID(),
            sessionIds: [newSession.id],
            activeSessionId: newSession.id,
          };
          return {
            groups: [newGroup],
            activeGroupId: newGroup.id,
            flexPercents: [100],
          };
        }

        return {
          ...state,
          groups: state.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  sessionIds: [...g.sessionIds, newSession.id],
                  activeSessionId: newSession.id,
                }
              : g
          ),
        };
      });
    },
    [repoPath, cwd, customAgents, agentSettings, addSession, updateCurrentGroupState]
  );

  // Handle session terminal title change
  const handleSessionTerminalTitleChange = useCallback(
    (sessionId: string, title: string) => {
      updateSession(sessionId, { terminalTitle: title });
    },
    [updateSession]
  );

  // Handle group click
  const handleGroupClick = useCallback(
    (groupId: string) => {
      updateCurrentGroupState((state) => ({
        ...state,
        activeGroupId: groupId,
      }));
    },
    [updateCurrentGroupState]
  );

  // Handle split - move current session to new group if multiple, else create new session
  const handleSplit = useCallback(
    (fromGroupId: string) => {
      if (!cwd) return;

      updateCurrentGroupState((state) => {
        const fromIndex = state.groups.findIndex((g) => g.id === fromGroupId);
        if (fromIndex === -1) return state;

        const fromGroup = state.groups[fromIndex];

        // If group has multiple sessions, move current session to new group
        if (fromGroup.sessionIds.length > 1 && fromGroup.activeSessionId) {
          const movingSessionId = fromGroup.activeSessionId;
          const remainingSessionIds = fromGroup.sessionIds.filter((id) => id !== movingSessionId);
          const newActiveInFromGroup = remainingSessionIds[0] || null;

          const newGroup: AgentGroupType = {
            id: crypto.randomUUID(),
            sessionIds: [movingSessionId],
            activeSessionId: movingSessionId,
          };

          const newGroups = state.groups.map((g) =>
            g.id === fromGroupId
              ? { ...g, sessionIds: remainingSessionIds, activeSessionId: newActiveInFromGroup }
              : g
          );
          newGroups.splice(fromIndex + 1, 0, newGroup);

          const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

          return {
            groups: newGroups,
            activeGroupId: newGroup.id,
            flexPercents: newFlexPercents,
          };
        }

        // Single session - create new session for split (done outside updateCurrentGroupState)
        return state;
      });

      // Check if we need to create a new session (single session case)
      const normalizedCwd = normalizePath(cwd);
      const currentState = worktreeGroupStates[normalizedCwd];
      if (currentState) {
        const fromGroup = currentState.groups.find((g) => g.id === fromGroupId);
        if (fromGroup && fromGroup.sessionIds.length === 1) {
          // Create new session for the split
          const newSession = createSession(repoPath, cwd, defaultAgentId, customAgents, agentSettings);
          addSession(newSession);

          updateCurrentGroupState((state) => {
            const fromIndex = state.groups.findIndex((g) => g.id === fromGroupId);
            if (fromIndex === -1) return state;

            const newGroup: AgentGroupType = {
              id: crypto.randomUUID(),
              sessionIds: [newSession.id],
              activeSessionId: newSession.id,
            };

            const newGroups = [...state.groups];
            newGroups.splice(fromIndex + 1, 0, newGroup);

            const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

            return {
              groups: newGroups,
              activeGroupId: newGroup.id,
              flexPercents: newFlexPercents,
            };
          });
        }
      }
    },
    [
      cwd,
      repoPath,
      defaultAgentId,
      customAgents,
      agentSettings,
      addSession,
      updateCurrentGroupState,
      worktreeGroupStates,
    ]
  );

  // Handle merge - move session from current group to previous group
  const handleMerge = useCallback(
    (fromGroupId: string) => {
      updateCurrentGroupState((state) => {
        const fromIndex = state.groups.findIndex((g) => g.id === fromGroupId);
        if (fromIndex <= 0) return state; // Can't merge first group

        const fromGroup = state.groups[fromIndex];
        const targetGroup = state.groups[fromIndex - 1];

        if (!fromGroup.activeSessionId) return state;

        const movingSessionId = fromGroup.activeSessionId;
        const remainingSessionIds = fromGroup.sessionIds.filter((id) => id !== movingSessionId);

        // If from group becomes empty, remove it
        if (remainingSessionIds.length === 0) {
          const newGroups = state.groups.filter((g) => g.id !== fromGroupId);
          newGroups[fromIndex - 1] = {
            ...targetGroup,
            sessionIds: [...targetGroup.sessionIds, movingSessionId],
            activeSessionId: movingSessionId,
          };

          const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

          return {
            groups: newGroups,
            activeGroupId: targetGroup.id,
            flexPercents: newFlexPercents,
          };
        }

        // From group still has sessions
        const newActiveInFromGroup = remainingSessionIds[0] || null;
        const newGroups = state.groups.map((g) => {
          if (g.id === targetGroup.id) {
            return {
              ...g,
              sessionIds: [...g.sessionIds, movingSessionId],
              activeSessionId: movingSessionId,
            };
          }
          if (g.id === fromGroupId) {
            return {
              ...g,
              sessionIds: remainingSessionIds,
              activeSessionId: newActiveInFromGroup,
            };
          }
          return g;
        });

        return {
          ...state,
          groups: newGroups,
          activeGroupId: targetGroup.id,
        };
      });
    },
    [updateCurrentGroupState]
  );

  // Handle resize between groups
  const handleResize = useCallback(
    (index: number, deltaPercent: number) => {
      updateCurrentGroupState((state) => {
        if (state.groups.length < 2) return state;

        const newFlexPercents = [...state.flexPercents];
        const minPercent = 20;

        // Adjust the two adjacent groups
        const leftNew = newFlexPercents[index] + deltaPercent;
        const rightNew = newFlexPercents[index + 1] - deltaPercent;

        // Clamp to minimum
        if (leftNew >= minPercent && rightNew >= minPercent) {
          newFlexPercents[index] = leftNew;
          newFlexPercents[index + 1] = rightNew;
        }

        return {
          ...state,
          flexPercents: newFlexPercents,
        };
      });
    },
    [updateCurrentGroupState]
  );

  // Auto-create first group when panel becomes active and empty
  useEffect(() => {
    if (isActive && cwd && groups.length === 0 && currentWorktreeSessions.length === 0) {
      // Create initial group with new session
      handleNewSession();
    }
  }, [isActive, cwd, groups.length, currentWorktreeSessions.length, handleNewSession]);

  // Sync sessions to groups on initial load or when sessions change externally
  useEffect(() => {
    if (!cwd || currentWorktreeSessions.length === 0) return;

    const normalizedCwd = normalizePath(cwd);
    const currentState = worktreeGroupStates[normalizedCwd];

    // If no groups exist but sessions do, create a group with all sessions
    if (!currentState || currentState.groups.length === 0) {
      const sessionIds = currentWorktreeSessions.map((s) => s.id);
      const newGroup: AgentGroupType = {
        id: crypto.randomUUID(),
        sessionIds,
        activeSessionId: sessionIds[0] || null,
      };
      setWorktreeGroupStates((prev) => ({
        ...prev,
        [normalizedCwd]: {
          groups: [newGroup],
          activeGroupId: newGroup.id,
          flexPercents: [100],
        },
      }));
    }
  }, [cwd, currentWorktreeSessions, worktreeGroupStates]);

  // Agent session keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;

      // New session
      if (matchesKeybinding(e, agentKeybindings.newSession)) {
        e.preventDefault();
        handleNewSession();
        return;
      }

      // Close session
      if (matchesKeybinding(e, agentKeybindings.closeSession)) {
        e.preventDefault();
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        if (activeGroup?.activeSessionId) {
          handleCloseSession(activeGroup.activeSessionId, activeGroup.id);
        }
        return;
      }

      // Next session
      if (matchesKeybinding(e, agentKeybindings.nextSession)) {
        e.preventDefault();
        handleNextSession();
        return;
      }

      // Prev session
      if (matchesKeybinding(e, agentKeybindings.prevSession)) {
        e.preventDefault();
        handlePrevSession();
        return;
      }

      // Bonus: Cmd/Win+1-9 to switch to specific session in active group
      if (e.metaKey && e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        if (activeGroup) {
          const index = Number.parseInt(e.key, 10) - 1;
          if (index < activeGroup.sessionIds.length) {
            e.preventDefault();
            handleSelectSession(activeGroup.sessionIds[index], activeGroup.id);
            return;
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isActive,
    groups,
    activeGroupId,
    agentKeybindings,
    handleNewSession,
    handleCloseSession,
    handleNextSession,
    handlePrevSession,
    handleSelectSession,
  ]);

  if (!cwd) return null;

  const normalizedCwd = normalizePath(cwd);

  // Check if there are any groups
  const hasAnyGroups = Object.keys(worktreeGroupStates).length > 0;

  // If no groups and no sessions, show empty state
  if (!hasAnyGroups && currentWorktreeSessions.length === 0) {
    return (
      <div className="relative h-full w-full">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted-foreground bg-background">
          <Sparkles className="h-12 w-12 opacity-50" />
          <p className="text-sm">{t('No agent sessions')}</p>
          <div
            className="relative"
            onMouseEnter={() => setShowAgentMenu(true)}
            onMouseLeave={() => setShowAgentMenu(false)}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                handleNewSession();
                setShowAgentMenu(false);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('New Session')}
            </Button>
            {showAgentMenu && enabledAgents.length > 0 && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full pt-1 z-50 min-w-40">
                <div className="rounded-lg border bg-popover p-1 shadow-lg">
                  <div className="px-2 py-1 text-xs text-muted-foreground">{t('Select Agent')}</div>
                  {enabledAgents.map((agentId) => {
                    const isHapi = agentId.endsWith('-hapi');
                    const isHappy = agentId.endsWith('-happy');
                    const baseId = isHapi
                      ? agentId.slice(0, -5)
                      : isHappy
                        ? agentId.slice(0, -6)
                        : agentId;
                    const customAgent = customAgents.find((a) => a.id === baseId);
                    const baseName = customAgent?.name ?? AGENT_INFO[baseId]?.name ?? baseId;
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
                          handleNewSessionWithAgent(
                            agentId,
                            customAgent?.command ?? AGENT_INFO[baseId]?.command ?? 'claude'
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
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Render all worktrees' groups to keep terminals mounted */}
      {Object.entries(worktreeGroupStates).map(([worktreePath, state]) => {
        const isCurrentWorktree = worktreePath === normalizedCwd;
        const worktreeSessions = allSessions.filter(
          (s) => s.repoPath === repoPath && pathsEqual(s.cwd, worktreePath)
        );

        return (
          <div
            key={worktreePath}
            className={
              isCurrentWorktree
                ? 'flex h-full w-full'
                : 'absolute inset-0 opacity-0 pointer-events-none'
            }
          >
            {state.groups.map((group, index) => (
              <div
                key={group.id}
                className="flex h-full"
                style={{ flex: `0 0 ${state.flexPercents[index]}%` }}
              >
                <AgentGroup
                  group={group}
                  sessions={worktreeSessions}
                  isActive={isActive && isCurrentWorktree}
                  isGroupActive={group.id === state.activeGroupId}
                  enabledAgents={enabledAgents}
                  customAgents={customAgents}
                  agentSettings={agentSettings}
                  agentInfo={AGENT_INFO}
                  onSessionSelect={(id) => handleSelectSession(id, group.id)}
                  onSessionClose={(id) => handleCloseSession(id, group.id)}
                  onSessionNew={() => handleNewSession(group.id)}
                  onSessionNewWithAgent={(agentId, cmd) =>
                    handleNewSessionWithAgent(agentId, cmd, group.id)
                  }
                  onSessionRename={handleRenameSession}
                  onSessionReorder={(from, to) => handleReorderSessions(group.id, from, to)}
                  onSessionInitialized={handleInitialized}
                  onSessionActivated={handleActivated}
                  onSessionTerminalTitleChange={handleSessionTerminalTitleChange}
                  onGroupClick={() => handleGroupClick(group.id)}
                  onSplit={() => handleSplit(group.id)}
                  canMerge={index > 0}
                  onMerge={() => handleMerge(group.id)}
                />
                {index < state.groups.length - 1 && (
                  <ResizeHandle onResize={(delta) => handleResize(index, delta)} />
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
