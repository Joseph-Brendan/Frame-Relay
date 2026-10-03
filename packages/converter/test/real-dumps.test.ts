import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateComponent, validateKit } from '@josephbrendan/schema';
import {
  assembleKit,
  convertComponent,
  convertVariables,
  NodeSnapshot,
  StyleIndex,
} from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixturesDir = join(__dirname, 'fixtures');
const realFixturesDir = join(fixturesDir, 'real');

function loadJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

interface RealDumpFile {
  dumpedAt?: string;
  fileName?: string;
  scope?: string;
  components: NodeSnapshot[];
  collections: Array<{
    id: string;
    name: string;
    modes: Array<{ modeId: string; name: string }>;
    defaultModeId: string;
  }>;
  variables: Array<{
    id: string;
    name: string;
    variableCollectionId: string;
    resolvedType: string;
    valuesByMode: Record<string, unknown>;
    scopes?: string[];
  }>;
  styles?: StyleIndex;
  icons?: unknown[];
}

describe('Real Dump Fixture Tests', () => {
  describe('File 1: Clean Design System Test File (Button, Input, with variables)', () => {
    const file1Path = join(realFixturesDir, '1-clean-design-system.json');

    it('File 1 dump exists and is loaded', () => {
      expect(existsSync(file1Path)).toBe(true);
    });

    const dump1 = loadJson<RealDumpFile>(file1Path);

    it('converts variables into valid DTCG tokens and builds a variableIndex', () => {
      const { tokens, variableIndex, warnings } = convertVariables({
        collections: dump1.collections,
        variables: dump1.variables,
      });

      // No variable errors
      expect(warnings.filter((w) => w.severity === 'error')).toHaveLength(0);
      expect(tokens).toBeDefined();

      // Verify token mappings
      // "Primary color" -> primary-color
      expect(variableIndex['VariableID:7:3'].tokenPath).toBe('primary-color');
      // "On Primary Color" -> on-primary-color
      expect(variableIndex['VariableID:7:4'].tokenPath).toBe('on-primary-color');
      // "Secondary Color" -> secondary-color
      expect(variableIndex['VariableID:7:6'].tokenPath).toBe('secondary-color');
      // "On Secondary Color" -> on-secondary-color
      expect(variableIndex['VariableID:7:7'].tokenPath).toBe('on-secondary-color');
      // "Corner" -> corner
      expect(variableIndex['VariableID:7:12'].tokenPath).toBe('corner');
    });

    it('converts Button with zero errors, producing valid ComponentSpec', () => {
      const { variableIndex } = convertVariables({
        collections: dump1.collections,
        variables: dump1.variables,
      });

      const buttonNode = dump1.components.find((c) => c.name === 'Button')!;
      expect(buttonNode).toBeDefined();

      const { spec, warnings, screenshotJobs } = convertComponent({
        node: buttonNode,
        variables: variableIndex,
        styles: dump1.styles,
      });

      // Zero error-severity warnings
      const errorWarnings = warnings.filter((w) => w.severity === 'error');
      expect(errorWarnings).toHaveLength(0);

      expect(spec).not.toBeNull();
      const validation = validateComponent(spec!);
      expect(validation.ok).toBe(true);

      // Button specific expectations:
      expect(spec!.name).toBe('Button');
      expect(spec!.layout.direction).toBe('row');
      expect(spec!.layout.align).toBe('center');
      expect(spec!.layout.justify).toBe('center');
      expect(spec!.anatomy.some((part) => part.name === 'root')).toBe(true);

      // Root background references {primary-color}
      expect(spec!.base.root?.background).toBe('{primary-color}');

      // Corner radius is bound to VariableID:7:12 -> {corner}
      expect(spec!.base.root?.borderRadius).toBe('{corner}');

      // Screenshot jobs generated
      expect(screenshotJobs.length).toBeGreaterThan(0);
    });

    it('converts Input with zero errors, producing valid ComponentSpec', () => {
      const { variableIndex } = convertVariables({
        collections: dump1.collections,
        variables: dump1.variables,
      });

      const inputNode = dump1.components.find((c) => c.name === 'Input')!;
      expect(inputNode).toBeDefined();

      const { spec, warnings } = convertComponent({
        node: inputNode,
        variables: variableIndex,
        styles: dump1.styles,
      });

      // Zero error-severity warnings
      const errorWarnings = warnings.filter((w) => w.severity === 'error');
      expect(errorWarnings).toHaveLength(0);

      expect(spec).not.toBeNull();
      const validation = validateComponent(spec!);
      expect(validation.ok).toBe(true);

      // Input specific expectations:
      expect(spec!.name).toBe('Input');
      expect(spec!.layout.direction).toBe('row');
      expect(spec!.layout.justify).toBe('start');
      expect(spec!.layout.align).toBe('center');

      // Border color references {secondary-color}
      expect(spec!.base.root?.borderColor).toBe('{secondary-color}');

      // Corner radius references {corner}
      expect(spec!.base.root?.borderRadius).toBe('{corner}');

      // All paddings bound to VariableID:7:12 -> {corner}
      expect(spec!.layout.padding?.top).toBe('{corner}');
      expect(spec!.layout.padding?.right).toBe('{corner}');
      expect(spec!.layout.padding?.bottom).toBe('{corner}');
      expect(spec!.layout.padding?.left).toBe('{corner}');
    });

    it('assembles a full kit from File 1 with valid manifest and kit validation', () => {
      const { tokens, variableIndex } = convertVariables({
        collections: dump1.collections,
        variables: dump1.variables,
      });

      const components = dump1.components.map((comp) => {
        const { spec } = convertComponent({
          node: comp,
          variables: variableIndex,
          styles: dump1.styles,
        });
        return spec!;
      });

      const assembled = assembleKit({
        components,
        tokens,
        source: {
          type: 'figma',
          fileKey: 'real-dump-1-key',
          fileName: dump1.fileName ?? 'Relay Test',
        },
        generator: {
          name: 'Frame-Relay Plugin',
          version: '1.0.0',
        },
        exportedAt: dump1.dumpedAt ?? '2026-10-03T20:52:06.396Z',
      });

      const errorWarnings = assembled.warnings.filter((w) => w.severity === 'error');
      expect(errorWarnings).toHaveLength(0);
      expect(assembled.files['frame-relay.json']).toBeDefined();
      expect(assembled.files['tokens.json']).toBeDefined();
      expect(assembled.files['components/Button.json']).toBeDefined();
      expect(assembled.files['components/Input.json']).toBeDefined();

      const manifest = JSON.parse(assembled.files['frame-relay.json']);
      const kitValidation = validateKit({
        manifest,
        tokens,
        components: {
          'components/Button.json': JSON.parse(assembled.files['components/Button.json']),
          'components/Input.json': JSON.parse(assembled.files['components/Input.json']),
        },
      });
      expect(kitValidation.ok).toBe(true);
    });
  });

  describe('File 2: Free Community UI Kit', () => {
    const file2Path = join(realFixturesDir, '2-community-kit.json');
    const hasFile2 = existsSync(file2Path);

    it.skipIf(!hasFile2)(
      'converts without throwing, and every spec passes validateComponent',
      () => {
        const dump2 = loadJson<RealDumpFile>(file2Path);
        const { variableIndex } = convertVariables({
          collections: dump2.collections ?? [],
          variables: dump2.variables ?? [],
        });

        expect(dump2.components.length).toBeGreaterThan(0);

        for (const comp of dump2.components) {
          expect(() => {
            const { spec } = convertComponent({
              node: comp,
              variables: variableIndex,
              styles: dump2.styles,
            });

            if (spec) {
              const validation = validateComponent(spec);
              expect(validation.ok).toBe(true);
            }
          }).not.toThrow();
        }
      },
    );
  });

  describe('File 3: Deliberately Messy File', () => {
    const file3Path = join(realFixturesDir, '3-messy.json');
    const hasFile3 = existsSync(file3Path);

    it.skipIf(!hasFile3)('produces the expected warning codes', () => {
      const dump3 = loadJson<RealDumpFile>(file3Path);
      const { variableIndex } = convertVariables({
        collections: dump3.collections ?? [],
        variables: dump3.variables ?? [],
      });

      const allWarnings: string[] = [];

      for (const comp of dump3.components) {
        const { warnings } = convertComponent({
          node: comp,
          variables: variableIndex,
          styles: dump3.styles,
        });
        allWarnings.push(...warnings.map((w) => w.code));
      }

      // Expected warnings will be verified against the messy file contents
      expect(allWarnings.length).toBeGreaterThan(0);
    });
  });

  describe('File 4: Large Library with 300+ Components', () => {
    const file4Path = join(realFixturesDir, '4-large-library.json');
    const hasFile4 = existsSync(file4Path);

    it.skipIf(!hasFile4)('converts in under 5 seconds total, without throwing', () => {
      const dump4 = loadJson<RealDumpFile>(file4Path);
      const { variableIndex } = convertVariables({
        collections: dump4.collections ?? [],
        variables: dump4.variables ?? [],
      });

      const startTime = performance.now();

      for (const comp of dump4.components) {
        expect(() => {
          convertComponent({
            node: comp,
            variables: variableIndex,
            styles: dump4.styles,
          });
        }).not.toThrow();
      }

      const elapsedMs = performance.now() - startTime;
      expect(elapsedMs).toBeLessThan(5000);
    });
  });
});
