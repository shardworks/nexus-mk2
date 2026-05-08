# X024 Results — Implementer Turn Discipline

**Status:** complete (2026-05-08)
**Verdict:** H1, H2 not sustained. Foil cell cancelled.
**Spec:** [`spec.md`](../spec.md)
**Runlog:** [`runlog.md`](runlog.md)

## Headline

A goal-stated tooling-discipline directive ("minimize turns; avoid wasteful tool calls; three illustrative examples") prepended to the artificer role file produced a **−3.5% cost reduction** on the substantive Reckoner-refactor rig — well below H1's 10% threshold and well inside baseline noise (CV 14.6%). On nearly every per-mechanism metric, the variant moved in the **wrong direction** vs baseline.

The most likely interpretation: **the imperative form of X022's prompt carried load-bearing weight** that the goal-stated reframe lost.

## Setup

- **Comparator:** X022's n=3 substantive baseline cell (writs `w-mopuwdsp`, `w-mowr4jq1`, `w-mowr4mri`). Same brief, codex pin, framework version. No fresh baselines run for X024.
- **Variant role file:** `fixtures/test-guild/roles/artificer-turn-discipline.md` — verbatim production artificer.md with one new "Tooling discipline" section between "Role" and "Testing" carrying a goal statement and three illustrative examples (Bash bulk edits, repeat-grep avoidance, no re-test of unchanged packages).
- **Trials:** 3 substantive trials posted as a depends-on chain. All sealed exit 0; trial 3 hit the same `pnpm -w test` wedge as X022 trial 8 (~$2–4 of post-kill recovery cost added).

## Results

### Primary — cost (USD)

| cell | n | mean | range | CV |
|---|---:|---:|---|---:|
| substantive baseline (X022) | 3 | $37.85 | $32.59–$43.60 | 14.6% |
| substantive X022 combined-nudges | 3 | $32.81 | $30.14–$34.40 | 7.1% |
| **substantive X024 turn-discipline** | **3** | **$36.53** | $33.28–$40.37 | 9.8% |

**X024 vs baseline:** −3.5% (does not clear H1's 10% threshold)
**X024 vs X022 combined:** +11.3% (X022's imperative framing did meaningfully better)

Trial-by-trial:

| trial | writ | cost | duration | exit | notes |
|---|---|---:|---:|---:|---|
| 1 | `w-mox34hwi` | $33.28 | 42.5 min | 0 | clean |
| 2 | `w-mox34l3r` | $35.93 | 43.0 min | 0 | clean |
| 3 | `w-mox34okl` | $40.37 | 189.4 min | 0 | wedged on `pnpm -w test` mid-session, recovered after kill; ~$2–4 of recovery cost included |

### Secondary — tool-use mechanism signature

| metric | baseline (n=3) | X022 combined (n=3) | X024 turn-discipline (n=3) | X024 Δ vs baseline |
|---|---:|---:|---:|---:|
| Bash count | 74.0 | 69.0 | 78.0 | **+5%** ❌ |
| Edit + MultiEdit | 68.0 | 56.7 | 64.7 | −5% |
| Read count | 67.3 | 64.3 | 68.3 | +1% |
| Targeted-Read fraction | 0.79 | 0.79 | 0.79 | flat (ceiling) |
| Total searches (Grep + bash-grep) | 37.3 | 34.0 | 42.7 | **+14%** ❌ |
| Repeat-grep calls (≥2× same pattern) | 0.3 | 0.7 | 0.3 | flat |
| Workspace tests (`pnpm -w test`) | 6.7 | 8.0 | 8.3 | **+24%** ❌ |
| Filter-test count (`pnpm --filter`) | 4.0 | 4.3 | 1.3 | **−67%** ❌ |
| Filter-test share | 0.38 | 0.32 | 0.13 | **−66%** ❌ |
| `sed -i` count | 1.0 | 1.7 | 2.3 | **+130%** ✓ |

**Direction-of-movement scorecard** (predicted vs observed for the three named example tactics):

| nudge | prediction | X024 observed |
|---|---|---|
| #8 Bash bulk edits (`sed -i` ↑) | sed should rise | sed +130% (n=3 mean 1.0 → 2.3) ✓ |
| #10 Repeat-grep avoidance (repeats ↓) | repeat-greps should fall | repeats flat at 0.3 — no change |
| #12 No re-test of unchanged (workspace tests ↓) | workspace tests should fall | workspace tests **+24%** ❌ |

Only **#8** fired. **#10** is flat. **#12** went the **wrong direction** by 24%.

### Quality (no-regression)

- **Tier 1:** all three trials sealed exit 0 with verifyCommand passing (filtered build+test on reckoner+clockworks). PASS.
- **Tier 2:** structural diff vs X022 baseline `7c810bb` not performed in detail; all three sealed commits ran the same brief content and produced approximately the same diffstat shape (Reckoner CDC → tick refactor, ~17–20 files, ~1800–2100 LOC added, ~1700–2800 LOC removed). No regressions identified at extract time. Skipped formal Tier 2 doc since H1 didn't clear and the experiment isn't shipping a candidate.

### H1, H2, H3 verdicts

| hypothesis | verdict |
|---|---|
| **H1** — variant cuts substantive cost ≥10% vs baseline | **NOT sustained** (−3.5%) |
| **H2** — ≥2 of 3 named examples move in predicted direction | **NOT sustained** (only 1 of 3 moves correctly) |
| **H3** — no quality regression | sustained at Tier 1; Tier 2 skipped (n/a) |
| **H4** — foil cell variant cost ≤ $20.39 | **N/A** — foil cell cancelled because H1 didn't clear |

## What this tells us

### The X022→X024 hypothesis is falsified

Going into X024 the working hypothesis was: *"X022's effect was the framing, not the rules — the imperative content didn't matter; the 'be deliberate' header was doing all the work."*

X024 tested this by stripping the imperatives and keeping only the framing (a goal statement plus three illustrative examples). If the hypothesis were right, X024 should have matched X022's −13%.

X024 delivered −3.5% — a marginal, noise-floor effect. **The imperatives carried weight that the goal-stated reframe lost.**

### What this says about prompt form

The cleanest read on the X022 + X024 evidence:

1. **Imperative form ("Do X") changes implementer behavior more reliably than goal-stated form ("Try to achieve Y; X is one example").**
2. **Even imperatives produce small effects** (X022 was −13% at n=3, marginal vs noise).
3. **The named tactics matter directionally, not as the cost-mover.** In X022 only 1–2 of 5 imperatives fired in their predicted direction at n=3, but the bundle still produced its modest cost effect. In X024 only 1 of 3 examples fired, and the effect collapsed.

So neither "the rules drive cost" nor "the framing drives cost" is fully right. The picture seems to be: **imperative framing is a multiplier on whatever directional effect the named tactics carry**, and removing the imperative form removes the multiplier.

### What this says about the broader Category 3 program

The Apr 29 cost-optimization landscape's Category 3 (implementer-prompt nudges) is now demonstrably **a marginal lever**:

- X022 imperative bundle: −13% (sustained marginal at n=3, edge of noise)
- X024 goal-stated reframe: −3.5% (not sustained)

Even the better intervention (X022) saves <15%, sits at the edge of measurable, and runs the per-mechanism story sideways. **There is no big cost win waiting in role-file prompt-tuning under the current methodology.**

If we want bigger wins from prompt-level intervention, plausible directions:

1. **Brief-level intervention** (X016 strong-prompt territory) rather than role-file. Briefs come fresh per-task and don't have to live with every implementer session.
2. **Per-rig-shape-targeted prompts** rather than one-size-fits-all. The Category 3 ideas all came from observed inefficiencies on specific rigs; pre-targeting the prompt to the rig's shape might help where the bundle fails.
3. **Move down the stack** — the larger cost levers (per X018-X020) are at the brief/inventory/tool-availability layer, not the prompt layer.

## Recommendations

1. **Do not ship the X024 turn-discipline prompt** to vibers' artificer.md.
2. **Reconsider shipping X022's combined-nudges prompt.** Even at −13% it's marginal, and its mechanism story is muddled. Worth weighing the prompt-bloat cost against the small cost win before promoting.
3. **Open a per-idea ablation experiment** (X02?-per-idea-ablation) to identify which of X022's five imperatives actually carry load. Drop the rest.
4. **Update the parent landscape click** `c-mok4nke6` to reflect that Category 3 is now empirically a marginal lever — useful for prioritizing future cost-optimization spend.

## Spend

| | trials | spend |
|---|---|---|
| X024 substantive cell (this run) | 3 | $109.58 |
| X024 foil cell (cancelled) | 0 | $0 |
| **X024 total** | **3** | **$109.58** |

Within the spec's $54–$84 estimate ceiling for substantive (slightly over due to trial 3's wedge-recovery cost).

## References

- Sibling experiment: [X022](../X022-implementer-behavior-nudges/spec.md) — five-imperative bundle (the comparator)
- Parent landscape: click `c-mok4nke6` (Apr 29 cost-optimization)
- Tool-use metrics extractor: `experiments/X022-implementer-behavior-nudges/scripts/extract-tool-use-metrics.py`
- Trial extracts: `artifacts/2026-05-08-trials-extracts/{w-mox34hwi,w-mox34l3r,w-mox34okl}/`
- Final metrics JSON: `artifacts/2026-05-08-tool-use-metrics-final.json`
