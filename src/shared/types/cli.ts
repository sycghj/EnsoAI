export type BuiltinAgentId = 'claude' | 'codex' | 'droid' | 'gemini' | 'auggie' | 'cursor';

export type AgentEnvironment = 'native' | 'wsl' | 'hapi' | 'happy';

export interface AgentCliInfo {
  id: string;
  name: string;
  command: string;
  installed: boolean;
  version?: string;
  isBuiltin: boolean;
  environment?: AgentEnvironment;
  /** Detection timed out - status unknown */
  timedOut?: boolean;
}

export interface CustomAgent {
  id: string;
  name: string;
  command: string;
  description?: string;
}

export interface AgentCliStatus {
  agents: AgentCliInfo[];
}
