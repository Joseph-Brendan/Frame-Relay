import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { MAX_MESSAGE_BYTES } from '@josephbrendan/schema';
import { LiveBridge, readLiveJson } from '../src/index.js';

type WireMessage = Record<string, unknown>;

class TestPlugin {
  readonly ws: WebSocket;
  private queue: WireMessage[] = [];
  private waiters: Array<{
    predicate: (message: WireMessage) => boolean;
    resolve: (message: WireMessage) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(port: number, origin?: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}`, origin ? { origin } : undefined);
    this.ws.on('message', (data) => {
      const message = JSON.parse(data.toString()) as WireMessage;
      this.queue.push(message);
      this.flush();
    });
  }

  private flush(): void {
    for (let i = 0; i < this.waiters.length; i++) {
      const waiter = this.waiters[i];
      const index = this.queue.findIndex(waiter.predicate);
      if (index !== -1) {
        const [message] = this.queue.splice(index, 1);
        this.waiters.splice(i, 1);
        i -= 1;
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    }
  }

  open(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', (err) => reject(err));
    });
  }

  next(
    predicate: (message: WireMessage) => boolean = () => true,
    timeoutMs = 3000,
  ): Promise<WireMessage> {
    const existing = this.queue.findIndex(predicate);
    if (existing !== -1) {
      return Promise.resolve(this.queue.splice(existing, 1)[0]);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out waiting for a live message')),
        timeoutMs,
      );
      this.waiters.push({ predicate, resolve, reject, timer });
    });
  }

  send(message: unknown): void {
    this.ws.send(JSON.stringify(message));
  }

  sendRaw(data: string): void {
    this.ws.send(data);
  }

  closed(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise((resolve) => this.ws.once('close', () => resolve()));
  }

  close(): void {
    this.ws.close();
  }
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function holdPort(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('condition was not met before timeout');
}

function frameSelection(name = 'Hero Card') {
  return {
    v: 1,
    type: 'selection',
    meta: {
      nodeId: '1:2',
      name,
      nodeType: 'FRAME',
      fileName: 'Relay Test',
      pageName: 'Page 1',
    },
    kind: 'frame',
    spec: {
      name,
      layout: { direction: 'column' },
      size: { width: 320, height: 480 },
      childCount: 1,
      componentInstances: [],
      tokenReferences: [],
      rawValues: [],
    },
    image: null,
    warnings: [],
  };
}

describe('LiveBridge', () => {
  let root: string;
  let bridge: LiveBridge | null = null;
  const heldServers: Server[] = [];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'fr-live-test-'));
  });

  afterEach(async () => {
    if (bridge) {
      await bridge.stop();
      bridge = null;
    }
    while (heldServers.length > 0) {
      await closeServer(heldServers.pop()!);
    }
    rmSync(root, { recursive: true, force: true });
  });

  async function startBridge(
    options: Partial<ConstructorParameters<typeof LiveBridge>[0]> = {},
  ): Promise<{ bridge: LiveBridge; port: number; code: string }> {
    const port = await getFreePort();
    const instance = new LiveBridge({
      root,
      projectName: 'Test Kit',
      serverVersion: '1.2.3',
      ports: [port],
      ...options,
    });
    const status = await instance.start();
    return { bridge: instance, port, code: status.code! };
  }

  it('starts on a free port, issues a 6-digit code and writes live.json', async () => {
    const started = await startBridge();
    bridge = started.bridge;

    const status = bridge.getStatus();
    expect(status.running).toBe(true);
    expect(status.port).toBe(started.port);
    expect(status.code).toMatch(/^\d{6}$/);
    expect(status.paired).toBe(false);

    const file = readLiveJson(root);
    expect(file).not.toBeNull();
    expect(file!.port).toBe(started.port);
    expect(file!.code).toBe(status.code);
    expect(file!.paired).toBe(false);
    expect(Number.isNaN(Date.parse(file!.startedAt))).toBe(false);
  });

  it('answers hello with welcome and the right code with a session token', async () => {
    const started = await startBridge();
    bridge = started.bridge;

    const plugin = new TestPlugin(started.port);
    await plugin.open();
    plugin.send({ v: 1, type: 'hello', pluginVersion: '1.0.0', fileName: 'Relay Test' });

    const welcome = await plugin.next((m) => m.type === 'welcome');
    expect(welcome.projectName).toBe('Test Kit');
    expect(welcome.serverVersion).toBe('1.2.3');

    plugin.send({ v: 1, type: 'pair', code: started.code });
    const paired = await plugin.next((m) => m.type === 'paired');
    expect(typeof paired.sessionToken).toBe('string');
    expect((paired.sessionToken as string).length).toBeGreaterThan(20);

    expect(bridge.getStatus().paired).toBe(true);
    expect(readLiveJson(root)!.paired).toBe(true);
    plugin.close();
  });

  it('rejects a wrong code and rotates after three wrong attempts', async () => {
    const started = await startBridge();
    bridge = started.bridge;
    const originalCode = started.code;
    const wrongCode = originalCode === '000001' ? '000002' : '000001';

    const plugin = new TestPlugin(started.port);
    await plugin.open();

    for (let attempt = 1; attempt <= 2; attempt++) {
      plugin.send({ v: 1, type: 'pair', code: wrongCode });
      const error = await plugin.next((m) => m.type === 'error');
      expect(error.code).toBe('BAD_CODE');
    }

    plugin.send({ v: 1, type: 'pair', code: wrongCode });
    const finalError = await plugin.next((m) => m.type === 'error');
    expect(finalError.code).toBe('TOO_MANY_ATTEMPTS');
    expect(bridge.getStatus().code).not.toBe(originalCode);
    expect(bridge.getStatus().code).toMatch(/^\d{6}$/);
    plugin.close();
  });

  it('rejects an expired code with CODE_EXPIRED and issues a fresh one', async () => {
    const started = await startBridge({ codeTtlMs: 20 });
    bridge = started.bridge;

    const plugin = new TestPlugin(started.port);
    await plugin.open();
    await new Promise((r) => setTimeout(r, 40));

    plugin.send({ v: 1, type: 'pair', code: started.code });
    const error = await plugin.next((m) => m.type === 'error');
    expect(error.code).toBe('CODE_EXPIRED');
    expect(bridge.getStatus().code).not.toBe(started.code);
    plugin.close();
  });

  it('resumes with a valid token and rejects an invalid one', async () => {
    const started = await startBridge();
    bridge = started.bridge;

    const first = new TestPlugin(started.port);
    await first.open();
    first.send({ v: 1, type: 'hello', pluginVersion: '1.0.0', fileName: 'Relay Test' });
    await first.next((m) => m.type === 'welcome');
    first.send({ v: 1, type: 'pair', code: started.code });
    const paired = await first.next((m) => m.type === 'paired');
    const token = paired.sessionToken as string;

    const second = new TestPlugin(started.port);
    await second.open();
    second.send({ v: 1, type: 'resume', sessionToken: token });
    const resumed = await second.next((m) => m.type === 'resumed');
    expect(resumed.type).toBe('resumed');
    expect(bridge.getStatus().paired).toBe(true);
    expect(bridge.getStatus().fileName).toBe('Relay Test');

    const third = new TestPlugin(started.port);
    await third.open();
    third.send({ v: 1, type: 'resume', sessionToken: 'not-a-real-token' });
    const error = await third.next((m) => m.type === 'error');
    expect(error.code).toBe('BAD_TOKEN');

    first.close();
    second.close();
    third.close();
  });

  it('accepts a missing or "null" Origin and rejects any other Origin', async () => {
    const started = await startBridge();
    bridge = started.bridge;

    const noOrigin = new TestPlugin(started.port);
    await noOrigin.open();
    noOrigin.close();

    const nullOrigin = new TestPlugin(started.port, 'null');
    await nullOrigin.open();
    nullOrigin.close();

    const badOrigin = new TestPlugin(started.port, 'http://evil.example');
    await expect(badOrigin.open()).rejects.toThrow();
  });

  it('rejects messages over MAX_MESSAGE_BYTES with MESSAGE_TOO_LARGE', async () => {
    const started = await startBridge();
    bridge = started.bridge;

    const plugin = new TestPlugin(started.port);
    await plugin.open();
    const oversized = JSON.stringify({
      v: 1,
      type: 'hello',
      pluginVersion: '1.0.0',
      fileName: 'x'.repeat(MAX_MESSAGE_BYTES),
    });
    expect(Buffer.byteLength(oversized)).toBeGreaterThan(MAX_MESSAGE_BYTES);
    plugin.sendRaw(oversized);

    const error = await plugin.next((m) => m.type === 'error');
    expect(error.code).toBe('MESSAGE_TOO_LARGE');
    plugin.close();
  });

  it('drops a silent client after the heartbeat timeout', async () => {
    const started = await startBridge({ heartbeatIntervalMs: 20, heartbeatTimeoutMs: 60 });
    bridge = started.bridge;

    const plugin = new TestPlugin(started.port);
    await plugin.open();
    await Promise.race([
      plugin.closed(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('client was not dropped')), 3000),
      ),
    ]);
  });

  it('falls back to the next port and reports a clear error when all are busy', async () => {
    const busyPort = await getFreePort();
    const freePort = await getFreePort();
    heldServers.push(await holdPort(busyPort));

    const instance = new LiveBridge({ root, ports: [busyPort, freePort] });
    const status = await instance.start();
    expect(status.port).toBe(freePort);
    bridge = instance;

    const busyA = await getFreePort();
    const busyB = await getFreePort();
    heldServers.push(await holdPort(busyA));
    heldServers.push(await holdPort(busyB));
    const allBusy = new LiveBridge({ root, ports: [busyA, busyB] });
    await expect(allBusy.start()).rejects.toThrow(/are all in use/);
    await allBusy.stop();
  });

  it('clears the session on bye and refreshes live.json', async () => {
    const started = await startBridge();
    bridge = started.bridge;

    const plugin = new TestPlugin(started.port);
    await plugin.open();
    plugin.send({ v: 1, type: 'pair', code: started.code });
    await plugin.next((m) => m.type === 'paired');
    expect(bridge.getStatus().paired).toBe(true);

    plugin.send({ v: 1, type: 'bye' });
    await waitFor(() => bridge!.getStatus().paired === false);
    expect(readLiveJson(root)!.paired).toBe(false);
    plugin.close();
  });

  it('rejects selection before pairing and keeps the latest selection only in memory', async () => {
    const started = await startBridge();
    bridge = started.bridge;

    const plugin = new TestPlugin(started.port);
    await plugin.open();

    plugin.send(frameSelection());
    const beforePair = await plugin.next((m) => m.type === 'error');
    expect(beforePair.code).toBe('BAD_TOKEN');

    plugin.send({ v: 1, type: 'pair', code: started.code });
    await plugin.next((m) => m.type === 'paired');

    plugin.send(frameSelection('Hero Card'));
    await waitFor(() => bridge!.getSelectionRecord() !== null);
    expect(bridge.getSelectionRecord()!.name).toBe('Hero Card');
    expect(bridge.getStatus().lastSelection?.name).toBe('Hero Card');

    const onDisk = readFileSync(join(root, '.frame-relay', 'live.json'), 'utf-8');
    expect(onDisk).not.toContain('Hero Card');
    // live.json holds pairing state only; the selection never gets serialized to disk.
    expect(Object.keys(JSON.parse(onDisk)).sort()).toEqual([
      'code',
      'codeExpiresAt',
      'paired',
      'port',
      'startedAt',
    ]);
    plugin.close();
  });

  it('rejects version mismatches, invalid JSON and unknown message shapes', async () => {
    const started = await startBridge();
    bridge = started.bridge;

    const plugin = new TestPlugin(started.port);
    await plugin.open();

    plugin.send({ v: 2, type: 'hello', pluginVersion: '1.0.0', fileName: 'Relay Test' });
    expect((await plugin.next((m) => m.type === 'error')).code).toBe('VERSION_MISMATCH');

    plugin.sendRaw('this is not json');
    expect((await plugin.next((m) => m.type === 'error')).code).toBe('BAD_MESSAGE');

    plugin.send({ v: 1, type: 'unknown-type' });
    expect((await plugin.next((m) => m.type === 'error')).code).toBe('BAD_MESSAGE');

    plugin.close();
  });

  it('stop closes clients and deletes live.json', async () => {
    const started = await startBridge();
    bridge = started.bridge;

    const plugin = new TestPlugin(started.port);
    await plugin.open();

    await bridge.stop();
    bridge = null;

    await plugin.closed();
    expect(existsSync(join(root, '.frame-relay', 'live.json'))).toBe(false);
  });
});
