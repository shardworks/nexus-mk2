# Rename existing reckoner-apparatus to free the name for the new Reckoner

## Intent

Rename the existing `@shardworks/reckoner-apparatus` package — currently a narrow MVP pulse emitter for writ-stuck/writ-failed/queue-drained signals — to a descriptive name that reflects its actual function (queue-observer-apparatus or sentinel-apparatus, implementer's pick from those two with rationale). The rename frees the `reckoner` name for the upcoming new Reckoner (the petition-scheduler), which will land as a separate commission once its dependencies (Reckonings book design, petitioner registration design) settle. Behavior preservation is total — the pulse-emitting plugin keeps its observer pattern, its CDC subscriptions, its emitted event names, and its existing test suite. Only the package name and references change.

## Motivation

Click `c-modeou1t` flagged the namespace conflict: the existing reckoner-apparatus and the planned new Reckoner cannot share the name. The patron's stated lean was to subsume the existing plugin's behavior into the new Reckoner once the new one exists. But subsuming requires the new Reckoner to exist first, and it isn't built yet (its design dependencies are still being designed). Rename-now-subsume-later is the practical path: rename the existing package immediately, free the name, and absorb the queue-observer's behavior into the new Reckoner when that commission lands.

This is a substrate-name hygiene commission. Doing it now means the new Reckoner can take the `reckoner` name without contention, and downstream commissions (Reckoner core, vision-keeper as petitioner, etc.) can write against `@shardworks/reckoner-apparatus` directly without import-name workarounds.

## Non-negotiable decisions

- **Pick the new package name from these two candidates**: `@shardworks/queue-observer-apparatus` OR `@shardworks/sentinel-apparatus`. The implementer picks one and documents the choice in the commit message. Reasoning to apply: the existing plugin watches the spider's queue and the clerk's writs for stuck/failed/drained signals — `queue-observer` is the literal description; `sentinel` is the role-shape description and groups with future sentinel patterns (cost-drift sentinel, structural-complexity sentinel — both currently click-staged, see `c-modzrgiu` and `c-moegda00`). Either name is fine; pick the one with the stronger fit.
- **Behavior preservation is total**. No CDC handlers move. No emitted event names change. No book schemas change. No test cases are removed or rewritten. Only package name (in `package.json`), import paths, and downstream references move.
- **Sweep references comprehensively**. Every consumer must be updated: import statements in source files; type imports; package.json dependencies in any package that depends on the old name; README references; architecture docs that name the plugin; CLI and tool registrations if any. Use `grep -r "@shardworks/reckoner-apparatus"` and `grep -r "reckoner-apparatus"` from the framework repo root to find them all.
- **The renamed plugin still works in a guild**. Adding the new package name to `plugins` in a guild.json starts cleanly, the plugin registers its handlers, and the queue-observer / pulse-emitting behavior continues unchanged. Verify via the existing test suite (the framework's integration tests should already cover the load path).
- **Do not preemptively delete or hollow out the package** to make room for the new Reckoner. The package keeps its full implementation; only the name changes. The eventual subsume happens in the future Reckoner commission, not this one.
- **Do not introduce a backward-compatibility alias** under the old name. The new Reckoner needs the `reckoner` name freed cleanly; aliasing would defeat the purpose. Anything still depending on the old import path gets updated in this commission.

## Behavioral cases the design depends on

- A grep across the framework repo for `@shardworks/reckoner-apparatus` returns zero results after the rename.
- A grep for the chosen new name (e.g., `@shardworks/queue-observer-apparatus`) returns the expected set of references — package itself, dependent packages, docs, test fixtures.
- The renamed package's tests pass: `pnpm --filter @shardworks/<new-name>-apparatus test` (or the equivalent filter name).
- Workspace-wide typecheck and build pass: `pnpm -w typecheck && pnpm -w build`.
- The Spider's existing handler tests that exercise queue-observer pulses (writ-stuck / writ-failed / queue-drained) still pass — verifying behavior preservation.

## Out of scope

- Building the new Reckoner. This commission ONLY renames the existing one.
- Subsuming the queue-observer's behavior. That happens later, in the Reckoner core commission.
- Re-designing the queue-observer's emitted events, CDC subscriptions, or pulse format. Behavior is preserved verbatim.
- Updating any sanctum-side repository (separate codex; this commission is framework-only).
- Adding the new Reckoner package or scaffolding it.
- Modifying the existing observer pattern's tests for clarity, coverage, or refactoring.

## References

- Source click: `c-modeou1t`. Strategy: rename-now-subsume-later (preferred over strict-subsume because the new Reckoner doesn't exist yet and waiting for it would block other Reckoner-design work).
- Future-related: `c-mod99ris` (root Reckoner design click) — when the new Reckoner commission lands, it will absorb the queue-observer's behavior into the new petition-scheduler.