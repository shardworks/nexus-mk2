---
slug: lab-daemon-fixture-phase-2a
date: 2026-05-02
session: 9a768036-061d-404d-b306-b3a72c49d5f4
---

# Session distill — Laboratory daemon fixture + X016 phase 2a

## Intent — what Sean asked for
- Work from the handoff at `.scratch/handoff-lab-phase-2.md` — advance Laboratory phase 2 for X016 orientation-tax measurement (msg 5)
- Chose option 1: design pass first, resolve open questions before writing code (msg 27)
- Confirmed direction and authorized direct implementation: "sounds good. no brief... we are building this ourselves. lab isn't in the framework" (msg ~102)
- Corrected codex repo: "the codex for the trial should be the 'nexus' -- definitely not the nexus-mk2 repo!!" (4-point feedback message)
- Instructed Coco to add mandate→default rig mapping and accept other aspects of the manifest/trial run (4-point feedback message)
- Requested handoff for next session at close (final user message)

## In-flight inquiries

### I1 — Phase 2b design: plugin set and rig template
**Question**: Should phase 2b install astrolabe (gets `mandate→plan-and-ship` for free, but adds planner overhead) or configure `mandate→default` in guild.json (lighter, closer to pure implementer measurement)?
**What we've considered**: (a) Astrolabe brings a 13-engine rig including planner, analyst, patron-anima phases — noisy for orientation-tax measurement; (b) Spider ships a `default` template (`draft→implement→review→revise→seal`) without auto-registering the mandate mapping; it can be set via `spider.rigTemplateMappings` in guild.json.
**What we've ruled out (this session)**: No explicit ruling; phase 2a used neither (daemon only, no implementer rig fired). Coco's lean is option (b) — skip astrolabe.
**Where we got stuck / what we need next**: Decision criteria still missing: does the `default` template actually work for an orientation-suppression trial? Need to verify `spider.variables` values (`role`, `buildCommand`, `testCommand`) and confirm role definition for the test guild before committing to (b).

### I2 — Phase 2b brief tuning
**Question**: The existing `briefs/baseline-task.md` targets `src/util/numeric.ts` which won't be found by any package's test runner in the nexus monorepo. What task to use instead?
**What we've considered**: Retarget to a specific package (e.g. `packages/framework/cli/src/util/numeric.ts` with the corresponding test command), or pick a different small task that fits the monorepo shape.
**What we've ruled out (this session)**: Nothing ruled out — brief fix is deferred to phase 2b.
**Where we got stuck / what we need next**: Need a brief that targets the nexus monorepo structure cleanly and gives the implementer a bounded, verifiable task.

## Decisions

### D1 — Separate `lab.daemon-setup`/`lab.daemon-teardown` fixture pair (not in-place augmentation of `lab.guild-setup`)
**Status**: accepted
**Context**: The handoff suggested appending daemon lifecycle to `lab.guild-setup`. Coco argued for a separate fixture pair after reconnaissance showed the existing codex/guild decomposition follows "one concern per fixture."
**Decision**: New engine pair in `packages/laboratory/src/engines/daemon-fixture.ts`. Trial manifests opt in by adding a `daemon` fixture with `dependsOn: [test-guild]`. Opt-in matches reality — phase-1 trials don't need a daemon.
**Consequences**: One extra YAML block per phase-2+ trial. Composes correctly for future patterns (multi-daemon, restart-mid-trial). Matches existing convention.

### D2 — Use `nsg start` (not custom spawn) for daemon lifecycle
**Status**: accepted
**Context**: Handoff suggested writing `child_process.spawn(detached: true) + unref()` + custom pidfile in engine code. Reconnaissance of `start.ts` showed `nsg start` already handles: detach (default mode), pidfile at `.nexus/daemon.pid`, startup-sync (10s poll of pidfile + tool-server reachability), idempotency guard, stdio redirect to `.nexus/logs/daemon.{out,err}`.
**Decision**: Engine shells out `<localNsg> start` and reads the pidfile it creates. No custom spawn logic.
**Consequences**: Engine is a thin wrapper (~20 lines of logic). `nsg stop` is the symmetric teardown: SIGTERM → poll → SIGKILL, idempotent.

### D3 — Auto-allocate ephemeral ports; write to guild.json before `nsg start`
**Status**: accepted
**Context**: Vibers daemon binds default ports 7471 (tools) and 7470 (oculus). Concurrent test-guild daemons would collide.
**Decision**: `lab.daemon-setup` probes two free ports via probe-bind-release (`net.createServer().listen(0)` then close), deep-merges `{ tools: { serverPort }, oculus: { port } }` into the test guild's `guild.json` before starting. Accepts optional `givens.toolServerPort`/`givens.oculusPort` overrides.
**Consequences**: Phase-2a trial confirmed: auto-allocated tools=40833, oculus=32901, no collision with vibers' 7471/7470. Tiny race between port probe and daemon bind exists but is negligible in single-trial-at-a-time operation.

### D4 — Phase 2a split: daemon smoke test before full implementer execution
**Status**: accepted
**Context**: Phase 2b (real implementer session) costs ~$0.30/trial in API calls and requires 5–6 additional design decisions. Validating the daemon fixture mechanics first with no API cost reduces risk.
**Decision**: Phase 2a manifest (`baseline-execution-2a.yaml`) runs the full fixture pipeline (codex → test-guild → daemon) with `waitForTerminal: false` and no animator/loom/claude-code. Daemon just starts, idles, stops cleanly.
**Consequences**: Phase 2a validated 16/16 engines green, archive `lar-monlfqir-a25da3488822`. Phase 2b design questions are now the only gate for first implementer execution.

### D5 — Trial codex must be `/workspace/nexus` (framework repo), not `/workspace/nexus-mk2`
**Status**: accepted (Sean correction)
**Context**: Coco initially authored phase-2a manifest with `upstreamRepo: /workspace/nexus-mk2`. Sean corrected: "the codex for the trial should be the 'nexus' -- definitely not the nexus-mk2 repo!!"
**Decision**: Trial codex always points at `/workspace/nexus` (the framework source). `baseSha: 3c307a20a7afc33df96c87c1a2d694edfb951c05` (local HEAD).
**Consequences**: Brief tasks need to target nexus monorepo structure, not sanctum files.

### D6 — Defer crash-recovery; amend `c-momm4abc` scope to include daemon pidfiles
**Status**: accepted
**Context**: Handoff flagged "crash recovery" as open question. If lab-host crashes mid-trial, orphaned test-guild daemons keep running and pidfiles are lost.
**Decision**: Defer full crash-recovery to a follow-up. Amended click `c-momm4abc` (Failed-trial orphan cleanup) to note that daemon pidfiles and orphan daemon processes are part of the eventual orphan-recovery sweep.
**Consequences**: No blocking work for phase 2b. Operational risk is low in current single-trial-at-a-time operation.

## Next steps
- [x] Design pass on phase 2 daemon lifecycle (D1–D4)
- [x] Implement `lab.daemon-setup`/`lab.daemon-teardown` in `daemon-fixture.ts`
- [x] 18 unit tests for daemon fixture
- [x] Update `engines/index.ts` to register new engines
- [x] Update `README.md` with daemon fixture section
- [x] Author phase-2a manifest (`baseline-execution-2a.yaml`)
- [x] Run phase-2a smoke test — 16/16 engines green, archive created
- [x] Commit: `1f5f820e laboratory: lab.daemon-setup/teardown fixture pair for phase-2 trials`
- [x] Commit: `e3cff686 X016 phase 2a — first daemon-fixture trial completed end-to-end`
- [x] Write handoff to `.scratch/handoff-lab-phase-2b.md`
- [ ] Phase 2b: resolve 6 open design questions (plugin set/rig template, role config, brief tuning, `spider.variables`, timeout, API key) then run first implementer-driven trial
- [ ] `c-monewa82`: fix `rigTemplate: null` in probe summary (~30-min, no API cost)
- [ ] `c-momm4abc`: failed-trial orphan cleanup (includes daemon pidfiles per D6)
- [ ] `c-momm4i15`: daemon ↔ CLI Scriptorium state drift (3 orphan codexes in vibers)
- [ ] Vibers: investigate Spider block-checker fault isolation (one bad rig stalls all dispatch)
