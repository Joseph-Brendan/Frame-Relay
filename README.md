# Frame-Relay

A free, open-source toolkit that turns Figma components into an agent-ready design kit. It has four parts: a Figma plugin that exports the kit, a converter shared by export and live mode, a CLI that writes code and agent rules into a project, and a local MCP server that AI agents query. License: MIT.

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
- [Kit Format Specification](docs/kit-format.md): Folder layout, field specifications, and annotated schema examples.
- [Figma Naming Contract](docs/naming-contract.md): Strict naming rules and design constraints for Figma components.
- [Converter Core Documentation](docs/converter.md): Figma snapshots, mapping tables, warning codes, and converter API.
- [Plugin Documentation](docs/plugin.md): Figma plugin architecture, export pipeline, and Developer Mode.

## Quickstart

```bash
# Initialize Frame-Relay in your React + Tailwind v4 project
npx @josephbrendan/frame-relay init

# Sync design tokens, components, and agent rules from an exported kit zip
npx @josephbrendan/frame-relay sync --from ./frame-relay-kit.zip

# Verify your application code for design system compliance
npx @josephbrendan/frame-relay check
```

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
