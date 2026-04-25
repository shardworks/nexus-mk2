Audit Hotspot 5 / part of Candidate B. The `.ts` vs `.js` extension test appears twice in `packages/plugins/claude-code/src/detached.ts` for two distinct purposes:

- `resolveBabysitterPath` at lines 142–146 picks the babysitter script path based on `import.meta.url.endsWith('.ts')`.
- The inline `isSource` test at lines 390–393 inside `launchDetached` decides whether to forward `process.execArgv` to the spawned child based on `babysitterPath.endsWith('.ts')`.

Both checks key on the same predicate (the running module's URL or path ends with `.ts`) but live in separate scopes. Reading either site requires understanding that the package supports two run modes (compiled `dist/` and source `src/` via `--experimental-transform-types`).

Follow-up: extract a single source-mode predicate so the two run modes cannot drift between them. Audit folds this into Candidate B (orchestrator decomposition) because that's the moment a planner is reaching across babysitter and the launcher anyway.