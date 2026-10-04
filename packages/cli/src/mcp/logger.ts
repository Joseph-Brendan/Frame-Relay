/**
 * Logger module for Frame-Relay MCP server.
 * All logs MUST go to process.stderr. stdout is reserved exclusively for JSON-RPC MCP messages.
 */

export function log(message: string): void {
  process.stderr.write(`[frame-relay] ${message}\n`);
}

export function info(message: string): void {
  process.stderr.write(`[frame-relay] ${message}\n`);
}

export function warn(message: string): void {
  process.stderr.write(`[frame-relay] [WARN] ${message}\n`);
}

export function error(message: string): void {
  process.stderr.write(`[frame-relay] [ERROR] ${message}\n`);
}

export const logger = {
  log,
  info,
  warn,
  error,
};
