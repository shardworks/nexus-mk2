# Session distill — 0cb4907e

## Intent — what Sean asked for
- Open handoff doc `handoff-laboratory-archive-design.md` and design the laboratory v2 trial-archive shape (msg 001)
- Pressure-test a DB-authoritative reframe: store trials in DB with an extract tool to materialize to disk, instead of filesystem-backed (msg 025)
- Clarify the three books' content, the trial→archive linkage, and adopt `lab` as CLI common prefix (renaming `export-jsonl` → `trial-export-book`); answer edge calls (msg 027)
- Probe further: scenarioWritId belonging in abstract schema, codex remote URL placement, metadata keys semantics, whether books archive / git diff archive should be probe-produced rather than baked in (msg 037)
- Decide plugin packaging boundary, extraction-contract approach, and trial-context capture (msg 039)
- Lock in: bundled plugin, dynamic probe lookup as MVP-required, Option X; conclude design and write spec (msg 041)
- Audit whether implementation is fully unblocked (msg 066)
- Update handoff prompt `handoff-laboratory-implementation.md` with current state and fix preexisting inconsistencies (msg 080)

## Questions raised this session
- ⊘ Experiment slug on manifest needed for archive-root resolution? (msg 024) — moot once filesystem dropped
- ✓ Spec home: `packages/laboratory/README.md` or separate docs/? (msg 024) — README
- ✓ Per-row indexed columns vs pure JSON1? (msg 026) — pure JSON1 (msg 027)
- ✓ Big-diff tripwire 5MB or 10MB? (msg 026) — 10MB (msg 027)
- ✓ Annotations: new book or sanctum markdown referencing trialId? (msg 026) — sanctum markdown (msg 027)
- ✓ Probe yields: in-memory or streaming? (msg 026) — in-memory for now (msg 027)
- ✓ Can writs link to arbitrary objects? (msg 027) — no, clerk links are writ-to-writ; drop link, use FK (msg 036)
- ✓ Does scenarioWritId belong in abstract archive schema? (msg 037) — no, drop it (msg 038)
- ✓ Should codex remote URL be in archive? (msg 037) — no, look up from trial writ (msg 038)
- ✓ Are metadata keys probe ids or shared namespace, and how does data get there? (msg 037) — replaced with `probes[]` array, each entry namespaced by probe id + engine id (msg 038)
- ✓ Should books-archive / git-diff-archive be generic-probe-produced? (msg 037) — yes, books are probe-contributed (msg 038)
- ✓ Plugin packaging: bundle probes or split? (msg 039) — bundle for MVP with per-probe directory seams (msg 041)
- ✓ Probe-contributed extraction: file as v2 or MVP-required? (msg 040) — MVP-required (msg 041)
- ✓ Trial-context capture: probe (X) or archive-engine field (Y)? (msg 040) — Option X (msg 041)
- ✓ Capture rig template / structural context in archive? (msg 039) — yes, via `lab.probe-trial-context` (msg 041)
- ✓ Is everything needed to unblock implementation done? (msg 066) — no, two click gaps + atomicity wording fixed before declaring unblocked (msg 067–079)

## Decisions

### D1 — Hybrid metadata-book + filesystem (Option C)
**Status**: superseded by D2
**Context**: Stress-test of three options for archiving a P3 cost trial (~150 stacks rows, 5–20 commits, ~100–500KB). B's cross-trial discovery weakness was C's marginal cost; A's stacks-as-rows judged a false economy due to opaque JSON blobs and loss of `.patch` tooling.
**Decision**: Ship hybrid: small metadata book (`lab-trial-archives`) plus filesystem layout under `<archiveRoot>/`, atomicity via phase-tagged metadata + GC sweep.
**Consequences**: Would compose with shipped apparatus but introduce DB↔filesystem references and a two-surface atomicity protocol (msg 024).

### D2 — DB-authoritative with on-demand extract tool (Option A1)
**Status**: accepted, reverses D1
**Context**: Sean flagged DB↔filesystem references as brittle, especially with a user-owned filesystem; reframed as patron-tree vs apparatus-data separation (msg 025).
**Decision**: Pure-DB storage; generic JSON dump (A1, not per-book schema A2); extract tool materializes a trial to disk on demand. SQLite JSON1 expression indexes for hot fields.
**Consequences**: Atomicity collapses to a single SQLite transaction (later refined — see D14). Sanctum stays clean of multi-MB lab dumps. Three programmatic-access patterns (DuckDB direct, `lab trial-export-book`, `lab trial-show`) cover analysis without forcing extract. Annotations move to sanctum markdown (msg 026).

### D3 — Edge-call resolutions
**Status**: accepted
**Context**: Four edge calls remained after D2 (msg 026).
**Decision**: Pure JSON1 indexing (no per-row indexed columns); 10MB diff cap; in-memory probe yields; annotations live in sanctum markdown referencing trialId (no new book) (msg 027).
**Consequences**: Schema stays generic; large-diff failures are visible early; streaming deferred until sizes warrant it.

### D4 — CLI surface uses `lab` common prefix
**Status**: accepted
**Context**: Sean's prefix-collapse rule applies; `nsg` extracts common prefixes (msg 027).
**Decision**: Tools are `nsg lab trial-show`, `nsg lab trial-extract`, `nsg lab trial-export-book` (renaming the prior `export-jsonl`).
**Consequences**: Renames `export-jsonl` everywhere it appears in spec/handoff (msg 036).

### D5 — Drop clerk link, use FK only
**Status**: accepted
**Context**: WritLinkDoc's source/target are both writs — clerk links are writ-to-writ only. A "laboratory.archived-as" link kind would force archive records to be writs, which they aren't (captured data, not obligations) (msg 028–036).
**Decision**: Trial→archive relationship is `lab-trial-archives.trialId` as FK into clerk/writs. No clerk machinery.
**Consequences**: Lookup is a plain query; archives stay distinct from work-tracking writs.

### D6 — Three books for MVP
**Status**: accepted, partially superseded by D10
**Context**: Concrete book layout needed (msg 036).
**Decision**: `lab-trial-archives` (one tiny index row per archived trial), `lab-trial-stacks-dumps` (one row per source-row, generic JSON body + JSON1 indexes), `lab-trial-codex-commits` (one row per captured commit, diff body, 10MB cap).
**Consequences**: Three-book set frames MVP. Ownership later reframed in D10 — archive engine owns only `lab-trial-archives`; the other two are probe-owned.

### D7 — Drop `scenarioWritId` from archive schema
**Status**: accepted
**Context**: The field assumed scenarios always produce a writ in the test guild — only true for the commission-post-xguild shape (msg 037–038).
**Decision**: Remove from abstract archive metadata; do not couple archive schema to scenario shape.
**Consequences**: Schema generalizes across scenario kinds.

### D8 — Codex remote URL looked up from trial writ
**Status**: accepted
**Context**: Question whether archive should carry the original repo URL (msg 037).
**Decision**: Archive carries only what the apparatus learned at runtime (`headSha`, `commitCount`); URL is looked up via the trial writ.
**Consequences**: No duplication; archive shape stays minimal (msg 038).

### D9 — Probes[] array replaces flat metadata bag
**Status**: accepted, supersedes earlier `metadata` field on archive
**Context**: Sean asked whether `metadata` keys were probe ids or a shared namespace, and how data lands there (msg 037).
**Decision**: No flat `metadata` field. Each probe's summary is its own namespace as an entry in `archive.probes[]`, keyed by probe id + engine id (msg 038).
**Consequences**: Archive engine has no schema opinions about probe data; namespacing prevents collisions.

### D10 — Books are probe-contributed, not archive-core
**Status**: accepted
**Context**: Critical reframe from Sean's "are those archives not supposed to be produced by generic probes?" (msg 037).
**Decision**: Archive engine owns only `lab-trial-archives`, invokes probes, records summaries. Probes own their own data books and schemas. `lab-trial-stacks-dumps` and `lab-trial-codex-commits` belong to their respective probes.
**Consequences**: Future probes (network-trace, transcript-capture) contribute their own books without changes to archive engine. Trial-level facts later become probes too if universally useful (msg 038).

### D11 — Bundle probes in same plugin for MVP, with seams
**Status**: accepted
**Context**: Tradeoff between bundling and splitting probes into their own plugins (msg 039–040).
**Decision**: Per-probe directory layout `src/probes/<name>/{engine,book,extractor}.ts`; plugin's book registrations come from a probe registry the plugin builds. Extract to separate packages later when third-party probes are wanted.
**Consequences**: "Books only created when installed" deferred; extraction is mechanical when forced (msg 041).

### D12 — Probe registry + dynamic extract dispatch is MVP-required
**Status**: accepted
**Context**: Sean rejected hardcoding probe types in the extract tool ("we will forget the intent by the time we need to add the lookup") (msg 041).
**Decision**: Dynamic lookup via probe registry is MVP-required, not v2-deferred. New click `c-momkil4p` opened for it (msg 042–050).
**Consequences**: Extract dispatch becomes a contract from day one; adding probes later requires no extract-tool surgery.

### D13 — Trial context captured via `lab.probe-trial-context` (Option X)
**Status**: accepted
**Context**: Two options — context-as-probe (X) vs archive-engine field (Y) (msg 040).
**Decision**: Option X. Probe sits in default rig template, yields summary into `archive.probes[]`.
**Consequences**: Archive engine remains a "minimal index of what probes ran"; preserves the architectural purity of D10. `c-momaa3w7` amended to add `lab.probe-trial-context` as third standard probe (msg 041, 067–076).

### D14 — Per-engine atomicity, not cross-engine transaction
**Status**: accepted, refines D2's atomicity sketch
**Context**: Implementation audit revealed rig structure runs each engine separately and can't span SQLite transactions (msg 067–076).
**Decision**: Each engine handles its own atomicity. No single SQLite transaction wraps the archive flow.
**Consequences**: README atomicity language corrected before implementation handoff.

## Next steps
- [x] Conclude design click `c-momaa5o9` with summary
- [x] Land README section in `packages/laboratory/README.md` (~190 lines: archive design, books, probes, linkage, atomicity, registry, CLI, packaging)
- [x] Add coco-log entry; delete scratch handoff `handoff-laboratory-archive-design.md`; commit under Coco identity
- [x] Open `c-momkil4p` — probe registry + extract dispatch (MVP-required, sibling under `c-moma9llq`)
- [x] Amend `c-momaa3w7` to include `lab.probe-trial-context` as third standard probe
- [x] Open `c-momkqtn5` — archive engine implementation (separate from concluded design click)
- [x] Correct README atomicity language to per-engine
- [x] Update `handoff-laboratory-implementation.md` (corrected build order, three probes not two, registry as step 1, archive-engine click id, CLI tools step, per-engine atomicity, README as canonical spec home)
- [ ] Implement in build order: registry → three probes (parallel) → archive engine → CLI tools → smoke test (`c-momaa75l`)
- [ ] Documentation click (`c-momaaa3t`)
- [ ] First real-world trial port (`c-momaab8y`)
