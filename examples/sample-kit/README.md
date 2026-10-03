# Frame-Relay Sample Kit

A hand-written, validated design kit matching the Frame-Relay Kit Specification (Version 1.0).

## Structure

```text
frame-relay-kit/
├── frame-relay.json                # Kit manifest
├── tokens.json                     # DTCG tokens (light + dark modes)
├── components/
│   ├── Button.json                 # Button component specification
│   ├── Input.json                  # Input component specification
│   └── Card.json                   # Card component specification
├── screenshots/                    # Component visual snapshots
│   ├── Button--Primary-Medium-false--Default.png
│   ├── Button--Primary-Medium-false--Hover.png
│   ├── Button--Secondary-Medium-false--Default.png
│   ├── Input--Medium--Default.png
│   ├── Input--Medium--Focus.png
│   ├── Card--Default--Default.png
│   └── Card--Elevated--Default.png
└── icons/
    └── check.svg                   # Exported icon asset
```

## Notes

- **Screenshots**: The PNGs currently in `screenshots/` are lightweight placeholder images following the `<Component>--<Variants>--<State>.png` naming convention. During Phase 3, the Figma export plugin will replace these with high-fidelity rendered visual exports directly from Figma canvases.
- **Deliberate Raw Value**: In `components/Card.json`, the `body.borderRadius` field uses `{ "raw": "13px" }` instead of a token reference. This is a deliberate inclusion used to verify that `findRawValues` correctly detects unbound Figma values for agent linting.
