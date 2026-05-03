---
status: active
---

# X020 — Code-Lookup for the Implementer

**Click:** `c-mophhb96`. Related to (not a child of) `c-moogy8wa`
(Astrolabe planning preprocessing — concluded). X020 is a separate
top-level thread because it targets a different pipeline phase
(Spider's `implement` engine) than the parent (Astrolabe's
reader-analyst).

## Research question

Does providing the **implementer** with a `code-lookup` MCP tool
reduce implement-session cost ≥25% relative to a clean baseline,
without meaningfully degrading code quality?

## Background

X020 ports the X019 hypothesis to a different pipeline role.

X019 tested code-lookup on the **reader-analyst** (planning-side
deep-Read role) and the H1 cost-reduction was **not supported**
(N=1 cartograph, -1.3% delta — see X019 findings memo
`2026-05-03-findings.md`). The mechanism worked (model used the
tool, cache reads dropped 10%) but the role's bottleneck is
*understanding implementations*, not *finding things*. Of 67 tool
calls only 2 were code-lookup, both for locate-then-Read; no
"find all usages" calls.

The implementer role's workflow is structurally different:

- Editing existing code routinely requires "find all callers of
  X" before changing X's signature — the canonical use case for
  the `usages` mode of code-lookup.
- "What does the API of package P actually expose?" is a common
  pre-edit question — `package` mode.
- "What's the type signature of Y?" is common when wiring up a
  new use site — `symbol` mode.

If X019's diagnosis is correct (mechanism intact, role mismatch),
the implementer should produce the cost-reduction signal X019 did
not.

## Hypothesis

**H1.** Providing the `code-lookup` tool (modes: `symbol`,
`usages`, `package`) reduces implement-session cost (USD) by ≥25%
relative to a clean-baseline implementer (no code-lookup tool, no
prompt augmentation), without meaningfully degrading code
quality (Tier 1 + Tier 2 quality observations per the
[X018 quality regime](../X018-package-surface-map-injection/spec.md)).

## Pipeline placement

The `lab.implement-only` trial shape exercises the implement
pipeline:

```
draft → implement → review → revise → seal
```

The intervention target is the `implement` engine's session role
(`artificer` in lab manifests, per the X016/X018 convention).
`code-lookup` is granted via `loom.roles.artificer.permissions`;
the role's prompt is augmented with a tool-preference snippet
(parallel to X019's reader-analyst injection).

The trial shape is **implement-only** — same as X016. See [Lab
Operations / Trial Shapes](../lab-operations/running-trials.md#implement-only).

## Codex selection

**`w-mojnftby` — Stacks `dropBook` primitive** (real production
commission completed 2026-04-29, sealed commit `c25353ff`).

This is the chosen codex for X020 deliverable 3 (calibration +
A/B trials). Why dropBook is the right fit:

- **Real, not synthetic.** Commission posted by Sean to vibers in
  ordinary work; the sealed commit shipped to production.
- **High cross-reference surface.** 22 files across 9 packages.
  The implementer added a substrate primitive (`StacksApi.dropBook`)
  + a new event variant (`BookDeleteEvent`) that propagated through
  callers in clockworks-stacks-signals, lattice, cartograph, plus
  three conformance test layers.
- **Right size.** $16.15 implementer cost / 33.8 min duration for
  the real-world session (`ses-mok2say8`) — bigger than X016's
  small implementer trials (toy-noop range), smaller than the
  X015 clerk-refactor ($45.55 / 7+ hr).
- **Canonical workflow.** Adding a new substrate primitive that
  propagates through callers is the textbook "find all callers of
  X" use case for code-lookup.

The N=1 baseline reference is the real-world implementer session
(`ses-mok2say8`, $16.15 / 33.8 min). The X020 baseline trial
calibrates the apparatus on `0.1.300-x019.0` framework against
that reference.

Larger commissions (clerk-refactor) are reserved for a follow-up
N-extension if H1 is supported.

## Reusable assets from X019

X020 carries forward most of the X019 plumbing without modification:

- **Plugin:** `@shardworks/code-lookup-apparatus@0.1.300-x019.0`
  (already published; same prerelease line). No new prerelease
  needed — the implementer-flavored snippet is applied at the
  manifest layer (see [Snippet handling](#snippet-handling)).
- **Generator:** `experiments/X019-reverse-usage-index/scripts/generate-reverse-usage-index.ts`
  (reusable as-is; already SHA-parametric). Needs to be re-run
  against the dropBook codex SHA (parent of `c25353ff`).
- **Splice script:** `experiments/X019-reverse-usage-index/variants/build-variant-role.sh`
  is generic; takes any base role + snippet → variant. Reused as-is.

## Snippet handling

The shipped `sage-tool-preference.md` (in the published plugin's
`src/`) is reader-analyst-flavored. For X020, the snippet is
overridden in the manifest's variant role file via
`build-variant-role.sh`, which already accepts any snippet path.
This keeps the published plugin clean and lets the snippet evolve
per-trial without prerelease churn.

The X020-specific snippet lives at
`experiments/X020-code-lookup-implementer/variants/code-lookup-tool-preference-implementer.md`.
Suggested rewrites from the X019 version:

- Replace reader-flavored examples ("WritDoc references",
  "ensureBook definition") with implementer-flavored ones
  ("callers of `setWritExt` before signature change", "package
  exports of `@shardworks/clerk-apparatus` before wiring up a
  new usage").
- Foreground the `usages` mode (the under-used mode in X019).
  Examples: "Before changing the signature of X, run
  `code-lookup mode=usages name=X` and review every call site so
  you don't miss any."
- Keep the "Grep is for textual searches" framing — it worked
  in X019 (Grep dropped 25 → 12).

## Quality regime

Tier 1 (manifest validation: tests pass, build succeeds, no
lint regressions) and Tier 2 (Coco-side spot-check: implementation
fidelity, no obvious regressions) on every trial. Tier 3
(deeper code-quality review) on trigger.

## Sequencing

X020 unblocks immediately. No upstream dependencies. The
laboratory engine already supports manifest-relative paths
(commit `1708952c`).

## Deliverables

1. **Spec activation** — move from draft to active.
2. **Variant artifacts** — generate the index for the dropBook
   codex SHA, write the implementer-flavored snippet, splice
   variant role file.
3. **Manifest pair** — baseline + with-tool, both pinned to
   `0.1.300-x019.0`, paths manifest-relative.
4. **Calibration trial** — baseline-only first; cost lands within
   ±15% of the $16.15 reference.
5. **A/B trial pair** — baseline + with-tool, both N=1 first.
6. **Findings memo** — same one-page format as X019.

## Adoption metric

X019 saw 2/67 = 3% of tool calls reach for code-lookup. For X020
to convert mechanism → cost, the target is an order of magnitude
more — at least 20% of the implementer's tool calls hitting
code-lookup. Worth measuring explicitly in the findings.

## Why this experiment is worth running

X019 narrowed the failure to **role mismatch**, not **tool
mismatch**. The diagnosis is testable: the implementer's edit
workflow is structurally aligned with code-lookup's strengths.
A clean N=1 result either:

- **Supports** the diagnosis → code-lookup is a real lever for
  implement-side cost; consider integrating into the standard
  implement pipeline.
- **Falsifies** the diagnosis → on-demand-tool-lookup as a
  general lever for cost reduction is questionable; the prompt
  injection vs. tool-lookup design dimension may not be the
  primary lever at all.

Either way, the result is informative about the family of
preprocessing-and-exposure design choices.
