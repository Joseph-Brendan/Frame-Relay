import { AnatomyPart, PART_NAME_REGEX } from '@josephbrendan/schema';
import { NodeSnapshot } from './snapshot.js';
import { ConverterWarning, createWarning } from './warnings.js';

const DEFAULT_FIGMA_NAME_REGEX =
  /^(Frame|Group|Rectangle|Ellipse|Vector|Boolean|Line|Star|Polygon|Text)\s*\d*$/i;

export interface ExtractedPartInfo {
  name: string;
  node: NodeSnapshot;
  path: string;
  required: boolean;
  description: string;
}

export interface ExtractAnatomyResult {
  anatomy: AnatomyPart[];
  parts: Map<string, ExtractedPartInfo>;
  warnings: ConverterWarning[];
}

function hasVisibleStyling(node: NodeSnapshot): boolean {
  const hasFill = Boolean(node.fills?.some((f) => f.visible !== false));
  const hasStroke = Boolean(node.strokes?.some((s) => s.visible !== false));
  const hasEffect = Boolean(node.effects?.some((e) => e.visible !== false));
  const hasText = Boolean(
    node.type === 'TEXT' && node.characters && node.characters.trim().length > 0,
  );
  return hasFill || hasStroke || hasEffect || hasText;
}

/**
 * Traverses a node tree and extracts kebab-case anatomy parts.
 */
export function extractAnatomy(
  rootNode: NodeSnapshot,
  componentName: string,
  allVariants?: NodeSnapshot[],
): ExtractAnatomyResult {
  const warnings: ConverterWarning[] = [];
  const parts = new Map<string, ExtractedPartInfo>();

  // 1. Root part is always "root"
  parts.set('root', {
    name: 'root',
    node: rootNode,
    path: 'root',
    required: true,
    description: 'Root container element',
  });

  const seenPartNames = new Set<string>(['root']);

  // Collect visibility of part names across all variant components if available
  const partVisibility = new Map<string, boolean>();

  if (allVariants && allVariants.length > 0) {
    for (const variant of allVariants) {
      const walkVariant = (curr: NodeSnapshot) => {
        if (PART_NAME_REGEX.test(curr.name)) {
          const isVis = curr.visible !== false;
          const tiedToProp = Boolean(curr.componentPropertyReferences?.visible);
          const currentVis = partVisibility.get(curr.name);
          // If tied to boolean prop, it's optional
          if (tiedToProp) {
            partVisibility.set(curr.name, false);
          } else {
            partVisibility.set(curr.name, currentVis === undefined ? isVis : currentVis && isVis);
          }
        }
        if (curr.children) {
          for (const c of curr.children) walkVariant(c);
        }
      };
      if (variant.children) {
        for (const c of variant.children) walkVariant(c);
      }
    }
  }

  // Traverse children of rootNode to find parts
  const traverse = (node: NodeSnapshot, currentPath: string) => {
    // Check for bad default layer names that hold visible styles
    if (DEFAULT_FIGMA_NAME_REGEX.test(node.name) && hasVisibleStyling(node)) {
      warnings.push(
        createWarning('BAD_PART_NAME', {
          component: componentName,
          layerPath: currentPath,
          nodeId: node.id,
          details: `Layer "${node.name}" holds visible styles but uses a default Figma name`,
          fix: 'Rename layer to a kebab-case part name (e.g. icon-left, label)',
        }),
      );
    }

    if (PART_NAME_REGEX.test(node.name)) {
      if (seenPartNames.has(node.name)) {
        warnings.push(
          createWarning('DUPLICATE_PART_NAME', {
            component: componentName,
            layerPath: currentPath,
            nodeId: node.id,
            details: `Duplicate anatomy part name "${node.name}" found in layer tree`,
            fix: 'Ensure each anatomy part layer has a unique kebab-case name',
          }),
        );
      } else {
        seenPartNames.add(node.name);

        const tiedToProp = Boolean(node.componentPropertyReferences?.visible);
        const crossVariantVis = partVisibility.get(node.name);
        const isRequired =
          !tiedToProp && (crossVariantVis !== undefined ? crossVariantVis : node.visible !== false);

        parts.set(node.name, {
          name: node.name,
          node,
          path: currentPath,
          required: isRequired,
          description: node.description?.trim() || `${node.name} element`,
        });
      }
    }

    if (node.children) {
      for (const child of node.children) {
        traverse(child, `${currentPath} > ${child.name}`);
      }
    }
  };

  if (rootNode.children) {
    for (const child of rootNode.children) {
      traverse(child, `root > ${child.name}`);
    }
  }

  const anatomy: AnatomyPart[] = Array.from(parts.values()).map((p) => ({
    name: p.name,
    description: p.description,
    required: p.required,
  }));

  return { anatomy, parts, warnings };
}
