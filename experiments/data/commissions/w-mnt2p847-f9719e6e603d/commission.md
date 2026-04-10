# Brief: Zombie engine detection and reaping

## Problem

Engines stored in the spider's rigs book can become "zombies" — their `status` field is `running` but no corresponding subprocess is alive. Observed case:

- `rig-mnrpc8xr-3234956c`, engine `inventory-check`, `status: running`, `startedAt: 2026-04-09T16:48:13.830Z`.
- The parent writ (`w-mnrpc5cb-8af970211086`, "Update Astrolabe Sage Instructions") was already in `cancelled` status.
- No live babysitter subprocess existed for that engine anywhere in the process tree (verified via `ps -ef`).
- The zombie sat for ~22 hours, continuously counting against the `maxConcurrentEngines` global throttle (default 3). Combined with 2 freshly-spawned rigs, this saturated the throttle and silently blocked further rig dispatch.

The zombie was only discovered because rigs mysteriously stopped spawning and the patron asked Coco to investigate.

## What "live" means

An engine running through the claude-code babysitter has at least one identifiable OS process whose survival indicates the engine is still progressing:

- The babysitter node process (`.../claude-code/src/babysitter.ts`) — the parent, which owns the subprocess and is responsible for writing the final engine outcome back to the rigs book.
- The claude subprocess itself (`claude --setting-sources user --dangerously-skip-permissions ...`) — the actual LLM session.

If neither of those is alive, and the engine is still marked `running`, the engine is a zombie.

## Desired behavior

The spider (or a helper component it owns) should detect and reap zombie engines. Two likely trigger points:

1. **On daemon startup** — after a crash, restart, or hard kill, the previous daemon's engines all look like zombies from the new process's perspective. Everything the new daemon didn't spawn itself is suspect. This is the most important case: a crash during a live rig should not result in silent throttle loss forever.
2. **Periodically during the crawl loop** — for engines whose `startedAt` is older than some threshold (e.g., 30 minutes with no updates, or an hour of clock time), verify the subprocess is alive.

Reaped engines should be marked `failed` (or possibly a new `abandoned` status if we want to distinguish them in the record), the rig rolled forward to its failure/cancellation state, and the associated writ notified through the normal rig-failure path.

## Open questions for Astrolabe

- **Detection signal.** Do we track babysitter PIDs in the engine record at start time and then `kill(pid, 0)` to check liveness? Or do we rely on an indirect signal like "no engine updates for N minutes + no matching babysitter found by command-line pattern"? The PID approach is cleanest but requires adding a field to the engine document.
- **Reaping policy.** Should zombies be marked `failed` (terminal, counts against success metrics), `cancelled` (terminal, neutral), or a new `abandoned` status? Does the rest of the rig cascade the same way as a normal engine failure?
- **Crash recovery vs. liveness check.** Should we aggressively reap all `running` engines on daemon startup (assume crash = all engines suspect), or only those whose tracked PIDs don't exist? The conservative version risks reaping engines that are still progressing via a different mechanism; the aggressive version guarantees no ghost throttle loss across restarts.
- **Observability.** Reaped engines should emit a distinct log line (`[spider] reaped zombie engine <id> from rig <id>`) so the patron can see it happening. Should this also surface on the Oculus rig detail page?
- **Throttle interaction.** The fix should ensure that `countRunningEngines()` in `trySpawn()` is immediately affected by reaping — i.e. the next crawl tick after reaping should not still see the zombie in its count.

## Non-goals

- Detecting a running-but-hung engine (live process, no progress). That's a different problem — task-progress watchdogs — and should be scoped separately.
- Heuristics based on output silence or token rate. This brief is strictly about "subprocess does not exist."

## Pointers

- `packages/plugins/spider/src/spider.ts` — `trySpawn()` at ~line 1736, `countRunningEngines()` helper, the engine/rig state machine. The current zombie-causing path is whatever happens when a rig crashes mid-engine: the rig's status is left at `running` and no cleanup fires.
- `packages/plugins/claude-code/src/babysitter.ts` — the owner of the subprocess whose death is the primary signal.
- Related incident: `rig-mnrpc8xr-3234956c` (already manually reaped via direct books edit on 2026-04-10 by Coco; see coco-log entry for that date).