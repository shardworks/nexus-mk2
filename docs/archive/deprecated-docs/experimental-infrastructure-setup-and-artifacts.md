# Experimental infrastructure: setup, artifacts, lifecycle

**Status:** archived (2026-05-01) — superseded by **the Laboratory
apparatus** at `packages/laboratory/`. This document is preserved for
historical reference; new trial-shaped experiments should be authored
as YAML manifests against the apparatus rather than implemented in
standalone bash.

The apparatus reuses the design principles below (three-repo
separation, one guild per run, controlled vs. manipulated variables,
standardized capture) but folds the moving parts — codex setup,
test-guild bootstrap, scenario commissioning, data capture, archival
— into typed engine designs orchestrated by Spider. See
`packages/laboratory/README.md` for the canonical spec and
`docs/archive/deprecated-docs/` for the historical context below.

---

**Original status (when the spec was authored):** draft (2026-04-30) —
refined with Sean's feedback.

## Purpose

This document specifies the infrastructure for running framework-side
experiments — runs that need a controlled codex, controlled framework
state, isolated session recording, and reproducible setup. The immediate
driver is P3 (engine-pipeline-decomposition; click `c-modxxtu6`), whose
sub-questions (orientation suppression, trigger heuristics, granularity,
cost confirmation) all require executing real implementer sessions in
isolated conditions before the architecture can be designed empirically.
Subsequent experiments touching framework or commission-pipeline behavior
will reuse the same infrastructure.

The infrastructure does **not** govern paper analyses (instruments run
against existing transcript archives) — those need no setup. It governs
work that **executes new commissions** under controlled conditions.

## Vocabulary

- **Experiment.** One piece of inquiry — a research question plus the
  analytical frame to answer it. Lives at
  `experiments/X<NNN>-<slug>/`.
- **Run.** One execution of the experimental apparatus with a specific
  set of variable settings. An experiment produces one or more runs.
  Lives at `experiments/X<NNN>-<slug>/artifacts/run-NNN-<variant>/`.
- **Variables.** The inputs that define a run. Split into **controlled**
  (held constant — framework SHA, codex base, common config) and
  **manipulated** (varied per run — prompts, plugin versions, config
  fragments). Both kinds live in `run.yaml`.

## Design principles

1. **Three-repo separation.** The sanctum, the framework (nexus), and the
   codex live in three repos with distinct persistence rules. Each artifact
   has one canonical home.
2. **One guild per run.** Every run gets its own fresh guild and its
   own short-lived codex repo. This eliminates run-isolation problems
   inside the guild's books — every row in the guild DB belongs to this
   run by construction.
3. **Sanctum is the canonical record.** Methodology, manifests, input
   files, captured execution data, and analysis live in the sanctum. The
   other two repos (nexus branches, codex repos) are reproducibility
   breadcrumbs.
4. **Reproducibility via SHA pinning.** Every framework dep, every codex
   base, every plugin version is pinned to a SHA in a per-run manifest
   that lives in the sanctum.
5. **Disposable execution surfaces.** Codex repos and live guild dirs are
   short-lived. They're created at run start, archived to sanctum at
   run end, and deleted. Re-running an experiment doesn't depend on
   long-lived disposable state.
6. **Standard guild mechanisms over bespoke generation.** The setup
   script composes existing `nsg` commands (`nsg init`, `nsg plugin
   install`, `nsg codex add`) and Laboratory tools rather than
   hand-generating `guild.json` / `package.json`. Custom guild
   configuration is expressed as a partial `guild.json` merge plus a
   list of files to copy.

## Architecture

### The three repos

| repo | role | persistence |
|---|---|---|
| **Sanctum** (`nexus-mk2`) | methodology, manifests, input files, captured artifacts, analysis, findings | indefinite; canonical research record |
| **Nexus framework** | the framework state that produces experimental variance. Each run declares whatever branch + base SHA it needs. Runs that share framework state share a branch; runs that introduce framework variance get their own. No enforced cardinality. | indefinite; archived branches |
| **Codex repo** | short-lived fresh repo (clone of the upstream codex, pushed as a new repo — *not* a GitHub fork, to avoid leaving fork metadata on the upstream). One per run. The repo's `main` branch is the run's working ref; commits there are the rigs' actual edits. | short-lived; captured-then-deleted |

The codex repo lives in **the same GitHub org as the upstream codex** to
keep permission setup simple. Repos are named
`experiment-<X-num>-<slug>-run-<NNN>-<variant>` to keep them
traceable while alive.

### Lifecycle

```
[run.yaml in sanctum]
        │
        ▼
   run-init        → creates nexus branch (if needed), clones codex into
                      a fresh repo, creates guild dir, runs nsg init +
                      nsg plugin install + nsg codex add, merges guild
                      config, copies input files, writes
                      run-status.yaml, stubs run README
        │
        ▼
   [execute run]   → post commissions; rigs execute; sessions record
                      into the guild's books
        │
        ▼
   run-archive     → invokes nsg lab export-books to dump the guild's
                      books to JSON-per-table; invokes nsg lab git-range
                      to capture codex commits between base and HEAD;
                      writes status.laboratory.archive
        │
        ▼
   run-cleanup     → deletes codex repo (gh repo delete) and the live
                      guild dir; refuses to run if archive wasn't
                      completed
```

The nexus experiment branch is **not** deleted at cleanup — it persists
in the nexus repo as a reproducibility breadcrumb.

## Run manifest format — `run.yaml`

`run.yaml` is the immutable input record for one run. The setup script
reads it; nothing should write to it after authoring.

```yaml
# experiments/X<NNN>-<slug>/artifacts/run-NNN-<variant>/run.yaml

experiment: X<NNN>-<slug>      # experiment slug; matches the parent dir
run: NNN                       # run number, zero-padded (001, 002, ...)
variant: <variant-slug>        # what makes this run different from others

nexus:
  branch: experiment/X<NNN>-<slug>     # branch in /workspace/nexus
  base_sha: <40-char SHA>              # the SHA the branch is expected
                                       # to be at; init refuses on drift

codex:
  upstream_org: shardworks
  upstream_repo: nexus                 # or whatever the codex repo is
  base_sha: <40-char SHA>              # codex SHA the run starts from

guild:
  plugins:                             # exact plugin pinning for the
                                       # experimental package.json. Each
                                       # plugin's `version` is whatever
                                       # `nsg plugin install` accepts —
                                       # an npm semver, a git SHA, a
                                       # local path. SHAs from a nexus
                                       # experiment branch are the
                                       # expected case.
    - name: '@shardworks/clerk-apparatus'
      version: <SHA-or-version>
    - name: '@shardworks/animator-apparatus'
      version: <SHA-or-version>
    # ...

  config:                              # partial guild.json merged into
                                       # the default after `nsg init`.
                                       # Free-form; whatever the guild
                                       # supports.
    <arbitrary partial guild.json>

  files:                               # files copied into the guild
                                       # after init
    - sourcePath: prompts/handoff-strong.md
                                       # relative to this run.yaml
      guildPath: animator/instructions/implement.md
                                       # relative to the guild root
    # ...
```

### Schema notes

- `experiment` and `variant` slugs use lowercase kebab-case, no whitespace.
- `run` is zero-padded to three digits.
- All SHAs are full 40-char (no abbreviated forms). The init script
  refuses ambiguous refs.
- `guild.plugins[].version` is whatever `nsg plugin install` accepts.
  Git SHAs are the expected case for nexus-side plugins (so we can
  reference unpublished work on experiment branches), but semver
  versions or local paths are fine for non-nexus plugins.
- `guild.config` and `guild.files` together cover all variant
  customization. Anything that used to be a `prompts_dir` is just a
  file entry copying into the guild's instruction location.

## Run status format — `run-status.yaml`

`run-status.yaml` is the mutable record of the run's lifecycle. The
init, archive, and cleanup scripts write to it. Status entries are keyed
by plugin ID (Nexus convention); the Laboratory plugin owns this
infrastructure, so all entries sit under `laboratory`.

```yaml
# experiments/X<NNN>-<slug>/artifacts/run-NNN-<variant>/run-status.yaml

laboratory:
  phase: new                           # new | active | completed | cancelled
                                       # default is `new` if omitted

  setup:                               # filled at run-init time
    timestamp: 2026-...
    invocation: 'bin/run-init.sh --manifest .../run.yaml'
    nexus:
      branch: experiment/X016-...
      head_sha: <40-char>              # actual HEAD when init ran
    codex:
      repo_url: https://github.com/shardworks/experiment-...
      head_sha: <40-char>
    guild:
      path: /workspace/experiments/...
      plugins_resolved:                # what was actually installed
        - { name: '...', version: '...' }
      files_copied:
        - { sourcePath: '...', guildPath: '...' }

  archive:                             # filled at run-archive time;
                                       # overwritten on re-archive (no
                                       # preservation of prior runs)
    timestamp: 2026-...
    invocation: 'bin/run-archive.sh ...'
    counts:
      tables: <N>
      rows: <N>
      commits: <N>
    paths:
      stacks_export: artifacts/run-NNN-<variant>/stacks-export/
      codex_history: artifacts/run-NNN-<variant>/codex-history/
```

`phase` is advisory — humans (or future scripts) update it as the run
progresses. Cleanup refuses based on `archive` being present, not on
`phase`.

## Setup script — `run-init.sh`

```
bin/run-init.sh --manifest <path-to-run.yaml>
```

### Steps

1. **Validate manifest.** Required fields present, SHAs are 40-char and
   resolve, paths exist, slug not already in use (no existing guild dir
   at the target location).
2. **Ensure nexus branch.** If the manifest's branch doesn't exist in
   `/workspace/nexus`, create it from `nexus.base_sha`. If it exists,
   verify it points at the manifest's SHA — refuse to proceed on drift.
   Push to origin if newly created.
3. **Create the codex repo.** Clone the upstream codex at
   `codex.base_sha` into a temp dir, then `gh repo create
   <upstream_org>/experiment-<X-num>-<slug>-run-<NNN>-<variant> --private
   --source=<temp-dir> --push`. Not a GitHub fork — a fresh repo seeded
   from the upstream SHA. Keeps fork metadata off the upstream codex.
4. **Create guild dir** at
   `/workspace/experiments/<X-num>-<slug>-run-<NNN>-<variant>/`.
5. **Initialize the guild.** Run `nsg init <guild-dir>` (verify the
   exact command surface against framework source).
6. **Install plugins.** For each entry in `guild.plugins`:
   `nsg plugin install <name>@<version>` against the guild dir.
7. **Add the codex.** `nsg codex add <repo-url> --sha <codex-base-sha>`
   against the guild dir.
8. **Merge guild config.** Read `guild.config` from the manifest;
   deep-merge into `<guild-dir>/guild.json` (created by `nsg init`).
9. **Copy files.** For each entry in `guild.files`, copy `sourcePath`
   (resolved relative to `run.yaml`) to `guildPath` (resolved relative
   to the guild root). Create intermediate dirs as needed.
10. **Write `run-status.yaml`.** Capture every resolved SHA, the
    guild path, the codex repo URL, the resolved plugin versions, and
    the copied file list under `laboratory.setup`. Set
    `laboratory.phase: new`.
11. **Generate run README stub** at
    `experiments/X<NNN>-<slug>/artifacts/run-NNN-<variant>/README.md`
    with the **Setup** section auto-filled from `laboratory.setup` and
    the rest as headers waiting for the experiment author to fill in.
12. **Print next steps.** "Guild initialized at
    `/workspace/experiments/...`. Post commissions via
    `nsg commission-post --guild ...`. When the run is done, run
    `bin/run-archive.sh <run-slug>` to capture state, then
    `bin/run-cleanup.sh <run-slug>` to remove disposable surfaces."

### Idempotency

Re-running init on an existing guild dir refuses to proceed (with a
clear error, no overwrite). Force-re-init is not supported — the
intended flow is `archive + cleanup + re-init`, never silent overwrite.

## Archive script — `run-archive.sh`

```
bin/run-archive.sh <run-slug>
```

Where `<run-slug>` is the form `X<NNN>-<slug>-run-<NNN>-<variant>`,
or a path to the live guild dir. The script resolves to the
corresponding sanctum artifact dir.

### Steps

1. **Read `run-status.yaml`** to find the guild dir, codex repo URL,
   and base SHAs.
2. **Export the books.** `nsg lab export-books --guild <guild-dir>
   --output artifacts/run-NNN-<variant>/stacks-export/`. The Laboratory
   plugin's tool walks every book and writes JSON-per-table to the
   output dir. (Tool to be implemented; see *Implementation
   prerequisites*.)
3. **Capture codex commits.** `nsg lab git-range --repo <codex-repo>
   --base <codex-base-sha> --head <head-sha> --output
   artifacts/run-NNN-<variant>/codex-history/`. The Laboratory tool
   walks the commit range, writes per-commit diffs and a manifest of
   metadata. Generic tool, useful beyond this infrastructure.
4. **Update `run-status.yaml`.** Write `laboratory.archive` with
   timestamp, invocation, counts, and output paths. Overwrites any
   prior archive entry.
5. **Print next steps.** "Archive complete. Run
   `bin/run-cleanup.sh <run-slug>` to delete disposable surfaces.
   Verify the archive contents at `<sanctum-path>` before running
   cleanup."

The script is idempotent: re-running overwrites the prior dump (no
preservation of prior archive runs). Cleanup refuses to run if
`laboratory.archive` is missing or stale relative to the live state.

### Note on transcripts

Animator session transcripts are stored in the `sessions` book by
the Animator plugin, so they come along automatically with
`export-books`. No separate transcript-copy step. This sidesteps both
the `~/.claude/projects/` dependency and the multi-provider question
(any provider Animator supports lands its transcripts in the same
book).

## Cleanup script — `run-cleanup.sh`

```
bin/run-cleanup.sh <run-slug>
```

### Steps

1. **Verify archive completion.** Refuse to run if
   `run-status.yaml` lacks a `laboratory.archive` entry, or if its
   timestamp is older than the guild dir's most recent modification
   (suggests work happened after archive — re-archive before cleanup).
2. **Delete the codex repo.** `gh repo delete <repo-url> --yes`. Fail
   loud if the repo has unmerged content the script doesn't recognize
   from the archive (rare, but the safety check matters).
3. **Delete the guild dir.** `rm -rf /workspace/experiments/<run-dir>`.
4. **Print confirmation.** "Run <slug> cleanup complete. Sanctum
   artifacts preserved at `<path>`."

The script is **not idempotent** — re-running on a cleaned run errors
("nothing to clean up").

## Artifact layout

```
experiments/X<NNN>-<slug>/
├── spec.md                                # the experiment's research spec
├── findings.md                            # cross-run consolidated findings
└── artifacts/
    ├── run-001-<variant-slug>/
    │   ├── run.yaml                       # immutable inputs
    │   ├── run-status.yaml                # mutable status (phase, setup, archive)
    │   ├── README.md                      # run-level prose doc
    │   ├── files/                         # variant-specific source files
    │   │   └── ...                        #   (whatever guild.files entries source)
    │   ├── stacks-export/                 # nsg lab export-books output
    │   │   ├── writs.json
    │   │   ├── rigs.json
    │   │   ├── sessions.json              # transcripts live here
    │   │   ├── clicks.json
    │   │   └── schema-version.txt
    │   ├── codex-history/                 # nsg lab git-range output
    │   │   ├── commits-manifest.yaml
    │   │   └── 0001-<short-sha>-<slug>.diff
    │   └── analysis/                      # run-specific analysis (if any)
    │       └── <date>-<slug>.md
    │
    ├── run-002-<variant-slug>/            # parallel structure per run
    │   └── ...
    │
    └── analysis/                          # cross-run analysis
        └── <date>-comparison.md
```

### Notes

- **Run dir name is `run-NNN-<variant-slug>`.** NNN is zero-padded;
  variant slug is lowercase kebab-case.
- **`run-NNN-<variant>/analysis/`** is for analysis specific to one
  run; **`artifacts/analysis/`** is for cross-run comparison.
- **Findings go in `experiments/X<NNN>-<slug>/findings.md`** at the
  experiment root. The findings doc consolidates across runs and
  answers the experiment's primary research question.

## Stacks export format

One JSON file per book/table, each containing an array of row objects.
Produced by `nsg lab export-books`.

```json
[
  {
    "id": "w-...",
    "type": "mandate",
    "title": "...",
    "body": "...",
    "status": "open",
    "createdAt": "2026-...",
    "...": "..."
  },
  { "id": "w-...", "...": "..." }
]
```

### File-per-table choice

Per-table beats per-row for our use case:

- Typical row sizes are 1-10KB; per-row overhead (filesystem blocks,
  git blob entries) eats meaningful space at this scale.
- Row counts per run are tens to hundreds — table files stay
  manageable.
- We don't need row-level git history (dumps are snapshots, not
  append-only).
- Analysis instruments load the table once and iterate.

### Carve-out for large content

If any single row carries content >50KB (e.g., a writ body that's a
50KB brief), the dump can extract it to `stacks-export/blobs/<sha>.<ext>`
and replace the inline content with a reference field
(`body_ref: "blobs/<sha>.md"`). Only do this when actually needed; the
default is inline. Session-transcript content in `sessions.json` will
typically trigger this carve-out.

### Schema versioning

`stacks-export/schema-version.txt` records the framework SHA the dump
was taken against. Future readers use this to interpret the row schema.

### Default scope

A fresh guild contains only the run's data, so the default dump is
**every book, every row**. No scope filtering needed.

## Codex history format

Produced by `nsg lab git-range`.

```
codex-history/
├── commits-manifest.yaml
├── 0001-<short-sha>-<slug>.diff
├── 0002-<short-sha>-<slug>.diff
└── ...
```

### `commits-manifest.yaml`

```yaml
base_sha: <40-char>            # the run's codex base
head_sha: <40-char>            # the repo's main HEAD at archive time
commits:
  - sha: <40-char>
    parent: <40-char>
    short: <8-char>
    subject: 'reckoner: sweep vision-keeper references'
    author: 'implementer'
    timestamp: '2026-...'
    diff_file: '0001-<short>-<slug>.diff'
  - ...
```

The list is order-preserving (oldest first). No `seq` field — YAML
sequence position carries it. The tool is generic — no run-specific
cross-references in the manifest. Cross-references between commits and
guild objects (rig, session, writ) live in the books export, not here.
The diff file's `0001-` prefix on disk preserves order for filesystem
listing.

### Diff files

Standard `git format-patch` output; one file per commit. The filename's
numeric prefix preserves order; the short SHA + slug aids human
navigation.

## Run README format

Each run dir has a `README.md` capturing the run's narrative.

```markdown
# Run <NNN> — <variant slug>

## What this run tests
<one paragraph: which variable settings; what we're hoping to observe>

## Setup
- Nexus branch: <branch> @ <SHA>
- Codex repo: <URL> @ <SHA>
- Plugin deps: see `run-status.yaml`
- Variant config: <pointer to files/ or guild.config in run.yaml>

## Methodology
<what commissions were posted, in what order, what was measured>

## Results
<metrics, comparisons, surprises; reference analysis/ files>

## Verdict
<answer to the run's question, with a one-paragraph rationale>
```

The init script auto-fills **Setup** with resolved SHAs and paths. The
experiment author fills the rest.

## Experiment discipline

An experiment is one piece of inquiry — a research question plus the
analytical frame to answer it. An experiment produces one or more
runs, each capturing what happened when the apparatus was set up
and executed with a specific set of variable settings.

### Experiments

- **One experiment has one primary research question** — the verdict
  it must answer. The findings doc resolves to that question.
- **Secondary findings are allowed and welcome** — analyses of the
  same captured data that illuminate other questions. Label them as
  secondary; they don't dilute the verdict.
- **No HARKing.** New primary questions that emerge during analysis
  become new experiments with their own pre-registered question.
  Don't retrofit a question to fit data you've already seen.
- **Number of runs per experiment is whatever the analysis needs.**
  Could be one (qualitative, observational) or many (varying
  parameters, replicating).
- **Old X### items with multiple primary questions** stay as
  historical exceptions. Don't rationalize. Apply the discipline
  going forward.

### Runs

- **A run is a single execution of the apparatus** with a specific set
  of variable settings. It produces a captured-state artifact set in
  `run-NNN-<variant>/`.
- **Variables split into controlled and manipulated.** Controlled
  variables are held constant across runs. Manipulated variables are
  what each run varies. Both go in `run.yaml` — there's no special
  field marking which is which; the variation across an experiment's
  runs makes that visible.
- **Replicates are runs with identical variable settings** — useful
  when checking for non-determinism or noise. Treat as ordinary runs
  with a `replicate-of` field if needed; don't engineer special
  structure now.

## Naming conventions

| thing | format | example |
|---|---|---|
| Experiment slug | `X<NNN>-<lowercase-kebab>` | `X016-p3-orientation-suppression` |
| Nexus experiment branch | `experiment/<experiment-slug>` (per-run variants ok) | `experiment/X016-p3-orientation-suppression` |
| Codex repo name | `experiment-<experiment-slug>-run-<NNN>-<variant>` | `experiment-X016-p3-orientation-suppression-run-001-strong-prompt` |
| Run dir slug | `<experiment-slug>-run-<NNN>-<variant>` | (used in `/workspace/experiments/` and as the cleanup arg) |
| Run artifact dir | `run-<NNN>-<variant>/` | `run-001-strong-prompt/` |

Variant slugs use lowercase kebab-case, descriptive but short.

## Worked example: X016 P3 orientation suppression

(Hypothetical — illustrates how the pieces fit together.)

### Experiment

- **Number:** X016
- **Slug:** `X016-p3-orientation-suppression`
- **Primary research question:** Can a fresh implementer session, given
  a hand-crafted 30K-token handoff, produce productive work in <5 turns?
- **Spec location:** `experiments/X016-p3-orientation-suppression/spec.md`

### Runs

Three prompt variants tested against the same brief (rig 1's docs sweep,
handoff at T52). Common controlled variables: nexus SHA, codex base SHA,
plugin versions. Manipulated: the handoff prompt content (and presence).

| run | variant | what differs |
|---|---|---|
| 001 | `strong-prompt` | imperative anti-orientation directives ("Do NOT re-read X"), evidence anchors |
| 002 | `mild-prompt` | permissive framing ("X is known-good") |
| 003 | `monolithic-baseline` | no handoff; runs the brief from scratch as control |

### Per-run flow

1. Author writes `run.yaml` for run-001-strong-prompt, including the
   shared nexus + codex SHAs and the variant-specific
   `guild.files: [{ sourcePath: prompts/handoff-strong.md,
   guildPath: animator/instructions/implement.md }]`.
2. `bin/run-init.sh --manifest .../run-001-strong-prompt/run.yaml`
   creates the nexus branch (if not already), creates the codex repo,
   inits the guild via `nsg init`, installs plugins via `nsg plugin
   install`, adds the codex via `nsg codex add`, merges
   `guild.config`, copies the handoff prompt into place, writes
   `run-status.yaml`, stubs the README.
3. Post the brief commission via `nsg commission-post --guild
   /workspace/experiments/X016-p3-orientation-suppression-run-001-strong-prompt
   --brief .../files/brief-docs-sweep.md`.
4. Rig executes; sessions record into the guild's books.
5. When the run completes, `bin/run-archive.sh
   X016-p3-orientation-suppression-run-001-strong-prompt` invokes
   `nsg lab export-books` (dumps books) and `nsg lab git-range`
   (captures codex commits), updates `run-status.yaml`.
6. Author fills out the run README with methodology + results +
   verdict.
7. `bin/run-cleanup.sh X016-p3-orientation-suppression-run-001-strong-prompt`
   deletes the codex repo and guild dir.
8. Repeat for runs 002 and 003.

### Cross-run analysis

`experiments/X016-p3-orientation-suppression/artifacts/analysis/2026-MM-DD-orientation-comparison.md`
runs an instrument that compares orientation-tax metrics across the
three runs' books exports and codex histories; produces the answer to
the primary research question. Findings consolidate to
`experiments/X016-p3-orientation-suppression/findings.md`.

## Implementation prerequisites

These are pieces that need to exist (or be verified) before the
infrastructure scripts can be built:

1. **Verify `nsg init` invocation.** Inspect framework source to
   confirm the exact command surface — does it accept a target dir
   argument, where does it create `guild.json`, etc.
2. **Verify `nsg plugin install` invocation.** Confirm the version
   spec accepts SHAs / git refs (not just npm semver). If not,
   negotiate with framework before scripts can pin to experiment
   branches.
3. **Verify `nsg codex add` invocation.** Confirm the SHA-pinning
   surface.
4. **Build `nsg lab export-books`** — Laboratory tool that takes a
   guild dir and an output dir and writes JSON-per-table for every
   book. Promotion to the `stacks` plugin if it proves itself.
5. **Build `nsg lab git-range`** — Laboratory tool that takes a repo
   path, base SHA, head SHA, and output dir and writes the
   commits-manifest + per-commit diff files. Generic tool, useful
   beyond this infrastructure.
6. **Confirm `gh` org permissions.** Assume the experimental setup
   user has permission to create / delete repos in the upstream codex
   org. If that turns out wrong at script time, surface and adjust.

## Future considerations

- **Multi-run experiments running in parallel.** The current spec
  defaults to sequential runs. Some experiments may want concurrent
  runs to save calendar time. Design is compatible — just init
  multiple `run.yaml`s; runs are isolated by construction.
- **Long-lived runs.** Some runs may execute over weeks (e.g.,
  observing P3 behavior across many real commissions). The cleanup
  discipline needs adjusting for these — possibly an interim
  "snapshot" step that captures state without deleting the codex repo.
- **Cross-experiment comparison.** When two experiments answer related
  questions (e.g., X016 P3 orientation, X017 P3 trigger heuristics),
  cross-experiment analysis lives in `experiments/analysis/` (or
  wherever the sanctum convention places it). Out of scope for this
  spec.
- **Replication discipline.** If we start running replicates (same
  variable settings, multiple runs to check for noise), the `run.yaml`
  schema gains a `replicate-of: <run-NNN>` field. Defer until needed.
