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

- [x] Main thread `selectionchange`, debounced 300ms, only while connected
- [x] Selection resolver: component set/component, variant in a set, instance via `getMainComponentAsync`, anything else as a frame
- [x] PNG export scale 2, retry at 1 then 0.5 when over 4 MB
- [x] Empty selection message when nothing or several layers are selected
- [x] UI Live tab: 6-digit input, Connect, status pill (Disconnected, Connecting, Connected to `<project>`, Error)
- [x] Port trying with hello + pair, short timeout, move on after connection failure/BAD_CODE, stop at `TOO_MANY_ATTEMPTS`
- [x] Token per port via main thread `clientStorage`, resume first on reopen or after a drop
- [x] Reconnect backoff 1, 2, 4, 8, then every 30 seconds
- [x] Run `convertComponent` or `summarizeFrame` in the UI, then send the selection
- [x] Last selection name + thumbnail, Disconnect (sends `bye`, clears token)
- [x] Privacy note shown in the tab
- [x] Manifest `networkAccess` unchanged (or report to owner if it must change)
- [x] Plugin tests: selection resolver with fake nodes, port trying and reconnect with a mocked WebSocket

## Stage 4: end-to-end tests, docs and PR

- [x] End-to-end MCP test: spawn built CLI, `start_live`, fake plugin sends Button selection, `get_live_selection` checks spec, image and diff
- [x] All eight bridge scenarios covered (right/wrong/3 wrong/expired code, valid/invalid resume, origin, oversized, heartbeat, busy ports)
- [x] All existing tests pass; export mode still works
- [x] `docs/live-mode.md` (what/when, pairing, Live tab, tools, security model, troubleshooting)
- [x] Update `docs/mcp.md`, `docs/plugin.md`, `docs/cli.md`, README (incl. OpenCode setup)
- [x] Open PR from `phase-7-live`, keep commits (never squash stacked PRs)

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
- Stage 2 imports the protocol from `@frame-relay/schema/live` through the package root export
  (`@frame-relay/schema`). Keep `LIVE_PORTS` and `MAX_MESSAGE_BYTES` as the only source of those
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
  `["npx", "-y", "@frame-relay/cli", "mcp"]` unless the package is a local dependency.
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

### Stage 3 (2026-10-09)

- `manifest.json` did **not** change. `networkAccess.allowedDomains` already lists
  `ws://localhost:47321-47323` with a reasoning string, and `documentAccess` is already
  `dynamic-page`. The UI connects to `ws://localhost:<port>` (not `ws://127.0.0.1`) so the
  allowlist matches; the bridge itself still binds `127.0.0.1` only.
- Main thread never touches the network: `dist/code.js` has zero `WebSocket` references and the
  bundle stays an IIFE with no imports/exports, top-level await or Node globals. Only
  `src/ui/live/client.ts` creates the socket.
- The main thread sends a `LIVE_SELECTION` event carrying the snapshot **plus** variables, styles
  and a PNG preview. The UI then runs `convertVariables` + `convertComponent`/`summarizeFrame`, so
  no conversion or token-mapping logic is duplicated in the plugin bridge.
- Resolution rules live in `src/main/live-resolve.ts` (pure, fake-node testable): variant -> set
  (variant properties remembered), instance -> main component/set via `getMainComponentAsync`
  (frame fallback when null or throwing), everything else -> frame. Multiple/zero layers -> a
  `LIVE_SELECTION` event with `selection: null`; the UI shows "Select one layer to share it live".
- `snapshotNode` now records `mainComponentName` on INSTANCE nodes, closing the Stage 1 follow-up,
  so frame summaries list the components used.
- PNG ladder: main exports at scale 2 and retries at 1 then 0.5 when a render is over 4 MiB. The
  result is sent as `number[]`; the UI base64-encodes it. Worst case stays under the 6 MiB
  `MAX_MESSAGE_BYTES` server cap.
- Token storage is one `figma.clientStorage` record (`frame-relay-live-tokens`) keyed by port. The
  UI persists/clears through the main thread; Disconnect clears only the connected port's token.
- `LiveClient` connect only advances to the next port for connection failures and `BAD_CODE`.
  `TOO_MANY_ATTEMPTS` and other server errors (`CODE_EXPIRED`, `VERSION_MISMATCH`, ...) stop
  immediately and show the server's plain-English message. Reconnect after a drop only attempts
  `resume` with saved tokens (no automatic re-pairing) with backoff 1s, 2s, 4s, 8s, then 30s.
- The Live tab dropped its "Phase 7" placeholder badge; the old placeholder copy is gone.
- Tests: 9 resolver tests with fake nodes, 13 client tests with a mocked `WebSocket` (including the
  exact backoff sequence), 2 snapshot tests for `mainComponentName`, and the live UI/main messages
  added to the typed message round-trip test.

### Stage 4 (2026-10-09)

- The end-to-end test (`packages/cli/test/mcp-live.test.ts`) now imports the real plugin resolver
  (`packages/plugin/src/main/live-resolve.ts`) and builds every wire selection through
  `convertComponent`/`summarizeFrame`, so it follows the plugin's actual resolution path: component
  set, variant (resolves to the set), instance (resolves to the standalone main component), plain
  frame, then a mock network drop + `resume`, then `bye` (which correctly invalidates the token and
  answers `BAD_TOKEN`). The server is started with `start_live` on demand; `mcp --live` startup
  stays covered by the stdout-purity test.
- Empty selection: the wire protocol intentionally has no empty `selection` message, so the test
  simulates the real plugin (sends nothing, UI shows the hint) and asserts the server keeps the last
  selection unchanged. See the Stage 3 decision.
- First CI run failed on a flaky assertion in `live-bridge.test.ts`: `live.json` timestamps can
  contain the substring `1:2`, so the test now asserts the exact live.json key shape
  (`code`, `codeExpiresAt`, `paired`, `port`, `startedAt`) instead of a substring search. Verified
  with five repeat runs. CI is green on the second run (all four jobs).
- PR #7 is based on `main` as requested, but the branch is still stacked on `fix/pre-phase-7`
  (PR #6); the PR body tells the owner to merge #6 first or merge in order. No commits were
  squashed.
- `examples/demo-app` sync kept the committed `frame-relay-tokens.css` (only formatting differed),
  restored `.frame-relay/lock.json`, and committed the meaningful updates: live rule in `AGENTS.md`
  and `.agents/rules/frame-relay.md`, new `opencode.json`, new `.gitignore` with
  `.frame-relay/live.json`, and `agents.opencode: true` in the config.
  - Follow-up (not fixed): the demo-app's generated files are Prettier-formatted in git, but
    `sync` emits unformatted CSS/Markdown, so re-running `sync` will keep reporting a tokens
    conflict and reformatting `.frame-relay/components.md`. Fix by making the generators
    Prettier-stable or by hashing the formatted output; out of scope for Phase 7.
- Changeset `.changeset/live-mode.md` bumps `@frame-relay/cli`, `@frame-relay/schema`,
  `@frame-relay/converter` and `@frame-relay/plugin` (minor each), matching the repo convention
  of including private workspace packages.
- Verification: `/verify` full pipeline plus schema diff and plugin bundle checks are green;
  `pnpm test` is 227 tests across 28 files.
