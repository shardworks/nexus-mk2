# Implementation-tail analysis — does idea #18 have a natural break point?

**Date:** 2026-04-30
**Instrument:** `h5_implementation_tail.py`
**Corpus:** 136 implementer sessions (filtered from 659 nexus-draft jsonls in
`/home/vscode/.claude/projects/`); 84 of those passed the activity filter
(≥30 turns AND ≥3 edits). Filter is by first-prompt shape: implementer
sessions begin with `# {Brief Title}\n## Intent` (distinct from reader-analyst,
spec-writer, reviewer, revise, and patron-anima first prompts).

## Question

P3 idea #18 (`c-mok4qhn9`) proposes splitting the implement engine into two
sessions:
- **`implement-core`** — write code, green per-package tests
- **`implement-finalize`** — fix full-suite, update docs

This presupposes a natural phase boundary inside implementer sessions: a
point where edits stop and validation begins. If no such boundary exists,
idea #18 collapses (a fresh session with no work to do).

The instrument measures, per session, where the boundary is — and the
distribution across the corpus tells us whether it's stable enough to
hard-code.

## Methodology

For each implementer-shaped jsonl, walk turns by deduped assistant
message-id. Classify each turn by its tool-call signature:

- **EDIT** — `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, or file-modifying
  Bash (`rm`, `mv`, `cp`, `sed -i`, `tee`, `>` to a filename, etc.)
- **VERIFY** — Bash matching test/typecheck/lint/build patterns
  (`pnpm test`, `pnpm typecheck`, `vitest`, `tsc`, etc.) and not also matching MODIFY
- **READ** — only `Read`/`Grep`/`Glob`
- **MIXED** — both EDIT and VERIFY signals
- **OTHER** — anything else (git, ls, cat, grep with redirection, etc.)

Per session compute: `last_edit_turn`, `tail_len = total - last_edit`,
`tail_frac`, edit-density per decile, decline-from-peak decile, tail
composition (verify / read / other).

Note: an early bug (BASH_MODIFY misclassifying `2>&1` as a redirection-
to-filename) suppressed all in-session verify Bash detection. The
tightened pattern requires the `>` target to look like a path
(`[a-zA-Z./_~]`-anchored), which excludes fd-redirection like `>&1`.

## Results

### Headline numbers (84 sessions)

| metric | min | p25 | median | p75 | max | mean |
|---|---:|---:|---:|---:|---:|---:|
| last-edit turn | 23 | 69 | 93 | 126 | 286 | 105.8 |
| last-edit % of session | 48% | 82% | **88%** | 93% | 100% | 85% |
| tail length (turns) | 1 | 9 | **14** | 20 | 58 | 15.8 |
| tail fraction | 0.4% | 7% | **12%** | 18% | 52% | 15% |
| in-session verify Bashes | 0 | 5 | **8** | 12 | 50 | 9.7 |
| decline-from-peak decile | 3 | 5 | **7** | 9 | 10 | 7.0 |

### Edit-density per decile (corpus-wide average)

| decile | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| edit % | 1% | 7% | 9% | 15% | 20% | 20% | 18% | 18% | 14% | 6% |

A clear bell shape: orientation tax in deciles 1-3, peak in deciles 5-6,
decline through deciles 9-10. The decline_decile metric (first decile after
the peak whose density is ≤50% of peak) has a median of 7 — by decile 7,
editing has dropped to half its peak rate.

### Tail composition (post-last-edit turns, corpus-wide aggregate)

Of **1329 tail turns** across all 84 sessions:

| category | turns | % of tail |
|---|---:|---:|
| OTHER (git/ls/cat/grep/cleanup) | 1080 | **81.3%** |
| VERIFY-only (test/typecheck/lint runs) | 174 | 13.1% |
| READ-only | 75 | 5.6% |

The post-last-edit phase is dominated by bookkeeping, not validation.

### Tail-fraction distribution

| tail fraction | sessions |
|---|---:|
| 0–5% | 11 |
| 5–10% | 26 |
| 10–20% | 29 |
| 20–30% | 6 |
| 30–50% | 11 |
| ≥50% | 1 |

68/84 sessions (81%) have a tail under 20%. The bulk is concentrated in
5-20%.

## Interpretation

### The "validation phase" is not where we expected

Verify Bashes (median 8 per session) are **spread throughout** the implement
session, not batched at the end. The interleaved pattern is the standard
edit-test-edit-test loop. There is no separate validation phase to fork off
into a fresh session.

### The post-last-edit "tail" is real but is wrap-up, not finalize

Median 14 turns / 12% of session occur after the last edit. But 81% of
those turns are OTHER — git status, git commit, ls output, grep'ing for
residual references, final cleanup. Only 13% are verify-only test runs.

### Edit density does decline near the end

Edit density drops from a 20% peak in deciles 5-6 to 6% in decile 10 — a
3.3× decline. By decile 7 (median), the rate has halved. So there is an
"implementation is winding down" signal in the data.

But it's gradual, not a phase transition. There's no point where the agent
clearly stops editing and switches modes.

## Implications for P3

### Idea #18 (`implement-core` + `implement-finalize` 2-split): **doesn't fit the data.**

The premise was that a finalize session could pick up "fix full-suite +
update docs" as discrete post-implementation work. The data shows:

- Tests are run throughout, not deferred to the end
- The "tail" is overwhelmingly bookkeeping — work that the original
  session already finished, not work waiting to be picked up
- A fresh finalize session would have nothing meaningful to do

Splitting at last-edit would save ~12% of session cost (the bookkeeping
phase) at the price of one full handoff orientation tax (median ~6 turns,
~24K context per X010 H4c). The handoff cost likely exceeds the savings.

### Idea #15 (`c-modxxtu6` checkpoint-and-fresh-session): **still viable.**

This idea doesn't depend on a clean phase boundary — it splits at a
turn/cost midpoint regardless of phase. The X010 H4 simulation finding
(33% median savings at midpoint splits with 30K handoff) stands.

The savings come from cache-read accumulation, not from forking off a
distinct phase of work. The fresh post-handoff session continues
edit-test-edit-test from where the prior session left off, just with a
smaller cumulative-cache cost.

### Idea #18 should be merged into idea #15 or dropped

The 2-split-at-phase-boundary framing is wrong. The right cut is
2-split-at-cost-midpoint, which is just idea #15's smallest variant. P3
should pursue the midpoint-split mechanism rather than searching for a
phase boundary that doesn't exist.

## Caveats

- **Filter precision.** "Implementer-shaped" is heuristic — first-prompt
  shape only. Some non-implement sessions might match (if a Coco session
  starts with `# {Title}\n## Intent`). Spot-checks suggest this is rare.
- **Activity filter.** Drops sessions with <30 turns or <3 edits. This
  removes early-fail cases (the implementer crashed or punted), which
  is appropriate for studying typical-path behavior.
- **Tool classification.** OTHER is a catch-all for Bash that doesn't
  match modify/verify patterns. Some OTHER turns are productive
  (e.g., commits, formatting, codemod scripts). For this question, the
  EDIT/non-EDIT split is what matters; refining OTHER wouldn't change
  the conclusion.
- **Sample size.** 84 sessions is enough to characterize the shape but
  not enough to slice by commission complexity, model, or rig template.
  Future runs could segment.

## Files

- `scripts/h5_implementation_tail.py` — instrument
- This findings doc — `2026-04-30-implementation-tail-analysis.md`
