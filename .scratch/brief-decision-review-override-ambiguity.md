# Fix: patron custom overrides leave Decision in ambiguous dual state

## Background

When a patron provides a **custom write-in answer** to a decision during `astrolabe.decision-review`, the resulting `Decision` record on the PlanDoc ends up with **both** `selected` and `patronOverride` populated:

- `selected` holds the analyst's recommendation (e.g. `"brief-names"`)
- `patronOverride` holds the patron's custom text (e.g. `"Use twoPhaseRigTemplate and threePhaseRigTemplate"`)

The spec-writer role (`sage.md`) is instructed to treat `patronOverride` as supreme when present, so generated specs are correct. But the PlanDoc is no longer a faithful record of what the patron decided — anything reading `selected` sees the recommendation and concludes the patron accepted it. This has already caused a false-positive "spec drifted from decisions" audit on plan `w-mo0114y6-08357bb71108` (D1, D6).

The ambiguity has two independent sources:

1. **Analyst pre-fill.** `sage.md` line 150 instructs the analyst:
   > `selected` — pre-fill with your recommendation; the patron changes it only when overriding

   So `selected` gets written by the analyst before the patron reviews anything. Semantically, `selected` should mean "the patron chose this," not "the analyst guessed this is what the patron will choose."

2. **Reconcile does not clear `selected` when a custom override arrives.** In `packages/plugins/astrolabe/src/engines/decision-review.ts`, the reconcile loop (lines 281–289) handles the two answer shapes independently:

   ```ts
   if ('selected' in choiceAnswer) {
     decision.selected = choiceAnswer.selected;
   } else if ('custom' in choiceAnswer) {
     decision.patronOverride = choiceAnswer.custom;
   }
   ```

   The `custom` branch writes `patronOverride` but never touches `selected`, so any stale pre-fill survives untouched.

The fix is to make `Decision` an invariant-carrying record: **exactly one of `selected` or `patronOverride` is present after the patron review completes.**

## Deliverables

### 1. Stop pre-filling `selected` in the analyst pass

Update `packages/plugins/astrolabe/sage.md` (the ANALYST mode section, the Decision Analysis Metadata subsection around line 150):

- Remove the `selected` bullet that instructs the analyst to pre-fill with the recommendation.
- Add a replacement bullet clarifying that `selected` is owned by the patron-review pass and the analyst must not write to it.
- Leave all other fields (`recommendation`, `rationale`, `analysis`, etc.) unchanged.

Analysts own `recommendation`. Patrons own `selected`. The two fields should never be written by the same actor.

### 2. Clear `selected` when a custom override is captured

In `packages/plugins/astrolabe/src/engines/decision-review.ts`, update the reconcile loop (current lines 281–289) so the `custom` branch also clears any prior `selected` value:

```ts
if ('selected' in choiceAnswer) {
  decision.selected = choiceAnswer.selected;
  decision.patronOverride = undefined;
} else if ('custom' in choiceAnswer) {
  decision.patronOverride = choiceAnswer.custom;
  decision.selected = undefined;
}
```

Both branches must enforce the invariant: **after reconcile, a decision has exactly one of `selected` / `patronOverride` set** (and at least one, guaranteed by the existing unresolved check on lines 294–300).

Use `delete decision.selected` / `delete decision.patronOverride` instead of assigning `undefined` if the Stacks backend preserves `undefined` keys as explicit nulls on patch — whichever produces a clean absent-field record. Verify by reading back a patched decision in a test.

### 3. Validate the invariant at reconcile time

After the reconcile loop and before the `book.patch` call, add a validation pass that throws if any decision has both `selected` and `patronOverride` set, or neither:

```ts
const inconsistent = decisions.filter(
  d => (d.selected !== undefined) === (d.patronOverride !== undefined),
);
if (inconsistent.length > 0) {
  const ids = inconsistent.map(d => d.id).join(', ');
  throw new Error(
    `Decisions in inconsistent state after reconcile (must have exactly one of ` +
      `selected/patronOverride): ${ids}`,
  );
}
```

This replaces the existing `unresolved` check (which only covered the "neither set" case). One check, both invariants.

### 4. Simplify `buildDecisionSummary`

In the same file, update `buildDecisionSummary` (lines 87–119) so that when `patronOverride` is set, it emits **only** the override line — not both a `Selected:` line and a `Patron override:` line. The current behavior of emitting both is now unreachable (the invariant rules it out), but the code should reflect the simplified data model:

```ts
if (decision.patronOverride) {
  parts.push(`**Patron override:** ${decision.patronOverride}`);
} else if (decision.selected) {
  const label = decision.options[decision.selected] ?? decision.selected;
  parts.push(`**Selected:** ${label}`);
}
```

### 5. Update `sage.md` writer-mode guidance

The WRITER section of `sage.md` (around lines 211 and 228) currently describes a world where both fields can be populated and the writer must prefer `patronOverride`. Update to reflect the new invariant: exactly one of the two is set per decision; there is no precedence rule to remember.

Adjust:

- Line 211: "**Patron overrides** — decisions where `patronOverride` is set. These are direct patron directives and override everything else..." → rewrite to state that a decision has either `selected` (patron chose a listed option) or `patronOverride` (patron wrote a custom directive), never both.
- Line 228: "each decision has a `selected` field (...) and/or a `patronOverride` field (...)" → "each decision has **either** a `selected` field (...) **or** a `patronOverride` field (...)".
- Line 375 and surrounding Decision Compliance Check section: simplify the verification algorithm — check whichever field is present; there's no fallback logic.

Do not change the semantic authority — `patronOverride` is still a direct patron directive and still wins over the brief. Only the "both fields present" scenario disappears.

### 6. Test coverage

In `packages/plugins/astrolabe/src/engines.test.ts` (or the nearest decision-review test file — inspect to confirm the right file), add tests for the reconcile logic:

- **Recommendation accepted unchanged.** Patron leaves the pre-filled answer alone → `decision.selected === recommendation`, `decision.patronOverride === undefined`.
- **Patron picks a different listed option.** Answer is `{ selected: 'other-option' }` → `decision.selected === 'other-option'`, `decision.patronOverride === undefined`.
- **Patron provides a custom override from fresh state.** Answer is `{ custom: 'text' }`, decision has no prior `selected` → `decision.patronOverride === 'text'`, `decision.selected === undefined`.
- **Patron provides a custom override over a previously-populated `selected` (regression test for this bug).** Decision arrives at reconcile with a stale `selected: 'old-rec'`; answer is `{ custom: 'text' }`. After reconcile, `decision.selected === undefined`, `decision.patronOverride === 'text'`.
- **Invariant violation throws.** If a decision reaches the post-reconcile validation with both fields or neither, the engine throws with a descriptive error.
- **`buildDecisionSummary` emits one line per decision.** Given a mix of `selected`-only and `patronOverride`-only decisions, the summary emits the correct single line for each.

### 7. Stale data

Plans `w-mo0114y6-08357bb71108` and any other completed plans that went through decision-review with a patron custom override may carry the ambiguous dual-state on disk. No migration is required — these plans are already completed and their specs were generated correctly. The broken data records are historical and will not be re-read. Document in the commit message that the fix is forward-only.

## Out of scope

- Changing `ChoiceAnswer` or `InputRequestDoc` shapes. The spider-side input request flow is working correctly — `{ custom: text }` is the right wire format and is being persisted faithfully.
- Changing the feedback UI. The patron-facing click flow is fine.
- Back-filling historical PlanDocs.
- Broader rework of the decision-review two-pass engine or the analyst/patron handoff contract.

## Acceptance

- No code path in `astrolabe.sage` (analyst mode) writes to `decision.selected`. The analyst's `decisions-write` call produces decisions with only `recommendation` populated, not `selected`.
- After `decision-review` reconcile completes on a plan, every decision satisfies the invariant: exactly one of `selected` / `patronOverride` is set.
- A decision that entered reconcile with a stale `selected` and a `{ custom }` answer exits with `selected === undefined` and `patronOverride === <custom text>`.
- The reconcile engine throws if any decision violates the invariant before patching the plan.
- `buildDecisionSummary` emits exactly one line per decision: either `**Selected:** ...` or `**Patron override:** ...`, never both.
- `sage.md` WRITER section describes the simplified contract (exactly one field present) with no "patron override supersedes selected" precedence language.
- Plugin test suite (`pnpm test` in `packages/plugins/astrolabe/`) passes with the new test cases above.
- `pnpm build` succeeds with no type errors.

## Notes

- The bug was observed on `w-mo0114y6-08357bb71108` (D1 and D6). The spec itself is correct; only the PlanDoc decision records are misleading. No spec fix is needed for that writ.
- The root cause splits cleanly: (a) analyst-side pre-fill of `selected` and (b) reconcile-side failure to clear `selected` on custom override. Either fix alone would mask the bug for most cases, but both are needed to make the invariant hold unconditionally.
- After this change, `Decision.selected` becomes semantically meaningful again: present iff the patron accepted or picked a listed option. Auditing code (including Coco's decision-compliance check) can rely on reading `selected`/`patronOverride` without knowing the precedence rule.
