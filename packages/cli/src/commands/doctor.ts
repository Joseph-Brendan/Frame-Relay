import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pc from 'picocolors';
import { loadConfig } from '../config.js';
import { resolveCommandCwd } from '../cwd.js';
import { readAndValidateKit } from '../kit/discovery.js';
import { checkLivePorts } from '../live/ports.js';
import { createMcpServer } from '../mcp/server.js';

export interface DoctorCheckResult {
  name: string;
  passed: boolean;
  message: string;
  fix?: string;
}

export interface DoctorOptions {
  cwd?: string;
  verbose?: boolean;
}

export async function runDoctor(options: DoctorOptions = {}): Promise<boolean> {
  const cwd = resolveCommandCwd(options.cwd);
  const results: DoctorCheckResult[] = [];

  // 1. Node.js version (>= 20)
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor >= 20) {
    results.push({
      name: 'Node.js Version',
      passed: true,
      message: `Node.js version v${process.versions.node} (>= 20 required)`,
    });
  } else {
    results.push({
      name: 'Node.js Version',
      passed: false,
      message: `Node.js version v${process.versions.node} is unsupported. Node 20 or newer is required.`,
      fix: 'Install Node.js 20 or newer from https://nodejs.org or via nvm/fnm.',
    });
  }

  // 2. Configuration file (frame-relay.config.json)
  const { config, error: configError } = loadConfig(cwd);
  if (config) {
    results.push({
      name: 'Config File',
      passed: true,
      message: 'frame-relay.config.json is present and valid.',
    });
  } else {
    results.push({
      name: 'Config File',
      passed: false,
      message: configError
        ? `frame-relay.config.json is invalid: ${configError}`
        : 'frame-relay.config.json not found in project root.',
      fix: 'Run `frame-relay init` to generate a valid configuration file.',
    });
  }

  // 3. Design Kit
  const kitDirName = config?.kitDir || 'frame-relay-kit';
  const kitPath = resolve(cwd, kitDirName);
  if (existsSync(kitPath)) {
    try {
      const loaded = readAndValidateKit(kitPath, false);
      results.push({
        name: 'Design Kit',
        passed: true,
        message: `Kit "${loaded.manifest.name}" found with ${loaded.components.size} components and passes validation.`,
      });
    } catch (err) {
      results.push({
        name: 'Design Kit',
        passed: false,
        message: `Kit at "${kitDirName}" failed validation: ${err instanceof Error ? err.message : String(err)}`,
        fix: 'Export a fresh kit from the Figma plugin, or run `frame-relay sync --from <zip> --force`.',
      });
    }
  } else {
    results.push({
      name: 'Design Kit',
      passed: false,
      message: `No design kit found at "${kitDirName}".`,
      fix: 'Export a kit from Figma using Frame-Relay plugin or run `frame-relay sync --from <zip>`.',
    });
  }

  // 4. Generated Files
  if (config) {
    const componentsDirPath = resolve(cwd, config.componentsDir);
    const tokensFilePath = resolve(cwd, config.tokensFile);
    const cnPath = resolve(cwd, 'src/lib/cn.ts');

    const hasComponents = existsSync(componentsDirPath);
    const hasTokens = existsSync(tokensFilePath);
    const hasCn = existsSync(cnPath);

    if (hasComponents && hasTokens && hasCn) {
      results.push({
        name: 'Generated Files',
        passed: true,
        message: `Generated files present: components (${config.componentsDir}), tokens (${config.tokensFile}), and cn helper.`,
      });
    } else {
      const missing: string[] = [];
      if (!hasComponents) missing.push(config.componentsDir);
      if (!hasTokens) missing.push(config.tokensFile);
      if (!hasCn) missing.push('src/lib/cn.ts');

      results.push({
        name: 'Generated Files',
        passed: false,
        message: `Missing generated files: ${missing.join(', ')}`,
        fix: 'Run `frame-relay sync` to generate tokens, components, and helper files.',
      });
    }
  } else {
    results.push({
      name: 'Generated Files',
      passed: false,
      message: 'Cannot verify generated files without valid configuration.',
      fix: 'Run `frame-relay init` first.',
    });
  }

  // 5. MCP Config Files
  const mcpFiles = [
    {
      name: 'Antigravity (.agents/mcp_config.json)',
      path: join(cwd, '.agents', 'mcp_config.json'),
    },
    { name: 'Cursor (.cursor/mcp.json)', path: join(cwd, '.cursor', 'mcp.json') },
    { name: 'Claude Code (.mcp.json)', path: join(cwd, '.mcp.json') },
  ];

  let allMcpConfigured = true;
  const missingMcp: string[] = [];

  for (const item of mcpFiles) {
    if (!existsSync(item.path)) {
      allMcpConfigured = false;
      missingMcp.push(item.name);
      continue;
    }
    try {
      const parsed = JSON.parse(readFileSync(item.path, 'utf-8'));
      if (!parsed.mcpServers?.['frame-relay']) {
        allMcpConfigured = false;
        missingMcp.push(`${item.name} (missing "frame-relay" server entry)`);
      }
    } catch {
      allMcpConfigured = false;
      missingMcp.push(`${item.name} (invalid JSON)`);
    }
  }

  if (allMcpConfigured) {
    results.push({
      name: 'MCP Config Files',
      passed: true,
      message: 'All client MCP config files are present and contain "frame-relay".',
    });
  } else {
    results.push({
      name: 'MCP Config Files',
      passed: false,
      message: `MCP configuration missing or incomplete in: ${missingMcp.join(', ')}`,
      fix: 'Run `frame-relay sync` or `frame-relay mcp --print-config` to configure MCP clients.',
    });
  }

  // 6. Live Ports
  const portStates = await checkLivePorts();
  const portSummary = portStates
    .map((state) => `${state.port} ${state.free ? 'free' : 'in use'}`)
    .join(', ');
  if (portStates.some((state) => state.free)) {
    results.push({
      name: 'Live Ports',
      passed: true,
      message: `Live ports on 127.0.0.1: ${portSummary}.`,
    });
  } else {
    results.push({
      name: 'Live Ports',
      passed: false,
      message: `All live ports are in use: ${portSummary}.`,
      fix: 'Close the other Frame-Relay live session or the program using ports 47321-47323, then run doctor again.',
    });
  }

  // 7. MCP Server Startup
  try {
    const serverInstance = await createMcpServer({ root: cwd, watch: false });
    await serverInstance.close();
    results.push({
      name: 'MCP Server Startup',
      passed: true,
      message: 'frame-relay mcp server initialized and started cleanly.',
    });
  } catch (err) {
    results.push({
      name: 'MCP Server Startup',
      passed: false,
      message: `Failed to initialize MCP server: ${err instanceof Error ? err.message : String(err)}`,
      fix: 'Check project root, kit integrity, and run `frame-relay sync`.',
    });
  }

  // Print results
  console.log('\n' + pc.bold('Frame-Relay Doctor Health Check:'));
  console.log('='.repeat(50));

  let allPassed = true;
  for (const r of results) {
    if (r.passed) {
      console.log(`${pc.green('✔')} ${pc.bold(r.name)}: ${r.message}`);
    } else {
      allPassed = false;
      console.log(`${pc.red('✖')} ${pc.bold(r.name)}: ${pc.red(r.message)}`);
      if (r.fix) {
        console.log(`  ${pc.cyan('Fix:')} ${r.fix}`);
      }
    }
  }

  console.log('='.repeat(50));
  if (allPassed) {
    console.log(
      pc.green(pc.bold('✔ All doctor checks passed successfully! Project is fully healthy.\n')),
    );
    process.exitCode = 0;
  } else {
    console.log(
      pc.red(pc.bold('✖ Some doctor checks failed. Follow the fixes recommended above.\n')),
    );
    process.exitCode = 1;
  }

  return allPassed;
}
