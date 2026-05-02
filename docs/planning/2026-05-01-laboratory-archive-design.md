---
slug: laboratory-archive-design
date: 2026-05-01
session: 0cb4907e-adf3-41d2-92f3-6e88dc76565b
---

# Session distill — Laboratory Archive Design

## Intent — what Sean asked for
- Work through the archive design from the design handoff at `.scratch/handoff-laboratory-archive-design.md` (msg 1)
- Reframe from Coco's recommended hybrid approach to a DB-authoritative model with on-demand filesystem extraction (msg 25)
- Pressure-test edges of the DB-authoritative approach (msg 25)
- Challenge specific design choices: `scenarioWritId` fit, codex URL placement, `metadata` namespace ownership, and probe generality (msg 37)
- Clarify plugin packaging, probe-contributed extraction contract, and structural info capture (msg 39)
- Final confirmation: bundle probes, make probe registry MVP-required, use probe for context capture (msg 41)
- Update implementation handoff to reflect final design, amending preexisting inconsistencies (msg 77)
- Verify everything needed to unblock implementation was done (msg 63)

## In-flight inquiries

None.

## Decisions

### D1 — DB-authoritative archive (A1) adopted over hybrid filesystem approach
**Status**: accepted; reverses Coco's initial C recommendation
**Context**: Coco's stress-test recommended Option C (metadata book + filesystem mirror). Sean pushed back on DB↔filesystem reference brittleness when the filesystem is patron-owned. (msgs 24–25)
**Decision**: All trial data lives in the lab guild's stacks DB. Filesystem materialization happens on demand via `nsg lab trial-extract`. Three books: `lab-trial-archives` (one row per archived trial), `lab-trial-stacks-dumps` (generic JSON-bodied rows from test-guild books), `lab-trial-codex-commits` (one row per commit, diff body). (msg 26)
**Consequences**: Cross-trial querying is SQL-native. Browse UX adds one CLI step (extract before `cd`). Sanctum tree no longer accumulates multi-MB lab dumps. Backup surface concentrates to the lab guild's stacks DB. Sanctum reorganizations don't drag captured data.

### D2 — No clerk link for archive; FK only
**Status**: accepted
**Context**: Coco proposed a `laboratory.archived-as` link kind (msg 24). Sean asked whether writs can link to arbitrary things (msg 27). Code inspection revealed `WritLinkDoc` has `sourceId` and `targetId` both pointing at writs — clerk links are writ-to-writ only. (msgs 28–35)
**Decision**: Archive records are not writs. Relationship expressed as FK: `lab-trial-archives.trialId` → `clerk/writs.id`. No clerk machinery involved. (msg 36)
**Consequences**: `nsg lab trial-show <trialId>` queries `lab-trial-archives WHERE trialId=?` directly. Pure-DB reference with no path or link to rot.

### D3 — CLI surface and naming conventions
**Status**: accepted
**Context**: Sean specified `lab` as the common prefix for all laboratory CLI tools and renamed export-jsonl. (msg 27)
**Decision**: `nsg lab trial-show <trialId>`, `nsg lab trial-extract <trialId> --to <path> [--force]`, `nsg lab trial-export-book <trialId> --book <name> [--format jsonl|json]`. (msgs 27, 36)
**Consequences**: Consistent prefix grouping. Export tool name (`export-book`) is semantically accurate rather than format-specific.

### D4 — Implementation specifics: JSON1 only, in-memory yields, 10MB cap, annotations in sanctum
**Status**: accepted
**Context**: Four implementation detail decisions settled in one exchange. (msg 27)
**Decision**: (1) No column extraction at write time; add SQLite JSON1 expression indexes per hot query pattern as needed. (2) Probe yields are in-memory data structures, not streamed — data sizes don't justify streaming. (3) `lab.probe-git-range` fails loud if any single diff exceeds 10MB. (4) Analysis annotations live in sanctum markdown referencing `trialId`; never in laboratory books. (msgs 27, 36)
**Consequences**: Generic schema stays flexible. Captured data is immutable apparatus output; human analysis stays on sanctum side. Diff cap is a tripwire, not a constraint expected to bite.

### D5 — Archive engine is minimal; books are probe-contributed
**Status**: accepted
**Context**: Original design gave archive engine opinions about stacks-dump and codex-commit schemas. Sean observed those archives are specific and asked whether probes should produce them. (msg 37)
**Decision**: Archive engine owns only `lab-trial-archives` and has no schema opinions about probe data. Each probe owns its own book(s). `lab.probe-stacks-dump` owns `lab-trial-stacks-dumps`; `lab.probe-git-range` owns `lab-trial-codex-commits`. (msg 38)
**Consequences**: Archive engine stays minimal. Adding a new probe does not require archive engine changes. Books only exist for probes that are configured and run.

### D6 — Drop `scenarioWritId`; no codex URL in archive; replace `metadata` bag with per-probe summaries
**Status**: accepted
**Context**: Sean questioned whether `scenarioWritId` belongs in abstract metadata, where codex URL should live, and who writes to the `metadata` bag. (msg 37)
**Decision**: (1) `scenarioWritId` dropped — couples archive schema to a specific scenario shape. (2) Codex remote URL stays on the trial writ manifest (`ext.laboratory.config`); archive does not duplicate it. (3) No `metadata` flat-bag; each probe yields a `summary` object landing in `archive.probes[].summary`. (msg 38)
**Consequences**: `lab-trial-archives` row shape: `{id, trialId, status, archivedAt, probes[{id, engineId, summary}]}`. Trial-level facts not stored here are accessed directly from the trial writ.

### D7 — Probe registry + extract dispatch is MVP-required (not deferred)
**Status**: accepted
**Context**: Coco proposed hardcoding the two built-in probes in the extract tool for MVP. Sean pushed back — the hardcoding's intent would be forgotten by the time a third probe is added. (msg 41)
**Decision**: Probe engines self-declare an `extract(trialId, targetDir, guild)` handler. `nsg lab trial-extract` dispatches via a probe registry by `engineId`. New click `c-momkil4p` opened (MVP-required). (msgs 41, 49)
**Consequences**: Adding a new probe never requires changes to the extract tool. The probe interface contract must be defined as part of MVP, not deferred.

### D8 — `lab.probe-trial-context` (Option X) for structural info capture
**Status**: accepted
**Context**: Sean asked whether rig template, framework SHA, plugin pins, and manifest snapshot should be captured at archive time. Options were: probe (X) or archive-engine direct (Y). (msg 39)
**Decision**: New standard probe `lab.probe-trial-context` in the default rig template. Produces no bulk data — summary IS its output (rig id, template name, framework SHA, resolved pins, manifest snapshot at posting time). (msgs 40, 41)
**Consequences**: Structural context captured via the same mechanism as data probes — architecturally consistent. Opt-in via manifest, but included in default template. `c-momaa3w7` (standard probes) now covers three probes.

### D9 — Built-in probes bundle in laboratory package for MVP, with clean seams
**Status**: accepted
**Context**: Sean asked whether probes should separate into their own plugins so books only land if the probe is installed. (msg 39)
**Decision**: All three standard probes bundle in `@shardworks/laboratory` for MVP. Each probe lives under `src/probes/<name>/{engine,book,extractor}.ts`; the plugin builds its book registrations from a probe registry rather than a hardcoded list. Future extraction into separate packages is a mechanical lift. (msgs 40, 41)
**Consequences**: One install gets the full standard battery. Architectural seam preserved; per-probe package extraction is possible without surgery when forced by a real third-party probe.

### D10 — Atomicity is per-engine, not per-trial
**Status**: accepted
**Context**: Gap identified during implementation-unblocking review — earlier spec was silent on transaction scope, risking an implementer attempting a cross-engine transaction the rig structure forbids. (msgs 67–75)
**Decision**: Each engine's work is atomic (one transaction per probe; one for the archive engine index row). No cross-engine transactions. Orphaned probe rows tolerated; all queries join from `lab-trial-archives`. (msg 75)
**Consequences**: Simpler transaction scoping. Archive row serves as the coherence anchor; row `status: 'in-progress'` flags potential orphans for GC.

## Next steps
- [x] Conclude click `c-momaa5o9` (archive design)
- [x] Open MVP click `c-momkil4p` — probe registry + extract dispatch
- [x] Open implementation click `c-momkqtn5` — archive engine
- [x] Write archive design spec into `packages/laboratory/README.md`
- [x] Update coco-log and commit
- [x] Delete design handoff scratch file (`handoff-laboratory-archive-design.md`)
- [x] Update implementation handoff (`.scratch/handoff-laboratory-implementation.md`) with final design, correcting preexisting inconsistencies
- [ ] Implement probe registry + extract dispatch (`c-momkil4p`)
- [ ] Implement three standard probes: `lab.probe-stacks-dump`, `lab.probe-git-range`, `lab.probe-trial-context` (`c-momaa3w7`)
- [ ] Implement archive engine `lab.archive` (`c-momkqtn5`)
- [ ] Implement CLI tools: `nsg lab trial-show`, `nsg lab trial-extract`, `nsg lab trial-export-book`
- [ ] Codified smoke test (`c-momaa75l`)
- [ ] Documentation — architecture doc + end-user guide (`c-momaaa3t`)
- [ ] Port first real-world trial, probably X016 (`c-momaab8y`)
