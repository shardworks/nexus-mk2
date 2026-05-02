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
