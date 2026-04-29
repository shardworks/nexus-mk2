---
status: active
---

# X010 — Staged Sessions

## Research Question

What is the relationship between session length, cost, and output quality for autonomous commissions? Specifically: do long sessions cost more per unit of productive work? Do they produce worse output? And if either is true, does breaking work into shorter sessions capture the benefits without unacceptable handoff losses?

## Background

There are two independent reasons to suspect that shorter sessions might be better than longer ones:

**Cost.** LLM API pricing is token-based. Each turn in a session sends the full conversation history as input. As a session gets longer, every new turn pays for a larger input context — even with caching, cache-read tokens aren't free. This means the cost of each successive turn grows with the session's accumulated context. A 50-turn session doesn't cost 50× a 1-turn session; it costs significantly more, because turns 40-50 are each paying to re-read the context from turns 1-39.

**Quality.** LLM attention degrades over long contexts. Earlier decisions get "forgotten," the agent loses coherence with its own prior work, and output quality may decline — especially in long autonomous sessions with heavy tool use, where each turn adds tool calls and results to the context. Shorter, focused sessions might simply produce tighter work: fewer loose ends, less scope drift, more coherent commits.

These are independent claims. Cost might be a problem even if quality is fine. Quality might be a problem even if cost is acceptable. Both might be problems, or neither. The experiment needs to measure them separately.

Beyond per-session economics, there are **systemic costs** to long-running commissions. A commission that holds a worktree for 30 minutes while other commissions are running has a longer window for `main` to diverge, increasing the probability of a failed fast-forward merge. Shorter sessions (or smaller commissions) reduce this conflict window. Failed merges are expensive — the commission's entire output is discarded, the tokens are wasted, and the work must be re-done or manually recovered. The expected cost of merge failures should factor into the economic analysis.

This connects to X007:H2 (Orientation Cost Dominates), which measures how much of a session is spent orienting. X010 asks the upstream question: is the cost/quality profile of long sessions bad enough that paying the re-orientation tax multiple times is still a net win?

### Relationship to X004

X004 (Iteration Context) asks a closely related question: when an agent iterates on its own prior work, how much context about prior sessions should it get? Its three variants — no context, summary context, full context (via session resume/fork) — directly parallel the handoff problem in staged sessions. X010's "stage notes" are essentially X004's "summary context" variant.

Key differences:

- **X004 is about iteration on completed work** (amendments to a delivered commission). X010 is about continuation of in-progress work within a single commission.
- **X004 includes a "full context" variant** (resume the prior session with full history). X010's premise is that fresh sessions are better — it doesn't test resumption.
- **X004 asks whether context can hurt** (over-anchoring on prior approach). X010 assumes the summary helps and asks whether it's *sufficient*.

Findings from either experiment inform the other. If X004 finds that summary context outperforms full context, that validates X010's stage-notes approach. If X010 finds that staged sessions lose too much context, that suggests X004's "full context" variant may be necessary for iteration too. Data collection instruments (orientation cost analysis, quality assessment) are shared.

## Hypotheses

### H1 — Long Sessions Have Increasing Marginal Cost

The cost per productive turn increases as a session gets longer. Specifically: the last 10 turns of a long session (30+ turns) cost meaningfully more than the first 10 turns, even though the productive work per turn is comparable. The dominant factor is accumulated input context — each turn pays to re-read the entire conversation history.

This is partly true by construction (input context grows, so input tokens per turn grow), but the question is *how much it matters* in practice. With aggressive caching, the marginal cost increase might be trivial. Or it might be substantial — that's what we need to measure.

**Measurement:**
- Analyze session transcripts from commissioned sessions (existing or new)
- For each turn, extract: input tokens (fresh + cache-read + cache-write), output tokens, estimated cost
- Plot cost-per-turn over the session lifetime
- Calculate: what percentage of total session cost is "context tax" (input tokens that are re-reads of prior conversation, not new information)?

**Thresholds:**
- **Confirmed:** The last quarter of turns costs >2× per turn compared to the first quarter, consistently across sessions. Context tax accounts for >30% of total session cost.
- **Partially confirmed:** Marginal cost increases but modestly (1.3-2× ratio). Context tax is 15-30%. Optimization is a nice-to-have.
- **Refuted:** Marginal cost increase is <1.3× (caching absorbs most of it). Context tax is <15%. Long sessions are cost-efficient enough — no cost-motivated reason to stage.

### H2 — Shorter Sessions Produce Better Output

Independent of cost, shorter focused sessions produce higher-quality work than long sessions tackling the same total scope. Quality here means: fewer defects, less scope drift, tighter task adherence, more coherent code.

The mechanism would be cognitive focus — a fresh context window lets the agent bring full attention to a well-scoped chunk of work, rather than juggling an increasingly large mental model. This is analogous to the human experience of "fresh eyes" after a break.

**Measurement:**
- Run the same commission both ways: single long session vs. manually staged (2-3 shorter sessions with handoff notes)
- Compare output quality:
  - Defect count (bugs, broken tests, incomplete implementations)
  - Scope drift (changes outside the commission scope)
  - Code coherence (does the code contradict itself? do later changes undo or clash with earlier ones?)
  - Task adherence (did the output match the spec?)
  - Commit quality (message clarity, atomic commits vs. sprawling ones — a proxy for agent coherence)
- Also compare within single long sessions: is the quality of work in the first half measurably better than the second half?

**Thresholds:**
- **Confirmed:** Staged output has fewer defects and less drift than single-session output, consistently. And/or: late-session work within a single session is measurably worse than early-session work.
- **Partially confirmed:** Quality difference is visible but small. Some commission types show it more than others.
- **Refuted:** No measurable quality difference. Long sessions maintain coherence fine. The "context degradation" concern is overblown for sessions at our current scale.

### H3 — Systemic Costs Compound the Case

Beyond per-session economics, long-running commissions carry systemic costs that shorter sessions avoid:

- **Merge conflict probability:** A commission that runs for 30 minutes has a larger window for concurrent commissions to merge to `main` first, causing a fast-forward failure. The cost of a failed merge is high — all tokens spent on the commission are wasted, and the work must be re-done or manually recovered.
- **Time-to-feedback:** A long session delays the moment the patron can review the work. Shorter sessions (especially if each stage merges independently) provide faster feedback loops.
- **Blast radius:** If a long session goes off the rails at turn 40, turns 1-39 of useful work may be lost. Staged sessions that commit and (potentially) merge incrementally contain the blast radius.

Note: the current staged commissions design (see [`artifacts/staged-commissions-spec.md`](artifacts/staged-commissions-spec.md)) keeps all stages on one branch — the merge only happens at the end. This means staging *does not* reduce merge conflict probability in its current form. A variant design where each stage merges to `main` before the next stage starts *would* reduce conflict probability, but requires each stage to be independently mergeable. This is a design question the experiment should inform.

**Note:** The staged commissions implementation spec is still a draft with open design questions — particularly around the stage notes file path, loop guards, crash behavior, prompt structure for continuation sessions, and whether stages should merge independently. This experiment should inform those decisions.

**Measurement:**
- Track merge outcomes (success/fail) across all commissions, correlated with session duration
- For failed merges: what was the wall-clock time of the commission? How far had `main` moved?
- Estimate the expected cost of merge failures: `P(failure) × cost_of_session`
- Compare: would shorter sessions have avoided the conflict?

**Thresholds:**
- **Confirmed:** Merge failure rate correlates with session duration. Expected cost of failures is significant relative to session cost.
- **Refuted:** Merge failures are rare regardless of session length (because concurrent commissions in the same workshop are rare, or because work doesn't overlap).

### H4 — Net Economics Favor Staging (Above a Threshold)

Combining H1-H3: for commissions above some size threshold, the total cost of multiple staged sessions (including re-orientation tax per stage) is lower than a single long session, with equal or better quality. Below that threshold, single sessions are fine.

This is the synthesis hypothesis — it depends on the findings from H1, H2, and H3. The goal is to find the crossover point, if one exists.

**Measurement:**
- For each commission pair (single vs. staged), compute:
  - Total cost (USD) for each variant
  - Cost per useful commit as an efficiency proxy
  - Re-orientation cost per stage (via X007:H2 analysis tool)
  - Quality-adjusted cost (if staged quality differs, factor that in)
  - Expected merge failure cost (from H3 data)
- Look for the crossover: at what single-session length does staging become net-positive?

**Possible outcomes:**
- **Clear crossover exists:** Staging is better above N turns (or $N). Build the mechanism, set guidance for commission sizing.
- **Staging always wins:** Multiple short sessions are better at every scale. Make it the default, and teach the sage to decompose work accordingly.
- **Staging never wins:** Re-orientation cost and handoff losses eat any savings. Single sessions are fine. Invest in better commission specs instead.
- **Depends on commission type:** Feature additions hand off cleanly; deep refactors don't. The mechanism is useful but not universal — needs guidance on when to use it.
- **Just write smaller commissions:** The real lesson is that the patron (or sage) should decompose work into smaller independent commissions rather than using staging. Each commission is self-contained, merges independently, and doesn't need a handoff mechanism. Staging is overengineered; the answer is better task decomposition.

### H4 sharpening and H5 (added Apr 29, 2026)

The Apr 29 addendum adds three sharpened sub-hypotheses (H4a, H4b, H4c)
formalizing the cost model for split sessions, and introduces H5 — a
parallel hypothesis on inventory-induced pure-read context bloat as a
separate cost lever. See the [Apr 29 addendum](#addendum-apr-29-2026--h4-cost-model--sub-hypotheses-h5)
below for full predictions, empirical confirmations, and falsification
paths.

## Addendum (Apr 25, 2026) — Post-Manifest Regime Change

H1 was concluded falsified at the Oculus-page scale on Apr 16: monolithic
beat decomposed dramatically (0.38× billed cost, 0.29× turns, clean seal).
The conclusion holds for that scale, but the regime has since shifted in
a way that re-opens H4 (the threshold question, currently parked).

**What changed.** Commit `920e65ca` (Apr 16) — sage-writer began
emitting a `<task-manifest>` XML block, and the implement
EXECUTION_EPILOGUE was rewritten to require task-by-task work with a
verify command and commit per task. This turned a bounded single-pass
session into an iterative multi-task loop. (A paired Apr 17 commit
`260f5cf9` inlined click content into briefs and was initially
suspected as a second driver, but empirical brief-size measurement
ruled it out for implement — see the cost analysis artifact.)

Average implement session lengths roughly doubled (77 → ~150 turns),
and avg cost grew 13× across April (~$0.65 → $8.56) with cache-read
tokens growing 18×. Full analysis:
[`../X011-context-debt/artifacts/2026-04-25-implement-cost-analysis.md`](../X011-context-debt/artifacts/2026-04-25-implement-cost-analysis.md).

**Why this matters for X010.** The H1 baseline tested ~77-turn sessions
against decomposed alternatives at that scale. Today's implement
sessions habitually run at ~150 turns and frequently more — closer to
the regime H4 anticipated. The "long sessions are cheaper" finding may
not generalize to this regime, because:

- Cache-read amplification is super-linear in session length
  (every turn pays for re-reading all prior turns).
- The orientation-tax-pays-once advantage of monolithic shrinks as
  the cache-read tax compounds.
- Auto-compaction (the gracefully-handled context ceiling observed in
  the H1 baseline) costs ~4 turns of orientation each time it fires
  — a real but bounded toll.

**Candidate H4 answer.** Click `c-modxxtu6` proposes a
checkpoint-and-fresh-session architecture: end the implement session
after each task commit, start a fresh one with a compact handoff
(git log + manifest progress + active-task pointer). Each session's
cache starts small and doesn't compound. With a 5-task manifest this
plausibly looks like 5 × $1 instead of 1 × $8 — a different staging
shape than the rig-decomposition tested in H1, and one that exploits
the manifest's existing task structure as the natural handoff
boundary.

**Implication for the experiment.** H4 is currently parked. A reasonable
unpark trigger is: if `c-modxxtu6` reaches design or prototype, it
becomes a natural H4 variant to measure (single-session vs.
manifest-checkpointed). The H1 result is not invalidated; the regime
that generated it has narrowed.

## Addendum (Apr 29, 2026) — H4 Cost Model & Sub-Hypotheses; H5

The Apr 25 addendum re-opened H4 with one candidate architecture
(`c-modxxtu6`, checkpoint-and-fresh-session at manifest-task boundaries) but
no quantitative target thresholds. A subsequent session-economics analysis
during a polyrepo design conversation derived a cost model for split-session
costs and ran it against the existing transcript archive (104 sessions ≥ 50
turns; see [`artifacts/2026-04-29-h4-naive-split-simulation.md`](artifacts/2026-04-29-h4-naive-split-simulation.md)).
The findings sharpen H4 into three measurable sub-hypotheses (H4a/H4b/H4c)
and surface a separate cost lever as a new top-level hypothesis (H5).

### Cost Model

For a session with N turns and per-turn cache-read `cr[i]`:

- **Monolithic cost** = `Σ cr[i]` (cumulative cache-read across all turns).
- **Handoff split at K with handoff size H** ≈ `monolithic − (N−K) × (cr[K] − H)`.
  Savings are linear in remaining-turns × (context-at-split minus handoff).
  Per-turn cost is clamped to ≥ H (a session can't have less context than
  its starting handoff).
- **Naive split at K** ≈ `monolithic + baseline_cost − (N−K) × α`, where
  `α = cr[K] − B` is the phase-1-specific accumulated content and
  `baseline_cost` is the cost session 2 incurs to re-do the orientation reads.

The model assumes per-turn cache-read dominates session cost (60–94% per the
2026-04-03 analysis). Output and cache-creation costs are not modeled —
giving a conservative lower bound on naive-split overhead.

### H4a — Naive Splitting Has a Per-Half Break-Even

Splitting a session into two without a structured handoff (each session does
its own baseline orientation) breaks even only when the post-split work has
enough turns to amortize the re-read tax: `T_post ≥ B_cost / α`.

**Prediction:** for current-regime implement sessions (Opus 4, ~150 turns
total, baseline B ≈ 100–200K, α ≈ 50–100K), naive splitting requires roughly
**50–80 turns of post-split work** to break even. Below that, baseline
re-read cost exceeds the savings.

**Empirical confirmation:** simulation across 104 transcripts shows
**73% have NO split point at which naive splitting saves money**, and the 27%
that do have median break-even at `T_post ≈ 79 turns`. Both recent rigs
(139 and 155 turns) fall into the "naive never wins" majority.

**Falsification path:** if a sample of in-flight commissions shows naive
break-even consistently below 30 turns OR consistently above 120 turns, the
formula calibration is wrong and the model needs revision.

### H4b — Handoff Size Determines Savings Magnitude

The savings from splitting scale primarily with `(B − H)`, not with α. A
small handoff captures most of the available savings ceiling.

**Prediction:**

- 30K handoff → median ~32% savings on midpoint splits.
- 60K handoff → median ~25% savings.
- 100K handoff → median ~15% savings.
- 0K handoff (full re-read / naive) → median *negative* savings.

The asymmetry is dramatic: a 30K handoff saves ~3× more than naive splitting
even where naive can win at all.

**Empirical confirmation:** at 30K handoff midpoint splits, **93% of 104
sessions show positive savings** with median 32%.

**Falsification path:** a live test with a real handoff implementation that
saves substantially less than the model predicts (e.g., <15% on a session
the model predicts 30%+) would invalidate the cost model — likely because of
unmodeled costs (output expansion, cache-creation taxes, orientation
turns at session 2's start).

### H4c — Handoff Architecture Must Suppress Per-Session Orientation

The 2026-04-16 H1 monolithic-baseline result (decomposed Rig 2 cost 2.6× the
monolithic equivalent) was driven primarily by **turn-count expansion**:
piece-session split work into 6 pieces averaging 44 turns each, but the
*total* turn count was 3.5× the monolithic version. Each piece paid its own
orientation tax (re-read spec, re-grep codebase, re-validate prior commits,
re-state the plan, draft its own commit message). The handoff candidate in
`c-modxxtu6` only succeeds if it suppresses that tax.

**Empirical baseline of the orientation tax** (see
[`artifacts/2026-04-29-h4c-orientation-tax-analysis.md`](artifacts/2026-04-29-h4c-orientation-tax-analysis.md)):
across 105 implementer transcripts, time-to-first-productive-call
(Edit/Write/file-mod Bash) has median 6 turns and 24K context, mean ~10
turns and 36K context, with a long tail of 19% of sessions taking ≥ 15
turns. Substantive code changes cluster in the long tail — Rig 2 (Reckoner
tick) took 34 turns and 199K context to first edit, ~22% of session length.
Calibration: if X010 H1 piece-session R2's six pieces each spent ~6-10
turns orienting, that's 36-60 extra turns total — sufficient to explain
the observed 3.5× total turn-count expansion.

**Prediction:** a handoff architecture wins only when total turn-count across
all sessions stays within ~1.3× monolithic. Above ~1.5× expansion, even
handoff savings are eaten by extra turns.

**Empirical signal to watch:** in a live H4 test, measure the first 10 turns
of each post-handoff session. Target: first-edit at turn ≤ 5. Acceptable:
turn ≤ 10. Failure: turn > 15 (the orientation tax wasn't suppressed; the
handoff is too thin or the prompt structure isn't using it).

**Falsification path:** if a well-designed handoff architecture still
produces >1.3× turn expansion (no matter how the handoff is structured),
this hypothesis suggests the orientation tax is *intrinsic* to fresh
sessions and can't be avoided structurally — the answer would shift back
toward "make monolithic sessions cheaper" (e.g., context eviction in the
provider) rather than "split with handoffs."

### H5 — Inventory-Induced Pure-Read Context Bloat

The reader-analyst's inventory format directs the implementer to read files
for type information and pattern reference using full-path pointers. For
substantive code changes, these "for understanding" reads accumulate large
amounts of context the implementer never edits. This is a separate cost
lever from the H4a/H4b/H4c handoff-splitting mechanism — it reduces what
*gets carried forward* in the first place, rather than how the carryforward
replays.

**Prediction:** in current substantive implements (cross-package code
changes, new abstraction integrations), the share of Read-into-context
content that is never subsequently Edited or modified will exceed 30%, with
substantive commissions clustering above 40%. Mechanical commissions
(deletions, renames, doc-edits) will remain near 0–5% pure-read.

**Empirical confirmation:** the recent rig pair shows the bimodality. Rig 1
(vision-keeper cleanup, mechanical) had 1.9% pure-read share. Rig 2
(Reckoner tick, substantive) had **49.1%** — ~56K tokens of context bloat
from 13 pure-read files including `clockworks.ts` (44K),
`reckoner.test.ts` (34K), `clockworks/types.ts` (27K), `summon-relay.ts`
(23K). Across 147 turns of cumulative replay, this contributed ~8M cache
reads — roughly 20% of the rig's total cache cost was paid on context that
never informed an edit. Tracing the source: the inventory's "Key types and
interfaces (read-points, not copied verbatim)" and "Adjacent patterns"
sections direct the implementer to full-file Reads. See
[`../X011-context-debt/artifacts/2026-04-29-read-utilization-analysis.md`](../X011-context-debt/artifacts/2026-04-29-read-utilization-analysis.md).

**Falsification path:** if a sample of substantive implementer transcripts
shows pure-read share consistently below 20% across diverse commission
types, the inventory format is not the dominant cost mechanism it appears
to be — and the prescription (inline excerpts in the spec rather than
full-file pointers) wouldn't deliver the predicted savings.

**Acceptance signal for the intervention:** the four sub-interventions
(inline type signatures, inline pattern templates, do-not-read markers,
pre-quote source excerpts; bundled as Priority 1 under cost-optimization
umbrella `c-mok4nke6`) should drive median pure-read share on substantive
commissions below 15%. A before/after measurement on a representative
substantive commission is the validation test.

### Operational Implications

The decision framework derived from H4a–H4c (when to stage vs run
monolithic, what handoff size to target, how to detect orientation
suppression failures) is documented separately in
[`artifacts/2026-04-29-h4-operational-findings.md`](artifacts/2026-04-29-h4-operational-findings.md).
That artifact carries recommendations and decision tables; this addendum
carries the formal hypotheses and falsification paths only.

### Updated Procedure

The X010 procedure (Phase 1–3) is updated to add a new phase before live
testing:

#### Phase 1.5 — Cost-Model Validation (H4a, H4b)

Already complete (2026-04-29 simulation artifact). Confirms the cost model
predictions against the existing transcript archive. No further work needed
unless the cost model is challenged.

#### Phase 2 — Live H4 Test (newly framed)

Replace the original Phase 2's monolithic-vs-staged comparison with a
narrower test: monolithic vs 2-session-handoff midpoint split, on the *same*
commission body, with a deliberate <30K handoff design.

- Pick an in-flight commission of 100+ expected turns
- Run as monolithic, capture cost, turns, quality
- Run again with a single mid-task checkpoint, capture same metrics
- Compare to model prediction (~32% savings)
- If actual savings within 10pp of predicted → cost model validated
- If actual savings substantially lower → identify the unmodeled overhead
  (output expansion? handoff bloat? orientation re-emergence?)

#### Phase 3 — Synthesis (unchanged)

The synthesis goal stays "find the threshold" — but with the cost model in
hand, the threshold is now a derived quantity rather than an empirical
search.

---

*Apr 29 addendum source artifacts:*
- [`artifacts/2026-04-29-h4-naive-split-simulation.md`](artifacts/2026-04-29-h4-naive-split-simulation.md) — H4a/H4b cost-model simulation
- [`artifacts/2026-04-29-h4c-orientation-tax-analysis.md`](artifacts/2026-04-29-h4c-orientation-tax-analysis.md) — H4c per-fresh-session tax measurement
- [`../X011-context-debt/artifacts/2026-04-29-read-utilization-analysis.md`](../X011-context-debt/artifacts/2026-04-29-read-utilization-analysis.md) — H5 pure-read-share measurement
- [`artifacts/2026-04-29-h4-operational-findings.md`](artifacts/2026-04-29-h4-operational-findings.md) — derived decision framework

## Procedure

### Phase 1 — Cost Curve Analysis (H1)

Can be done with existing session data. No new commissions needed if we have transcripts from prior runs.

1. **Gather session transcripts** from commissioned sessions (post-commit `9d5bd96` for proper transcript capture).
2. **Build or use a cost analysis tool.** For each session:
   - Extract per-turn token usage (input, cache-read, cache-write, output)
   - Compute per-turn cost using Claude API pricing
   - Plot cost-per-turn over session lifetime
   - Calculate context tax percentage
3. **Evaluate H1.** Is the marginal cost increase real and significant?

### Phase 2 — Quality and Staging Comparison (H2, H3)

Run regardless of H1 outcome — quality is an independent question.

4. **Select 2-3 commissions** large enough to stress a single session. Candidates:
   - Multi-file feature addition (new module + tests + integration)
   - Refactoring task touching many files
   - Bug fix requiring deep codebase understanding

5. **Run each as a single long session.** Capture metrics and quality assessment.

6. **Run each again, manually staged:**
   - Start normally
   - After ~40-50% of the work, halt
   - Write stage notes (what's done, what's next, key decisions)
   - Start a fresh session with the original spec + stage notes
   - Let it complete

7. **Compare** quality and cost between variants.

8. **Track merge outcomes** across all commissions for H3.

### Phase 3 — Synthesis (H4)

9. **Combine** cost data (Phase 1), quality data (Phase 2), and systemic data (Phase 2/H3).
10. **Find the crossover** — if one exists.
11. **Decide:** build staged commissions, invest in better task decomposition, or both.

## Data Collection

### Artifacts

All artifacts go to `experiments/X010-staged-sessions/artifacts/`:

- `staged-commissions-spec.md` — draft implementation spec for the staging mechanism (pre-existing)
- `cost-analysis.md` — per-session cost breakdowns and context tax calculations (Phase 1)
- `commission-{N}-single.md` — observations and metrics for each single-session run
- `commission-{N}-staged.md` — observations and metrics for each staged run
- `comparison.md` — side-by-side analysis
- `findings.md` — conclusions and decision

### Session Data

Session records and transcripts are captured automatically by the session funnel in `.nexus/sessions/`. Link to specific session IDs in observation notes.

### Ethnographer Integration

The ethnographer should capture Sean's experience reviewing single-session vs. staged output. Does the quality difference feel meaningful? Is the operational complexity worth it? This is relevant to X008 (Patron's Hands) — staging changes the patron's relationship with commissioned work.

## Depends On

- Session transcript capture working end-to-end (post-commit `9d5bd96`)
- At least a few commissioned session transcripts for Phase 1 cost analysis
- X007:H2 orientation analysis tool (for measuring re-orientation cost in staged sessions)
- For Phase 2: commissions worth running 2+ times

## Risks

- **Pricing changes:** Claude API pricing may change between sessions, invalidating cost comparisons. Pin to a specific pricing model in the analysis.
- **Caching variability:** Cache hit rates vary based on system prompt similarity, time between requests, and provider-side eviction. Two runs of the "same" session may have different caching profiles. Note cache hit rates in all measurements.
- **Commission selection bias:** Need commissions in the sweet spot — large enough to show the cost curve, small enough to run multiple times without burning budget.
- **Manual staging artifacts:** In Phase 2, Sean writes the stage notes. This tests the mechanism with high-quality handoff notes — an artificer writing its own notes may do better or worse. Known limitation; the experiment tests whether the mechanism *can* work, not whether agents are good at using it.
- **Small sample size:** Exploratory, not statistically rigorous. Strong effects will be visible; subtle ones won't.
- **Conflating staging with task decomposition:** The experiment may reveal that the real lever is smaller commissions, not staged sessions. That's a valid finding — it just means the answer is "write better specs" rather than "build staging infrastructure." The experiment should be open to this conclusion.
