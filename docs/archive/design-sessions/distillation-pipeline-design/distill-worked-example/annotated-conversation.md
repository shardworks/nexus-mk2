# Annotated conversation — 0cb4907e

Same backbone as `raw-conversation.md`, but with BuJo-style inline
structural markers on Coco's lines. Tool-call interludes are compressed
to one line. User messages unchanged.

**Symbols used:**
- `[memo]` — observation / running thought (qualitative-coding memo)
- `[?]` — open question raised
- `[!]` — decision made (or recommendation pending Sean's confirmation)
- `[•]` — task / next step
- `[>]` — migrated forward / parked / handed off

---

## [001] user

let's work on: /workspace/nexus-mk2/.scratch/handoff-laboratory-archive-design.md

---

## [002–006] coco

*(tool calls: read handoff doc, resolve session id, scan click tree, show recent commits)*

---

## [003 / 007 / 014] coco — orientation memos

`[memo] system-reminder says laboratory is retired no-op stub, but handoff describes operable apparatus. Today is 2026-05-01, retirement was yesterday. Need to reconcile before kicking off design conversation.`

`[memo] click c-momaa5o9 status ●; recent commit "session-notes: laboratory-v2 wrap-up". Need to verify whether design was already concluded or whether laboratory was wound down before resolution.`

`[memo] resolved: system reminder is about old laboratory v1. What we're working on is laboratory v2, a different apparatus reusing the name. Wrap-up confirms this archive design is the next live blocker.`

---

## [008–023] coco

*(tool calls: load click subtree, read original infra spec, locate package source, read types and stubs)*

---

## [024] coco — Phase 1 stress-test

I'm fully oriented. Let me do the stress-test work and bring you findings.

**Phase 1 — Stress-test, worked example: a P3 cost trial**

`[memo] one trial captures: stacks dump ~150 rows across 6 books (heterogeneous shapes, sub-1KB each); codex history 5–20 commits, 1KB–200KB per diff, ~100–500KB total; metadata <1KB.`

### Option A — All in lab guild's books

`[memo] A's "self-describing guild" pro is real but partial — half the data is opaque JSON anyway because source rows are heterogeneous. Strongest pro: multi-trial query. Weakest con: loss of filesystem/.patch tooling.`

### Option B — Sanctum mirror

`[memo] B matches today's analysis habits (Python scripts walking experiments/X*/artifacts/). Cross-trial discovery is the weak point — solvable with an index, but at that point you've reinvented A's metadata book without using the framework's primitive.`

### Option C — Hybrid (small metadata book + filesystem)

`[memo] C is B with the cross-trial index that B will inevitably need, expressed using the framework's native primitive (a book) rather than reinvented as a static index.`

### Recommendation

`[!] (recommendation, pending Sean) ship Option C — hybrid metadata-book + filesystem.`

Reasoning, in priority order:
1. B's weakness (cross-trial discovery) is C's marginal cost.
2. A's stacks-dump-as-rows is a false economy — JSON blobs in SQLite, lose `.patch` tooling.
3. Filesystem matches today's analysis habits.
4. C composes naturally with the apparatus already shipped.

Concrete spec sketch follows: book schema for `lab-trial-archives`, filesystem layout under `<archiveRoot>/`, archiveRoot resolution via `experiment` slug, probe yields contract, atomicity protocol with phase-tagged metadata + GC sweep, teardown gate.

`[?] open: experiment slug on the manifest — needed for archive-root resolution and free for v2 experiment writ type? Alternative: flat <sanctum>/lab-archives/trial-<slug>-<id>/.`
`[?] open: spec lives in packages/laboratory/README.md (preferred) or separate docs/laboratory/?`
`[?] open: any axis of the stress-test feels under-explored?`

---

## [025] user

I find references between DB and filesystems to be problematic, esp when the filesystem is user-owned and not hidden on a server somewhere. I would like to try to find a way to make the DB authoritative, something like what shape A is. I was thinking we would store it in db, make it as queryable as possible, but provide an extract tool which could be used to materialize a trial on disk. This way we get the filesystem usability and the db encapsulation, without link brittleness. But I've only half thought it through, so please pressure test the edges here.

---

## [026] coco — Pressure-test of DB-authoritative reframe

`[memo] Sean's reframe shifts the whole picture. The brittleness I was treating as "DB↔filesystem" was actually "patron-tree↔apparatus-data." Once you separate those, A becomes much stronger than I gave it credit for.`

`[!] reversing earlier recommendation (C → A1). Pure-DB with on-demand extract tool is the right shape.`

Key pressure-points:

`[memo] storage shape: A1 (generic dump) is queryable enough; A2 (per-book schema) is wrong — laboratory becomes a meta-plugin that has to know every other plugin's schema. SQLite JSON1 expression indexes give us hot-field indexing without per-book schemas.`

`[memo] atomicity gets simpler not harder: hybrid had two-surface dance (filesystem + metadata + GC). Pure-DB collapses to one SQLite transaction wrapping the archive engine. Failure → rollback.`

`[memo] single-trial browse depends on extract tool being fast: ~150 dump rows + ~15 commit rows = sub-second. Extract is genuinely cheap. One extra step vs cd-directly. Real but bounded tax.`

`[memo] programmatic analysis doesn't need extract: DuckDB reads SQLite natively; nsg lab-trial-export-jsonl streams JSON; nsg lab-trial-show for summaries. Three access patterns, each appropriate to its caller.`

`[memo] annotations move out of trial directory and that's actually cleaner. Captured data is immutable apparatus output; analysis is sanctum activity. They were never the same thing.`

`[!] (recommendation) big-diff tripwire: soft cap of 5MB per diff at archive time, hard fail with clear message if exceeded.`

`[memo] sanctum stays clean — biggest win of the reframe. experiments/X<NNN>-<slug>/ tree no longer auto-fills with multi-MB lab dumps. Sanctum reorganizations don't drag captured data behind them.`

Edge calls I want Sean's gut on:

`[?] open: per-row indexed columns vs pure JSON1? Lean pure-JSON1 — start generic, add indexes per hot query.`
`[?] open: big-diff cap value — 5MB or 10MB?`
`[?] open: annotations in a lab-trial-annotations book or sanctum markdown referencing trialId? Lean sanctum.`
`[?] open: probe yields contract — full data in-memory, or stream? Lean in-memory; sizes don't justify streaming yet.`

`[•] task (gated): once edge calls settled, conclude c-momaa5o9 and write spec section into packages/laboratory/README.md.`

---

## [027] user

i'm a bit unclear on the exact content of the 3 books and what the link is for (can writs link to arbitrary other things?!). please expound on these items. also, for tools remember the cli export is going to extract common prefixes. i think we should just use `lab` as the common prefix (tools `lab-trial-show`, `lab-trial-extract`, etc.), so we would have `nsg lab trial-show`, `nsg lab trial-extract`, and `nsg lab trial-export-book` (note last one renames export-jsonl). to your edges: (1) yes, pure json1; (2) let's go 10mb to start; (3) not sure... what is in lab-trial-archives and what isn't annotations additional metadata? i don't want a new book, so if there's no place in existing structures than definitely lean (b) here; (4) in memory for now

---

## [028–035] coco

*(tool calls: locate clerk link source, find WritLink type definitions, check link target types)*

---

## [036] coco — Drop the link, FK only

`[memo] Sean was right to be skeptical. WritLinkDoc has sourceId and targetId both pointing at writs — clerk links are writ-to-writ only. The "laboratory.archived-as" link kind would have required archive records to be writs, which feels wrong (archives are captured data, not work-tracking obligations).`

`[!] decision: drop the clerk link entirely. Trial→archive relationship is just lab-trial-archives.trialId as FK into clerk/writs. Lookup via FK; no clerk machinery.`

Now making the books concrete with example rows:

`[!] decision: three books for MVP — lab-trial-archives (one row per archived trial; tiny index row), lab-trial-stacks-dumps (one row per source-row across test-guild books; generic JSON body + JSON1 indexes), lab-trial-codex-commits (one row per captured commit; diff body, 10MB cap).`

`[!] decision (Sean's edge calls): pure JSON1 indexing; 10MB diff cap; in-memory probe yields; annotations live in sanctum markdown referencing trialId (not in a new book).`

`[!] decision (CLI surface, per Sean's prefix-collapse rule): nsg lab trial-show, nsg lab trial-extract, nsg lab trial-export-book (renamed from export-jsonl).`

---

## [037] user

`scenarioWritId` is valid for our current type of scenarios, but maybe not all... I'm not sure it belongs in the abstract archive metadata schema. should `codex` have the remote URL of the original codex repo, so we can find the root of where the diffs apply? or is that looked up from the trial writ? are the `metadata` keys the ids of probes? or just a shared namespace that anything writes to? how does data get into there? One issue I see with this design is that the 'books archive' and 'git diff archive' are ... very specific. But are those archives not supposed to be produced by generic 'probes'?

---

## [038] coco — Schema cleanup based on Sean's pokes

`[memo] All four pokes are correct and the design is genuinely better for them.`

`[!] decision (1): drop scenarioWritId from archive schema. Assumes scenarios always produce a writ in test guild — only holds for commission-post-xguild shape. Hardcoding couples archive-schema to scenario-shape.`

`[!] decision (2): codex remote URL looked up from trial writ, not duplicated in archive. Archive carries only what apparatus learned at runtime (headSha, commitCount).`

`[!] decision (3, supersedes earlier metadata bag): no flat metadata field on archive. Each probe's summary is its own namespace, keyed by probe id + engine id in archive.probes[] array.`

`[!] decision (4, the critical reframe): books are probe-contributed, not archive-core. Archive engine owns one book (lab-trial-archives), invokes probes, records probe summaries. Probes own their own data books and schemas.`

`[memo] this means: archive engine has no schema opinions about probe data. Probes own their own data books. Future network-trace-probe or transcript-capture-probe contributes its own book(s).`

`[memo] trial-level facts (durationMs, endCondition, resolved pins) all derivable from elsewhere. If we later decide a fact is universally useful, it becomes a probe (lab.probe-trial-summary or similar) — same pattern. Archive engine stays minimal.`

New shape:
```jsonc
{
  "id": "...", "trialId": "...", "status": "...", "archivedAt": "...",
  "probes": [
    { "id": "stacks", "engineId": "lab.probe-stacks-dump", "summary": {...} },
    { "id": "codex", "engineId": "lab.probe-git-range", "summary": {...} }
  ]
}
```

`[?] open: extract tool dispatch — MVP hardcodes per-probe materialization. Adding a third probe in future requires extract-tool code changes until v2 lands probe-contributed extraction logic. Mark as known v1 limitation in spec.`

---

## [039] user

so the same plugin still contributes those books, because it owns the probes? or should we move the probes to their own plugins so that we don't create books unless someone actually installs them? what would probe-contributed extraction logic look like? could we add that as a new implementation click? finally, should we capture the rig template or other structural information about what the trial was in the trial metadata?

---

## [040] coco — Plugin packaging, extraction contract, context capture

`[memo] three real questions; taking them in order.`

### 1. Plugin packaging

`[!] (recommendation) bundle for MVP, with seams designed for clean extraction.`

Reasoning: per-probe directory layout (`src/probes/<name>/{engine,book,extractor}.ts`), plugin's book registrations come from a probe registry the plugin builds. When v2 wants third-party probes, lift `src/probes/stacks-dump/*` into a new package — mechanical, no architectural surgery.

`[memo] "books only created when installed" property is correct as the end state but doesn't earn the MVP cost. Ship seams clean now, extract when forced.`

### 2. Probe-contributed extraction contract

Sketch:
```ts
interface ProbeEngineDesign extends EngineDesign {
  run(givens, context): Promise<EngineRunResult>;
  extract(args: { trialId, targetDir, guild }): Promise<{ files: ... }>;
}
```

`[•] task (proposed): file new implementation click for probe registry + extract dispatch contract. v2 originally; reconsidered below.`

### 3. Capturing rig / framework / pin context

Two options:
- **X**: a `lab.probe-trial-context` probe sits in default rig template, yields summary into archive.probes[].
- **Y**: archive engine captures `context` field directly outside probes[] array.

`[!] (recommendation) Option X — context-as-probe, included in default trial-template scaffolding.`

`[memo] X wins on architectural consistency. Archive engine stays at "minimal index of what probes ran." Y breaks "archive engine has no schema opinions" purity.`

Decisions to lock in:
`[?] open (gates closeout): plugin packaging — bundled-with-seams? probe-contributed extraction click — file as v2 or MVP-required? trial-context capture — Option X or Y?`

---

## [041] user

Convinced, keep them in the same plugin for now. (2) don't love hardcoding the probe types, seems like the type of thing we will forget the intent by the time need to add the lookup. i would say add a click to the implementation set, but currently the dynamic lookup to be mvp required. (3) sure, let's go with option X. If that's good, go ahead and conclude with the design summary and do the section writeup

---

## [042–050] coco

*(tool calls: read README, scan vocabulary tome, open new MVP click, conclude archive design click)*

`[!] decision (Sean's calls): bundled for MVP; probe registry + dynamic lookup is MVP-required (not v2); Option X for context capture.`
`[memo] vocabulary tome has no relevant terms — no cross-link needed.`
`[•] task: open c-momkil4p (probe registry + extract dispatch, MVP-required, sibling under c-moma9llq).`
`[•] task: conclude c-momaa5o9 with full design summary.`

---

## [051–062] coco — Spec writeup + commit

*(tool calls: write README section, edit coco-log, delete scratch handoff, stage and commit)*

`[•] task done: README section landed (~190 new lines covering archive design, books, probes, linkage, atomicity, registry, CLI, packaging).`
`[•] task done: coco-log entry added; scratch handoff deleted; commit landed under Coco identity with session trailer.`

---

## [066] user

did we do everything needed to unblock the rest of the implementation?

---

## [067–076] coco — Implementation-tree audit

*(tool calls: read implementation handoff, extract implementation tree, read README, edit README, amend probe-engines click, open archive-engine implementation click)*

`[memo] almost — two click-hygiene gaps and one schema simplification needed before implementer picks this up.`

`[!] decision: simplify atomicity from "single SQLite transaction wraps everything" to "per-engine atomicity, no cross-engine transactions." Reasoning: rig structure runs each engine separately, can't span transactions.`

`[•] task done: README updated with corrected atomicity language.`
`[•] task done: c-momaa3w7 (probe-engines click) amended to include lab.probe-trial-context as third standard probe.`
`[•] task done: opened c-momkqtn5 for archive-engine implementation (separate from c-momaa5o9 design click).`

---

## [079] coco — Implementer handoff summary

`[•] task done: implementation now genuinely unblocked.`

Updated tree under c-moma9llq:
- `[•] c-momkil4p` Probe registry + extract dispatch (MVP-required)
- `[•] c-momaa3w7` Three standard probes (stacks-dump, git-range, trial-context)
- `[•] c-momkqtn5` Archive engine
- `[•] c-momaa75l` Codified smoke test
- `[•] c-momaaa3t` Documentation
- `[•] c-momaab8y` First real-world trial port

Build order: registry → probes in parallel → archive engine → CLI tools → smoke test.

Key contracts: per-engine atomicity, pure JSON1 indexing, 10MB diff tripwire, FK-only linkage, sanctum-side annotations, bundled packaging with per-probe directory seams.

---

## [080] user

ok, update the handoff prompt (`/workspace/nexus-mk2/.scratch/handoff-laboratory-implementation.md`) with the above, and amend any preexisting inconsistencies as needed

---

## [081–086] coco — Handoff doc update

*(tool calls: write handoff doc, read for verification, write again, check git status)*

`[•] task done: handoff doc updated.`

`[memo] key changes from prior version: build order corrected (registry first, not archive first); three probes not two; new step 1 (probe registry + extract dispatch); archive engine click corrected (c-momkqtn5 not c-momaa5o9); CLI tools step added; per-engine atomicity discipline added; archive engine description tightened; pointers updated (README promoted to canonical spec home).`

`[memo] doc lives in .scratch/, no commit needed — working handoff for next session pickup.`
