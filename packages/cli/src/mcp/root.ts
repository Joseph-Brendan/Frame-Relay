import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { MANIFEST_FILENAME } from '@josephbrendan/schema';

export interface ResolveRootResult {
  root: string;
  source: 'flag' | 'env' | 'walk' | 'cwd';
}

/**
 * Resolves the Frame-Relay project root in order:
 * 1. Explicit --root flag
 * 2. FRAME_RELAY_ROOT environment variable
 * 3. Walking up from process.cwd() until frame-relay.config.json or frame-relay-kit/frame-relay.json is found
 * 4. Fallback to process.cwd()
 */
export function resolveProjectRoot(explicitRoot?: string): ResolveRootResult {
  if (explicitRoot) {
    return {
      root: resolve(process.cwd(), explicitRoot),
      source: 'flag',
    };
  }

  const envRoot = process.env.FRAME_RELAY_ROOT;
  if (envRoot && envRoot.trim()) {
    return {
      root: resolve(process.cwd(), envRoot.trim()),
      source: 'env',
    };
  }

  let current = resolve(process.cwd());
  while (true) {
    const hasConfig = existsSync(join(current, 'frame-relay.config.json'));
    const hasKitFolder = existsSync(join(current, 'frame-relay-kit', MANIFEST_FILENAME));
    const hasDirectManifest = existsSync(join(current, MANIFEST_FILENAME));

    if (hasConfig || hasKitFolder || hasDirectManifest) {
      return {
        root: current,
        source: 'walk',
      };
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return {
    root: resolve(process.cwd()),
    source: 'cwd',
  };
}
