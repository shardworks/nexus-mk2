# X016 — Orientation Suppression

**Status:** Draft, Trial 1 (apparatus validation) authored 2026-05-01.

**Parent click:** `c-mok4qh81` — Idea #17 from the cost-optimization
landscape.

## Research question

When a fresh implementer session enters mid-flow (i.e., after a
handoff from a prior session), how many turns elapse before it
produces productive work? Does an imperative anti-orientation
directive in the brief reduce that turn count to <5?

## Background

The X010 H1 piece-session experiment (per-task implementer
checkpointing) failed because each fresh session paid an
"orientation tax": re-read the spec, re-grep the codebase, re-state
the plan, re-validate prior commits before producing any new output.
Total turn count expanded 3.5×, and the savings from cache-read
accumulation were swamped.

For idea #15 (checkpoint-and-fresh-session implement architecture)
to win, total turn count post-handoff must stay under ~1.3×
monolithic, which means each post-handoff session must produce
productive work in <5 turns. This experiment measures whether an
imperative directive in the implementer's prompt suppresses the
orientation tax.

## Hypothesis

**H1.** Adding an imperative directive ("Begin work immediately. Do
not summarize the task before starting. Make your first turn a code
change.") to the implementer's brief reduces median turns-to-first-
productive-edit from N (baseline) to fewer than 5.

## Variants

| variant | description |
|---|---|
| baseline | implementer brief carries no orientation-suppression directive |
| strong-prompt | brief carries the imperative directive above |

## Apparatus

This is the first real-world trial running through the **Laboratory
apparatus** (`packages/laboratory/`). Trial manifests live under
`manifests/`; archived data lives in vibers' `lab-trial-*` books;
extracted directories under `artifacts/<trial-slug>/`.

## Design notes

### Phase 1 — apparatus validation (this trial)

The first run validates the apparatus pipeline end-to-end without
attempting to execute a full implementer session. The test guild
posts a commission via `lab.commission-post-xguild` with
`waitForTerminal: false` — the writ lands but no rig is driven to
completion.

**Why phase 1 doesn't measure orientation behavior**: a full
implementer rig requires the test guild's Spider crawl loop to be
running, which currently means a clockworks daemon. The Laboratory
does not yet manage daemon lifecycle for test guilds; adding that is
a follow-up. Phase 1 instead validates:

- Codex setup (npx-bootstrapped local-bare flow)
- Test-guild bootstrap via `npx -p @shardworks/nexus@<v> nsg init`
- Plugin install loop via `<testGuild>/node_modules/.bin/nsg`
- Commission post lands (writ in `clerk/writs`)
- Probes capture: `lab.probe-stacks-dump` against the test guild's
  books, `lab.probe-trial-context` for rig metadata,
  `lab.probe-git-range` for codex commits (will be empty since no
  rig sealed)
- Archive engine writes `lab-trial-archives` row
- Teardown safety check passes (archive row exists)
- `nsg lab trial-extract` materializes captured data

### Phase 2 — full execution (future)

Once daemon lifecycle is added to `lab.guild-setup`, the manifest
can switch to `waitForTerminal: true` and the implementer rig will
actually run. At that point:

- baseline + strong-prompt variants both run as separate trials
- `lab.probe-stacks-dump` captures `animator/sessions` rows
  (turn counts, cost, durations) for each variant
- `lab.probe-git-range` captures the implementer's commits to
  measure productive-output timing
- Comparative analysis happens sanctum-side via
  `nsg lab trial-export-book <trialId> --book animator/sessions`
  piped into a DuckDB query

## Trial-shape constraints

- **Codex base SHA**: pinned to a specific sanctum SHA at trial
  authoring time (locks the test guild against a stable code state).
- **Framework version**: pinned to a published `@shardworks/nexus`
  version (currently `0.1.292`).
- **Plugin set**: vibers' standard set minus optional plugins
  (lattice/lattice-discord/oculus/parlour/sentinel are not
  installed in the test guild).

## References

- `docs/archive/deprecated-docs/experimental-infrastructure-setup-and-artifacts.md`
  — predecessor design that the apparatus replaces.
- `packages/laboratory/README.md` — apparatus authoring guide.
- Click `c-mok4nke6` — cost-optimization landscape (parent of #17).
- Click `c-mok4qh81` — idea #17, this experiment's parent.
- Click `c-modxxtu6` — idea #15, the architecture this binds to.

## Status log

- 2026-05-01: Spec drafted. Phase 1 manifest authored
  (`manifests/baseline-apparatus-validation.yaml`). First trial
  posted as the Laboratory apparatus's first real-world use.

- 2026-05-01: **Trial 1 (apparatus validation) completed.**
  - Trial id: `w-mondjwk9-5f18bff39e29`
  - Rig: `rig-mondjzr3-3c449c19` (14 engines, all completed in 1 attempt each)
  - Archive: `lar-mondkc1h-ed27ba9f0587`
  - Wallclock: ~30s end-to-end
  - Extracted artifacts: `artifacts/2026-05-01-baseline-validation/`
  - Two real bugs caught and fixed in the same session:
    - `lab.probe-stacks-dump` used CommonJS `require('node:fs')` in
      an ESM module — replaced with proper imports.
    - `lab.archive`'s graft didn't pass `${writ}` through; the
      Spider's `resolveGivens` does substitute it for graft givens
      (just like static template), so `buildArchiveGraft` now emits
      `writ: '${writ}'` alongside the trial-context injection.
  - Apparatus pipeline validated end-to-end: npx-bootstrapped test
    guild, per-plugin install loop via test guild's local nsg,
    cross-guild commission post, three probes capturing real data
    (1 writ in `clerk/writs`, 0 codex commits as expected),
    archive row written, teardowns ran, no orphan fixtures left.
  - Captured probe summaries make sense: `frameworkVersion: '0.1.292'`
    on the manifest snapshot (test-guild bootstrap pin),
    `frameworkVersion: '0.0.0'` on probe-trial-context's top-level
    (lab-host's dev-source VERSION). Both useful and distinct.

- 2026-05-02: **Trial 2a (daemon-fixture smoke test) completed.** First
  trial exercising the new `lab.daemon-setup` / `lab.daemon-teardown`
  fixture pair under real conditions. No implementer (no mandate→rig
  mapping in the test guild's plugin set), so the daemon comes up,
  Spider's crawl-loop idles, daemon comes down — but every piece of
  the daemon-lifecycle path runs against a real environment.
  - Trial id: `w-monlfejq-2e343b788e0d`
  - Rig: `rig-monlffd3-d32f317e` (16 engines, all completed in 1 attempt each)
  - Archive: `lar-monlfqir-a25da3488822`
  - Wallclock: ~16s end-to-end
  - Extracted artifacts: `artifacts/2026-05-02-baseline-2a-daemon-smoke/`
  - Codex pinned to nexus framework repo (`/workspace/nexus`) at SHA
    `3c307a20a7af` — local HEAD, not yet pushed (local-bare flow
    tolerates this).
  - Plugin set extended to spider/clockworks/fabricator on top of
    phase-1's stacks/tools/codexes/clerk. No animator/loom/claude-code
    yet — the implementer config layers on in phase 2b.
  - daemon-setup yields validate auto-allocation: ports 40833 (tools)
    and 32901 (oculus), well clear of vibers' 7471/7470 daemon. Pid
    captured, log dir written, pidfile present. No port-collision
    handling needed because the lab-host's daemon was running on its
    standard ports throughout.
  - `nsg start` / `nsg stop` shellouts both returned cleanly. Reverse-
    topo teardown order ran exactly as designed: daemon-teardown first,
    then guild-teardown's rm-rf, then codex-teardown's bare cleanup.
  - The daemon-fixture engine code is now exercised against a real
    npx-bootstrapped guild, real npm-installed plugins, real `nsg
    start` daemon process, and real `nsg stop` shutdown. Phase 2b
    (implementer config + waitForTerminal=true) is unblocked.

- 2026-05-02: **Trial 2b (first implementer-driven trial) completed.**
  First end-to-end trial that drives a real implementer session
  through the full draft → implement → review → revise → seal
  pipeline inside a Laboratory test guild. Apparatus
  end-to-end-validated.
  - Trial id: `w-monnnuqw-c998a09d0e9f`
  - Rig: `rig-monnny9h-786e0be8` (16 engines, all completed in 1 attempt)
  - Archive: `lar-monnr5zx-7868fa26482d`
  - Wallclock: 2m 31s end-to-end (01:20:56 → 01:23:27 UTC)
  - Extracted artifacts: `artifacts/2026-05-02-baseline-2b-implementer/`
  - Plugin set extended to animator + loom + claude-code on top of
    phase-2a's seven. No astrolabe — verified that Spider's
    plugin-default `mandate → default` fallback (spider.ts:1389) fires
    automatically without an explicit mapping when no kit claims
    `mandate`.
  - guild.json deep-merged with `loom.roles.artificer`
    (`clerk:* tools:*`, mirroring vibers),
    `animator.sessionProvider = claude-code`, and `spider.variables`
    (role/buildCommand/testCommand) — build/test commands
    package-scoped via `pnpm --filter @shardworks/nexus-core` to
    avoid recursive-pnpm overhead.
  - **Three real animator sessions captured.** All completed
    successfully (exitCode 0):
    - `implement` (artificer): 102.8s, $0.207, tokens 15in / 5527out /
      245k cache-read / 13k cache-write.
    - `review` (reviewer): 11.4s, $0.045, 3in / 380out / 11.5k
      cache-read / 8.8k cache-write. No rejection.
    - `revise` (artificer): 8.1s, $0.026, 4in / 324out / 24.7k
      cache-read / 3.2k cache-write.
  - **Total session cost: $0.278.** Rig-level cost reported as
    $0.2782 (matches; no lab-host overhead beyond per-engine
    invocation).
  - **Codex commit captured.** 1 commit, 1562 bytes of diff:
    `feat(nexus-core): add multiplySafely utility` at SHA
    `7b984d611010` adding `packages/framework/core/src/util/numeric.ts`
    + `numeric.test.ts`. Function shape matches the brief precisely
    (overflow guard via `Math.abs(product) > Number.MAX_SAFE_INTEGER`).
  - **Two real bugs caught and fixed in the same session:**
    1. Spider 0.1.292 ordering bomb (filed as `c-monn8wfk` under
       `c-monew2rg`): spider.start() calls `g.apparatus('animator')`
       but only declares requires=[stacks,clerk,fabricator]. Worked
       around in the manifest by ordering [animator, loom, claude-code]
       before [spider, clockworks] in the plugin list.
    2. `lab.commission-post-xguild`'s poll loop called the
       non-existent `nsg writ-show` command (should be `nsg writ
       show`). Earlier phases all ran with `waitForTerminal=false`
       and never exercised this path. Fixed in scenario-xguild.ts.
  - Apparatus pipeline now end-to-end-validated against a live
    sonnet implementer + reviewer + revise + seal. Phase 2c
    (baseline vs strong-prompt A/B) is unblocked.
  - **Cost expectation reconciled.** Pre-trial budget was ~$0.30
    per trial; actual cost was $0.28 with no debug rounds (the two
    bugs were caught at the apparatus level, not the implementer
    level — no API calls wasted on retries).
  - Open follow-up: `lab.probe-git-range`'s commits-manifest.yaml
    reports `filesChanged: 0, insertions: 0, deletions: 0` per
    commit even when the patch contains content. Diff-stat
    extraction in the probe is broken; cosmetic but worth fixing
    before phase 2c so we have proper summary stats.
