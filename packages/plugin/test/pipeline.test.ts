import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  assembleKit,
  convertComponent,
  convertVariables,
  NodeSnapshot,
  StyleIndex,
} from '@frame-relay/converter';
import { validateKit, ComponentSpec, Manifest, TokensFile } from '@frame-relay/schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../../converter/test/fixtures');

function loadJson<T>(filename: string): T {
  const filePath = path.resolve(fixturesDir, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

describe('Pipeline: Fixtures to Assembled Kit to Validation', () => {
  it('converts Phase 3 fixtures, creates zip package, and passes validateKit with zero errors', async () => {
    // 1. Load Phase 3 fixtures
    const varData = loadJson<{
      collections: Array<{
        id: string;
        name: string;
        modes: Array<{ modeId: string; name: string }>;
        defaultModeId: string;
      }>;
      variables: Array<{
        id: string;
        name: string;
        variableCollectionId?: string;
        resolvedType: string;
        valuesByMode: Record<string, unknown>;
      }>;
    }>('variables.json');

    const styles = loadJson<StyleIndex>('styles.json');
    const buttonSnapshot = loadJson<NodeSnapshot>('button.set.json');
    const cardSnapshot = loadJson<NodeSnapshot>('card.set.json');
    const inputSnapshot = loadJson<NodeSnapshot>('input.set.json');

    // 2. Convert variables & tokens
    const varResult = convertVariables({
      collections: varData.collections,
      variables: varData.variables,
    });
    expect(varResult.tokens).toBeDefined();

    // Load sample tokens for typography and shadow references
    const sampleKitTokens = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../../examples/sample-kit/frame-relay-kit/tokens.json'),
        'utf-8',
      ),
    );
    const completeTokens = {
      ...sampleKitTokens,
      ...varResult.tokens,
      typography: sampleKitTokens.typography,
      shadow: sampleKitTokens.shadow,
    };

    // 3. Convert components
    const componentSnapshots = [buttonSnapshot, cardSnapshot, inputSnapshot];
    const specs: ComponentSpec[] = [];
    const allScreenshotJobs: Array<{ nodeId: string; path: string }> = [];

    for (const snap of componentSnapshots) {
      const compResult = convertComponent({
        node: snap,
        variables: varResult.variableIndex,
        styles,
      });

      if (compResult.spec) {
        specs.push(compResult.spec);
      }
      allScreenshotJobs.push(...compResult.screenshotJobs);
    }

    expect(specs.length).toBe(3);
    expect(allScreenshotJobs.length).toBeGreaterThan(0);

    // 4. Assemble kit files
    const assembled = assembleKit({
      components: specs,
      tokens: completeTokens,
      source: {
        type: 'figma',
        fileKey: 'fixture-file-key',
        fileName: 'Phase 3 Fixtures Test Kit',
      },
      generator: {
        name: 'frame-relay-plugin',
        version: '0.0.0',
      },
      exportedAt: '2026-10-03T12:00:00.000Z',
      modes: Object.keys(completeTokens?.$modes || {}),
    });

    // 5. Pack into JSZip
    const zip = new JSZip();
    const kitFolder = zip.folder('frame-relay-kit') || zip;

    // Add JSON files from assembleKit
    for (const [filePath, content] of Object.entries(assembled.files)) {
      kitFolder.file(filePath, content);
    }

    // Add dummy PNG bytes for screenshots
    const dummyPngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic bytes
    for (const job of allScreenshotJobs) {
      kitFolder.file(job.path, dummyPngBytes);
    }

    // Add SVG icon
    const mockIconSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>';
    kitFolder.file('icons/check.svg', mockIconSvg);

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    // 6. Validate zip contents against validate-kit requirements
    const loadedZip = await JSZip.loadAsync(zipBuffer);

    const findZipFile = (relativePath: string) => {
      const clean = relativePath.replace(/^\/+/, '');
      return loadedZip.file(clean) || loadedZip.file(`frame-relay-kit/${clean}`);
    };

    // Verify manifest
    const manifestFile = findZipFile('frame-relay.json');
    expect(manifestFile).not.toBeNull();
    const manifestText = await manifestFile!.async('text');
    const manifest = JSON.parse(manifestText) as Manifest;
    expect(manifest.name).toBe('Phase 3 Fixtures Test Kit');

    // Verify tokens
    const tokensFile = findZipFile('tokens.json');
    expect(tokensFile).not.toBeNull();
    const tokensText = await tokensFile!.async('text');
    const tokens = JSON.parse(tokensText) as TokensFile;

    // Verify components
    const componentsRecord: Record<string, unknown> = {};
    for (const entry of manifest.components) {
      const fileEntry = findZipFile(entry.file);
      expect(fileEntry).not.toBeNull();
      const compText = await fileEntry!.async('text');
      const comp = JSON.parse(compText) as ComponentSpec;
      componentsRecord[entry.file] = comp;

      // Verify every screenshot declared in spec exists in zip
      for (const sc of comp.screenshots || []) {
        const scFile = findZipFile(sc.path);
        expect(scFile).not.toBeNull();
      }
    }

    // Run validateKit
    const validationResult = validateKit({
      manifest,
      tokens,
      components: componentsRecord,
    });

    expect(validationResult.ok).toBe(true);

    // Verify icon exists and is valid SVG
    const iconFile = findZipFile('icons/check.svg');
    expect(iconFile).not.toBeNull();
    const iconSvg = await iconFile!.async('text');
    expect(iconSvg).toContain('<svg');
  });
});
