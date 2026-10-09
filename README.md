# Frame-Relay

A free, open-source toolkit that turns Figma components into an agent-ready design kit. It has five parts: a Figma plugin that exports the kit and streams live selections, a converter shared by export and live mode, a CLI that writes code and agent rules into a project, a local MCP server that AI agents query, and a localhost live bridge for "match this" moments. License: MIT.

Status: early development

## Repository Structure

```text
Frame-Relay/
├── packages/
│   ├── schema/       # Core schema definitions and kit specification
│   ├── converter/    # Intermediate representation converter
│   ├── plugin/       # Figma plugin for exporting design kits
│   └── cli/          # CLI tool for code generation and agent rules
├── examples/
│   ├── sample-kit/   # Hand-written kit used for testing (Phase 2)
│   └── demo-app/     # Vite + React app target (Phase 5)
├── docs/             # Documentation site (Phase 9)
└── .github/          # CI/CD workflows
```

## Documentation

- [CLI Documentation](docs/cli.md): Commands, flags, configuration, safe re-sync, and check rules.
- [MCP Server Documentation](docs/mcp.md): Local MCP server, 10 agent tools, resources, and client setup (Antigravity, Cursor, Claude Code, OpenCode).
- [Live Mode](docs/live-mode.md): Pairing, the plugin's Live tab, live tools, security model, and troubleshooting.
- [Kit Format Specification](docs/kit-format.md): Folder layout, field specifications, and annotated schema examples.
- [Figma Naming Contract](docs/naming-contract.md): Strict naming rules and design constraints for Figma components.
- [Converter Core Documentation](docs/converter.md): Figma snapshots, mapping tables, warning codes, and converter API.
- [Plugin Documentation](docs/plugin.md): Figma plugin architecture, export pipeline, Live tab, and Developer Mode.

## Quickstart

```bash
# Initialize Frame-Relay in your React + Tailwind v4 project
npx @josephbrendan/frame-relay init

# Sync design tokens, components, and agent rules from an exported kit zip
npx @josephbrendan/frame-relay sync --from ./frame-relay-kit.zip

# Verify your application code for design system compliance
npx @josephbrendan/frame-relay check

# Check project health and MCP server connectivity
npx @josephbrendan/frame-relay doctor

# Run the local MCP server for AI agents
npx @josephbrendan/frame-relay mcp

# Or start it with live mode so the agent can see your Figma selection
npx @josephbrendan/frame-relay mcp --live

# Check whether live mode is running and show the pairing state
npx @josephbrendan/frame-relay live
```

`sync` configures MCP for Antigravity, Cursor, Claude Code and OpenCode. For OpenCode it merges a
`frame-relay` entry into `opencode.json` without touching other keys; OpenCode reads the generated
`AGENTS.md` rules file. See [docs/mcp.md](docs/mcp.md#4-opencode) and
[docs/live-mode.md](docs/live-mode.md).

Ensure you have Node.js 20 or newer installed:

```bash
# Enable pnpm via Corepack
corepack enable

# Install workspace dependencies
pnpm install

# Build all packages
pnpm build

# Run test suite
pnpm test
```
