# Cleanup: delete vision-keeper plugin + redefine The Surveyor

## Intent

Delete the `@shardworks/vision-keeper-apparatus` plugin in full, and redefine "The Surveyor" across the framework architecture documentation to mean the cartograph-decomposition apparatus described in `docs/architecture/surveying-cascade.md`. This is a coordinated cleanup with no implementation logic — purely deletions, doc rewrites, and a sweep of stale citations.

## Rationale

The vision-keeper plugin was authored as the canonical worked example for the Reckoner contract — a reference petitioner exercising every contract surface. With the cartograph + surveying-cascade architecture now settled, the role formerly called "vision-keeper" has been renamed "surveyor" and reframed: it operates on cartograph nodes (visions/charges/pieces), not on drift snapshots, and the activity defines the role rather than the input shape. Leaving the legacy plugin in place creates a naming collision (the architecture's reserved "Surveyor" identity now points at the new apparatus) and a conceptual landmine (any reader encountering `vision-keeper` will conflate it with the new framing). The obsolete codex-mapping description of The Surveyor in adjacent architecture docs reproduces the same failure mode one ring out and must be cleared at the same time.

## Scope & Blast Radius

**Plugin deletion.** The entire `packages/plugins/vision-keeper/` directory — package metadata, source, tests, README — is removed. The `pnpm-workspace.yaml` glob already covers `packages/plugins/*`; deleting the directory is sufficient and `pnpm install` regenerates the lockfile cleanly. No production code in any other package imports a symbol from `@shardworks/vision-keeper-apparatus` — verified by grep — so the deletion has no compile-time consumers to update.

**Reckoner-package internal sweep.** Although no symbol is imported, the Reckoner package retains stale references to the deleted plugin in three places:
- Literal `'vision-keeper'` / `'vision-keeper.snapshot'` / `'vision-keeper.io/vision-id'` strings used as fixture values throughout the Reckoner's unit tests (`reckoner.test.ts`, `reckoner-tick.test.ts`). Rename to a generic placeholder following the precedent already set by `packages/plugins/reckoner/src/integration.test.ts`, which uses `'tester.kind'`.
- JSDoc comments in `packages/plugins/reckoner/src/types.ts`, `packages/plugins/reckoner/src/tick.ts`, and `packages/plugins/reckoner/src/integration.test.ts` that name the deleted package as a downstream consumer or counterpart. Update inline.
- The Reckoner package README (`packages/plugins/reckoner/README.md`) carries worked-example blocks (create+stamp, stamp-only, kit-declaration) using `'vision-keeper.snapshot'`. Sweep these.

**Petitioner-registration contract doc.** `docs/architecture/petitioner-registration.md` is the largest single edit:
- Section 11 ("Built-in example: vision-keeper") is deleted in full.
- Inline `vision-keeper.snapshot` / `vision-keeper.io/vision-id` / `vision-keeper-on-decline` citations in §§1, 3, 5, 9 are replaced with the generic placeholder source `tech-debt.detected` (already cited in §5's source-id-grammar bullets).
- The v0-scope callout near the top of the doc has its "any non-`vision-keeper` petitioner are explicitly out of scope" clause stricken; the remainder of the callout (which describes other v0-scope items accurately) stays.

**The Surveyor redefinition.** Three enumerated architecture docs are rewritten so The Surveyor is described as the cartograph-decomposition apparatus — surveying cartograph nodes, producing structural decompositions, registering as a kit-contributable surveyor with the surveyor-apparatus substrate:
- `docs/guild-metaphor.md` — "The Surveyor" section.
- `docs/architecture/index.md` — the apparatus prose at line 69 and the line-286 footnote (updated to reflect that the surveyor-apparatus substrate is now anticipated as a planned package; The Executor's not-yet-extracted status is preserved verbatim). The System-at-a-Glance ASCII block at line 27 is unchanged — it lists apparatus by layer-name, which is accurate at that level of abstraction.
- `docs/architecture/plugins.md` — light-touch audit; the existing references treat Surveyor as a generic apparatus name, so no codex-mapping framing needs to be replaced. Verify nothing slipped in.

Each rewrite forward-links to `docs/architecture/surveying-cascade.md` using a relative-path markdown link (`architecture/surveying-cascade.md` from `docs/guild-metaphor.md`; `surveying-cascade.md` from the two `docs/architecture/` files). The cascade doc itself is not present in this worktree — it lands via a separate commission — and the dangling link is deliberate.

**Adjacent Surveyor codex-mapping docs.** Two apparatus docs carry the same obsolete codex-mapping framing the brief enumerates and must be swept in this commission:
- `docs/architecture/apparatus/scriptorium.md` — five references describing "the Surveyor's domain" / "codex-awareness" / "codex profiles" (lines 7, 15, 650, 671, 689).
- `docs/architecture/apparatus/review-loop.md` — one reference to "Surveyor codex profiles" (line 367).

Replace with neutral language consistent with the new cartograph-decomposition framing, or remove the reference outright where the original sentence loses its purpose.

**Secondary docs with illustrative citations.** Five docs cite vision-keeper as a worked-example source or future emitter without being the load-bearing contract surface. Sweep illustrative `vision-keeper.snapshot` / `vision-keeper-on-*` citations and replace with `tech-debt.detected`:
- `docs/architecture/apparatus/reckoner.md`
- `docs/architecture/reckonings-book.md`
- `docs/future/guild-vocabulary.md`
- `docs/architecture/apparatus/lattice.md`
- (Reckoner package README is listed under the Reckoner-package internal sweep above.)

**Cross-cutting verification.** After all edits, a grep for `vision-keeper` across the entire worktree must return only the intentional residues — there is exactly one: `packages/plugins/cartograph/vision-keeper.md`, the cartograph placeholder role file, which the brief explicitly defers to the substrate commission. Any other hit is drift the implementer must resolve.

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | Reckoner test-fixture `'vision-keeper'` literal strings | rename | Removal beats deprecation; Reckoner's `integration.test.ts` already uses `'tester.kind'` — follow the precedent. |
| D2 | `petitioner-registration.md` §11 ("Built-in example: vision-keeper") | delete-section | Section's purpose was the in-tree worked example, which no longer exists; the rest of the contract doc stands on its own. |
| D3 | Inline `vision-keeper.*` citations in §§1, 3, 5, 9 | replace-generic | Replace with a generic placeholder source rather than strip examples or leave the deleted plugin's name as a phantom citation. |
| D4 | v0-scope callout clause naming "any non-vision-keeper petitioner" | strike-clause | Smallest correct edit; the remainder of the callout still describes the v0 scope accurately. |
| D5 | `architecture/index.md` line-286 footnote about not-yet-extracted apparatus | update-anticipated | The surveyor-apparatus substrate is a named queued commission; reflect that. The Executor's not-yet-extracted state is preserved verbatim. |
| D6 | Forward-reference form for `surveying-cascade.md` | forward-link-relative | Use relative-path markdown links matching the existing arch-doc convention; dangling link is normal in a draft and resolves cleanly. |
| D7 | System-at-a-Glance ASCII block listing "Clockworks · Surveyor · Clerk" | keep-block-unchanged | The block lists apparatus by name; The Surveyor remains an apparatus identity. The block is correct at the right level of abstraction. |
| D8 | Illustrative `vision-keeper.*` citations in secondary docs | rewrite-now | Phantom citations to a deleted plugin reproduce the naming-collision failure mode one ring out; sweep them now while the artificer is in the area. |
| D9 | Generic placeholder source-id replacing `vision-keeper.snapshot` | tech-debt.detected | Already cited in `petitioner-registration.md` §5's source-id grammar; reuse established vocabulary instead of inventing a new placeholder. |
| D10 | Scriptorium / review-loop obsolete codex-mapping framing | rewrite-both-now | Leaving the framing intact in two adjacent apparatus docs reproduces the conceptual landmine the brief identifies. |
| D11 | Reckoner JSDoc references to the deleted package (`tick.ts`, `types.ts`, `integration.test.ts`) | update-now | Dangling JSDoc refs are drift; the artificer is already touching the package for the README sweep — concurrent edit. |

## Acceptance Signal

1. `pnpm install` completes cleanly after the package directory is deleted; the `pnpm-lock.yaml` no longer contains a `packages/plugins/vision-keeper` entry.
2. `pnpm -r build` succeeds across the entire monorepo.
3. `pnpm -r test` passes across the entire monorepo, including all Reckoner tests after fixture renames.
4. `grep -r vision-keeper` across the worktree returns exactly one path: `packages/plugins/cartograph/vision-keeper.md` (the deferred placeholder). No other hits anywhere — no doc reference, no test fixture, no code comment.
5. `docs/architecture/petitioner-registration.md` reads coherently end-to-end without §11; no broken section cross-references; the v0-scope callout no longer names the deleted plugin.
6. The three enumerated framework architecture docs (`docs/guild-metaphor.md`, `docs/architecture/index.md`, `docs/architecture/plugins.md`) describe The Surveyor consistently as the cartograph-decomposition apparatus, each with a working relative-path forward-link to `surveying-cascade.md`.
7. `docs/architecture/apparatus/scriptorium.md` and `docs/architecture/apparatus/review-loop.md` no longer describe The Surveyor in codex-mapping / codex-awareness / codex-profile terms.

## Existing Patterns

- **Generic-tester precedent for fixture renames.** The Reckoner's own `integration.test.ts` already uses `'tester'` / `'tester.kind'` as the generic-source-id convention for unit-test fixtures. Apply the same convention to the rename targets in this commission. **Precedent inlined below; do not Read `integration.test.ts` for it:**

  ```ts
  // packages/plugins/reckoner/src/integration.test.ts (excerpt, lines 184-194)
  const reckonerKitEntries: KitEntry[] = [
    {
      pluginId: 'tester',
      packageName: '@test/tester',
      type: 'petitioners',
      value: [
        {
          source: 'tester.kind',
          description: 'a tester petitioner',
        },
      ],
    },
    // ...
  ];
  ```
- **`packages/plugins/sentinel/`** — structural sibling pattern. The legacy stall/fail/drain pulse emitter formerly named "the Reckoner" was migrated under the `sentinel` plugin id when the Reckoner name was reclaimed for the petitioner-scheduler. Same shape as vision-keeper → surveyor: an old name is reclaimed for a new framework concept and the previous behavior moves under a new package name. Useful reference if any unexpected coupling surfaces during the deletion.
- **`docs/architecture/petitioner-registration.md` §5 source-id-grammar bullets** — the existing list of example source-ids (including `tech-debt.detected` and `patron-bridge.commission`) shows the established vocabulary for placeholder source names. Reuse `tech-debt.detected` for every replacement.
- **Existing arch-doc cross-link convention** — relative-path markdown links between docs (e.g., from `docs/guild-metaphor.md` to `docs/architecture/*.md` use `architecture/foo.md`; from one `docs/architecture/*.md` to another use `foo.md`). Match this exactly when forward-linking `surveying-cascade.md`.

## What NOT To Do

- Do **not** touch `packages/plugins/cartograph/vision-keeper.md`, the cartograph package's `package.json` `files` array, or the cartograph README's reference to the placeholder. The brief explicitly defers the cartograph placeholder to the substrate commission.
- Do **not** create the new `surveyor-apparatus` substrate plugin. That is a separate queued commission.
- Do **not** add a fresh worked example to the Reckoner contract doc. The contract is intended to stand on its abstract description; a new worked example may be added later if a real consumer benefits.
- Do **not** add sanctum-side vocabulary registry entries or aliases for the rename. Sanctum-side vocab is already in place and out of scope.
- Do **not** preserve `vision-keeper` as a deprecated alias, redirect file, or backward-compat shim. The plugin is deleted; references are removed, not deprecated.
- Do **not** edit the System-at-a-Glance ASCII block in `docs/architecture/index.md` (line 27). The block names apparatus by layer; The Surveyor remains an apparatus identity.
- Do **not** invent a new placeholder source-id name. Use `tech-debt.detected` consistently for every replacement.
- Do **not** modify `pnpm-workspace.yaml`. Its glob already handles the deleted directory.

<task-manifest>
  <task id="t1">
    <name>Rename Reckoner test fixtures off vision-keeper literals</name>
    <files>packages/plugins/reckoner/src/reckoner.test.ts, packages/plugins/reckoner/src/reckoner-tick.test.ts</files>
    <action>Audit both files for the literal strings `'vision-keeper'` (used as fixture pluginId), `'vision-keeper.snapshot'` (used as fixture source), and `'vision-keeper.io/vision-id'` (used as fixture label key). Replace consistently with the generic-tester convention already established by `packages/plugins/reckoner/src/integration.test.ts`: use `'tester'` for pluginId and `'tester.kind'` for source. Choose a parallel generic label key in keeping with that convention. The strings are fixture values, not symbols — no imports change.</action>
    <verify>pnpm --filter @shardworks/reckoner-apparatus test</verify>
    <done>Both Reckoner unit-test files pass with no `'vision-keeper'` literals remaining; the renamed fixture values are consistent with the precedent in `integration.test.ts`.</done>
  </task>

  <task id="t2">
    <name>Sweep Reckoner package JSDoc and README of vision-keeper references</name>
    <files>packages/plugins/reckoner/src/types.ts, packages/plugins/reckoner/src/tick.ts, packages/plugins/reckoner/src/integration.test.ts, packages/plugins/reckoner/README.md</files>
    <action>Update three JSDoc / describe-block sites that name the deleted package as a downstream consumer or counterpart fixture (`types.ts`, `tick.ts`, `integration.test.ts`) so the comments either cite a generic petitioner or simply omit the now-broken reference, whichever reads cleaner. Sweep the README's worked-example blocks (create+stamp, stamp-only, kit-declaration) replacing every `'vision-keeper.snapshot'` and `'vision-keeper.io/vision-id'` citation with `tech-debt.detected` and a parallel generic label key. Preserve the pedagogical shape of each example.</action>
    <verify>pnpm --filter @shardworks/reckoner-apparatus build &amp;&amp; pnpm --filter @shardworks/reckoner-apparatus test</verify>
    <done>The Reckoner package contains no references to vision-keeper in code comments, JSDoc, or README; the package builds and tests pass.</done>
  </task>

  <task id="t3">
    <name>Delete the vision-keeper plugin directory and regenerate the lockfile</name>
    <files>packages/plugins/vision-keeper/ (entire directory), pnpm-lock.yaml</files>
    <action>Remove the entire `packages/plugins/vision-keeper/` directory — package metadata, source, tests, README, every file. Then run `pnpm install` from the repo root to regenerate the lockfile. The `pnpm-workspace.yaml` glob already covers `packages/plugins/*`, so no workspace edit is needed. No other package imports any symbol from `@shardworks/vision-keeper-apparatus` (verified at planning time), so this should not cascade compile errors anywhere.</action>
    <verify>pnpm install &amp;&amp; pnpm -r build</verify>
    <done>The directory is gone, the lockfile no longer carries a `packages/plugins/vision-keeper` block, and the monorepo builds end-to-end.</done>
  </task>

  <task id="t4">
    <name>Rewrite petitioner-registration.md as a stand-alone contract doc</name>
    <files>docs/architecture/petitioner-registration.md</files>
    <action>Delete §11 ("Built-in example: vision-keeper") in full. Sweep every inline citation of `vision-keeper.snapshot`, `vision-keeper.io/vision-id`, and `vision-keeper-on-decline` in §§1, 3, 5, 9; replace each with `tech-debt.detected` (and a parallel generic label key / standing-order name where applicable, keeping the example shape coherent). Strike the v0-scope callout clause naming "any non-`vision-keeper` petitioner are explicitly out of scope"; preserve the rest of the callout. Reread the doc end-to-end and resolve any cross-references that broke when §11 was removed (e.g., "as shown in §11" pointers, table-of-contents entries).</action>
    <verify>grep -n "vision-keeper" docs/architecture/petitioner-registration.md (must return zero hits) and a manual readthrough confirming no broken §11 references</verify>
    <done>The doc reads coherently as an abstract contract description with no in-tree example, no surviving vision-keeper citations, and no dangling section cross-references.</done>
  </task>

  <task id="t5">
    <name>Redefine The Surveyor in the three enumerated framework architecture docs</name>
    <files>docs/guild-metaphor.md, docs/architecture/index.md, docs/architecture/plugins.md</files>
    <action>In `docs/guild-metaphor.md`, rewrite "The Surveyor" section so it describes the apparatus that surveys cartograph nodes (visions / charges / pieces), produces structural decompositions, and registers as a kit-contributable surveyor with the surveyor-apparatus substrate. Forward-link to `architecture/surveying-cascade.md`. In `docs/architecture/index.md`, rewrite the apparatus-layer prose at line 69 to match the new framing and update the line-286 footnote to indicate that the surveyor-apparatus substrate is now anticipated as a planned package landing in a separate commission, while preserving The Executor's not-yet-extracted status verbatim. Forward-link to `surveying-cascade.md`. Do NOT modify the System-at-a-Glance ASCII block at line 27. In `docs/architecture/plugins.md`, audit the three Surveyor mentions; the existing references treat Surveyor as a generic apparatus name and likely need no rewrite — confirm by reading each in context, and only edit if a codex-mapping framing has slipped in. If any rewrite is needed there, forward-link to `surveying-cascade.md` matching the existing arch-doc relative-path convention.</action>
    <verify>grep -n "codex-aware\|codex profile\|codex-mapping\|tracks what work applies" docs/guild-metaphor.md docs/architecture/index.md docs/architecture/plugins.md (must return zero hits relating to The Surveyor) and a manual readthrough of the three docs</verify>
    <done>All three docs describe The Surveyor as the cartograph-decomposition apparatus; each rewrite has a working relative-path forward-link to `surveying-cascade.md`; the line-286 footnote reflects the surveyor-apparatus's planned-package status; the ASCII block is unchanged.</done>
  </task>

  <task id="t6">
    <name>Sweep adjacent Surveyor codex-mapping framing from Scriptorium and review-loop</name>
    <files>docs/architecture/apparatus/scriptorium.md, docs/architecture/apparatus/review-loop.md</files>
    <action>In `scriptorium.md`, audit every reference to The Surveyor (the planning inventory identified five: lines 7, 15, 650, 671, 689). Replace codex-mapping / codex-awareness / codex-profiles framing with neutral language consistent with the new cartograph-decomposition Surveyor, or remove the sentence outright where the original sentence loses its purpose under the new framing. In `review-loop.md`, do the same for the single reference at line 367 ("Surveyor codex profiles"). Do not introduce new claims about how Scriptorium and Surveyor relate under the new architecture — that is the surveying-cascade doc's job; just clear the obsolete framing here.</action>
    <verify>grep -n "Surveyor" docs/architecture/apparatus/scriptorium.md docs/architecture/apparatus/review-loop.md and confirm every remaining hit is consistent with the cartograph-decomposition framing or has been removed</verify>
    <done>Neither doc describes The Surveyor in codex-mapping / codex-awareness / codex-profile terms; remaining mentions (if any) are framing-neutral and accurate.</done>
  </task>

  <task id="t7">
    <name>Sweep illustrative vision-keeper citations from secondary docs</name>
    <files>docs/architecture/apparatus/reckoner.md, docs/architecture/reckonings-book.md, docs/future/guild-vocabulary.md, docs/architecture/apparatus/lattice.md</files>
    <action>In each of the four docs, replace illustrative citations of `vision-keeper.snapshot`, `vision-keeper.io/vision-id`, `vision-keeper-on-accept`, `vision-keeper-on-decline`, and bare `vision-keeper` / `vision-keepers` references (used as a future-emitter or worked-example name) with `tech-debt.detected` (for source-ids), parallel generic label / relay names, and a generic petitioner descriptor (for prose mentions). Preserve the pedagogical shape of each example. Do NOT introduce a new petitioner concept; reuse `tech-debt.detected` for every replacement, matching the established vocabulary in `petitioner-registration.md` §5.</action>
    <verify>grep -rn "vision-keeper" docs/ packages/ (must return exactly one hit: `packages/plugins/cartograph/vision-keeper.md`, the deferred placeholder)</verify>
    <done>All four secondary docs are coherent without the deleted-plugin name; the only surviving `vision-keeper` reference anywhere in the worktree is the cartograph placeholder file (deferred to the substrate commission).</done>
  </task>
</task-manifest>
