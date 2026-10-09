import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import fg from 'fast-glob';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ComponentSpec } from '@frame-relay/schema';
import { checkFile, CheckViolation } from '../check/index.js';
import { VERSION } from '../index.js';
import { LiveBridge, formatAge, LiveSelectionRecord } from '../live/bridge.js';
import { diffComponentSpecs } from '../live/diff.js';
import { KitCache } from './cache.js';

export function registerMcpTools(server: McpServer, cache: KitCache, live: LiveBridge): void {
  function getKitOrNoKitMessage() {
    const kit = cache.getActiveKit();
    if (!kit) {
      return {
        hasKit: false as const,
        noKitResult: {
          content: [
            {
              type: 'text' as const,
              text: `No Frame-Relay kit found from ${cache.root}. Run \`npx frame-relay sync\`, or set FRAME_RELAY_ROOT to your project folder.`,
            },
          ],
        },
      };
    }
    return { hasKit: true as const, kit };
  }

  function formatWithWarning(text: string): string {
    const warning = cache.getReloadWarning();
    return warning ? `${warning}\n\n${text}` : text;
  }

  // 1. get_kit_info
  server.registerTool(
    'get_kit_info',
    {
      description: 'Call first to confirm Frame-Relay is set up for this project.',
    },
    async () => {
      const kitCheck = getKitOrNoKitMessage();
      if (!kitCheck.hasKit) return kitCheck.noKitResult;

      const { kit } = kitCheck;
      const config = cache.config;
      const componentsDir = config?.componentsDir || 'src/components/ui';
      const importPrefix =
        config?.framework === 'next' || existsSync(join(cache.root, 'tsconfig.json'))
          ? `@/${componentsDir.replace(/^src\//, '')}`
          : `./${componentsDir}`;

      const modes =
        kit.manifest.modes && kit.manifest.modes.length > 0 ? kit.manifest.modes : ['light'];

      const liveStatus = live.getStatus();
      const liveLine = !liveStatus.running
        ? 'off (export-based kit)'
        : liveStatus.paired
          ? `on (port ${liveStatus.port}, connected to ${liveStatus.fileName ?? 'Figma'})`
          : `on (port ${liveStatus.port}, waiting for the plugin to pair)`;

      const infoData = {
        projectRoot: cache.root,
        kitName: kit.manifest.name,
        kitVersion: kit.manifest.kitVersion,
        exportedAt: kit.manifest.exportedAt,
        sourceFile: kit.manifest.source?.fileName || 'Unknown',
        componentCount: kit.manifest.components?.length || kit.components.size,
        modes,
        componentsDir,
        importPathPrefix: importPrefix,
        frameRelayVersion: VERSION,
        liveMode: liveStatus.running ? 'on' : 'off',
        live: {
          running: liveStatus.running,
          port: liveStatus.port,
          paired: liveStatus.paired,
          fileName: liveStatus.fileName,
          lastSelectionName: liveStatus.lastSelection?.name ?? null,
        },
      };

      const markdown = [
        `# Frame-Relay Kit: ${infoData.kitName}`,
        '',
        `- **Project Root**: \`${infoData.projectRoot}\``,
        `- **Kit Version**: \`${infoData.kitVersion}\``,
        `- **Exported At**: \`${infoData.exportedAt}\``,
        `- **Source Figma File**: ${infoData.sourceFile}`,
        `- **Components**: ${infoData.componentCount}`,
        `- **Modes**: ${infoData.modes.join(', ')}`,
        `- **Components Directory**: \`${infoData.componentsDir}\``,
        `- **Import Prefix**: \`${infoData.importPathPrefix}\``,
        `- **Frame-Relay CLI Version**: \`${infoData.frameRelayVersion}\``,
        `- **Live Mode**: ${liveLine}`,
      ].join('\n');

      return {
        content: [{ type: 'text', text: formatWithWarning(markdown) }],
        structuredContent: infoData,
      };
    },
  );

  // 2. list_components
  server.registerTool(
    'list_components',
    {
      description:
        'Call before building any UI to see which components already exist. Always use these instead of writing raw HTML elements.',
      inputSchema: {
        category: z
          .string()
          .optional()
          .describe('Optional category filter (e.g. Action, Input, Display, Layout)'),
      },
    },
    async ({ category }) => {
      const kitCheck = getKitOrNoKitMessage();
      if (!kitCheck.hasKit) return kitCheck.noKitResult;

      const components = cache.listComponents();
      const config = cache.config;
      const componentsDir = config?.componentsDir || 'src/components/ui';
      const importBase =
        config?.framework === 'next' || existsSync(join(cache.root, 'tsconfig.json'))
          ? `@/${componentsDir.replace(/^src\//, '')}`
          : `./${componentsDir}`;

      let filtered = components;
      if (category && category.trim()) {
        const catLower = category.trim().toLowerCase();
        filtered = components.filter((c) => (c.category || '').toLowerCase() === catLower);
      }

      if (filtered.length === 0) {
        const availableCategories = Array.from(
          new Set(components.map((c) => c.category).filter(Boolean)),
        );
        return {
          content: [
            {
              type: 'text',
              text: formatWithWarning(
                `No components found in category "${category}".\nAvailable categories: ${availableCategories.join(', ') || 'none'}`,
              ),
            },
          ],
          structuredContent: { components: [] },
        };
      }

      const structured = filtered.map((c) => {
        const variantProps = (c.props || []).filter((p) => p.type === 'variant');
        const variantsSummary = variantProps
          .map((p) => `${p.name} (${(p.options || []).join(' | ')})`)
          .join(', ');

        const importLine = `import { ${c.name} } from "${importBase}"`;

        return {
          name: c.name,
          category: c.category || 'General',
          purpose: c.description || 'Design kit component',
          variants: variantsSummary || 'none',
          importLine,
        };
      });

      const lines = [
        `# Available Components (${filtered.length})`,
        '',
        ...structured.map(
          (s) =>
            `- **${s.name}** (${s.category}): ${s.purpose}. Variants: ${s.variants}. Import: \`${s.importLine}\``,
        ),
      ];

      return {
        content: [{ type: 'text', text: formatWithWarning(lines.join('\n')) }],
        structuredContent: { components: structured },
      };
    },
  );

  // 3. get_component
  server.registerTool(
    'get_component',
    {
      description:
        'Call before using a component, to get its exact props, variants and usage rules.',
      inputSchema: {
        name: z.string().describe('Component name, e.g. Button or Input'),
      },
    },
    async ({ name }) => {
      const kitCheck = getKitOrNoKitMessage();
      if (!kitCheck.hasKit) return kitCheck.noKitResult;

      const found = cache.findComponent(name);
      if (!found) {
        const similar = cache.findSimilarComponentNames(name);
        const suggestion = similar.length > 0 ? ` Did you mean "${similar[0]}"?` : '';
        return {
          content: [
            {
              type: 'text',
              text: formatWithWarning(
                `No component named "${name}".${suggestion} Call list_components to see every component.`,
              ),
            },
          ],
        };
      }

      const spec = found.spec;
      const config = cache.config;
      const componentsDir = config?.componentsDir || 'src/components/ui';
      const importBase =
        config?.framework === 'next' || existsSync(join(cache.root, 'tsconfig.json'))
          ? `@/${componentsDir.replace(/^src\//, '')}`
          : `./${componentsDir}`;
      const importLine = `import { ${spec.name} } from "${importBase}"`;

      // Props table
      const propsHeader = '| Prop | Type | Options | Default | Description |';
      const propsDivider = '|---|---|---|---|---|';
      const propsRows = (spec.props || []).map((p) => {
        const options = p.options && p.options.length > 0 ? p.options.join(', ') : '-';
        const def = p.default !== undefined ? String(p.default) : '-';
        const desc = p.description || '-';
        return `| \`${p.name}\` | \`${p.type}\` | ${options} | \`${def}\` | ${desc} |`;
      });
      const propsTable = [propsHeader, propsDivider, ...propsRows].join('\n');

      // States and how to trigger
      const statesList = (spec.states || []).map((s) => {
        const sName = s.name;
        let trigger = 'interactive state';
        if (sName === 'Hover') trigger = 'User cursor hover (:hover)';
        else if (sName === 'Focus') trigger = 'Keyboard focus (:focus-visible)';
        else if (sName === 'Pressed') trigger = 'Mouse/pointer press (:active)';
        else if (sName === 'Disabled') trigger = '`disabled` prop or `aria-disabled="true"`';
        else if (sName === 'Loading') trigger = '`data-loading="true"` attribute or `loading` prop';
        else if (sName === 'Error') trigger = '`aria-invalid="true"` attribute or `error` prop';
        return `- **${sName}**: ${trigger}`;
      });

      // Anatomy
      const anatomyList = (spec.anatomy || []).map((a) => {
        const opt = a.required ? ' *(required)*' : ' *(optional)*';
        return `- **${a.name}**${opt}: ${a.description || 'Anatomy part'}`;
      });

      // Guidelines
      const doList = (spec.usage?.do || []).map((d) => `- ✅ ${d}`);
      const dontList = (spec.usage?.dont || []).map((d) => `- ❌ ${d}`);

      // Accessibility
      const a11yRole = spec.accessibility?.role ? `- **Role**: \`${spec.accessibility.role}\`` : '';
      const a11yNotes = (spec.accessibility?.notes || []).map((n) => `- ${n}`);

      // Screenshots
      const screenshotsList = (spec.screenshots || []).map(
        (sc) => `- State: "${sc.state}", Variant: ${JSON.stringify(sc.variant)} -> \`${sc.path}\``,
      );

      // Usage Example
      const usageExample = generateMinimalUsageExample(spec, importLine);

      const markdown = [
        `# Component: ${spec.name}`,
        spec.description || 'Design kit component',
        '',
        `\`\`\`tsx\n${importLine};\n\`\`\``,
        '',
        '## Props',
        propsTable,
        '',
        '## States',
        statesList.length > 0 ? statesList.join('\n') : '- None specified',
        '',
        '## Anatomy Parts',
        anatomyList.length > 0 ? anatomyList.join('\n') : '- Single element',
        '',
        '## Guidelines',
        ...(doList.length > 0 ? ['### Do', ...doList] : []),
        ...(dontList.length > 0 ? ["### Don't", ...dontList] : []),
        '',
        '## Accessibility',
        ...(a11yRole ? [a11yRole] : []),
        ...(a11yNotes.length > 0 ? a11yNotes : ['- Follow standard ARIA specifications']),
        '',
        '## Screenshots',
        screenshotsList.length > 0 ? screenshotsList.join('\n') : '- No screenshots provided',
        '',
        '## Minimal Usage Example',
        '```tsx',
        usageExample,
        '```',
      ].join('\n');

      return {
        content: [{ type: 'text', text: formatWithWarning(markdown) }],
        structuredContent: {
          name: spec.name,
          category: spec.category,
          importLine,
          props: spec.props,
          variants: spec.variants,
          states: spec.states,
          anatomy: spec.anatomy,
          usage: spec.usage,
          accessibility: spec.accessibility,
          usageExample,
        },
      };
    },
  );

  // 4. get_tokens
  server.registerTool(
    'get_tokens',
    {
      description:
        'Call when you need a color, spacing, radius, type or shadow value. Use the Tailwind class or CSS variable, never a raw value.',
      inputSchema: {
        group: z
          .enum(['color', 'radius', 'space', 'typography', 'shadow', 'border'])
          .optional()
          .describe('Token group category'),
        mode: z.string().optional().describe('Token mode (e.g. light, dark)'),
      },
    },
    async ({ group, mode }) => {
      const kitCheck = getKitOrNoKitMessage();
      if (!kitCheck.hasKit) return kitCheck.noKitResult;

      const flattened = cache.flattenedTokens;
      const tokens: Array<{
        token: string;
        path: string;
        value: string;
        tailwindClass: string;
        cssVariable: string;
        mode?: string;
      }> = [];

      for (const [tokenPath, t] of flattened.entries()) {
        const isMatchGroup = matchTokenGroup(tokenPath, group);
        if (!isMatchGroup) continue;

        let val = typeof t.$value === 'string' ? t.$value : JSON.stringify(t.$value);
        if (mode && t.$extensions && typeof t.$extensions === 'object') {
          const frameRelayExt = (t.$extensions as Record<string, unknown>)['frame-relay'] as
            Record<string, unknown> | undefined;
          const modeValues = frameRelayExt?.modes as Record<string, unknown> | undefined;
          if (modeValues && modeValues[mode] !== undefined) {
            val = String(modeValues[mode]);
          }
        }

        const cssVariable = `--fr-${tokenPath.replace(/\./g, '-')}`;
        const tailwindClass = deriveTailwindClass(tokenPath, group);

        tokens.push({
          token: tokenPath,
          path: tokenPath,
          value: val,
          tailwindClass,
          cssVariable,
          mode: mode || 'default',
        });
      }

      if (tokens.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: formatWithWarning(
                `No tokens found${group ? ` for group "${group}"` : ''}${mode ? ` in mode "${mode}"` : ''}.`,
              ),
            },
          ],
          structuredContent: { tokens: [] },
        };
      }

      const tableRows = tokens.map(
        (t) =>
          `| \`${t.token}\` | \`${t.value}\` | \`${t.tailwindClass}\` | \`${t.cssVariable}\` |`,
      );
      const markdown = [
        `# Design Tokens (${tokens.length}${group ? ` in ${group}` : ''})`,
        '',
        '| Token | Value | Tailwind Class | CSS Variable |',
        '|---|---|---|---|',
        ...tableRows,
      ].join('\n');

      return {
        content: [{ type: 'text', text: formatWithWarning(markdown) }],
        structuredContent: { tokens },
      };
    },
  );

  // 5. get_screenshot
  server.registerTool(
    'get_screenshot',
    {
      description:
        'Call to see what a component should look like, then compare it with what you built.',
      inputSchema: {
        name: z.string().describe('Component name'),
        variant: z
          .record(z.string(), z.string())
          .optional()
          .describe("Variant prop map, e.g. { variant: 'primary', size: 'md' }"),
        state: z.string().optional().describe("State, e.g. 'Default', 'Hover', 'Disabled'"),
      },
    },
    async ({ name, variant, state }) => {
      const kitCheck = getKitOrNoKitMessage();
      if (!kitCheck.hasKit) return kitCheck.noKitResult;

      const found = cache.findComponent(name);
      if (!found) {
        const similar = cache.findSimilarComponentNames(name);
        const suggestion = similar.length > 0 ? ` Did you mean "${similar[0]}"?` : '';
        return {
          content: [
            {
              type: 'text',
              text: formatWithWarning(
                `No component named "${name}".${suggestion} Call list_components to see every component.`,
              ),
            },
          ],
        };
      }

      const spec = found.spec;
      const targetState = state || 'Default';
      const targetVariant = variant || {};

      // Fill in default variant props if not supplied
      for (const p of spec.props || []) {
        if (p.type === 'variant' && p.default && targetVariant[p.name] === undefined) {
          targetVariant[p.name] = String(p.default);
        }
      }

      const screenshots = spec.screenshots || [];
      if (screenshots.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: formatWithWarning(
                `Component "${spec.name}" has no screenshots available in the kit.`,
              ),
            },
          ],
        };
      }

      // Find closest or exact screenshot
      let bestMatch = screenshots[0];
      let bestScore = -1;
      let isExact = false;

      for (const sc of screenshots) {
        let score = 0;
        const stateMatches = (sc.state || '').toLowerCase() === targetState.toLowerCase();
        if (stateMatches) score += 10;

        let variantKeysMatch = 0;
        const scVariant = sc.variant || {};
        for (const [k, v] of Object.entries(targetVariant)) {
          if (scVariant[k] && String(scVariant[k]).toLowerCase() === String(v).toLowerCase()) {
            score += 2;
            variantKeysMatch++;
          }
        }

        if (stateMatches && variantKeysMatch === Object.keys(targetVariant).length) {
          bestMatch = sc;
          isExact = true;
          break;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = sc;
        }
      }

      const kitDir = cache.kitDir || cache.root;
      const imgPath = resolve(kitDir, bestMatch.path);

      if (!existsSync(imgPath)) {
        return {
          content: [
            {
              type: 'text',
              text: formatWithWarning(
                `Screenshot file "${bestMatch.path}" not found on disk at \`${imgPath}\`.`,
              ),
            },
          ],
        };
      }

      const imgBuffer = readFileSync(imgPath);
      const base64Data = imgBuffer.toString('base64');
      const statusLine = isExact
        ? `Screenshot for ${spec.name} (variant: ${JSON.stringify(bestMatch.variant || {})}, state: "${bestMatch.state}")`
        : `Screenshot for variant ${JSON.stringify(targetVariant)}, state: "${targetState}" not found. Showing closest match: variant ${JSON.stringify(bestMatch.variant || {})}, state: "${bestMatch.state}"`;

      return {
        content: [
          { type: 'text', text: formatWithWarning(statusLine) },
          {
            type: 'image',
            data: base64Data,
            mimeType: 'image/png',
          },
        ],
        structuredContent: {
          component: spec.name,
          path: bestMatch.path,
          isExact,
          variant: bestMatch.variant,
          state: bestMatch.state,
        },
      };
    },
  );

  // 6. check_file
  server.registerTool(
    'check_file',
    {
      description:
        'Call after creating or editing any UI file, before you finish. Fix every issue it reports.',
      inputSchema: {
        path: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('Single path or array of file paths to check'),
        paths: z.array(z.string()).optional().describe('Array of file paths to check'),
      },
    },
    async (args) => {
      const pathsToCheck: string[] = [];
      if (typeof args.path === 'string') pathsToCheck.push(args.path);
      else if (Array.isArray(args.path)) pathsToCheck.push(...args.path);
      if (Array.isArray(args.paths)) pathsToCheck.push(...args.paths);

      const root = cache.root;
      const config = cache.config;
      const componentsDir = config?.componentsDir || 'src/components/ui';

      // Default to scanning src/ excluding componentsDir if no path supplied
      if (pathsToCheck.length === 0) {
        const srcDir = join(root, 'src');
        if (existsSync(srcDir)) {
          const found = fg.sync('**/*.{ts,tsx,js,jsx}', {
            cwd: srcDir,
            absolute: false,
            ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
          });
          pathsToCheck.push(...found.map((f) => join('src', f)));
        }
      }

      const allViolations: CheckViolation[] = [];
      const errorNotes: string[] = [];

      for (const p of pathsToCheck) {
        const resolved = isAbsolute(p) ? resolve(p) : resolve(root, p);
        const rel = relative(root, resolved);

        if (rel.startsWith('..') || (isAbsolute(rel) && !rel.startsWith(root))) {
          errorNotes.push(`Error: Path "${p}" is outside the project root "${root}".`);
          continue;
        }

        if (!existsSync(resolved)) {
          errorNotes.push(`Error: File "${p}" does not exist.`);
          continue;
        }

        const stat = statSync(resolved);
        if (stat.isDirectory()) {
          const files = fg.sync('**/*.{ts,tsx,js,jsx}', {
            cwd: resolved,
            absolute: true,
            ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
          });
          for (const f of files) {
            const code = readFileSync(f, 'utf-8');
            const fileRel = relative(root, f).replace(/\\/g, '/');
            const res = checkFile({ filePath: fileRel, code, componentsDir });
            allViolations.push(...res.violations);
          }
        } else {
          const code = readFileSync(resolved, 'utf-8');
          const fileRel = relative(root, resolved).replace(/\\/g, '/');
          const res = checkFile({ filePath: fileRel, code, componentsDir });
          allViolations.push(...res.violations);
        }
      }

      if (errorNotes.length > 0 && allViolations.length === 0) {
        return {
          content: [{ type: 'text', text: formatWithWarning(errorNotes.join('\n')) }],
          structuredContent: { errors: errorNotes, violations: [] },
        };
      }

      if (allViolations.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: formatWithWarning(
                'No issues found. All checked files comply with Frame-Relay rules.',
              ),
            },
          ],
          structuredContent: { violations: [] },
        };
      }

      const lines = [
        `# Frame-Relay Compliance Check (${allViolations.length} issue${allViolations.length === 1 ? '' : 's'})`,
        '',
        ...allViolations.map(
          (v) =>
            `- **${v.file}:${v.line}:${v.col}** \`[${v.rule}]\` ${v.message}\n  *Suggested Fix*: ${v.fix}`,
        ),
      ];

      return {
        content: [{ type: 'text', text: formatWithWarning(lines.join('\n')) }],
        structuredContent: { violations: allViolations },
      };
    },
  );

  function pairingSteps(code: string | null): string {
    return code
      ? `Open the Frame-Relay plugin in Figma, go to the Live tab, enter code ${code}, and click Connect.`
      : 'Open the Frame-Relay plugin in Figma, go to the Live tab, and click Connect.';
  }

  function fallbackKitResult(fallbackName: string) {
    const kitCheck = getKitOrNoKitMessage();
    if (!kitCheck.hasKit) return kitCheck.noKitResult;

    const found = cache.findComponent(fallbackName);
    if (!found) {
      const similar = cache.findSimilarComponentNames(fallbackName);
      const suggestion = similar.length > 0 ? ` Did you mean "${similar[0]}"?` : '';
      return {
        content: [
          {
            type: 'text' as const,
            text: formatWithWarning(
              `Live mode has no selection, and the exported kit has no component named "${fallbackName}".${suggestion} Call list_components to see every component.`,
            ),
          },
        ],
        structuredContent: { source: 'exported-kit', component: null, spec: null },
      };
    }

    const exportedAt = cache.getActiveKit()?.manifest.exportedAt ?? 'unknown';
    const text = [
      `Live mode has no selection yet, so here is the exported spec for "${found.spec.name}" from the last kit export.`,
      '',
      `- **Source**: exported kit \`${cache.kitDir ?? cache.root}\``,
      `- **Exported at**: ${exportedAt}`,
      '',
      '```json',
      JSON.stringify(found.spec, null, 2),
      '```',
    ].join('\n');

    return {
      content: [{ type: 'text' as const, text: formatWithWarning(text) }],
      structuredContent: { source: 'exported-kit', component: found.spec.name, spec: found.spec },
    };
  }

  function selectionResult(record: LiveSelectionRecord) {
    const message = record.message;
    const lines = [
      `# Live Selection: ${message.meta.name}`,
      '',
      `- **Kind**: ${message.kind}`,
      `- **Figma file**: ${message.meta.fileName}`,
      `- **Page**: ${message.meta.pageName}`,
      `- **Node**: ${message.meta.nodeId} (${message.meta.nodeType})`,
      '',
      '## Spec',
      '```json',
      JSON.stringify(message.spec, null, 2),
      '```',
      '',
      '## Warnings',
      ...(message.warnings.length > 0
        ? message.warnings.map((w) => `- [${w.severity}] ${w.code}: ${w.message}`)
        : ['None.']),
    ];

    let differences: string[] = [];
    let matchedKitComponent: string | null = null;

    if (message.kind === 'component') {
      const found = cache.findComponent(message.spec.name);
      if (found) {
        matchedKitComponent = found.spec.name;
        differences = diffComponentSpecs(message.spec, found.spec);
        lines.push('', '## Diff vs exported kit');
        if (differences.length > 0) {
          lines.push(
            ...differences.map((d) => `- ${d}`),
            '',
            'Figma has changed since the last export. Re-export the kit and run sync.',
          );
        } else {
          lines.push('No differences. This selection matches the exported kit.');
        }
      } else {
        lines.push(
          '',
          `"${message.spec.name}" is not in the exported kit yet. Re-export the kit and run sync to add it.`,
        );
      }
    }

    const content: Array<
      { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
    > = [{ type: 'text', text: formatWithWarning(lines.join('\n')) }];
    if (message.image) {
      content.push({ type: 'image', data: message.image, mimeType: 'image/png' });
    }

    return {
      content,
      structuredContent: {
        meta: message.meta,
        kind: message.kind,
        spec: message.spec,
        warnings: message.warnings,
        differences,
        matchedKitComponent,
      },
    };
  }

  // 7. start_live
  server.registerTool(
    'start_live',
    {
      description:
        'Call when the user wants live mode or mentions their Figma selection. Starts the local bridge and returns the pairing code to show the user.',
    },
    async () => {
      if (!live.isRunning()) {
        try {
          await live.start();
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          return {
            content: [
              {
                type: 'text' as const,
                text: `${detail}\n\nFix: close the program using the port or stop the old MCP server, then call start_live again.`,
              },
            ],
            structuredContent: { running: false, error: detail },
          };
        }
      }

      const status = live.getStatus();
      if (status.paired) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Live mode is already running on 127.0.0.1:${status.port} and connected to "${status.fileName ?? 'Figma'}". Ask the user to select a layer, then call get_live_selection.`,
            },
          ],
          structuredContent: { ...status, steps: null },
        };
      }

      const steps = pairingSteps(status.code);
      const text = [
        '# Live Mode Started',
        '',
        `- **Port**: ${status.port}`,
        `- **Pairing code**: \`${status.code}\``,
        '',
        'Show this to the user:',
        '',
        `> ${steps}`,
      ].join('\n');

      return {
        content: [{ type: 'text' as const, text: formatWithWarning(text) }],
        structuredContent: {
          running: true,
          port: status.port,
          code: status.code,
          codeExpiresAt: status.codeExpiresAt,
          paired: false,
          steps,
        },
      };
    },
  );

  // 8. stop_live
  server.registerTool(
    'stop_live',
    {
      description:
        'Call when the user is done with live mode. Stops the bridge and clears the paired session.',
    },
    async () => {
      const wasRunning = live.isRunning();
      await live.stop();
      return {
        content: [
          {
            type: 'text' as const,
            text: wasRunning
              ? 'Live mode stopped. The pairing code and session token are no longer valid. Call start_live to start again.'
              : 'Live mode was not running.',
          },
        ],
        structuredContent: { running: false },
      };
    },
  );

  // 9. get_live_status
  server.registerTool(
    'get_live_status',
    {
      description:
        'Call to check whether live mode is running, whether a plugin is paired, and when the last selection arrived.',
    },
    async () => {
      const status = live.getStatus();
      if (!status.running) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Live mode is not running. Call start_live to start it, then show the user the pairing code.',
            },
          ],
          structuredContent: { ...status },
        };
      }

      const lines = [
        '# Live Mode Status',
        '',
        '- **Running**: yes',
        `- **Port**: ${status.port}`,
        `- **Paired**: ${status.paired ? 'yes' : 'no'}`,
      ];
      if (status.paired) {
        lines.push(`- **Connected file**: ${status.fileName ?? 'unknown'}`);
      } else {
        lines.push(`- **Pairing code**: \`${status.code}\``);
      }
      if (status.lastSelection) {
        lines.push(
          `- **Last selection**: ${status.lastSelection.name} (${status.lastSelection.kind}, ${formatAge(status.lastSelection.ageMs)})`,
        );
      } else {
        lines.push('- **Last selection**: none yet');
      }

      return {
        content: [{ type: 'text' as const, text: formatWithWarning(lines.join('\n')) }],
        structuredContent: { ...status },
      };
    },
  );

  // 10. get_live_selection
  server.registerTool(
    'get_live_selection',
    {
      description:
        'Call when the user says "match this" or refers to their Figma selection. Returns the selected layer plus differences from the exported kit.',
      inputSchema: {
        fallbackName: z
          .string()
          .optional()
          .describe(
            'Component name from the exported kit to return when live mode has no selection',
          ),
      },
    },
    async ({ fallbackName }) => {
      const status = live.getStatus();

      if (!status.running) {
        if (fallbackName) return fallbackKitResult(fallbackName);
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Live mode is not running. Call start_live, show the user the pairing code, and ask them to connect the Frame-Relay plugin.',
            },
          ],
          structuredContent: { running: false, paired: false },
        };
      }

      if (!status.paired) {
        const steps = pairingSteps(status.code);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Live mode is running on port ${status.port}, but no Figma plugin has paired yet.\n\n${steps}\n\nIf the code expired, call start_live for a fresh code.`,
            },
          ],
          structuredContent: {
            running: true,
            paired: false,
            port: status.port,
            code: status.code,
            steps,
          },
        };
      }

      const record = live.getSelectionRecord();
      if (!record) {
        if (fallbackName) return fallbackKitResult(fallbackName);
        return {
          content: [
            {
              type: 'text' as const,
              text: `A plugin is connected (${status.fileName ?? 'Figma'}) but no layer has been shared yet. Ask the user to select a single layer in Figma; the plugin sends it automatically.`,
            },
          ],
          structuredContent: {
            running: true,
            paired: true,
            fileName: status.fileName,
            selection: null,
          },
        };
      }

      return selectionResult(record);
    },
  );
}

function matchTokenGroup(path: string, group?: string): boolean {
  if (!group) return true;
  const p = path.toLowerCase();
  switch (group) {
    case 'color':
      return p.startsWith('color.') || p.includes('color');
    case 'radius':
      return p.startsWith('radius.') || p.includes('radius') || p.includes('corner');
    case 'space':
      return (
        p.startsWith('spacing.') ||
        p.startsWith('space.') ||
        p.includes('gap') ||
        p.includes('padding')
      );
    case 'typography':
      return p.startsWith('typography.') || p.startsWith('font.') || p.startsWith('text.');
    case 'shadow':
      return p.startsWith('shadow.') || p.startsWith('elevation.') || p.includes('shadow');
    case 'border':
      return p.startsWith('border.') || p.includes('border');
    default:
      return true;
  }
}

function deriveTailwindClass(path: string, group?: string): string {
  const short = path.split('.').slice(1).join('-');
  const base = short || path.replace(/\./g, '-');
  const g = group || path.split('.')[0] || '';

  switch (g) {
    case 'color':
      return `bg-${base} / text-${base} / border-${base}`;
    case 'radius':
      return `rounded-${base}`;
    case 'space':
    case 'spacing':
      return `p-${base} / gap-${base}`;
    case 'typography':
      return `text-${base}`;
    case 'shadow':
      return `shadow-${base}`;
    case 'border':
      return `border-${base}`;
    default:
      return base;
  }
}

function generateMinimalUsageExample(spec: ComponentSpec, importLine: string): string {
  const name = spec.name;
  const variantProps = (spec.props || []).filter((p) => p.type === 'variant');
  const variantAttrs = variantProps
    .map((p) => `${p.name}="${p.default || p.options?.[0] || 'default'}"`)
    .join(' ');

  const space = variantAttrs ? ` ${variantAttrs}` : '';

  switch (name) {
    case 'Button':
      return `${importLine};\n\nexport function Example() {\n  return <Button${space}>Click me</Button>;\n}`;
    case 'Input':
      return `${importLine};\n\nexport function Example() {\n  return <Input label="Email"${space} placeholder="you@example.com" />;\n}`;
    case 'Checkbox':
    case 'Radio':
    case 'Switch':
      return `${importLine};\n\nexport function Example() {\n  return <${name} label="Remember me"${space} />;\n}`;
    case 'Card':
      return `${importLine};\n\nexport function Example() {\n  return (\n    <Card${space}>\n      <h3>Card Title</h3>\n      <p>Card body content</p>\n    </Card>\n  );\n}`;
    case 'Badge':
      return `${importLine};\n\nexport function Example() {\n  return <Badge${space}>Active</Badge>;\n}`;
    default:
      return `${importLine};\n\nexport function Example() {\n  return <${name}${space} />;\n}`;
  }
}
