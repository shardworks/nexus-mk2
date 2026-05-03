# Why are lab trial guilds seizing?

Investigation kicked off after X022 trial 1's reviewer hung at 28
minutes and the framework's heartbeat-timeout reconciler had to kill
it. Trial 1 itself recovered cleanly via spider's auto-retry, but the
seizing pattern is widespread across recent trials and warrants a
proper diagnosis.

## TL;DR

Three independent failure modes are co-occurring:

1. **Severe swap pressure** on the host (96% swap used, 11+ active
   node processes from concurrent agents and lab trials) → babysitter
   processes get paged out, miss heartbeats, get reconciled as dead.
2. **Cross-guild JSON-RPC parse failures** in the lab host's
   scenario-engine block checkers → trial-writ polling silently
   throws, scenario engine can't detect terminal state.
3. **Daemon kills leaving stale pidfiles** → no heartbeat reconciler
   runs, sessions stay `running` forever, lab guild dirs orphan.

X022 trial 1 was hit by #1 (visible in the failed reviewer's
`error` field) and recovered. Earlier orphan trials (mine
`w-mopib8yh`, others) were likely hit by #3 (the system-wide
daemon kill around 08:29 UTC).

## Evidence — heartbeat reconciler

From the failed X022 reviewer session record (preserved at
`2026-05-03-trial-1-results/extracted/stacks-export/animator-sessions.json`):

```
id: ses-mopydk35-b6fc94c8
status: failed
exitCode: 1
error: "No heartbeat received for 90s — session host presumed dead (reconciled)"
endedAt: 2026-05-03T16:25:22.048Z
lastActivityAt: 2026-05-03T16:23:51.589Z
durationMs: 1741965  (29.0 min)
```

Heartbeat mechanism (per `nexus/packages/plugins/animator/src/startup.ts`
+ `nexus/packages/plugins/claude-code/src/babysitter.ts`):

- Babysitter starts a `setTimeout` chain that fires every 30s
  (`HEARTBEAT_INTERVAL_MS`) after the running-report completes.
- Each fire calls the guild's `session-heartbeat` HTTP API with a
  10s timeout (`HEARTBEAT_TIMEOUT_MS`).
- On failure, the babysitter drops it and waits for the next 30s tick.
- The animator-side reconciler scans `pending`/`running` sessions
  and flips any with `lastActivityAt` older than 90s
  (`STALENESS_THRESHOLD_MS`) to `failed` with `exitCode: 1` and the
  observed error message.

Observed timing on the failed reviewer:

- `15:56:20` — reviewer babysitter starts.
- `16:23:51` — last successful heartbeat (lastActivityAt stamp).
- `16:24:05` — MCP proxy SSE connection closes (per session log:
  "closed after 1665110ms (0 tool calls proxied)") — the babysitter
  is gone.
- `16:25:22` — reconciler marks the session failed (~91s after the
  last heartbeat).

So the babysitter died at ~16:24, the reconciler caught it 91s later.
The reviewer claude process — which the babysitter was supposed to be
managing — may also have died around the same time, since `0 tool
calls proxied` suggests the model never made a single MCP call (which
is normal for Claude Code; native tools don't go through MCP).

## Evidence — host resource pressure

```
Mem:           62Gi total, 39Gi used, 17Gi available
Swap:           8Gi total, 7.7Gi used   (96.4% utilization)
Load avg:      3.40 (1-min) on 12 cores
```

Process census at 16:30 UTC:

- 4 active `claude --agent coco` interactive sessions (Sean's
  agents) — ~315–385 MB RSS each
- 3 active lab trial daemons (X020 baseline, X020 with-tool, X021 v4)
  — 99–115 MB each
- 3 active lab trial babysitters spawning claude opus sessions —
  100–115 MB each (babysitter) + 270–290 MB (claude)
- vibers main daemon — 306 MB
- Several VSCode extension hosts — 100–400 MB each

Total: ~5+ GB just in node-process RSS, plus large mmap'd JS heaps
(VSZ around 73GB per claude session — virtual; mostly unmapped, but
swap pressure makes resident-set churn expensive).

Under this pressure:

- Babysitters that are mostly idle (sleeping in setTimeout between
  heartbeats) get paged out completely.
- When the setTimeout fires, the kernel has to swap the babysitter
  back in. Under thrashing, this can take seconds — multi-second
  delays make the 10s heartbeat HTTP-call timeout marginal.
- The guild's tool HTTP server (handling the heartbeat) is in the
  daemon process, which may also be paged out → another swap-in
  delay before the heartbeat is processed.
- Three consecutive dropped heartbeats (90s window) is enough to
  trip the reconciler.

## Evidence — cross-guild JSON-RPC parse failures

From the vibers daemon stderr (`/workspace/vibers/.nexus/logs/daemon.err`):

```
Block checker "lab.xguild-writ-terminal" threw for engine "scenario"
in rig "rig-mopwu90z-600daf30":
  Error: [lab.xguild-writ-terminal] writ-show JSON parse failed
  for writ w-mopwuofn-1d3cbb02c87e:
  Unexpected non-whitespace character after JSON at position 25857
  (line 27 column 1)

Block checker "lab.xguild-rig-terminal" threw for engine "scenario"
in rig "rig-mopyzea2-82808689":
  Error: [lab.xguild-rig-terminal] rig for-writ JSON parse failed
  for writ w-mopyzy3w-d841568d0cad:
  Unexpected non-whitespace character after JSON at position 89137
  (line 122 column 1)
```

These are the lab host's polling block-checkers (in
`packages/laboratory/src/engines/xguild-shell.ts`), which shell out
to the test guild's local `nsg` binary to fetch writ/rig state via
`--format json`. The JSON parser succeeds in parsing one object,
then encounters non-whitespace bytes immediately after. Two
candidates for the trailing content:

- A second JSON object appended (some race condition where the
  command output twice? unlikely for a single `execFile` call).
- Trailing text — but stderr is captured separately by `execFile`,
  so warnings like `[scriptorium] Background clone of ... failed`
  shouldn't reach stdout.
- Embedded content in the writ body that broke the JSON.stringify
  → JSON.parse round-trip (less likely; standard stringify escapes).

When this throws, the block checker reports failed. Spider's
`evaluateDispatchPredicate` catches it and the predicate fails to
evaluate → dispatch is held → next crawl pass tries again. If the
parse failure is sticky (e.g., the writ body content is the
problem), the trial sits in `open` indefinitely while the polling
loop keeps throwing.

Worth a follow-up click: reproduce the parse failure, identify the
trailing content. Until then, every long-running trial is one
parse-failure away from indefinite hang.

## Evidence — database lock contention

Also from the vibers daemon stderr:

```
[daemon] crawl() error: database is locked
[daemon] crawl() error: database is locked
```

Multiple writers (interactive coco sessions, lab-host scenario
engines, possibly the daemon's own crawl pass) contending for the
same SQLite file. Each lock error skips that crawl pass entirely;
under contention, dispatch latency stretches.

## Evidence — orphan daemons from system-wide kills

Earlier today (~08:29 UTC), every lab guild's daemon was killed in
what appeared to be a single event (Sean restarted vibers; the lab
guilds went down with it but were never restarted). Captured at
~14:18 UTC:

```
x015-trial-1-clerk-refactor-sonnet-n1-3b7e3f65 pid=MISSING
x015-trial-3-rate-limit-n1-75551e19            pid=MISSING
x015-trial-3-rate-limit-n1-89af7807            pid=MISSING
x016-baseline-2b-implementer-373f8f51          pid=MISSING
x018-calibration-baseline-cartograph-aceb96da  pid=2622090  → DEAD
x018-calibration-baseline-cartograph-f309000a  pid=MISSING
x018-with-surface-map-tight-cartograph-64d1c769 pid=2853129 → DEAD
x019-with-tool-cartograph-302c36c6             pid=3023786  → DEAD
x020-baseline-dropbook-cff5af02                pid=3983     → alive
x021-rig-moj12h4o-baseline-255fbbf9            pid=MISSING
x022-rig-moj12h4o-baseline-a9556834            pid=MISSING
```

Trial writs in vibers for those guilds stayed `open` because the
scenario engine kept polling forever (the test guild has no daemon
to respond to `nsg writ show`, so the polling shellouts timed out
or errored, but the predicate kept getting re-evaluated).

My X022 first-post writ `w-mopib8yh` was orphaned this way. I
cancelled it manually after noticing the guild dir had no live
daemon.

## What works (existing recovery paths)

- **Reconciler → spider retry path:** when an animator session
  hits the 90s heartbeat timeout, the reconciler flips it to
  `failed`. Spider's rig template auto-retries the engine. We
  observed this on X022 trial 1: the failed review (29 min, $0)
  was followed by a successful retry (3.5 min, $2.28). Whole
  trial recovered cleanly.

- **Tool HTTP timeout (10s) on heartbeat dispatch:** the
  babysitter doesn't block on a hung heartbeat call — it
  abandons and waits for the next 30s tick. So a single
  heartbeat-server hiccup doesn't hang the babysitter.

## What doesn't work (recovery gaps)

- **No reconciler for sessions in fully-dead guilds.** When the
  test guild's daemon itself dies, no reconciler runs — sessions
  stay `running` indefinitely. The orphan check belongs to the
  daemon that owns those sessions.

- **No retry on cross-guild RPC parse failures.** The block
  checker just throws each crawl. Spider keeps re-evaluating, but
  if the parse failure is deterministic (same writ content keeps
  breaking the parser), the trial hangs forever.

- **No upper bound on heartbeat-retry latency under swap thrash.**
  Babysitter heartbeats can go arbitrarily late if the kernel takes
  a long time to swap them back in. There's no "if we're more than
  20s late on a heartbeat, flag it" early signal.

## Recommended follow-ups (parked for Sean to scope)

1. **Reproduce the JSON-parse-after-position bug.** Run
   `/workspace/vibers/.nexus/laboratory/guilds/<some-old-guild>/node_modules/.bin/nsg
   --guild-root <that-guild> writ show --id <its-mandate-writ-id>
   --format json | wc -c` and inspect what's at byte 25858+. May
   require restoring a guild dir.

2. **Cap concurrent lab trials per host.** With 3 trials running
   alongside 4 interactive coco sessions, swap pressure became the
   dominant failure mode. A `max_concurrent_trials` knob on the
   lab apparatus (or even just an operator convention) would
   help. The auto-retry path mostly absorbs the resulting
   reconciler kills, but at the cost of every retry's wallclock
   and review re-cost.

3. **Lab-host-side timeout on cross-guild RPC.** The lab host's
   scenario engine should give up a trial after N consecutive
   poll failures (whether parse errors or stale-daemon timeouts)
   rather than polling forever. Today, an orphaned trial sits
   open until manually cancelled.

4. **Orphan cleanup on daemon restart.** When vibers' daemon
   restarts, scan the lab guilds dir; for any guild whose daemon
   is dead, mark its trial writs failed automatically (analogous
   to the animator's heartbeat reconciler, but at the trial-writ
   layer). Avoids the "stuck for 6 hours then noticed by Coco"
   pattern.

## Note on X022's standing

X022 trial 1 succeeded despite the seizing event. Three more
trials to go. If the framework's auto-retry path keeps absorbing
single-session reconciler kills (as it did for trial 1), X022's
results remain trustworthy — variance shows up in trial cost and
duration but not in correctness.

If a future X022 trial hits a stuck cross-guild parse failure
(failure mode #2), I'll cancel and re-post; the codex pin and
brief are deterministic so re-posts are clean.
