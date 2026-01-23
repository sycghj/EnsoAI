import { EventEmitter } from 'node:events';
import type * as net from 'node:net';
import { StringDecoder } from 'node:string_decoder';

const MAX_BUFFER_BYTES = 1024 * 1024; // 1MB

export class NdjsonTransport extends EventEmitter {
  private readonly decoder = new StringDecoder('utf8');
  private buffer = '';
  private closed = false;

  constructor(private readonly socket: net.Socket) {
    super();
    this.bindSocket();
  }

  private bindSocket(): void {
    this.socket.on('data', (data) => this.handleData(data));
    this.socket.on('end', () => this.handleEnd());
    this.socket.on('error', (error) => this.handleSocketError(error));
    this.socket.on('close', () => this.handleClose());
  }

  private handleData(data: Buffer | string): void {
    if (this.closed) return;

    const text = typeof data === 'string' ? data : this.decoder.write(data);
    this.buffer += text;

    if (Buffer.byteLength(this.buffer, 'utf8') > MAX_BUFFER_BYTES) {
      const err = new Error('NDJSON buffer overflow (> 1MB)');
      this.emit('error', err);
      this.close();
      return;
    }

    this.drainLines();
  }

  private handleEnd(): void {
    if (this.closed) return;

    const tail = this.decoder.end();
    if (tail) {
      this.buffer += tail;
    }

    // Socket ended; attempt to parse remaining buffer as a final line (without trailing newline).
    if (this.buffer.trim().length > 0) {
      this.tryEmitMessage(this.buffer);
      this.buffer = '';
    }
  }

  private handleSocketError(error: Error): void {
    if (this.closed) return;
    this.emit('error', error);
  }

  private handleClose(): void {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }

  private drainLines(): void {
    while (!this.closed) {
      const newlineIndex = this.buffer.indexOf('\n');
      if (newlineIndex === -1) break;

      const rawLine = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);

      this.tryEmitMessage(rawLine);

      if (Buffer.byteLength(this.buffer, 'utf8') > MAX_BUFFER_BYTES) {
        const err = new Error('NDJSON buffer overflow (> 1MB)');
        this.emit('error', err);
        this.close();
        return;
      }
    }
  }

  private tryEmitMessage(rawLine: string): void {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line.trim().length === 0) return;

    try {
      const message = JSON.parse(line) as unknown;
      this.emit('message', message);
    } catch (cause: unknown) {
      const error = new Error('NDJSON parse error', { cause });
      this.emit('error', error);
    }
  }

  send(data: unknown): void {
    if (this.closed) {
      throw new Error('Cannot send on closed transport');
    }

    const payload = JSON.stringify(data);
    const line = `${payload}\n`;
    this.socket.write(line, 'utf8');
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;

    try {
      // Close as gracefully as possible; if already half-closed, destroy.
      this.socket.end();
    } catch {
      // Ignore
    }
    try {
      this.socket.destroy();
    } catch {
      // Ignore
    }
  }
}
