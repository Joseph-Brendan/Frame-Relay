# Frame-Relay

**Turn your Figma components into a design kit your AI coding agent follows.**

[![npm beta](https://img.shields.io/npm/v/@josephbrendan/frame-relay/beta?label=npm%20beta)](https://www.npmjs.com/package/@josephbrendan/frame-relay)
[![CI](https://github.com/Joseph-Brendan/Frame-Relay/actions/workflows/ci.yml/badge.svg)](https://github.com/Joseph-Brendan/Frame-Relay/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**Status: public beta.** Commands below install the `beta` tag of the CLI. Expect rough edges and
tell us what you find with the [beta feedback form](https://github.com/Joseph-Brendan/Frame-Relay/issues/new?template=beta_feedback.yml).

Frame-Relay is for designers who already work with AI coding tools like OpenCode or Antigravity,
and for small teams that want their Figma system to stay the source of truth while AI writes the
UI. You keep designing in Figma. Your agent gets exact components, tokens and rules instead of
guessing from screenshots.

## How it works

1. **Design in Figma.** Build components the usual way, using the [naming contract](./docs/naming-contract.md)
   so exports stay predictable.
2. **Export with the plugin.** The Frame-Relay plugin turns your file into a kit: component specs,
   design tokens, icons and screenshots as plain JSON and image files.
3. **Run sync.** One command writes React + Tailwind components, token CSS, rule files for your AI,
   and MCP client configs into your project.
4. **Build with your AI agent.** Your agent reads the kit through the MCP server, then builds
   screens that match the design. Rules files keep it from inventing raw buttons or hard-coded
   colors.

**Live mode** is the optional fifth step: pair Figma with your agent and let it read the layer you
have selected. See [Live mode](./docs/live-mode.md). Export mode always works without it.

## 60-second quickstart

```bash
# 1. Create a React + TypeScript app (Vite shown here; any React app works)
npm create vite@latest my-app -- --template react-ts
cd my-app

# 2. Add Tailwind CSS v4
npm install tailwindcss @tailwindcss/vite
# Then add the tailwindcss() plugin to vite.config.ts and
# `@import "tailwindcss";` to src/index.css.

# 3. In Figma: run the Frame-Relay plugin, open the Export tab, click Export Kit (.zip)

# 4. Set up Frame-Relay and sync the kit
npx @josephbrendan/frame-relay@beta init --yes
npx @josephbrendan/frame-relay@beta sync --from ~/Downloads/frame-relay-kit-my-file.zip

# 5. Check the setup
npx @josephbrendan/frame-relay@beta doctor
```

Open the folder in OpenCode (or your AI tool), then ask: "Build a settings page with the kit
components." The agent calls the MCP server for the component list, props and tokens, and builds.

**Getting the Figma plugin:** Frame-Relay is coming to Figma Community. Until it is approved, open
Figma desktop, go to Plugins, Development, Import plugin from manifest, and pick
[`packages/plugin/manifest.json`](./packages/plugin/manifest.json) from this repo.

Full walkthrough: [Getting started](./docs/getting-started.md). Ideas first:
[Concepts](./docs/concepts.md).

## Supported AI tools

`sync` writes the setup for each tool it finds, so the agent can start using the kit right away.

| Tool            | What sync writes                                             |
| :-------------- | :----------------------------------------------------------- |
| **Antigravity** | `.agents/mcp_config.json` and `.agents/rules/frame-relay.md` |
| **OpenCode**    | `opencode.json` (merged, other keys kept) and `AGENTS.md`    |
| **Cursor**      | `.cursor/mcp.json` and `.cursor/rules/frame-relay.mdc`       |
| **Claude Code** | `.mcp.json` and `CLAUDE.md`                                  |

Until the stable release, the package is published with the `beta` tag only. The simplest setup is
to install it as a dev dependency once: `npm install -D @josephbrendan/frame-relay@beta`. Sync then
writes a command that uses the local install, and the MCP server starts without changes.

## Documentation

| Page                                               | What it covers                                                   |
| :------------------------------------------------- | :--------------------------------------------------------------- |
| [Getting started](./docs/getting-started.md)       | First-time walkthrough from an empty folder to an AI-built page. |
| [Concepts](./docs/concepts.md)                     | The kit, sync, rules files, MCP, check, doctor and live mode.    |
| [CLI commands](./docs/cli.md)                      | Every command, its flags and the files it writes.                |
| [Figma plugin](./docs/plugin.md)                   | The Lint, Export and Live tabs, plus warnings and the icon rule. |
| [Live mode](./docs/live-mode.md)                   | Pairing, the Live tab, live tools, security and troubleshooting. |
| [MCP server](./docs/mcp.md)                        | The 10 tools your agent calls, resources and client setup.       |
| [Kit format](./docs/kit-format.md)                 | Folder layout and every field in the kit JSON files.             |
| [Converter](./docs/converter.md)                   | How Figma data maps to kit specs, including every warning code.  |
| [Figma naming contract](./docs/naming-contract.md) | The naming rules that keep exports clean.                        |
| [JSON schemas](./docs/schemas.md)                  | Stable URLs for the manifest, tokens and component schemas.      |

The same docs are published at **https://joseph-brendan.github.io/Frame-Relay/**.

## Contributing

Setup, commands, branch naming and release notes are in [CONTRIBUTING.md](./CONTRIBUTING.md).
Security reports: [SECURITY.md](./SECURITY.md). What we collect: nothing, see
[PRIVACY.md](./PRIVACY.md).

## License

[MIT](./LICENSE), copyright (c) 2026 Joseph Brendan.
