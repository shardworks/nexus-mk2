# Observations — Astrolabe MVP: Part 2

## Engines Already Implemented

The three clockwork engines listed in the brief (plan-init, inventory-check, decision-review) are fully implemented with comprehensive test coverage in `engines.test.ts`. The brief appears to have been written before implementation. The remaining deliverable is writ linking, which is entirely absent from the codebase.

## Doc/Code Discrepancies

- **`astrolabe.md` requires vs recommends:** The doc lists `requires: [clerk, stacks, spider, loom, fabricator]`. Code uses `requires: ['stacks', 'clerk']` and `recommends: ['spider', 'loom', 'fabricator', 'oculus']`. The code is more accurate — spider/loom/fabricator are optional for the API to function, though required for the full pipeline. Not blocking.

- **`astrolabe.md` marked "Future state":** The doc's warning banner should be removed or updated once the engines and writ linking are complete. The doc is now largely implemented.

## Potential Future Work (Not In Scope)

- **Analyst revision loop:** The doc notes that "rejecting a plan's InputRequestDoc fails the rig. The patron posts a new brief to start over." A future commission could add a revision loop (reject → re-analyze) using rig retry/recovery mechanisms. The current `decision-review` engine's re-run path handles the happy case (completed request) but delegates rejection to the `patron-input` block type checker, which returns `{ status: 'failed' }` — causing the engine to fail.

- **PlanDoc 'failed' status handling:** The `'failed'` PlanStatus exists but no engine transitions to it. When an engine throws, the Spider marks the engine as failed and the rig may fail, but the PlanDoc stays in whatever status it was in. A cleanup mechanism (e.g., a Spider event listener or a periodic reconciliation) could transition abandoned PlanDocs to 'failed'. Not blocking for MVP.

- **resolveAstrolabeConfig export:** `resolveAstrolabeConfig` is exported from `astrolabe.ts` for "external use" but nothing imports it externally. After the spec-publish engine inlines the config read (D15), this export becomes dead code. Could be removed in a cleanup pass.

## Suboptimal Conventions Followed for Consistency

- **mockClerkApi stubs throw 'not implemented':** The test harness uses stub methods that throw for methods not under test. This is a manual mock pattern — no mocking framework is used. The spec-publish tests will need to flesh out `post` and `link` stubs with real return values. This works but is fragile. Not worth changing the pattern for this commission.

## Test Pattern Notes

- The `engines.test.ts` file uses `node:test` with `describe`/`it`/`beforeEach`/`afterEach`. No mocking framework. All assertions via `node:assert/strict`. In-memory Stacks via `MemoryBackend`. The `fakeGuild` pattern with `apparatusMap` is reused across test files. New spec-publish tests should follow this exact pattern.
