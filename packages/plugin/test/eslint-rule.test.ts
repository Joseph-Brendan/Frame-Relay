import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

describe('ESLint Rule: Figma API Isolation', () => {
  const eslint = new ESLint({
    cwd: rootDir,
  });

  it('fails if figma global is used in packages/plugin/src/ui/', async () => {
    const code = 'export function test() { return figma.currentPage; }\n';
    const results = await eslint.lintText(code, {
      filePath: path.resolve(rootDir, 'packages/plugin/src/ui/violator.ts'),
    });

    expect(results.length).toBe(1);
    const messages = results[0].messages;
    const figmaGlobalError = messages.find(
      (m) =>
        m.ruleId === 'no-restricted-globals' &&
        m.message.includes('figma global is only allowed inside packages/plugin/src/main/'),
    );

    expect(figmaGlobalError).toBeDefined();
  });

  it('fails if @figma/plugin-typings is imported outside src/main/', async () => {
    const code =
      'import type { SceneNode } from "@figma/plugin-typings";\nexport const x: SceneNode | null = null;\n';
    const results = await eslint.lintText(code, {
      filePath: path.resolve(rootDir, 'packages/plugin/src/ui/violator-import.ts'),
    });

    expect(results.length).toBe(1);
    const messages = results[0].messages;
    const importError = messages.find(
      (m) =>
        m.ruleId === 'no-restricted-imports' &&
        m.message.includes('Figma typings are only allowed inside packages/plugin/src/main/'),
    );

    expect(importError).toBeDefined();
  });

  it('allows figma global inside packages/plugin/src/main/', async () => {
    const code = 'export function getSelection() { return figma.currentPage.selection; }\n';
    const results = await eslint.lintText(code, {
      filePath: path.resolve(rootDir, 'packages/plugin/src/main/allowed.ts'),
    });

    const restrictedGlobalErrors = results[0].messages.filter(
      (m) => m.ruleId === 'no-restricted-globals' && m.message.includes('figma'),
    );

    expect(restrictedGlobalErrors.length).toBe(0);
  });
});
