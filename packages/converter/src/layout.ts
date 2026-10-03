import { Layout, Padding, StyleValue } from '@josephbrendan/schema';
import { NodeSnapshot, VariableAliasSnapshot, VariableIndex } from './snapshot.js';
import { ConverterWarning, createWarning } from './warnings.js';

function getBoundTokenPath(
  alias: VariableAliasSnapshot | VariableAliasSnapshot[] | undefined,
  variables: VariableIndex,
): string | undefined {
  if (!alias) return undefined;
  const single = Array.isArray(alias) ? alias[0] : alias;
  if (single && single.type === 'VARIABLE_ALIAS' && variables[single.id]) {
    return variables[single.id].tokenPath;
  }
  return undefined;
}

export interface ExtractLayoutContext {
  componentName: string;
  layerPath: string;
  variables: VariableIndex;
}

/**
 * Maps primaryAxisAlignItems to justify CSS keyword.
 */
export function mapJustifyAlign(
  val?: string,
): 'start' | 'center' | 'end' | 'space-between' | undefined {
  switch (val) {
    case 'MIN':
      return 'start';
    case 'CENTER':
      return 'center';
    case 'MAX':
      return 'end';
    case 'SPACE_BETWEEN':
      return 'space-between';
    default:
      return undefined;
  }
}

/**
 * Maps counterAxisAlignItems to align CSS keyword.
 */
export function mapCounterAlign(val?: string): 'start' | 'center' | 'end' | 'baseline' | undefined {
  switch (val) {
    case 'MIN':
      return 'start';
    case 'CENTER':
      return 'center';
    case 'MAX':
      return 'end';
    case 'BASELINE':
      return 'baseline';
    default:
      return undefined;
  }
}

/**
 * Extracts Layout specifications and warnings from the root component frame.
 */
export function extractLayout(
  rootNode: NodeSnapshot,
  ctx: ExtractLayoutContext,
): { layout: Layout; warnings: ConverterWarning[] } {
  const warnings: ConverterWarning[] = [];

  const addRawWarning = (field: string, val: string) => {
    warnings.push(
      createWarning('RAW_VALUE', {
        component: ctx.componentName,
        layerPath: ctx.layerPath,
        nodeId: rootNode.id,
        details: `layout.${field} uses raw value ${val}`,
        fix: 'Bind layout spacing or dimension to a token variable',
      }),
    );
  };

  // 1. Check layoutMode
  let direction: 'row' | 'column' = 'row';
  if (rootNode.layoutMode === 'VERTICAL') {
    direction = 'column';
  } else if (rootNode.layoutMode === 'HORIZONTAL') {
    direction = 'row';
  } else {
    // layoutMode is NONE or undefined
    if (rootNode.children && rootNode.children.length > 0) {
      warnings.push(
        createWarning('NO_AUTO_LAYOUT', {
          component: ctx.componentName,
          layerPath: ctx.layerPath,
          nodeId: rootNode.id,
          details: 'Frame layer has child nodes but does not use Auto Layout',
          fix: 'Enable Auto Layout on the frame in Figma',
        }),
      );
    }
  }

  // 2. Check absolute children
  if (rootNode.children) {
    for (const child of rootNode.children) {
      if (child.layoutPositioning === 'ABSOLUTE') {
        warnings.push(
          createWarning('ABSOLUTE_CHILD', {
            component: ctx.componentName,
            layerPath: `${ctx.layerPath} > ${child.name}`,
            nodeId: child.id,
            details: `Child layer "${child.name}" uses absolute positioning`,
            fix: 'Use standard Auto Layout flow positioning',
          }),
        );
      }
    }
  }

  // 3. Gap (itemSpacing)
  let gap: StyleValue | undefined;
  if (rootNode.itemSpacing !== undefined && rootNode.itemSpacing > 0) {
    const gapBound = rootNode.boundVariables?.itemSpacing as VariableAliasSnapshot | undefined;
    const token = getBoundTokenPath(gapBound, ctx.variables);
    if (token) {
      gap = `{${token}}`;
    } else {
      gap = { raw: `${rootNode.itemSpacing}px` };
      addRawWarning('gap', `${rootNode.itemSpacing}px`);
    }
  }

  // 4. Insets (Padding)
  const padding: Padding = {};
  let hasPadding = false;

  const padSides: Array<{
    prop: 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft';
    key: keyof Padding;
  }> = [
    { prop: 'paddingTop', key: 'top' },
    { prop: 'paddingRight', key: 'right' },
    { prop: 'paddingBottom', key: 'bottom' },
    { prop: 'paddingLeft', key: 'left' },
  ];

  for (const { prop, key } of padSides) {
    const val = rootNode[prop];
    if (val !== undefined && val > 0) {
      const bound = rootNode.boundVariables?.[prop] as VariableAliasSnapshot | undefined;
      const token = getBoundTokenPath(bound, ctx.variables);
      if (token) {
        padding[key] = `{${token}}`;
        hasPadding = true;
      } else {
        padding[key] = { raw: `${val}px` };
        hasPadding = true;
        addRawWarning(`padding.${String(key)}`, `${val}px`);
      }
    }
  }

  // 5. Alignments
  const justify = mapJustifyAlign(rootNode.primaryAxisAlignItems);
  const align = mapCounterAlign(rootNode.counterAxisAlignItems);

  // 6. Horizontal sizing constraint
  let widthConstraint: Layout['width'];
  if (rootNode.layoutSizingHorizontal === 'HUG') {
    widthConstraint = 'hug';
  } else if (rootNode.layoutSizingHorizontal === 'FILL') {
    widthConstraint = 'fill';
  } else if (rootNode.width !== undefined && rootNode.width > 0) {
    const bound = rootNode.boundVariables?.width as VariableAliasSnapshot | undefined;
    const token = getBoundTokenPath(bound, ctx.variables);
    if (token) {
      widthConstraint = { fixed: `{${token}}` };
    } else {
      widthConstraint = { fixed: { raw: `${rootNode.width}px` } };
    }
  }

  // 7. Vertical sizing constraint
  let heightConstraint: Layout['height'];
  if (rootNode.layoutSizingVertical === 'HUG') {
    heightConstraint = 'hug';
  } else if (rootNode.layoutSizingVertical === 'FILL') {
    heightConstraint = 'fill';
  } else if (rootNode.height !== undefined && rootNode.height > 0) {
    const bound = rootNode.boundVariables?.height as VariableAliasSnapshot | undefined;
    const token = getBoundTokenPath(bound, ctx.variables);
    if (token) {
      heightConstraint = { fixed: `{${token}}` };
    } else {
      heightConstraint = { fixed: { raw: `${rootNode.height}px` } };
    }
  }

  const layout: Layout = {
    direction,
  };

  if (gap) layout.gap = gap;
  if (hasPadding) layout.padding = padding;
  if (justify) layout.justify = justify;
  if (align) layout.align = align;
  if (widthConstraint) layout.width = widthConstraint;
  if (heightConstraint) layout.height = heightConstraint;

  return { layout, warnings };
}
