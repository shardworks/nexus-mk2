# Test-trim runbook

Operational procedure for trimming redundant tests in the framework
monorepo, one package at a time. Instruments experiment **X017 — Test
Redundancy in Agent-Written Code**.

## Prerequisites

- Working copy of `/workspace/nexus` (framework) and `/workspace/nexus-mk2`
  (sanctum, owns X017).
- `pnpm coverage` and `pnpm test:uniqueness` already wired in
  `/workspace/nexus`.
- Familiarity with the framework-side workflow guide:
  [`/workspace/nexus/docs/guides/trimming-tests.md`](/workspace/nexus/docs/guides/trimming-tests.md).
  This runbook does not duplicate that guide's mechanics — read it for
  the analyzer's behavior, lcov import baseline, and line-vs-branch
  caveat.

## Per-package procedure

For each package on the order-of-attack list (see the framework guide):

### 1. Pick a package and run the analyzer

```sh
cd /workspace/nexus
pnpm test:uniqueness <pkg>          # accepts shortforms: spider, framework/cli
```

Outputs:
- `coverage/uniqueness/<pkg-flat>.md` — review report.
- `coverage/uniqueness/<pkg-flat>.json` — raw matrix (input to X017 artifact).
- `<pkg>/coverage/per-test/` — cached per-test lcovs.

First run on a package: ~2× the package's normal `pnpm test` duration.
Subsequent runs are near-instant (mtime-keyed cache).

### 2. Capture the pre-trim baseline

Record (used in the X017 artifact, step 6):
- `tests_before`, `pure_redundant_count`, `pure_redundant_pct` — from
  the analyzer's summary.
- `test_files_before`, `test_lines_before` — `wc -l packages/<pkg>/src/**/*.test.ts`.
- Aggregate `line/branch/func` coverage — run `pnpm coverage` at the
  monorepo root and record the `TOTAL` row.
- Per-package coverage — `cd packages/<pkg> && pnpm test:coverage`,
  read the `all files` row.

### 3. Review the candidates

Open `coverage/uniqueness/<pkg-flat>.md` and decide keep/delete for each
**pure-redundant** entry. Decision rule:

> **Cut only when the test asserts the same input→output pair as
> another test, modulo trivial variation.** Keep when the test asserts
> a distinct behavioral case, even if line coverage doesn't distinguish
> it.

In practice the analyzer's `pure-redundant` list contains three patterns
that should usually be **kept**, not cut:

| Pattern | Example | Why kept |
|---|---|---|
| Parameter sweep over a regex/scope branch | three tests for `-plugin`/`-apparatus`/`-kit` suffix-strip | Each is a distinct branch in the alternation. |
| Edge-case input | empty string, NaN, zero, missing file | Same lines execute, distinct invalid-input contracts. |
| Representative identity case | `foo('x')` returns `'x'` for the no-op path | One canonical happy-path per behavior. |

Genuinely-deletable cases:
- Same assertion shape as another test, only the input string differs
  (e.g. `expect(foo('a')).toBe('A')` vs `expect(foo('b')).toBe('B')` when
  one already documents the contract).
- Test of a helper that's covered transitively by tests of its only caller.
- Belt-and-suspenders integration test where the unit tests already
  exhaustively cover the surface.

### 4. Delete

Edit the test files. Delete the `it(...)` / `test(...)` block. If a
`describe` becomes empty, delete the describe too.

### 5. Verify

```sh
# Per-package: tests still pass
cd /workspace/nexus/packages/<pkg> && pnpm test:coverage

# Aggregate: floor still holds (67/80/53 line/branch/func)
cd /workspace/nexus && pnpm coverage
```

If aggregate `pnpm coverage` exits non-zero, you over-trimmed. Restore
some tests and re-verify.

### 6. Capture post-trim state and X017 data

Re-run the analyzer (cached, fast):

```sh
pnpm test:uniqueness <pkg>
```

Then write the X017 artifact at:

```
/workspace/nexus-mk2/experiments/X017-test-redundancy/artifacts/<YYYY-MM-DD>-<pkg-flat>.yaml
```

Schema (see `experiments/X017-test-redundancy/spec.md` for full field
list; copy the most recent dated artifact in `artifacts/` as a template):

```yaml
package: framework/<name>
date: YYYY-MM-DD
session: <claude-session-id>

# pre-trim
test_files_before: <int>
test_lines_before: <int>
tests_before: <int>
pure_redundant_count: <int>
pure_redundant_pct: <float>
line_coverage_before: <float>      # aggregate
branch_coverage_before: <float>
func_coverage_before: <float>
package_line_coverage_before: <float>
package_branch_coverage_before: <float>
package_func_coverage_before: <float>

# review pass
candidates_reviewed: <int>
candidates_deleted: <int>
candidates_kept: <int>

deletions:
  - file: src/<file>.test.ts
    test: "<describe> > <test name>"
    reason: <one-of: subsumed_by_other_test | parameter_sweep_over_helper | belt_and_suspenders | duplicate_assertion>
    note: <one-line rationale>

# sample of kept-after-flag tests; not exhaustive — aim for coverage of
# each reason_category seen
kept_samples:
  - test: "<describe> > <test name>"
    reason_category: <one-of: parameter_sweep | edge_case | error_path | representative | other>
    note: <optional>

# post-trim
test_files_after: <int>
test_lines_after: <int>
tests_after: <int>
line_coverage_after: <float>
branch_coverage_after: <float>
func_coverage_after: <float>
package_line_coverage_after: <float>
package_branch_coverage_after: <float>
package_func_coverage_after: <float>
pure_redundant_count_after: <int>
pure_redundant_pct_after: <float>

trim_duration_min: <int>
notes: |
  <free-form: deletion-rate vs H2 prediction, kept-set patterns
  observed, anything anomalous>
```

### 7. Update the package checklist

In `/workspace/nexus/docs/guides/trimming-tests.md`, find the row for
this package in the **Package checklist** at the bottom. Set Status to
`trimmed` (or `skipped` if you concluded there was nothing worth
cutting), update Test lines to `before → after`, fill in Date, and add
a one-line note (e.g. cut count vs. flagged count).

### 8. Commit

Two commits, one per repo:

**A. Framework repo** (`/workspace/nexus`) — the trim itself + status
table update. Commit message body should include the cut count, the
files touched, before/after aggregate coverage, and the analyzer's
pre/post pure-redundant counts.

**B. Sanctum repo** (`/workspace/nexus-mk2`) — the X017 YAML artifact +
coco-log entry referencing the framework commit SHA.

Use Coco's git identity and the `Session:` trailer on both commits. See
`/workspace/nexus-mk2/.claude/agents/coco.md` for the exact pattern.

## Gotchas

These are real failure modes, not just cosmetic warnings:

1. **`--test-name-pattern` separator is a single space.** Not `>`, not
   `' > '`, not `/`. node:test joins suite + test name with one space.
   A wrong separator silently matches zero tests but reports `count=1`
   because the file itself is wrapped as a passing meta-test. Verify
   FNDA/BRDA values in the lcov when in doubt.

2. **The lcov "import baseline" is real, not a bug.** When a test runs
   in isolation, ~half the lines of any imported source file show
   `hit=1` before the test body executes (top-level imports, constants,
   function declarations). These are genuinely covered at module load.
   Don't mistake this for "all lines covered regardless of execution."

3. **Tests with name collisions are skipped.** If two tests in a file
   share the same `<suite> <name>` joined string, the analyzer warns
   and excludes them. Rare but real.

4. **First-run cost scales with test count, not test duration.** The
   analyzer spawns one node process per test. For `spider` (762 tests),
   expect 4–5 minutes fresh. Run while doing other things.

5. **Branch-coverage drift.** Line-coverage attribution can flag tests
   as redundant when they take different branches at shared lines. The
   aggregate gate's branch floor (80%) is the safety net, but if a
   per-package trim drops branch coverage noticeably, scrutinize the
   cuts — you may have lost behavior.

## What to trim next

The **Package checklist** at the bottom of
`/workspace/nexus/docs/guides/trimming-tests.md` lists all 24 framework
packages with `pending` / `trimmed` / `skipped` status. Pick the first
`pending` row. The list is sorted by test-line count smallest-first —
validate the workflow on small packages before the test-volume
monoliths.

## References

- `/workspace/nexus/docs/guides/trimming-tests.md` — analyzer workflow,
  package checklist, mechanics.
- `/workspace/nexus/scripts/test-uniqueness.ts` — the analyzer source.
- `/workspace/nexus/scripts/coverage-report.ts` — the aggregate
  threshold gate (floors 67/80/53).
- `/workspace/nexus-mk2/experiments/X017-test-redundancy/spec.md` —
  research question, hypotheses, full field list.
- `/workspace/nexus-mk2/experiments/X017-test-redundancy/artifacts/` —
  per-package data points; copy the most recent as a template.
