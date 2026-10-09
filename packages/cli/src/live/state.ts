import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const LIVE_DIR = '.frame-relay';
export const LIVE_JSON_FILENAME = 'live.json';
export const LIVE_JSON_IGNORE_LINE = '.frame-relay/live.json';

/**
 * On-disk state for a running live bridge. This is the only live-mode artifact that touches
 * disk; the shared Figma selection is kept in memory only.
 */
export interface LiveJsonState {
  port: number;
  code: string;
  codeExpiresAt: string;
  paired: boolean;
  startedAt: string;
}

export function liveJsonPath(root: string): string {
  return join(resolve(root), LIVE_DIR, LIVE_JSON_FILENAME);
}

export function readLiveJson(root: string): LiveJsonState | null {
  const file = liveJsonPath(root);
  if (!existsSync(file)) return null;

  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<LiveJsonState>;
    if (typeof parsed.port !== 'number' || typeof parsed.startedAt !== 'string') {
      return null;
    }
    return {
      port: parsed.port,
      code: typeof parsed.code === 'string' ? parsed.code : '',
      codeExpiresAt: typeof parsed.codeExpiresAt === 'string' ? parsed.codeExpiresAt : '',
      paired: parsed.paired === true,
      startedAt: parsed.startedAt,
    };
  } catch {
    return null;
  }
}

export function writeLiveJson(root: string, state: LiveJsonState): void {
  const file = liveJsonPath(root);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

export function deleteLiveJson(root: string): void {
  rmSync(liveJsonPath(root), { force: true });
}

/**
 * Adds `.frame-relay/live.json` to the project .gitignore. Returns true when the file changed.
 * `frame-relay sync` calls this so pairing codes never get committed.
 */
export function ensureLiveJsonIgnored(root: string): boolean {
  const gitignorePath = join(resolve(root), '.gitignore');
  const content = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';

  const alreadyIgnored = content
    .split(/\r?\n/)
    .some(
      (line) =>
        line.trim() === LIVE_JSON_IGNORE_LINE || line.trim() === `/${LIVE_JSON_IGNORE_LINE}`,
    );

  if (alreadyIgnored) return false;

  const prefix = content.length === 0 || content.endsWith('\n') ? '' : '\n';
  writeFileSync(gitignorePath, `${content}${prefix}${LIVE_JSON_IGNORE_LINE}\n`, 'utf-8');
  return true;
}
