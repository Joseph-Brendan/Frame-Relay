import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import {
  LIVE_PORTS,
  LIVE_PROTOCOL_VERSION,
  MAX_MESSAGE_BYTES,
  PluginToServerMessageSchema,
  type LiveErrorCode,
  type PluginToServerMessage,
  type SelectionMessage,
  type ServerToPluginMessage,
} from '@frame-relay/schema';
import { logger } from '../mcp/logger.js';
import { deleteLiveJson, writeLiveJson, type LiveJsonState } from './state.js';

export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_PAIR_ATTEMPTS = 3;
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const HEARTBEAT_TIMEOUT_MS = 30_000;

/** ws refuses frames above this; messages between MAX_MESSAGE_BYTES and this get a clean error. */
export const MAX_PAYLOAD_BYTES = MAX_MESSAGE_BYTES * 2;

export interface LiveSelectionRecord {
  kind: 'component' | 'frame';
  name: string;
  nodeType: string;
  receivedAt: string;
  message: SelectionMessage;
}

export interface LiveBridgeStatus {
  running: boolean;
  port: number | null;
  code: string | null;
  codeExpiresAt: string | null;
  paired: boolean;
  fileName: string | null;
  startedAt: string | null;
  lastSelection: {
    name: string;
    kind: 'component' | 'frame';
    receivedAt: string;
    ageMs: number;
  } | null;
}

export interface LiveBridgeOptions {
  root: string;
  projectName?: string;
  serverVersion?: string;
  ports?: readonly number[];
  codeTtlMs?: number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
}

interface ClientState {
  lastSeen: number;
  fileName: string | null;
  paired: boolean;
}

export function formatAge(ms: number): string {
  if (ms < 1000) return 'just now';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isAllowedOrigin(origin?: string): boolean {
  return !origin || origin === 'null';
}

/**
 * Localhost WebSocket bridge between the Figma plugin UI and the MCP server.
 *
 * Only one Figma plugin is paired at a time. The latest selection is held in memory and is
 * never written to disk; `.frame-relay/live.json` holds pairing state only.
 */
export class LiveBridge {
  public readonly root: string;
  public readonly projectName: string;
  public readonly serverVersion: string;

  private readonly ports: readonly number[];
  private readonly codeTtlMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly sessionTtlMs: number;

  private wss: WebSocketServer | null = null;
  private port: number | null = null;
  private code: string | null = null;
  private codeExpiresAt: number | null = null;
  private pairAttempts = 0;
  private sessionToken: string | null = null;
  private sessionExpiresAt: number | null = null;
  private sessionFileName: string | null = null;
  private startedAt: number | null = null;
  private lastSelection: LiveSelectionRecord | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private exitHandler: (() => void) | null = null;

  private readonly clients = new Map<WebSocket, ClientState>();

  constructor(options: LiveBridgeOptions) {
    this.root = resolve(options.root);
    this.projectName = options.projectName || 'Frame-Relay project';
    this.serverVersion = options.serverVersion || '0.0.0';
    this.ports = options.ports ?? LIVE_PORTS;
    this.codeTtlMs = options.codeTtlMs ?? PAIRING_CODE_TTL_MS;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? HEARTBEAT_TIMEOUT_MS;
    this.sessionTtlMs = SESSION_TTL_MS;
  }

  public isRunning(): boolean {
    return this.wss !== null;
  }

  public getSelectionRecord(): LiveSelectionRecord | null {
    return this.lastSelection;
  }

  public getStatus(): LiveBridgeStatus {
    // Keep the pairing code fresh: an expired code is replaced the moment anyone reads status,
    // so agents can always show the user a code that still works.
    if (
      this.wss &&
      !this.hasLiveSession() &&
      this.codeExpiresAt !== null &&
      Date.now() > this.codeExpiresAt
    ) {
      this.rotateCode();
      this.writeStateFile();
    }

    const now = Date.now();
    const paired = this.hasLiveSession();
    return {
      running: this.isRunning(),
      port: this.port,
      code: this.code,
      codeExpiresAt: this.codeExpiresAt ? new Date(this.codeExpiresAt).toISOString() : null,
      paired,
      fileName: paired ? this.sessionFileName : null,
      startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
      lastSelection: this.lastSelection
        ? {
            name: this.lastSelection.name,
            kind: this.lastSelection.kind,
            receivedAt: this.lastSelection.receivedAt,
            ageMs: Math.max(0, now - Date.parse(this.lastSelection.receivedAt)),
          }
        : null,
    };
  }

  /** Tries each configured port in order and binds the first free one on 127.0.0.1. */
  public async start(): Promise<LiveBridgeStatus> {
    if (this.wss) return this.getStatus();

    let lastError: unknown = null;
    for (const port of this.ports) {
      try {
        const wss = await this.listenOn(port);
        this.wss = wss;
        this.port = port;
        this.startedAt = Date.now();
        this.lastSelection = null;
        this.pairAttempts = 0;
        this.clearSession();
        this.rotateCode();
        this.startHeartbeat();
        this.registerExitHandler();
        this.writeStateFile();
        logger.log(
          `Live bridge listening on 127.0.0.1:${port}. Pairing code: ${this.code ?? '(none)'}`,
        );
        return this.getStatus();
      } catch (err) {
        lastError = err;
      }
    }

    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `Could not start live mode: ports ${this.ports.join(', ')} are all in use. ` +
        `Close the program using them (another live session or an old MCP server) and try again. ` +
        `Last error: ${detail}`,
    );
  }

  /** Closes the bridge, drops every connection and removes .frame-relay/live.json. */
  public async stop(): Promise<void> {
    const wasRunning = this.wss !== null;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    const wss = this.wss;
    this.wss = null;

    if (wss) {
      for (const ws of this.clients.keys()) {
        try {
          ws.terminate();
        } catch {
          // ignore
        }
      }
      this.clients.clear();
      await new Promise<void>((resolveClose) => wss.close(() => resolveClose()));
    }

    this.port = null;
    this.code = null;
    this.codeExpiresAt = null;
    this.pairAttempts = 0;
    this.startedAt = null;
    this.lastSelection = null;
    this.clearSession();
    this.unregisterExitHandler();

    if (wasRunning) {
      deleteLiveJson(this.root);
      logger.log('Live bridge stopped.');
    }
  }

  private listenOn(port: number): Promise<WebSocketServer> {
    return new Promise((resolveListen, rejectListen) => {
      const wss = new WebSocketServer({
        host: '127.0.0.1',
        port,
        maxPayload: MAX_PAYLOAD_BYTES,
        verifyClient: (info: { origin: string }) => isAllowedOrigin(info.origin),
      });

      const onError = (err: Error) => {
        wss.removeListener('listening', onListening);
        try {
          wss.close();
        } catch {
          // ignore
        }
        rejectListen(err);
      };

      const onListening = () => {
        wss.removeListener('error', onError);
        resolveListen(wss);
      };

      wss.once('error', onError);
      wss.once('listening', onListening);
      wss.on('connection', (ws) => this.handleConnection(ws));
    });
  }

  private handleConnection(ws: WebSocket): void {
    this.clients.set(ws, { lastSeen: Date.now(), fileName: null, paired: false });

    ws.on('message', (data, isBinary) => this.handleMessage(ws, data, isBinary));
    ws.on('close', () => {
      this.clients.delete(ws);
    });
    ws.on('error', () => {
      this.clients.delete(ws);
    });
  }

  private handleMessage(ws: WebSocket, data: RawData, isBinary: boolean): void {
    const state = this.clients.get(ws);
    if (!state) return;
    state.lastSeen = Date.now();

    if (isBinary) {
      this.sendError(
        ws,
        'BAD_MESSAGE',
        'Binary frames are not supported. Send live protocol messages as JSON text.',
      );
      return;
    }

    let buffer: Buffer;
    if (Buffer.isBuffer(data)) buffer = data;
    else if (Array.isArray(data)) buffer = Buffer.concat(data);
    else buffer = Buffer.from(data);

    if (buffer.byteLength > MAX_MESSAGE_BYTES) {
      this.sendError(
        ws,
        'MESSAGE_TOO_LARGE',
        `Message is ${buffer.byteLength} bytes, over the ${MAX_MESSAGE_BYTES} byte limit. Share a smaller selection, or select a child layer instead of a large frame.`,
      );
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(buffer.toString('utf8'));
    } catch {
      this.sendError(ws, 'BAD_MESSAGE', 'Message is not valid JSON. Send live protocol v1 JSON.');
      return;
    }

    if (
      typeof raw === 'object' &&
      raw !== null &&
      'v' in raw &&
      (raw as { v: unknown }).v !== LIVE_PROTOCOL_VERSION
    ) {
      this.sendError(
        ws,
        'VERSION_MISMATCH',
        `Live protocol version ${LIVE_PROTOCOL_VERSION} is required. Update the Frame-Relay plugin, then reconnect.`,
      );
      return;
    }

    const parsed = PluginToServerMessageSchema.safeParse(raw);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const detail = firstIssue
        ? `${firstIssue.path.join('.') || 'message'}: ${firstIssue.message}`
        : 'unknown shape';
      this.sendError(
        ws,
        'BAD_MESSAGE',
        `Message did not match live protocol v1 (${detail}). Update the Frame-Relay plugin, then reconnect.`,
      );
      return;
    }

    this.handleParsedMessage(ws, state, parsed.data);
  }

  private handleParsedMessage(
    ws: WebSocket,
    state: ClientState,
    message: PluginToServerMessage,
  ): void {
    switch (message.type) {
      case 'hello': {
        state.fileName = message.fileName;
        this.send(ws, {
          v: LIVE_PROTOCOL_VERSION,
          type: 'welcome',
          serverVersion: this.serverVersion,
          projectName: this.projectName,
        });
        break;
      }
      case 'pair':
        this.handlePair(ws, state, message.code);
        break;
      case 'resume':
        this.handleResume(ws, state, message.sessionToken);
        break;
      case 'selection':
        this.handleSelection(ws, state, message);
        break;
      case 'pong':
        break;
      case 'bye':
        state.paired = false;
        this.clearSession();
        this.writeStateFile();
        logger.log('Plugin disconnected from live mode (bye).');
        break;
    }
  }

  private handlePair(ws: WebSocket, state: ClientState, code: string): void {
    if (!this.code || !this.codeExpiresAt || Date.now() > this.codeExpiresAt) {
      this.rotateCode();
      this.writeStateFile();
      this.sendError(
        ws,
        'CODE_EXPIRED',
        `The pairing code expired. A new code was generated: ${this.code}. Show it to the user and ask them to enter it.`,
      );
      return;
    }

    if (!this.matchesCode(code)) {
      this.pairAttempts += 1;
      if (this.pairAttempts >= MAX_PAIR_ATTEMPTS) {
        this.rotateCode();
        this.writeStateFile();
        this.sendError(
          ws,
          'TOO_MANY_ATTEMPTS',
          `Too many incorrect codes. A new code was generated: ${this.code}. Show it to the user and ask them to connect again.`,
        );
      } else {
        const remaining = MAX_PAIR_ATTEMPTS - this.pairAttempts;
        this.sendError(
          ws,
          'BAD_CODE',
          `That pairing code is not correct. ${remaining} attempt${remaining === 1 ? '' : 's'} left before a new code is generated.`,
        );
      }
      return;
    }

    this.pairAttempts = 0;
    this.sessionToken = randomBytes(32).toString('hex');
    this.sessionExpiresAt = Date.now() + this.sessionTtlMs;
    this.sessionFileName = state.fileName;
    state.paired = true;

    this.replaceOtherPairings(ws);

    this.send(ws, { v: LIVE_PROTOCOL_VERSION, type: 'paired', sessionToken: this.sessionToken });
    this.writeStateFile();
    logger.log(
      `Plugin paired on port ${this.port ?? '(unknown)'} (file: ${state.fileName ?? 'unknown'}).`,
    );
  }

  private handleResume(ws: WebSocket, state: ClientState, token: string): void {
    if (!this.hasLiveSession() || !this.matchesToken(token)) {
      this.sendError(
        ws,
        'BAD_TOKEN',
        'The saved session is no longer valid. Call start_live for a fresh pairing code and connect again.',
      );
      return;
    }

    state.paired = true;
    state.fileName = this.sessionFileName;
    this.replaceOtherPairings(ws);
    this.send(ws, { v: LIVE_PROTOCOL_VERSION, type: 'resumed' });
    this.writeStateFile();
    logger.log('Plugin resumed its live session.');
  }

  private handleSelection(ws: WebSocket, state: ClientState, message: SelectionMessage): void {
    if (!state.paired || !this.hasLiveSession()) {
      this.sendError(
        ws,
        'BAD_TOKEN',
        'This connection is not paired. Pair with the current code from start_live, then share the selection again.',
      );
      return;
    }

    this.lastSelection = {
      kind: message.kind,
      name: message.meta.name,
      nodeType: message.meta.nodeType,
      receivedAt: new Date().toISOString(),
      message,
    };
    logger.log(
      `Received live selection "${message.meta.name}" (${message.kind}) from ${message.meta.fileName}.`,
    );
  }

  private replaceOtherPairings(keep: WebSocket): void {
    for (const [client, state] of this.clients) {
      if (client !== keep && state.paired) {
        state.paired = false;
        logger.log('New pairing replaced the previous plugin connection.');
        try {
          client.close(1000, 'Replaced by a new pairing');
        } catch {
          // ignore
        }
      }
    }
  }

  private hasLiveSession(): boolean {
    return (
      this.sessionToken !== null &&
      this.sessionExpiresAt !== null &&
      Date.now() < this.sessionExpiresAt
    );
  }

  private matchesCode(code: string): boolean {
    return this.safeEqual(code, this.code);
  }

  private matchesToken(token: string): boolean {
    return this.safeEqual(token, this.sessionToken);
  }

  private safeEqual(input: string, expected: string | null): boolean {
    if (!expected) return false;
    const a = Buffer.from(input, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private rotateCode(): void {
    this.code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    this.codeExpiresAt = Date.now() + this.codeTtlMs;
    this.pairAttempts = 0;
  }

  private clearSession(): void {
    this.sessionToken = null;
    this.sessionExpiresAt = null;
    this.sessionFileName = null;
    for (const state of this.clients.values()) {
      state.paired = false;
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const [ws, state] of this.clients) {
        if (now - state.lastSeen > this.heartbeatTimeoutMs) {
          logger.warn(
            `Dropping live plugin connection after ${Math.round(this.heartbeatTimeoutMs / 1000)}s of silence. The plugin will reconnect with its saved token.`,
          );
          this.clients.delete(ws);
          try {
            ws.terminate();
          } catch {
            // ignore
          }
          continue;
        }
        this.send(ws, { v: LIVE_PROTOCOL_VERSION, type: 'ping' });
      }
    }, this.heartbeatIntervalMs);

    if (typeof this.heartbeatTimer.unref === 'function') {
      this.heartbeatTimer.unref();
    }
  }

  private registerExitHandler(): void {
    if (this.exitHandler) return;
    this.exitHandler = () => {
      try {
        deleteLiveJson(this.root);
      } catch {
        // ignore
      }
    };
    process.on('exit', this.exitHandler);
  }

  private unregisterExitHandler(): void {
    if (!this.exitHandler) return;
    process.off('exit', this.exitHandler);
    this.exitHandler = null;
  }

  private writeStateFile(): void {
    if (!this.wss || this.port === null) return;
    const state: LiveJsonState = {
      port: this.port,
      code: this.code ?? '',
      codeExpiresAt: this.codeExpiresAt ? new Date(this.codeExpiresAt).toISOString() : '',
      paired: this.hasLiveSession(),
      startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : new Date().toISOString(),
    };
    try {
      writeLiveJson(this.root, state);
    } catch (err) {
      logger.warn(
        `Could not write .frame-relay/live.json: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private send(ws: WebSocket, message: ServerToPluginMessage): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(message));
  }

  private sendError(ws: WebSocket, code: LiveErrorCode, message: string): void {
    this.send(ws, { v: LIVE_PROTOCOL_VERSION, type: 'error', code, message });
  }
}
