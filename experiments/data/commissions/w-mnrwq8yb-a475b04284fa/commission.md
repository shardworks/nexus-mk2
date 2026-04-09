# Map Decision Analysis Metadata to QuestionSpec Tags

## Summary

Add a `DecisionAnalysis` type to the Astrolabe, wire it into the `Decision` interface and `decisions-write` Zod schema, and update the `decision-review` engine to map analysis fields to `tags` on `ChoiceQuestionSpec` entries when building `InputRequestDoc` questions.

## Current State

The `decision-review` engine (`packages/plugins/astrolabe/src/engines/decision-review.ts`) builds `ChoiceQuestionSpec` entries from `Decision` objects in its first-run (`analyzing`) branch. The current loop (lines 117-130):

```typescript
for (const decision of decisions) {
  const choiceSpec: ChoiceQuestionSpec = {
    type: 'choice',
    label: decision.question,
    details: composeDetails(decision.context, decision.rationale),
    options: decision.options,
    allowCustom: true,
  };
  questions[decision.id] = choiceSpec;

  if (decision.recommendation) {
    answers[decision.id] = { selected: decision.recommendation } as ChoiceAnswer;
  }
}
```

The `Decision` interface (`packages/plugins/astrolabe/src/types.ts`, lines 52-62):

```typescript
export interface Decision {
  id: string;
  scope: string[];
  question: string;
  context?: string;
  options: Record<string, string>;
  recommendation?: string;
  rationale?: string;
  selected?: string;
  patronOverride?: string;
}
```

The `decisions-write` Zod schema (`packages/plugins/astrolabe/src/astrolabe.ts`, lines 274-288) mirrors this interface with no `analysis` field.

The `ChoiceQuestionSpec` type (`packages/plugins/spider/src/types.ts`, lines 464-474) has no `tags` field today. A prerequisite commission ("Add Tags to QuestionSpec + Feedback UI Filters") will add `tags?: string[]` to all `QuestionSpec` types before this commission lands.

## Requirements

- R1: A new `DecisionAnalysis` interface must be exported from `packages/plugins/astrolabe/src/types.ts` with four optional fields: `category`, `confidence`, `stakes` (string literal unions), and `observable` (boolean).
- R2: The `Decision` interface must include an optional `analysis?: DecisionAnalysis` field.
- R3: The `decisions-write` Zod schema must accept an optional `analysis` object matching the `DecisionAnalysis` shape, so that round-tripping decisions through `decisions-write` does not strip analysis data.
- R4: A new helper function `buildAnalysisTags` must be added to `decision-review.ts` that accepts a `DecisionAnalysis | undefined` and returns `string[] | undefined`.
- R5: When building `ChoiceQuestionSpec` entries in the decision-review first-run branch, the engine must set `tags` on each spec using the result of `buildAnalysisTags(decision.analysis)`.
- R6: When `analysis` is undefined, `tags` must be omitted from the `ChoiceQuestionSpec` (the property must not be present).
- R7: When `analysis` is present, only known field values must produce tags. Unrecognized values for any field must be silently ignored.
- R8: Tags must be sorted alphabetically.
- R9: Scope-derived `BooleanQuestionSpec` entries must not have tags.
- R10: The `DecisionAnalysis` type must be re-exported from `packages/plugins/astrolabe/src/index.ts`.
- R11: Tests must cover: decision with full analysis, decision without analysis, partial analysis, alphabetical tag sorting, all field-value-to-tag mappings, and scope boolean questions having no tags.

## Design

### Type Changes

Add to `packages/plugins/astrolabe/src/types.ts`, immediately before the `Decision` interface:

```typescript
export interface DecisionAnalysis {
  /** Decision domain: product-level, API contract, or internal implementation. */
  category?: 'product' | 'api' | 'implementation';
  /** Whether the choice is externally visible to consumers of the feature/API. */
  observable?: boolean;
  /** How clearly the codebase and brief dictate the answer. */
  confidence?: 'low' | 'medium' | 'high';
  /** How much a consumer would notice if a different option were picked. */
  stakes?: 'low' | 'high';
}
```

Update the `Decision` interface to:

```typescript
export interface Decision {
  id: string;
  scope: string[];
  question: string;
  context?: string;
  options: Record<string, string>;
  recommendation?: string;
  rationale?: string;
  selected?: string;
  patronOverride?: string;
  analysis?: DecisionAnalysis;
}
```

Update the barrel export in `packages/plugins/astrolabe/src/index.ts` to include `DecisionAnalysis`:

```typescript
export type {
  PlanDoc,
  ScopeItem,
  Decision,
  DecisionAnalysis,
  PlanStatus,
  PlanFilters,
  AstrolabeConfig,
  AstrolabeApi,
} from './types.ts';
```

Update the `decisions-write` Zod schema in `packages/plugins/astrolabe/src/astrolabe.ts` to add an optional `analysis` field inside the `z.object`:

```typescript
analysis: z.object({
  category: z.enum(['product', 'api', 'implementation']).optional(),
  observable: z.boolean().optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  stakes: z.enum(['low', 'high']).optional(),
}).optional(),
```

This goes after the `patronOverride` field in the existing `z.object({...})` block.

### Behavior

**`buildAnalysisTags(analysis)` helper** — added to the Helpers section of `decision-review.ts`:

When `analysis` is `undefined`, return `undefined`.

When `analysis` is present, build a tags array by checking each field against its known values:

| Field | Value | Tag |
|-------|-------|-----|
| `confidence` | `'low'` | `'low-confidence'` |
| `confidence` | `'medium'` | `'medium-confidence'` |
| `confidence` | `'high'` | `'high-confidence'` |
| `stakes` | `'low'` | `'low-stakes'` |
| `stakes` | `'high'` | `'high-stakes'` |
| `category` | `'product'` | `'product'` |
| `category` | `'api'` | `'api'` |
| `category` | `'implementation'` | `'implementation'` |
| `observable` | `true` | `'observable'` |
| `observable` | `false` | `'internal'` |

If a field is missing or its value is not in the known set, that field contributes no tag. Sort the resulting array alphabetically. If the array is empty (all fields missing or unrecognized), return `undefined`.

The helper must import `DecisionAnalysis` from `../types.ts`.

**Engine loop change** — in the `for (const decision of decisions)` loop:

After constructing the `choiceSpec` object, call `buildAnalysisTags(decision.analysis)`. When the result is not `undefined`, set `choiceSpec.tags = result`. When the result is `undefined`, do not set the `tags` property.

Implementation pattern:

```typescript
const tags = buildAnalysisTags(decision.analysis);
const choiceSpec: ChoiceQuestionSpec = {
  type: 'choice',
  label: decision.question,
  details: composeDetails(decision.context, decision.rationale),
  options: decision.options,
  allowCustom: true,
  ...(tags ? { tags } : {}),
};
```

**No changes to:**
- `composeDetails()` — analysis metadata goes to tags, not details text.
- `buildDecisionSummary()` — produces text for the spec-writer prompt; does not handle tags.
- The re-run (`reviewing`) branch — tags are only set during question creation (first run).
- `BooleanQuestionSpec` construction for scope items — no tags.

### Non-obvious Touchpoints

- **`packages/plugins/astrolabe/src/index.ts`** — barrel export must be updated to include `DecisionAnalysis`. Easy to miss since the type is new.
- **`packages/plugins/astrolabe/src/astrolabe.ts`** — the Zod schema for `decisions-write` must include the `analysis` field or re-writing decisions via the tool will silently strip analysis data from existing decisions.

### Dependencies

This commission depends on the "Add Tags to QuestionSpec + Feedback UI Filters" prerequisite being merged first. That commission adds `tags?: string[]` to `ChoiceQuestionSpec`, `BooleanQuestionSpec`, and `TextQuestionSpec` in `packages/plugins/spider/src/types.ts`. Without that field, the `ChoiceQuestionSpec` type will not accept the `tags` property and TypeScript compilation will fail.

## Validation Checklist

- V1 [R1, R2]: Inspect `packages/plugins/astrolabe/src/types.ts` — `DecisionAnalysis` interface exists with four optional fields using string literal unions. `Decision` interface includes `analysis?: DecisionAnalysis`.
- V2 [R3]: Inspect `packages/plugins/astrolabe/src/astrolabe.ts` — the `decisions-write` Zod schema contains an optional `analysis` field with `z.enum` for category/confidence/stakes and `z.boolean()` for observable, all optional.
- V3 [R4, R7, R8]: Inspect `packages/plugins/astrolabe/src/engines/decision-review.ts` — `buildAnalysisTags` function exists, accepts `DecisionAnalysis | undefined`, returns `string[] | undefined`, maps only known values, and sorts alphabetically.
- V4 [R5, R6]: Inspect the decision loop in `decision-review.ts` — `tags` is set on `ChoiceQuestionSpec` via `buildAnalysisTags`. When analysis is undefined, the `tags` property is absent (not `[]`).
- V5 [R9]: Inspect the scope-item loop — `BooleanQuestionSpec` construction does not set `tags`.
- V6 [R10]: Inspect `packages/plugins/astrolabe/src/index.ts` — `DecisionAnalysis` is in the type export list.
- V7 [R11]: Run `npx tsx --test packages/plugins/astrolabe/src/engines.test.ts` — all new and existing tests pass.
- V8 [R1, R2, R3, R5]: Run `npx tsc --noEmit -p packages/plugins/astrolabe/tsconfig.json` — TypeScript compilation succeeds with no errors.

## Test Cases

All tests go in `packages/plugins/astrolabe/src/engines.test.ts` inside the existing `describe('decision-review engine', ...)` block. Follow the established pattern: `setup()`/`clearGuild()` in beforeEach/afterEach, `makePlan()` for fixtures, `buildCtx()` for context, assert on InputRequestDoc in the input-requests book.

**Test 1: Decision with full analysis produces correct sorted tags**
- Create a decision with `analysis: { category: 'product', observable: true, confidence: 'low', stakes: 'high' }`.
- Run engine with plan in `analyzing` status.
- Retrieve the InputRequestDoc and inspect `questions[decisionId]`.
- Expected: `tags` is `['high-stakes', 'low-confidence', 'observable', 'product']` (alphabetical).

**Test 2: Decision without analysis produces no tags property**
- Create a decision with no `analysis` field.
- Run engine with plan in `analyzing` status.
- Retrieve the InputRequestDoc and inspect `questions[decisionId]`.
- Expected: `tags` property is `undefined` (not present on the object). Verify with `assert.equal('tags' in question, false)`.

**Test 3: Decision with partial analysis produces tags only for present fields**
- Create a decision with `analysis: { confidence: 'high' }` (only confidence set).
- Run engine.
- Expected: `tags` is `['high-confidence']`.

**Test 4: All analysis field-value combinations map correctly**
- Create a decision with `analysis: { category: 'api', observable: false, confidence: 'medium', stakes: 'low' }`.
- Run engine.
- Expected: `tags` is `['api', 'internal', 'low-stakes', 'medium-confidence']`.

**Test 5: Decision with analysis: { category: 'implementation' } maps to tag 'implementation'**
- Create a decision with `analysis: { category: 'implementation' }`.
- Run engine.
- Expected: `tags` is `['implementation']`.

**Test 6: Scope-item BooleanQuestionSpec has no tags**
- Create a plan with both decisions (with analysis) and scope items.
- Run engine.
- Retrieve the InputRequestDoc. Inspect the scope question (`questions['scope:S1']`).
- Expected: `tags` property is not present on the BooleanQuestionSpec. Verify with `assert.equal('tags' in scopeQuestion, false)`.

**Test 7: Multiple decisions with varying analysis**
- Create two decisions: one with full analysis, one without.
- Run engine.
- Expected: first decision's question has tags; second decision's question has no `tags` property.

**Test 8: Decision with empty analysis object (all fields omitted) produces no tags**
- Create a decision with `analysis: {}`.
- Run engine.
- Expected: `tags` is `undefined` (not present), because an empty analysis produces no tags and the helper returns `undefined` for an empty result.
