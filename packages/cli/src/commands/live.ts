import { resolveProjectRoot } from '../mcp/root.js';
import { readLiveJson } from '../live/state.js';
import { resolveCommandCwd } from '../cwd.js';

export interface LiveCommandOptions {
  cwd?: string;
}

function formatExpiry(codeExpiresAt: string): string {
  const at = Date.parse(codeExpiresAt);
  if (Number.isNaN(at)) return '';
  const remaining = at - Date.now();
  if (remaining <= 0) return ' (expired, call start_live for a new code)';
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return ` (expires in ${minutes}m ${seconds}s)`;
}

/** Prints the state stored in .frame-relay/live.json, or how to start live mode. */
export async function runLiveCommand(options: LiveCommandOptions = {}): Promise<void> {
  const root = options.cwd ? resolveCommandCwd(options.cwd) : resolveProjectRoot().root;
  const state = readLiveJson(root);

  if (!state) {
    console.log(
      'Live mode is not running. Ask your agent to start it, or run the MCP server with --live.',
    );
    return;
  }

  console.log('Frame-Relay live mode');
  console.log(`  Status:    running`);
  console.log(`  Port:      ${state.port}`);
  console.log(`  Paired:    ${state.paired ? 'yes' : 'no'}`);
  if (!state.paired) {
    console.log(`  Code:      ${state.code}${formatExpiry(state.codeExpiresAt)}`);
  }
  console.log(`  Started:   ${state.startedAt}`);
}
