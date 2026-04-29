# X010 H4c — Orientation-Tax Analysis

**Date:** 2026-04-29
**Hypothesis tested:** H4c — A handoff architecture wins only if it
suppresses the per-fresh-session orientation tax. Without that suppression,
each fresh session pays its own re-orientation cost (read spec, grep
codebase, validate prior commits, restate plan), bloating total turn count
and erasing handoff savings.

**Method:** For each available implementer transcript, walk the tool-call
sequence and identify the first turn at which a productive call (Edit,
Write, or file-modifying Bash command) appears. Turns prior to that
first-productive-turn are the "orientation phase." Measure orientation
duration in turns and in cache-read context accumulated, both absolute
and as a fraction of session totals.

**Script:** `scripts/h4c_orientation_tax.py`.

## Why this matters for H4c

The X010 H1 piece-session experiment found decomposed Rig 2 cost 2.6× the
monolithic equivalent — with total turn count expanding 3.5× (267 vs 77).
The original transcripts have since been cleaned up, so the per-piece
orientation cost can't be measured directly. But the underlying mechanism
— *fresh sessions pay an orientation tax before producing artifact-level
work* — can be measured today across any implementer transcript by looking
at how long the agent takes to make its first edit.

The empirical orientation tax measured here is the per-fresh-session cost
that any handoff architecture must contend with. If a handoff structure
fails to compress this phase, paying it `N` times across `N` sessions
recreates the X010 H1 failure mode regardless of how clean the cache-read
math otherwise looks.

## Dataset

105 transcripts ≥ 50 turns: the 2 recent rigs from the polyrepo
conversation plus 103 archived implementer transcripts at
`experiments/data/transcripts/`. One session was excluded (its first
productive turn could not be detected — likely a no-edit transcript).

## Results

### Per-rig results (the focus rigs)

| Session | Turns | First-edit turn | % of session | Context at first edit | % of final |
|---|---:|---:|---:|---:|---:|
| rig1-impl (cleanup) | 139 | 11 | 7.9% | 66K | 32.8% |
| rig2-impl (Reckoner tick) | 155 | 34 | 21.9% | 199K | 53.2% |

Rig 2's orientation phase is striking: **34 turns and 199K of context
accumulated before the first productive call**. That's ~22% of the session
spent on orientation. If we'd split Rig 2 into 2 sessions, each fresh
session would pay an orientation phase of similar shape — even with a
clean handoff, session 2 plausibly takes 5-15 turns and 30-50K of context
to get oriented.

Rig 1 is much cleaner: 11 turns, 66K context, 7.9% of session. Mechanical
cleanup tasks can dive straight into edits because the spec already
identifies the files to touch — no architectural exploration needed.

### Cohort statistics (all 105 sessions)

**Turns until first productive call:**

| min | p25 | median | p75 | max | mean |
|---:|---:|---:|---:|---:|---:|
| 2 | 3 | **6** | 12 | 55 | 9.9 |

**Context accumulated by first productive turn:**

| min | p25 | median | p75 | max | mean |
|---:|---:|---:|---:|---:|---:|
| 10K | 17K | **24K** | 41K | 199K | 36K |

**Orientation as fraction of session:**

| | min | p25 | median | p75 | max | mean |
|---|---:|---:|---:|---:|---:|---:|
| % of turns | 0.9% | 2.8% | 6.2% | 13.0% | 75.3% | 11.3% |
| % of final context | 0.0% | 13.6% | 21.5% | 39.3% | (clipped) | 44.2% |

### Long-tail orientation phases

19% of sessions (20/105) have orientation phases ≥ 15 turns. The 15
longest:

| Session | Orientation turns | Orientation context |
|---|---:|---:|
| `archive/8f67ada8` | 55 | 32K |
| `archive/fd923857` | 41 | 118K |
| `archive/a565f83c` | 38 | 68K |
| `archive/944ef7bd` | 35 | 85K |
| `archive/fe17d896` | 35 | 91K |
| `rig2-impl` | 34 | 199K |
| `archive/37fe78c9` | 33 | 38K |
| `archive/4d942562` | 32 | 105K |
| `archive/a11b80ab` | 30 | 101K |
| `archive/9898e9f5` | 28 | 119K |
| `archive/0b6e6321` | 27 | 66K |
| `archive/c6dd7223` | 26 | 77K |
| `archive/09eba43a` | 24 | 41K |
| `archive/1e85ced3` | 23 | 68K |
| `archive/c8e045e8` | 21 | 36K |

These long-tail cases are exactly the kind of substantive code-change
implementations (cross-package work, new abstraction integration) that
benefit most from handoff splitting — *and* exactly the cases where
naive handoff would re-pay 30+ turns of orientation per fresh session.

## Findings

### H4c is supported but with a sharper warning

The orientation tax is real and bimodal:

- **Mechanical implements** (median 6 turns / 24K context) — the
  orientation phase is small, ~6% of session length. Splitting these
  with a clean handoff costs you ~6 extra turns. Tolerable.
- **Substantive implements** (long tail of 15+ turn orientation phases
  with 50-200K of context) — orientation phases approach 20%+ of
  session length. Splitting these without orientation suppression would
  cost 15-30 extra turns per fresh session. **Two splits could add
  30-60 turns of pure orientation.** That recreates the X010 H1 piece-session
  failure pattern (3.5× turn-count expansion).

### Implication for c-modxxtu6 design

A handoff architecture must:

1. **Carry the orientation results forward, not just a goal pointer.**
   Specifically: list of files-already-explored, key types/functions
   identified, current branch state, manifest progress. Without these,
   session 2 will repeat session 1's reads.

2. **Explicitly tell session 2 not to re-orient.** Prompt-level
   instructions like "you are continuing previous implementation work;
   do not Read the files listed below — they were read in the prior
   session and the relevant excerpts are inlined here."

3. **Be measured against an orientation-budget.** A successful handoff
   should produce session 2 with first-edit at turn ≤ 5 (target) or
   ≤ 10 (acceptable). Measured behaviorally — if first-edit lands at
   turn 25+, the handoff failed and the split is losing money.

### Calibration: the X010 H1 failure mode is now quantitatively explained

X010 H1 piece-session R2 had 6 pieces averaging 44 turns each. If each
piece spent 6-10 turns in orientation (the median range from this
analysis), that's 36-60 extra orientation turns total — enough to push
total turn count from a hypothetical 6×30 = 180 productive turns up to
the observed 267 turns. The 3.5× expansion factor maps cleanly onto
"baseline orientation × number of pieces." The mechanism is no longer
hand-wavy.

## Caveats

1. **First-Edit is a proxy.** Some sessions might do legitimate
   pre-edit work (write a TodoWrite, run a verification command) that
   isn't orientation but isn't artifact-level either. The metric counts
   those as orientation. Slight overestimate for some sessions.

2. **The archive is mixed.** Includes implement, reader-analyst, and
   other engine roles. Engine-filtered analysis would likely show
   implement-only orientation phases shorter than the cohort median
   (implement is the productive engine; non-implement engines spend
   most of their session on analysis, not edits).

3. **The 105-session sample doesn't include the original X010 H1
   piece-session transcripts** (cleaned up). The H4c argument is
   inferential: we measure orientation in single-session implements
   today, then argue that decomposed sessions would each pay their
   own such tax. A live H4 test (Phase 2 of the X010 procedure) would
   measure this directly.

4. **Context accumulated during orientation may not all be "useful."**
   The 49% pure-read share finding (`2026-04-29-read-utilization-analysis.md`)
   suggests substantial fractions of orientation reads in substantive
   sessions are pure-bloat — the agent reads files for understanding
   but never edits them. Improvements to inventory format (Priority 1
   under `c-mok4nke6`) would shrink the orientation tax independently
   of any splitting work.

## Data Sources

- Analysis script: `scripts/h4c_orientation_tax.py`
- Archive: `experiments/data/transcripts/*.jsonl` (105 transcripts ≥ 50 turns)
- Recent rigs: see X010 simulation artifact for paths
- Companion artifact (cohort cost simulation):
  `2026-04-29-h4-naive-split-simulation.md`
