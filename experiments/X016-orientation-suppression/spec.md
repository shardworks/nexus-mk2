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

### Phase 2 — full execution

#### Phase 2a (apparatus daemon-lifecycle smoke test)

Daemon lifecycle added to the lab via `lab.daemon-setup` /
`lab.daemon-teardown` fixture pair. Phase-2a manifest came up cleanly
without an implementer (no astrolabe in test guild), proving the
daemon-lifecycle path against a real environment.

#### Phase 2b (first implementer-driven trial)

End-to-end trial running a sonnet implementer through draft → implement
→ review → revise → seal. Used a trivial brief (multiplySafely) to
calibrate the apparatus, not measure orientation tax. 16/16 engines
green, ~$0.28, ~2.5 min wallclock.

#### Phase 2c (the actual orientation-suppression A/B)

**Codex source: rig 2 from the cost-investigation.** The reckoner-tick
commission `w-moiy8hkv` (rig `rig-moj12h4o-19af85f4`) — the substantive
cross-package code change that read-utilization analysis identified
as paying visible orientation tax. The seal commit `7bed456` carries
the entire change in one squashed commit (the implementer batched all
work; see click `c-montlkvj`).

**Synthesized midpoint via partition.** Since the implementer's draft
branch produced only one mega-commit (no recoverable intermediate
states — confirmed via fsck on the codex bare repo), phase 2c uses a
**partition** of the seal commit's diff:

- **Done by prior session** (~58% of touch surface):
  reckoner core source (types.ts, tick.ts new file, reckoner.ts
  refactor), reckoner package metadata, reckoner-cdc.test.ts
  (deleted), reckoner-tick.test.ts (new file), reckoner.test.ts.
  Build green at this checkpoint; primary reckoner test surface
  passes.
- **Remaining** (~42%): peripheral test cascades
  (reckoner-scheduler.test.ts, reckoner-depends-on.test.ts,
  integration.test.ts, vision-keeper integration.test.ts,
  vision-keeper.test.ts) and all four documentation files
  (apparatus/reckoner.md, petitioner-registration.md,
  reckonings-book.md, reckoner/README.md).

The "done" subset gets applied as a single synthetic commit on top
of `7bed456~1`. That commit's SHA becomes phase 2c's codex `baseSha`.

**Brief structure (single markdown per variant, posted as
`writ.body`):**

```
# Continuing: <writ title>

[STRONG-PROMPT ONLY: abstract anti-orientation directives at top]

[HANDOFF NOTE — honest summary of done/remaining]

---

[ORIGINAL WRIT BODY VERBATIM]
```

**Variants:**

| variant | description |
|---|---|
| baseline | handoff context + original writ body, no directives |
| strong-prompt | same + abstract imperative directives at top: "Begin work immediately. Do not summarize the task before starting. Make your first turn a code change." |

Strong-prompt directives are **abstract / generic**, not file-level
specific — testing the harder version of H1 (does the imperative
work without telling the agent what NOT to read).

**Outcome metric: turns-to-first-productive-edit.**

Definition: the turn ordinal of the implementer's first assistant
message containing an `Edit`, `Write`, or `MultiEdit` tool call
targeting a file inside the codex working directory. Bash, Read,
Grep, Glob, LS, TodoWrite, etc. do NOT count. Per-session, machine-
extractable from `animator/transcripts`.

Secondary metrics: total turns, readonly tool calls before first
productive edit (the orientation-cost measure), readonly calls
total, the file targeted by the first productive edit (sanity
check: did the implementer respect the partition?).

**Analysis: sanctum-side script** at
`scripts/extract-orientation-metrics.py`, run after `nsg lab
trial-extract`. Reads the extracted `animator/transcripts` and
emits one row per session with the metrics above.

**N: adaptive, starting from N=1 calibration.** Run baseline N=1
first to (a) measure per-trial cost on rig-2-shaped work and (b)
establish whether orientation tax is even visible at this size of
brief. Decide N from there.

**Quality control:** randomize variant order across runs, pin the
model snapshot, save full transcripts. Defer formal noise-floor
work until N>1.

#### Phase 2 plumbing

- `lab.probe-stacks-dump` captures `animator/sessions` and
  `animator/transcripts` rows.
- `lab.probe-git-range` captures the implementer's commits.
- Comparative analysis happens via the orientation-metrics script
  + standard DuckDB queries against the exported books.

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

- 2026-05-02: **Phase 2c design pass.** Locked the design choices that
  govern the actual orientation-suppression A/B. Headlines:
  - **Codex source:** rig 2 from the cost-investigation
    (`w-moiy8hkv`, the reckoner-tick rig). Real substantive
    cross-package work that the read-utilization analysis already
    documented as paying visible orientation tax.
  - **Synthesized midpoint:** the implementer made a single mega-
    commit, so we partition `7bed456`'s diff into "done by prior
    session" (~58%: reckoner core source + new tick.ts +
    reckoner-tick.test.ts + cdc.test.ts deletion) and "remaining"
    (~42%: peripheral test cascades + four documentation files).
    Filed click `c-montlkvj` on the per-task-commit non-compliance
    observation (parented under `c-modxxtu6`/idea-#15).
  - **Brief structure:** single markdown per variant, posted as
    `writ.body`. Layout: handoff context → original writ verbatim,
    with strong-prompt directives prepended to the strong variant.
  - **Strong-prompt directives are abstract/generic** — testing the
    harder H1 (does the imperative work without file-level
    specifics).
  - **Outcome metric:** turns-to-first-productive-edit, defined as
    the turn ordinal of the first Edit/Write/MultiEdit tool call
    targeting a codex file. Bash/Read/Grep/etc. don't count.
  - **Probe approach:** sanctum-side analysis script
    (`scripts/extract-orientation-metrics.py`), not a probe
    extension — keeps probe surface small and lets the metric
    definition evolve.
  - **N strategy:** adaptive, starting at N=1 baseline calibration.
    Decide expansion based on observed cost + signal strength.
  - **QC:** randomize variant order, pin model snapshot, save full
    transcripts (defer formal noise-floor analysis until N>1).
  - **Pre-flight:** `lab.probe-git-range` diff-stats fixed
    (`c-monnvxkz` → `20b857ee`); spider apparatus.requires fixed
    upstream (`c-monniwt3` → `acd2037`). Both blockers cleared.

- 2026-05-02: **Phase 2c trials run — both N=1 variants completed.**
  Headline finding: strong-prompt halves orientation tax but does
  not eliminate it; H1 as originally stated is falsified.
  - **Baseline N=1** (`w-monu86fr` / `rig-monu89oy-1533cfce`): 28m
    wallclock, $6.47 total. firstProductiveEditTurn=43, totalTurns=125,
    readonlyCallsBefore=40. Implementer completed all cascade work
    (10 files: 5 test files + 4 docs + 1 export tweak), 79/79 reckoner
    + 25/25 vision-keeper passing, reviewer no required changes.
  - **Strong-prompt N=1** (`w-monvhnjs` / `rig-monvhob0-91a144ac`):
    28m wallclock, $6.85 total. firstProductiveEditTurn=18,
    totalTurns=116, readonlyCallsBefore=17. Implementer completed
    14 files (more than baseline because it surfaced an additional
    `index.ts` export), same passing test results, reviewer no
    required changes.
  - **Headline metric delta:** firstProductiveEditTurn 43 → 18
    (−58%), readonlyCallsBefore 40 → 17 (−58%), totalTurns 125 →
    116 (−7%), trial cost $6.47 → $6.85 (+6%). Strong-prompt
    suppressed pre-edit work but did not shorten the session
    overall — total compute roughly equivalent, just rearranged.
  - **Tool-call analysis** of pre-edit sequences revealed: baseline
    paid ~25 calls of redundant orientation (re-reads of same files,
    multi-chunk reads of same file at different offsets, exploratory
    greps for behavior patterns, two subagent fan-outs); strong-
    prompt's 17 calls were almost entirely necessary (must-read
    of remaining files for editing + must-read of done files for
    pattern reference). The directive eliminated REDUNDANT
    orientation; the necessary orientation floor for a 9-file
    cascade task is ~17 calls, well above H1's <5 target.
  - **H1 verdict:** falsified at the original threshold. The
    derivative finding (strong-prompt cleanly suppresses redundant
    orientation while leaving necessary orientation intact) opens
    a refined research question — see follow-up click `c-moo9o9q3`
    (X010 H1 re-run with strong-prompt enabled, parented under
    `c-modxxtu6` / idea #15). If X010 H1's 3.5x piece-session
    blowup was driven partly by redundant orientation, strong-
    prompt-enabled piece-sessions might fall below #15's 1.3x
    ceiling — testable via re-run of the X010 H1 protocol.
  - **Cost envelope established:** ~$6.50/trial on rig-2-shaped
    work without planning engines. N=10/variant ≈ $130;
    N=20/variant ≈ $260. N=1+N=1 produced a clear directional
    answer for this phase; further N would only tighten CIs.
  - **Apparatus changes:** lab.probe-git-range fix (b/c the
    daemon was restarted between trials, strong-prompt's
    commits-manifest.yaml has correct diff stats —
    14 files / +343 / −333 — while baseline's is the pre-fix
    zeros).
  - **Sanctum committed** at `a1443a4b` on nexus-mk2 main:
    spec update, both briefs, both manifests, analysis script,
    extract artifacts for both trials, coco-log entry.
  - **Synthetic checkpoint preserved:** branch
    `x016-phase-2c-checkpoint` at `c047e29` on /workspace/nexus.
    Local-only; the local-bare codex flow tolerates unpushed.
    Branch must NOT be deleted if reruns are wanted.
  - **Experiment status:** complete at the original-H1 question.
    Open at the refined research question (does strong-prompt
    rescue idea #15) — that question is X010-territory now,
    tracked under `c-moo9o9q3`.
