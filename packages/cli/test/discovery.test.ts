import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import JSZip from 'jszip';
import { findKitDir, unzipKit, readAndValidateKit } from '../src/kit/discovery.js';

describe('Kit Discovery', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-disc-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports zero kits found with instructions', () => {
    expect(() => findKitDir(tmpDir)).toThrow(/No design kit found/);
    expect(() => findKitDir(tmpDir)).toThrow(/Export a kit from/);
  });

  it('discovers a single kit correctly', () => {
    const kitDir = path.join(tmpDir, 'my-kit');
    fs.mkdirSync(kitDir, { recursive: true });
    fs.writeFileSync(path.join(kitDir, 'frame-relay.json'), '{}', 'utf-8');

    const discovered = findKitDir(tmpDir);
    expect(discovered).toBe(kitDir);
  });

  it('rejects when multiple kits are found and asks for --kit', () => {
    const kit1 = path.join(tmpDir, 'kit1');
    const kit2 = path.join(tmpDir, 'kit2');
    fs.mkdirSync(kit1, { recursive: true });
    fs.mkdirSync(kit2, { recursive: true });
    fs.writeFileSync(path.join(kit1, 'frame-relay.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(kit2, 'frame-relay.json'), '{}', 'utf-8');

    expect(() => findKitDir(tmpDir)).toThrow(/Multiple design kits found/);
    expect(() => findKitDir(tmpDir)).toThrow(/--kit <dir>/);
  });

  it('unzips a kit from a zip archive into kitDir', async () => {
    const zip = new JSZip();
    zip.file('frame-relay.json', JSON.stringify({ kitVersion: '1.0.0', name: 'Test' }));
    zip.file('tokens/tokens.json', '{}');
    const content = await zip.generateAsync({ type: 'nodebuffer' });

    const zipPath = path.join(tmpDir, 'exported-kit.zip');
    fs.writeFileSync(zipPath, content);

    const destDir = path.join(tmpDir, 'frame-relay-kit');
    const resultDir = await unzipKit(zipPath, destDir);

    expect(fs.existsSync(path.join(destDir, 'frame-relay.json'))).toBe(true);
    expect(resultDir).toBe(destDir);
  });

  it('unzips a kit nested inside a top-level zip folder', async () => {
    const zip = new JSZip();
    zip.file(
      'frame-relay-kit/frame-relay.json',
      JSON.stringify({ kitVersion: '1.0.0', name: 'Nested' }),
    );
    const content = await zip.generateAsync({ type: 'nodebuffer' });

    const zipPath = path.join(tmpDir, 'nested.zip');
    fs.writeFileSync(zipPath, content);

    const destDir = path.join(tmpDir, 'extracted-kit');
    await unzipKit(zipPath, destDir);

    expect(fs.existsSync(path.join(destDir, 'frame-relay.json'))).toBe(true);
  });

  it('validates a real sample kit correctly', () => {
    const sampleKitPath = path.resolve(__dirname, '../../../examples/sample-kit/frame-relay-kit');
    const kit = readAndValidateKit(sampleKitPath);
    expect(kit.manifest.name).toBe('Frame-Relay Sample Kit');
    expect(kit.components.size).toBeGreaterThan(0);
    expect(kit.tokens).toBeDefined();
  });
});
