# The Implement-Engine Cost Investigation

**April 25, 2026 — case study and retrospective.**

A two-week period in April 2026 saw the average cost of a single autonomous code-implementation session rise from $0.65 to $8.56 — a 13× jump. This document is the retrospective on the investigation that diagnosed the shift, evaluated interventions, and identified the structural levers we ended up with. It's written as a narrative because the wrong turns mattered as much as the right answers.

## Setting

Nexus Mk 2.1 is a multi-agent system that decomposes and executes software work autonomously. A "commission" — a work item posted by the patron (the human user) — flows through a pipeline: a planner agent reads the codebase and produces a structured spec, then an implementer agent reads that spec, writes code, runs tests, and commits. The cost we're tracking is the dollar cost of the implementer's session, paid to Anthropic for Claude API usage.

Every session leaves a record in the system's books — token usage, duration, and a metadata blob naming which engine (planner, implementer, reviewer) ran it. Those records, joined to the spec the implementer consumed and the git commits it produced, are what the analysis is built on.

The data lives in a SQLite database (the system's "stacks" — a CDC-aware key-value store with JSON content). Joining session records to specs and to git commits gives a per-session view of *what was asked*, *how the agent worked*, and *what was produced*.

## Origin

A scratch document had landed in the patron's working directory: an investigation of cost growth across the month. It identified a clear step-change on April 16 — average implement cost doubled day-over-day ($4.80 → $8.08) and stayed at the new baseline. The investigation correctly traced this to a specific code change: a planning-pipeline commit that added a "task manifest" — an XML block at the end of every spec, decomposing the work into 3–8 atomic tasks with per-task verification commands.

The behavioral effect was real and quality-improving: success rate climbed from 83% to 94%, zero-commit sessions dropped from 20% to 5%, sessions became more deliberate and produced more granular git history. The cost effect was the price tag: more verify calls per session (5.5 → 16), more turns per session (103 → 166), more cache-read accumulation as conversation history grew.

The scratch document ranked six candidate interventions to reduce cost without losing the quality gains. The investigation began with the patron asking which one I'd recommend.

## The investigation arc

### First wrong turn — attacking the wrong mechanism

I recommended a "checkpoint and fresh session" architecture: end the implementer's session after each task, start a fresh one with a compact handoff. This attacks the cache-compounding mechanism directly — bound conversation length, bound the cost ceiling. Logically clean.

The patron pushed back: "we tried this and it backfired due to high orientation costs."

He was right. A prior experiment (X010 H1, two weeks earlier) had run exactly this comparison — same spec, same work, decomposed into per-piece sessions versus a single monolithic session. The results were unambiguous: the decomposed run cost **2.6× more** than monolithic ($18.58 vs $7.07), took 3.6× the wall time, and had a seal-stage rebase conflict the monolithic run avoided. 190 of the decomposed run's 267 turns were re-orientation — each fresh session had to re-read the spec, re-grep the codebase, re-establish context. The compounding cost of one long session was *cheaper* than repeated cold-start writes across N piece sessions.

This was data sitting in the experiments directory the whole time. I'd filed a recommendation built on a mechanism (cache compounding) that another mechanism (orientation tax) overwhelmingly dominated. Reading the prior data carefully — including the specific empirical falsification — was the lesson that should have come before any recommendation.

### Second wrong turn — measuring the symptom, not the cause

Pivoted to a different intervention: narrowing verify commands from monorepo-wide (`pnpm -w test`) to package-scoped (`pnpm --filter <pkg> test`). Reasoning: each verify produces a tool-result payload that lands in conversation context and gets re-read on every subsequent turn. Sixteen verify cycles per session compounded that overhead. Narrow the scope, shrink the payload.

I drafted a brief, dispatched it as a commission with complexity 1, and concluded the relevant clicks. The Spider would pick it up and execute.

Then the patron measured directly: per-verify output volume averaged 1,865 chars pre-Apr-16 and 1,908 chars post-Apr-16 — **identical**. Verify output as a fraction of total transcript size: 0.9% in both regimes. The agents had been using `--filter` and `tail` piping organically all along. The instruction would have been a no-op; the expected real-money savings were approximately zero.

I cancelled the commission before pickup, retracted the click decisions, and added a refuted-by-data marker to the umbrella. The lesson here was sharper: I was reasoning about a plausible mechanism (cache-loaded tool output) without checking whether the mechanism was actually load-bearing in the data we already had. A direct measurement of "is verify output volume actually growing?" took the patron about three minutes and disproved the entire premise.

The third lesson, even sharper: the position-of-verify finding (mean 0.58 pre/post — identical distribution) was already in the original analysis I had read at the start. Same distribution pre/post means verifies aren't triggering extra reasoning loops; they scale with whatever turns happen for other reasons. I had read past that finding's implication.

### The pivot to size

Reframed: the cost driver is turn count, turn count is task-count driven. Could we measure the relationship between task count and cost?

A first attempt produced a small sample (n=11) — only writs whose mandate body had been captured to disk by the laboratory's filesystem mirror. Correlation looked weak (Pearson +0.13 cost vs tasks) and I drew a conclusion: task count isn't the lever. The patron pushed back again — *"is it possible to get more specs by looking at plandoc specs which exist for the combined plan+implement rigs, instead of relying on lab only?"*

The data was there in stacks the whole time. The laboratory's filesystem capture had stopped tracking auto-generated mandate writs after the planning pipeline was restructured to combine planning and implementation in one rig. But the planning data lives in the `books_astrolabe_plans` table — every planning run records its generated spec there, regardless of whether the laboratory mirrored it to disk.

Querying stacks directly yielded n=71 implement sessions joined to specs. The picture changed:

| Predictor | Pearson vs cost | Spearman vs cost |
|---|---:|---:|
| Task count | +0.526 | +0.670 |
| Spec characters | +0.743 | +0.818 |

Both predictors lit up. Task count is moderately correlated; spec size is strongly correlated. They overlap (each task adds ~2-3k characters to the spec) but spec_chars carries more independent signal.

Bucketed by task count, the cost shape was striking:

```
tasks   n   avg_cost
  3     8   $0.74
  4    11   $3.01
  5    13   $6.51
  6    18   $6.74
  7    10  $17.68    ← jump
  8     7  $17.19
  9     2  $10.81
```

A 2.5× cliff between 6 tasks and 7 tasks. Bound the manifest at 6 and the right tail of the cost distribution gets cut.

The earlier "task count isn't a lever" claim, made on n=11, was a small-sample artifact. The lesson: don't conclude a relationship doesn't exist from a sample that small, especially when the population is reachable.

### The deeper measurement

Asked next whether spec size correlates with the actual diff produced — does the implementer's output scale with the input, or does it have its own variance?

Joined session records to git commits via the writ-id author email pattern (the implement engine sets `<writ-id>@nexus.local` on every commit it authors). For 74 sessions:

| Pair | Pearson | Spearman |
|---|---:|---:|
| Spec chars vs lines added | +0.60 | +0.71 |
| Spec chars vs files changed | +0.59 | +0.57 |
| Spec chars vs lines deleted | +0.30 | +0.37 |
| **Files changed vs cost** | **+0.81** | **+0.76** |
| Spec chars vs cost (recap) | +0.74 | +0.82 |

The surprise: **files changed** is a stronger cost predictor than spec size. Pearson 0.81 / Spearman 0.76. Mechanically this makes sense — every distinct file the implementer reads or modifies lands in cached context and gets re-read by every subsequent turn. The agent's read budget is spent on file count, not character count.

Cost-per-LOC distribution was also informative: median $0.013, p25 $0.0075, p75 $0.022, **min $0.0005, max $0.17 — a 340× spread**. Same LOC of change can cost 340× more depending on context. That spread is exploration cost — the agent reading large chunks of the codebase to make a small surgical change. It's the cost of *complexity-of-context-required*, and it's the thing structural simplification of the codebase would actually attack.

### Cliffs and density

Two more analyses landed the structural picture:

**Cost cliffs by file count.** Bucketing sessions by files-touched showed the same cliff shape that the task-count buckets had implied, but cleaner:

```
range   n   avg_cost   median
1-1     7    $1.07      $0.57
2-2     7    $2.13      $1.07
5-6    12    $4.69      $5.32
7-9    11    $7.63      $7.07
10-14  17    $8.08      $7.88     ← plateau
15-19   3    $8.64      $9.39     ← plateau holds
20+     8   $27.21     $27.63     ← cliff (3.2× jump)
```

8 of 74 sessions sat above this 20-file cliff. They accounted for **38% of total post-Apr-16 implement cost** — the fat tail concentrated in 11% of sessions. On the predicted side (planner's `<files>` blast-radius prediction), the cliff sat at 15 files predicted (median actual / predicted ratio = 1.0×, with optimistic skew on the high-cost tail).

**Per-package cost density.** Attributed each session's cost across packages by churn share, aggregated:

```
package         sess   attr_$    $/LOC    pattern
spider           25  $138.49   $0.010    volume hotspot (34% of sessions)
clerk            19  $100.06   $0.010    volume hotspot
astrolabe        21  $ 92.76   $0.012    volume hotspot
animator          4  $ 53.54   $0.018    density hotspot
ratchet          12  $ 43.17   $0.006    cheap
clockworks        5  $ 26.34   $0.005    cheap
claude-code       2  $ 17.75   $0.019    density hotspot
lattice           2  $  8.44   $0.004    cheap
```

Three distinct patterns. **Volume hotspots** — spider, clerk, astrolabe — touched in 25-34% of sessions, average per-LOC cost. Aggregate cost dominates because nearly every commission touches at least one. **Density hotspots** — animator, claude-code — small footprint but ~2× per-LOC cost; touching them is intrinsically expensive. **Cheap packages** — ratchet, clockworks, lattice — newer, smaller, more isolated, half the per-LOC cost of substrate plugins.

This points at two distinct levers for structural simplification: *splitting* the volume hotspots (so most commissions touch a smaller piece of substrate), and *refactoring* the density hotspots directly (so each commission that does touch them pays less per-LOC).

## What we learned about cost

Boiling down the body of measurement:

1. **The Apr-16 step-change was a behavioral change**, not a complexity change. The codebase had been growing smoothly for weeks; cost held flat. On Apr 16 the manifest commit landed, agents started working task-by-task with per-task verification and commits, and cost doubled overnight. Quality also improved measurably. The cost is the price of deliberateness.

2. **Cache-read compounding is real but secondary** at our spec scales. Long sessions do pay for re-reading their accumulated context every turn, but that effect is dwarfed by the orientation tax of decomposed sessions (per X010 H1) and by the read-budget effect of files-touched (per the diff analysis).

3. **Files-touched is the single best cost predictor** (Pearson 0.81). It beats spec size, beats task count, beats LOC churn. Mechanically: every file the agent reads or modifies lands in cached context and is re-paid on every turn.

4. **Cost has a cliff shape, not a smooth curve.** Below ~20 actual files touched (~15 predicted), sessions cluster $1-9. Above the cliff, mean cost more than triples to $27. 11% of sessions, 38% of cost.

5. **Per-package cost density is uneven.** A handful of packages (animator, claude-code) are ~2× more expensive per-LOC to change than average. A handful (ratchet, clockworks, lattice) are ~50% cheaper. The substrate plugins (spider, clerk, astrolabe) are average per-LOC but dominate aggregate cost through volume.

6. **Per-LOC cost varies 340× within the population.** Most of that spread is exploration cost — the agent reading the codebase to figure out where to make a small change. Codebase complexity (depth of coupling, breadth of substrate involvement) is what drives that spread.

## Methodological lessons

Three lessons in particular shaped the investigation:

**Read the existing data carefully before reasoning about new mechanisms.** Both the X010 H1 falsification of decomposition and the position-of-verify finding (0.58 mean pre/post) were sitting in artifacts I had access to. Engaging with them earlier would have skipped two wrong turns. The cost of reading prior data is small; the cost of building on a wrong premise compounds.

**Direct measurement beats clever reasoning about mechanism.** The patron's three-minute query — "what is per-verify output volume, actually" — disposed of an entire intervention category. When a mechanism is plausible, the question to ask first is "is this load-bearing in the data we have?" not "what intervention would address it?"

**Iterate on the data layer, not just the model.** The first attempt at task-count correlation used n=11 — the sessions whose mandate writs had filesystem mirrors. The conclusion was wrong because the dataset was wrong. The data was reachable in stacks the whole time, but I didn't go looking for it until the patron pointed at it. Preferring "the data I have" over "the data the question needs" is a fast way to make small-sample mistakes look like findings.

**Don't conclude a relationship doesn't exist from a sample that small.** "Pearson 0.13, no relationship" with n=11 turned into "Pearson 0.53, real relationship" with n=71. The right negative finding from n=11 would have been "we don't have enough data to tell yet."

## Where we landed

Eight live intervention candidates remain in the umbrella. Ranked by current evidence:

1. **Predicted-files gate at planning.** At spec-publish stage, count distinct paths in the manifest's `<files>` elements. If >15, halt and emit a gap report asking the patron to decompose. Empirically the strongest single dispatchable lever — would catch ~75% of the 20+-actual-file sessions before they run, addressing ~38% of total implement cost. Trivial to implement (regex on manifest XML); planning-time mechanism rather than implement-time.

2. **Animator simplification.** Top per-LOC density in the dataset ($0.018/LOC vs $0.010 average). 1-2-hour read-and-refactor against the package's session lifecycle state machine, subprocess plumbing, and transcript I/O could cut animator-touching session cost roughly in half. Highest-leverage targeted refactor.

3. **Spider decomposition.** Volume hotspot — 34% of sessions touch spider, $138 of attributed cost in the dataset. Per-LOC cost is average; the lever is reducing how often the universal substrate is read in full. Higher complexity (structural surgery), larger payoff if successful.

4. **Cost-drift sentinel.** Standing monitor on session.completed events that detects step-changes in implement cost metrics and alerts the patron within hours rather than days. The Apr-16 step-change went undiagnosed for nine days; a sentinel would have caught it the same evening.

5. **Task-count cap at 6.** Coarser proxy for the same mechanism the predicted-files gate addresses. Operationally simpler (count integers, not extract paths) but less precise.

6. **Laboratory data-capture fix.** The investigation's initial dead-end (n=11 from filesystem mirrors) revealed that the laboratory's commission-capture stopped tracking auto-generated mandates when planning + implementation were combined into one rig. Restoring the capture would let future cost analysis stay self-contained in the sanctum dataset rather than requiring stacks queries.

The remaining live items in the umbrella (separate verify rig, defer-to-seal, failure-only subagent) are real but lower-priority intervention candidates that don't address the cost driver as directly as the top items.

Three intervention categories were considered and refuted by data during the investigation: package-scoped verify commands (verify volume unchanged pre/post), end-only and cheap-per-task verify cadence variants (verify cadence not the lever at all), and decomposition-via-piece-sessions (orientation tax outweighs cache savings, per X010 H1).

## Open work

- **Implement the predicted-files gate.** Smallest concrete next step — sage-writer instruction or spec-publish engine check. The expected cost reduction would be measurable within a week.
- **Profile animator** for what specifically drives the per-LOC density. Once we know whether it's the state machine, the IPC, or the I/O CDC chain, we know what to refactor.
- **Build the cost-drift sentinel.** Either as a Laboratory feature (cost is its native concern) or a sibling apparatus. Substrate likely shared with the in-flight Overseer pattern.
- **Re-measure after the gate ships.** A natural A/B exists by leaving the gate threshold tunable — observe total cost before and after, validate the 25-35% savings hypothesis or learn why it doesn't hold.

## What this case study is

A two-day investigation that started with a specific cost-shift diagnosis and ended with a structural understanding of how implementation cost decomposes. The wrong turns are documented because they're load-bearing in how the answer was reached — neither the cliff finding nor the per-package density picture would have surfaced if the verify-cadence detour hadn't been refuted, forcing the conversation to move to scope-of-work as the lever.

The fact that the strongest cost predictor (files-touched, Pearson 0.81) only emerged on the third measurement pass — after spec_chars (0.74) had already been considered the answer — is itself a methodological data point. Cost in autonomous-agent systems decomposes into mechanisms that aren't intuitive without measurement, and intuitions about which mechanism dominates can be wrong by 5× even when they're internally consistent.

---

## Companion artifacts

- [`experiments/X011-context-debt/artifacts/2026-04-25-implement-cost-analysis.md`](../../experiments/X011-context-debt/artifacts/2026-04-25-implement-cost-analysis.md) — the original investigation that triggered this work.
- [`experiments/X011-context-debt/artifacts/2026-04-25-cost-density-and-cliffs.md`](../../experiments/X011-context-debt/artifacts/2026-04-25-cost-density-and-cliffs.md) — the deeper findings (per-package density, cost cliffs, blast-radius accuracy) with full data and caveats.
