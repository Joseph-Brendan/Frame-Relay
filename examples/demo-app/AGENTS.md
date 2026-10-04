<!-- frame-relay:start -->

# Frame-Relay Design Rules

You are building UI with the Frame-Relay design system. Follow these mandatory rules:

1. **Always use kit components**: Never write raw HTML `<button>`, `<input>`, `<select>`, `<textarea>` in application code. Import all components from `@/components/ui`.
2. **Tokens only**: Never write raw hex colors (`#...`), rgb/rgba, or Tailwind arbitrary values (`bg-[#...]`, `p-[10px]`). Use token utilities (`bg-primary-500`, `rounded-md`, `p-4`, `text-body`).
3. **Component States**: Use props (`disabled`, `loading`) or ARIA attributes (`aria-invalid="true"`) to trigger component states.
4. **Catalog Reference**: For component props, anatomy, guidelines, and visual screenshot paths, consult `.frame-relay/components.md`.

<!-- frame-relay:end -->
