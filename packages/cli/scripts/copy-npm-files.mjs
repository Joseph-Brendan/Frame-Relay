import { copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies the repository README and LICENSE into the CLI package before `npm pack` or
 * `npm publish`, so the npm package page shows them. Generated files, not committed.
 */
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageDir, '..', '..');

for (const file of ['README.md', 'LICENSE']) {
  copyFileSync(join(repoRoot, file), join(packageDir, file));
}

console.log('Copied README.md and LICENSE into packages/cli for packaging.');
