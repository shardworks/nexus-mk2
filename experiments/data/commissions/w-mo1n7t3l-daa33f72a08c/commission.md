# Fix piece writ cancelled despite successful session

## Intent

Stop piece writs from ending up `cancelled` when their piece-session engine actually completed successfully. The work was done and committed; the writ status simply lost a race. Make collect's bookkeeping robust, make the cascade honest about why it cancels, and make the safety-net behavior explicit when a parent reaches `completed`.

## Rationale

Today, piece-session `collect()` swallows every error from its `clerk.transition(piece, 'completed')` call with a bare `catch {}`. When that transition fails — usually because the parent's downward cascade beat it to the writ — the failure is invisible, and the cascade then cancels the still-`open` piece with a message that misattributes the cause as "sibling failure". The result is wrong piece outcomes in any reporting that aggregates writ status, and a misleading paper trail when operators investigate. Fixing this protects the integrity of post-hoc reporting and makes future race regressions visible instead of silent.

## Scope & Blast Radius

- **`packages/plugins/clerk/src/clerk.ts`** — `handleParentTerminal` resolution message and parent-status-aware behavior; introduce an exported constant for the cascade resolution.
- **`packages/plugins/spider/src/engines/piece-session.ts`** — `collect()` error handling around the piece writ transition, plus a re-read of the piece writ status to include in yields.
- **`docs/architecture/apparatus/clerk.md`** — the cascade-message quote in the "CDC Cascade Behavior" section, and any related description of downward cascade semantics that no longer matches the code.
- **`packages/plugins/clerk/src/clerk.test.ts`** — every assertion that hardcodes the old "sibling failure" string must reference the new exported constant. Audit the file for additional occurrences beyond those already noted; do not trust an enumerated list.
- **Cross-cutting verification:** the literal string `'Automatically cancelled due to sibling failure'` may appear in other tests, fixtures, or docs across the monorepo. Grep the full repo for residual references before declaring the change complete.

The Spider rig CDC handler, `handleChildTerminal`, the implement-loop engine, and the seal engine are NOT changed. The change does not alter the engine-completion / writ-completion separation; it only hardens the bookkeeping inside the existing seam.

## Decisions

| #  | Decision | Default | Rationale |
|----|----------|---------|-----------|
| D1 | What resolution message should `handleParentTerminal` use when cancelling non-terminal children? | Use a single corrected message: `'Automatically cancelled due to parent termination'`. | Accurate for every parent-terminal status without branching; matches the docs' existing language. |
| D2 | How should piece-session `collect()` handle a failed transition to `completed`? | Keep the try/catch but inspect the error. Treat messages indicating the writ is already terminal (`already terminal`, `status is cancelled/completed/failed`) as expected; otherwise log a warning with the piece ID and the error. | Matches the original "ignore already terminal" intent while surfacing genuine failures. |
| D3 | Where should the piece writ transition to `completed` be guaranteed — in `collect()` or in the downward cascade? | Keep the transition in `collect()`; harden it per D2. The cascade remains the safety net, but failures are now logged. | Minimal change; preserves the current separation between piece-session concerns and Clerk/Spider core. |
| D4 | Should `handleParentTerminal` skip children whose parent reached `completed`? | When the parent reaches `failed` or `cancelled`, cancel non-terminal children. When the parent reaches `completed`, do **not** cancel non-terminal children — log a warning instead (they shouldn't exist if the pipeline is working). | Stops the cascade from masking the bookkeeping bug while keeping the safety-net behavior on real failures. |
| D5 | Should `collect()` re-read the piece writ after the transition attempt and include its actual status in yields? | Yes — re-read after the attempt (success or caught-as-expected failure) and include the piece writ's actual status in yields. | Makes any discrepancy visible to downstream consumers and to the rig's engine yields, even when the transition was a no-op. |
| D6 | How should the cascade message be kept in sync between code, tests, and docs? | Extract the cascade resolution message to a named exported constant in `clerk.ts`; reference that constant from tests. | Prevents future drift between the code, the tests, and any other consumer of the string. |
| D7 | Should a regression test be added for the race? | Yes — add a test that pre-cancels the piece writ before Spider's `tryCollect` processes the piece-session engine, and verify the unexpected error path is logged/handled appropriately rather than silently swallowed. | The bug was silent because no test exercised the failure path; a regression test keeps the new error-classification logic honest. |

## Acceptance Signal

- `pnpm -w typecheck` and `pnpm -w test` both pass.
- `grep -r "sibling failure" packages/ docs/` returns no matches; the new constant value is the only resolution string used by `handleParentTerminal`'s cancellation path.
- The new exported constant in `clerk.ts` is the single source of truth for the cascade resolution message; tests reference it by import rather than by string literal.
- A regression test exists in which the piece writ is pre-cancelled before piece-session `collect()` runs; the test asserts that an unexpected transition error path triggers the warning log (not the silent-swallow path), and that `collect()` still returns yields including the piece writ's actual current status.
- `handleParentTerminal` no longer cancels non-terminal children when the parent transitioned to `completed`; tests cover both branches (parent `failed`/`cancelled` → cancel; parent `completed` → warn, do not cancel).
- `collect()` yields include the piece writ's actual status as observed after the transition attempt, regardless of whether the transition succeeded or was caught.
- `docs/architecture/apparatus/clerk.md` describes the downward cascade with the new resolution message and the parent-completed warn-don't-cancel branch.

## Existing Patterns

- **Exported string constants used across code and tests:** `PIECE_EXECUTION_EPILOGUE` in the Spider plugin is the established precedent for D6's extracted constant — same module-level export style and same cross-file referencing pattern.
- **Phase 1 CDC handler structure:** `handleChildTerminal` and `handleParentTerminal` in `clerk.ts` are the two existing cascade handlers; the parent-status branching for D4 should slot into `handleParentTerminal` in the same shape as the existing `if (child.status === 'failed')` branch in `handleChildTerminal`.
- **Engine `collect()` returning a `SpiderCollectResult`:** the existing piece-session code at the bottom of `collect()` already constructs a `yields` object and returns either it directly or a `{ yields, graft, graftTail }` shape — D5's actual-status field belongs in that same `yields` object.
- **Existing cascade tests:** `packages/plugins/clerk/src/clerk.test.ts` around the `handleParentTerminal` cascade assertions is the model for the new parent-completed-vs-failed coverage; follow the same setup-and-assert shape already in that file.
- **Existing piece-pipeline tests:** `packages/plugins/spider/src/engines/piece-pipeline.test.ts` (referenced in the inventory) is the reference for the regression test setup — same mock Animator, same rig harness, with a pre-cancellation step inserted before `tryCollect` runs.

## What NOT To Do

- Do **not** move the piece writ transition out of `collect()` into Spider's `tryCollect` or into the downward cascade. The decision (D3) is to harden `collect()`, not to relocate the responsibility.
- Do **not** introduce engine/rig awareness into Clerk's cascade handlers (e.g. checking which engine corresponds to which child). Clerk stays decoupled from Spider.
- Do **not** add a generic "child writ transition" hook to the engine design interface as part of this commission — the inventory observations note this as a future direction, but it is out of scope here.
- Do **not** rewrite or restructure the `docs/architecture/apparatus/spider.md` stale-pipeline section noted in the inventory; that doc drift is acknowledged but is not in scope.
- Do **not** widen the catch in `collect()` further or replace it with check-then-transition (TOCTOU gap) — the chosen approach is catch-and-classify per D2.
- Do **not** change the yields shape in a way that removes existing fields. D5 adds a status field; existing fields must remain so downstream consumers don't break.
- Do **not** silence the new warning log behind a verbose flag or debug gate; the warning must be visible by default — that is the entire point of D2.