import type { AgentCliInfo, BuiltinAgentId, CustomAgent } from '@shared/types';
import * as pty from 'node-pty';
import { getEnvForCommand, getShellForCommand } from '../../utils/shell';

// Detection timeout in milliseconds (increased for slow shells like PowerShell with -Login)
const DETECT_TIMEOUT = 15000;

/**
 * Strip ANSI escape codes from terminal output
 */
function stripAnsi(str: string): string {
  // Remove ANSI color/style codes
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence is intentional
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Check if an error is a timeout error
 */
function isTimeoutError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const err = error as { message?: string };
    return err.message === 'Detection timeout';
  }
  return false;
}

interface BuiltinAgentConfig {
  id: BuiltinAgentId;
  name: string;
  command: string;
  versionFlag: string;
  versionRegex?: RegExp;
}

const BUILTIN_AGENT_CONFIGS: BuiltinAgentConfig[] = [
  {
    id: 'claude',
    name: 'Claude',
    command: 'claude',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'droid',
    name: 'Droid',
    command: 'droid',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    command: 'gemini',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'auggie',
    name: 'Auggie',
    command: 'auggie',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    command: 'cursor-agent',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
];

class CliDetector {
  /**
   * Execute command in PTY to load user's environment (PATH, nvm, mise, volta, etc.)
   * Uses the same mechanism as terminal sessions to ensure consistent detection.
   *
   * This approach guarantees that if a CLI can be launched in a terminal session,
   * it will also be detected correctly, as both use identical shell initialization.
   */
  private async execInPty(command: string, timeout = DETECT_TIMEOUT): Promise<string> {
    return new Promise((resolve, reject) => {
      const { shell, args } = getShellForCommand();
      const shellName = shell.toLowerCase();

      // Construct shell args with command (same logic as AgentTerminal)
      let shellArgs: string[];

      if (shellName.includes('wsl')) {
        // WSL: use user's default shell to load environment properly
        const escapedCommand = command.replace(/"/g, '\\"');
        shellArgs = ['-e', 'sh', '-lc', `exec "$SHELL" -ilc "${escapedCommand}"`];
      } else if (shellName.includes('powershell') || shellName.includes('pwsh')) {
        // PowerShell: wrap command in script block and exit with last exit code
        shellArgs = [...args, `& { ${command}; exit $LASTEXITCODE }`];
      } else if (shellName.includes('cmd')) {
        // cmd.exe: execute command and exit
        shellArgs = [...args, `${command} & exit %ERRORLEVEL%`];
      } else {
        // Unix shells (bash, zsh, etc.): execute and exit with command status
        shellArgs = [...args, `${command}; exit $?`];
      }

      let output = '';
      let hasExited = false;
      let ptyProcess: pty.IPty | null = null;

      // Timeout handler
      const timeoutId = setTimeout(() => {
        if (!hasExited && ptyProcess) {
          hasExited = true;
          ptyProcess.kill();
          reject(new Error('Detection timeout'));
        }
      }, timeout);

      try {
        // Spawn PTY with same environment as terminal sessions
        ptyProcess = pty.spawn(shell, shellArgs, {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: process.env.HOME || process.env.USERPROFILE || '/',
          env: {
            ...getEnvForCommand(),
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
          } as Record<string, string>,
        });

        // Collect output
        ptyProcess.onData((data) => {
          output += data;
        });

        // Handle exit
        ptyProcess.onExit(({ exitCode }) => {
          if (hasExited) return; // Already handled by timeout
          hasExited = true;
          clearTimeout(timeoutId);

          if (exitCode === 0) {
            // Clean ANSI codes and return output
            const cleaned = stripAnsi(output).trim();
            resolve(cleaned);
          } else {
            reject(new Error(`Command exited with code ${exitCode}`));
          }
        });
      } catch (error) {
        hasExited = true;
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  private async detectBuiltin(
    config: BuiltinAgentConfig,
    customPath?: string
  ): Promise<AgentCliInfo> {
    try {
      // Use customPath if provided, otherwise use default command
      const effectiveCommand = customPath || config.command;
      const stdout = await this.execInPty(`${effectiveCommand} ${config.versionFlag}`);

      let version: string | undefined;
      if (config.versionRegex) {
        const match = stdout.match(config.versionRegex);
        version = match ? match[1] : undefined;
      }

      return {
        id: config.id,
        name: config.name,
        command: config.command,
        installed: true,
        version,
        isBuiltin: true,
        environment: 'native',
      };
    } catch (error) {
      return {
        id: config.id,
        name: config.name,
        command: config.command,
        installed: false,
        isBuiltin: true,
        timedOut: isTimeoutError(error),
      };
    }
  }

  private async detectCustom(agent: CustomAgent): Promise<AgentCliInfo> {
    try {
      const stdout = await this.execInPty(`${agent.command} --version`);

      const match = stdout.match(/(\d+\.\d+\.\d+)/);
      const version = match ? match[1] : undefined;

      return {
        id: agent.id,
        name: agent.name,
        command: agent.command,
        installed: true,
        version,
        isBuiltin: false,
        environment: 'native',
      };
    } catch (error) {
      return {
        id: agent.id,
        name: agent.name,
        command: agent.command,
        installed: false,
        isBuiltin: false,
        timedOut: isTimeoutError(error),
      };
    }
  }

  async detectOne(
    agentId: string,
    customAgent?: CustomAgent,
    customPath?: string
  ): Promise<AgentCliInfo> {
    const builtinConfig = BUILTIN_AGENT_CONFIGS.find((c) => c.id === agentId);
    if (builtinConfig) {
      return await this.detectBuiltin(builtinConfig, customPath);
    } else if (customAgent) {
      return await this.detectCustom(customAgent);
    } else {
      return {
        id: agentId,
        name: agentId,
        command: agentId,
        installed: false,
        isBuiltin: false,
      };
    }
  }
}

export const cliDetector = new CliDetector();
