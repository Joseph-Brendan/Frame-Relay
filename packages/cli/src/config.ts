import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const FrameRelayConfigSchema = z.object({
  $schema: z.string().optional(),
  kitDir: z.string().default('frame-relay-kit'),
  framework: z.enum(['vite', 'next', 'react', 'other']).default('vite'),
  typescript: z.boolean().default(true),
  cssEntry: z.string().default('src/index.css'),
  componentsDir: z.string().default('src/components/ui'),
  tokensFile: z.string().default('src/styles/frame-relay-tokens.css'),
  agents: z
    .object({
      antigravity: z.boolean().default(true),
      cursor: z.boolean().default(true),
      claude: z.boolean().default(true),
    })
    .default({ antigravity: true, cursor: true, claude: true }),
  mcp: z.boolean().default(true),
});

export type FrameRelayConfig = z.infer<typeof FrameRelayConfigSchema>;

export type PackageManager = 'pnpm' | 'yarn' | 'npm' | 'bun';
export type DetectedFramework = 'vite' | 'next' | 'react' | 'other';

export interface ProjectEnvironment {
  packageManager: PackageManager;
  framework: DetectedFramework;
  typescript: boolean;
  reactVersion: number; // e.g. 18 or 19
  hasPathAlias: boolean; // "@/..."
  cssEntry: string | undefined;
  tailwindV4Installed: boolean;
  missingDependencies: string[];
}

export const CONFIG_FILE_NAME = 'frame-relay.config.json';

export function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) return 'bun';
  if (existsSync(join(cwd, 'package-lock.json'))) return 'npm';
  return 'npm';
}

interface PackageJsonData {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function detectEnvironment(cwd: string): ProjectEnvironment {
  const pm = detectPackageManager(cwd);
  let pkg: PackageJsonData = {};
  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJsonData;
    } catch {
      // ignore
    }
  }

  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  // Framework detection
  let framework: DetectedFramework = 'other';
  if (allDeps['next']) {
    framework = 'next';
  } else if (allDeps['vite']) {
    framework = 'vite';
  } else if (allDeps['react']) {
    framework = 'react';
  }

  // TypeScript detection
  const typescript = existsSync(join(cwd, 'tsconfig.json'));

  // React version detection
  let reactVersion = 19;
  const reactDep = allDeps['react'];
  if (reactDep) {
    const match = reactDep.match(/(\d+)/);
    if (match) {
      const ver = parseInt(match[1], 10);
      if (ver === 18 || ver === 19) reactVersion = ver;
    }
  }

  // Path alias detection
  let hasPathAlias = false;
  const tsconfigPath = join(cwd, 'tsconfig.json');
  if (existsSync(tsconfigPath)) {
    try {
      const tsconfigContent = readFileSync(tsconfigPath, 'utf-8');
      if (tsconfigContent.includes('"@/*"') || tsconfigContent.includes("'@/*'")) {
        hasPathAlias = true;
      }
    } catch {
      // ignore
    }
  }

  // CSS Entry & Tailwind v4 detection
  const candidateCssEntries = [
    'src/index.css',
    'src/app/globals.css',
    'app/globals.css',
    'src/styles.css',
    'src/main.css',
    'src/App.css',
  ];

  let detectedCssEntry: string | undefined;
  let hasTailwindImport = false;

  for (const entry of candidateCssEntries) {
    const fullPath = join(cwd, entry);
    if (existsSync(fullPath)) {
      detectedCssEntry = entry;
      const content = readFileSync(fullPath, 'utf-8');
      if (/@import\s+["']tailwindcss["']/.test(content)) {
        hasTailwindImport = true;
        break;
      }
    }
  }

  const twVersion = allDeps['tailwindcss'];
  let isTw4 = false;
  if (twVersion) {
    const vMatch = twVersion.match(/(\d+)/);
    if (vMatch && parseInt(vMatch[1], 10) >= 4) {
      isTw4 = true;
    }
  }
  const tailwindV4Installed = isTw4 && hasTailwindImport;

  // Runtime dependencies required for generated code
  const requiredDeps = ['class-variance-authority', 'clsx', 'tailwind-merge'];
  const missingDependencies = requiredDeps.filter((dep) => !allDeps[dep]);

  return {
    packageManager: pm,
    framework,
    typescript,
    reactVersion,
    hasPathAlias,
    cssEntry: detectedCssEntry || 'src/index.css',
    tailwindV4Installed,
    missingDependencies,
  };
}

export function loadConfig(cwd: string): { config?: FrameRelayConfig; error?: string } {
  const configPath = join(cwd, CONFIG_FILE_NAME);
  if (!existsSync(configPath)) {
    return { error: `Config file ${CONFIG_FILE_NAME} not found. Run 'frame-relay init' first.` };
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    const parsed = FrameRelayConfigSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        error: `Invalid ${CONFIG_FILE_NAME}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
      };
    }
    return { config: parsed.data };
  } catch (err) {
    return { error: `Failed to parse ${CONFIG_FILE_NAME}: ${String(err)}` };
  }
}

export function writeConfig(cwd: string, config: FrameRelayConfig): void {
  const configPath = join(cwd, CONFIG_FILE_NAME);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
