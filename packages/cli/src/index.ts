export const VERSION = '0.0.0';

export function getVersion(): string {
  return VERSION;
}

export * from './config.js';
export * from './kit/discovery.js';
export * from './kit/lock.js';
export * from './tokens/generate.js';
export * from './codegen/index.js';
export * from './codegen/mapping.js';
export * from './codegen/templates.js';
export * from './codegen/cva.js';
export * from './agents/components-md.js';
export * from './agents/rules.js';
export * from './mcp/config.js';
export * from './check/index.js';
export * from './commands/init.js';
export * from './commands/sync.js';
export * from './commands/check.js';
export * from './commands/mcp.js';
export * from './commands/doctor.js';
export * from './mcp/server.js';
export * from './mcp/cache.js';
export * from './mcp/root.js';
export * from './mcp/tools.js';
export * from './mcp/resources.js';
