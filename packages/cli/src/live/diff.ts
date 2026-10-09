import type {
  ComponentProp,
  ComponentSpec,
  ComponentState,
  ComponentVariant,
  Layout,
  StyleBlock,
  StyleValue,
} from '@josephbrendan/schema';

const STYLE_PROPS: (keyof StyleBlock)[] = [
  'background',
  'color',
  'borderColor',
  'borderWidth',
  'borderRadius',
  'boxShadow',
  'typography',
  'opacity',
  'iconSize',
];

const LAYOUT_FIELDS: (keyof Layout)[] = [
  'direction',
  'gap',
  'padding',
  'justify',
  'align',
  'width',
  'height',
];

const PADDING_SIDES = ['top', 'right', 'bottom', 'left'] as const;

function formatStyleValue(value: StyleValue | undefined): string {
  if (value === undefined) return 'not set';
  return typeof value === 'string' ? value : value.raw;
}

function formatLayoutValue(value: unknown): string {
  if (value === undefined) return 'not set';
  if (typeof value === 'string' || typeof value === 'number') return String(value);

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.raw === 'string') return obj.raw;
    if (obj.fixed !== undefined) return formatLayoutValue(obj.fixed);
    if (PADDING_SIDES.some((side) => obj[side] !== undefined)) {
      return PADDING_SIDES.filter((side) => obj[side] !== undefined)
        .map((side) => `${side}=${formatLayoutValue(obj[side])}`)
        .join(', ');
    }
  }

  return JSON.stringify(value);
}

function formatStyleBlockSummary(block: StyleBlock): string {
  const parts = STYLE_PROPS.filter((prop) => block[prop] !== undefined).map(
    (prop) => `${prop}=${formatStyleValue(block[prop])}`,
  );
  return parts.length > 0 ? parts.join(', ') : 'no styles';
}

function compareStyleBlocks(
  scope: string,
  live: Record<string, StyleBlock>,
  kit: Record<string, StyleBlock>,
  differences: string[],
): void {
  const parts = Array.from(new Set([...Object.keys(live), ...Object.keys(kit)])).sort();

  for (const part of parts) {
    const liveBlock = live[part];
    const kitBlock = kit[part];

    if (liveBlock && !kitBlock) {
      differences.push(
        `${scope}.${part}: new anatomy part in Figma (${formatStyleBlockSummary(liveBlock)})`,
      );
      continue;
    }
    if (!liveBlock && kitBlock) {
      differences.push(
        `${scope}.${part}: part removed in Figma (kit has ${formatStyleBlockSummary(kitBlock)})`,
      );
      continue;
    }
    if (!liveBlock || !kitBlock) continue;

    for (const prop of STYLE_PROPS) {
      const liveValue = formatStyleValue(liveBlock[prop]);
      const kitValue = formatStyleValue(kitBlock[prop]);
      if (liveValue !== kitValue) {
        differences.push(`${scope}.${part}.${prop}: Figma has ${liveValue}, kit has ${kitValue}`);
      }
    }
  }
}

function variantKey(variant: ComponentVariant): string {
  return Object.keys(variant.props)
    .sort()
    .map((key) => `${key}=${String(variant.props[key])}`)
    .join(', ');
}

function stateStyles(state: ComponentState): Record<string, StyleBlock> {
  return state.styles || {};
}

function formatOptions(options: string[] | undefined): string {
  return options && options.length > 0 ? `(${options.join(', ')})` : '(none)';
}

function formatPropSummary(prop: ComponentProp): string {
  const bits: string[] = [prop.type];
  if (prop.type === 'variant') bits.push(`options: ${formatOptions(prop.options)}`);
  if (prop.default !== undefined) bits.push(`default: ${String(prop.default)}`);
  return bits.join(', ');
}

/**
 * Compares a live component spec (current Figma) with the spec exported in the kit.
 * Pure function: returns plain-English differences; an empty array means they match.
 */
export function diffComponentSpecs(liveSpec: ComponentSpec, kitSpec: ComponentSpec): string[] {
  const differences: string[] = [];

  if (liveSpec.description !== kitSpec.description) {
    differences.push(
      `description: Figma has "${liveSpec.description}", kit has "${kitSpec.description}"`,
    );
  }

  if (liveSpec.layout || kitSpec.layout) {
    for (const field of LAYOUT_FIELDS) {
      const liveValue = formatLayoutValue(liveSpec.layout?.[field]);
      const kitValue = formatLayoutValue(kitSpec.layout?.[field]);
      if (liveValue !== kitValue) {
        differences.push(`layout.${field}: Figma has ${liveValue}, kit has ${kitValue}`);
      }
    }
  }

  compareStyleBlocks('base', liveSpec.base || {}, kitSpec.base || {}, differences);

  const liveVariants = new Map((liveSpec.variants || []).map((v) => [variantKey(v), v]));
  const kitVariants = new Map((kitSpec.variants || []).map((v) => [variantKey(v), v]));
  const variantKeys = Array.from(new Set([...liveVariants.keys(), ...kitVariants.keys()])).sort();
  for (const key of variantKeys) {
    const liveVariant = liveVariants.get(key);
    const kitVariant = kitVariants.get(key);
    if (liveVariant && !kitVariant) {
      differences.push(`new variant: ${key} (not in the exported kit)`);
    } else if (!liveVariant && kitVariant) {
      differences.push(`variant removed: ${key} (in the exported kit, missing in Figma)`);
    } else if (liveVariant && kitVariant) {
      compareStyleBlocks(
        `variants[${key}]`,
        liveVariant.styles || {},
        kitVariant.styles || {},
        differences,
      );
    }
  }

  const liveStates = new Map((liveSpec.states || []).map((s) => [s.name, s]));
  const kitStates = new Map((kitSpec.states || []).map((s) => [s.name, s]));
  const stateNames = Array.from(new Set([...liveStates.keys(), ...kitStates.keys()])).sort();
  for (const name of stateNames) {
    const liveState = liveStates.get(name);
    const kitState = kitStates.get(name);
    if (liveState && !kitState) {
      differences.push(`new state: ${name} (not in the exported kit)`);
    } else if (!liveState && kitState) {
      differences.push(`state removed: ${name} (in the exported kit, missing in Figma)`);
    } else if (liveState && kitState) {
      compareStyleBlocks(
        `states[${name}]`,
        stateStyles(liveState),
        stateStyles(kitState),
        differences,
      );
    }
  }

  const liveProps = new Map((liveSpec.props || []).map((p) => [p.name, p]));
  const kitProps = new Map((kitSpec.props || []).map((p) => [p.name, p]));
  const propNames = Array.from(new Set([...liveProps.keys(), ...kitProps.keys()])).sort();
  for (const name of propNames) {
    const liveProp = liveProps.get(name);
    const kitProp = kitProps.get(name);
    if (liveProp && !kitProp) {
      differences.push(`new prop: ${name} (${formatPropSummary(liveProp)})`);
    } else if (!liveProp && kitProp) {
      differences.push(`prop removed: ${name} (kit has ${formatPropSummary(kitProp)})`);
    } else if (liveProp && kitProp) {
      if (liveProp.type !== kitProp.type) {
        differences.push(
          `prop "${name}" type: Figma has ${liveProp.type}, kit has ${kitProp.type}`,
        );
      }
      if (JSON.stringify(liveProp.options || []) !== JSON.stringify(kitProp.options || [])) {
        differences.push(
          `prop "${name}" options: Figma has ${formatOptions(liveProp.options)}, kit has ${formatOptions(kitProp.options)}`,
        );
      }
      if (String(liveProp.default) !== String(kitProp.default)) {
        differences.push(
          `prop "${name}" default: Figma has ${String(liveProp.default)}, kit has ${String(kitProp.default)}`,
        );
      }
    }
  }

  return differences;
}
