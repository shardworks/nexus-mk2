# Session distill — 0cb4907e

## Intent — what Sean asked for
- Work on the laboratory archive design captured in `.scratch/handoff-laboratory-archive-design.md` (msg 1).
- Reframe the design: prefer DB-authoritative storage with an extract tool over filesystem-anchored archives, to avoid DB↔filesystem link brittleness when the filesystem is patron-owned (msg 25).
- Pressure-test the proposal so its edges don't collapse later (msg 25).
- Clarify book contents and clerk-link semantics; adopt `nsg lab <subcommand>` CLI naming with `lab-trial-export-book` rename (msg 27).
- Probe the abstraction: scenario-specific fields in archive metadata, codex remote-URL placement, `metadata` namespace ownership, generic-probe contributions vs hardcoded books-and-diffs archives (msg 37).
- Decide plugin packaging, dynamic extraction dispatch, and capture of rig/template/structural context (msg 39).
- Lock decisions: keep probes in laboratory plugin for MVP; make probe-registry + dynamic extract dispatch MVP-required; adopt Option X (probe-as-trial-context); conclude design click and write README spec (msg 41).
- After closeout, verify the rest of the implementation tree is unblocked (msg 66).
- Update `handoff-laboratory-implementation.md` with the new design and fix preexisting inconsistencies (msg 80).

## In-flight inquiries
None. All open lines from this session reached decisions. The deferred v2 extraction-into-separate-plugins question was acknowledged but not formalized as an open inquiry — it was set aside as a future packaging move with the MVP designed to make it mechanical.

## Decisions

### D1 — DB-authoritative archive over filesystem-anchored or hybrid
**Status**: accepted (reverses prior recommendation of hybrid "shape C" from msg 24)
**Context**: Initial pressure-test favored a hybrid "shape C" (small metadata book + filesystem). Sean flagged DB↔filesystem references as brittle when the filesystem is patron-owned and exposed to sanctum reorganizations (msg 25).
**Decision**: Store all captured trial data in the lab guild's stacks DB. Provide `nsg lab trial-extract` as an on-demand materializer rather than the canonical home.
**Consequences**: One SQLite transaction per archive engine run; no two-surface atomicity dance; sanctum reorgs don't drag captured data; browse-without-extract is gone (one CLI invocation tax); DuckDB/JSONL streaming covers programmatic analysis without extraction.

### D2 — Generic JSON-bodied stacks-dump book, not per-source-book mirroring
**Status**: accepted
**Context**: The alternative would mirror every test-guild book schema in laboratory, making source-plugin schema drift laboratory's problem.
**Decision**: One generic `lab-trial-stacks-dumps` book with `(trialId, sourceBook, sourceRowId, body JSON, capturedAt)`. Pure SQLite JSON1 expression indexes added per hot query.
**Consequences**: Laboratory has no schema opinions about test-guild plugins; querying via `json_extract` is more powerful than B's filesystem; indexes added incrementally as patterns emerge.

### D3 — FK-only linkage from archive to trial writ; no clerk link kind
**Status**: accepted (reverses earlier `laboratory.archived-as` link kind proposal in msg 24)
**Context**: Investigation of `WritLinkDoc` revealed clerk links are writ-to-writ only; archive records aren't writs and shouldn't be (msgs 33–36).
**Decision**: `lab-trial-archives.trialId` is a FK reference to `clerk/writs.id`. No new link kind. `nsg lab trial-show <trialId>` queries the archive book; `nsg writ show <trialId>` shows the trial writ (clean separation).
**Consequences**: Archive lookup is a plain join; no clerk machinery; archive records can't appear in writ-tree views (acceptable — they're captured data, not obligations).

### D4 — Archive engine has no schema opinions; books are probe-contributed
**Status**: accepted
**Context**: Hardcoding stacks-dumps and codex-commits as archive-core makes the archive engine a meta-plugin coupled to specific probes (msg 37).
**Decision**: Archive engine owns only `lab-trial-archives` (the index). Each probe owns its own data books. `lab-trial-archives.probes[]` records `{id, engineId, summary}` per probe; `summary` is opaque to the archive engine.
**Consequences**: New probes contribute new books without touching archive engine; "metadata namespace" question dissolves — each probe summary is its own namespace.

### D5 — Drop `scenarioWritId` and codex remote URL from archive metadata
**Status**: accepted (revises archive schema sketched in msg 36)
**Context**: `scenarioWritId` only holds for `commission-post-xguild` scenarios; future scenarios may post N commissions or none. Codex remote URL is on the trial writ's `ext.laboratory.config` manifest.
**Decision**: Don't duplicate manifest data in the archive. Scenario-produced data lives in scenario-engine yields; codex-baseline lookup goes through the trial writ.
**Consequences**: Archive schema stays scenario-agnostic; trial writ remains the authoritative manifest source.

### D6 — CLI surface uses `nsg lab <subcommand>` prefix collapse
**Status**: accepted
**Context**: CLI export collapses common prefixes; `lab` is the appropriate one (msg 27).
**Decision**: Tools defined as `lab-trial-show`, `lab-trial-extract`, `lab-trial-export-book` (renamed from `export-jsonl`). CLI surface: `nsg lab trial-show`, `nsg lab trial-extract`, `nsg lab trial-export-book`.
**Consequences**: Auto-grouping under `nsg lab`; rename of `export-jsonl` → `export-book` reflects that book is the unit, JSONL is just the default format.

### D7 — Pure JSON1 indexing, no extracted typed columns
**Status**: accepted
**Context**: Alternative was extracting universal fields (`parentId`, `status`, `createdAt`) into typed columns at capture time.
**Decision**: Start generic; add `CREATE INDEX ... json_extract(body, '$.field')` expression indexes per hot query as they emerge.
**Consequences**: No NULL-column special-casing across heterogeneous source books; index work happens incrementally as a normal SQLite optimization activity.

### D8 — 10MB per-diff tripwire, fail loud
**Status**: accepted
**Context**: Codex diffs at 99th percentile could push 500KB; SQLite TEXT handles up to ~1GB but degrades on large rows (msg 26).
**Decision**: `lab.probe-git-range` fails loud if any single diff exceeds 10MB. Sean chose 10MB over the proposed 5MB.
**Consequences**: Tripwire only — no silent truncation; blob-extraction policy deferred until it bites.

### D9 — In-memory probe yields, no streaming
**Status**: accepted
**Context**: Stacks-dump ~750KB; codex up to ~5MB total per trial.
**Decision**: Probes yield in-memory data structures; no streaming.
**Consequences**: Simpler probe contract; revisit only if data sizes outgrow it.

### D10 — Annotations live in sanctum markdown, FK-keyed by trialId
**Status**: accepted
**Context**: Question whether human/agent analysis notes belong in a `lab-trial-annotations` book or sanctum-side (msg 26 edge call 3).
**Decision**: Annotations are sanctum work, separate from immutable apparatus output. Sanctum markdown references `trialId`. No new book.
**Consequences**: Archive rows stay write-once; "what happened" and "what we made of it" cleanly separated.

### D11 — Bundle built-in probes in `@shardworks/laboratory` for MVP, with extraction-ready seams
**Status**: accepted
**Context**: Per-probe plugins would mean books only land if installed, but the MVP cost isn't earned by current need (msg 39 question 1, msg 41).
**Decision**: All built-in probes ship inside the laboratory plugin. Code organized under `src/probes/<name>/{engine,book,extractor}.ts` so v2 extraction into separate plugins is mechanical. Probe registry is built from a registry, not a hardcoded list.
**Consequences**: One install gets the standard battery; future packaging move requires no architectural surgery; v2 packaging click deferred (no formal click filed yet).

### D12 — Probe registry + dynamic extraction dispatch is MVP-required
**Status**: accepted (reverses msg 38 recommendation that hardcoded built-in dispatch was acceptable v1)
**Context**: Sean rejected hardcoded probe types — intent would be lost by the time dynamic lookup is needed (msg 41).
**Decision**: Probe engines self-declare an `extract(trialId, targetDir, guild)` handler. `nsg lab trial-extract` dispatches via the registry by `engineId`. Filed as new MVP click `c-momkil4p` under `c-moma9llq`.
**Consequences**: Third-party probes work day one; no later refactor from hardcoded dispatch; small interface lift in MVP.

### D13 — Trial context captured via `lab.probe-trial-context` (Option X)
**Status**: accepted
**Context**: Choice between probe-shaped capture (X) or archive-engine-direct field (Y) for rig id, template name, framework SHA, resolved plugin pins, manifest snapshot (msg 39 question 3).
**Decision**: Add `lab.probe-trial-context` probe to the default rig template. Summary-only output (~5KB), no bulk data, no own book. Lands in `archive.probes[]` like any other probe.
**Consequences**: Architectural consistency preserved (archive engine has no schema opinions); opt-in mitigated by template defaults; multi-deployment context-probe variation supported; opens the "summary-as-data" pattern for small probes.

### D14 — Atomicity is per-engine, not per-trial
**Status**: accepted
**Context**: Discovered during implementation handoff revision (msg 86) — implementer might try to wrap probes-and-archive in one transaction, which the rig structure forbids.
**Decision**: Each engine commits its own writes atomically. Archive row insert is atomic; probe rows are atomic per probe. Orphan probe rows tolerated; all queries join from `lab-trial-archives`.
**Consequences**: No cross-engine transactions; teardown gate becomes "archive row exists with `status: complete`" rather than "filesystem directory present"; orphan-tolerance is a deliberate property.

### D15 — Archive design click concluded; spec written into `packages/laboratory/README.md`
**Status**: accepted
**Context**: Sean approved closeout once D11–D13 settled (msg 41).
**Decision**: Conclude `c-momaa5o9` with full design summary; spec section in `packages/laboratory/README.md` is the canonical home (chosen over a separate `docs/laboratory/`); coco-log entry + commit under Coco identity; delete handoff scratch.
**Consequences**: Future implementers find the spec in the package's own README; design reasoning preserved in click conclusion.

### D16 — Update implementation handoff for new design and fix inconsistencies
**Status**: accepted
**Context**: Implementation handoff scratch was based on the old design.
**Decision**: Rewrite `handoff-laboratory-implementation.md` with corrected build order (registry first, then probes in parallel, then archive), three probes (added `lab.probe-trial-context`), correct click ID for archive engine impl (`c-momkqtn5` not the concluded design click), CLI tools step, explicit per-engine atomicity discipline, README as canonical spec pointer.
**Consequences**: Next implementer session has accurate marching orders; click `c-momaa3w7` amended to scope three probes including `lab.probe-trial-context`; new click `c-momkqtn5` opened for archive engine implementation.

## Next steps
- [x] Conclude `c-momaa5o9` (archive design click)
- [x] Open `c-momkil4p` (probe registry + extract dispatch, MVP-required)
- [x] Open `c-momkqtn5` (archive engine implementation)
- [x] Amend `c-momaa3w7` to scope three probes including `lab.probe-trial-context`
- [x] Write archive design spec into `packages/laboratory/README.md`
- [x] Add coco-log entry; commit under Coco identity with session trailer
- [x] Delete `.scratch/handoff-laboratory-archive-design.md`
- [x] Update `.scratch/handoff-laboratory-implementation.md` with corrected design and build order
- [ ] Implement probe registry + extract dispatch contract (`c-momkil4p`)
- [ ] Implement three standard probes: `lab.probe-stacks-dump`, `lab.probe-git-range`, `lab.probe-trial-context` (`c-momaa3w7`)
- [ ] Implement archive engine `lab.archive` (`c-momkqtn5`)
- [ ] Implement CLI tools: `lab-trial-show`, `lab-trial-extract`, `lab-trial-export-book`
- [ ] Codify smoke test (`c-momaa75l`)
- [ ] Retire infra spec (`c-momaa8mk`)
- [ ] Write architecture doc + end-user guide (`c-momaaa3t`)
- [ ] Port first real-world trial, likely X016 (`c-momaab8y`)
- [ ] (Deferred v2) File click for extracting built-in probes into separate plugins
