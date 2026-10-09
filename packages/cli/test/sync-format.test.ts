import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import prettier from 'prettier';
import { runSync } from '../src/index.js';
import { copySampleKit, writeMinimalApp } from './app-fixture.js';

const GENERATED_FILES = [
  'src/styles/frame-relay-tokens.css',
  'src/lib/cn.ts',
  'src/components/ui/Button.tsx',
  'src/components/ui/Input.tsx',
  'src/components/ui/Card.tsx',
  'src/components/ui/index.ts',
  '.frame-relay/components.md',
];

/** Formats files exactly like `prettier --write .` would, resolving config per file. */
async function formatLikeRepo(cwd: string, relPaths: string[]): Promise<void> {
  for (const rel of relPaths) {
    const full = join(cwd, rel);
    if (!existsSync(full)) continue;
    const config = (await prettier.resolveConfig(full)) || {};
    const formatted = await prettier.format(readFileSync(full, 'utf-8'), {
      ...config,
      filepath: full,
    });
    writeFileSync(full, formatted, 'utf-8');
  }
}

describe('Sync + Prettier stability', () => {
  let appDir: string;

  beforeEach(() => {
    appDir = mkdtempSync(join(tmpdir(), 'fr-sync-format-'));
    writeMinimalApp(appDir);
    copySampleKit(appDir);
  });

  afterEach(() => {
    rmSync(appDir, { recursive: true, force: true });
  });

  it('reports zero conflicts when the generated files were formatted with Prettier', async () => {
    const first = await runSync({ cwd: appDir, yes: true });
    expect(first.conflicts).toEqual([]);

    await formatLikeRepo(appDir, GENERATED_FILES);

    const second = await runSync({ cwd: appDir, yes: true });
    expect(second.conflicts).toEqual([]);
    expect(second.created).toEqual([]);
    expect(second.updated).toEqual([]);
  }, 60000);
});
