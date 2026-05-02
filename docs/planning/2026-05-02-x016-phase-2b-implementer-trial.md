---
slug: x016-phase-2b-implementer-trial
date: 2026-05-02
session: 7198cee2-fdba-4b4d-99f1-2baf6ed73f37
---

# Session distill — X016 phase 2b first implementer trial

## Intent — what Sean asked for
- Continue phase 2b work from `.scratch/handoff-lab-phase-2b.md`: resolve 6 open design questions, author a brief and manifest targeting the nexus monorepo, and get a real implementer session to run end-to-end in a Laboratory test guild (msg 1).
- Brief file strategy: add a sibling `baseline-task-core.md` targeting `@shardworks/nexus-core`, leave the original `baseline-task.md` intact so prior trial manifests stay reproducible (msg 3 — "just go siblings").
- After trial succeeded: open clicks for all identified follow-up items, produce a handoff prompt for next session (msg 7).

## In-flight inquiries

### I1 — Phase 2c design
**Question**: How to structure the orientation-suppression A/B experiment proper (baseline vs strong-prompt variants, N runs, outcome metric, QC).
**What we've considered**: Six open questions enumerated in click `c-monrvyj9`: where in the brief the strong-prompt material goes, how big the brief should be to stress orientation, whether to simulate mid-flow context loss, how many runs per variant, what metric captures orientation tax, and QC thresholds for keeping/discarding sessions.
**What we've ruled out (this session)**: Nothing yet ruled out — purely enumeration.
**Where we got stuck / what we need next**: Phase 2c is a design pass first, not a "post a trial" task. Need answers to those six questions before authoring the strong-prompt brief variant. Pre-flight blocker: `lab.probe-git-range` reports `filesChanged/insertions/deletions = 0` for every commit (click `c-monnvxkz`) — must be fixed before phase 2c so the commit-level stats are usable in the A/B comparison.

## Decisions

### D1 — Skip astrolabe; rely on Spider's mandate→default builtin fallback
**Status**: accepted
**Context**: Handoff listed two paths for getting a mandate writ dispatched to the default rig template — install astrolabe (gets the mapping for free but adds planner overhead) or configure `rigTemplateMappings` manually. A third option surfaced from reading `spider.ts:1389-1397` (msg 2).
**Decision**: No astrolabe and no explicit `rigTemplateMappings`. Spider's builtin fallback fires automatically when no kit claims `mandate` and the `default` template is registered via `supportKit` — both conditions hold without astrolabe. Planner overhead excluded to keep the measurement surface clean.
**Consequences**: Test guild plugin list is animator + loom + claude-code on top of phase-2a's seven. No astrolabe, no oculus, no explicit mandate mapping.

### D2 — Add sibling brief, leave original alone
**Status**: accepted
**Context**: `baseline-task.md` targets a top-level `src/util/numeric.ts` path that doesn't exist in the nexus monorepo. Needed to retarget it. Options: rewrite in place or add sibling (msg 2 / msg 3).
**Decision**: Sean chose sibling — `baseline-task-core.md` added targeting `packages/framework/core/src/util/numeric.ts`. Original `baseline-task.md` left intact so phase-1/2a manifest references stay reproducible.
**Consequences**: Phase-2b manifest points to `baseline-task-core.md`. The new brief specifies `pnpm --filter @shardworks/nexus-core test` and `build` as test/build commands.

### D3 — Design question resolutions (six open questions)
**Status**: accepted
**Context**: Handoff listed 6 open questions Coco resolved autonomously before pausing for Sean's brief-file answer (msg 2).
**Decision**: (1) No astrolabe, builtin fallback — see D1. (2) `loom.roles.artificer` mirrors vibers exactly (`clerk:* tools:*`), injected via `config` given. (3) Target `@shardworks/nexus-core` — smallest, zero-dep framework package. (4) `spider.variables`: `role=artificer`, `buildCommand=pnpm --filter @shardworks/nexus-core build`, `testCommand=pnpm --filter @shardworks/nexus-core test`. (5) `timeoutMs: 900000` (15-min cap). (6) `ANTHROPIC_API_KEY` inherits through `process.env` via `execFile` in `lab.daemon-setup` — confirmed no explicit `env:` pass.
**Consequences**: `baseline-execution-2b.yaml` encodes all six choices.

### D4 — Fix `lab.commission-post-xguild` writ-show command
**Status**: accepted
**Context**: Two trials failed (w-monn5qa9, w-monnj0vq) before any implementer ran. Root cause: scenario engine called `nsg writ-show` (hyphenated, non-existent CLI subcommand) instead of `nsg writ show` (space-separated). Earlier phases ran with `waitForTerminal: false` and never exercised the poll path.
**Decision**: Fixed in `scenario-xguild.ts` by splitting the args to `['writ', 'show', '--id', …]`. Committed as `77c473b7`.
**Consequences**: The polling path is now tested. 228/228 laboratory tests still passing.

### D5 — Work around Spider 0.1.292 plugin ordering bomb in manifest
**Status**: accepted
**Context**: Spider's `apparatus.start()` calls `g.apparatus('animator')` but only declares `requires: ['stacks', 'clerk', 'fabricator']`. This is latent in vibers (animator at position 0, spider at position 14) but surfaces any time spider precedes animator in the plugin list. Surfaced as a second root cause in the phase-2b trial failures; filed as `c-monniwt3`.
**Decision**: Workaround in `baseline-execution-2b.yaml` — list `[animator, loom, claude-code]` before `[spider, clockworks]` with a comment pointing at `c-monniwt3`. Proper fix (add `animator` to spider's `requires`) deferred to a commission.
**Consequences**: The manifest now has an ordering constraint that other manifests should copy until the underlying bug is fixed. `c-monniwt3` tracks the fix and a sweep for the same pattern across other apparatuses.

### D6 — Trial w-monnnuqw: phase 2b validated
**Status**: accepted
**Context**: After both bugs fixed and committed, posted third trial w-monnnuqw.
**Decision**: Trial completed end-to-end in ~2m 31s. Rig `rig-monnny9h` ran `draft → implement → review → revise → seal` (16 engines, 1 attempt each). Three real animator sessions captured: implement (102.8s, $0.207), review (11.4s, $0.045), revise (8.1s, $0.026). Total cost $0.278 — within the ~$0.30 pre-trial budget estimate. Implementer (sonnet) committed `feat(nexus-core): add multiplySafely utility` with numeric.ts + numeric.test.ts in `packages/framework/core/src/util/` matching the brief exactly.
**Consequences**: Laboratory apparatus is end-to-end-validated against a live implementer session. Phase 2c (A/B) is unblocked once the probe diff-stats bug is fixed. `c-monew2rg` click will be concluded when phase 2c completes. One open follow-up: `lab.probe-git-range` commits-manifest.yaml reports all-zero diff stats (filesChanged/insertions/deletions) even when the patch has content.

## Next steps
- [x] Resolve 6 open design questions for phase 2b
- [x] Create `baseline-task-core.md` sibling brief targeting `@shardworks/nexus-core`
- [x] Create `baseline-execution-2b.yaml` manifest
- [x] Fix `lab.commission-post-xguild` writ-show command typo
- [x] Work around spider ordering bug in manifest plugin list
- [x] Run phase 2b trial to completion (w-monnnuqw)
- [x] Extract artifacts to `artifacts/2026-05-02-baseline-2b-implementer/`
- [x] Update `spec.md` Trial 2b log entry
- [x] File follow-up clicks: `c-monniwt3` (spider ordering), `c-monnvxkz` (probe diff-stats), `c-monrvyj9` (phase 2c design), `c-monrw51a` (vibers daemon observation)
- [x] Draft handoff at `.scratch/handoff-lab-phase-2c.md`
- [ ] Fix `lab.probe-git-range` diff-stat extraction (c-monnvxkz) — pre-flight blocker for phase 2c
- [ ] Fix spider 0.1.292 ordering bug: add `animator` to `spider.requires` (c-monniwt3)
- [ ] Phase 2c design pass — resolve 6 open questions (c-monrvyj9) before authoring strong-prompt brief variant
- [ ] Phase 2c: baseline + strong-prompt A/B runs with multiple N, comparative analysis via `nsg lab trial-export-book` + DuckDB
- [ ] (parked) `c-monewa82`: rigTemplate null in probe summary
- [ ] (parked) `c-momm4abc`: failed-trial orphan cleanup (daemon pidfiles included)
- [ ] (parked) `c-momm4i15`: daemon ↔ CLI Scriptorium state drift (orphan codexes)
