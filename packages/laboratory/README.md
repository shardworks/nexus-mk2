# The Laboratory

Apparatus for running trial-shaped experiments on guild configurations.

## Audiences

- **Nexus dev** — cost/quality tuning, prompt evaluation, plugin variant
  comparison. Replaces the standalone-bash spec at
  `experiments/infrastructure/setup-and-artifacts.md`.
- **End users** — evaluate prompts, plugins, and config variants by
  authoring trial manifests against a stable apparatus surface.

## Architecture (MVP0)

- **Writ type:** `trial` — a single execution unit. Lifecycle mirrors
  mandate (`new → open → completed | failed | cancelled`, with `stuck`
  as a non-terminal off `open`). Trials are leaves in v1; the
  higher-level `experiment` grouping is parked for v2.
- **Rig template:** `post-and-collect-default` — composes
  fixture-setup, scenario, probe, teardown, and archive engines from
  the writ's `ext.laboratory.config`. One canonical template; extension
  is via plugin contributions, not in-template slots.
- **Engines:**
  - **Fixtures** — set up and tear down disposable surfaces (codex
    repos, test guilds). Form a dep DAG; topo-sorted at template
    instantiation.
  - **Scenario** — the workload. v1 uses cross-guild commission-post +
    wait-for-writ-terminal as the canonical scenario engine pair.
  - **Probes** — extract data from the trial. Own their own books for
    bulk data and yield a summary that lands in the archive index.
  - **Archive** — writes the per-trial index row and orchestrates the
    probe set. See **Archive design** below.
- **Authoring:** YAML manifest via `nsg lab trial post --manifest <file>`.
  Manifest shape mirrors `ext.laboratory.config` exactly.

## Archive design

The archive subsystem is **DB-authoritative with on-demand filesystem
materialization.** Captured trial data lives in the lab guild's stacks
DB; the filesystem story is provided by an extract tool that reads from
the DB on demand. This avoids the brittleness of long-lived references
between the lab guild's books and patron-owned filesystem trees.

Resolved at click `c-momaa5o9`.

### Books

Three books participate. The archive engine owns one (`lab-trial-archives`,
the index); the two built-in probes each own one (their captured data).

#### `lab-trial-archives` — owned by the archive engine

One row per archived trial. Tiny. Written-once at archive time. The
archive engine has **no schema opinions about probe data** — its job is
to record what probes ran and what each yielded as a summary.

```ts
interface LabTrialArchive {
  id: string;                            // generated
  trialId: string;                       // FK → clerk/writs (indexed)
  archivedAt: string;                    // ISO

  probes: Array<{
    id: string;                          // probe id from trial config
    engineId: string;                    // e.g. 'lab.probe-stacks-dump'
    summary: Record<string, unknown>;    // opaque to archive engine
  }>;
}
```

Row existence is the success signal — there is no in-progress / failed
row state. The archive engine writes the row atomically on success;
trials whose rigs failed before reaching archive simply have no
matching row.

Trial-level facts (manifest body, codex base SHA, codex upstream URL,
plugin specifications) are **not duplicated here** — they live on the
trial writ at `ext.laboratory.config`. Reproducibility-relevant runtime
facts (resolved plugin pins, framework SHA, rig template name) are
captured by `lab.probe-trial-context` and live in that probe's summary.

#### `lab-trial-stacks-dumps` — owned by `lab.probe-stacks-dump`

One row per source-row, across every book in the test guild. Generic
JSON-bodied; querying is via SQLite JSON1 expressions.

```ts
interface LabTrialStacksDump {
  id: string;                            // generated
  trialId: string;                       // FK (indexed)
  sourceBook: string;                    // (trialId, sourceBook) indexed
  sourceRowId: string;
  capturedAt: string;
  body: Record<string, unknown>;          // the source row, verbatim
}
```

Indexes added per hot query — e.g.
`CREATE INDEX … ON … (trialId, json_extract(body, '$.cost'))
 WHERE sourceBook='animator/sessions'`.

#### `lab-trial-codex-commits` — owned by `lab.probe-git-range`

One row per captured codex commit. Body is the diff text.

```ts
interface LabTrialCodexCommit {
  id: string;
  trialId: string;                       // FK (indexed)
  sequence: number;                      // ordinal within trial
  sha: string;                           // 40-char
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  diff: string;                          // patch text
}
```

**Big-diff tripwire:** the archive engine fails loud if any single diff
exceeds 10MB. Realistic diffs are <500KB; the cap is a "we'll figure
out blob storage if it ever bites" tripwire, not a constraint we expect
to hit.

### Standard probes

Three probes ship in MVP, registered with the laboratory plugin's probe
registry:

- **`lab.probe-stacks-dump`** — reads every book in the test guild,
  writes one row per source-row to `lab-trial-stacks-dumps`. Summary
  is `{ bookCounts: { '<plugin>/<book>': N, ... } }`.
- **`lab.probe-git-range`** — captures commits between the codex base
  and head SHAs, writes one row per commit to
  `lab-trial-codex-commits`. Summary is
  `{ headSha, commitCount, totalDiffBytes }`.
- **`lab.probe-trial-context`** — captures rig id, rig template name,
  framework SHA, resolved plugin pins, and a snapshot of the trial
  manifest. Summary-as-data: no bulk book; the summary itself is the
  captured data. Included in the default rig template; opt out by
  authoring a custom template.

### Trial-writ linkage

Just the foreign key. `lab-trial-archives.trialId` references
`clerk/writs.id`. Lookup is via FK query — there is no
`laboratory.archived-as` clerk link, because clerk links are
writ-to-writ and archive records are not writs.

`nsg writ show <trialId>` shows the trial writ with its config. To
surface the archive, run `nsg lab trial-show <trialId>`.

### Atomicity

Per-engine, not per-trial. The rig grafts probes ahead of the archive
engine; each probe writes its data atomically inside its own SQLite
transaction. The archive engine runs after all probes complete and
writes the `lab-trial-archives` index row atomically once. The index
row is the join key for queries — probe-book rows without a matching
archive-index row are orphan data from trials whose rigs failed before
reaching the archive step. Orphans are safe to ignore in queries
(every analytical query starts from `lab-trial-archives` and joins
out). Cleanup of orphan probe rows is future polish; MVP leaves them
in place.

The teardown engines (`lab.guild-teardown`, `lab.codex-teardown`)
refuse to run unless the trial's archive row exists.

### Probe registry and extraction-dispatch

Probes self-declare an extraction handler that materializes their
captured data to a directory. The extract tool dispatches via the
registry — no hardcoded probe knowledge in the tool itself. MVP
contract:

```ts
interface ProbeEngineDesign extends EngineDesign {
  // existing
  run(givens, context): Promise<EngineRunResult>;

  // new
  extract(args: {
    trialId: string;
    targetDir: string;        // probe writes outputs here (subdir)
    guild: GuildHandle;        // for reading the probe's books
  }): Promise<{
    files: Array<{ path: string; bytes: number }>;
  }>;
}
```

Tracked at click `c-momkil4p`. Each built-in probe ships its own
extractor:

- `lab.probe-stacks-dump` materializes to
  `<targetDir>/stacks-export/<plugin>-<book>.json` (one JSON array
  per source book).
- `lab.probe-git-range` materializes to
  `<targetDir>/codex-history/{commits-manifest.yaml,NNNN-<sha>.patch}`.
- `lab.probe-trial-context` materializes to
  `<targetDir>/trial-context.yaml`.

The extract tool composes per-probe outputs and additionally generates
`manifest.yaml` (from the trial writ's `ext.laboratory.config`) and
`README.md` (from archive metadata + probe summaries) at the top
level.

### CLI surface

- **`nsg lab trial-show <trialId>`** — print archive metadata + probe
  summaries from `lab-trial-archives`.
- **`nsg lab trial-extract <trialId> --to <path> [--force]`** —
  materialize all captured data to a directory. Refuses to overwrite
  unless `--force`. Probe registry dispatches per-probe extractors.
- **`nsg lab trial-export-book <trialId> --book <name> [--format jsonl|json]`** —
  stream one source book for analysis pipelines. Default `jsonl`.

For programmatic analysis without going through extract: scripts can
attach the lab guild's stacks DB directly (DuckDB reads SQLite
natively) and query `lab-trial-stacks-dumps` / `lab-trial-codex-commits`
with JSON1 expressions.

### Annotations live sanctum-side

Analysis notes, findings, and human-authored interpretation of trial
data live in sanctum markdown that references `trialId` as the join
key — not in any laboratory book. The captured data in books is
immutable apparatus output; analysis is a sanctum activity. They were
never the same thing.

### Plugin packaging

For MVP, all three books and all three standard probes bundle in
`@shardworks/laboratory`. The code organizes per-probe
(`src/probes/<probe-name>/{engine.ts, book.ts, extractor.ts}`) and the
probe registry is built from per-probe registrations rather than a
hardcoded list. When a third-party probe forces the issue, lifting a
built-in probe into its own plugin (`@shardworks/lab-probe-stacks-dump`,
etc.) is a mechanical move — no architectural surgery. Tracked as a
parked v2 path; no click filed yet pending a forcing function.

## Status

Skeleton with stub engines. The trial writ type is registered; the rig
template, manifest CLI, and stub engines are wired end-to-end (smoke
tested against `vibers`). The remaining MVP work: real engine
implementations under click `c-moma9llq` — codex fixtures, guild
fixtures, scenario engines, probe engines (now including
`lab.probe-trial-context`), the archive engine, and the probe registry
+ extract dispatch (`c-momkil4p`).

## Background

This package previously held a CDC-based observational stub (data
mirroring of writs/sessions into the sanctum). That instrument was
retired 2026-04-30 — its underlying signals (patron-set spec quality
ratings, structured commission review) had been hollowed out by the
shift to automated planning and static review pipelines. The package
was kept as a no-op so existing `guild.json` registrations stayed
loadable; the apparatus reshape reuses the package and the registered
plugin id, but the old data-mirroring code and types are gone.
