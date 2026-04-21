# Detach claude-code anima sessions from the guild process lifetime

I want anima sessions to outlive the guild process that dispatched them. Today the claude-code session provider spawns the anima as a child of whatever guild process called it (usually the spider), so killing or restarting the spider kills every running anima mid-thought and leaves their writs in limbo. Now that cross-session cancellation exists (w-mnrroznr-ef81f7ffe972), there is no reason for the guild process to be the keep-alive anchor. Detach the child, let it run to completion on its own, and make the result handoff go through the books — not through a live parent-child pipe.

## Reader and decision

The reader is **the operator restarting the spider** (me, or anyone running `nsg`) asking: *"is it safe to bounce the guild while anima are working?"* Today the answer is no; after this, the answer is yes. Frequency: multiple times a day in dev, whenever deploys or crashes happen in the vibers workspace. Secondary reader: **the engine consuming the session's result** — it needs to read the outcome from a durable place, not from a live child's stdout (#22).

## Scope

**In:**
- Detached spawn of claude-code anima processes from the session provider. The child runs under its own process group, not tied to the guild's lifetime.
- A **minimal session harness** — the smallest wrapper that boots enough of the guild's books contribution surface for the Animator's session-record writes to land, runs the anima to completion, and exits. Named as a concrete artifact, not "whatever code happens to be there" (#37).
- Book-mediated result handoff: the session writes its terminal row (outcome, yields, cost, final transcript ref) to the guild's books. The engine's status reads from that row. No IPC, no sockets, no parent-child pipe (#27).
- **Orphan reap on spider startup**: on boot, the spider scans for sessions the books say are `running` whose PIDs are dead, and marks them `stuck` with a specific reason (#2, #20). The operator recovers via the existing amendment flow (#29).

**Out:**
- Resuming or re-attaching to an in-flight session from a new guild process. The detached session runs itself; we don't try to re-parent it. If the anima is mid-turn when the spider dies, the session keeps going and lands its result in books whenever it finishes. The *guild* reconnects to the *writ*, not to the process.
- Distributed coordination, process supervisors, or systemd integration. One detached child per session, reaped by whoever restarts next (#23).
- Changing the engine yield shape. Engines already yield whatever they yield; the *delivery mechanism* changes from "child exit → parent reads" to "book row → engine reads." The engine's status machine treats the session row as the source of truth for completion (#17, #19).

## How it works

The session provider forks, `setsid`s the child into its own session, and returns the PID + session writ id to the caller. The parent guild process no longer blocks on the child. The child process is the **minimal session harness**: it loads the guild's books storage layer, registers the Animator's book contributions, runs the claude-code anima loop, and writes rows as it goes. On exit — clean or crashed — its last act is a terminal row on the session writ. If it dies before writing that row, the PID-liveness check during the next spider boot catches it.

The engine reads the session writ's terminal row to fill its status and yields (#16 — the engine is the downstream that *produces* status; the session is the downstream that *produces* its result; neither reaches across the boundary). The engine's `status` is derived on read from the session writ, not persisted separately (#19). If the guild was down when the session completed, the engine's next status tick picks up the completed row and transitions normally — no special "resync" path.

The harness is a first-class thing with a name and a file, not an inlined helper (#37). I'd expect to see it as a top-level entry in the session-provider package — something like `packages/session-provider-claude-code/harness/` — invoked by the detached spawn as `node .../harness.js <session-writ-id>`.

## Assumptions I made

- The books storage layer is safely accessible from a process that isn't the guild's main process. If it isn't (e.g., in-memory-only, or holds an exclusive lock), the harness needs a storage-access path first and this petition grows. Verify before planning.
- The Animator's book contributions are the *only* guild-side machinery the harness needs. If the anima session relies on other plugins' contributions (clockworks standing orders firing mid-session, etc.), the harness needs to be told which contributions to load — that's a config slot on the session provider, probably object-shaped (#5).
- The `setsid`/detached-spawn approach works on the deployment target. I'm assuming POSIX; if Windows matters here, say so.
- Orphan reap belongs on the spider, not in a separate reaper. The spider already owns writ-dispatch state; it should own this too (#9).

## Deferred questions

- Does cancellation (w-mnrroznr-ef81f7ffe972) already know how to signal a detached PID across guild restarts? If it reads PID from a writ and SIGTERMs it, we're fine. If it assumed a live child handle, that needs a small follow-on.
- When the harness crashes *before* writing any rows (e.g., bad config, can't reach books), how does the session writ get marked? I want this to fail loud (#2) — the spawn path should synchronously verify the harness booted (e.g., harness writes a `started` row before going interactive, spawn waits for that row with a short timeout) and throw if it doesn't. Confirm the timeout shape.
- Is "minimal harness" a separate npm-publishable package or a subdirectory inside the session-provider package? My default is subdirectory until a second session provider (non-claude-code) wants the same shape — no second consumer yet (#18).
