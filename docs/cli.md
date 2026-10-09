# Frame-Relay CLI (`frame-relay`)

The `frame-relay` CLI connects your exported Figma design kit directly to your codebase. It inspects your project environment, writes Tailwind CSS v4 design tokens, generates React TypeScript components with CVA variants, maintains agent instruction rules, and enforces design system integrity via an AST-based check command.

---

## Installation & Quickstart

Run via `npx` or install into your project:

```bash
# Initialize Frame-Relay in your project
npx @frame-relay/cli init

# Sync tokens, components, and agent rules from an exported kit zip
npx @frame-relay/cli sync --from ./frame-relay-kit.zip

# Verify your codebase for design system compliance
npx @frame-relay/cli check
```

Or install as a development dependency:

```bash
pnpm add -D @frame-relay/cli
# or: npm install -D @frame-relay/cli
# or: yarn add -D @frame-relay/cli
# or: bun add -d @frame-relay/cli
```

---

## Global Flags

Every command supports the following global flags:

| Flag              | Description                                                             |
| :---------------- | :---------------------------------------------------------------------- |
| `--cwd <dir>`     | Working directory for the command (defaults to `process.cwd()`).        |
| `--yes`, `-y`     | Skip interactive prompts and accept recommended defaults automatically. |
| `--dry-run`       | Preview what files would change without modifying files on disk.        |
| `--verbose`       | Output detailed step-by-step diagnostic logging.                        |
| `-v`, `--version` | Display the installed version of `frame-relay`.                         |
| `-h`, `--help`    | Display help and usage instructions.                                    |

---

## Commands

### 1. `frame-relay init`

Initializes Frame-Relay in an existing project by detecting your project stack and creating `frame-relay.config.json`.

```bash
frame-relay init [--yes]
```

**Environment Detection:**

- **Package Manager**: Automatically detected from your lockfile (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, or `bun.lockb`).
- **Framework**: Detects Vite + React, Next.js (App Router), or general React.
- **TypeScript**: Detects `tsconfig.json` and `@/*` path aliases.
- **Tailwind CSS v4**: Confirms Tailwind v4 is present and finds your main CSS entry file containing `@import "tailwindcss";`. If missing or on Tailwind v3, provides framework-specific installation instructions.
- **Runtime Dependencies**: Checks for `class-variance-authority`, `clsx`, and `tailwind-merge`, and offers to install them automatically.

### 2. `frame-relay sync`

Synchronizes design tokens, React components, and AI agent rules from a Frame-Relay design kit.

```bash
frame-relay sync [--from <zip>] [--kit <dir>] [--force] [--dry-run]
```

**Flags:**

- `--from <zip>`: Unpacks a kit zip exported from Figma directly into your configured `kitDir`.
- `--kit <dir>`: Explicitly specifies the kit directory to sync from.
- `--force`: Overwrites even user-modified files, bypassing conflict protection.

**Sync Pipeline:**

1. **Kit Discovery**: Discovers `frame-relay.json` or unzips `--from <zip>`.
2. **Validation**: Validates kit format v1 schema and components.
3. **Design Tokens**: Writes `--fr-*` CSS variables, dark mode selectors, Tailwind v4 `@theme inline` block, and typography utilities. Injects `@import "./frame-relay-tokens.css";` into your CSS entry.
4. **Component Codegen**: Generates CVA-powered React components in `componentsDir` along with `src/lib/cn.ts` and `index.ts`.
5. **Safe Re-Sync**: Compares file hashes against `.frame-relay/lock.json`. Preserves user edits and writes conflicts to `<Name>.generated.tsx`.
6. **Agent Rules**: Generates `.frame-relay/components.md`, updates `AGENTS.md` (under 40 lines), `.agents/rules/frame-relay.md`, `.cursor/rules/frame-relay.mdc`, and `CLAUDE.md`, merges `opencode.json`, and adds `.frame-relay/live.json` to `.gitignore`.

### 3. `frame-relay check`

Inspects your project files using an AST parser (`@babel/parser`) to detect design system violations.

```bash
frame-relay check [paths...] [--json]
```

**Checked Rules:**

1. **`raw-form-element`**: Raw `<button>`, `<input>`, `<select>`, `<textarea>` elements used outside `componentsDir`. Suggests importing the kit component instead.
2. **`literal-color`**: Hex (`#3B82F6`), rgb/rgba, or hsl/hsla color literals used in `className`, `style`, or CSS-in-JS.
3. **`tailwind-arbitrary-value`**: Tailwind arbitrary values for color, radius, spacing, or shadow (e.g. `bg-[#123]`, `rounded-[13px]`, `p-[7px]`). Generated kit files with the raw value comment are exempt.
4. **`inline-style-token`**: Inline style objects that set `color`, `background`, `borderRadius`, or `boxShadow`.

**Options:**

- `paths...`: Files or directories to check (defaults to `src/`, excluding `componentsDir`).
- `--json`: Outputs machine-readable JSON array of violations.
- Exits with code `1` if violations are found, `0` if clean.

### 4. `frame-relay mcp`

Runs the local Model Context Protocol (MCP) server over stdio for AI agent integration (Antigravity, Cursor, Claude Code, OpenCode).

```bash
frame-relay mcp [--root <dir>] [--print-config] [--live]
```

- `--root <dir>`: Explicit project root directory (otherwise resolved via `--root`, `FRAME_RELAY_ROOT`, or upward walk).
- `--print-config`: Prints ready-to-paste JSON configuration snippets for Antigravity, Cursor, Claude Code, and OpenCode.
- `--live`: Starts the live-mode WebSocket bridge at startup. Agents can also start it on demand with the `start_live` tool.
- For complete documentation on all 10 MCP tools, resources, client setup and live mode, see [docs/mcp.md](mcp.md) and [docs/live-mode.md](live-mode.md).

### 5. `frame-relay live`

Prints the state stored in `.frame-relay/live.json` while a live session is running.

```bash
frame-relay live
```

Example output:

```text
Frame-Relay live mode
  Status:    running
  Port:      47321
  Paired:    no
  Code:      123456 (expires in 8m 12s)
  Started:   2026-10-09T13:00:00.000Z
```

When no session is running it prints:
`Live mode is not running. Ask your agent to start it, or run the MCP server with --live.`

### 6. `frame-relay doctor`

Verifies project health, environment requirements, design kit integrity, generated files, live ports, and MCP server connectivity.

```bash
frame-relay doctor [--cwd <dir>]
```

**Checked Items:**

1. **Node.js Version**: Confirms Node >= 20.
2. **Config File**: Confirms `frame-relay.config.json` exists and is valid.
3. **Design Kit**: Confirms design kit files exist and pass validation.
4. **Generated Files**: Verifies presence of components, token stylesheets, and utility helpers.
5. **MCP Config Files**: Checks client configuration files (`.agents/mcp_config.json`, `.cursor/mcp.json`, `.mcp.json`).
6. **Live Ports**: Reports whether `127.0.0.1:47321-47323` are free for live mode.
7. **MCP Server Startup**: Verifies `frame-relay mcp` initializes cleanly.

---

## Configuration (`frame-relay.config.json`)

Created by `frame-relay init`:

```json
{
  "$schema": "https://raw.githubusercontent.com/Joseph-Brendan/Frame-Relay/main/packages/schema/schemas/frame-relay.config.json",
  "kitDir": "frame-relay-kit",
  "framework": "vite",
  "typescript": true,
  "cssEntry": "src/index.css",
  "componentsDir": "src/components/ui",
  "tokensFile": "src/styles/frame-relay-tokens.css",
  "agents": {
    "antigravity": true,
    "cursor": true,
    "claude": true,
    "opencode": true
  },
  "mcp": true
}
```

---

## Safe Re-Sync & Conflict Protection

Frame-Relay protects your local customizations using a cryptographic hash tracking file at `.frame-relay/lock.json`:

1. **Unchanged File**: When an incoming component matches the hash of your last sync, Frame-Relay safely updates it to the latest version.
2. **User-Edited File**: If you customized `<componentsDir>/<Name>.tsx`, Frame-Relay will **never** overwrite your changes. Instead, it writes `<Name>.generated.tsx` alongside your file and reports a conflict in the summary.
3. **Deleted Components**: If a component is removed in Figma, Frame-Relay warns you in the summary but **never deletes** your existing component files.
4. **Force Overwrite**: Passing `--force` overrides conflict protection, replacing files with the newly generated versions.

> [!TIP]
> Always commit `.frame-relay/lock.json` to your git repository so sync operations remain idempotent across team members.

---

## Generated Artifacts

When running `frame-relay sync`, the following files are maintained:

```text
my-project/
├── frame-relay-kit/                # Design kit JSON, tokens, and screenshots
├── src/
│   ├── components/ui/
│   │   ├── Button.tsx              # Component with CVA variants
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   └── index.ts                # Barrel export
│   ├── lib/
│   │   └── cn.ts                   # Utility helper (clsx + tailwind-merge)
│   └── styles/
│       └── frame-relay-tokens.css  # Tokens CSS with @theme inline
├── .frame-relay/
│   ├── components.md               # Full component catalog for agents
│   └── lock.json                   # SHA-256 hash tracking for safe re-sync
├── .agents/
│   └── rules/
│       └── frame-relay.md          # Antigravity always-on rules
├── .cursor/
│   └── rules/
│       └── frame-relay.mdc         # Cursor MDC rules (alwaysApply: true)
├── opencode.json                   # OpenCode MCP server (merged, other keys kept)
├── AGENTS.md                       # Core design rules (< 40 lines)
└── CLAUDE.md                       # Claude Code instructions (@AGENTS.md)
```

`.gitignore` also gains `.frame-relay/live.json`, so pairing codes are never committed.

---

## Troubleshooting

### "No design kit found"

- Export a kit zip from Figma using the Frame-Relay plugin (**Developer mode -> Export Kit**).
- Run `frame-relay sync --from <path-to-kit.zip>` to extract and sync in one step.

### "Multiple design kits found"

- If your repo contains multiple kits, pass `--kit <dir>` to specify which folder to sync from.

### "Tailwind CSS v4 not detected"

- Ensure `tailwindcss` v4 or higher is installed.
- Ensure your CSS entry file includes `@import "tailwindcss";`.
