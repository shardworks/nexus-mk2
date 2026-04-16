# X010 H1 — Monolithic Baseline: Cheap Mining Projection Falsified

**Date:** 2026-04-16
**Hypothesis tested:** H1 — Long sessions accumulate marginal cost that staging avoids.
**Method:** Run the same Oculus click-page spec through a single-session `implement`
engine (same writ body as the decomposed Rig 2); compare observed cost, turn count,
wall time, and quality to the decomposed run.
**Rig:** `rig-mo1wajm9-8bf5d205` (implement engine, mandate `w-mo1wagye-441cbcee1849`)
**Click:** `c-mo1w0g2n-4b206fe845e5` (H1 monolithic baseline, concluded by this artifact)
**Supersedes the projection in:** `2026-04-16-h1-cheap-mining.md`

## TL;DR

**H1 is falsified at the scale we tested.** The monolithic run beat the decomposed
run on every axis: cost, wall time, turn count, token usage, seal reliability,
and review-pass cleanliness. The cheap-mining projection (which predicted
monolithic would be 3.4× more expensive) was wrong by a factor of **~9×** in
the opposite direction — actual monolithic ran at **0.38× decomposed cost**.

| Metric | Monolithic | Decomposed Rig 2 | mono/decomp |
|---|---:|---:|---:|
| Turns (implement only) | 77 | 267 | **0.29×** |
| Wall time (implement) | 749 s (12.5 min) | 2,717 s (45 min) | **0.28×** |
| input tokens | 97 | 327 | 0.30× |
| cache_create tokens | 274,560 | 815,450 | 0.34× |
| cache_read tokens | 7,559,290 | 20,587,945 | 0.37× |
| output tokens | 51,730 | 132,504 | 0.39× |
| **billed cost (impl)** | **$7.07** | **$18.58** | **0.38×** |
| Review outcome | PASS, no required changes | PASS, no required changes | tie |
| Seal outcome | **fast-forward**, 0 retries | **FAILED**, rebase conflict | mono wins |
| Total rig cost (impl+review+revise) | $9.18 | $20.11 | 0.46× |

## What Actually Happened

The setup Sean proposed (swap `implement-loop` → `implement` in `guild.json`,
repost the Oculus mandate body verbatim) worked cleanly. The older `implement`
engine summoned a single Claude session with the full 7k-line spec body plus
`EXECUTION_EPILOGUE`. 12.5 minutes later, the agent had produced 2 commits
covering all 6 tasks, the review engine passed with only cosmetic notes, and
the seal fast-forwarded onto main.

**The run did hit an auto-compaction event.** Inspection of the transcript
(`/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1wak9c-9415c244/99c46df8-e422-4efa-b8d5-aec28d9f7089.jsonl`)
shows:

- Turns 1–62: cache_read grew from 14,440 to 166,431 tokens (within the
  ~200K Opus window).
- **Turn 63: cache_read drops to 14,533.** This is Claude Code's
  auto-compaction — the agent's context was summarized and reset.
- Turns 63–77: cache_read rebuilt to 77,090 by session end.

The compaction was seamless — no error, no quality drop observable in the
outcome (review passed cleanly). My projection predicted a hard ceiling at
turn ~100 causing failure or truncation; actual behavior is that
**auto-compaction is a graceful soft ceiling.**

## Why The Cheap-Mining Projection Was Wrong

The projection's fatal assumption: *same turn count, compounding cache-read.*

That held neither part.

### 1. Turn count was 29% of what I projected

My projection used the decomposed rig's 267 turns and asked "what if all that
were in one session?" In reality, the monolithic agent did the same work in
**77 turns — 0.29× the decomposed total.**

Where did the extra 190 decomposed turns go? Mostly re-orientation:

- Each piece-session starts cold — reads the spec, greps the codebase, runs
  `git log` / `git status`, verifies the branch, reads adjacent files.
- Each piece re-explains what it's about to do ("I'll now implement t3 as
  specified...") before making edits.
- Each piece commits separately, often with multi-turn commit-message
  drafting.
- The agent often spends 3–5 turns at the start of a piece validating that
  prior pieces landed correctly.

**The monolithic agent paid this orientation cost exactly once.** It then
ran through the 6 tasks as a continuous flow, reusing its warm mental model
of the codebase and spec. This is the opposite of what the naive "staging
reduces context drag" intuition suggests.

### 2. Cache-read per turn was higher monolithic, but turn count dominated

- Monolithic mean cache_read/turn: 98,173 tokens
- Decomposed (Rig 2) mean cache_read/turn: 77,108 tokens

Per-turn, the monolithic run carried ~27% more context drag (as expected — longer
continuous session means more context to replay). But with 0.29× the turns, the
aggregate cache-read was 0.37× decomposed. **Turn count is the dominant lever;
per-turn cost is secondary.**

### 3. Output tokens showed the biggest savings

- Monolithic total output: 51,730
- Decomposed Rig 2 total output: 132,504
- **Ratio: 0.39×**

Output is the most expensive token lane ($75/M vs $1.50/M cache-read). The
40% ratio here drove most of the dollar savings. Decomposed sessions generate
a lot of explanation, status-updates, and plan-restating text per piece —
none of which contributes to the artifact.

### 4. Auto-compaction saves you from the context ceiling

The compaction event at turn 63 proves Claude Code handles long-session
context gracefully. I feared a hard failure mode; the real failure mode is
"Claude summarizes your context and continues." On this run, the
post-compaction session (turns 63–77) completed the remaining work and
passed review cleanly. No observable quality cost.

For this size of spec, **the context ceiling is effectively not a wall but
a speed bump.**

## What Decomposition Actually Buys (on this dataset)

Given the dramatic cost, time, and reliability upset, what's the remaining
case for decomposition?

- **None observed on this single-spec comparison.** Decomposed cost 2.6×
  more money, took 3.6× longer wall, had a seal failure the monolithic run
  avoided, and produced functionally equivalent output (both PASS review).
- **Commits were granular in decomposed (6 commits vs 2 in monolithic).**
  That's the one axis where decomposition wins — finer-grained git history.
  Whether it's worth a 2.6× cost premium is the real question.

It's possible decomposition shines at specs larger than this one — but this
spec was already 25 decisions and ~7k lines of body, which I'd have called
"large" before running it.

## Implications for H-series Hypotheses

- **H1 (long sessions accumulate marginal cost):** Falsified at this scale.
  The opposite holds: decomposed sessions accumulate more total cost
  because orientation tax is paid per piece. Filing as refuted pending a
  larger-spec test.
- **H2 (shorter sessions produce better quality):** Not supported by this
  data — both runs passed review cleanly. Worth running the parked H2
  clicks anyway since N=1 is weak evidence.
- **H3 (systemic costs favor shorter sessions):** Partially refuted. The
  monolithic run had a clean seal with zero rebase conflicts; the decomposed
  run had a seal-failing rebase conflict. Shorter wall time (12.5 min vs
  45 min) meant less overlap with other activity on main. This is the
  opposite of what H3's framing expected.
- **H4 (above what threshold does staging pay off):** This test finds the
  **threshold is above the Oculus-spec size, not below it.** We don't
  have a measured threshold above which staging helps — which itself
  argues that the threshold is either nonexistent for realistic specs or
  lives at a scale we haven't sampled.
- **Lazy decomposition:** Still potentially interesting since it sidesteps
  the orientation-per-piece tax (agent self-stops when coherent, rather
  than a planner pre-slicing). But the urgency of that inquiry drops
  given monolithic already works well.

## Caveats

1. **N=1 for the spec.** One monolithic run vs one decomposed run. Both
   passed review, both used the same spec body, same model, same
   workspace. But a single spec is a single data point — the effect could
   vary dramatically with spec shape (refactoring vs greenfield, heavy
   exploration vs heavy writing, etc).

2. **The spec was pre-planned.** Astrolabe had already planned the Oculus
   spec into 6 tasks with a manifest. The monolithic agent received those
   tasks as structured guidance in-prompt, so it still benefited from
   planning-time decomposition (just not execution-time decomposition).
   This is a variable we haven't isolated.

3. **Auto-compaction is model-version-dependent.** Claude Code 2.1.111
   (the version running these sessions) has mature compaction. Older or
   differently-configured agents may not compact as gracefully. If we
   change models or providers, this finding may not transfer.

4. **Quality assessment is shallow.** Both runs passed review — but review
   is a cheap check. A deeper quality audit (integration correctness,
   long-term maintainability, edge-case handling) might differentiate.

5. **Seal-conflict advantage is partly about wall time, not engine choice.**
   The monolithic run seal-passed cleanly partly because it finished in
   12.5 min — less window for concurrent activity on main. A decomposed
   run that happened to finish in 12.5 min would likely seal cleanly too.
   This is a confound with H3's framing.

## Updated Recommendation

**Stop treating decomposition as the default.** The empirical evidence for
this single-spec comparison is strongly against staging on grounds of cost,
time, and reliability. At minimum, the `implement` (monolithic) engine
should be kept as a first-class option, and decomposition should be
justified per commission rather than enabled by default.

Concrete next steps:

- **Revert `guild.json` back to `implement-loop`** (current state still
  has `implement` set from the baseline run). Or consciously leave it as
  `implement` — this data argues that's the better default.
- **Resume and conclude H1 clicks.** Cheap-mining click already concluded
  incorrectly (on the projection); this artifact supersedes that
  conclusion. Monolithic-baseline click (`c-mo1w0g2n`) can be resumed
  then concluded with the observed finding.
- **Reframe the X010 root question.** Instead of "which session-boundary
  policy should Nexus default to?" → "under what conditions does staging
  beat monolithic?" The H4 branch becomes primary; the H1/H2/H3 branches
  may all need reshaping.
- **Consider scaling the test.** Run a much larger spec (e.g., something
  requiring 500+ turns monolithic) to see whether compaction-plus-longer-context
  finally tips the balance. If even that runs cleanly monolithic,
  H1 is dead.

## Data Sources

- Monolithic rig: `rig-mo1wajm9-8bf5d205`
  - Implement session: `ses-mo1wakbo-9b60f9d2` (transcript
    `/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1wak9c-9415c244/99c46df8-e422-4efa-b8d5-aec28d9f7089.jsonl`)
  - Review session: `ses-mo1wt3ux-d8185ad5`
  - Revise session: `ses-mo1x02uo-11de2cd4`
- Decomposed rig (for comparison): `rig-mo1o65z0-4ab96d3e`, writ
  `w-mo1o65ky-683de2230313`, 6 piece sessions in
  `/workspace/nexus-mk2/experiments/data/commissions/w-mo1o65ky-683de2230313/sessions/`.
- Analysis script: `scripts/h1_monolithic.py` (alongside this artifact).
