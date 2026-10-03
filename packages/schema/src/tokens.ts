import { z } from 'zod';
import { TOKEN_REFERENCE_REGEX } from './constants.js';

export const TOKEN_TYPES = [
  'color',
  'dimension',
  'fontFamily',
  'fontWeight',
  'duration',
  'number',
  'shadow',
  'typography',
  'border',
] as const;

export type TokenType = (typeof TOKEN_TYPES)[number];

export const TokenTypeSchema = z.enum(TOKEN_TYPES);

export const TokenExtensionsSchema = z
  .object({
    'frame-relay': z
      .object({
        modes: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type TokenExtensions = z.infer<typeof TokenExtensionsSchema>;

export interface TokenDefinition {
  $value: unknown;
  $type?: TokenType;
  $description?: string;
  $extensions?: TokenExtensions;
}

export interface FlattenedToken {
  path: string;
  $value: unknown;
  $type?: TokenType;
  $description?: string;
  $extensions?: TokenExtensions;
}

export const TokenDefinitionSchema = z.object({
  $value: z.unknown(),
  $type: TokenTypeSchema.optional(),
  $description: z.string().optional(),
  $extensions: TokenExtensionsSchema.optional(),
});

// A token file is a nested group/token dictionary matching DTCG specification
export const TokensFileSchema = z.record(z.string(), z.unknown());
export type TokensFile = z.infer<typeof TokensFileSchema>;

/**
 * Checks if an unknown value is a token object (has a defined $value property)
 */
export function isToken(obj: unknown): obj is TokenDefinition {
  return typeof obj === 'object' && obj !== null && '$value' in obj;
}

/**
 * Flattens a DTCG token tree into a Map of dot-separated paths to FlattenedToken
 */
export function flattenTokens(
  tokens: unknown,
  parentPath = '',
  inheritedGroupType?: TokenType,
  result = new Map<string, FlattenedToken>(),
): Map<string, FlattenedToken> {
  if (typeof tokens !== 'object' || tokens === null) {
    return result;
  }

  const record = tokens as Record<string, unknown>;

  // Check if current group defines an inherited $type
  let currentGroupType = inheritedGroupType;
  if (
    '$type' in record &&
    typeof record.$type === 'string' &&
    TOKEN_TYPES.includes(record.$type as TokenType)
  ) {
    currentGroupType = record.$type as TokenType;
  }

  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('$')) {
      continue;
    }

    const currentPath = parentPath ? `${parentPath}.${key}` : key;

    if (isToken(value)) {
      const tokenType =
        value.$type && TOKEN_TYPES.includes(value.$type as TokenType)
          ? (value.$type as TokenType)
          : currentGroupType;

      result.set(currentPath, {
        path: currentPath,
        $value: value.$value,
        $type: tokenType,
        $description: typeof value.$description === 'string' ? value.$description : undefined,
        $extensions:
          typeof value.$extensions === 'object' && value.$extensions !== null
            ? (value.$extensions as TokenExtensions)
            : undefined,
      });
    } else if (typeof value === 'object' && value !== null) {
      flattenTokens(value, currentPath, currentGroupType, result);
    }
  }

  return result;
}

export interface ResolvedTokenResult {
  path: string;
  value: unknown;
  token: FlattenedToken;
  chain: string[];
}

/**
 * Resolves a token reference (e.g. "{color.blue.500}" or "color.blue.500"),
 * following alias chains and detecting circular reference loops.
 */
export function resolveReference(
  ref: string,
  tokens: unknown | Map<string, FlattenedToken>,
): ResolvedTokenResult {
  const tokenMap = tokens instanceof Map ? tokens : flattenTokens(tokens);

  // Normalize ref: strip outer curly braces if present
  let currentPath = ref.trim();
  if (currentPath.startsWith('{') && currentPath.endsWith('}')) {
    currentPath = currentPath.slice(1, -1).trim();
  }

  const visited: string[] = [];

  while (true) {
    if (visited.includes(currentPath)) {
      const loop = [...visited, currentPath].join(' -> ');
      throw new Error(`Circular token reference detected: ${loop}`);
    }

    visited.push(currentPath);

    const token = tokenMap.get(currentPath);
    if (!token) {
      throw new Error(
        `Token reference "${ref}" could not be resolved: token "${currentPath}" not found`,
      );
    }

    const val = token.$value;
    if (typeof val === 'string' && TOKEN_REFERENCE_REGEX.test(val)) {
      currentPath = val.slice(1, -1).trim();
      continue;
    }

    return {
      path: currentPath,
      value: val,
      token,
      chain: visited,
    };
  }
}
