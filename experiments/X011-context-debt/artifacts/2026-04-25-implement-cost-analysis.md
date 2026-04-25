# Implement Engine Cost Analysis — April 25, 2026

Investigation into why implement engine session costs rose ~12× from early April to late April.

---

## Per-Day Cost and Token Breakdown (completed implement rigs)

| Day | n | avg $ | output ktok | cache_read ktok | cache_write ktok |
|---|---|---|---|---|---|
| Apr 4  |  8 | $0.65 |   8.4k |   668k |  32k |
| Apr 6  | 14 | $1.24 |  18.7k |  1813k |  54k |
| Apr 7  | 19 | $3.25 |  41.6k |  3651k |  97k |
| Apr 8  |  7 | $3.24 |  40.5k |  5408k |  97k |
| Apr 9  | 12 | $2.21 |  21.0k |  2219k |  67k |
| Apr 10 | 20 | $1.79 |  15.5k |  1770k |  53k |
| Apr 13 |  2 | $2.14 |  14.4k |  2235k |  88k |
| Apr 14 |  3 | $3.06 |  19.9k |  4005k |  71k |
| Apr 15 |  5 | $4.17 |  23.1k |  4716k |  88k |
| **Apr 16** | **10** | **$4.80** | **33.6k** | **5636k** | **140k** | ← breakpoint |
| **Apr 17** |  **7** | **$8.08** | **56.8k** | **9879k** | **239k** | ← step-change |
| Apr 18 |  2 | $10.38 |  72.1k | 13008k | 269k |
| Apr 19 |  3 |  $4.98 |  31.8k |  6446k | 140k |
| Apr 21 |  9 |  $6.93 |  47.0k |  8440k | 219k |
| Apr 22 |  1 | $24.27 | 115.2k | 38163k | 369k |
| Apr 23 | 21 |  $5.62 |  33.1k |  7808k | 142k |
| Apr 24 | 30 |  $7.99 |  35.1k | 12201k | 147k |
| Apr 25 |  4 |  $8.56 |  50.4k | 11934k | 212k |

**Summary:** avg cost $0.65 → $8.56 (13×). cache_read tokens 668k → 11,934k (18×). Output tokens 8k → 50k (6×).

---

## Breakpoint Identification

**Apr 16–17** is the clear step-change: avg cost doubles in one day ($4.80 → $8.08), output tokens 1.7×, cache reads 1.75×. All three token categories move together, consistent with longer sessions rather than a system prompt size change.

---

## Hypotheses Explored

### ❌ System prompt size explosion
The Loom assembles: charter + tool instructions + role doc. In vibers:
- No `charter.md` exists → zero charter contribution
- `roles/artificer.md` = 1,522 bytes
- The `artificer` role has `clerk:*` and `tools:*` permissions — modest tool set

System prompt is small and didn't change around Apr 16-17. **Not the cause.**

### ❌ givensSpec input size growth
Checked givensSpec total sizes for implement sessions across the timeline:
- Apr 6:  41,447 chars
- Apr 10: 21,152 chars
- Apr 17: 20,507 chars / 26,489 chars
- Apr 23:  5,912 chars

No correlation with cost. **Not the cause.**

### ❌ Repo size as primary driver
Repo grew 4.3× (1.0MB → 4.3MB, 144 → 335 files) over the period. Cost grew 13×. Repo growth is a headwind but doesn't explain the discrete Apr 16-17 step-change. **Partial factor, not primary cause.**

### ✅ Session length explosion → cache read amplification
The primary mechanism: longer sessions cause Claude's automatic cache checkpoints to be re-read on every subsequent turn. Cache reads are cheap per-token ($0.30/Mtok) but the volume grew 18× — from 668k to 12M tokens avg per session. This is a **session length effect**: each additional turn re-reads all previous cache checkpoints.

---

## Root Cause: Two Commits on Apr 16–17

### Commit 1: `920e65ca` — Apr 16 04:43
**"feat(astrolabe,spider): add GSD-style task manifest to planner output"**

The sage-writer now appends a `<task-manifest>` XML block (3–8 tasks) to every planning output. Each task has `<verify>` (an executable command) and `<done>` (outcome criterion).

The implement engine's `EXECUTION_EPILOGUE` changed from:
```
\n\nCommit all changes before ending your session.
```
to structured rules: work task-by-task, run each `<verify>` command after each task, commit after each task.

**Behavioural shift:**
- Before: read writ → write code → commit → done
- After: for each task: write code → run verify → review output → commit → repeat

This turned a bounded single-pass session into an iterative multi-task loop.

### Commit 2: `260f5cf9` — Apr 17 17:01
**"sage-writer: inline click content, do not preserve ids in the brief"**

Paired with `da0e460` granting sage roles `ratchet:read`. The sage-writer now resolves every click reference in the brief/decisions (`click-extract`, `click-show`) and inlines the full rationale into the spec, making the planning output and the `writ.body` substantially larger and more detailed.

This fed forward into implement sessions (especially via `${yields.plan-finalize.spec}` in the plan-and-ship rig, introduced Apr 18-19), producing longer and richer prompts for the implementer.

---

## Quality vs Cost Tradeoff

The cost increase coincided with **measurably better work**:

| Metric | pre-Apr16 | post-Apr16 |
|---|---|---|
| Rig success rate | 83% | 94% |
| Avg git commits/session | 0.8 | 1.7 |
| Multi-commit sessions | 4% | ~20% |
| Avg turns/session | 77 | ~150 |
| Avg verify calls/session | 5.5 | 16 |
| Zero-commit sessions | ~20% | ~5% |

The success rate improvement (83% → 94%) and the near-elimination of zero-commit sessions suggest the structured task manifest is producing better implementation discipline. The cost is real but not waste.

**Verify call distribution:** Average position of verify calls in session timeline was 0.58 pre and 0.58 post — identical. The task manifest didn't move verification to earlier in sessions; it **amplified** behavior already latent. What changed was volume (5.5 → 16 verify calls avg), not placement. The agents were already verifying incrementally.

---

## Recommendations to Reduce Cost (ranked by impact vs effort)

### 1. Verify engine as a separate rig stage ★★★ (high impact, clean architecture)
Split the rig: `implement` (write code, commit — no tests) + `verify` engine (fresh session, runs test suite, reports pass/fail). If verify fails, post a narrow patch mandate. Implement sessions get dramatically cheaper — bounded by "write and commit." Verification still happens but in a context-free session where it's cheap. This is architecturally correct: what-to-build vs did-it-work are separate concerns. The `implement-loop` / `piece-session` plumbing from Apr 16 (`8d2f548`) was exploring this direction before it was disabled (`fb64473`).

### 2. Narrow the verify commands in the task manifest ★★★ (medium impact, low effort)
The manifest currently doesn't constrain scope — `pnpm -w test` runs the entire monorepo suite every task. Requiring the sage-writer to produce `pnpm --filter @shardworks/affected-package test` (package-scoped) instead would cut tool_result size, execution time, and the output token cost of reading test results. Change is in `sage-writer.md` manifest rules.

### 3. ~~Checkpoint-and-fresh-session architecture~~ — **tried, made things worse**
The `implement-loop` / `piece-session` work (Apr 16, `8d2f548`, `9839e0e`) explored this: end session after each task, start a fresh one with a compact handoff. Was subsequently disabled (`fb64473`).

**Why it backfired:** each fresh session must orient itself — read the relevant files, understand codebase state, establish context. That orientation is paid as `cacheWriteTokens` ($3.75/Mtok, ~5× more expensive than cache reads). With N tasks you pay N × orientation writes instead of 1 × amortized write that all subsequent turns re-read cheaply. The compounding re-read cost of one long session was cheaper than repeated cold-start writes across N piece sessions. **Not recommended.**

### 4. Defer all verification to seal engine ★★ (medium impact, easy, quality tradeoff)
The `seal` engine runs next before merging. Add a test-run as seal's first step. If tests fail, seal fails and posts a narrowly-scoped patch mandate. Implement becomes: write code → commit → done. Cheaper per session. Tradeoff: seal doesn't have the implementation context for intelligent failure diagnosis. Mid-task test failures caught late are harder to fix. Acceptable if seal failures are rare.

### 5. Verify-reasoning subagent for failures only ★ (targeted, low effort)
Normal `pnpm test` runs inline (cheap). When a verify step *fails*, spawn a subagent: "here's the test failure, here's the diff, diagnose and commit a fix." The diagnostic chain-of-thought stays in the subagent; only the fix summary returns to the parent. Subagents don't help for pure command execution (output lands in parent context anyway) but help when failure-diagnosis reasoning is substantial.

### 6. Bound manifest body size ★ (small improvement, very low effort)
Require sage-writer to cap total manifest to 6 tasks and `<action>` fields to 150 words each. Smaller initial prompt → smaller turn-1 cache write → cheaper every-turn cache re-read. Add to `sage-writer.md` manifest rules.

---

## Current Understanding

The implement engine is paying for **deliberateness**. The task manifest made sessions longer, more incremental, and better. The cost mechanism is Claude's cache being re-read on every additional turn — not a system prompt explosion, not input size growth, but compound re-reading of a growing conversation history. Every verify cycle (2-3 turns) adds to the stack that every subsequent turn has to re-read.

The best intervention is structural: separate implementation (expensive, context-rich) from verification (cheap, context-free) as distinct rig stages. This preserves the quality gains while cutting implement session length roughly in half.
