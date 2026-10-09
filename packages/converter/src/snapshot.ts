export interface VariableAliasSnapshot {
  type: 'VARIABLE_ALIAS';
  id: string;
}

export interface PaintSnapshot {
  type: string;
  color?: { r: number; g: number; b: number };
  opacity?: number;
  visible?: boolean;
  boundVariables?: {
    color?: VariableAliasSnapshot;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface EffectSnapshot {
  type: string;
  color?: { r: number; g: number; b: number; a?: number };
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
  visible?: boolean;
  boundVariables?: Record<string, VariableAliasSnapshot>;
  [key: string]: unknown;
}

export interface ComponentPropertyDefinitionSnapshot {
  type: 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP' | string;
  defaultValue?: string | boolean;
  variantOptions?: string[];
  [key: string]: unknown;
}

export interface NodeSnapshot {
  id: string;
  name: string;
  type:
    | 'COMPONENT_SET'
    | 'COMPONENT'
    | 'INSTANCE'
    | 'FRAME'
    | 'GROUP'
    | 'TEXT'
    | 'RECTANGLE'
    | 'ELLIPSE'
    | 'VECTOR'
    | 'BOOLEAN_OPERATION'
    | string;
  visible?: boolean;
  opacity?: number;
  description?: string;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | string;
  layoutPositioning?: 'AUTO' | 'ABSOLUTE' | string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN' | string;
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE' | string;
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL' | string;
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL' | string;
  width?: number;
  height?: number;
  cornerRadius?: number | 'mixed';
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomRightRadius?: number;
  bottomLeftRadius?: number;
  fills?: PaintSnapshot[];
  strokes?: PaintSnapshot[];
  strokeWeight?: number;
  effects?: EffectSnapshot[];
  effectStyleId?: string;
  textStyleId?: string;
  boundVariables?: Record<string, VariableAliasSnapshot | VariableAliasSnapshot[] | undefined>;
  characters?: string;
  fontSize?: number;
  fontName?: { family: string; style: string };
  fontWeight?: number;
  lineHeight?: { unit: 'PIXELS' | 'PERCENT' | 'AUTO' | string; value?: number } | number;
  letterSpacing?: { unit: 'PIXELS' | 'PERCENT' | string; value: number } | number;
  componentPropertyDefinitions?: Record<string, ComponentPropertyDefinitionSnapshot>;
  variantProperties?: Record<string, string>;
  componentPropertyReferences?: Record<string, string>;
  mainComponentName?: string;
  children?: NodeSnapshot[];
  [key: string]: unknown;
}

export type VariableIndex = Record<string, { name: string; tokenPath: string }>;
export type StyleIndex = Record<string, { name: string; tokenPath: string }>;

/**
 * Lightweight runtime guard confirming value matches minimal NodeSnapshot requirements.
 * Unknown extra fields are ignored, not rejected.
 */
export function isNodeSnapshot(obj: unknown): obj is NodeSnapshot {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as Record<string, unknown>).id === 'string' &&
    typeof (obj as Record<string, unknown>).name === 'string' &&
    typeof (obj as Record<string, unknown>).type === 'string'
  );
}
