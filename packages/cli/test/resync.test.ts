import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  computeFileHash,
  loadLockfile,
  saveLockfile,
  classifyFileChange,
} from '../src/kit/lock.js';

describe('Safe Re-Sync & Idempotence', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-resync-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('classifies missing file as write', () => {
    const lock = { version: 1, files: {} };
    const filePath = path.join(tmpDir, 'Button.tsx');
    const newContent = 'export function Button() {}';

    const result = classifyFileChange(filePath, newContent, lock);
    expect(result).toBe('write');
  });

  it('classifies identical file as unchanged', () => {
    const filePath = path.join(tmpDir, 'Button.tsx');
    const content = 'export function Button() {}';
    fs.writeFileSync(filePath, content, 'utf-8');

    const hash = computeFileHash(content);
    const lock = { version: 1, files: { [filePath]: hash } };

    const result = classifyFileChange(filePath, content, lock);
    expect(result).toBe('unchanged');
  });

  it('classifies untouched file as write when incoming content is updated', () => {
    const filePath = path.join(tmpDir, 'Button.tsx');
    const oldContent = 'export function Button() { /* old */ }';
    fs.writeFileSync(filePath, oldContent, 'utf-8');

    const oldHash = computeFileHash(oldContent);
    const lock = { version: 1, files: { [filePath]: oldHash } };

    const newContent = 'export function Button() { /* new */ }';
    const result = classifyFileChange(filePath, newContent, lock);
    expect(result).toBe('write');
  });

  it('detects user edits as conflict and preserves original file', () => {
    const filePath = path.join(tmpDir, 'Button.tsx');
    const originalGenerated = 'export function Button() { /* v1 */ }';
    const originalHash = computeFileHash(originalGenerated);
    const lock = { version: 1, files: { [filePath]: originalHash } };

    // User edits the file locally
    const userEdited = 'export function Button() { /* user customized */ }';
    fs.writeFileSync(filePath, userEdited, 'utf-8');

    // New version arrives from sync
    const v2Generated = 'export function Button() { /* v2 */ }';
    const result = classifyFileChange(filePath, v2Generated, lock);
    expect(result).toBe('conflict');

    // On conflict: write <Name>.generated.tsx and keep original untouched
    const genPath = filePath.replace(/\.tsx$/, '.generated.tsx');
    fs.writeFileSync(genPath, v2Generated, 'utf-8');

    expect(fs.readFileSync(filePath, 'utf-8')).toBe(userEdited);
    expect(fs.readFileSync(genPath, 'utf-8')).toBe(v2Generated);
  });

  it('force flag allows overwriting edited files', () => {
    const filePath = path.join(tmpDir, 'Button.tsx');
    const originalHash = computeFileHash('original');
    const lock = { version: 1, files: { [filePath]: originalHash } };

    fs.writeFileSync(filePath, 'user edit', 'utf-8');

    const force = true;
    const incoming = 'new version';
    const classification = classifyFileChange(filePath, incoming, lock);
    expect(classification).toBe('conflict');

    if (force) {
      fs.writeFileSync(filePath, incoming, 'utf-8');
      lock.files[filePath] = computeFileHash(incoming);
    }

    expect(fs.readFileSync(filePath, 'utf-8')).toBe(incoming);
  });

  it('saves and loads lockfile accurately', () => {
    const lock = {
      version: 1,
      files: {
        'src/components/ui/Button.tsx': 'hash123',
        'src/components/ui/Card.tsx': 'hash456',
      },
    };

    saveLockfile(tmpDir, lock);
    const loaded = loadLockfile(tmpDir);

    expect(loaded).toEqual(lock);
  });
});
