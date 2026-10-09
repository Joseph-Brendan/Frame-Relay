import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readAndValidateKit } from '../src/kit/discovery.js';
import { generateComponentsMd } from '../src/agents/components-md.js';
import { updateAgentFiles } from '../src/agents/rules.js';

describe('Agent Rules & Components Doc', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-agent-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates .frame-relay/components.md with component tables and rules', () => {
    const sampleKitPath = path.resolve(__dirname, '../../../examples/sample-kit/frame-relay-kit');
    const kit = readAndValidateKit(sampleKitPath);

    const md = generateComponentsMd(kit.components, 'src/components/ui');

    expect(md).toContain('# Frame-Relay Component Catalog');
    expect(md).toContain('Never write raw HTML `<button>`, `<input>`, `<select>`, `<textarea>`');
    expect(md).toContain('## Button');
    expect(md).toContain('## Card');
    expect(md).toContain('## Input');
    expect(md).toContain('| Name | Type | Options | Default | Description |');
  });

  it('updates AGENTS.md between marker blocks keeping custom surrounding text', () => {
    const existingAgentsMd = `# My Existing Project Rules

Some user instructions here that must not be deleted.

<!-- frame-relay:start -->
Old Frame-Relay rules to be replaced
<!-- frame-relay:end -->

Footer instructions that must stay here.
`;
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), existingAgentsMd, 'utf-8');

    updateAgentFiles(tmpDir, 'src/components/ui', {
      antigravity: true,
      cursor: true,
      claude: true,
    });

    const updated = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(updated).toContain('# My Existing Project Rules');
    expect(updated).toContain('Some user instructions here that must not be deleted.');
    expect(updated).toContain('Footer instructions that must stay here.');
    expect(updated).not.toContain('Old Frame-Relay rules to be replaced');
    expect(updated).toContain('<!-- frame-relay:start -->');
    expect(updated).toContain('<!-- frame-relay:end -->');

    // Ensure block is under 40 lines
    const match = updated.match(/<!-- frame-relay:start -->([\s\S]*?)<!-- frame-relay:end -->/);
    expect(match).not.toBeNull();
    const lines = match![1].trim().split('\n');
    expect(lines.length).toBeLessThan(40);

    expect(updated).toContain(
      "If the user mentions their Figma selection or says 'match this', call get_live_selection.",
    );
    expect(updated).toContain('call start_live and show the user the code');
  });

  it('updates CLAUDE.md importing @AGENTS.md between marker blocks', () => {
    const existingClaudeMd = `# Claude Rules\nCustom rules.\n`;
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), existingClaudeMd, 'utf-8');

    updateAgentFiles(tmpDir, 'src/components/ui', {
      antigravity: true,
      cursor: true,
      claude: true,
    });

    const updated = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(updated).toContain('# Claude Rules\nCustom rules.');
    expect(updated).toContain('@AGENTS.md');
  });

  it('writes Antigravity rule and Cursor mdc rule files', () => {
    updateAgentFiles(tmpDir, 'src/components/ui', {
      antigravity: true,
      cursor: true,
      claude: true,
    });

    const agyPath = path.join(tmpDir, '.agents/rules/frame-relay.md');
    expect(fs.existsSync(agyPath)).toBe(true);
    const agyContent = fs.readFileSync(agyPath, 'utf-8');
    expect(agyContent).toContain('# Frame-Relay Design Rules');
    expect(agyContent).toContain('get_live_selection');

    const cursorPath = path.join(tmpDir, '.cursor/rules/frame-relay.mdc');
    expect(fs.existsSync(cursorPath)).toBe(true);
    const cursorContent = fs.readFileSync(cursorPath, 'utf-8');
    expect(cursorContent).toContain('alwaysApply: true');
  });
});
