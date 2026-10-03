import { ZodError } from 'zod';
import { MANIFEST_FILENAME, STATE_NAMES, SUPPORTED_KIT_VERSIONS } from './constants.js';
import { Manifest, ManifestSchema } from './manifest.js';
import { FlattenedToken, flattenTokens, resolveReference, TokensFile } from './tokens.js';
import { ComponentSpec, ComponentSpecSchema, StyleBlock, StyleValue } from './component.js';

export interface ValidationError {
  file?: string;
  path: string;
  message: string;
}

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; errors: ValidationError[] };

export function formatPath(pathSegments: (string | number)[]): string {
  return pathSegments.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') {
      return `${acc}[${segment}]`;
    }
    return acc ? `${acc}.${segment}` : `${segment}`;
  }, '');
}

export function formatValidationError(err: ValidationError): string {
  const filePrefix = err.file ? `${err.file} > ` : '';
  const pathPrefix = err.path ? `${err.path}: ` : '';
  return `${filePrefix}${pathPrefix}${err.message}`;
}

function zodErrorsToValidationErrors(error: ZodError, file?: string): ValidationError[] {
  return error.issues.map((issue) => ({
    file,
    path: formatPath(issue.path as (string | number)[]),
    message: issue.message,
  }));
}

/**
 * Validates a manifest JSON object against ManifestSchema.
 */
export function validateManifest(
  json: unknown,
  file: string = MANIFEST_FILENAME,
): ValidationResult<Manifest> {
  const result = ManifestSchema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      errors: zodErrorsToValidationErrors(result.error, file),
    };
  }
  return { ok: true, data: result.data };
}

/**
 * Validates a tokens JSON object against DTCG specifications.
 */
export function validateTokens(json: unknown, file = 'tokens.json'): ValidationResult<TokensFile> {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return {
      ok: false,
      errors: [
        {
          file,
          path: '',
          message: 'Tokens file must be a JSON object',
        },
      ],
    };
  }

  const errors: ValidationError[] = [];
  const tokenMap = flattenTokens(json);

  // Validate that token references within tokens.json itself resolve without loops
  for (const [tokenPath, token] of tokenMap.entries()) {
    if (
      typeof token.$value === 'string' &&
      token.$value.startsWith('{') &&
      token.$value.endsWith('}')
    ) {
      try {
        resolveReference(token.$value, tokenMap);
      } catch (err: unknown) {
        errors.push({
          file,
          path: `${tokenPath}.$value`,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, data: json as TokensFile };
}

/**
 * Validates a component JSON object against ComponentSpecSchema.
 */
export function validateComponent(
  json: unknown,
  file = 'component.json',
): ValidationResult<ComponentSpec> {
  const result = ComponentSpecSchema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      errors: zodErrorsToValidationErrors(result.error, file),
    };
  }
  return { ok: true, data: result.data };
}

export interface RawValueItem {
  path: string;
  value: string;
}

/**
 * Walks a StyleBlock and extracts all StyleValues with their field paths.
 */
function extractStyleBlockValues(
  block: StyleBlock | undefined,
  basePath: string,
  onValue: (value: StyleValue, path: string) => void,
) {
  if (!block || typeof block !== 'object') return;

  const styleProps: (keyof StyleBlock)[] = [
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

  for (const prop of styleProps) {
    const val = block[prop];
    if (val !== undefined) {
      onValue(val, `${basePath}.${prop}`);
    }
  }
}

/**
 * Walks all StyleValue locations in a component specification.
 */
export function walkComponentStyleValues(
  component: ComponentSpec,
  onValue: (value: StyleValue, path: string) => void,
) {
  // 1. Layout
  if (component.layout) {
    if (component.layout.gap) {
      onValue(component.layout.gap, 'layout.gap');
    }
    if (component.layout.padding) {
      const p = component.layout.padding;
      if (p.top) onValue(p.top, 'layout.padding.top');
      if (p.right) onValue(p.right, 'layout.padding.right');
      if (p.bottom) onValue(p.bottom, 'layout.padding.bottom');
      if (p.left) onValue(p.left, 'layout.padding.left');
    }
    if (
      component.layout.width &&
      typeof component.layout.width === 'object' &&
      'fixed' in component.layout.width
    ) {
      onValue(component.layout.width.fixed, 'layout.width.fixed');
    }
    if (
      component.layout.height &&
      typeof component.layout.height === 'object' &&
      'fixed' in component.layout.height
    ) {
      onValue(component.layout.height.fixed, 'layout.height.fixed');
    }
  }

  // 2. Base
  if (component.base) {
    for (const [part, block] of Object.entries(component.base)) {
      extractStyleBlockValues(block, `base.${part}`, onValue);
    }
  }

  // 3. Variants
  if (Array.isArray(component.variants)) {
    component.variants.forEach((v, vIdx) => {
      if (v.styles) {
        for (const [part, block] of Object.entries(v.styles)) {
          extractStyleBlockValues(block, `variants[${vIdx}].styles.${part}`, onValue);
        }
      }
    });
  }

  // 4. States
  if (Array.isArray(component.states)) {
    component.states.forEach((s, sIdx) => {
      if (s.styles) {
        for (const [part, block] of Object.entries(s.styles)) {
          extractStyleBlockValues(block, `states[${sIdx}].styles.${part}`, onValue);
        }
      }
    });
  }
}

/**
 * Finds all { raw: string } style values within a component specification.
 */
export function findRawValues(component: ComponentSpec): RawValueItem[] {
  const rawValues: RawValueItem[] = [];

  walkComponentStyleValues(component, (styleValue, path) => {
    if (typeof styleValue === 'object' && styleValue !== null && 'raw' in styleValue) {
      rawValues.push({
        path,
        value: styleValue.raw,
      });
    }
  });

  return rawValues;
}

export interface KitInput {
  manifest: unknown;
  tokens: unknown;
  components: Record<string, unknown> | Map<string, unknown>;
}

export interface ValidatedKit {
  manifest: Manifest;
  tokens: TokensFile;
  flattenedTokens: Map<string, FlattenedToken>;
  components: Map<string, ComponentSpec>;
}

/**
 * Validates an entire kit: single-file validations plus cross-file consistency checks.
 */
export function validateKit(kit: KitInput): ValidationResult<ValidatedKit> {
  const errors: ValidationError[] = [];

  // 1. Validate Manifest
  let validManifest: Manifest | undefined;
  if (!kit.manifest || typeof kit.manifest !== 'object') {
    errors.push({
      file: MANIFEST_FILENAME,
      path: '',
      message: 'Manifest must be a JSON object',
    });
  } else {
    const rawManifest = kit.manifest as Record<string, unknown>;
    // Check kitVersion compatibility early with descriptive error
    if (
      typeof rawManifest.kitVersion === 'string' &&
      !SUPPORTED_KIT_VERSIONS.includes(
        rawManifest.kitVersion as (typeof SUPPORTED_KIT_VERSIONS)[number],
      )
    ) {
      errors.push({
        file: MANIFEST_FILENAME,
        path: 'kitVersion',
        message: `Kit version "${rawManifest.kitVersion}" is not supported. This release supports: ${SUPPORTED_KIT_VERSIONS.join(', ')}`,
      });
    }

    const manifestRes = validateManifest(kit.manifest);
    if (!manifestRes.ok) {
      // Append non-duplicate errors
      for (const err of manifestRes.errors) {
        if (!errors.some((e) => e.file === err.file && e.path === err.path)) {
          errors.push(err);
        }
      }
    } else {
      validManifest = manifestRes.data;
    }
  }

  // 2. Validate Tokens
  let validTokens: TokensFile | undefined;
  let flattenedTokens = new Map<string, FlattenedToken>();
  if (!kit.tokens || typeof kit.tokens !== 'object') {
    errors.push({
      file: 'tokens.json',
      path: '',
      message: 'Tokens must be a JSON object',
    });
  } else {
    const tokensRes = validateTokens(kit.tokens);
    if (!tokensRes.ok) {
      errors.push(...tokensRes.errors);
    } else {
      validTokens = tokensRes.data;
      flattenedTokens = flattenTokens(validTokens);
    }
  }

  // 3. Validate Individual Components
  const componentsMap = new Map<string, ComponentSpec>();
  const componentEntries: [string, unknown][] =
    kit.components instanceof Map
      ? Array.from(kit.components.entries())
      : Object.entries(kit.components || {});

  for (const [filePath, compJson] of componentEntries) {
    const compRes = validateComponent(compJson, filePath);
    if (!compRes.ok) {
      errors.push(...compRes.errors);
    } else {
      componentsMap.set(filePath, compRes.data);
    }
  }

  // 4. Cross-file checks
  if (validManifest) {
    // 4a. Check manifest components against supplied component files
    const manifestCompNames = new Set<string>();

    validManifest.components.forEach((entry, idx) => {
      // Check duplicate component names in manifest
      if (manifestCompNames.has(entry.name)) {
        errors.push({
          file: MANIFEST_FILENAME,
          path: `components[${idx}].name`,
          message: `Duplicate component name "${entry.name}" declared in manifest`,
        });
      }
      manifestCompNames.add(entry.name);

      // Check if entry file exists in provided components
      const componentSpec = componentsMap.get(entry.file);
      if (!componentSpec) {
        errors.push({
          file: MANIFEST_FILENAME,
          path: `components[${idx}].file`,
          message: `Manifest component file "${entry.file}" does not exist in kit`,
        });
      } else {
        // Name in file must match manifest entry name
        if (componentSpec.name !== entry.name) {
          errors.push({
            file: entry.file,
            path: 'name',
            message: `Component name "${componentSpec.name}" does not match manifest entry name "${entry.name}"`,
          });
        }
      }
    });

    // Check duplicate component names across actual parsed component specs
    const nameToFiles = new Map<string, string[]>();
    for (const [filePath, spec] of componentsMap.entries()) {
      const list = nameToFiles.get(spec.name) || [];
      list.push(filePath);
      nameToFiles.set(spec.name, list);
    }
    for (const [name, files] of nameToFiles.entries()) {
      if (files.length > 1) {
        errors.push({
          file: files[0],
          path: 'name',
          message: `Duplicate component name "${name}" found in multiple files: ${files.join(', ')}`,
        });
      }
    }
  }

  // 5. Component internal integrity & token reference validation
  for (const [filePath, component] of componentsMap.entries()) {
    // 5a. Check token references
    walkComponentStyleValues(component, (styleValue, path) => {
      if (typeof styleValue === 'string') {
        try {
          resolveReference(styleValue, flattenedTokens);
        } catch (err: unknown) {
          errors.push({
            file: filePath,
            path,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });

    // 5b. Check declared anatomy parts
    const anatomyPartNames = new Set(component.anatomy.map((a) => a.name));

    // Base styles
    if (component.base) {
      for (const part of Object.keys(component.base)) {
        if (!anatomyPartNames.has(part)) {
          errors.push({
            file: filePath,
            path: `base.${part}`,
            message: `Anatomy part "${part}" used in base is not declared in anatomy`,
          });
        }
      }
    }

    // Variant styles & variant props
    const propMap = new Map(component.props.map((p) => [p.name, p]));

    if (component.variants) {
      component.variants.forEach((v, vIdx) => {
        // Check variant props
        for (const [propName, propVal] of Object.entries(v.props)) {
          const propDef = propMap.get(propName);
          if (!propDef) {
            errors.push({
              file: filePath,
              path: `variants[${vIdx}].props.${propName}`,
              message: `Variant property "${propName}" is not declared in component props`,
            });
          } else if (propDef.type === 'variant' && propDef.options) {
            if (!propDef.options.includes(String(propVal))) {
              errors.push({
                file: filePath,
                path: `variants[${vIdx}].props.${propName}`,
                message: `"${propVal}" is not one of the ${propName} options (${propDef.options.join(', ')})`,
              });
            }
          }
        }

        // Check variant anatomy styles
        if (v.styles) {
          for (const part of Object.keys(v.styles)) {
            if (!anatomyPartNames.has(part)) {
              errors.push({
                file: filePath,
                path: `variants[${vIdx}].styles.${part}`,
                message: `Anatomy part "${part}" used in variants[${vIdx}] is not declared in anatomy`,
              });
            }
          }
        }
      });
    }

    // State styles
    if (component.states) {
      component.states.forEach((s, sIdx) => {
        if (s.styles) {
          for (const part of Object.keys(s.styles)) {
            if (!anatomyPartNames.has(part)) {
              errors.push({
                file: filePath,
                path: `states[${sIdx}].styles.${part}`,
                message: `Anatomy part "${part}" used in states[${sIdx}] is not declared in anatomy`,
              });
            }
          }
        }
      });
    }

    // Screenshot states
    const declaredStates = new Set(component.states.map((s) => s.name));
    if (component.screenshots) {
      component.screenshots.forEach((sc, scIdx) => {
        if (
          sc.state !== 'Default' &&
          !declaredStates.has(sc.state as (typeof STATE_NAMES)[number])
        ) {
          errors.push({
            file: filePath,
            path: `screenshots[${scIdx}].state`,
            message: `State "${sc.state}" used in screenshots is not declared in component states (must exist in states or be "Default")`,
          });
        }
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      manifest: validManifest!,
      tokens: validTokens!,
      flattenedTokens,
      components: componentsMap,
    },
  };
}
