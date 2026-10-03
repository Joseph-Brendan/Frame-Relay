# Frame-Relay Kit Format Specification (v1.0)

The Frame-Relay design kit is the standardized contract between the Figma export plugin, AI coding agents, the Frame-Relay CLI, and local MCP servers.

## Folder Layout

Every kit is contained within a folder named `frame-relay-kit/`:

```text
frame-relay-kit/
├── frame-relay.json                # Root manifest identifying kit metadata and components
├── tokens.json                     # Design tokens in W3C DTCG format with mode overrides
├── components/
│   └── <ComponentName>.json        # Individual component specifications (one per component)
├── screenshots/
│   └── <Component>--<Variants>--<State>.png   # Visual snapshots rendered from Figma
└── icons/
    └── <icon-name>.svg             # Scalable vector assets referenced in component specs
```

---

## 1. Manifest Specification (`frame-relay.json`)

The manifest file signals a valid kit and catalogs all components and modes:

| Field               | Type                  | Meaning                                                                |
| :------------------ | :-------------------- | :--------------------------------------------------------------------- |
| `$schema`           | `string` _(optional)_ | URI pointing to the hosted JSON Schema for validation.                 |
| `kitVersion`        | `string`              | The version of the Frame-Relay specification used (must be `"1.0"`).   |
| `name`              | `string`              | Human-readable title of the design kit.                                |
| `generator.name`    | `string`              | Name of the tool that generated the kit (e.g. `"frame-relay-plugin"`). |
| `generator.version` | `string`              | Version of the tool that exported the kit.                             |
| `source.type`       | `"figma"`             | The source platform for the design kit.                                |
| `source.fileKey`    | `string`              | Unique Figma file identifier where the designs originate.              |
| `source.fileName`   | `string`              | Display name of the source Figma document.                             |
| `source.page`       | `string` _(optional)_ | Specific page within the Figma file exported from.                     |
| `exportedAt`        | `string`              | ISO 8601 UTC timestamp recording when the kit was produced.            |
| `tokensFile`        | `string`              | Relative path to the tokens file (defaults to `"tokens.json"`).        |
| `modes`             | `string[]`            | Available visual themes or modes (e.g. `["light", "dark"]`).           |
| `components`        | `object[]`            | List of components included in the kit.                                |
| `components[].name` | `string`              | PascalCase name matching the component specification.                  |
| `components[].file` | `string`              | Relative file path to the component specification JSON file.           |

---

## 2. Tokens Specification (`tokens.json`)

Tokens adhere to the W3C Design Tokens Community Group (DTCG) specification with mode support:

| Field / Concept                    | Type                  | Meaning                                                                                                                      |
| :--------------------------------- | :-------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| `$value`                           | `unknown`             | Base default value (light mode), object definition, or token reference alias.                                                |
| `$type`                            | `string` _(optional)_ | Token category: `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `number`, `shadow`, `typography`, or `border`. |
| `$description`                     | `string` _(optional)_ | Context explaining intended usage of the token.                                                                              |
| `$extensions`                      | `object` _(optional)_ | Custom metadata dictionary for tool extensions.                                                                              |
| `$extensions["frame-relay"].modes` | `object`              | Alternative values keyed by mode name (e.g. `{"dark": "#0B1220"}`).                                                          |
| Group nesting                      | `object`              | Hierarchical containers organizing tokens (groups inherit `$type` to children).                                              |
| Token References                   | `string`              | An alias formatted as `{path.to.token}` resolving to another token in the tree.                                              |

---

## 3. Component Specification (`components/<ComponentName>.json`)

Each component is described by an anatomy, property schema, base styles, variant modifiers, and interactive states:

| Field                   | Type                           | Meaning                                                                                |
| :---------------------- | :----------------------------- | :------------------------------------------------------------------------------------- |
| `$schema`               | `string` _(optional)_          | URI pointing to the component JSON Schema.                                             |
| `name`                  | `string`                       | PascalCase identifier matching the component filename.                                 |
| `description`           | `string`                       | Single-sentence summary of the component's UI purpose.                                 |
| `category`              | `string` _(optional)_          | Classification: `action`, `input`, `display`, `layout`, `feedback`, or `navigation`.   |
| `anatomy`               | `object[]`                     | Declared layer structure identifying sub-parts of the component.                       |
| `anatomy[].name`        | `string`                       | kebab-case name of the sub-part (e.g. `root`, `icon-left`, `label`).                   |
| `anatomy[].description` | `string`                       | Functional role of this layer within the component.                                    |
| `anatomy[].required`    | `boolean`                      | Indicates whether the sub-part is always rendered or optional.                         |
| `props`                 | `object[]`                     | Public configurable properties accepted by the component.                              |
| `props[].name`          | `string`                       | camelCase prop name or standard variant property (`Variant`, `Size`, `State`).         |
| `props[].type`          | `string`                       | Prop data type: `variant`, `boolean`, `text`, or `instance`.                           |
| `props[].options`       | `string[]`                     | Set of unique possible values (required when `type` is `variant`).                     |
| `props[].default`       | `string \| boolean \| number`  | Fallback initial value when prop is omitted.                                           |
| `props[].description`   | `string` _(optional)_          | Guidance on how this prop influences component rendering.                              |
| `layout`                | `object` _(optional)_          | Auto layout rules applied to the root part.                                            |
| `layout.direction`      | `"row" \| "column"`            | Primary flex distribution axis.                                                        |
| `layout.gap`            | `StyleValue` _(optional)_      | Spacing between direct child parts.                                                    |
| `layout.padding`        | `object` _(optional)_          | Inset padding (`top`, `right`, `bottom`, `left`).                                      |
| `layout.justify`        | `string` _(optional)_          | Main-axis alignment (`start`, `center`, `end`, `space-between`).                       |
| `layout.align`          | `string` _(optional)_          | Cross-axis alignment (`start`, `center`, `end`, `baseline`, `stretch`).                |
| `layout.width`          | `"hug" \| "fill" \| { fixed }` | Horizontal sizing constraint.                                                          |
| `layout.height`         | `"hug" \| "fill" \| { fixed }` | Vertical sizing constraint.                                                            |
| `base`                  | `object`                       | Map of anatomy part name to default `StyleBlock`.                                      |
| `variants`              | `object[]`                     | Style overrides activated when specific props match.                                   |
| `variants[].props`      | `object`                       | Key-value pairs of prop conditions that activate this variant.                         |
| `variants[].styles`     | `object`                       | Partial map of anatomy part name to style overrides.                                   |
| `states`                | `object[]`                     | Visual overrides for interactive states.                                               |
| `states[].name`         | `string`                       | Allowed state: `Default`, `Hover`, `Focus`, `Pressed`, `Disabled`, `Loading`, `Error`. |
| `states[].styles`       | `object`                       | Partial map of anatomy part name to style overrides for this state.                    |
| `usage.do`              | `string[]`                     | Recommended implementation practices for developers and agents.                        |
| `usage.dont`            | `string[]`                     | Anti-patterns and discouraged patterns.                                                |
| `accessibility.role`    | `string` _(optional)_          | Semantic WAI-ARIA role (e.g. `"button"`, `"textbox"`).                                 |
| `accessibility.notes`   | `string[]` _(optional)_        | Keyboard interaction, aria attributes, and assistive guidelines.                       |
| `screenshots`           | `object[]`                     | Visual snapshot references for multimodal agents and verification.                     |
| `screenshots[].variant` | `object`                       | Prop values depicted in the image.                                                     |
| `screenshots[].state`   | `string`                       | Interactive state depicted (must be in `states` or `"Default"`).                       |
| `screenshots[].path`    | `string`                       | Relative path to screenshot file under `screenshots/`.                                 |
| `source`                | `object` _(optional)_          | Figma layer IDs for bidirectional sync (`figmaNodeId`, `figmaComponentKey`).           |

### Style Values (`StyleValue`)

A `StyleValue` represents any styling parameter and must be either:

1. **Token Reference**: A path wrapped in curly braces (e.g. `"{radius.md}"`, `"{color.primary.500}"`).
2. **Raw Value**: An object with a raw string (e.g. `{ "raw": "13px" }`), recording values not yet tokenized in Figma.

### Style Blocks (`StyleBlock`)

A `StyleBlock` contains optional `StyleValue` fields:
`background`, `color`, `borderColor`, `borderWidth`, `borderRadius`, `boxShadow`, `typography`, `opacity`, `iconSize`.

---

## 4. Annotated Button Example

```json
{
  "$schema": "https://joseph-brendan.github.io/Frame-Relay/schemas/v1/component.schema.json",
  "name": "Button",
  "description": "Trigger an immediate action or submission.",
  "category": "action",

  /* 1. Declared layer anatomy */
  "anatomy": [
    { "name": "root", "description": "Interactive container", "required": true },
    { "name": "icon-left", "description": "Optional leading icon", "required": false },
    { "name": "label", "description": "Button label text", "required": true }
  ],

  /* 2. Public component properties */
  "props": [
    {
      "name": "variant",
      "type": "variant",
      "options": ["Primary", "Secondary", "Ghost"],
      "default": "Primary"
    },
    { "name": "disabled", "type": "boolean", "default": false }
  ],

  /* 3. Auto layout settings for root part */
  "layout": {
    "direction": "row",
    "gap": "{space.2}",
    "padding": {
      "top": "{space.2}",
      "right": "{space.4}",
      "bottom": "{space.2}",
      "left": "{space.4}"
    },
    "justify": "center",
    "align": "center",
    "width": "hug",
    "height": "hug"
  },

  /* 4. Default baseline appearance */
  "base": {
    "root": {
      "background": "{color.primary.500}",
      "color": "{color.neutral.0}",
      "borderRadius": "{radius.md}",
      "typography": "{typography.button}"
    },
    "label": { "color": "{color.neutral.0}", "typography": "{typography.button}" }
  },

  /* 5. Variant visual overrides */
  "variants": [
    {
      "props": { "variant": "Secondary" },
      "styles": {
        "root": { "background": "{color.neutral.100}", "color": "{color.neutral.900}" },
        "label": { "color": "{color.neutral.900}" }
      }
    }
  ],

  /* 6. Interactive state overrides */
  "states": [
    { "name": "Default", "styles": {} },
    { "name": "Hover", "styles": { "root": { "background": "{color.primary.600}" } } }
  ],

  /* 7. Usage guidelines for agents & devs */
  "usage": {
    "do": ["Use Primary variant for the main intended action on a screen"],
    "dont": ["Do not place more than one Primary button in the same container"]
  },

  /* 8. Accessibility roles and expectations */
  "accessibility": {
    "role": "button",
    "notes": ["Supports activation via Enter and Space keys"]
  },

  /* 9. Visual screenshot references */
  "screenshots": [
    {
      "variant": { "variant": "Primary", "disabled": false },
      "state": "Default",
      "path": "screenshots/Button--Primary-false--Default.png"
    }
  ]
}
```
