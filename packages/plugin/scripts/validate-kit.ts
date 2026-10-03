import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { validateKit, ComponentSpec, Manifest, TokensFile } from '@josephbrendan/schema';

async function run(): Promise<void> {
  const zipArg = process.argv[2];

  if (!zipArg) {
    console.error('Usage: tsx scripts/validate-kit.ts <path-to-kit-zip>');
    process.exit(1);
  }

  const cleanArg =
    zipArg.startsWith('/') && !fs.existsSync(zipArg) ? zipArg.replace(/^\/+/, '') : zipArg;
  let resolvedPath = path.resolve(process.cwd(), cleanArg);
  if (!fs.existsSync(resolvedPath)) {
    const workspacePath = path.resolve(process.cwd(), '../../', cleanArg);
    if (fs.existsSync(workspacePath)) {
      resolvedPath = workspacePath;
    } else {
      console.error(`Error: File or directory not found at "${resolvedPath}"`);
      process.exit(1);
    }
  }

  console.log(`\nValidating Frame-Relay Kit: ${path.basename(resolvedPath)}`);
  console.log('='.repeat(60));

  let zip: JSZip;
  const stat = fs.statSync(resolvedPath);
  if (stat.isDirectory()) {
    zip = new JSZip();
    const addDir = (dir: string, base: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const rel = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          addDir(fullPath, rel);
        } else {
          zip.file(rel, fs.readFileSync(fullPath));
        }
      }
    };
    addDir(resolvedPath, '');
  } else {
    const buffer = fs.readFileSync(resolvedPath);
    zip = await JSZip.loadAsync(buffer);
  }

  // Helper to find a file path whether inside a root folder (e.g. frame-relay-kit/) or at root
  const findZipFile = (relativePath: string) => {
    const clean = relativePath.replace(/^\/+/, '');
    return (
      zip.file(clean) ||
      zip.file(`frame-relay-kit/${clean}`) ||
      zip.file(`frame-relay-kit/${clean.replace(/^frame-relay-kit\//, '')}`)
    );
  };

  const errors: string[] = [];

  // 1. Read manifest (frame-relay.json)
  const manifestFile = findZipFile('frame-relay.json');
  if (!manifestFile) {
    console.error('FAIL: Missing frame-relay.json in zip package.');
    process.exit(1);
  }

  let manifest: Manifest;
  try {
    const content = await manifestFile.async('text');
    manifest = JSON.parse(content) as Manifest;
  } catch (err) {
    console.error(
      `FAIL: Failed to parse frame-relay.json: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  // 2. Read tokens file
  const tokensFileEntry = findZipFile(manifest.tokensFile || 'tokens.json');
  if (!tokensFileEntry) {
    errors.push(`Missing tokens file "${manifest.tokensFile || 'tokens.json'}" in zip package`);
  }

  let tokens: TokensFile = {};
  if (tokensFileEntry) {
    try {
      const content = await tokensFileEntry.async('text');
      tokens = JSON.parse(content) as TokensFile;
    } catch (err) {
      errors.push(
        `Failed to parse tokens file: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 3. Read component files
  const componentsRecord: Record<string, unknown> = {};
  const parsedComponents: ComponentSpec[] = [];

  for (const entry of manifest.components || []) {
    const compFile = findZipFile(entry.file);
    if (!compFile) {
      errors.push(`Component file "${entry.file}" referenced in manifest does not exist in zip`);
      continue;
    }

    try {
      const content = await compFile.async('text');
      const parsed = JSON.parse(content) as ComponentSpec;
      componentsRecord[entry.file] = parsed;
      parsedComponents.push(parsed);
    } catch (err) {
      errors.push(
        `Failed to parse component file "${entry.file}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 4. Run schema validation via validateKit
  const kitResult = validateKit({
    manifest,
    tokens,
    components: componentsRecord,
  });

  if (!kitResult.ok) {
    for (const err of kitResult.errors) {
      const prefix = err.file ? `[${err.file}] ` : '';
      const pathPart = err.path ? `${err.path}: ` : '';
      errors.push(`${prefix}${pathPart}${err.message}`);
    }
  }

  // 5. Check screenshot files
  let screenshotCount = 0;
  for (const comp of parsedComponents) {
    for (const sc of comp.screenshots || []) {
      screenshotCount++;
      const scFile = findZipFile(sc.path);
      if (!scFile) {
        errors.push(
          `Component "${comp.name}" references screenshot "${sc.path}", but it was not found in the zip.`,
        );
      }
    }
  }

  // 6. Check icon files
  let iconCount = 0;
  const allZipPaths = Object.keys(zip.files);
  const iconPaths = allZipPaths.filter(
    (p) => (p.startsWith('icons/') || p.startsWith('frame-relay-kit/icons/')) && p.endsWith('.svg'),
  );

  for (const p of iconPaths) {
    iconCount++;
    const iconFile = zip.file(p);
    if (iconFile) {
      const svgText = await iconFile.async('text');
      if (!svgText.trim().startsWith('<svg') && !svgText.includes('<svg')) {
        errors.push(`Icon file "${p}" is not a valid SVG document.`);
      }
    }
  }

  // Print Report
  console.log(`Kit Name:        ${manifest.name}`);
  console.log(`Kit Version:     v${manifest.kitVersion}`);
  console.log(`Exported At:     ${manifest.exportedAt}`);
  console.log(`Generator:       ${manifest.generator.name} (${manifest.generator.version})`);
  console.log(`Components:      ${manifest.components?.length ?? 0}`);
  console.log(`Screenshots:     ${screenshotCount} verified`);
  console.log(`Icons:           ${iconCount} verified`);
  console.log('-'.repeat(60));

  if (errors.length > 0) {
    console.error(`\n❌ VALIDATION FAILED with ${errors.length} error(s):\n`);
    for (let i = 0; i < errors.length; i++) {
      console.error(`  ${i + 1}. ${errors[i]}`);
    }
    console.error('\nPlease fix the issues above and re-export the kit.\n');
    process.exit(1);
  }

  console.log('\n✅ VALIDATION PASSED: Kit is fully compliant with Frame-Relay specifications.\n');
}

run().catch((err) => {
  console.error('Unexpected error during kit validation:', err);
  process.exit(1);
});
