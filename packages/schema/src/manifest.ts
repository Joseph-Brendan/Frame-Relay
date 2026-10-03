import { z } from 'zod';
import { COMPONENT_NAME_REGEX, SUPPORTED_KIT_VERSIONS } from './constants.js';

export const ManifestGeneratorSchema = z.object({
  name: z.string().min(1, 'Generator name is required'),
  version: z.string().min(1, 'Generator version is required'),
});

export type ManifestGenerator = z.infer<typeof ManifestGeneratorSchema>;

export const ManifestSourceSchema = z.object({
  type: z.literal('figma'),
  fileKey: z.string().min(1, 'Source fileKey is required'),
  fileName: z.string().min(1, 'Source fileName is required'),
  page: z.string().optional(),
});

export type ManifestSource = z.infer<typeof ManifestSourceSchema>;

export const ManifestComponentEntrySchema = z.object({
  name: z.string().regex(COMPONENT_NAME_REGEX, {
    message: 'Component name must be PascalCase',
  }),
  file: z.string().min(1, 'Component file path is required'),
});

export type ManifestComponentEntry = z.infer<typeof ManifestComponentEntrySchema>;

export const ManifestSchema = z.object({
  $schema: z.string().optional(),
  kitVersion: z.enum(SUPPORTED_KIT_VERSIONS, {
    message: `Kit version is not supported. Supported versions: ${SUPPORTED_KIT_VERSIONS.join(', ')}`,
  }),
  name: z.string().min(1, 'Kit name is required'),
  generator: ManifestGeneratorSchema,
  source: ManifestSourceSchema,
  exportedAt: z.string().datetime({
    message: 'exportedAt must be a valid ISO 8601 datetime string',
  }),
  tokensFile: z.string().default('tokens.json'),
  modes: z.array(z.string()).default(['light']),
  components: z.array(ManifestComponentEntrySchema),
});

export type Manifest = z.infer<typeof ManifestSchema>;
