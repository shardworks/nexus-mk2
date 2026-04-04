# The Laboratory

Observational apparatus for experiment data collection. Watches guild state changes via Stacks CDC and writes experiment data to the sanctum. Purely passive — reads and records but never modifies guild state.

## How It Works

The Laboratory is a Nexus apparatus plugin that registers [Change Data Capture](https://en.wikipedia.org/wiki/Change_data_capture) watchers on the guild's persistence layer (The Stacks). When writs or sessions change, the Laboratory writes observational data to the sanctum filesystem and auto-commits it.

### Startup

When the guild boots, Arbor starts the Laboratory after The Stacks (its only dependency). The Laboratory:

1. Reads its config from `guild.json` under the `"laboratory"` key
2. Resolves filesystem paths (commissionsDataDir and commissionLogPath default relative to sanctumHome)
3. Gets the Stacks API via `guild().apparatus('stacks')`
4. Registers two CDC watchers, both Phase 2 (`failOnError: false`) — meaning they run *after* the triggering transaction commits and can never block or interfere with guild operations

### Watcher 1: Writs (`clerk` → `writs` book)

| CDC Event | Action |
|-----------|--------|
| `create` | Creates `<commissionsDataDir>/<writ-id>/` directory. Writes `commission.md` (the writ body/prompt). Writes a `review.md` template for the patron. Appends a skeleton entry to the commission log with judgment fields as `null`. Auto-commits. |
| `update` → `completed` or `failed` | Fires `bin/instrument-review.sh` as a detached child process (fire-and-forget). The script runs the instrument suite (quality scorers + integration scorer) and writes results to `instruments/` subdirectories. |
| `update` → `active` or `cancelled` | No action — these transitions are observable in the Stacks if needed later. |

### Watcher 2: Writ Links (`clerk` → `links` book)

| CDC Event | Action |
|-----------|--------|
| `create` where `type === "fixes"` | Sets `revision_required: true` on the target writ's commission log entry. Auto-commits. |
| `create` (other types) | No action. |
| `update` / `delete` | No action. |

### Watcher 3: Sessions (`animator` → `sessions` book)

Only acts on writ-bound sessions (those with `metadata.writId`). Unbound sessions (e.g. `nsg consult`) are silently skipped.

| CDC Event | Action |
|-----------|--------|
| `create` | Writes `<commissionsDataDir>/<writ-id>/sessions/<session-id>.yaml` with initial data (id, startedAt, status, provider). Auto-commits. |
| `update` where status changed (running → terminal) | Overwrites the session YAML with full data: endedAt, durationMs, exitCode, costUsd, tokenUsage. Auto-commits. |

### Commission Data Directory

The Laboratory populates commission data directories with the same structure `inscribe.sh` creates:

```
experiments/data/commissions/<writ-id>/
  commission.md              # The writ body (spec/prompt) — written by Laboratory
  review.md                  # Patron review template — written by Laboratory
  sessions/                  # Per-session records — written by Laboratory
    <session-id>.yaml        #   Start, end, duration, cost, tokens
  instruments/               # Written by instrument-review.sh (triggered by Laboratory)
    spec-blind-quality-scorer/
      result.yaml
      context/
    spec-aware-quality-scorer/
      result.yaml
      context/
    codebase-integration-scorer/
      result.yaml
      context/
```

### Commission Log

The Laboratory appends skeleton entries to `experiments/data/commission-log.yaml`. Only observable fields are filled in:

```yaml
- id: w-abc123
  title: "Whatever the writ title is"
  codex: nexus
  complexity: null           # Patron fills in
  spec_quality_pre: null     # Patron fills in
  outcome: null              # Patron fills in
  revision_required: null    # Patron fills in
  spec_quality_post: null    # Patron fills in
  failure_mode: null         # Patron fills in
```

The log is hand-appended (no YAML library) to preserve existing comments and formatting.

### Auto-Commit

After each write, the Laboratory commits changes to the sanctum git repo. Commits use the format:

```
laboratory: record <event> for <writ-id>
```

Commits are best-effort — if a commit fails (merge conflict, dirty index), the error is swallowed silently.

### Quality Assessment

When a writ reaches `completed` or `failed`, the Laboratory shells out to `bin/instrument-review.sh`. This is fire-and-forget — the review runs the full instrument suite (spec-blind quality scorer, spec-aware quality scorer, and codebase integration scorer) in sequence. Each instrument runs multiple parallel LLM calls internally. The Laboratory does not wait for or process the results.

The script resolves the codex repo via the guild's bare clone at `.nexus/codexes/<codex>.git` and uses `commission.md` as the spec file for spec-aware and integration scoring.

## Configuration

In `guild.json`:

```json
{
  "laboratory": {
    "sanctumHome": "/workspace/nexus-mk2"
  }
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `sanctumHome` | *(required)* | Absolute path to the sanctum root directory |
| `commissionsDataDir` | `experiments/data/commissions` (relative to sanctumHome) | Where commission data directories are created |
| `commissionLogPath` | `experiments/data/commission-log.yaml` (relative to sanctumHome) | Path to the commission log YAML file |

## Installation

Add the Laboratory as a dependency in the guild's `package.json`:

```json
{
  "dependencies": {
    "@shardworks/laboratory-apparatus": "file:../../nexus-mk2/packages/laboratory"
  }
}
```

Add `"laboratory"` to the plugins list in `guild.json` and provide the config block.

## Dependencies

- `@shardworks/nexus-core` — Plugin interface, `guild()` singleton, `StartupContext`
- `@shardworks/stacks-apparatus` — `StacksApi`, `ChangeEvent`, `BookEntry` types

## Source Layout

```
src/
  index.ts              Plugin definition — { apparatus: { requires: ['stacks'], start } }
  types.ts              Config types, document shape mirrors (WritLike, SessionLike),
                        re-exports from @shardworks/stacks-apparatus
  laboratory.ts         Config resolution, CDC handler registration, event routing
  yaml-writer.ts        Commission log append, commission.md, review.md template,
                        session record YAML
  quality-trigger.ts    Shell out to instrument-review.sh (fire-and-forget)
  git.ts                Best-effort auto-commit to sanctum repo
  laboratory.test.ts    Config resolution tests
  yaml-writer.test.ts   Commission log, commission.md, review.md, session record tests
```
