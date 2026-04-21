# Detach claude-code sessions from the spider, and drive engine yields through books

I want anima sessions to outlive the guild process that spawned them. Right now, killing the spider kills every in-flight claude-code session — that is unacceptable for long commissions, hostile to spider restarts, and it entangles two concerns (process supervision and anima execution) that belong apart.

The brief's framing is mostly right, but I want to reframe the second half: the "minimal harness" is not primarily about how to *carry results back* to the engine — it's about making the session's result a **structural write to its Animator book**, so that no live parent is ever required to receive it. Once results live in books, detachment is almost free and engines stop caring whether the spider is alive (#16, #20, #27).

## Reader and decision

- **Patron (me), operators:** "Can I restart the spider right now without losing in-flight anima work?" Expected answer after this lands: yes, always. Frequency: whenever the guild is upgraded, restarted, or the spider crashes — routinely.
- **Engines awaiting an anima session:** "Is the session I dispatched done, and what did it yield?" Answered by reading the Animator book, not by holding a process handle. Frequency: every tick for any engine with an outstanding session.

## Scope

**In:**
- Claude-code session provider spawns sessions **detached** from the spider's process tree — spider death does not propagate.
- A thin **harness** wraps each session: writes a start record to the Animator book, streams structured yields into the book, writes a **terminal record** on exit (success, failure, cancellation).
- Engine yield/status ingestion reads from the Animator book — there is no live IPC channel between engine and session.
- Liveness: harness writes a heartbeat; absence of heartbeat past a threshold with no terminal record marks the session **stuck-loudly** (#2), not silently abandoned.
- Spider restart behavior: on startup, the spider treats in-flight sessions as already live; it does not try to re-adopt their process tree. It just lets the next engine tick read the book (#19 — the state lives in books, not in memory).
- Cancellation path (w-mnrroznr-…) keeps working: the harness polls for a cancel record and exits cleanly, writing the terminal record.

**Out:**
- Process supervision / restart-on-crash. No second consumer yet (#18). If a harness dies hard, the session is marked stuck; I'll decide what to do next manually.
- Cross-host execution, container orchestration, session migration. No.
- A new "session service" or long-lived daemon separate from the spider. The harness is one process per session, thin, disposable (#8, #26).
- Any bridge for the old coupled-to-spider shape. This is Mk 2.1; no compat window (#1, #10).

## How it works

1. **Dispatch:** when the spider (or whatever engine-owner is live) spawns an anima session, the session provider `fork+setsid`s (or equivalent) the harness and returns immediately. Parent process death does not signal the harness.
2. **Harness responsibilities, and only these:**
   - Write `session-started` record to the Animator book with session id, anima, rig, inputs.
   - Exec claude-code; translate its streamed output into structured book records (yields, tool calls — whatever we're already recording today, now written by the harness itself instead of by the parent).
   - Heartbeat: a `session-alive` tick into the book every N seconds.
   - On exit (any path — success, failure, signal, cancel-record-observed): write exactly one `session-ended` record with the terminal status and the final yield payload.
3. **Engine feedback:** the engine does not hold a handle. On each tick, for each outstanding session id it owns, it reads the Animator book; presence of `session-ended` advances the engine; absence + stale heartbeat marks stuck (#2, #20). This is the same shape the clockworks already rely on for event-driven coordination (#27).
4. **Sibling completeness (#36):** this change ships the set — spawn-detached, heartbeat, terminal-record, engine-read-path, and the spider-restart semantic — together. Shipping just "detach" without "engine reads book instead of IPC" leaves a half-surface that the next consumer routes around.

## Assumptions I made

- The Animator book can carry `session-started`, `session-alive`, and `session-ended` records, or the extension is trivial. If not, that extension is part of this commission, not a dependency on another.
- The cancellation mechanism from w-mnrroznr-ef81f7ffe972 is already book-mediated (the canceller writes a record, the target observes it). If it's IPC-based, that's part of this scope too.
- "Heartbeat with stuck threshold" is acceptable diagnostic behavior — I'd rather a session be marked stuck visibly than have engines spin waiting on a dead harness.
- One harness process per session. No pooling, no shared supervisor.

## Deferred questions

- **Detachment mechanism:** `setsid` + `fork` vs. `systemd-run --user --scope` vs. something else. Planner's call based on what works reliably on our target hosts; I don't care which, I care that spider death is survivable.
- **Heartbeat cadence and stuck threshold.** Pick defaults; make them configurable later only if a second consumer asks.
- **Does the spider reattach on startup at all, or strictly ignore?** My default is *strictly ignore* (state lives in books), but confirm there's no existing feature that assumes reattachment.
- **Terminal-record atomicity:** if the harness dies between last yield and `session-ended`, what exactly does the engine see? I want fail-loud here — name the policy explicitly in the plan.
