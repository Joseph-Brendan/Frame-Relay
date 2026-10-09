import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_BYTES, type SelectionMessage } from '@frame-relay/schema';
import {
  LiveClient,
  LiveClientOptions,
  LiveConnectionStatus,
  LiveSocketLike,
} from '../src/ui/live/client.js';

const OPEN = 1;
const CLOSED = 3;

class MockSocket implements LiveSocketLike {
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(public readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = CLOSED;
    this.onclose?.({});
  }

  open(): void {
    this.readyState = OPEN;
    this.onopen?.();
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  drop(): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = CLOSED;
    this.onclose?.({});
  }

  sentMessages(): Array<Record<string, unknown>> {
    return this.sent.map((entry) => JSON.parse(entry) as Record<string, unknown>);
  }

  lastSent(): Record<string, unknown> {
    return this.sentMessages()[this.sentMessages().length - 1];
  }
}

function setup(options: Partial<LiveClientOptions> = {}) {
  const sockets: MockSocket[] = [];
  const statuses: LiveConnectionStatus[] = [];
  const tokens: Array<[number, string | null]> = [];

  const client = new LiveClient({
    createSocket: (url) => {
      const socket = new MockSocket(url);
      sockets.push(socket);
      return socket;
    },
    ports: [47321, 47322],
    connectTimeoutMs: 50,
    getFileName: () => 'Relay Test',
    pluginVersion: '9.9.9',
    onStatus: (status) => statuses.push(status),
    onToken: (port, token) => tokens.push([port, token]),
    ...options,
  });

  return { client, sockets, statuses, tokens };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function pairFirstPort(
  client: LiveClient,
  sockets: MockSocket[],
  code = '123456',
): Promise<void> {
  const connecting = client.connect(code);
  await flush();
  sockets[0].open();
  sockets[0].receive({ v: 1, type: 'welcome', serverVersion: '1.0.0', projectName: 'Sample Kit' });
  sockets[0].receive({ v: 1, type: 'paired', sessionToken: 'tok-1' });
  await connecting;
}

describe('LiveClient', () => {
  it('connects on the first port sending hello then pair, and stores the token', async () => {
    const { client, sockets, tokens } = setup();

    await pairFirstPort(client, sockets);

    expect(sockets).toHaveLength(1);
    expect(sockets[0].url).toBe('ws://localhost:47321');
    expect(sockets[0].sentMessages()[0]).toEqual({
      v: 1,
      type: 'hello',
      pluginVersion: '9.9.9',
      fileName: 'Relay Test',
    });
    expect(sockets[0].lastSent()).toEqual({ v: 1, type: 'pair', code: '123456' });
    expect(client.getStatus()).toEqual({
      state: 'connected',
      port: 47321,
      projectName: 'Sample Kit',
    });
    expect(tokens).toContainEqual([47321, 'tok-1']);
  });

  it('moves to the next port after a connection failure', async () => {
    const { client, sockets } = setup();

    const connecting = client.connect('123456');
    await flush();
    sockets[0].drop();
    await flush();

    expect(sockets).toHaveLength(2);
    expect(sockets[1].url).toBe('ws://localhost:47322');

    sockets[1].open();
    sockets[1].receive({ v: 1, type: 'welcome', serverVersion: '1.0.0', projectName: 'Kit' });
    sockets[1].receive({ v: 1, type: 'paired', sessionToken: 'tok-2' });
    await connecting;

    expect(client.getStatus()).toMatchObject({ state: 'connected', port: 47322 });
  });

  it('moves on after BAD_CODE but stops at TOO_MANY_ATTEMPTS', async () => {
    const { client, sockets } = setup();

    const connecting = client.connect('111111');
    await flush();
    sockets[0].open();
    sockets[0].receive({ v: 1, type: 'error', code: 'BAD_CODE', message: 'Not correct. 2 left.' });
    await flush();

    expect(sockets).toHaveLength(2);

    sockets[1].open();
    sockets[1].receive({
      v: 1,
      type: 'error',
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Too many incorrect codes.',
    });
    await connecting;

    const status = client.getStatus();
    expect(status.state).toBe('error');
    if (status.state === 'error') {
      expect(status.message).toBe('Too many incorrect codes.');
      expect(status.code).toBe('TOO_MANY_ATTEMPTS');
    }
    expect(sockets).toHaveLength(2);
  });

  it('stops on a server error such as VERSION_MISMATCH instead of trying more ports', async () => {
    const { client, sockets } = setup();

    const connecting = client.connect('123456');
    await flush();
    sockets[0].open();
    sockets[0].receive({
      v: 1,
      type: 'error',
      code: 'VERSION_MISMATCH',
      message: 'Update the plugin.',
    });
    await connecting;

    const status = client.getStatus();
    expect(status.state).toBe('error');
    if (status.state === 'error') expect(status.message).toBe('Update the plugin.');
    expect(sockets).toHaveLength(1);
  });

  it('resumes a saved token', async () => {
    const { client, sockets, tokens } = setup();
    client.setTokens({ '47322': 'saved-token' });

    const resuming = client.resumeSaved();
    await flush();

    expect(sockets[0].url).toBe('ws://localhost:47322');
    sockets[0].open();
    expect(sockets[0].lastSent()).toEqual({
      v: 1,
      type: 'resume',
      sessionToken: 'saved-token',
    });
    sockets[0].receive({ v: 1, type: 'welcome', serverVersion: '1.0.0', projectName: 'Kit' });
    sockets[0].receive({ v: 1, type: 'resumed' });

    expect(await resuming).toBe(true);
    expect(client.getStatus()).toMatchObject({ state: 'connected', port: 47322 });
    expect(tokens).toHaveLength(0);
  });

  it('clears an invalid token when resume fails', async () => {
    const { client, sockets, tokens } = setup();
    client.setTokens({ '47321': 'stale-token' });

    const resuming = client.resumeSaved();
    await flush();
    sockets[0].open();
    sockets[0].receive({ v: 1, type: 'error', code: 'BAD_TOKEN', message: 'Session is dead.' });

    expect(await resuming).toBe(false);
    expect(tokens).toContainEqual([47321, null]);
    expect(client.getStatus()).toEqual({ state: 'disconnected' });
  });

  it('answers a server ping with pong while connected', async () => {
    const { client, sockets } = setup();
    await pairFirstPort(client, sockets);

    sockets[0].receive({ v: 1, type: 'ping' });
    await flush();

    expect(sockets[0].lastSent()).toEqual({ v: 1, type: 'pong' });
  });

  it('reconnects with backoff 1s, 2s, 4s, 8s then every 30s using the saved token', async () => {
    const delays: number[] = [];
    const handles: Array<{ fn: () => void; cancelled: boolean }> = [];

    const { client, sockets } = setup({
      setTimeoutFn: (fn, ms) => {
        delays.push(ms);
        const handle = { fn, cancelled: false };
        handles.push(handle);
        return handle as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: (handle) => {
        (handle as unknown as { cancelled: boolean }).cancelled = true;
      },
    });

    await pairFirstPort(client, sockets);
    delays.length = 0;

    sockets[0].drop();
    await flush();
    expect(delays).toEqual([1000]);

    for (let i = 0; i < 5; i++) {
      const pending = handles[handles.length - 1];
      pending.fn();
      await flush();
      const newest = sockets[sockets.length - 1];
      newest.drop();
      await flush();
    }

    const backoffDelays = delays.filter((delay) => delay > 100);
    expect(backoffDelays).toEqual([1000, 2000, 4000, 8000, 30000, 30000]);
    expect(client.getStatus().state).toBe('connecting');
  });

  it('reports too_large without sending when a selection exceeds MAX_MESSAGE_BYTES', async () => {
    const { client, sockets } = setup();
    await pairFirstPort(client, sockets);

    const oversized = {
      v: 1,
      type: 'selection',
      meta: {
        nodeId: '1:1',
        name: 'Hero',
        nodeType: 'FRAME',
        fileName: 'Relay Test',
        pageName: 'Page 1',
      },
      kind: 'frame',
      spec: {
        name: 'Hero',
        size: { width: 1, height: 1 },
        childCount: 0,
        componentInstances: [],
        tokenReferences: [],
        rawValues: [],
      },
      image: 'A'.repeat(MAX_MESSAGE_BYTES),
      warnings: [],
    } as SelectionMessage;

    expect(client.sendSelection(oversized)).toBe('too_large');
    expect(sockets[0].sentMessages().some((message) => message.type === 'selection')).toBe(false);
  });

  it('sends a selection while connected', async () => {
    const { client, sockets } = setup();
    await pairFirstPort(client, sockets);

    const selection = {
      v: 1,
      type: 'selection',
      meta: {
        nodeId: '1:1',
        name: 'Hero',
        nodeType: 'FRAME',
        fileName: 'Relay Test',
        pageName: 'Page 1',
      },
      kind: 'frame',
      spec: {
        name: 'Hero',
        size: { width: 10, height: 20 },
        childCount: 1,
        componentInstances: [],
        tokenReferences: [],
        rawValues: [],
      },
      image: null,
      warnings: [],
    } as SelectionMessage;

    expect(client.sendSelection(selection)).toBe('sent');
    expect(sockets[0].lastSent()).toMatchObject({ type: 'selection', kind: 'frame' });
  });

  it('reports not_connected when sending before connecting', () => {
    const { client } = setup();
    const selection = { v: 1, type: 'selection' } as unknown as SelectionMessage;
    expect(client.sendSelection(selection)).toBe('not_connected');
  });

  it('disconnect sends bye, clears the token and closes the socket', async () => {
    const { client, sockets, tokens } = setup();
    await pairFirstPort(client, sockets);

    client.disconnect();

    expect(sockets[0].sentMessages().some((message) => message.type === 'bye')).toBe(true);
    expect(tokens).toContainEqual([47321, null]);
    expect(client.getStatus()).toEqual({ state: 'disconnected' });
    expect(sockets[0].closed).toBe(true);
  });

  it('clears the token and stops reconnecting when the server rejects the session', async () => {
    const { client, sockets, tokens } = setup();
    await pairFirstPort(client, sockets);

    sockets[0].receive({ v: 1, type: 'error', code: 'BAD_TOKEN', message: 'Session expired.' });

    const status = client.getStatus();
    expect(status.state).toBe('error');
    if (status.state === 'error') expect(status.code).toBe('BAD_TOKEN');
    expect(tokens).toContainEqual([47321, null]);
    expect(sockets[0].closed).toBe(true);
  });
});
