import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import fg from 'fast-glob';
import pc from 'picocolors';
import { checkFile, CheckViolation } from '../check/index.js';
import { loadConfig } from '../config.js';
import { resolveCommandCwd } from '../cwd.js';

export interface CheckOptions {
  cwd?: string;
  json?: boolean;
  verbose?: boolean;
}

export async function runCheck(
  paths: string[] = [],
  options: CheckOptions = {},
): Promise<CheckViolation[]> {
  const cwd = resolveCommandCwd(options.cwd);
  const { config } = loadConfig(cwd);
  const componentsDir = config?.componentsDir || 'src/components/ui';

  // Discover files to check
  const filesToCheck: string[] = [];

  if (paths.length > 0) {
    for (const p of paths) {
      const full = resolve(cwd, p);
      if (!existsSync(full)) {
        console.error(pc.red(`Error: path "${p}" does not exist.`));
        continue;
      }
      const st = statSync(full);
      if (st.isDirectory()) {
        const found = fg.sync('**/*.{ts,tsx,js,jsx}', {
          cwd: full,
          absolute: true,
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/.next/**'],
        });
        filesToCheck.push(...found);
      } else {
        filesToCheck.push(full);
      }
    }
  } else {
    // Default to src/
    const srcDir = join(cwd, 'src');
    if (existsSync(srcDir)) {
      const found = fg.sync('**/*.{ts,tsx,js,jsx}', {
        cwd: srcDir,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/.next/**'],
      });
      filesToCheck.push(...found);
    }
  }

  const allViolations: CheckViolation[] = [];

  for (const f of filesToCheck) {
    try {
      const code = readFileSync(f, 'utf-8');
      const relPath = relative(cwd, f).replace(/\\/g, '/');
      const res = checkFile({
        filePath: relPath,
        code,
        componentsDir,
      });
      allViolations.push(...res.violations);
    } catch {
      // ignore read error
    }
  }

  if (options.json) {
    console.log(JSON.stringify(allViolations, null, 2));
  } else {
    if (allViolations.length === 0) {
      console.log(
        pc.green('✔ No design system violations found. All files comply with Frame-Relay rules.'),
      );
    } else {
      console.log(
        pc.bold(pc.red(`\n✖ Found ${allViolations.length} design system violation(s):\n`)),
      );

      for (const v of allViolations) {
        console.log(
          `${pc.cyan(`${v.file}:${v.line}:${v.col}`)}  ${pc.yellow(v.rule)}  ${v.message}`,
        );
        console.log(`  ${pc.dim('Fix:')} ${pc.green(v.fix)}\n`);
      }
    }
  }

  if (allViolations.length > 0) {
    process.exitCode = 1;
  }

  return allViolations;
}
