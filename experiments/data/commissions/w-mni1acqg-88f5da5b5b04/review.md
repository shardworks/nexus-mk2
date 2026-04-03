# Review: w-mni1acqg-88f5da5b5b04

## Walker Increment 1 — Core, Fabricator, Clockwork Engines

**Outcome:** success

**Spec quality (post-review):** strong

**Revision required:** yes

**Failure mode (if not success):** n/a

## Summary

All functional requirements met. 22 tests passing, zero regressions across workspace. Single commit, 1,663 lines across 17 files. Completed in ~22 minutes — fast for complexity 8.

## Quality Scores

- **Blind:** 2.75 (sd 0.00) — test: 3, structure: 3, error_handling: 2, consistency: 3
- **Aware:** 2.40 (sd 0.00) — test: 2.67, structure: 3, error_handling: 2, consistency: 2.33, requirement_coverage: 2

Aware mode correctly flagged structural divergences from the authoritative spec.

## What went well

- Architecture matches existing apparatus conventions (factory pattern, supportKit, module structure)
- Walk priority ordering (collect > run > spawn) correctly implemented and tested
- CDC handler properly cascades rig terminal states to writ transitions
- Engine designs registered via Fabricator kit-contribution scanning
- Full stub pipeline walks to completion end-to-end
- DraftYields/SealYields field names adapted to match the real Scriptorium API rather than the spec's design-time guesses — correct behavior

## What diverged from spec

| Area | Spec | Implementation |
|------|------|---------------|
| `upstream` type | `string \| null` | `string[]` |
| WalkResult discriminant | `action` field | `type` field |
| WalkResult variants | `engine-completed`, `engine-started`, etc. | `ran`, `collected`, `launched`, `spawned` |
| Rig status | `'active'` | `'running'` |
| givensSpec | Per-engine (seal: `{}`, review: `buildCommand`/`testCommand`) | All engines get identical bag |
| `buildUpstreamMap` | Walks upstream chain from current engine | Collects all completed yields globally |
| DraftYields fields | `worktreePath`, `draftBranch`, `codexId`, `baseSha` | `draftId`, `codexName`, `branch`, `path` |
| SealYields fields | `mergedSha`, `pushed` | `sealedCommit`, `strategy`, `retries`, `inscriptionsSealed` |

## Revision needed

A followup commission (increment 1.1) should align the implementation with the spec on the structural/naming items, and fill the test gaps:

1. Align WalkResult to use `action` discriminant with spec variant names
2. Align rig status to use `'active'` not `'running'`
3. Per-engine givensSpec (seal gets `{}`, etc.)
4. `upstream` as `string | null` not `string[]`
5. Walk the upstream chain for context assembly, not collect-all
6. Add yield serialization failure test
7. Add `baseSha` to DraftYields (needed for increment 3)
8. Error handling: don't silently swallow all errors in trySpawn; add error handling to walkContinual

## Spec observations

The spec was strong — detailed, well-structured, explicit validation criteria. The divergences are the agent making its own naming/structural choices rather than following the spec's types exactly. The DraftYields/SealYields field names in the authoritative spec were stale relative to the real Scriptorium API — those need updating spec-side, not implementation-side.
