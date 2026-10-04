import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { generateComponentsMarkdown } from '../agents/components-md.js';
import { writeAgentRules } from '../agents/rules.js';
import { generateComponentFiles } from '../codegen/index.js';
import { detectEnvironment, loadConfig } from '../config.js';
import { findKitDir, readAndValidateKit, unzipKit } from '../kit/discovery.js';
import { classifyFileChange, hashContent, loadLock, LockFile, saveLock } from '../kit/lock.js';
import { writeMcpConfigs } from '../mcp/config.js';
import { addTokensImportToCssEntry, generateTokensCss } from '../tokens/generate.js';

export interface SyncOptions {
  cwd?: string;
  from?: string;
  kit?: string;
  force?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  mcp?: boolean;
}

export interface SyncSummary {
  tokensWritten: boolean;
  created: string[];
  updated: string[];
  unchanged: string[];
  conflicts: string[];
  removed: string[];
  agentFiles: string[];
}

export async function runSync(options: SyncOptions = {}): Promise<SyncSummary> {
  const cwd = options.cwd ? join(process.cwd(), options.cwd) : process.cwd();

  p.intro(pc.cyan('Frame-Relay Sync'));

  // 1. Config loading
  const { config, error: configError } = loadConfig(cwd);
  if (configError && !options.kit && !options.from) {
    p.log.warn(pc.yellow(configError));
  }

  const effectiveConfig = config ?? {
    kitDir: 'frame-relay-kit',
    framework: 'vite',
    typescript: true,
    cssEntry: 'src/index.css',
    componentsDir: 'src/components/ui',
    tokensFile: 'src/styles/frame-relay-tokens.css',
    agents: { antigravity: true, cursor: true, claude: true },
    mcp: true,
  };

  const env = detectEnvironment(cwd);

  // 2. Unzip --from
  if (options.from) {
    const targetKitDir = join(cwd, effectiveConfig.kitDir);
    if (existsSync(targetKitDir) && !options.yes && !options.force && !options.dryRun) {
      const confirm = await p.confirm({
        message: `Kit directory "${effectiveConfig.kitDir}" already exists. Overwrite?`,
        initialValue: true,
      });
      if (confirm !== true) {
        p.outro(pc.yellow('Sync cancelled.'));
        return {
          tokensWritten: false,
          created: [],
          updated: [],
          unchanged: [],
          conflicts: [],
          removed: [],
          agentFiles: [],
        };
      }
    }

    if (!options.dryRun) {
      const s = p.spinner();
      s.start(`Extracting ${options.from} to ${effectiveConfig.kitDir}...`);
      await unzipKit(options.from, targetKitDir);
      s.stop(`Extracted ${options.from}.`);
    } else {
      p.log.info(`[dry-run] Would extract ${options.from} into ${effectiveConfig.kitDir}`);
    }
  }

  // 3. Kit Discovery
  const kitPath = findKitDir(
    cwd,
    options.kit || (options.from ? effectiveConfig.kitDir : undefined),
  );
  p.log.info(`Reading design kit from: ${pc.bold(relative(cwd, kitPath) || '.')}`);

  // 4. Kit Read & Validate
  const loadedKit = readAndValidateKit(kitPath, options.force);
  if (loadedKit.warnings.length > 0) {
    for (const w of loadedKit.warnings) p.log.warn(pc.yellow(w));
  }

  const prevLock = loadLock(cwd);
  const newLockFiles: Record<string, string> = {};

  const summary: SyncSummary = {
    tokensWritten: false,
    created: [],
    updated: [],
    unchanged: [],
    conflicts: [],
    removed: [],
    agentFiles: [],
  };

  // 5. Generate and write tokens
  const tokensCss = generateTokensCss(loadedKit.tokens);
  const tokensFull = join(cwd, effectiveConfig.tokensFile);
  const tokensRel = effectiveConfig.tokensFile.replace(/\\/g, '/');

  const tokensAction = classifyFileChange(
    tokensFull,
    tokensRel,
    tokensCss,
    prevLock,
    options.force,
  );
  if (tokensAction === 'write') {
    if (!options.dryRun) {
      mkdirSync(dirname(tokensFull), { recursive: true });
      writeFileSync(tokensFull, tokensCss, 'utf-8');
    }
    summary.tokensWritten = true;
    newLockFiles[tokensRel] = hashContent(tokensCss);
  } else if (tokensAction === 'conflict') {
    summary.conflicts.push(tokensRel);
    const altPath = tokensFull.replace(/\.css$/, '.generated.css');
    if (!options.dryRun) {
      writeFileSync(altPath, tokensCss, 'utf-8');
    }
  } else {
    // unchanged
    newLockFiles[tokensRel] = hashContent(tokensCss);
  }

  // Ensure @import in CSS entry
  const cssEntryFull = join(cwd, effectiveConfig.cssEntry);
  if (existsSync(cssEntryFull)) {
    const existingCss = readFileSync(cssEntryFull, 'utf-8');
    const relFromCssToTokens = relative(dirname(cssEntryFull), tokensFull).replace(/\\/g, '/');
    const importPath = relFromCssToTokens.startsWith('.')
      ? relFromCssToTokens
      : `./${relFromCssToTokens}`;
    const updatedCss = addTokensImportToCssEntry(existingCss, importPath);
    if (updatedCss !== existingCss && !options.dryRun) {
      writeFileSync(cssEntryFull, updatedCss, 'utf-8');
      p.log.info(`Added tokens import to ${effectiveConfig.cssEntry}`);
    }
  }

  // 6. Generate components
  const componentSpecs = Array.from(loadedKit.components.values());
  const generatedFiles = await generateComponentFiles({
    cwd,
    components: componentSpecs,
    kitName: loadedKit.manifest.name,
    exportedAt: loadedKit.manifest.exportedAt,
    componentsDir: effectiveConfig.componentsDir,
    reactVersion: env.reactVersion,
    hasPathAlias: env.hasPathAlias,
  });

  for (const gen of generatedFiles) {
    const fullPath = join(cwd, gen.relPath);
    const rel = gen.relPath;
    const action = classifyFileChange(fullPath, rel, gen.content, prevLock, options.force);

    if (action === 'unchanged') {
      summary.unchanged.push(rel);
      newLockFiles[rel] = hashContent(gen.content);
    } else if (action === 'write') {
      const isNew = !existsSync(fullPath);
      if (!options.dryRun) {
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, gen.content, 'utf-8');
      }
      if (isNew) summary.created.push(rel);
      else summary.updated.push(rel);
      newLockFiles[rel] = hashContent(gen.content);
    } else if (action === 'conflict') {
      summary.conflicts.push(rel);
      const conflictPath = fullPath
        .replace(/\.tsx$/, '.generated.tsx')
        .replace(/\.ts$/, '.generated.ts');
      if (!options.dryRun) {
        mkdirSync(dirname(conflictPath), { recursive: true });
        writeFileSync(conflictPath, gen.content, 'utf-8');
      }
    }
  }

  // Detect removed components
  if (prevLock && prevLock.files) {
    const currentFiles = new Set(generatedFiles.map((g) => g.relPath));
    for (const oldFile of Object.keys(prevLock.files)) {
      if (
        oldFile.startsWith(effectiveConfig.componentsDir.replace(/\\/g, '/')) &&
        !oldFile.endsWith('index.ts') &&
        !currentFiles.has(oldFile)
      ) {
        summary.removed.push(oldFile);
      }
    }
  }

  // 7. Write Agent Files
  if (!options.dryRun) {
    const compMdContent = generateComponentsMarkdown({
      components: componentSpecs,
      componentsDir: effectiveConfig.componentsDir,
      hasPathAlias: env.hasPathAlias,
    });
    const dotFrDir = join(cwd, '.frame-relay');
    if (!existsSync(dotFrDir)) mkdirSync(dotFrDir, { recursive: true });
    writeFileSync(join(dotFrDir, 'components.md'), compMdContent, 'utf-8');
    summary.agentFiles.push('.frame-relay/components.md');

    const agentRulesRes = writeAgentRules({
      cwd,
      componentsDir: effectiveConfig.componentsDir,
      hasPathAlias: env.hasPathAlias,
      agentsConfig: effectiveConfig.agents,
    });
    summary.agentFiles.push(...agentRulesRes.writtenFiles);
  }

  // 8. MCP Config Writer
  const mcpRes = writeMcpConfigs({ cwd, enableMcpFlag: options.mcp });
  if (mcpRes.skipped && mcpRes.message) {
    p.log.info(pc.dim(mcpRes.message));
  } else if (!mcpRes.skipped && mcpRes.writtenFiles.length > 0) {
    p.log.success(pc.green(`Updated MCP config files: ${mcpRes.writtenFiles.length}`));
  }

  // 9. Update Lockfile
  if (!options.dryRun) {
    const newLock: LockFile = {
      version: 1,
      kitName: loadedKit.manifest.name,
      exportedAt: loadedKit.manifest.exportedAt,
      files: newLockFiles,
    };
    saveLock(cwd, newLock);
  }

  // 10. Print Summary Output
  p.log.success(pc.bold(pc.green('Sync Complete!')));

  console.log('\n' + pc.bold('Sync Summary:'));
  console.log(`  Tokens:     ${summary.tokensWritten ? pc.green('Written') : pc.dim('Unchanged')}`);
  console.log(
    `  Created:    ${summary.created.length > 0 ? pc.green(String(summary.created.length)) : '0'}`,
  );
  if (summary.created.length > 0 && options.verbose) {
    summary.created.forEach((c) => console.log(pc.dim(`    + ${c}`)));
  }
  console.log(
    `  Updated:    ${summary.updated.length > 0 ? pc.cyan(String(summary.updated.length)) : '0'}`,
  );
  console.log(`  Unchanged:  ${summary.unchanged.length}`);
  if (summary.conflicts.length > 0) {
    console.log(pc.yellow(`  Conflicts:  ${summary.conflicts.length} (saved as .generated.tsx)`));
    summary.conflicts.forEach((c) => console.log(pc.yellow(`    ! ${c}`)));
  }
  if (summary.removed.length > 0) {
    console.log(pc.red(`  Removed from kit: ${summary.removed.length} (kept on disk)`));
    summary.removed.forEach((r) => console.log(pc.red(`    - ${r}`)));
  }
  console.log(`  Agent rules: ${summary.agentFiles.join(', ')}`);

  console.log('\n' + pc.cyan('Next steps:'));
  console.log('  1. Commit .frame-relay/lock.json to track safe re-syncs.');
  console.log('  2. Run `frame-relay check` to verify design system compliance.\n');

  p.outro(pc.green('Done.'));

  return summary;
}
