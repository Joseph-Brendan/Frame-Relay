import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readAndValidateKit } from '../src/kit/discovery.js';
import { generateTokensCss, injectTokensImportIntoCss } from '../src/tokens/generate.js';

describe('Token CSS Generation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-tokens-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates valid token CSS matching the sample kit snapshot', () => {
    const sampleKitPath = path.resolve(__dirname, '../../../examples/sample-kit/frame-relay-kit');
    const kit = readAndValidateKit(sampleKitPath);
    const css = generateTokensCss(kit.tokens);

    // Light root variables
    expect(css).toContain(':root {');
    expect(css).toContain('--fr-color-primary-500:');
    expect(css).toContain('--fr-radius-md:');

    // Dark mode selectors
    expect(css).toContain('@media (prefers-color-scheme: dark) {');
    expect(css).toContain(':root:not([data-theme="light"])');
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain('.dark {');

    // Tailwind v4 @theme inline
    expect(css).toContain('@theme inline {');
    expect(css).toContain('--color-primary-500: var(--fr-color-primary-500);');
    expect(css).toContain('--radius-md: var(--fr-radius-md);');

    // Typography utilities
    expect(css).toContain('@utility text-body {');
    expect(css).toContain('@utility text-label {');

    expect(css).toMatchSnapshot();
  });

  it('injects tokens import into CSS entry file right after tailwindcss import', () => {
    const cssEntryPath = path.join(tmpDir, 'src/index.css');
    fs.mkdirSync(path.dirname(cssEntryPath), { recursive: true });
    fs.writeFileSync(cssEntryPath, '@import "tailwindcss";\n\nbody { margin: 0; }\n', 'utf-8');

    const tokensFilePath = path.join(tmpDir, 'src/styles/frame-relay-tokens.css');
    injectTokensImportIntoCss(cssEntryPath, tokensFilePath);

    const updated = fs.readFileSync(cssEntryPath, 'utf-8');
    expect(updated).toContain('@import "tailwindcss";\n@import "./styles/frame-relay-tokens.css";');

    // Running a second time should not duplicate the import
    injectTokensImportIntoCss(cssEntryPath, tokensFilePath);
    const run2 = fs.readFileSync(cssEntryPath, 'utf-8');
    expect(run2).toBe(updated);
  });
});
