Decision D15 (re-read `clockworks.standingOrders` per `processEvents()` call) plus D3-B (per-call validation) means the dispatcher picks up guild.json edits immediately — no apparatus restart needed. This is good for operator workflow but creates a subtle observability concern when the daemon (task 10) lands.

A daemon ticking every 2s will pick up a mid-edit guild.json on the very next tick. If the operator's edit is half-saved (not atomic) or syntactically invalid, the dispatcher will throw on its validation pass and skip the entire sweep — the daemon's log will fill with rejected sweeps until the operator finishes the edit.

This is fail-loud (per the Three Defaults) and the right behavior, but task 10 should consider:

1. Logging the validation throw with enough context that the operator sees it in `clock.log`.
2. Potentially debouncing the re-read on a file-mtime check, so a rapid sequence of saves doesn't spam the log.

Not a defect in this commission; surfacing for task 10's design pass. Affected files (future):
- `packages/plugins/clockworks/src/clockworks.ts` (daemon log path)
- Task 10's dispatcher-loop body