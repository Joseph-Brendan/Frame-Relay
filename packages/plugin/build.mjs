import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

const distDir = path.resolve(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Plugin to intercept UI build output and inline into dist/ui.html
const inlineHtmlPlugin = {
  name: 'inline-html-plugin',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors && result.errors.length > 0) {
        console.error('UI build completed with errors.');
        return;
      }

      let js = '';
      let css = '';

      for (const file of result.outputFiles || []) {
        if (file.path.endsWith('.js')) {
          js += file.text;
        } else if (file.path.endsWith('.css')) {
          css += file.text;
        }
      }

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Frame-Relay</title>
  ${css ? `<style>\n${css}\n</style>` : ''}
</head>
<body>
  <div id="root"></div>
  <script>
${js}
  </script>
</body>
</html>`;

      fs.writeFileSync(path.resolve(distDir, 'ui.html'), html, 'utf-8');
      console.log('✓ Inlined UI bundle into dist/ui.html');
    });
  },
};

// 1. Context for main thread
const mainCtx = await esbuild.context({
  entryPoints: [path.resolve(__dirname, 'src/main/index.ts')],
  outfile: path.resolve(distDir, 'code.js'),
  bundle: true,
  target: 'es2017',
  platform: 'browser',
  format: 'iife',
  logLevel: 'info',
});

// 2. Context for UI thread
const uiCtx = await esbuild.context({
  entryPoints: [path.resolve(__dirname, 'src/ui/index.tsx')],
  outfile: path.resolve(distDir, 'ui.js'),
  bundle: true,
  target: 'es2020',
  platform: 'browser',
  format: 'iife',
  write: false,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  plugins: [inlineHtmlPlugin],
  logLevel: 'info',
});

if (isWatch) {
  console.log('Starting Frame-Relay plugin build in watch mode...');
  await mainCtx.watch();
  await uiCtx.watch();
} else {
  await mainCtx.rebuild();
  await uiCtx.rebuild();
  await mainCtx.dispose();
  await uiCtx.dispose();
  console.log('✓ Frame-Relay plugin build complete.');
}
