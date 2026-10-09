# Phase 7 progress: live mode

Working log for Phase 7. Read `phase-7-plan.md` first. Keep one log per phase: append entries and
tick items as they land instead of rewriting history.

## Stage 1: protocol and converter

- [ ] `packages/schema/src/live.ts`: zod schemas for all 12 messages (6 plugin-to-server, 5 server-to-plugin, selection component/frame variants), `LIVE_PORTS`, `MAX_MESSAGE_BYTES`, `LIVE_ERROR_CODES`
- [ ] Protocol tests: every message round-trips, bad messages rejected (missing/wrong `v`, unknown type, bad error code, mismatched selection kind)
- [ ] `summarizeFrame` in `packages/converter` returning `FrameSummary` (name, layout, size, childCount, componentInstances, tokenReferences, rawValues)
- [ ] summarizeFrame tests: hand-made frame fixture and the four real dump fixtures
- [ ] Full pipeline green: install, format:check, lint, typecheck, build, test
- [ ] Committed and pushed

## Stage 2: server bridge, MCP tools, CLI and agent config

- [ ] `packages/cli/src/live/` bridge: `ws` package, bind 127.0.0.1, try `LIVE_PORTS` in order, clear error when all busy
- [ ] Origin check: missing or `"null"` only, reject others
- [ ] Pairing code: 6 digits from `node:crypto`, 10 minute expiry, rotate after 3 wrong attempts
- [ ] Session tokens: random, in memory, 12 hour TTL or until `stop_live`
- [ ] One paired plugin at a time; a new pairing replaces the old one and logs it
- [ ] Heartbeat: ping every 10s, drop after 30s of silence
- [ ] Reject over `MAX_MESSAGE_BYTES` with `MESSAGE_TOO_LARGE`
- [ ] Latest selection in memory only, never on disk
- [ ] `.frame-relay/live.json` lifecycle (`port`, `code`, `codeExpiresAt`, `paired`, `startedAt`), update on state change, delete on stop/exit; `sync` adds it to `.gitignore`
- [ ] Clean shutdown closes the WebSocket and deletes `live.json`
- [ ] MCP `start_live` (start or report state, code + steps), `stop_live`, `get_live_status`
- [ ] `get_live_selection` with `fallbackName` and every unavailable path
- [ ] `diffComponentSpecs(liveSpec, kitSpec)` in `packages/cli/src/live/diff.ts` with tests (identical, changed radius, new variant, removed state)
- [ ] `get_kit_info` reports live status
- [ ] `frame-relay mcp --live` starts the bridge at startup
- [ ] `frame-relay live` command and doctor live-port check
- [ ] Agent config: AGENTS.md block (< 40 lines) and `.agents/rules/frame-relay.md` live instructions
- [ ] OpenCode: merge `opencode.json` MCP entry, `opencode: true` agent setting, `mcp --print-config` snippet
- [ ] Tests: bridge with a ws client, MCP end-to-end, `live.json` lifecycle, stdout purity with live running, opencode.json merge

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
