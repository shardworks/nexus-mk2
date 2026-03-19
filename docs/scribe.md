# Scribe: Invocation Model

## What Triggers Scribe

Scribe is not autonomous. It does not watch for new transcripts or run on a schedule. It is invoked explicitly, either by a human or by another agent.

## Transcript Lifecycle

Transcripts and session docs live in a separate repository (`shardworks/nexus-mk2-notes`), not in the main project repo. This keeps constantly-changing session artifacts from cluttering the workspace and confusing agents.

### Capture

Two hooks archive transcripts automatically:

- **`on_stop.sh`** — Copies the session transcript to `nexus-mk2-notes/transcripts/pending/<session-id>.jsonl` each time Claude finishes responding.
- **`on_pre_compact.sh`** — Saves a pre-compaction snapshot to `nexus-mk2-notes/transcripts/pending/<session-id>.precompact.<timestamp>.jsonl` before context compaction occurs.

Both hooks only fire for interactive agent types (`main`, `coco`).

### Processing

**Single session:**

```bash
./bin/scribe.sh <transcript.jsonl> [<precompact.jsonl> ...]
```

Validates that all provided files exist, then invokes the Scribe agent with the file paths.

**Batch (all pending):**

```bash
./bin/scribe-all.sh
```

Finds all primary transcripts in `nexus-mk2-notes/transcripts/pending/` (skipping `.precompact.` files), groups each with its associated precompact snapshots, and runs `scribe.sh` for each. On success, moves processed transcripts to `nexus-mk2-notes/transcripts/archived/` and commits the move to the notes repo.

### Output

Scribe produces session docs at:

```
nexus-mk2-notes/sessions/<yyyy-mm>/<dd>/<slug>.md
```

## The Full Pipeline

```
Session runs
  └── on_stop.sh fires
        └── transcript copied to nexus-mk2-notes/transcripts/pending/<session-id>.jsonl
  └── on_pre_compact.sh fires (if compaction occurs)
        └── snapshot saved to nexus-mk2-notes/transcripts/pending/<session-id>.precompact.<ts>.jsonl

Scribe invoked (manually or via scribe-all.sh)
  └── reads transcript(s) from nexus-mk2-notes/transcripts/pending/
  └── produces nexus-mk2-notes/sessions/<yyyy-mm>/<dd>/<slug>.md
  └── commits session doc

scribe-all.sh (batch mode only)
  └── moves processed transcripts to nexus-mk2-notes/transcripts/archived/
  └── commits and pushes archived transcript moves

Herald runs (on-demand or on schedule)
  └── reads session docs
  └── produces blog post / status update / deep-dive
```

## Notes

- **Stop fires on every response**, not just at session end. The hook overwrites the archive on each fire so you always have the latest state. This is safe but means the transcript is a rolling snapshot until the session truly ends.
- **Scribe is idempotent.** Re-running it on the same transcript overwrites the existing session doc. Safe to run multiple times.
- **Precompact snapshots preserve detail.** Auto-compaction summarizes earlier turns, losing detail. The pre-compact hook captures the full transcript before this happens. Scribe uses these for the earlier portion of the session.
