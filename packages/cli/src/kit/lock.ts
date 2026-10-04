import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface LockFile {
  version: number;
  kitName: string;
  exportedAt: string;
  files: Record<string, string>; // relative file path (forward slashes) -> sha256
}

export const LOCK_DIR = '.frame-relay';
export const LOCK_FILE_NAME = 'lock.json';

export function normalizeNewlines(str: string): string {
  return str.replace(/\r\n/g, '\n');
}

export function hashContent(content: string): string {
  const normalized = normalizeNewlines(content);
  return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

export function loadLock(cwd: string): LockFile | null {
  const lockPath = join(cwd, LOCK_DIR, LOCK_FILE_NAME);
  if (!existsSync(lockPath)) return null;
  try {
    return JSON.parse(readFileSync(lockPath, 'utf-8')) as LockFile;
  } catch {
    return null;
  }
}

export function saveLock(cwd: string, lock: LockFile): void {
  const dir = join(cwd, LOCK_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const lockPath = join(dir, LOCK_FILE_NAME);
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf-8');
}

export const computeFileHash = hashContent;
export const loadLockfile = loadLock;
export const saveLockfile = saveLock;

export type FileSyncAction = 'write' | 'conflict' | 'unchanged';

export function classifyFileChange(
  fullPath: string,
  relPathOrNewContent: string,
  newContentOrLock?: string | LockFile | null,
  lockOrForce?: LockFile | null | boolean,
  maybeForce = false,
): FileSyncAction {
  let relPath: string;
  let newContent: string;
  let lock: LockFile | null;
  let force: boolean;

  if (typeof newContentOrLock === 'string') {
    relPath = relPathOrNewContent;
    newContent = newContentOrLock;
    lock = (lockOrForce as LockFile | null) ?? null;
    force = maybeForce;
  } else {
    // Called as (fullPath, newContent, lock, force)
    relPath = fullPath;
    newContent = relPathOrNewContent;
    lock = (newContentOrLock as LockFile | null) ?? null;
    force = Boolean(lockOrForce);
  }

  if (!existsSync(fullPath)) {
    return 'write';
  }

  const diskContent = readFileSync(fullPath, 'utf-8');
  if (normalizeNewlines(diskContent) === normalizeNewlines(newContent)) {
    return 'unchanged';
  }

  if (force) {
    return 'write';
  }

  const diskHash = hashContent(diskContent);
  const normalizedRel = relPath.replace(/\\/g, '/');

  if (lock && lock.files && lock.files[normalizedRel]) {
    const previousHash = lock.files[normalizedRel];
    if (diskHash === previousHash) {
      // User hasn't changed it since last sync; update safely
      return 'write';
    }
  }

  // File was edited by the user or pre-existed without lock
  return 'conflict';
}
