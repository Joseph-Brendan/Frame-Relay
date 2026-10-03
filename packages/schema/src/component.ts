import { z } from 'zod';
import {
  COMPONENT_NAME_REGEX,
  PART_NAME_REGEX,
  PROP_NAME_REGEX,
  STANDARD_VARIANT_PROPERTIES,
  STATE_NAMES,
  TOKEN_REFERENCE_REGEX,
} from './constants.js';

// Style values
export const RawStyleValueSchema = z.object({
  raw: z.string(),
});
export type RawStyleValue = z.infer<typeof RawStyleValueSchema>;

export const TokenReferenceStyleValueSchema = z.string().regex(TOKEN_REFERENCE_REGEX, {
  message: 'Token reference must be wrapped in curly braces, e.g. {radius.md}',
});

export const StyleValueSchema = z.union([TokenReferenceStyleValueSchema, RawStyleValueSchema]);
export type StyleValue = z.infer<typeof StyleValueSchema>;

// Style block
export const StyleBlockSchema = z.object({
  background: StyleValueSchema.optional(),
  color: StyleValueSchema.optional(),
  borderColor: StyleValueSchema.optional(),
  borderWidth: StyleValueSchema.optional(),
  borderRadius: StyleValueSchema.optional(),
  boxShadow: StyleValueSchema.optional(),
  typography: StyleValueSchema.optional(),
  opacity: StyleValueSchema.optional(),
  iconSize: StyleValueSchema.optional(),
});
export type StyleBlock = z.infer<typeof StyleBlockSchema>;

// Layout
export const DimensionConstraintSchema = z.union([
  z.literal('hug'),
  z.literal('fill'),
  z.object({
    fixed: StyleValueSchema,
  }),
]);
export type DimensionConstraint = z.infer<typeof DimensionConstraintSchema>;

export const PaddingSchema = z.object({
  top: StyleValueSchema.optional(),
  right: StyleValueSchema.optional(),
  bottom: StyleValueSchema.optional(),
  left: StyleValueSchema.optional(),
});
export type Padding = z.infer<typeof PaddingSchema>;

export const LayoutSchema = z.object({
  direction: z.enum(['row', 'column']),
  gap: StyleValueSchema.optional(),
  padding: PaddingSchema.optional(),
  justify: z
    .enum(['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly'])
    .optional(),
  align: z.enum(['start', 'center', 'end', 'baseline', 'stretch']).optional(),
  width: DimensionConstraintSchema.optional(),
  height: DimensionConstraintSchema.optional(),
});
export type Layout = z.infer<typeof LayoutSchema>;

// Anatomy
export const AnatomyPartSchema = z.object({
  name: z.string().regex(PART_NAME_REGEX, {
    message: 'Anatomy part name must be kebab-case',
  }),
  description: z.string(),
  required: z.boolean(),
});
export type AnatomyPart = z.infer<typeof AnatomyPartSchema>;

// Component properties
export const PROP_TYPES = ['variant', 'boolean', 'text', 'instance'] as const;
export type PropType = (typeof PROP_TYPES)[number];

export const ComponentPropSchema = z
  .object({
    name: z
      .string()
      .refine(
        (val) =>
          PROP_NAME_REGEX.test(val) ||
          (STANDARD_VARIANT_PROPERTIES as readonly string[]).includes(val),
        {
          message:
            'Prop name must be camelCase or a standard variant property (Variant, Size, State)',
        },
      ),
    type: z.enum(PROP_TYPES),
    options: z.array(z.string()).optional(),
    default: z.union([z.string(), z.boolean(), z.number()]).optional(),
    description: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'variant') {
      if (!data.options || data.options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: `Prop "${data.name}" of type "variant" requires an options array with at least one option`,
        });
      } else {
        const unique = new Set(data.options);
        if (unique.size !== data.options.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['options'],
            message: `Prop "${data.name}" options must be unique`,
          });
        }
      }
    }
  });
export type ComponentProp = z.infer<typeof ComponentPropSchema>;

// Variant & State specifications
export const ComponentVariantSchema = z.object({
  props: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])),
  styles: z.record(z.string(), StyleBlockSchema),
});
export type ComponentVariant = z.infer<typeof ComponentVariantSchema>;

export const ComponentStateSchema = z.object({
  name: z.enum(STATE_NAMES, {
    message: `State name must be one of: ${STATE_NAMES.join(', ')}`,
  }),
  styles: z.record(z.string(), StyleBlockSchema),
});
export type ComponentState = z.infer<typeof ComponentStateSchema>;

export const UsageGuidelineSchema = z.object({
  do: z.array(z.string()),
  dont: z.array(z.string()),
});
export type UsageGuideline = z.infer<typeof UsageGuidelineSchema>;

export const AccessibilitySpecSchema = z.object({
  role: z.string().optional(),
  notes: z.array(z.string()).optional(),
});
export type AccessibilitySpec = z.infer<typeof AccessibilitySpecSchema>;

export const ScreenshotSpecSchema = z.object({
  variant: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])),
  state: z.string(),
  path: z.string(),
});
export type ScreenshotSpec = z.infer<typeof ScreenshotSpecSchema>;

export const ComponentSourceSchema = z.object({
  figmaNodeId: z.string().optional(),
  figmaComponentKey: z.string().optional(),
});
export type ComponentSource = z.infer<typeof ComponentSourceSchema>;

export const COMPONENT_CATEGORIES = [
  'action',
  'input',
  'display',
  'layout',
  'feedback',
  'navigation',
] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

export const ComponentSpecSchema = z.object({
  $schema: z.string().optional(),
  name: z.string().regex(COMPONENT_NAME_REGEX, {
    message: 'Component name must be PascalCase',
  }),
  description: z.string(),
  category: z.enum(COMPONENT_CATEGORIES).optional(),
  anatomy: z.array(AnatomyPartSchema),
  props: z.array(ComponentPropSchema),
  layout: LayoutSchema.optional(),
  base: z.record(z.string(), StyleBlockSchema),
  variants: z.array(ComponentVariantSchema),
  states: z.array(ComponentStateSchema),
  usage: UsageGuidelineSchema,
  accessibility: AccessibilitySpecSchema.optional(),
  screenshots: z.array(ScreenshotSpecSchema),
  source: ComponentSourceSchema.optional(),
});

export type ComponentSpec = z.infer<typeof ComponentSpecSchema>;
