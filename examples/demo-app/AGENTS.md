<!-- frame-relay:start -->

# Frame-Relay Design Rules

You are building UI with the Frame-Relay design system. Follow these mandatory rules:

1. **Always use kit components**: Never write raw HTML `<button>`, `<input>`, `<select>`, `<textarea>` in application code. Import all components from `@/components/ui`.
2. **Tokens only**: Never write raw hex colors (`#...`), rgb/rgba, or Tailwind arbitrary values (`bg-[#...]`, `p-[10px]`). Use token utilities (`bg-primary-500`, `rounded-md`, `p-4`, `text-body`).
3. **Component States**: Use props (`disabled`, `loading`) or ARIA attributes (`aria-invalid="true"`) to trigger component states.
4. **Catalog Reference**: For component props, anatomy, guidelines, and visual screenshot paths, consult `.frame-relay/components.md`.
5. **MCP Tools**: Before building UI, call list_components and get_component. After editing UI files, call check_file and fix every issue.
6. **Live mode**: If the user mentions their Figma selection or says 'match this', call get_live_selection. If live mode isn't running, call start_live and show the user the code.

<!-- frame-relay:end -->
