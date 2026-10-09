import prettier from 'prettier';

export async function formatCode(code: string, filepath = 'file.tsx'): Promise<string> {
  try {
    const config = (await prettier.resolveConfig(filepath)) || {};
    return await prettier.format(code, {
      ...config,
      parser: 'typescript',
    });
  } catch {
    // If prettier formatting fails, return original code without crashing
    return code;
  }
}

/**
 * Formats generated content (CSS, Markdown, JSON, ...) with the project's Prettier config so
 * running the repo formatter later cannot turn generated files into false re-sync conflicts.
 * The parser is inferred from the file path. Falls back to the original content on any failure.
 */
export async function formatGeneratedText(filepath: string, content: string): Promise<string> {
  try {
    const config = (await prettier.resolveConfig(filepath)) || {};
    return await prettier.format(content, { ...config, filepath });
  } catch {
    return content;
  }
}
