---
status: active
---

# X022 — Implementer Behavior Nudges

**Parent click:** `c-mok4oct1-553c312ebe55` — Category 3 (Implementer
behavior, prompt-level nudges) of the Apr 29 cost-optimization
landscape under `c-mok4nke6-06b21ff2a765`.

> **Migration note (2026-05-08):** All four manifests have been
> migrated from the **xguild** trial doctype to **claude-direct**
> (matches X021's migration; framework v0.1.304). The xguild
> references throughout this spec — particularly "Pipeline
> placement", "Manifest plumbing", and references to
> `running-xguild-trials.md` — are now historical context. The
> intervention design (variants, hypotheses, brief content,
> codex pins) is doctype-agnostic and unchanged.
>
> Per-trial cost expectation under claude-direct: **$18-$28**
> (substantive rig-moj12h4o), **$11-$15** (control rig-moji64hs).
> 4-trial total: **$60-$85**. The original "$30-$60" estimate
> (based on the smoke-trial-derived xguild claim of $0.40-$0.80/trial
> under claude-direct) was an order of magnitude low — see
> [X021 results](../X021-inventory-format/artifacts/results.md)
> for the cost-rate measurement.
>
> **For the operational runbook**, see X021's
> [HANDOFF-claude-direct-migration.md](../X021-inventory-format/HANDOFF-claude-direct-migration.md)
> and X023's [spec.md § Operational breadcrumb](../X023-implementer-strategy-nudges/spec.md#operational-breadcrumb-running-the-trials).
> Both apply directly: post → wait for terminal → extract → analyze.
>
> **For run-to-run variance and hypothesis-power planning**, see
> X021 results.md § Run-to-run variance — measured. With n=1
> per cell as originally specced, X022's design is underpowered
> against effect sizes <20%. **Design upgraded to n=3 per
> variant cell on 2026-05-07** (Sean) to mirror X021's noise-control
> approach. Substantive baseline retained at n=1 (trial 1 already
> ran clean at $39.76); control baseline remains conditional. The
> six new trials are posted as a serialized depends-on chain so
> Spider runs them strictly one at a time.

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

The intervention is shipped by passing the variant role file's
absolute path as the `rolePath` parameter on
`spider.graft-rig-template`'s `laboratory.claude-direct-monolithic`
template (post 2026-05-08 migration). The original design used
`lab.guild-setup`'s `files:` mechanism to copy the role file into
a full test guild; the migrated form is direct and lighter-weight.

The trial shape is **claude-direct** — a single claude session
against a fresh codex checkout, no astrolabe / review / revise /
seal stages. See
[`docs/lab-operations/running-claude-direct-trials.md`](../../docs/lab-operations/running-claude-direct-trials.md)
and X023's spec § Operational breadcrumb for the runbook. The
brief markdown IS the spec; the implementer reads it directly. We use the **PlanDoc `spec` field
verbatim** — the same content the production implementer received
when its session was launched (Astrolabe writes only `plandoc.spec`
into the implementer brief, not the inventory / scope / decisions
/ observations fields). Initial X022 drafts inherited X021's
larger-than-production briefs (full plandoc concatenation,
~2.4× production size); these were trimmed to spec-only on
2026-05-03 (commit `5a7ff5ae`) once the X021 trial-runner
identified the mismatch.

## Terminology note — "substantive" and "control" rigs

These labels are used loosely throughout the spec and runlog:

- **"substantive" rig** (rig-moj12h4o, the Reckoner refactor) is the
  heavyweight rig where the bundle's load-bearing ideas (#10 repeat
  greps, #11 narrow test filters, #12 don't re-test) all fire strongly.
  Primary testbed for H1.
- **"control" rig** (rig-moji64hs, the vision-keeper deletion) is the
  lighter, rename-heavy rig where idea #8 (Bash bulk edits) is the
  dominant mechanism. Cross-check on a different work shape — testbed
  for H2.

**These are not experimental control vs treatment arms.** The actual
within-experiment control is the *baseline role file* (no nudges) vs
*combined-nudges role file* on the same rig, same brief, same codex
pin. Both rigs receive both treatments. The "substantive"/"control"
naming captures workload character (which ideas should fire) rather
than experimental role.

A clearer naming would have been "heavyweight rig"/"foil rig" or
"primary testbed"/"secondary testbed". Calling it out here so the
labels don't mislead anyone reading the results writeup or
follow-on experiments.

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

**Active plan (revised 2026-05-07, Sean):** Six new trials, n=3
per variant cell, interleaved. Substantive baseline retained at
n=1 (trial 1's $39.76); control baseline remains conditional.

| run order | rig | variant | manifest |
|---|---|---|---|
| 2 | rig-moj12h4o (substantive) | combined | `manifests/rig-moj12h4o-combined.yaml` |
| 3 | rig-moji64hs (control) | combined | `manifests/rig-moji64hs-combined.yaml` |
| 4 | rig-moj12h4o (substantive) | combined | `manifests/rig-moj12h4o-combined.yaml` |
| 5 | rig-moji64hs (control) | combined | `manifests/rig-moji64hs-combined.yaml` |
| 6 | rig-moj12h4o (substantive) | combined | `manifests/rig-moj12h4o-combined.yaml` |
| 7 | rig-moji64hs (control) | combined | `manifests/rig-moji64hs-combined.yaml` |

Interleaved (sub, ctrl, sub, ctrl, sub, ctrl) so any host-level
or framework-level drift across the run window distributes
evenly across both cells. Posted as a single depends-on chain
(each trial's writ has a `depends-on` link to its predecessor)
then all published — Spider holds successors in `open` until
each predecessor reaches a terminal state.

**Theoretical full design (12 trials):** n=3 in all four cells
(both rigs × baseline + variant). Not run because trial 1's
substantive baseline is clean and the bottleneck for H1/H2 is
variant-cell signal. If the variant cells hit ambiguous results
the load-bearing fallback is to add 2× substantive baseline
trials (raising sub-baseline to n=3); only spend on control
baseline if variant lands outside production envelope.

**Original n=1 design (4 trials):** **superseded 2026-05-08**. The
n=1-per-cell design was authored before X021's noise-floor
measurement (10% CV). At n=1 the design is underpowered for
hypothesized effect sizes of 5–15%. The 4-manifest set still works
at n=3 — just post each manifest three times.

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

Based on X021's measured per-trial cost on the same workloads
under claude-direct:

- Substantive (rig-moj12h4o): $18–$28/trial
- Control (rig-moji64hs): $11–$15/trial

| plan | trials | total |
|---|---|---|
| **Active** (3 sub-combined + 3 ctrl-combined, interleaved) | 6 | $87–$129 |
| **Already spent** (trial 1, sub-baseline) | 1 | $39.76 |
| **Active + trial 1** | 7 | ~$127–$169 |
| **Theoretical full (n=3 all cells)** | 12 | $174–$260 |

Original n=1 4-trial estimate ($30–$60) is superseded — it was
based on the smoke-trial-derived cost claim that turned out 30×
low in X021. See [X021 results](../X021-inventory-format/artifacts/results.md).

### Manifest plumbing

Identical apparatus across the four manifests (post-migration to
claude-direct, 2026-05-08):

- `frameworkVersion: '0.1.304'`
- Scenario engine `spider.graft-rig-template` with template
  `laboratory.claude-direct-monolithic`
- `model: opus`, `executionWrap: production` (matches the
  EXECUTION_EPILOGUE production's spider implement engine uses)
- `rolePath` points directly at the variant artificer file
  (no `lab.guild-setup` files mechanism — claude-direct loads
  the role file directly)

Per-manifest variations: codex baseSha, briefPath, rolePath
(which artificer file feeds in), and verifyCommand (filtered
build+test on substantive; workspace typecheck on control).

## Risks

- **Run-to-run variance.** X021 measured run-to-run cost CV at
  3–12% (median 9%) on these workloads. The 5–15% per-idea claims
  for X022's nudges are at the edge of detectability against this
  noise floor. **n=3 per cell is the minimum** to distinguish
  modest real effects from noise; even at n=3 the 95% CI is wide
  enough that effects under 15% may be inconclusive. If the
  combined-variant signal at n=3 is borderline (within ±5% of
  baseline), expand to n=5–8 on the load-bearing cell.

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
- Lab Operations: `docs/lab-operations/running-xguild-trials.md`
- Companion experiment: X021 (same parent Category 2, inventory
  format)
