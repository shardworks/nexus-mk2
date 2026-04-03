# Commission Review Tracker

Commissions dispatched 2026-04-02. All reviewed 2026-04-02.

## Pending Review

_(none — all reviews complete)_

## Completed Reviews

### ses-2149b518 — Scriptorium sync hardening ✅
- **Commit:** `385a159..8deedff` (3 commits)
- **Cost:** $3.45 | **Duration:** ~26 min | **Tests:** added to existing suite (47 total)
- **Quality scores:** blind 2.75 | aware 2.80
- **Verdict:** Ship. Strongest output. Clean root-cause fix, comprehensive tests, docs updated.
- **One minor gap:** silent `catch` in `advanceToRemote()` swallows all errors, not just "ref not found."
- [x] Code review
- [x] Run tests locally (47 pass)
- [x] Verify spec and README updates are accurate
- [x] Fill commission log fields

### ses-0334962d — Dispatch apparatus ✅
- **Commit:** `081d468..385a159` (1 commit)
- **Cost:** $1.94 | **Duration:** ~11 min | **Tests:** 17
- **Quality scores:** blind 2.75 | aware 2.60
- **Verdict:** Ship. Faithful to spec, clean error handling.
- **Notes:** Reads writs book directly via `stacks.readBook()` instead of `clerk.list()` — crosses apparatus boundary, acceptable for disposable shim. Codex-aware dispatch path is dead code (Clerk WritDoc lacks codex field).
- [x] Code review
- [x] Run tests locally (17 pass)
- [x] Fill commission log fields

### ses-19194146 — Clerk apparatus (MVP) ⚠️
- **Commit:** `9180f77..081d468` (1 commit)
- **Cost:** $2.00 | **Duration:** ~12 min | **Tests:** 39
- **Quality scores:** blind 2.75 | aware 2.20
- **Verdict:** Functional, good code quality, but significant spec deviations need decision.
- **Spec deviations (require action):**
  - Missing `codex` field on WritDoc — breaks codex-aware dispatch
  - Missing `resolution` field — replaced with `failReason` (only failures, not completions/cancellations)
  - Missing `count()` on ClerkApi
  - Tools `writ-complete` and `writ-cancel` missing `resolution` parameter
  - API uses named methods instead of spec's `transition()` choke point
  - Added `assignee` field despite spec deferral
  - Timestamp naming: `postedAt`/`closedAt` vs spec's `createdAt`/`resolvedAt`
  - `body` optional vs spec's required
  - `commission-post` has `assignee` param instead of `codex`
  - No compound indexes
- **Pending decision:** Commission a fix, fix interactively, or adjust spec to match implementation.
- [x] Code review
- [x] Run tests locally (39 pass)
- [x] Fill commission log fields

## Observations for X013

- C001 (ses-93ad1c4c) is a clean data point for **execution_error** — prompt missing commit instructions, Loom not composing role instructions. $1.65 wasted.
- C003 vs C001 diff is *only* the commit instruction paragraph — controlled comparison of prompt specificity impact.
- C004 + C005 concurrent dispatch validated seal contention (rebase path). First real multi-anima concurrency test.
- Total spend for 3 successful commissions: $7.39. One abandoned: $1.65. Total: $9.04.

### Quality Scorer Observations

- **Instrument bug found and fixed:** Initial runs only examined the final commit of multi-commit commissions. Scriptorium (3 commits) scored 1.60 aware with the bug, 2.80 after fix. Single-commit commissions (Clerk, Dispatch) were unaffected.
- **Remarkable consistency:** Almost all dimensions at sd 0.00 across 3 runs. The Clerk's test_quality (sd 0.47) and requirement_coverage (sd 0.47) show the only variance — both are genuinely ambiguous calls.
- **Blind vs aware gap is a meaningful signal:** Scriptorium gap is tiny (2.75 → 2.80), Dispatch small (2.75 → 2.60), Clerk large (2.75 → 2.20). The gap correlates with spec deviation severity — the `requirement_coverage` dimension does real work.
- **Scorer and patron review converge:** Both identified the same Clerk spec deviations, the same Scriptorium silent-catch gap, and the same Dispatch untestable-codex-path issue. The scorer expresses these as numbers; the patron review adds judgment about which deviations matter and what to do about them.
- **Notes add essential diagnostic value.** Without notes, a score of 2.0 is opaque. With notes, the scorer cites specific files, methods, and patterns — actionable for both patron review and future commissions.
