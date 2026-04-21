# Detach anima sessions from the spawning Guild process

The claude-code session provider currently runs anima sessions as child processes of whatever Guild process spawned them — in practice, the spider. If the spider dies, crashes, or is restarted, every in-flight anima session dies with it, mid-work, with writs left in indeterminate state. I want the provider to spawn claude-code processes **detached**, so an anima session's lifetime is decoupled from the lifetime of the process that started it. Now that we have the ability to cancel an anima session from a different session (writ `w-mnrroznr-ef81f7ffe972`), the main reason to keep them parented is gone.

The piece I care about — and the piece that makes this more than a one-line `detached: true` change — is the minimal harness that wraps each detached session so the Animator books stay coherent and engines can still observe outcomes.

## Reader and decision

The primary reader is **me, as patron/operator**, deciding "is it safe to restart the spider right now?" Today the answer is "only if nothing is running," which is almost never true during active work. After this change the answer should be "yes, always — running animas will keep working and their results will land cleanly when the spider comes back." I make this decision multiple times a day; right now it silently discourages me from restarting the spider, which means I tolerate buggy spider state longer than I should.

The secondary reader is the **framework developer** working on engines, who needs a reliable contract for how an engine learns that a dispatched anima session has completed, succeeded, failed, or been cancelled — regardless of whether the spider was alive the whole time.

## Scope

**In:**
- The claude-code session provider: change the spawn so child processes are detached (new session/process group, stdio disconnected from parent, survives parent exit).
- A **session harness** (a thin wrapper script/process that actually runs the anima) responsible for: invoking claude-code, tailing its output, writing to the Animator books, and recording a terminal result record when the session ends.
- The Animator-books write path during a live session: harness writes directly, not proxied through the spider.
- The **engine reconciliation path**: when an engine dispatched an anima session, the engine's status/yields must converge to the correct terminal state whether the spider was up the whole time or not.
- A way for the spider (or any future supervisor) to discover still-running detached sessions on startup and re-attach to them logically (by reading their books / result files, not by re-parenting the OS process).
- Clean handling of the already-working cross-session cancel path — cancelling a detached session must still terminate the underlying claude-code process.

**Out:**
- Moving session execution off-host / onto a remote worker. Still local processes, just detached.
- Rewriting the session funnel (manifest → launch → record). The funnel stays; only the "launch" step changes shape.
- Non-claude-code providers. If the abstraction generalizes cleanly, good; but I'm scoping this to the claude-code provider.
- GUI-level "running sessions" surfacing in Oculus. That's a downstream story — this commission just needs the data model that would make it possible.

## How it works

My expectation for the shape of the fix:

- **Detached spawn.** The provider launches claude-code with `detached: true`, a new process group, stdio redirected to files the harness owns (not inherited from the spider), and `unref()` on the child so the spider can exit cleanly without waiting on it.
- **Session harness is the real parent.** The immediate child of the spider is not claude-code itself but a small harness process (node, or whatever's consistent with the rest of the framework). The harness:
  1. Registers the session in the books with a durable session-id and a pid/pgid.
  2. Spawns claude-code as its own child, streams stdout/stderr, and writes the Animator-book entries as the session progresses.
  3. On claude-code exit, writes a **terminal result record** to a well-known location (the books, plus a sidecar file keyed by session-id) capturing exit code, final assistant message, token/cost accounting, and a status of `completed | failed | cancelled | crashed`.
  4. Then itself exits.
- **Engines reconcile against the terminal record, not the child process.** An engine that dispatched a session stops caring about "is the child still alive?" and instead watches for the terminal record to appear. On each engine tick (or on a books-change event), the engine checks: does a terminal record exist for my dispatched session? If yes, fold the result into my status/yields. If no, am I still within timeout? This makes the engine correct across spider restarts for free — the record is on disk, the engine will find it whenever it next runs.
- **Spider restart behavior.** When the spider comes up, it scans the session registry in the books, finds any sessions marked live, and for each one checks (a) is the harness pid still alive? (b) is there already a terminal record? From that it rebuilds its in-memory view. It does **not** try to re-parent or reattach stdio — the harness owns that.
- **Cancellation.** Cross-session cancel works by sending a signal to the harness pgid (SIGTERM, escalating to SIGKILL after a grace period). The harness catches it, kills claude-code, and writes a terminal record with status `cancelled`. This keeps the existing cancel commission's contract intact.
- **Crash semantics.** If the harness itself dies without writing a terminal record, the next spider scan notices (no live pid, no terminal record) and marks the session `crashed` with a clear indicator. That is a bug worth loud logging but not a reason to block other work.

## Assumptions I made

- The Animator books are safe for concurrent append from a process other than the spider. If they're currently implemented as an in-memory structure only serialized by the spider, this commission grows to include making that write path process-safe (file locks, append-only log, whatever's idiomatic).
- The books already have, or can cheaply gain, a "sessions" collection keyed by session-id with pid/pgid and status. If not, add it — it's the authoritative registry this design depends on.
- Engines are polling-style or event-driven in a way that lets them re-check a session's terminal record on each tick. If engines today hold a live handle to the spawned child and block on its exit, that coupling has to be broken as part of this work.
- The claude-code CLI can be driven non-interactively by the harness (stdin pipe or scripted input) the same way the spider drives it today. If there's any terminal-attachment requirement, flag it.
- A node-based harness is fine. If there's a reason to prefer a shell-only harness (simpler, fewer deps), I don't object — pick the one that's easier to keep correct.

## Deferred questions

- Where should the terminal result sidecar file live — inside the guild's books directory, in `.artifacts/`, or somewhere new? I have a mild preference for "inside the books so it's atomic with the session record," but defer to whoever knows the layout.
- How long do terminal records stick around? Forever (they're part of the session history), or garbage-collected after N days? I'd vote forever until we have a reason not to.
- Should the harness also be responsible for enforcing the session timeout, or does that stay with the engine/spider? I'd prefer the harness owns it — one less cross-process coordination — but check against how timeouts are expressed today.
- Do we want a `nsg sessions` command (list live, show terminal record, kill) as part of this commission, or is that a follow-up? I'd take it as a follow-up unless it's nearly free.
- Is there a second session provider (not claude-code) close enough to matter that we should design the harness interface as a shared contract now rather than retrofit later?
