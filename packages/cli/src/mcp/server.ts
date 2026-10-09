import { basename } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { VERSION } from '../index.js';
import { LiveBridge } from '../live/bridge.js';
import { KitCache } from './cache.js';
import { logger } from './logger.js';
import { registerMcpResources } from './resources.js';
import { resolveProjectRoot } from './root.js';
import { registerMcpTools } from './tools.js';

export interface CreateMcpServerOptions {
  root?: string;
  watch?: boolean;
  live?: boolean;
}

export interface McpServerInstance {
  server: McpServer;
  cache: KitCache;
  live: LiveBridge;
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

  const activeKit = cache.getActiveKit();
  const live = new LiveBridge({
    root,
    projectName: activeKit?.manifest.name ?? basename(root),
    serverVersion: VERSION,
  });

  registerMcpTools(server, cache, live);
  registerMcpResources(server, cache);

  if (activeKit) {
    logger.log(
      `Project root: ${root}, Kit: "${activeKit.manifest.name}", Components: ${activeKit.components.size}`,
    );
  } else {
    logger.log(`Project root: ${root}, No Frame-Relay kit found.`);
  }

  if (options.live) {
    try {
      const status = await live.start();
      logger.log(`Live mode on: 127.0.0.1:${status.port}, pairing code ${status.code}.`);
    } catch (err) {
      logger.warn(
        `Live mode did not start: ${err instanceof Error ? err.message : String(err)}. The MCP server keeps running; call start_live to retry.`,
      );
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const close = async () => {
    await live.stop();
    await cache.close();
    await server.close();
  };

  return {
    server,
    cache,
    live,
    transport,
    close,
  };
}

export async function runMcpServer(options: { root?: string; live?: boolean } = {}): Promise<void> {
  try {
    const instance = await createMcpServer({ root: options.root, watch: true, live: options.live });

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
