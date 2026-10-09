import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FrameSummary, VariableIndex } from '@josephbrendan/schema';
import { convertVariables, NodeSnapshot, summarizeFrame } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixturesDir = join(__dirname, 'fixtures');

function loadJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

describe('summarizeFrame', () => {
  const variablesSnapshot = loadJson<Parameters<typeof convertVariables>[0]>(
    join(fixturesDir, 'variables.json'),
  );
  const variableIndex: VariableIndex = convertVariables(variablesSnapshot).variableIndex;
  const frameNode = loadJson<NodeSnapshot>(join(fixturesDir, 'frame.node.json'));

  it('summarizes a frame: layout, size, children, instances, tokens and raw values', () => {
    const expected: FrameSummary = {
      name: 'Hero Card',
      layout: {
        direction: 'column',
        gap: '{space.3}',
        padding: {
          top: '{space.4}',
          right: '{space.4}',
          bottom: '{space.4}',
          left: '{space.4}',
        },
        justify: 'start',
        align: 'start',
        width: { fixed: { raw: '320px' } },
        height: { fixed: { raw: '480px' } },
      },
      size: { width: 320, height: 480 },
      childCount: 6,
      componentInstances: ['Badge', 'Button'],
      tokenReferences: [
        '{color.neutral.500}',
        '{color.neutral.900}',
        '{radius.md}',
        '{space.3}',
        '{space.4}',
      ],
      rawValues: ['#f8fafc', '320px', '400 14px/normal Inter', '480px', '600 24px/normal Inter'],
    };

    expect(summarizeFrame(frameNode, variableIndex, {})).toEqual(expected);
  });

  it('is deterministic for identical input', () => {
    const first = summarizeFrame(frameNode, variableIndex, {});
    const second = summarizeFrame(frameNode, variableIndex, {});
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('never throws and returns an empty summary for non-node input', () => {
    const cases: unknown[] = [null, undefined, {}, 42, 'frame', []];

    for (const input of cases) {
      const summary = summarizeFrame(input);
      expect(summary.name).toBe('Frame');
      expect(summary.size).toEqual({ width: 0, height: 0 });
      expect(summary.childCount).toBe(0);
      expect(summary.componentInstances).toEqual([]);
      expect(summary.tokenReferences).toEqual([]);
      expect(summary.rawValues).toEqual([]);
    }
  });

  it('summarizes a minimal node without variables as raw values', () => {
    const summary = summarizeFrame({
      id: '1:1',
      name: 'Plain Frame',
      type: 'FRAME',
      width: 100,
      height: 50,
      children: [{ id: '1:2', name: 'child', type: 'RECTANGLE' }],
    });

    expect(summary.name).toBe('Plain Frame');
    expect(summary.size).toEqual({ width: 100, height: 50 });
    expect(summary.childCount).toBe(1);
    expect(summary.componentInstances).toEqual([]);
    expect(summary.tokenReferences).toEqual([]);
    expect(summary.rawValues).toEqual(['100px', '50px']);
  });
});
