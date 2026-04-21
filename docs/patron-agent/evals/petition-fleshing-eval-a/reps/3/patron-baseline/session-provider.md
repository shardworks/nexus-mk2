# Detached Claude-Code Session Provider

I want claude-code anima sessions to survive the death of the Guild process that launched them. Today they run as child processes of the Spider, so a Spider restart or crash takes every in-flight anima down with it and leaves their work in limbo. Since we can now cancel sessions cross-process (w-mnrroznr-ef81f7ffe972), the child-process coupling has outlived its usefulness. Detach the sessions, give them a minimal harness that can still run the Animator books, and make sure engine sessions still route their result back into the engine's status and yields.

## Reader and decision

The reader is the **guild operator** (me, or another patron running a guild day-to-day). The decision this informs: _"Can I safely restart the Spider — or let it crash and recover — without losing in-flight anima work?"_ Today the answer is no, and that makes the Spider a single point of failure. I want the answer to be yes.

Secondary reader: the **engine author** writing a long-running engine that spawns anima sessions. They need to trust that a session dispatched from their engine will report back a result even if the Spider bounces mid-run.

## Scope

**In:**
- The `claude-code` session provider specifically. It launches detached; the Spider (or whoever called it) is no longer its parent.
- A minimal harness process that wraps each detached session and runs the Animator books (session-record, writ updates, click updates, standing-order firing).
- A result-delivery path: when the harness finishes, the session's terminal status, yields, and artifacts are written somewhere durable that the originating engine picks up on its next tick.
- Engines: specifically, the engine status/yield feedback loop must survive a Spider restart that occurred _between_ the session starting and finishing.
- Session cancellation: the existing cross-process cancel path (w-mnrroznr-ef81f7ffe972) must still work against detached sessions.

**Out:**
- Other session providers (dummy, mock, etc.) — leave them as-is unless the harness abstraction naturally covers them for free.
- Rewriting the Animator. The harness runs the _existing_ books; it doesn't replace them.
- A full process-supervision story (restart policies, crash loops, resource limits). Out of scope here — assume the harness runs to completion or fails cleanly.
- Distributed execution across machines. Same host for now.

## How it works

**Launch.** When the claude-code provider is asked to start a session, it spawns the harness process with `detached: true` and `stdio: 'ignore'` (or writes stdio to the session's log file), then `unref`s it. The provider returns the session id immediately; it does **not** hold a handle to the child. The harness is responsible for its own lifecycle from that point.

**The harness.** A small node entrypoint (`nexus-session-harness` or equivalent) that takes a session manifest path as its argument. It:
1. Loads the manifest and resolves the anima/curriculum/context.
2. Runs the Animator's session-open book (records the session as live).
3. Launches the actual `claude` CLI as its own child, capturing stdout/stderr to the session log.
4. On `claude` exit, runs the session-close book: writes the final status (`completed` / `failed` / `cancelled`), the yield (parsed from the transcript or a sentinel file the session wrote), and any artifact references.
5. Fires whatever standing orders the close book triggers (engine wake-ups, etc.).
6. Exits.

**Result delivery to engines.** The harness writes the session's outcome to the guild's books — same place today's in-process flow writes it. The engine doesn't poll the harness; it reads from the books on its next tick (or wakes on a standing order that the close book fires). This means the feedback loop is already durable — an engine that was running when the session started and is running when it closes sees the yield, regardless of what happened to the Spider in between.

**Cancellation.** The cancel path writes a cancel signal into the session's state (the mechanism from w-mnrroznr-ef81f7ffe972). The harness checks for this signal on a timer and, when seen, sends SIGTERM to its `claude` child, then runs the close book with status `cancelled`. No change to the caller's API.

**Spider restart mid-session.** The Spider comes back, reads the books, sees sessions in `live` state with detached harnesses still running. It does nothing — the harness will close the session itself. The Spider only needs to re-wire standing-order listeners so it catches the close events when they fire.

**Orphan detection.** On Spider startup, scan for sessions marked `live` whose harness pid no longer exists. Mark those `failed` with reason `harness-died`. This is the failure mode I care about; don't try to recover, just don't leave them in `live` forever.

## Assumptions I made

- The Animator books are runnable from a standalone process given a manifest path — not tightly coupled to the Spider's in-memory state. If they are coupled, that coupling needs to be broken first.
- Standing-order firing from the harness works the same way it works from the Spider (writes an event that any listener picks up). If standing orders only fire in-process, we need an event-bus touchpoint.
- Engines already tolerate yield-arrival being asynchronous from dispatch. If an engine holds a live reference to a session handle and blocks on it, that engine needs adjustment — but I believe the engine model is tick-based and reads from the books, so this should be fine.
- The `claude` CLI itself doesn't require a live parent for anything (TTY, stdin prompts, etc.). If it does, the harness supplies whatever stub it needs.
- Session logs written to disk are an acceptable substitute for piping stdio back to a parent.

## Deferred questions

- Where does the harness binary live and how is it installed? Published package, repo-local script, or baked into the `nexus` CLI as a subcommand?
- Do we need a heartbeat from the harness (e.g., touch a file every N seconds) so we can distinguish "harness crashed" from "harness is doing slow work"? I lean yes, but it's not strictly required for the MVP.
- On orphan detection: is "mark failed" enough, or should the engine that dispatched the session get a more specific failure reason so it can decide whether to retry?
- Does the minimal harness need to support any other provider besides claude-code on day one? If yes, the shape generalizes; if no, keep it provider-specific until a second caller shows up.
