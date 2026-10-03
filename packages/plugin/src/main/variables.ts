import {
  ConverterWarning,
  createWarning,
  NodeSnapshot,
  StyleIndex,
  variableNameToTokenPath,
  VariableCollectionSnapshot,
  VariableSnapshot,
} from '@josephbrendan/converter';

export interface ReadVariablesAndStylesResult {
  collections: VariableCollectionSnapshot[];
  variables: VariableSnapshot[];
  styles: StyleIndex;
  warnings: ConverterWarning[];
}

/**
 * Traverses a node snapshot tree and extracts all bound variable IDs.
 */
export function collectBoundVariableIds(node: NodeSnapshot): Set<string> {
  const ids = new Set<string>();

  const walk = (n: NodeSnapshot) => {
    // Node-level bound variables
    if (n.boundVariables) {
      for (const val of Object.values(n.boundVariables)) {
        if (!val) continue;
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && item.type === 'VARIABLE_ALIAS' && item.id) ids.add(item.id);
          }
        } else if (val.type === 'VARIABLE_ALIAS' && val.id) {
          ids.add(val.id);
        }
      }
    }

    // Paint bound variables (fills, strokes)
    const checkPaints = (paints?: Array<{ boundVariables?: Record<string, unknown> }>) => {
      if (!paints) return;
      for (const p of paints) {
        if (p.boundVariables) {
          for (const bv of Object.values(p.boundVariables)) {
            if (
              bv &&
              typeof bv === 'object' &&
              (bv as { type?: string }).type === 'VARIABLE_ALIAS' &&
              (bv as { id?: string }).id
            ) {
              ids.add((bv as { id: string }).id);
            }
          }
        }
      }
    };

    checkPaints(n.fills);
    checkPaints(n.strokes);

    // Effect bound variables
    if (n.effects) {
      for (const e of n.effects) {
        if (e.boundVariables) {
          for (const bv of Object.values(e.boundVariables)) {
            if (bv && bv.type === 'VARIABLE_ALIAS' && bv.id) {
              ids.add(bv.id);
            }
          }
        }
      }
    }

    if (n.children) {
      for (const child of n.children) {
        walk(child);
      }
    }
  };

  walk(node);
  return ids;
}

/**
 * Reads local variable collections, local variables, external library variables, and local styles.
 */
export async function readVariablesAndStyles(
  componentSnapshots: NodeSnapshot[],
): Promise<ReadVariablesAndStylesResult> {
  const warnings: ConverterWarning[] = [];

  // 1. Read local variable collections
  const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const collections: VariableCollectionSnapshot[] = localCollections.map((col) => ({
    id: col.id,
    name: col.name,
    modes: col.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
    defaultModeId: col.defaultModeId,
  }));

  // 2. Read local variables
  const localVariables = await figma.variables.getLocalVariablesAsync();
  const localVariableMap = new Map<string, Variable>();
  const variables: VariableSnapshot[] = [];

  for (const v of localVariables) {
    localVariableMap.set(v.id, v);
    variables.push({
      id: v.id,
      name: v.name,
      variableCollectionId: v.variableCollectionId,
      resolvedType: v.resolvedType,
      valuesByMode: { ...v.valuesByMode },
      scopes: v.scopes ? [...v.scopes] : undefined,
      description: v.description || undefined,
    });
  }

  // 3. Collect all bound variable IDs across component snapshots and check for external variables
  const allBoundIds = new Set<string>();
  for (const comp of componentSnapshots) {
    const ids = collectBoundVariableIds(comp);
    for (const id of ids) allBoundIds.add(id);
  }

  // Check for external variables not in local map
  for (const id of allBoundIds) {
    if (!localVariableMap.has(id)) {
      try {
        const externalVar = await figma.variables.getVariableByIdAsync(id);
        if (externalVar) {
          variables.push({
            id: externalVar.id,
            name: externalVar.name,
            variableCollectionId: externalVar.variableCollectionId,
            resolvedType: externalVar.resolvedType,
            valuesByMode: { ...externalVar.valuesByMode },
            scopes: externalVar.scopes ? [...externalVar.scopes] : undefined,
            description: externalVar.description || undefined,
          });

          warnings.push(
            createWarning('RAW_VALUE', {
              component: 'Tokens',
              layerPath: externalVar.name,
              nodeId: externalVar.id,
              details: `uses a variable "${externalVar.name}" from another library`,
              fix: 'publish or copy it into this file for a complete kit',
            }),
          );
        }
      } catch {
        // Variable couldn't be loaded or no permission
      }
    }
  }

  // 4. Read local text and effect styles
  const styles: StyleIndex = {};

  const [textStyles, effectStyles] = await Promise.all([
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
  ]);

  for (const s of textStyles) {
    styles[s.id] = {
      name: s.name,
      tokenPath: variableNameToTokenPath(s.name),
    };
  }

  for (const s of effectStyles) {
    styles[s.id] = {
      name: s.name,
      tokenPath: variableNameToTokenPath(s.name),
    };
  }

  return {
    collections,
    variables,
    styles,
    warnings,
  };
}
