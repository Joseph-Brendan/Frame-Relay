import { ComponentSpec } from '@josephbrendan/schema';

export interface GenerateComponentsMdOptions {
  components: ComponentSpec[];
  componentsDir: string;
  hasPathAlias: boolean;
}

export function generateComponentsMarkdown(opts: GenerateComponentsMdOptions): string {
  const { components, componentsDir, hasPathAlias } = opts;
  const importBase = hasPathAlias
    ? `@/${componentsDir.replace(/^src\//, '')}`
    : `./${componentsDir}`;

  const lines: string[] = [
    '# Frame-Relay Component Catalog & Agent Instructions',
    '',
    '## Global Agent Rules',
    '1. **Always use kit components**: Never write raw HTML `<button>`, `<input>`, `<select>`, `<textarea>` in application code. Import from `' +
      importBase +
      '`.',
    '2. **Tokens only**: Never write hex colors, rgb/rgba colors, or Tailwind arbitrary values (e.g. `bg-[#123]`, `p-[10px]`). Use design token classes (`bg-primary-500`, `rounded-md`, `p-4`, `text-body`).',
    '3. **Trigger states cleanly**: Use component props (`disabled`, `loading`) or ARIA attributes (`aria-invalid="true"`) to trigger states.',
    '4. **Preserve accessibility**: Maintain accessibility roles and keyboard interactions documented for each component.',
    '',
    '---',
    '',
  ];

  for (const comp of components) {
    lines.push(`## ${comp.name}`);
    lines.push('');
    lines.push(`\`\`\`tsx\nimport { ${comp.name} } from '${importBase}';\n\`\`\``);
    lines.push('');
    lines.push(`**Purpose**: ${comp.description || `${comp.name} component`}`);
    lines.push('');

    // Props table
    if (comp.props && comp.props.length > 0) {
      lines.push('### Props');
      lines.push('| Name | Type | Options | Default | Description |');
      lines.push('| :--- | :--- | :--- | :--- | :--- |');
      for (const p of comp.props) {
        const optsStr = p.options ? p.options.join(', ') : '-';
        const defStr = p.default !== undefined ? String(p.default) : '-';
        const descStr = p.description || '-';
        lines.push(`| \`${p.name}\` | \`${p.type}\` | ${optsStr} | ${defStr} | ${descStr} |`);
      }
      lines.push('');
    }

    // Variants
    const variantProps = comp.props.filter((p) => p.type === 'variant');
    if (variantProps.length > 0) {
      lines.push('### Variants');
      for (const v of variantProps) {
        lines.push(`- **${v.name}**: ${(v.options || []).map((o) => `\`${o}\``).join(', ')}`);
      }
      lines.push('');
    }

    // States
    if (comp.states && comp.states.length > 0) {
      lines.push('### States & Triggers');
      for (const s of comp.states) {
        let trigger = 'Default state';
        if (s.name === 'Hover') trigger = 'Hover with cursor or pointer';
        else if (s.name === 'Focus') trigger = 'Focus via Tab key or focus-visible';
        else if (s.name === 'Pressed') trigger = 'Active mouse press or touch down';
        else if (s.name === 'Disabled')
          trigger = 'Pass `disabled={true}` or `aria-disabled="true"`';
        else if (s.name === 'Loading') trigger = 'Pass `loading={true}` or `data-loading="true"`';
        else if (s.name === 'Error') trigger = 'Pass `error={true}` or `aria-invalid="true"`';

        lines.push(`- **${s.name}**: ${trigger}`);
      }
      lines.push('');
    }

    // Usage Rules
    if (comp.usage && (comp.usage.do.length > 0 || comp.usage.dont.length > 0)) {
      lines.push('### Usage Guidelines');
      if (comp.usage.do.length > 0) {
        lines.push('**Do:**');
        for (const d of comp.usage.do) lines.push(`- ${d}`);
      }
      if (comp.usage.dont.length > 0) {
        lines.push("**Don't:**");
        for (const d of comp.usage.dont) lines.push(`- ${d}`);
      }
      lines.push('');
    }

    // Accessibility
    if (comp.accessibility) {
      lines.push('### Accessibility');
      if (comp.accessibility.role) {
        lines.push(`- **Role**: \`${comp.accessibility.role}\``);
      }
      if (comp.accessibility.notes && comp.accessibility.notes.length > 0) {
        for (const note of comp.accessibility.notes) {
          lines.push(`- ${note}`);
        }
      }
      lines.push('');
    }

    // Screenshots
    if (comp.screenshots && comp.screenshots.length > 0) {
      lines.push('### Visual Reference (Screenshots)');
      for (const sc of comp.screenshots) {
        lines.push(`- \`${sc.path}\` (${sc.state || 'Default'})`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function generateComponentsMd(
  components: ComponentSpec[] | Map<string, ComponentSpec>,
  componentsDir: string,
  hasPathAlias = true,
): string {
  const compList = Array.isArray(components) ? components : Array.from(components.values());
  return generateComponentsMarkdown({
    components: compList,
    componentsDir,
    hasPathAlias,
  });
}
