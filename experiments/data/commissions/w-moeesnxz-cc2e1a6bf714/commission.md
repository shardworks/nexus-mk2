Three different code sites in `packages/plugins/claude-code/src/` decide whether they're running from compiled output or the .ts source, each with subtly different semantics:

1. `detached.ts` `resolveBabysitterPath` (~line 142) — checks `import.meta.url.endsWith('.ts')`.
2. `detached.ts` `launchDetached` `isSource` flag (~line 390) — checks `babysitterPath.endsWith('.ts')` to decide whether to forward `process.execArgv` to the child.
3. `babysitter.ts` `isEntryPoint` constant (~line 1006) — matches `process.argv[1]` against the resolved module URL **or** the basename `babysitter.js` / `babysitter.ts`.

The three checks all answer “are we in source mode?” but each in its own way. If the dev workflow's mode signal ever changes (e.g. when Node 24+ ships native TS support and `--experimental-transform-types` is dropped), all three sites must be edited consistently.

Fix: introduce a single helper (e.g. `isSourceMode(): boolean` or `isSourceUrl(url: string): boolean`) that all three sites call. Small, single-file refactor with no behaviour change — mechanical extraction. Not part of any larger refactor commission because it's purely local and doesn't fit the bigger orchestrator decomposition cleanly.