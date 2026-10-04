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
