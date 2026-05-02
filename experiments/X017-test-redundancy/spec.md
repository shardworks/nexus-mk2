# X017 — Test Redundancy in Agent-Written Code

**Status:** Draft, authored 2026-05-02.

**Parent context:** Bridge from coverage-floor work in session
`88a35e7d` (free-2). The aggregate test:source line ratio in the
framework monorepo is **1.59:1** (~80k test lines vs ~50k production
lines). Per-test coverage attribution on two probe packages
(`framework/core` 39 tests / 74% pure-redundant, `framework/arbor`
113 tests / 80% pure-redundant) suggests substantial redundancy in
agent-written test code, but the data is small and the ratio of
"could-delete" vs "should-delete" is unmeasured.

## Research question

What fraction of agent-written test code is **structurally redundant**
(line-coverage-equivalent to other tests in the same package), and
what fraction of that redundancy survives **human spot-check** as
genuinely deletable (no behavioral value lost)?

Sub-questions:

- Q1. **Structural redundancy rate:** Across the framework's 24
  packages, what is the median, distribution, and per-package range
  of pure-redundant tests as identified by `scripts/test-uniqueness.ts`?

- Q2. **Survival rate after human review:** Of the candidates flagged
  as pure-redundant, what fraction does the human reviewer (Sean,
  during interactive trim sessions) actually delete? The remainder
  was kept because of behavioral value not captured by line coverage
  (parameter sweeps verifying distinct input→output mappings, edge
  case assertions, etc.).

- Q3. **Patterns of false-positive redundancy:** What categories of
  test cluster in the "flagged but kept" set? Hypotheses to label:
  parameterized table tests, error-path tests sharing happy-path
  lines, tests asserting return values where coverage doesn't
  distinguish the assertion target.

- Q4. **Coverage budget after trim:** How much aggregate line, branch,
  and function coverage drops per package after trim? Does aggregate
  stay above the 67/80/53 floor without manual intervention?

- Q5. **Effort and cost.** Wall-clock time per package for a trim
  session (analysis + review + delete + verify + commit). Does the
  cost per package scale with test volume, with redundancy fraction,
  or with package complexity?

## Why this is interesting

The framework's tests were written predominantly by autonomous
implementer agents over the last ~6 months. The high ratio (1.6:1
test:source) and high probe-package redundancy (52–80% on small
probes) suggests agents systematically over-test. If true, this is a
**measurable artifact of agent-written code** — distinct from the
"clean code" debates and useful as a publication data point for the
broader project's "documented experiment" goal.

If the survival rate (Q2) is high (≥60% deletable on review), that
strengthens the claim that agents over-test in a way human reviewers
mostly endorse cutting. If low (≤30%), it suggests the redundancy is
**parameterized intent** that humans value even when coverage is
equivalent — also a finding, just a different one.

## Hypotheses

**H1 (Volume).** Median per-package pure-redundant rate across the
24 framework packages is **≥40%**. (Probe data: 74%, 80%; small
sample, but well above 40%.)

**H2 (Survival).** After spot-check, **≥50% of flagged candidates
get deleted**. The remainder is kept because the human reviewer
identifies behavioral value not captured by line coverage.

**H3 (Aggregate floor holds).** Across the entire trim, the
aggregate line-coverage floor (67%) is never breached. Branch (80%)
may dip slightly during individual package trims but recovers as
other packages are processed.

**H4 (Pattern clustering).** Of the "flagged but kept" tests,
**≥60%** fall into a small number of identifiable categories
(initial guesses: parameter sweep, edge case, error path,
representative example).

**H5 (Volume correlates with redundancy).** Packages with higher
test-line counts tend to have **higher** pure-redundant rates. This
would suggest that agents writing more tests per feature compound
the redundancy rather than just covering more code.

## Apparatus

- **`scripts/test-uniqueness.ts`** — per-test attribution + greedy
  reduction. Already wired up in framework. Outputs `coverage/
  uniqueness/<pkg>.{md,json}`. The .json is the per-package data
  point.
- **`scripts/coverage-report.ts`** — aggregate threshold gate
  (67/80/53), exits non-zero on regression. The instrument that
  protects H3.
- **`docs/guides/trimming-tests.md`** — workflow for human reviewer.
  Per-package status table at the bottom is the per-package outcome
  log.

The trim is conducted **interactively** by Sean (or Coco-as-stand-in)
package by package. This experiment instruments the existing
operational workflow — it doesn't introduce a new probe.

## Variants

This experiment has no controlled variants — the single arm is
"human-in-the-loop trim with line-coverage attribution and
spot-check." Comparison is **before vs. after** per package, and
across packages.

## Data collection

Per package (one row per package processed):

| field | source |
|---|---|
| package | `framework/<name>` or `plugins/<name>` |
| test_files_before | git-counted before trim |
| test_lines_before | `wc -l` before trim |
| tests_before | analyzer's `totals.tests` |
| pure_redundant_count | analyzer's `totals.redundant` |
| pure_redundant_pct | derived |
| line_coverage_before | aggregator pre-trim |
| branch_coverage_before | aggregator pre-trim |
| func_coverage_before | aggregator pre-trim |
| candidates_reviewed | human spot-check count |
| candidates_deleted | actual deletions |
| candidates_kept | reviewed but kept |
| reasons_kept | free-text categories (parameter sweep, edge case, etc.) |
| test_files_after | post-trim |
| test_lines_after | post-trim |
| tests_after | analyzer's `totals.tests` post-trim |
| line_coverage_after | aggregator post-trim |
| branch_coverage_after | aggregator post-trim |
| func_coverage_after | aggregator post-trim |
| trim_duration_min | wall-clock for the trim session on this package |
| commit_sha | git commit recording the trim |

Per "kept" test (free-text annotation, sampled — not exhaustive):

| field | source |
|---|---|
| package | inherited |
| test_path | analyzer's `fullPath` |
| reason_category | one of: parameter sweep / edge case / error path / representative / other |
| note | free-text |

Stored at `experiments/X017-test-redundancy/artifacts/<YYYY-MM-DD>-<pkg>.yaml`.

## Procedure

For each package in the suggested order (smallest first; see
`docs/guides/trimming-tests.md`):

1. Capture pre-trim state: `pnpm test:uniqueness <pkg>`, save
   `<pkg>.json`, record `tests_before`, `pure_redundant_*`,
   `test_lines_before`, package-level coverage from `pnpm coverage`.
2. Human review of `coverage/uniqueness/<pkg>.md`. For each
   pure-redundant candidate, decide keep/delete. Record reason if
   keep.
3. Delete decided candidates. Surgery on test files manually — no
   auto-delete.
4. Verify: `pnpm test:coverage` in the package, `pnpm coverage` at
   root. If aggregate floor breached, restore until it holds.
5. Re-run `pnpm test:uniqueness <pkg>` (cached, fast).
6. Capture post-trim state and commit.
7. Append data row to `<YYYY-MM-DD>-<pkg>.yaml` artifact.
8. Update the per-package status table in
   `docs/guides/trimming-tests.md`.

## Stopping criterion

The experiment is complete when **every framework package has been
processed at least once**, OR when Sean decides further trimming has
diminishing returns. Whichever comes first.

A "second pass" on packages where the first trim was conservative is
out of scope for this iteration but would be a natural follow-up.

## Threats to validity

- **Reviewer drift.** Spot-check decisions are subjective. As the
  reviewer learns, criteria may sharpen mid-experiment. Mitigation:
  capture reason categories per kept test so post-hoc consistency
  can be checked.

- **Line-coverage as proxy.** The redundancy classifier uses line
  coverage; branch differences within a line will appear redundant
  but are not behaviorally equivalent. The aggregate gate (80%
  branch floor) catches over-trimming after the fact. Sean's
  spot-check is the primary safeguard.

- **Greedy reduction is non-optimal.** Different removal orders
  produce different redundant-set sizes. The reported `redundant`
  count is one valid reduction, not the max one. Across-package
  comparisons should treat this as a noise floor.

- **Selection effect on package order.** Smallest-first means we
  validate the workflow on the easy cases. Findings on small
  packages may not generalize to monoliths (`spider`, `clerk`).
  Mitigation: report H1/H2/etc. across both small and large bins.

- **Cached LLM-written tests vs hand-edited.** Some packages have
  more human curation than others. We don't track per-test
  authorship. Out of scope; if the data shows bimodality, follow up.

## Schedule

Untimed — runs as time and trim sessions allow. Probe data already
in hand from session `88a35e7d` (framework/core, framework/arbor —
shardworks/nexus@1122e8b).

## Related

- Coverage scaffolding: shardworks/nexus@56914fb (baseline),
  @b192d84 (threshold gate), @1508818 (analyzer), @1122e8b
  (line-coverage correction).
- Workflow guide: `docs/guides/trimming-tests.md` in the framework.
- Aggregate gate: `scripts/coverage-report.ts`, floors 67/80/53
  (line/branch/function).
