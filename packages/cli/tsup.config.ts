import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    index: 'src/index.ts',
  },
  format: ['esm'],
  // Resolve types from the private workspace packages so the published .d.ts files are
  // self-contained and do not import packages that are not on npm.
  dts: { resolve: ['@josephbrendan/schema', '@josephbrendan/converter'] },
  clean: true,
  noExternal: ['@josephbrendan/schema', '@josephbrendan/converter'],
});
