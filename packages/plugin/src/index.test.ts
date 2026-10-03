import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('plugin package', () => {
  it('manifest.json parses and has expected main and ui paths', () => {
    const manifestPath = path.resolve(__dirname, '../manifest.json');
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);

    expect(manifest.name).toBe('Frame-Relay');
    expect(manifest.main).toBe('dist/code.js');
    expect(manifest.ui).toBe('dist/ui.html');
    expect(manifest.editorType).toEqual(['figma']);
    expect(manifest.documentAccess).toBe('dynamic-page');
  });
});
