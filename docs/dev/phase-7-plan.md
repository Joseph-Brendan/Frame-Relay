# Phase 7 plan: live mode

This plan is the working contract for Phase 7. Every later session reads this file and
`phase-7-progress.md` before starting. The spec below is copied verbatim from the phase brief.

## Phase 7 spec

GOAL
The user selects a layer in Figma. The plugin converts it and sends it over a local WebSocket to the Frame-Relay MCP server, which the agent queries. The exported kit stays the source of truth for building. Live mode is for "match this" moments.

PAIRING (the agent starts it on demand)

1. The agent calls start_live. The server opens a WebSocket on 127.0.0.1, on the first free port among 47321, 47322 and 47323.
2. The server creates a 6-digit pairing code. It returns the code in the tool result, so the agent shows it to the user, and writes it to .frame-relay/live.json.
3. The user types the code into the plugin's Live tab. The plugin tries each port until a server accepts the code.
4. The server returns a session token. The plugin stores it with figma.clientStorage, so reconnecting needs no new code.

GLOBAL RULES

- MCP stdout is protocol only. Logs go to stderr.
- Only the plugin UI iframe opens the WebSocket.
- Reuse the converter, validators, kit cache and logger. Never duplicate logic.
- Live mode never breaks export mode. If the bridge fails, existing tools still work.
- Messages are plain English and include the fix.

SECTION 1: PROTOCOL (packages/schema/src/live.ts, zod)

- Both the plugin and the server import from here.
- Every message has v: 1 and a type.
- Plugin to server:
  - hello { pluginVersion, fileName }
  - pair { code }
  - resume { sessionToken }
  - selection { meta { nodeId, name, nodeType, fileName, pageName }, kind ("component" or "frame"), spec (a component spec or a frame summary), image (base64 PNG or null), warnings }
  - pong
  - bye
- Server to plugin:
  - welcome { serverVersion, projectName }
  - paired { sessionToken }
  - resumed
  - ping
  - error { code, message }
- Error codes: BAD_CODE, CODE_EXPIRED, TOO_MANY_ATTEMPTS, BAD_TOKEN, VERSION_MISMATCH, MESSAGE_TOO_LARGE, BAD_MESSAGE.
- Export LIVE_PORTS = [47321, 47322, 47323] and MAX_MESSAGE_BYTES = 6 MB.
- Tests: every message round-trips, and bad messages are rejected.

SECTION 2: CONVERTER

- Add summarizeFrame(snapshot), a pure function for non-component selections.
- It returns: name, layout (using the existing layout mapping), size, child count, the component instances used (by main component name), the token references found and the raw values found.
- Tests: hand-made fixtures plus the real dump fixtures.

SECTION 3: SERVER BRIDGE (packages/cli/src/live/)

- Use the ws package and bind to 127.0.0.1. Try the ports in order. If all are busy, return a clear error.
- Origin check: accept only a missing or "null" Origin. Reject all others.
- Pairing code: 6 digits from node:crypto. It expires after 10 minutes if unused. After 3 wrong attempts, generate a new code.
- Session tokens: random, in memory, valid for 12 hours or until stop_live.
- One paired plugin at a time. A new pairing replaces the old one and logs it.
- Heartbeat: ping every 10 seconds, and drop after 30 seconds of silence.
- Reject messages over MAX_MESSAGE_BYTES with MESSAGE_TOO_LARGE.
- Keep only the latest selection, in memory. Never write it to disk.
- .frame-relay/live.json holds { port, code, codeExpiresAt, paired, startedAt }. Update it when the state changes, and delete it on stop or exit. Sync adds it to .gitignore.
- Clean shutdown closes the WebSocket and deletes live.json.

SECTION 4: MCP TOOLS (descriptions written for agents)

- start_live: starts the bridge, or returns its state if already running. Returns the code and the steps to show the user ("Open the Frame-Relay plugin in Figma, go to the Live tab, enter code ######, and click Connect"). Call it when the user wants live mode or mentions their Figma selection.
- stop_live: stops the bridge and clears sessions.
- get_live_status: running, port, paired, the code if unpaired, the connected file name, and the last selection's name and age.
- get_live_selection (replaces the stub), with an optional fallbackName:
  - With a selection: return the meta, the spec or summary, the image as MCP image content, and warnings.
  - For a component that's also in the exported kit: list every difference in plain English, and end with "Figma has changed since the last export. Re-export the kit and run sync."
  - Not running: tell the agent to call start_live.
  - Running but unpaired: return the code and the steps.
  - Paired with no selection: ask the user to select a layer.
  - Unavailable with fallbackName: return the exported spec and say where it came from.
- Add a pure diffComponentSpecs(liveSpec, kitSpec) in packages/cli/src/live/diff.ts.
- get_kit_info reports live status.
- `frame-relay mcp --live` starts the bridge at startup.

SECTION 5: CLI AND AGENT CONFIG

- `frame-relay live` prints live.json's state, or "Live mode is not running. Ask your agent to start it, or run the MCP server with --live."
- doctor reports whether the live ports are free.
- The AGENTS.md block and .agents/rules/frame-relay.md add: "If the user mentions their Figma selection or says 'match this', call get_live_selection. If live mode isn't running, call start_live and show the user the code." Keep the AGENTS.md block under 40 lines.
- OpenCode support: writeMcpConfigs also writes the project's opencode.json, merging into it and never removing other keys: { "$schema": "https://opencode.ai/config.json", "mcp": { "frame-relay": { "type": "local", "command": ["npx", "frame-relay", "mcp"], "enabled": true } } }. Use ["npx", "-y", "@frame-relay/cli", "mcp"] when the package isn't a devDependency. Add opencode: true to the config's agents settings. OpenCode reads AGENTS.md, so no extra rules file is needed.
- `mcp --print-config` adds an OpenCode snippet.

SECTION 6: PLUGIN
Main thread:

- Listen to selectionchange, debounced by 300ms, only while connected.
- One layer selected:
  - COMPONENT_SET or COMPONENT: snapshot it.
  - A variant in a set: snapshot the set and remember the variant.
  - INSTANCE: getMainComponentAsync, then snapshot its set or the component.
  - Anything else: snapshot it as a frame.
- Export a PNG at scale 2. If it's over 4 MB, retry at 1, then 0.5.
- Nothing or several layers selected: send an empty selection, and the UI shows "Select one layer to share it live".

UI:

- Live tab with a 6-digit input, Connect, and a status pill (Disconnected, Connecting, Connected to <project>, Error with the message).
- Connect: try each port with a short timeout, sending hello then pair. Move on after a connection failure or BAD_CODE. Stop at TOO_MANY_ATTEMPTS.
- Store the token per port through the main thread's clientStorage. Try resume first on reopen or after a drop.
- Reconnect with backoff (1, 2, 4, 8, then every 30 seconds).
- Run convertComponent or summarizeFrame in the UI, then send the selection.
- Show the last selection's name and a thumbnail, plus a Disconnect button that sends bye and clears the token.
- Show the note: "Live mode only talks to Frame-Relay on this computer. Nothing leaves your machine."
- Keep the manifest's networkAccess unchanged, unless it truly must change. If it does, report it, because the owner must re-import the manifest.

SECTION 7: TESTS

- Bridge, with a ws test client: right code, wrong code, 3 wrong codes, expired code, resume valid and invalid, non-null Origin rejected, oversized message, heartbeat drop, busy first port, all ports busy.
- MCP: spawn the built CLI with the SDK client, call start_live, connect a fake plugin, send a selection built from the Button fixture, then call get_live_selection and check the spec, image and diff. Cover every unavailable path.
- diffComponentSpecs: identical specs, changed radius, a new variant, a removed state.
- The live.json lifecycle.
- stdout purity with live mode running.
- The opencode.json merge keeps other keys and servers.
- Plugin: the selection resolver with fake nodes, and the port-trying and reconnect logic with a mocked WebSocket.
- All existing tests still pass, and export mode still works.

SECTION 8: DOCS

- docs/live-mode.md: what it is and when to use it, pairing with the agent, the Live tab, the tools, the security model, and troubleshooting (busy ports, firewall prompts, plugin not connecting, expired code, the agent not calling tools, reconnecting).
- Update docs/mcp.md, docs/plugin.md, docs/cli.md and the README, including OpenCode setup.

## Stages

- **Stage 1: protocol and converter.** `packages/schema/src/live.ts` (zod schemas, `LIVE_PORTS`,
  `MAX_MESSAGE_BYTES`, error codes) and `summarizeFrame` in `packages/converter`, each with tests.
- **Stage 2: server bridge, MCP tools, CLI and agent config.** Spec sections 3, 4 and 5.
- **Stage 3: plugin Live tab.** Spec section 6.
- **Stage 4: end-to-end tests, docs and PR.** Spec sections 7 and 8 plus the pull request.
