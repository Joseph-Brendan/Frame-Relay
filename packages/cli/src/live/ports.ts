import { createServer } from 'node:net';
import { LIVE_PORTS } from '@josephbrendan/schema';

export interface LivePortState {
  port: number;
  free: boolean;
}

export function checkPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.listen({ host: '127.0.0.1', port }, () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * Checks whether each live port can be bound on 127.0.0.1. Used by `frame-relay doctor`.
 */
export async function checkLivePorts(
  ports: readonly number[] = LIVE_PORTS,
): Promise<LivePortState[]> {
  const states: LivePortState[] = [];
  for (const port of ports) {
    states.push({ port, free: await checkPortFree(port) });
  }
  return states;
}
