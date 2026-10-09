import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface WriteMcpConfigsOptions {
  cwd: string;
}

export interface McpServerDef {
  command: string;
  args: string[];
}

export function buildServerEntry(cwd: string): McpServerDef {
  let isDevDep = false;
  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (
        pkg.devDependencies?.['@josephbrendan/frame-relay'] ||
        pkg.devDependencies?.['frame-relay'] ||
        pkg.dependencies?.['@josephbrendan/frame-relay'] ||
        pkg.dependencies?.['frame-relay']
      ) {
        isDevDep = true;
      }
    } catch {
      // ignore
    }
  }

  if (isDevDep) {
    return {
      command: 'npx',
      args: ['frame-relay', 'mcp'],
    };
  }

  return {
    command: 'npx',
    args: ['-y', '@josephbrendan/frame-relay', 'mcp'],
  };
}

export function mergeMcpConfigFile(
  filePath: string,
  serverName: string,
  entry: McpServerDef,
): void {
  let json: Record<string, unknown> = {};

  if (existsSync(filePath)) {
    try {
      json = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      json = {};
    }
  }

  const existingServers =
    json.mcpServers && typeof json.mcpServers === 'object'
      ? (json.mcpServers as Record<string, unknown>)
      : {};

  json.mcpServers = {
    ...existingServers,
    [serverName]: entry,
  };

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
}

export const OPENCODE_CONFIG_FILENAME = 'opencode.json';

export interface OpencodeServerDef {
  type: 'local';
  command: string[];
  enabled: boolean;
}

export function buildOpencodeServerEntry(cwd: string): OpencodeServerDef {
  const entry = buildServerEntry(cwd);
  return {
    type: 'local',
    command: [entry.command, ...entry.args],
    enabled: true,
  };
}

/**
 * Merges the frame-relay MCP server into opencode.json without removing other keys or servers.
 * OpenCode reads AGENTS.md for rules, so no extra rules file is written for it.
 */
export function mergeOpencodeConfigFile(filePath: string, entry: OpencodeServerDef): void {
  let json: Record<string, unknown> = {};

  if (existsSync(filePath)) {
    try {
      json = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      json = {};
    }
  }

  if (typeof json.$schema !== 'string') {
    json.$schema = 'https://opencode.ai/config.json';
  }

  const existingMcp =
    json.mcp && typeof json.mcp === 'object' ? (json.mcp as Record<string, unknown>) : {};

  json.mcp = {
    ...existingMcp,
    'frame-relay': entry,
  };

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
}

export function writeMcpConfigs(opts: string | WriteMcpConfigsOptions): {
  skipped: boolean;
  message?: string;
  writtenFiles: string[];
} {
  const cwd = typeof opts === 'string' ? opts : opts.cwd;

  const entry = buildServerEntry(cwd);
  const targets = [
    join(cwd, '.agents', 'mcp_config.json'),
    join(cwd, '.cursor', 'mcp.json'),
    join(cwd, '.mcp.json'),
  ];

  const writtenFiles: string[] = [];

  for (const t of targets) {
    mergeMcpConfigFile(t, 'frame-relay', entry);
    writtenFiles.push(t);
  }

  const opencodePath = join(cwd, OPENCODE_CONFIG_FILENAME);
  mergeOpencodeConfigFile(opencodePath, buildOpencodeServerEntry(cwd));
  writtenFiles.push(opencodePath);

  return {
    skipped: false,
    writtenFiles,
  };
}

export interface McpConfigSnippets {
  antigravity: { file: string; config: { mcpServers: Record<string, McpServerDef> } };
  antigravityGlobal: { file: string; config: { mcpServers: Record<string, McpServerDef> } };
  cursor: { file: string; config: { mcpServers: Record<string, McpServerDef> } };
  claude: { file: string; config: { mcpServers: Record<string, McpServerDef> } };
  opencode: {
    file: string;
    config: {
      $schema: string;
      mcp: Record<string, OpencodeServerDef>;
    };
  };
}

export function getMcpConfigSnippets(cwd: string = process.cwd()): McpConfigSnippets {
  const localEntry = buildServerEntry(cwd);
  const globalEntry: McpServerDef = {
    command: 'npx',
    args: ['-y', '@josephbrendan/frame-relay', 'mcp'],
  };

  return {
    antigravity: {
      file: '.agents/mcp_config.json',
      config: {
        mcpServers: {
          'frame-relay': localEntry,
        },
      },
    },
    antigravityGlobal: {
      file: '~/.gemini/config/mcp_config.json',
      config: {
        mcpServers: {
          'frame-relay': globalEntry,
        },
      },
    },
    cursor: {
      file: '.cursor/mcp.json',
      config: {
        mcpServers: {
          'frame-relay': localEntry,
        },
      },
    },
    claude: {
      file: '.mcp.json',
      config: {
        mcpServers: {
          'frame-relay': localEntry,
        },
      },
    },
    opencode: {
      file: OPENCODE_CONFIG_FILENAME,
      config: {
        $schema: 'https://opencode.ai/config.json',
        mcp: {
          'frame-relay': buildOpencodeServerEntry(cwd),
        },
      },
    },
  };
}

export function printMcpConfig(cwd: string = process.cwd()): void {
  const snippets = getMcpConfigSnippets(cwd);

  process.stdout.write(`// Antigravity (Project: ${snippets.antigravity.file})\n`);
  process.stdout.write(JSON.stringify(snippets.antigravity.config, null, 2) + '\n\n');

  process.stdout.write(`// Antigravity (Global: ${snippets.antigravityGlobal.file})\n`);
  process.stdout.write(JSON.stringify(snippets.antigravityGlobal.config, null, 2) + '\n\n');

  process.stdout.write(`// Cursor (${snippets.cursor.file})\n`);
  process.stdout.write(JSON.stringify(snippets.cursor.config, null, 2) + '\n\n');

  process.stdout.write(`// Claude Code (${snippets.claude.file})\n`);
  process.stdout.write(JSON.stringify(snippets.claude.config, null, 2) + '\n\n');

  process.stdout.write(`// OpenCode (${snippets.opencode.file})\n`);
  process.stdout.write(JSON.stringify(snippets.opencode.config, null, 2) + '\n');
}
