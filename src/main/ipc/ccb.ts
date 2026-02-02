import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/types/ipc';
import type { EnsoRPCServer } from '../services/ccb/EnsoRPCServer';

interface CCBStartOptions {
  /** Working directory for CCB */
  cwd: string;
  /** Optional: override providers list (default reads from ccb.config) */
  providers?: string[];
}

interface CCBStartResult {
  success: boolean;
  error?: string;
}

export type CCBStatus = 'idle' | 'starting' | 'running' | 'error';

interface CCBState {
  status: CCBStatus;
  process: ChildProcess | null;
  cwd: string;
  error: string | null;
  stopRequested: boolean;
  generation: number;
}

// Per-worktree CCB process state
const ccbProcesses = new Map<string, CCBState>();

let mainWindowRef: BrowserWindow | null = null;
let rpcServerRef: EnsoRPCServer | null = null;

function normalizeCwd(inputCwd: string): { key: string; resolvedCwd: string } {
  const resolvedCwd = path.resolve(inputCwd);
  const normalized = resolvedCwd.replace(/\\/g, '/');
  // Only lowercase on Windows (case-insensitive filesystem)
  const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  return { key, resolvedCwd };
}

function getState(cwd: string): CCBState {
  const { key, resolvedCwd } = normalizeCwd(cwd);
  let state = ccbProcesses.get(key);
  if (!state) {
    state = {
      status: 'idle',
      process: null,
      cwd: resolvedCwd,
      error: null,
      stopRequested: false,
      generation: 0,
    };
    ccbProcesses.set(key, state);
    return state;
  }
  state.cwd = resolvedCwd;
  return state;
}

function notifyStatusChange(cwd: string, status: CCBStatus, error?: string): void {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(IPC_CHANNELS.CCB_STATUS_CHANGED, { cwd, status, error });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isProcessAlive(child: ChildProcess | null): child is ChildProcess {
  return Boolean(child && child.exitCode === null && child.signalCode === null);
}

function validateProviders(input: unknown): string[] | null {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return null;

  const cleaned: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') return null;
    const trimmed = item.trim();
    if (trimmed.length === 0 || trimmed.length > 64) return null;
    // Avoid shell metacharacters
    if (!/^[\w@./:-]+$/i.test(trimmed)) return null;
    cleaned.push(trimmed);
  }
  return cleaned;
}

async function startCCB(options: CCBStartOptions): Promise<CCBStartResult> {
  const { cwd, providers } = options;

  if (typeof cwd !== 'string' || cwd.trim().length === 0) {
    return { success: false, error: 'Invalid cwd' };
  }

  const state = getState(cwd);

  // Clear stale stopRequested if process is dead
  if (state.stopRequested && !isProcessAlive(state.process)) {
    state.stopRequested = false;
  }

  // If process is alive, check current state
  if (isProcessAlive(state.process)) {
    if (state.stopRequested) {
      return { success: false, error: 'CCB is stopping' };
    }
    // Process alive but status inconsistent - fix it
    if (state.status !== 'running' && state.status !== 'starting') {
      state.status = 'running';
      state.error = null;
      notifyStatusChange(state.cwd, 'running');
    }
    return { success: true };
  }

  // No live process - reset stale status
  if (state.status === 'running' || state.status === 'starting') {
    state.status = 'idle';
    state.error = null;
  }

  // Check if RPC server is ready
  if (!rpcServerRef) {
    return { success: false, error: 'CCB RPC server not initialized' };
  }

  const { host, port, token } = rpcServerRef.getConnectionInfo();
  if (!token || port === 0) {
    return { success: false, error: 'CCB RPC server not ready' };
  }

  // Validate cwd exists and is a directory
  if (!fs.existsSync(state.cwd)) {
    return { success: false, error: `CCB cwd does not exist: ${state.cwd}` };
  }
  try {
    if (!fs.statSync(state.cwd).isDirectory()) {
      return { success: false, error: `CCB cwd is not a directory: ${state.cwd}` };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to access cwd: ${error}` };
  }

  // Validate providers
  const validatedProviders = validateProviders(providers);
  if (validatedProviders === null) {
    return { success: false, error: 'Invalid providers' };
  }

  // Update state for new start attempt
  state.stopRequested = false;
  state.generation += 1;
  const generation = state.generation;

  state.status = 'starting';
  state.error = null;
  notifyStatusChange(state.cwd, 'starting');

  try {
    // Build command arguments: ccb [providers...] (no 'up' subcommand)
    // If no providers specified, CCB reads from ccb.config
    const args = [...validatedProviders];

    // Build environment with RPC connection info
    const env = {
      ...process.env,
      ENSO_RPC_HOST: host,
      ENSO_RPC_PORT: String(port),
      ENSO_RPC_TOKEN: token,
    };

    console.log('[CCB] Starting with env:', {
      ENSO_RPC_HOST: env.ENSO_RPC_HOST,
      ENSO_RPC_PORT: env.ENSO_RPC_PORT,
      ENSO_RPC_TOKEN: env.ENSO_RPC_TOKEN ? 'SET' : 'NOT SET',
      cwd: state.cwd,
      args,
    });

    // Spawn CCB process
    // On Windows, call Python directly to avoid .bat wrapper issues with env vars
    const ccbScript = 'F:\\code\\cc\\claude_code_bridge\\ccb';
    const ccbProcess = spawn('python', [ccbScript, ...args], {
      cwd: state.cwd,
      env,
      shell: false, // Don't use shell - direct process spawn preserves env vars better
      windowsHide: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    state.process = ccbProcess;

    // Handle stdout/stderr for logging
    ccbProcess.stdout?.on('data', (data: Buffer) => {
      console.log(`[CCB][stdout] ${data.toString().trim()}`);
    });

    ccbProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[CCB][stderr] ${data.toString().trim()}`);
    });

    // Handle process exit
    ccbProcess.once('exit', (code, signal) => {
      // Ignore events from superseded processes
      if (state.generation !== generation) return;

      console.log(`[CCB] Process exited with code ${code}, signal ${signal}`);

      if (state.process === ccbProcess) {
        state.process = null;
      }

      // If stop was requested, treat as successful idle
      if (state.stopRequested) {
        state.stopRequested = false;
        state.status = 'idle';
        state.error = null;
        notifyStatusChange(state.cwd, 'idle');
        return;
      }

      state.status = code === 0 ? 'idle' : 'error';
      state.error =
        code === 0 ? null : `CCB exited with code ${code ?? 'null'}${signal ? ` (${signal})` : ''}`;
      notifyStatusChange(state.cwd, state.status, state.error ?? undefined);
    });

    ccbProcess.once('error', (err) => {
      // Ignore events from superseded processes
      if (state.generation !== generation) return;

      console.error('[CCB] Process error:', err);
      state.status = 'error';
      state.error = err.message;
      if (state.process === ccbProcess) {
        state.process = null;
      }
      notifyStatusChange(state.cwd, 'error', err.message);
    });

    // Fail-fast window: check if process exits immediately
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Check for superseded request
    if (state.generation !== generation) {
      return { success: false, error: 'CCB start superseded by a newer request' };
    }
    if (state.stopRequested) {
      return { success: false, error: 'CCB start cancelled' };
    }
    if (!isProcessAlive(state.process)) {
      state.status = 'error';
      state.error = state.error ?? 'CCB exited during startup';
      notifyStatusChange(state.cwd, 'error', state.error);
      return { success: false, error: state.error };
    }

    state.status = 'running';
    notifyStatusChange(state.cwd, 'running');
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    state.status = 'error';
    state.error = error;
    state.process = null;
    notifyStatusChange(state.cwd, 'error', error);
    return { success: false, error };
  }
}

async function stopCCB(cwd: string): Promise<void> {
  const state = getState(cwd);

  // Clear stale stopRequested if process is dead
  if (state.stopRequested && !isProcessAlive(state.process)) {
    state.stopRequested = false;
  }

  state.stopRequested = true;
  state.error = null;

  if (isProcessAlive(state.process) && !state.process.killed) {
    try {
      // On Windows, we need to kill the process tree
      if (process.platform === 'win32' && state.process.pid) {
        spawn('taskkill', ['/pid', String(state.process.pid), '/f', '/t'], {
          shell: true,
        });
      } else {
        state.process.kill('SIGTERM');
      }
    } catch (err) {
      console.warn('[CCB] Error stopping process:', err);
    }
  } else {
    state.process = null;
  }

  state.status = 'idle';
  notifyStatusChange(state.cwd, 'idle');
}

function getStatus(cwd: string): { status: CCBStatus; error: string | null } {
  const state = getState(cwd);
  return { status: state.status, error: state.error };
}

export function registerCCBHandlers(
  mainWindow: BrowserWindow,
  rpcServer: EnsoRPCServer | null
): void {
  mainWindowRef = mainWindow;
  rpcServerRef = rpcServer;

  // Idempotent registration: remove existing handlers first to avoid errors on reload
  ipcMain.removeHandler(IPC_CHANNELS.CCB_START);
  ipcMain.removeHandler(IPC_CHANNELS.CCB_STOP);
  ipcMain.removeHandler(IPC_CHANNELS.CCB_GET_STATUS);

  ipcMain.handle(
    IPC_CHANNELS.CCB_START,
    async (_event, options: unknown): Promise<CCBStartResult> => {
      if (!isPlainObject(options)) {
        return { success: false, error: 'Invalid start options' };
      }
      const cwd = options.cwd;
      const providers = options.providers;
      if (typeof cwd !== 'string') {
        return { success: false, error: 'Invalid cwd' };
      }
      const validatedProviders = validateProviders(providers);
      if (validatedProviders === null) {
        return { success: false, error: 'Invalid providers' };
      }
      return startCCB({ cwd, providers: validatedProviders });
    }
  );

  ipcMain.handle(IPC_CHANNELS.CCB_STOP, async (_event, cwd: unknown) => {
    if (typeof cwd !== 'string') return;
    await stopCCB(cwd);
  });

  ipcMain.handle(
    IPC_CHANNELS.CCB_GET_STATUS,
    (_event, cwd: unknown): { status: CCBStatus; error: string | null } => {
      if (typeof cwd !== 'string') {
        return { status: 'idle', error: 'Invalid cwd' };
      }
      return getStatus(cwd);
    }
  );
}

export function updateCCBRpcServer(rpcServer: EnsoRPCServer | null): void {
  rpcServerRef = rpcServer;
}

export function stopAllCCBProcesses(): void {
  for (const [key, state] of ccbProcesses.entries()) {
    state.stopRequested = true;
    state.status = 'idle';
    state.error = null;
    notifyStatusChange(state.cwd, 'idle');

    if (isProcessAlive(state.process) && !state.process.killed) {
      console.log(`[CCB] Stopping CCB process for ${key}`);
      try {
        if (process.platform === 'win32' && state.process.pid) {
          spawn('taskkill', ['/pid', String(state.process.pid), '/f', '/t'], {
            shell: true,
          });
        } else {
          state.process.kill('SIGTERM');
        }
      } catch (err) {
        console.warn('[CCB] Error stopping process:', err);
      }
    }
  }
  // Keep states to prevent late exit events from recreating fresh states
}
