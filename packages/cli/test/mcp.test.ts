import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { writeMcpConfigs } from '../src/mcp/config.js';

describe('MCP Config Writer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-mcp-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips MCP config write by default when MCP_READY is false', () => {
    const res = writeMcpConfigs(tmpDir);
    expect(res.skipped).toBe(true);
    expect(res.message).toBe('MCP setup arrives in the next release.');
  });

  it('merges frame-relay server into existing mcp config preserving other servers when flag enabled', () => {
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

    writeMcpConfigs(tmpDir, true);

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

    writeMcpConfigs(tmpDir, true);

    const agyConfig = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.agents/mcp_config.json'), 'utf-8'),
    );
    expect(agyConfig.mcpServers['frame-relay'].args).toEqual(['frame-relay', 'mcp']);
  });
});
