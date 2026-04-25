# Split spider.test.ts into per-feature test files

## Intent

`packages/plugins/spider/src/spider.test.ts` is a 10,691-line single test file covering the entire Spider plugin. Split it into per-feature test files grouped by tested concern (rig lifecycle, walk/dispatch priority, per-engine execution, failure propagation, queries, template dispatch, full-pipeline integration, etc.) so that any future commission touching the Spider only needs to read the relevant sub-file, not the entire test surface. The split is purely a relocation refactor — no test logic changes, no behavioral changes, no coverage changes.

## Motivation

This is a context-cost reduction targeting the single most expensive file in the framework. Empirical analysis across 70+ post-Apr-16 implement sessions identified `spider.test.ts` as the highest cross-package-coupled file in the repo (10 cross-package import lines, 27 imported symbols), and at 10,691 lines it's roughly the size of the entire framework on April 3. Any session that touches Spider currently pays substantial read overhead just opening this file. Splitting it by tested feature shrinks the per-touch blast radius for all future Spider-related work.

## Non-negotiable decisions

- **Behavior-preserving only.** No test logic changes. No new tests added, no tests removed, no test cases altered. Move tests verbatim from the source file into the destination files. Adjust imports as needed for the new file locations; that's the only allowed code change.
- **Group by tested concern, not by line range.** Each `describe('Spider', ...)` sub-describe in the current file should land together with related sub-describes in a topic-named file. The natural groupings the file already exposes (walk/dispatch, engine execution, failure propagation, queries, template/variable/startup, full pipeline) are good starting points; the implementer reads the file and chooses the actual partition. Aim for 4-8 result files, none exceeding ~2,500 lines.
- **All tests must pass after the split.** `pnpm --filter @shardworks/spider-plugin test` must produce the same pass/fail counts before and after the change.
- **Preserve the top-level `describe('Spider', ...)` wrapper convention** so each file's tests still nest under a "Spider" namespace in the test reporter output. Either keep the wrapper in each file or document in commit messages why a flat structure was chosen for any given sub-file.
- **No production-code changes.** The split is confined to the test file(s). If a test imports something that needs to be exported from a non-test source file to make the split work, that re-export is allowed; any other production-code change is out of scope.

## Out of scope

- Adding new tests, increasing coverage, refactoring existing tests for clarity, or removing redundant tests.
- Splitting any other test files (only `spider.test.ts` is in scope; sibling files like `piece-pipeline.test.ts` are not part of this commission).
- Modifying the source-of-truth Spider implementation (`spider.ts` and other non-test files in the package).
- Changing test infrastructure (the in-memory Stacks backend, the mock Guild singleton, etc.).
- Splitting the entire spider package — that's a separate, larger commission.

## References

- Source click: `c-moe1ym8p` — file-level simplification targets surfaced by per-file import audit.
- Background: April 25 cost analysis identifying file count (not file size) as the dominant cost predictor; touched-file orientation overhead drives implement-engine cost more than any other measured factor.