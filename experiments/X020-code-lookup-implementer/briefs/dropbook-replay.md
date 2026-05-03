# `dropBook` primitive for Stacks

## Intent

Extend the Stacks substrate with an imperative `dropBook` primitive that retires a book — drops its underlying storage, fires a CDC notification, and is observable through the existing Clockworks bridge. Apply it back to the cartograph apparatus so the three retired companion books (`cartograph/visions`, `cartograph/charges`, `cartograph/pieces`) are cleaned up on existing on-disk databases at startup.

## Rationale

Stacks today exposes only `ensureBook` (additive create). When a recent commission removed three companion books from the cartograph kit declarations, the underlying SQLite tables persisted on every existing on-disk database as dead-but-not-dropped storage. Without a sanctioned retirement primitive, every future book-retirement commission accumulates a fresh layer of abandoned tables and the substrate's "additive only" posture quietly becomes "additive forever." This commission introduces the explicit, imperative drop path and immediately uses it to clean up the cartograph residue.

## Scope & Blast Radius

**Substrate (`@shardworks/stacks-apparatus`).** The public `StacksApi` surface gains `dropBook`. The `StacksBackend` interface gains a corresponding contract method that both `SqliteBackend` and `MemoryBackend` must implement. The `ChangeEvent<T>` discriminated union gains a fourth variant for book-level retirement. Watchers registered via `watch(ownerId, bookName, handler)` deliver the new event alongside row events.

**CDC consumer audit.** Adding a fourth variant to `ChangeEvent<T>` is a structural change to the union. Every consumer that exhaustively switches on `event.type` will be flagged at compile time — that compile-time audit is the verification mechanism. There is no expectation that the planner enumerates the consumer files; the implementer must let the typechecker do the audit, then update each flagged site to handle the new variant or fall through to a default. This is the load-bearing cross-cutting concern for this commission.

**Bridge (`@shardworks/clockworks-stacks-signals`).** The bridge translates the new CDC variant into a Clockworks event and pre-declares the new verb in its function-form `events` contribution alongside `created/updated/deleted`. The existing `clockworks/events` self-emit carve-out predicate must apply uniformly to the new verb.

**Cartograph (`@shardworks/cartograph-apparatus`).** `cartograph.start()` calls `stacks.dropBook` for each of the three retired companion books before any `clerk.registerWritType` calls. Operations are idempotent, so subsequent boots are no-ops.

**Documentation.** The "additive only" invariant lives in three places (`packages/plugins/stacks/docs/specification.md`, `docs/architecture/apparatus/stacks.md`, `docs/architecture/index.md`). All three must be updated in lockstep with the new wording. The conformance test catalogue (`packages/plugins/stacks/docs/specification-conformance-tests.md`) gains entries for the new tests. The §7 use-case table in the spec gains a "Schema lifecycle" row covering whole-book retirement.

**Conformance suite.** New tests land in Tier 1 (data integrity), Tier 2 (CDC behavioral correctness), and Tier 4 (edge cases). The suite is parametric, so tests must pass against both backends.

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | `StacksApi.dropBook` signature | Positional `(ownerId, bookName)` returning `Promise<void>` | Matches existing `book()`/`readBook()`/`watch()` ergonomics; avoids leaking the backend-only `BookRef` type. |
| D2 | Behavior when book does not exist | Silent no-op | Mirrors `Book.delete(id)` precedent and SQLite's `DROP TABLE IF EXISTS` semantics. The absent state is the desired post-state. |
| D3 | CDC event cardinality on drop | Single book-level `delete-book` event | Per-row deletes would explode cardinality on a populated book and conflict with the substrate's coalescing model. |
| D4 | Type-system surfacing of the new event | Extend the existing `ChangeEvent<T>` union with a fourth variant tagged `'delete-book'`; deliver via existing `watch()` registration | Existing watchers receive the event for free; TypeScript exhaustiveness flagging is the audit mechanism. |
| D5 | Phase of CDC delivery for `delete-book` | Phase 2 (post-commit notification) | A book-drop is irreversible from a caller's perspective; rolling back via Phase 1 handlers would create a confusing "drop sometimes" contract. Aligns with spec §6.2 guidance for notification-style events. |
| D6 | Whether `dropBook` participates in active transactions | Top-level only — `dropBook` does NOT appear on `TransactionContext`; throws if invoked while an active transaction is open in the caller's context | Hard separation of DDL from DML. The substrate refuses the mix rather than rationalizing it. |
| D7 | `StacksBackend.dropBook` shape and SQLite implementation | `dropBook(ref: BookRef): Promise<void>`; SQLite runs `DROP TABLE IF EXISTS` and lets indexes drop transitively | Promise-typed return matches the existing backend contract; SQLite cascades indexes from the table drop, so explicit `DROP INDEX` statements would be unearned structure. |
| D8 | `MemoryBackend.dropBook` semantics | Delete the `${ownerId}/${bookName}` entry from the outer `Store` map | Matches SQLite's "table is gone" semantics; lazy re-creation in `getBook` already covers post-drop access. |
| D9 | `BookDeleteEvent` payload shape | Minimal: `{ type: 'delete-book', ownerId, book }` | No named consumer needs row counts or timestamps; add fields only when a real reader earns them. |
| D10 | Bridge Clockworks event verb for retirement | `book.<owner>.<book>.book-dropped` | `book-dropped` is unambiguous against the existing `deleted` row verb in log lines; bare `dropped` collides. |
| D11 | Cartograph retro-cleanup scope | This commission performs the retro-cleanup — `cartograph.start()` calls `stacks.dropBook` for `visions`, `charges`, `pieces` | Substrate without its first named application is a half-shipped surface; the cartograph hook is the brief's stated concrete payoff. |
| D12 | Conformance tier placement | Tier 1 (data integrity), Tier 2 (CDC correctness), Tier 4 (edge cases) | Splits along the suite's existing risk-tier organization rather than collapsing everything to a single tier. |
| D13 | "Additive only" invariant amendment | Nuance the wording in all three locations: startup-time schema reconciliation remains additive (kit contributions cannot remove a book); the explicit imperative `StacksApi.dropBook` is the sanctioned retirement path, never invoked implicitly from kit declarations | Removing the clause loses the load-bearing invariant about kit-driven implicit drops; nuancing preserves it while introducing the imperative escape hatch. |
| D14 | `dropBook` interaction with active CDC watchers | Drop succeeds silently; any registered watcher remains dormant in the registry (no writes can fire it) | Preserves the post-`phase:started` registry-immutability invariant. The dormant watcher is harmless. Document the edge case in the spec; conformance asserts drop succeeds with watchers registered. |
| D15 | Sequencing of cartograph retro-cleanup calls | `cartograph.start()` issues the three `dropBook` calls sequentially before any `clerk.registerWritType` calls | Linear "erase the dead, then declare the live" reading order; idempotent and cheap so concurrency offers no measurable benefit; sequential ordering produces deterministic CDC event ordering. |
| D16 | Bridge `clockworks/events` carve-out for the new verb | Apply the existing carve-out uniformly to `book-dropped` | The events book never self-emits regardless of operation; uniformity preserves the bridge's cross-component contract. |

## Acceptance Signal

1. `pnpm -w typecheck` passes. Any consumer of `ChangeEvent<T>` that exhaustively switched on `event.type` was flagged and updated.
2. `pnpm -w test` passes — including new Tier 1, Tier 2, and Tier 4 conformance tests against both `MemoryBackend` and `SqliteBackend`.
3. Conformance covers: dropping a populated book removes its documents (post-drop reads return empty/error per backend); dropping a missing book is a silent no-op; `ensureBook` after `dropBook` re-creates a fresh empty book; `dropBook` inside an active `transaction(...)` throws; `dropBook` fires exactly one `delete-book` event with the correct `{ type, ownerId, book }` shape; `dropBook` succeeds when watchers are registered for the dropped book.
4. After running cartograph against an on-disk database that pre-dates the cleanup, the SQLite file no longer contains `books_cartograph_visions`, `books_cartograph_charges`, or `books_cartograph_pieces` tables. Verify by inspecting the database after a guild boot.
5. The Clockworks bridge declares `book.<owner>.<book>.book-dropped` for every contributed book (excluding the `clockworks/events` carve-out) and emits the event when a book is dropped.
6. The "additive only" invariant has been nuanced in all three locations — `packages/plugins/stacks/docs/specification.md`, `docs/architecture/apparatus/stacks.md`, `docs/architecture/index.md`. Verify with a grep for the pre-existing phrasing across the repo: no stale copies remain.
7. The §7 use-case table in `specification.md` includes a row covering whole-book retirement; the conformance catalogue lists the new tests under their respective tiers.

## Existing Patterns

- **Schema reconciliation flow.** `StacksApparatus.start()` (`packages/plugins/stacks/src/stacks.ts`) iterates `ctx.kits('books')` and calls `backend.ensureBook(ref, schema)` for each declared book before `phase:started` fires. The new primitive is imperative, NOT declarative — it does not flow through kit contributions.
- **CDC two-phase model.** `packages/plugins/stacks/src/cdc.ts` and the apparatus `specification.md` §6 — Phase 1 is in-transaction with rollback, Phase 2 is post-commit notification. The `delete-book` event is Phase 2 (D5).
- **Bridge verb mapping.** `packages/plugins/clockworks-stacks-signals/src/clockworks-stacks-signals.ts` — `CDC_VERB_PAST_TENSE` defines `create→created`, `update→updated`, `delete→deleted`. The new verb adds a fourth row. `buildEventsContribution` walks `ctx.kits('books')` once at startup and pre-declares every `(book, verb)` pair; the events-book carve-out predicate at the same module is a literal-string pair check.
- **Trust-based write boundary.** `book(ownerId, bookName)` in `packages/plugins/stacks/src/types.ts` is trust-based — not validated at runtime against caller identity. `dropBook` inherits that exact model; the boundary is enforced by code review and the type system, not the substrate.
- **Idempotency precedents.** `Book.delete(id)` (silent no-op on missing document) and `StacksBackend.ensureBook` (idempotent create) — `dropBook` matches their silent-on-no-op posture.
- **Conformance suite structure.** `packages/plugins/stacks/src/conformance/` — parametric tier-organized suite. `helpers.ts` provides `createTestStacks`, `seedDocument`, `collectEvents`, `spyingBackendFactory`. New tests use the same helpers and run against both backends via the existing `conformance.memory.test.ts` and `conformance.sqlite.test.ts` entry points.
- **Cartograph startup template.** `packages/plugins/cartograph/src/cartograph.ts` — `start()` resolves `stacks` and `clerk`, then calls `clerk.registerWritType` for each cartograph type. The retro-cleanup hook precedes those registration calls (D15).

## What NOT To Do

- Do not add `dropBook` to `TransactionContext`. DDL-in-DML is explicitly refused (D6).
- Do not enumerate or `DROP INDEX` SQLite indexes explicitly — `DROP TABLE` cascades them transitively (D7).
- Do not emit per-row delete events when dropping a populated book — only the single book-level `delete-book` event (D3).
- Do not add `rowCount`, `droppedAt`, or any other audit fields to `BookDeleteEvent` beyond `{ type, ownerId, book }` (D9).
- Do not auto-unregister CDC watchers when their book is dropped; do not throw if watchers exist. The registry remains immutable post-`phase:started` (D14).
- Do not skip translating `delete-book` in the bridge — without bridge translation the brief's "subscribers that care" rationale is defeated.
- Do not migrate historical companion-doc rows from the cartograph tables before dropping them. The originating brief explicitly tolerates loss; this commission only drops the storage.
- Do not add an `nsg stacks gc` operator command, a forced-drop tooling layer, or any other non-substrate cleanup surface. Those are explicit future work per the originating brief.
- Do not rework the `writ.ext` API or any cartograph internals beyond the three `dropBook` calls in `start()`.
- Do not remove the "additive only" clause from the three documentation locations — nuance it (D13). Removing it loses the load-bearing kit-additive invariant.

<task-manifest>
  <task id="t1">
    <name>Extend ChangeEvent union with the BookDeleteEvent variant</name>
    <files>packages/plugins/stacks/src/types.ts; CDC types touching ChangeEvent throughout the package</files>
    <action>Add a fourth variant to the `ChangeEvent<T>` discriminated union with the type tag `'delete-book'` and the minimal payload shape from D9 (just the identifiers — no entry/prev/id, no rowCount, no timestamp). Update related types if needed so `WatchOptions`/`ChangeHandler` deliver the new variant via the existing `watch()` registration. Do not change registration ergonomics.</action>
    <verify>pnpm -w typecheck</verify>
    <done>The union has four variants, the new variant carries only owner/book identifiers, and the typecheck output enumerates every consumer site that exhaustively switched on `event.type`.</done>
  </task>

  <task id="t2">
    <name>Add dropBook to the StacksBackend contract and implement in both backends</name>
    <files>packages/plugins/stacks/src/backend.ts; packages/plugins/stacks/src/sqlite-backend.ts; packages/plugins/stacks/src/memory-backend.ts</files>
    <action>Extend the `StacksBackend` interface with the `Promise<void>`-returning method per D7. The SQLite implementation runs the table-drop with `IF EXISTS` semantics and relies on the engine to cascade indexes — do not enumerate indexes explicitly. The memory implementation deletes the outer-map entry per D8. Both implementations must be silent on missing books (D2).</action>
    <verify>pnpm -w typecheck && pnpm --filter @shardworks/stacks-apparatus test</verify>
    <done>Both backends compile and pass their existing tests; the new method is callable from each.</done>
  </task>

  <task id="t3">
    <name>Wire dropBook through StacksCore and StacksApi with transaction guard and CDC fire</name>
    <files>packages/plugins/stacks/src/stacks-core.ts; packages/plugins/stacks/src/stacks.ts; packages/plugins/stacks/src/types.ts</files>
    <action>Surface `dropBook(ownerId, bookName): Promise<void>` on `StacksApi` (D1). The implementation calls the backend, and if successful schedules a Phase 2 `delete-book` CDC event with the minimal payload (D3, D5, D9). When called while an active transaction is open in the caller's async context, throw a clear error rather than joining or opening a nested transaction (D6). Calls on missing books succeed silently (D2). Drop must succeed even when watchers are registered for the book (D14) — do not unregister them. Do NOT add `dropBook` to `TransactionContext`.</action>
    <verify>pnpm --filter @shardworks/stacks-apparatus test</verify>
    <done>`StacksApi.dropBook` is reachable from a guild context, fires a single Phase 2 event after the backend drop succeeds, and refuses to participate in an open transaction.</done>
  </task>

  <task id="t4">
    <name>Update existing CDC consumers flagged by the union extension</name>
    <files>repository-wide — every site flagged by the typechecker as a non-exhaustive switch over `event.type`</files>
    <action>Use the typecheck output from t1/t3 as the audit list. For each consumer, decide whether the new variant is observable for that consumer's registration and either handle it or fall through to a default. Do not narrow the type back to the original three variants. Do not introduce new helpers — match the existing handler shape at each site.</action>
    <verify>pnpm -w typecheck</verify>
    <done>Typecheck passes across the workspace with the extended union in place; every flagged site has a deliberate handling decision.</done>
  </task>

  <task id="t5">
    <name>Translate delete-book through the clockworks-stacks-signals bridge</name>
    <files>packages/plugins/clockworks-stacks-signals/src/clockworks-stacks-signals.ts</files>
    <action>Add the past-tense verb mapping for the new variant per D10 (`book-dropped`). Update the function-form `events` contribution in `buildEventsContribution` to declare a `book.<owner>.<book>.book-dropped` event for every contributed book, applying the existing `clockworks/events` carve-out predicate uniformly to the new verb (D16). Wire the watcher dispatch so the new event is translated and emitted alongside the existing three.</action>
    <verify>pnpm --filter @shardworks/clockworks-stacks-signals test && pnpm -w typecheck</verify>
    <done>The bridge declares the new verb at startup for every non-carved-out book, emits a `book-dropped` Clockworks event when a `delete-book` CDC event fires, and skips emission for the `clockworks/events` book.</done>
  </task>

  <task id="t6">
    <name>Add Tier 1, Tier 2, and Tier 4 conformance tests for dropBook</name>
    <files>packages/plugins/stacks/src/conformance/ (existing tier files); test entry points under packages/plugins/stacks/src/ that run the suite against memory and sqlite backends</files>
    <action>Add coverage per D12: Tier 1 — dropping a populated book removes its documents (post-drop reads return empty/error per backend semantics). Tier 2 — `dropBook` fires exactly one `delete-book` event with the correct `{ type, ownerId, book }` shape and no per-row deletes. Tier 4 — `dropBook` is idempotent on a missing book (D2), `ensureBook` after `dropBook` re-creates a fresh empty book, `dropBook` inside an active `transaction(...)` throws (D6), `dropBook` succeeds when watchers are registered for the dropped book (D14). Use the existing `helpers.ts` utilities (`createTestStacks`, `seedDocument`, `collectEvents`, `spyingBackendFactory`); do not introduce parallel helpers.</action>
    <verify>pnpm --filter @shardworks/stacks-apparatus test</verify>
    <done>The conformance suite passes against both `MemoryBackend` and `SqliteBackend`, with new tests appearing under their assigned tiers.</done>
  </task>

  <task id="t7">
    <name>Wire cartograph retro-cleanup of retired companion books</name>
    <files>packages/plugins/cartograph/src/cartograph.ts</files>
    <action>In `cartograph.start()`, after `stacks` and `clerk` resolve and before any `clerk.registerWritType` call, issue three sequential `stacks.dropBook` calls — one each for `cartograph/visions`, `cartograph/charges`, `cartograph/pieces` (D11, D15). Calls are idempotent so subsequent boots are no-ops. Do not add migration of historical row data; do not change anything else in `start()`.</action>
    <verify>pnpm --filter @shardworks/cartograph-apparatus test && pnpm -w typecheck</verify>
    <done>Cartograph startup issues the three retirement calls in order before writ-type registration; on a database with the dead tables present, a fresh boot leaves no `books_cartograph_visions`/`_charges`/`_pieces` tables behind.</done>
  </task>

  <task id="t8">
    <name>Update specification documents for the new primitive and nuanced invariant</name>
    <files>packages/plugins/stacks/docs/specification.md; packages/plugins/stacks/docs/specification-conformance-tests.md; docs/architecture/apparatus/stacks.md; docs/architecture/index.md</files>
    <action>Update the four documents in lockstep. Nuance the "additive only — never drops tables or indexes" wording per D13 in all three locations that carry it: startup-time schema reconciliation remains additive (kit contributions cannot remove a book); the explicit imperative `StacksApi.dropBook` is the sanctioned retirement path, never invoked implicitly from kit declarations. Add `dropBook` to the `StacksApi` surface section of `specification.md` and `apparatus/stacks.md`. Add a row to the §7 use-case table covering whole-book retirement. Document the new `delete-book` `ChangeEvent` variant with its minimal payload (D9) and the Phase 2 delivery (D5). Document the dormant-watcher edge case from D14. Add the new tests to the conformance catalogue under their assigned tiers (D12).</action>
    <verify>grep -n "additive only" packages/plugins/stacks/docs/specification.md docs/architecture/apparatus/stacks.md docs/architecture/index.md</verify>
    <done>All three locations reflect the nuanced wording; `dropBook` and `delete-book` are documented in both the spec and the architecture doc; the §7 use-case table has a Schema-lifecycle row; the conformance catalogue lists the new tests.</done>
  </task>
</task-manifest>

