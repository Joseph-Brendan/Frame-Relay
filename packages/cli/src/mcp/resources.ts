import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { generateComponentsMarkdown } from '../agents/components-md.js';
import { KitCache } from './cache.js';

export function registerMcpResources(server: McpServer, cache: KitCache): void {
  // 1. frame-relay://components
  server.registerResource(
    'components',
    'frame-relay://components',
    {
      description: 'Full markdown documentation of all components in the Frame-Relay design kit',
      mimeType: 'text/markdown',
    },
    async (uri: URL) => {
      const componentsMdPath = join(cache.root, '.frame-relay', 'components.md');
      let text = '';
      if (existsSync(componentsMdPath)) {
        text = readFileSync(componentsMdPath, 'utf-8');
      } else {
        const components = cache.listComponents();
        const componentsDir = cache.config?.componentsDir || 'src/components/ui';
        text = generateComponentsMarkdown({
          components,
          componentsDir,
          hasPathAlias: true,
        });
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text,
          },
        ],
      };
    },
  );

  // 2. frame-relay://tokens
  server.registerResource(
    'tokens',
    'frame-relay://tokens',
    {
      description:
        'Catalog of design tokens, their values, Tailwind utility classes and CSS variables',
      mimeType: 'text/markdown',
    },
    async (uri: URL) => {
      const flattened = cache.flattenedTokens;
      const rows = Array.from(flattened.entries()).map(([path, t]) => {
        const val = typeof t.$value === 'string' ? t.$value : JSON.stringify(t.$value);
        const cssVar = `--fr-${path.replace(/\./g, '-')}`;
        const twClass = path.split('.').slice(1).join('-') || path;
        return `| \`${path}\` | \`${val}\` | \`${twClass}\` | \`${cssVar}\` |`;
      });

      const markdown = [
        '# Frame-Relay Design Tokens',
        '',
        '| Token Path | Value | Tailwind Class | CSS Variable |',
        '|---|---|---|---|',
        ...rows,
      ].join('\n');

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: markdown,
          },
        ],
      };
    },
  );

  // 3. frame-relay://component/{name}
  server.registerResource(
    'component-detail',
    new ResourceTemplate('frame-relay://component/{name}', { list: undefined }),
    {
      description:
        'Detailed specification, props, variants, states and guidelines for a single component',
      mimeType: 'text/markdown',
    },
    async (uri: URL, variables) => {
      const name = variables.name;
      const compName = Array.isArray(name) ? name[0] : String(name || '');
      const found = cache.findComponent(compName);
      if (!found) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/markdown',
              text: `# Error: Component "${compName}" not found.\n\nUse resource frame-relay://components to list available components.`,
            },
          ],
        };
      }

      const spec = found.spec;
      const importLine = `import { ${spec.name} } from "@/components/ui"`;

      const markdown = [
        `# Component: ${spec.name}`,
        spec.description || 'Design kit component',
        '',
        `\`\`\`tsx\n${importLine};\n\`\`\``,
        '',
        '## Props',
        '| Prop | Type | Default | Description |',
        '|---|---|---|---|',
        ...(spec.props || []).map(
          (p) =>
            `| \`${p.name}\` | \`${p.type}\` | \`${p.default ?? '-'}\` | ${p.description || '-'} |`,
        ),
        '',
        '## Anatomy',
        ...(spec.anatomy || []).map((a) => `- **${a.name}**: ${a.description || 'part'}`),
        '',
        '## Accessibility',
        `- Role: \`${spec.accessibility?.role || 'none'}\``,
        ...(spec.accessibility?.notes || []).map((n) => `- ${n}`),
      ].join('\n');

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: markdown,
          },
        ],
      };
    },
  );
}
