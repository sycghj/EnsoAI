export type EnsoRPCMethod = 'create_pane' | 'send_text' | 'is_alive' | 'get_text' | 'list' | 'kill';

export interface EnsoRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: EnsoRPCMethod;
  params: {
    token: string;
    pane_id?: string;
    command?: string;
    cwd?: string;
    text?: string;
    add_newline?: boolean;
    lines?: number;
    title?: string;
    env?: Record<string, string>;
    slot_index?: number;
    slotIndex?: number;
  };
}

export interface EnsoRPCResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface PaneInfo {
  pane_id: string;
  /** Underlying Enso PTY id (e.g. `pty-1`) */
  ptyId: string;
  title: string;
  cwd: string;
  command: string;
  alive: boolean;
  pid?: number;
  /** Slot index for 2x2 layout positioning (0-3) */
  slotIndex?: number;
  /** Cached complete output lines (without trailing newlines). */
  outputBuffer: string[];
  /** Incomplete tail fragment (text after the last newline, not yet a full line). */
  outputTail: string;
}
