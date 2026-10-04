import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface WriteAgentRulesOptions {
  cwd: string;
  componentsDir: string;
  hasPathAlias: boolean;
  agentsConfig?: {
    antigravity?: boolean;
    cursor?: boolean;
    claude?: boolean;
  };
}

export const FRAME_RELAY_START_TAG = '<!-- frame-relay:start -->';
export const FRAME_RELAY_END_TAG = '<!-- frame-relay:end -->';

export function makeCoreRulesBlock(componentsDir: string, hasPathAlias: boolean): string {
  const importBase = hasPathAlias
    ? `@/${componentsDir.replace(/^src\//, '')}`
    : `./${componentsDir}`;

  return [
    FRAME_RELAY_START_TAG,
    '# Frame-Relay Design Rules',
    'You are building UI with the Frame-Relay design system. Follow these mandatory rules:',
    `1. **Always use kit components**: Never write raw HTML \`<button>\`, \`<input>\`, \`<select>\`, \`<textarea>\` in application code. Import all components from \`${importBase}\`.`,
    '2. **Tokens only**: Never write raw hex colors (`#...`), rgb/rgba, or Tailwind arbitrary values (`bg-[#...]`, `p-[10px]`). Use token utilities (`bg-primary-500`, `rounded-md`, `p-4`, `text-body`).',
    '3. **Component States**: Use props (`disabled`, `loading`) or ARIA attributes (`aria-invalid="true"`) to trigger component states.',
    '4. **Catalog Reference**: For component props, anatomy, guidelines, and visual screenshot paths, consult `.frame-relay/components.md`.',
    FRAME_RELAY_END_TAG,
  ].join('\n');
}

export function replaceOrAppendBlock(
  content: string,
  block: string,
  startTag: string,
  endTag: string,
): string {
  const startIndex = content.indexOf(startTag);
  const endIndex = content.indexOf(endTag);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = content.slice(0, startIndex);
    const after = content.slice(endIndex + endTag.length);
    return `${before.trimEnd()}\n\n${block}\n\n${after.trimStart()}`.trim() + '\n';
  }

  // Not found: append
  return content.trim() ? `${content.trim()}\n\n${block}\n` : `${block}\n`;
}

export function writeAgentRules(opts: WriteAgentRulesOptions): { writtenFiles: string[] } {
  const { cwd, componentsDir, hasPathAlias, agentsConfig } = opts;
  const writtenFiles: string[] = [];

  const agents = agentsConfig ?? { antigravity: true, cursor: true, claude: true };
  const block = makeCoreRulesBlock(componentsDir, hasPathAlias);

  // 1. AGENTS.md (Root workspace rules)
  const agentsMdPath = join(cwd, 'AGENTS.md');
  let agentsMdContent = '';
  if (existsSync(agentsMdPath)) {
    agentsMdContent = readFileSync(agentsMdPath, 'utf-8');
  }
  const updatedAgentsMd = replaceOrAppendBlock(
    agentsMdContent,
    block,
    FRAME_RELAY_START_TAG,
    FRAME_RELAY_END_TAG,
  );
  writeFileSync(agentsMdPath, updatedAgentsMd, 'utf-8');
  writtenFiles.push('AGENTS.md');

  // 2. Antigravity workspace rules: .agents/rules/frame-relay.md
  if (agents.antigravity !== false) {
    const agyRuleDir = join(cwd, '.agents', 'rules');
    if (!existsSync(agyRuleDir)) {
      mkdirSync(agyRuleDir, { recursive: true });
    }
    const agyRulePath = join(agyRuleDir, 'frame-relay.md');
    // Workspace rules in Antigravity are markdown files active for the workspace
    const agyContent = [
      '# Frame-Relay Design Rules',
      '',
      `1. **Always use kit components**: Never write raw HTML \`<button>\`, \`<input>\`, \`<select>\`, \`<textarea>\`. Import from \`${hasPathAlias ? `@/${componentsDir.replace(/^src\//, '')}` : `./${componentsDir}`}\`.`,
      '2. **Tokens only**: Never write raw hex colors or arbitrary values (e.g. `bg-[#123]`, `p-[10px]`). Use design token classes (`bg-primary-500`, `rounded-md`, `p-4`, `text-body`).',
      '3. **Component States**: Trigger states via declared props (`disabled`, `loading`) or ARIA attributes (`aria-invalid="true"`).',
      '4. **Catalog Reference**: For component props, anatomy, and guidelines, consult `.frame-relay/components.md`.',
    ].join('\n');
    writeFileSync(agyRulePath, agyContent + '\n', 'utf-8');
    writtenFiles.push('.agents/rules/frame-relay.md');
  }

  // 3. Cursor rules: .cursor/rules/frame-relay.mdc
  if (agents.cursor !== false) {
    const cursorDir = join(cwd, '.cursor', 'rules');
    if (!existsSync(cursorDir)) {
      mkdirSync(cursorDir, { recursive: true });
    }
    const cursorRulePath = join(cursorDir, 'frame-relay.mdc');
    const cursorContent = [
      '---',
      'description: Frame-Relay design system rules and token enforcement',
      'alwaysApply: true',
      '---',
      '',
      '# Frame-Relay Design Rules',
      '',
      `1. Always use kit components from \`${hasPathAlias ? `@/${componentsDir.replace(/^src\//, '')}` : `./${componentsDir}`}\`. Never write raw HTML form/button elements.`,
      '2. Style with design token classes (`bg-primary-500`, `rounded-md`, `p-4`, `text-body`). Never hardcode hex codes or arbitrary values.',
      '3. Check `.frame-relay/components.md` for complete props and usage guidelines.',
    ].join('\n');
    writeFileSync(cursorRulePath, cursorContent + '\n', 'utf-8');
    writtenFiles.push('.cursor/rules/frame-relay.mdc');
  }

  // 4. Claude Code: CLAUDE.md
  if (agents.claude !== false) {
    const claudePath = join(cwd, 'CLAUDE.md');
    let claudeContent = '';
    if (existsSync(claudePath)) {
      claudeContent = readFileSync(claudePath, 'utf-8');
    }
    const claudeBlock = [FRAME_RELAY_START_TAG, '@AGENTS.md', FRAME_RELAY_END_TAG].join('\n');
    const updatedClaude = replaceOrAppendBlock(
      claudeContent,
      claudeBlock,
      FRAME_RELAY_START_TAG,
      FRAME_RELAY_END_TAG,
    );
    writeFileSync(claudePath, updatedClaude, 'utf-8');
    writtenFiles.push('CLAUDE.md');
  }

  return { writtenFiles };
}

export function updateAgentFiles(
  cwd: string,
  componentsDir: string,
  agentsConfig?: {
    antigravity?: boolean;
    cursor?: boolean;
    claude?: boolean;
  },
): { writtenFiles: string[] } {
  return writeAgentRules({
    cwd,
    componentsDir,
    hasPathAlias: true,
    agentsConfig,
  });
}
