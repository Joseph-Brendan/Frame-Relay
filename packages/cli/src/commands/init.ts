import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  CONFIG_FILE_NAME,
  detectEnvironment,
  FrameRelayConfig,
  FrameRelayConfigSchema,
  writeConfig,
} from '../config.js';

export interface InitOptions {
  cwd?: string;
  yes?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

export async function runInit(options: InitOptions = {}): Promise<void> {
  const cwd = options.cwd ? join(process.cwd(), options.cwd) : process.cwd();

  p.intro(pc.cyan('Frame-Relay Init'));

  const env = detectEnvironment(cwd);

  // 1. Tailwind v4 check
  if (!env.tailwindV4Installed) {
    p.log.warn(pc.yellow('Tailwind CSS v4 was not detected.'));
    p.log.info(
      'Frame-Relay v1 requires Tailwind CSS v4 with an active CSS entry containing:\n' +
        pc.bold('  @import "tailwindcss";\n') +
        `Install Tailwind v4 for ${env.framework}:\n` +
        (env.framework === 'vite'
          ? `  ${env.packageManager} add tailwindcss @tailwindcss/vite\n  (Add @tailwindcss/vite plugin in vite.config.ts)`
          : env.framework === 'next'
            ? `  ${env.packageManager} add tailwindcss @tailwindcss/postcss\n  (Add @tailwindcss/postcss in postcss.config.mjs)`
            : `  ${env.packageManager} add tailwindcss`),
    );
  }

  // 2. Runtime dependencies check (cva, clsx, tailwind-merge)
  if (env.missingDependencies.length > 0) {
    p.log.info(
      `Generated components require runtime packages: ${pc.bold(env.missingDependencies.join(', '))}`,
    );

    let shouldInstall = options.yes ?? false;
    if (!shouldInstall && !options.dryRun) {
      const confirm = await p.confirm({
        message: `Install ${env.missingDependencies.join(', ')} using ${env.packageManager}?`,
        initialValue: true,
      });
      if (typeof confirm === 'boolean') shouldInstall = confirm;
    }

    if (shouldInstall && !options.dryRun) {
      const s = p.spinner();
      s.start(`Installing ${env.missingDependencies.join(', ')} via ${env.packageManager}...`);
      try {
        const installCmd =
          env.packageManager === 'yarn'
            ? `yarn add ${env.missingDependencies.join(' ')}`
            : `${env.packageManager} add ${env.missingDependencies.join(' ')}`;
        execSync(installCmd, { cwd, stdio: options.verbose ? 'inherit' : 'ignore' });
        s.stop(`Installed ${env.missingDependencies.join(', ')}.`);
      } catch (err) {
        s.stop(pc.red(`Failed to install dependencies automatically: ${String(err)}`));
        p.log.info(
          `Run manually:\n  ${env.packageManager} add ${env.missingDependencies.join(' ')}`,
        );
      }
    }
  }

  // 3. Config preparation
  const newConfig: FrameRelayConfig = {
    $schema: 'https://joseph-brendan.github.io/Frame-Relay/schemas/v1/config.schema.json',
    kitDir: 'frame-relay-kit',
    framework: env.framework,
    typescript: env.typescript,
    cssEntry: env.cssEntry || 'src/index.css',
    componentsDir: 'src/components/ui',
    tokensFile: 'src/styles/frame-relay-tokens.css',
    agents: {
      antigravity: true,
      cursor: true,
      claude: true,
      opencode: true,
    },
    mcp: true,
  };

  const configPath = join(cwd, CONFIG_FILE_NAME);
  if (existsSync(configPath)) {
    try {
      const existingRaw = JSON.parse(readFileSync(configPath, 'utf-8'));
      const parsed = FrameRelayConfigSchema.safeParse(existingRaw);
      if (parsed.success) {
        const existing = parsed.data;
        const diffs: string[] = [];
        if (existing.kitDir !== newConfig.kitDir)
          diffs.push(`kitDir: ${existing.kitDir} -> ${newConfig.kitDir}`);
        if (existing.componentsDir !== newConfig.componentsDir)
          diffs.push(`componentsDir: ${existing.componentsDir} -> ${newConfig.componentsDir}`);
        if (existing.tokensFile !== newConfig.tokensFile)
          diffs.push(`tokensFile: ${existing.tokensFile} -> ${newConfig.tokensFile}`);

        if (diffs.length === 0) {
          p.log.info(`${CONFIG_FILE_NAME} is already up to date.`);
          p.outro(pc.green('Frame-Relay initialized. Next step: run `frame-relay sync`.'));
          return;
        }

        p.log.warn(
          `Existing ${CONFIG_FILE_NAME} differs:\n${diffs.map((d) => `  ${d}`).join('\n')}`,
        );
        let overwrite = options.yes ?? false;
        if (!overwrite && !options.dryRun) {
          const confirm = await p.confirm({
            message: `Update ${CONFIG_FILE_NAME}?`,
            initialValue: false,
          });
          if (typeof confirm === 'boolean') overwrite = confirm;
        }

        if (!overwrite) {
          p.outro(pc.yellow(`Kept existing ${CONFIG_FILE_NAME}.`));
          return;
        }
      }
    } catch {
      // ignore parse error and overwrite
    }
  }

  if (options.dryRun) {
    p.log.info(`[dry-run] Would write ${CONFIG_FILE_NAME}:\n${JSON.stringify(newConfig, null, 2)}`);
  } else {
    writeConfig(cwd, newConfig);
    p.log.success(pc.green(`Wrote ${CONFIG_FILE_NAME}`));
  }

  p.outro(pc.green('Initialization complete! Run `frame-relay sync` to import your design kit.'));
}
