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

  it('writeMcpConfigs writes configs by default now that MCP_READY is true', () => {
    const res = writeMcpConfigs(tmpDir);
    expect(res.skipped).toBe(false);
    expect(res.writtenFiles.length).toBe(3);
    expect(fs.existsSync(path.join(tmpDir, '.agents/mcp_config.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.cursor/mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.mcp.json'))).toBe(true);
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

  it('--print-config output parses as valid JSON for each client', () => {
    const snippets = getMcpConfigSnippets(tmpDir);

    expect(snippets.antigravity.config.mcpServers['frame-relay']).toBeDefined();
    expect(snippets.antigravityGlobal.config.mcpServers['frame-relay']).toBeDefined();
    expect(snippets.cursor.config.mcpServers['frame-relay']).toBeDefined();
    expect(snippets.claude.config.mcpServers['frame-relay']).toBeDefined();

    // Test running through CLI
    const output = execSync(`node "${cliPath}" mcp --print-config --root "${tmpDir}"`, {
      encoding: 'utf-8',
    });

    // Extract each JSON snippet from output
    const jsonBlocks = output
      .split(/\/\/ [^\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    expect(jsonBlocks.length).toBe(4);
    for (const block of jsonBlocks) {
      const parsed = JSON.parse(block);
      expect(parsed.mcpServers).toBeDefined();
      expect(parsed.mcpServers['frame-relay']).toBeDefined();
    }
  });
});
