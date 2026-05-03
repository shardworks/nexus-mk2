---
status: active
---

# X022 — Implementer Behavior Nudges

**Parent click:** `c-mok4oct1-553c312ebe55` — Category 3 (Implementer
behavior, prompt-level nudges) of the Apr 29 cost-optimization
landscape under `c-mok4nke6-06b21ff2a765`.

## Research question

Does prepending five behavior nudges (Bash bulk edits, targeted
Reads after Grep, repeat-grep avoidance, narrow test filters, no
re-test of unchanged packages) to the **artificer role file** reduce
**implementer session cost** ≥10% on real historical commissions
without meaningfully degrading outcomes?

## Pipeline placement

Like X021, X022 modifies a prompt artifact directly — **manual
modifications to prompts**. Unlike X021 (which targets the
inventory/brief content the planner produces), X022 targets the
**artificer role file** (`roles/artificer.md`) — the persistent
role-instruction substrate Loom binds into every implement /
revise session.

The intervention is shipped via `lab.guild-setup`'s `files:`
mechanism (the same mechanism X015 used to inject the role file).
We hand-craft a single variant role file and copy it over the
test guild's `roles/artificer.md`.

The trial shape is **implement-only** — see
[Lab Operations / Trial Shapes](../lab-operations/running-trials.md#trial-shapes).
No astrolabe engines run. The brief markdown IS the spec; the
implementer reads it directly. We use the **PlanDoc `spec` field
verbatim** — the same content the production implementer received
when its session was launched (Astrolabe writes only `plandoc.spec`
into the implementer brief, not the inventory / scope / decisions
/ observations fields). Initial X022 drafts inherited X021's
larger-than-production briefs (full plandoc concatenation,
~2.4× production size); these were trimmed to spec-only on
2026-05-03 (commit `5a7ff5ae`) once the X021 trial-runner
identified the mismatch.

## Background

The Apr 29 cost-optimization landscape (`c-mok4nke6`) analyzed two
recent rigs against 101 archived implement transcripts and
catalogued five Category 3 ideas — small implementer-prompt
nudges, each with modest individual savings (~5–15%) but
collectively material.

Empirical evidence per the click summaries:

| idea | empirical mechanism | rig with strongest signal |
|---|---|---|
| #8 Prefer Bash bulk edits | rig 1 made 10 sequential Edits to a single test file's fixture string (~700 chars) — could have been one `sed -i` | rig-moji64hs (rename-heavy deletion) |
| #9 Targeted Reads after Grep | implementer Reads cited file in full after Grep returns line numbers | both rigs |
| #10 Discourage repeat greps | rig 2 searched the same patterns (`handleWritsChange\|runCatchUpScan\|stacks.watch.*clerk.*writs`) 4+ times with each result re-added to context | rig-moj12h4o (substantive) |
| #11 Narrow test filters first | rig 2 ran `pnpm -w test` (full workspace) 6+ times — should have used `pnpm --filter <pkg> test` until the final gate | rig-moj12h4o (substantive) |
| #12 Don't re-test unchanged packages | adjacent-package "just to be safe" test runs | both rigs |

Both candidate rigs exhibit at least some of the five mechanisms.
Unlike X021 (which has a clean substantive/control split because
the inventory format only affects cite-by-path-heavy specs),
X022's interventions target general implementer tool-use habits
that should help on both rigs.

## Hypothesis

**H1 (substantive).** The combined-nudges variant reduces
implementer session cost (USD) ≥10% on rig-moj12h4o relative to
baseline. Mechanism: ideas #10, #11, #12 should fire most
frequently here.

**H2 (control / mechanical).** The combined-nudges variant
reduces implementer session cost ≥5% on rig-moji64hs relative to
baseline. Mechanism: idea #8 should fire on the rename-heavy
fixture-string edits in this rig.

**H3 (no-regression).** Neither variant produces an
outcome-quality regression vs its baseline (Tier 1 mechanical
+ Tier 2 manual diff).

If H1 holds and H2 holds → ship the nudges as a baseline change
to vibers' artificer role.

If H1 holds and H2 fails → ship as targeted intervention only on
rigs with code-change patterns matching ideas #10/#11/#12.

If H1 fails → re-evaluate the per-idea decomposition (single-idea
variants on the load-bearing ideas).

## Variants

| variant | description |
|---|---|
| baseline | `roles/artificer.md` is verbatim copy of `/workspace/vibers/roles/artificer.md` (the canonical production role) |
| combined | baseline file with a new "Tooling Discipline" section prepended before "Testing", carrying all five nudges as imperative directives |

The variant role file is the single intervention. Brief content,
codex pin, plugin set, framework version, and all other manifest
parameters are identical baseline-vs-variant. The only deliberate
variable is the artificer.md file copied into the test guild.

## Metrics

### Primary (cost)

- **Implementer session cost (USD)** — sum across implement,
  review, revise engines (the implement-only rig's session chain;
  seal is mechanical and effectively free)
- **Implementer tokens** — input / output / cache-read / cache-write
- **Implementer wallclock duration**

### Secondary (mechanism)

- **Bash invocation count** — variant should show more `Bash` and
  fewer `Edit`/`MultiEdit` calls on rename-heavy work (#8 mechanism)
- **Read calls vs Grep calls ratio** — variant should show
  targeted Reads (with `--offset`/`--limit`) following Grep
  (#9 mechanism)
- **Grep pattern uniqueness** — fraction of Grep patterns that
  appear ≥2 times in the transcript (#10 mechanism)
- **Full-workspace test runs** — count of `pnpm -w test` (or
  equivalent) invocations vs `pnpm --filter` invocations
  (#11/#12 mechanism)

A standalone post-trial analysis script under `scripts/` extracts
these from the implementer's transcript jsonl. Authored inline
with trial 1 unless an existing instrument already covers it.

### Quality (no-regression)

**Tier 1 — Mechanical** (every trial): seal status (success /
fail), test-suite pass at seal, manifest task coverage (every
declared `<task>` either reflected in commits or explicitly
no-op'd in the implementer's transcript).

**Tier 2 — Manual side-by-side** (every variant trial): Coco/Sean
diffs the variant's sealed commits against baseline's sealed
commits. Flag any obvious regression: missing edits, drifted
edits, test changes that look wrong, etc. Expected outcome is "no
identified issues." ~10 min per variant. One-paragraph summary
in the trial's artifact directory.

H1/H2 are sustained when cost reduction at the threshold is
observed AND Tier 1 + Tier 2 both pass.

## Design

### Phase 1 — Role file variants

Two role files:

- `fixtures/test-guild/roles/artificer-baseline.md` — verbatim
  copy of `/workspace/vibers/roles/artificer.md` at the time of
  trial authoring (2026-05-03). Frozen for the experiment.
- `fixtures/test-guild/roles/artificer-combined-nudges.md` —
  baseline file with a new "Tooling Discipline" section prepended
  immediately after "Role" and before "Testing". Five subsections,
  one per idea, each phrased as an imperative directive with a
  one-line empirical justification.

The patron.md role file (used by astrolabe) is not in scope —
astrolabe doesn't run in implement-only trials.

### Phase 2 — Briefs

Two briefs, one per candidate rig, each carrying **only the
PlanDoc `spec` field** for the production commission — the same
content Astrolabe wrote into the production implementer's brief
when its session was launched:

- `briefs/rig-moj12h4o-baseline.md` — 25 KB / 253 lines
  (production size: ~26 KB)
- `briefs/rig-moji64hs-baseline.md` — 22 KB / 147 lines

The brief opens with the spec's `# <commission title>` /
`## Intent` and runs through the trailing `</task-manifest>`.
No inventory / scope / decisions / observations content (those
are separate PlanDoc fields the Astrolabe pipeline does not put
into the implementer brief).

Note: initial drafts (commits prior to `5a7ff5ae`) inherited
X021's then-untrimmed baseline briefs (~61 KB / 55 KB), which
concatenated all PlanDoc sections. The X021 trial-runner
identified the mismatch on 2026-05-03; both X021 and X022
trimmed at the same time.

No baseline-vs-variant brief difference — the intervention is
role-file only.

### Phase 3 — Trial sequence

Four trials, run sequentially:

| # | rig | variant | manifest |
|---|---|---|---|
| 1 | rig-moj12h4o (substantive) | baseline | `manifests/rig-moj12h4o-baseline.yaml` |
| 2 | rig-moj12h4o (substantive) | combined | `manifests/rig-moj12h4o-combined.yaml` |
| 3 | rig-moji64hs (control) | baseline | `manifests/rig-moji64hs-baseline.yaml` |
| 4 | rig-moji64hs (control) | combined | `manifests/rig-moji64hs-combined.yaml` |

Sequenced one at a time. Review interim results after each pair
(rig completes baseline + variant) before deciding to expand N.

### Codex pins

- rig-moj12h4o → baseSha `0e1e81f4a219179fd264625b869e12bd00778365`
  (parent of `7bed456`, the implementer's draft commit for
  `w-moiy8hkv`)
- rig-moji64hs → baseSha `d6e34097f698df66d595f81f928320eafde8276f`
  (parent of `721c9ec`, the first of six commits sealed for
  `w-moji63xm`)

These are the implementer-eye-view of the codebase at the moment
each rig started.

### Cost estimate

Production cost was $47 (substantive full-rig with planning) and
$20 (control full-rig with planning). Implement-only is the
back-half of that; X016 phase 2c on the same substantive rig
ran $6.50 with a partial handoff. Full implement on the
substantive rig should run $15–$30; control should run $10–$20
against a production-faithful (spec-only) brief.

Estimate: **$30–$60 total** for the 4-trial sequence with
trimmed briefs. (Initial draft estimate of $50–$100 assumed
the bloated 2.4×-production briefs.)

### Manifest plumbing

Identical apparatus across the four manifests:

- `frameworkVersion: '0.1.301'` (current latest)
- Implement-only plugin set per
  [Standard plugin sets](../lab-operations/running-trials.md#standard-plugin-sets)
- `loom.roles.artificer.model: opus` to match production model
  choice on these rigs
- `files:` block copies the variant role into
  `roles/artificer.md` (per X015 precedent)

Per-manifest variations: codex baseSha, briefPath, and
`files[0].sourcePath` (which artificer file gets copied).

## Risks

- **N=1 variance.** Implementer cost has variance from rate-limit
  retries, test flakes, model-output non-determinism. Modest
  effect sizes (5–15%) may be obscured at N=1. If signal is
  ambiguous after the 4-trial baseline+variant on each rig,
  expand to N=2 on whichever cell is load-bearing.

- **Role-file injection vs brief injection.** This experiment
  modifies the role file (which is loom-bound at session start),
  not the brief content. If the implementer doesn't re-read the
  role file mid-session, late-session behaviors (test runs after
  fixing build errors) may not benefit from the directives. The
  alternative — brief-prepend like X016 strong-prompt — was
  considered and rejected: per-brief prepending pollutes the
  brief surface and doesn't generalize to production deployment.

- **Verbatim spec replay vs reality.** The original implementer
  worked against the live codex with whatever drift happened
  during implementation; our replay against pinned SHA is cleaner
  but may differ. Mitigation: pin to the parent of the first rig
  commit so the implementer sees the exact pre-state.

- **Quality regression hidden.** A variant that "saves cost" by
  skipping useful behaviors (e.g., a test the implementer would
  have run after a refactor) could produce worse code without
  seal failing. Mitigation: Tier 2 manual side-by-side diff
  against baseline's sealed commits.

- **Five-idea co-modification.** Bundling all five into one
  variant means we can't isolate per-idea contribution. If the
  combined variant moves the needle, a follow-on per-idea
  ablation can attribute the savings. If the combined variant
  doesn't move the needle at all, we know none of the five
  individually helps.

## Depends on

- Implement-only trial shape (already exercised by X016)
- `lab.guild-setup` `files:` mechanism (already exercised by X015)
- Reproducible scenario codexes — pre-rig SHAs of
  `rig-moj12h4o` (`0e1e81f4`) and `rig-moji64hs` (`d6e34097`)

## Sequencing

X022 is independent of X018/X019/X020 (planner-side) and X021
(planner-output inventory format). Same parent as X021
(`c-mok4nke6` Apr 29 landscape) but a different category. No
confound risk.

## References

- Parent click: `c-mok4oct1-553c312ebe55` (Category 3)
- Idea-level children:
  - `c-mok4qdw3-f5ed9358d0a2` — #8 Bash bulk edits
  - `c-mok4qebf-4421769b6709` — #9 Targeted Reads after Grep
  - `c-mok4qeqg-f2b9e9485ab2` — #10 Discourage repeat greps
  - `c-mok4qf57-508718c42553` — #11 Narrow test filters first
  - `c-mok4qfjz-7f295fee2a74` — #12 Don't re-test unchanged packages
- Grandparent click: `c-mok4nke6-06b21ff2a765` (Apr 29
  cost-optimization landscape)
- Source rigs: `rig-moj12h4o` (substantive) and `rig-moji64hs`
  (control) in `vibers` guild
- Source plans: `w-moiy8hkv` (substantive) and `w-moji63xm`
  (control)
- Lab Operations: `experiments/lab-operations/running-trials.md`
- Companion experiment: X021 (same parent Category 2, inventory
  format)
