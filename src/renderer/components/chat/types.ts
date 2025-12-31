/**
 * Types for AgentPanel split functionality
 */

export interface AgentGroup {
  id: string;
  // Session IDs belonging to this group (sessions are managed in Zustand store)
  sessionIds: string[];
  activeSessionId: string | null;
}

export interface AgentGroupState {
  groups: AgentGroup[];
  activeGroupId: string | null;
  // Flex percentages for each group
  flexPercents: number[];
}

export function createInitialGroupState(): AgentGroupState {
  return {
    groups: [],
    activeGroupId: null,
    flexPercents: [],
  };
}
