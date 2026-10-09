# Concepts

This page explains the pieces of Frame-Relay in plain English. Read it once and the commands and
files will make sense.

## The kit

The **kit** is a folder that describes your design system in a format a computer can read. The
Figma plugin creates it when you click **Export Kit (.zip)**. Inside the zip there is a
`frame-relay-kit` folder with:

- `frame-relay.json`: the manifest. It lists the kit name, the source Figma file and every component.
- `tokens.json`: your design tokens (colors, spacing, radius, type) written in a standard format
  called DTCG.
- `components/*.json`: one file per component. Each file lists the anatomy, props, variants, states
  and usage rules.
- `screenshots/*.png` and `icons/*.svg`: the visual assets.

Think of the kit as a printed manual of your design system. Every other part of Frame-Relay reads
that manual.

## Sync

**Sync** is the command that installs the manual into your project. It reads the kit and writes
real files:

- React components with variants, using Tailwind CSS classes that point at your tokens.
- A token stylesheet with CSS variables and Tailwind theme values.
- Rule files for your AI tools (next section).
- MCP setup so your AI tool can ask questions about the kit.

Sync also writes `.frame-relay/lock.json`, a fingerprint file. On the next sync, Frame-Relay
compares fingerprints. Files you edited by hand are never overwritten. Instead, the new version is
saved next to your file with a `.generated.tsx` ending and the summary lists a conflict.

The kit stays the source of truth. If a component changes in Figma, export a new kit and sync
again.

## The rules files

AI coding tools read instruction files from your project. Frame-Relay maintains several:

- `AGENTS.md`: the main rules. It tells the agent to use kit components instead of raw HTML, to use
  token classes instead of hard-coded colors, and when to call the Frame-Relay tools.
- `.frame-relay/components.md`: the full component catalog, with props and import lines.
- `.agents/rules/frame-relay.md`, `.cursor/rules/frame-relay.mdc`, `CLAUDE.md`: the same rules in
  the format each tool expects.

These files are the difference between an agent that guesses and an agent that follows your system.
If you edit them by hand, keep your text outside the `<!-- frame-relay:start -->` and
`<!-- frame-relay:end -->` markers. Sync replaces only what is between the markers.

## The MCP server: the reference desk your AI calls

**MCP** stands for Model Context Protocol. It is a standard way for AI tools to call small local
programs. The Frame-Relay MCP server is a program that runs on your computer and answers questions
about your kit.

Picture a reference desk in a library. When your agent needs to know which components exist, it
asks the desk (`list_components`). When it needs a component's props, it asks `get_component`. When
it needs a color or spacing value, it asks `get_tokens`. When it wants to check its own work, it
asks `check_file`.

The server reads your local files and answers on your computer. It sends nothing to the internet.
See [MCP server](./mcp.md) for the full tool list.

## Check

**Check** scans the code your agent wrote and reports design system breaks: raw HTML buttons or
inputs, hard-coded hex colors, arbitrary Tailwind values like `p-[13px]`, and inline styles that
set colors directly.

You can run `frame-relay check` yourself, and the agent calls the same check through the
`check_file` tool before it finishes. Each report includes a suggested fix.

## Doctor

**Doctor** is the health check. It runs seven checks and prints a green check or a red cross for
each one:

1. Node.js version
2. Config file
3. Design kit files
4. Generated files
5. MCP config files
6. Live ports (the local ports live mode uses)
7. MCP server startup

When something feels broken, run doctor first. Every failed check includes the fix.

## Live mode: pairing Figma with your AI

**Live mode** is pairing Figma with your AI, like pairing Bluetooth headphones. Your agent asks for
live mode, the server shows a six-digit code, and you type the code into the plugin's **Live** tab.
Once paired, the agent can read the layer you have selected in Figma.

Use live mode when you want the agent to match something specific:

- "Match this card I just selected."
- "Make the spacing match this frame."
- "This button changed in Figma. Update the component to match."

Live mode is optional and temporary. It runs only on your computer, and it stops when you
disconnect or when the agent calls `stop_live`.

**Export mode always works without live mode.** The kit from your last export, and everything sync
writes, work on their own. If live mode is not running, the agent simply uses the exported kit. That
is the normal way to build. Live mode is only for "match this" moments between exports.

Read [Live mode](./live-mode.md) for pairing steps, the Live tab and troubleshooting.
