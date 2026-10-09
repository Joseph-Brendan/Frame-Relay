import { FrameSummary, Layout, StyleValue } from '@frame-relay/schema';
import { isNodeSnapshot, NodeSnapshot, StyleIndex, VariableIndex } from './snapshot.js';
import { extractLayout } from './layout.js';
import { extractStyleBlock } from './styles.js';

const TOKEN_REFERENCE_REGEX = /^\{.+\}$/;

function collectStyleValue(
  value: StyleValue | undefined,
  tokens: Set<string>,
  raws: Set<string>,
): void {
  if (typeof value === 'string') {
    if (TOKEN_REFERENCE_REGEX.test(value)) {
      tokens.add(value);
    }
  } else if (value && typeof value === 'object' && typeof value.raw === 'string') {
    raws.add(value.raw);
  }
}

function collectLayoutValues(layout: Layout, tokens: Set<string>, raws: Set<string>): void {
  collectStyleValue(layout.gap, tokens, raws);

  if (layout.padding) {
    collectStyleValue(layout.padding.top, tokens, raws);
    collectStyleValue(layout.padding.right, tokens, raws);
    collectStyleValue(layout.padding.bottom, tokens, raws);
    collectStyleValue(layout.padding.left, tokens, raws);
  }

  if (layout.width && typeof layout.width === 'object' && 'fixed' in layout.width) {
    collectStyleValue(layout.width.fixed, tokens, raws);
  }
  if (layout.height && typeof layout.height === 'object' && 'fixed' in layout.height) {
    collectStyleValue(layout.height.fixed, tokens, raws);
  }
}

function readName(node: unknown): string {
  if (typeof node === 'object' && node !== null) {
    const name = (node as Record<string, unknown>).name;
    if (typeof name === 'string' && name.length > 0) return name;
  }
  return 'Frame';
}

/**
 * Summarizes any non-component Figma selection (frame, group, instance, plain shape) into a
 * FrameSummary for live mode.
 *
 * Pure function: deterministic, synchronous, never throws. Layout reuses the kit layout mapping
 * and token/raw values are collected with the same normalization used by convertComponent.
 */
export function summarizeFrame(
  node: unknown,
  variables: VariableIndex = {},
  styles: StyleIndex = {},
): FrameSummary {
  const tokens = new Set<string>();
  const raws = new Set<string>();
  const instances = new Set<string>();

  if (!isNodeSnapshot(node)) {
    return {
      name: readName(node),
      size: { width: 0, height: 0 },
      childCount: 0,
      componentInstances: [],
      tokenReferences: [],
      rawValues: [],
    };
  }

  const root = node as NodeSnapshot;
  const componentName = typeof root.name === 'string' && root.name.length > 0 ? root.name : 'Frame';

  const { layout } = extractLayout(root, { componentName, layerPath: '', variables });
  collectLayoutValues(layout, tokens, raws);

  const visit = (current: NodeSnapshot, path: string): void => {
    const partName = typeof current.name === 'string' ? current.name : '';
    const { styles: block } = extractStyleBlock(current, {
      componentName,
      layerPath: path,
      partName,
      variables,
      styles,
    });

    for (const value of Object.values(block)) {
      collectStyleValue(value, tokens, raws);
    }

    if (
      current.type === 'INSTANCE' &&
      typeof current.mainComponentName === 'string' &&
      current.mainComponentName.length > 0
    ) {
      instances.add(current.mainComponentName);
    }

    if (current.children) {
      for (const child of current.children) {
        visit(child, path ? `${path} > ${child.name}` : child.name);
      }
    }
  };

  visit(root, '');

  const summary: FrameSummary = {
    name: componentName,
    layout,
    size: {
      width: typeof root.width === 'number' ? root.width : 0,
      height: typeof root.height === 'number' ? root.height : 0,
    },
    childCount: root.children?.length ?? 0,
    componentInstances: [...instances].sort(),
    tokenReferences: [...tokens].sort(),
    rawValues: [...raws].sort(),
  };

  return summary;
}
