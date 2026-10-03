import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';

await fs.mkdir('dist', { recursive: true });

await esbuild.build({
  entryPoints: ['src/code.ts'],
  bundle: true,
  outfile: 'dist/code.js',
  target: 'es2020',
  platform: 'browser',
});

const uiHtml = await fs.readFile('src/ui.html', 'utf-8');
await fs.writeFile('dist/ui.html', uiHtml, 'utf-8');
