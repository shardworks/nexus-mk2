# Commission Data

Per-commission artifacts, organized by writ ID (e.g. `w-abc123/`). Pre-Clerk commissions used session IDs (`ses-*`) or ad-hoc labels as folder names.

## Two-Tier Data Architecture

Commission data is split across two tiers:

1. **Commission log** (`experiments/data/commission-log.yaml`) — lean, human-navigable. Contains patron-subjective judgments: complexity, spec quality (pre/post), outcome, revision required, failure mode, and notes. Designed to be read end-to-end by a human or agent.

2. **Per-commission artifacts** (this directory) — the full evidentiary record. Contains objective/automated data: session telemetry, quality scorer output, commission body, dispatch log, review notes.

The `id` field in the commission log corresponds to the folder name here. This is the join key for assembling a unified analytical dataset.

### What lives where

| Data | Location | Source |
|------|----------|--------|
| Patron complexity estimate | Commission log | Manual, at dispatch |
| Spec quality (pre/post) | Commission log | Manual |
| Outcome, revision required | Commission log | Manual, at review |
| Failure mode | Commission log | Manual, at review |
| Session cost, duration, tokens | `sessions/*.yaml` | The Laboratory (auto) |
| Code quality scores (blind) | `quality-blind.yaml` | Quality scorer (auto) |
| Code quality scores (aware) | `quality-aware.yaml` | Quality scorer (auto) |
| Commission body text | `commission.md` | `inscribe.sh` (auto) |
| Dispatch lifecycle log | `dispatch.log` | `inscribe.sh` (auto) |
| Patron review notes | `review.md` | Manual |
| Scoring input context | `quality-context/` | Quality scorer (auto) |

## Standard Files

| File | Description |
|------|-------------|
| `commission.md` | The writ body — what the patron commissioned. This is the primary record of what was asked. |
| `sessions/` | Session records from The Laboratory (YAML): timing, cost, token usage, provider metadata. One file per session attempt. |
| `review.md` | Patron review and scorer summary — spec assessment, review notes, quality scorer observations. |
| `quality-blind.yaml` | Quality scorer output in blind mode (code-only, no spec comparison). |
| `quality-aware.yaml` | Quality scorer output in aware mode (spec-aware, includes requirement coverage). |
| `quality-context/` | Everything the quality scorer saw: diff, changed files, context files, referenced files. Makes scoring runs reproducible and reviewable. |
| `dispatch.log` | Timestamped log of the inscribe.sh dispatch cycle: post, dispatch, capture, scoring. |

## Notes

- Individual experiments may add additional files to commission folders (e.g. specialized instrument outputs). The files listed above are the baseline set.
- Legacy folders may contain `prompt.md`, `spec.md`, and `session.json` from the pre-Clerk workflow. These are superseded by `commission.md`, `quality-context/`, and `sessions/` respectively.
