# The Laboratory

Apparatus for running trial-shaped experiments on guild configurations.

## Audiences

- **Nexus dev** — cost/quality tuning, prompt evaluation, plugin variant
  comparison. Replaces the standalone-bash spec archived at
  `docs/archive/deprecated-docs/experimental-infrastructure-setup-and-artifacts.md`.
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
(`src/probes/<probe-name>.ts` and the archive book schemas at
`src/archive/`) so a future per-plugin lift is mechanical. Probe
extraction-dispatch uses a structural type-guard
(`isProbeEngineDesign`) over the existing Fabricator engine
registry — no separate probe registry; engines that ship an
`extract()` method are recognized as probes structurally.

## Authoring trials

A trial is a YAML manifest that mirrors `LaboratoryTrialConfig`
exactly (`slug`, `fixtures`, `scenario`, `probes`, `archive`) plus
optional `title`, `description`, `parentId`, and `codex` fields that
land on the trial writ rather than on the config payload. The CLI
posts the trial via:

```sh
nsg lab trial-post path/to/manifest.yaml
nsg lab trial-post --manifest path/to/manifest.yaml --draft   # leave in 'new'
```

### Minimal manifest (single fixture, single probe)

```yaml
slug: orientation-suppression-strong
title: P3 — orientation suppression, strong-prompt variant
description: |
  Tests whether an imperative anti-orientation directive in the
  implementer handoff produces productive work in fewer than five
  turns. Captures the test-guild's animator/sessions book for
  cost/turn-count analysis.

# Framework version pin. Optional — when omitted, the trial-post tool
# resolves it from the lab-host's installed @shardworks/nexus-core
# VERSION (and fails when that's '0.0.0', i.e. dev source). Stable-pin
# rules apply (see "Plugin pin reproducibility").
frameworkVersion: '1.2.3'

fixtures:
  - id: codex
    engineId: lab.codex-setup
    givens:
      # Any git clone source: owner/name, full URL, or absolute path.
      # Local-bare codex flow — no GitHub round-trip.
      upstreamRepo: /workspace/nexus-mk2
      baseSha: 4b50b6542aa07bd7b74dca1a1d581f90788d4d47
      # codexName auto-defaults to <slug>-<writId-tail> from
      # framework-injected _trial. Override only when needed.

  - id: test-guild
    engineId: lab.guild-setup
    dependsOn: [codex]
    givens:
      # Plugin pins MUST be stable identifiers (exact semver, git+url
      # with SHA fragment, github-shorthand#sha, or registry tarball).
      # The manifest CLI rejects file:/link:/range/dist-tag forms at
      # load time. See "Plugin pin reproducibility" below.
      plugins:
        - name: '@shardworks/tools-apparatus'
          version: '1.2.3'
        - name: '@shardworks/codexes-apparatus'
          version: '1.2.3'
        - name: '@shardworks/stacks-apparatus'
          version: '1.2.3'
        - name: '@shardworks/clerk-apparatus'
          version: 'shardworks/clerk-apparatus#a1b2c3d4e5f6789012345678901234567890abcd'
      # Optional: deep-merged into guild.json after init.
      config:
        loom:
          roles:
            implementer:
              prompt-overrides:
                orientation-suppression: |
                  Begin work immediately. Do not summarize the
                  task before starting.
      # Optional: per-trial file copies (sourcePath absolute in v1).
      files: []

scenario:
  engineId: lab.commission-post-xguild
  givens:
    briefPath: /workspace/nexus-mk2/experiments/X016/briefs/feature-A.md
    # waitForTerminal=true (default) blocks until the test guild's
    # writ reaches a terminal classification; false yields after post.
    waitForTerminal: true
    timeoutMs: 1800000   # 30m

probes:
  - id: context
    engineId: lab.probe-trial-context
    givens: {}
  - id: stacks
    engineId: lab.probe-stacks-dump
    givens: {}
  - id: commits
    engineId: lab.probe-git-range
    givens: {}

archive:
  engineId: lab.archive
  givens: {}
```

### Manifest-shape rules

- **`slug`**: lowercase kebab-case, alphanumeric + hyphen, must
  start with a letter, ≤40 characters. Used in disposable-resource
  naming (`<slug>-<writId-tail>` for codex and test-guild dirs).
- **`fixtures[].id` / `probes[].id`**: kebab-case (`[a-z0-9-]+`,
  ≤40 chars). Unique within their respective lists.
- **Fixture DAG**: `dependsOn` references must resolve and form an
  acyclic graph. The manifest CLI rejects cycles, unknown
  references, and duplicate ids at validation time.
- **`fixtures[].teardownEngineId`**: optional override; defaults to
  the convention `<engineId-with-trailing -setup→-teardown>`.
- **Givens**: opaque to the manifest CLI for general shape; each
  engine's docstring documents what it expects. Mistyped givens fail
  at engine run time, not validation. **Exception: plugin pins are
  validated at manifest-load time** — see "Plugin pin reproducibility"
  below.

### Plugin pin reproducibility

A trial manifest is a reproducibility artifact: it lands on the
trial writ's `ext.laboratory.config`, gets snapshotted into the
archive row by `lab.probe-trial-context`, and must re-resolve to
the same artifacts when re-run later. The manifest CLI rejects any
plugin pin that doesn't resolve to a stable identifier.

**Accepted forms (whitelist):**

| Form | Example |
|---|---|
| Exact npm semver | `1.2.3`, `0.7.0-alpha.2`, `1.0.0+build.5` |
| Git URL with a SHA fragment | `git+https://github.com/foo/bar.git#a1b2c3d4e5f6...` |
| Git URL via local-file scheme + SHA | `git+file:///workspace/nexus-mk2#a1b2c3d4...` |
| GitHub shorthand with SHA | `foo/bar#a1b2c3d` or `github:foo/bar#a1b2c3d` |
| Registry tarball URL | `https://registry.npmjs.org/foo/-/foo-1.2.3.tgz` |

**Rejected forms (blacklist):**

`file:<path>`, `link:<path>`, `workspace:*`, version ranges
(`^1.2.3`, `~1.2.3`, `*`, `>=1.0.0`), dist-tags (`latest`, `next`,
`beta`, `alpha`, `canary`, `rc`), git URLs with a branch or tag
fragment (`...#main`, `...#v1.0.0`), and partial / unrecognized
specifiers.

**Dev iteration on framework source.** When you want to test a
manifest against in-flight framework changes, commit the changes
locally and pin via the local-file git URL form:

```yaml
plugins:
  - name: '@shardworks/clerk-apparatus'
    version: 'git+file:///workspace/nexus#a1b2c3d4...'
```

The SHA pins the artifact deterministically; the URL just tells the
resolver where to fetch from. No need to push to the remote.

The validator runs in `lab-trial-post`'s manifest-load step. Failed
pins surface with the issue path (e.g.
`fixtures.0.givens.plugins.2.version`) and a specific reason for
each rejection — multiple bad pins in one manifest are reported
together.

### Test-guild bootstrap (no global `nsg` required)

`lab.guild-setup` does not depend on a global or lab-host-local
`nsg` install. The bootstrap sequence is:

1. **`npx -p @shardworks/nexus@<frameworkVersion> nsg init <testGuild>`**
   — runs the trial-pinned framework's `init` against the trial-pinned
   `VERSION` constant. This mirrors how a real user creates a guild
   from scratch and binds the test guild to the trial-pinned version.
   On a cold cache, this is a one-time `npm install` of the framework
   into npx's per-package cache; subsequent trials with the same pin
   hit the cache.

2. After init, the test guild has `@shardworks/nexus@<frameworkVersion>`
   installed in `<testGuild>/node_modules`, and the binstub at
   `<testGuild>/node_modules/.bin/nsg` is the version-true CLI.

3. **All subsequent shellouts** (plugin install loop, codex add,
   commission-post, writ-show) use that local nsg, not anything on
   the lab-host's PATH or in the lab-host's `node_modules`.

The lab-host needs only Node + npx — both ship with any standard Node
install. No global `nsg`, no lab-host-side `@shardworks/nexus` package,
no npm/pnpm version coordination.

**Resolving `frameworkVersion`:**

- **Manifest field set** → use it.
- **Manifest field absent + lab-host has a real VERSION** → fall back
  to the lab-host's installed `@shardworks/nexus-core` VERSION. This
  case happens transparently in production where the lab-host is
  npm-installed.
- **Manifest field absent + lab-host VERSION is `0.0.0` (dev source)**
  → fail loud. The trial-post tool tells the author to set
  `frameworkVersion` explicitly.

The resolved value is written back into the trial writ's
`ext.laboratory.config` before the writ transitions to `open`, so the
archive snapshot captures the actual pin used.

**Dev iteration on framework source.** When pinning to a local commit
(`git+file:///workspace/nexus#<sha>`), the framework source must be
**built** (`dist/cli.js` exists). The `nsg` binstub in a fresh test
guild's `node_modules` points at the package's `bin` field — the
non-published variant is `./src/cli.ts` (TypeScript), which won't run
with plain node. Build before posting:

```sh
cd /workspace/nexus
pnpm build
git commit -am 'wip: testing change X'
# pin the trial to that sha
nsg lab trial-post my-trial.yaml
```

This trades the dev-time live-source loop for trial reproducibility.
Trials are archived as inputs you can re-run later — that's only
possible if the artifacts they reference are content-addressed.

### After posting

```sh
# Post the trial; the rig fires immediately (writ goes new → open).
nsg lab trial-post manifest.yaml

# Watch the rig flow.
nsg writ list --type trial
nsg writ-show <trialId>           # writ-level view
nsg rig list --writ <trialId>     # the rig executing it

# After the trial completes:
nsg lab trial-show <trialId>      # archive metadata + probe summaries
nsg lab trial-extract <trialId> --to /tmp/extract  # materialize captured data
nsg lab trial-export-book <trialId> --book animator/sessions  # streaming JSONL
```

### Authoring tips

- **Codex base SHA picks the snapshot.** The codex-setup engine
  clones the upstream repo, checks out `baseSha`, and pushes that
  to the trial's local-bare repo. Pick the SHA you want the test
  guild to start from — typically the head of whatever branch
  embodies the variant under test.
- **Plugin pins must be stable.** See "Plugin pin reproducibility"
  above for the accepted forms. The CLI rejects manifests with
  `file:`, `link:`, version ranges, dist-tags, or branch/tag git
  refs at load time. The same rule applies to `frameworkVersion`.
- **Lab-host needs only Node + npx.** No global `nsg`, no lab-host-
  side framework install. See "Test-guild bootstrap" above for the
  details.
- **Default fixtures are isolated per trial.** Codex bare repos
  land at `<labHost>/.nexus/laboratory/codexes/<codexName>.git`;
  test guilds at `<labHost>/.nexus/laboratory/guilds/<guildName>/`.
  No need to author paths unless you want a specific layout.
- **Probe order is independent.** Probes run in parallel after
  scenario completes; the archive engine waits for all of them.
  Skipping a probe is just leaving its declaration out — the
  archive row will then have no entry for that probe id.
- **Brief path is absolute in v1.** Manifest-relative resolution is
  future polish (currently throws on relative paths). Author
  briefs into the sanctum (e.g. under `experiments/<X-num>/briefs/`)
  and reference by absolute path.

## Status

Production-ready for nexus-dev trials. The trial writ type is
registered, the rig template is the canonical
`post-and-collect-default`, all four fixture and scenario engine
pairs (codex / guild / commission-post / wait) are real, the three
standard probes are real, the archive engine is real, and the four
CLI tools (`trial-post`, `trial-show`, `trial-extract`,
`trial-export-book`) ship with the package. 167/167 unit tests
passing including a codified pipeline smoke test. The first
real-world trial port (X016 orientation suppression or similar P3
candidate) is the next milestone — see click `c-momaab8y`.

## Background

This package previously held a CDC-based observational stub (data
mirroring of writs/sessions into the sanctum). That instrument was
retired 2026-04-30 — its underlying signals (patron-set spec quality
ratings, structured commission review) had been hollowed out by the
shift to automated planning and static review pipelines. The package
was kept as a no-op so existing `guild.json` registrations stayed
loadable; the apparatus reshape reuses the package and the registered
plugin id, but the old data-mirroring code and types are gone.
