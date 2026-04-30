# Experimental infrastructure: setup, artifacts, lifecycle

**Status:** draft (2026-04-30) — pending Sean's review.

## Purpose

This document specifies the infrastructure for running framework-side
experiments — trials that need a controlled codex, controlled framework
state, isolated session recording, and reproducible setup. The immediate
driver is P3 (engine-pipeline-decomposition; click `c-modxxtu6`), whose
sub-questions (orientation suppression, trigger heuristics, granularity,
cost confirmation) all require running real implementer sessions in
isolated conditions before the architecture can be designed empirically.
Subsequent experiments touching framework or commission-pipeline behavior
will reuse the same infrastructure.

The infrastructure does **not** govern paper analyses (instruments run
against existing transcript archives) — those need no setup. It governs
trials that **execute new commissions** under controlled conditions.

## Design principles

1. **Three-repo separation.** The sanctum, the framework (nexus), and the
   codex live in three repos with distinct persistence rules. Each artifact
   has one canonical home.
2. **One guild per trial.** Every trial gets its own fresh guild and its
   own short-lived codex fork. This eliminates trial-isolation problems
   inside the guild's books — every row in the guild DB belongs to this
   trial by construction.
3. **Sanctum is the canonical record.** Methodology, briefs, prompts,
   captured execution data, and analysis live in the sanctum. The other
   two repos (nexus branches, codex forks) are reproducibility breadcrumbs.
4. **Reproducibility via SHA pinning.** Every framework dep, every codex
   base, every plugin version is pinned to a SHA in a per-trial manifest
   that lives in the sanctum.
5. **Disposable execution surfaces.** Codex forks and live guild dirs are
   short-lived. They're created at trial start, archived to sanctum at
   trial end, and deleted. Re-running an experiment doesn't depend on
   long-lived disposable state.

## Architecture

### The three repos

| repo | role | persistence |
|---|---|---|
| **Sanctum** (`nexus-mk2`) | methodology, manifests, prompts, captured artifacts, analysis, findings | indefinite; canonical research record |
| **Nexus framework** | only the framework changes that produce experimental variance. One branch per experiment (not per trial) — a single experiment-wide framework state that all variants in that experiment share. | indefinite; archived branches |
| **Codex fork** | short-lived complete fork of the codex repo, one per trial. The fork's `main` branch is the trial's working ref; commits there are the rigs' actual edits. | short-lived; captured-then-deleted |

The codex fork lives in **the same GitHub org as the upstream codex** to
avoid permission concerns. Forks are named
`experiment-<X-num>-<slug>-trial-<NNN>-<variant>` to keep them
traceable while alive.

### Lifecycle

```
[manifest.yaml in sanctum]
        │
        ▼
   experiment-init   → creates nexus branch (if needed), forks codex,
                        creates guild dir, generates guild.json +
                        package.json, snapshots setup to sanctum,
                        stubs trial README
        │
        ▼
   [run trial]       → post commissions; rigs execute; sessions record
        │
        ▼
   experiment-archive → dumps stacks DB to JSON-per-table, captures
                        codex fork commits as diffs, copies session
                        transcripts, writes archive-manifest
        │
        ▼
   experiment-cleanup → deletes codex fork (gh repo delete) and the
                        live guild dir; refuses to run if archive
                        wasn't completed
```

The nexus experiment branch is **not** deleted at cleanup — it persists
in the nexus repo as a reproducibility breadcrumb.

## Trial manifest format

Each trial is parameterized by a YAML manifest stored in the sanctum
under the experiment dir. The manifest is the canonical specification
of the trial's experimental conditions.

```yaml
# experiments/X<NNN>-<slug>/artifacts/trial-NNN-<variant>/manifest.yaml

experiment: X<NNN>-<slug>      # experiment slug; matches the parent dir
trial: NNN                     # trial number, zero-padded (001, 002, ...)
variant: <variant-slug>        # what makes this trial different from others

nexus:
  branch: experiment/X<NNN>-<slug>     # branch in /workspace/nexus
  base_sha: <40-char SHA>              # the SHA the branch was created from
                                       # (for new experiments) or expected to be
                                       # at (for additional trials in the same
                                       # experiment)

codex:
  upstream_org: shardworks
  upstream_repo: nexus                 # or whatever the codex repo is
  base_sha: <40-char SHA>              # codex SHA the trial starts from

plugins:                               # exact plugin pinning for the
                                       # experimental package.json
  - name: '@shardworks/clerk-apparatus'
    ref: <SHA>
  - name: '@shardworks/animator-apparatus'
    ref: <SHA>
  # ...

guild:
  laboratory_sink: artifacts/trial-NNN-<variant>/laboratory/
                                       # sanctum-relative; resolved to
                                       # absolute path at init time

prompts_dir: artifacts/trial-NNN-<variant>/prompts/
                                       # sanctum-relative; copied/symlinked
                                       # into the guild's role-instruction
                                       # location at init time

archive_extras:                        # optional: tables to include beyond
                                       # the default stacks export
  - cdc_events
```

### Schema notes

- `experiment` and `variant` slugs use lowercase kebab-case, no whitespace.
- `trial` is zero-padded to three digits.
- All paths in the manifest are sanctum-relative (relative to the
  experiment dir). The init script resolves them to absolute paths.
- All SHAs are full 40-char (no abbreviated forms). The init script
  refuses ambiguous refs.

## Setup script — `experiment-init.sh`

```
bin/experiment-init.sh --manifest <path-to-trial-manifest.yaml>
```

### Steps

1. **Validate manifest.** Required fields present, SHAs are 40-char and
   resolve, paths exist, slug not already in use (no existing guild dir
   at the target location).
2. **Ensure nexus branch.** If `experiment/X<NNN>-<slug>` doesn't exist
   in `/workspace/nexus`, create it from `nexus.base_sha`. If it exists,
   verify it points at the manifest's SHA — refuse to proceed on drift.
   Push to origin if newly created.
3. **Fork the codex.** `gh repo fork <upstream_org>/<upstream_repo>
   --org <upstream_org> --fork-name experiment-<X-num>-<slug>-trial-<NNN>-<variant>`.
   The fork's `main` is the trial's working branch, started at
   `codex.base_sha`. (If the fork's `main` HEAD doesn't match `base_sha`
   — e.g., the upstream advanced — explicitly reset the fork's `main`
   to the manifest's SHA before proceeding.)
4. **Create guild dir.** `/workspace/experiments/<X-num>-<slug>-trial-<NNN>-<variant>/`
   with whatever subdirs the framework requires.
5. **Generate `guild.json`.** Codex URL points at the fork; codex SHA
   pinned per the manifest. Laboratory sink resolved to the absolute
   sanctum path.
6. **Generate `package.json`.** Plugins pinned exactly per the
   manifest's `plugins` list. (The exact form of pinning depends on
   the framework's package layout; the script consumes the list and
   writes the appropriate `dependencies` block.)
7. **Init the guild.** Run `nsg init` (or whatever the current command
   is) against the guild dir.
8. **Copy prompts** from the manifest's `prompts_dir` into the guild's
   role-instruction location. Symlink rather than copy if the framework
   supports it (so prompt edits in sanctum take effect without a
   re-init), but verify the framework actually re-reads on each session
   spawn before relying on this.
9. **Snapshot to sanctum.** Write `experiments/X<NNN>-<slug>/artifacts/trial-NNN-<variant>/setup-snapshot.yaml`
   capturing every resolved SHA, fork URL, paths, manifest copy, init
   timestamp, and the script invocation arguments. This is the
   methodology breadcrumb.
10. **Generate trial README stub** at `experiments/X<NNN>-<slug>/artifacts/trial-NNN-<variant>/README.md`
    with the **Setup** section auto-filled and the rest as headers
    waiting for the experiment author to fill in.
11. **Print next steps.** "Guild initialized at
    `/workspace/experiments/...`. Post commissions via
    `nsg commission-post --guild ...`. When the trial is done, run
    `bin/experiment-archive.sh <trial-dir>` to capture state, then
    `bin/experiment-cleanup.sh <trial-dir>` to remove disposable surfaces."

### Idempotency

Re-running init on an existing guild dir refuses to proceed (refuse with
a clear error, do not overwrite). Force-re-init is not supported — the
intended flow is `archive + cleanup + re-init`, never silent overwrite.

## Archive script — `experiment-archive.sh`

```
bin/experiment-archive.sh <trial-slug>
```

Where `<trial-slug>` is the form `X<NNN>-<slug>-trial-<NNN>-<variant>`,
or a path to the live guild dir. The script resolves to the
corresponding sanctum artifact dir.

### Steps

1. **Read the trial's setup-snapshot** from sanctum to find the guild
   dir, fork URL, etc.
2. **Dump the stacks DB.** Walk every table in the guild's stacks DB
   and write each as JSON to `artifacts/trial-NNN-<variant>/stacks-export/<table>.json`.
   The dump format is defined below ("Stacks export format").
3. **Capture codex fork commits.** Walk the fork's `main` branch from
   `codex.base_sha` to HEAD, extract each commit's diff and metadata,
   write to `artifacts/trial-NNN-<variant>/codex-history/`. Format
   defined below ("Codex history format").
4. **Copy session transcripts.** Pull session jsonls from
   `~/.claude/projects/<draft-dir>/<sessionId>.jsonl` into
   `artifacts/trial-NNN-<variant>/transcripts/`. The session-to-rig
   mapping comes from the stacks dump (which is captured in step 2).
5. **Write archive manifest** at `artifacts/trial-NNN-<variant>/archive-manifest.yaml`
   summarizing what was captured: counts per table, count of commits,
   count of transcripts, archive timestamp, script invocation.
6. **Print next steps.** "Archive complete. Run
   `bin/experiment-cleanup.sh <trial-slug>` to delete disposable surfaces.
   Verify the archive contents at `<sanctum-path>` before running cleanup."

The script is idempotent: re-running overwrites the prior dump (with a
warning). Cleanup refuses to run if archive-manifest is missing or stale
relative to the live state.

## Cleanup script — `experiment-cleanup.sh`

```
bin/experiment-cleanup.sh <trial-slug>
```

### Steps

1. **Verify archive completion.** Refuse to run if
   `artifacts/trial-NNN-<variant>/archive-manifest.yaml` doesn't exist
   or its timestamp is older than the guild dir's most recent
   modification (suggests work happened after archive — re-archive
   before cleanup).
2. **Delete the codex fork.** `gh repo delete <fork> --confirm`. Fail
   loud if the fork has unmerged content the script doesn't recognize
   from the archive (rare, but the safety check matters).
3. **Delete the guild dir.** `rm -rf /workspace/experiments/<trial-dir>`.
4. **Print confirmation.** "Trial <slug> cleanup complete. Sanctum
   artifacts preserved at `<path>`."

The script is **not idempotent** — re-running on a cleaned trial errors
("nothing to clean up").

## Artifact layout

```
experiments/X<NNN>-<slug>/
├── spec.md                                # the experiment's research spec
└── artifacts/
    ├── trial-001-<variant-slug>/
    │   ├── manifest.yaml                  # the canonical trial config
    │   ├── setup-snapshot.yaml            # init-time snapshot
    │   ├── archive-manifest.yaml          # archive-time summary
    │   ├── README.md                      # trial-level prose doc
    │   ├── prompts/                       # variant-specific prompts
    │   │   └── ...
    │   ├── transcripts/                   # per-session jsonls
    │   │   └── <sessionId>.jsonl
    │   ├── stacks-export/                 # JSON dump per table
    │   │   ├── writs.json
    │   │   ├── rigs.json
    │   │   ├── sessions.json
    │   │   ├── clicks.json
    │   │   └── schema-version.txt
    │   ├── codex-history/                 # per-commit diffs + meta
    │   │   ├── commits-manifest.yaml
    │   │   └── 0001-<short-sha>-<slug>.diff
    │   ├── laboratory/                    # Laboratory's observation sink
    │   │   └── <whatever Laboratory writes>
    │   └── analysis/                      # trial-specific analysis (if any)
    │       └── <date>-<slug>.md
    │
    ├── trial-002-<variant-slug>/          # parallel structure per trial
    │   └── ...
    │
    └── analysis/                          # cross-trial analysis
        └── <date>-comparison.md
```

### Notes

- **Trial dir name is `trial-NNN-<variant-slug>`.** NNN is zero-padded;
  variant slug is lowercase kebab-case.
- **`trial-NNN-<variant>/analysis/`** is for analysis specific to one
  trial; **`artifacts/analysis/`** is for cross-trial comparison.
- **`trial-NNN-<variant>/laboratory/`** is where Laboratory writes its
  observations during the trial. Path is captured in the manifest's
  `guild.laboratory_sink`.
- **Findings go in `experiments/X<NNN>-<slug>/findings.md`** at the
  experiment root, not in any trial dir. The findings doc consolidates
  across trials and answers the experiment's research question.

## Stacks export format

One JSON file per table, each containing an array of row objects.

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
- Row counts per trial are tens to hundreds — table files stay
  manageable.
- We don't need row-level git history (dumps are snapshots, not
  append-only).
- Analysis instruments load the table once and iterate.

### Carve-out for large content

If any single row carries content >50KB (e.g., a writ body that's a
50KB brief), the dump can extract it to `stacks-export/blobs/<sha>.<ext>`
and replace the inline content with a reference field
(`body_ref: "blobs/<sha>.md"`). Only do this when actually needed; the
default is inline.

### Schema versioning

`stacks-export/schema-version.txt` records the framework SHA the dump
was taken against. Future readers use this to interpret the row schema.

### Default scope

A fresh guild contains only the trial's data, so the default dump is
**every table, every row**. No scope filtering needed. The manifest's
optional `archive_extras` field lets a trial opt into additional tables
beyond the framework defaults (e.g., raw CDC event log) if the
experiment specifically needs them.

## Codex history format

```
codex-history/
├── commits-manifest.yaml
├── 0001-<short-sha>-<slug>.diff
├── 0002-<short-sha>-<slug>.diff
└── ...
```

### `commits-manifest.yaml`

```yaml
base_sha: <40-char>            # the trial's codex base
head_sha: <40-char>            # the fork's main HEAD at archive time
commits:
  - seq: 0001
    sha: <40-char>
    parent: <40-char>
    short: <8-char>
    subject: 'reckoner: sweep vision-keeper references'
    author: 'implementer'
    timestamp: '2026-...'
    rig_id: 'r-...'              # cross-ref into rigs.json
    session_id: '<sessionId>'    # cross-ref into sessions.json + transcripts
    writ_id: 'w-...'             # cross-ref into writs.json
    diff_file: '0001-<short>-<slug>.diff'
  - seq: 0002
    ...
```

### Diff files

Standard git format-patch / git format style; one file per commit. The
filename's seq prefix preserves order; the short SHA + slug aids
human navigation.

## Trial README format

Each trial dir has a `README.md` capturing the trial's narrative.

```markdown
# Trial <NNN> — <variant slug>

## What this trial tests
<one paragraph: which hypothesis or variant config; what we expect>

## Setup
- Nexus branch: <branch> @ <SHA>
- Codex fork: <URL> @ <SHA>
- Plugin deps: see `setup-snapshot.yaml`
- Variant config: <pointer to prompts/ or framework changes>

## Methodology
<what commissions were posted, in what order, what was measured>

## Results
<metrics, comparisons, surprises; reference analysis/ files>

## Verdict
<confirmed / refuted / inconclusive, with one-paragraph rationale>
```

The init script auto-fills **Setup** with resolved SHAs and paths. The
experiment author fills the rest.

## Trial discipline

- **One X### = one experiment with one research question.** Use the
  X### namespace freely. Don't overload one X### with multiple
  experiments.
- **Within one experiment, partition by trial.** Variants of the same
  hypothesis live as separate trial dirs.
- **Heuristic for trial vs. experiment:** same hypothesis → trial; new
  hypothesis → new experiment.
- **Old X### items with multiple experiments** stay as historical
  exceptions. Don't rationalize. Apply the discipline going forward.

## Naming conventions

| thing | format | example |
|---|---|---|
| Experiment slug | `X<NNN>-<lowercase-kebab>` | `X016-p3-orientation-suppression` |
| Nexus experiment branch | `experiment/<experiment-slug>` | `experiment/X016-p3-orientation-suppression` |
| Codex fork repo | `experiment-<experiment-slug>-trial-<NNN>-<variant>` | `experiment-X016-p3-orientation-suppression-trial-001-strong-prompt` |
| Trial dir slug | `<experiment-slug>-trial-<NNN>-<variant>` | (used in `/workspace/experiments/` and as the cleanup arg) |
| Trial artifact dir | `trial-<NNN>-<variant>/` | `trial-001-strong-prompt/` |

Variant slugs use lowercase kebab-case, descriptive but short.

## Worked example: X016 P3 orientation suppression

(Hypothetical — illustrates how the pieces fit together.)

### Experiment

- **Number:** X016
- **Slug:** `X016-p3-orientation-suppression`
- **Research question:** Can a fresh implementer session, given a
  hand-crafted 30K-token handoff, produce productive work in <5 turns?
- **Spec location:** `experiments/X016-p3-orientation-suppression/spec.md`

### Trials

Three prompt variants tested against the same brief (rig 1's docs sweep,
handoff at T52):

| trial | variant | what differs |
|---|---|---|
| 001 | `strong-prompt` | imperative anti-orientation directives ("Do NOT re-read X"), evidence anchors |
| 002 | `mild-prompt` | permissive framing ("X is known-good") |
| 003 | `monolithic-baseline` | no handoff; runs the brief from scratch as control |

### Per-trial flow

1. Author writes `manifest.yaml` for trial-001-strong-prompt.
2. `bin/experiment-init.sh --manifest .../trial-001-strong-prompt/manifest.yaml`
   creates the nexus branch (if not already), forks the codex, generates
   the guild, snapshots setup, stubs the README.
3. Post the brief commission via `nsg commission-post --guild
   /workspace/experiments/X016-p3-orientation-suppression-trial-001-strong-prompt
   --brief .../prompts/handoff-strong.md`.
4. Rig executes; sessions record; Laboratory writes observations to
   the trial's laboratory dir.
5. When the trial completes, `bin/experiment-archive.sh
   X016-p3-orientation-suppression-trial-001-strong-prompt` dumps stacks,
   captures codex commits, copies transcripts, writes archive manifest.
6. Author fills out the trial README with methodology + results +
   verdict.
7. `bin/experiment-cleanup.sh X016-p3-orientation-suppression-trial-001-strong-prompt`
   deletes the fork and guild dir.
8. Repeat for trials 002 and 003.

### Cross-trial analysis

`experiments/X016-p3-orientation-suppression/artifacts/analysis/2026-MM-DD-orientation-comparison.md`
runs an instrument that compares orientation-tax metrics across the
three trials' transcripts and stacks dumps; produces the answer to the
research question. Findings consolidate to
`experiments/X016-p3-orientation-suppression/findings.md`.

## Open implementation questions

These are unresolved in this draft and need addressing before the
infrastructure is built:

1. **`nsg init` invocation.** What does the current command look like?
   Does it accept a path argument for the guild dir, or does it create
   a guild in the current dir? The setup script needs the right
   incantation.
2. **Plugin pinning mechanism.** How does the framework's `package.json`
   express plugin pinning today? By workspace path, by npm version, by
   git ref? The script needs to generate the right shape.
3. **Prompts copy vs. symlink.** Does the framework re-read role
   instructions on each session spawn (allowing symlink-and-edit), or
   only at guild init (requiring copy + re-init for changes)? Affects
   how prompts variation works during a trial.
4. **Stacks dump primitive.** Does the framework provide a clean dump
   command that produces JSON-per-table, or does the archive script
   need to query the DB directly? If the latter, format-stability
   becomes a concern across framework versions.
5. **Laboratory sink config.** How is the Laboratory's output
   destination configured today — guild.json field, env var, plugin
   prop? The init script needs to wire it deliberately.
6. **Session transcript location.** The transcripts live in
   `~/.claude/projects/<draft-dir>/<sessionId>.jsonl` for production
   today. For experimental guilds with non-default draft locations, do
   the transcripts still go there? Affects the archive script's
   transcript-copy step.
7. **`gh` org permissions.** Does the experimental setup user have
   permissions to fork into the upstream codex's org and to create/delete
   forks programmatically? If not, fork-creation needs human-in-loop.
8. **Convention for `archive_extras` table names.** Should the manifest
   reference table names directly, or is there a higher-level set of
   "raw event log," "queue snapshots," etc. that the script knows how
   to extract?

These are pragmatic questions about how the framework's existing
primitives map to what the script needs to do. They're each
straightforward once we look at the framework code; surfacing them
now so the next pass can resolve them.

## Future considerations

- **Multi-fork experiments.** The current spec defaults to one fork per
  trial. Some experiments may need multiple parallel forks (e.g.,
  comparing prompt variants concurrently to save calendar time). Design
  is compatible with this — just init multiple manifests.
- **Long-lived experiments.** Some experiments may run trials over
  weeks (e.g., observing P3 behavior across many real commissions). The
  cleanup discipline needs adjusting for these — possibly an interim
  "snapshot" step that captures state without deleting the fork.
- **Cross-experiment comparison.** When two experiments answer related
  questions (e.g., X016 P3 orientation, X017 P3 trigger heuristics),
  cross-experiment analysis lives in `experiments/analysis/` (or wherever
  the sanctum convention places it). Out of scope for this spec.
