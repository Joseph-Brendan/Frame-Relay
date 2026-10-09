import { resolve } from 'node:path';

/**
 * Resolves a command's --cwd flag against the current working directory.
 * Accepts both relative paths (`--cwd ./app`) and absolute paths (`--cwd /Users/me/app`).
 */
export function resolveCommandCwd(cwd?: string): string {
  return cwd ? resolve(process.cwd(), cwd) : process.cwd();
}
