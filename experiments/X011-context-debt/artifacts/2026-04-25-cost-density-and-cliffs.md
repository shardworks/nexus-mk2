# Cost Density, Cliffs, and Blast-Radius — April 25, 2026

Follow-on analysis to [`2026-04-25-implement-cost-analysis.md`](2026-04-25-implement-cost-analysis.md). The earlier artifact identified the Apr-16 step-change and ranked candidate interventions; this artifact adds three deeper measurements that change the intervention picture:

1. **Per-package cost density** — where in the codebase is implement cost being paid?
2. **Cost cliffs by file count** — where do sessions get expensive?
3. **Manifest blast-radius accuracy** — how well does the planner predict actual file footprint?

Together they identify the **predicted-files gate** as the strongest single dispatchable lever, plus structural simplification candidates (animator density, spider volume) for longer-term work.

---

## Data Sources

All analyses join three substrates:

- **Animator sessions book** (`books_animator_sessions` in stacks) — pulled all completed sessions where `metadata.engineId = 'implement'` and `startedAt > 2026-04-16`. Yields cost, token usage, duration per session.
- **Astrolabe plans book** (`books_astrolabe_plans`) — joined on session's `metadata.writId` to recover the spec body the implementer consumed (the post-planning expansion, not the original brief).
- **Framework git history** (`/workspace/nexus`) — joined by author email pattern `<writ-id>@nexus.local` (the implement engine sets this on every commit it authors), recovering the seal-commit file lists and per-file LOC churn.

Sample size varies by analysis: n=86 sessions joined to specs (some without commits), n=74 with both spec and seal commits, n=60 with manifest `<files>` data and seal commits (some specs use the manifest; some don't).

---

## Per-Package Cost Density

For each session, attributed total session cost across packages by churn-share (each package's share of LOC added+deleted). Aggregated across all 74 sessions:

```
package         sess   attr_$    churn   $/LOC    $/session
spider            25  $138.49   13,465   $0.010   $5.54
clerk             19  $100.06    9,649   $0.010   $5.27
astrolabe         21  $ 92.76    8,000   $0.012   $4.42
animator           4  $ 53.54    3,003   $0.018   $13.39
ratchet           12  $ 43.17    6,729   $0.006   $3.60
_docs             43  $ 35.30    3,224   $0.011   $0.82
clockworks         5  $ 26.34    5,117   $0.005   $5.27
claude-code        2  $ 17.75      953   $0.019   $8.88
clockworks-retry   3  $ 16.77    1,692   $0.010   $5.59
reckoner           3  $ 13.58    2,835   $0.005   $4.53
lattice            2  $  8.44    2,126   $0.004   $4.22
```

Three distinct patterns:

### Volume hotspots — spider, clerk, astrolabe

Touched in 25–34% of all implement sessions. Per-LOC cost is *average* (≈$0.010). The reason they dominate aggregate cost is sheer frequency: nearly every commission touches at least one of dispatch (spider), the canonical books (clerk), or the planning pipeline (astrolabe). The lever for these is **decomposition** — reducing how often the universal substrate is read in full. Splitting them doesn't make individual touches cheaper; it makes most commissions touch a smaller piece of substrate.

### Density hotspots — animator, claude-code

Animator: 4 sessions, $13.39/session attributed cost, $0.018/LOC — 1.8× the typical rate. Claude-code is even higher at $0.019/LOC (n=2; small sample). These are the packages where touching them is *intrinsically* expensive. Probable causes (un-investigated): deep type relationships (session lifecycle state machines), subprocess plumbing, transcript I/O CDC chains. The lever for these is **direct refactoring** — every commission that subsequently touches them pays less per-LOC.

A focused-session view (filtering to sessions with >50% of churn in a single package) confirms the signal:

```
package           sess   avg_$    median_LOC   $/LOC
animator             3   $28.43      1,606     $0.0178
spider              11   $10.35        895     $0.0093
clerk               13   $ 8.77        481     $0.0105
astrolabe           14   $ 6.57        317     $0.0114
ratchet             10   $ 4.46        470     $0.0063
clockworks           5   $ 5.87      1,046     $0.0050
```

Three animator-focused sessions averaged **$28.43 each** — the most expensive package-focused work in the dataset. Even at small n, the gap to spider-focused ($10.35) is striking.

### Cheap packages — ratchet, clockworks, lattice, reckoner

$0.004–0.006/LOC, half the rate of the substrate plugins. These are newer, smaller, and more isolated. Whatever they're doing right (cleaner abstractions, less cross-package coupling, more localized concerns) is something the older substrate plugins have lost. Worth understanding *why* — the patterns transferred to the substrate plugins would be high-leverage.

---

## Cost Cliffs by File Count

Bucketed sessions by number of files touched (from seal commits) and by predicted file count (from manifest `<files>` extraction):

### Actual files

```
range   n   avg_cost   median   $/added-file (chord)
1       7    $1.07      $0.57    -
2       7    $2.13      $1.07    +$1.06
3-4     9    $2.65      $2.04    +$0.26
5-6    12    $4.69      $5.32    +$1.02
7-9    11    $7.63      $7.07    +$0.98
10-14  17    $8.08      $7.88    +$0.07     ← plateau
15-19   3    $8.64      $9.39    +$0.11     ← plateau holds
20+     8   $27.21     $27.63    +$3.71/file ← cliff (3.2× jump)
```

**Cliff at ~20 actual files.** Below 20, cost ramps linearly through 1–9 files (~$1/file), plateaus at $7–9 from 10–19. At ≥20 files, the mean more than triples to $27.

8 of 74 sessions (11%) sit above this cliff. They account for **~$217 of $568 total post-Apr-16 implement cost** — 38% of all cost concentrated in 11% of sessions.

### Predicted files

```
range   n   avg_cost   median
1       5    $0.86      $0.49
2       2    $1.76      $2.46
3-4    12    $3.00      $3.45
5-6    11    $4.30      $4.48
7-9    15    $9.35      $7.88     ← step up
10-14   9   $14.80     $11.21
15-19   3   $29.63     $35.64     ← cliff
20+     2   $19.63     $21.80     (n=2; unreliable)
```

**Cliff at ~15 predicted files.** Below 15, sessions cluster $1–15. At 15–19, mean jumps to $30 with median $36. The 15-pred / 20-actual gap fits the prediction-accuracy data (planner is ~75%-of-actual on the high end).

### Why this matters

Files-touched is also the **single strongest cost predictor measured** in the dataset:

| Predictor | vs cost (Pearson) |
|---|---:|
| Files touched | **+0.81** |
| Spec chars | +0.74 |
| Churn (LOC added+deleted) | +0.73 |
| Output tokens | +0.65 (correlation by definition w/ cost) |
| Task count | +0.53 |

Files-touched beats spec_chars, beats task count, beats churn. Combined with the cliff shape — most expensive sessions are above the threshold, most cheap sessions are well below, very few sit in the danger zone — this supports a **hard threshold gate** rather than a continuous incentive.

---

## Manifest Blast-Radius Accuracy

For 60 sessions with both manifest `<files>` data and seal commits, compared the predicted file set to the actual seal-commit file list.

```
ratio = actual_files / predicted_files
  min       0.33×
  p25       1.00×
  median    1.00×
  p75       1.27×
  max       2.67×

  optimistic (actual >1.5× predicted):  12% (7/59)
  accurate (within 1.5× either way):    76% (45/59)
  pessimistic (actual <0.67× predicted):12% (7/59)
```

**Median = 1.00× (perfect).** 76% within 1.5× either way. The 12% optimistic tail is where the gate has its hardest case — those sessions ended up touching 20+ files when the planner predicted 9–17.

Package-level accuracy is even tighter:

```
total predicted package-touches: 119
total actual package-touches:    129
correctly predicted (TP):        113
predicted but didn't happen (FP):  6
actual but unpredicted (FN):      16
precision = 95%
recall    = 88%
```

The sage correctly names which packages will be touched 88% of the time, almost never names a package that doesn't end up touched.

Per-package recall (how often each package, when actually touched, was also predicted):

```
package          actual  predicted  recall
_docs               34         31    91%
spider              20         17    85%
clerk               17         16    94%
astrolabe           15         14    93%
ratchet              9          9   100%
clockworks           5          5   100%
animator             4          4   100%
framework/cli        4          2    50%
framework/core       3          2    67%
```

The misses concentrate in framework-level packages (cli, core) — likely cross-cutting concerns that get touched as side effects of substrate work and aren't named explicitly in task manifests.

---

## Intervention Implications

Updated ranking for the interventions umbrella (`c-modxx4nj`):

### 1. Predicted-files gate at planning (NEW; click `c-moe0l7bl`)

Concrete implementation: at the sage-writer or `spec-publish` stage, regex-extract distinct paths from the manifest's `<files>` elements. If the count exceeds a threshold (start at 15), halt the planning pipeline and emit a gap report asking the patron to decompose the brief. Mechanism is direct (every distinct file the implementer reads lands in cached context, files-touched is the strongest single cost predictor) and enforcement is trivial (regex over manifest XML).

A 15-pred bound would catch ~75% of the 20+-actual sessions. The remaining ~25% slip through with predicted 10–14 that ended up actual 20+ — those would benefit from a **runtime check inside the implement engine** (if actual files-touched grows past N, halt and ask), but that's a follow-on if the planning gate alone isn't enough.

**Estimated impact:** the 8 sessions above the cliff in this dataset accounted for $217 of $568 total cost (38%). A gate that prevented those from running as single commissions — instead splitting them into 2–3 smaller ones each — would not eliminate that work but would distribute it across cheaper sessions. Best case savings ≈ 25–35% of total implement cost; worst case (poor decomposition by patron) ≈ flat or negative.

### 2. Task-count cap at 6 (existing `c-modxxyfz`)

Coarser proxy for the same mechanism. Tasks correlate with files (each adds ~2–3k chars and a few files), and the cliff in the task-count distribution (cost mean $6.74 at 6 tasks → $17.68 at 7 tasks) maps cleanly to the predicted-files cliff. Operationally simpler than the predicted-files gate (count integers, not regex-extract paths), but less precise — a 6-task spec can still touch 20 files if the action descriptions are broad.

### 3. Animator simplification (NEW; click `c-moe0m38e`)

Top per-LOC density in the dataset. Halving its cost-per-LOC to the average rate would save ~$0.018/LOC → $0.010/LOC across animator-touching sessions. Not the biggest dollar lever (small footprint), but the highest-leverage simplification target by complexity-density. Worth a 1–2-hour read of `packages/plugins/animator/src/` to identify whether the cost is in the state machine, the subprocess plumbing, or the transcript I/O.

### 4. Spider decomposition (NEW; click `c-moe0m87q`)

Volume hotspot: 34% of sessions touch spider. Per-LOC is average but aggregate is largest ($138 attributed). Splitting spider into spider-core / spider-rigs / spider-state would reduce blast radius for most substrate work — a commission affecting rig templates wouldn't need to read the dispatch loop. Lower priority than animator (structural surgery vs targeted refactor) but high aggregate potential.

### Refuted / dropped from the umbrella

- **Package-scoped verify commands** — refuted (`c-modz11rc`); per-verify output volume is unchanged and negligible relative to context.
- **End-only verify** and **cheap-per-task verify** — dropped (`c-modyuqe4`, `c-modyuune`); verify cadence is not the cost lever.
- **Checkpoint and fresh sessions** — refuted by X010 H1 (orientation tax outweighs cache-compounding savings at our spec scales).

---

## Caveats and Limitations

1. **Sample size.** n=74 for the cost/files analysis, n=60 for blast-radius accuracy. Adequate for the macro-shapes (cliffs, hotspot identification) but specific per-package density numbers (especially animator at n=4 and claude-code at n=2) should be treated as suggestive, not conclusive.

2. **Cost attribution model.** Per-package costs are attributed proportional to churn-share. A package with 10% of a session's churn gets 10% of the cost. This is a reasonable model when churn ≈ work, but a session that did substantial *reading* in a package without changing it gets no attribution. Per-package attribution would be tighter if we counted reads as well as writes, but transcript-level read tracking is not in the current data.

3. **Selection bias on which sessions have manifests.** 71 of 86 implement sessions have parseable manifests. The 15 without are concentrated in either pre-planning-pipeline-was-stable Apr-16/17 (when the manifest format was still being adjusted) or directly-posted mandates (which sometimes don't carry manifests). Excluding them doesn't bias the cliff finding (the manifest-less sessions cluster in the cheap end), but the population picture may shift slightly.

4. **Files-as-cost-predictor depends on session shape.** The 0.81 Pearson is for sessions that completed normally and produced commits. Failed sessions, retries, and rate-limited sessions are excluded. The lever's effectiveness at preventing cost from accruing in those failure modes is untested.

5. **The gate's downstream effect is unmeasured.** We can predict that gating at 15 pred files would have prevented the high-cost sessions from running as single commissions. Whether the patron would then decompose them well — into 2–3 commissions whose total cost beats the original — is a hypothesis, not a measurement. A short A/B test (gate enabled vs disabled, observe total cost over a week) would be the natural validation.

---

## Companion Artifacts

- [`2026-04-25-implement-cost-analysis.md`](2026-04-25-implement-cost-analysis.md) — the original Apr-25 cost analysis identifying the Apr-16 step-change and the proximate cause (task manifest commit `920e65ca`).
- [`2026-04-25-cost-investigation-retro.md`](2026-04-25-cost-investigation-retro.md) — retrospective on the investigation arc, including the wrong turns this work refined.
