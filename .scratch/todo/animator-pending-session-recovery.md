# TODO — Race-safe pending session recovery

## Context

When `nsg start --foreground` boots, the Animator's `start()` hook runs `recoverOrphans()` to mark sessions stuck in `'running'` whose PID is dead as `'failed'`. With the new `'pending'` lifecycle state added by the daemon-mode patch (nexus@e16cd02), there's a parallel hole: a session can also be stuck in `'pending'` if `launchDetached` pre-wrote the doc but the babysitter never started (host crash, OOM, spawn failure).

Today nothing reaps stale `pending` docs. The `authorize` callback rejects them after long enough since `doc.status === 'pending'` is allowed only briefly in the normal flow, but they accumulate in the sessions book and look misleading in `session-list`.

## What I tried (and why I reverted it)

Naive approach: in `recoverOrphans()`, sweep `pending` docs the same way as `running` docs and mark them `failed`. This broke the animator test `calls provider.cancel() when cancelMetadata is available`:

- The new `sessions.find({ where: [['status', '=', 'pending']] })` call added latency to the orphan-recovery startup task.
- That delayed the running sweep into the same async tick as the test's `animate()` call.
- The running sweep then found the test's session (pid 99 — fake), `process.kill(99, 0)` returned ESRCH, marked the doc `failed`.
- `animator.cancel()` saw a terminal status and skipped calling `prov.cancel()`.
- Test asserted `cancelCalledWith` but got `null`. 5/5 pass without the change, 3/3 fail with it.

Reverted in the same patch session. See the commit history for `packages/plugins/animator/src/startup.ts` around nexus@e16cd02.

## Options

1. **Age-gated sweep.** Only mark pending docs older than N seconds (e.g., 30s) as failed. Test sessions run in milliseconds so they'd never be touched. Cleanest fix, but introduces a "magic number" knob.

2. **Reorder sweeps.** Run the running sweep first, await it fully, then run the pending sweep. The test was racing the running sweep — making it deterministic-first should isolate the test from any pending-sweep changes.

3. **Make startup fully synchronous (and sequenced).** Today `recoverOrphans` runs in a fire-and-forget IIFE inside `animator.start()`. The race exists because the test doesn't wait for the recovery to finish before calling `animate()`. If recovery were `await`ed in `start()`, the test would have to wait for it… but that delays guild boot for everyone, which is the reason it's fire-and-forget today.

4. **Move pending recovery out of `recoverOrphans` entirely.** Run it as a separate periodic task in the daemon loop instead of at startup, so it never collides with test fixtures. Costs: requires a tick scheduler in the daemon; doesn't catch pending docs left over from a crash before the daemon next boots.

## Recommendation

Option 1 (age-gated) + option 2 (reorder) together. Sweep `running` first, then in the pending sweep filter to docs whose `startedAt` is more than 30s old. Cheap, no scheduling infra, no test surgery. The 30s threshold is forgiving enough for slow babysitter spawns without leaking docs forever.

## Test additions needed

- "skips fresh pending docs (younger than threshold)"
- "marks stale pending docs as failed"
- existing `calls provider.cancel()` test must continue to pass — don't regress

## Files

- `/workspace/nexus/packages/plugins/animator/src/startup.ts` — `recoverOrphans()`
- `/workspace/nexus/packages/plugins/animator/src/animator.test.ts` — find the failing test fixture; mirror its setup for the new pending tests
