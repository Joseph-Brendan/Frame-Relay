import { Layout, Padding, StyleBlock, StyleValue } from '@josephbrendan/schema';

export interface StyleMappingResult {
  classes: string[];
  hasRaw: boolean;
}

function cleanTokenRef(ref: string): string {
  // Strip outer curly braces: "{color.primary.500}" -> "color.primary.500"
  const inner = ref.replace(/^\{|\}$/g, '').trim();
  return inner
    .replace(/\./g, '-')
    .replace(/\//g, '-')
    .replace(/\s+/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

export function tokenRefToTailwind(
  ref: string,
  prop: keyof StyleBlock | 'gap' | 'padding',
): string {
  const token = cleanTokenRef(ref);

  switch (prop) {
    case 'background': {
      const name = token.replace(/^color-/, '');
      return `bg-${name}`;
    }
    case 'color': {
      const name = token.replace(/^color-/, '');
      return `text-${name}`;
    }
    case 'borderColor': {
      const name = token.replace(/^color-/, '');
      return `border border-${name}`;
    }
    case 'borderWidth': {
      const name = token.replace(/^space-|^dimension-/, '');
      return `border-${name}`;
    }
    case 'borderRadius': {
      const name = token.replace(/^radius-/, '');
      return name === 'default' ? 'rounded' : `rounded-${name}`;
    }
    case 'boxShadow': {
      const name = token.replace(/^shadow-/, '');
      return name === 'default' ? 'shadow' : `shadow-${name}`;
    }
    case 'typography': {
      const name = token.replace(/^typography-/, '');
      return `text-${name}`;
    }
    case 'gap': {
      const name = token.replace(/^(space|spacing)-/, '');
      return `gap-${name}`;
    }
    case 'padding': {
      const name = token.replace(/^(space|spacing)-/, '');
      return `p-${name}`;
    }
    default:
      return '';
  }
}

export function styleValueToTailwind(
  val: StyleValue | undefined,
  prop: keyof StyleBlock | 'gap' | 'padding',
): { tw?: string; isRaw: boolean } {
  if (!val) return { isRaw: false };

  if (typeof val === 'string') {
    return { tw: tokenRefToTailwind(val, prop), isRaw: false };
  }

  // Raw value
  const rawStr = val.raw.trim();
  switch (prop) {
    case 'background':
      return { tw: `bg-[${rawStr}]`, isRaw: true };
    case 'color':
      return { tw: `text-[${rawStr}]`, isRaw: true };
    case 'borderColor':
      return { tw: `border border-[${rawStr}]`, isRaw: true };
    case 'borderWidth':
      return { tw: `border-[${rawStr}]`, isRaw: true };
    case 'borderRadius':
      return { tw: `rounded-[${rawStr}]`, isRaw: true };
    case 'boxShadow':
      return { tw: `shadow-[${rawStr}]`, isRaw: true };
    case 'opacity': {
      const num = parseFloat(rawStr);
      if (!isNaN(num)) {
        return { tw: `opacity-${Math.round(num * 100)}`, isRaw: false };
      }
      return { tw: `opacity-[${rawStr}]`, isRaw: true };
    }
    case 'gap':
      return { tw: `gap-[${rawStr}]`, isRaw: true };
    case 'padding':
      return { tw: `p-[${rawStr}]`, isRaw: true };
    default:
      return { isRaw: false };
  }
}

export function styleBlockToClasses(
  block: StyleBlock | undefined,
  prefix = '',
): StyleMappingResult {
  if (!block) return { classes: [], hasRaw: false };

  const classes: string[] = [];
  let hasRaw = false;

  const props: (keyof StyleBlock)[] = [
    'background',
    'color',
    'borderColor',
    'borderWidth',
    'borderRadius',
    'boxShadow',
    'typography',
    'opacity',
  ];

  for (const p of props) {
    const val = block[p];
    if (val !== undefined) {
      const res = styleValueToTailwind(val, p);
      if (res.tw) {
        if (prefix) {
          // If prefix has multiple space-separated prefixes (e.g. "disabled: aria-disabled:")
          const subPrefixes = prefix.trim().split(/\s+/);
          for (const sub of subPrefixes) {
            classes.push(`${sub}${res.tw}`);
          }
        } else {
          classes.push(res.tw);
        }
        if (res.isRaw) hasRaw = true;
      }
    }
  }

  return { classes, hasRaw };
}

function paddingToClasses(padding: Padding | undefined): { classes: string[]; hasRaw: boolean } {
  if (!padding) return { classes: [], hasRaw: false };
  const classes: string[] = [];
  let hasRaw = false;

  const top = padding.top;
  const right = padding.right;
  const bottom = padding.bottom;
  const left = padding.left;

  const isAllSame =
    top !== undefined &&
    JSON.stringify(top) === JSON.stringify(right) &&
    JSON.stringify(right) === JSON.stringify(bottom) &&
    JSON.stringify(bottom) === JSON.stringify(left);

  if (isAllSame && top) {
    const res = styleValueToTailwind(top, 'padding');
    if (res.tw) {
      classes.push(res.tw);
      if (res.isRaw) hasRaw = true;
      return { classes, hasRaw };
    }
  }

  const isXSame =
    right !== undefined && left !== undefined && JSON.stringify(right) === JSON.stringify(left);
  const isYSame =
    top !== undefined && bottom !== undefined && JSON.stringify(top) === JSON.stringify(bottom);

  if (isXSame && isYSame && right && top) {
    const xRes = styleValueToTailwind(right, 'padding');
    const yRes = styleValueToTailwind(top, 'padding');
    if (xRes.tw) {
      classes.push(xRes.tw.replace(/^p-/, 'px-'));
      if (xRes.isRaw) hasRaw = true;
    }
    if (yRes.tw) {
      classes.push(yRes.tw.replace(/^p-/, 'py-'));
      if (yRes.isRaw) hasRaw = true;
    }
    return { classes, hasRaw };
  }

  // Individual sides
  if (top) {
    const r = styleValueToTailwind(top, 'padding');
    if (r.tw) {
      classes.push(r.tw.replace(/^p-/, 'pt-'));
      if (r.isRaw) hasRaw = true;
    }
  }
  if (right) {
    const r = styleValueToTailwind(right, 'padding');
    if (r.tw) {
      classes.push(r.tw.replace(/^p-/, 'pr-'));
      if (r.isRaw) hasRaw = true;
    }
  }
  if (bottom) {
    const r = styleValueToTailwind(bottom, 'padding');
    if (r.tw) {
      classes.push(r.tw.replace(/^p-/, 'pb-'));
      if (r.isRaw) hasRaw = true;
    }
  }
  if (left) {
    const r = styleValueToTailwind(left, 'padding');
    if (r.tw) {
      classes.push(r.tw.replace(/^p-/, 'pl-'));
      if (r.isRaw) hasRaw = true;
    }
  }

  return { classes, hasRaw };
}

export function layoutToClasses(layout: Layout | undefined): StyleMappingResult {
  if (!layout) return { classes: [], hasRaw: false };
  const classes: string[] = ['flex'];
  let hasRaw = false;

  classes.push(layout.direction === 'column' ? 'flex-col' : 'flex-row');

  if (layout.justify) {
    const justifyMap: Record<string, string> = {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end',
      'space-between': 'justify-between',
      'space-around': 'justify-around',
      'space-evenly': 'justify-evenly',
    };
    if (justifyMap[layout.justify]) classes.push(justifyMap[layout.justify]);
  }

  if (layout.align) {
    const alignMap: Record<string, string> = {
      start: 'items-start',
      center: 'items-center',
      end: 'items-end',
      baseline: 'items-baseline',
      stretch: 'items-stretch',
    };
    if (alignMap[layout.align]) classes.push(alignMap[layout.align]);
  }

  if (layout.gap) {
    const res = styleValueToTailwind(layout.gap, 'gap');
    if (res.tw) {
      classes.push(res.tw);
      if (res.isRaw) hasRaw = true;
    }
  }

  if (layout.padding) {
    const padRes = paddingToClasses(layout.padding);
    classes.push(...padRes.classes);
    if (padRes.hasRaw) hasRaw = true;
  }

  if (layout.width === 'hug') classes.push('w-fit');
  else if (layout.width === 'fill') classes.push('w-full');
  else if (typeof layout.width === 'object' && layout.width.fixed) {
    const fixedVal = layout.width.fixed;
    if (typeof fixedVal === 'string') {
      classes.push(`w-[var(--fr-${cleanTokenRef(fixedVal)})]`);
    } else {
      classes.push(`w-[${fixedVal.raw}]`);
      hasRaw = true;
    }
  }

  if (layout.height === 'hug') classes.push('h-fit');
  else if (layout.height === 'fill') classes.push('h-full');
  else if (typeof layout.height === 'object' && layout.height.fixed) {
    const fixedVal = layout.height.fixed;
    if (typeof fixedVal === 'string') {
      classes.push(`h-[var(--fr-${cleanTokenRef(fixedVal)})]`);
    } else {
      classes.push(`h-[${fixedVal.raw}]`);
      hasRaw = true;
    }
  }

  return { classes, hasRaw };
}

export function stateToPrefix(stateName: string): string {
  switch (stateName) {
    case 'Hover':
      return 'hover:';
    case 'Focus':
      return 'focus-visible:';
    case 'Pressed':
      return 'active:';
    case 'Disabled':
      return 'disabled: aria-disabled:';
    case 'Error':
      return 'aria-invalid:';
    case 'Loading':
      return 'data-[loading=true]:';
    default:
      return '';
  }
}
