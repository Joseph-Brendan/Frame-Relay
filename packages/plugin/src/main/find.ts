import type { NodeSnapshot } from '@frame-relay/converter';
import { IconExportItem, ScopeOption } from '../shared/messages.js';
import { snapshotNode } from './snapshot.js';

export interface DiscoveredItems {
  components: (ComponentSetNode | ComponentNode)[];
  icons: (ComponentSetNode | ComponentNode)[];
}

/**
 * Finds the PageNode ancestor of any Figma scene node.
 */
export function getAncestorPage(node: BaseNode): PageNode | null {
  let curr: BaseNode | null = node;
  while (curr) {
    if (curr.type === 'PAGE') return curr as PageNode;
    curr = curr.parent;
  }
  return null;
}

/**
 * Checks whether a component represents an icon based on name or page.
 */
export function isIconNode(node: ComponentSetNode | ComponentNode): boolean {
  const name = node.name.trim();
  const lowerName = name.toLowerCase();

  if (lowerName.startsWith('icon/') || lowerName.startsWith('icon-')) {
    return true;
  }

  const page = getAncestorPage(node);
  if (page && page.name.trim().toLowerCase() === 'icons') {
    return true;
  }

  return false;
}

/**
 * Converts an icon component name to a normalized kebab-case filename without extension.
 */
export function normalizeIconName(name: string): string {
  let clean = name.trim();
  if (clean.toLowerCase().startsWith('icon/')) {
    clean = clean.slice(5).trim();
  } else if (clean.toLowerCase().startsWith('icon-')) {
    clean = clean.slice(5).trim();
  }

  return clean
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_#./]+/g, '-')
    .toLowerCase();
}

/**
 * Discovers components and icons according to selected scope (whole file or selection).
 */
export async function findComponentsAndIcons(scope: ScopeOption): Promise<DiscoveredItems> {
  let candidates: (ComponentSetNode | ComponentNode)[] = [];

  if (scope === 'file') {
    await figma.loadAllPagesAsync();
    candidates = figma.root.findAllWithCriteria({
      types: ['COMPONENT_SET', 'COMPONENT'],
    });
  } else {
    const selection = figma.currentPage.selection;
    const set = new Set<ComponentSetNode | ComponentNode>();

    for (const item of selection) {
      if (item.type === 'COMPONENT_SET' || item.type === 'COMPONENT') {
        set.add(item);
      } else if ('findAllWithCriteria' in item) {
        const nested = (item as FrameNode).findAllWithCriteria({
          types: ['COMPONENT_SET', 'COMPONENT'],
        });
        for (const n of nested) set.add(n);
      }
    }

    candidates = Array.from(set);
  }

  // Filter out COMPONENT nodes whose parent is a COMPONENT_SET (the set covers them)
  const rootComponents = candidates.filter((node) => {
    if (node.type === 'COMPONENT' && node.parent && node.parent.type === 'COMPONENT_SET') {
      return false;
    }
    return true;
  });

  const components: (ComponentSetNode | ComponentNode)[] = [];
  const icons: (ComponentSetNode | ComponentNode)[] = [];

  for (const node of rootComponents) {
    if (isIconNode(node)) {
      icons.push(node);
    } else {
      components.push(node);
    }
  }

  return { components, icons };
}

/**
 * Exports icon nodes to SVG strings.
 */
export async function exportIcons(
  iconNodes: (ComponentSetNode | ComponentNode)[],
  onProgress?: (current: number, total: number) => void,
): Promise<IconExportItem[]> {
  const result: IconExportItem[] = [];
  const total = iconNodes.length;

  for (let i = 0; i < total; i++) {
    const node = iconNodes[i];
    try {
      const svg = await node.exportAsync({ format: 'SVG_STRING' });
      const name = normalizeIconName(node.name) || `icon-${i + 1}`;
      result.push({ name, svg });
    } catch {
      // If SVG export fails for an icon, continue
    }
    if (onProgress) onProgress(i + 1, total);
  }

  return result;
}

/**
 * Batches component nodes into snapshots and yields periodically to avoid locking the UI thread.
 */
export async function snapshotComponentsInBatches(
  components: (ComponentSetNode | ComponentNode)[],
  batchSize = 20,
  onBatch?: (snapshots: NodeSnapshot[], isLast: boolean, current: number, total: number) => void,
): Promise<NodeSnapshot[]> {
  const total = components.length;
  const snapshots: NodeSnapshot[] = [];

  for (let i = 0; i < total; i += batchSize) {
    const slice = components.slice(i, i + batchSize);
    const batchSnapshots = slice.map((c) => snapshotNode(c));
    snapshots.push(...batchSnapshots);

    const isLast = i + batchSize >= total;
    if (onBatch) {
      onBatch(batchSnapshots, isLast, Math.min(i + batchSize, total), total);
    }

    // Yield to the event loop
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return snapshots;
}
