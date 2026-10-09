import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import JSZip from 'jszip';

/**
 * Returns a reason when an install failure comes from the public npm registry (offline, broken
 * tarball, DNS/proxy, rate limit, ...). Real packaging errors (for example a missing local
 * tarball, which surfaces as ENOENT) return null so the test still fails.
 */
function registryUnavailableReason(err: unknown): string | null {
  const error = err as {
    stdout?: { toString(): string } | string;
    stderr?: { toString(): string } | string;
    message?: string;
  };
  const output = `${error.stdout?.toString() ?? ''}${error.stderr?.toString() ?? ''}${error.message ?? ''}`;
  if (!/E404|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(output)) return null;
  const line = output
    .split('\n')
    .find((entry) => /E404|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(entry));
  return line?.trim() ?? 'npm registry unavailable';
}

describe('Package Smoke Test', () => {
  let tmpDir: string;
  let packDir: string;
  let appDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-smoke-test-'));
    packDir = path.join(tmpDir, 'pack');
    appDir = path.join(tmpDir, 'app');
    fs.mkdirSync(packDir, { recursive: true });
    fs.mkdirSync(appDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('packs CLI and executes init and sync --from zip in a fresh app', async (ctx) => {
    // 1. Pack the CLI package
    const cliPkgDir = path.resolve(__dirname, '..');
    execSync(`pnpm pack --pack-destination "${packDir}"`, {
      cwd: cliPkgDir,
      encoding: 'utf-8',
    });
    const tarballFiles = fs.readdirSync(packDir).filter((f) => f.endsWith('.tgz'));
    expect(tarballFiles.length).toBeGreaterThan(0);
    const tarballName = tarballFiles[0];
    const tarballPath = path.join(packDir, tarballName);
    expect(fs.existsSync(tarballPath)).toBe(true);

    // 2. Set up fresh Vite app environment
    fs.writeFileSync(
      path.join(appDir, 'package.json'),
      JSON.stringify({
        name: 'smoke-test-app',
        private: true,
        type: 'module',
        dependencies: {
          react: '^19.0.0',
          'react-dom': '^19.0.0',
          'class-variance-authority': '^0.7.1',
          clsx: '^2.1.1',
          'tailwind-merge': '^3.0.1',
        },
        devDependencies: {
          vite: '^6.0.0',
          tailwindcss: '^4.0.0',
          typescript: '^5.7.0',
        },
      }),
    );
    fs.writeFileSync(path.join(appDir, 'pnpm-lock.yaml'), '');
    fs.writeFileSync(path.join(appDir, 'tsconfig.json'), '{}');
    const cssEntry = path.join(appDir, 'src/index.css');
    fs.mkdirSync(path.dirname(cssEntry), { recursive: true });
    fs.writeFileSync(cssEntry, '@import "tailwindcss";\n');

    // Install the packed tarball into the fresh temp Vite app.
    // The packed CLI pulls its runtime dependencies from the public npm registry. When the
    // registry is unavailable or serves a broken tarball, skip this network-dependent test
    // instead of failing the suite (see docs/dev/STATUS.md, problem 3). Real packaging errors
    // still fail the test.
    let installError: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        execSync(
          `npm install --no-audit --no-fund --fetch-retries=1 --fetch-retry-mintimeout=1000 ` +
            `--fetch-retry-maxtimeout=3000 --fetch-timeout=20000 "${tarballPath}"`,
          {
            cwd: appDir,
            stdio: 'pipe',
          },
        );
        installError = null;
        break;
      } catch (err) {
        installError = err;
        if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
    if (installError) {
      const reason = registryUnavailableReason(installError);
      if (reason) {
        ctx.skip(`network-dependent smoke test skipped: ${reason}`);
      }
      throw installError;
    }
    const cliEntry = path.join(
      appDir,
      'node_modules',
      '@josephbrendan',
      'frame-relay',
      'dist',
      'cli.js',
    );
    expect(fs.existsSync(cliEntry)).toBe(true);

    // 3. Create zip of the sample kit
    const sampleKitDir = path.resolve(__dirname, '../../../examples/sample-kit/frame-relay-kit');
    const zip = new JSZip();

    function addDirToZip(dir: string, zipFolder: JSZip) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          addDirToZip(full, zipFolder.folder(item)!);
        } else {
          zipFolder.file(item, fs.readFileSync(full));
        }
      }
    }

    addDirToZip(sampleKitDir, zip.folder('frame-relay-kit')!);
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const kitZipPath = path.join(tmpDir, 'sample-kit.zip');
    fs.writeFileSync(kitZipPath, zipBuffer);

    // 4. Run `frame-relay init --yes`
    const initOutput = execSync(`node "${cliEntry}" init --yes`, {
      cwd: appDir,
      encoding: 'utf-8',
    });
    expect(initOutput.toLowerCase()).toContain('initialization complete');
    expect(fs.existsSync(path.join(appDir, 'frame-relay.config.json'))).toBe(true);

    // 5. Run `frame-relay sync --from sample-kit.zip --yes`
    const syncOutput = execSync(`node "${cliEntry}" sync --from "${kitZipPath}" --yes`, {
      cwd: appDir,
      encoding: 'utf-8',
    });
    expect(syncOutput).toContain('Sync Complete!');

    // 6. Verify written files
    expect(fs.existsSync(path.join(appDir, 'src/styles/frame-relay-tokens.css'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, 'src/lib/cn.ts'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, 'src/components/ui/Button.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, 'src/components/ui/Input.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, 'src/components/ui/Card.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, 'src/components/ui/index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, '.frame-relay/components.md'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, '.frame-relay/lock.json'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, '.agents/rules/frame-relay.md'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, '.cursor/rules/frame-relay.mdc'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, 'CLAUDE.md'))).toBe(true);

    // 7. Verify safe re-sync: running a second time reports files as unchanged
    const sync2Output = execSync(`node "${cliEntry}" sync --yes`, {
      cwd: appDir,
      encoding: 'utf-8',
    });
    expect(sync2Output).toContain('Created:    0');
    expect(sync2Output).toContain('Updated:    0');
    expect(sync2Output).toContain('Unchanged:  5');
  }, 120000);
});
