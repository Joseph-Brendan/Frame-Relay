# Phase 7 progress: live mode

Working log for Phase 7. Read `phase-7-plan.md` first. Keep one log per phase: append entries and
tick items as they land instead of rewriting history.

## Stage 1: protocol and converter

- [x] `packages/schema/src/live.ts`: zod schemas for all 12 messages (6 plugin-to-server, 5 server-to-plugin, selection component/frame variants), `LIVE_PORTS`, `MAX_MESSAGE_BYTES`, `LIVE_ERROR_CODES`
- [x] Protocol tests: every message round-trips, bad messages rejected (missing/wrong `v`, unknown type, bad error code, mismatched selection kind)
- [x] `summarizeFrame` in `packages/converter` returning `FrameSummary` (name, layout, size, childCount, componentInstances, tokenReferences, rawValues)
- [x] summarizeFrame tests: hand-made frame fixture and the four real dump fixtures
- [x] Full pipeline green: install, format:check, lint, typecheck, build, test
- [x] Committed and pushed

## Stage 2: server bridge, MCP tools, CLI and agent config

- [x] `packages/cli/src/live/` bridge: `ws` package, bind 127.0.0.1, try `LIVE_PORTS` in order, clear error when all busy
- [x] Origin check: missing or `"null"` only, reject others
- [x] Pairing code: 6 digits from `node:crypto`, 10 minute expiry, rotate after 3 wrong attempts
- [x] Session tokens: random, in memory, 12 hour TTL or until `stop_live`
- [x] One paired plugin at a time; a new pairing replaces the old one and logs it
- [x] Heartbeat: ping every 10s, drop after 30s of silence
- [x] Reject over `MAX_MESSAGE_BYTES` with `MESSAGE_TOO_LARGE`
- [x] Latest selection in memory only, never on disk
- [x] `.frame-relay/live.json` lifecycle (`port`, `code`, `codeExpiresAt`, `paired`, `startedAt`), update on state change, delete on stop/exit; `sync` adds it to `.gitignore`
- [x] Clean shutdown closes the WebSocket and deletes `live.json`
- [x] MCP `start_live` (start or report state, code + steps), `stop_live`, `get_live_status`
- [x] `get_live_selection` with `fallbackName` and every unavailable path
- [x] `diffComponentSpecs(liveSpec, kitSpec)` in `packages/cli/src/live/diff.ts` with tests (identical, changed radius, new variant, removed state)
- [x] `get_kit_info` reports live status
- [x] `frame-relay mcp --live` starts the bridge at startup
- [x] `frame-relay live` command and doctor live-port check
- [x] Agent config: AGENTS.md block (< 40 lines) and `.agents/rules/frame-relay.md` live instructions
- [x] OpenCode: merge `opencode.json` MCP entry, `opencode: true` agent setting, `mcp --print-config` snippet
- [x] Tests: bridge with a ws client, MCP end-to-end, `live.json` lifecycle, stdout purity with live running, opencode.json merge

## Stage 3: plugin Live tab

- [ ] Main thread `selectionchange`, debounced 300ms, only while connected
- [ ] Selection resolver: component set/component, variant in a set, instance via `getMainComponentAsync`, anything else as a frame
- [ ] PNG export scale 2, retry at 1 then 0.5 when over 4 MB
- [ ] Empty selection message when nothing or several layers are selected
- [ ] UI Live tab: 6-digit input, Connect, status pill (Disconnected, Connecting, Connected to `<project>`, Error)
- [ ] Port trying with hello + pair, short timeout, move on after connection failure/BAD_CODE, stop at `TOO_MANY_ATTEMPTS`
- [ ] Token per port via main thread `clientStorage`, resume first on reopen or after a drop
- [ ] Reconnect backoff 1, 2, 4, 8, then every 30 seconds
- [ ] Run `convertComponent` or `summarizeFrame` in the UI, then send the selection
- [ ] Last selection name + thumbnail, Disconnect (sends `bye`, clears token)
- [ ] Privacy note shown in the tab
- [ ] Manifest `networkAccess` unchanged (or report to owner if it must change)
- [ ] Plugin tests: selection resolver with fake nodes, port trying and reconnect with a mocked WebSocket

## Stage 4: end-to-end tests, docs and PR

- [ ] End-to-end MCP test: spawn built CLI, `start_live`, fake plugin sends Button selection, `get_live_selection` checks spec, image and diff
- [ ] All eight bridge scenarios covered (right/wrong/3 wrong/expired code, valid/invalid resume, origin, oversized, heartbeat, busy ports)
- [ ] All existing tests pass; export mode still works
- [ ] `docs/live-mode.md` (what/when, pairing, Live tab, tools, security model, troubleshooting)
- [ ] Update `docs/mcp.md`, `docs/plugin.md`, `docs/cli.md`, README (incl. OpenCode setup)
- [ ] Open PR from `phase-7-live`, keep commits (never squash stacked PRs)

## Decisions and notes

Append new entries at the end; do not rewrite earlier ones.

### Stage 1 (2026-10-09)

- Branch base: `phase-7-live` stacks on `fix/pre-phase-7` (`a35fc07`), not `main`, because the
  agent-session setup (AGENTS.md, /verify, docs/dev) and the pre-Phase-7 audit fixes only exist
  there (PR #6 is open). Confirmed with the owner before branching.
- The selection message is a discriminated union on `kind` nested inside the plugin-to-server
  union, so `spec` is type-checked against `kind`: `ComponentSpecSchema` for `kind: "component"`,
  `FrameSummarySchema` for `kind: "frame"`.
- `pair.code` accepts any string at the schema level. Format enforcement stays in the bridge so a
  mistyped code can answer `BAD_CODE` instead of `BAD_MESSAGE`.
- `FrameSummary` lives in `packages/schema/src/live.ts` (not the converter) because the plugin, the
  server and the converter all need the type, and the converter already depends on the schema.
- `summarizeFrame(node, variables = {}, styles = {})` reuses `extractLayout` and
  `extractStyleBlock`, so live summaries use the same normalization and token mapping as exported
  specs. No parser or mapping logic was duplicated.
- `componentInstances` de-duplicates INSTANCE nodes by `mainComponentName` and sorts; token
  references and raw values are also de-duplicated and sorted. Layout is always returned, matching
  `convertComponent`.
- Added optional `mainComponentName` to `NodeSnapshot`. Stage 3 must populate it in the plugin's
  `snapshotNode` for INSTANCE nodes, otherwise instance names cannot appear in frame summaries.
- `MAX_MESSAGE_BYTES` is `6 * 1024 * 1024` bytes (6 MiB).
- `summarizeFrame` returns exactly the seven spec fields and no warnings. Stage 3 currently has no
  frame warnings to put in `selection.warnings`; if the Live tab needs them, add a separate warning
  pass there rather than changing the `FrameSummary` shape.
- Stage 2 imports the protocol from `@josephbrendan/schema/live` through the package root export
  (`@josephbrendan/schema`). Keep `LIVE_PORTS` and `MAX_MESSAGE_BYTES` as the only source of those
  values; do not redefine them in the bridge.

### Stage 2 (2026-10-09)

- `ws` is a runtime dependency of the CLI. The bridge binds `127.0.0.1` only and tries `LIVE_PORTS`
  in order; `LiveBridge` also accepts a `ports` option so tests use ephemeral ports and never fight
  over 47321-47323.
- Oversized handling: ws `maxPayload` is `MAX_MESSAGE_BYTES * 2` so frames between 6 MiB and 12 MiB
  get a clean `MESSAGE_TOO_LARGE` error. Larger frames are closed by ws before the bridge sees them
  (deliberate defence; no plain-English error is possible there).
- Pairing codes are compared with `timingSafeEqual`. An expired code is rotated lazily whenever
  `getStatus()` is read, so `start_live`/`get_live_status` always return a code that still works.
  Three wrong attempts rotate the code and answer `TOO_MANY_ATTEMPTS`.
- `paired` in `live.json` and `get_live_status` means "an unexpired session token exists". It
  survives reconnects and heartbeat drops (the plugin resumes with its token) and is cleared by
  `bye`, a new pairing replacing the old session, or `stop_live`.
- Session tokens are 32 random bytes (hex), in memory only, 12 hours. One session at a time: a new
  pairing issues a new token and closes the previous paired socket with code 1000.
- `LiveBridge.stop()` only deletes `live.json` when this instance actually owned a running bridge.
  `doctor` and a plain `mcp` server create a bridge but never start it, so they can never delete
  another process's live state.
- `ensureLiveJsonIgnored()` runs in `sync` (not `init`) and appends `.frame-relay/live.json` to
  `.gitignore` once, preserving existing content.
- OpenCode config is merged separately from the `mcpServers` files: `opencode.json` keeps every
  other key and every other `mcp` server, adds `$schema` only when absent, and uses
  `["npx", "-y", "@josephbrendan/frame-relay", "mcp"]` unless the package is a local dependency.
  `agents.opencode` exists in the config but writes no rules file because OpenCode reads `AGENTS.md`.
- `get_live_selection` precedence: live selection first; otherwise `fallbackName` returns the
  exported spec; otherwise running+unpaired returns the code and steps, running+paired+empty asks for
  a layer selection, and stopped asks the agent to call `start_live`.
- `diffComponentSpecs` compares description, layout fields, base/variant/state style blocks,
  variants and states by key, and prop type/options/default. It ignores `$schema`, `source`,
  anatomy, usage and screenshots so formatting-only export metadata never shows up as a change.

### Protocol behavior for Stage 3 (exact)

- Plugin sends `hello` on connect; the server replies `welcome { serverVersion, projectName }`.
  `projectName` is the exported kit name, or the project folder name when no kit exists.
- Plugin sends `pair { code }`; success yields `paired { sessionToken }`. `BAD_CODE` carries the
  attempts left. The third wrong code yields `TOO_MANY_ATTEMPTS` and the server rotates the code;
  the plugin must stop trying other ports at that point, per spec.
- A code older than 10 minutes yields `CODE_EXPIRED` and the message contains the freshly generated
  code. The plugin should surface the server's message; the agent can also call `get_live_status`
  for the current code.
- Plugin sends `resume { sessionToken }` on reopen or after a drop; success yields `resumed`.
  `BAD_TOKEN` means the saved token is dead (12h expiry, `bye`, or replaced by a new pairing) and
  the plugin must clear it and ask for a new code via the agent.
- The server sends JSON `ping` messages every 10s. The plugin must reply `pong`; any message resets
  the 30s silence window. The server terminates a silent socket, so the plugin will need its
  reconnect backoff.
- Selections are only accepted on a paired connection; anything else answers `BAD_TOKEN`. The
  plugin must not send `selection` before pairing succeeds.
- `bye` clears the session server-side; the plugin must also clear its stored token so the next
  connect is a fresh `pair`, not a `resume`.
- `MESSAGE_TOO_LARGE` is a normal `error` message; the plugin can downscale and resend (spec's 4 MB
  retry ladder at scales 2, 1, 0.5).
- Only the UI iframe opens the socket, and the Origin header must be missing or `"null"`. A real
  page Origin is rejected with HTTP 401, so do not add an Origin header manually.
- Errors are always `{ v: 1, type: "error", code, message }` with plain-English `message`; display
  the message and use `code` for control flow.
