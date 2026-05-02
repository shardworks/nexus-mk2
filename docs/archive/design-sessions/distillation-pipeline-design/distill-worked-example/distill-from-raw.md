# Session distill — 0cb4907e

## Intent — what Sean asked for
- Work on the laboratory archive design handoff at `.scratch/handoff-laboratory-archive-design.md` (msg 1).
- Reframe to DB-authoritative storage with on-demand filesystem extraction, citing aversion to DB↔user-owned-filesystem references (msg 25).
- Tighten CLI naming under a shared `lab` prefix; lock pure JSON1, 10MB cap, in-memory yields, sanctum-side annotations (msg 27).
- Push back on archive schema: drop `scenarioWritId`, don't duplicate trial-writ data, clarify metadata namespacing, recognize that the books are too specific to be archive-core (msg 37).
- Probe plugin packaging, extraction-logic shape, and rig-template capture (msg 39).
- Confirm bundled MVP + dynamic probe lookup as MVP-required + Option X for trial context (msg 41).
- Verify implementation is fully unblocked (msg 66).
- Update `handoff-laboratory-implementation.md` with the design and amend prior inconsistencies (msg 80).

## Questions raised this session
- ✓ A, B, or C archive shape? → A (DB-authoritative) chosen (msg 25).
- ⊘ `experiment` slug on manifest for archive-root resolution? → moot once filesystem ceased to be authoritative.
- ✓ Where does the spec get written? → `packages/laboratory/README.md` (msg 41/52).
- ✓ Per-row indexed columns vs pure JSON1? → pure JSON1 (msg 27).
- ✓ Big-diff cap value? → 10MB fail-loud tripwire (msg 27).
- ✓ Annotations book or sanctum markdown? → sanctum markdown FK-keyed by `trialId` (msg 27).
- ✓ Probe yields: in-memory vs stream? → in-memory (msg 27).
- ✓ Can writs link to arbitrary non-writ records? → no; FK-only relationship (msg 36).
- ✓ Does `scenarioWritId` belong in abstract archive metadata? → no, dropped (msg 38).
- ✓ Codex remote URL in archive? → no, looked up from trial writ (msg 38).
- ✓ Are `metadata` keys probe-ids or shared namespace? → neither; reorganized as `probes[]` with per-probe `summary` (msg 38).
- ✓ Are the books archive-core or probe-contributed? → probe-contributed (msg 38).
- ✓ Same plugin for now or separate per-probe plugins? → bundled with clean seams for MVP (msg 41).
- ✓ Probe-contributed extraction shape and timing? → `extract(trialId, targetDir, guild)`; dynamic lookup is MVP-required (msg 41).
- ✓ Capture rig template / structural info? → yes, via `lab.probe-trial-context` (Option X) (msg 41).
- ✓ Implementation fully unblocked? → after click hygiene + atomicity-discipline fix (msg 70+).

## Decisions

### D1 — DB-authoritative archive with on-demand filesystem extraction
**Status**: accepted (supersedes the assistant's earlier Hybrid-C recommendation in msg 24)
**Context**: Sean rejected DB↔user-owned-filesystem references because rename/reorg drift breaks linkage; wanted DB encapsulation plus filesystem ergonomics via materialization tool.
**Decision**: All trial data lives in the lab guild's stacks DB. Filesystem layout is reproduced on demand via `nsg lab trial-extract`; sanctum no longer holds captured data.
**Consequences**: Atomicity collapses to a single transaction per engine; sanctum reorganizations don't drag captured data; cross-trial queries become trivial SQL; browse-without-extract is gone (one CLI step tax); concentrates the backup problem to the lab guild.

### D2 — Three books: index + generic stacks dump + codex commits
**Status**: accepted
**Context**: Need queryable storage without making laboratory a meta-plugin that knows every other plugin's schema.
**Decision**: `lab-trial-archives` (one row per trial, the index), `lab-trial-stacks-dumps` (generic JSON-bodied row per source-row), `lab-trial-codex-commits` (one row per commit, diff body).
**Consequences**: A1 generic dump preferred over A2 per-book mirroring; schema drift in source plugins isn't laboratory's problem; SQLite JSON1 expression indexes added per hot query as needed.

### D3 — Pure JSON1 indexing, no extracted typed columns at write time
**Status**: accepted
**Context**: Edge-call from msg 26.
**Decision**: Start generic; add expression indexes on `json_extract(...)` per identified hot query.
**Consequences**: Avoids NULL columns from per-book schema gaps; keeps capture cheap.

### D4 — 10MB per-diff cap as fail-loud tripwire
**Status**: accepted
**Context**: SQLite handles ~1GB rows but performance degrades; need a guardrail without designing blob storage now.
**Decision**: `lab.probe-git-range` fails loudly if any single diff exceeds 10MB.
**Consequences**: No silent truncation; blob-extraction policy deferred until/unless it bites.

### D5 — In-memory probe yields
**Status**: accepted
**Context**: Realistic probe payloads are sub-MB; streaming complexity unjustified.
**Decision**: Probes yield full data structures in memory.
**Consequences**: Simpler engine contracts; revisit if a probe's data sizing demands it.

### D6 — Annotations live in sanctum markdown, not laboratory books
**Status**: accepted
**Context**: Sean did not want a new book for annotations; needed clear separation between "what happened" (apparatus output) and "what we made of it" (analysis).
**Decision**: Archive rows are immutable apparatus-captured facts. Analysis notes live in sanctum markdown referencing `trialId`.
**Consequences**: Archive rows stay immutable; no shared-bag namespace question.

### D7 — FK-only linkage; drop the `laboratory.archived-as` clerk link kind
**Status**: accepted (reverses the link-based proposal in msg 24/26)
**Context**: `WritLinkDoc.sourceId`/`targetId` are writ-to-writ only (verified via `link-normalize.ts`); archive records aren't writs.
**Decision**: `lab-trial-archives.trialId` FKs into `clerk/writs.id`. No clerk link.
**Consequences**: Cleaner, no path field to rot; lookups via simple SQL join.

### D8 — CLI surface under `nsg lab <subcommand>`; rename `export-jsonl` → `export-book`
**Status**: accepted
**Context**: Sean noted CLI tooling collapses common prefixes.
**Decision**: Tools `lab-trial-show`, `lab-trial-extract`, `lab-trial-export-book`.
**Consequences**: `export-book` takes a `--format jsonl|json` flag (default jsonl).

### D9 — Drop `scenarioWritId` from archive metadata
**Status**: accepted
**Context**: That field assumed scenarios always produce a single writ in the test guild — only true for `commission-post-xguild`.
**Decision**: Scenario-specific outputs live in the scenario engine's yield, not in archive metadata.
**Consequences**: Archive schema decouples from scenario shape.

### D10 — Don't duplicate trial-writ data in the archive
**Status**: accepted
**Context**: Codex remote URL, baseSha, plugin pin specs already live on `ext.laboratory.config`.
**Decision**: Archive carries only what the apparatus learned at runtime (e.g., `headSha`, `commitCount`).
**Consequences**: Single source of truth; analysis tools join archive ↔ trial writ for full picture.

### D11 — Archive engine minimal: owns only the index book
**Status**: accepted
**Context**: Schema-opinion creep would couple archive engine to every probe's data shape.
**Decision**: Archive engine writes one row to `lab-trial-archives` recording probes that ran and their summaries. No opinions about probe data shape.
**Consequences**: Each probe's `summary` is its own namespace, scoped under `probes[]` (no shared metadata bag).

### D12 — Books are probe-contributed; MVP bundled in laboratory plugin with clean seams
**Status**: accepted
**Context**: Probes should be substitutable; future probes contribute their own books.
**Decision**: For MVP, all books live in the laboratory package, but each probe sits under `src/probes/<name>/{engine,book,extractor}.ts` with registrations driven from a probe registry. Per-probe plugin extraction is deferred — the seam is what matters.
**Consequences**: Lift to per-probe packages later is mechanical; no architectural surgery required.

### D13 — Probe-contributed extraction logic is MVP-required, not v2-deferred
**Status**: accepted (Sean's call in msg 41, replacing the v2-deferral proposal in msg 40)
**Context**: Sean: "current the dynamic lookup to be mvp required."
**Decision**: Probe engines self-declare an `extract(trialId, targetDir, guild)` handler. `nsg lab trial-extract` dispatches via the registry — no hardcoded built-in handling. Filed as `c-momkil4p` under `c-moma9llq`.
**Consequences**: Adding a third probe doesn't require extract-tool code edits.

### D14 — Trial context captured by `lab.probe-trial-context` (Option X)
**Status**: accepted
**Context**: Need to capture rig id, template, framework SHA, resolved pins, manifest snapshot. Option Y would have given the archive engine its first schema opinion.
**Decision**: A summary-only probe in the default rig template, yielding into `archive.probes[]` like any other probe.
**Consequences**: Archive engine purity preserved; opt-in concern mitigated by template defaults; probe is added to `c-momaa3w7` scope.

### D15 — Atomicity is per-engine, not per-trial
**Status**: accepted (added during the unblock-check in msg 70+)
**Context**: Earlier handoff didn't make this explicit; an implementer might wrap probes+archive in one transaction, which the rig structure forbids.
**Decision**: Each engine commits its own writes atomically. Orphans tolerated; queries always join from `lab-trial-archives`.
**Consequences**: Teardown gate becomes "archive row exists with `status === 'complete'`" rather than directory existence.

### D16 — Spec home is `packages/laboratory/README.md`
**Status**: accepted
**Context**: Handoff offered README vs separate `docs/laboratory/`.
**Decision**: README — package's own home; autonomous implementer finds it.
**Consequences**: ~190 lines added covering archive design, books, probes, linkage, atomicity, registry, CLI, packaging.

## Next steps
- [x] Conclude `c-momaa5o9` archive design click with summary.
- [x] Open `c-momkil4p` (probe registry + extract dispatch, MVP-required) under `c-moma9llq`.
- [x] Open `c-momkqtn5` archive engine implementation click.
- [x] Amend `c-momaa3w7` to include `lab.probe-trial-context`.
- [x] Write archive design section into `packages/laboratory/README.md`.
- [x] Coco-log entry + commit; delete handoff scratch file.
- [x] Fix README atomicity language to "per-engine, not per-trial."
- [x] Update `.scratch/handoff-laboratory-implementation.md` with new build order, click IDs, three-probe scope, atomicity discipline, CLI tools, README as canonical spec.
- [ ] Implement `c-momkil4p` — probe registry shape (gates everything else).
- [ ] Implement `c-momaa3w7` — three probes (`stacks-dump`, `git-range`, `trial-context`) in parallel once registry exists.
- [ ] Implement `c-momkqtn5` — archive engine consuming probe upstream yields.
- [ ] Implement `lab-trial-show` / `lab-trial-extract` / `lab-trial-export-book` CLI tools.
- [ ] `c-momaa75l` — codify smoke test once chain works end-to-end.
- [ ] `c-momaaa3t` — documentation.
- [ ] `c-momaab8y` — port first real-world trial (likely X016).
