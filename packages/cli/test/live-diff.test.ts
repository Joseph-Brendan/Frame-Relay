import { describe, expect, it } from 'vitest';
import type { ComponentSpec } from '@frame-relay/schema';
import { diffComponentSpecs } from '../src/index.js';

function makeSpec(overrides: Partial<ComponentSpec> = {}): ComponentSpec {
  return {
    name: 'Button',
    description: 'A button',
    anatomy: [{ name: 'root', description: 'Root layer', required: true }],
    props: [],
    base: { root: { borderRadius: { raw: '12px' } } },
    variants: [],
    states: [{ name: 'Default', styles: {} }],
    usage: { do: [], dont: [] },
    screenshots: [],
    ...overrides,
  };
}

describe('diffComponentSpecs', () => {
  it('returns no differences for identical specs', () => {
    expect(diffComponentSpecs(makeSpec(), makeSpec())).toEqual([]);
  });

  it('flags a changed radius in plain English', () => {
    const live = makeSpec();
    live.base.root.borderRadius = { raw: '16px' };

    expect(diffComponentSpecs(live, makeSpec())).toEqual([
      'base.root.borderRadius: Figma has 16px, kit has 12px',
    ]);
  });

  it('flags a new variant', () => {
    const live = makeSpec({
      variants: [
        { props: { Variant: 'Ghost' }, styles: { root: { background: { raw: '#fff' } } } },
      ],
    });

    expect(diffComponentSpecs(live, makeSpec())).toEqual([
      'new variant: Variant=Ghost (not in the exported kit)',
    ]);
  });

  it('flags a removed state', () => {
    const kit = makeSpec({
      states: [
        { name: 'Default', styles: {} },
        { name: 'Disabled', styles: {} },
      ],
    });

    expect(diffComponentSpecs(makeSpec(), kit)).toEqual([
      'state removed: Disabled (in the exported kit, missing in Figma)',
    ]);
  });

  it('flags variant style changes for a matching variant', () => {
    const live = makeSpec({
      variants: [
        { props: { State: 'Hover' }, styles: { root: { background: { raw: '#111111' } } } },
      ],
    });
    const kit = makeSpec({
      variants: [
        { props: { State: 'Hover' }, styles: { root: { background: { raw: '#222222' } } } },
      ],
    });

    expect(diffComponentSpecs(live, kit)).toEqual([
      'variants[State=Hover].root.background: Figma has #111111, kit has #222222',
    ]);
  });

  it('flags prop options, layout and token changes', () => {
    const live = makeSpec({
      layout: { direction: 'row', gap: '{space.4}' },
      props: [{ name: 'size', type: 'variant', options: ['Medium', 'Large'] }],
    });
    const kit = makeSpec({
      layout: { direction: 'row', gap: '{space.2}' },
      props: [{ name: 'size', type: 'variant', options: ['Medium'] }],
    });

    expect(diffComponentSpecs(live, kit)).toEqual([
      'layout.gap: Figma has {space.4}, kit has {space.2}',
      'prop "size" options: Figma has (Medium, Large), kit has (Medium)',
    ]);
  });

  it('reports removed parts and new props against the kit', () => {
    const live = makeSpec({ props: [{ name: 'loading', type: 'boolean' }] });
    const kit = makeSpec();

    expect(diffComponentSpecs(live, kit)).toEqual(['new prop: loading (boolean)']);
  });
});
