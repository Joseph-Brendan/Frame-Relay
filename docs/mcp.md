# Local MCP Server (`frame-relay mcp`)

The Frame-Relay MCP (Model Context Protocol) server is a local, stdio-based server that gives AI coding assistants (such as Google Antigravity, Cursor, Claude Code and OpenCode) full query access to your design system.

It reads your exported `frame-relay-kit/` and `frame-relay.config.json`, answering questions about available components, token values, styling guidelines, interactive states, visual screenshots, and rule compliance.

- **Offline & Private**: Runs locally on your machine over stdio. Needs no Figma access, no network, and never writes files.
- **Instant Synchronization**: Watches kit files with Chokidar and hot-reloads within 300ms without restarting the server.
- **Fail-Safe**: If a kit file edit has validation errors, the server keeps serving the last valid kit and reports a clear warning.
- **Live Mode (optional)**: A localhost WebSocket bridge lets the agent read your current Figma selection. See [Live Mode](live-mode.md).

---

## Project Root Resolution

The MCP server determines the project root in the following priority order:

1. **`--root <dir>` CLI flag**: Explicit path passed when starting the server (`frame-relay mcp --root /path/to/project`).
2. **`FRAME_RELAY_ROOT` environment variable**: Path specified in the process environment.
3. **Walk-Up Discovery**: Traverses parent directories upwards from `process.cwd()` until it finds `frame-relay.config.json` or `frame-relay-kit/frame-relay.json`.
4. **Current Working Directory**: Fallback to `process.cwd()`.

If no kit is found at the resolved root, the server starts safely and tools return:

```
No Frame-Relay kit found from <path>. Run `npx frame-relay sync`, or set FRAME_RELAY_ROOT to your project folder.
```

---

## MCP Tools

The server exposes 10 specialized tools designed for AI agents:

### 1. `get_kit_info`

- **When to call**: Call first to confirm Frame-Relay is set up for this project.
- **Input**: None.
- **Example Result**:

```markdown
# Frame-Relay Kit: Frame-Relay Sample Kit

- **Project Root**: `/Users/username/Desktop/my-app`
- **Kit Version**: `1.0`
- **Exported At**: `2026-10-03T12:00:00.000Z`
- **Source Figma File**: Frame-Relay Sample Kit
- **Components**: 3
- **Modes**: light, dark
- **Components Directory**: `src/components/ui`
- **Import Prefix**: `@/components/ui`
- **Frame-Relay CLI Version**: `0.1.0`
- **Live Mode**: off (export-based kit)
```

### 2. `list_components`

- **When to call**: Call before building any UI to see which components already exist. Always use these instead of writing raw HTML elements.
- **Input**:
  - `category` _(optional string)_: Filter by category (e.g. `action`, `input`, `layout`, `display`).
- **Example Result**:

```markdown
# Available Components (3)

- **Button** (action): Trigger an immediate action or submission. Variants: variant (Primary | Secondary | Ghost), size (Medium | Large). Import: `import { Button } from "@/components/ui"`
- **Input** (input): Capture single-line textual user input. Variants: size (Medium). Import: `import { Input } from "@/components/ui"`
- **Card** (layout): Group content and actions in a structured surface container. Variants: variant (Default | Elevated). Import: `import { Card } from "@/components/ui"`
```

### 3. `get_component`

- **When to call**: Call before using a component, to get its exact props, variants, interactive states, and usage rules.
- **Input**:
  - `name` _(string)_: Component name (e.g. `Button` or `Input`). Case-insensitive.
- **Suggestions on Typo**:
  If asked for `"Buton"`, returns:
  `No component named "Buton". Did you mean "Button"? Call list_components to see every component.`
- **Example Result**:

````markdown
# Component: Button

Trigger an immediate action or submission.

```tsx
import { Button } from '@/components/ui';
```
````

## Props

| Prop       | Type      | Options                   | Default   | Description                |
| ---------- | --------- | ------------------------- | --------- | -------------------------- |
| `variant`  | `variant` | Primary, Secondary, Ghost | `Primary` | Visual styling treatment   |
| `size`     | `variant` | Medium, Large             | `Medium`  | Physical dimensions        |
| `disabled` | `boolean` | -                         | `false`   | Disables user interactions |

## States

- **Hover**: User cursor hover (:hover)
- **Focus**: Keyboard focus (:focus-visible)
- **Pressed**: Mouse/pointer press (:active)
- **Disabled**: `disabled` prop or `aria-disabled="true"`
- **Loading**: `data-loading="true"` attribute or `loading` prop

## Minimal Usage Example

```tsx
import { Button } from '@/components/ui';

export function Example() {
  return (
    <Button variant="Primary" size="Medium">
      Click me
    </Button>
  );
}
```

````

### 4. `get_tokens`
* **When to call**: Call when you need a color, spacing, radius, type or shadow value. Use the Tailwind class or CSS variable, never a raw value.
* **Input**:
  * `group` *(optional enum)*: `'color' | 'radius' | 'space' | 'typography' | 'shadow' | 'border'`
  * `mode` *(optional string)*: Color scheme mode (e.g. `'light'`, `'dark'`)
* **Example Result**:
```markdown
# Design Tokens (9 in color)

| Token | Value | Tailwind Class | CSS Variable |
|---|---|---|---|
| `color.primary.500` | `#2563eb` | `bg-primary-500 / text-primary-500 / border-primary-500` | `--fr-color-primary-500` |
| `color.background.canvas` | `#ffffff` | `bg-background-canvas / text-background-canvas` | `--fr-color-background-canvas` |
````

### 5. `get_screenshot`

- **When to call**: Call to see what a component should look like, then compare it with what you built.
- **Input**:
  - `name` _(string)_: Component name.
  - `variant` _(optional object)_: Variant properties (e.g. `{ variant: 'Primary', size: 'Medium' }`).
  - `state` _(optional string)_: Interactive state (e.g. `'Default'`, `'Hover'`, `'Disabled'`).
- **Returns**: High-resolution PNG image content as base64 (`image/png`), plus a status line confirming exact or closest match.

### 6. `check_file`

- **When to call**: Call after creating or editing any UI file, before you finish. Fix every issue it reports.
- **Input**:
  - `path` _(string or array of strings)_: Path to file(s) relative to root or absolute within root.
  - `paths` _(optional array of strings)_: Multiple file paths.
- **Rules Checked**:
  1. Raw `<button>`, `<input>`, `<select>`, `<textarea>` outside component directory.
  2. Hex, rgb, rgba, hsl color literals in styling.
  3. Tailwind arbitrary values (`bg-[#...]`, `p-[13px]`, `rounded-[7px]`).
  4. Inline style objects setting color, background, border, or shadow properties directly.
- **Example Result**:

```markdown
# Frame-Relay Compliance Check (2 issues)

- **src/app/page.tsx:14:10** `[raw-form-element]` Raw <button> used in application code.
  _Suggested Fix_: Import { Button } from '@/components/ui' instead.
- **src/app/page.tsx:14:18** `[literal-color]` Hardcoded color literal "#2563eb" found in styling.
  _Suggested Fix_: Use a design token class such as bg-primary-500 or text-primary-500.
```

### 7. `start_live`

- **When to call**: Call when the user wants live mode or mentions their Figma selection.
- **Input**: None.
- **Result**: Starts the localhost bridge (or returns its state when already running) and returns the pairing code plus the exact steps to show the user:

```markdown
# Live Mode Started

- **Port**: 47321
- **Pairing code**: `123456`

Show this to the user:

> Open the Frame-Relay plugin in Figma, go to the Live tab, enter code 123456, and click Connect.
```

### 8. `stop_live`

- **When to call**: Call when the user is done with live mode.
- **Input**: None.
- **Result**: Stops the bridge, clears the session and deletes `.frame-relay/live.json`.

### 9. `get_live_status`

- **When to call**: Call to check whether live mode is running, whether a plugin is paired, and when the last selection arrived.
- **Input**: None.
- **Result**:

```markdown
# Live Mode Status

- **Running**: yes
- **Port**: 47321
- **Paired**: yes
- **Connected file**: Relay Test
- **Last selection**: Button (component, 12s ago)
```

### 10. `get_live_selection`

- **When to call**: Call when the user says "match this" or refers to their Figma selection.
- **Input**:
  - `fallbackName` _(optional string)_: Component name from the exported kit to return when live mode has no selection.
- **Result**: The selection meta, the component spec or frame summary, the PNG preview as MCP image content, and the warnings. For a component that also exists in the exported kit, it lists every difference in plain English and ends with `Figma has changed since the last export. Re-export the kit and run sync.` When unavailable it returns the pairing code and steps, asks the user to select a layer, or (with `fallbackName`) returns the exported spec.

See [Live Mode](live-mode.md) for pairing, the plugin tab, and the security model.

---

## MCP Resources

Clients that support MCP resources can read:

- **`frame-relay://components`**: Full markdown documentation of all components in the kit (from `.frame-relay/components.md`).
- **`frame-relay://tokens`**: Markdown reference of all design tokens, values, Tailwind utility classes, and CSS variables.
- **`frame-relay://component/{name}`**: Complete specification and guidelines for an individual component.

---

## Connecting to AI Clients

### 1. Google Antigravity (AGY)

When you run `frame-relay sync`, Frame-Relay automatically writes the local configuration into `.agents/mcp_config.json`:

```json
{
  "mcpServers": {
    "frame-relay": {
      "command": "npx",
      "args": ["-y", "@josephbrendan/frame-relay", "mcp"]
    }
  }
}
```

**To activate in Antigravity:**

1. Open the Antigravity agent panel.
2. Click the `...` menu in the top right.
3. Select **MCP Servers** > **Manage MCP Servers**.
4. Click **Refresh**. The `frame-relay` server and all 10 tools will appear active.

_Global Antigravity Configuration:_
To enable Frame-Relay globally across all workspaces, add the snippet to `~/.gemini/config/mcp_config.json`.

### 2. Cursor

`frame-relay sync` automatically configures `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "frame-relay": {
      "command": "npx",
      "args": ["-y", "@josephbrendan/frame-relay", "mcp"]
    }
  }
}
```

### 3. Claude Code

`frame-relay sync` automatically writes `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "frame-relay": {
      "command": "npx",
      "args": ["-y", "@josephbrendan/frame-relay", "mcp"]
    }
  }
}
```

### 4. OpenCode

`frame-relay sync` merges the server into your project's `opencode.json` without touching other
keys or MCP servers:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "frame-relay": {
      "type": "local",
      "command": ["npx", "-y", "@josephbrendan/frame-relay", "mcp"],
      "enabled": true
    }
  }
}
```

When `@josephbrendan/frame-relay` is already a dependency of the project, the command becomes
`["npx", "frame-relay", "mcp"]` instead. OpenCode reads `AGENTS.md`, so `sync` does not write a
separate rules file for it. Restart OpenCode (or reload the project) after the first sync.

---

## CLI Helper Commands

### Printing Config Snippets

To view ready-to-paste JSON configurations for every client (Antigravity, Cursor, Claude Code and
OpenCode):

```bash
frame-relay mcp --print-config
```

### Running with Live Mode

To start the live bridge with the server at startup:

```bash
frame-relay mcp --live
```

Agents can also start the bridge on demand with the `start_live` tool. See
[Live Mode](live-mode.md).

### Diagnosing Server & Project Health

To check your Node version, configuration, design kit, generated files, live ports, and MCP server
startup:

```bash
frame-relay doctor
```

---

## Testing with MCP Inspector

You can test the MCP server interactively in your browser using the official MCP Inspector:

```bash
npx @modelcontextprotocol/inspector npx @josephbrendan/frame-relay mcp
```

Or test a local project root:

```bash
npx @modelcontextprotocol/inspector node /path/to/frame-relay/packages/cli/dist/cli.js mcp --root /path/to/my-app
```

To test live mode, start the built CLI with the bridge enabled:

```bash
npx @modelcontextprotocol/inspector node /path/to/frame-relay/packages/cli/dist/cli.js mcp --root /path/to/my-app --live
```

---

## Troubleshooting

### Server Not Listed in Agent UI

- Ensure your configuration file (`.agents/mcp_config.json`, `.cursor/mcp.json`, or `.mcp.json`) contains `"frame-relay"`.
- Run `frame-relay doctor` to verify configuration syntax.
- In Antigravity: click **Refresh** in the MCP Servers management panel.

### Wrong Project Root

- Pass `--root <dir>` explicitly: `npx frame-relay mcp --root /path/to/app`.
- Or set the environment variable: `export FRAME_RELAY_ROOT=/path/to/app`.

### "No Frame-Relay kit found"

- Run `frame-relay sync` to unpack or synchronize your kit folder.
- Ensure `frame-relay-kit/frame-relay.json` or `frame-relay.config.json` exists in your project.

### Stdout JSON-RPC Errors

- Frame-Relay enforces strict stdout isolation. All server diagnostic logs are written exclusively to `stderr`. Never add `console.log` statements in server code.

### Live Mode Issues

- **All live ports in use**: close the other Frame-Relay live session or MCP server; `frame-relay doctor` shows which ports are free.
- **Plugin will not connect**: confirm the server is running and the pairing code is current; codes expire after 10 minutes and rotate after three wrong attempts.
- **Agent does not call live tools**: re-run `frame-relay sync` so the live instruction is present in `AGENTS.md` and `.agents/rules/frame-relay.md`.

Full troubleshooting lives in [Live Mode](live-mode.md).
