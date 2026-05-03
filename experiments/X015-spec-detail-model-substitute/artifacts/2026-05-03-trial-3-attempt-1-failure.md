# X015 Trial 3 — Attempt 1 Failure Note

**Trial writ:** `w-mooofhwr-75551e1921c5`
**Posted:** 2026-05-02T18:30:08Z
**Failed:** 2026-05-02T21:30:30Z (3h timeout cap)
**Inner test guild:** `/workspace/vibers/.nexus/laboratory/guilds/x015-trial-3-rate-limit-n1-75551e19`

## What the writ recorded

> Engine "scenario" failed: [lab.commission-post-xguild] timed out after
> 10800000ms waiting for writ w-mooofyol-4720441fe8ef (test guild …)
> to reach a terminal state.

The outer scenario engine hit its 3h cap before the inner pipeline reached
a terminal state. 17 sessions ran inside the test guild before the cap.

## Interpreted cause: external (agent token exhaustion)

Treating this as a **failure due to external causes**, not a measurement of
Sonnet's capability. The believed root cause is agent token / rate-limit
exhaustion that the inner pipeline didn't handle gracefully — the inner
daemon sat idle (last session at 2026-05-03T01:44Z opened an MCP proxy and
exited after 8s with 0 tool calls) rather than retry/back-off productively
once tokens were exhausted.

Note that this is the *exact* class of issue trial 3's underlying writ was
commissioned to address — rate-limit-aware scheduling — so it's a
serendipitous reminder of why this was the most-expensive Opus implement
on record in the first place.

## Action taken

- Inner daemon (PID 2612705) killed at 2026-05-03T~02:50Z.
- Trial scheduled for re-run with the same manifest and budget cap.
- No analysis attempted on the partial inner-guild state.

## Re-run trial writ

`w-mop6gn5c-2ebbdb8c6eba` (posted 2026-05-03T02:54:54Z, attempt 2). Same
manifest, same 3h cap. (A second copy `w-mop6gk8u` was posted by accident
and immediately cancelled.)
