# Contributing to Frame-Relay

Thanks for helping. This page covers setup, the commands we run, and the rules that keep the
project healthy.

## Setup

Requirements: Node.js 20 or newer and pnpm 10. The repo pins pnpm in `package.json`, so Corepack
can install the right version:

```bash
corepack enable
pnpm install
pnpm build
pnpm test
```

The repo is a pnpm workspace with four packages:

| Package              | What it is                                              |
| :------------------- | :------------------------------------------------------ |
| `packages/schema`    | Kit format v1: schemas, validators and constants.       |
| `packages/converter` | Pure Figma snapshot to kit conversion.                  |
| `packages/plugin`    | The Figma plugin (main sandbox and UI iframe).          |
| `packages/cli`       | The `frame-relay` CLI, MCP server and live mode bridge. |

`examples/sample-kit` is a hand-written kit used in tests. `examples/demo-app` is a Vite app used
by the CLI and MCP tests.

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
pnpm docs:dev                    # preview the docs site locally
pnpm docs:build                  # build the docs site
```

Run a single test file with `pnpm vitest run <path>`. Run the full check before opening a pull
request.

## Branch naming

Use a short prefix and a topic:

- `feat/<topic>` for new features
- `fix/<topic>` for bug fixes
- `docs/<topic>` for documentation
- `chore/<topic>` for housekeeping

Never squash stacked pull requests. Each branch keeps its own commits and history.

## Commits

Use Conventional Commits and match the existing history:

```text
feat(cli): add a new command
fix(plugin): handle a missing selection
test(converter): cover mixed radii
docs: rewrite the getting started guide
```

The scope is the package name. Write the subject in the imperative mood.

## Changesets

Any change that affects the published package (`@frame-relay/cli`) needs a changeset.
Run:

```bash
pnpm changeset
```

Pick the packages and the bump type (patch, minor or major), then write a one-line summary. Commit
the new file in `.changeset/`. Maintainers run the release step, not contributors.

## Project rules

These come from `AGENTS.md`. They are not suggestions.

1. **The converter stays pure.** `packages/converter` must not import `node:fs`,
   `node:child_process`, network APIs, the `figma` global or `process`. It is synchronous, never
   throws and produces byte-identical output for identical input.
2. **Only the plugin's `src/main/` may touch `figma`.** `src/ui/` and `src/shared/` must not use
   the Figma plugin API. Main and UI communicate only through the typed message union in
   `packages/plugin/src/shared/messages.ts`.
3. **MCP stdout is protocol only.** In `packages/cli/src/mcp/`, stdout carries JSON-RPC messages
   only. Log through `packages/cli/src/mcp/logger.ts` (stderr). Never add `console.log` there.
4. **Add a regression test for every bug fix.** Run `pnpm test` before pushing.
5. **Check the behavior, not the intent.** If you describe a feature in docs, verify it against the
   code first.

## Documentation

- User-facing docs live in `docs/`. The docs site is built with VitePress.
- Development notes and phase plans live in `docs/dev/`.
- Keep sentences short. Avoid em dashes and en dashes.

## Reporting bugs and security issues

Use the issue templates for bugs, features and beta feedback. For security issues, follow
[SECURITY.md](./SECURITY.md) and use GitHub private vulnerability reporting instead of a public
issue.
