import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getMcpConfigSnippets, writeMcpConfigs } from '../src/mcp/config.js';

describe('MCP Config Writer & --print-config', () => {
  let tmpDir: string;
  const cliPath = path.resolve(__dirname, '../dist/cli.js');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-mcp-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writeMcpConfigs writes every client config by default', () => {
    const res = writeMcpConfigs(tmpDir);
    expect(res.skipped).toBe(false);
    expect(res.writtenFiles.length).toBe(4);
    expect(fs.existsSync(path.join(tmpDir, '.agents/mcp_config.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.cursor/mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'opencode.json'))).toBe(true);
  });

  it('merges frame-relay server into existing mcp config preserving other servers', () => {
    const cursorMcpDir = path.join(tmpDir, '.cursor');
    fs.mkdirSync(cursorMcpDir, { recursive: true });
    const initialConfig = {
      mcpServers: {
        existingServer: {
          command: 'node',
          args: ['server.js'],
        },
      },
    };
    fs.writeFileSync(path.join(cursorMcpDir, 'mcp.json'), JSON.stringify(initialConfig, null, 2));

    writeMcpConfigs(tmpDir);

    const updated = JSON.parse(fs.readFileSync(path.join(cursorMcpDir, 'mcp.json'), 'utf-8'));
    expect(updated.mcpServers.existingServer).toBeDefined();
    expect(updated.mcpServers['frame-relay']).toBeDefined();
    expect(updated.mcpServers['frame-relay'].args).toEqual([
      '-y',
      '@josephbrendan/frame-relay',
      'mcp',
    ]);
  });

  it('merges opencode.json keeping other keys and other MCP servers', () => {
    const initialConfig = {
      $schema: 'https://opencode.ai/config.json',
      theme: 'dark',
      mcp: {
        otherServer: {
          type: 'local',
          command: ['node', 'other.js'],
          enabled: true,
        },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, 'opencode.json'),
      JSON.stringify(initialConfig, null, 2),
      'utf-8',
    );

    writeMcpConfigs(tmpDir);

    const updated = JSON.parse(fs.readFileSync(path.join(tmpDir, 'opencode.json'), 'utf-8'));
    expect(updated.theme).toBe('dark');
    expect(updated.mcp.otherServer).toEqual(initialConfig.mcp.otherServer);
    expect(updated.mcp['frame-relay']).toEqual({
      type: 'local',
      command: ['npx', '-y', '@josephbrendan/frame-relay', 'mcp'],
      enabled: true,
    });
  });

  it('uses the local frame-relay command in opencode.json for devDependency projects', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ devDependencies: { '@josephbrendan/frame-relay': '^1.0.0' } }),
    );

    writeMcpConfigs(tmpDir);

    const updated = JSON.parse(fs.readFileSync(path.join(tmpDir, 'opencode.json'), 'utf-8'));
    expect(updated.mcp['frame-relay'].command).toEqual(['npx', 'frame-relay', 'mcp']);
  });

  it('preserves an existing custom $schema in opencode.json', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'opencode.json'),
      JSON.stringify({ $schema: 'https://example.com/schema.json' }),
    );

    writeMcpConfigs(tmpDir);

    const updated = JSON.parse(fs.readFileSync(path.join(tmpDir, 'opencode.json'), 'utf-8'));
    expect(updated.$schema).toBe('https://example.com/schema.json');
  });

  it('uses local npx frame-relay mcp when package is in devDependencies', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        devDependencies: {
          '@josephbrendan/frame-relay': '^1.0.0',
        },
      }),
    );

    writeMcpConfigs(tmpDir);

    const agyConfig = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.agents/mcp_config.json'), 'utf-8'),
    );
    expect(agyConfig.mcpServers['frame-relay'].args).toEqual(['frame-relay', 'mcp']);
  });

  it('--print-config output parses as valid JSON for each client including OpenCode', () => {
    const snippets = getMcpConfigSnippets(tmpDir);

    expect(snippets.antigravity.config.mcpServers['frame-relay']).toBeDefined();
    expect(snippets.antigravityGlobal.config.mcpServers['frame-relay']).toBeDefined();
    expect(snippets.cursor.config.mcpServers['frame-relay']).toBeDefined();
    expect(snippets.claude.config.mcpServers['frame-relay']).toBeDefined();
    expect(snippets.opencode.config.mcp['frame-relay']).toBeDefined();
    expect(snippets.opencode.file).toBe('opencode.json');

    // Test running through CLI
    const output = execSync(`node "${cliPath}" mcp --print-config --root "${tmpDir}"`, {
      encoding: 'utf-8',
    });

    // Extract each JSON snippet from output
    const jsonBlocks = output
      .split(/\/\/ [^\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    expect(jsonBlocks.length).toBe(5);
    for (const block of jsonBlocks) {
      const parsed = JSON.parse(block);
      const hasServer =
        parsed.mcpServers?.['frame-relay'] !== undefined ||
        parsed.mcp?.['frame-relay'] !== undefined;
      expect(hasServer).toBe(true);
    }
  });
});
