# Build the Ratchet apparatus — foundation

## Summary

Build the Ratchet plugin — a new framework apparatus that manages "clicks" (atomic, immutable decision-nodes in a tree). Ratchet is a peer to Clerk: Clerk manages obligations (writs); Ratchet manages inquiry and decisions (clicks). Both share the Stacks storage layer but are separate plugins with separate lifecycles.

## Architecture Reference

**Read first:** `docs/architecture/apparatus/ratchet.md` — the full API contract, data model, invariants, status transitions, and implementation notes. This commission implements the apparatus and data layer specified in that document. Follow the Clerk plugin (`packages/plugins/clerk/`) as the architectural pattern.

## Scope

This commission covers the **apparatus and data layer only** — no CLI commands, no Oculus view, no migration. Those are follow-up commissions that depend on this foundation.

### Delivers

1. **Ratchet plugin** at `packages/plugins/ratchet/`
   - Plugin scaffolding following the Clerk pattern (package.json, tsconfig, src/ layout)
   - Registers with the guild as `ratchet` plugin

2. **Stacks books** registered via supportKit
   - `clicks` book — schema fields: `id`, `parentId`, `goal`, `status`, `conclusion`, `createdSessionId`, `resolvedSessionId`, `createdAt`, `resolvedAt`
   - `click_links` book — schema fields: `sourceId`, `targetId`, `linkType`, `createdAt`
   - Indexes as specified in the architecture doc

3. **RatchetApi** — the `provides` interface, exposed to other plugins and CLI
   - `create(params)` — create a click with an immutable goal
   - `get(id)` — retrieve a click (with short-ID prefix resolution)
   - `list(params)` — list/filter clicks
   - `park(id)` / `resume(id)` — toggle live↔parked
   - `conclude(id, params)` — terminal: set conclusion, status → concluded
   - `drop(id, params)` — terminal: set drop reason, status → dropped
   - `reparent(id, params)` — move a click in the tree (or to root)
   - `link(params)` / `unlink(params)` — typed links (related, commissioned, supersedes, depends-on)
   - `extract(rootId, params)` — render a subtree as structured markdown or JSON
   - `resolveId(prefix)` — short-ID prefix matching, error on ambiguity

4. **Invariant enforcement**
   - `goal` is immutable after creation (reject any update attempt)
   - `conclusion` is write-once (null → string, then frozen)
   - Status transitions enforced: `live↔parked`, `live|parked→concluded`, `live|parked→dropped`. No transitions from terminal states.
   - Circular parentage rejected
   - `conclusion` required for concluded/dropped transitions
   - `resolvedSessionId` and `resolvedAt` set atomically with conclusion

5. **CDC events** — all mutations flow through Stacks, emitting CDC events. No special Laboratory integration needed — the existing CDC machinery picks up click events automatically.

6. **Tests** — unit tests for all API operations, status transition enforcement, immutability constraints, short-ID resolution, and tree operations (reparent, extract).

### Does NOT deliver

- CLI commands (Package 2 — separate commission)
- Oculus visualization (Package 3 — separate commission)
- Migration from quest writs (Package 4 — separate commission)
- Guild configuration changes in any specific guild (consumer responsibility)

## Key Design Decisions

- **Click IDs** should use a distinct prefix from writ IDs (e.g., `c-` instead of `w-`) so cross-substrate links are unambiguous from the ID alone. See Open Questions in the architecture doc.
- **No status cascading.** Unlike Clerk's writ tree, parent click status does not cascade to children. A parent can be concluded while children are still live.
- **Cross-substrate links** store target IDs as plain strings — no referential integrity check against Clerk. This keeps the two plugins decoupled.
- **`extract()`** renders a subtree as a structured document. Markdown format: h1 for root, nested headings for children, goal as blockquote, conclusion as body text, status and session IDs as metadata. JSON format: nested object tree.

## Acceptance Criteria

- [ ] Ratchet plugin initializes successfully alongside Clerk in a guild
- [ ] Clicks can be created, parked, resumed, concluded, and dropped
- [ ] Goal immutability is enforced (update attempts rejected with clear error)
- [ ] Conclusion write-once is enforced
- [ ] Invalid status transitions are rejected with clear errors
- [ ] Parent/child tree works (create with parentId, reparent, circular detection)
- [ ] Links can be created and removed (all four link types)
- [ ] Cross-substrate links work (click → writ ID)
- [ ] Short ID prefix resolution works, errors on ambiguity
- [ ] `extract()` renders a readable subtree document in both md and json
- [ ] CDC events emitted for all mutations (verified via Stacks CDC)
- [ ] All tests pass