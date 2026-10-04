import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  FrameRelayConfigSchema,
  detectEnvironment,
  loadConfig,
  writeConfig,
} from '../src/config.js';

describe('Configuration & Init', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('validates a correct frame-relay configuration', () => {
    const validConfig = {
      kitDir: 'frame-relay-kit',
      framework: 'vite',
      typescript: true,
      cssEntry: 'src/index.css',
      componentsDir: 'src/components/ui',
      tokensFile: 'src/styles/frame-relay-tokens.css',
      agents: {
        antigravity: true,
        cursor: true,
        claude: true,
      },
      mcp: true,
    };

    const parsed = FrameRelayConfigSchema.parse(validConfig);
    expect(parsed.framework).toBe('vite');
    expect(parsed.agents?.antigravity).toBe(true);
  });

  it('rejects invalid configuration fields', () => {
    const invalidConfig = {
      kitDir: 1234, // Should be string
      framework: 'angular', // Not allowed
    };

    expect(() => FrameRelayConfigSchema.parse(invalidConfig)).toThrow();
  });

  it('detects Vite + React + TS environment from package files', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
        devDependencies: { vite: '^6.0.0', tailwindcss: '^4.0.0' },
      }),
    );
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
    const cssPath = path.join(tmpDir, 'src/index.css');
    fs.mkdirSync(path.dirname(cssPath), { recursive: true });
    fs.writeFileSync(cssPath, '@import "tailwindcss";');

    const env = await detectEnvironment(tmpDir);
    expect(env.packageManager).toBe('pnpm');
    expect(env.framework).toBe('vite');
    expect(env.typescript).toBe(true);
    expect(env.tailwindV4Installed).toBe(true);
    expect(env.cssEntry).toBe('src/index.css');
  });

  it('detects Next.js app router environment', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: { next: '^15.0.0', react: '^19.0.0' },
      }),
    );
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '');
    fs.mkdirSync(path.join(tmpDir, 'app'), { recursive: true });

    const env = await detectEnvironment(tmpDir);
    expect(env.packageManager).toBe('npm');
    expect(env.framework).toBe('next');
  });

  it('running init writeConfig twice with same config produces identical content', () => {
    const config = {
      kitDir: 'frame-relay-kit',
      framework: 'vite' as const,
      typescript: true,
      cssEntry: 'src/index.css',
      componentsDir: 'src/components/ui',
      tokensFile: 'src/styles/frame-relay-tokens.css',
      agents: { antigravity: true, cursor: true, claude: true },
      mcp: true,
    };

    writeConfig(tmpDir, config);
    const content1 = fs.readFileSync(path.join(tmpDir, 'frame-relay.config.json'), 'utf-8');

    // Second write
    writeConfig(tmpDir, config);
    const content2 = fs.readFileSync(path.join(tmpDir, 'frame-relay.config.json'), 'utf-8');

    expect(content1).toBe(content2);
    const loaded = loadConfig(tmpDir);
    expect(loaded.config).toEqual(config);
  });
});
