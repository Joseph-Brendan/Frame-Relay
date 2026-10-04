import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { VERSION } from '../index.js';
import { KitCache } from './cache.js';
import { logger } from './logger.js';
import { registerMcpResources } from './resources.js';
import { resolveProjectRoot } from './root.js';
import { registerMcpTools } from './tools.js';

export interface CreateMcpServerOptions {
  root?: string;
  watch?: boolean;
}

export interface McpServerInstance {
  server: McpServer;
  cache: KitCache;
  transport: StdioServerTransport;
  close: () => Promise<void>;
}

export async function createMcpServer(
  options: CreateMcpServerOptions = {},
): Promise<McpServerInstance> {
  const { root } = resolveProjectRoot(options.root);
  const cache = new KitCache(root);
  cache.init(options.watch !== false);

  const server = new McpServer({
    name: 'frame-relay',
    version: VERSION,
  });

  registerMcpTools(server, cache);
  registerMcpResources(server, cache);

  const activeKit = cache.getActiveKit();
  if (activeKit) {
    logger.log(
      `Project root: ${root}, Kit: "${activeKit.manifest.name}", Components: ${activeKit.components.size}`,
    );
  } else {
    logger.log(`Project root: ${root}, No Frame-Relay kit found.`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const close = async () => {
    await cache.close();
    await server.close();
  };

  return {
    server,
    cache,
    transport,
    close,
  };
}

export async function runMcpServer(options: { root?: string } = {}): Promise<void> {
  try {
    const instance = await createMcpServer({ root: options.root, watch: true });

    const handleExit = async () => {
      try {
        await instance.close();
      } catch {
        // ignore shutdown error
      }
      process.exit(0);
    };

    process.on('SIGINT', handleExit);
    process.on('SIGTERM', handleExit);
  } catch (err) {
    logger.error(`Failed to start MCP server: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
