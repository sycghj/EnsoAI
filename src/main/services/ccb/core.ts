import { IPC_CHANNELS } from '@shared/types';
import type { BrowserWindow } from 'electron';
import { PtyManager } from '../terminal/PtyManager';
import type { PaneInfo } from './types';

/** Maximum number of lines to keep in the output buffer per pane. */
const MAX_BUFFER_LINES = 1000;

/** Maximum characters to keep in the incomplete tail fragment. */
const MAX_TAIL_CHARS = 64_000;

export class CCBCore {
  private readonly ptyManager = PtyManager.getInstance();
  private readonly panes = new Map<string, PaneInfo>();

  constructor(private mainWindow: BrowserWindow) {}

  setMainWindow(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
  }

  createPane(options: {
    command: string;
    cwd: string;
    title?: string;
    env?: Record<string, string>;
  }): { pane_id: string; title: string } {
    const title = options.title ?? options.command;

    const ptyId = this.ptyManager.create(
      {
        cwd: options.cwd,
        env: options.env,
        cols: 120,
        rows: 30,
        initialCommand: options.command,
      },
      (data) => {
        // Cache output to the pane's outputBuffer
        const pane = this.panes.get(ptyId);
        if (pane) {
          this.appendToBuffer(pane, data);
        }

        // Forward PTY output to renderer via the existing terminal channel.
        // This enables useXterm attach mode to display output for CCB-created panes.
        if (!this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_DATA, { id: ptyId, data });
        }
      },
      (exitCode, signal) => {
        const pane = this.panes.get(ptyId);
        if (pane) {
          pane.alive = false;
          pane.pid = undefined;
        }

        if (!this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_EXIT, {
            id: ptyId,
            exitCode,
            signal,
          });
        }
      }
    );

    const pid = this.ptyManager.getPid(ptyId) ?? undefined;

    const paneInfo: PaneInfo = {
      pane_id: ptyId,
      ptyId,
      title,
      cwd: options.cwd,
      command: options.command,
      alive: true,
      pid,
      outputBuffer: [],
      outputTail: '',
    };
    this.panes.set(ptyId, paneInfo);

    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.CCB_TERMINAL_OPEN, {
        ptyId,
        cwd: options.cwd,
        title,
      });
    }

    return { pane_id: ptyId, title };
  }

  /**
   * Append PTY output data to the pane's output buffer.
   * Handles streaming input that may be split at arbitrary positions.
   * Buffer size is limited to MAX_BUFFER_LINES.
   */
  private appendToBuffer(pane: PaneInfo, data: string): void {
    if (data.length === 0) return;

    // Normalize newlines across chunk boundaries:
    // - CRLF -> LF
    // - CR   -> LF (avoids stray '\r' in buffer from progress bars, etc.)
    const normalized = (pane.outputTail + data).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const parts = normalized.split('\n');
    // Last element is always the incomplete tail (may be empty string)
    pane.outputTail = parts.pop() ?? '';

    // Limit tail size to prevent memory issues with no-newline output
    if (pane.outputTail.length > MAX_TAIL_CHARS) {
      pane.outputTail = pane.outputTail.slice(-MAX_TAIL_CHARS);
    }

    // Push complete lines to the buffer
    for (const line of parts) {
      pane.outputBuffer.push(line);
    }

    // Enforce buffer size limit
    const excess = pane.outputBuffer.length - MAX_BUFFER_LINES;
    if (excess > 0) {
      pane.outputBuffer.splice(0, excess);
    }
  }

  sendText(paneId: string, text: string, addNewline = false): void {
    if (!this.panes.has(paneId)) {
      throw new Error(`Pane not found: ${paneId}`);
    }

    const payload = addNewline ? `${text}\r` : text;
    this.ptyManager.write(paneId, payload);
  }

  isAlive(paneId: string): { alive: boolean; pid?: number } {
    const pane = this.panes.get(paneId);
    if (!pane) {
      return { alive: false };
    }

    const alive = pane.alive && this.ptyManager.has(paneId);
    if (!alive) {
      pane.alive = false;
      pane.pid = undefined;
      return { alive: false };
    }

    const pid = this.ptyManager.getPid(paneId) ?? undefined;
    pane.pid = pid;
    return { alive: true, pid };
  }

  /**
   * Get the recent output text from a pane.
   * @param paneId - The pane identifier
   * @param lines - Number of lines to retrieve (default: 100)
   * @returns Object containing the text and total line count (including incomplete tail)
   */
  getText(paneId: string, lines = 100): { text: string; total_lines: number } {
    const pane = this.panes.get(paneId);
    if (!pane) {
      throw new Error(`Pane not found: ${paneId}`);
    }

    // Validate and clamp the lines parameter
    const requestedLines = Number.isFinite(lines) ? Math.max(0, Math.floor(lines)) : 0;

    // Include the tail as a line if it's non-empty
    const hasTail = pane.outputTail.length > 0;
    const total_lines = pane.outputBuffer.length + (hasTail ? 1 : 0);

    if (requestedLines === 0 || total_lines === 0) {
      return { text: '', total_lines };
    }

    // Calculate which lines to include
    const start = Math.max(0, total_lines - requestedLines);
    const result: string[] = [];

    // Add complete lines from buffer
    const bufferStart = Math.min(pane.outputBuffer.length, start);
    for (let i = bufferStart; i < pane.outputBuffer.length; i += 1) {
      result.push(pane.outputBuffer[i]);
    }

    // Add the tail if within requested range
    if (hasTail && start <= pane.outputBuffer.length) {
      result.push(pane.outputTail);
    }

    const text = result.join('\n');
    return { text, total_lines };
  }

  list(): PaneInfo[] {
    return Array.from(this.panes.values());
  }

  kill(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) {
      throw new Error(`Pane not found: ${paneId}`);
    }

    this.ptyManager.destroy(paneId);
    pane.alive = false;
    pane.pid = undefined;

    // Ensure renderer tabs can react to explicit kills (no node-pty onExit event).
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_EXIT, { id: paneId, exitCode: -1 });
    }
  }

  cleanup(): void {
    for (const pane of this.panes.values()) {
      if (pane.alive) {
        this.ptyManager.destroy(pane.ptyId);
      }
    }
    this.panes.clear();
  }
}
