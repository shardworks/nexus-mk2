# Remove `analysis` field and tag-building from astrolabe

The sage-analyst and sage-reading-analyst instructions no longer write the `analysis` metadata field on decisions. The four classification axes it carried (`category`, `observable`, `confidence`, `stakes`) were rendered as display tags on the patron review UI but never gated which decisions surfaced to the patron — the razor alone does that. With the sage no longer writing the field, the supporting code is dead weight and should be removed.

## What to remove

- **`src/types.ts`** — the `DecisionAnalysis` interface and the optional `analysis` field on `Decision`.
- **`src/astrolabe.ts`** — the Zod schema for `DecisionAnalysis` and its reference from the `decisions-write` tool input validator.
- **`src/engines/decision-review.ts`** — the `buildAnalysisTags()` helper, the four tag-map constants (`CONFIDENCE_TAGS`, `STAKES_TAGS`, `CATEGORY_TAGS`, `OBSERVABLE_TAGS`), and the call site that attaches `tags` to surfaced questions. If the `tags?: string[]` field on `ChoiceQuestionSpec` is astrolabe-only, remove it as well; if it is a guild-wide type with other consumers, leave the type alone and only drop astrolabe's use of it.
- **`src/index.ts`** — any re-export of `DecisionAnalysis`.
- **`src/engines.test.ts`** — the tests that assert tag output from the decision-review engine (roughly four tests; locate by searching for `tags` assertions within the decision-review test suite).
- **`README.md`** — the section documenting the analysis→tags mapping (currently around lines 86-112). Adjacent prose that references classification metadata should be re-read and adjusted.

## What NOT to touch

- The sage instruction files (`sage-analyst.md`, `sage-reading-analyst.md`) — these are already updated and are the trigger for this cleanup.
- The `selected` / `patronOverride` / `recommendation` fields on `Decision` — unchanged.
- The razor, Reach Test, and Patch Test prose in the sage instructions — unchanged.

## Verification

- Plugin build and tests pass.
- Any downstream package that imports `DecisionAnalysis` no longer references it; fix those imports or fail the commission if removal cascades beyond the astrolabe plugin in ways the brief did not anticipate.
- A representative decision-review engine test (or a fresh one) confirms that a surfaced question has no `tags` property set by astrolabe.
- Grep the framework repo for any stale references to `DecisionAnalysis`, `analysis.category`, `analysis.stakes`, etc., and clean or flag them.