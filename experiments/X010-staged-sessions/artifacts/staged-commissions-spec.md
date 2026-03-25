# Staged Commissions — Draft Spec

## Problem

An anima gets one session per job. If the job is large or medium-complex, the context window fills up — quality degrades, coherence on earlier decisions erodes, and the agent starts losing the thread. There's no way to break work into smaller cognitive chunks while keeping the same job, worktree, and branch.

## Design

Allow an anima to exit mid-job and be automatically re-summoned in a fresh session, in the same worktree, with a clean context window. The anima bridges context between stages using the **stroke record** — a structured checklist of planned and completed work items maintained via a tool during execution.

### The Continuation Signal: Stroke Record

The stroke record (maintained via a tool throughout the job) serves as both:

1. **The continuation signal** — pending strokes mean "more work to do."
2. **The context bridge** — the record tells the next session exactly what's been done, what's in progress, and what remains. No freeform summarization needed.

When all strokes are marked complete and no new strokes have been added, the job is finished.

This replaces the earlier design of a freeform stage notes file (`.nexus-stage.md`). The stroke record is superior because:

- **Structural, not narrative.** The next session gets a checklist, not prose written under context pressure.
- **Already maintained.** The anima records strokes as part of normal job execution — there's no extra "write handoff notes" step at the end of a session.
- **Mechanically inspectable.** The clockworks can check stroke status without parsing markdown.
- **Crash-resilient.** Strokes are recorded via tool calls throughout the session, not in a single write at the end. If the session crashes, completed strokes are already recorded.

A freeform notes field may still accompany the stroke record for nuance ("discovered the API doesn't support batch operations, remaining strokes need to account for this"), but the structural backbone of the handoff is mechanical.

### Modified Event Flow

Today:
```
commission.posted → workshop-prepare → commission.ready → summon anima
                                                                ↓
                                                          session runs
                                                                ↓
                                                   commission.session.ended → workshop-merge
```

With staging:
```
commission.posted → workshop-prepare → commission.ready → summon anima
                                            ↑                    ↓
                                            |              session runs
                                            |              anima records strokes, commits work, exits
                                            |                    ↓
                                            +----- YES ← pending strokes in record?
                                                              ↓ NO
                                                   commission.session.ended → workshop-merge
```

### What Changes

**1. Clockworks post-session logic** (`packages/core/src/clockworks.ts`, `executeAnimaOrder`)

After `launchSession()` returns for a job dispatch, before signaling `commission.session.ended`, check the stroke record for the current job:

- **Pending strokes exist** → signal `commission.ready` with the existing `{ commissionId, workshop, worktreePath }`. This re-enters the existing standing order pipeline. The worktree is reused via `workshop-managed` workspace kind (already supported).
- **All strokes complete (or no strokes recorded)** → signal `commission.session.ended` as today. Normal merge flow.

This is a small change in the clockworks. No new events. No new standing orders. `workshop-merge` is untouched.

**2. Artisan temperament** (`packages/guild-starter-kit/temperaments/artisan/content.md`)

Add a section teaching animas about staging:

- Record your strokes using the stroke tool throughout the job. Plan them at the start, mark them complete as you go, add new ones as you discover work.
- If you can't finish all strokes in one session, commit what you have and exit cleanly. The system will re-summon you in a fresh session with your stroke record intact.
- Your next session will be a fresh context — you won't remember anything from this session except what's in the stroke record and the committed code.
- When all strokes are done, exit normally. The system detects completion and proceeds to merge.

**3. Guild operations curriculum** (`packages/guild-starter-kit/curricula/guild-operations/content.md`)

Update the commission lifecycle section to mention the staging loop and stroke-based continuation.

**4. Stroke tool**

The stroke recording tool must persist stroke state in a location accessible to the clockworks for the continuation check. Options:

- **Ledger** — strokes written to a Ledger table. Clockworks queries the table. Most consistent with the rest of the system.
- **Worktree file** — strokes written to a well-known file in the worktree. Simpler but less integrated.

Leaning toward: **Ledger.** The stroke record is operational state — it belongs alongside commissions, sessions, and events. The tool writes to the Ledger; the clockworks reads from it. The assembled prompt for the next stage includes the stroke record pulled from the Ledger.

### What Doesn't Change

- **No new events.** The loop uses the existing `commission.ready` event.
- **No new standing orders.** The existing `on: commission.ready → summon: artificer` order handles re-summoning.
- **`workshop-merge` is untouched.** It only fires after the staging loop completes.
- **`workshop-prepare` is untouched.** It runs once at the start; the loop happens downstream.
- **Session funnel is untouched.** Each stage is a normal session.
- **Commission status stays `in_progress`** throughout all stages.
- **The worktree persists** — `workshop-prepare` creates it, `workshop-merge` tears it down, and the staging loop happens in between.

## Open Questions

### 1. Loop guard

An anima could theoretically stage forever. Do we need a cap?

Options:
- **Hard cap** — fail the commission after N stages (e.g. 5 or 10). Simple, safe.
- **Soft cap** — warn after N stages but allow continuation. More flexible, more rope.
- **No cap** — trust the anima's judgment. Add a cap later if needed.
- **Budget-based** — cap total cost across all stages rather than stage count. More meaningful but harder to implement (need to sum costs from `commission_sessions`).
- **Progress-based** — detect stalling by comparing stroke completion rates across stages. If the last N stages completed zero strokes, something is wrong.

The stage count would need to be tracked somewhere — either as a counter in the event payload (incremented each time `commission.ready` is re-signaled) or derived from the `commission_sessions` join table (count of sessions for this commission).

Leaning toward: **start with no cap.** We don't have enough data yet to know what a reasonable cap is. Add instrumentation (stage count in the event payload) so we can observe, and add a cap later when we have real usage patterns. The stroke record provides natural stall detection data when we're ready to use it.

### 2. Stage count tracking

Even without a cap, we probably want to know which stage we're on — for observability, debugging, and potentially telling the anima "you're on stage 3 of this job."

Options:
- **Payload counter** — `commission.ready` payload includes `{ stage: N }`. Clockworks increments it each time. Simple, self-contained.
- **Derived from ledger** — count rows in `commission_sessions` for this commission. No new fields, but requires a DB query.
- **Both** — payload for convenience, ledger for source of truth.

Leaning toward: **payload counter.** It's cheap, it flows naturally through the event system, and it's immediately available to the anima's prompt without querying the ledger. The initial `commission.ready` from `workshop-prepare` would carry `stage: 1`, and the clockworks would increment on re-signal.

### 3. Should the job spec be re-delivered each stage?

Currently, the clockworks reads commission content from the ledger and passes it as the user prompt. For staged jobs, the second session would get the same full spec again, plus the stroke record.

Is this redundant? Or is it useful to have the original brief every time? The job spec provides the overall goal; the stroke record provides the local context. Together they answer "what am I building?" and "where did I leave off?"

Leaning toward: **yes, re-deliver the job spec every stage.** The context window is fresh — the anima needs the full picture. The stroke record supplements, not replaces, the original brief. The combined prompt could be structured as:

```
[original job spec]

---

## Stroke Record (from previous session)

[structured stroke checklist from Ledger]

## Session Notes

[any freeform notes from the stroke tool, if present]

This is stage N of a multi-stage job. The above record was produced by previous sessions.
```

### 4. Same anima or fresh anima each stage?

Currently, `commission.ready` summons an anima by role. Should each stage summon the same anima, or is it fine to let role resolution pick whoever's available?

With only one anima per role on the roster (typical), this is moot. With multiple, do we want continuity of identity across stages, or is the stroke record sufficient context for any anima to pick up?

Leaning toward: **let role resolution handle it.** The stroke record is the continuity mechanism, not the anima's identity. If we later want affinity (same anima across stages), we can add it, but it's not needed for the basic mechanism.

### 5. What if the session crashes?

If the session exits with a non-zero exit code (error, timeout, budget exceeded), should we still check the stroke record?

Options:
- **Always check** — maybe the anima committed useful work and recorded strokes before crashing. Respect the signal.
- **Only on clean exit** — treat crashes as failures.
- **Check but with nuance** — on crash, check stroke record. If progress was made (new strokes completed since last stage), re-summon with crash context. If no progress, treat as failure.

Leaning toward: **always check.** Strokes are recorded incrementally via tool calls throughout the session, not in a single write at the end. If the anima recorded 4/7 strokes complete before crashing, that progress is real and durable. Re-summoning gives them a chance to finish. The worst case is one wasted stage — the loop guard (if we add one) bounds the damage.

### 6. Does `workshop-prepare` need to know about staging?

Currently, `workshop-prepare` fires `commission.ready` with `{ commissionId, workshop, worktreePath }`. The clockworks re-signals `commission.ready` with the same shape. `workshop-prepare` only runs once (on `commission.posted`), so it's never re-invoked during staging.

But: `workshop-prepare` sets `stage: 1`? Or does the clockworks add `stage` only on re-signal? Need to decide who owns the initial stage number.

Leaning toward: **clockworks owns the stage counter.** `workshop-prepare` doesn't know or care about stages — it just prepares the worktree and signals `commission.ready`. The clockworks post-session logic adds `stage: N` when re-signaling. On the first pass, the absence of `stage` in the payload (or `stage: 1`) means "first stage." This keeps `workshop-prepare` untouched.
