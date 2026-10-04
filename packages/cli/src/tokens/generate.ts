import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { flattenTokens, TokensFile } from '@josephbrendan/schema';

export interface GenerateTokensCssOptions {
  tokens: TokensFile;
}

function tokenPathToKebab(path: string): string {
  return path
    .replace(/\./g, '-')
    .replace(/\//g, '-')
    .replace(/\s+/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function resolveTokenValue(val: unknown): string {
  if (typeof val === 'string') {
    // Replace {token.path} with var(--fr-token-path)
    return val.replace(/\{([a-z0-9_.-]+)\}/gi, (_, ref) => {
      return `var(--fr-${tokenPathToKebab(ref)})`;
    });
  }
  if (typeof val === 'number') {
    return `${val}`;
  }
  return String(val);
}

export function generateTokensCss(tokensFile: TokensFile): string {
  const flattened = flattenTokens(tokensFile);

  const rootVars: string[] = [];
  const darkVars: string[] = [];
  const otherModeVars: Record<string, string[]> = {};
  const themeVars: string[] = [];
  const utilities: string[] = [];

  for (const [path, token] of flattened.entries()) {
    const kebab = tokenPathToKebab(path);
    const varName = `--fr-${kebab}`;

    // 1. Typography tokens -> generate @utility text-<name>
    if (
      token.$type === 'typography' ||
      path.startsWith('typography.') ||
      path.startsWith('typography/')
    ) {
      if (typeof token.$value === 'object' && token.$value !== null) {
        const typo = token.$value as Record<string, unknown>;
        const subName = path.replace(/^typography[./]/, '');
        const utilityName = `text-${tokenPathToKebab(subName)}`;

        const declarations: string[] = [];
        if (typo.fontFamily) {
          declarations.push(`  font-family: ${resolveTokenValue(typo.fontFamily)};`);
        }
        if (typo.fontSize) {
          declarations.push(`  font-size: ${resolveTokenValue(typo.fontSize)};`);
        }
        if (typo.fontWeight) {
          declarations.push(`  font-weight: ${resolveTokenValue(typo.fontWeight)};`);
        }
        if (typo.lineHeight) {
          declarations.push(`  line-height: ${resolveTokenValue(typo.lineHeight)};`);
        }
        if (typo.letterSpacing) {
          declarations.push(`  letter-spacing: ${resolveTokenValue(typo.letterSpacing)};`);
        }

        if (declarations.length > 0) {
          utilities.push(`@utility ${utilityName} {\n${declarations.join('\n')}\n}`);
        }
        continue;
      }
    }

    // Scalar or string token value for CSS variable
    const baseValue = resolveTokenValue(token.$value);
    rootVars.push(`  ${varName}: ${baseValue};`);

    // Check mode extensions
    const modes = token.$extensions?.['frame-relay']?.modes;
    if (modes && typeof modes === 'object') {
      for (const [modeName, modeVal] of Object.entries(modes)) {
        const resolvedModeVal = resolveTokenValue(modeVal);
        if (modeName === 'dark') {
          darkVars.push(`  ${varName}: ${resolvedModeVal};`);
        } else if (modeName !== 'light') {
          if (!otherModeVars[modeName]) {
            otherModeVars[modeName] = [];
          }
          otherModeVars[modeName].push(`  ${varName}: ${resolvedModeVal};`);
        }
      }
    }

    // Tailwind v4 @theme inline mappings
    // Colors
    if (token.$type === 'color' || path.startsWith('color.') || path.startsWith('color/')) {
      const colorSub = path.replace(/^color[./]/, '');
      const twColorName = tokenPathToKebab(colorSub);
      themeVars.push(`  --color-${twColorName}: var(${varName});`);
    } else if (path.endsWith('-color') || path.endsWith('Color')) {
      themeVars.push(`  --color-${kebab}: var(${varName});`);
    }
    // Radius
    else if (
      token.$type === 'dimension' &&
      (path.startsWith('radius.') || path.startsWith('radius/'))
    ) {
      const radiusSub = path.replace(/^radius[./]/, '');
      const twRadiusName = tokenPathToKebab(radiusSub);
      themeVars.push(`  --radius-${twRadiusName}: var(${varName});`);
    } else if (kebab === 'corner' || kebab.includes('radius')) {
      themeVars.push(`  --radius-${kebab}: var(${varName});`);
    }
    // Spacing
    else if (
      token.$type === 'dimension' &&
      (path.startsWith('space.') ||
        path.startsWith('space/') ||
        path.startsWith('spacing.') ||
        path.startsWith('spacing/'))
    ) {
      const spaceSub = path.replace(/^(space|spacing)[./]/, '');
      const twSpaceName = tokenPathToKebab(spaceSub);
      themeVars.push(`  --spacing-${twSpaceName}: var(${varName});`);
    }
    // Shadow
    else if (token.$type === 'shadow' || path.startsWith('shadow.') || path.startsWith('shadow/')) {
      const shadowSub = path.replace(/^shadow[./]/, '');
      const twShadowName = tokenPathToKebab(shadowSub);
      themeVars.push(`  --shadow-${twShadowName}: var(${varName});`);
    }
    // Font family
    else if (
      token.$type === 'fontFamily' ||
      path.startsWith('font.family.') ||
      path.startsWith('font/family/')
    ) {
      const fontSub = path.replace(/^font[./]family[./]/, '');
      const twFontName = tokenPathToKebab(fontSub);
      themeVars.push(`  --font-${twFontName}: var(${varName});`);
    }
    // Font weight
    else if (
      token.$type === 'fontWeight' ||
      path.startsWith('font.weight.') ||
      path.startsWith('font/weight/')
    ) {
      const weightSub = path.replace(/^font[./]weight[./]/, '');
      const twWeightName = tokenPathToKebab(weightSub);
      themeVars.push(`  --font-weight-${twWeightName}: var(${varName});`);
    }
  }

  const sections: string[] = [
    '/* Generated by Frame-Relay. Do not edit directly. */',
    ':root {\n' + rootVars.join('\n') + '\n}',
  ];

  if (darkVars.length > 0) {
    sections.push(
      '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n' +
        darkVars.join('\n') +
        '\n  }\n}',
    );
    sections.push('[data-theme="dark"] {\n' + darkVars.join('\n') + '\n}');
    sections.push('.dark {\n' + darkVars.join('\n') + '\n}');
  }

  for (const [modeName, vars] of Object.entries(otherModeVars)) {
    sections.push(`[data-theme="${modeName}"] {\n` + vars.join('\n') + '\n}');
  }

  if (themeVars.length > 0) {
    sections.push('@theme inline {\n' + themeVars.join('\n') + '\n}');
  }

  if (utilities.length > 0) {
    sections.push(utilities.join('\n\n'));
  }

  return sections.join('\n\n') + '\n';
}

export function addTokensImportToCssEntry(cssContent: string, tokensRelativePath: string): string {
  const normalizedPath = tokensRelativePath.replace(/\\/g, '/');
  const escaped = normalizedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existingImportRegex = new RegExp(`@import\\s+["']${escaped}["'];?`);
  if (existingImportRegex.test(cssContent)) {
    return cssContent;
  }

  const importStatement = `@import "${normalizedPath}";`;

  // Find @import "tailwindcss"
  const twImportRegex = /(@import\s+["']tailwindcss["'];?)/;
  if (twImportRegex.test(cssContent)) {
    return cssContent.replace(twImportRegex, `$1\n${importStatement}`);
  }

  // Prepend if @import "tailwindcss" not found
  return `${importStatement}\n${cssContent}`;
}

export function injectTokensImportIntoCss(cssEntryFullPath: string, tokensFullPath: string): void {
  const cssDir = dirname(cssEntryFullPath);
  let relPath = relative(cssDir, tokensFullPath).replace(/\\/g, '/');
  if (!relPath.startsWith('.')) {
    relPath = `./${relPath}`;
  }
  if (!existsSync(cssEntryFullPath)) return;
  const content = readFileSync(cssEntryFullPath, 'utf-8');
  const updated = addTokensImportToCssEntry(content, relPath);
  writeFileSync(cssEntryFullPath, updated, 'utf-8');
}
