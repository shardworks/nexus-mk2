# Brief: Map Decision Analysis Metadata to QuestionSpec Tags

## Summary

Update the Astrolabe's `decision-review` clockwork engine to map `Decision.analysis` fields to `tags` on the `ChoiceQuestionSpec` when creating `InputRequestDoc` questions. This connects the analyst's structured classification metadata to the feedback UI's tag filtering.

## Prerequisite

The `tags?: string[]` field must exist on `QuestionSpec` types in the Spider (see: question-spec-tags brief).

## Scope

### Engine Change

File: `packages/plugins/astrolabe/src/engines/decision-review.ts`

When building `ChoiceQuestionSpec` entries from decisions (in the first-run / `analyzing` branch):

For each decision that has an `analysis` object, map the fields to tags:

```
analysis.confidence: 'low'           → tag: 'low-confidence'
analysis.confidence: 'medium'        → tag: 'medium-confidence'
analysis.confidence: 'high'          → tag: 'high-confidence'
analysis.stakes: 'high'              → tag: 'high-stakes'
analysis.stakes: 'low'               → tag: 'low-stakes'
analysis.category: 'product'         → tag: 'product'
analysis.category: 'api'             → tag: 'api'
analysis.category: 'implementation'  → tag: 'implementation'
analysis.observable: true             → tag: 'observable'
analysis.observable: false            → tag: 'internal'
```

Set `tags` on the `ChoiceQuestionSpec` to the resulting array. Sort tags alphabetically for consistency.

Decisions without an `analysis` field produce no tags (omit the `tags` field or set it to an empty array — match whichever pattern feels cleaner for the downstream UI).

Scope-derived `BooleanQuestionSpec` entries (the `scope:S1` questions) do not get tags — they have no analysis metadata.

### Test Changes

File: `packages/plugins/astrolabe/src/engines.test.ts`

Add tests for:
- Decision with analysis produces correct tags on the ChoiceQuestionSpec
- Decision without analysis produces no tags
- Tags are sorted alphabetically
- All analysis field combinations are mapped correctly
- Scope-item boolean questions have no tags

### No Other Changes

- The `Decision` type and `decisions-write` Zod schema already include the `analysis` field (added in this session).
- The `buildDecisionSummary` helper doesn't need changes — it produces text, not structured data.
- The `composeDetails` helper doesn't need changes — analysis metadata goes to tags, not details text.
