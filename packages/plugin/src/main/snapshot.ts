import type {
  EffectSnapshot,
  NodeSnapshot,
  PaintSnapshot,
  VariableAliasSnapshot,
} from '@josephbrendan/converter';

/**
 * Safely accesses a property on a node, returning a fallback if accessing throws.
 */
export function safeGet<T>(node: unknown, key: string, fallback: T): T {
  if (typeof node !== 'object' || node === null) return fallback;
  try {
    const val = (node as Record<string, unknown>)[key];
    if (val === undefined) return fallback;
    return val as T;
  } catch {
    return fallback;
  }
}

/**
 * Normalizes values that might be figma.mixed (symbol) to "mixed" string or standard primitive.
 */
export function normalizeMixed<T>(val: unknown, fallback: T): T | 'mixed' {
  if (typeof val === 'symbol' || (typeof figma !== 'undefined' && val === figma.mixed)) {
    return 'mixed';
  }
  if (val === undefined || val === null) {
    return fallback;
  }
  return val as T;
}

/**
 * Clones a bound variable alias object into a plain serializable JSON object.
 */
function cloneVariableAlias(alias: unknown): VariableAliasSnapshot | undefined {
  if (!alias || typeof alias !== 'object') return undefined;
  const a = alias as Record<string, unknown>;
  if (a.type === 'VARIABLE_ALIAS' && typeof a.id === 'string') {
    return {
      type: 'VARIABLE_ALIAS',
      id: a.id,
    };
  }
  return undefined;
}

/**
 * Clones paints (fills or strokes) into plain serializable PaintSnapshot objects.
 */
function clonePaints(paints: unknown): PaintSnapshot[] | undefined {
  if (!Array.isArray(paints)) return undefined;

  const result: PaintSnapshot[] = [];
  for (const p of paints) {
    if (!p || typeof p !== 'object') continue;
    const paint = p as Record<string, unknown>;
    const type = typeof paint.type === 'string' ? paint.type : 'SOLID';

    const item: PaintSnapshot = {
      type,
      visible: typeof paint.visible === 'boolean' ? paint.visible : true,
      opacity: typeof paint.opacity === 'number' ? paint.opacity : 1,
    };

    if (paint.color && typeof paint.color === 'object') {
      const c = paint.color as Record<string, unknown>;
      item.color = {
        r: typeof c.r === 'number' ? c.r : 0,
        g: typeof c.g === 'number' ? c.g : 0,
        b: typeof c.b === 'number' ? c.b : 0,
      };
    }

    if (paint.boundVariables && typeof paint.boundVariables === 'object') {
      const bv = paint.boundVariables as Record<string, unknown>;
      const boundObj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(bv)) {
        const cloned = cloneVariableAlias(v);
        if (cloned) boundObj[k] = cloned;
      }
      if (Object.keys(boundObj).length > 0) {
        item.boundVariables = boundObj;
      }
    }

    result.push(item);
  }

  return result.length > 0 ? result : undefined;
}

/**
 * Clones effects into plain serializable EffectSnapshot objects.
 */
function cloneEffects(effects: unknown): EffectSnapshot[] | undefined {
  if (!Array.isArray(effects)) return undefined;

  const result: EffectSnapshot[] = [];
  for (const e of effects) {
    if (!e || typeof e !== 'object') continue;
    const effect = e as Record<string, unknown>;
    const type = typeof effect.type === 'string' ? effect.type : 'DROP_SHADOW';

    const item: EffectSnapshot = {
      type,
      visible: typeof effect.visible === 'boolean' ? effect.visible : true,
      radius: typeof effect.radius === 'number' ? effect.radius : 0,
      spread: typeof effect.spread === 'number' ? effect.spread : 0,
    };

    if (effect.offset && typeof effect.offset === 'object') {
      const off = effect.offset as Record<string, unknown>;
      item.offset = {
        x: typeof off.x === 'number' ? off.x : 0,
        y: typeof off.y === 'number' ? off.y : 0,
      };
    }

    if (effect.color && typeof effect.color === 'object') {
      const c = effect.color as Record<string, unknown>;
      item.color = {
        r: typeof c.r === 'number' ? c.r : 0,
        g: typeof c.g === 'number' ? c.g : 0,
        b: typeof c.b === 'number' ? c.b : 0,
        a: typeof c.a === 'number' ? c.a : 1,
      };
    }

    if (effect.boundVariables && typeof effect.boundVariables === 'object') {
      const bv = effect.boundVariables as Record<string, unknown>;
      const boundObj: Record<string, VariableAliasSnapshot> = {};
      for (const [k, v] of Object.entries(bv)) {
        const cloned = cloneVariableAlias(v);
        if (cloned) boundObj[k] = cloned;
      }
      if (Object.keys(boundObj).length > 0) {
        item.boundVariables = boundObj;
      }
    }

    result.push(item);
  }

  return result.length > 0 ? result : undefined;
}

/**
 * Clones bound variables map from a node.
 */
function cloneNodeBoundVariables(
  boundVars: unknown,
): Record<string, VariableAliasSnapshot | VariableAliasSnapshot[] | undefined> | undefined {
  if (!boundVars || typeof boundVars !== 'object') return undefined;
  const result: Record<string, VariableAliasSnapshot | VariableAliasSnapshot[] | undefined> = {};

  for (const [key, val] of Object.entries(boundVars as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      const aliases = val.map(cloneVariableAlias).filter((a): a is VariableAliasSnapshot => !!a);
      if (aliases.length > 0) result[key] = aliases;
    } else {
      const alias = cloneVariableAlias(val);
      if (alias) result[key] = alias;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Copies a Figma node and all descendants into a pure serializable NodeSnapshot.
 * Does not depend on the Figma API at runtime; safe to test with mock objects.
 */
export function snapshotNode(node: unknown): NodeSnapshot {
  const n = node as Record<string, unknown>;

  const id = String(safeGet(n, 'id', ''));
  const name = String(safeGet(n, 'name', ''));
  const type = String(safeGet(n, 'type', 'FRAME'));

  const snapshot: NodeSnapshot = {
    id,
    name,
    type,
  };

  // Visibility & Opacity
  const visible = safeGet<boolean | undefined>(n, 'visible', undefined);
  if (visible !== undefined) snapshot.visible = visible;

  const opacity = safeGet<number | undefined>(n, 'opacity', undefined);
  if (opacity !== undefined && opacity !== 1) snapshot.opacity = opacity;

  // Description (available on ComponentNode, ComponentSetNode)
  const description = safeGet<string | undefined>(n, 'description', undefined);
  if (description) snapshot.description = description;

  // Layout mode & positioning
  const layoutMode = safeGet<string | undefined>(n, 'layoutMode', undefined);
  if (layoutMode && layoutMode !== 'NONE') snapshot.layoutMode = layoutMode;
  else if (layoutMode === 'NONE') snapshot.layoutMode = 'NONE';

  const layoutPositioning = safeGet<string | undefined>(n, 'layoutPositioning', undefined);
  if (layoutPositioning) snapshot.layoutPositioning = layoutPositioning;

  // Spacing & Padding
  const itemSpacing = safeGet<number | undefined>(n, 'itemSpacing', undefined);
  if (itemSpacing !== undefined && itemSpacing > 0) snapshot.itemSpacing = itemSpacing;

  const paddingTop = safeGet<number | undefined>(n, 'paddingTop', undefined);
  if (paddingTop !== undefined && paddingTop > 0) snapshot.paddingTop = paddingTop;

  const paddingRight = safeGet<number | undefined>(n, 'paddingRight', undefined);
  if (paddingRight !== undefined && paddingRight > 0) snapshot.paddingRight = paddingRight;

  const paddingBottom = safeGet<number | undefined>(n, 'paddingBottom', undefined);
  if (paddingBottom !== undefined && paddingBottom > 0) snapshot.paddingBottom = paddingBottom;

  const paddingLeft = safeGet<number | undefined>(n, 'paddingLeft', undefined);
  if (paddingLeft !== undefined && paddingLeft > 0) snapshot.paddingLeft = paddingLeft;

  // Alignment
  const primaryAxisAlignItems = safeGet<string | undefined>(n, 'primaryAxisAlignItems', undefined);
  if (primaryAxisAlignItems) snapshot.primaryAxisAlignItems = primaryAxisAlignItems;

  const counterAxisAlignItems = safeGet<string | undefined>(n, 'counterAxisAlignItems', undefined);
  if (counterAxisAlignItems) snapshot.counterAxisAlignItems = counterAxisAlignItems;

  // Sizing
  const layoutSizingHorizontal = safeGet<string | undefined>(
    n,
    'layoutSizingHorizontal',
    undefined,
  );
  if (layoutSizingHorizontal) snapshot.layoutSizingHorizontal = layoutSizingHorizontal;

  const layoutSizingVertical = safeGet<string | undefined>(n, 'layoutSizingVertical', undefined);
  if (layoutSizingVertical) snapshot.layoutSizingVertical = layoutSizingVertical;

  const width = safeGet<number | undefined>(n, 'width', undefined);
  if (typeof width === 'number') snapshot.width = width;

  const height = safeGet<number | undefined>(n, 'height', undefined);
  if (typeof height === 'number') snapshot.height = height;

  // Corner radius (convert figma.mixed to string "mixed")
  const rawRadius = safeGet<unknown>(n, 'cornerRadius', undefined);
  if (rawRadius !== undefined) {
    snapshot.cornerRadius = normalizeMixed(rawRadius, 0);
  }

  const tl = safeGet<number | undefined>(n, 'topLeftRadius', undefined);
  if (typeof tl === 'number') snapshot.topLeftRadius = tl;

  const tr = safeGet<number | undefined>(n, 'topRightRadius', undefined);
  if (typeof tr === 'number') snapshot.topRightRadius = tr;

  const br = safeGet<number | undefined>(n, 'bottomRightRadius', undefined);
  if (typeof br === 'number') snapshot.bottomRightRadius = br;

  const bl = safeGet<number | undefined>(n, 'bottomLeftRadius', undefined);
  if (typeof bl === 'number') snapshot.bottomLeftRadius = bl;

  // Fills & Strokes
  const rawFills = safeGet<unknown>(n, 'fills', undefined);
  if (rawFills) {
    const fills = clonePaints(rawFills);
    if (fills) snapshot.fills = fills;
  }

  const rawStrokes = safeGet<unknown>(n, 'strokes', undefined);
  if (rawStrokes) {
    const strokes = clonePaints(rawStrokes);
    if (strokes) snapshot.strokes = strokes;
  }

  const strokeWeight = safeGet<number | undefined>(n, 'strokeWeight', undefined);
  if (typeof strokeWeight === 'number' && strokeWeight > 0) {
    snapshot.strokeWeight = strokeWeight;
  }

  // Effects & Styles
  const rawEffects = safeGet<unknown>(n, 'effects', undefined);
  if (rawEffects) {
    const effects = cloneEffects(rawEffects);
    if (effects) snapshot.effects = effects;
  }

  const effectStyleId = safeGet<string | undefined>(n, 'effectStyleId', undefined);
  if (effectStyleId) snapshot.effectStyleId = effectStyleId;

  const textStyleId = safeGet<string | undefined>(n, 'textStyleId', undefined);
  if (textStyleId) snapshot.textStyleId = textStyleId;

  // Bound Variables
  const boundVars = safeGet<unknown>(n, 'boundVariables', undefined);
  if (boundVars) {
    const clonedBound = cloneNodeBoundVariables(boundVars);
    if (clonedBound) snapshot.boundVariables = clonedBound;
  }

  // Text specific properties
  if (type === 'TEXT') {
    const chars = safeGet<string | undefined>(n, 'characters', undefined);
    if (chars !== undefined) snapshot.characters = chars;

    const fontSize = safeGet<unknown>(n, 'fontSize', undefined);
    if (typeof fontSize === 'number') snapshot.fontSize = fontSize;

    const fontName = safeGet<unknown>(n, 'fontName', undefined);
    if (fontName && typeof fontName === 'object') {
      const fn = fontName as Record<string, unknown>;
      if (typeof fn.family === 'string' && typeof fn.style === 'string') {
        snapshot.fontName = { family: fn.family, style: fn.style };
      }
    }

    const fontWeight = safeGet<number | undefined>(n, 'fontWeight', undefined);
    if (typeof fontWeight === 'number') snapshot.fontWeight = fontWeight;

    const lineHeight = safeGet<unknown>(n, 'lineHeight', undefined);
    if (lineHeight && typeof lineHeight === 'object') {
      const lh = lineHeight as Record<string, unknown>;
      snapshot.lineHeight = {
        unit: typeof lh.unit === 'string' ? lh.unit : 'AUTO',
        value: typeof lh.value === 'number' ? lh.value : undefined,
      };
    } else if (typeof lineHeight === 'number') {
      snapshot.lineHeight = lineHeight;
    }
  }

  // Component Property Definitions:
  // ONLY read on COMPONENT_SET or standalone COMPONENT. Reading it on a variant inside a set throws in Figma!
  const isVariantInSet =
    type === 'COMPONENT' &&
    typeof n.parent === 'object' &&
    n.parent !== null &&
    (n.parent as Record<string, unknown>).type === 'COMPONENT_SET';

  if (!isVariantInSet && (type === 'COMPONENT_SET' || type === 'COMPONENT')) {
    const compDefs = safeGet<unknown>(n, 'componentPropertyDefinitions', undefined);
    if (compDefs && typeof compDefs === 'object') {
      snapshot.componentPropertyDefinitions = JSON.parse(JSON.stringify(compDefs));
    }
  }

  // Variant properties on a variant component inside a set
  const variantProps = safeGet<unknown>(n, 'variantProperties', undefined);
  if (variantProps && typeof variantProps === 'object') {
    snapshot.variantProperties = JSON.parse(JSON.stringify(variantProps));
  }

  // Component property references on child layers
  const compRefs = safeGet<unknown>(n, 'componentPropertyReferences', undefined);
  if (compRefs && typeof compRefs === 'object') {
    snapshot.componentPropertyReferences = JSON.parse(JSON.stringify(compRefs));
  }

  // Main component name on instances, used by live frame summaries
  if (type === 'INSTANCE') {
    const mainComponent = safeGet<unknown>(n, 'mainComponent', undefined);
    if (mainComponent && typeof mainComponent === 'object') {
      const mainName = safeGet<string | undefined>(mainComponent, 'name', undefined);
      if (typeof mainName === 'string' && mainName.length > 0) {
        snapshot.mainComponentName = mainName;
      }
    }
  }

  // Recursively snapshot children
  const rawChildren = safeGet<unknown[] | undefined>(n, 'children', undefined);
  if (Array.isArray(rawChildren)) {
    snapshot.children = rawChildren.map(snapshotNode);
  }

  return snapshot;
}
