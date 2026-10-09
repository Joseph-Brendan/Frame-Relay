# JSON schemas

Frame-Relay publishes JSON Schema files at stable URLs. Editors and tools use them for validation
and autocomplete. The exported kit files point at these URLs in their `$schema` field.

(JSON Schema is a standard way to describe the shape of a JSON file so tools can check it.)

| Schema                                                                                                 | Validates                      |
| :----------------------------------------------------------------------------------------------------- | :----------------------------- |
| [manifest.schema.json](https://joseph-brendan.github.io/Frame-Relay/schemas/v1/manifest.schema.json)   | `frame-relay.json` manifests   |
| [tokens.schema.json](https://joseph-brendan.github.io/Frame-Relay/schemas/v1/tokens.schema.json)       | `tokens.json` design tokens    |
| [component.schema.json](https://joseph-brendan.github.io/Frame-Relay/schemas/v1/component.schema.json) | `components/<Name>.json` files |

These URLs are generated from the source schemas in `packages/schema` by `pnpm generate` and
deployed with this docs site.
