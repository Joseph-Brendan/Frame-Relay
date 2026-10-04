# Frame-Relay Component Catalog & Agent Instructions

## Global Agent Rules

1. **Always use kit components**: Never write raw HTML `<button>`, `<input>`, `<select>`, `<textarea>` in application code. Import from `@/components/ui`.
2. **Tokens only**: Never write hex colors, rgb/rgba colors, or Tailwind arbitrary values (e.g. `bg-[#123]`, `p-[10px]`). Use design token classes (`bg-primary-500`, `rounded-md`, `p-4`, `text-body`).
3. **Trigger states cleanly**: Use component props (`disabled`, `loading`) or ARIA attributes (`aria-invalid="true"`) to trigger states.
4. **Preserve accessibility**: Maintain accessibility roles and keyboard interactions documented for each component.

---

## Button

```tsx
import { Button } from '@/components/ui';
```

**Purpose**: Trigger an immediate action or submission.

### Props

| Name       | Type      | Options                   | Default | Description                              |
| :--------- | :-------- | :------------------------ | :------ | :--------------------------------------- |
| `variant`  | `variant` | Primary, Secondary, Ghost | Primary | Visual priority of the action            |
| `size`     | `variant` | Medium, Large             | Medium  | Physical footprint and typography scale  |
| `disabled` | `boolean` | -                         | false   | Whether interactions are suppressed      |
| `label`    | `text`    | -                         | Button  | Text content displayed within the button |

### Variants

- **variant**: `Primary`, `Secondary`, `Ghost`
- **size**: `Medium`, `Large`

### States & Triggers

- **Default**: Default state
- **Hover**: Hover with cursor or pointer
- **Focus**: Focus via Tab key or focus-visible
- **Pressed**: Active mouse press or touch down
- **Disabled**: Pass `disabled={true}` or `aria-disabled="true"`
- **Loading**: Pass `loading={true}` or `data-loading="true"`

### Usage Guidelines

**Do:**

- Use Primary variant for the single most prominent action on a page or modal.
- Pair with concise, action-oriented verbs (e.g., Save, Submit, Next).
- Include a leading icon when it provides clear functional context.
  **Don't:**
- Do not place multiple Primary buttons next to each other.
- Do not disable a button without informing the user what is missing.
- Do not wrap button label text onto multiple lines.

### Accessibility

- **Role**: `button`
- Supports activation using Enter and Space keys.
- Sets aria-disabled when in the disabled state.
- Sets aria-busy when in the loading state.

### Visual Reference (Screenshots)

- `screenshots/Button--Primary-Medium-false--Default.png` (Default)
- `screenshots/Button--Primary-Medium-false--Hover.png` (Hover)
- `screenshots/Button--Secondary-Medium-false--Default.png` (Default)

---

## Input

```tsx
import { Input } from '@/components/ui';
```

**Purpose**: Capture single-line textual user input.

### Props

| Name         | Type      | Options | Default | Description                           |
| :----------- | :-------- | :------ | :------ | :------------------------------------ |
| `size`       | `variant` | Medium  | Medium  | Height and text sizing of input field |
| `label`      | `text`    | -       | Label   | Label text displayed above field      |
| `helperText` | `text`    | -       |         | Assistive message below field         |

### Variants

- **size**: `Medium`

### States & Triggers

- **Default**: Default state
- **Focus**: Focus via Tab key or focus-visible
- **Disabled**: Pass `disabled={true}` or `aria-disabled="true"`
- **Error**: Pass `error={true}` or `aria-invalid="true"`

### Usage Guidelines

**Do:**

- Always provide a permanent, visible label above the field.
- Use helper text for formatting rules or character limits.
- Show inline validation error messages directly in helper text upon blur or submit.
  **Don't:**
- Do not use placeholder text as a replacement for a label.
- Do not hide helper text when entering the error state.

### Accessibility

- **Role**: `textbox`
- Label must be linked to field using matching id and htmlFor.
- Helper text must be associated via aria-describedby.
- Set aria-invalid='true' when in the error state.

### Visual Reference (Screenshots)

- `screenshots/Input--Medium--Default.png` (Default)
- `screenshots/Input--Medium--Focus.png` (Focus)

---

## Card

```tsx
import { Card } from '@/components/ui';
```

**Purpose**: Group content and actions in a structured surface container.

### Props

| Name      | Type      | Options           | Default | Description             |
| :-------- | :-------- | :---------------- | :------ | :---------------------- |
| `variant` | `variant` | Default, Elevated | Default | Surface elevation style |

### Variants

- **variant**: `Default`, `Elevated`

### States & Triggers

- **Default**: Default state

### Usage Guidelines

**Do:**

- Use Card to present coherent units of content that belong together.
- Maintain consistent padding across card sections.
- Use Elevated variant to emphasize cards over a flat neutral canvas.
  **Don't:**
- Do not nest cards within cards unnecessarily.
- Do not crowd multiple primary actions inside the card footer.

### Accessibility

- **Role**: `region`
- Card header acts as a landmark heading for assistive tech.
- Focusable interactive cards must support tab stop navigation.

### Visual Reference (Screenshots)

- `screenshots/Card--Default--Default.png` (Default)
- `screenshots/Card--Elevated--Default.png` (Default)

---
