---
status: complete
completed: 2026-05-03
verdicts:
  H1-cost-reduction: not-sustained
  mechanism: confirmed
---

# X018 — Package Surface Map Injection

**Parent click:** `c-moogy8wa` — source-code preprocessing to
reduce planner cost. **This experiment's click:** `c-moogydti`.

## Verdict (2026-05-03)

**H1 not sustained on Lever A.** Three injection variants were run
(N=1 each) on the cartograph commission replay; reference baseline
trial 5 cost $9.04 / 15.92 min:

| variant | format / size | reader-analyst cost | Δ vs baseline |
|---|---|---|---|
| 1 | compact JSON, 22K tokens | $7.88 | **−13%** |
| 2 | tight text (levers 1+2+3), 7K tokens | $8.24 | −9% |
| 3 | YAML, full schema, 28K tokens | $11.55 | **+28%** |

Best variant achieved −13%, well below H1's ≥25% threshold. The
shape of the curve is informative: variant 1 was a local optimum;
both shrinking the payload (v2) and switching to YAML syntax (v3)
moved off it in a worse direction. Compact JSON appears to be a
sweet spot for LLM-readable structured reference material.

**Mechanism confirmed.** The spec's tool-call profile prediction
held cleanly on variant 1: orientation-class calls dropped while
deep semantic reads stayed roughly unchanged.

| tool | baseline | variant 1 | Δ |
|---|---|---|---|
| Bash (`ls` walks, existence checks) | 24 | 5 | **−79%** |
| Grep (existence/cross-ref) | 25 | 6 | **−76%** |
| Read (deep semantic) | 34 | 31 | −9% |

The planner WILL skip orientation work when the answer is
structurally available in its prompt. This is the load-bearing
finding even though H1 didn't sustain.

**Quality flagged but not red-flagged.** Variant 1's plan was
materially equivalent to baseline on coverage, but bundled scope
items more aggressively (3 vs 5 items), consolidated decisions
(17 vs 22), and missed 1 of 3 baseline observations (the kit-channel
cross-cutting design Q). Tier 2 read found no decisions or scope
elements absent — the variant produced a structurally complete
plan in fewer "items." Whether this is a regression or an
improvement (per the role's own scope-decomposition guidance, which
favors bundling inseparable work) is a judgment call.

**Cost ceiling diagnosis.** The cache-write tax on the bigger
system prompt is the bottleneck. Variant 1's net savings:
- cache reads: −$2.40 (less re-reading of orientation files)
- cache writes: +$0.36 (caching the bigger system prompt)
- output tokens: −$0.60 (smaller plan)
- net: −$1.16 per cartograph trial

Shrinking the prompt past variant 1's size traded cache-write
savings for cache-read regressions (the planner re-read the smaller
map MORE because it lost confidence in it).

## Recommendation

**Do not productionize Lever A or Lever B as currently scoped.**
−13% on an $8 baseline (~$1/run) does not clear the bar for the
framework investment Lever B would require, and the Lever A
mechanism is bounded by the cache-write tax + the format-readability
constraint (variants 2 and 3 establish the local maximum is at v1).

**Pivot to a queryable-interface approach** (X019-style; see
companion experiment). The mechanism finding is real and worth
preserving: the planner does substantial wasteful orientation work
that a structured answer can suppress. A tool-based interface
delivers the same signal without the cache-write tax, with no
quality-regression risk from an information-dense prompt, and with
better scaling to larger codexes than injection allows.

Captured as click `c-mop6w43o` during analysis; the Lever A trials
above resolve that question with a clean negative result on
injection.

**Defer the cost-saving generalization question** until N≥3 trials
on the cartograph baseline + at least one other workload. N=1 per
variant is sufficient for *directional* H1 evidence (and we got
clean directional answers); it's not sufficient to rule out
between-run variance in the cost numbers. The mechanism finding
(tool-call profile shifts) is robust at N=1 because the magnitude
is so large.

## Artifacts

Trial extracts under `artifacts/`:
- `2026-05-02-calibration-baseline/` — trial 1 (Sonnet vs Opus mismatch; diagnostic)
- `2026-05-02-calibration-baseline-opus/` — trial 4 (Opus, loom kit-validator bug; diagnostic)
- `2026-05-03-calibration-baseline-opus-fixed/` — trial 5 (apparatus-fixed Opus baseline; the reference)
- `2026-05-03-with-surface-map-cartograph/` — variant 1 (compact JSON injection; H1 evaluation)
- `2026-05-03-with-surface-map-tight-cartograph/` — variant 2 (tight format; falsified shrinkage hypothesis)
- `2026-05-03-with-surface-map-yaml-cartograph/` — variant 3 (YAML; falsified format-readability hypothesis)

Surface-map artifacts (re-usable for X019 or follow-up):
- `2026-05-03-surface-map-aff280e7.json` — canonical generator output
- `2026-05-03-surface-map-aff280e7.yaml` — YAML rendering
- `2026-05-03-surface-map-aff280e7-tight.txt` — tight textual rendering
- `2026-05-02-surface-map-30ea3c8e1db6.json` — earlier generator output (different SHA)

Generator + transform scripts under `scripts/` and variant-builder
under `variants/`.

## Side findings (worth carrying forward)

- **Loom kit-validator bug** (`c-mooouduy`) — astrolabe role
  permissions reference clerk and ratchet via the `requires` set,
  but the lookup happens before astrolabe is fully registered as
  an apparatus, so it falls back to an empty deps list and drops
  `clerk:read` and `ratchet:read`. Workaround: guild-level role
  overrides + role files copied via the `files:` mechanism.
  Captured for follow-up.
- **Spec-only trials need rig-based wait** — the `lab.plan-only`
  rig template's mandate writ never seals (no seal engine), so
  writ-based wait would always time out. Built `lab.wait-for-rig-
  terminal-xguild` to poll the spider rig directly. Landed in
  `packages/laboratory/src/engines/scenario-xguild.ts`.
- **Spec-writer rate-limit cascade** — under Anthropic rate
  limiting, the spec-writer (engine 7 of 9 in lab.plan-only) can
  retry hourly indefinitely, blowing past the outer rig's
  `waitForRigTerminal` cap. The reader-analyst (engine 3) is
  unaffected. For X018-shape experiments, a `lab.plan-only-after-
  analyst` rig that resolves at `inventory-check` would skip the
  irrelevant downstream chain. Captured for laboratory roadmap.
- **Surface-map size at scale** (`c-moojxn2c`) — for the current
  Nexus monorepo (24 packages, 259 files, 1310 exports), the
  surface map is ~87 KB compact / ~22K tokens. For larger codexes
  this approach would be infeasible; the queryable-interface route
  scales better.

## Research question

Does injecting a precomputed **package surface map** into the
reader-analyst's role prompt reduce planning-session cost (tokens,
USD, duration) without meaningfully degrading spec quality?

## Pipeline placement

The Astrolabe `plan-and-ship` rig has 13 engines. The intervention
target is engine #3, **`reader-analyst`** — a single anima session
that produces inventory + scope + decisions + observations in one
pass.

The reader-analyst's anima role is selected at engine-run time:
`astrolabe.sage-primer-attended` when guild config sets
`astrolabe.patronRole`, otherwise `astrolabe.sage-primer-solo`.
Vibers (and our trial test guild) configures patronRole, so the
active role is `sage-primer-attended`. The role prompt lives at
`packages/plugins/astrolabe/sage-primer-attended.md` (244 lines).
This is where the surface map is injected.

The trial shape is **spec-only** (planning-only) — see
[Lab Operations / Trial Shapes](../lab-operations/running-trials.md#trial-shapes)
for the rig configuration. No implement/review/seal stages run.

## Background

Two real `reader-analyst` sessions analyzed for this experiment:

| Session id | Provider id | Brief | Cost | Duration |
|------------|-------------|-------|------|----------|
| `ses-mok28grd-6e552bb6` | `212acee8-3072-…` | stacks dropBook | $6.48 | 10.6 min |
| `ses-mojmj4zc-e81d52ed` | `c5510609-fe67-…` | cartograph plan | $8.08 | 14.6 min |

Tool-call analysis showed 25–40% of traffic is **orientation** —
`ls`-walking the package tree, opening `index.ts` / `types.ts` to
learn what they export, and existence-check Greps. None of this is
genuine code comprehension; the planner is figuring out the lay of
the land.

A **package surface map** — a compact JSON artifact listing every
package, its files, and each file's exported symbol names + kinds
(no signatures or JSDoc) — captures exactly the information those
orientation calls return. Estimated full-monorepo size is
~50–80 KB (~15–20K tokens), small enough to inject into the role
prompt wholesale.

Sibling experiment X019 tests a complementary intervention (reverse
usage index via lookup tool, targeting cross-reference Greps). The
two are run sequentially because they target different planner
behaviors and would confound each other in a single trial.

## Hypothesis

**H1.** Injecting the package surface map into the reader-analyst's
role prompt reduces reader-analyst session cost (USD) by ≥25%
without meaningfully degrading spec quality.

"Meaningfully degrading" is operationalized via a three-tier
quality observation regime — see [Quality](#quality-no-regression)
below. Tier 1 (mechanical) and Tier 2 (manual review) run on every
variant trial; Tier 3 (downstream implementer) is deferred unless 1
or 2 flag a regression.

## Variants

| variant | description |
|---|---|
| baseline | reader-analyst role prompt unmodified |
| with-surface-map | reader-analyst role prompt prepended with the precomputed package surface map for the codex; instruction text directs "consult the surface map before grep/ls/file-reads for orientation" |

## Metrics

### Primary (cost)

- **Reader-analyst session cost (USD)**
- **Reader-analyst tokens** — input / output / cache-read /
  cache-write
- **Reader-analyst wallclock duration**

### Secondary (mechanism)

Tool-call counts on the reader-analyst session, categorized:

- `ls` / `Bash ls`: directory orientation calls
- `Read` first-pass reads of `index.ts` / `types.ts` / package
  entry files (orientation reads)
- `Grep` existence checks (small result sets, single-name queries)
- `Grep` cross-reference queries (multi-pattern, cross-package)
- Total reads, total greps, total bash

Mechanism prediction: surface map cuts orientation `ls`,
orientation `Read`, and existence-check Greps; cross-reference
Greps and deep semantic reads stay roughly unchanged.

### Quality (no-regression)

Three-tier observation regime. Tiers 1 + 2 run on every variant
trial; Tier 3 is deferred unless triggered.

The **comparator** for all three tiers is the **reference baseline**
established in Phase 3 — either the real-world baseline plan (if
the calibration trial confirms apparatus fidelity) or the
calibration trial's plan (if we re-baseline at the Lab cost).

**Tier 1 — Mechanical structural integrity (every variant trial).**
Extracted post-trial from the `astrolabe/plans` book:

- All four artifact sections present and non-trivial in length
  (`inventory`, `scope`, `decisions`, `observations`, `spec`)
- Decision count within ±30% of reference baseline
- Scope item count within ±30% of reference baseline
- Inventory length within ±40% of reference baseline (word count)
- Every decision has `selected` populated

Trip any check → trial flagged "quality flagged." Automated;
runs unconditionally.

**Tier 2 — Manual side-by-side review (every variant trial).**
Coco/Sean reads the reference baseline + variant specs
side-by-side. Flag any obvious quality regression: missing
decisions, glossed-over sections, drifted recommendations, etc.
Expected outcome is "no identified issues" — if Tier 2 flags
something, escalate to Tier 3. ~10 min human time per trial.
One-paragraph summary lands in the variant trial's artifact
directory.

**Tier 3 — Downstream implementer trial (deferred / on-trigger).**
Hand each variant's spec to a fresh implement-only trial. Compare
outcome class (completed/failed) and quality-scorer composite
from existing instruments (`experiments/instruments/`). ~$5–10
per implementer trial. Run when:

- Tier 1 flags a structural issue
- Tier 2 surfaces a possible regression
- Periodic spot-check (once per N variant trials)
- Final sign-off before declaring the experiment complete

H1 is sustained when cost reduction is observed AND at least one of:

- Tier 1 + Tier 2 both pass
- Tier 3 passes

## Design

### Phase 1 — surface-map generator

Sanctum-side script that produces the package surface map for a
given codex SHA. ts-morph-based; emits a single JSON artifact:

```json
{
  "generatedFromSha": "<sha>",
  "packages": [
    {
      "name": "stacks",
      "fileCount": 18,
      "files": [
        {
          "path": "src/types.ts",
          "exports": [
            { "name": "Book", "kind": "interface" },
            { "name": "ChangeEvent", "kind": "type" }
          ]
        }
      ]
    }
  ]
}
```

Validate size (target: ≤80 KB for the full Nexus monorepo) and
regen time (target: ≤30s).

### Phase 2 — injection mechanism

Two levers available, in increasing order of investment:

**Lever A: test-guild prompt override (trivial, MVP).** The test
guild's `loom.roles` config inlines a custom
`astrolabe.sage-primer-attended` role definition that overrides
the upstream role prompt with a hardcoded variant containing the
surface map literal. The surface map is regenerated at trial-setup
time and pasted into the role markdown by a small fixture engine
(or a manifest-time substitution in the manifest YAML).

Pros: no nexus framework changes, ship-it-now.
Cons: surface map is hardcoded per-trial — not a production
mechanism.

**Lever B: framework-side primer-document slot (production
candidate).** Branch nexus, add a `primerDocument` config field on
the reader-analyst engine (or on the role itself) that points to a
file or stacks book the engine reads at session-start and splices
into the system prompt. Calibration script generates the artifact;
trial fixture writes it to the configured location.

Pros: proper mechanism, generalizable.
Cons: nexus changes, more surface to land.

**Recommendation: start with Lever A** for the first trials.
Promote to Lever B only if X018 results justify the production
investment. Sequence: ship Lever A → run X018 → if H1 sustained,
specify and ship Lever B as a separate commission.

### Phase 3 — Trials

Trials are spec-only shape. Codex pinned per trial; surface map
regenerated against that SHA. **No paired baseline-per-variant** —
we use the existing real-world baseline as the comparator
(possibly re-anchored after calibration; see below).

**Codex selection.** Replays of the two real plan rigs we already
analyzed give us known real-world baselines:

1. Stacks `dropBook` plan rig (mandate writ `w-mojnftby`,
   reader-analyst session `ses-mok28grd`, baseline cost $6.48)
2. Cartograph plan rig (mandate writ `w-mojmj0rc`,
   reader-analyst session `ses-mojmj4zc`, baseline cost $8.08)

Both are real cross-package work. Run cartograph first (richer
session, larger baseline cost — bigger effect-size signal).

#### Trial sequence

**Step 1 — Calibration baseline.** Run a Lab baseline (no surface
map) of the cartograph commission. Validates the `lab.plan-only`
recipe end-to-end and measures apparatus fidelity vs the
real-world session.

**Step 2 — Branch on calibration result.** Three cases:

- **(a) Lab baseline within ~10–15% of real-world cost.**
  Apparatus is faithful. Use the real-world session as the
  reference baseline for variant comparison. Proceed to step 3.
- **(b) Lab baseline diverges 15–30% consistently.** Re-anchor:
  treat the calibration plan as the new reference baseline (it
  reflects current apparatus reality). Proceed to step 3.
- **(c) Lab baseline diverges >50% or non-deterministically.**
  Apparatus problem. Stop, diagnose, fix before any variant trial.

**Step 3 — Variant trial.** Run the with-surface-map variant on
the same commission. Compare cost (USD, tokens, duration) and
quality (Tiers 1 + 2) against the reference baseline established
in step 2.

**Step 4 — Decide expansion.** Based on directional signal and
per-trial cost, decide whether to: replay stacks `dropBook` for a
second data point, expand N for formal CI, trigger Tier 3, or
stop.

**Per-trial cost** is roughly the real-world baseline (~$6–8 per
trial). Total minimum spend for a complete cartograph
calibration + variant pair: ~$16. Stacks adds another ~$13 if we
extend.

**Rig configuration.** Use the `lab.plan-only` rig template per
[Lab Operations / Planning-only rig](../lab-operations/running-trials.md#planning-only-rig).
The recipe is copy-pasted into the manifest's `config.spider`
block; no framework changes required.

## Risks

- **Surface map staleness.** If the planner trusts the map but it
  disagrees with the actual code, the planner makes wrong
  decisions. Mitigation: regen against the exact codex SHA at
  trial-setup; treat any divergence as a bug.
- **Token budget pressure.** Adding 15–20K tokens to the role
  prompt shifts cache-warming cost. If the surface map costs more
  in cache writes than it saves in reads, H1 is falsified.
- **Quality regression hidden in spec body.** Surface-map-primed
  reader-analyst may produce a shorter spec because it skipped
  reads that surfaced nuance. Tier 2 review catches this; Tier 3
  is the canonical check.
- **Scenario specificity.** Surface-map benefit depends on
  commission shape. Tightly-scoped single-package work may
  benefit little; cross-package work probably benefits most.
  Both calibration codexes are cross-package, intentionally.
- **First spec-only trial shape.** The Laboratory has not yet run
  a spec-only trial. Apparatus issues may surface; the Phase 3
  step 1 calibration trial is precisely where these get caught.
  Calibration result drives the branch in step 2 (trust real-world
  baseline / re-anchor / stop and fix).
- **Single-run variance.** With no paired Lab baseline per
  variant, a single variant run might be a high or low outlier
  vs the reference baseline. N=1 is sufficient for *directional*
  H1 evidence per the spec's calibration framing; expansion to
  N>1 (step 4) is the canonical control for variance.

## Depends on

- Sanctum-side surface-map generator (Phase 1)
- Test-guild prompt override mechanism (Phase 2 Lever A)
- Spec-only trial shape support in the Laboratory
  (see Lab Operations)
- Reproducible scenario codexes (the two replay rigs above)

## Sequencing

X018 runs **before** X019. They both perturb the reader-analyst
input; running together would confound the cost signal. X018's
result also informs X019's design — if surface-map injection
already covers most existence-check Greps, X019's incremental win
shrinks and its expected effect size shifts.

## References

- Parent click: `c-moogy8wa`
- This experiment's click: `c-moogydti`
- Companion: X019 — Reverse Usage Index
- Lab Operations: `experiments/lab-operations/running-trials.md`
- Source analysis transcripts:
  `/home/vscode/.claude/projects/.../212acee8-*.jsonl` and
  `.../c5510609-*.jsonl`
- Astrolabe pipeline: `docs/architecture/apparatus/astrolabe.md`
  (in nexus repo)
- Role prompt: `packages/plugins/astrolabe/sage-primer-attended.md`
  (in nexus repo)
