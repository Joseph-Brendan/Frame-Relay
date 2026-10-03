import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ComponentSpecSchema, ManifestSchema, TokensFileSchema } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.resolve(__dirname, '../json-schema/v1');
const BASE_ID_URI = 'https://joseph-brendan.github.io/Frame-Relay/schemas/v1';

async function generate() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const schemas: Array<{ name: string; schema: z.ZodType<unknown> }> = [
    { name: 'manifest.schema.json', schema: ManifestSchema },
    { name: 'tokens.schema.json', schema: TokensFileSchema },
    { name: 'component.schema.json', schema: ComponentSpecSchema },
  ];

  for (const { name, schema } of schemas) {
    const rawJsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    const jsonSchemaWithId = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: `${BASE_ID_URI}/${name}`,
      ...rawJsonSchema,
    };

    const targetPath = path.join(OUTPUT_DIR, name);
    await fs.writeFile(targetPath, JSON.stringify(jsonSchemaWithId, null, 2) + '\n', 'utf-8');
    console.log(`Generated: ${targetPath}`);
  }
}

generate().catch((err) => {
  console.error('Failed to generate JSON schemas:', err);
  process.exit(1);
});
