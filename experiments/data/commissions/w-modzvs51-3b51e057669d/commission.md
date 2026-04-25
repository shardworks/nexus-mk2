Lifted from the planning run of "Manual operator CLI — `nsg clock list/tick/run`" (w-modf60zu-5877f950e3c1). Each numbered observation below is a draft mandate ready for curator promotion.

1. Auto-builder cannot promote optional positionals; consider supporting `[id]` shape
2. Tool auto-builder has no clean path for non-throw nonzero exit; CLI commands needing exit-code semantics must hand-write
3. Validate signal-validator catalogue stays in sync — see also `w-modqkikn-f4841db04b27`
4. `run`'s loop-until-empty semantics expose a `processEvents` re-entry edge case worth a single regression test
5. `processEvents` opts shape should also document `onDispatch` ordering relative to `processed:true` flag
6. Architecture doc still references daemon-only `clock-status` MCP tool; reconcile after task 10
7. README.md describes stub tools that this commission removes; bring it up to date
8. Stacks `find` query may not need a composite index for `tick <id>` path — verify before adding one
