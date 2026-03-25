---
status: ready
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
