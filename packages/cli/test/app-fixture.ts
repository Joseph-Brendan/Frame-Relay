import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_KIT = fileURLToPath(
  new URL('../../../examples/sample-kit/frame-relay-kit', import.meta.url),
);

/**
 * Minimal Vite + React + TypeScript + Tailwind v4 app used by CLI command tests.
 * Includes the runtime dependencies so `init --yes` never tries to install anything.
 */
export function writeMinimalApp(cwd: string): void {
  const write = (rel: string, content: string): void => {
    const full = join(cwd, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf-8');
  };

  write(
    'package.json',
    JSON.stringify(
      {
        name: 'fixture-app',
        private: true,
        version: '0.0.0',
        type: 'module',
        dependencies: {
          'class-variance-authority': '^0.7.1',
          clsx: '^2.1.1',
          react: '^19.0.0',
          'react-dom': '^19.0.0',
          'tailwind-merge': '^3.0.2',
        },
        devDependencies: {
          '@vitejs/plugin-react': '^4.3.4',
          tailwindcss: '^4.0.0',
          typescript: '^5.7.3',
          vite: '^6.2.0',
        },
      },
      null,
      2,
    ) + '\n',
  );
  write(
    'tsconfig.json',
    JSON.stringify(
      {
        compilerOptions: { jsx: 'react-jsx', baseUrl: '.', paths: { '@/*': ['src/*'] } },
        include: ['src'],
      },
      null,
      2,
    ) + '\n',
  );
  write('src/index.css', '@import "tailwindcss";\n');
  write('src/App.tsx', 'export function App() {\n  return <h1>Fixture</h1>;\n}\n');
}

/** Copies examples/sample-kit/frame-relay-kit into the app so sync/doctor find it by default. */
export function copySampleKit(cwd: string): void {
  cpSync(SAMPLE_KIT, join(cwd, 'frame-relay-kit'), { recursive: true });
}
