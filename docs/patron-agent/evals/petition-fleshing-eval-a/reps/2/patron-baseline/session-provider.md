# Detach Claude Code anima sessions from the Guild process tree

I want the claude-code session provider to spawn anima sessions as **detached, independently lifecycled processes**, so that when the Spider (or whatever Guild process launched them) exits or restarts, the anima sessions keep running to completion and their results still make it back into the system's books. Today, a Spider restart silently orphans every in-flight session and leaves writs half-done. That's the problem I'm fixing.

## Reader and decision

The primary reader is the **Guild operator** (me, or another patron running a guild) who is deciding whether it's safe to stop, restart, or upgrade the Spider while animas are mid-task. Today the honest answer is "no, you'll corrupt state." After this, the answer should be "yes, sessions keep running and their outputs reconcile when the Spider comes back."

The secondary reader is any **engine** that yields while waiting on an anima session — it needs to be able to resume and correctly consume the session's result regardless of whether the Spider that launched the session is the same Spider that receives the result.

Decision cadence: every Spider restart, every time I need to ship a framework update, and any time a session outlives a single Spider uptime window (likely common for longer engine runs).

## Scope

**In:**
- The `claude-code` session provider: change its spawn behavior so child processes are detached (new session/process group, `stdio` redirected to files, no inherited lifetime from the parent).
- A **minimal session harness** — the thin wrapper process that hosts a claude-code session — capable of running the Animator books the session needs without requiring a live Guild/Spider process.
- A **result-landing mechanism**: when a detached session finishes, its outcome (success/failure, final transcript location, yield payload for engines) is written somewhere durable that the next Spider to come up can read and feed back into the originating writ or engine.
- Reconciliation on Spider start: scan for completed-but-unclaimed session results and apply them to their waiting writs/engines.
- Cancellation path continues to work (we already have cross-session cancel via `w-mnrroznr-ef81f7ffe972`); verify it still reaches detached processes.

**Out:**
- Other session providers (e.g., any non–claude-code provider). They can follow the same pattern later if it proves out.
- Cross-host detachment (running anima sessions on a different machine than the Spider). Same box only.
- Changing the engine programming model. Engines still yield and resume; we're just making resume survive a Spider bounce.
- Retry/restart policy for crashed session processes. Crashed is crashed — mark failed, move on. We can add auto-restart later.

## How it works

**Spawn.** When the claude-code provider starts a session, it `fork`s a harness process, detaches it (`setsid`, `stdio` to log files under the guild's session directory, `unref`), and returns the session's id + pid to the caller. The Spider does not keep a handle; it just records where to find the session.

**Harness.** The harness is a small Node/Bun entrypoint that: (1) loads only the Animator books required for this anima (curriculum + temperament + tools), (2) opens the claude-code conversation, (3) writes transcript + events to the session's log directory as it goes, (4) on exit, writes a **result sentinel** file (JSON: `{sessionId, writId, status, yield?, error?, completedAt}`) atomically into a `results/pending/` inbox inside the guild.

**Engine feedback.** An engine that yielded while waiting on a session is, today, parked against a writ. The reconciler (runs on Spider startup and on a filesystem watch while Spider is up) consumes sentinels from `results/pending/`, finds the waiting writ/engine, applies the yield payload to the engine's next step, and moves the sentinel to `results/applied/`. From the engine's perspective, a result arriving 2 seconds after yield and a result arriving after a Spider restart look identical.

**Cancellation.** Cross-session cancel sends a signal (or writes a cancel sentinel the harness polls) to the detached pid. Harness catches it, records a cancelled status, writes a result sentinel, exits.

**Observability.** `bin/` should gain (or extend) a command to list live detached sessions by reading the session directory — the Spider isn't the source of truth for "what's running" anymore; the filesystem is.

## Assumptions I made

- All detached sessions live on the same host as the Spider that launched them. No remote execution.
- A filesystem-based result inbox is acceptable; we don't need a message bus for this. The guild already uses files as the durable substrate.
- Animator books can be loaded by the harness without the full Guild runtime. If they can't, we have a bigger refactor to scope.
- "Minimal harness" means a process small enough that an idle session costs ~tens of MB, not hundreds. I want to be able to run 10+ concurrently without thinking about it.
- Claude Code's own process model tolerates being detached and having its stdio redirected to files.

## Deferred questions

- Do we need a **heartbeat** so the reconciler can detect a harness that died without writing a sentinel, or is "no sentinel after pid gone" sufficient?
- Where exactly do sentinels live — inside the guild directory (portable with the guild) or in a system-level spool (survives guild moves)? I lean guild-local.
- Should the harness re-attach to a running Spider over IPC when one exists (for live progress streaming), or is tailing the log file good enough for now? I'd ship with log-tail and add IPC only if operators complain.
- What's the engine-yield API contract today — does it already accept a deferred/async result, or will we need to widen it? Planner should confirm before touching engines.
