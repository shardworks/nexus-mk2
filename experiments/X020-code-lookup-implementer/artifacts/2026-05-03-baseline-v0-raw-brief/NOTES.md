# X020 baseline — v0 (raw-brief variant, superseded)

## Status: superseded

The brief shipped to the implementer in this trial was the raw
`writ.body` from `w-mojnftby` rather than the planner-elaborated
spec from the plandoc. The implement-only trial shape skips the
planning pipeline, so the implementer received `writ.body +
EXECUTION_EPILOGUE` directly. In production (plan-and-ship), the
implementer receives the spec-writer's elaborated spec passed as
`prompt`, which carries an explicit `<task-manifest>` tied to
verify/done criteria.

The cost differential vs the real-world reference reflects this
gap, not the apparatus:

| | Real (`ses-mok2say8`) | v0 (`ses-mopuhv5s`) | Δ |
|---|---|---|---|
| Implementer cost | $16.15 | $10.94 | **−32.3%** |
| Implementer duration | 33.8 min | 23.1 min | −31.6% |
| Files changed | 22 / 9 packages | 16 / 4 packages | −6 / −5 packages |
| Insertions | 770 | 710 | −60 |

### Diff coverage gap

Both runs landed the substrate primitive (`StacksApi.dropBook`,
`StacksBackend.dropBook`, `BookDeleteEvent` CDC variant, tier1+
tier2 conformance). The v0 run **omitted**:

- `cartograph.start()` invocations of `dropBook` for the three
  retired companion books (the brief's stated concrete payoff).
- `tier4-edge-cases.ts` conformance entries.
- `docs/architecture/apparatus/stacks.md` and
  `docs/architecture/index.md` updates to the "additive only"
  invariant.
- `clockworks-stacks-signals.test.ts` and `cartograph.test.ts`
  (the two integration test files the real session added).

The plandoc spec's `<task-manifest>` makes these explicit (t7
cartograph retro-cleanup, t6 tier-4 entries, t8 spec docs) — the
real implementer worked task-by-task; the v0 implementer
interpreted the brief literally as "ship the substrate."

## Apparatus check (still valid)

- ✅ Build/test passed cleanly. Sealed commit `a2931c6e` (fast-forward,
  0 retries, 1 inscription).
- ✅ Reviewer + revise pass ran without escalation.
- ✅ Conformance suite green on both backends for what was
  implemented.
- ✅ All four laboratory phases (setup → scenario → probes →
  archive → teardown) completed.

## Why kept

This is the only N=1 data point we have on "implement-only +
raw-brief" at this codex SHA. The cost differential quantifies the
elaborated-spec → raw-brief shift at -32% / -10.7 min, useful as a
side measurement (echoes X016's territory). Not load-bearing for
X020 H1, which uses the planner-elaborated brief and therefore
will produce numbers comparable to the real-world reference.

## Files

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — auto-generated trial-extract overview (probe
  summaries, manifest snapshot).
- `stacks-export/` — full books_* dumps from the lab guild
  (animator-sessions, transcripts, writs, rigs, events).
- `codex-history/` — patch + manifest of the sealed commit.
