export interface LiveResolvedTarget {
  kind: 'component' | 'frame';
  /** The Figma node to snapshot: a component set/component, or a frame for everything else. */
  node: unknown;
  /** For a selected variant (or a variant instance), the variant properties to remember. */
  variantProperties?: Record<string, string>;
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/**
 * Resolves a Figma selection into something live mode can send:
 * - COMPONENT_SET or standalone COMPONENT -> the component itself
 * - a variant inside a set -> the set, remembering the variant
 * - an INSTANCE -> its main component (set), falling back to the instance as a frame
 * - anything else -> the node as a frame
 *
 * Returns null unless exactly one layer is selected. Pure aside from the instance's
 * getMainComponentAsync call; fake nodes can be passed in tests.
 */
export async function resolveLiveTarget(
  selection: readonly unknown[] | null | undefined,
): Promise<LiveResolvedTarget | null> {
  if (!Array.isArray(selection) || selection.length !== 1) return null;

  const node = asRecord(selection[0]);
  if (!node) return null;

  const type = typeof node.type === 'string' ? node.type : '';

  if (type === 'COMPONENT_SET') {
    return { kind: 'component', node };
  }

  if (type === 'COMPONENT') {
    const parent = asRecord(node.parent);
    if (parent && parent.type === 'COMPONENT_SET') {
      return {
        kind: 'component',
        node: parent,
        variantProperties: readStringRecord(node.variantProperties),
      };
    }
    return { kind: 'component', node };
  }

  if (type === 'INSTANCE') {
    const getMainComponentAsync = node.getMainComponentAsync;
    if (typeof getMainComponentAsync === 'function') {
      try {
        const main = await (getMainComponentAsync as () => Promise<unknown>).call(node);
        const mainNode = asRecord(main);
        if (mainNode) {
          const mainParent = asRecord(mainNode.parent);
          if (mainParent && mainParent.type === 'COMPONENT_SET') {
            return {
              kind: 'component',
              node: mainParent,
              variantProperties: readStringRecord(mainNode.variantProperties),
            };
          }
          return {
            kind: 'component',
            node: mainNode,
            variantProperties: readStringRecord(mainNode.variantProperties),
          };
        }
      } catch {
        // Remote or missing main component: fall through to a frame snapshot.
      }
    }
    return { kind: 'frame', node };
  }

  return { kind: 'frame', node };
}
