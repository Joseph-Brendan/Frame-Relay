# Live Mode

Live mode connects the Figma plugin directly to the Frame-Relay MCP server over a local WebSocket,
so an agent can look at the layer you currently have selected. It is for **"match this"** moments:
you select a layer in Figma, ask the agent to match it, and the agent gets the live spec, a PNG
preview and a diff against the last exported kit.

The exported kit stays the source of truth. Live mode never replaces `get_component`,
`get_screenshot` or `sync`; it just fills the gap between exports. Everything runs on your machine,
on `127.0.0.1`, and nothing is uploaded anywhere.

---

## Pairing with the Agent

1. Ask the agent for live mode, or mention your Figma selection. The agent calls the `start_live`
   MCP tool.
2. The server opens a WebSocket on the first free port among `47321`, `47322` and `47323`, and
   returns a **6-digit pairing code** plus the exact steps to show you.
3. In Figma, open the Frame-Relay plugin and switch to the **Live** tab. Type the code and click
   **Connect**.
4. The plugin tries each port in order until a server accepts the code. On success the server
   returns a session token that the plugin stores in `figma.clientStorage`, so reopening the plugin
   later reconnects without a new code.
5. Select a single layer in Figma. The plugin converts it and sends it automatically. Ask the agent
   to `get_live_selection`, or let the agent call it when it sees your request.

The pairing code is valid for 10 minutes. After three wrong attempts the server rotates the code;
call `start_live` (or `get_live_status`) again to get the current one. A session token is valid for
12 hours or until `stop_live`.

---

## The Live Tab

- **Pairing code input + Connect**: type six digits and connect.
- **Status pill**: `Disconnected`, `Connecting on port <n>...`, `Connected to <project>`, or the
  server's error message.
- **Selection preview**: after you select a layer, the tab shows the last selection's name, kind
  and a PNG thumbnail.
- **Disconnect**: sends `bye`, clears the stored token and stops sharing selections.
- **Privacy note**: "Live mode only talks to Frame-Relay on this computer. Nothing leaves your
  machine."

What gets shared depends on what you select:

| Figma selection                    | What is sent                                        |
| :--------------------------------- | :-------------------------------------------------- |
| A component or component set       | The component spec (variants, states, tokens) + PNG |
| A variant inside a component set   | The whole set, with the variant remembered          |
| An instance                        | Its main component or set + PNG                     |
| Anything else (frame, group, text) | A frame summary + PNG                               |
| Nothing, or several layers         | Nothing; the tab asks you to select one layer       |

Selections are debounced by 300 ms while connected. A new pairing replaces any previous plugin
connection.

---

## The Live MCP Tools

| Tool                 | What it does                                                                                                                     |
| :------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| `start_live`         | Starts the bridge (or returns its state), and returns the pairing code and the steps to show you.                                |
| `stop_live`          | Stops the bridge and clears the session. The pairing code stops working.                                                         |
| `get_live_status`    | Reports running state, port, whether a plugin is paired, the connected file, and the last selection's name and age.              |
| `get_live_selection` | Returns the current selection: meta, spec or frame summary, PNG as image content, warnings, and a diff against the exported kit. |

When the selected component also exists in the exported kit, `get_live_selection` lists every
difference in plain English and ends with:

> Figma has changed since the last export. Re-export the kit and run sync.

`get_live_selection` also takes an optional `fallbackName`. If live mode is not running or no layer
has been shared yet, the agent can pass a component name to get the spec from the last export
instead.

`get_kit_info` reports whether live mode is running, its port and whether a plugin is paired.

---

## Starting Live Mode with the Server

Live mode is opt-in per agent session:

```bash
# Start the MCP server and open the bridge immediately
frame-relay mcp --live
```

Or let the agent call `start_live` on demand while the server is already running. Some clients,
like OpenCode, start the server for you; the agent can call `start_live` at any time.

Check the pairing state from a terminal:

```bash
frame-relay live
```

When nothing is running it prints:
`Live mode is not running. Ask your agent to start it, or run the MCP server with --live.`

Running state is stored in `.frame-relay/live.json` (port, code, expiry, paired flag, start time).
`frame-relay sync` adds `.frame-relay/live.json` to `.gitignore`; the file is deleted when the
bridge stops.

---

## Security Model

- The WebSocket binds to `127.0.0.1` only; it is unreachable from other machines.
- The server accepts only WebSocket connections with **no `Origin` header or `Origin: "null"`**, the
  two cases a Figma plugin iframe produces. Any other Origin is rejected with HTTP 401.
- Every plugin must pair with the 6-digit code shown in the tool result before it can send anything.
- Pairing codes expire after 10 minutes and rotate after three wrong attempts.
- Session tokens are random, held in memory only, valid for 12 hours, and cleared by `stop_live`,
  `bye`, or a new pairing.
- Selections and PNG previews are kept in memory only. They are never written to disk; only the
  pairing state goes into `.frame-relay/live.json`.
- Logs go to stderr; stdout stays reserved for MCP JSON-RPC.

---

## Troubleshooting

### "All live ports are in use"

Another process (often an older `frame-relay mcp --live` or another editor's agent session) holds
ports 47321-47323. Close it, then call `start_live` again. `frame-relay doctor` prints which ports
are free.

### Firewall prompts

The bridge only listens on `127.0.0.1`, so macOS and Windows usually do not prompt. If a prompt
appears, allow local connections; the plugin still only talks to your own machine.

### The plugin does not connect

- Check the status pill: `Connecting` means it is trying ports; an error shows the server message.
- Make sure the server is running (`frame-relay live` or ask the agent for `get_live_status`).
- Check the code has not expired; ask the agent for a fresh one.
- If you typed the code wrong three times, the server rotated it. Ask the agent for the new code.

### The code says it expired

Codes last 10 minutes. Ask the agent to call `start_live` or `get_live_status`; both return the
current code, and the plugin can be reconnected with it.

### The agent does not call the tools

Frame-Relay adds live instructions to `AGENTS.md` and `.agents/rules/frame-relay.md` during
`frame-relay sync`. Re-run `sync` if those files are missing the line:
"If the user mentions their Figma selection or says 'match this', call `get_live_selection`. If
live mode isn't running, call `start_live` and show the user the code."

### Reconnecting after a drop

The plugin reconnects automatically with backoff (1s, 2s, 4s, 8s, then every 30s) using the stored
session token. If the server was stopped, the token is dead; connect again with a fresh code. If the
token expired or was replaced, the tab shows the error and you can pair again.

### "Figma has changed since the last export"

That is the diff working: the live component no longer matches the exported kit. Re-export the kit
from the plugin, run `frame-relay sync`, and the diff disappears.

### Messages larger than the limit

Previews larger than 4 MB are re-exported at a smaller scale. If a selection is still too large,
select a smaller layer (for example a child frame instead of a whole page).

---

## Testing with MCP Inspector

From the repository root, start the built CLI with the bridge and inspect it in the browser:

```bash
npx @modelcontextprotocol/inspector node "$PWD/packages/cli/dist/cli.js" mcp --root "$PWD/examples/demo-app" --live
```

Then call `start_live` (or read its result), copy the pairing code into the plugin's Live tab, and
call `get_live_selection`.
