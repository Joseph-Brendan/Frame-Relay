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

## Local Setup

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
