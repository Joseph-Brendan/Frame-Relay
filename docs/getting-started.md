# Getting started

This page walks you from an empty folder to a page built by your AI coding agent. Give it about
20 minutes the first time.

## Amaka's story

Amaka is a product designer. She spent months building a clean component library in Figma, and she
loves using an AI coding tool for quick prototypes. The problem: the AI kept writing raw HTML
buttons, hard-coded hex colors and slightly wrong spacing. Screenshots helped a little, but the
agent was still guessing.

Frame-Relay fixed that. Amaka installed the Figma plugin, exported her library as a "kit" (a folder
of JSON files that describe her components and tokens), and ran one command in her app. Now her AI
agent reads the same component list, props and token values she designed. It builds screens that
look like her system because it is following her system.

## What you need

- **Node.js 20 or newer.** (Node is the program that runs the Frame-Relay commands. Get it at
  [nodejs.org](https://nodejs.org).)
- **Figma desktop.** The plugin needs the desktop app for now.
- **An AI coding tool.** Frame-Relay writes setup for Antigravity, OpenCode, Cursor and Claude Code.
- **A React app.** A Vite + React + TypeScript + Tailwind CSS v4 app is the easiest start.

(Technical terms used below: a **token** is a named design value such as a color or spacing. A
**kit** is the exported folder of component and token files. **Tailwind CSS** is a styling library
that turns those tokens into CSS classes.)

## Step 1. Create the app

```bash
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install
npm install tailwindcss @tailwindcss/vite
```

Open `vite.config.ts` and add the Tailwind plugin:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({ plugins: [react(), tailwindcss()] });
```

Replace the contents of `src/index.css` with:

```css
@import 'tailwindcss';
```

Check that the app runs with `npm run dev`. You should see the Vite starter page.

## Step 2. Export your kit from Figma

1. Open your design file in Figma desktop.
2. Run the Frame-Relay plugin. Frame-Relay is coming to Figma Community. Until it is approved, go
   to **Plugins**, **Development**, **Import plugin from manifest**, and choose
   `packages/plugin/manifest.json` from the Frame-Relay repository. Then run it.
3. In the plugin, open the **Export** tab, choose the scope (whole file or current selection), and
   click **Export Kit (.zip)**.
4. Figma downloads a file named like `frame-relay-kit-my-file-2026-10-09.zip`.

Want a clean export? Read the [Figma naming contract](./naming-contract.md) first. It explains the
component names, layer names and description lines the plugin expects.

## Step 3. Set up Frame-Relay in the app

```bash
npm install -D @frame-relay/cli@beta
npx @frame-relay/cli@beta init --yes
```

`init` looks at your project and writes `frame-relay.config.json`, the settings file. If the
runtime packages `class-variance-authority`, `clsx` and `tailwind-merge` are missing, it offers to
install them, and `--yes` accepts that offer.

Installing the CLI as a dev dependency is optional, but it makes your AI tool setup work today.
Until the stable release, the package is published with the `beta` tag only.

## Step 4. Sync the kit

```bash
npx @frame-relay/cli@beta sync --from ~/Downloads/frame-relay-kit-my-file-2026-10-09.zip
```

`sync` unpacks the kit and writes into your project:

- `src/components/ui/` with React components such as `Button.tsx`
- `src/styles/frame-relay-tokens.css` with your design tokens as CSS variables and Tailwind theme values
- `.frame-relay/components.md` with a catalog your agent can read
- Rule files for your AI tools: `AGENTS.md`, `.agents/rules/frame-relay.md`, `.cursor/rules/frame-relay.mdc` and `CLAUDE.md`
- MCP setup: `.mcp.json`, `.cursor/mcp.json`, `.agents/mcp_config.json` and `opencode.json`
- `.frame-relay/lock.json`, a fingerprint file that keeps future syncs from overwriting your edits

## Step 5. Check everything

```bash
npx @frame-relay/cli@beta doctor
```

`doctor` runs seven checks: Node version, config file, kit files, generated files, MCP configs,
live ports and MCP server startup. You want to see this line:

```text
All doctor checks passed successfully! Project is fully healthy.
```

If a check fails, the output tells you the fix. The most common one is a missing kit: run `sync`
again and point `--from` at the zip you downloaded.

## Step 6. Build a page with your AI agent

1. Open the app folder in your AI tool. If it was already open, restart it or reload the project so
   it picks up the MCP config.
2. Confirm the `frame-relay` server is connected. In OpenCode, open the MCP panel. In Antigravity,
   open **...**, **MCP Servers**, **Manage MCP Servers** and click **Refresh**.
3. Ask for a page, for example: **"Build a settings page with the kit components."**

Behind the scenes, the agent calls tools such as `list_components`, `get_component` and
`get_tokens`, then writes the page with your components and token classes. After editing files, it
calls `check_file`, which reports raw HTML buttons, hard-coded colors and arbitrary values.

You can run the same check yourself at any time:

```bash
npx @frame-relay/cli@beta check
```

## What each command does

| Command                          | In one sentence                                                                                   |
| :------------------------------- | :------------------------------------------------------------------------------------------------ |
| `frame-relay init`               | Looks at your project and writes the settings file `frame-relay.config.json`.                     |
| `frame-relay sync`               | Reads the kit and writes components, token CSS, rule files and AI tool configs into your project. |
| `frame-relay check`              | Scans your code and reports raw HTML elements, hard-coded colors and other rule breaks.           |
| `frame-relay doctor`             | Runs seven health checks and tells you how to fix anything that fails.                            |
| `frame-relay mcp`                | Starts the local MCP server your AI agent talks to. `--live` also starts live mode.               |
| `frame-relay mcp --print-config` | Prints ready-to-paste MCP setups for Antigravity, Cursor, Claude Code and OpenCode.               |
| `frame-relay live`               | Shows whether live mode is running, the pairing code and the connection state.                    |

Full details, including every flag, are in [CLI commands](./cli.md).

## If something goes wrong

- **"Tailwind CSS v4 was not detected."** Check that `src/index.css` contains
  `@import "tailwindcss";` and that `tailwindcss` is in your `package.json`.
- **"No design kit found."** Pass the zip path to `sync --from`. If the kit folder already exists,
  pass `--kit <dir>` instead.
- **"Multiple design kits found."** Your project has more than one kit folder. Pass `--kit <dir>`
  to say which one to use.
- **The AI tool does not list `frame-relay`.** Restart the tool after `sync`. Antigravity needs the
  **Refresh** click described in step 6.
- **Live mode says all ports are in use.** Close the other Frame-Relay session or MCP server, then
  ask your agent for live mode again. See [Live mode](./live-mode.md).

Next: [Concepts](./concepts.md) explains why each piece exists.
