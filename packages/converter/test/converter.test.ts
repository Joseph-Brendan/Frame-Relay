import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ComponentSpec, validateComponent } from '@frame-relay/schema';
import {
  assembleKit,
  convertComponent,
  convertVariables,
  mapCounterAlign,
  mapJustifyAlign,
  NodeSnapshot,
  parseDescription,
  rgbaToHex,
  StyleIndex,
  variableNameToTokenPath,
  VariableIndex,
} from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixturesDir = join(__dirname, 'fixtures');
const sampleKitDir = join(__dirname, '../../../examples/sample-kit/frame-relay-kit');

function loadJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

interface RawToken {
  $value?: unknown;
  $type?: string;
  $extensions?: {
    'frame-relay'?: {
      modes?: Record<string, unknown>;
    };
  };
}

describe('Frame-Relay Converter Core', () => {
  const variablesSnapshot = loadJson<{
    collections: Array<{
      id: string;
      name: string;
      modes: Array<{ modeId: string; name: string }>;
      defaultModeId: string;
    }>;
    variables: Array<{
      id: string;
      name: string;
      resolvedType: string;
      valuesByMode: Record<string, unknown>;
      scopes?: string[];
    }>;
  }>(join(fixturesDir, 'variables.json'));

  const stylesIndex = loadJson<StyleIndex>(join(fixturesDir, 'styles.json'));
  const convertedVars = convertVariables(variablesSnapshot);
  const variableIndex: VariableIndex = convertedVars.variableIndex;

  describe('Unit Tests', () => {
    it('variableNameToTokenPath converts slashes, spaces, and camelCase to dot-separated kebab-case', () => {
      expect(variableNameToTokenPath('color/Primary/500')).toBe('color.primary.500');
      expect(variableNameToTokenPath('radius/largeRadius')).toBe('radius.large-radius');
      expect(variableNameToTokenPath('space/gap between items')).toBe('space.gap-between-items');
      expect(variableNameToTokenPath('typography/Heading 1')).toBe('typography.heading-1');
      expect(variableNameToTokenPath('fontFamily')).toBe('font-family');
    });

    it('rgbaToHex generates 6-digit hex or 8-digit hex when opacity < 1', () => {
      expect(rgbaToHex({ r: 1, g: 1, b: 1 }, 1)).toBe('#ffffff');
      expect(rgbaToHex({ r: 0, g: 0, b: 0 }, 1)).toBe('#000000');
      expect(rgbaToHex({ r: 0.145098, g: 0.388235, b: 0.921569 }, 1)).toBe('#2563eb');
      expect(rgbaToHex({ r: 1, g: 0, b: 0 }, 0.5)).toBe('#ff000080');
      expect(rgbaToHex({ r: 0, g: 1, b: 0 }, 0)).toBe('#00ff0000');
    });

    it('alignment mapping maps primaryAxisAlignItems and counterAxisAlignItems correctly', () => {
      expect(mapJustifyAlign('MIN')).toBe('start');
      expect(mapJustifyAlign('CENTER')).toBe('center');
      expect(mapJustifyAlign('MAX')).toBe('end');
      expect(mapJustifyAlign('SPACE_BETWEEN')).toBe('space-between');
      expect(mapJustifyAlign('OTHER')).toBeUndefined();

      expect(mapCounterAlign('MIN')).toBe('start');
      expect(mapCounterAlign('CENTER')).toBe('center');
      expect(mapCounterAlign('MAX')).toBe('end');
      expect(mapCounterAlign('BASELINE')).toBe('baseline');
      expect(mapCounterAlign('UNKNOWN')).toBeUndefined();
    });

    it("parseDescription extracts description, Do/Don't guidelines, role, and accessibility notes", () => {
      const text = [
        'Trigger an immediate action or submission.',
        'Role: button',
        'A11y: Supports activation using Enter and Space keys.',
        'A11y: Sets aria-disabled when in the disabled state.',
        'Do: Use Primary variant for the single most prominent action.',
        "Don't: Do not place multiple Primary buttons next to each other.",
      ].join('\n');

      const result = parseDescription(text, 'Button');
      expect(result.description).toBe('Trigger an immediate action or submission.');
      expect(result.usage.do).toEqual([
        'Use Primary variant for the single most prominent action.',
      ]);
      expect(result.usage.dont).toEqual([
        'Do not place multiple Primary buttons next to each other.',
      ]);
      expect(result.accessibility?.role).toBe('button');
      expect(result.accessibility?.notes).toEqual([
        'Supports activation using Enter and Space keys.',
        'Sets aria-disabled when in the disabled state.',
      ]);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('Variables to DTCG Tokens', () => {
    it('convertVariables generates valid DTCG tokens matching sample tokens.json including dark mode', () => {
      const sampleTokens = loadJson<Record<string, Record<string, Record<string, RawToken>>>>(
        join(sampleKitDir, 'tokens.json'),
      );
      const { tokens, warnings } = convertedVars;

      expect(warnings).toHaveLength(0);
      expect(tokens).toBeDefined();

      const colorGroup = tokens.color as { $type: string; primary: { '500': RawToken } };
      expect(colorGroup.$type).toBe('color');
      expect(colorGroup.primary['500'].$value).toBe(sampleTokens.color.primary['500'].$value);
      expect(colorGroup.primary['500'].$extensions?.['frame-relay']?.modes?.dark).toBe(
        sampleTokens.color.primary['500'].$extensions?.['frame-relay']?.modes?.dark,
      );

      const radiusGroup = tokens.radius as {
        $type: string;
        sm: RawToken;
        md: RawToken;
        lg: RawToken;
      };
      expect(radiusGroup.$type).toBe('dimension');
      expect(radiusGroup.sm.$value).toBe('6px');
      expect(radiusGroup.md.$value).toBe('12px');
      expect(radiusGroup.lg.$value).toBe('16px');

      const spaceGroup = tokens.space as { $type: string; [key: string]: RawToken };
      expect(spaceGroup.$type).toBe('dimension');
      expect(spaceGroup['1'].$value).toBe('4px');
      expect(spaceGroup['2'].$value).toBe('8px');
      expect(spaceGroup['4'].$value).toBe('16px');
    });
  });

  describe('Messy Component Warnings', () => {
    it('messy.set.json produces expected warnings with correct codes and layerPaths', () => {
      const messyNode = loadJson<NodeSnapshot>(join(fixturesDir, 'messy.set.json'));
      const { spec, warnings } = convertComponent({
        node: messyNode,
        variables: variableIndex,
        styles: stylesIndex,
      });

      expect(spec).not.toBeNull();
      const warningCodes = warnings.map((w) => w.code);

      expect(warningCodes).toContain('BAD_COMPONENT_NAME');
      expect(warningCodes).toContain('MISSING_DESCRIPTION');
      expect(warningCodes).toContain('MISSING_USAGE');
      expect(warningCodes).toContain('NO_AUTO_LAYOUT');
      expect(warningCodes).toContain('ABSOLUTE_CHILD');
      expect(warningCodes).toContain('BAD_PART_NAME');
      expect(warningCodes).toContain('UNSUPPORTED_PAINT');
      expect(warningCodes).toContain('MIXED_RADIUS');
      expect(warningCodes).toContain('UNKNOWN_STATE');

      const badPartWarning = warnings.find((w) => w.code === 'BAD_PART_NAME');
      expect(badPartWarning?.layerPath).toContain('Frame 12');

      const absWarning = warnings.find((w) => w.code === 'ABSOLUTE_CHILD');
      expect(absWarning?.layerPath).toContain('badge');
    });
  });

  describe('Standalone Component', () => {
    it('standalone.component.json produces base only, no variants, and states [Default]', () => {
      const standaloneNode = loadJson<NodeSnapshot>(join(fixturesDir, 'standalone.component.json'));
      const { spec, warnings, screenshotJobs } = convertComponent({
        node: standaloneNode,
        variables: variableIndex,
        styles: stylesIndex,
      });

      expect(warnings.filter((w) => w.severity === 'error')).toHaveLength(0);
      expect(spec).not.toBeNull();
      expect(spec!.name).toBe('Badge');
      expect(spec!.variants).toEqual([]);
      expect(spec!.states).toEqual([{ name: 'Default', styles: {} }]);
      expect(spec!.base.root).toBeDefined();
      expect(spec!.base.label).toBeDefined();
      expect(spec!.screenshots).toHaveLength(1);
      expect(spec!.screenshots[0].path).toBe('screenshots/Badge--Default.png');
      expect(screenshotJobs).toHaveLength(1);
      expect(screenshotJobs[0].nodeId).toBe(standaloneNode.id);
    });
  });

  describe('Golden Tests', () => {
    it('converts Card snapshot matching Card.json layout, anatomy, props, and base', () => {
      const cardNode = loadJson<NodeSnapshot>(join(fixturesDir, 'card.set.json'));
      const sampleCard = loadJson<ComponentSpec>(join(sampleKitDir, 'components/Card.json'));

      const { spec, warnings } = convertComponent({
        node: cardNode,
        variables: variableIndex,
        styles: stylesIndex,
      });

      expect(spec).not.toBeNull();
      expect(spec!.name).toBe(sampleCard.name);
      expect(spec!.description).toBe(sampleCard.description);
      expect(spec!.layout).toEqual(sampleCard.layout);

      expect(spec!.anatomy.map((a) => a.name)).toEqual(sampleCard.anatomy.map((a) => a.name));

      expect(spec!.base.body?.borderRadius).toEqual({ raw: '13px' });
      expect(warnings.some((w) => w.code === 'RAW_VALUE' && w.message.includes('13px'))).toBe(true);

      const val = validateComponent(spec!);
      expect(val.ok).toBe(true);
    });

    it('converts Input snapshot matching Input.json layout, anatomy, props, and states', () => {
      const inputNode = loadJson<NodeSnapshot>(join(fixturesDir, 'input.set.json'));
      const sampleInput = loadJson<ComponentSpec>(join(sampleKitDir, 'components/Input.json'));

      const { spec } = convertComponent({
        node: inputNode,
        variables: variableIndex,
        styles: stylesIndex,
      });

      expect(spec).not.toBeNull();
      expect(spec!.name).toBe(sampleInput.name);
      expect(spec!.layout).toEqual(sampleInput.layout);
      expect(spec!.props.map((p) => p.name)).toEqual(sampleInput.props.map((p) => p.name));
      expect(spec!.states).toEqual(sampleInput.states);

      const val = validateComponent(spec!);
      expect(val.ok).toBe(true);
    });

    it('converts Button snapshot matching Button.json layout, anatomy, props, and states', () => {
      const buttonNode = loadJson<NodeSnapshot>(join(fixturesDir, 'button.set.json'));
      const sampleButton = loadJson<ComponentSpec>(join(sampleKitDir, 'components/Button.json'));

      const { spec } = convertComponent({
        node: buttonNode,
        variables: variableIndex,
        styles: stylesIndex,
      });

      expect(spec).not.toBeNull();
      expect(spec!.name).toBe(sampleButton.name);
      expect(spec!.layout).toEqual(sampleButton.layout);
      expect(spec!.anatomy.map((a) => a.name)).toEqual(sampleButton.anatomy.map((a) => a.name));
      expect(spec!.states).toEqual(sampleButton.states);

      const val = validateComponent(spec!);
      expect(val.ok).toBe(true);
    });
  });

  describe('Kit Assembly and Validation', () => {
    it('assembleKit builds complete manifest and file map passing validateKit', () => {
      const buttonNode = loadJson<NodeSnapshot>(join(fixturesDir, 'button.set.json'));
      const inputNode = loadJson<NodeSnapshot>(join(fixturesDir, 'input.set.json'));
      const cardNode = loadJson<NodeSnapshot>(join(fixturesDir, 'card.set.json'));

      const btn = convertComponent({
        node: buttonNode,
        variables: variableIndex,
        styles: stylesIndex,
      }).spec!;
      const inp = convertComponent({
        node: inputNode,
        variables: variableIndex,
        styles: stylesIndex,
      }).spec!;
      const crd = convertComponent({
        node: cardNode,
        variables: variableIndex,
        styles: stylesIndex,
      }).spec!;

      const sampleTokens = loadJson<Record<string, unknown>>(join(sampleKitDir, 'tokens.json'));

      const { files, warnings } = assembleKit({
        components: [btn, inp, crd],
        tokens: sampleTokens,
        source: {
          type: 'figma',
          fileKey: 'test-file-key',
          fileName: 'TestKit',
        },
        generator: {
          name: 'Frame-Relay Plugin',
          version: '1.0.0',
        },
        exportedAt: '2026-10-03T20:00:00.000Z',
      });

      expect(warnings.filter((w) => w.severity === 'error')).toHaveLength(0);
      expect(files['frame-relay.json']).toBeDefined();
      expect(files['tokens.json']).toBeDefined();
      expect(files['components/Button.json']).toBeDefined();
      expect(files['components/Input.json']).toBeDefined();
      expect(files['components/Card.json']).toBeDefined();
    });
  });

  describe('Determinism', () => {
    it('running the same conversion twice produces byte-identical JSON', () => {
      const buttonNode = loadJson<NodeSnapshot>(join(fixturesDir, 'button.set.json'));

      const res1 = convertComponent({
        node: buttonNode,
        variables: variableIndex,
        styles: stylesIndex,
      });
      const res2 = convertComponent({
        node: buttonNode,
        variables: variableIndex,
        styles: stylesIndex,
      });

      const json1 = JSON.stringify(res1.spec);
      const json2 = JSON.stringify(res2.spec);

      expect(json1).toBe(json2);
    });
  });

  describe('Performance', () => {
    it('converts 300 synthetic component sets in under 2 seconds', () => {
      const buttonNode = loadJson<NodeSnapshot>(join(fixturesDir, 'button.set.json'));

      const start = performance.now();
      for (let i = 0; i < 300; i++) {
        convertComponent({
          node: buttonNode,
          variables: variableIndex,
          styles: stylesIndex,
        });
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Error Resilience', () => {
    it('bad input (null, {}, TEXT node) returns warnings and never throws', () => {
      expect(() => {
        const res = convertComponent({ node: null, variables: variableIndex, styles: stylesIndex });
        expect(res.spec).toBeNull();
        expect(res.warnings[0].code).toBe('NOT_A_COMPONENT');
      }).not.toThrow();

      expect(() => {
        const res = convertComponent({ node: {}, variables: variableIndex, styles: stylesIndex });
        expect(res.spec).toBeNull();
        expect(res.warnings[0].code).toBe('NOT_A_COMPONENT');
      }).not.toThrow();

      expect(() => {
        const res = convertComponent({
          node: { id: 'text-1', name: 'Text', type: 'TEXT' },
          variables: variableIndex,
          styles: stylesIndex,
        });
        expect(res.spec).toBeNull();
        expect(res.warnings[0].code).toBe('NOT_A_COMPONENT');
      }).not.toThrow();
    });
  });
});
