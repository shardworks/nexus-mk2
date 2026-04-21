# Detach claude-code anima sessions from the spider

I want to be able to restart the spider — for a deploy, a config change, or because something is wedged — without killing every anima session in flight. Today, because the claude-code session provider spawns the child as a direct subprocess of the guild process that called it, spider termination leaves sessions half-done in an indeterminate state. The fix is to spawn detached, let sessions outlive the guild, and teach the guild how to pick the result back up when the child eventually finishes.

## Reader and decision

**Reader:** me (or another operator) as spider-host; also any engine that has dispatched an anima session and needs its yields.

**Decision:** "Can I restart the spider right now without losing in-flight anima work?" Today the answer is no and I pay for it in lost runs. I want the answer to be yes, always.

**Frequency:** every spider restart — currently several times a day during active development, will stay high as long as framework churn is high.

## Scope

**In:**
- The claude-code session provider spawns detached (e.g. `spawn(..., { detached: true }).unref()` or equivalent), so the child has no process-tree dependency on the spider.
- A **minimal session harness** — the smallest runtime around the claude-code invocation that has book access and event-emit access, and nothing else. It's the process the spider *launches* and then forgets.
- A **result-feedback path** for engine-dispatched sessions: the session's outcome lands structurally in a book, emits an event, and the engine picks it up on next tick.
- Engine status vocabulary for "session dispatched, waiting for completion event" — a new `status` shape distinct from "currently running in my subprocess."

**Out:**
- Any other session provider. Only claude-code. No speculative generalization to future providers (#18). When a second provider shows up and wants the same treatment, we'll extract; not before.
- A process manager / supervisor / queue worker layer. The detached child supervises itself; OS + filesystem are the durability layer. No new daemon (#27).
- Cross-host / remote execution. Same box, same filesystem.
- Backwards compatibility with the current attached-child behavior. New stuff, no shim (#1, #10). The session provider gets rewritten, not dual-moded.

## How it works

**Spawn shape.** The session provider's job ends at "detached child launched, session-id recorded." No waiting, no piping, no await. The spider is free to die immediately after. The child owns its own stdio — redirected to a session-scoped log file inside the session's working area, not inherited from the spider.

**The harness.** A small Node entry point — call it the **animator harness** — that the session provider launches instead of claude-code directly. It takes a session-id, loads *just enough* guild context to reach (a) the Animator book for this session and (b) the clockwork event bus. It runs claude-code, streams progress into the book as it already does today, writes a completion record on exit, emits a `session-complete` (or whatever the existing name is) event, and exits. It is not a general-purpose guild runtime — it is the animator-side slice of one, specifically shaped to not need the spider (#8, #9).

**Result feedback for engines** (#14, #16, #20). The engine does not receive the child's stdout or return value. The engine produces its own yields — that's its identity, I won't have it passed a ready-made result (#16). Instead:

1. When an engine dispatches an anima session, it sets its status to something like `awaiting-session` with the session-id recorded in the status payload. Structural, queryable, lives where plan-review and Oculus already look (#20, #28).
2. The detached child, on completion, writes the outcome as a row in the session/Animator book. Structural, on-disk, durable past the spider.
3. The book write fires a clockwork event carrying the session-id.
4. A standing order routes that event back to the engine, which reads the completion row and produces its yields in its next pass.

This is an extension of the existing engine-status + clockwork-event shape, not a parallel pipeline (#3, #26). The event is the resumption trigger; the book row is the truth.

**Failure modes.** If the child crashes, its completion row says so — the engine resumes with a failure yield, not a hang. If the child is still running when the spider comes back up, the engine sees `awaiting-session` in its status and does nothing until the event arrives; no double-dispatch. If the event was emitted while no spider was alive to receive it, the engine's resume tick re-checks the book on startup — **pull on resume, don't rely on replayed events** (#4, #19).

**Cancellation.** We already have cross-session cancel via writs (the brief cites it). Cancel is out-of-process by signal or by a sentinel the child polls — either works; I don't have a preference yet. The harness needs to treat cancellation as a first-class completion outcome and write a cancelled-row same as success/failure. Complete the set (#36): start-detached, cancel, read-status — all three already exist or land in this work.

## Assumptions I made

- The spider is in fact the current spawner. Brief said "probably." Worth confirming before anyone touches code.
- There is already a book where session progress/outcomes land — the Animator book or something near it. I'm assuming we write the completion row there, not inventing a new book (#27).
- There is already a clockwork event shape for "session transitioned" or similar. If there isn't, we need one, and it belongs in the existing clockwork event vocabulary, not a new channel.
- The harness can load enough of `guild()` to reach books + event bus without dragging in the spider, the clerk, or the rest of the apparatus. If that's not true, the blocker is framework-level and wants a separate petition.
- `detached: true` + `unref()` is genuinely sufficient on our target platforms (Linux, macOS). No need for systemd units or launchd plists.

## Deferred questions

- Confirm the spawner. If it's not the spider, the harness's "book + event bus only" slice may need adjusting.
- Does the harness need to also handle non-engine dispatches (direct commissions, interactive coco-launched sessions), or only engine-dispatched ones? I've fleshed this assuming **all claude-code sessions go through the harness uniformly** — one path, not two — but the engine-result-feedback half only applies when an engine is waiting. Worth confirming that uniform-harness is the right call vs. engine-dispatched-only.
- Completion-row schema: does an existing row type cover success / failure / cancelled, or do we need a new writ/book-row type? If new, it should be named in this petition, not deferred to the planner.
- Log file location and retention for detached-child stdio. Inside the session's working area is my default; confirm.
