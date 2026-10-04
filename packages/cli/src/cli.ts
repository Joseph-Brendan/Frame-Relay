#!/usr/bin/env node
import { cac } from 'cac';
import { runCheck } from './commands/check.js';
import { runInit } from './commands/init.js';
import { runMcpStub } from './commands/mcp.js';
import { runSync } from './commands/sync.js';
import { VERSION } from './index.js';

const cli = cac('frame-relay');

// Command: init
cli
  .command('init', 'Initialize Frame-Relay in the current project')
  .option('--cwd <dir>', 'Current working directory')
  .option('--yes', 'Skip prompts and accept defaults')
  .option('--dry-run', 'Show what would be written without writing to disk')
  .option('--verbose', 'Show detailed output')
  .action(async (options) => {
    try {
      await runInit(options);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// Command: sync
cli
  .command('sync', 'Sync a design kit into React components, Tailwind tokens, and agent rules')
  .option('--from <zip>', 'Path to exported design kit zip file')
  .option('--kit <dir>', 'Path to kit directory containing frame-relay.json')
  .option('--force', 'Overwrite edited files and ignore schema validation errors')
  .option('--cwd <dir>', 'Current working directory')
  .option('--yes', 'Skip prompts and accept defaults')
  .option('--dry-run', 'Show what would change without modifying files')
  .option('--verbose', 'Show detailed output')
  .option('--mcp', 'Exercise MCP config generation (hidden test flag)')
  .action(async (options) => {
    try {
      await runSync(options);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// Command: check
cli
  .command('check [...paths]', 'Check project files for design system rule compliance')
  .option('--json', 'Output violations in JSON format')
  .option('--cwd <dir>', 'Current working directory')
  .option('--verbose', 'Show detailed output')
  .action(async (paths: string[] = [], options) => {
    try {
      await runCheck(paths, options);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// Command: mcp (stub)
cli.command('mcp', 'Run the local MCP server').action(() => {
  runMcpStub();
});

cli.help();
cli.version(VERSION);

cli.parse();
