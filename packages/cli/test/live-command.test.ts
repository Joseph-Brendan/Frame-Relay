import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureLiveJsonIgnored, runLiveCommand, writeLiveJson } from '../src/index.js';

describe('frame-relay live command and live.json lifecycle', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fr-live-cmd-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('prints the not-running message when live.json is absent', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runLiveCommand({ cwd: dir });
      expect(log).toHaveBeenCalledWith(
        'Live mode is not running. Ask your agent to start it, or run the MCP server with --live.',
      );
    } finally {
      log.mockRestore();
    }
  });

  it('prints the state stored in live.json', async () => {
    writeLiveJson(dir, {
      port: 47321,
      code: '123456',
      codeExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      paired: false,
      startedAt: new Date().toISOString(),
    });

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runLiveCommand({ cwd: dir });
      const output = log.mock.calls.flat().join('\n');
      expect(output).toContain('Frame-Relay live mode');
      expect(output).toContain('Port:      47321');
      expect(output).toContain('Paired:    no');
      expect(output).toContain('Code:      123456');
    } finally {
      log.mockRestore();
    }
  });

  it('omits the code when paired and shows the connected state', async () => {
    writeLiveJson(dir, {
      port: 47322,
      code: '654321',
      codeExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      paired: true,
      startedAt: new Date().toISOString(),
    });

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runLiveCommand({ cwd: dir });
      const output = log.mock.calls.flat().join('\n');
      expect(output).toContain('Paired:    yes');
      expect(output).not.toContain('654321');
    } finally {
      log.mockRestore();
    }
  });

  it('appends .frame-relay/live.json to .gitignore exactly once', () => {
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n');

    expect(ensureLiveJsonIgnored(dir)).toBe(true);
    const first = readFileSync(join(dir, '.gitignore'), 'utf-8');
    expect(first).toBe('node_modules\n.frame-relay/live.json\n');

    expect(ensureLiveJsonIgnored(dir)).toBe(false);
    expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toBe(first);
  });

  it('creates .gitignore when the project has none', () => {
    expect(ensureLiveJsonIgnored(dir)).toBe(true);
    expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toBe('.frame-relay/live.json\n');
    expect(existsSync(join(dir, '.gitignore'))).toBe(true);
  });
});
