# Remove `analysis` field and tag-building from astrolabe

## Intent

Remove the `DecisionAnalysis` interface and all supporting tag-building code from the astrolabe plugin. The sage-analyst and sage-reading-analyst instructions no longer populate the `analysis` metadata, so the classification axes (`category`, `observable`, `confidence`, `stakes`) and the tag-mapping code that rendered them on the patron review UI are dead weight.

## Rationale

The analysis metadata rendered as display tags on the patron review UI but never gated which decisions surfaced — the razor alone does that. Now that the sage instructions no longer write the field, the supporting code is kept "just in case" and must go. Removing it cleans the plugin's public type surface and re-aligns the plugin README and framework architecture doc with actual behavior.

## Scope & Blast Radius

This change is confined to:

- **`packages/plugins/astrolabe`** — types, Zod schema, decision-review engine, barrel export, test suite, README.
- **`docs/architecture/apparatus/astrolabe.md`** — framework architecture doc references.

Cross-cutting concerns to watch:

- **Public API narrowing.** `DecisionAnalysis` is re-exported from the plugin barrel; removing it is a breaking change to astrolabe's public type surface. A monorepo grep currently confirms zero external consumers — verify this invariant still holds at commit time by grepping the whole repo for `DecisionAnalysis`, `buildAnalysisTags`, `decisionAnalysisSchema`, and the four tag-map constant names.
- **Zod input contract for `decisions-write`.** The tool input validator currently admits an `analysis` key. Removing that key narrows the contract. Verify no caller writes `analysis:` against `decisions-write` by grepping the repo.
- **Test-fixture type-check coupling.** Every tag-asserting test sets an `analysis: { ... }` literal on a `Decision` fixture. Any residual literal after the type is removed will fail strict TypeScript compilation of the test file. Verify by running the plugin typecheck after the test-file edit.
- **Guild-wide `tags?` field on Spider question specs.** Do NOT remove. Spider's `feedback.js` UI aggregates this field into filter chips; the type is guild-wide with non-astrolabe consumers. Astrolabe must simply stop emitting tags.
- **Doc/code alignment.** The plugin README's `Decision` + `DecisionAnalysis` subsection and the framework architecture doc's `DecisionAnalysis` references must land in the same commit as the code change. Verify with a grep over both files for `DecisionAnalysis`, `analysis.category`, `analysis.stakes`, `analysis.confidence`, `analysis.observable`, and the trailing phrase "and analysis" after the edit.

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | Remove the guild-wide `tags?: string[]` field from Spider's `ChoiceQuestionSpec` / `BooleanQuestionSpec` / `TextQuestionSpec`? | keep | Spider's `feedback.js` actively consumes `tags` for filter chips in the patron review UI — guild-wide type with non-astrolabe consumers. Only drop astrolabe's use of the field. |
| D2 | How to satisfy the verification "a surfaced question has no `tags` property set by astrolabe"? | add-fresh-test | A dedicated named test makes the post-removal invariant visible and guards against accidental reintroduction. |
| D3 | Strip only tag assertions, or delete the tag-asserting test cases wholesale? | delete-all | Every tag test is single-purpose — it exists only to exercise the tag path. Stripping assertions would leave empty shells. Remove the `// ── Analysis tags tests ──` banner with them. |
| D4 | Rewrite the `PlanDoc.decisions` JSDoc "Architectural/design decisions with options and analysis."? | rewrite | After removal the trailing "and analysis" reads as a stale field reference. Shorten to "Architectural/design decisions with options." in both `packages/plugins/astrolabe/src/types.ts` and `docs/architecture/apparatus/astrolabe.md`. |

## Acceptance Signal

- `pnpm -w typecheck` passes.
- `pnpm -w test` passes, including a fresh decision-review engine test that asserts `'tags' in q === false` on a surfaced `ChoiceQuestionSpec`.
- A repo-wide grep for `DecisionAnalysis`, `buildAnalysisTags`, `CONFIDENCE_TAGS`, `STAKES_TAGS`, `CATEGORY_TAGS`, `OBSERVABLE_TAGS`, and `decisionAnalysisSchema` returns zero hits.
- A repo-wide grep for the phrase `and analysis` within JSDoc on `PlanDoc.decisions` returns zero hits across `packages/plugins/astrolabe/src/types.ts` and `docs/architecture/apparatus/astrolabe.md`.
- The astrolabe plugin README no longer contains the `Decision` + `DecisionAnalysis` subsection, the interface snippet, or the analysis→tags mapping table.
- The decision-review engine still surfaces `ChoiceQuestionSpec` entries for reviewable decisions; the `tags` property is simply absent from those entries.
- The `ChoiceQuestionSpec.tags?` field on Spider's question-spec types is unchanged (unrelated guild consumers still depend on it).

## Existing Patterns

- **Inline Zod schemas per tool.** Other write-tool validators in `packages/plugins/astrolabe/src/astrolabe.ts` (e.g., `scopeWriteTool` and the non-analysis portions of `decisionsWriteTool`) define their Zod shape inline via `z.array(z.object({...}))`. Removing the extracted `decisionAnalysisSchema` returns the file to this prevailing one-schema-per-tool convention.
- **Test-fixture minimalism.** `packages/plugins/astrolabe/src/engines.test.ts` already contains many `Decision[]` fixtures that omit `analysis` and exercise the non-tag code path (e.g., the "blocks on first run with decisions and scope items" test). Use those as the template for the fresh test added per D2.
- **Doc-tracks-code invariant.** The plugin README and the framework architecture doc at `docs/architecture/apparatus/astrolabe.md` are updated alongside the code in the same commit, never deferred.

## What NOT To Do

- Do NOT modify the sage instruction files (`sage-analyst.md`, `sage-reading-analyst.md`) — they are the trigger for this cleanup and are already updated.
- Do NOT touch any other field on `Decision` (`selected`, `patronOverride`, `recommendation`, `rationale`, `scope`, `question`, `options`).
- Do NOT remove or alter the `tags?: string[]` field on Spider's `ChoiceQuestionSpec`, `BooleanQuestionSpec`, or `TextQuestionSpec` — Spider's feedback UI consumes it.
- Do NOT touch the razor, Reach Test, or Patch Test prose in any sage instruction file.
- Do NOT introduce a deprecation alias, compatibility shim, or `@deprecated` JSDoc — this is a clean deletion.
- Do NOT retire or edit the "Status: Draft" banner on the architecture doc (noted as potentially stale in observations; that is a follow-up, not current scope).
- Do NOT refactor neighboring decision-review code (summary builder, reconcile branch, razor logic) — they do not touch `analysis` and stay as-is.

<task-manifest>
  <task id="t1">
    <name>Drop tag-building from decision-review engine</name>
    <files>packages/plugins/astrolabe/src/engines/decision-review.ts</files>
    <action>Remove the four tag-map constants (`CONFIDENCE_TAGS`, `STAKES_TAGS`, `CATEGORY_TAGS`, `OBSERVABLE_TAGS`), the `buildAnalysisTags` helper, the `DecisionAnalysis` import, and the tag-attachment at the first-run `ChoiceQuestionSpec` construction site. The summary builder and reconcile branch must not be touched — they never reference `analysis`. After this change the engine surfaces `ChoiceQuestionSpec` entries without a `tags` property.</action>
    <verify>pnpm -w --filter @nexus/astrolabe typecheck</verify>
    <done>decision-review.ts no longer imports `DecisionAnalysis`, defines no tag maps or helper, and attaches no `tags` to surfaced questions. Typecheck passes at the plugin level. Tag-asserting tests are expected to fail at this point — they are addressed in t2.</done>
  </task>

  <task id="t2">
    <name>Update decision-review test suite</name>
    <files>packages/plugins/astrolabe/src/engines.test.ts</files>
    <action>Delete all eight tag-asserting tests inside `describe('decision-review engine', ...)` (identified in the inventory), along with the `// ── Analysis tags tests ──` banner comment. Then add one fresh test under the same describe block that constructs a reviewable decision with no `analysis` field, invokes the decision-review engine, and asserts that the surfaced `ChoiceQuestionSpec` has no `tags` property (use the `'tags' in q === false` form). Model the fixture on existing analysis-free `Decision[]` literals already in the file.</action>
    <verify>pnpm -w --filter @nexus/astrolabe test</verify>
    <done>engines.test.ts contains no tag-asserting tests, no banner comment, no `analysis:` fixture literals, and one new test asserting the absence of `tags` on a surfaced `ChoiceQuestionSpec`. Plugin tests pass.</done>
  </task>

  <task id="t3">
    <name>Remove DecisionAnalysis from type and tool surface</name>
    <files>packages/plugins/astrolabe/src/types.ts, packages/plugins/astrolabe/src/index.ts, packages/plugins/astrolabe/src/astrolabe.ts</files>
    <action>Delete the `DecisionAnalysis` interface and the `analysis?` field on `Decision` from `types.ts`. Rewrite the `PlanDoc.decisions` JSDoc to drop the trailing "and analysis" phrase (per D4) so it reads as a clean description of decisions-with-options. Remove the `DecisionAnalysis` entry from the barrel re-export in `index.ts`. In `astrolabe.ts`, delete the top-of-file `decisionAnalysisSchema` definition and remove the `analysis: decisionAnalysisSchema.optional()` key from the `decisions-write` tool's Zod input validator. No other field on `Decision` changes.</action>
    <verify>pnpm -w typecheck &amp;&amp; pnpm -w test</verify>
    <done>`DecisionAnalysis` no longer exists anywhere in the astrolabe plugin source or barrel. The Zod validator for `decisions-write` admits no `analysis` key. Repo-wide typecheck and tests pass.</done>
  </task>

  <task id="t4">
    <name>Update astrolabe plugin README</name>
    <files>packages/plugins/astrolabe/README.md</files>
    <action>Remove the `### Decision and DecisionAnalysis` subsection in its entirety, including the interface snippet, the prose introducing the classification metadata, the analysis→tags mapping table, and the trailing explainer about tag sorting and boolean-question exemption. The surrounding sections (`### PlanFilters` above, `## Configuration` below) must remain intact. After the edit, any Decision-related prose left in the README must describe only the fields that still exist on `Decision`.</action>
    <verify>Grep the README for `DecisionAnalysis`, `analysis.category`, `analysis.stakes`, `analysis.confidence`, `analysis.observable`, and `tags` — the first five must return zero hits; any residual `tags` mention must not be in astrolabe-emitting context.</verify>
    <done>README contains no `Decision` + `DecisionAnalysis` subsection and no analysis→tags mapping. Section flow from `PlanFilters` directly to `Configuration` reads cleanly.</done>
  </task>

  <task id="t5">
    <name>Clean framework architecture doc</name>
    <files>docs/architecture/apparatus/astrolabe.md</files>
    <action>Remove the `interface DecisionAnalysis { ... }` block and the `Decision.analysis?: DecisionAnalysis` field line from the architecture doc. Rewrite the `PlanDoc.decisions` JSDoc to drop the trailing "and analysis" phrase (per D4), matching the shortened phrasing used in `types.ts`. Do not edit the "Status: Draft" banner, the razor-behavior description, or any other unrelated content.</action>
    <verify>Grep the file for `DecisionAnalysis`, `analysis.category`, `analysis.stakes`, `analysis.confidence`, `analysis.observable`, and the phrase `and analysis` — all must return zero hits. Then run a repo-wide grep for the same terms to confirm no stale references remain anywhere.</verify>
    <done>The architecture doc contains no references to `DecisionAnalysis` or `Decision.analysis`, and the `PlanDoc.decisions` JSDoc matches the shortened phrasing in `types.ts`. Repo-wide grep for the removed symbols returns zero hits.</done>
  </task>
</task-manifest>