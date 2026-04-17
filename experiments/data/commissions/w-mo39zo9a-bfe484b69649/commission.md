# Writ Spec/Status Convention — Rename `status` → `phase`, Introduce Observation Slot

## Intent

Free the `status` field name on `WritDoc` by renaming the lifecycle enum to `phase`, then reintroduce `status` as a plugin-owned observation slot (`Record<string, unknown>`). Migrate persisted rows in lockstep, and document the Kubernetes-style spec/status convention guild-wide. This commission lays the substrate; downstream consumers (e.g. Spider's `status.spider.stuckCause`) are out of scope.

## Rationale

The writ lifecycle and its downstream-observed state are two different concerns that currently collide on one field name. Kubernetes' `spec`/`status` split is the canonical pattern: the controller owns `phase`, observers write to `status`. Once `status` is vacated and re-shaped as a plugin-keyed map, plugins can publish post-hoc observations (stuck causes, gate state, provenance) without polluting the transition state machine. The convention established here is guild-wide in intent — other runtime objects (rigs, engines, sessions, input requests, clicks) will migrate when their first observation-slot consumer appears.

## Scope & Blast Radius

This is a substrate-level rename with no behavioral change to the transition state machine. Every consumer across the monorepo that reads or writes the writ lifecycle must move in lockstep.

**Type layer (Clerk).** The type alias `WritStatus` becomes `WritPhase`. `WritDoc.status: WritStatus` becomes `WritDoc.phase: WritPhase`. `WritDoc` gains `status?: Record<string, unknown>` — the observation slot. `WritFilters.status` becomes `WritFilters.phase`. `ClerkApi.transition()`'s `to` parameter retypes to `WritPhase`. The lifecycle value strings (`'new' | 'open' | 'stuck' | 'completed' | 'failed' | 'cancelled'`) are unchanged.

**Clerk runtime.** Every reference to the lifecycle field in `clerk.ts` flips from `status` to `phase`: the `ALLOWED_FROM` transition table, terminal-phase and child-allowed-parent-phase sets, the where-clause builder, `post()`, `edit()`, `transition()`, the CDC watcher guard, child/parent cascade handlers, and book index declarations. The module-local constants `TERMINAL_STATUSES` and `CHILD_ALLOWED_PARENT_STATUSES` rename to `TERMINAL_PHASES` and `CHILD_ALLOWED_PARENT_PHASES`. Operator-facing error messages in `edit()` and `transition()` read "phase is ${writ.phase}" (not "status is …"). The `transition()` managed-field strip must now strip `phase` and must **not** strip `status` (since `status` is user-writable).

**Clerk tools & surfaces.** The `writ-list` zod schema's filter param renames `status` → `phase`; the CLI flag and HTTP query param follow automatically. `writ-show` response's `parent.status` and `children.items[].status` retype to the `phase` field. The existing spread of `...writ` in `writ-show` automatically surfaces the new observation slot — nothing extra needed there.

**Clerk pages.** `pages/writs/index.html` (and its browser tests `writs-hierarchy.test.js`, `writs-type-filter.test.js`) rename `data-status` HTML attributes, JS filter variable names, URL query params, and every `writ.status` read to `phase`. The rendered lifecycle-value labels (`"open"`, `"stuck"`, etc.) stay identical — values didn't change.

**Spider.** The writs-book dispatch filter query, the CDC watchers on both the writs and rigs books, and the `writ-status` block type all read the lifecycle field and must rename their reads to `phase`. Additionally, the block type itself renames in lockstep: id `writ-status` → `writ-phase`, file `writ-status.ts` → `writ-phase.ts`, condition field `targetStatus` → `targetPhase`. Spider's block-registry map and all test references follow.

**Observation slot (Clerk API).** A new API method must exist on `ClerkApi` that writes a single plugin's sub-slot of `status` via a transactional read-modify-write, without clobbering sibling plugins' sub-slots. No reader API is added — callers read `writ.status?.[pluginId]` directly. Ownership is convention-only (plugin `X` only writes `status[X]`); there is no runtime guard. Slot writes emit CDC like any other field change, and the slot persists across terminal phase transitions.

**Migration.** A one-shot idempotent pass inside Clerk's `start()` (before the CDC registry seals, alongside existing migrations) scans every row in the `writs` book, moves the lifecycle value from `status` into `phase` (collapsing legacy `'ready' | 'active' | 'waiting'` → `'open'`), and rewrites the row so the old `status` key is absent. This pass subsumes the existing `legacyStatuses` migration — the old migration is deleted.

**Documentation.** `packages/plugins/clerk/README.md` and `docs/architecture/apparatus/clerk.md` are the vehicles for the convention. The existing "Status Machine" prose renames to "Phase Machine," and a new dedicated `## Spec/Status Convention` section follows it. The convention section describes the K8s-style split, ownership by convention, sub-slot write semantics (read-modify-write via the new Clerk helper to avoid clobbering siblings), CDC behavior, persistence across terminal states, last-writer-wins per key, and a worked example showing how a future consumer (Spider's `status.spider.stuckCause`) would plug in. The section must note that the pattern is guild-wide and other runtime objects will adopt it when they grow a first observation-slot consumer.

**Cross-cutting audit.** The implementer must audit the entire monorepo for residual references to the old field name in a writ context — use a repository-wide grep for `writ.status`, `writ?.status`, `{ status: `, `WritStatus`, `'status'` as a writ-index or filter key, `TERMINAL_STATUSES`, `CHILD_ALLOWED_PARENT_STATUSES`, `data-status` (on the writs page), `targetStatus`, and `writ-status`. The inventory's "Affected files" list is the planner's prediction, not an exhaustive catalog — verify independently.

**Explicitly untouched.** Rigs, engines, sessions, input requests, and clicks retain their existing `status` fields. The stale reference docs (`docs/reference/schema.md`, `docs/reference/core-api.md`) are noted in observations but are not repaired by this commission. Orphan SQLite indexes on `$.status` are left in place.

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | New name for lifecycle field and type alias | Field `WritDoc.phase: WritPhase`, type alias `WritPhase` | Brief prescribes K8s-style `phase` vocabulary directly. |
| D2 | Rename `WritFilters.status` to `.phase` in lockstep | Rename | Filter keys mirror document fields throughout the codebase. |
| D3 | Retype `ClerkApi.transition()` `to` parameter | `to: WritPhase` | No external `WritStatus` consumers; prefer removal to deprecation. |
| D4 | Rename `writ-list` zod param / CLI flag / HTTP query | Rename the zod param; CLI & HTTP follow automatically | Shared zod-to-route plumbing means one rename flips all surfaces. |
| D5 | Writs page — `data-status` attributes, JS vars, URL params | Full rename to `phase` | Consistency with the renamed field; trivially reversible. |
| D6 | Internal constants `TERMINAL_STATUSES` / `CHILD_ALLOWED_PARENT_STATUSES` | Rename to `TERMINAL_PHASES` / `CHILD_ALLOWED_PARENT_PHASES` | Readability aligns with the renamed type. |
| D7 | Operator-facing error message copy | Say `"phase is ${writ.phase}"` | Operator reads `phase` in logs, CLI, docs — copy matches. |
| D8 | Spider's `writ-status` block type | Rename id to `writ-phase`, file to `writ-phase.ts`, condition field to `targetPhase` | No external scaffolding references the id; full-rename avoids an overloaded-term footgun. |
| D9 | Observation-slot ownership enforcement | Convention only, no code guards | Matches guild pattern (kit contributions keyed by plugin id). |
| D10 | CDC on slot writes | Emit CDC like any field change | Downstream observers require it; opt-out would violate the book contract. |
| D11 | Slot persistence across terminal phases | Slot survives all transitions, including terminal | Post-mortem queryability is the whole point of the slot. |
| D12 | Concurrent writes to different sub-slots | Last-writer-wins per document; plugins use RMW (D14) | Per-key atomic is deferred until real contention shows up. |
| D13 | Schema change for existing rows | None — slot is an optional JSON field | Consumers already handle `undefined` for first-write cases. |
| D14 | Safe sub-slot write mechanism | **Patron override:** add `ClerkApi.setWritStatus(writId, pluginId, value)` that does RMW in a single transaction | Direct patron directive; callers use this helper instead of hand-rolling RMW. |
| D15 | `transition()` managed-field strip list | Strip `phase`; let `status` pass through | Slot is a writable field on the document. |
| D16 | Typed reader API for other plugins' sub-slots | No helper — read `writ.status?.[pluginId]` directly | Field access is already ergonomic; no readers exist yet. |
| D17 | Location of convention documentation | `packages/plugins/clerk/README.md` and `docs/architecture/apparatus/clerk.md` only | First-consumer-wins-location; brief scopes it to Clerk docs. |
| D18 | Doc layout | Dedicated `## Spec/Status Convention` section after the renamed Phase Machine section | Discoverability wins; other apparatus authors can search for it. |
| D19 | Coverage of other runtime objects in the doc | Note the pattern is guild-wide; other objects migrate when a consumer appears | Prevents future readers from mistaking writs-only for a principled limit. |
| D20 | Where/when the migration runs | Inside Clerk's `start()`, before CDC seal, alongside existing migrations | Prior art (legacyStatuses, link-row) lives here. |
| D21 | Relationship with existing `legacyStatuses` migration | Subsume — merge legacy-collapse into the rename pass; delete the old migration | Single pass is clearer; idempotent guard handles re-runs. |
| D22 | How to remove the old `status` field | `put()` a new document without the `status` key | `patch()` cannot delete fields; `put()` produces a clean shape. |
| D23 | Drop orphan SQLite indexes on `$.status` | Leave orphans; document as follow-up | Touching SQLite-specific internals violates Stacks' backend abstraction. |
| D24 | Unknown value in `status` at migration time | Throw, aborting startup | Fail loud; unknown phase is a data-integrity issue. |
| D25 | Update `updatedAt` on migrated rows | Leave untouched — storage-format change, not a logical edit | Preserves `updatedAt` as the signal for recent logical activity. |

## Acceptance Signal

1. Monorepo typecheck passes (`pnpm -w typecheck`).
2. Full test suite passes (`pnpm -w test`), including Clerk tests, Spider tests, and the writs-page browser tests. Any tests that seeded pre-migration data validate the migration behavior end-to-end.
3. A repo-wide search (`grep -rn`) for `WritStatus`, `TERMINAL_STATUSES`, `CHILD_ALLOWED_PARENT_STATUSES`, `targetStatus`, and `writ-status` (as a block-type id) returns **no** results in source, tests, pages, or docs under `packages/` and `docs/architecture/`. (The legacy-value string `'status'` as a generic word may still appear in unrelated contexts; the search targets the identifiers listed.)
4. Starting Clerk against a database seeded with rows that carry the pre-rename `status` field — including rows with legacy values `'ready' | 'active' | 'waiting'` — results in every row having `phase` set correctly and no `status` key (until a consumer writes the slot). Starting a second time is a no-op (idempotent). Starting against a row with an unexpected `status` value aborts with a clear error.
5. A smoke exercise of the new `ClerkApi.setWritStatus(writId, pluginId, value)`: two simulated plugins writing disjoint sub-slots to the same writ back-to-back result in a `writ.status` that contains both sub-slots (neither is clobbered). A write to a writ in a terminal phase succeeds and the value survives subsequent reads.
6. The writs page at `/writs` renders and filters correctly end-to-end: filter buttons apply `?phase=…` to the URL, the API returns filtered results, detail view displays the lifecycle phase, and row actions reflect the current phase. Browser test fixtures pass.
7. The Clerk README and architecture doc contain a dedicated `## Spec/Status Convention` section with the worked `status.spider.stuckCause` example and guild-wide extensibility note. The "Status Machine" section is renamed to "Phase Machine" in both docs.

## Existing Patterns

- **Startup migration shape.** `packages/plugins/clerk/src/clerk.ts` already runs one-shot migrations inside `start()` before CDC seal — the legacyStatuses collapse and the link-row normalization. The rename migration follows the same shape: iterate all rows, compute new document, `put()` or `patch()`, idempotent guard, throw on unexpected input.
- **Plugin-id-keyed maps.** `ClerkKit.linkMeanings` uses `{pluginId}:{suffix}` qualification for kit contributions — the closest existing precedent for plugin-id-keyed records. The observation slot applies the same principle at document-field level.
- **Kit-registered block types.** `packages/plugins/spider/src/block-types/` — the existing `writ-status.ts` shows the block-type shape. The renamed `writ-phase.ts` follows the same structure with the field reads and condition key updated.
- **Writ tool shape.** `packages/plugins/clerk/src/tools/writ-list.ts` and `writ-show.ts` illustrate the zod → CLI / HTTP auto-wiring; renaming the zod field propagates to both surfaces without additional work.
- **Architecture-doc tone.** `docs/architecture/apparatus/ratchet.md` is a sibling apparatus doc with a similar shape (plugin-owned substrate with a documented convention); use its register and structure as a reference when writing the `## Spec/Status Convention` section.

## What NOT To Do

- **Do not** add a runtime guard that rejects writes where `pluginId` in `setWritStatus(writId, pluginId, value)` doesn't match the calling plugin. Ownership is convention-only (D9). A guard is a separate future commission if cross-plugin violations materialize.
- **Do not** add a typed reader helper like `getWritStatus(writId, pluginId)`. Callers read `writ.status?.[pluginId]` directly (D16).
- **Do not** keep `WritStatus` as a back-compat alias for `WritPhase`. Remove the name (D3).
- **Do not** alias the CLI flag `--status` to `--phase` or accept both in the zod schema. Single rename, no back-compat (D4).
- **Do not** change Stacks `patch()` semantics. The read-modify-write responsibility lives in `ClerkApi.setWritStatus()` (D14); Stacks remains shallow-merge.
- **Do not** clear the observation slot on terminal transitions. The slot survives (D11).
- **Do not** drop the orphan SQLite indexes (`idx_clerk_writs_status*`). They are harmless; cleanup is a future commission (D23).
- **Do not** coerce unknown `status` values during migration. Throw (D24).
- **Do not** refresh `updatedAt` on migrated rows (D25).
- **Do not** rename the `status` field on rigs, engines, sessions, input requests, or clicks. The convention is guild-wide in intent but rolls out per-consumer; only writs change here.
- **Do not** repair stale reference docs (`docs/reference/schema.md`, `docs/reference/core-api.md`) or the `summon` / `mandate` README inconsistency. Those are observation-level follow-ups, not this commission's work.
- **Do not** introduce typed contributions for plugin sub-slot shapes (`status.spider: SpiderStatus` etc.). That's a parked follow-up; the slot is `Record<string, unknown>` for now.
- **Do not** add a dedicated `docs/architecture/conventions/spec-status.md` top-level document. The convention lives with Clerk (D17).

<task-manifest>
  <task id="t1">
    <name>Rename type layer: `WritStatus` → `WritPhase`, introduce observation slot</name>
    <files>packages/plugins/clerk/src/types.ts, packages/plugins/clerk/src/index.ts</files>
    <action>Rename the `WritStatus` type alias to `WritPhase`. On `WritDoc`, rename the lifecycle field `status` to `phase` and add the optional observation slot `status?: Record<string, unknown>`. Rename `WritFilters.status` to `WritFilters.phase`. Retype `ClerkApi.transition()`'s `to` parameter to `WritPhase`. Add the signature for the new `ClerkApi.setWritStatus(writId, pluginId, value)` helper — its contract: transactionally read-modify-write the sub-slot keyed by `pluginId` under `WritDoc.status`, without clobbering siblings. Update any module re-exports. No back-compat aliases.</action>
    <verify>pnpm --filter @shardworks/clerk-apparatus typecheck</verify>
    <done>The type layer is consistent with the renamed field, the observation slot is declared, and `ClerkApi` exposes the new setter. Typecheck succeeds in isolation; downstream consumers may still fail until subsequent tasks land.</done>
  </task>

  <task id="t2">
    <name>Rename Clerk runtime references and update transition strip list</name>
    <files>packages/plugins/clerk/src/clerk.ts</files>
    <action>Flip every runtime reference to the lifecycle field from `status` to `phase`: the `ALLOWED_FROM` table, terminal-phase and child-allowed-parent-phase sets (renamed to `TERMINAL_PHASES` / `CHILD_ALLOWED_PARENT_PHASES`), `buildWhereClause`, `post()`, `edit()`, `transition()`, child/parent cascade handlers, the CDC watcher's change-detection guard, and the book index declarations. Update operator-facing error messages in `edit()` and `transition()` to read "phase is ${writ.phase}". Modify `transition()`'s managed-field strip list: strip `phase` but let `status` pass through (the slot is user-writable). Implement the `ClerkApi.setWritStatus(writId, pluginId, value)` body as a transactional read-modify-write that merges the new value into the existing `status` map under the `pluginId` key, preserving other sub-slots.</action>
    <verify>pnpm --filter @shardworks/clerk-apparatus typecheck &amp;&amp; pnpm --filter @shardworks/clerk-apparatus test</verify>
    <done>Clerk's runtime is internally consistent with the renamed field, the new setter works transactionally, and the transition machinery no longer strips the user-writable slot. Clerk's own tests pass (after they are updated in a later task or concurrently if they overlap).</done>
  </task>

  <task id="t3">
    <name>Implement startup migration: `status` → `phase`, subsume legacyStatuses, remove old field</name>
    <files>packages/plugins/clerk/src/clerk.ts</files>
    <action>Add a one-shot idempotent migration to `start()` that runs alongside existing migrations, before the CDC registry seals. For each row in the `writs` book: skip if `phase` is already set; otherwise read the old `status` value, collapse legacy `'ready' | 'active' | 'waiting'` to `'open'`, validate it against the current `WritPhase` values (throw on unexpected input, aborting startup), build a new document object without the old `status` key and with `phase` set, and call `put()` to replace the row. Preserve `updatedAt` exactly as stored. Delete the standalone `legacyStatuses` migration — its behavior is subsumed. Do **not** touch SQLite indexes.</action>
    <verify>pnpm --filter @shardworks/clerk-apparatus test</verify>
    <done>Starting Clerk against a seeded database of pre-rename rows (including legacy values) produces rows with correct `phase` values and no `status` key. Restarting is a no-op. Unknown input aborts with a clear error. Tests that covered the old `legacyStatuses` pass under the merged migration.</done>
  </task>

  <task id="t4">
    <name>Rename Clerk tool schemas and response shapes</name>
    <files>packages/plugins/clerk/src/tools/writ-list.ts, packages/plugins/clerk/src/tools/writ-show.ts, packages/plugins/clerk/src/tools/*.ts</files>
    <action>In `writ-list.ts`, rename the zod enum parameter `status` to `phase` (values unchanged) and update the handler's call into `WritFilters`. In `writ-show.ts`, retype `parent` and `children.items[]` entries so the lifecycle field is `phase`; verify the existing `...writ` spread naturally passes the new `status` observation slot through. Audit the other writ tools (`writ-complete`, `writ-fail`, `writ-cancel`, `writ-publish`, `writ-edit`, `commission-post`, `piece-add`) for any type imports that need to flip from `WritStatus` to `WritPhase`; value-string literals stay.</action>
    <verify>pnpm --filter @shardworks/clerk-apparatus typecheck &amp;&amp; pnpm --filter @shardworks/clerk-apparatus test</verify>
    <done>The CLI flag is `--phase`, the HTTP query param is `?phase=…`, and `writ-show` responses contain `phase` for the lifecycle and pass the new `status` slot through unchanged. Clerk tool tests pass.</done>
  </task>

  <task id="t5">
    <name>Rename Clerk writs page attributes, URL params, and browser tests</name>
    <files>packages/plugins/clerk/pages/writs/index.html, packages/plugins/clerk/pages/writs/writs-hierarchy.test.js, packages/plugins/clerk/pages/writs/writs-type-filter.test.js</files>
    <action>Rename every `data-status` attribute to `data-phase`, every `dataset.status` read to `dataset.phase`, and every URL query string (`?status=…`) to `?phase=…`. Flip every `writ.status` read in row actions, detail view, and update helpers to `writ.phase`. The rendered badge values (`"open"`, `"stuck"`, etc.) stay — only the field being read changed. Update the browser-test fixtures in lockstep.</action>
    <verify>pnpm --filter @shardworks/clerk-apparatus test</verify>
    <done>Filtering, detail view, and row actions on the writs page all work against the renamed field. Browser tests pass.</done>
  </task>

  <task id="t6">
    <name>Rename Spider references and the `writ-status` block type</name>
    <files>packages/plugins/spider/src/spider.ts, packages/plugins/spider/src/block-types/, packages/plugins/spider/src/*.test.ts, packages/plugins/spider/src/engines/seal-recovery.test.ts</files>
    <action>Flip the dispatch-filter query's `['status', '=', 'open']` to `['phase', '=', 'open']`. In the writs-book and rigs-book CDC watchers, change every `writ.status` read (including change-detection guards) to `writ.phase`. Rename the block type: file `writ-status.ts` → `writ-phase.ts`, id `'writ-status'` → `'writ-phase'`, condition field `targetStatus` → `targetPhase`, and internal field reads on the writ from `status` to `phase`. Update the block-type registry map and every test reference by id. Value strings passed to `clerk.transition()` are unchanged.</action>
    <verify>pnpm --filter @shardworks/spider-apparatus typecheck &amp;&amp; pnpm --filter @shardworks/spider-apparatus test</verify>
    <done>Spider's dispatch, CDC cascades, and block registry are consistent with the renamed field, and Spider tests pass.</done>
  </task>

  <task id="t7">
    <name>Monorepo-wide rename sweep and test update</name>
    <files>packages/plugins/clerk/src/clerk.test.ts, packages/plugins/clerk/src/piece-pipeline.test.ts, packages/plugins/spider/src/spider.test.ts, packages/plugins/spider/src/piece-pipeline.test.ts, packages/plugins/spider/src/input-request.test.ts, packages/plugins/spider/src/spider-oculus.test.ts, and any other residual consumers</files>
    <action>Audit the full monorepo for residual references that earlier tasks missed — this is the implementer's own sweep, not a pre-enumerated list. Grep for `WritStatus`, `TERMINAL_STATUSES`, `CHILD_ALLOWED_PARENT_STATUSES`, `targetStatus`, `writ-status` (as a block-type id), `data-status`, `writ.status`, `writ?.status`, `{ status:` and `clerk.list({ status` in writ contexts, and any remaining writ-filter keys. Flip each to the new vocabulary. Update every test assertion, filter argument, and seeded writ document. Add at least one new test that exercises: slot-absent read returns empty, slot write via `setWritStatus` from two plugins does not clobber, slot survives a terminal phase transition, slot writes emit CDC events, and `transition()` does not strip the slot.</action>
    <verify>pnpm -w typecheck &amp;&amp; pnpm -w test</verify>
    <done>Repo-wide typecheck and tests pass. A grep of source, tests, pages, and docs for the old identifier set (see acceptance signal 3) returns no residual matches.</done>
  </task>

  <task id="t8">
    <name>Document the spec/status convention in Clerk README and architecture doc</name>
    <files>packages/plugins/clerk/README.md, docs/architecture/apparatus/clerk.md</files>
    <action>In both docs, rename the existing "Status Machine" section to "Phase Machine" and flip all prose references to the lifecycle field from `status` to `phase`. After the Phase Machine section, add a dedicated `## Spec/Status Convention` section that covers: the K8s-style spec/status split with `phase` owned by Clerk and `status` as a plugin-owned observation slot; ownership by convention only (no code guards); sub-slot write semantics via the new `ClerkApi.setWritStatus(writId, pluginId, value)` helper (read-modify-write, non-clobbering); CDC behavior (slot writes emit update events like any field change); persistence across terminal states; last-writer-wins per key for same-plugin concurrent writes; and a worked example of how a future consumer (Spider's `status.spider.stuckCause`) would plug in. Note that the pattern is guild-wide and other runtime objects (rigs, engines, sessions, input requests, clicks) will adopt it per-consumer when they grow an observation-slot need.</action>
    <verify>grep -n "Phase Machine" packages/plugins/clerk/README.md docs/architecture/apparatus/clerk.md &amp;&amp; grep -n "Spec/Status Convention" packages/plugins/clerk/README.md docs/architecture/apparatus/clerk.md</verify>
    <done>Both docs contain the renamed "Phase Machine" section and the new dedicated "Spec/Status Convention" section with the worked example and the guild-wide extensibility note.</done>
  </task>
</task-manifest>
