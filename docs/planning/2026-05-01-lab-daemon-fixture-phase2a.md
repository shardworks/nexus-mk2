---
slug: lab-daemon-fixture-phase2a
date: 2026-05-01
session: 9a768036-061d-404d-b306-b3a72c49d5f4
---

# Session distill — Laboratory daemon fixture + X016 phase 2a trial

## Intent — what Sean asked for
- Continue from handoff `.scratch/handoff-lab-phase-2.md`: design pass on X016 phase 2 daemon lifecycle (`c-monew2rg`), then implement and run the phase 2a smoke test (msg 1)
- Chose option 1: design pass before any code, not a brief — "we are building this ourselves. lab isn't in the framework" (msg 2, msg 3)
- After design conclusions: "proceed with 1" — implement the daemon fixture, author the manifest, and run the trial (msg 4)
- Reviewed the manifest draft; corrected codex `upstreamRepo` from wrong repo (`nexus-mk2`) to correct one (`nexus`) (msg 5)
- Prepared handoff for next session at wrap-up (msg 6)
- Asked for distiller token count and list of active shell processes at session end (msg 7)

## In-flight inquiries

None.

## Decisions

### D1 — Use `nsg start` (not `nsg crawl-continual`) for test-guild daemon
**Status**: accepted  
**Context**: Handoff listed `nsg start` vs `nsg crawl-continual` as open design question. Recon of `start.ts` revealed `nsg start` is a fully-formed detached daemon: handles pidfile, stdio redirect, startup-sync, SIGTERM teardown. `crawl-continual` is only the spider loop — it skips the tool HTTP server the implementer anima requires.  
**Decision**: Use `nsg start`. The tool HTTP server is required for animator-driven trials. Oculus comes along best-effort (skipped if not installed). `crawl-continual` deferred as future optimization for headless probe-only trials.  
**Consequences**: Lab daemon-setup engine shells out `<localNsg> start`, waits for pidfile + tool-server sync (free: handled by `nsg start` internals), then yields. Teardown calls `<localNsg> stop` (idempotent). No `child_process.spawn(detached: true)` in engine code.

### D2 — Separate `lab.daemon-setup`/`lab.daemon-teardown` fixture pair (not baked into `lab.guild-setup`)
**Status**: accepted  
**Context**: Handoff proposed adding daemon lifecycle to `lab.guild-setup`. Alternatives: (A) append to guild-setup, (B) new opt-in fixture pair.  
**Decision**: New fixture pair `lab.daemon-setup` / `lab.daemon-teardown` (option B). Three reasons: (1) opt-in matches reality — phase 1 trials don't want a daemon; (2) composable for future multi-daemon or restart scenarios; (3) matches existing `-setup`/`-teardown` fixture convention.  
**Consequences**: Trial manifests opt in via `dependsOn: [test-guild]`. Phase 1 manifests unchanged. Fixture teardown runs in reverse-topo order (daemon-teardown → guild-teardown → codex-teardown).

### D3 — Auto-allocate ephemeral ports with manifest override
**Status**: accepted  
**Context**: Lab-host's vibers daemon occupies ports 7471 (tools) and 7470 (oculus). Test-guild daemon starting with same defaults would collide.  
**Decision**: `lab.daemon-setup` accepts optional `givens.toolServerPort` / `givens.oculusPort`. If absent, auto-allocates via `net.createServer().listen(0)` bind-release. Writes allocated ports into `guild.json` via existing deep-merge before `nsg start`. Yields `{ daemonPid, toolServerPort, oculusPort, logDir }`.  
**Consequences**: Port collision eliminated. Trial 2a confirmed ports 40833/32901 allocated cleanly alongside vibers' 7471/7470. Tiny bind-release race noted; not gated since single-trial-at-a-time world.

### D4 — Defer crash recovery to `c-momm4abc`
**Status**: accepted  
**Context**: Lab-host crash mid-trial would leave orphaned test-guild daemons. Handoff suggested writing pid to writ's `ext.laboratory.runtime`.  
**Decision**: Defer. Scope note added to `c-momm4abc` (failed-trial orphan cleanup) that daemon pidfiles are part of the orphan inventory. No phase-2 blocker.  
**Consequences**: No crash recovery in current implementation. Recovery scan on restart is future work.

### D5 — Lab apparatus lives in sanctum, not framework
**Status**: accepted  
**Context**: Coco initially searched `/workspace/nexus/packages/laboratory/` (doesn't exist). Lab package is sanctum-side at `/workspace/nexus-mk2/packages/laboratory/`.  
**Decision**: Confirmed by Sean: "lab isn't in the framework." All engine work done in `/workspace/nexus-mk2/packages/laboratory/src/engines/`.  
**Consequences**: Implementation target clarified early; no framework changes needed.

### D6 — Codex `upstreamRepo` for X016 trials must be `/workspace/nexus`
**Status**: accepted  
**Context**: Coco drafted the phase 2a manifest with `upstreamRepo: /workspace/nexus-mk2` (the sanctum). Sean caught this: "(3) the codex for the trial should be the 'nexus' -- definitely not the nexus-mk2 repo!!" The codex is the source code the implementer rig works against; it must be the framework repo.  
**Decision**: `upstreamRepo: /workspace/nexus` in all X016 trial manifests. Same as phase 1 manifest (`baseline-apparatus-validation.yaml`).  
**Consequences**: Manifest corrected before trial run. SHA pinned to local HEAD of `/workspace/nexus`.

### D7 — Coco maintains in-session checklist in `.scratch/notes-<session-id>.md`
**Status**: accepted  
**Context**: Sean asked Coco to track open items / memos actively during sessions.  
**Decision**: Coco's agent spec (`coco.md`) updated with "In-session Checklist" section: maintain `.scratch/notes-<session-id>.md` with open/tasks/memos columns.  
**Consequences**: Future sessions will have a live scratch pad for mid-session tracking.

### D8 — X016 phase 2a smoke test validated daemon fixture
**Status**: accepted  
**Context**: After implementing `lab.daemon-setup` / `lab.daemon-teardown` (228/228 tests passing), phase 2a trial posted and run.  
**Decision**: Trial ran to completion — writ `w-monlfejq-2e343b788e0d`, rig `rig-monlffd3-d32f317e`, 16 engines, ~16s wallclock, ports 40833/32901. Spider crawl idled (no rig template mapping for `mandate` without astrolabe), daemon sat idle, teardown ran in reverse-topo order cleanly.  
**Consequences**: Daemon fixture confirmed working. Phase 2b (full implementer execution with `waitForTerminal=true`) is now unblocked. Handoff written to `.scratch/handoff-lab-phase-2b.md`.

## Next steps
- [x] Design pass on X016 phase 2 daemon lifecycle (`c-monew2rg`)
- [x] Implement `lab.daemon-setup` / `lab.daemon-teardown` in `packages/laboratory/src/engines/daemon-fixture.ts`
- [x] Register engines in `packages/laboratory/src/engines/index.ts`
- [x] 228/228 unit tests passing; typecheck clean
- [x] Author X016 phase 2a manifest (`baseline-execution-2a.yaml`)
- [x] Run X016 phase 2a trial — succeeded
- [x] Update `experiments/X016-orientation-suppression/spec.md` with trial 2a log
- [x] Update `packages/laboratory/README.md` (5 fixture/scenario pairs, 228 tests)
- [x] Add in-session checklist to `coco.md`
- [x] Author `.scratch/handoff-lab-phase-2b.md`
- [ ] Kill 3 orphaned shell processes (PIDs 1885608, 1885766, 1886310) from distiller wait loops — confirm with Sean before killing
- [ ] X016 phase 2b: add animator/loom/claude-code plugins, set `waitForTerminal: true`, run full implementer trial (`c-monew2rg`)
- [ ] Conclude / update click `c-monew2rg` once phase 2b validates
- [ ] `c-monewa82`: investigate `rigTemplate: null` in probe summary (cosmetic, low priority)
- [ ] `c-momm4abc`: design failed-trial orphan cleanup — now includes daemon pidfiles in scope
- [ ] `c-momm4i15`: daemon ↔ CLI Scriptorium state drift (cosmetic)
