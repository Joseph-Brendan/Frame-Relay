# Frame-Relay Figma Plugin

The **Frame-Relay Plugin** extracts design tokens, component specifications, SVG icons, and 2x screenshots directly from Figma files into a deterministic, agent-ready design kit.

---

## Architecture Overview

The plugin operates with a strict process boundary:

1. **Main Thread (`src/main/`)**:
   - Executes inside Figma's sandboxed environment with access to the `figma` runtime API.
   - Runs with `documentAccess: "dynamic-page"` using async traversal APIs (`loadAllPagesAsync`, `getNodeByIdAsync`, `setCurrentPageAsync`).
   - Copies Figma nodes into plain snapshot data structures (`snapshotNode`), reads variable collections, exports 2x PNG screenshots, and selects canvas layers.
   - In live mode, watches `selectionchange` while the UI is connected, resolves the selected layer (component, variant, instance or frame), snapshots it, exports a PNG preview and forwards it to the UI. It never opens a network connection.
   - Never loads DOM or heavy external dependencies.

2. **UI Thread (`src/ui/`)**:
   - Executes inside an iframe with full DOM access and native CSS variables matching Figma's theme colors.
   - Runs pure token and component conversion (`@frame-relay/converter`), runs schema validation (`@frame-relay/schema`), assembles kit files, and builds ZIP archives using `JSZip`.
   - In live mode, **only this iframe opens the WebSocket** to the local MCP bridge and sends the converted selection.
   - Never accesses the `figma` API.

3. **Message Protocol (`src/shared/messages.ts`)**:
   - All communication passes through typed messages with explicit schema versioning (`version: 1`).

---

## Plugin Tabs

### 1. Lint Tab

- **Purpose**: Runs a dry-run check against the Frame-Relay naming contract and design system guidelines without taking screenshots or exporting files.
- **Features**:
  - **Check File / Check Selection**: Scans the chosen scope and displays real-time progress.
  - **Severity Filters**: Filter issues by **All**, **Errors**, **Warnings**, or **Info** with badge counts.
  - **Component Accordions**: Groups warnings under each component name.
  - **Direct Layer Selection**: Click the **Select** button on any warning to jump immediately to the problematic layer in Figma, zoom in, and highlight it on the canvas.

### 2. Export Tab

- **Purpose**: Assembles and downloads the complete `.zip` kit package.
- **Workflow**:
  1. Shows a summary of the current scope: component count, icon count, token count, modes, and warning counts.
  2. Click **Export Kit (.zip)** to convert tokens, parse component specifications, capture 2x preview PNG screenshots in batches of 10, export SVG icons, and assemble kit files.
  3. Validates the generated kit using `validateKit`. If schema validation errors exist, a clear banner highlights them while still permitting download.
  4. Downloads the archive as `frame-relay-kit-<file-name>-<YYYY-MM-DD>.zip`.

### 3. Live Tab

- **Purpose**: Share the current Figma selection with a local AI agent in real time ("match this").
- **Workflow**:
  1. The agent calls the `start_live` MCP tool and shows you a 6-digit pairing code.
  2. Enter the code in the Live tab and click **Connect**. The tab tries the local ports `47321-47323` in order and stores a session token in `figma.clientStorage` for reconnects.
  3. Select a single layer: a component or component set is converted to a component spec, a variant resolves to its set, an instance resolves to its main component, and anything else becomes a frame summary. A 2x PNG preview is attached (dropping to 1x/0.5x if larger than 4 MB).
  4. The agent calls `get_live_selection` and receives the spec, preview, warnings and a diff against the last exported kit.
  5. Click **Disconnect** to send `bye` and clear the token.
- **Privacy**: Live mode only talks to Frame-Relay on your computer (`127.0.0.1`); nothing is uploaded. The manifest's `networkAccess` allows only `ws://localhost:47321-47323`.

---

## Settings & Developer Tools

Click the **Gear Icon** in the header to configure:

- **Default Scope**: Toggle between **Whole file** (scans all pages in the file) or **Selection** (scans only currently selected components/frames). Scope is remembered via `figma.clientStorage`.
- **Developer Mode**: Enables diagnostic tools.
- **Dump Snapshots**: When developer mode is active, exports raw component snapshots, variable snapshots, and style indexes into a single debug JSON file (`frame-relay-dump-<file-name>-<YYYY-MM-DD>.json`).

---

## The Icon Export Rule

Components representing icons receive special handling during extraction:

- **Detection**: Any component whose name starts with `Icon/` or `icon-`, or which is located on a page named `Icons` (case-insensitive).
- **Export**: Exported directly as an SVG vector string to `icons/<kebab-name>.svg` via `exportAsync({ format: 'SVG_STRING' })`.
- **Skipped from Component Specs**: Icons are not converted into multi-variant component specs (`components/*.json`), keeping UI component models clean and lightweight.

---

## Troubleshooting Warnings

When the linter or export reports warnings, use the guide below to resolve them in Figma:

| Warning Code              | Severity | Cause                                                           | How to Fix in Figma                                                                                |
| :------------------------ | :------- | :-------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| `NOT_A_COMPONENT`         | Error    | Node is not a `COMPONENT` or `COMPONENT_SET`.                   | Select the layer and turn it into a Component or Component Set.                                    |
| `INVALID_NAME`            | Warning  | Component name is not `PascalCase`.                             | Rename the component to PascalCase (e.g. `PrimaryButton`, `ModalHeader`).                          |
| `NOT_AUTO_LAYOUT`         | Warning  | A frame or component does not use Auto Layout.                  | Select the frame and press `Shift + A` to enable Auto Layout.                                      |
| `RAW_VALUE`               | Warning  | Style property uses hardcoded color/size instead of a Variable. | Bind the fill, stroke, gap, or padding to a local Figma Variable.                                  |
| `UNRECOGNIZED_STATE`      | Warning  | State variant value is not in the standard state list.          | Set state value to one of: `Default`, `Hover`, `Focus`, `Pressed`, `Disabled`, `Loading`, `Error`. |
| `UNRESOLVED_TOKEN`        | Warning  | Style alias references a token path that does not exist.        | Create the missing variable or update the style alias.                                             |
| `SCHEMA_VALIDATION_ERROR` | Error    | Kit manifest or component spec fails schema validation.         | Inspect the validation banner on the Export tab for the affected path.                             |
