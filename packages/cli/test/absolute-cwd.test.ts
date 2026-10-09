import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  resolveCommandCwd,
  runCheck,
  runDoctor,
  runInit,
  runLiveCommand,
  runSync,
} from '../src/index.js';
import { copySampleKit, writeMinimalApp } from './app-fixture.js';

describe('--cwd accepts absolute and relative paths', () => {
  let appDir: string;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    appDir = mkdtempSync(join(tmpdir(), 'fr-abs-cwd-'));
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    log.mockRestore();
    rmSync(appDir, { recursive: true, force: true });
  });

  it('resolveCommandCwd resolves absolute, relative and missing paths', () => {
    expect(resolveCommandCwd(appDir)).toBe(appDir);
    expect(resolveCommandCwd('some/relative/dir')).toBe(
      resolve(process.cwd(), 'some/relative/dir'),
    );
    expect(resolveCommandCwd()).toBe(process.cwd());
  });

  it('runInit, runSync, runCheck, runDoctor and runLiveCommand accept an absolute --cwd', async () => {
    writeMinimalApp(appDir);
    copySampleKit(appDir);

    await runInit({ cwd: appDir, yes: true });
    expect(existsSync(join(appDir, 'frame-relay.config.json'))).toBe(true);

    const syncSummary = await runSync({ cwd: appDir, yes: true });
    expect(syncSummary.conflicts).toEqual([]);
    expect(existsSync(join(appDir, 'src/components/ui/Button.tsx'))).toBe(true);
    expect(existsSync(join(appDir, 'src/styles/frame-relay-tokens.css'))).toBe(true);

    const violations = await runCheck([], { cwd: appDir });
    expect(violations).toEqual([]);

    const doctorPassed = await runDoctor({ cwd: appDir });
    expect(doctorPassed).toBe(true);

    await runLiveCommand({ cwd: appDir });
    expect(log).toHaveBeenCalledWith(
      'Live mode is not running. Ask your agent to start it, or run the MCP server with --live.',
    );
  }, 60000);
});
