import { spawn } from 'node:child_process';
import type {
  AIProvider,
  ClaudeModelId,
  CodexModelId,
  GeminiModelId,
  ModelId,
  ReasoningEffort,
} from '@shared/types';
import type { LanguageModel } from 'ai';
import { createClaudeCode } from 'ai-sdk-provider-claude-code';
import { createCodexCli } from 'ai-sdk-provider-codex-cli';
import { createGeminiCli } from 'ai-sdk-provider-gemini-cli-agentic';

export type { AIProvider, ModelId, ReasoningEffort } from '@shared/types';

// Claude Code provider with read-only permissions
const claudeCodeProvider = createClaudeCode({
  defaultSettings: {
    settingSources: ['user', 'project', 'local'],
    disallowedTools: ['Write', 'Edit', 'Delete', 'Bash(rm:*)', 'Bash(sudo:*)'],
    includePartialMessages: true,
    spawnClaudeCodeProcess: (options) => {
      const proc = spawn('claude', options.args, {
        cwd: options.cwd,
        env: options.env as NodeJS.ProcessEnv,
        signal: options.signal,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return {
        stdin: proc.stdin,
        stdout: proc.stdout,
        get killed() {
          return proc.killed;
        },
        get exitCode() {
          return proc.exitCode;
        },
        kill: (signal) => proc.kill(signal),
        on: (event, listener) => proc.on(event, listener),
        once: (event, listener) => proc.once(event, listener),
        off: (event, listener) => proc.off(event, listener),
      };
    },
  },
});

// Codex CLI provider with read-only sandbox
const codexCliProvider = createCodexCli({
  defaultSettings: {
    codexPath: 'codex',
    sandboxMode: 'read-only',
  },
});

// Gemini CLI provider with read-only tools
const geminiCliProvider = createGeminiCli({
  defaultSettings: {
    allowedTools: ['read_file', 'list_directory', 'search_files'],
    approvalMode: 'yolo',
  },
});

export interface GetModelOptions {
  provider?: AIProvider;
  reasoningEffort?: ReasoningEffort; // For Codex CLI
}

export function getModel(modelId: ModelId, options: GetModelOptions = {}): LanguageModel {
  const { provider = 'claude-code', reasoningEffort } = options;

  switch (provider) {
    case 'claude-code':
      return claudeCodeProvider(modelId as ClaudeModelId);
    case 'codex-cli':
      return codexCliProvider(modelId as CodexModelId, {
        reasoningEffort: reasoningEffort ?? 'medium',
      });
    case 'gemini-cli':
      return geminiCliProvider(modelId as GeminiModelId);
    default:
      return claudeCodeProvider(modelId as ClaudeModelId);
  }
}
