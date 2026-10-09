# AGENTS.md

Frame-Relay turns Figma components into an agent-ready design kit. This is a pnpm workspace
monorepo: TypeScript, ESM, Node >= 20. Package manager is pinned to `pnpm@10.6.1`.

## Packages

- `packages/schema` — kit format v1. Zod schemas, validators, constants. Runs `pnpm generate` to
  emit JSON Schema into `json-schema/v1`.
- `packages/converter` — pure, deterministic Figma snapshot to kit conversion. No I/O, no Figma API.
- `packages/plugin` — the Figma plugin. `src/main/` is the sandbox thread, `src/ui/` the iframe.
- `packages/cli` (`@frame-relay/cli`) — `init`, `sync`, `check`, `doctor` and the stdio
  MCP server (7 tools).
- `examples/sample-kit` — hand-written kit used as a test fixture. `examples/demo-app` — Vite +
  React + Tailwind v4 app used by CLI and MCP tests.

## Commands

```bash
pnpm install --frozen-lockfile   # install workspace deps
pnpm format:check                # prettier check
pnpm lint                        # eslint
pnpm typecheck                   # tsc --noEmit in every package
pnpm build                       # build all packages
pnpm test                        # vitest run (all packages)
pnpm generate                    # regenerate packages/schema/json-schema
pnpm format                      # prettier --write
```

Run a single test file with `pnpm vitest run <path>`. CI (`.github/workflows/ci.yml`) runs install,
format:check, lint, build, typecheck, test, schema diff, plus a CLI test matrix on Linux/macOS/Windows.

## Rules

- **Converter stays pure.** `packages/converter` must not import `node:fs`, `node:child_process`,
  network APIs, the `figma` global or `process`. It is synchronous, never throws and must produce
  byte-identical output for identical input.
- **Only the plugin's `src/main/` may touch `figma`.** `src/ui/` and `src/shared/` must not use the
  Figma plugin API. Main and UI communicate only through the typed message union in
  `packages/plugin/src/shared/messages.ts`.
- **MCP stdout is protocol only.** In `packages/cli/src/mcp/`, stdout carries JSON-RPC exclusively.
  Log through `packages/cli/src/mcp/logger.ts` (stderr). Never add `console.log` there.
- **Conventional Commits.** Match existing history, e.g. `feat(cli): ...`, `fix(plugin): ...`,
  `test(converter): ...`. Scope is the package.
- **Never squash stacked PRs.** Each phase branch keeps its own commits and history.
- Add a regression test for every bug fix and run `pnpm test` before pushing.

## Where docs live

- `docs/cli.md`, `docs/mcp.md`, `docs/kit-format.md`, `docs/converter.md`, `docs/plugin.md`,
  `docs/naming-contract.md` — user-facing documentation for merged phases.
- `docs/dev/` — phase plans and progress logs (see `docs/dev/README.md`).
- `README.md` — repository overview and quickstart.

Phase 7 (live mode) adds a localhost WebSocket bridge between the plugin UI and the MCP server on
ports 47321 to 47323. Never log to stdout in bridge code; keep ports configurable.
