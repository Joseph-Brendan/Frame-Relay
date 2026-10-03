import {
  ComponentProp,
  ComponentState,
  ComponentVariant,
  ScreenshotSpec,
  STATE_NAMES,
  StateName,
  StyleBlock,
} from '@josephbrendan/schema';
import { AnatomyPart } from '@josephbrendan/schema';
import { NodeSnapshot, StyleIndex, VariableIndex } from './snapshot.js';
import { ConverterWarning, createWarning } from './warnings.js';
import { extractStyleBlock } from './styles.js';

export interface ScreenshotJob {
  nodeId: string;
  path: string;
}

export interface ExtractVariantsAndStatesContext {
  componentName: string;
  anatomy: AnatomyPart[];
  variables: VariableIndex;
  styles: StyleIndex;
}

export interface ExtractVariantsAndStatesResult {
  props: ComponentProp[];
  base: Record<string, StyleBlock>;
  variants: ComponentVariant[];
  states: ComponentState[];
  screenshots: ScreenshotSpec[];
  screenshotJobs: ScreenshotJob[];
  warnings: ConverterWarning[];
}

/**
 * Normalizes any string to camelCase.
 * Preserves existing camelCase, and converts PascalCase, kebab-case, snake_case or spaced strings.
 */
export function toCamelCase(str: string): string {
  const trimmed = str.trim();
  if (!trimmed) return '';

  // If already camelCase (starts with lowercase, no spaces/hyphens/underscores)
  if (/^[a-z][a-zA-Z0-9]*$/.test(trimmed)) {
    return trimmed;
  }

  // If PascalCase (e.g. "Variant", "Size", "HelperText")
  if (/^[A-Z][a-zA-Z0-9]*$/.test(trimmed)) {
    return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
  }

  // Otherwise split by spaces, hyphens, underscores, dots
  const words = trimmed.split(/[\s\-_#.]+/).filter((w) => w.length > 0);
  if (words.length === 0) return '';

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

/**
 * Normalizes any string to PascalCase.
 */
export function toPascalCase(str: string): string {
  const trimmed = str.trim();
  if (!trimmed) return '';

  const words = trimmed.split(/[\s\-_#.]+/).filter((w) => w.length > 0);
  if (words.length === 0) return '';

  return words
    .map((word) => {
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

/**
 * Returns part styles that differ from base.
 */
export function diffStyles(
  target: Record<string, StyleBlock>,
  base: Record<string, StyleBlock>,
): Record<string, StyleBlock> {
  const result: Record<string, StyleBlock> = {};

  for (const [partName, partStyles] of Object.entries(target)) {
    const basePartStyles = base[partName] ?? {};
    const partDiff: StyleBlock = {};

    for (const [styleKey, styleVal] of Object.entries(partStyles)) {
      const baseVal = basePartStyles[styleKey as keyof StyleBlock];
      const isDiff = baseVal === undefined || JSON.stringify(styleVal) !== JSON.stringify(baseVal);

      if (isDiff) {
        (partDiff as Record<string, unknown>)[styleKey] = styleVal;
      }
    }

    if (Object.keys(partDiff).length > 0) {
      result[partName] = partDiff;
    }
  }

  return result;
}

/**
 * Finds all anatomy part nodes within a component node.
 */
function findPartNodes(
  componentNode: NodeSnapshot,
  anatomy: AnatomyPart[],
): Map<string, NodeSnapshot> {
  const map = new Map<string, NodeSnapshot>();

  // Root is the component node itself
  map.set('root', componentNode);

  const anatomyNames = new Set(anatomy.map((a) => a.name));

  const traverse = (curr: NodeSnapshot) => {
    if (anatomyNames.has(curr.name) && !map.has(curr.name)) {
      map.set(curr.name, curr);
    }
    if (curr.children) {
      for (const child of curr.children) {
        traverse(child);
      }
    }
  };

  if (componentNode.children) {
    for (const child of componentNode.children) {
      traverse(child);
    }
  }

  return map;
}

/**
 * Extracts style blocks for all anatomy parts present in the given component.
 */
function extractComponentPartStyles(
  componentNode: NodeSnapshot,
  anatomy: AnatomyPart[],
  ctx: ExtractVariantsAndStatesContext,
  collectedWarnings: ConverterWarning[],
): Record<string, StyleBlock> {
  const partNodes = findPartNodes(componentNode, anatomy);
  const result: Record<string, StyleBlock> = {};

  for (const part of anatomy) {
    const node = partNodes.get(part.name);
    if (!node) continue;

    const { styles, warnings } = extractStyleBlock(node, {
      componentName: ctx.componentName,
      layerPath: part.name,
      partName: part.name,
      variables: ctx.variables,
      styles: ctx.styles,
    });

    collectedWarnings.push(...warnings);

    if (Object.keys(styles).length > 0) {
      result[part.name] = styles;
    }
  }

  return result;
}

/**
 * Extracts properties, base styles, variant overrides, states, and screenshots.
 */
export function extractVariantsAndStates(
  node: NodeSnapshot,
  ctx: ExtractVariantsAndStatesContext,
): ExtractVariantsAndStatesResult {
  const warnings: ConverterWarning[] = [];

  // Standalone COMPONENT handling
  if (node.type === 'COMPONENT') {
    const base = extractComponentPartStyles(node, ctx.anatomy, ctx, warnings);

    const props: ComponentProp[] = [];
    if (node.componentPropertyDefinitions) {
      for (const [key, def] of Object.entries(node.componentPropertyDefinitions)) {
        const stripped = key.replace(/#.*$/, '').trim();
        const propName = toCamelCase(stripped);

        if (def.type === 'BOOLEAN') {
          props.push({
            name: propName,
            type: 'boolean',
            default: typeof def.defaultValue === 'boolean' ? def.defaultValue : false,
          });
        } else if (def.type === 'TEXT') {
          props.push({
            name: propName,
            type: 'text',
            default: typeof def.defaultValue === 'string' ? def.defaultValue : '',
          });
        } else if (def.type === 'INSTANCE_SWAP') {
          props.push({
            name: propName,
            type: 'instance',
            default: typeof def.defaultValue === 'string' ? def.defaultValue : undefined,
          });
        }
      }
    }

    const stateEntry: ComponentState = {
      name: 'Default',
      styles: {},
    };

    const screenshotPath = `screenshots/${ctx.componentName}--Default.png`;
    const screenshot: ScreenshotSpec = {
      variant: {},
      state: 'Default',
      path: screenshotPath,
    };

    const screenshotJob: ScreenshotJob = {
      nodeId: node.id,
      path: screenshotPath,
    };

    return {
      props,
      base,
      variants: [],
      states: [stateEntry],
      screenshots: [screenshot],
      screenshotJobs: [screenshotJob],
      warnings,
    };
  }

  // COMPONENT_SET handling
  const children = (node.children || []).filter((c) => c.type === 'COMPONENT');

  // 1. Discover all properties from componentPropertyDefinitions or children
  const propDefs = node.componentPropertyDefinitions || {};
  let statePropOriginalName: string | undefined;

  // Check for State property in componentPropertyDefinitions
  for (const rawKey of Object.keys(propDefs)) {
    const stripped = rawKey.replace(/#.*$/, '').trim();
    if (stripped.toLowerCase() === 'state') {
      statePropOriginalName = stripped;
      break;
    }
  }

  // If not found in definitions, check children's variantProperties
  if (!statePropOriginalName && children.length > 0) {
    for (const child of children) {
      if (child.variantProperties) {
        for (const k of Object.keys(child.variantProperties)) {
          if (k.toLowerCase() === 'state') {
            statePropOriginalName = k;
            break;
          }
        }
      }
      if (statePropOriginalName) break;
    }
  }

  const props: ComponentProp[] = [];

  // Parse non-state component properties
  for (const [key, def] of Object.entries(propDefs)) {
    const stripped = key.replace(/#.*$/, '').trim();
    const strippedLower = stripped.toLowerCase();

    // Check non-standard variant property warning
    if (def.type === 'VARIANT') {
      if (strippedLower !== 'variant' && strippedLower !== 'size' && strippedLower !== 'state') {
        warnings.push(
          createWarning(
            'NON_STANDARD_VARIANT_PROPERTY',
            {
              component: ctx.componentName,
              layerPath: '',
              nodeId: node.id,
              details: `Variant property "${stripped}" is not one of Variant, Size, or State`,
              fix: 'Consider using standard variant property names (Variant, Size, State)',
            },
            'info',
          ),
        );
      }
    }

    // Skip the State property (it maps to states, not props)
    if (strippedLower === 'state') {
      continue;
    }

    const propName = toCamelCase(stripped);

    if (def.type === 'VARIANT') {
      const options = def.variantOptions ?? [];
      const defaultValue =
        typeof def.defaultValue === 'string' && options.includes(def.defaultValue)
          ? def.defaultValue
          : (options[0] ?? '');

      props.push({
        name: propName,
        type: 'variant',
        options,
        default: defaultValue,
      });
    } else if (def.type === 'BOOLEAN') {
      props.push({
        name: propName,
        type: 'boolean',
        default: typeof def.defaultValue === 'boolean' ? def.defaultValue : false,
      });
    } else if (def.type === 'TEXT') {
      props.push({
        name: propName,
        type: 'text',
        default: typeof def.defaultValue === 'string' ? def.defaultValue : '',
      });
    } else if (def.type === 'INSTANCE_SWAP') {
      props.push({
        name: propName,
        type: 'instance',
        default: typeof def.defaultValue === 'string' ? def.defaultValue : undefined,
      });
    }
  }

  // If no variant props defined in componentPropertyDefinitions, discover from children's variantProperties
  if (props.filter((p) => p.type === 'variant').length === 0 && children.length > 0) {
    const discoveredOptions = new Map<string, string[]>();

    for (const child of children) {
      if (!child.variantProperties) continue;
      for (const [k, v] of Object.entries(child.variantProperties)) {
        if (k.toLowerCase() === 'state') continue;
        const pName = toCamelCase(k);
        if (!discoveredOptions.has(pName)) {
          discoveredOptions.set(pName, []);
        }
        const opts = discoveredOptions.get(pName)!;
        if (!opts.includes(v)) {
          opts.push(v);
        }
      }
    }

    for (const [pName, opts] of discoveredOptions.entries()) {
      props.push({
        name: pName,
        type: 'variant',
        options: opts,
        default: opts[0] ?? '',
      });
    }
  }

  // 2. Resolve States
  const allStatesInSet: string[] = [];
  if (statePropOriginalName && propDefs[statePropOriginalName]?.variantOptions) {
    allStatesInSet.push(...(propDefs[statePropOriginalName].variantOptions || []));
  } else {
    for (const child of children) {
      if (!child.variantProperties) continue;
      for (const [k, v] of Object.entries(child.variantProperties)) {
        if (k.toLowerCase() === 'state' && !allStatesInSet.includes(v)) {
          allStatesInSet.push(v);
        }
      }
    }
  }

  // Validate state names
  const validStates: StateName[] = [];
  for (const s of allStatesInSet) {
    if ((STATE_NAMES as readonly string[]).includes(s)) {
      if (!validStates.includes(s as StateName)) {
        validStates.push(s as StateName);
      }
    } else {
      warnings.push(
        createWarning('UNKNOWN_STATE', {
          component: ctx.componentName,
          layerPath: '',
          nodeId: node.id,
          details: `State "${s}" is not one of the allowed states: ${STATE_NAMES.join(', ')}`,
          fix: `Rename the state in Figma to one of: ${STATE_NAMES.join(', ')}`,
        }),
      );
    }
  }

  // Check MISSING_DEFAULT_STATE
  if (validStates.length > 0 && !validStates.includes('Default')) {
    warnings.push(
      createWarning(
        'MISSING_DEFAULT_STATE',
        {
          component: ctx.componentName,
          layerPath: '',
          nodeId: node.id,
          details: `Component set has interactive states (${validStates.join(', ')}) but is missing a State=Default variant`,
          fix: 'Add a State=Default variant to the component set in Figma',
        },
        'error',
      ),
    );
  }

  // If no states found or only non-interactive, default to ['Default']
  if (validStates.length === 0) {
    validStates.push('Default');
  }

  // Sort states by STATE_NAMES canonical order with 'Default' always first
  validStates.sort((a, b) => STATE_NAMES.indexOf(a) - STATE_NAMES.indexOf(b));

  // Helper to get child state value
  const getChildState = (child: NodeSnapshot): string => {
    if (!child.variantProperties) return 'Default';
    for (const [k, v] of Object.entries(child.variantProperties)) {
      if (k.toLowerCase() === 'state') return v;
    }
    return 'Default';
  };

  // Helper to extract non-state props from child
  const getChildNonStateProps = (
    child: NodeSnapshot,
  ): Record<string, string | boolean | number> => {
    const result: Record<string, string | boolean | number> = {};
    if (!child.variantProperties) return result;

    for (const [k, v] of Object.entries(child.variantProperties)) {
      if (k.toLowerCase() === 'state') continue;
      const camel = toCamelCase(k);
      const matchingProp = props.find((p) => p.name === camel);
      if (matchingProp && matchingProp.type === 'boolean') {
        result[camel] = v.toLowerCase() === 'true';
      } else {
        result[camel] = v;
      }
    }

    // Include non-variant props at their defaults if needed
    for (const p of props) {
      if (result[p.name] === undefined && p.default !== undefined) {
        result[p.name] = p.default;
      }
    }

    return result;
  };

  // 3. Find base component (all props at default with State=Default)
  const defaultVariantProps: Record<string, string | boolean | number> = {};
  for (const p of props) {
    if (p.default !== undefined) {
      defaultVariantProps[p.name] = p.default;
    }
  }

  let baseChild = children.find((c) => {
    const s = getChildState(c);
    if (s !== 'Default') return false;
    const cProps = getChildNonStateProps(c);
    return Object.entries(defaultVariantProps).every(([k, v]) => cProps[k] === v);
  });

  if (!baseChild) {
    baseChild = children.find((c) => getChildState(c) === 'Default') || children[0];
  }

  const base = baseChild ? extractComponentPartStyles(baseChild, ctx.anatomy, ctx, warnings) : {};

  // 4. Extract variants (one entry per combination of non-state props at State=Default)
  const variants: ComponentVariant[] = [];
  const seenVariantKeys = new Set<string>();

  const defaultStateChildren = children.filter((c) => getChildState(c) === 'Default');

  for (const child of defaultStateChildren) {
    const childProps = getChildNonStateProps(child);
    const key = JSON.stringify(childProps, Object.keys(childProps).sort());

    if (seenVariantKeys.has(key)) continue;
    seenVariantKeys.add(key);

    const childStyles = extractComponentPartStyles(child, ctx.anatomy, ctx, warnings);
    const diff = diffStyles(childStyles, base);

    variants.push({
      props: childProps,
      styles: diff,
    });
  }

  // 5. Extract states (for each state, compare default-props component in that state with default in Default)
  const states: ComponentState[] = [];

  for (const stateName of validStates) {
    if (stateName === 'Default') {
      states.push({
        name: 'Default',
        styles: {},
      });
      continue;
    }

    // Find component with default props in this state
    let stateChild = children.find((c) => {
      const s = getChildState(c);
      if (s !== stateName) return false;
      const cProps = getChildNonStateProps(c);
      return Object.entries(defaultVariantProps).every(([k, v]) => cProps[k] === v);
    });

    if (!stateChild) {
      stateChild = children.find((c) => getChildState(c) === stateName);
    }

    if (stateChild) {
      const stateStyles = extractComponentPartStyles(stateChild, ctx.anatomy, ctx, warnings);
      const diff = diffStyles(stateStyles, base);
      states.push({
        name: stateName,
        styles: diff,
      });
    }
  }

  // 6. Screenshot specs & screenshot jobs
  const screenshots: ScreenshotSpec[] = [];
  const screenshotJobs: ScreenshotJob[] = [];
  const seenScreenshotPaths = new Set<string>();

  // Order variant props for path generation
  const pathPropNames = props
    .filter((p) => p.type === 'variant' || p.type === 'boolean')
    .map((p) => p.name);

  for (const child of children) {
    const s = getChildState(child);
    if (!(STATE_NAMES as readonly string[]).includes(s)) {
      continue; // Skip invalid state variants
    }

    const childProps = getChildNonStateProps(child);

    // Build variant values joined by hyphen
    const variantValues = pathPropNames
      .map((name) => String(childProps[name] ?? ''))
      .filter((val) => val.length > 0);

    const variantPart = variantValues.length > 0 ? variantValues.join('-') : '';
    const screenshotPath = variantPart
      ? `screenshots/${ctx.componentName}--${variantPart}--${s}.png`
      : `screenshots/${ctx.componentName}--${s}.png`;

    if (!seenScreenshotPaths.has(screenshotPath)) {
      seenScreenshotPaths.add(screenshotPath);

      screenshots.push({
        variant: childProps,
        state: s,
        path: screenshotPath,
      });

      screenshotJobs.push({
        nodeId: child.id,
        path: screenshotPath,
      });
    }
  }

  return {
    props,
    base,
    variants,
    states,
    screenshots,
    screenshotJobs,
    warnings,
  };
}
