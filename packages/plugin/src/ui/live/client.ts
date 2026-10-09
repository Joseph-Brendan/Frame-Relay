import {
  LIVE_PORTS,
  MAX_MESSAGE_BYTES,
  ServerToPluginMessageSchema,
  type LiveErrorCode,
  type SelectionMessage,
  type ServerToPluginMessage,
} from '@frame-relay/schema';

export type LiveConnectionStatus =
  | { state: 'disconnected' }
  | { state: 'connecting'; port: number | null }
  | { state: 'connected'; port: number; projectName: string }
  | { state: 'error'; message: string; code?: LiveErrorCode };

export interface LiveSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

type TimerHandle = ReturnType<typeof setTimeout>;

export interface LiveClientOptions {
  createSocket?: (url: string) => LiveSocketLike;
  ports?: readonly number[];
  connectTimeoutMs?: number;
  reconnectDelaysMs?: readonly number[];
  setTimeoutFn?: (handler: () => void, ms: number) => TimerHandle;
  clearTimeoutFn?: (handle: TimerHandle) => void;
  getFileName?: () => string;
  pluginVersion?: string;
  onStatus?: (status: LiveConnectionStatus) => void;
  onToken?: (port: number, token: string | null) => void;
  onServerError?: (code: LiveErrorCode, message: string) => void;
}

const DEFAULT_RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 30000];
const SOCKET_OPEN = 1;

type PortResult =
  'paired' | 'resumed' | 'failed' | 'bad_code' | 'too_many_attempts' | 'bad_token' | 'server_error';

interface PortOutcome {
  result: PortResult;
  socket?: LiveSocketLike;
  port?: number;
  projectName?: string;
  token?: string;
  message?: string;
  code?: LiveErrorCode;
}

const ERROR_RESULT_MAP: Record<LiveErrorCode, PortResult> = {
  BAD_CODE: 'bad_code',
  TOO_MANY_ATTEMPTS: 'too_many_attempts',
  BAD_TOKEN: 'bad_token',
  CODE_EXPIRED: 'server_error',
  VERSION_MISMATCH: 'server_error',
  MESSAGE_TOO_LARGE: 'server_error',
  BAD_MESSAGE: 'server_error',
};

function parseServerMessage(data: unknown): ServerToPluginMessage | null {
  if (typeof data !== 'string') return null;
  try {
    const parsed = ServerToPluginMessageSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function bytesToBase64(bytes: number[]): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function defaultCreateSocket(url: string): LiveSocketLike {
  return new WebSocket(url) as unknown as LiveSocketLike;
}

/**
 * Browser-side live mode client. Only the UI iframe ever creates a WebSocket.
 *
 * Connect tries each live port in order; reconnect (after a drop) resumes the saved token with
 * backoff 1s, 2s, 4s, 8s, then every 30s.
 */
export class LiveClient {
  private readonly createSocket: (url: string) => LiveSocketLike;
  private readonly ports: readonly number[];
  private readonly connectTimeoutMs: number;
  private readonly reconnectDelaysMs: readonly number[];
  private readonly setTimeoutFn: (handler: () => void, ms: number) => TimerHandle;
  private readonly clearTimeoutFn: (handle: TimerHandle) => void;
  private readonly getFileName: () => string;
  private readonly pluginVersion: string;
  private readonly onStatus?: (status: LiveConnectionStatus) => void;
  private readonly onToken?: (port: number, token: string | null) => void;
  private readonly onServerError?: (code: LiveErrorCode, message: string) => void;

  private socket: LiveSocketLike | null = null;
  private port: number | null = null;
  private projectName = '';
  private status: LiveConnectionStatus = { state: 'disconnected' };
  private tokens: Record<number, string> = {};
  private reconnectAttempt = 0;
  private reconnectTimer: TimerHandle | null = null;
  private manualClose = false;
  private destroyed = false;
  private generation = 0;

  constructor(options: LiveClientOptions = {}) {
    this.createSocket = options.createSocket ?? defaultCreateSocket;
    this.ports = options.ports ?? LIVE_PORTS;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 4000;
    this.reconnectDelaysMs = options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS;
    this.setTimeoutFn =
      options.setTimeoutFn ?? ((handler, ms) => setTimeout(handler, ms) as unknown as TimerHandle);
    this.clearTimeoutFn =
      options.clearTimeoutFn ??
      ((handle) => clearTimeout(handle as unknown as Parameters<typeof clearTimeout>[0]));
    this.getFileName = options.getFileName ?? (() => 'Figma');
    this.pluginVersion = options.pluginVersion ?? '0.0.0';
    this.onStatus = options.onStatus;
    this.onToken = options.onToken;
    this.onServerError = options.onServerError;
  }

  public getStatus(): LiveConnectionStatus {
    return this.status;
  }

  public setTokens(tokens: Record<string, string>): void {
    this.tokens = {};
    for (const [port, token] of Object.entries(tokens)) {
      const numericPort = Number(port);
      if (Number.isFinite(numericPort) && token) {
        this.tokens[numericPort] = token;
      }
    }
  }

  /** Tries each port with hello + pair. Stops early on TOO_MANY_ATTEMPTS or a server error. */
  public async connect(code: string): Promise<void> {
    if (this.destroyed) return;
    this.manualClose = false;
    this.cancelReconnect();
    this.closeSocket();
    this.reconnectAttempt = 0;

    const generation = ++this.generation;
    for (const port of this.ports) {
      if (generation !== this.generation) return;
      this.setStatus({ state: 'connecting', port });

      const outcome = await this.tryPort(port, { type: 'pair', code });
      if (generation !== this.generation) return;

      if (outcome.result === 'paired') {
        this.adopt(outcome);
        return;
      }
      if (outcome.result === 'too_many_attempts' || outcome.result === 'server_error') {
        this.setStatus({
          state: 'error',
          message:
            outcome.message ??
            `Frame-Relay rejected the connection on port ${port}. Check the pairing code and try again.`,
          code: outcome.code,
        });
        return;
      }
      // Connection failure and BAD_CODE move on to the next port.
    }

    if (generation !== this.generation) return;
    this.setStatus({
      state: 'error',
      message: `Could not reach Frame-Relay on ports ${this.ports.join(', ')}. Ask your agent to call start_live, then try again.`,
    });
  }

  /** Tries saved tokens on each port. Returns true when a session was resumed. */
  public async resumeSaved(): Promise<boolean> {
    if (this.destroyed || this.socket) return false;
    const portsWithTokens = this.ports.filter((port) => this.tokens[port]);
    if (portsWithTokens.length === 0) return false;

    this.manualClose = false;
    const generation = ++this.generation;

    for (const port of portsWithTokens) {
      if (generation !== this.generation) return false;
      this.setStatus({ state: 'connecting', port });

      const outcome = await this.tryPort(port, { type: 'resume', token: this.tokens[port] });
      if (generation !== this.generation) return false;

      if (outcome.result === 'resumed') {
        this.adopt(outcome);
        return true;
      }
      if (outcome.result === 'bad_token') {
        this.setToken(port, null);
      }
    }

    this.setStatus({ state: 'disconnected' });
    return false;
  }

  /** Sends bye, clears the token for the connected port and disconnects. */
  public disconnect(): void {
    this.manualClose = true;
    this.cancelReconnect();
    this.generation += 1;

    if (this.socket && this.status.state === 'connected') {
      this.rawSend(this.socket, { v: 1, type: 'bye' });
    }
    const port = this.port;
    this.closeSocket();
    if (port !== null) this.setToken(port, null);
    this.setStatus({ state: 'disconnected' });
  }

  public sendSelection(message: SelectionMessage): 'sent' | 'too_large' | 'not_connected' {
    if (!this.socket || this.status.state !== 'connected') return 'not_connected';
    const text = JSON.stringify(message);
    if (new TextEncoder().encode(text).length > MAX_MESSAGE_BYTES) return 'too_large';
    return this.rawSend(this.socket, message) ? 'sent' : 'not_connected';
  }

  /** Stops every timer and closes the socket without sending bye. */
  public destroy(): void {
    this.destroyed = true;
    this.manualClose = true;
    this.cancelReconnect();
    this.closeSocket();
  }

  private adopt(outcome: PortOutcome): void {
    const socket = outcome.socket;
    if (!socket || outcome.port === undefined) {
      this.setStatus({ state: 'error', message: 'Frame-Relay did not complete the handshake.' });
      return;
    }

    this.closeSocket();
    this.socket = socket;
    this.port = outcome.port;
    this.projectName = outcome.projectName ?? '';
    this.reconnectAttempt = 0;

    if (outcome.token) this.setToken(outcome.port, outcome.token);

    socket.onmessage = (event) => this.handleConnectedMessage(event);
    socket.onclose = () => this.handleDrop();
    socket.onerror = () => {};

    this.setStatus({ state: 'connected', port: this.port, projectName: this.projectName });

    if (socket.readyState !== SOCKET_OPEN) {
      this.handleDrop();
    }
  }

  private handleConnectedMessage(event: { data: unknown }): void {
    const message = parseServerMessage(event.data);
    if (!message) return;

    if (message.type === 'ping') {
      if (this.socket) this.rawSend(this.socket, { v: 1, type: 'pong' });
      return;
    }

    if (message.type === 'error') {
      if (message.code === 'BAD_TOKEN') {
        const port = this.port;
        this.manualClose = true;
        this.cancelReconnect();
        this.closeSocket();
        if (port !== null) this.setToken(port, null);
        this.setStatus({ state: 'error', code: message.code, message: message.message });
        return;
      }
      this.onServerError?.(message.code, message.message);
    }
  }

  private handleDrop(): void {
    this.socket = null;
    const port = this.port;
    if (this.destroyed) return;

    if (this.manualClose) {
      this.setStatus({ state: 'disconnected' });
      return;
    }

    this.setStatus({ state: 'connecting', port });
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay =
      this.reconnectDelaysMs[Math.min(this.reconnectAttempt, this.reconnectDelaysMs.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null;
      void this.reconnectOnce();
    }, delay);
  }

  private async reconnectOnce(): Promise<void> {
    if (this.destroyed || this.manualClose || this.socket) return;
    const generation = ++this.generation;

    for (const port of this.ports) {
      const token = this.tokens[port];
      if (!token) continue;
      if (generation !== this.generation) return;

      const outcome = await this.tryPort(port, { type: 'resume', token });
      if (generation !== this.generation) return;

      if (outcome.result === 'resumed') {
        this.adopt(outcome);
        return;
      }
      if (outcome.result === 'bad_token') {
        this.setToken(port, null);
      }
    }

    if (generation !== this.generation) return;
    this.scheduleReconnect();
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      this.clearTimeoutFn(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private closeSocket(): void {
    const socket = this.socket;
    if (!socket) return;
    this.socket = null;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    try {
      socket.close();
    } catch {
      // ignore
    }
  }

  private setToken(port: number, token: string | null): void {
    if (token) {
      this.tokens[port] = token;
    } else {
      delete this.tokens[port];
    }
    this.onToken?.(port, token);
  }

  private tryPort(
    port: number,
    auth: { type: 'pair'; code: string } | { type: 'resume'; token: string },
  ): Promise<PortOutcome> {
    return new Promise((resolve) => {
      let settled = false;
      let socket: LiveSocketLike;
      let projectName = '';

      try {
        socket = this.createSocket(`ws://localhost:${port}`);
      } catch {
        resolve({ result: 'failed' });
        return;
      }

      let timer: TimerHandle | null = null;

      const finish = (outcome: PortOutcome) => {
        if (settled) return;
        settled = true;
        if (timer) this.clearTimeoutFn(timer);
        if (outcome.result !== 'paired' && outcome.result !== 'resumed') {
          try {
            socket.close();
          } catch {
            // ignore
          }
        }
        resolve(outcome);
      };

      timer = this.setTimeoutFn(() => finish({ result: 'failed' }), this.connectTimeoutMs);

      socket.onopen = () => {
        this.rawSend(socket, {
          v: 1,
          type: 'hello',
          pluginVersion: this.pluginVersion,
          fileName: this.getFileName(),
        });
        if (auth.type === 'pair') {
          this.rawSend(socket, { v: 1, type: 'pair', code: auth.code });
        } else {
          this.rawSend(socket, { v: 1, type: 'resume', sessionToken: auth.token });
        }
      };

      socket.onmessage = (event) => {
        const message = parseServerMessage(event.data);
        if (!message) return;

        if (message.type === 'welcome') {
          projectName = message.projectName;
          return;
        }
        if (message.type === 'ping') {
          this.rawSend(socket, { v: 1, type: 'pong' });
          return;
        }
        if (message.type === 'paired') {
          finish({ result: 'paired', socket, port, projectName, token: message.sessionToken });
          return;
        }
        if (message.type === 'resumed') {
          finish({ result: 'resumed', socket, port, projectName });
          return;
        }
        if (message.type === 'error') {
          finish({
            result: ERROR_RESULT_MAP[message.code],
            message: message.message,
            code: message.code,
          });
        }
      };

      socket.onclose = () => finish({ result: 'failed' });
      socket.onerror = () => finish({ result: 'failed' });
    });
  }

  private rawSend(socket: LiveSocketLike, message: unknown): boolean {
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  private setStatus(status: LiveConnectionStatus): void {
    this.status = status;
    this.onStatus?.(status);
  }
}
