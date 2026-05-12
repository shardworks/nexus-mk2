# Restore Reckoner leaf-failure surface via cascade-engine status record

## Intent

Restore the leaf-failure surface (`WritFailedContext.childFailures` array and the `"Originated from child …"` summary line) on Reckoner pulses by having the Clerk's children-behavior cascade engine publish a structured record into a new `status['clerk']` sub-slot, and by switching the Reckoner from regex-parsing the parent's resolution string to reading that record at emit time.

## Rationale

T3 replaced the legacy `Child "<id>" failed:` resolution-rewriting cascade with a verbatim `copyResolution: true` semantics. The Reckoner's `parseChildFailures` regex now matches nothing, so cascaded `writ-stuck` and `writ-failed` pulses silently emit with no leaf-cause context — the empty array is indistinguishable from a legitimate "no children involved" pulse, which means the regression has no error path. Operators lose visibility into which child caused a parent's failure, and the lattice-discord channel suppresses the "Child failures" embed field entirely. Restoring the surface at the right layer (the engine, where the triggering child id is in hand) closes the regression and prevents recurrence under future cascade-engine changes.

## Scope & Blast Radius

Three packages and two doc trees are affected.

- **Clerk cascade engine** is the new source of truth. The engine becomes the *writer* of a Clerk-owned `status['clerk']` sub-slot carrying the immediate triggering child id at the moment the parent's terminal transition is recorded. This is the first `status['clerk']` slot in the codebase; introducing it follows the existing Spider precedent (`status['spider']`).
- **Reckoner** stops regex-parsing the resolution string and instead reads the new sub-slot on emit. The read uses chase-chain semantics: walk downward through successive writs' own `status['clerk'].triggeringChildId` until the chain terminates. Both emit branches (`emitStuck`, `emitFailed`) call into the same chain-resolution path.
- **lattice-discord** is unchanged in code but is a *contract-shape consumer* — its existing `childFailures` rendering and test fixture must continue to pass against the new emitter. Verify by running its test suite.
- **Reckoner predicate API** loses `parseChildFailures` entirely, along with its dedicated unit-test describe block. The function is internal to the Reckoner package; cutover is full and immediate.
- **Architecture docs** (`docs/architecture/apparatus/reckoner.md`, `packages/plugins/reckoner/README.md`, and the Clerk's apparatus/README docs) all describe a cascade-resolution shape that no longer exists. Each must be brought into alignment with the new mechanism, including a new section in the Clerk docs documenting the `status['clerk']` slot's shape and ownership.

Two cross-cutting concerns the implementer must verify directly rather than rely on the brief enumerating:

- **No remaining references to `parseChildFailures` or to the legacy `/Child "…" failed:/` regex pattern anywhere in the monorepo.** Verify with grep across `packages/`, `apps/`, `docs/`, and any tooling directories.
- **The engine's status-write must precede its transition.** The Reckoner's CDC dedupe identity keys on the terminal transition's `updatedAt`; the read inside the emit body sees `event.entry`, which is the post-commit snapshot at that instant. If the status write lands *after* the transition, Reckoner will fire on a snapshot that pre-dates the slot's existence and the surface will degrade again. The implementer should locate the cascade engine's `fireTrigger` site and verify by reading the surrounding code that the new `setWritStatus` call lands before `transition()`.

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | Source of leaf-failure surface on Reckoner pulses | Cascade engine publishes a structured record at trigger time; Reckoner reads it on emit | Engine holds the triggering child id at the moment of firing — the write belongs at the source, not in a downstream re-derivation |
| D2 | How the engine persists the record | Engine calls `setWritStatus(parent, 'clerk', …)` *before* `transition()`; the slot lives under the writ's plugin-keyed `status` map | Mirrors the Spider precedent (`status['spider']` written by Spider, read by Reckoner via narrow re-declaration); keeps `WritDoc`'s schema unchanged; transition()'s safe-fields strip stays untouched |
| D3 | What the record contains | A single field: the *immediate* triggering child id (e.g. `{ triggeringChildId }`) | Engine writes only what it directly knows in O(1); deeper chain reconstruction is a Reckoner-side concern handled by D4 |
| D4 | How the Reckoner projects the record onto the pulse surfaces | Chase-chain: walk downward by reading each successive writ's own `status['clerk'].triggeringChildId` until the chain terminates at a writ without one (the leaf), and surface the full chain in `childFailures` and the summary line | Restores the legacy regex's multi-id fidelity for nested cascades; cascade depth is bounded by `MAX_CASCADE_DEPTH = 16` (T3 invariant), so worst-case is ~16 indexed reads per pulse — no truncation needed |
| D5 | Disposition of `parseChildFailures` and its dedicated tests | Delete the function and its describe block; update the predicates module's JSDoc | No remaining callers post-D1; prefer removal to deprecation |
| D6 | Backward-compatibility fallback for pre-T2 legacy resolution strings | None — full cutover | Fail loud over silent fallback; pre-T2 writs in terminal states do not re-emit pulses, and there is no named external consumer of the legacy shape |
| D7 | Shape of the rewritten cascaded-leaf-cause integration test | Drive only the child's failure; let the cascade engine fire the parent transition; assert the parent pulse's `childFailures` and summary line | T3 is engine-driven; the integration test must exercise that path rather than hand-rolling the cascade resolution string |
| D8 | Unit-level coverage for the new write | Cover both sides: extend `children-behavior-engine.test.ts` to assert the structured write fires under each existing trigger case, *and* keep the Reckoner-side integration test from D7 | Engine writes and Reckoner reads are distinct cross-component contracts; each side guards different invariants |
| D9 | Scope of documentation updates | Full update: strike legacy paragraphs in `reckoner.md` and the Reckoner README, replace with the new mechanism, *and* add a `status['clerk']` slot section to the Clerk's apparatus doc / README documenting shape and ownership | The new slot is a load-bearing public Clerk-owned contract following the Spider precedent; the apparatus that owns the slot must document it |

## Acceptance Signal

1. Workspace typecheck and full test suite pass: `pnpm -w typecheck && pnpm -w test`.
2. `grep -r "parseChildFailures" packages/ apps/ docs/` returns no hits in source, tests, or docs.
3. `grep -rn 'Child "' packages/ apps/ docs/` (or an equivalent search for the legacy `Child "<id>" failed:` shape) returns no functional references — only historical mentions in changelogs/decision records, if any.
4. The rewritten Reckoner integration test drives only the child's failure (no manual two-leg cascade, no hand-rolled cascade-resolution string) and observes a parent pulse whose `context.childFailures` is non-empty and whose summary line includes an "Originated from child …" fragment.
5. `children-behavior-engine.test.ts` asserts that `fireTrigger` writes the structured record under each existing trigger configuration, and that the write lands *before* the parent's transition.
6. Cascaded `writ-failed` pulses for multi-level chains (root → mid → leaf) emit `childFailures` arrays whose contents reflect the full chain — verify via the integration test or a dedicated unit-style projection test.
7. The Clerk's apparatus documentation contains a section documenting the `status['clerk']` slot's shape, ownership, and the cascade-engine's write contract; the Reckoner's apparatus doc and README no longer describe the deleted legacy cascade.

## Existing Patterns

- **`packages/plugins/spider/`** — the Spider plugin writes `status['spider']` via `setWritStatus()` and the Reckoner reads it via `writ.status?.spider` with a narrow type re-declaration at the consumer. The new `status['clerk']` slot should mirror this exactly: writer-owned shape, consumer-side narrow type, no shared type import. Read the Spider's `setWritStatus` call site and the Reckoner's `reckoner.ts:199` read site as the canonical reference.
- **`packages/plugins/clerk/src/clerk.ts:1063–1104`** — `transition()`'s safe-fields strip and `setWritStatus()`'s transactional read-modify-write. The cascade engine already passes `{ resolution }` through `transition()`'s `safeFields` lane; the new write rides separately via `setWritStatus()` and must precede the transition call.
- **`packages/plugins/clerk/src/children-behavior-engine.ts`** — the cascade engine's `fireTrigger` is the only call-site that needs to add the new write. Read this file end-to-end before editing; the existing `copyResolution` branch is the structural neighbor of the new write.
- **`packages/plugins/clerk/src/clerk.ts:772–796`** — `countDescendantsByPhase` is the precedent for recursive parent-walks via the `[parentId]` index. The chase-chain logic in D4 is structurally similar but walks *downward* through `status['clerk'].triggeringChildId`, not through `parentId`.
- **`packages/plugins/reckoner/src/reckoner.ts:189–252`** — the existing emit branches for `emitStuck` and `emitFailed`, including the dedupe identity, the `event.entry` reads, and the current `parseChildFailures` call sites. These branches are the surgical edit targets.

## What NOT To Do

- Do **not** add backward compatibility for the legacy `Child "<id>" failed:` resolution shape. There is no fallback layer; pre-T2 writs that have already passed terminal will not re-emit pulses, and the cutover is the point.
- Do **not** add a startup backfill, migration, or one-shot script to populate `status['clerk']` on historical writs. The new slot is forward-only.
- Do **not** generalize the cascade record into a shared `clerk.getCascadeChain()` API or hoist the chase-chain logic into a Clerk helper. There is exactly one consumer today (the Reckoner); locality wins until a second appears. This generalization is tracked as a future observation, not as in-scope work.
- Do **not** add a fresh `Reckoner — writ-stuck emission` integration test asserting on the "Originated from child …" summary line. The engine-side D8 assertion plus the existing emit-pathway tests cover the surface; expanding the stuck-pulse coverage is a separate concern.
- Do **not** loosen `transition()`'s safe-fields strip to allow a `status` patch to ride along with the phase change. D2 explicitly rejected the carve-out option in favor of the dual-write `setWritStatus` → `transition()` sequence.
- Do **not** record additional fields in the new slot beyond the immediate triggering child id. The leaf id, the full leaves list, the cascade depth, and any other speculative structure are deliberately excluded by D3.
- Do **not** truncate the chase-chain at a fixed N. The cascade depth is already bounded by `MAX_CASCADE_DEPTH = 16`; a per-pulse cap would be redundant.
- Do **not** treat the lattice-discord channel as in-scope for code changes. Its rendering already accepts the `childFailures` array; the only verification owed is that its test suite continues to pass.

<task-manifest>
  <task id="t1">
    <name>Add status['clerk'] sub-slot type and engine write</name>
    <files>packages/plugins/clerk/src/children-behavior-engine.ts; packages/plugins/clerk/src/types.ts (or wherever the writ-status sub-slot types live, mirroring the Spider precedent); packages/plugins/clerk/src/children-behavior-engine.test.ts</files>
    <action>Introduce a Clerk-owned status sub-slot carrying the immediate triggering child id, written by the children-behavior cascade engine at the moment a parent's terminal transition fires. The write must precede the transition call (the dedupe-key constraint in the Scope &amp; Blast Radius section). Follow the Spider precedent for slot shape and ownership: writer-side type, consumer-side narrow re-declaration. Extend the engine's existing test suite to assert the write fires under each existing trigger configuration, with ordering observable (status before transition).</action>
    <verify>pnpm -w --filter @nexus/clerk typecheck &amp;&amp; pnpm -w --filter @nexus/clerk test</verify>
    <done>The cascade engine writes the structured record on every fire; engine tests assert the write under each trigger configuration; the failOnError contract still holds (no swallowed errors from the new write).</done>
  </task>

  <task id="t2">
    <name>Switch Reckoner emit branches to chase-chain reads</name>
    <files>packages/plugins/reckoner/src/reckoner.ts (the emitStuck and emitFailed branches at ~lines 189–252); narrow consumer-side type for status['clerk'] declared in the Reckoner package</files>
    <action>Replace the two parseChildFailures call sites with a chase-chain read: starting from the parent's status['clerk'].triggeringChildId, walk downward by reading each successive writ's own status['clerk'].triggeringChildId until the chain terminates at a writ without one. Use the resulting ordered list of ids to populate WritFailedContext.childFailures and to compose the "Originated from child …" summary line. Mirror the existing emit-branch shape; keep the dedupe identity and event.entry reads unchanged. The chain walk is bounded by MAX_CASCADE_DEPTH = 16 — no explicit cap is needed, but the loop must terminate cleanly when no further triggeringChildId is present.</action>
    <verify>pnpm -w --filter @nexus/reckoner typecheck &amp;&amp; pnpm -w --filter @nexus/reckoner test</verify>
    <done>Both emit branches build childFailures and the summary line from the new mechanism; no call site of parseChildFailures remains in reckoner.ts.</done>
  </task>

  <task id="t3">
    <name>Delete parseChildFailures and its dedicated tests</name>
    <files>packages/plugins/reckoner/src/predicates.ts; packages/plugins/reckoner/src/predicates.test.ts</files>
    <action>Remove the parseChildFailures function and the dedicated describe block exercising the legacy regex. Update the predicates module's top-of-file JSDoc to reflect the post-cutover surface. Verify no consumers remain anywhere in the monorepo.</action>
    <verify>grep -rn "parseChildFailures" packages/ apps/ docs/ &amp;&amp; pnpm -w typecheck</verify>
    <done>The grep returns no hits; typecheck and tests pass with the function and its tests fully removed.</done>
  </task>

  <task id="t4">
    <name>Rewrite the cascaded-leaf-cause integration test</name>
    <files>packages/plugins/reckoner/src/reckoner.test.ts (the "surfaces cascaded leaf causes" block around lines 388–411)</files>
    <action>Replace the manual two-leg drive (which currently posts both child and parent transitions and hand-rolls a legacy 'Child "..." failed:' resolution string) with a single child-failure driver, letting the children-behavior cascade engine carry the parent's terminal transition end-to-end. Assert the parent pulse's context.childFailures contains the chain (including the chase-chain projection in the multi-level case) and that the summary line includes the leaf cause. Where the chase-chain projection is non-trivial, consider a smaller dedicated test alongside the integration assertion — but the integration test is the load-bearing one.</action>
    <verify>pnpm -w --filter @nexus/reckoner test</verify>
    <done>The rewritten test drives only the child's failure, exercises the engine-driven cascade end-to-end, and asserts the new pulse content; the test would fail under the pre-fix code path, demonstrating it now guards the regression.</done>
  </task>

  <task id="t5">
    <name>Update apparatus documentation across Reckoner and Clerk</name>
    <files>docs/architecture/apparatus/reckoner.md (the "Roots-only scoping" section around lines 165–167 and any neighboring text describing the legacy cascade); packages/plugins/reckoner/README.md (the analogous paragraphs around lines 77 and 111–114); docs/architecture/apparatus/clerk.md and/or packages/plugins/clerk/README.md (add the new status['clerk'] slot section)</action>
    <action>Strike all references to the deleted legacy cascade-resolution shape ('Child "..." failed: ...') from the Reckoner architecture doc and README, replacing them with a one-paragraph summary of the new engine-published / Reckoner-read mechanism. In the Clerk apparatus documentation, add a section describing the status['clerk'] sub-slot's shape, ownership (Clerk writes; Reckoner reads), the chase-chain semantics on the consumer side, and the relationship to the cascade engine's fireTrigger. Mirror the existing Spider slot's documentation style if present.</action>
    <verify>grep -rn 'Child "' docs/ packages/plugins/reckoner/README.md packages/plugins/clerk/README.md &amp;&amp; grep -rn "parseChildFailures" docs/ packages/plugins/reckoner/README.md packages/plugins/clerk/README.md</verify>
    <done>Neither grep returns load-bearing hits (incidental quoting in changelogs aside); the Clerk docs contain a status['clerk'] section; the Reckoner docs describe the post-T3 mechanism.</done>
  </task>
</task-manifest>
