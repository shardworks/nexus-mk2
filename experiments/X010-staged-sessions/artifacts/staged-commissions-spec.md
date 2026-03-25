# Staged Commissions — Draft Spec

## Problem

An artificer gets one session per commission. If the task is large or medium-complex, the context window fills up — quality degrades, coherence on earlier decisions erodes, and the agent starts losing the thread. There's no way to break work into smaller cognitive chunks while keeping the same commission, worktree, and branch.

## Design

Allow an artificer to exit mid-commission and be automatically re-summoned in a fresh session, in the same worktree, with a clean context window. The artificer bridges context between stages by leaving a notes file in the worktree.

### The Signal: Stage Notes File

A file at a well-known path in the worktree root (e.g. `.nexus-stage.md`) serves as both:

1. **The continuation signal** — its presence means "more work to do."
2. **The context bridge** — its contents tell the next session what's been done, what's next, and any decisions or constraints.

When the artificer is done with all work, they simply don't leave the file (or delete it if one exists from a prior stage). The absence of the file means "I'm finished."

### Modified Event Flow

Today:
```
commission.posted → workshop-prepare → commission.ready → summon artificer
                                                                ↓
                                                          session runs
                                                                ↓
                                                   commission.session.ended → workshop-merge
```

With staging:
```
commission.posted → workshop-prepare → commission.ready → summon artificer
                                            ↑                    ↓
                                            |              session runs
                                            |              artificer commits, writes stage notes, exits
                                            |                    ↓
                                            +----- YES ← stage notes file exists?
                                                              ↓ NO
                                                   commission.session.ended → workshop-merge
```

### What Changes

**1. Clockworks post-session logic** (`packages/core/src/clockworks.ts`, `executeAnimaOrder`)

After `launchSession()` returns for a commission summon, before signaling `commission.session.ended`, check whether the stage notes file exists in the worktree:

- **File exists** → signal `commission.ready` with the existing `{ commissionId, workshop, worktreePath }`. This re-enters the existing standing order pipeline. The worktree is reused via `workshop-managed` workspace kind (already supported).
- **File absent** → signal `commission.session.ended` as today. Normal merge flow.

This is a ~10-line change in the clockworks. No new events. No new standing orders. `workshop-merge` is untouched.

**2. Artisan temperament** (`packages/guild-starter-kit/temperaments/artisan/content.md`)

Add a section teaching artificers about staging:

- If the work is too large for one session, commit what you have, write the stage notes file, and exit.
- The stage notes file must contain: what's been completed, what remains, and any key decisions or constraints the next session needs to know.
- When you finish the final stage, make sure the stage notes file does not exist.
- Your next session will be a fresh context — you won't remember anything from this session except what's in the stage notes file and the committed code.

**3. Guild operations curriculum** (`packages/guild-starter-kit/curricula/guild-operations/content.md`)

Update the commission lifecycle section to mention the staging loop.

**4. Stage notes file path**

The file lives in the worktree root. It needs a well-known path the clockworks can check mechanically.

### What Doesn't Change

- **No new events.** The loop uses the existing `commission.ready` event.
- **No new standing orders.** The existing `on: commission.ready → summon: artificer` order handles re-summoning.
- **`workshop-merge` is untouched.** It only fires after the staging loop completes.
- **`workshop-prepare` is untouched.** It runs once at the start; the loop happens downstream.
- **Session funnel is untouched.** Each stage is a normal session.
- **Commission status stays `in_progress`** throughout all stages.
- **The worktree persists** — `workshop-prepare` creates it, `workshop-merge` tears it down, and the staging loop happens in between.

## Open Questions

### 1. Stage notes file path

Candidates:
- `.nexus-stage.md` — visible, obvious, easy to spot
- `.nexus/stage.md` — tucked into a dot-directory, less likely to be accidentally committed
- Something else?

The file should NOT be committed — it's ephemeral coordination, not part of the work product. But we can't rely on `.gitignore` in the workshop repo (we don't control it). Should the clockworks delete the file before re-summoning, so each stage starts clean and the artificer must actively re-create it to continue? Or should it persist so the next session can read it?

Leaning toward: **persist it, let the artificer manage it.** The artificer reads it on startup, does work, then either updates it (more stages) or deletes it (done). The clockworks only reads it — never writes or deletes.

### 2. Loop guard

An artificer could theoretically stage forever. Do we need a cap?

Options:
- **Hard cap** — fail the commission after N stages (e.g. 5 or 10). Simple, safe.
- **Soft cap** — warn after N stages but allow continuation. More flexible, more rope.
- **No cap** — trust the artificer's judgment. Add a cap later if needed.
- **Budget-based** — cap total cost across all stages rather than stage count. More meaningful but harder to implement (need to sum costs from `commission_sessions`).

The stage count would need to be tracked somewhere — either as a counter in the event payload (incremented each time `commission.ready` is re-signaled) or derived from the `commission_sessions` join table (count of sessions for this commission).

Leaning toward: **start with no cap.** We don't have enough data yet to know what a reasonable cap is. Add instrumentation (stage count in the event payload) so we can observe, and add a cap later when we have real usage patterns.

### 3. Stage count tracking

Even without a cap, we probably want to know which stage we're on — for observability, debugging, and potentially telling the artificer "you're on stage 3 of this commission."

Options:
- **Payload counter** — `commission.ready` payload includes `{ stage: N }`. Clockworks increments it each time. Simple, self-contained.
- **Derived from ledger** — count rows in `commission_sessions` for this commission. No new fields, but requires a DB query.
- **Both** — payload for convenience, ledger for source of truth.

Leaning toward: **payload counter.** It's cheap, it flows naturally through the event system, and it's immediately available to the artificer's prompt without querying the ledger. The initial `commission.ready` from `workshop-prepare` would carry `stage: 1`, and the clockworks would increment on re-signal.

### 4. Should the commission spec be re-delivered each stage?

Currently, the clockworks reads `commission.content` from the ledger and passes it as the user prompt. For staged commissions, the second session would get the same full commission spec again, plus whatever's in the stage notes file.

Is this redundant? Or is it useful to have the original brief every time? The commission spec provides the overall goal; the stage notes provide the local context. Together they answer "what am I building?" and "where did I leave off?"

Leaning toward: **yes, re-deliver the commission spec every stage.** The context window is fresh — the artificer needs the full picture. The stage notes supplement, not replace, the original brief. The combined prompt could be structured as:

```
[original commission spec]

---

## Stage Notes (from previous session)

[contents of stage notes file]

This is stage N of a multi-stage commission. The above notes were left by the previous session.
```

### 5. Same anima or fresh anima each stage?

Currently, `commission.ready` summons "an artificer" — which resolves to an active anima holding the artificer role. Should each stage summon the same anima, or is it fine to let role resolution pick whoever's available?

With only one artificer on the roster (typical), this is moot. With multiple artificers, do we want continuity of identity across stages, or is the stage notes file sufficient context for any artificer to pick up?

Leaning toward: **let role resolution handle it.** The stage notes file is the continuity mechanism, not the anima's identity. If we later want affinity (same anima across stages), we can add it, but it's not needed for the basic mechanism.

### 6. What if the session crashes?

If the artificer's session exits with a non-zero exit code (error, timeout, budget exceeded), should we still check for the stage notes file?

Options:
- **Always check** — maybe the artificer committed useful work and wrote stage notes before crashing. Respect the signal.
- **Only on clean exit** — treat crashes as failures. If exit code != 0 and stage notes exist, fire `commission.session.ended` anyway and let the merge engine (or a failure handler) sort it out.
- **Check but with nuance** — on crash, check for stage notes. If present, re-summon but include crash context in the prompt. If absent, treat as failure.

Leaning toward: **always check.** The stage notes file is an explicit, deliberate signal. If the artificer wrote it before crashing, they likely committed meaningful work. Re-summoning gives them a chance to recover. The worst case is one wasted stage — the loop guard (if we add one) bounds the damage.

### 7. Does `workshop-prepare` need to know about staging?

Currently, `workshop-prepare` fires `commission.ready` with `{ commissionId, workshop, worktreePath }`. The clockworks re-signals `commission.ready` with the same shape. `workshop-prepare` only runs once (on `commission.posted`), so it's never re-invoked during staging.

But: `workshop-prepare` sets `stage: 1`? Or does the clockworks add `stage` only on re-signal? Need to decide who owns the initial stage number.

Leaning toward: **clockworks owns the stage counter.** `workshop-prepare` doesn't know or care about stages — it just prepares the worktree and signals `commission.ready`. The clockworks post-session logic adds `stage: N` when re-signaling. On the first pass, the absence of `stage` in the payload (or `stage: 1`) means "first stage." This keeps `workshop-prepare` untouched.
