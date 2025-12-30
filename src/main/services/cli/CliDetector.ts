import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentCliInfo, AgentCliStatus, BuiltinAgentId, CustomAgent } from '@shared/types';
import { getEnvForCommand, getShellForCommand } from '../../utils/shell';

const isWindows = process.platform === 'win32';

const execAsync = promisify(exec);

// Detection timeout in milliseconds (increased for slow shells like PowerShell with -Login)
const DETECT_TIMEOUT = 15000;
const WSL_DETECT_TIMEOUT = 15000;

/**
 * Check if an error is a timeout error
 */
function isTimeoutError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const err = error as { killed?: boolean; signal?: string; code?: string };
    // Node.js kills the process with SIGTERM on timeout
    return err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT';
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
];

export interface CliDetectOptions {
  includeWsl?: boolean;
}

class CliDetector {
  private cachedStatus: AgentCliStatus | null = null;
  private cachedAgents: Map<string, AgentCliInfo> = new Map();
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute cache
  private wslAvailable: boolean | null = null;

  /**
   * Execute command in login shell to load user's environment (PATH, nvm, etc.)
   * Uses user's configured shell from settings.
   */
  private async execInLoginShell(command: string, timeout = DETECT_TIMEOUT): Promise<string> {
    const { shell, args } = getShellForCommand();
    const env = getEnvForCommand();

    let fullCommand: string;
    const shellName = shell.toLowerCase();

    if (shellName.includes('wsl')) {
      // WSL: wsl.exe -- sh -c "command"
      // Don't quote the shell or intermediate args, only quote the command
      const escapedCommand = command.replace(/"/g, '\\"');
      fullCommand = `${shell} ${args.join(' ')} "${escapedCommand}"`;
    } else if (shellName.includes('cmd')) {
      // cmd.exe: don't quote the command, just pass it directly
      // cmd /c command args
      fullCommand = `"${shell}" ${args.join(' ')} ${command}`;
    } else if (shellName.includes('powershell') || shellName.includes('pwsh')) {
      // PowerShell: use -Command with the command string
      const escapedCommand = command.replace(/"/g, '\\"');
      fullCommand = `"${shell}" ${args.map((a) => `"${a}"`).join(' ')} "${escapedCommand}"`;
    } else {
      // Unix shells (bash, zsh, etc.): escape quotes and wrap in quotes
      const escapedCommand = command.replace(/"/g, '\\"');
      fullCommand = `"${shell}" ${args.map((a) => `"${a}"`).join(' ')} "${escapedCommand}"`;
    }

    const { stdout } = await execAsync(fullCommand, { timeout, env });
    return stdout;
  }

  private async isWslAvailable(): Promise<boolean> {
    if (this.wslAvailable !== null) {
      return this.wslAvailable;
    }
    if (!isWindows) {
      this.wslAvailable = false;
      return false;
    }
    try {
      await execAsync('wsl --status', { timeout: 3000 });
      this.wslAvailable = true;
      return true;
    } catch {
      this.wslAvailable = false;
      return false;
    }
  }

  async detectBuiltin(config: BuiltinAgentConfig): Promise<AgentCliInfo> {
    try {
      const stdout = await this.execInLoginShell(`${config.command} ${config.versionFlag}`);

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

  async detectBuiltinInWsl(config: BuiltinAgentConfig): Promise<AgentCliInfo> {
    try {
      // Use interactive login shell (-il) to load nvm/rbenv/pyenv and other version managers
      // Use $SHELL to respect user's default shell (bash/zsh/etc)
      await execAsync(`wsl -- sh -c 'exec $SHELL -ilc "which ${config.command}"'`, {
        timeout: WSL_DETECT_TIMEOUT,
      });
      const { stdout } = await execAsync(
        `wsl -- sh -c 'exec $SHELL -ilc "${config.command} ${config.versionFlag}"'`,
        {
          timeout: WSL_DETECT_TIMEOUT,
        }
      );

      let version: string | undefined;
      if (config.versionRegex) {
        const match = stdout.match(config.versionRegex);
        version = match ? match[1] : undefined;
      }

      return {
        id: `${config.id}-wsl`,
        name: `${config.name} (WSL)`,
        command: config.command,
        installed: true,
        version,
        isBuiltin: true,
        environment: 'wsl',
      };
    } catch (error) {
      return {
        id: `${config.id}-wsl`,
        name: `${config.name} (WSL)`,
        command: config.command,
        installed: false,
        isBuiltin: true,
        environment: 'wsl',
        timedOut: isTimeoutError(error),
      };
    }
  }

  async detectCustom(agent: CustomAgent): Promise<AgentCliInfo> {
    try {
      const stdout = await this.execInLoginShell(`${agent.command} --version`);

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

  async detectCustomInWsl(agent: CustomAgent): Promise<AgentCliInfo> {
    try {
      // Use interactive login shell (-il) to load nvm/rbenv/pyenv and other version managers
      // Use $SHELL to respect user's default shell (bash/zsh/etc)
      await execAsync(`wsl -- sh -c 'exec $SHELL -ilc "which ${agent.command}"'`, {
        timeout: WSL_DETECT_TIMEOUT,
      });
      const { stdout } = await execAsync(
        `wsl -- sh -c 'exec $SHELL -ilc "${agent.command} --version"'`,
        {
          timeout: WSL_DETECT_TIMEOUT,
        }
      );

      const match = stdout.match(/(\d+\.\d+\.\d+)/);
      const version = match ? match[1] : undefined;

      return {
        id: `${agent.id}-wsl`,
        name: `${agent.name} (WSL)`,
        command: agent.command,
        installed: true,
        version,
        isBuiltin: false,
        environment: 'wsl',
      };
    } catch (error) {
      return {
        id: `${agent.id}-wsl`,
        name: `${agent.name} (WSL)`,
        command: agent.command,
        installed: false,
        isBuiltin: false,
        environment: 'wsl',
        timedOut: isTimeoutError(error),
      };
    }
  }

  private isCacheValid(): boolean {
    return Date.now() - this.cacheTimestamp < this.CACHE_TTL;
  }

  async detectOne(
    agentId: string,
    customAgent?: CustomAgent,
    _options?: CliDetectOptions
  ): Promise<AgentCliInfo> {
    // Check cache first
    if (this.isCacheValid() && this.cachedAgents.has(agentId)) {
      return this.cachedAgents.get(agentId)!;
    }

    // Check if this is a WSL agent (id ends with -wsl)
    const isWslAgent = agentId.endsWith('-wsl');
    const baseAgentId = isWslAgent ? agentId.slice(0, -4) : agentId;

    let result: AgentCliInfo;

    if (isWslAgent) {
      // Check if WSL is available first
      if (!(await this.isWslAvailable())) {
        result = {
          id: agentId,
          name: `${baseAgentId} (WSL)`,
          command: baseAgentId,
          installed: false,
          isBuiltin: false,
          environment: 'wsl',
        };
      } else {
        const builtinConfig = BUILTIN_AGENT_CONFIGS.find((c) => c.id === baseAgentId);
        if (builtinConfig) {
          result = await this.detectBuiltinInWsl(builtinConfig);
        } else if (customAgent) {
          // For WSL custom agent, use the base agent info
          const baseAgent = { ...customAgent, id: baseAgentId };
          result = await this.detectCustomInWsl(baseAgent);
        } else {
          result = {
            id: agentId,
            name: `${baseAgentId} (WSL)`,
            command: baseAgentId,
            installed: false,
            isBuiltin: false,
            environment: 'wsl',
          };
        }
      }
    } else {
      const builtinConfig = BUILTIN_AGENT_CONFIGS.find((c) => c.id === agentId);
      if (builtinConfig) {
        result = await this.detectBuiltin(builtinConfig);
      } else if (customAgent) {
        result = await this.detectCustom(customAgent);
      } else {
        result = {
          id: agentId,
          name: agentId,
          command: agentId,
          installed: false,
          isBuiltin: false,
        };
      }
    }

    // Cache the result
    this.cachedAgents.set(agentId, result);
    if (!this.isCacheValid()) {
      this.cacheTimestamp = Date.now();
    }

    return result;
  }

  /**
   * Detect all agents in parallel using Promise.all
   */
  private async detectAllInShell(
    configs: Array<{ id: string; command: string; versionFlag: string; versionRegex?: RegExp }>,
    customAgents: CustomAgent[]
  ): Promise<Map<string, { installed: boolean; version?: string; timedOut?: boolean }>> {
    const results = new Map<string, { installed: boolean; version?: string; timedOut?: boolean }>();
    const allCommands: Array<{ id: string; command: string; versionRegex?: RegExp }> = [];

    for (const config of configs) {
      allCommands.push({
        id: config.id,
        command: `${config.command} ${config.versionFlag}`,
        versionRegex: config.versionRegex,
      });
    }

    for (const agent of customAgents) {
      allCommands.push({
        id: agent.id,
        command: `${agent.command} --version`,
        versionRegex: /(\d+\.\d+\.\d+)/,
      });
    }

    const detectPromises = allCommands.map(async ({ id, command, versionRegex }) => {
      try {
        const output = await this.execInLoginShell(command);
        const versionMatch = versionRegex ? output.match(versionRegex) : null;
        results.set(id, {
          installed: true,
          version: versionMatch ? versionMatch[1] : undefined,
        });
      } catch (error) {
        results.set(id, { installed: false, timedOut: isTimeoutError(error) });
      }
    });

    await Promise.all(detectPromises);
    return results;
  }

  /**
   * Detect all agents in WSL in parallel using Promise.all
   */
  private async detectAllInWsl(
    configs: Array<{ id: string; command: string; versionFlag: string; versionRegex?: RegExp }>,
    customAgents: CustomAgent[]
  ): Promise<Map<string, { installed: boolean; version?: string; timedOut?: boolean }>> {
    const results = new Map<string, { installed: boolean; version?: string; timedOut?: boolean }>();
    const allCommands: Array<{ id: string; command: string; versionRegex?: RegExp }> = [];

    for (const config of configs) {
      allCommands.push({
        id: `${config.id}-wsl`,
        command: `${config.command} ${config.versionFlag}`,
        versionRegex: config.versionRegex,
      });
    }

    for (const agent of customAgents) {
      allCommands.push({
        id: `${agent.id}-wsl`,
        command: `${agent.command} --version`,
        versionRegex: /(\d+\.\d+\.\d+)/,
      });
    }

    const detectPromises = allCommands.map(async ({ id, command, versionRegex }) => {
      try {
        const { stdout } = await execAsync(`wsl -- sh -c 'exec $SHELL -ilc "${command}"'`, {
          timeout: WSL_DETECT_TIMEOUT,
        });
        const versionMatch = versionRegex ? stdout.match(versionRegex) : null;
        results.set(id, {
          installed: true,
          version: versionMatch ? versionMatch[1] : undefined,
        });
      } catch (error) {
        results.set(id, { installed: false, timedOut: isTimeoutError(error) });
      }
    });

    await Promise.all(detectPromises);
    return results;
  }

  async detectAll(
    customAgents: CustomAgent[] = [],
    options: CliDetectOptions = {}
  ): Promise<AgentCliStatus> {
    // Return cached status if still valid
    if (this.isCacheValid() && this.cachedStatus) {
      return this.cachedStatus;
    }

    const agents: AgentCliInfo[] = [];

    // Detect native agents in parallel
    const nativeResults = await this.detectAllInShell(BUILTIN_AGENT_CONFIGS, customAgents);

    // Build native agent info
    for (const config of BUILTIN_AGENT_CONFIGS) {
      const result = nativeResults.get(config.id);
      agents.push({
        id: config.id,
        name: config.name,
        command: config.command,
        installed: result?.installed ?? false,
        version: result?.version,
        isBuiltin: true,
        environment: 'native',
        timedOut: result?.timedOut,
      });
    }

    for (const agent of customAgents) {
      const result = nativeResults.get(agent.id);
      agents.push({
        id: agent.id,
        name: agent.name,
        command: agent.command,
        installed: result?.installed ?? false,
        version: result?.version,
        isBuiltin: false,
        environment: 'native',
        timedOut: result?.timedOut,
      });
    }

    // Detect WSL agents in parallel if enabled
    if (options.includeWsl && (await this.isWslAvailable())) {
      const wslResults = await this.detectAllInWsl(BUILTIN_AGENT_CONFIGS, customAgents);

      for (const config of BUILTIN_AGENT_CONFIGS) {
        const result = wslResults.get(`${config.id}-wsl`);
        agents.push({
          id: `${config.id}-wsl`,
          name: `${config.name} (WSL)`,
          command: config.command,
          installed: result?.installed ?? false,
          version: result?.version,
          isBuiltin: true,
          environment: 'wsl',
          timedOut: result?.timedOut,
        });
      }

      for (const agent of customAgents) {
        const result = wslResults.get(`${agent.id}-wsl`);
        agents.push({
          id: `${agent.id}-wsl`,
          name: `${agent.name} (WSL)`,
          command: agent.command,
          installed: result?.installed ?? false,
          version: result?.version,
          isBuiltin: false,
          environment: 'wsl',
          timedOut: result?.timedOut,
        });
      }
    }

    // Update caches
    this.cachedStatus = { agents };
    this.cacheTimestamp = Date.now();
    for (const agent of agents) {
      this.cachedAgents.set(agent.id, agent);
    }

    return this.cachedStatus;
  }

  /**
   * Force refresh cache on next detection
   */
  invalidateCache(): void {
    this.cacheTimestamp = 0;
    this.cachedAgents.clear();
    this.cachedStatus = null;
  }

  getCached(): AgentCliStatus | null {
    return this.cachedStatus;
  }
}

export const cliDetector = new CliDetector();
