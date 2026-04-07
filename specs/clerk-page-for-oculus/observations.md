# Observations — Clerk Page for Oculus

## Doc/Code Discrepancies

1. **`docs/architecture/apparatus/clerk.md` — stale support kit section.** The doc lists only the `writs` book in supportKit but the code also declares a `links` book with its own indexes. The doc also omits the `writ-link` and `writ-unlink` tools, which were added after the doc was written. The ClerkApi interface in the doc is missing `link()`, `links()`, and `unlink()` methods. A future commission should update this doc to reflect the current code.

2. **`writ-list` tool `offset` parameter uses `z.number().optional()` but it should probably mirror `limit`'s `z.number().optional().default(...)` pattern.** Currently `offset` has no default, which is fine (defaults to undefined → no offset), but the inconsistency between `limit` having `.default(20)` and `offset` having no default is a minor style discrepancy.

## Refactoring Opportunities

3. **`resolveWritTypes()` and `resolveDefaultType()` are private helpers in `clerk.ts` that read from guild config.** The new `writ-types` tool will need to replicate this logic by reading `guild().guildConfig().clerk` directly. If more tools need config access in the future, extracting a shared config-reading utility would reduce duplication. Not worth doing now for a single tool.

4. **`writ-unlink` has `permission: 'clerk:write'` which maps to HTTP POST via `permissionToMethod()`.** Semantically, unlink is a delete operation. If it used `permission: 'clerk:delete'`, it would map to HTTP DELETE (which would be more RESTful). However, changing this would be a breaking API change for existing consumers. Not in scope.

## Risks / Considerations

5. **First contributed page — no established conventions.** This will be the first page contributed by any plugin to the Oculus. The conventions established here (directory layout, file structure, JS patterns, how to call the API) will be precedent for future pages. Worth getting right but also worth keeping simple — over-engineering the first page would create complex precedent.

6. **Client-side sorting and filtering is limited to the loaded result set.** If there are more writs than the loaded page size, client-side sort/filter only operates on what's loaded. This is acceptable for MVP (most guilds will have O(100) writs) but may need server-side support if writ volumes grow significantly.

7. **Repost as page-level composition has a partial failure mode.** If commission-post succeeds but writ-link fails, the user gets a new writ without a link. This is benign (the writ is valid and useful, the link can be manually created) but the UI should communicate the partial failure clearly.

8. **No build step for the page HTML/JS.** The page is a raw HTML file with inline JS. This means no TypeScript, no modules, no imports. All JS runs in the browser's global scope. For a single-page CRUD UI this is fine, but if page complexity grows significantly, a lightweight build step (or at least splitting into an ES module loaded via `<script type="module">`) would be advisable.
