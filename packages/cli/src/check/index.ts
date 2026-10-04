import { parse } from '@babel/parser';
import { CheckResult, CheckViolation } from './types.js';

export * from './types.js';

const COLOR_REGEX = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/;
const TAILWIND_ARBITRARY_REGEX =
  /\b(bg|text|border|rounded|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|shadow)-\[([^\]]+)\]/g;

export interface CheckFileOptions {
  filePath: string;
  code: string;
  componentsDir?: string;
  isComponentFile?: boolean;
}

export function checkFile(opts: CheckFileOptions): CheckResult {
  const { filePath, code, componentsDir, isComponentFile } = opts;
  const violations: CheckViolation[] = [];

  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedCompDir = componentsDir
    ? componentsDir.replace(/\\/g, '/').replace(/^\.\//, '')
    : '';
  const inComponentsDir =
    isComponentFile ?? (Boolean(normalizedCompDir) && normalizedPath.includes(normalizedCompDir));

  const isExemptFromRawValues =
    code.includes('// frame-relay: raw value from Figma') ||
    code.includes('frame-relay: raw value');

  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });
  } catch {
    // If parsing fails completely, return empty violations (or syntax violation)
    return { file: filePath, violations };
  }

  // Recursive AST walker
  function walk(node: unknown, parent?: unknown) {
    if (!node || typeof node !== 'object') return;

    const n = node as Record<string, unknown>;
    const loc = n.loc as { start: { line: number; column: number } } | undefined;
    const line = loc ? loc.start.line : 1;
    const col = loc ? loc.start.column + 1 : 1;

    // Rule 1: Raw <button>, <input>, <select>, <textarea> outside componentsDir
    if (n.type === 'JSXOpeningElement' && !inComponentsDir) {
      const nameNode = n.name as Record<string, unknown> | undefined;
      if (nameNode && nameNode.type === 'JSXIdentifier' && typeof nameNode.name === 'string') {
        const tagName = nameNode.name;
        if (['button', 'input', 'select', 'textarea'].includes(tagName)) {
          const pascal = tagName.charAt(0).toUpperCase() + tagName.slice(1);
          violations.push({
            file: filePath,
            line,
            col,
            rule: 'raw-form-element',
            message: `Raw <${tagName}> used in application code.`,
            fix: `Import { ${pascal} } from '@/components/ui' instead.`,
          });
        }
      }
    }

    // Rule 4: Inline style objects setting color, background, borderRadius, boxShadow
    if (n.type === 'JSXAttribute') {
      const attrName = (n.name as { name?: string })?.name;
      if (attrName === 'style') {
        const valNode = n.value as Record<string, unknown> | undefined;
        if (valNode && valNode.type === 'JSXExpressionContainer') {
          const expr = valNode.expression as Record<string, unknown> | undefined;
          if (expr && expr.type === 'ObjectExpression' && Array.isArray(expr.properties)) {
            for (const prop of expr.properties) {
              const p = prop as Record<string, unknown>;
              const keyName =
                (p.key as { name?: string; value?: string })?.name ||
                (p.key as { value?: string })?.value;
              const propLoc = p.loc as { start: { line: number; column: number } } | undefined;
              const pLine = propLoc ? propLoc.start.line : line;
              const pCol = propLoc ? propLoc.start.column + 1 : col;

              if (
                keyName &&
                [
                  'color',
                  'background',
                  'backgroundColor',
                  'borderRadius',
                  'boxShadow',
                  'border',
                ].includes(keyName)
              ) {
                violations.push({
                  file: filePath,
                  line: pLine,
                  col: pCol,
                  rule: 'inline-style-token',
                  message: `Inline style sets "${keyName}" directly.`,
                  fix: `Use a Tailwind token class instead of an inline style object.`,
                });
              }
            }
          }
        }
      }
    }

    // Rule 2: Literal colors (hex, rgb, rgba, hsl, hsla) in className, style or CSS-in-JS
    // Check StringLiterals and TemplateElements
    if (n.type === 'StringLiteral' && typeof n.value === 'string') {
      const text = n.value;

      // Check if inside JSXAttribute or style
      const match = text.match(COLOR_REGEX);
      if (match) {
        // Confirm it is in a className, style, or CSS context
        let isStylingContext = false;
        const p = parent as Record<string, unknown> | undefined;
        if (p?.type === 'JSXAttribute') {
          const attr = (p.name as { name?: string })?.name;
          if (attr === 'className' || attr === 'style') isStylingContext = true;
        } else if (p?.type === 'ObjectProperty') {
          isStylingContext = true;
        }

        if (isStylingContext) {
          violations.push({
            file: filePath,
            line,
            col,
            rule: 'literal-color',
            message: `Hardcoded color literal "${match[1]}" found in styling.`,
            fix: `Use a design token class such as bg-primary-500 or text-primary-500.`,
          });
        }
      }

      // Rule 3: Tailwind arbitrary values (e.g. bg-[#3B82F6], rounded-[13px], p-[7px])
      if (!isExemptFromRawValues) {
        const arbMatches = Array.from(text.matchAll(TAILWIND_ARBITRARY_REGEX));
        for (const m of arbMatches) {
          violations.push({
            file: filePath,
            line,
            col,
            rule: 'tailwind-arbitrary-value',
            message: `Tailwind arbitrary value "${m[0]}" found.`,
            fix: `Use a theme token utility or bind this property to a Figma variable.`,
          });
        }
      }
    }

    // Traverse children
    for (const val of Object.values(n)) {
      if (Array.isArray(val)) {
        for (const child of val) walk(child, n);
      } else if (val && typeof val === 'object') {
        walk(val, n);
      }
    }
  }

  walk(ast);

  return { file: filePath, violations };
}
