# Raw conversation — 0cb4907e

Total messages: 86

---

## [001] user

let's work on: /workspace/nexus-mk2/.scratch/handoff-laboratory-archive-design.md

---

## [002] assistant

[tool: Read] /workspace/nexus-mk2/.scratch/handoff-laboratory-archive-design.md

---

## [003] assistant

I'll start by orienting myself — there's something I need to reconcile. The system reminder says "The Laboratory (retired 2026-04-30) was an observational guild plugin... It is now a no-op stub," but this handoff describes a built-and-operable laboratory apparatus with trial writs and phase orchestrators. Today is 2026-05-01, so the retirement happened yesterday. Let me check what the current state actually is before kicking off a design conversation that might be moot.

---

## [004] assistant

[tool: Bash] Resolve Claude session ID

---

## [005] assistant

[tool: Bash] Scan live and parked clicks

---

## [006] assistant

[tool: Bash] Show recent commits

---

## [007] assistant

I see something important. The click tree shows c-momaa5o9 (the archive design click this handoff targets) with status `●`, and there's a recent commit "session-notes: laboratory-v2 wrap-up". Let me check whether this was already concluded or whether the laboratory was wound down before the archive design got resolved.

---

## [008] assistant

[tool: Bash] Inspect archive design click status

---

## [009] assistant

[tool: Bash] Inspect laboratory parent click

---

## [010] assistant

[tool: Bash] List recent session notes

---

## [011] assistant

[tool: Bash] Find laboratory session notes

---

## [012] assistant

[tool: Bash] List newest session notes

---

## [013] assistant

[tool: Read] /workspace/nexus-mk2/experiments/ethnography/session-notes/new/2026-05-01T043532.md

---

## [014] assistant

Good — fully oriented now. The system reminder is about the *old* laboratory v1; what we're working on is laboratory v2, a different apparatus that reuses the name. The wrap-up confirms this archive design is the next live blocker.

Let me load the design context properly before kicking off the conversation.

---

## [015] assistant

[tool: Bash] Extract archive design click subtree

---

## [016] assistant

[tool: Bash] Read original infra spec

---

## [017] assistant

[tool: Read] /workspace/nexus/packages/laboratory/src/types.ts

---

## [018] assistant

[tool: Bash] Find laboratory typescript files

---

## [019] assistant

[tool: Bash] Get line count of infra spec

---

## [020] assistant

[tool: Bash] Find laboratory package directory

---

## [021] assistant

[tool: Bash] List laboratory source files

---

## [022] assistant

[tool: Read] /workspace/nexus-mk2/packages/laboratory/src/types.ts

---

## [023] assistant

[tool: Read] /workspace/nexus-mk2/packages/laboratory/src/engines/stubs.ts

---

## [024] assistant

OK — fully oriented. The handoff is live, the apparatus is operable end-to-end with stubs, and `c-momaa5o9` is genuinely the next blocker. Let me do the stress-test work the handoff asks for and bring you findings rather than just framing.

---

## Phase 1 — Stress-test, worked example: a P3 cost trial

One trial captures (orders of magnitude):

- **Stacks dump:** ~150 rows total — `clerk/writs` (~40), `clerk/links` (~60), `animator/sessions` (~12), `spider/rigs` (~10), `astrolabe/plandocs` (1–5, large bodies), `reviewer/reviews` (1–5), etc. Heterogeneous shapes.
- **Codex history:** 5–20 commits, diffs ranging from 1KB to ~200KB on big refactors. ~100–500KB total per trial.
- **Metadata:** plugin pins, framework SHA, scenario writ id, end-condition outcome, headline metrics. Tiny — sub-1KB.

### A — All in lab guild's books

| | |
|---|---|
| 1-trial capture | ~150 stacks-dump rows (one book, JSON-blob per row), plus 5–20 diff rows in another book. |
| "Show me sessions for trial X" | `SELECT body FROM books_lab_trial_stacks_dumps WHERE trialId=? AND sourceBook='animator/sessions'`. Clean SQL, but body is opaque JSON. |
| "Cross-trial cost comparison" | One query, JOIN on trialId. Strong. |
| "Browse a trial" | Can't `cd`. Have to render via `nsg lab-trial-show`. Weak. |
| Diff tooling | Diffs as TEXT lose decades of `.patch`-aware tooling (`patch`, `git apply`, viewers). Notable. |
| Sanctum reorg | Trivial. Nothing in sanctum to update. |
| Schema cost | Two book schemas, one of them (`stacks-dumps`) inherently a JSON-blob graveyard because source rows are heterogeneous. You don't actually escape schema heterogeneity — you store it as opaque JSON in a single column. |

**Net:** A's "self-describing guild" pro is real but partial — half your data is opaque JSON anyway. A's strongest pro is multi-trial query, A's weakest con is loss of filesystem/tooling.

### B — Sanctum mirror

| | |
|---|---|
| 1-trial capture | One directory with `manifest.yaml`, `README.md`, `stacks-export/<book>.json` per book, `codex-history/NNNN-<sha>.patch` per commit. |
| "Show me sessions for trial X" | `cat .../stacks-export/animator-sessions.json \| jq …`. Direct. |
| "Cross-trial cost comparison" | Glob `experiments/*/artifacts/trial-*/stacks-export/animator-sessions.json` + aggregate. Works, but clunky enough to push toward building an index. |
| "Browse a trial" | `cd experiments/X016/artifacts/trial-001-…/` → done. Strong. |
| Diff tooling | Native `.patch`. Strong. |
| Sanctum reorg | Friction. X016→X020 rename means archive paths drift; either rewrite linkage or accept that links resolve through the trial id, not the path. |
| Schema cost | None. Filesystem is the schema. |

**Net:** B matches today's analysis habits (Python scripts walking `experiments/X*/artifacts/`). Cross-trial discovery is the weak point — solvable with an index, but you've just reinvented A's metadata book without using the framework's primitive for it.

### C — Hybrid (small metadata book + filesystem)

| | |
|---|---|
| 1-trial capture | One row in `lab-trial-archives` (metadata + path + counts), plus the same filesystem layout as B. |
| "Show me sessions for trial X" | Same as B. |
| "Cross-trial cost comparison" | Query `lab-trial-archives` for the index (paths, metadata, counts), then read files. Trivially scriptable. |
| "Browse a trial" | Same as B. Strong. |
| "Show me trial X's data location" | `nsg writ show <trialId>` follows `laboratory.archived-as` → archive record → `archiveRoot`. Clean. |
| Diff tooling | Native `.patch`. Strong. |
| Sanctum reorg | One-shot migration: update path field on archive records. Bounded. |
| Schema cost | One book, simple schema (one row per trial). Substantially less than A's two heterogeneous books. |
| Atomicity | Two surfaces. Tractable with phase-tagged metadata: write `in-progress` row → write filesystem → flip to `complete`. GC sweep finds orphans. |

**Net:** C is B with the cross-trial index that B will inevitably need, expressed using the framework's native primitive (a book) rather than reinvented as a static index.

---

## Phase 2 — Recommendation: **C**

Reasoning, in priority order:

1. **B's weakness (cross-trial discovery) is C's marginal cost.** One book, ~one row per trial, simple schema. Cheaper than building a static-index tool we'd need anyway.
2. **A's stacks-dump-as-rows is a false economy.** You're storing JSON blobs in SQLite and losing `.patch` tooling. The "self-describing guild" pro is half-true at best.
3. **Filesystem matches today's analysis habits.** `experiments/X*/artifacts/scripts/*.py` walking JSON files is the established pattern. B and C both honor it; A breaks it.
4. **C composes naturally with the apparatus already shipped.** The trial writ → `laboratory.archived-as` link → archive record → archive root is the same shape as other writ-link patterns.

The "more moving parts" con of C is real but shallow — phase-tagged metadata + a startup GC sweep is a couple dozen lines, and the teardown gate just checks `status === 'complete'` instead of a directory existing.

---

## Phase 3 — Concrete spec sketch

### Book: `lab-trial-archives`

```ts
interface LabTrialArchive {
  id: string;                          // generated
  trialId: string;                     // FK to clerk/writs (indexed)
  status: 'in-progress' | 'complete' | 'failed';
  archivedAt: string;                  // ISO
  archiveRoot: string;                 // absolute path
  scenarioWritId?: string;             // writ in the test guild that the scenario posted
  codex: { baseSha: string; headSha: string; commitCount: number };
  stacks: { bookCounts: Record<string, number> };  // { 'clerk/writs': 42, ... }
  metadata: Record<string, unknown>;   // free-form (plugin pins, framework SHA)
}
```

Plus link kind `laboratory.archived-as` contributed to the Clerk; source = trial writ, target = archive record.

### Filesystem layout

Mirrors the original infra spec verbatim (with `run` → `trial`):

```
<archiveRoot>/
├── manifest.yaml                  # the trial's manifest as posted
├── README.md                      # autogenerated summary
├── stacks-export/
│   └── <plugin>-<book>.json       # JSON array per book
└── codex-history/
    ├── commits-manifest.yaml      # ordered list, sha + msg + stats
    └── NNNN-<short-sha>.patch
```

### `archiveRoot` resolution

Default resolver: `${sanctum}/experiments/${experiment}/artifacts/trial-${trialNum}-${variant}`.

This means **adding `experiment: <slug>` to `LaboratoryTrialConfig`** — a manifest-level field. (The full `experiment` writ type is deferred to v2; for now it's just a slug for path resolution.) Cheap, immediate, future-compatible.

The resolver itself is overridable via guild config (`laboratory.archiveRootResolver`) for runs that aren't in the sanctum tree.

### Probe yields contract

Probes write to a staging directory (engine context provides one) and yield:

```ts
type ProbeYields = {
  files: Array<{ path: string; sha: string; size: number }>;  // relative to staging
  summary?: Record<string, number>;                             // counts → metadata book
};
```

Archive engine consolidates: moves staged files into `archiveRoot`, accumulates `summary` into `stacks.bookCounts` / `codex.commitCount`.

### Atomicity protocol (`lab.archive`)

1. Resolve `archiveRoot`. Refuse if non-empty.
2. Insert archive record `status: 'in-progress'`.
3. `mkdir -p archiveRoot`; move staged probe files in.
4. Write `manifest.yaml`, `README.md`.
5. Update record `status: 'complete'` + final metadata.

Failure at any step leaves `status: 'in-progress'` for a GC sweep at lab-guild boot.

### Teardown gate

`lab.guild-teardown` and `lab.codex-teardown` refuse unless the trial's `laboratory.archived-as` link exists AND the linked record's `status === 'complete'`.

---

## What I want from you

A few decision points that would benefit from your gut before I write this up as the conclusion:

1. **C, A, or B?** Above is my case for C. Any of it land wrong?
2. **`experiment` slug on the manifest?** I think yes — needed for archive-root resolution and free for v2. Alternative is a flat `<sanctum>/lab-archives/trial-<slug>-<id>/` layout, which is simpler but breaks continuity with the existing `experiments/X<NNN>/` pattern.
3. **Where does the spec get written?** Handoff suggests `packages/laboratory/README.md` (preferred) over a separate `docs/laboratory/`. I'd lean README — it's the package's own home and an autonomous agent picking up implementation finds it.
4. **Anything in the stress-test that feels under-explored?** I leaned hardest on the "cross-trial discovery" axis because it's where A/B/C differentiate most. Happy to push on a different axis if you want.

---

## [025] user

I find referecnes between DB and filesystems to be problematic, esp when the filesystem is user-owned and not hidden on a server somewhere. I would like to try to find a way to make the DB authoritative, something like what shape A is. I was thinking we would store it in db, make it as queriable as possible, but provide an extract tool which could be used to materialize a trial on disk. This way we get the filesystem usability and the db encapsulation, without link brittleness. But i've only half thought it through, so please pressure test the edges here

---

## [026] assistant

Hooting in agreement — your reframe shifts the whole picture. The brittleness I was treating as "DB↔filesystem" was actually "patron-tree↔apparatus-data." Once you separate those, A becomes much stronger than I gave it credit for. Let me pressure-test it.

## Pressure points

### ✅ Storage shape — A1 (generic dump) is queryable enough; we don't need A2

Three books in the laboratory plugin:

```ts
// One row per trial, tiny.
lab-trial-archives: {
  id, trialId, status, archivedAt,
  scenarioWritId?, codex: { baseSha, headSha, commitCount },
  stacks: { bookCounts },        // { 'clerk/writs': 42, ... }
  metadata: Record<string, unknown>,
}

// One row per source-row across every test-guild book. The big one.
lab-trial-stacks-dumps: {
  trialId, sourceBook, sourceRowId,
  body: JSON,                    // the source row, verbatim
  capturedAt,
}

// One row per codex commit; body = diff.
lab-trial-codex-commits: {
  trialId, sequence, sha, message,
  filesChanged, insertions, deletions,
  diff: TEXT,                    // the patch body
}
```

I tested the alternative "mirror every test-guild book schema verbatim" (A2) and it's the wrong shape — laboratory becomes a meta-plugin that has to know every other plugin's schema, and schema drift in the source plugins becomes laboratory's problem. **A1 + SQLite JSON1 expression indexes is the right move.** You can `CREATE INDEX ON ... (json_extract(body, '$.cost'))` for hot fields, but the table itself stays generic.

Concretely, the queries we'd actually run against this:

```sql
-- "Cost across all sessions in trial X"
SELECT json_extract(body, '$.cost') FROM lab_trial_stacks_dumps
WHERE trialId=? AND sourceBook='animator/sessions';

-- "Cost vs spec-size scatter across 50 trials"
SELECT trialId, json_extract(body, '$.cost')
FROM lab_trial_stacks_dumps
WHERE sourceBook='animator/sessions' AND trialId IN (...);

-- "Writ tree of trial X"
SELECT sourceRowId, json_extract(body, '$.parentId'), body
FROM lab_trial_stacks_dumps
WHERE trialId=? AND sourceBook='clerk/writs';
```

These are *strictly more powerful than what B+filesystem would offer.* You're right.

### ✅ Atomicity gets simpler, not harder

Hybrid had the two-surface dance (filesystem + metadata, with phase-tagged GC sweeps). Pure DB collapses to: **one SQLite transaction wraps the whole archive engine**. Failure → rollback → no half-state. That's a meaningful simplification I undersold.

### ⚠️ Single-trial browse depends entirely on the extract tool being fast and ergonomic

This is where A pays its tax. I timed it mentally:

- ~150 dump rows → 10–15 `<book>.json` files. Reads + writes: sub-second.
- ~15 commit rows → 15 `.patch` files. Sub-second.
- Total: hundreds of ms.

So `nsg lab-trial-extract <trialId> --to /tmp/trial-X` is genuinely cheap. Browse story becomes:

```
$ nsg lab-trial-extract w-momen904 --to /tmp/trial-X
$ cd /tmp/trial-X && ls
manifest.yaml  README.md  stacks-export/  codex-history/
```

One extra step compared to "cd directly," but mechanical. **The friction is real but small.** Worth calling out as the conscious tradeoff.

### ✅ Programmatic analysis doesn't need extract at all

For Python analysis scripts (the dominant pattern in `experiments/X*/artifacts/scripts/`):

- DuckDB reads SQLite natively. `duckdb.sql("SELECT ... FROM ATTACH '...stacks.db'")` works.
- Or `nsg lab-trial-export-jsonl <trialId> --book animator/sessions` streams JSON.
- Or read via `nsg lab-trial-show` for summaries.

Three access patterns, each appropriate to its caller:
- **CLI extract** — patron-side browse, sharing.
- **Direct DB / JSONL stream** — analysis scripts, dashboards.
- **Link-following** — tooling that walks `writ → laboratory.archived-as → archive record`.

### ✅ Annotations move out of the trial directory — and that's actually cleaner

In B, analysis notes would have lived in `experiments/X016/.../trial-001-…/notes.md` next to captured data. In A, captured data is in the DB and analysis lives in the sanctum, referencing trial id. This separation is *better* — captured data is immutable apparatus output, analysis is a sanctum activity. They were never the same thing.

### ⚠️ Big diffs need a tripwire, not a solution-now

Codex diffs at the 99th percentile (full-package refactor) could push 500KB. SQLite TEXT handles up to ~1GB per row, but query performance on large rows degrades and `.dump`-style backups slow.

**Proposal: soft cap of 5MB per diff at archive time, hard fail with a clear message if exceeded.** That's a tripwire, not a silent truncation. We deal with blob-extraction policies *if and when* it bites. Most P3-style trials are nowhere near.

### ✅ Trial linkage stays clean

`laboratory.archived-as` link kind, source = trial writ, target = `lab-trial-archives` row id. Same as I proposed for C, but now it's a pure-DB reference (id → id) with no path field to rot.

### ✅ Sanctum stays clean

The sanctum's `experiments/X<NNN>-<slug>/` tree no longer auto-fills with multi-MB lab dumps. Manifests, analysis scripts, findings — those stay sanctum-side. Captured data lives in the lab guild. **This is the real win of your reframe.** Sanctum reorganizations (X-num renames, experiment migration) don't drag captured data behind them.

### ✅ Lab-guild durability concentrates the backup problem

Instead of "back up many directories under `experiments/`," it's "back up `<lab-guild-root>/.guild/stacks/`" — one cohesive unit. Easier, not harder.

## Where A still has scars

1. **Browse-without-extract is gone.** You can't `cd experiments/X016/.../trial-001-…/`. You extract first. Tax: one CLI invocation. Cost: real but bounded.
2. **Diff tooling needs a path through extract for `.patch`/`git apply` workflows.** If you want to apply a captured diff to inspect it, you extract first. Same tax.
3. **JSON1 expression indexes need to be added per query-pattern over time.** Acceptable — start with none, add as we identify hot queries. This is normal SQLite work.

None of these are dealbreakers. The browse-via-extract story is genuinely fine if extract is fast (it will be).

## My recommendation: ship A1

Concrete shape:

- **Three books**: `lab-trial-archives` (metadata, 1 row/trial), `lab-trial-stacks-dumps` (generic dump), `lab-trial-codex-commits` (diffs).
- **Link kind**: `laboratory.archived-as`, trial writ → archive record.
- **CLI surface**:
  - `nsg lab-trial-show <trialId>` — metadata + counts.
  - `nsg lab-trial-extract <trialId> --to <path> [--force]` — materialize to filesystem.
  - `nsg lab-trial-export-jsonl <trialId> --book <name>` — stream JSON for analysis.
- **Probe contract**: probes yield in-memory data structures (rows, commits) — *not* file paths. Archive engine inserts directly into the books.
- **Atomicity**: archive engine = single transaction. Failure → rollback.
- **Teardown gate**: `lab.guild-teardown` / `lab.codex-teardown` refuse unless `laboratory.archived-as` link exists AND linked record `status === 'complete'`.
- **Big-diff tripwire**: 5MB per diff, archive fails loud if exceeded.

## Edge calls I'd like your gut on

1. **Per-row indexed columns vs pure JSON1?** I lean pure-JSON1 — start generic, add expression indexes as we find hot queries. Alternative is to extract a few universal fields (`parentId`, `status`, `createdAt`) into typed columns at capture time. Cheaper queries, tighter schema; but if those fields don't exist on every source book, you've got NULL columns and per-book special-cases.

2. **Big-diff cap value?** 5MB feels right for a tripwire — well above realistic but well below SQLite-pain. Could also go 10MB or per-trial total cap. Want to set this conservative or generous?

3. **Annotations book or sanctum-side notes?** If you ever want to attach "what I learned from trial X" alongside the captured data, the options are (a) `lab-trial-annotations` book in the lab guild, (b) sanctum markdown that references `<trialId>`. I lean (b) — analysis is sanctum work — but if you'd rather have one cohesive trial story, (a) is right.

4. **Probe yields contract — full data in-memory, or stream?** Probes for stacks-dump could realistically yield 150 rows × ~5KB = ~750KB in memory. Fine. Codex-history probe yields N diffs, biggest could be ~5MB total. Also fine. **In-memory yields are simpler than streaming and the data sizes don't justify streaming yet.** Confirm or push back?

The pressure-test held — your instinct is right. Once we agree on those four edge calls I can conclude `c-momaa5o9` and write the spec section into `packages/laboratory/README.md`.

---

## [027] user

i'm a bit unclear on the exact content of the 3 books and what the link is for (can writs link to arbitrary other things?!). please expound on these items. also, for tools remember the cli export is going to extract common prefixes. i think we should just use `lab` as the common prefix (tools `lab-trial-show`, `lab-trial-extract`, etc.), so we would have `nsg lab trial-show`, `nsg lab trial-extract`, and `nsg lab trial-export-book` (note last one renames export-jsonl). to your edges: (1) yes, pure json1; (2) let's go 10mb to start; (3) not sure... what is in lab-trial-archives and what isnt annotations additional metadata? i dont want a new book, so if theres no place in existing structures than definitley lean (b) here; (4) in memory for now

---

## [028] assistant

You caught a real flaw — let me actually look at clerk's link model before I keep waving the link concept around.

---

## [029] assistant

[tool: Bash] Find clerk link source files

---

## [030] assistant

[tool: Bash] Find clerk link types

---

## [031] assistant

[tool: Bash] Find clerk-apparatus package

---

## [032] assistant

[tool: Bash] Check clerk link target types

---

## [033] assistant

[tool: Read] /workspace/nexus/packages/plugins/clerk/src/link-normalize.ts

---

## [034] assistant

[tool: Bash] Find WritLink type definitions

---

## [035] assistant

[tool: Bash] Show WritLink type definition

---

## [036] assistant

You were right to be skeptical. `WritLinkDoc` has `sourceId` and `targetId` both pointing at writs — clerk links are writ-to-writ only. My "`laboratory.archived-as`" link kind would have required archive records to *be* writs, which feels wrong (archives are captured data, not work-tracking obligations).

**Drop the link entirely.** The relationship is just `lab-trial-archives.trialId` as a foreign key into `clerk/writs`. Lookup via FK; no clerk machinery involved. Cleaner. Thanks for poking.

Now let me make the books concrete with example rows.

---

## Book 1: `lab-trial-archives` — one row per archived trial

The metadata index. **Tiny row, one per trial. Captured-once at archive time.**

```jsonc
{
  "id": "lta-mone8q4r-...",                  // generated
  "trialId": "w-momen904",                   // FK → clerk/writs (indexed)
  "status": "complete",                       // 'in-progress' | 'complete' | 'failed'
  "archivedAt": "2026-05-01T17:42:11.000Z",

  "scenarioWritId": "w-momen91k",             // the writ posted in the test guild
                                              // by lab.commission-post-xguild
                                              // (id is in the test-guild's namespace)

  "codex": {
    "baseSha": "a1b2c3d4...",                 // 40-char
    "headSha": "e5f6g7h8...",
    "commitCount": 8
  },

  "stacks": {
    "bookCounts": {                           // populated from probe summary
      "clerk/writs": 42,
      "clerk/links": 61,
      "animator/sessions": 12,
      "spider/rigs": 8,
      "astrolabe/plandocs": 3,
      "reviewer/reviews": 2
    }
  },

  "metadata": {                               // free-form apparatus-captured data
    "frameworkSha": "9z8y7x...",
    "pluginPins": {
      "@shardworks/clerk-apparatus": "0.1.292",
      "@shardworks/animator-apparatus": "0.2.14"
    },
    "endCondition": "writ-terminal",          // how the scenario ended
    "trialDurationMs": 87432
  }
}
```

**What's in `metadata` and what isn't:** apparatus-captured facts about the trial run — the SHA the codex was at, what plugins were pinned, how the scenario ended, headline timings. These are **immutable, written once at archive time, by the archive engine.**

**What ISN'T in `metadata`:** anything a human (or analysis agent) writes later. "I think this trial's failure mode looks like X013 regression" is annotation, not metadata. Annotations break the immutability of archive rows and blur the line between "what happened" and "what we made of it." → those go in sanctum markdown referencing `trialId`.

## Book 2: `lab-trial-stacks-dumps` — the generic dump

**One row per source-row from every test-guild book.** Heterogeneous bodies; querying is via SQLite JSON1.

```jsonc
// One row from clerk/writs
{
  "id": "ltsd-mone8q5a-...",                  // generated
  "trialId": "w-momen904",                    // FK (indexed)
  "sourceBook": "clerk/writs",                // (trialId, sourceBook) indexed
  "sourceRowId": "w-momen91k",                // id from the source book
  "capturedAt": "2026-05-01T17:42:11.000Z",
  "body": {                                    // the source row, verbatim JSON
    "id": "w-momen91k",
    "type": "mandate",
    "state": "completed",
    "parentId": null,
    "body": "Implement the X feature ...",
    // ... whatever clerk/writs has
  }
}

// One row from animator/sessions — totally different shape
{
  "id": "ltsd-mone8q5b-...",
  "trialId": "w-momen904",
  "sourceBook": "animator/sessions",
  "sourceRowId": "s-mone7r3x",
  "capturedAt": "2026-05-01T17:42:11.000Z",
  "body": {
    "id": "s-mone7r3x",
    "engineId": "implement",
    "model": "claude-sonnet-4-5",
    "cost": 0.43,
    "tokensIn": 12450,
    "tokensOut": 3200,
    // ...
  }
}
```

**Why generic over per-book mirroring:** the alternative would be one mirror book per source-book schema (`lab-archive-clerk-writs`, `lab-archive-animator-sessions`, etc.). That makes laboratory know about every other plugin's schema and turns source-plugin schema drift into laboratory's problem. Generic body + JSON1 expression indexes is the right tradeoff.

**Querying it (illustrative):**

```sql
-- All sessions in trial X with their costs
SELECT json_extract(body, '$.id'), json_extract(body, '$.cost')
FROM books_laboratory_lab_trial_stacks_dumps
WHERE trialId='w-momen904' AND sourceBook='animator/sessions';

-- Indexes added as we identify hot patterns:
CREATE INDEX idx_dumps_session_cost
  ON books_laboratory_lab_trial_stacks_dumps (trialId, json_extract(body, '$.cost'))
  WHERE sourceBook='animator/sessions';
```

## Book 3: `lab-trial-codex-commits` — captured codex history

**One row per captured commit. Body is the diff.** Separate from the dump because diffs are big-ish blobs and we want diff-aware metadata at the column level.

```jsonc
{
  "id": "ltcc-mone8q6a-...",                  // generated
  "trialId": "w-momen904",                    // FK (indexed)
  "sequence": 1,                              // ordinal within the trial (indexed)
  "sha": "e5f6g7h8a1b2c3d4...",               // 40-char
  "message": "implement X feature: extract scorer interface",
  "filesChanged": 4,
  "insertions": 127,
  "deletions": 23,
  "diff": "diff --git a/packages/...\n@@ -1,8 +1,12 @@\n..."  // patch text
}
```

**Big-diff tripwire:** archive engine fails loud if any single diff exceeds 10MB. Realistic diffs are <500KB; the cap is a "we'll figure out blob storage if it ever bites" tripwire, not a constraint we expect to hit.

---

## Linkage: just the FK

No `laboratory.archived-as` link kind. The trial → archive relationship is:

- `lab-trial-archives.trialId` references `clerk/writs.id`.
- `nsg writ show <trialId>` shows the trial writ (config in `ext.laboratory.config`, no archive info — clean).
- `nsg lab trial-show <trialId>` queries `lab-trial-archives WHERE trialId=?` and surfaces archive metadata.

The trial id is the join key. Same way joins work in any relational system. Sean's "can writs link to arbitrary other things?!" was correctly skeptical — they can't, and we don't need them to.

---

## CLI surface (with your prefix-collapse convention)

Tools defined as `lab-trial-show`, `lab-trial-extract`, `lab-trial-export-book`. CLI surfaces:

- **`nsg lab trial-show <trialId>`** — print archive metadata + counts.
- **`nsg lab trial-extract <trialId> --to <path> [--force]`** — materialize all captured data to a directory:
  ```
  <path>/
  ├── manifest.yaml             # the trial's posted manifest
  ├── README.md                 # auto-generated summary
  ├── stacks-export/
  │   └── <plugin>-<book>.json  # JSON array per source book
  └── codex-history/
      ├── commits-manifest.yaml # ordered: sha, message, stats
      └── NNNN-<short-sha>.patch
  ```
- **`nsg lab trial-export-book <trialId> --book <name> [--format jsonl|json]`** — stream one source book for analysis pipelines. Default `jsonl` (one row per line, stream-friendly).

---

## Status

Settled (your calls): pure JSON1; 10MB diff cap; in-memory probe yields; annotations live in sanctum markdown referencing `trialId`.

Settled (this round): no clerk link, FK-only; CLI under `nsg lab <subcommand>`; `lab-trial-export-book` (renamed from export-jsonl).

I think we have enough to conclude `c-momaa5o9` and write the spec section. Anything else you want pinned down before I do?

---

## [037] user

`scenarioWritId` is valid for our current type of scnearios, but maybe not all... i'm not sure it belongs in the abstract archive metadata schema. should `codex` have the remote URL of the original codex repo, so we can find the root of where the diffs apply? or is that looked up from the trial writ? are the `metadata` keys the ids of probes? or just a shared namespace that anything writes to? how does data get into there? One issue i see with this design is that the 'books archive' and 'git diff archive' are ... very specific. But are those archives not supposed to be produced by generic 'probes'?

---

## [038] assistant

*Hoots loudly* — those are all the right pokes and the design is genuinely better for it. Walking through:

## 1. `scenarioWritId` — drop it

You're right. That field assumes scenarios always produce a writ in the test guild, which only holds for the `commission-post-xguild` scenario shape. A future scenario that posts N commissions, exercises a synthetic event stream, or runs an engine directly has no single "scenario writ." Hardcoding the field couples archive-schema to scenario-shape.

If a specific scenario wants to record what it produced, that's the scenario engine's yield output — accessible via the rig's yield data, not duplicated in archive metadata.

## 2. Codex remote URL — looked up from the trial writ

Right reframing: the archive shouldn't duplicate manifest data. The manifest (carried on `ext.laboratory.config`) has `codex.upstream_org`, `codex.upstream_repo`, `codex.baseSha`. Anything an analysis tool needs to interpret diffs (where to clone the upstream, what the baseline was) is on the trial writ.

What the *apparatus learned at runtime* — `headSha` after the scenario ran, `commitCount`, total diff size — that's the only codex data the archive should carry. And per the next point, that's actually probe-yielded, not archive-core.

## 3. The `metadata` flat-bag was a smell — and your fourth question reveals why

You caught the bigger problem with question 4, so let me address them together.

## 4. Books-archive and git-diff-archive ARE too specific

Yes — and this is the critical reframe. The MVP builds two specific archives because we have two specific probes shipped (`lab.probe-stacks-dump`, `lab.probe-git-range`). But those books shouldn't be archive-core infrastructure. **They're contributions of those two probes.** A future `network-trace-probe` or `transcript-capture-probe` would contribute its own book(s).

This is the right separation:

- **Archive engine** owns one book (`lab-trial-archives`) and one job: write the index row, invoke probes, record what each probe yielded as a summary. **It has no schema opinions about probe data.**
- **Probes** own their own data books and the schemas appropriate to their data. `lab.probe-stacks-dump` owns `lab-trial-stacks-dumps`. `lab.probe-git-range` owns `lab-trial-codex-commits`. They're pluggable; archive engine doesn't enumerate them.

Probe yields, restated:

```ts
type ProbeYields = {
  summary: Record<string, unknown>;   // lands in lab-trial-archives.probes[].summary
  // Probe writes its own data to its own books as a side effect of run().
  // No file paths, no row collections in the yield itself.
};
```

The extract tool dispatches on probe `engineId` to know how to materialize each probe's data. MVP hardcodes the two built-in probes; v2 lets probes contribute extraction logic.

## The new shape of `lab-trial-archives`

Stripped of denormalized data and scenario-specific fields, with probe outputs structured properly:

```jsonc
{
  "id": "lta-mone8q4r-...",
  "trialId": "w-momen904",                    // FK → clerk/writs
  "status": "complete",                       // 'in-progress' | 'complete' | 'failed'
  "archivedAt": "2026-05-01T17:42:11.000Z",

  "probes": [                                 // assembled from probe yields
    {
      "id": "stacks",                          // probe id from trial config
      "engineId": "lab.probe-stacks-dump",
      "summary": {                             // opaque to archive engine
        "bookCounts": {
          "clerk/writs": 42,
          "animator/sessions": 12,
          "...": "..."
        }
      }
    },
    {
      "id": "codex",
      "engineId": "lab.probe-git-range",
      "summary": {
        "headSha": "e5f6g7h8...",              // captured at scenario end
        "commitCount": 8,
        "totalDiffBytes": 84231
      }
    }
  ]
}
```

That's it. The archive engine writes only what it actually owns: the index row tying together "this trial → these probes ran → here's what they reported." Everything else is probe-contributed.

**`metadata` namespace question, resolved:** there is no `metadata` bag. Each probe's `summary` is its own namespace, keyed by probe id + engine id in the `probes[]` array. No shared shared bag, no collision risk, no question of "who writes here."

**Trial-level facts (`durationMs`, `endCondition`, resolved pins):** all derivable from elsewhere (the trial writ's timestamps, the rig's yield data, the manifest). If we later decide a fact is universally useful enough to capture explicitly, it becomes a probe (`lab.probe-trial-summary` or similar) — same pattern. **Archive engine stays minimal.**

## Updated probe-contributed book shapes

These are no longer archive-core, just shown for completeness — they're owned by the two built-in probes:

**`lab-trial-stacks-dumps`** (owned by `lab.probe-stacks-dump`): unchanged from previous proposal.

**`lab-trial-codex-commits`** (owned by `lab.probe-git-range`): unchanged from previous proposal.

The 10MB diff cap, JSON1-only indexing, FK to `clerk/writs.id` via `trialId` — all still apply. They're just framed as probe contracts now, not archive infrastructure.

## What's settled

- Pure JSON1 indexing.
- 10MB per-diff cap.
- In-memory probe yields.
- Annotations live in sanctum markdown (FK-keyed by `trialId`).
- No clerk link — FK only.
- CLI surface: `nsg lab trial-show`, `nsg lab trial-extract`, `nsg lab trial-export-book`.
- **Archive engine is minimal:** owns `lab-trial-archives`, records probe summaries, nothing more.
- **Books are probe-contributed**, not archive-core. MVP ships two built-in probes contributing two books.
- **Scenario-specific data lives in scenario-engine yields**, not archive metadata.
- **Trial-writ data isn't duplicated in archive** — manifest fields are looked up from `ext.laboratory.config`.

## Anything else to check?

The only thing I want to double-check before concluding is the extract-tool dispatch story. MVP hardcodes "if engineId is `lab.probe-stacks-dump`, materialize like this; if `lab.probe-git-range`, like this." That's fine for MVP, but it means **adding a third probe in the future requires extract-tool code changes** until we land probe-contributed extraction logic. Acceptable v1 limitation, but worth noting in the spec so the v2 work is obvious.

Sound right? If yes, I'll conclude `c-momaa5o9` and write the spec section into `packages/laboratory/README.md`.

---

## [039] user

so sthe same plugin still contributes those books, because it owns the probes? or should we move the probes to their own plugins so that we dont creaet books unless someone actually installs them? what would probe-contributed extraction logic look like? could we add that as a new implementation click? finally, should we capture the rig template or other structural information about what the trial was in the trial metadata?

---

## [040] assistant

Three real questions; let me take them in order.

## 1. Plugin packaging — separate plugins or bundled?

Arguments for separating into per-probe plugins:
- Books only land in your guild if you install the probe. Clean: laboratory's own data model is just "trial archives," not "trial archives plus stacks dumps plus codex history."
- Probe substitutability — alternative implementations are first-class.
- Built-ins follow the same plugin contract as future third-party probes — no special path.
- Architecturally honest: if probes are plugin-contributed, the standard probes are plugins.

Arguments for bundling in laboratory:
- One install gets the standard battery.
- MVP shipping speed (no extra package scaffolding).
- The two MVP probes are practically required for the apparatus to be useful.

**My recommendation: bundle for MVP, with the seams designed for clean extraction.**

Concretely, even though all three book schemas live in the laboratory package for MVP, the code should treat them as if they came from separate plugins:

- Each probe's book schema lives next to the probe code (e.g., `src/probes/stacks-dump/{engine.ts, book.ts, extractor.ts}`), not in a central `archive` module.
- The plugin's book registrations come from a probe registry the plugin builds, not from a hardcoded list.
- The extract tool dispatches on `engineId` via that registry.

When v2 wants third-party probes, the move is mechanical: lift `src/probes/stacks-dump/*` into a new `@shardworks/lab-probe-stacks-dump` package, update laboratory's plugin manifest to depend on it, no architectural surgery. **The seam is what matters; the package boundary can move later.**

The "books only created when installed" property is correct as the end state but doesn't earn the MVP cost. Ship the seams clean now, extract when extraction is forced (i.e., when we have a real third-party probe).

## 2. Probe-contributed extraction logic

Sketch of the contract:

```ts
interface ProbeEngineDesign extends EngineDesign {
  // Existing: how to capture data (writes to probe-owned books).
  run(givens, context): Promise<EngineRunResult>;
  
  // New: how to materialize this probe's captured data to disk.
  extract(args: {
    trialId: string;
    targetDir: string;          // probe writes its outputs here (subdir)
    guild: GuildHandle;          // for reading the probe's books
  }): Promise<{
    files: Array<{ path: string; bytes: number }>;
  }>;
}
```

`nsg lab trial-extract <trialId> --to <dir>` becomes:

1. Load `lab-trial-archives WHERE trialId=?`.
2. For each `probes[]` entry, resolve `engineId` to its engine, call `extract({ targetDir: <dir>/<probe-id>/ })`.
3. Generate `manifest.yaml` (from trial writ's `ext.laboratory.config`) and `README.md` (from archive metadata + probe summaries) at the top level.

Each probe's `extract()` decides its own subdir layout. `lab.probe-stacks-dump` produces `stacks-export/<plugin>-<book>.json`. `lab.probe-git-range` produces `codex-history/{commits-manifest.yaml,NNNN-<sha>.patch}`. A future `network-trace` probe produces whatever shape is appropriate for its data.

**Yes, file as a new implementation click.** I'll open it as parked under `c-moma9llq` so it sits in the tree as a known v2 task without competing for current attention. The click's gist:

> v2: Define the probe-contributed extraction contract. Probe engines gain an `extract()` method; `nsg lab trial-extract` dispatches by engineId via the probe registry rather than hardcoded built-in handling. Unblocks third-party probes.

For MVP, the extract tool hardcodes the two built-in probes. The hardcoded version still calls into per-probe modules (so when we lift the contract, the change is "extract the dispatch table into an interface," not "rewrite the extractor").

## 3. Capturing rig template / structural information

**Yes, capture it.** What's worth capturing:

- **Rig id** — for `nsg rig show` chase-down.
- **Rig template name** — what was instantiated (`post-and-collect-default` today).
- **Framework SHA** — what version of nexus was running.
- **Resolved plugin pins** — what was *actually* loaded at runtime, distinct from what the manifest specified (manifest can say `^1.0`, runtime resolves to `1.4.2`).
- **Manifest snapshot** — the trial config at the moment of posting, frozen against later writ edits.

**Where it lives — and this is where the design earns another check.** I see two options:

### Option X: A `lab.probe-trial-context` probe

Sits in the default rig template. Captures all the above, yields a summary that lands in `archive.probes[]` like any other probe. The probe writes no bulk data — its summary IS its output (small, ~5KB). Beautiful symmetry: every probe is `{id, engineId, summary}` in the archive index; "small" probes have summary-as-data; "bulky" probes have summary-as-counts plus their own books.

- ✅ Architecturally consistent. Archive engine stays at "minimal index of what probes ran."
- ✅ Probes can vary across trial types — a deployment with non-Spider rigs might want a different context probe.
- ⚠️ Opt-in via the manifest. Forget to include the probe → context not captured. Mitigate by including it in the default trial-template scaffolding.

### Option Y: Archive engine captures a `context` field directly

Archive engine does the work; field appears as `lab-trial-archives.context` outside the `probes[]` array.

- ✅ Always captured, no manifest configuration.
- ✅ Conceptually "archive's own context" is genuinely different from "test-guild observation."
- ⚠️ Breaks the "archive engine has no schema opinions" purity. Becomes "archive engine has *one* schema opinion, about itself."

**My recommendation: X, with the probe added to the default rig template.** The architectural consistency wins. The opt-in concern is solved by template defaults — anyone using the standard template gets it for free; anyone authoring a custom template makes a deliberate choice. And it preserves the path where multiple deployments use different context probes.

## Summary of new clicks to open

1. **v2: Probe-contributed extraction contract** — parked under `c-moma9llq`. Unblocks third-party probes.
2. **(Maybe) v2: Extract built-in probes into separate plugins** — also parked. The packaging seam is designed in MVP; this click tracks the eventual extraction.

If Option X for context capture lands, no click needed — it's just an extra probe in the MVP probe set, captured as part of the existing `c-momaa3w7` (probe engines) implementation work. If Option Y, then archive engine grows; covered under `c-momaa5o9`.

## So before I conclude `c-momaa5o9`

A trio of decisions to lock in:

1. **Plugin packaging:** bundled-with-clean-seams for MVP? (My recommendation: yes.)
2. **Trial-context capture:** probe (X) or archive-direct (Y)? (My recommendation: X.)
3. **File the v2 click(s)?** (My recommendation: yes — extraction-contract for sure; packaging-extraction optional.)

If yes/yes/yes, I'll open the v2 click(s), conclude `c-momaa5o9` with the full design summary, and write it up as a section in `packages/laboratory/README.md`.

---

## [041] user

Convinced, keep them in the same plugin for now. (2) don't love hardcoding the probe types, seems like the type of thing we will forget the intent by the time need to add the lookup. i would say add a click to the implementation set, but current the dynamic lookup to be mvp required. (3) sure, let's go with option X. If that's good, go ahead and conclude with the design summary and do the section writeup

---

## [042] assistant

On it. Let me check the README, the clicks skill for command shape, then execute the closeout.

---

## [043] assistant

[tool: Bash] List laboratory dir and show clicks skill

---

## [044] assistant

[tool: Bash] Show click subcommands

---

## [045] assistant

[tool: Bash] Show conclude and create command options

---

## [046] assistant

[tool: Read] /workspace/nexus-mk2/packages/laboratory/README.md

---

## [047] assistant

[tool: Bash] Scan vocabulary tome for related terms

---

## [048] assistant

Vocabulary tome has nothing relevant to probe-registry mechanics — no cross-link needed. Proceeding with the closeout.

---

## [049] assistant

[tool: Bash] Open new MVP click for probe registry + extract dispatch

---

## [050] assistant

[tool: Bash] Conclude archive design click

---

## [051] assistant

Concluded. Now writing the README section.

---

## [052] assistant

[tool: Write] /workspace/nexus-mk2/packages/laboratory/README.md

---

## [053] assistant

Now the coco-log entry, scratch file cleanup, and commit.

---

## [054] assistant

[tool: Read] /workspace/nexus-mk2/experiments/data/coco-log.yaml

---

## [055] assistant

[tool: Bash] Show tail of coco-log to see format

---

## [056] assistant

[tool: Bash] Check current git status

---

## [057] assistant

[tool: Edit] /workspace/nexus-mk2/experiments/data/coco-log.yaml

---

## [058] assistant

[tool: Bash] Delete the handoff scratch file now that spec is published

---

## [059] assistant

[tool: Bash] Stage README and coco-log changes

---

## [060] assistant

[tool: Bash] Commit archive design with Coco identity and Session trailer

---

## [061] assistant

[tool: Bash] Verify commit succeeded

---

## [062] assistant

Done. Archive design landed.

**What shipped:**
- `c-momaa5o9` concluded with the design summary.
- New MVP click `c-momkil4p` opened — probe registry + extraction-dispatch contract, MVP-required, sibling under `c-moma9llq`.
- Full spec written into `packages/laboratory/README.md` as the canonical home (~190 new lines covering archive design, books, probes, linkage, atomicity, registry, CLI, packaging).
- Coco-log entry + commit under Coco's identity with session trailer.
- Scratch handoff deleted now that the spec is in its permanent home.
- Companion handoff `handoff-laboratory-implementation.md` retained — its archive step is now unblocked, ready to pick up next session.

The implementation tree under `c-moma9llq` now reads:
- ● `c-moma9y1k` codex fixtures (live)
- ● `c-momaa03d` guild fixtures (live)
- ● `c-momaa1vt` scenario engines (live)
- ● `c-momaa3w7` standard probes (live — now includes `lab.probe-trial-context`)
- ○ `c-momaa5o9` archive design (concluded)
- ● `c-momkil4p` probe registry + extract dispatch (live, new)
- ● `c-momaa75l` smoke test (live)
- ● `c-momaa8mk` retire infra spec (live)
- ● `c-momaaa3t` documentation (live)
- ● `c-momaab8y` port first real-world trial (live)

Whenever you pick up the implementation handoff, the archive engine + `lab.probe-trial-context` + the registry/extract-tool work all have shapes to build to.

---

## [063] user

<local-command-caveat>Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages or otherwise consider them in your response unless the user explicitly asks you to.</local-command-caveat>

---

## [064] user

<command-name>/context</command-name>
            <command-message>context</command-message>
            <command-args></command-args>

---

## [065] user

<local-command-stdout> [1mContext Usage[22m
[38;2;136;136;136m⛁ ⛁ [38;2;153;153;153m⛁ [38;2;177;185;249m⛀ [38;2;215;119;87m⛀ [38;2;147;51;234m⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ [39m  Opus 4.7
[38;2;147;51;234m⛁ ⛁ ⛁ ⛁ ⛁ ⛁ [38;2;153;153;153m⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ [39m  [38;2;153;153;153mclaude-opus-4-7[39m
[38;2;153;153;153m⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ [39m  [38;2;153;153;153m118.6k/1m tokens (12%)[39m
[38;2;153;153;153m⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ [39m
[38;2;153;153;153m⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ [39m  [38;2;153;153;153m[3mEstimated usage by category[23m[39m
[38;2;153;153;153m⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ [39m  [38;2;136;136;136m⛁[39m System prompt: [38;2;153;153;153m8.6k tokens (0.9%)[39m
[38;2;153;153;153m⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ [39m  [38;2;153;153;153m⛁[39m System tools: [38;2;153;153;153m6.7k tokens (0.7%)[39m
[38;2;153;153;153m⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ [39m  [38;2;177;185;249m⛁[39m Custom agents: [38;2;153;153;153m135 tokens (0.0%)[39m
[38;2;153;153;153m⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ [39m  [38;2;215;119;87m⛁[39m Memory files: [38;2;153;153;153m2k tokens (0.2%)[39m
[38;2;153;153;153m⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ [39m  [38;2;147;51;234m⛁[39m Messages: [38;2;153;153;153m104.4k tokens (10.4%)[39m
                                          [38;2;153;153;153m⛶[39m Free space: [38;2;153;153;153m878.2k (87.8%)[39m

[1mCustom agents[22m[38;2;153;153;153m · /agents[39m

[38;2;153;153;153mProject[39m
[38;2;153;153;153m├[39m ethnographer: [38;2;153;153;153m55 tokens[39m
[38;2;153;153;153m├[39m coco: [38;2;153;153;153m41 tokens[39m
[38;2;153;153;153m└[39m doc-auditor: [38;2;153;153;153m39 tokens[39m

[1mMemory files[22m[38;2;153;153;153m · /memory[39m
[38;2;153;153;153m└[39m .claude/CLAUDE.md: [38;2;153;153;153m2k tokens[39m</local-command-stdout>

---

## [066] user

did we do everything needed ot unblock the rest of the implementation?

---

## [067] assistant

Good question — let me check the implementation handoff for what it expected from this design and walk the remaining implementation tree to confirm.

---

## [068] assistant

[tool: Read] /workspace/nexus-mk2/.scratch/handoff-laboratory-implementation.md

---

## [069] assistant

[tool: Bash] Extract implementation tree state

---

## [070] assistant

Almost — there are two click-hygiene gaps and one schema simplification I should fix before the implementer picks this up. Then the summary.

---

## [071] assistant

[tool: Bash] Show amend command options

---

## [072] assistant

[tool: Read] /workspace/nexus-mk2/packages/laboratory/README.md

---

## [073] assistant

[tool: Edit] /workspace/nexus-mk2/packages/laboratory/README.md

---

## [074] assistant

[tool: Edit] /workspace/nexus-mk2/packages/laboratory/README.md

---

## [075] assistant

[tool: Bash] Amend probe-engines click with new design scope

---

## [076] assistant

[tool: Bash] Open archive-engine implementation click

---

## [077] assistant

[tool: Edit] /workspace/nexus-mk2/experiments/data/coco-log.yaml

---

## [078] assistant

[tool: Bash] Commit README atomicity fix

---

## [079] assistant

Done. Implementation is now genuinely unblocked. Here's the handoff summary:

---

# Laboratory archive design — implementer handoff

**Decision:** DB-authoritative archive with on-demand filesystem materialization. **Full spec:** `packages/laboratory/README.md` → "Archive design" section.

## Architectural shape in one paragraph

Trial data lives in the lab guild's stacks DB. Three books: `lab-trial-archives` (one row per archived trial — the index), `lab-trial-stacks-dumps` (generic JSON-bodied row per source-row across test-guild books), `lab-trial-codex-commits` (one row per commit, diff body, 10MB cap). Archive engine owns only the index book and has no schema opinions about probe data; probes own their own books. Trial-writ linkage is FK only (`lab-trial-archives.trialId` → `clerk/writs.id`). Filesystem materialization happens on demand via `nsg lab trial-extract`, which dispatches per-probe extractors via a probe registry.

## What's left to implement (under `c-moma9llq`)

| Click | Scope |
|---|---|
| `c-momkil4p` | **Probe registry + extract dispatch** (MVP-required). Probe engines self-declare an `extract(trialId, targetDir, guild)` handler; `nsg lab trial-extract` looks them up by `engineId`. |
| `c-momaa3w7` | **Three standard probes**: `lab.probe-stacks-dump` (test-guild books → generic rows), `lab.probe-git-range` (codex commits → diff rows), `lab.probe-trial-context` (rig+template+framework+pins+manifest snapshot, summary-only). Each probe under `src/probes/<name>/{engine,book,extractor}.ts`. |
| `c-momkqtn5` | **Archive engine** (`lab.archive`). Reads probe yields from `context.upstream`, writes one row to `lab-trial-archives`. Atomic per-row. Updates teardown gate from "context.upstream.archive defined" to "archive row exists." |
| `c-momaa75l` | **Codified smoke test.** End-to-end pipeline test. |
| `c-momaaa3t` | **Documentation** (architecture doc, end-user guide). |
| `c-momaab8y` | **First real-world trial port** — probably X016. |

## Build order suggestion

1. **Probe registry shape** (small, MVP-required, gates extract tool).
2. **Probes in parallel** — each registers with the registry on plugin start. Stacks-dump and git-range have stub equivalents to replace; trial-context is greenfield.
3. **Archive engine** — consumes probe upstream yields; replaces the stub.
4. **Extract / show / export-book CLI tools** — implementable any time the registry exists; can develop alongside probes.
5. **Smoke test** — codify after the chain works end-to-end.

## Key contracts (full details in README)

- **Atomicity:** per-engine. No cross-engine transactions. Archive row is atomic; probe rows are atomic per-probe. Orphans tolerated (all queries join from `lab-trial-archives`).
- **Indexing:** pure JSON1 expression indexes. Add per hot query, don't extract columns at write time.
- **Big-diff tripwire:** `lab.probe-git-range` fails loud on any single diff > 10MB.
- **Linkage:** FK only — clerk links are writ-to-writ and archive records aren't writs.
- **Annotations:** live in sanctum markdown referencing `trialId`, never in laboratory books.
- **Packaging:** all built-in probes bundle in `@shardworks/laboratory` for MVP; per-probe directory layout keeps the v2 plugin-extraction lift mechanical.

## Companion docs

- `.scratch/handoff-laboratory-implementation.md` — the full implementation handoff with engine patterns and live-test environment notes.
- `c-momaa5o9` (concluded) — design-decision context if you want the reasoning trail.

---

## [080] user

ok, update the handoff prompt (`/workspace/nexus-mk2/.scratch/handoff-laboratory-implementation.md`) with the above, and amend any preexisting inconsistencies as needed

---

## [081] assistant

[tool: Write] /workspace/nexus-mk2/.scratch/handoff-laboratory-implementation.md

---

## [082] assistant

[tool: Read] /workspace/nexus-mk2/.scratch/handoff-laboratory-implementation.md

---

## [083] assistant

[tool: Read] /workspace/nexus-mk2/.scratch/handoff-laboratory-implementation.md

---

## [084] assistant

[tool: Write] /workspace/nexus-mk2/.scratch/handoff-laboratory-implementation.md

---

## [085] assistant

[tool: Bash] Check git status

---

## [086] assistant

Handoff updated. Key changes from the version you'd touched:

**Build order corrected** — was "archive first, then probes against it"; now "registry first, then probes in parallel, then archive." The archive engine reads probe summaries from `context.upstream`, so probes need to exist (or at least their yield contracts need to be settled) before archive is implementable. Registry shapes the probe interface, so it gates everything.

**Three probes, not two** — added `lab.probe-trial-context` to step 2 with its scope (rig+template+framework SHA+pins+manifest snapshot, summary-only).

**New step 1** — probe registry + extract dispatch (`c-momkil4p`).

**Archive engine click corrected** — was `c-momaa5o9 impl`; now points at the actual implementation click `c-momkqtn5` (the design click is concluded).

**Step 4 added** — CLI tools (`lab-trial-show`, `lab-trial-extract`, `lab-trial-export-book`) and the auto-grouping note.

**Atomicity discipline added** — explicit "per-engine, not per-trial" bullet under Implementation discipline. The earlier doc didn't mention it; without that note, an implementer might try to wrap probes-and-archive in a transaction, which the rig structure forbids.

**Archive engine description updated** — was vague ("writ id, filesystem path, or both per the design"); now states the actual decision (atomic insert into `lab-trial-archives`, teardown gate becomes "archive row exists").

**Probe descriptions tightened** — exact summary shapes, the 10MB diff cap as a fail-loud tripwire, the per-probe directory layout (`src/probes/<name>/`).

**Pointers updated** — README promoted to top of the list as canonical spec home; `c-momaa5o9 show` next to it for the reasoning trail.

The doc lives in `.scratch/`, so no commit needed — it's a working handoff that the next session will pick up directly.

---

