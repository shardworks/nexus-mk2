# X024 Runlog

Live tracking for the X024 implementer-turn-discipline trial sequence.
Coco appends to this as trials land.

**Click:** TBD (will be opened on first follow-up).
**Spec:** [`spec.md`](../spec.md).

## Trial sequence

n=3 substantive cell on rig-moj12h4o. Posted as a depends-on chain
2026-05-08 15:43 UTC, then published. Spider serializes via the
depends-on link kind. Compares against X022's n=3 substantive
baseline ($37.85 mean, range $32.59–$43.60).

Foil cell (rig-moji64hs) is conditional — posted only if substantive
cell clears H1 (-10% vs $37.85).

| run | manifest | rig | role file | trial writ | depends-on | status | cost | duration | notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `rig-moj12h4o-turn-discipline.yaml` | substantive | turn-discipline | `w-mox34hwi` | — (head) | **completed** | $33.28 | 42.5 min | clean run, exit 0, sealed |
| 2 | `rig-moj12h4o-turn-discipline.yaml` | substantive | turn-discipline | `w-mox34l3r` | `w-mox34hwi` | **completed** | $35.93 | 43.0 min | clean run, exit 0, sealed |
| 3 | `rig-moj12h4o-turn-discipline.yaml` | substantive | turn-discipline | `w-mox34okl` | `w-mox34l3r` | **completed** | $40.37 | 189.4 min | wedged on `pnpm -w test` mid-session; Coco killed bash tree, claude recovered, sealed exit 0. ~$2-4 of recovery cost included. Same wedge pattern as X022 trial 8 / click `c-moizriyk`. |
| F1-F3 | `rig-moji64hs-turn-discipline.yaml` | foil | turn-discipline | — | — | **cancelled** | — | — | Foil cell cancelled 2026-05-08 — substantive cell did not clear H1, no basis to spend on foil replication. |

## Final cell summary

| cell | n | mean | range | CV |
|---|---:|---:|---|---:|
| substantive baseline (X022 reuse) | 3 | $37.85 | $32.59-$43.60 | 14.6% |
| substantive X022 combined-nudges | 3 | $32.81 | $30.14-$34.40 | 7.1% |
| **substantive X024 turn-discipline** | **3** | **$36.53** | $33.28-$40.37 | 9.8% |

**X024 vs baseline:** -3.5% (does not clear H1's 10% threshold)
**X024 vs X022 combined:** +11.3% (X022's imperative framing did meaningfully better)

## Hypothesis verdicts

| | hypothesis | verdict |
|---|---|---|
| H1 | variant cuts substantive cost ≥10% vs baseline | **NOT sustained** (-3.5%) |
| H2 | ≥2 of 3 named examples move in predicted direction | **NOT sustained** (only 1 of 3) |
| H3 | no quality regression | sustained at Tier 1 |
| H4 | foil cell variant cost ≤ $20.39 | **N/A** — foil cell cancelled |

See [`results.md`](results.md) for full writeup.

## Comparator (X022 substantive baseline, n=3)

| trial | writ | cost | duration |
|---|---|---:|---:|
| X022 trial 1 (xguild) | `w-mopuwdsp` | $37.35 (impl-only) | 42.3 min |
| X022 trial 8 (claude-direct) | `w-mowr4jq1` | $43.60 | 47 min real (+ 115 min wedge) |
| X022 trial 9 (claude-direct) | `w-mowr4mri` | $32.59 | 40.5 min |
| **mean** | | **$37.85** | |
| **CV** | | 14.6% | |

## Hypothesis status

- **H1** — Goal-stated turn-discipline cuts substantive cost ≥10% vs X022 baseline.
  - **Status:** unresolved. Needs all 3 trials.
- **H2** — Cleaner per-mechanism signature than X022's variant: ≥2 of 3 examples
  (Bash bulk +sed-i, repeat-grep avoidance, no re-test of unchanged) move in
  predicted direction.
  - **Status:** unresolved. Tool-use metrics extracted post-trial.
- **H3** — No quality regression vs X022 baseline (Tier 1 verifyCommand exit 0
  + Tier 2 manual diff vs `7c810bb`).
  - **Status:** unresolved.
- **H4** — Foil cell variant cost ≤ $20.39 production full-rig.
  - **Status:** conditional — only run if H1 clears.

## Cost ceiling

| | trials | spend |
|---|---|---|
| Estimated (n=3 substantive) | 3 | $54–$84 |
| Estimated (n=3 foil, conditional) | 3 | $33–$45 |
| **Total estimated (both cells if foil runs)** | **6** | **$87–$129** |
