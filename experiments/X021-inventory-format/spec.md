---
status: draft
---

# X021 — Inventory Format Optimization

**Parent click:** `c-mok4ocec` — Category 2 (Spec and inventory
format) of the Apr 29 cost-optimization landscape under
`c-mok4nke6`. **This experiment's click:** `c-mophvf0d`.

## Research question

Does augmenting the implementer's **spec** with inline type
signatures, inline pattern templates, and explicit
"files-you-do-not-need-to-Read" guidance reduce implementer
session cost ≥15% without meaningfully degrading commission
outcomes?

## Pipeline placement

Unlike X018 / X019 (which target the **planner**), X021 targets
the **implementer**. The intervention is **edits and additions to
the spec the planner hands forward** — the only artifact the
implementer actually sees in its initial prompt. We do not modify
any role prompt, plugin, or framework code on the trial guild;
we hand-edit variant specs and feed them as the brief into the
`lab.implement-only` rig shape.

The trial shape is **implement-only** — see
[Lab Operations / Trial Shapes](../lab-operations/running-trials.md#trial-shapes).
No astrolabe engines run. The brief IS the plandoc's `spec`
section; the implementer reads it directly.

## Design correction (2026-05-03)

The original framing of this experiment targeted the planner's
**inventory** section. Mid-experiment inspection of two production
implementer transcripts (rig-moj12h4o and rig-moji64hs) revealed
that **the implementer never sees the inventory in its prompt**,
and **never fetches the plandoc out-of-band** (zero plandoc tool
calls, zero `.nexus/` reads, zero MCP tool calls in either
transcript). The implementer's prompt is **only the plandoc's
`spec` section** (~26 KB substantive, ~22 KB control).

This invalidates the original transformation surface: there is no
inventory in the implementer's input to reformat. The cite-by-path
patterns we measured do exist — but they live in the spec's
`## Existing Patterns` section, in task `<files>` blocks, and as
autonomous-orientation reads on adjacent type files. Pure-reads
arise from three distinct mechanisms, only one of which is
spec-resident:

1. **Pattern citations in `## Existing Patterns`** (e.g.,
   "summon-relay.ts and decline-relay.ts are the templates")
   — drives reads on those template files.
2. **Autonomous orientation on type files** — implementer Reads
   `types.ts` files on its own when wiring up new code, even when
   the spec doesn't direct it.
3. **Speculative reads on adjacent files** — implementer Reads
   index.ts, package.json, adjacent test files for context, even
   when not in the change scope.

X021 is reframed accordingly: variants now apply *to the spec*,
and #3 / #5 become **additive interventions** (insertions of new
content into the spec) rather than format transformations of an
existing inventory section.

Original transformation-of-inventory variants and the briefs
extracted from the full plandoc (inventory + scope + decisions +
observations + spec, 61 KB) are preserved in commit `cd740482`
and `0b931770` for the historical record.

## Background

The Apr 29 cost-optimization landscape (`c-mok4nke6`) analyzed two
recent rigs against 101 archived implement transcripts and surfaced
a **49% pure-read rate** on the substantive rig (`rig-moj12h4o` /
"rig 2") — i.e. roughly half of all file content the implementer
Read was never edited. The mechanism: the inventory directs the
implementer to specific files via cite-by-path pointers (`see
clockworks/src/types.ts:116 for StandingOrder shape`), and the
implementer Reads the cited file in full to extract the
information.

Pure-read driver scan in production transcripts (2026-05-03,
post-correction):

| pure-read source | rig-moj12h4o examples |
|---|---|
| `## Existing Patterns` cites in spec | summon-relay.ts (23 KB read), decline-relay.ts (8 KB read) |
| Autonomous orientation on types | clockworks/types.ts (27 KB), reckoner/types.ts (28 KB), clockworks/relay.ts (8.6 KB) |
| Speculative adjacent-file reads | index.ts barrels, reckoner.test.ts, schedulers/always-approve.ts, clockworks.ts (44 KB) |

Total pure-read content on rig-moj12h4o's substantive implement:
**225 KB across 13 files** — the 49% headline rate. The
intervention surface is in the spec for #4; for #3 and #5 the
intervention is *additive* — content the spec doesn't currently
carry.

Three of the five Category 2 ideas have viable shapes for X021,
two are out of scope:

- **#3 Inline type signatures** (additive) — insert a `## Type
  signatures (inlined)` section near the top of the spec carrying
  the load-bearing type defs (StandingOrder, RelayDefinition,
  RelayContext, GuildEvent, ClockworksKit, ReckoningDoc,
  SchedulerInput, etc.). Targets autonomous-orientation reads.
  Estimated savings: 10–15%.
- **#4 Inline pattern templates** (transformation) — edit the
  spec's `## Existing Patterns` section to replace
  cite-by-path template references with a 30-line factory-shape
  excerpt + explicit "do not Read" instruction. Estimated savings:
  5–10%.
- **#5 "Do not Read" guidance** (additive) — insert a `## Files
  you do not need to Read` section listing the adjacent / barrel /
  out-of-scope-test files that the production implementer
  pure-read. Targets speculative reads. Estimated savings: ~5%.
- **#6 Vestigial-reference cleanup** — out of scope for X021.
  Requires a planner-side detector for about-to-be-deleted files;
  not a spec-format change.
- **#7 Pre-quoted source excerpts** — out of scope for X021.
  Targets doc-edit work, not code-edit work; deserves its own
  experiment with a doc-heavy commission.

## Hypothesis

**H1.** Augmenting the spec with all three interventions
(combined #3 + #4 + #5) reduces implementer session cost (USD)
by ≥15% on the substantive (rig-moj12h4o) replay, without
meaningfully degrading outcome.

**H2 (mechanism).** Per-idea contribution is roughly additive
(#3 ≥ #4 ≥ #5 by effect size, summing to H1's combined figure).
Single-idea variants on the substantive replay separate the
contributions:

- **v1** targets autonomous-orientation pure-reads on types files
  (~63 KB pure-read on rig-moj12h4o)
- **v2** targets pattern-citation pure-reads on template files
  (~31 KB)
- **v3** targets speculative pure-reads on adjacent / barrel /
  out-of-scope-test files (~50 KB)

**H3 (control).** On rig-moji64hs (mechanical, near-zero
intervention surface — only #4 has any applicable site), the v4
variant produces ~no cost reduction (within ±5% of baseline). This
confirms the mechanism is "spec content augmentation works on
substantive code commissions, not on doc-cleanup commissions" and
not "smaller spec is cheaper."

"Meaningfully degrading" is operationalized via the same three-tier
quality regime as X018/X019. Tier 1 mechanical and Tier 2 manual
review run on every variant trial; Tier 3 is deferred unless a
trial flags concern. Adapted for implement-only — see
[Quality](#quality-no-regression).

## Variants

| variant | description | size |
|---|---|---|
| baseline | the plandoc's `spec` section verbatim (the only content the production implementer received in its prompt) | ~25 KB |
| v1 inline-types (additive) | baseline with a `## Type signatures (inlined)` section inserted after `## Intent`, carrying the load-bearing types verbatim from source at the codex SHA | ~41 KB |
| v2 inline-templates (transformation) | baseline with the `## Existing Patterns` section's `summon-relay.ts / decline-relay.ts` cites replaced by a verbatim 30-line factory excerpt + explicit "do not Read" instruction | ~26 KB |
| v3 do-not-read (additive) | baseline with a `## Files you do not need to Read` section inserted before `## Existing Patterns`, listing files observed pure-read in the production implementer transcript | ~27 KB |
| v4 combined | baseline with all three applied | ~44 KB |

The baseline must be **the verbatim plandoc `spec` section** —
extracted from `astrolabe/plans` book in the production guild — so
we are testing only the augmentations / transformations, not
phrasing drift.

For the control rig (rig-moji64hs), only v2 has any applicable
site (the `integration.test.ts` `tester.kind` precedent
citation); #3 and #5 have no applicable surface on a doc-cleanup
commission. The control v4 brief therefore only differs from
baseline in one inlined excerpt — by design, this is what makes
H3 a meaningful control rather than a re-run.

## Metrics

### Primary (cost)

- **Implementer session cost (USD)** — sum across implement,
  review, revise, seal engines (the implement-only rig's
  full session chain)
- **Implementer tokens** — input / output / cache-read / cache-write
- **Implementer wallclock duration**

### Secondary (mechanism)

- **Pure-read rate** — fraction of `Read` tool-call output bytes
  on files the implementer never subsequently `Edit`ed or `Write`ed.
  Baseline target: ~49% (the rig-moj12h4o headline figure).
  Variant target: substantially reduced.
- **Read calls on cited files** — for each of the ~10 files
  cited in the inventory, count Reads in the implementer
  transcript. Variants targeting #3 should drop reads on
  `types.ts` files; variants targeting #4 should drop reads
  on pattern-template files; variants targeting #5 should drop
  reads on no-change-expected files.

A standalone post-trial analysis script (currently nonexistent —
see Phase 1 below) computes pure-read rate from the session's
tool-call transcript. The 49% number was produced this way against
the original rig-moj12h4o transcript; the script needs to be
factored out / rebuilt as a reusable instrument before trial 1.

### Quality (no-regression)

**Tier 1 — Mechanical** (every trial): seal status (success /
fail), test-suite pass at seal, manifest task coverage (every
declared `<task>` either reflected in commits or explicitly
no-op'd in the implementer's transcript).

**Tier 2 — Manual side-by-side** (every variant trial): Coco/Sean
diffs the variant's sealed commit against baseline's sealed
commit. Flag any obvious regression: missing edits, drifted edits,
test changes that look wrong, etc. Expected outcome is "no
identified issues." ~10 min per variant. One-paragraph summary
in the trial's artifact directory.

H1 is sustained when cost reduction ≥15% is observed on v4
(combined) on the substantive replay AND Tier 1 + Tier 2 both
pass.

## Design

### Phase 0 — Pure-read measurement instrument

The 49% figure in `c-mok4nke6` was produced by
`experiments/X011-context-debt/artifacts/scripts/h4_read_utilization.py`,
which classifies file Reads in a Claude Code jsonl transcript by
whether the file was subsequently Edited / Written / Bash-modified
(`sed -i`, `rm`, `mv`, etc.) or never touched. The script
reproduces the 1.9% (rig 1) / 49.1% (rig 2) split cleanly.

Phase 0 work for X021 is scoped to **promote and parameterize**:

1. Move the script to `experiments/instruments/read-utilization/`
   (or symlink) so it has a stable home outside an experiment
   artifacts dir.
2. Replace the hardcoded `TRANSCRIPTS` list with a CLI that takes
   either (a) a transcript path, or (b) a session id which the
   script resolves to a transcript path under
   `~/.claude/projects/...`.
3. Emit JSON output (in addition to the existing human-readable
   prose) so trial archive hooks can capture machine-readable
   pure-read metrics into the trial record.

This is a small build-out (~30–60 min, not a separate
commission). Coco does it inline before trial 1.

### Phase 1 — Extract the verbatim baseline specs

For each of the two candidate rigs, extract the **plan's `spec`
section** from `vibers/.nexus`'s `astrolabe/plans` book and write
it to `experiments/X021-inventory-format/briefs/`:

- `rig-moj12h4o-baseline.md` — substantive (Reckoner periodic
  tick), ~25 KB
- `rig-moji64hs-baseline.md` — mechanical (vision-keeper
  deletion), ~22 KB

The baseline brief is **just the spec section** — matching
exactly what the production implementer received in its prompt.
The plandoc's separate inventory / scope / decisions /
observations sections are intermediate planner artifacts the
implementer never sees, so they are deliberately excluded.

### Phase 2 — Hand-craft variant briefs

For rig-moj12h4o (substantive), produce four variant briefs:

- `rig-moj12h4o-v1-inline-types.md` — apply #3 (additive)
- `rig-moj12h4o-v2-inline-templates.md` — apply #4 (transformation)
- `rig-moj12h4o-v3-do-not-read.md` — apply #5 (additive)
- `rig-moj12h4o-v4-combined.md` — apply #3 + #4 + #5

Interventions:

- **#3 inline-types (additive)** — insert a `## Type signatures
  (inlined)` section after `## Intent` carrying the load-bearing
  types verbatim from source at the codex SHA. Targets:
  `RelayContext`, `RelayHandler`, `RelayDefinition`,
  `StandingOrder`, `ClockworksKit`, `HeldWrit`, `CapacitySnapshot`,
  `SchedulerOutcome`, `SchedulerDecision`, `SchedulerInput`,
  `Scheduler`, `ReckoningOutcome`, `ReckoningDoc`. The section
  carries an explicit "do not Read these source files" instruction
  for `clockworks/types.ts`, `clockworks/relay.ts`,
  `reckoner/types.ts`. Goal: implementer doesn't autonomously
  orient on type files.
- **#4 inline-templates (transformation)** — replace the spec's
  `## Existing Patterns` section's first bullet (the
  `summon-relay.ts / decline-relay.ts are the templates` reference)
  with a verbatim 30-line excerpt of `decline-relay.ts`'s factory
  shape + an explicit "do not Read either source file" note. Goal:
  implementer doesn't Read template files to learn the pattern.
- **#5 do-not-read (additive)** — insert a `## Files you do not
  need to Read` section before `## Existing Patterns` listing the
  files observed pure-read in the production transcript:
  `clockworks/clockworks.ts`, `clockworks/index.ts`,
  `reckoner/index.ts`, `reckoner/schedulers/always-approve.ts`,
  `reckoner/reckoner.test.ts`. Goal: implementer skips speculative
  reads on adjacent / barrel / out-of-scope-test files.

For rig-moji64hs (control), produce only:

- `rig-moji64hs-v4-combined.md` — apply only #4 (the only
  intervention with applicable surface; the spec's
  `## Existing Patterns` cites `integration.test.ts` for the
  `tester.kind` precedent, which gets inlined as a 12-line excerpt)

### Phase 3 — Trial run

Trials are implement-only shape, codex pinned to the production
rig's pre-seal SHA. Variants posted as briefs via
`nsg lab trial-post`.

#### Trial sequence

**Step 1 — Calibration baseline (rig-moj12h4o).** Lab replay of
the verbatim baseline brief. Confirms lab fidelity vs production
implementer cost. If divergent >30%, diagnose before variants.

**Step 2 — Calibration baseline (rig-moji64hs).** Same, on the
control rig. Used as the rig-moji64hs comparator.

**Step 3 — Variant trials, substantive (rig-moj12h4o):**
v1, v2, v3, v4. Each compared against the Step 1 calibration.

**Step 4 — Variant trial, control (rig-moji64hs):** v4 only.
Compared against the Step 2 calibration.

**Step 5 — Decide expansion.** N=1 per variant gives directional
signal. If H1 sustains, expand to N=2 on the load-bearing variants
(v4 substantive + v4 control) for variance check. If H1 doesn't
sustain, document and close.

**Total trial count:** 2 calibrations + 4 variants (substantive)
+ 1 variant (control) = **7 trials**.

#### Cost estimate

Production cost was $47 (substantive full-rig) and $20
(control full-rig). Implement-only is a subset (no plan stages),
typical $5–$15/trial per [running-trials.md](../lab-operations/running-trials.md#implement-only).
Estimate: **$50–$120 total** for the 7-trial sequence.

### Manifest plumbing

Each variant trial is one manifest under
`experiments/X021-inventory-format/manifests/`:

- `rig-moj12h4o-baseline.yaml`
- `rig-moj12h4o-v1-inline-types.yaml`
- ... etc

Identical apparatus across the seven manifests. Codex pin = the
parent commit of the original rig's sealed commit (the
implementer-eye-view of the codebase). Brief path differs per
manifest.

Lab plugin set: implement-only set per
[Standard plugin sets](../lab-operations/running-trials.md#standard-plugin-sets).
Settings: `model: opus` to match production.

## Risks

- **Phase 0 missing.** Without the pure-read measurement script,
  we lose the headline mechanism check. Phase 0 is gate-blocking
  on trial 1.
- **Inventory transformation drift.** Hand-edited variants may
  inadvertently drift in non-format dimensions (rephrasing,
  reorganizing). Mitigation: variants are produced as **diffs
  from baseline** — only the targeted citations are touched.
  Reviewer (Coco) confirms diff is bounded to the intervention.
- **N=1 variance.** Implementer cost has more variance than
  planner cost (rate-limit retries, test flakes). Effect sizes
  in the 5–15% range may be obscured at N=1. Step 5's expansion
  to N=2 on load-bearing variants is the canonical control.
- **Verbatim spec replay vs reality.** The original implementer
  worked against the live codex with whatever drift happened
  during implementation; our replay against pinned SHA is cleaner
  but may differ. Mitigation: pin to the parent of the seal
  commit so the implementer sees the exact pre-state.
- **Brief-as-spec format mismatch.** The original spec lived in
  the `astrolabe/plans` book; concatenating sections into a
  brief markdown changes the framing slightly. Mitigation:
  preserve section ordering and headers; baseline trial measures
  any framing-induced cost shift before variants.
- **Quality regression hidden.** A variant that "saves cost" by
  causing the implementer to skip a needed Read could produce
  worse code without seal failing. Mitigation: Tier 2 manual
  side-by-side diff against baseline's sealed commit.

## Depends on

- Phase 0 pure-read measurement script (gate-blocking on trial 1)
- Implement-only trial shape (already exercised by X016)
- Reproducible scenario codexes — pre-seal SHAs of
  `rig-moj12h4o` and `rig-moji64hs`

## Sequencing

X021 runs after X019 / X020 because it targets a different
pipeline role (implementer, not planner) and a different
intervention surface (inventory format, not role prompt or tool
exposure). No confound risk.

If X018/X019/X020 results suggest the planner-side bottleneck
moves significantly with their interventions, X021's baseline
should be re-anchored against that — but the cite-by-path
pattern in the inventory is structural to the planner's output
shape, not the planner's tooling, so X021's primary signal
should be insensitive to upstream interventions.

## References

- Parent click: `c-mok4ocec` (Category 2)
- Grandparent click: `c-mok4nke6` (Apr 29 cost-optimization
  landscape)
- Source rigs: `rig-moj12h4o` (substantive, $47) and
  `rig-moji64hs` (control, $20) in `vibers` guild
- Source plans: `w-moiy8hkv` (substantive plan) and
  `w-moji63xm` (control plan)
- Lab Operations: `experiments/lab-operations/running-trials.md`
- Companion experiments: X018, X019, X020
