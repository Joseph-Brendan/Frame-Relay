import { ComponentSpec } from '@josephbrendan/schema';
import { layoutToClasses, stateToPrefix, styleBlockToClasses } from './mapping.js';

export interface BuildCvaResult {
  cvaCode: string;
  variantTypeProps: string[];
  defaultVariants: Record<string, string>;
  hasRaw: boolean;
}

export function buildCvaDefinition(
  spec: ComponentSpec,
  cvaName: string,
  extraBaseClasses: string[] = [],
): BuildCvaResult {
  let hasRaw = false;

  // 1. Base classes
  const baseParts: string[] = [...extraBaseClasses];

  // Base layout
  const layoutRes = layoutToClasses(spec.layout);
  if (layoutRes.hasRaw) hasRaw = true;
  baseParts.push(...layoutRes.classes);

  // Base root styles
  const baseRoot = spec.base.root;
  if (baseRoot) {
    const baseStyleRes = styleBlockToClasses(baseRoot);
    if (baseStyleRes.hasRaw) hasRaw = true;
    baseParts.push(...baseStyleRes.classes);
  }

  // Interactive States on root
  if (spec.states) {
    for (const state of spec.states) {
      if (state.name === 'Default') continue;
      const rootStateStyles = state.styles.root;
      if (rootStateStyles) {
        const prefix = stateToPrefix(state.name);
        const stateRes = styleBlockToClasses(rootStateStyles, prefix);
        if (stateRes.hasRaw) hasRaw = true;
        baseParts.push(...stateRes.classes);
      }
    }
  }

  // 2. Discover variant properties
  const variantProps = spec.props.filter(
    (p) => p.type === 'variant' && p.options && p.options.length > 0,
  );
  const variantTypeProps = variantProps.map((p) => p.name);

  const variantsMap: Record<string, Record<string, string[]>> = {};
  const defaultVariants: Record<string, string> = {};

  for (const vProp of variantProps) {
    variantsMap[vProp.name] = {};
    if (vProp.default && typeof vProp.default === 'string') {
      defaultVariants[vProp.name] = vProp.default;
    }

    for (const opt of vProp.options || []) {
      variantsMap[vProp.name][opt] = [];
    }
  }

  // Populate variant overrides from spec.variants
  if (spec.variants) {
    for (const vEntry of spec.variants) {
      const rootStyles = vEntry.styles.root;
      if (!rootStyles) continue;

      const styleRes = styleBlockToClasses(rootStyles);
      if (styleRes.hasRaw) hasRaw = true;

      for (const [propName, optVal] of Object.entries(vEntry.props)) {
        const optStr = String(optVal);
        if (variantsMap[propName] && variantsMap[propName][optStr]) {
          for (const cls of styleRes.classes) {
            if (!variantsMap[propName][optStr].includes(cls)) {
              variantsMap[propName][optStr].push(cls);
            }
          }
        }
      }
    }
  }

  // Format CVA definition
  const baseString = baseParts.join(' ');
  const variantsObjStrings: string[] = [];

  for (const [propName, optMap] of Object.entries(variantsMap)) {
    const optLines: string[] = [];
    for (const [opt, clsList] of Object.entries(optMap)) {
      optLines.push(`      ${JSON.stringify(opt)}: ${JSON.stringify(clsList.join(' '))},`);
    }
    variantsObjStrings.push(`    ${propName}: {\n${optLines.join('\n')}\n    },`);
  }

  const defaultObjStrings: string[] = [];
  for (const [pName, defVal] of Object.entries(defaultVariants)) {
    defaultObjStrings.push(`      ${pName}: ${JSON.stringify(defVal)},`);
  }

  const cvaCode = `export const ${cvaName} = cva(\n  ${JSON.stringify(baseString)},\n  {\n    variants: {\n${variantsObjStrings.join('\n')}\n    },\n    defaultVariants: {\n${defaultObjStrings.join('\n')}\n    },\n  },\n);`;

  return {
    cvaCode,
    variantTypeProps,
    defaultVariants,
    hasRaw,
  };
}
