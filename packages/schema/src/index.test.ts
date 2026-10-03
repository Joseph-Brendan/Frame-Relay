import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  findRawValues,
  formatValidationError,
  KIT_VERSION,
  resolveReference,
  validateComponent,
  validateKit,
  validateManifest,
  validateTokens,
} from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.resolve(__dirname, '../test/fixtures');
const SAMPLE_KIT_DIR = path.resolve(__dirname, '../../../examples/sample-kit/frame-relay-kit');

function loadJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

describe('schema package: Phase 2 contract tests', () => {
  it('exports KIT_VERSION as 1.0', () => {
    expect(KIT_VERSION).toBe('1.0');
  });

  describe('sample kit validation', () => {
    it('loads sample kit from disk and passes validateKit with zero errors', () => {
      const manifest = loadJson(path.join(SAMPLE_KIT_DIR, 'frame-relay.json'));
      const tokens = loadJson(path.join(SAMPLE_KIT_DIR, 'tokens.json'));
      const components = {
        'components/Button.json': loadJson(path.join(SAMPLE_KIT_DIR, 'components/Button.json')),
        'components/Input.json': loadJson(path.join(SAMPLE_KIT_DIR, 'components/Input.json')),
        'components/Card.json': loadJson(path.join(SAMPLE_KIT_DIR, 'components/Card.json')),
      };

      const result = validateKit({ manifest, tokens, components });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        expect(result.errors).toEqual([]);
      }
    });

    it('findRawValues finds exactly the one raw value in Card', () => {
      const cardJson = loadJson(path.join(SAMPLE_KIT_DIR, 'components/Card.json'));
      const compRes = validateComponent(cardJson, 'components/Card.json');
      expect(compRes.ok).toBe(true);

      if (compRes.ok) {
        const rawValues = findRawValues(compRes.data);
        expect(rawValues).toHaveLength(1);
        expect(rawValues[0]).toEqual({
          path: 'base.body.borderRadius',
          value: '13px',
        });
      }
    });
  });

  describe('two-step alias chain', () => {
    it('resolveReference follows a two-step alias chain', () => {
      const tokens = {
        color: {
          brand: {
            accent: { $value: '{color.palette.blue}' },
          },
          palette: {
            blue: { $value: '{color.core.500}' },
          },
          core: {
            500: { $value: '#3b82f6', $type: 'color' },
          },
        },
      };

      const resolved = resolveReference('{color.brand.accent}', tokens);
      expect(resolved.value).toBe('#3b82f6');
      expect(resolved.path).toBe('color.core.500');
      expect(resolved.chain).toEqual([
        'color.brand.accent',
        'color.palette.blue',
        'color.core.500',
      ]);
    });
  });

  describe('failure fixtures', () => {
    it('1. fails on lowercase component name with right path and message', () => {
      const fixture = loadJson(path.join(FIXTURES_DIR, '01-lowercase-component-name.json'));
      const result = validateComponent(fixture, 'components/button.json');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(0);
        const nameError = result.errors.find((e) => e.path === 'name');
        expect(nameError).toBeDefined();
        expect(nameError?.message).toContain('PascalCase');
        expect(nameError?.file).toBe('components/button.json');
      }
    });

    it('2. fails on unknown state "Active" with right path and message', () => {
      const fixture = loadJson(path.join(FIXTURES_DIR, '02-unknown-state.json'));
      const result = validateComponent(fixture, 'components/Button.json');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const stateError = result.errors.find((e) => e.path.includes('states[0].name'));
        expect(stateError).toBeDefined();
        expect(stateError?.message).toContain('State name must be one of');
      }
    });

    it('3. fails on unresolved token reference with right path and message', () => {
      const fixture = loadJson(path.join(FIXTURES_DIR, '03-unresolved-token-ref.json'));
      const tokens = loadJson(path.join(SAMPLE_KIT_DIR, 'tokens.json'));
      const manifest = {
        kitVersion: '1.0',
        name: 'Test',
        generator: { name: 'test', version: '1.0' },
        source: { type: 'figma', fileKey: 'KEY', fileName: 'File' },
        exportedAt: '2026-10-03T12:00:00.000Z',
        components: [{ name: 'Button', file: 'components/Button.json' }],
      };

      const result = validateKit({
        manifest,
        tokens,
        components: { 'components/Button.json': fixture },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        const refError = result.errors.find((e) => e.path.includes('base.root.background'));
        expect(refError).toBeDefined();
        expect(refError?.message).toContain('color.doesnotexist');
      }
    });

    it('4. fails on variant value not in options with right path and exact message format', () => {
      const fixture = loadJson(path.join(FIXTURES_DIR, '04-variant-value-not-in-options.json'));
      const tokens = loadJson(path.join(SAMPLE_KIT_DIR, 'tokens.json'));
      const manifest = {
        kitVersion: '1.0',
        name: 'Test',
        generator: { name: 'test', version: '1.0' },
        source: { type: 'figma', fileKey: 'KEY', fileName: 'File' },
        exportedAt: '2026-10-03T12:00:00.000Z',
        components: [{ name: 'Button', file: 'components/Button.json' }],
      };

      const result = validateKit({
        manifest,
        tokens,
        components: { 'components/Button.json': fixture },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        const optionError = result.errors.find((e) => e.path === 'variants[2].props.Size');
        expect(optionError).toBeDefined();
        expect(optionError?.message).toBe(
          '"Huge" is not one of the Size options (Small, Medium, Large)',
        );
        expect(formatValidationError(optionError!)).toBe(
          'components/Button.json > variants[2].props.Size: "Huge" is not one of the Size options (Small, Medium, Large)',
        );
      }
    });

    it('5. fails on undeclared anatomy part with right path and message', () => {
      const fixture = loadJson(path.join(FIXTURES_DIR, '05-undeclared-anatomy-part.json'));
      const tokens = loadJson(path.join(SAMPLE_KIT_DIR, 'tokens.json'));
      const manifest = {
        kitVersion: '1.0',
        name: 'Test',
        generator: { name: 'test', version: '1.0' },
        source: { type: 'figma', fileKey: 'KEY', fileName: 'File' },
        exportedAt: '2026-10-03T12:00:00.000Z',
        components: [{ name: 'Button', file: 'components/Button.json' }],
      };

      const result = validateKit({
        manifest,
        tokens,
        components: { 'components/Button.json': fixture },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        const anatomyError = result.errors.find((e) => e.path === 'base.badge');
        expect(anatomyError).toBeDefined();
        expect(anatomyError?.message).toContain(
          'Anatomy part "badge" used in base is not declared in anatomy',
        );
      }
    });

    it('6. fails on kitVersion "2.0" with message stating supported versions', () => {
      const fixture = loadJson(path.join(FIXTURES_DIR, '06-unsupported-kit-version.json'));
      const result = validateManifest(fixture);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const versionError = result.errors.find((e) => e.path === 'kitVersion');
        expect(versionError).toBeDefined();
        expect(versionError?.message).toContain('Supported versions: 1.0');
      }
    });

    it('7. fails when manifest lists a component file that does not exist', () => {
      const fixture = loadJson(path.join(FIXTURES_DIR, '07-missing-component-file.json'));
      const tokens = loadJson(path.join(SAMPLE_KIT_DIR, 'tokens.json'));

      const result = validateKit({
        manifest: fixture,
        tokens,
        components: {},
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        const missingFileError = result.errors.find((e) => e.path === 'components[0].file');
        expect(missingFileError).toBeDefined();
        expect(missingFileError?.message).toContain(
          'Manifest component file "components/Modal.json" does not exist in kit',
        );
      }
    });

    it('8. fails on circular token reference with right message and path', () => {
      const fixture = loadJson(path.join(FIXTURES_DIR, '08-circular-token-ref.json'));
      const result = validateTokens(fixture, 'tokens.json');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(0);
        const circularError = result.errors.find((e) =>
          e.message.includes('Circular token reference detected'),
        );
        expect(circularError).toBeDefined();
        expect(circularError?.file).toBe('tokens.json');
      }
    });
  });
});
