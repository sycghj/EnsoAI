import { randomUUID } from 'node:crypto';
import * as net from 'node:net';
import type { BrowserWindow } from 'electron';
import { CCBCore } from './core';
import { RPCProtocol } from './protocol';
import { NdjsonTransport } from './transport';
import type { EnsoRPCMethod, EnsoRPCRequest } from './types';

type ConnectionInfo = { host: string; port: number; token: string };

export class EnsoRPCServer {
  private readonly host = '127.0.0.1';
  private readonly token = randomUUID();
  private readonly server: net.Server;
  private readonly protocol: RPCProtocol;
  private readonly core: CCBCore;
  private readonly transports = new Set<NdjsonTransport>();
  private closed = false;
  private port: number;
  readonly ready: Promise<void>;

  constructor(mainWindow: BrowserWindow, preferredPort: number = 8765) {
    this.port = preferredPort;
    this.protocol = new RPCProtocol(this.token);
    this.core = new CCBCore(mainWindow);

    this.server = net.createServer((socket) => this.handleConnection(socket));
    this.server.on('error', (error) => {
      // Keep error surfaced but avoid crashing due to unhandled 'error'.
      console.error('[CCB][RPC] server error:', error);
    });

    this.ready = this.listenWithFallback(this.port);
  }

  setMainWindow(mainWindow: BrowserWindow): void {
    this.core.setMainWindow(mainWindow);
  }

  private async listenWithFallback(startPort: number): Promise<void> {
    const maxAttempts = 50;

    for (let offset = 0; offset < maxAttempts; offset += 1) {
      if (this.closed) throw new Error('RPC server was closed before listening');

      const port = startPort + offset;
      this.port = port;

      try {
        await this.listenOnce(port);
        console.log(`[CCB][RPC] listening on ${this.host}:${this.port}`);
        return;
      } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        const code = typeof err?.code === 'string' ? err.code : 'UNKNOWN';

        const isRetryable =
          code === 'EADDRINUSE' ||
          code === 'EACCES' ||
          // Windows sometimes returns EADDRNOTAVAIL/EINVAL for excluded ports.
          code === 'EADDRNOTAVAIL' ||
          code === 'EINVAL';

        if (!isRetryable) {
          console.error(`[CCB][RPC] failed to listen on ${this.host}:${port} (${code})`, err);
          throw err instanceof Error ? err : new Error(String(err));
        }

        console.warn(
          `[CCB][RPC] cannot listen on ${this.host}:${port} (${code}); trying ${port + 1}...`
        );
      }
    }

    // Final fallback: pick an OS-assigned ephemeral port to ensure server can start.
    try {
      const ephemeralPort = await this.listenOnce(0);
      this.port = ephemeralPort;
      console.warn(`[CCB][RPC] fell back to ephemeral port ${this.host}:${this.port}`);
      return;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[CCB][RPC] unable to start server after retries:', err);
      throw err;
    }
  }

  private listenOnce(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const onError = (error: unknown) => {
        cleanup();
        reject(error);
      };

      const onListening = () => {
        cleanup();
        const addr = this.server.address();
        if (!addr || typeof addr === 'string') {
          resolve(port);
          return;
        }
        resolve(addr.port);
      };

      const cleanup = () => {
        this.server.off('error', onError);
        this.server.off('listening', onListening);
      };

      this.server.on('error', onError);
      this.server.on('listening', onListening);

      try {
        this.server.listen(port, this.host);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  private handleConnection(socket: net.Socket): void {
    const transport = new NdjsonTransport(socket);
    this.transports.add(transport);

    const cleanup = () => {
      this.transports.delete(transport);
    };

    transport.on('message', async (message: unknown) => {
      await this.handleMessage(transport, message);
    });

    transport.on('error', (error: unknown) => {
      // Parse error or transport-level problems.
      const err = error instanceof Error ? error : new Error(String(error));

      // Best-effort parse error response (JSON-RPC -32700).
      if (err.message.includes('parse')) {
        try {
          transport.send(this.protocol.createErrorResponse(null, -32700, 'Parse error'));
        } catch {
          // Ignore send failures on broken sockets
        }
        return;
      }

      // For other transport errors, emit a generic invalid request then close.
      try {
        transport.send(
          this.protocol.createErrorResponse(null, -32600, 'Invalid Request', { error: err.message })
        );
      } catch {
        // Ignore
      }
    });

    transport.on('close', cleanup);
    socket.on('close', cleanup);
  }

  private async handleMessage(transport: NdjsonTransport, message: unknown): Promise<void> {
    const validationError = this.protocol.validateRequest(message);
    if (validationError) {
      try {
        transport.send(validationError);
      } catch {
        // Ignore send failures
      }
      return;
    }

    const request = message as EnsoRPCRequest;

    try {
      const result = await this.dispatch(request.method, request);
      transport.send(this.protocol.createSuccessResponse(request.id, result));
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      try {
        transport.send(
          this.protocol.createErrorResponse(request.id, -32603, 'Internal error', err.message)
        );
      } catch {
        // Ignore send failures
      }
    }
  }

  private async dispatch(method: EnsoRPCMethod, request: EnsoRPCRequest): Promise<unknown> {
    const params = request.params;

    switch (method) {
      case 'create_pane': {
        const { pane_id, title } = this.core.createPane({
          command: params.command as string,
          cwd: params.cwd as string,
          title: params.title,
          env: params.env,
        });
        return { pane_id, title };
      }

      case 'send_text': {
        this.core.sendText(
          params.pane_id as string,
          params.text as string,
          params.add_newline ?? false
        );
        return { success: true };
      }

      case 'is_alive': {
        return this.core.isAlive(params.pane_id as string);
      }

      case 'get_text': {
        const lines = typeof params.lines === 'number' ? params.lines : 100;
        return this.core.getText(params.pane_id as string, lines);
      }

      case 'list': {
        const panes = this.core.list().map((p) => ({
          pane_id: p.pane_id,
          title: p.title,
          alive: p.alive,
          pid: p.pid,
          cwd: p.cwd,
        }));
        return { panes };
      }

      case 'kill': {
        this.core.kill(params.pane_id as string);
        return { success: true };
      }
    }
  }

  getConnectionInfo(): ConnectionInfo {
    return { host: this.host, port: this.port, token: this.token };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;

    for (const t of this.transports) {
      try {
        t.close();
      } catch {
        // Ignore
      }
    }
    this.transports.clear();

    try {
      this.server.close();
    } catch {
      // Ignore
    }

    this.core.cleanup();
  }
}
