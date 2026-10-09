import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import WebSocket, { type RawData } from 'ws';
import {
  convertComponent,
  convertVariables,
  summarizeFrame,
  type NodeSnapshot,
  type StyleIndex,
} from '@josephbrendan/converter';

const cliPath = path.resolve(__dirname, '../dist/cli.js');
const demoRoot = path.resolve(__dirname, '../../../examples/demo-app');
const fixturesDir = path.resolve(__dirname, '../../converter/test/fixtures');
const liveJsonPath = path.join(demoRoot, '.frame-relay', 'live.json');

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function loadJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

const variablesSnapshot = loadJson<Parameters<typeof convertVariables>[0]>(
  path.join(fixturesDir, 'variables.json'),
);
const { variableIndex } = convertVariables(variablesSnapshot);
const styles = loadJson<StyleIndex>(path.join(fixturesDir, 'styles.json'));
const buttonNode = loadJson<NodeSnapshot>(path.join(fixturesDir, 'button.set.json'));
const frameNode = loadJson<NodeSnapshot>(path.join(fixturesDir, 'frame.node.json'));
const { spec: buttonSpec } = convertComponent({
  node: buttonNode,
  variables: variableIndex,
  styles,
});

function liveButtonSelection() {
  const spec = structuredClone(buttonSpec!);
  spec.base.root = { ...spec.base.root, borderRadius: { raw: '99px' } };

  return {
    v: 1,
    type: 'selection',
    meta: {
      nodeId: buttonNode.id,
      name: 'Button',
      nodeType: 'COMPONENT_SET',
      fileName: 'Relay Test',
      pageName: 'Components',
    },
    kind: 'component',
    spec,
    image: PNG_BASE64,
    warnings: [
      {
        code: 'RAW_VALUE',
        severity: 'warning',
        component: 'Button',
        layerPath: 'root',
        message: 'Button > root: borderRadius uses raw value 99px.',
      },
    ],
  };
}

function liveFrameSelection() {
  const summary = summarizeFrame(frameNode, variableIndex, styles);

  return {
    v: 1,
    type: 'selection',
    meta: {
      nodeId: frameNode.id,
      name: frameNode.name,
      nodeType: 'FRAME',
      fileName: 'Relay Test',
      pageName: 'Page 1',
    },
    kind: 'frame',
    spec: summary,
    image: null,
    warnings: [],
  };
}

type ToolResult = {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  structuredContent?: Record<string, unknown>;
};

async function waitForPluginMessage(
  ws: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
  timeoutMs = 3000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error('Timed out waiting for a plugin message'));
    }, timeoutMs);

    const onMessage = (data: RawData) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(data.toString()) as Record<string, unknown>;
      } catch {
        return;
      }
      if (predicate(message)) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(message);
      }
    };

    ws.on('message', onMessage);
  });
}

function openPlugin(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

async function waitForAsync(condition: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('Condition was not met before timeout');
}

describe('MCP live mode integration', () => {
  let transport: StdioClientTransport;
  let client: Client;

  async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    const result = await client.callTool({ name, arguments: args });
    return result as unknown as ToolResult;
  }

  function textOf(result: ToolResult): string {
    return result.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text ?? '')
      .join('\n');
  }

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [cliPath, 'mcp', '--root', demoRoot, '--live'],
    });

    client = new Client({ name: 'live-test-client', version: '1.0.0' });
    await client.connect(transport);
  }, 15000);

  afterAll(async () => {
    try {
      await callTool('stop_live');
    } catch {
      // ignore
    }
    await client.close();
    fs.rmSync(liveJsonPath, { force: true });
  });

  it('start_live returns the pairing code and the steps to show the user', async () => {
    const result = await callTool('start_live');
    const sc = result.structuredContent!;
    expect(sc.running).toBe(true);
    expect(sc.paired).toBe(false);
    expect(String(sc.code)).toMatch(/^\d{6}$/);

    const steps = String(sc.steps);
    expect(steps).toBe(
      `Open the Frame-Relay plugin in Figma, go to the Live tab, enter code ${sc.code}, and click Connect.`,
    );
    expect(textOf(result)).toContain('Live Mode Started');
  });

  it('get_live_status reports running, unpaired and the code', async () => {
    const result = await callTool('get_live_status');
    const sc = result.structuredContent!;
    expect(sc.running).toBe(true);
    expect(sc.paired).toBe(false);
    expect(textOf(result)).toContain('Live Mode Status');
    expect(textOf(result)).toContain(String(sc.code));
  });

  it('get_live_selection while unpaired returns the code and steps', async () => {
    const result = await callTool('get_live_selection');
    const text = textOf(result);
    expect(text).toContain('no Figma plugin has paired yet');
    expect(text).toContain('Open the Frame-Relay plugin in Figma, go to the Live tab');
    expect(result.structuredContent!.paired).toBe(false);
  });

  it('get_live_selection while stopped tells the agent to call start_live', async () => {
    await callTool('stop_live');
    const result = await callTool('get_live_selection');
    expect(textOf(result)).toContain('Live mode is not running. Call start_live');
    expect(fs.existsSync(liveJsonPath)).toBe(false);
  });

  it('get_live_selection falls back to the exported spec with fallbackName', async () => {
    const result = await callTool('get_live_selection', { fallbackName: 'Button' });
    const text = textOf(result);
    expect(text).toContain('exported spec for "Button"');
    expect(text).toContain('exported kit');
    expect(result.structuredContent!.component).toBe('Button');
  });

  it('pairs a fake plugin, shares a component selection and reports the diff', async () => {
    const start = await callTool('start_live');
    const port = start.structuredContent!.port as number;
    const code = start.structuredContent!.code as string;

    const ws = await openPlugin(port);
    try {
      ws.send(
        JSON.stringify({
          v: 1,
          type: 'hello',
          pluginVersion: '1.0.0',
          fileName: 'Relay Test',
        }),
      );
      const welcome = await waitForPluginMessage(ws, (m) => m.type === 'welcome');
      expect(welcome.projectName).toBe('Frame-Relay Sample Kit');

      const wrongCode = code === '000001' ? '000002' : '000001';
      const badCodeWait = waitForPluginMessage(ws, (m) => m.type === 'error');
      ws.send(JSON.stringify({ v: 1, type: 'pair', code: wrongCode }));
      expect((await badCodeWait).code).toBe('BAD_CODE');

      const pairedWait = waitForPluginMessage(ws, (m) => m.type === 'paired');
      ws.send(JSON.stringify({ v: 1, type: 'pair', code }));
      const paired = await pairedWait;
      expect(typeof paired.sessionToken).toBe('string');

      const noSelection = await callTool('get_live_selection');
      expect(textOf(noSelection)).toContain('no layer has been shared yet');

      ws.send(JSON.stringify(liveButtonSelection()));
      await waitForAsync(async () => {
        const status = await callTool('get_live_status');
        return Boolean(status.structuredContent?.lastSelection);
      });

      const result = await callTool('get_live_selection');
      const text = textOf(result);
      expect(text).toContain('# Live Selection: Button');
      expect(text).toContain('base.root.borderRadius: Figma has 99px');
      expect(text).toContain(
        'Figma has changed since the last export. Re-export the kit and run sync.',
      );
      expect(text).toContain('[warning] RAW_VALUE');

      const imageContent = result.content.find((item) => item.type === 'image');
      expect(imageContent).toBeDefined();
      expect(imageContent!.data).toBe(PNG_BASE64);
      expect(imageContent!.mimeType).toBe('image/png');

      const sc = result.structuredContent!;
      expect(sc.matchedKitComponent).toBe('Button');
      expect((sc.differences as string[]).some((d) => d.includes('base.root.borderRadius'))).toBe(
        true,
      );

      ws.send(JSON.stringify(liveFrameSelection()));
      await waitForAsync(async () => {
        const status = await callTool('get_live_status');
        const selection = status.structuredContent?.lastSelection as
          Record<string, unknown> | null | undefined;
        return selection?.kind === 'frame';
      });

      const frameResult = await callTool('get_live_selection');
      const frameText = textOf(frameResult);
      expect(frameText).toContain('# Live Selection: Hero Card');
      expect(frameText).toContain('"childCount"');
      expect(frameResult.content.some((item) => item.type === 'image')).toBe(false);
    } finally {
      ws.close();
    }
  });

  it('get_kit_info reports live status while connected', async () => {
    const result = await callTool('get_kit_info');
    expect(result.structuredContent!.liveMode).toBe('on');
    expect(textOf(result)).toContain('Live Mode**: on');
  });

  it('stop_live clears the session and live.json', async () => {
    await callTool('stop_live');
    const status = await callTool('get_live_status');
    expect(status.structuredContent!.running).toBe(false);
    expect(fs.existsSync(liveJsonPath)).toBe(false);
  });

  it('stdout purity: live bridge logs never reach stdout', async () => {
    const proc = spawn(process.execPath, [cliPath, 'mcp', '--root', demoRoot, '--live'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const receivedData = new Promise<void>((resolve) => {
      proc.stdout.on('data', (d) => {
        stdout += d.toString();
        if (stdout.includes('\n')) resolve();
      });
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    const initReq =
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'live-purity-test', version: '1.0' },
        },
      }) + '\n';

    proc.stdin.write(initReq);
    await Promise.race([receivedData, new Promise((r) => setTimeout(r, 10000))]);
    proc.kill('SIGTERM');
    await new Promise<void>((resolve) => proc.once('exit', () => resolve()));

    const lines = stdout.trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.jsonrpc).toBe('2.0');
    }
    expect(stderr).toContain('[frame-relay]');
  }, 20000);
});
