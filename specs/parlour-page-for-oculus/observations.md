# Observations — Parlour Page for Oculus

## Refactoring Opportunities

1. **LoomApi lacks `listRoles()`**. The Loom owns role definitions (both guild-defined and kit-contributed) but provides no way to enumerate them externally. Adding `listRoles(): string[]` or `listRoles(): Record<string, RoleDefinition>` to `LoomApi` would benefit the Parlour page, any future admin UI, and tooling. Currently, the page must read `guildConfig().loom?.roles` directly, which only covers guild-defined roles — kit-contributed roles are invisible. This is a candidate for a separate small commission on the Loom apparatus.

2. **`parlour.list()` has no participant filter**. The `ListConversationsOptions` type supports `status`, `kind`, and `limit` but not participant name. For the page, a custom route works around this with in-memory filtering. If other consumers need per-participant listing (e.g., "show all conversations involving the scribe"), a `participantName` or `participantNames` filter should be added to `ListConversationsOptions` and implemented as a JSON path query or in-memory filter in `parlour.list()`.

3. **No `conversation-create` tool**. The Parlour has tools for list, show, and end — but not create. This is presumably intentional (creating conversations programmatically from a tool call is unusual). But if the web UI needs a create route, future CLI consult commands would benefit from a shared tool too. Worth considering whether a `conversation-create` tool should exist.

## Suboptimal Conventions Followed

4. **Duck-typed supportKit**. The `supportKit` object on apparatus plugins is untyped — the Oculus casts it to `OculusKit`, the Stacks checks for `books`, the Instrumentarium checks for `tools`. This works but means contributors get no type checking on their supportKit shape. A future improvement could use a typed union or intersection approach for supportKit contributions. For now, the Parlour page follows the existing duck-typed pattern.

5. **Static files in `src/`**. Placing the page's HTML/CSS/JS in `src/static/parlour/` alongside TypeScript source is slightly unconventional. The `files` array in package.json currently only includes `dist`. Adding `src/static` to `files` works but ships raw source alongside compiled output. A cleaner approach long-term would be a `static/` top-level directory or a build step that copies static assets into `dist/`. Followed `src/static/` for consistency with the Oculus's own `src/static/style.css`.

## Doc/Code Discrepancies

6. **TurnSummary in parlour.md vs types.ts**. The spec document (`docs/architecture/apparatus/parlour.md`) defines `TurnSummary` with `prompt`, `exitCode`, `costUsd`, `durationMs` fields. The actual type in `types.ts` has `message` (not `prompt`) and lacks `exitCode`, `costUsd`, `durationMs`. The spec is stale — it predates the implementation decisions documented in `parlour-implementation-tracker.md`. The spec should be updated to match the code.

7. **`SessionDoc.output` not mentioned in parlour.md**. The Parlour spec doesn't discuss using `SessionDoc.output` for conversation display, even though it's available and essential for the chat UI. The spec's inter-turn context section mentions the gap but frames it as a convene problem, not a display problem.

## Potential Risks

8. **First page contribution**. The Parlour page is the first real Oculus page in the codebase. The page contribution and chrome injection mechanisms have only been tested with synthetic pages in `oculus.test.ts`. There may be edge cases with the page serving (e.g., relative paths in JS/CSS imports, interaction between injected chrome and page styles) that only surface with a real page.

9. **SSE with Hono + @hono/node-server**. While Hono 4.x supports `streamSSE`, the interaction between `@hono/node-server` and long-lived SSE connections hasn't been tested in this codebase. Connection lifecycle (client disconnect detection, server-side cleanup of abandoned streams) needs careful handling to avoid resource leaks.

10. **`SessionDoc.output` availability**. The `output` field on `SessionDoc` depends on the session provider extracting the final assistant text. If a provider doesn't set `output` (or the session fails before producing output), turns will show null output in the history. The UI should handle this gracefully (e.g., "[No response recorded]").
