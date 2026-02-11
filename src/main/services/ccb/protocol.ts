import type { EnsoRPCMethod, EnsoRPCResponse } from './types';

const METHODS: ReadonlySet<EnsoRPCMethod> = new Set([
  'create_pane',
  'send_text',
  'is_alive',
  'get_text',
  'list',
  'kill',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  for (const v of Object.values(value)) {
    if (typeof v !== 'string') return false;
  }
  return true;
}

function isValidId(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

export class RPCProtocol {
  constructor(private readonly token: string) {}

  validateRequest(request: unknown): EnsoRPCResponse | null {
    if (!isRecord(request)) {
      return this.createErrorResponse(null, -32600, 'Invalid Request');
    }

    if (!isValidId(request.id)) {
      return this.createErrorResponse(null, -32600, 'Invalid Request', {
        reason: 'id must be a string or number',
      });
    }
    const id = request.id;

    if (request.jsonrpc !== '2.0') {
      return this.createErrorResponse(id, -32600, 'Invalid Request', {
        reason: 'jsonrpc must be "2.0"',
      });
    }

    if (typeof request.method !== 'string') {
      return this.createErrorResponse(id, -32600, 'Invalid Request', {
        reason: 'method must be a string',
      });
    }

    const method = request.method as string;
    if (!METHODS.has(method as EnsoRPCMethod)) {
      return this.createErrorResponse(id, -32601, 'Method not found');
    }

    if (!isRecord(request.params)) {
      return this.createErrorResponse(id, -32602, 'Invalid params', {
        reason: 'params must be an object',
      });
    }

    const params = request.params;
    if (typeof params.token !== 'string' || params.token.trim().length === 0) {
      return this.createErrorResponse(id, -32602, 'Invalid params', {
        reason: 'token is required',
      });
    }

    if (params.token !== this.token) {
      return this.createErrorResponse(id, -32001, 'Invalid token');
    }

    // Method-specific param validation
    switch (method as EnsoRPCMethod) {
      case 'create_pane': {
        if (typeof params.command !== 'string' || params.command.trim().length === 0) {
          return this.createErrorResponse(id, -32602, 'Invalid params', {
            reason: 'command is required',
          });
        }
        if (typeof params.cwd !== 'string' || params.cwd.trim().length === 0) {
          return this.createErrorResponse(id, -32602, 'Invalid params', {
            reason: 'cwd is required',
          });
        }
        if (params.title !== undefined && typeof params.title !== 'string') {
          return this.createErrorResponse(id, -32602, 'Invalid params', {
            reason: 'title must be a string',
          });
        }
        if (params.env !== undefined && !isStringRecord(params.env)) {
          return this.createErrorResponse(id, -32602, 'Invalid params', {
            reason: 'env must be a record of strings',
          });
        }
        // Validate slot_index if provided (supports both slot_index and slotIndex)
        const slotIndex =
          (params as Record<string, unknown>).slot_index ??
          (params as Record<string, unknown>).slotIndex;
        if (
          slotIndex !== undefined &&
          !(
            typeof slotIndex === 'number' &&
            Number.isFinite(slotIndex) &&
            Number.isInteger(slotIndex) &&
            slotIndex >= 0 &&
            slotIndex <= 2
          )
        ) {
          return this.createErrorResponse(id, -32602, 'Invalid params', {
            reason: 'slot_index must be an integer between 0 and 2',
          });
        }
        return null;
      }

      case 'send_text': {
        if (typeof params.pane_id !== 'string' || params.pane_id.trim().length === 0) {
          return this.createErrorResponse(id, -32602, 'Invalid params', {
            reason: 'pane_id is required',
          });
        }
        if (typeof params.text !== 'string') {
          return this.createErrorResponse(id, -32602, 'Invalid params', {
            reason: 'text is required',
          });
        }
        if (params.add_newline !== undefined && typeof params.add_newline !== 'boolean') {
          return this.createErrorResponse(id, -32602, 'Invalid params', {
            reason: 'add_newline must be a boolean',
          });
        }
        if (
          params.newline_delay_ms !== undefined &&
          !(
            typeof params.newline_delay_ms === 'number' &&
            Number.isFinite(params.newline_delay_ms) &&
            Number.isInteger(params.newline_delay_ms) &&
            params.newline_delay_ms >= 0 &&
            params.newline_delay_ms <= 2000
          )
        ) {
          return this.createErrorResponse(id, -32602, 'Invalid params', {
            reason: 'newline_delay_ms must be an integer between 0 and 2000',
          });
        }
        return null;
      }

      case 'is_alive':
      case 'get_text':
      case 'kill': {
        if (typeof params.pane_id !== 'string' || params.pane_id.trim().length === 0) {
          return this.createErrorResponse(id, -32602, 'Invalid params', {
            reason: 'pane_id is required',
          });
        }
        if (method === 'get_text') {
          if (
            params.lines !== undefined &&
            !(typeof params.lines === 'number' && params.lines > 0)
          ) {
            return this.createErrorResponse(id, -32602, 'Invalid params', {
              reason: 'lines must be a positive number',
            });
          }
        }
        return null;
      }

      case 'list': {
        return null;
      }
    }
  }

  createSuccessResponse(id: string | number, result: unknown): EnsoRPCResponse {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  createErrorResponse(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown
  ): EnsoRPCResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        ...(data === undefined ? {} : { data }),
      },
    };
  }
}
