import { describe, expect, it } from 'vitest';
import { resolveLiveTarget } from '../src/main/live-resolve.js';

function componentSet() {
  return { id: 'set-1', name: 'Button', type: 'COMPONENT_SET', children: [] };
}

function standaloneComponent() {
  return { id: 'c-1', name: 'Badge', type: 'COMPONENT', parent: null };
}

function variant(parent: unknown) {
  return {
    id: 'v-1',
    name: 'Variant=Primary, Size=Medium',
    type: 'COMPONENT',
    parent,
    variantProperties: { Variant: 'Primary', Size: 'Medium' },
  };
}

function instance(getMainComponentAsync: () => Promise<unknown>) {
  return {
    id: 'i-1',
    name: 'Button instance',
    type: 'INSTANCE',
    parent: null,
    getMainComponentAsync,
  };
}

describe('resolveLiveTarget', () => {
  it('returns null for nothing or several layers selected', async () => {
    expect(await resolveLiveTarget([])).toBeNull();
    expect(await resolveLiveTarget(null)).toBeNull();
    expect(await resolveLiveTarget([componentSet(), standaloneComponent()])).toBeNull();
  });

  it('returns a component set as a component', async () => {
    const set = componentSet();
    const target = await resolveLiveTarget([set]);
    expect(target).toEqual({ kind: 'component', node: set });
  });

  it('resolves a variant inside a set to the set and remembers the variant', async () => {
    const set = componentSet();
    const selectedVariant = variant(set);

    const target = await resolveLiveTarget([selectedVariant]);

    expect(target?.kind).toBe('component');
    expect(target?.node).toBe(set);
    expect(target?.variantProperties).toEqual({ Variant: 'Primary', Size: 'Medium' });
  });

  it('returns a standalone component as a component', async () => {
    const component = standaloneComponent();
    const target = await resolveLiveTarget([component]);
    expect(target).toEqual({ kind: 'component', node: component, variantProperties: undefined });
  });

  it('resolves an instance to its main component set', async () => {
    const set = componentSet();
    const mainVariant = variant(set);
    const selectedInstance = instance(async () => mainVariant);

    const target = await resolveLiveTarget([selectedInstance]);

    expect(target?.kind).toBe('component');
    expect(target?.node).toBe(set);
    expect(target?.variantProperties).toEqual({ Variant: 'Primary', Size: 'Medium' });
  });

  it('resolves an instance to a standalone main component', async () => {
    const mainComponent = standaloneComponent();
    const selectedInstance = instance(async () => mainComponent);

    const target = await resolveLiveTarget([selectedInstance]);

    expect(target?.kind).toBe('component');
    expect(target?.node).toBe(mainComponent);
  });

  it('falls back to the instance as a frame when the main component is unavailable', async () => {
    const selectedInstance = instance(async () => null);

    const target = await resolveLiveTarget([selectedInstance]);

    expect(target?.kind).toBe('frame');
    expect(target?.node).toBe(selectedInstance);
  });

  it('falls back to the instance as a frame when getMainComponentAsync throws', async () => {
    const selectedInstance = instance(async () => {
      throw new Error('remote component unavailable');
    });

    const target = await resolveLiveTarget([selectedInstance]);

    expect(target?.kind).toBe('frame');
    expect(target?.node).toBe(selectedInstance);
  });

  it('treats other layer types as frames', async () => {
    const frame = { id: 'f-1', name: 'Hero Card', type: 'FRAME', children: [] };
    const group = { id: 'g-1', name: 'Group', type: 'GROUP', children: [] };

    expect(await resolveLiveTarget([frame])).toEqual({ kind: 'frame', node: frame });
    expect(await resolveLiveTarget([group])).toEqual({ kind: 'frame', node: group });
  });
});
