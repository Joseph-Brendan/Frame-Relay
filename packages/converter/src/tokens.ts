import { TokensFile, validateTokens } from '@frame-relay/schema';
import { ConverterWarning, createWarning } from './warnings.js';
import { VariableAliasSnapshot, VariableIndex } from './snapshot.js';

export interface VariableCollectionSnapshot {
  id: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
}

export interface VariableSnapshot {
  id: string;
  name: string;
  variableCollectionId?: string;
  resolvedType: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN' | string;
  valuesByMode: Record<string, unknown>;
  scopes?: string[];
  description?: string;
}

export interface ConvertVariablesInput {
  collections: VariableCollectionSnapshot[];
  variables: VariableSnapshot[];
}

export interface ConvertVariablesResult {
  tokens: TokensFile;
  variableIndex: VariableIndex;
  warnings: ConverterWarning[];
}

/**
 * Converts a Figma variable name to a dot-separated, kebab-case token path.
 * Slashes become dots; spaces and camelCase become kebab-case, all lowercase.
 * Example: "color/Primary/500" -> "color.primary.500"
 */
export function variableNameToTokenPath(name: string): string {
  return name
    .split('/')
    .map((segment) =>
      segment
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase(),
    )
    .join('.');
}

/**
 * Converts normalized 0..1 RGB(A) values to hexadecimal string.
 * Returns #rrggbb, or #rrggbbaa when opacity is less than 1.
 */
export function rgbaToHex(rgb: { r: number; g: number; b: number }, opacity = 1): string {
  const toHex = (n: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n * 255)));
    return clamped.toString(16).padStart(2, '0');
  };

  const r = toHex(rgb.r);
  const g = toHex(rgb.g);
  const b = toHex(rgb.b);

  if (opacity < 1) {
    const a = toHex(opacity);
    return `#${r}${g}${b}${a}`;
  }

  return `#${r}${g}${b}`;
}

function isVariableAlias(val: unknown): val is VariableAliasSnapshot {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as Record<string, unknown>).type === 'VARIABLE_ALIAS' &&
    typeof (val as Record<string, unknown>).id === 'string'
  );
}

/**
 * Sets a deep nested property on an object hierarchy.
 */
function setDeepProperty(root: Record<string, unknown>, pathSegments: string[], value: unknown) {
  let current = root;
  for (let i = 0; i < pathSegments.length - 1; i++) {
    const seg = pathSegments[i];
    if (!(seg in current) || typeof current[seg] !== 'object' || current[seg] === null) {
      current[seg] = {};
    }
    current = current[seg] as Record<string, unknown>;
  }
  current[pathSegments[pathSegments.length - 1]] = value;
}

/**
 * Converts Figma collections and variables into W3C DTCG tokens.json format.
 */
export function convertVariables(input: ConvertVariablesInput): ConvertVariablesResult {
  const warnings: ConverterWarning[] = [];
  const variableIndex: VariableIndex = {};

  // 1. Build variable index
  for (const v of input.variables) {
    variableIndex[v.id] = {
      name: v.name,
      tokenPath: variableNameToTokenPath(v.name),
    };
  }

  // Map collectionId -> collection
  const collectionMap = new Map<string, VariableCollectionSnapshot>();
  for (const col of input.collections) {
    collectionMap.set(col.id, col);
  }

  const tokens: Record<string, unknown> = {};

  for (const v of input.variables) {
    const tokenPath = variableIndex[v.id].tokenPath;
    const pathSegments = tokenPath.split('.');
    const collection = v.variableCollectionId
      ? collectionMap.get(v.variableCollectionId)
      : input.collections[0];

    const defaultModeId = collection?.defaultModeId ?? Object.keys(v.valuesByMode)[0];

    // Helper to format individual mode value
    const formatValue = (raw: unknown): { value: unknown; type?: string; skipped?: boolean } => {
      if (isVariableAlias(raw)) {
        const target = variableIndex[raw.id];
        if (target) {
          return { value: `{${target.tokenPath}}` };
        }
        return { value: raw };
      }

      switch (v.resolvedType) {
        case 'COLOR': {
          if (typeof raw === 'object' && raw !== null && 'r' in raw && 'g' in raw && 'b' in raw) {
            const rgb = raw as { r: number; g: number; b: number; a?: number };
            return {
              value: rgbaToHex(rgb, rgb.a ?? 1),
              type: 'color',
            };
          }
          if (typeof raw === 'string') {
            return { value: raw, type: 'color' };
          }
          return { value: raw, type: 'color' };
        }
        case 'FLOAT': {
          const num = typeof raw === 'number' ? raw : parseFloat(String(raw));
          const nameLower = v.name.toLowerCase();
          const scopes = v.scopes?.map((s) => s.toUpperCase()) || [];

          const isDimension =
            nameLower.includes('radius') ||
            nameLower.includes('spacing') ||
            nameLower.includes('space') ||
            nameLower.includes('gap') ||
            nameLower.includes('width') ||
            nameLower.includes('height') ||
            nameLower.includes('size') ||
            nameLower.includes('padding') ||
            scopes.includes('CORNER_RADIUS') ||
            scopes.includes('WIDTH_HEIGHT') ||
            scopes.includes('GAP');

          const isWeight =
            nameLower.includes('fontweight') ||
            nameLower.includes('weight') ||
            scopes.includes('FONT_WEIGHT');

          if (isDimension) {
            return { value: `${num}px`, type: 'dimension' };
          }
          if (isWeight) {
            return { value: `${num}`, type: 'fontWeight' };
          }
          return { value: num, type: 'number' };
        }
        case 'STRING': {
          const str = String(raw);
          const nameLower = v.name.toLowerCase();
          const isFontFamily =
            nameLower.includes('font') ||
            nameLower.includes('family') ||
            v.scopes?.some((s) => s.toUpperCase().includes('FONT'));

          if (isFontFamily) {
            return { value: str, type: 'fontFamily' };
          }

          warnings.push(
            createWarning('UNSUPPORTED_VARIABLE_TYPE', {
              component: 'Tokens',
              layerPath: tokenPath,
              details: `Variable "${v.name}" of type STRING is not a font family and was skipped`,
              fix: 'Store non-font strings outside tokens or categorize as font family',
            }),
          );
          return { value: str, skipped: true };
        }
        case 'BOOLEAN': {
          warnings.push(
            createWarning('UNSUPPORTED_VARIABLE_TYPE', {
              component: 'Tokens',
              layerPath: tokenPath,
              details: `Variable "${v.name}" of type BOOLEAN cannot be represented as a design token and was skipped`,
              fix: 'Use variant properties or component props for boolean flags',
            }),
          );
          return { value: raw, skipped: true };
        }
        default: {
          warnings.push(
            createWarning('UNSUPPORTED_VARIABLE_TYPE', {
              component: 'Tokens',
              layerPath: tokenPath,
              details: `Variable "${v.name}" has unknown resolvedType "${v.resolvedType}" and was skipped`,
              fix: 'Use COLOR, FLOAT, or font family STRING variables',
            }),
          );
          return { value: raw, skipped: true };
        }
      }
    };

    // Evaluate default mode value
    const defaultRaw = v.valuesByMode[defaultModeId];
    const defaultFormatted = formatValue(defaultRaw);

    if (defaultFormatted.skipped) {
      continue;
    }

    // Evaluate other modes for extensions
    const modesExtension: Record<string, unknown> = {};
    if (collection) {
      for (const mode of collection.modes) {
        if (mode.modeId !== defaultModeId) {
          const modeRaw = v.valuesByMode[mode.modeId];
          if (modeRaw !== undefined) {
            const formatted = formatValue(modeRaw);
            if (!formatted.skipped) {
              modesExtension[mode.name.toLowerCase()] = formatted.value;
            }
          }
        }
      }
    }

    const tokenDef: Record<string, unknown> = {
      $value: defaultFormatted.value,
    };

    // Set group-level $type when appropriate to match standard DTCG kit structure
    if (pathSegments[0] === 'color') {
      if (!tokens.color) tokens.color = {};
      (tokens.color as Record<string, unknown>).$type = 'color';
    } else if (pathSegments[0] === 'radius') {
      if (!tokens.radius) tokens.radius = {};
      (tokens.radius as Record<string, unknown>).$type = 'dimension';
    } else if (pathSegments[0] === 'space') {
      if (!tokens.space) tokens.space = {};
      (tokens.space as Record<string, unknown>).$type = 'dimension';
    } else if (pathSegments[0] === 'font' && pathSegments[1] === 'family') {
      if (!tokens.font) tokens.font = {};
      const font = tokens.font as Record<string, unknown>;
      if (!font.family) font.family = {};
      (font.family as Record<string, unknown>).$type = 'fontFamily';
    } else if (pathSegments[0] === 'font' && pathSegments[1] === 'weight') {
      if (!tokens.font) tokens.font = {};
      const font = tokens.font as Record<string, unknown>;
      if (!font.weight) font.weight = {};
      (font.weight as Record<string, unknown>).$type = 'fontWeight';
    } else if (defaultFormatted.type) {
      tokenDef.$type = defaultFormatted.type;
    }

    if (v.description) {
      tokenDef.$description = v.description;
    }

    if (Object.keys(modesExtension).length > 0) {
      tokenDef.$extensions = {
        'frame-relay': {
          modes: modesExtension,
        },
      };
    }

    setDeepProperty(tokens, pathSegments, tokenDef);
  }

  // Validate the generated tokens against @frame-relay/schema
  const validation = validateTokens(tokens);
  if (!validation.ok) {
    for (const err of validation.errors) {
      warnings.push(
        createWarning('SCHEMA_VALIDATION_ERROR', {
          component: 'Tokens',
          layerPath: err.path,
          details: `Generated tokens failed schema validation: ${err.message}`,
        }),
      );
    }
  }

  return {
    tokens: tokens as TokensFile,
    variableIndex,
    warnings,
  };
}
