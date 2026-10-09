# Figma Community submission pack

Ready-to-paste text and images for the Frame-Relay plugin listing. Regenerate the images with
`pnpm assets:figma`.

## Name

Frame-Relay

## Tagline

Turn your Figma components into a design kit your AI coding agent follows.

(74 characters.)

## Description

Frame-Relay connects your Figma design system to the AI coding tools you already use.

Designers often ask an AI assistant to build a screen, then spend time fixing raw HTML buttons,
wrong colors and off spacing. Frame-Relay fixes that. It exports your components, tokens, icons and
screenshots as a design kit, and one command writes them into your project as React components,
Tailwind CSS tokens and simple instruction files. Your AI agent reads the same component list,
props and token values you designed, so it builds screens that follow your system.

The plugin has three tabs. **Lint** checks your file against a short naming contract and explains
how to fix each issue. **Export** turns the whole file or the current selection into a kit zip.
**Live** pairs with your computer so your agent can read the layer you have selected.

The Frame-Relay command line tool runs on your computer. It writes files into your project, sets up
the MCP server for Antigravity, OpenCode, Cursor and Claude Code, and includes a check command that
reports raw HTML, hard-coded colors and arbitrary values before you finish.

Frame-Relay is in public beta and free to use. Export mode works on its own. Live mode is optional
and runs on your computer only.

What it is not: a finished app generator, and not a replacement for your design system. It gives
your AI the same source of truth you use, and keeps the two in sync.

## Tags

- design system
- design tokens
- AI
- developer tools
- productivity
- React
- Tailwind CSS
- code generation

## Support contact

https://github.com/Joseph-Brendan/Frame-Relay/issues

## Network access

Frame-Relay asks for access to three localhost addresses only:

- `ws://localhost:47321`
- `ws://localhost:47322`
- `ws://localhost:47323`

These are used by live mode, which connects the plugin to the Frame-Relay server on the same
computer. The manifest reasoning line reads: "Frame-Relay live mode connects only to a local server
on your own computer. No data leaves your machine." Live mode is optional. Lint and Export work
without any of this.

## Data and privacy

Frame-Relay collects nothing. There is no telemetry, no analytics, no accounts and no crash
reporting. The plugin reads the Figma file you open, writes the exported kit to your downloads, and
in live mode talks only to the Frame-Relay server on your own computer over localhost. Nothing is
sent to us or to any third party. This matches [PRIVACY.md](../../../PRIVACY.md).

## Assets

| File        | Size     | Notes                                 |
| :---------- | :------- | :------------------------------------ |
| `icon.svg`  | vector   | source for the icon                   |
| `icon.png`  | 128x128  | listing icon                          |
| `cover.png` | 1920x960 | cover image with the name and tagline |

The mark is two linked frames in `#C0552F` and `#1E2A44`. It contains no text and no third-party
brand assets.
