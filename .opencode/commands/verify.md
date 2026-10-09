---
description: Run the full Frame-Relay verification pipeline and summarize PASS/FAIL.
---

Run the repository's full verification pipeline and report a PASS/FAIL summary. Do not fix
anything unless the user asks.

Run each command from the repository root, capture the exit code, and keep the output for
failures:

1. `pnpm install --frozen-lockfile`
2. `pnpm format:check`
3. `pnpm lint`
4. `pnpm typecheck`
5. `pnpm build`
6. `pnpm test`

Then run the plugin bundle checks against `packages/plugin/dist/`:

- `dist/code.js` and `dist/ui.html` exist.
- `grep -nE "^[[:space:]]*(import|export)[[:space:]({]" packages/plugin/dist/code.js` returns
  nothing.
- `grep -nE "^await[[:space:]]" packages/plugin/dist/code.js` returns nothing.
- `grep -nE "\b(process|Buffer|setImmediate)\b" packages/plugin/dist/code.js` returns nothing.
- `grep -nE "<script[^>]+src=|<link[^>]+href=" packages/plugin/dist/ui.html` returns nothing.
- `packages/plugin/manifest.json` has `documentAccess: "dynamic-page"`, and
  `networkAccess.allowedDomains` allows `ws://localhost:47321`, `ws://localhost:47322` and
  `ws://localhost:47323` with a non-empty `reasoning` string.

Finish with a markdown table of every check (`Check | Command | Result`) using PASS or FAIL.
For every FAIL, include the failing command and the relevant output lines. End with one line:
`VERDICT: GO` if everything passed, otherwise `VERDICT: FAILED CHECKS`.
