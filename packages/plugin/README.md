# @frame-relay/plugin

Figma plugin for **Frame-Relay** that lints design systems and exports agent-ready design kits.

> **Note**: This package is private and is never published to npm.

- **Brand Name**: Frame-Relay
- **Figma Plugin ID**: `1688306391908778327`
- **Document Access**: `dynamic-page`

---

## Building the Plugin

From the repository root or inside `packages/plugin`:

```bash
# Build production bundle (dist/code.js and dist/ui.html)
pnpm --filter @frame-relay/plugin build

# Start watch mode for active development
pnpm --filter @frame-relay/plugin dev

# Run TypeScript type check
pnpm --filter @frame-relay/plugin typecheck

# Run test suite
pnpm --filter @frame-relay/plugin test
```

Build outputs:

- `dist/code.js`: Main thread sandboxed JS bundle (ES2017 target).
- `dist/ui.html`: Completely self-contained UI bundle with inlined JS and CSS (zero external network requests or CDN dependencies).

---

## How to Import in Figma Desktop

1. Open **Figma Desktop**.
2. Open any design file.
3. In the Figma menu, navigate to:
   **Plugins** > **Development** > **Import plugin from manifest...**
4. Select `packages/plugin/manifest.json` from this repository.
5. **Frame-Relay** will now appear under your **Development** plugins menu. Run it by pressing `Cmd + /` (or `Ctrl + /`), typing `Frame-Relay`, and pressing Enter.

---

## Using Developer Mode & Dumping Snapshots

1. Click the **Gear Icon** in the top-right header of the Frame-Relay plugin window.
2. Toggle **Developer Mode** on.
3. Click the **Dump Snapshots (.json)** button.
4. The plugin will collect all component snapshots, local and library variables, and style indexes for the selected scope and prompt you to save `frame-relay-dump-<file-name>-<YYYY-MM-DD>.json`.

---

## Validating an Exported Kit

You can validate any generated `.zip` package from the command line using the built-in validator:

```bash
pnpm --filter @frame-relay/plugin validate-kit path/to/frame-relay-kit.zip
```

The script unzips the archive in memory, validates the manifest and all component and token schemas with `@frame-relay/schema`, checks that all referenced 2x screenshots and SVG icons exist, and reports errors or passes with exit code `0`.
