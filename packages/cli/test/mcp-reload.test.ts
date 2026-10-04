import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { KitCache } from '../src/mcp/cache.js';

describe('MCP Kit Cache, Reloading and Scale', () => {
  let tmpDir: string;
  let kitDir: string;
  let compDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-mcp-reload-test-'));
    kitDir = path.join(tmpDir, 'frame-relay-kit');
    compDir = path.join(kitDir, 'components');
    fs.mkdirSync(compDir, { recursive: true });

    const sampleTokens = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../../examples/sample-kit/frame-relay-kit/tokens.json'),
        'utf-8',
      ),
    );
    fs.writeFileSync(path.join(kitDir, 'tokens.json'), JSON.stringify(sampleTokens));

    const btnSpec = {
      name: 'Button',
      description: 'Initial description',
      category: 'action',
      anatomy: [{ name: 'root', description: 'root part', required: true }],
      props: [],
      base: {},
      variants: [],
      states: [{ name: 'Default', styles: {} }],
      usage: { do: [], dont: [] },
      screenshots: [],
    };
    fs.writeFileSync(path.join(compDir, 'button.json'), JSON.stringify(btnSpec));

    const manifest = {
      kitVersion: '1.0',
      name: 'Reload Kit',
      generator: { name: 'test', version: '1.0' },
      source: { type: 'figma', fileKey: 'abc', fileName: 'test.fig' },
      exportedAt: new Date().toISOString(),
      tokensFile: 'tokens.json',
      modes: ['light'],
      components: [{ name: 'Button', file: 'components/button.json' }],
    };
    fs.writeFileSync(path.join(kitDir, 'frame-relay.json'), JSON.stringify(manifest));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('hot reload: detects change to component file and updates cache', async () => {
    const cache = new KitCache(tmpDir, 50);
    cache.init(true);
    await cache.ready();

    expect(cache.findComponent('Button')?.spec.description).toBe('Initial description');

    const updatedSpec = {
      name: 'Button',
      description: 'Updated description after edit',
      category: 'action',
      anatomy: [{ name: 'root', description: 'root part', required: true }],
      props: [],
      base: {},
      variants: [],
      states: [{ name: 'Default', styles: {} }],
      usage: { do: [], dont: [] },
      screenshots: [],
    };

    const reloadedPromise = new Promise<void>((resolve) => {
      cache.onReload(resolve);
    });

    fs.writeFileSync(path.join(compDir, 'button.json'), JSON.stringify(updatedSpec));

    await reloadedPromise;
    expect(cache.findComponent('Button')?.spec.description).toBe('Updated description after edit');

    await cache.close();
  }, 10000);

  it('bad reload: broken kit keeps serving last good version and sets warning', async () => {
    const cache = new KitCache(tmpDir, 50);
    cache.init(true);
    await cache.ready();

    expect(cache.findComponent('Button')?.spec.description).toBe('Initial description');

    const reloadPromise = new Promise<void>((resolve) => {
      cache.onReload(resolve);
    });

    // Write malformed JSON
    fs.writeFileSync(path.join(compDir, 'button.json'), 'INVALID_JSON_HERE');

    await reloadPromise;

    // Confirms warning is set
    expect(cache.getReloadWarning()).toContain('Warning: Kit failed to reload');
    // Confirms last good kit is still served
    expect(cache.findComponent('Button')?.spec.description).toBe('Initial description');

    await cache.close();
  }, 10000);

  it('startup with 300 synthetic components finishes in under 1 second', () => {
    const largeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-mcp-scale-test-'));
    const largeKitDir = path.join(largeTmp, 'frame-relay-kit');
    const largeCompDir = path.join(largeKitDir, 'components');
    fs.mkdirSync(largeCompDir, { recursive: true });

    const sampleTokens = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../../examples/sample-kit/frame-relay-kit/tokens.json'),
        'utf-8',
      ),
    );
    fs.writeFileSync(path.join(largeKitDir, 'tokens.json'), JSON.stringify(sampleTokens));

    const manifestComponents: Array<{ name: string; file: string }> = [];
    for (let i = 0; i < 300; i++) {
      const name = `Component${i}`;
      const file = `components/${name}.json`;
      manifestComponents.push({ name, file });

      const spec = {
        name,
        description: `Synthetic component ${i}`,
        category: 'action',
        anatomy: [{ name: 'root', description: 'root part', required: true }],
        props: [{ name: 'variant', type: 'variant', options: ['default'], default: 'default' }],
        base: { root: { background: '{color.primary.500}' } },
        variants: [
          {
            props: { variant: 'default' },
            styles: { root: { background: '{color.primary.500}' } },
          },
        ],
        states: [{ name: 'Default', styles: { root: { background: '{color.primary.500}' } } }],
        usage: { do: ['Do use it'], dont: ['Do not break it'] },
        screenshots: [],
      };
      fs.writeFileSync(path.join(largeKitDir, file), JSON.stringify(spec));
    }

    const manifest = {
      kitVersion: '1.0',
      name: 'Large Synthetic Kit',
      generator: { name: 'test', version: '1.0' },
      source: { type: 'figma', fileKey: 'abc', fileName: 'test.fig' },
      exportedAt: new Date().toISOString(),
      tokensFile: 'tokens.json',
      modes: ['light', 'dark'],
      components: manifestComponents,
    };
    fs.writeFileSync(path.join(largeKitDir, 'frame-relay.json'), JSON.stringify(manifest));

    const t0 = performance.now();
    const cache = new KitCache(largeTmp);
    cache.init(false);
    const duration = performance.now() - t0;

    expect(cache.listComponents().length).toBe(300);
    expect(duration).toBeLessThan(1000);

    fs.rmSync(largeTmp, { recursive: true, force: true });
  });
});
