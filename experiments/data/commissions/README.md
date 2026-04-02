# Commission Data

Per-commission artifacts, organized by writ ID (e.g. `w-abc123/`). Pre-Clerk commissions used session IDs (`ses-*`) or ad-hoc labels as folder names.

## Standard Files

| File | Description |
|------|-------------|
| `commission.md` | The writ body — what the patron commissioned. This is the primary record of what was asked. |
| `session.json` | Session record from the Animator: timing, cost, token usage, provider metadata. Pulled from guild stacks as a durable sanctum-side copy. |
| `review.md` | Patron review and scorer summary — spec assessment, review notes, quality scorer observations. |
| `quality-blind.yaml` | Quality scorer output in blind mode (code-only, no spec comparison). |
| `quality-aware.yaml` | Quality scorer output in aware mode (spec-aware, includes requirement coverage). |
| `scoring-context/` | Everything the quality scorer saw: diff, changed files, context files, referenced files. Makes scoring runs reproducible and reviewable. |

## Notes

- Summary fields (outcome, complexity, spec quality) live in the commission log at `experiments/ethnography/commission-log.yaml`. This directory holds the full artifacts; the log holds patron-subjective judgments.
- Individual experiments may add additional files to commission folders (e.g. specialized instrument outputs). The files listed above are the baseline set.
- Legacy folders may contain `prompt.md` and `spec.md` from the pre-Clerk workflow. These are superseded by `commission.md` and `scoring-context/` respectively.
