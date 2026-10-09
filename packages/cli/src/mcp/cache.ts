import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import chokidar, { FSWatcher } from 'chokidar';
import {
  ComponentSpec,
  FlattenedToken,
  flattenTokens,
  MANIFEST_FILENAME,
} from '@frame-relay/schema';
import { FrameRelayConfig, loadConfig } from '../config.js';
import { LoadedKit, readAndValidateKit } from '../kit/discovery.js';
import { logger } from './logger.js';

export interface KitCacheState {
  root: string;
  config: FrameRelayConfig | null;
  kitDir: string | null;
  kit: LoadedKit | null;
  lastGoodKit: LoadedKit | null;
  flattenedTokens: Map<string, FlattenedToken>;
  reloadWarning: string | null;
}

export class KitCache {
  public root: string;
  public config: FrameRelayConfig | null = null;
  public kitDir: string | null = null;
  public kit: LoadedKit | null = null;
  public lastGoodKit: LoadedKit | null = null;
  public flattenedTokens: Map<string, FlattenedToken> = new Map();
  public reloadWarning: string | null = null;

  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceMs: number;
  private onReloadCallbacks: Array<() => void> = [];
  private isReady = false;

  constructor(root: string, debounceMs = 300) {
    this.root = resolve(root);
    this.debounceMs = debounceMs;
  }

  /**
   * Initializes the cache synchronously or immediately.
   */
  public init(watch = true): KitCacheState {
    this.load();
    if (watch) {
      this.startWatching();
    }
    return this.getState();
  }

  /**
   * Loads config and kit from disk and validates.
   */
  public load(): boolean {
    const { config } = loadConfig(this.root);
    this.config = config ?? null;

    let candidateKitDir: string | null = null;
    if (this.config?.kitDir) {
      const explicit = resolve(this.root, this.config.kitDir);
      if (existsSync(join(explicit, MANIFEST_FILENAME))) {
        candidateKitDir = explicit;
      }
    }

    if (!candidateKitDir) {
      const defaultFolder = join(this.root, 'frame-relay-kit');
      if (existsSync(join(defaultFolder, MANIFEST_FILENAME))) {
        candidateKitDir = defaultFolder;
      } else if (existsSync(join(this.root, MANIFEST_FILENAME))) {
        candidateKitDir = this.root;
      }
    }

    this.kitDir = candidateKitDir;

    if (!candidateKitDir) {
      this.kit = null;
      return false;
    }

    try {
      const loaded = readAndValidateKit(candidateKitDir, false);
      this.kit = loaded;
      this.lastGoodKit = loaded;
      this.flattenedTokens = flattenTokens(loaded.tokens);
      this.reloadWarning = null;
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this.lastGoodKit) {
        this.kit = this.lastGoodKit;
        this.reloadWarning = `Warning: Kit failed to reload: ${msg}. Serving last valid kit.`;
        logger.warn(this.reloadWarning);
      } else {
        this.kit = null;
        this.reloadWarning = `Warning: Failed to load kit: ${msg}`;
        logger.warn(this.reloadWarning);
      }
      return false;
    }
  }

  /**
   * Starts watching kit files and config with chokidar.
   */
  public startWatching(): void {
    if (this.watcher) return;

    const watchPaths: string[] = [];
    if (this.kitDir && existsSync(this.kitDir)) {
      watchPaths.push(this.kitDir);
    }
    const configPath = join(this.root, 'frame-relay.config.json');
    if (existsSync(configPath)) {
      watchPaths.push(configPath);
    }

    if (watchPaths.length === 0) return;

    this.watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      persistent: true,
      depth: 3,
    });

    const handleChange = () => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        logger.log('Detected kit or config change on disk. Reloading...');
        const success = this.load();
        if (success && this.kit) {
          logger.log(
            `Kit reloaded successfully: "${this.kit.manifest.name}" (${this.kit.components.size} components)`,
          );
        }
        for (const cb of this.onReloadCallbacks) {
          try {
            cb();
          } catch {
            // ignore callback errors
          }
        }
      }, this.debounceMs);
    };

    this.watcher.on('ready', () => {
      this.isReady = true;
    });

    this.watcher.on('all', handleChange);
  }

  public async ready(): Promise<void> {
    if (!this.watcher || this.isReady) return;
    await new Promise<void>((resolve) => {
      this.watcher?.once('ready', () => {
        this.isReady = true;
        resolve();
      });
    });
  }

  public onReload(callback: () => void): () => void {
    this.onReloadCallbacks.push(callback);
    return () => {
      this.onReloadCallbacks = this.onReloadCallbacks.filter((cb) => cb !== callback);
    };
  }

  public async close(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.onReloadCallbacks = [];
  }

  public getState(): KitCacheState {
    return {
      root: this.root,
      config: this.config,
      kitDir: this.kitDir,
      kit: this.kit || this.lastGoodKit,
      lastGoodKit: this.lastGoodKit,
      flattenedTokens: this.flattenedTokens,
      reloadWarning: this.reloadWarning,
    };
  }

  public getActiveKit(): LoadedKit | null {
    return this.kit || this.lastGoodKit;
  }

  public getReloadWarning(): string | null {
    return this.reloadWarning;
  }

  public listComponents(): ComponentSpec[] {
    const kit = this.getActiveKit();
    if (!kit) return [];
    return Array.from(kit.components.values());
  }

  public findComponent(name: string): { spec: ComponentSpec; file: string } | null {
    const kit = this.getActiveKit();
    if (!kit) return null;

    const lower = name.toLowerCase().trim();
    for (const [file, spec] of kit.components.entries()) {
      if (spec.name.toLowerCase().trim() === lower) {
        return { spec, file };
      }
    }
    return null;
  }

  public findSimilarComponentNames(name: string): string[] {
    const kit = this.getActiveKit();
    if (!kit) return [];

    const lower = name.toLowerCase().trim();
    const names = Array.from(kit.components.values()).map((s) => s.name);

    return names
      .filter((n) => {
        const l = n.toLowerCase();
        return (
          l.includes(lower) ||
          lower.includes(l) ||
          levenshteinDistance(l, lower) <= Math.max(2, Math.floor(lower.length / 2))
        );
      })
      .slice(0, 3);
  }
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + 1);
      }
    }
  }

  return dp[m][n];
}
