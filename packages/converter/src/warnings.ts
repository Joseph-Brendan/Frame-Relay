export type WarningSeverity = 'error' | 'warning' | 'info';

export interface ConverterWarning {
  code: string;
  severity: WarningSeverity;
  component: string;
  layerPath: string;
  nodeId?: string;
  message: string;
}

export interface WarningDefinition {
  code: string;
  severity: WarningSeverity;
  meaning: string;
}

export const WARNING_CODES = {
  NOT_A_COMPONENT: {
    code: 'NOT_A_COMPONENT',
    severity: 'error',
    meaning: 'Target Figma node is not a COMPONENT or COMPONENT_SET.',
  },
  BAD_COMPONENT_NAME: {
    code: 'BAD_COMPONENT_NAME',
    severity: 'warning',
    meaning: 'Component name is not PascalCase and was automatically normalized.',
  },
  MISSING_DESCRIPTION: {
    code: 'MISSING_DESCRIPTION',
    severity: 'warning',
    meaning: 'Component has no description in Figma.',
  },
  MISSING_USAGE: {
    code: 'MISSING_USAGE',
    severity: 'warning',
    meaning: "Component description does not include Do: or Don't: usage guidelines.",
  },
  NO_AUTO_LAYOUT: {
    code: 'NO_AUTO_LAYOUT',
    severity: 'warning',
    meaning: 'Frame layer has child nodes but does not use Auto Layout.',
  },
  ABSOLUTE_CHILD: {
    code: 'ABSOLUTE_CHILD',
    severity: 'warning',
    meaning: 'Child layer uses absolute positioning instead of flow Auto Layout.',
  },
  BAD_PART_NAME: {
    code: 'BAD_PART_NAME',
    severity: 'warning',
    meaning:
      'Layer with visible styles has a default Figma name instead of kebab-case anatomy part name.',
  },
  DUPLICATE_PART_NAME: {
    code: 'DUPLICATE_PART_NAME',
    severity: 'warning',
    meaning: 'Multiple layers share the same kebab-case anatomy part name; keeping the first.',
  },
  UNKNOWN_STATE: {
    code: 'UNKNOWN_STATE',
    severity: 'warning',
    meaning: 'State variant value is not in the standard STATE_NAMES list and was skipped.',
  },
  MISSING_DEFAULT_STATE: {
    code: 'MISSING_DEFAULT_STATE',
    severity: 'error',
    meaning: 'Component set contains interactive states but is missing a State=Default variant.',
  },
  NON_STANDARD_VARIANT_PROPERTY: {
    code: 'NON_STANDARD_VARIANT_PROPERTY',
    severity: 'info',
    meaning: 'Variant property name is not one of Variant, Size, or State.',
  },
  UNSUPPORTED_PAINT: {
    code: 'UNSUPPORTED_PAINT',
    severity: 'warning',
    meaning: 'Fill uses an unsupported paint type (e.g. gradient or image) and was skipped.',
  },
  UNSUPPORTED_EFFECT: {
    code: 'UNSUPPORTED_EFFECT',
    severity: 'warning',
    meaning: 'Effect uses an unsupported type (e.g. blur) and was skipped.',
  },
  MIXED_RADIUS: {
    code: 'MIXED_RADIUS',
    severity: 'warning',
    meaning: 'Layer uses mixed corner radii that cannot be mapped to a single uniform token.',
  },
  RAW_VALUE: {
    code: 'RAW_VALUE',
    severity: 'warning',
    meaning: 'Style or layout value is not bound to a Figma variable or token.',
  },
  UNSUPPORTED_VARIABLE_TYPE: {
    code: 'UNSUPPORTED_VARIABLE_TYPE',
    severity: 'warning',
    meaning: 'Figma variable type cannot be converted to a DTCG design token and was skipped.',
  },
  SCHEMA_VALIDATION_ERROR: {
    code: 'SCHEMA_VALIDATION_ERROR',
    severity: 'error',
    meaning: 'Generated component specification failed schema validation.',
  },
} as const satisfies Record<string, WarningDefinition>;

export type WarningCode = keyof typeof WARNING_CODES;

export function createWarning(
  code: WarningCode,
  context: {
    component: string;
    layerPath: string;
    nodeId?: string;
    details: string;
    fix?: string;
  },
  overrideSeverity?: WarningSeverity,
): ConverterWarning {
  const def = WARNING_CODES[code];
  const severity = overrideSeverity ?? def.severity;
  const prefix = context.layerPath
    ? `${context.component} > ${context.layerPath}: `
    : `${context.component}: `;
  const fixSuffix = context.fix ? ` ${context.fix}` : '';
  const message = `${prefix}${context.details}.${fixSuffix}`.trim();

  return {
    code: def.code,
    severity,
    component: context.component,
    layerPath: context.layerPath,
    nodeId: context.nodeId,
    message,
  };
}
