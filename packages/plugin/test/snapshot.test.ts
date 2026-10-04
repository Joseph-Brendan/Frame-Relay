import { describe, expect, it, beforeEach } from 'vitest';
import { snapshotNode } from '../src/main/snapshot.js';

describe('snapshotNode', () => {
  beforeEach(() => {
    // Setup figma global mock
    (globalThis as unknown as { figma: unknown }).figma = {
      mixed: Symbol('figma.mixed'),
    };
  });

  it('converts figma.mixed properties to the string "mixed"', () => {
    const figmaGlobal = (globalThis as unknown as { figma: { mixed: unknown } }).figma;

    const fakeNode = {
      id: 'node-1',
      name: 'Card Frame',
      type: 'FRAME',
      visible: true,
      width: 200,
      height: 100,
      cornerRadius: figmaGlobal.mixed,
    } as unknown as FrameNode;

    const snapshot = snapshotNode(fakeNode);
    expect(snapshot.id).toBe('node-1');
    expect(snapshot.name).toBe('Card Frame');
    expect(snapshot.cornerRadius).toBe('mixed');
  });

  it('copies boundVariables including those inside paints and effects', () => {
    const fakeNode = {
      id: 'node-2',
      name: 'Primary Button',
      type: 'COMPONENT',
      visible: true,
      width: 120,
      height: 40,
      boundVariables: {
        width: { type: 'VARIABLE_ALIAS', id: 'var-width-1' },
      },
      fills: [
        {
          type: 'SOLID',
          visible: true,
          opacity: 1,
          color: { r: 0.1, g: 0.5, b: 0.9 },
          boundVariables: {
            color: { type: 'VARIABLE_ALIAS', id: 'var-color-primary' },
          },
        },
      ],
      effects: [
        {
          type: 'DROP_SHADOW',
          visible: true,
          radius: 4,
          color: { r: 0, g: 0, b: 0, a: 0.2 },
          offset: { x: 0, y: 2 },
          spread: 0,
          boundVariables: {
            radius: { type: 'VARIABLE_ALIAS', id: 'var-elevation-1' },
          },
        },
      ],
    } as unknown as ComponentNode;

    const snapshot = snapshotNode(fakeNode);
    expect(snapshot.boundVariables?.width).toEqual({
      type: 'VARIABLE_ALIAS',
      id: 'var-width-1',
    });
    expect(snapshot.fills?.[0]?.boundVariables?.color).toEqual({
      type: 'VARIABLE_ALIAS',
      id: 'var-color-primary',
    });
    expect(snapshot.effects?.[0]?.boundVariables?.radius).toEqual({
      type: 'VARIABLE_ALIAS',
      id: 'var-elevation-1',
    });
  });

  it('reads variantProperties on a variant inside a COMPONENT_SET and avoids componentPropertyDefinitions', () => {
    const parentSet = {
      id: 'set-1',
      name: 'Button',
      type: 'COMPONENT_SET',
    };

    const variantNode = {
      id: 'variant-1',
      name: 'Size=Medium, State=Default',
      type: 'COMPONENT',
      visible: true,
      parent: parentSet,
      variantProperties: {
        Size: 'Medium',
        State: 'Default',
      },
      get componentPropertyDefinitions() {
        // Figma throws if componentPropertyDefinitions is accessed on a child of COMPONENT_SET
        throw new Error('Accessing componentPropertyDefinitions on variant is forbidden');
      },
    } as unknown as ComponentNode;

    expect(() => snapshotNode(variantNode)).not.toThrow();

    const snapshot = snapshotNode(variantNode);
    expect(snapshot.variantProperties).toEqual({
      Size: 'Medium',
      State: 'Default',
    });
    expect(snapshot.componentPropertyDefinitions).toBeUndefined();
  });

  it('safely handles a property whose getter throws without crashing the export', () => {
    const errorNode = {
      id: 'node-buggy',
      name: 'Buggy Layer',
      type: 'TEXT',
      visible: true,
      get characters() {
        throw new Error('Font engine error on layer reading');
      },
      get fontSize() {
        return 14;
      },
    } as unknown as TextNode;

    expect(() => snapshotNode(errorNode)).not.toThrow();

    const snapshot = snapshotNode(errorNode);
    expect(snapshot.id).toBe('node-buggy');
    expect(snapshot.fontSize).toBe(14);
    expect(snapshot.characters).toBeUndefined();
  });

  it('recursively snapshots nested child layers', () => {
    const childNode = {
      id: 'child-1',
      name: 'Label',
      type: 'TEXT',
      visible: true,
      characters: 'Submit',
    } as unknown as TextNode;

    const parentNode = {
      id: 'parent-1',
      name: 'Container',
      type: 'FRAME',
      visible: true,
      children: [childNode],
    } as unknown as FrameNode;

    const snapshot = snapshotNode(parentNode);
    expect(snapshot.id).toBe('parent-1');
    expect(snapshot.children).toBeDefined();
    expect(snapshot.children!.length).toBe(1);
    expect(snapshot.children![0].id).toBe('child-1');
    expect(snapshot.children![0].characters).toBe('Submit');
  });
});
