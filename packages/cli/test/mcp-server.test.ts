import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('MCP Server Integration Tests', () => {
  const cliPath = path.resolve(__dirname, '../dist/cli.js');
  const demoRoot = path.resolve(__dirname, '../../../examples/demo-app');

  let transport: StdioClientTransport;
  let client: Client;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [cliPath, 'mcp', '--root', demoRoot],
    });

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(transport);
  }, 15000);

  afterAll(async () => {
    await client.close();
  });

  it('get_kit_info returns valid metadata and structuredContent', async () => {
    const res = await client.callTool({ name: 'get_kit_info', arguments: {} });
    expect(res.content).toBeDefined();
    const text = (res.content[0] as { type: string; text: string }).text;
    expect(text).toContain('# Frame-Relay Kit: Frame-Relay Sample Kit');
    expect(text).toContain('Components**: 3');
    expect(text).toContain('Live Mode**: off');

    const sc = res.structuredContent as Record<string, unknown>;
    expect(sc.kitName).toBe('Frame-Relay Sample Kit');
    expect(sc.componentCount).toBe(3);
    expect(sc.liveMode).toBe('off');
  });

  it('list_components returns one line per component with import and variants', async () => {
    const res = await client.callTool({ name: 'list_components', arguments: {} });
    const text = (res.content[0] as { type: string; text: string }).text;
    expect(text).toContain('**Button**');
    expect(text).toContain('**Input**');
    expect(text).toContain('**Card**');
    expect(text).toContain('import { Button } from "@/components/ui"');

    // Test with category filter
    const filteredRes = await client.callTool({
      name: 'list_components',
      arguments: { category: 'action' },
    });
    const filteredText = (filteredRes.content[0] as { type: string; text: string }).text;
    expect(filteredText).toContain('**Button**');
    expect(filteredText).not.toContain('**Input**');
  });

  it('get_component returns correct output for Button, Input and Card', async () => {
    // 1. Button
    const btnRes = await client.callTool({ name: 'get_component', arguments: { name: 'Button' } });
    const btnText = (btnRes.content[0] as { type: string; text: string }).text;
    expect(btnText).toContain('# Component: Button');
    expect(btnText).toContain('## Props');
    expect(btnText).toContain('## States');
    expect(btnText).toContain('## Guidelines');
    expect(btnText).toContain('## Minimal Usage Example');

    // Case-insensitivity
    const lowerBtnRes = await client.callTool({
      name: 'get_component',
      arguments: { name: 'button' },
    });
    expect((lowerBtnRes.content[0] as { type: string; text: string }).text).toContain(
      '# Component: Button',
    );

    // 2. Input
    const inputRes = await client.callTool({ name: 'get_component', arguments: { name: 'Input' } });
    const inputText = (inputRes.content[0] as { type: string; text: string }).text;
    expect(inputText).toContain('# Component: Input');

    // 3. Card
    const cardRes = await client.callTool({ name: 'get_component', arguments: { name: 'Card' } });
    const cardText = (cardRes.content[0] as { type: string; text: string }).text;
    expect(cardText).toContain('# Component: Card');
  });

  it('get_component with unknown name returns helpful suggestions', async () => {
    const typoRes = await client.callTool({ name: 'get_component', arguments: { name: 'Buton' } });
    const typoText = (typoRes.content[0] as { type: string; text: string }).text;
    expect(typoText).toContain(
      'No component named "Buton". Did you mean "Button"? Call list_components to see every component.',
    );
  });

  it('get_tokens returns tokens with group filter and mode', async () => {
    const tokensRes = await client.callTool({
      name: 'get_tokens',
      arguments: { group: 'color', mode: 'dark' },
    });
    const text = (tokensRes.content[0] as { type: string; text: string }).text;
    expect(text).toContain('# Design Tokens');
    expect(text).toContain('color.primary.500');
    expect(text).toContain('--fr-color-primary-500');
  });

  it('get_screenshot returns valid PNG image content and variant/state text', async () => {
    const shotRes = await client.callTool({
      name: 'get_screenshot',
      arguments: {
        name: 'Button',
        variant: { variant: 'Primary', size: 'Medium' },
        state: 'Default',
      },
    });
    expect(shotRes.content).toHaveLength(2);
    expect(shotRes.content[0].type).toBe('text');
    expect((shotRes.content[0] as { type: string; text: string }).text).toContain(
      'Screenshot for Button',
    );

    expect(shotRes.content[1].type).toBe('image');
    const imgData = (shotRes.content[1] as { type: string; data: string; mimeType: string }).data;
    expect(imgData).toBeDefined();
    expect(imgData.length).toBeGreaterThan(50);
    // Verify valid base64 PNG header (0x89 0x50 0x4E 0x47 in base64 starts with iVBORw0KGgo)
    expect(imgData.startsWith('iVBORw0KGgo')).toBe(true);
  });

  it('check_file handles clean files, files with violations, and rejects paths outside root', async () => {
    // 1. Clean file
    const cleanRes = await client.callTool({
      name: 'check_file',
      arguments: { path: 'src/App.tsx' },
    });
    expect((cleanRes.content[0] as { type: string; text: string }).text).toContain(
      'No issues found. All checked files comply with Frame-Relay rules.',
    );

    // 2. File with violations
    const tmpViolationFile = path.join(demoRoot, 'src/temp-violation.tsx');
    fs.writeFileSync(
      tmpViolationFile,
      'export function Test() { return <button className="bg-[#123456]">Click</button>; }',
      'utf-8',
    );
    try {
      const violRes = await client.callTool({
        name: 'check_file',
        arguments: { path: 'src/temp-violation.tsx' },
      });
      const violText = (violRes.content[0] as { type: string; text: string }).text;
      expect(violText).toContain('raw-form-element');
      expect(violText).toContain('literal-color');
    } finally {
      if (fs.existsSync(tmpViolationFile)) fs.unlinkSync(tmpViolationFile);
    }

    // 3. Path outside root rejected
    const outsideRes = await client.callTool({
      name: 'check_file',
      arguments: { path: '../../package.json' },
    });
    expect((outsideRes.content[0] as { type: string; text: string }).text).toContain(
      'is outside the project root',
    );
  });

  it('get_live_selection returns stub message', async () => {
    const liveRes = await client.callTool({ name: 'get_live_selection', arguments: {} });
    expect((liveRes.content[0] as { type: string; text: string }).text).toContain(
      'Live mode is not available in this version. Use get_component and get_screenshot with the exported kit.',
    );
  });

  it('resources list and read correctly', async () => {
    const list = await client.listResources();
    const uris = list.resources.map((r) => r.uri);
    expect(uris).toContain('frame-relay://components');
    expect(uris).toContain('frame-relay://tokens');

    const readComp = await client.readResource({ uri: 'frame-relay://components' });
    expect(readComp.contents[0].text.length).toBeGreaterThan(100);

    const readTokens = await client.readResource({ uri: 'frame-relay://tokens' });
    expect(readTokens.contents[0].text).toContain('# Frame-Relay Design Tokens');

    const readSingle = await client.readResource({ uri: 'frame-relay://component/Button' });
    expect(readSingle.contents[0].text).toContain('# Component: Button');
  });

  it('stdout purity: confirms every stdout line from server is valid JSON-RPC', async () => {
    const proc = spawn(process.execPath, [cliPath, 'mcp', '--root', demoRoot], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    const receivedData = new Promise<void>((resolve) => {
      proc.stdout.on('data', (d) => {
        stdout += d.toString();
        if (stdout.includes('\n')) {
          resolve();
        }
      });
    });

    // Send JSON-RPC initialize request
    const initReq =
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'purity-test', version: '1.0' },
        },
      }) + '\n';

    proc.stdin.write(initReq);

    await Promise.race([receivedData, new Promise((r) => setTimeout(r, 10000))]);
    proc.kill();

    const lines = stdout.trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.jsonrpc).toBe('2.0');
    }
  });

  it('no-kit case: starts in empty folder and every tool returns setup message', async () => {
    const emptyTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-mcp-empty-'));
    const emptyTransport = new StdioClientTransport({
      command: process.execPath,
      args: [cliPath, 'mcp', '--root', emptyTmp],
    });
    const emptyClient = new Client({ name: 'empty-test', version: '1.0' });
    await emptyClient.connect(emptyTransport);

    const info = await emptyClient.callTool({ name: 'get_kit_info', arguments: {} });
    expect((info.content[0] as { type: string; text: string }).text).toContain(
      'No Frame-Relay kit found from',
    );
    expect((info.content[0] as { type: string; text: string }).text).toContain(
      'Run `npx frame-relay sync`, or set FRAME_RELAY_ROOT',
    );

    const list = await emptyClient.callTool({ name: 'list_components', arguments: {} });
    expect((list.content[0] as { type: string; text: string }).text).toContain(
      'No Frame-Relay kit found from',
    );

    await emptyClient.close();
    fs.rmSync(emptyTmp, { recursive: true, force: true });
  });
});
