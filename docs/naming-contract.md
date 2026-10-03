# Frame-Relay Figma Naming Contract

The Naming Contract defines the precise design conventions required in Figma files so that the Frame-Relay export plugin can deterministically generate valid, agent-ready kit specifications without human intervention.

## Contract Rules Table

| Figma Concept                   | Rule                                                                                                                                    | Example                                                                                                      |
| :------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------- |
| **Component Name**              | Must use PascalCase matching standard component identifiers.                                                                            | `Button`, `Input`, `DialogHeader`, `Card`                                                                    |
| **Standard Variant Properties** | Standard variant axes must use the exact names `Variant`, `Size`, and `State`.                                                          | `Variant=Primary`, `Size=Medium`, `State=Default`                                                            |
| **Interactive States**          | State variant property values must strictly use the fixed list: `Default`, `Hover`, `Focus`, `Pressed`, `Disabled`, `Loading`, `Error`. | `State=Hover`, `State=Disabled`                                                                              |
| **Part Layers (Anatomy)**       | Layer names representing functional anatomy parts must use `kebab-case`.                                                                | `root`, `icon-left`, `label`, `helper-text`, `field`                                                         |
| **Frame Auto Layout**           | Every component frame and composite part must use Figma Auto Layout.                                                                    | `Horizontal (row)`, `Gap: 8`, `Padding: 8 16 8 16`                                                           |
| **Variable Binding**            | All style values (color, radius, padding, gap, border) should be bound to Figma Variables or Token aliases.                             | Bound to Variable `color/primary/500` or `{radius.md}`                                                       |
| **Component Description**       | Must be written with a single concise purpose line, followed by bulleted `Do:` and `Don't:` lines.                                      | `Trigger an immediate action.<br>Do: Use Primary for main action.<br>Don't: Stack multiple Primary buttons.` |

---

## Why Each Rule Exists

- **PascalCase component names**: AI coding agents map component names directly to code files and JSX/HTML tags without needing name transformation heuristics.
- **Standard variant properties (`Variant`, `Size`, `State`)**: Uniform property naming allows the converter and CLI to generate consistent component props and predictable TypeScript type definitions across different teams.
- **Fixed state list**: Strict state naming ensures interactive pseudo-classes, state machines, and accessibility triggers map cleanly to web and mobile primitives.
- **kebab-case part layers**: Consistent kebab-case layer names enable reliable anatomy parsing and prevent random layer names (e.g. "Frame 1294") from breaking generated CSS rules.
- **Auto layout on every frame**: Auto layout coordinates translate directly to flexbox, CSS Grid, or native layout constraints without ambiguous absolute positioning.
- **Values bound to variables**: Direct variable bindings guarantee that generated code references semantic design tokens instead of hardcoded hex values or pixel numbers.
- **Structured component descriptions**: Standardized purpose lines and Do/Don't directives give LLMs clear, structured system prompts on when and how to generate component code.
