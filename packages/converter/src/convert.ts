import {
  ComponentSpec,
  COMPONENT_NAME_REGEX,
  validateComponent,
  validateKit,
  KIT_VERSION,
  ManifestSource,
  ManifestGenerator,
  Manifest,
} from '@frame-relay/schema';
import { isNodeSnapshot, NodeSnapshot, StyleIndex, VariableIndex } from './snapshot.js';
import { ConverterWarning, createWarning } from './warnings.js';
import { parseDescription } from './description.js';
import { extractAnatomy } from './anatomy.js';
import { extractLayout } from './layout.js';
import { extractVariantsAndStates, ScreenshotJob, toPascalCase } from './variants.js';

export interface ConvertComponentOptions {
  node: unknown;
  variables: VariableIndex;
  styles: StyleIndex;
}

export interface ConvertComponentResult {
  spec: ComponentSpec | null;
  warnings: ConverterWarning[];
  screenshotJobs: ScreenshotJob[];
}

export interface AssembleKitOptions {
  components: ComponentSpec[];
  tokens: unknown;
  source: ManifestSource;
  generator: ManifestGenerator;
  exportedAt: string;
  name?: string;
  modes?: string[];
}

export interface AssembleKitResult {
  files: Record<string, string>;
  warnings: ConverterWarning[];
}

/**
 * Converts a Figma node snapshot (COMPONENT_SET or standalone COMPONENT) into a Frame-Relay ComponentSpec.
 * Pure function: deterministic, synchronous, never throws.
 */
export function convertComponent(options: ConvertComponentOptions): ConvertComponentResult {
  const { node, variables = {}, styles = {} } = options;
  const warnings: ConverterWarning[] = [];

  // 1. Validate node type
  if (!isNodeSnapshot(node) || (node.type !== 'COMPONENT_SET' && node.type !== 'COMPONENT')) {
    const obj =
      typeof node === 'object' && node !== null ? (node as Record<string, unknown>) : null;
    const rawName = obj && typeof obj.name === 'string' ? obj.name : 'Unknown';
    const rawId = obj && typeof obj.id === 'string' ? obj.id : undefined;
    const rawType = obj && typeof obj.type === 'string' ? obj.type : 'unknown';

    warnings.push(
      createWarning(
        'NOT_A_COMPONENT',
        {
          component: rawName,
          layerPath: '',
          nodeId: rawId,
          details: `Target node type "${rawType}" is not a COMPONENT or COMPONENT_SET`,
          fix: 'Select a Figma component or component set to export',
        },
        'error',
      ),
    );

    return {
      spec: null,
      warnings,
      screenshotJobs: [],
    };
  }

  const typedNode = node as NodeSnapshot;

  // 2. Validate and normalize component name
  let componentName = (typedNode.name || 'Component').trim();
  if (!COMPONENT_NAME_REGEX.test(componentName)) {
    const normalized = toPascalCase(componentName) || 'Component';
    warnings.push(
      createWarning('BAD_COMPONENT_NAME', {
        component: normalized,
        layerPath: '',
        nodeId: typedNode.id,
        details: `Component name "${componentName}" is not PascalCase and was converted to "${normalized}"`,
        fix: 'Rename the component set or component in Figma to PascalCase',
      }),
    );
    componentName = normalized;
  }

  // 3. Description parsing (purpose, usage guidelines, accessibility)
  const descResult = parseDescription(typedNode.description, componentName);
  warnings.push(...descResult.warnings);

  // 4. Anatomy extraction
  const anatomyResult = extractAnatomy(typedNode, componentName, typedNode.children);
  warnings.push(...anatomyResult.warnings);

  const anatomy = anatomyResult.anatomy;

  // 5. Layout extraction from root frame
  // In Figma, a COMPONENT_SET is a canvas container; the actual component frame is the child COMPONENT
  let layoutTarget = typedNode;
  if (typedNode.type === 'COMPONENT_SET' && typedNode.children && typedNode.children.length > 0) {
    const baseChild =
      typedNode.children.find(
        (c) =>
          c.type === 'COMPONENT' &&
          (c.variantProperties?.State === 'Default' || c.variantProperties?.state === 'Default'),
      ) ||
      typedNode.children.find(
        (c) => c.type === 'COMPONENT' && c.children && c.children.length > 0,
      ) ||
      typedNode.children.find((c) => c.type === 'COMPONENT');

    if (baseChild) {
      if (!typedNode.layoutMode || typedNode.layoutMode === 'NONE') {
        layoutTarget = baseChild;
      }
    }
  }

  const { layout, warnings: layoutWarnings } = extractLayout(layoutTarget, {
    componentName,
    layerPath: 'root',
    variables,
  });
  warnings.push(...layoutWarnings);

  // 6. Variants, states, base styling, and screenshot jobs
  const varResult = extractVariantsAndStates(typedNode, {
    componentName,
    anatomy,
    variables,
    styles,
  });
  warnings.push(...varResult.warnings);

  // Stable sort base styling keys (root first)
  const sortedBase: Record<string, (typeof varResult.base)[string]> = {};
  const baseKeys = Object.keys(varResult.base).sort((a, b) => {
    if (a === 'root') return -1;
    if (b === 'root') return 1;
    return a.localeCompare(b);
  });
  for (const k of baseKeys) {
    sortedBase[k] = varResult.base[k];
  }

  // Stable sort variants
  const sortedVariants = [...varResult.variants].sort((a, b) => {
    const aKey = JSON.stringify(a.props, Object.keys(a.props).sort());
    const bKey = JSON.stringify(b.props, Object.keys(b.props).sort());
    return aKey.localeCompare(bKey);
  });

  // Assemble ComponentSpec
  const spec: ComponentSpec = {
    $schema: 'https://joseph-brendan.github.io/Frame-Relay/schemas/v1/component.schema.json',
    name: componentName,
    description: descResult.description,
    anatomy,
    props: varResult.props,
    base: sortedBase,
    variants: sortedVariants,
    states: varResult.states,
    usage: descResult.usage,
    screenshots: varResult.screenshots,
  };

  if (layout) {
    spec.layout = layout;
  }

  if (descResult.accessibility) {
    spec.accessibility = descResult.accessibility;
  }

  if (typedNode.id) {
    spec.source = {
      figmaNodeId: typedNode.id,
      figmaComponentKey: typeof typedNode.key === 'string' ? (typedNode.key as string) : undefined,
    };
  }

  // 7. Validate generated spec against schema
  const validationResult = validateComponent(spec);
  if (!validationResult.ok) {
    for (const err of validationResult.errors) {
      warnings.push(
        createWarning(
          'SCHEMA_VALIDATION_ERROR',
          {
            component: componentName,
            layerPath: err.path,
            nodeId: typedNode.id,
            details: `Component spec failed validation at "${err.path}": ${err.message}`,
            fix: 'Review component properties and naming to conform to Kit Schema v1',
          },
          'error',
        ),
      );
    }
  }

  return {
    spec,
    warnings,
    screenshotJobs: varResult.screenshotJobs,
  };
}

/**
 * Assembles a complete kit by building the manifest and file map, then validating via validateKit.
 * exportedAt must be provided explicitly (never uses system clock).
 */
export function assembleKit(options: AssembleKitOptions): AssembleKitResult {
  const {
    components,
    tokens,
    source,
    generator,
    exportedAt,
    name = source.fileName || 'Design Kit',
    modes = ['light'],
  } = options;

  const warnings: ConverterWarning[] = [];
  const files: Record<string, string> = {};

  // Build component entries for manifest
  const componentEntries = components.map((comp) => ({
    name: comp.name,
    file: `components/${comp.name}.json`,
  }));

  // Build manifest
  const manifest: Manifest = {
    $schema: 'https://joseph-brendan.github.io/Frame-Relay/schemas/v1/manifest.schema.json',
    kitVersion: KIT_VERSION,
    name,
    generator,
    source: {
      type: 'figma',
      fileKey: source.fileKey,
      fileName: source.fileName,
      page: source.page,
    },
    exportedAt,
    tokensFile: 'tokens.json',
    modes,
    components: componentEntries,
  };

  // Populate files map with pretty JSON
  files['frame-relay.json'] = JSON.stringify(manifest, null, 2);
  files['tokens.json'] = JSON.stringify(tokens, null, 2);

  for (const comp of components) {
    files[`components/${comp.name}.json`] = JSON.stringify(comp, null, 2);
  }

  // Validate entire kit using validateKit from @frame-relay/schema
  const componentsRecord: Record<string, unknown> = {};
  for (const comp of components) {
    componentsRecord[`components/${comp.name}.json`] = comp;
  }

  const kitValidation = validateKit({
    manifest,
    tokens,
    components: componentsRecord,
  });

  if (!kitValidation.ok) {
    for (const err of kitValidation.errors) {
      warnings.push(
        createWarning(
          'SCHEMA_VALIDATION_ERROR',
          {
            component: err.file || 'Kit',
            layerPath: err.path,
            details: `Kit validation error: ${err.message}`,
            fix: 'Resolve manifest, tokens or cross-file schema discrepancies',
          },
          'error',
        ),
      );
    }
  }

  return {
    files,
    warnings,
  };
}
