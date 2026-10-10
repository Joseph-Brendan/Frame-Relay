# Frame-Relay

**Turn your Figma components into a design kit your AI coding agent follows.**

New to this? Follow the [step-by-step setup guide for designers](#setup-guide-for-designers).

[![npm beta](https://img.shields.io/npm/v/@frame-relay/cli/beta?label=npm%20beta)](https://www.npmjs.com/package/@frame-relay/cli)
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
npx @frame-relay/cli@beta init --yes
npx @frame-relay/cli@beta sync --from ~/Downloads/frame-relay-kit-my-file.zip

# 5. Check the setup
npx @frame-relay/cli@beta doctor
```

Open the folder in OpenCode (or your AI tool), then ask: "Build a settings page with the kit
components." The agent calls the MCP server for the component list, props and tokens, and builds.

**Getting the Figma plugin:** Frame-Relay is coming to Figma Community. Until it is approved, open
Figma desktop, go to Plugins, Development, Import plugin from manifest, and pick
[`packages/plugin/manifest.json`](./packages/plugin/manifest.json) from this repo.

Full walkthrough: [Getting started](./docs/getting-started.md). Ideas first:
[Concepts](./docs/concepts.md).

## Setup guide for designers

These steps are written for a designer who has never used a terminal. A **terminal** is a window where you type short commands to your computer. Your AI coding tool has one built in.

### Part 1: Get ready (once)

**Step 1. Install Node.js.**
Go to nodejs.org, download the LTS version, and install it like any other app.
_Why:_ Frame-Relay runs on Node.js. Without it, your computer can't run the commands below.

**Step 2. Install an AI coding tool.**
Pick one: Cursor, Antigravity, OpenCode or Claude Code. Install it and sign in.
_Why:_ This is the AI that will build your app. Frame-Relay teaches it to use your designs.

**Step 3. Add the Frame-Relay plugin to Figma.**
Open Figma, search for "Frame-Relay" in Community plugins, and click Install. Until the listing is live, download the plugin zip from the latest GitHub release and follow [these import steps](https://github.com/Joseph-Brendan/Frame-Relay/releases/latest).
_Why:_ The plugin is how your designs leave Figma and reach your AI.

### Part 2: In Figma

**Step 4. Design your components.**
Build your buttons, inputs and cards as Figma components. Follow the simple naming rules in the [naming contract](docs/naming-contract.md), such as naming a variant "Size=Large" or "State=Hover", and use Figma variables for your colors and spacing.
_Why:_ Clear names let Frame-Relay understand your design. Variables let it carry your exact colors and sizes into code.

**Step 5. Check your file.**
Run the Frame-Relay plugin and open the **Lint** tab. Click **Check file**. Fix anything it lists, then check again.
_Why:_ It's like spell-check for your design file. It catches problems before they turn into messy code.

**Step 6. Export your kit.**
Open the **Export** tab and click **Export kit**. A zip file downloads.
_Why:_ This zip is your whole design system packed into one box: colors, sizes, components and a picture of each one.

### Part 3: Set up your app

**Step 7. Create a project folder.**
Make a new folder on your computer, for example `my-app`. Use dashes, not spaces, in the name. Open the folder in your AI tool.
_Why:_ Your app's code needs a home.

**Step 8. Ask your AI to set up the app.**
Paste this into your AI tool:

```text
Set up a Vite + React + TypeScript app in this folder, with Tailwind CSS v4 and the "@/" path alias pointing to src. Then run npm run build to confirm it works.
```

_Why:_ This creates an empty app that Frame-Relay knows how to work with.

**Step 9. Set up Frame-Relay.**
Open the terminal in your AI tool and type:

```bash
npx @frame-relay/cli@beta init
```

Answer yes to its questions.
_Why:_ It looks at your app and gets it ready to receive your designs.

**Step 10. Bring in your designs.**
Type this, with a space at the end:

```bash
npx @frame-relay/cli@beta sync --from
```

Then drag your zip file from Step 6 into the terminal and press Enter.
_Why:_ This opens the box. It turns your Figma components into real code, and writes rules telling your AI: "Always use these. Never invent your own."

**Step 11. Run a health check.**

```bash
npx @frame-relay/cli@beta doctor
```

You should see green ticks.
_Why:_ It's like the warning lights in a car. It confirms everything is connected before you start building.

### Part 4: Build with your AI

**Step 12. Ask your AI to build a screen.**
Start a new chat in your AI tool and ask for what you need, for example: "Build a login page using my design kit."
_Why:_ The AI now looks up your components before it builds, so it uses your buttons and inputs instead of making up its own.

**Step 13. See your app.**
In the terminal, type:

```bash
npm run dev
```

Open the link it shows, usually `http://localhost:5173`, in your browser.
_Why:_ You see the page the AI built and can compare it with your Figma design.

**Step 14. Check the AI's work.**

```bash
npx @frame-relay/cli@beta check
```

_Why:_ It catches any place the AI broke your rules, such as using a random color. If it finds something, ask the AI: "Fix the issues frame-relay check found."

### Part 5: Extras

**Step 15. Use live mode (optional).**
Ask your AI: "Start Frame-Relay live mode." It gives you a 6-digit code. In Figma, open the plugin's **Live** tab, type the code and click **Connect**. Now select anything in Figma and ask your AI: "Build something that matches my Figma selection."
_Why:_ Your AI sees what you select in Figma right away, so you can build from a design you haven't exported yet.

**Step 16. When you change your designs.**
Repeat Steps 5, 6 and 10: check, export and sync again.
_Why:_ Your code stays matched to your latest Figma design. If you edited a generated component by hand, Frame-Relay keeps your edit and saves the new version beside it, so you never lose work.

## Supported AI tools

`sync` writes the setup for each tool it finds, so the agent can start using the kit right away.

| Tool            | What sync writes                                             |
| :-------------- | :----------------------------------------------------------- |
| **Antigravity** | `.agents/mcp_config.json` and `.agents/rules/frame-relay.md` |
| **OpenCode**    | `opencode.json` (merged, other keys kept) and `AGENTS.md`    |
| **Cursor**      | `.cursor/mcp.json` and `.cursor/rules/frame-relay.mdc`       |
| **Claude Code** | `.mcp.json` and `CLAUDE.md`                                  |

Until the stable release, the package is published with the `beta` tag only. The simplest setup is
to install it as a dev dependency once: `npm install -D @frame-relay/cli@beta`. Sync then
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
