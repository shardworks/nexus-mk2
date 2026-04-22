# Primer role split; patron-anima reviews every decision; abstention becomes rare

## Intent

Three coupled shifts to the Astrolabe planning pipeline, shipped as one semantic unit:

1. **Split the pre-spec reader role in two.** Replace the single `sage-reading-analyst` with two sibling roles — `sage-primer-solo` (ships decisions without downstream principle review) and `sage-primer-attended` (paired with patron-anima; does not gate decisions). The engine picks which variant to run based on whether the guild has a `patronRole` configured.
2. **Remove the razor / Reach Test / Patch Test from the attended variant.** The primer-attended always pre-fills `selected`. No decision is routed to the human patron from this role; patron-anima principle-checks every decision cheaply.
3. **Rewrite `patron-anima-prompt.md`** so low-confidence means *confirm the primer*, not abstain. Abstention is reserved for two narrow cases (irresolvable principle conflict; broken decision frame). The engine's matching comment block is updated in the same commit.

The solo variant preserves the razor/Reach Test/Patch Test verbatim — it is the current `sage-reading-analyst`, renamed and re-homed. Its behaviour is unchanged; only the file location, role name, and terminology updates apply.

These edits ship together. Partial landings leave the pipeline in broken intermediate states.

## Non-negotiable decisions

### D1 — Two-role primer split

Replace `sage-reading-analyst.md` with two sibling role-files under the same plugin directory (`/workspace/nexus/packages/plugins/astrolabe/`):

- `sage-primer-solo.md`
- `sage-primer-attended.md`

Both roles do the same core work: read the codebase, chart the terrain affected by the brief, identify choice-points, and produce an inventory + decisions + observations for the spec-writer. They differ only in whether a downstream principle check will follow their output.

Delete the old `sage-reading-analyst.md` in the same commit. Update any internal references to "the analyst" throughout the Astrolabe prompts (including `patron-anima-prompt.md` and any cross-referencing files) to "the primer." The term "analyst" is retired from the Astrolabe pipeline vocabulary.

### D2 — `sage-primer-attended` always pre-fills `selected`

The attended variant's `selected` field is always populated. There is no "leave unset to surface" path.

- **Brief-prescription and brief-suggestion handling is preserved.** If the brief explicitly prescribes an answer, the primer sets both `recommendation` and `selected` to it. If the brief suggests an approach and the primer agrees, same shape. If the primer disagrees with a brief suggestion, `recommendation` stays on the brief's suggestion and `selected` moves to the primer's alternative — the disagreement is visible in the split, never in silently-set recommendation-alone.
- **The Three Defaults are preserved.** For decisions the brief does not prescribe or suggest, the primer applies the existing defaults (prefer removal, prefer fail-loud, extend existing API surface) and pre-fills `selected` accordingly.
- **The razor, Reach Test, and Patch Test are removed entirely** from the attended variant. No decision routes to the human patron from the attended variant; patron-anima principle-checks every decision.

Fork the attended role-file from the current `sage-reading-analyst.md`, then apply the razor-removal edits. Use `.scratch/analyst-prompt-razor-removal.md` in the sanctum as the specific edit guidance (it predates the rename; apply its edits to the attended file).

### D3 — `sage-primer-solo` preserves the razor

The solo variant is the current `sage-reading-analyst.md` with only the following changes:

- Renamed to `sage-primer-solo.md`.
- Self-references updated from "analyst" to "primer."
- Any references to downstream patron-anima review removed or softened (since the solo variant runs when no patron-anima is configured).

The razor, Reach Test, Patch Test, Three Defaults, and all other substantive guidance are preserved verbatim. The solo variant's job is unchanged from today's analyst: ship most decisions, surface the structurally-significant ones for human patron review.

### D4 — Engine selects primer variant by `patronRole` config

The reading-analyst engine (the one that currently loads `sage-reading-analyst.md`) selects which role to run based on the guild's `patronRole` configuration:

- `patronRole` configured and non-empty → `sage-primer-attended`
- `patronRole` empty, unset, or whitespace-only → `sage-primer-solo`

Use the same "empty/whitespace → treat as unset" logic that `patron-anima.ts` uses today for its skip-when-unset check (`patron-anima.ts` around lines 302-306). Keep the check and the engine's role-selection consistent — one helper if feasible.

The selection happens at engine-run time, per writ, so mid-experiment guild reconfiguration behaves correctly.

### D5 — Low-confidence confirms the primer

The patron-anima's confidence calibration changes:

- `high` — one principle fires cleanly; any other principles that speak agree in direction.
- `med` — multiple principles speak and conflict; the patron-anima resolves the conflict with a judgement.
- `low` — **no principle speaks; the patron-anima confirms the primer's recommendation with `low` confidence.** The primer read the codebase and applied the defaults; absent a principled reason to differ, deferring to their pick is the right move.

Consumers of the confidence field (telemetry, eval reports, future tuning) read `low` as "the patron-anima had no principled basis to prefer a different option." That is a legitimate and expected state.

The worked example in the prompt gains a `low`-confirm entry to show the new path. See `.scratch/patron-anima-prompt-abstention-rewrite.md` in the sanctum for specific edit guidance — apply its edits substituting "primer" for "analyst" throughout.

### D6 — Abstention is reserved for two narrow cases

Abstention (absence from the emission array) means: the decision routes to the human patron and the writ stalls until the patron responds. This must be rare. Two cases justify it:

1. **Irresolvable principle conflict** — multiple principles speak and genuinely pull in different directions, and the role's wider frame does not give a tie-break.
2. **Broken decision frame** — every offered option shares a premise the patron's principles reject, and no clean custom answer can fix the framing. (The `astrolabe.patron-anima` engine does not offer a `custom` verdict — absence is the only way to flag frame failure from this emission path.)

When no principle speaks, the patron-anima does not abstain — it emits `low`-confidence confirm per D5. The prompt's prior instruction to treat "no principle speaks" as abstention is reversed.

### D7 — The engine parser's treatment of `low` is promoted from defensive leniency to a supported path

`patron-anima.ts` currently accepts `confidence: 'low'` in the parser and documents the acceptance as "defensive parser leniency" — intentionally not a supported emission path. With D5 in place, `low` is a first-class emission path. The engine's run()-header comment block (around lines 18-28) and the "defensive parser leniency" comment (around lines 70-76) need to be rewritten to reflect the new semantics.

The parser code itself does not need to change — it already accepts `low`. The work is comment/documentation synchronisation only.

### D8 — The engine's reviewable-filter logic stays

The reading-analyst engine currently filters decisions to `selected === undefined` before building the prompt and before applying emissions. Keep the filter. It is load-bearing for solo runs (where some `selected` remain unset by design) and harmless for attended runs (where D2 pre-fills everything).

## Out of scope

- **Migrating existing plandocs.** Plandocs already completed under the old razor semantics stay as-is. The change affects new rigs only.
- **Changing the patron role's principle set.** The 41 principles in the patron role file are unchanged. This commission is about *when* and *how* they are applied, not what they say.
- **Adding a `custom` verdict to the engine's emission schema.** The patron-anima prompt still limits selections to the offered option keys.
- **Revising the Three Defaults.** Prefer-removal, prefer-fail-loud, extend-existing-API are preserved verbatim on both primer variants.
- **Tuning override-rate or abstention-rate targets.** No targets are codified in the prompts themselves.
- **Renaming the reading-analyst engine itself.** The TypeScript engine file and its exported symbol keep their current names. Only the role-file names and prompt terminology change in this commission. Engine renaming, if desired, is a follow-up.

## References

- Source clicks: `c-mo9hnesg-7b51c069e904` (razor removal), `c-mo9hng8m-69a547acb533` (abstention rewrite).
- Sanctum scratch files with specific edit guidance: `.scratch/analyst-prompt-razor-removal.md` (applies to the attended variant) and `.scratch/patron-anima-prompt-abstention-rewrite.md` (applies to the patron-anima prompt). These predate the primer rename; substitute "primer" for "analyst" throughout when applying.