# The Laboratory — Apparatus Spec

An observational apparatus that watches guild state changes via Stacks CDC and writes experiment data to the sanctum. Purely passive — it reads and records but never modifies guild state.

## Purpose

Automate the bookkeeping that currently happens manually: timestamping commission lifecycle events, recording session outcomes, maintaining the commission log, and triggering quality assessments. The Laboratory is a research instrument, not a production concern — it lives in the sanctum, not in the framework.

## Configuration

In `guild.json`, under the `laboratory` key:

```json
{
  "laboratory": {
    "sanctumHome": "/workspace/nexus-mk2",
    "commissionsDataDir": "experiments/data/commissions",
    "commissionLogPath": "experiments/data/commission-log.yaml"
  }
}
```

If `sanctumHome` is provided, the other two paths default relative to it:
- `commissionsDataDir` defaults to `experiments/data/commissions`
- `commissionLogPath` defaults to `experiments/data/commission-log.yaml`

If `sanctumHome` is not provided, the other paths must be absolute.

## CDC Watchers

The Laboratory registers Phase 2 (notification, `failOnError: false`) CDC handlers. Phase 2 runs after the transaction commits, so Laboratory failures can never interfere with guild operations.

### 1. Writs book — `clerk` owner, `writs` book

Registered as: `stacks.watch('clerk', 'writs', handler, { failOnError: false })`

| Change | Action |
|--------|--------|
| `create` (new writ) | Create commission data directory (`<commissionsDataDir>/<writ-id>/`). Append skeleton entry to commission log (id, title, codex — judgment fields as `null`). Write initial `timeline.yaml`. |
| `update` → status becomes `active` | Record `activated_at` timestamp in `timeline.yaml`. |
| `update` → status becomes `completed` | Record `completed_at` timestamp. Trigger quality assessment (see below). |
| `update` → status becomes `failed` | Record `failed_at` timestamp. Trigger quality assessment. |
| `update` → status becomes `cancelled` | Record `cancelled_at` timestamp. |

### 2. Sessions book — `animator` owner, `sessions` book

Registered as: `stacks.watch('animator', 'sessions', handler, { failOnError: false })`

| Change | Action |
|--------|--------|
| `create` (new session) | If the session is writ-bound, record session start in `<commissionsDataDir>/<writ-id>/sessions/<session-id>.yaml`. |
| `update` → session ended | Record session end, duration, outcome in the session file. |

## Quality Assessment Trigger

When a writ reaches a terminal state (`completed` or `failed`), the Laboratory shells out to the existing quality review script:

```typescript
import { execFile } from 'node:child_process';

const reviewScript = path.join(config.sanctumHome, 'bin/quality-review-full.sh');

execFile(reviewScript, [
  '--commission', writ.id,
  '--repo', resolveRepo(writ.codex),
  '--spec-file', resolveSpecPath(writ),
  '--commit', writ.resolution?.commit,
  '--base-commit', writ.resolution?.baseCommit,
], { cwd: config.sanctumHome });
```

This is fire-and-forget — the review takes minutes (6 parallel API calls), and CDC handlers should not block that long. The review script writes its own artifacts to the commission data directory; the Laboratory does not process the output.

### Spec file resolution

The quality review requires a `--spec-file`. The Laboratory resolves this from the writ's body or a convention-based path (e.g. `<commissionsDataDir>/<writ-id>/prompt.md`). If no spec file is found, the review runs in blind mode only (omits `--spec-file` and `--mode aware`).

### Repo resolution

The Laboratory resolves the target repo from the writ's `codex` field and guild configuration. The codex-to-repo mapping comes from the Scriptorium's codex config (codex name → repo path).

## Output

### Commission data directory

```
experiments/data/commissions/<writ-id>/
  timeline.yaml              # Lifecycle timestamps (created, activated, completed/failed/cancelled)
  sessions/                  # Per-session records
    <session-id>.yaml        # Start, end, duration, outcome
  quality-blind.yaml         # Written by quality-review script, not Laboratory
  quality-aware.yaml         # Written by quality-review script, not Laboratory
```

### Commission log

Appends entries to the existing `commission-log.yaml`. The Laboratory fills only observable fields:

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

YAML handling: hand-append formatted YAML strings. No library for writing — preserves existing comments and whitespace. Consider pulling in a YAML library for validation-only (parse-and-check after append) to catch formatting errors early.

### Auto-commit

After writing to the sanctum, the Laboratory auto-commits changes to the sanctum git repo. Commit message format:

```
laboratory: record <event> for <writ-id>
```

Commits are atomic per CDC event — one event, one commit. If the commit fails (e.g. merge conflict), log the error but don't retry or throw.

## What it does NOT do

- Modify writs, sessions, or any guild state
- Dispatch work or trigger further guild actions
- Make quality judgments — it triggers the scorer but doesn't interpret results
- Replace human review — it captures the *when* and triggers the *assessment*, but the patron still provides the *judgment*

## Dependencies

- `@shardworks/nexus-core` — plugin interface, guild()
- `@shardworks/stacks-apparatus` — CDC registration (watch API)

## Package

```
nexus-mk2/packages/laboratory/
  package.json
  tsconfig.json
  src/
    index.ts              # Plugin definition + default export
    laboratory.ts         # Core logic: CDC handlers, file writing, git commit
    types.ts              # Config types, timeline/session schemas
    quality-trigger.ts    # Shell-out to quality-review-full.sh
    yaml-writer.ts        # Hand-formatted YAML append utilities
```

## Open Questions

1. **Writ body as spec** — for quality review, where does the spec file come from? Is the writ body sufficient, or do we need the original prompt file? Current `inscribe.sh` writes a `prompt.md` to the commission data dir — should we rely on that convention?
2. **Codex-to-repo mapping** — how does the Laboratory resolve a codex name to a filesystem repo path? Read from Scriptorium config? Hardcode for now?
3. **Session-writ binding** — how does the Animator's session record reference its writ? Need to confirm the field name (e.g. `writId`, `writ`, `boundWrit`).
