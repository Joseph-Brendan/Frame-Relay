# Frame-Relay Converter Core

`@josephbrendan/converter` is the core transformation engine of Frame-Relay. It transforms plain Figma snapshot trees into validated Kit Component Specs (`ComponentSpec`) and Figma variable collections into W3C Design Tokens Community Group (DTCG) token files.

Both **Export Mode** (Figma plugin zip export) and **Live Mode** (WebSocket live bridge) consume this package.

---

## 1. What a Snapshot Is and Why

The converter **never** interacts directly with the Figma Plugin API (`figma` global) or imports `@figma/plugin-typings`. Instead, the Figma plugin traverses Figma nodes and shallowly copies them into plain, serializable JavaScript objects called **snapshots** (`NodeSnapshot`).

### Why Snapshots?

1. **Strict Purity**: The converter consists exclusively of pure functions. Given identical input snapshots, styles, and variables, it produces byte-identical output JSON.
2. **Zero Runtime Dependencies**: No `figma` runtime, no Node.js `fs` or `path`, no network calls, and no clock access (`Date.now()`). This is enforced via ESLint restricted imports and globals.
3. **Portability**: The same converter runs seamlessly in browser workers, Figma plugin sandboxes, Node.js CLI tools, edge workers, and MCP server processes.
4. **Deterministic Testing**: Fixtures can be committed as static `.json` snapshots and tested with millisecond-speed unit and golden tests without mocking the Figma engine.

---

## 2. Figma to Spec Mapping Reference

### 2.1 Layout Mapping

Layout rules from the root component frame map directly to Kit `layout`:

| Figma Property                 | Snapshot Value                                        | Kit Layout Property               | Mapping & Fallback Behavior                                                                      |
| :----------------------------- | :---------------------------------------------------- | :-------------------------------- | :----------------------------------------------------------------------------------------------- |
| `layoutMode`                   | `'HORIZONTAL'`                                        | `direction: "row"`                | Maps to horizontal flex flow.                                                                    |
| `layoutMode`                   | `'VERTICAL'`                                          | `direction: "column"`             | Maps to vertical flex stack.                                                                     |
| `layoutMode`                   | `'NONE'`                                              | _(omitted)_                       | Emits `NO_AUTO_LAYOUT` warning if frame contains children.                                       |
| `itemSpacing`                  | `number`                                              | `gap`                             | Token reference `{space.*}` if bound; raw px `{ raw: "8px" }` + `RAW_VALUE` warning if unbound.  |
| `paddingTop/Right/Bottom/Left` | `number`                                              | `padding.{top,right,bottom,left}` | Token reference `{space.*}` if bound; raw px `{ raw: "16px" }` + `RAW_VALUE` warning if unbound. |
| `primaryAxisAlignItems`        | `'MIN'` \| `'CENTER'` \| `'MAX'` \| `'SPACE_BETWEEN'` | `justify`                         | `'start'`, `'center'`, `'end'`, or `'space-between'`.                                            |
| `counterAxisAlignItems`        | `'MIN'` \| `'CENTER'` \| `'MAX'` \| `'BASELINE'`      | `align`                           | `'start'`, `'center'`, `'end'`, or `'baseline'`.                                                 |
| `layoutSizingHorizontal`       | `'HUG'` \| `'FILL'` \| `'FIXED'`                      | `width`                           | `'hug'`, `'fill'`, or `{ fixed: "{token}" \| { raw } }`.                                         |
| `layoutSizingVertical`         | `'HUG'` \| `'FILL'` \| `'FIXED'`                      | `height`                          | `'hug'`, `'fill'`, or `{ fixed: "{token}" \| { raw } }`.                                         |
| `layoutPositioning`            | `'ABSOLUTE'`                                          | _(none)_                          | Emits `ABSOLUTE_CHILD` warning.                                                                  |

### 2.2 Style Mapping

Styles on each part node are converted into a `StyleBlock`:

| Figma Style                 | Node Type   | StyleBlock Field | Mapping & Token Binding                                                                                                                                  |
| :-------------------------- | :---------- | :--------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fills[0]`                  | `TEXT`      | `color`          | Bound token `{color.*}`, or hex `{ raw: "#1e293b" }` + `RAW_VALUE`.                                                                                      |
| `fills[0]`                  | Other nodes | `background`     | Bound token `{color.*}`, or hex `{ raw: "#2563eb" }` + `RAW_VALUE`.                                                                                      |
| `fills[0]` (gradient/image) | Any         | _(skipped)_      | Emits `UNSUPPORTED_PAINT` warning.                                                                                                                       |
| `strokes[0]`                | Any         | `borderColor`    | Bound token `{color.*}`, or hex `{ raw: "#cbd5e1" }` + `RAW_VALUE`.                                                                                      |
| `strokeWeight`              | Any         | `borderWidth`    | Bound token `{space.*}`, or px `{ raw: "1px" }` + `RAW_VALUE`.                                                                                           |
| `cornerRadius`              | Any         | `borderRadius`   | Uniform token `{radius.*}`; raw px if equal; `{ raw: "4px 8px 12px 16px" }` + `MIXED_RADIUS` warning if mixed.                                           |
| `effects` / `effectStyleId` | Any         | `boxShadow`      | Style token `{shadow.*}` if bound to style; otherwise CSS string `{ raw: "0 2px 4px rgba(...)" }` + `RAW_VALUE`. Blur effects emit `UNSUPPORTED_EFFECT`. |
| `textStyleId` / font fields | `TEXT`      | `typography`     | Style token `{typography.*}` if bound; otherwise CSS shorthand `{ raw: "600 14px/20px Inter" }` + `RAW_VALUE`.                                           |
| `opacity` (< 1)             | Any         | `opacity`        | Bound token `{opacity.*}`, or raw string `{ raw: "0.8" }` + `RAW_VALUE`.                                                                                 |
| `width` (layer `icon-*`)    | `icon-*`    | `iconSize`       | Bound token `{space.*}`, or raw px `{ raw: "16px" }` + `RAW_VALUE`.                                                                                      |

### 2.3 Anatomy and Parts

- **Root Part**: Always named `"root"`.
- **Child Parts**: Any descendant layer whose name matches the `PART_NAME_REGEX` (`kebab-case`, e.g. `icon-left`, `label`, `helper-text`) is registered as an anatomy part.
- **Default Names**: Layers named like `"Frame 12"` or `"Rectangle 4"` that carry visible fills, strokes, or effects trigger a `BAD_PART_NAME` warning.
- **Duplicate Names**: Multiple layers sharing a part name trigger `DUPLICATE_PART_NAME` (the first layer encountered is preserved).
- **Required Parts**: A part is marked `required: true` if it is visible across all variants and its visibility is not bound to a boolean prop (`componentPropertyReferences.visible`).

### 2.4 Props, Variants, and States

- **Property Definitions**: Read from `componentPropertyDefinitions` (or discovered from children's `variantProperties`). Suffixes like `#12:3` are stripped, and names are converted to `camelCase`.
- **State Property**: The `State` variant property (case-insensitive) is converted into `states`, **never** a component prop. State names must strictly belong to `STATE_NAMES`:
  - Allowed: `Default`, `Hover`, `Focus`, `Pressed`, `Disabled`, `Loading`, `Error`.
  - Non-standard states emit `UNKNOWN_STATE` and are skipped.
  - If interactive states exist without `State=Default`, `MISSING_DEFAULT_STATE` error is emitted.
- **Base Styles**: Extracted from the component whose variant props are all at their default values with `State=Default`.
- **Variants**: One entry per combination of non-state props at `State=Default`. Each entry records only the style properties that differ from `base`.
- **States**: Visual overrides for each interactive state comparing the default-props component in that state against `State=Default`.
- **Standalone Components**: A single `COMPONENT` with no set receives `base`, empty `variants: []`, and `states: [{ name: "Default", styles: {} }]`.

### 2.5 Description Parsing

Figma component descriptions are parsed into structured documentation:

- The first line that does not begin with a known directive becomes `description`.
- `Do: ...` lines become `usage.do`.
- `Don't: ...`, `Dont: ...`, or `Do not: ...` lines become `usage.dont`.
- `Role: ...` lines become `accessibility.role`.
- `A11y: ...` or `Accessibility: ...` lines become `accessibility.notes`.
- An empty description emits `MISSING_DESCRIPTION`.
- Descriptions lacking Do or Don't directives emit `MISSING_USAGE`.

### 2.6 Screenshot Jobs

For every variant combination and state, the converter yields a `ScreenshotJob`:

```ts
{
  nodeId: "1:24",
  path: "screenshots/Button--Primary-Medium-false--Default.png"
}
```

The naming convention strictly follows:
`screenshots/<Component>--<variant values joined by ->--<State>.png`

---

## 3. Warning Codes Reference

Every warning contains `code`, `severity` (`error`, `warning`, `info`), `component`, `layerPath`, optional `nodeId`, and a plain English `message`.

| Code                            | Severity  | Meaning                                                                 | Actionable Fix                                                                                      |
| :------------------------------ | :-------- | :---------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| `NOT_A_COMPONENT`               | `error`   | Target node is not a `COMPONENT` or `COMPONENT_SET`.                    | Select a component or component set in Figma.                                                       |
| `BAD_COMPONENT_NAME`            | `warning` | Component name is not PascalCase (e.g. `text input`).                   | Rename to PascalCase (e.g. `TextInput`).                                                            |
| `MISSING_DESCRIPTION`           | `warning` | Component has no description text in Figma.                             | Add a concise, single-sentence summary of the component's purpose.                                  |
| `MISSING_USAGE`                 | `warning` | Description lacks `Do:` or `Don't:` usage rules.                        | Add at least one `Do:` and one `Don't:` line in Figma.                                              |
| `NO_AUTO_LAYOUT`                | `warning` | Frame has child layers but does not use Auto Layout.                    | Enable Auto Layout (`Shift + A`) on the frame.                                                      |
| `ABSOLUTE_CHILD`                | `warning` | Child layer uses absolute positioning.                                  | Switch the child layer to Auto Layout flow positioning.                                             |
| `BAD_PART_NAME`                 | `warning` | Layer with visible styling uses a default Figma name (e.g. `Frame 12`). | Rename layer to a kebab-case part name (e.g. `icon-left`, `field`).                                 |
| `DUPLICATE_PART_NAME`           | `warning` | Multiple layers in the same component share a part name.                | Ensure anatomy part names are unique within the component.                                          |
| `UNKNOWN_STATE`                 | `warning` | State variant value is not in `STATE_NAMES`.                            | Rename the state to one of: `Default`, `Hover`, `Focus`, `Pressed`, `Disabled`, `Loading`, `Error`. |
| `MISSING_DEFAULT_STATE`         | `error`   | Set has interactive states but lacks `State=Default`.                   | Add a `State=Default` variant component to the set.                                                 |
| `NON_STANDARD_VARIANT_PROPERTY` | `info`    | Variant axis is not `Variant`, `Size`, or `State`.                      | Consider standardizing property names to `Variant`, `Size`, or `State`.                             |
| `UNSUPPORTED_PAINT`             | `warning` | Fill uses an unsupported paint type (e.g. gradient or image).           | Use solid fills bound to color variables.                                                           |
| `UNSUPPORTED_EFFECT`            | `warning` | Effect uses an unsupported type (e.g. blur).                            | Use drop shadows or inner shadows bound to effect styles.                                           |
| `MIXED_RADIUS`                  | `warning` | Layer uses non-uniform corner radii.                                    | Use uniform corner radii bound to a radius token.                                                   |
| `RAW_VALUE`                     | `warning` | Layout dimension or style is not bound to a variable.                   | Bind the property to a Figma variable or text/effect style.                                         |
| `UNSUPPORTED_VARIABLE_TYPE`     | `warning` | Variable type cannot be represented as DTCG token (e.g. boolean).       | Use standard COLOR, FLOAT, or font family STRING variables.                                         |
| `SCHEMA_VALIDATION_ERROR`       | `error`   | Spec or kit failed `@josephbrendan/schema` validation.                  | Fix schema validation issues detailed in the warning message.                                       |

---

## 4. Public API

### `convertComponent(options)`

```ts
export function convertComponent(options: {
  node: unknown;
  variables: VariableIndex;
  styles: StyleIndex;
}): {
  spec: ComponentSpec | null;
  warnings: ConverterWarning[];
  screenshotJobs: ScreenshotJob[];
};
```

### `assembleKit(options)`

```ts
export function assembleKit(options: {
  components: ComponentSpec[];
  tokens: unknown;
  source: ManifestSource;
  generator: ManifestGenerator;
  exportedAt: string; // ISO 8601 string, never read from clock
  name?: string;
  modes?: string[];
}): {
  files: Record<string, string>;
  warnings: ConverterWarning[];
};
```

### `convertVariables(options)`

```ts
export function convertVariables(input: {
  collections: VariableCollectionSnapshot[];
  variables: VariableSnapshot[];
}): {
  tokens: TokensFile;
  variableIndex: VariableIndex;
  warnings: ConverterWarning[];
};
```
