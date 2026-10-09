import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import fg from 'fast-glob';
import JSZip from 'jszip';
import {
  ComponentSpec,
  Manifest,
  MANIFEST_FILENAME,
  SUPPORTED_KIT_VERSIONS,
  TokensFile,
  validateKit,
} from '@frame-relay/schema';

export interface LoadedKit {
  kitDir: string;
  manifest: Manifest;
  tokens: TokensFile;
  components: Map<string, ComponentSpec>;
  warnings: string[];
}

export async function unzipKit(zipPath: string, targetDir: string): Promise<string> {
  const resolvedZip = resolve(zipPath);
  if (!existsSync(resolvedZip)) {
    throw new Error(`Zip file not found: ${zipPath}`);
  }

  const data = readFileSync(resolvedZip);
  const zip = await JSZip.loadAsync(data);

  // Check if there is a common top-level directory (e.g. "frame-relay-kit/")
  const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  if (fileNames.length === 0) {
    throw new Error(`Zip archive ${zipPath} is empty`);
  }

  let rootPrefix = '';
  // Check if all files start with a common root directory
  const firstSlash = fileNames[0].indexOf('/');
  if (firstSlash !== -1) {
    const candidate = fileNames[0].slice(0, firstSlash + 1);
    if (fileNames.every((f) => f.startsWith(candidate))) {
      rootPrefix = candidate;
    }
  }

  mkdirSync(targetDir, { recursive: true });

  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const relName = rootPrefix ? name.slice(rootPrefix.length) : name;
    if (!relName) continue;

    const outPath = join(targetDir, relName);
    mkdirSync(dirname(outPath), { recursive: true });
    const content = await file.async('nodebuffer');
    writeFileSync(outPath, content);
  }

  return targetDir;
}

export function findKitDir(cwd: string, specifiedKitDir?: string): string {
  if (specifiedKitDir) {
    const resolved = resolve(cwd, specifiedKitDir);
    const manifestPath = join(resolved, MANIFEST_FILENAME);
    if (!existsSync(manifestPath)) {
      throw new Error(
        `Specified kit folder "${specifiedKitDir}" does not contain ${MANIFEST_FILENAME}.\nCheck the path or export a kit from Figma first.`,
      );
    }
    return resolved;
  }

  // Search project ignoring standard build/dependency directories
  const matches = fg.sync(`**/${MANIFEST_FILENAME}`, {
    cwd,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/.next/**'],
    absolute: true,
  });

  if (matches.length === 0) {
    throw new Error(
      `No design kit found in "${cwd}".\n` +
        `Export a kit from Figma using the Frame-Relay plugin (Developer mode -> Export Kit),\n` +
        `or sync directly from a downloaded zip with:\n` +
        `  frame-relay sync --from <path-to-kit.zip>`,
    );
  }

  if (matches.length > 1) {
    const list = matches.map((m) => `  - ${relative(cwd, dirname(m)) || '.'}`).join('\n');
    throw new Error(
      `Multiple design kits found:\n${list}\n\nPass --kit <dir> to specify which kit directory to sync.`,
    );
  }

  return resolve(dirname(matches[0]));
}

export function readAndValidateKit(kitDir: string, force = false): LoadedKit {
  const manifestPath = join(kitDir, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing ${MANIFEST_FILENAME} in ${kitDir}`);
  }

  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    throw new Error(`Failed to parse ${MANIFEST_FILENAME}: ${String(err)}`);
  }

  // Version check
  const castManifest = rawManifest as Record<string, unknown>;
  const kitVersion = castManifest?.kitVersion;
  if (
    typeof kitVersion === 'string' &&
    !(SUPPORTED_KIT_VERSIONS as readonly string[]).includes(kitVersion)
  ) {
    throw new Error(
      `Kit version "${kitVersion}" is unsupported.\n` +
        `This version of Frame-Relay supports: ${SUPPORTED_KIT_VERSIONS.join(', ')}.\n` +
        `Please update @frame-relay/cli to the latest version.`,
    );
  }

  const tokensPath = join(kitDir, 'tokens.json');
  if (!existsSync(tokensPath)) {
    throw new Error(`Missing tokens.json in ${kitDir}`);
  }

  let rawTokens: unknown;
  try {
    rawTokens = JSON.parse(readFileSync(tokensPath, 'utf-8'));
  } catch (err) {
    throw new Error(`Failed to parse tokens.json: ${String(err)}`);
  }

  const componentFiles: Record<string, unknown> = {};
  const manifestComponents = Array.isArray(castManifest?.components)
    ? (castManifest.components as Array<{ name: string; file: string }>)
    : [];

  for (const compEntry of manifestComponents) {
    if (compEntry && typeof compEntry.file === 'string') {
      const compPath = join(kitDir, compEntry.file);
      if (existsSync(compPath)) {
        try {
          componentFiles[compEntry.file] = JSON.parse(readFileSync(compPath, 'utf-8'));
        } catch (err) {
          throw new Error(`Failed to parse component file "${compEntry.file}": ${String(err)}`);
        }
      }
    }
  }

  const validationResult = validateKit({
    manifest: rawManifest,
    tokens: rawTokens,
    components: componentFiles,
  });

  const warnings: string[] = [];

  if (!validationResult.ok) {
    const errorMessages = validationResult.errors
      .map((e) => `  - [${e.file}] ${e.path ? `${e.path}: ` : ''}${e.message}`)
      .join('\n');

    if (!force) {
      throw new Error(
        `Design kit validation failed:\n${errorMessages}\n\nRun with --force to ignore errors.`,
      );
    } else {
      warnings.push(`Kit validation errors (ignored with --force):\n${errorMessages}`);
    }
  }

  const componentsMap = new Map<string, ComponentSpec>();
  for (const [file, compJson] of Object.entries(componentFiles)) {
    componentsMap.set(file, compJson as ComponentSpec);
  }

  return {
    kitDir,
    manifest: rawManifest as Manifest,
    tokens: rawTokens as TokensFile,
    components: componentsMap,
    warnings,
  };
}
