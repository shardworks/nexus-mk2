_Imported from `.scratch/todo/animator-pending-session-recovery.md` (2026-04-10)._

## Goal

Reap stale `'pending'` SessionDocs in the Animator's startup recovery sweep, the same way `'running'` docs are already handled, without breaking the existing animator test that depends on tight startup timing. The naive sweep broke a `cancelMetadata` test by introducing async-tick races between the running and pending sweeps; the right fix is age-gated + sweep-ordered.

## Status

Parked. Naive attempt reverted in the same patch session as the daemon-mode work (nexus@e16cd02). Recommended approach identified but not yet implemented.

## Next Steps

Implement the age-gated + reordered sweep: run the `running` sweep first and `await` it fully, then run the `pending` sweep filtered to docs whose `startedAt` is more than 30s old. Add two tests — "skips fresh pending docs (younger than threshold)" and "marks stale pending docs as failed" — and ensure the existing `calls provider.cancel() when cancelMetadata is available` test continues to pass. The 30s threshold is forgiving enough for slow babysitter spawns without leaking docs forever.

## Context

**Background.** When `nsg start --foreground` boots, the Animator's `start()` hook runs `recoverOrphans()` to mark sessions stuck in `'running'` whose PID is dead as `'failed'`. With the new `'pending'` lifecycle state added by the daemon-mode patch, there's a parallel hole: a session can also be stuck in `'pending'` if `launchDetached` pre-wrote the doc but the babysitter never started (host crash, OOM, spawn failure).

Today nothing reaps stale `pending` docs. The `authorize` callback rejects them after long enough since `doc.status === 'pending'` is allowed only briefly in normal flow, but they accumulate in the sessions book and look misleading in `session-list`.

**What was tried and reverted.** Naive sweep in `recoverOrphans()` adding `pending` alongside `running`:

- New `sessions.find({ where: [['status', '=', 'pending']] })` call added latency to startup.
- That delayed the running sweep into the same async tick as the test's `animate()` call.
- The running sweep then found the test's session (pid 99 — fake), `process.kill(99, 0)` returned ESRCH, marked the doc `failed`.
- `animator.cancel()` saw a terminal status and skipped `prov.cancel()`.
- Test asserted `cancelCalledWith` but got `null`. 5/5 pass without the change, 3/3 fail with it.

Reverted in the same patch session (nexus@e16cd02 area).

**Options considered:**

1. **Age-gated sweep.** Only mark pending docs older than N seconds (e.g., 30s) as failed. Test sessions run in milliseconds so they'd never be touched. Cleanest fix; introduces a "magic number" knob.
2. **Reorder sweeps.** Running sweep first, await fully, then pending sweep. Test was racing the running sweep — making it deterministic-first should isolate the test from any pending-sweep changes.
3. **Make startup fully synchronous (and sequenced).** Today `recoverOrphans` runs in a fire-and-forget IIFE inside `animator.start()`. The race exists because the test doesn't wait for recovery to finish before calling `animate()`. `await`ing recovery in `start()` would fix the race but delay guild boot for everyone.
4. **Move pending recovery out of `recoverOrphans` entirely.** Run as a separate periodic task in the daemon loop. Costs: requires a tick scheduler in the daemon; doesn't catch pending docs left from a crash before the daemon next boots.

**Recommendation: 1 + 2 together.** Age-gated (30s) inside the pending sweep, executed *after* the running sweep awaits. Cheap, no scheduling infra, no test surgery.

## References

- Parent quest: T5 (`daemon-e2e-integration-tests`)
- Source doc: `.scratch/todo/animator-pending-session-recovery.md`
- Daemon mode patch: nexus@e16cd02
- Files:
  - `/workspace/nexus/packages/plugins/animator/src/startup.ts` — `recoverOrphans()`
  - `/workspace/nexus/packages/plugins/animator/src/animator.test.ts` — find the failing fixture; mirror its setup for the new pending tests

## Notes

- 2026-04-10: opened as child of T5.