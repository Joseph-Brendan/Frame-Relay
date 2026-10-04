# Frame-Relay Design Rules

1. **Always use kit components**: Never write raw HTML `<button>`, `<input>`, `<select>`, `<textarea>`. Import from `@/components/ui`.
2. **Tokens only**: Never write raw hex colors or arbitrary values (e.g. `bg-[#123]`, `p-[10px]`). Use design token classes (`bg-primary-500`, `rounded-md`, `p-4`, `text-body`).
3. **Component States**: Trigger states via declared props (`disabled`, `loading`) or ARIA attributes (`aria-invalid="true"`).
4. **Catalog Reference**: For component props, anatomy, and guidelines, consult `.frame-relay/components.md`.
5. **MCP Tools**: Before building UI, call list_components and get_component. After editing UI files, call check_file and fix every issue.
