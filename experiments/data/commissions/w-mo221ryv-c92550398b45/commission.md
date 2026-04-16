<task-manifest>` XML the spec-writer produced.

## Rationale

Two coupled defects in `astrolabe`'s spec-publish engine both trace to a single conditional branch: when the spec contains a `<task-manifest>`, the engine (a) posts the mandate in `draft` status, strips the manifest, creates one `piece` writ per task, then transitions to `open`, and (b) leaves the published mandate body without the manifest. Because no in-repo rig template maps `mandate` to the `implement-loop` engine, the auto-created pieces sit unowned and the `implement` engine never sees the task breakdown its epilogue is designed to consume. Collapsing to the single-post path fixes both defects with one change.

## Scope & Blast Radius

This commission changes **only** the astrolabe `spec-publish` engine and its immediately-coupled artifacts. It does **not** remove the downstream piece-system infrastructure (see "What NOT To Do").

Affected concerns:

- The `spec-publish` engine's `run()` behavior — the conditional that branches on manifest presence must be eliminated so that publishing is a single-post operation under all inputs.
- The `parseTaskManifest` helper — private to `spec-publish` in terms of runtime, but re-exported from `engines/index.ts`. It has no callers other than `spec-publish.ts` and its own unit tests. When it is deleted, the re-export must be dropped at the same time. Verify no other consumers exist by grepping the monorepo for `parseTaskManifest` before committing.
- The engine's top-of-file docstring — currently describes the two-path behavior. Must be rewritten to describe the simplified single-post behavior.
- The spec-publish tests in `engines.test.ts` — one test exercises the removed branch, three tests exercise the removed helper, and one test is named as a contrast with the removed branch. All must be updated per D2.

Scope excludes all downstream consumers of the `piece` writ type (see "What NOT To Do").

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | How should the piece-aware branch be disabled? | **Remove it.** Delete the entire piece-aware branch in `spec-publish.ts`; delete the `parseTaskManifest` helper and its export from `engines/index.ts`; delete the `parseTaskManifest` unit tests in `engines.test.ts`. The legacy single-post path becomes the only path. Update the file's top-of-file docstring to describe the simplified behavior. | Prefer removal to deprecation. The branch has no other callers; the helper has no other callers; no patron request for a flag. A future re-enable would be a deliberate re-implementation. |
| D2 | How should the existing spec-publish tests be updated? | **Remove and rename.** Delete the manifest-aware test and the `parseTaskManifest` tests. Rename the `'falls back to legacy path when spec has no task-manifest'` test to something like `'publishes the spec verbatim as the mandate body'` so its description matches the now-canonical behavior. Add an assertion that the published body contains the `<task-manifest>` block when one is present. | The "falls back to legacy" framing leaks the removed branch into the test description. The rename aligns the test with simplified behavior and the added assertion guards against the stripping behavior reappearing. |
| D3 | Should the piece-system infrastructure (piece-add tool, implement-loop engine, piece-session engine, piece writ-type registration, PIECE_EXECUTION_EPILOGUE constant, related tests) be removed now? | **Do nothing.** Leave all infrastructure in place as orphaned-but-tested framework surface area. | Smallest blast radius. Trades cleanliness for a re-enable path that requires no re-implementation. Explicit patron choice — overrides the inventory-suggested cleanup. |

## Acceptance Signal

1. The full test suite passes (`pnpm -w test`) and the repo typechecks (`pnpm -w typecheck`).
2. Grepping the monorepo for `parseTaskManifest` returns no hits.
3. Running spec-publish against a plan whose spec contains a `<task-manifest>` block produces exactly one posted writ (the mandate) with no children auto-attached, and the posted mandate's body contains the `<task-manifest>` block character-for-character as it appeared in the spec.
4. Running spec-publish against a plan whose spec contains no `<task-manifest>` block produces the same single-post outcome (behavior unchanged from the prior legacy path).
5. The published mandate is transitioned to `open` via its normal creation default — no intermediate `draft` status appears in the transition log.
6. The spec-publish engine's top-of-file docstring accurately describes the single-post behavior (no stale references to piece creation, manifest stripping, or a two-path conditional).
7. Downstream piece-system infrastructure remains intact: `packages/plugins/spider/src/engines/implement-loop.ts`, `packages/plugins/spider/src/engines/piece-session.ts`, `packages/plugins/clerk/src/tools/piece-add.ts`, the `piece` writ-type registration in `packages/plugins/astrolabe/src/astrolabe.ts`, and all associated tests still exist and pass.

## Existing Patterns

- **The legacy single-post path already present in `packages/plugins/astrolabe/src/engines/spec-publish.ts`** is the exact shape the simplified engine should take: one `clerk.post`, one `clerk.link` for the `refines` edge, one `book.patch` to mark the plan completed. No `draft: true`, no explicit `transition`. Keep this path as-is; just make it unconditional.
- **`packages/plugins/spider/src/engines/implement.ts`** shows how the downstream implementer consumes a `<task-manifest>` via its `EXECUTION_EPILOGUE`. The epilogue is conditional on the manifest's presence in the body — benign when absent. Preserving the manifest in the published body (S2) is what makes this epilogue do its job.
- **`packages/plugins/astrolabe/src/engines.test.ts`'s existing `'falls back to legacy path when spec has no task-manifest'` test** is the template for the renamed canonical test. Its setup, mocking, and assertion structure should be reused; only the title and the manifest-preservation assertion need to change.

## What NOT To Do

- **Do not remove any piece-system infrastructure.** Per D3, the following stay in place and continue to pass their tests:
  - `packages/plugins/spider/src/engines/implement-loop.ts` and its registration in `spider.ts`
  - `packages/plugins/spider/src/engines/piece-session.ts` and its `PIECE_EXECUTION_EPILOGUE` export
  - `packages/plugins/clerk/src/tools/piece-add.ts` and its registration in `clerk.ts`
  - The `piece` writ-type registration in `packages/plugins/astrolabe/src/astrolabe.ts`
  - `packages/plugins/spider/src/piece-pipeline.test.ts` (unchanged)
  - The `piece-add` tests in `packages/plugins/clerk/src/clerk.test.ts` (unchanged)
  - The piece writ-type assertion in `packages/plugins/astrolabe/src/supportkit.test.ts` (unchanged)
- **Do not update the documentation** (`docs/architecture/apparatus/astrolabe.md`, `docs/architecture/apparatus/spider.md`, `packages/plugins/astrolabe/README.md`). Doc/code drift is already present and tracked in observations; realigning docs is out of scope.
- **Do not update the `clerk.ts` line 68 comment** that references `PIECE_EXECUTION_EPILOGUE` as an example. Since the constant is being retained (per D3), the comment remains valid.
- **Do not add a flag or feature toggle** to gate the old piece-aware behavior. D1's rejected `flag-gate` option was explicitly not selected.
- **Do not rewrite the legacy path**. The legacy single-post path is already correct behavior — it becomes the only path by deletion of the alternative, not by rewrite.
- **Do not change `spec-publish`'s plan-status validation, title-derivation, or `generatedWritType` resolution.** These are upstream of the branch being removed and are unaffected.

<task-manifest>
  <task id="t1">
    <name>Simplify spec-publish engine to single-post behavior</name>
    <files>packages/plugins/astrolabe/src/engines/spec-publish.ts</files>
    <action>Eliminate the conditional branching in the engine's run() method so that publishing always takes the single-post shape: one mandate post containing the full spec body verbatim, one refines link, one book.patch to mark the plan completed. Remove the parseTaskManifest helper from this file entirely (it has no remaining callers once the branch is gone). Rewrite the file's top-of-file docstring to describe the simplified behavior — no mention of piece creation, manifest stripping, draft-state mandates, or a two-path conditional. Do not alter upstream validation, title derivation, or generatedWritType resolution.</action>
    <verify>pnpm --filter @nexus/astrolabe typecheck &amp;&amp; grep -rn "parseTaskManifest" packages/plugins/astrolabe/src/engines/spec-publish.ts</verify>
    <done>spec-publish.ts contains only the single-post path, no parseTaskManifest helper, and a docstring that accurately describes the simplified behavior. Typecheck passes.</done>
  </task>