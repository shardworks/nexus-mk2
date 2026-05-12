# Trial Workload Portfolio

Curated set of historical implementer rigs cleared for use as benchmark
workloads in prompt-engineering, tool-configuration, and cost/quality
experiments. Each entry is calibrated against its sealed-state baseline
so trial variants can be graded relative to the original implementer's
outcome rather than against current-main standards.

Sibling to:
- `running-claude-direct-trials.md` — how to actually run a trial
- `calculating-costs.md` — cost number interpretation

## Why a portfolio

Prior experiments (X021/X022/X023/X024) ran against two workloads —
`rig-moj12h4o` (Reckoner periodic tick) and `rig-moji64hs` (vision-keeper
deletion). Both are nexus-codex plugin work in the clockworks/reckoner
neighborhood, ~1700 lines touched, refactor shape. The narrow surface
underweighted other failure modes the system encounters: greenfield work,
cross-package coordination, bugfixes, frontend, non-nexus codexes.

The portfolio below spans those gaps. Each workload has a known
verifyCommand, baseline failure profile, and discrimination thresholds
captured ahead of time — pick what fits the experiment's sensitivity
needs.

## Verify-grading principle

Sealed commits are **immutable historical artifacts**. They are the
canonical end-state of work that landed at a specific moment in time.
Trial verification asks: *"did the variant do at least as well as the
original implementer?"* — not *"is the result clean by current-main
standards."*

Practical consequence: every workload manifest carries a `sealedBaseline`
block listing the typecheck errors and test failures that exist at the
sealed commit when run today. The variant passes verify if:

1. Its failures are a **subset** of the sealed baseline (no new failures
   introduced — variant didn't regress beyond what the original landed
   with), AND
2. The **discrimination check** confirms meaningful work happened in the
   expected paths (no-op variants that produce zero changes fail).

This makes the portfolio robust to framework drift between seal time and
trial time: a baseline failure inherited from the sealed state is allowed;
a new failure is a regression.

## Selection criteria

Hard requirements for any portfolio entry:

1. **Terminal-successful in production** — rig status `completed`, writ
   classification terminal/success
2. **Codex pin resolvable** — `baseSha` exists in the codex repo
3. **End-state reproducible** — `sealedCommit` exists in the codex repo
   (workloads with `Sealing seized` graft-only resolutions are excluded)
4. **No external dependencies** — body screened for API/network/credentials
5. **Single-attempt implement** — clean baseline trajectory, no retries
6. **Affordable** — implementer cost in the $5-50 Opus range (≈$1.50-12 Sonnet)

Coverage targets (shape diversity):
- Cross-package rename + naming convention
- Greenfield apparatus or plugin
- Greenfield feature in existing apparatus
- Mechanical migration sweep
- Schema migration
- Narrow bugfix
- Subtle concurrency bugfix
- Diagnostic bugfix
- Frontend / UI (nexus stack)
- Frontend / UI (non-nexus stack)
- Non-nexus codex

Doc-heavy / prose-rewriting work remains uncovered — none of the
high-cost completed rigs are predominantly prose. Worth a dedicated
commission-design pass if that shape matters for an experiment.

## Workload entries

Each entry below is ready to drop into a trial manifest. The full
verifyCommand template is at the end of this doc.

---

### A1 · rig-moix5bsi — Rename `spider.follows` to `depends-on`

Cross-package rename + naming-convention establishment. Touches multiple
plugins (spider, clerk), establishes a new link-kind naming pattern that
propagates across consumers.

```yaml
codex: nexus
baseSha: 2b6b2968d5833bf1fa7538044509d14fca176d30
sealedCommit: 5f4a0f1ae3bcb1ce19d684863143a82f62aa6ce4
shape: cross-package-rename
writId: w-moix2b56-19767872adb9
expectedPaths:
  - packages/plugins/spider
  - packages/plugins/clerk
discrimination:
  minFilesChanged: 10
  minInsertions: 400
sealedBaseline:
  typecheckErrors: []
  testFailures: []
opusBaselineCost: 20.76
sonnetEstimate: 4-5
```

---

### A2 · rig-mohvspfy — Reckoner apparatus skeleton

Greenfield apparatus. New plugin skeleton — registry, configuration,
helper APIs, priority types. No existing patterns to mimic.

```yaml
codex: nexus
baseSha: 89fb1ab35ecc6084283173611b9ccbce857b1da9
sealedCommit: 64113e04ec73af17e05b0bc90e50105ed3600650
shape: greenfield-apparatus
writId: w-mohuvn8h-c34ad4d067f3
expectedPaths:
  - packages/plugins/reckoner
discrimination:
  minFilesChanged: 10
  minInsertions: 1000
sealedBaseline:
  typecheckErrors: []
  testFailures:
    - "packages/plugins/sentinel ✖ orphan child blocks drain past parent cancellation, then drains on its own terminal"
    - "packages/plugins/sentinel ✖ Reckoner — multi-type guild"
    - "packages/plugins/sentinel ✖ src/engine-context.integration.test.ts"
opusBaselineCost: 14.56
sonnetEstimate: 3-4
```

A2's allow-list is unusual because the failing tests are in
`sentinel-apparatus`, which exercises Reckoner integration. A variant
that fails to produce a reckoner-apparatus would surface different
sentinel failures — these specific three are the signature of the
"reckoner skeleton present but with the documented gaps" state.

---

### A3 · rig-moehp3a4 — Arbor lifecycle (apparatus.stop)

Narrow bugfix. Adds `apparatus.stop()` invocation to Arbor's shutdown
path. Single failing-behavior, narrow scope, debug-then-patch trajectory.

```yaml
codex: nexus
baseSha: 912ef1797af253a535f415b3b39b61f5305e7d3f
sealedCommit: ef804fab5b7c6165663c877dd15ff909a1ead837
shape: narrow-bugfix
writId: w-modgu1s1-7952ebde213e
expectedPaths:
  - packages/framework/arbor
  - packages/framework/core
discrimination:
  minFilesChanged: 8
  minInsertions: 600
sealedBaseline:
  typecheckErrors:
    - "packages/plugins/clockworks src/writ-lifecycle-observer.ts(161,34): error TS2345: Argument of type 'string' is not assignable to parameter of type 'WritPhase'."
  testFailures:
    - "packages/plugins/clockworks ✖ a child non-mandate writ fires {type}.ready but NOT commission.* events"
    - "packages/plugins/clockworks ✖ Clockworks — end-to-end framework event emission"
    - "packages/plugins/clockworks ✖ Clockworks — processEvents integration"
    - "packages/plugins/clockworks ✖ drives a root mandate through stuck → open → completed and observes the full sequence"
    - "packages/plugins/clockworks ✖ end-to-end SOF emit + loop-guard cycle through the apparatus surface"
    - "packages/plugins/clockworks ✖ failure path: a throwing relay records an error row and still flips processed"
    - "packages/plugins/clockworks ✖ happy path: emit, processEvents, dispatch row + processed flag round-trip"
    - "packages/plugins/clockworks ✖ posting a root mandate fires mandate.ready, commission.posted, and commission.state.changed"
    - "packages/plugins/clockworks ✖ returns zero counts on an empty queue and writes nothing"
    - "packages/plugins/clockworks ✖ throws aggregated when any standing order in guild.json is malformed"
opusBaselineCost: 15.61
sonnetEstimate: 3-4
```

The clockworks failures are inherited from `writ-lifecycle-observer.ts`
which predates the work and isn't touched by it.

---

### A4' · rig-modpykyx — Reckoner classification migration

Cross-plugin migration sweep. Replaces query callsites with
classification-based equivalents across 8 plugins.

```yaml
codex: nexus
baseSha: 81b309e7e6f5a4bfec3ee06b887522518a42a042
sealedCommit: 83ae55e085462650c898146cbec70015e79e6133
shape: cross-plugin-migration
writId: w-mod6462y-7e6b033698e1
expectedPaths:
  - packages/plugins
discrimination:
  minFilesChanged: 20
  minInsertions: 1500
sealedBaseline:
  typecheckErrors:
    - "packages/plugins/animator src/startup.ts(113,31): error TS2307: Cannot find module 'better-sqlite3' or its corresponding type declarations."
    - "packages/plugins/animator src/startup.ts(115,43): error TS2307: Cannot find module 'better-sqlite3' or its corresponding type declarations."
    - "packages/plugins/animator src/startup.ts(121,19): error TS2307: Cannot find module 'better-sqlite3' or its corresponding type declarations."
  testFailures:
    - "packages/plugins/clockworks ✖ Clockworks — signal tool"
    - "packages/plugins/clockworks ✖ writ-lifecycle names are rejected for every declared writ type"
opusBaselineCost: 13.71
sonnetEstimate: 3
```

A4' is the highest-effort allow-list — `animator/package.json` is missing
the `better-sqlite3` dep declaration at sealed state, which would
normally be a framework-side fix. For trial purposes the variant
inherits this state and is held to the same failure set.

---

### A5 · rig-mojmj4e5 — Cartograph: collapse companion docs

Schema migration with doc/code mixed. Collapses on-disk companion docs
into a writ-ext field.

```yaml
codex: nexus
baseSha: 20260688464ca7c47b23b78658a78cf09892e7e4
sealedCommit: 607b572df8b45fa2ffa99fce511a5fbdfa048d9c
shape: schema-migration
writId: w-mojmj0rc-daec01ea159a
expectedPaths:
  - packages/plugins/cartograph
discrimination:
  minFilesChanged: 8
  minInsertions: 500
sealedBaseline:
  typecheckErrors: []
  testFailures: []
opusBaselineCost: 22.62
sonnetEstimate: 5-6
```

Clean baseline. Highest per-trial cost in the portfolio.

---

### A6' · rig-mo1wajm9 — Oculus click tree view

Frontend feature (React component for browsing clicks). Cheapest, shortest,
and cleanest-trajectory workload — fast-forward seal with zero retries.

```yaml
codex: nexus
baseSha: 842744085a5a5202ee9f0b087ec451a6fe2360a9
sealedCommit: be7cbc446341e5be5c85d1e20f945c6217365a79
shape: frontend-feature
writId: w-mo1wagye-441cbcee1849
expectedPaths:
  - packages/plugins/ratchet
discrimination:
  minFilesChanged: 4
  minInsertions: 800
sealedBaseline:
  typecheckErrors: []
  testFailures: []
opusBaselineCost: 7.07
sonnetEstimate: 1.50-2
```

Oculus surfaces live in the `ratchet` plugin. Clean baseline, ~128s
verify time.

---

### A7' · rig-movzo2vk — d4-tools v2 manual character entry

> ⚠ **SAFETY HOLD as of 2026-05-12.** This workload was retired from the
> X025 MVP run after surfacing a d4-tools-wide safety issue (see
> "Unsafe d4-tools SHA range" section below). A7p's baseSha pre-dates
> the hazardous test infrastructure introductions but the workload was
> pulled out of caution. Do not use until re-verified safe and ideally
> re-pinned to a post-`7a1c998` SHA where the DO NOT RUN guardrails
> exist in-brief.

Frontend feature on the d4-tools codebase (Next.js / React, single-package
repo). Manual character data entry form. Maintains the non-nexus codex
dimension.

```yaml
codex: d4-tools
baseSha: 3456aa8cdace7828121aa57f828175c3d0c6d1a4
sealedCommit: b864c96ae5483b1914b546442e3be11e244b2c2e
shape: frontend-feature-nextjs
writId: w-movyeyaf-28a91975054a
expectedPaths:
  - lib
  - components
  - app
discrimination:
  minFilesChanged: 25
  minInsertions: 4000
sealedBaseline:
  typecheckErrors: []
  lintErrors: []
  testFailures: []
opusBaselineCost: 7.11
sonnetEstimate: 1.50-2
verifyShape: nextjs  # uses pnpm typecheck/lint/build/test (not -w)
```

Clean baseline. Verify completes in ~16s because d4-tools is a
single-package repo. Use when an experiment wants to test
generalization across codexes.

---

### A8 · rig-moewbl4x — Phase-2 CDC loop protection

Subtle bugfix with concurrency dimension. Adds structural loop guards to
CDC handlers.

```yaml
codex: nexus
baseSha: 0d875ff55b19b65e87a0c163310dc6d4e569d73f
sealedCommit: 053cecd9a907e8ef332a86e59b0c70023296c132
shape: subtle-bugfix-concurrency
writId: w-modp5ji8-3814b891cfd8
expectedPaths:
  - packages/plugins/stacks
  - packages/plugins/spider
discrimination:
  minFilesChanged: 6
  minInsertions: 300
sealedBaseline:
  typecheckErrors:
    - "packages/plugins/clockworks src/writ-lifecycle-observer.ts(161,34): error TS2345: Argument of type 'string' is not assignable to parameter of type 'WritPhase'."
  testFailures:
    - "packages/plugins/clockworks ✖ a child non-mandate writ fires {type}.ready but NOT commission.* events"
    - "packages/plugins/clockworks ✖ Clockworks — end-to-end framework event emission"
    - "packages/plugins/clockworks ✖ Clockworks — processEvents integration"
    - "packages/plugins/clockworks ✖ drives a root mandate through stuck → open → completed and observes the full sequence"
    - "packages/plugins/clockworks ✖ end-to-end SOF emit + loop-guard cycle through the apparatus surface"
    - "packages/plugins/clockworks ✖ failure path: a throwing relay records an error row and still flips processed"
    - "packages/plugins/clockworks ✖ happy path: emit, processEvents, dispatch row + processed flag round-trip"
    - "packages/plugins/clockworks ✖ posting a root mandate fires mandate.ready, commission.posted, and commission.state.changed"
    - "packages/plugins/clockworks ✖ returns zero counts on an empty queue and writes nothing"
    - "packages/plugins/clockworks ✖ throws aggregated when any standing order in guild.json is malformed"
opusBaselineCost: 9.49
sonnetEstimate: 2-3
```

---

### A9 · rig-moe5t51n — Scheduled standing orders (cron MVP)

Greenfield feature in existing apparatus. Adds cron scheduling to
Clockworks plugin.

```yaml
codex: nexus
baseSha: e98b3c15a4a65dcc735876131773d432b1bef2a2
sealedCommit: 74ccedde8b62615ac8311ee8539494e75bcd84a8
shape: greenfield-feature-in-apparatus
writId: w-modf696g-466fb615667c
expectedPaths:
  - packages/plugins/clockworks
discrimination:
  minFilesChanged: 10
  minInsertions: 1000
sealedBaseline:
  typecheckErrors:
    - "packages/plugins/clockworks src/writ-lifecycle-observer.ts(161,34): error TS2345: Argument of type 'string' is not assignable to parameter of type 'WritPhase'."
  testFailures:
    - "packages/plugins/clockworks ✖ a child non-mandate writ fires {type}.ready but NOT commission.* events"
    - "packages/plugins/clockworks ✖ Clockworks — end-to-end framework event emission"
    - "packages/plugins/clockworks ✖ Clockworks — processEvents integration"
    - "packages/plugins/clockworks ✖ drives a root mandate through stuck → open → completed and observes the full sequence"
    - "packages/plugins/clockworks ✖ end-to-end SOF emit + loop-guard cycle through the apparatus surface"
    - "packages/plugins/clockworks ✖ failure path: a throwing relay records an error row and still flips processed"
    - "packages/plugins/clockworks ✖ happy path: emit, processEvents, dispatch row + processed flag round-trip"
    - "packages/plugins/clockworks ✖ posting a root mandate fires mandate.ready, commission.posted, and commission.state.changed"
    - "packages/plugins/clockworks ✖ returns zero counts on an empty queue and writes nothing"
    - "packages/plugins/clockworks ✖ throws aggregated when any standing order in guild.json is malformed"
opusBaselineCost: 15.45
sonnetEstimate: 3-4
```

A9 specifically touches clockworks (where the baseline failures live).
A correct variant could either inherit the failures OR fix them as a
side effect of the work — both pass verify. Discrimination ensures
something meaningful happened regardless.

---

### A10 · rig-moeiitmi — Reckoner parseChildFailures fix

Diagnostic bugfix. Symptom described, root cause needs diagnosis, fix +
regression test.

```yaml
codex: nexus
baseSha: 50b258507091f6a472c5f100bf6c496c7d8c9635
sealedCommit: 1ed006ff9e0aeddff6e45f01e19a1784923f14db
shape: diagnostic-bugfix
writId: w-modqiz8b-659fd650c585
expectedPaths:
  - packages/plugins/reckoner
  - packages/plugins/clerk
  - packages/framework/cli
discrimination:
  minFilesChanged: 10
  minInsertions: 500
sealedBaseline:
  typecheckErrors:
    - "packages/plugins/clockworks src/writ-lifecycle-observer.ts(161,34): error TS2345: Argument of type 'string' is not assignable to parameter of type 'WritPhase'."
  testFailures:
    - "packages/plugins/clockworks ✖ a child non-mandate writ fires {type}.ready but NOT commission.* events"
    - "packages/plugins/clockworks ✖ Clockworks — end-to-end framework event emission"
    - "packages/plugins/clockworks ✖ Clockworks — processEvents integration"
    - "packages/plugins/clockworks ✖ drives a root mandate through stuck → open → completed and observes the full sequence"
    - "packages/plugins/clockworks ✖ end-to-end SOF emit + loop-guard cycle through the apparatus surface"
    - "packages/plugins/clockworks ✖ failure path: a throwing relay records an error row and still flips processed"
    - "packages/plugins/clockworks ✖ happy path: emit, processEvents, dispatch row + processed flag round-trip"
    - "packages/plugins/clockworks ✖ posting a root mandate fires mandate.ready, commission.posted, and commission.state.changed"
    - "packages/plugins/clockworks ✖ returns zero counts on an empty queue and writes nothing"
    - "packages/plugins/clockworks ✖ throws aggregated when any standing order in guild.json is malformed"
opusBaselineCost: 12.23
sonnetEstimate: 2-3
```

---

## Verify command templates

### Nexus workloads

```yaml
verifyCommand: |
  set +e  # capture failures, don't abort
  pnpm -w typecheck > /tmp/tc.log 2>&1; TC_EXIT=$?
  pnpm -w build > /tmp/build.log 2>&1; BUILD_EXIT=$?
  pnpm -w test > /tmp/test.log 2>&1; TEST_EXIT=$?
  set -e

  # Extract actual failure signatures (canonical form)
  grep -E "error TS[0-9]+" /tmp/tc.log /tmp/build.log \
    | sed -E 's|^[^:]+:||; s/^([^:]+) (typecheck|build): /\1 /' \
    | sort -u > /tmp/actual-tc.txt
  grep -E "test: ✖ " /tmp/test.log \
    | grep -v "failing tests:" \
    | sed -E 's/ \([0-9.]+m?s\)$//' \
    | sed -E 's/^([^:]+) test: ✖ /\1 ✖ /' \
    | sort -u > /tmp/actual-test.txt

  # Build expected allow-list from manifest sealedBaseline
  printf '%s\n' "${EXPECTED_TC_ERRORS[@]}" | sort -u > /tmp/expected-tc.txt
  printf '%s\n' "${EXPECTED_TEST_FAILURES[@]}" | sort -u > /tmp/expected-test.txt

  # Find regressions: failures in actual that aren't in expected
  comm -23 /tmp/actual-tc.txt /tmp/expected-tc.txt > /tmp/new-tc.txt
  comm -23 /tmp/actual-test.txt /tmp/expected-test.txt > /tmp/new-test.txt

  if [ -s /tmp/new-tc.txt ]; then
    echo "Variant introduced NEW typecheck/build errors beyond baseline:"
    cat /tmp/new-tc.txt
    exit 1
  fi
  if [ -s /tmp/new-test.txt ]; then
    echo "Variant introduced NEW test failures beyond baseline:"
    cat /tmp/new-test.txt
    exit 1
  fi

  # Discrimination check
  INSERTIONS=$(git diff --shortstat ${BASE_SHA}..HEAD -- ${EXPECTED_PATHS} \
    | grep -oP '\d+(?= insertion)' || echo 0)
  FILES=$(git diff --name-only ${BASE_SHA}..HEAD -- ${EXPECTED_PATHS} | wc -l)
  test "$INSERTIONS" -ge ${MIN_INSERTIONS} || {
    echo "Discrimination FAIL: $INSERTIONS insertions (need ${MIN_INSERTIONS})"
    exit 1
  }
  test "$FILES" -ge ${MIN_FILES} || {
    echo "Discrimination FAIL: $FILES files (need ${MIN_FILES})"
    exit 1
  }

  git push origin HEAD:main
verifyTimeoutMs: 900000  # 15 min
```

### d4-tools workloads

```yaml
verifyCommand: |
  set +e
  pnpm typecheck > /tmp/tc.log 2>&1; TC_EXIT=$?
  pnpm lint > /tmp/lint.log 2>&1; LINT_EXIT=$?
  pnpm build > /tmp/build.log 2>&1; BUILD_EXIT=$?
  pnpm test > /tmp/test.log 2>&1; TEST_EXIT=$?
  set -e

  # ... allow-list + discrimination logic, adapted for single-package repo ...

  git push origin HEAD:main
verifyTimeoutMs: 300000  # 5 min
```

## Shape coverage

| Shape | Workload |
|---|---|
| Cross-package rename + naming | A1 |
| Greenfield apparatus | A2 |
| Narrow bugfix | A3 |
| Cross-plugin migration sweep | A4' |
| Schema migration | A5 |
| Frontend feature (nexus stack) | A6' |
| Frontend feature (Next.js stack) | A7' |
| Non-nexus codex | A7' |
| Subtle concurrency bugfix | A8 |
| Greenfield feature in apparatus | A9 |
| Diagnostic bugfix | A10 |

## Cost budget

Per-workload Sonnet estimates (rough — first trials will calibrate):

| Workload | Opus baseline | Sonnet est. | n=3 cost (Sonnet) |
|---|---|---|---|
| A1 | $20.76 | $4-5 | $12-15 |
| A2 | $14.56 | $3-4 | $9-12 |
| A3 | $15.61 | $3-4 | $9-12 |
| A4' | $13.71 | $3 | $9 |
| A5 | $22.62 | $5-6 | $15-18 |
| A6' | $7.07 | $1.50-2 | $4.50-6 |
| A7' | $7.11 | $1.50-2 | $4.50-6 |
| A8 | $9.49 | $2-3 | $6-9 |
| A9 | $15.45 | $3-4 | $9-12 |
| A10 | $12.23 | $2-3 | $6-9 |

**Full portfolio n=3 baseline pass: $84-108 Sonnet.**

For an experiment selecting 5 workloads (typical X-series MVP):
~$15-25 Sonnet per variant cell at n=3.

## Limitations and future work

1. **Allow-list format is brittle to log-format drift.** Sed-based
   extraction relies on stable pnpm output. If pnpm changes its output
   format, the canonicalization regex breaks. A canonicalization helper
   in the lab harness (rather than per-manifest) would be more robust.

2. **Dynamic baseline capture would be cleaner.** Instead of per-workload
   allow-lists in manifests, the trial harness could run verify at
   `sealedCommit` during trial setup, capture the failure profile, and
   pass it to each variant's verify run. Self-calibrates as the codex
   evolves. Worth proposing as a lab apparatus feature.

3. **Discrimination thresholds are first-pass estimates** (~40% of sealed
   insertions). Real trials may calibrate these — if working variants
   routinely produce 30% of sealed insertions with different
   implementation styles, thresholds should be lowered.

4. **Doc-heavy / prose-rewriting shape uncovered.** No high-cost completed
   rigs are predominantly prose. Adding this shape requires a dedicated
   commission-design pass to author a benchmark workload from scratch.

5. **Baselines reflect a single environment.** All failure profiles were
   captured on the lab host's current node/pnpm/types environment. If the
   environment drifts substantially (e.g., node major version bump), some
   baselines may need recalibration.

## Unsafe d4-tools SHA range — DO NOT PULL trial workloads from this range

The d4-tools repo had a period where the codebase contained crash-prone
test infrastructure without `DO NOT RUN` guardrails in commission briefs.
Two distinct surfaces both OOM the host (~15 GB RAM each) by running
many `next build` invocations:

- `pnpm test:acceptance` — HTTP-server acceptance suite (runs `next build`
  per test file)
- `pnpm test:e2e` / `pnpm e2e:ui` — Playwright suite (spawns `next dev`
  per spec at 2 workers, same memory blowout)

| Boundary | d4-tools commit | Date | Event |
|---|---|---|---|
| Earliest hazard | `94ab6ef` | (pre-2026-05-11) | HTTP-server acceptance suite introduced |
| Later hazard | `9254561` | 2026-05-11T18:19Z | Playwright suite introduced |
| Safe again | `7a1c998` | 2026-05-12T03:29Z | DO NOT RUN guardrails added to test scripts and briefs |

**Operational rule:** for any future d4-tools trial workload selection,
prefer SHAs **at or after `7a1c998`** where the guardrail is present in
the brief and the test scripts. Workloads pulled from earlier d4-tools
SHAs require:

1. Manual verification that the hazardous suites are not present, AND
2. Manual verification that the brief explicitly forbids running them
   (because a variant implementer might introduce them speculatively).

When in doubt, skip the workload.

## Maintenance discipline

- **Re-validate quarterly.** Codex pins drift, sealed commits stay
  reachable but downstream `main` evolves. Run the verify pass against
  each sealed commit and confirm failure profiles still match.
- **When a workload's baseline changes**, update its `sealedBaseline`
  block in this doc. Don't let experiments inherit stale allow-lists.
- **When framework bugs in the baseline get fixed in main**, the
  workload's verify will still permit those failures — that's correct.
  The baseline never changes; it's a historical artifact.
- **Add new workloads** as new shapes are needed for experiments. Run
  the selection-criteria check + verify calibration. Append entries here.
