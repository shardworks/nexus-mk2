# Handoff — Test Trim Workflow

**From session:** `88a35e7d-5e4d-4685-96a1-68607fc9c7f8` (free-2), 2026-05-02.

## TL;DR

The infrastructure for trimming tests is built and committed across three
repos. You can pick up next session by reading
**`/workspace/nexus/docs/guides/trimming-tests.md`** and starting on a
package — `framework/core` is the recommended first real trim (small,
known to have ~74% pure-redundant candidates).

## What landed

### `/workspace/nexus`

| Commit | What |
|---|---|
| `56914fb` | Per-package `test:coverage` script + monorepo aggregator. `pnpm coverage` runs all 24 packages with V8 instrumentation, merges per-package lcovs, prints summary table. Standard exclude list (`**/*.test.{ts,js}`, `**/*.d.ts`, `**/test-helpers.ts`, `**/*-test-fixture.ts`, `**/conformance/**`, `coverage/**`). |
| `b192d84` | Threshold gate in `scripts/coverage-report.ts` (floors 67% line / 80% branch / 53% function — round numbers with ~1pp headroom over baseline 67.96/80.05/53.05). `--no-check` flag opts out. Tail-bias truncation in `spider/engines/review.ts` so failure verdicts survive 4KB capture. CI swapped `pnpm test` → `pnpm coverage`. |
| `1508818` | `scripts/test-uniqueness.ts` per-test attribution analyzer + `docs/guides/trimming-tests.md` workflow guide. (Originally used FNDA+BRDA — see next commit.) |
| `1122e8b` | Methodology correction: line coverage (DA records) is in fact reliable for per-test attribution. Earlier commit message in `1508818` was wrong about this; corrected here with raw V8 profile evidence. Switched analyzer to DA records. Workflow guide updated to remove the false claim and add a "Note on the lcov import baseline" explaining the 62-of-124-lines-hit-on-import phenomenon that originally tripped me up. |

### `/workspace/vibers`

| Commit | What |
|---|---|
| `cedc5f1` | `spider.testCommand` and `spider.variables.testCommand` changed `pnpm test` → `pnpm coverage` so coverage threshold failures flow into the spider review engine's mechanical-check step → reviewer prompt → revise engine. |

### `/workspace/nexus-mk2`

| Commit | What |
|---|---|
| `112b9589` | coco-log: framework coverage scaffolding baseline. |
| `b3b0a3ea` | coco-log: coverage threshold gate + tail-bias truncation. |
| `6b94d13e` | coco-log: per-test uniqueness analyzer. |
| (this session, end) | X017 spec + experiment-index update + this handoff (next commit). |

## How to run a trim

From `/workspace/nexus`:

```sh
# 1. Pick a package
pnpm test:uniqueness <pkg>            # e.g. framework/core, plugins/spider, plugins/clerk
                                      # accepts shortforms — see docs/guides/trimming-tests.md
# Optional: pnpm test:uniqueness <pkg> --workers 4 --filter <regex>

# 2. Read the report
cat coverage/uniqueness/<pkg-flat-name>.md

# 3. Spot-check redundancy candidates → decide keep/delete using the
#    assertion peek column. Watch for parameter sweeps that share
#    line coverage but assert distinct input→output mappings.

# 4. Edit test files to delete decided candidates. No auto-delete.

# 5. Verify
cd packages/<pkg> && pnpm test:coverage   # tests still pass
cd /workspace/nexus && pnpm coverage      # aggregate floor still holds (exit 0)

# 6. Re-run analyzer to confirm
pnpm test:uniqueness <pkg>                # cached, fast

# 7. Commit per package, update the per-package status table at
#    the bottom of docs/guides/trimming-tests.md.
```

If `pnpm coverage` exits 1, you over-trimmed; restore some tests
and try again. The aggregate gate is the safety net.

## Recommended order of attack

(Also documented in `docs/guides/trimming-tests.md`.)

1. **`framework/core`** — 39 tests / 311 test lines. Probed: 29
   pure-redundant (74%). Smallest real package; validates the
   workflow on a real trim.
2. **`framework/arbor`** — 113 tests / 1,833 test lines. Probed:
   90 pure-redundant (80%). Small monolith, two files.
3. **`plugins/stacks`** — already 97.7% line coverage. Likely few
   wins; do it for completeness.
4. Mid-size plugins (`tools`, `codexes`, `copilot`, `lattice`,
   `lattice-discord`, `fabricator`, `loom`).
5. Larger plugins (`oculus`, `parlour`, `cartograph`, `claude-code`,
   `sentinel`, `astrolabe`, `clockworks`, `reckoner`).
6. **The headline targets:** `clerk` (7,148 test lines), `clockworks`
   if not yet done, **`spider`** (18,714 test lines — the headline
   prize). Spider is ~6× larger than the next biggest, with
   modest 70.7% line coverage; expected biggest absolute win.

## What to capture for X017

Each trim session is a data point for **`X017 — Test Redundancy in
Agent-Written Code`** (spec at
`/workspace/nexus-mk2/experiments/X017-test-redundancy/spec.md`).

Per package, append a YAML row to
`/workspace/nexus-mk2/experiments/X017-test-redundancy/artifacts/<YYYY-MM-DD>-<pkg>.yaml`
with:

- pre/post counts (test files, test lines, total tests, pure-redundant)
- pre/post coverage (line / branch / function from `pnpm coverage`)
- candidates reviewed / deleted / kept
- a sampling of "kept" tests with reason categories (parameter sweep /
  edge case / error path / representative / other)
- wall-clock duration
- commit SHA

The spec lists five hypotheses (H1–H5); the YAML rows are the data
that lets you eventually evaluate them.

If you'd rather not collect X017 data on a given session — totally
fine. The trim still works as straight engineering. The experiment is
opportunistic; data points are valuable but not required for trim
itself.

## Things I almost got wrong (so you don't)

These are the gotchas I burned hours on. They're documented in code
comments and the workflow guide, but flagging here too:

1. **`--test-name-pattern` separator is a SINGLE SPACE.** Not `' > '`,
   not `/`, not `>`. node:test joins suite titles + test name with one
   space. Wrong separator silently matches zero tests but **still
   reports `count=1`** because the file itself is wrapped as a
   passing meta-test. So you can't tell from the test count alone
   whether the pattern actually worked. Always check FNDA/BRDA values
   in the lcov to verify a real test ran.

2. **The lcov import baseline is real, not a bug.** When you run a
   test in isolation, ~half the lines of any imported source file
   show hit=1 in the lcov *before* the test body runs. Those are
   genuinely covered at module-load time (top-level imports,
   constants, function declarations). It's NOT "every line marked
   hit=1 regardless of execution" — that's what I initially thought,
   and I was wrong. Verify hit-count distribution with
   `awk -F',' '{print $2}' | sort | uniq -c`.

3. **Tests with name collisions get skipped.** If two tests in a file
   share the same `<suite> <name>` joined string, `--test-name-pattern`
   can't uniquely select either. The analyzer warns and excludes
   them rather than misattribute. Real but rare.

## Open questions / further work

- **Branch-coverage signal.** Current analyzer uses line coverage. The
  guide notes that two tests covering the same line but taking
  different branches will both appear redundant under this signal.
  The aggregate gate's branch floor (80%) catches over-trimming, but
  if you want a finer signal, the FNDA+BRDA implementation is in git
  at `1508818`. Keep DA for now (consistent with the gate, easier to
  inspect); revisit if data suggests otherwise.

- **Per-test wall-clock is ~2× the package's `pnpm test` time** on
  first run, ~0.5s on cached re-runs. For `spider` (762 tests) expect
  roughly 4–5 minutes fresh. Worth letting it run while you do other
  things.

- **Greedy reduction is non-optimal.** Picks one valid redundant set,
  not the maximum. If we ever want tighter trim, run with `--filter`
  scopes (file-by-file) and compare. Out of scope for the first pass.

- **Empty describe blocks left after deletion.** The analyzer flags
  but doesn't auto-clean. If you delete every test in a describe, the
  describe shell stays behind. Worth a sweep at the end of each
  package's trim.

## Quick-start commands

```sh
# Get oriented
cat /workspace/nexus/docs/guides/trimming-tests.md

# Read the spec for X017 (if you want to instrument)
cat /workspace/nexus-mk2/experiments/X017-test-redundancy/spec.md

# Start a trim
cd /workspace/nexus
pnpm test:uniqueness framework/core
cat coverage/uniqueness/framework-core.md
```

## Files I'd read next session, in order

1. This file (you are here).
2. `/workspace/nexus/docs/guides/trimming-tests.md` — the workflow.
3. `/workspace/nexus-mk2/experiments/X017-test-redundancy/spec.md` —
   the experiment frame.
4. `/workspace/nexus/scripts/test-uniqueness.ts` — only if you need
   to debug something or extend the analyzer. Otherwise the doc is
   enough.

That's it. Have fun cutting.
