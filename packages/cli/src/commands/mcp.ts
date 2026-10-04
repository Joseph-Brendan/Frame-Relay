import { printMcpConfig } from '../mcp/config.js';
import { runMcpServer } from '../mcp/server.js';

export interface McpCommandOptions {
  root?: string;
  printConfig?: boolean;
}

export async function runMcpCommand(options: McpCommandOptions = {}): Promise<void> {
  if (options.printConfig) {
    printMcpConfig(options.root);
    return;
  }

  await runMcpServer({ root: options.root });
}
