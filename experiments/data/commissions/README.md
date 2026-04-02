# Commission Data

Per-commission artifacts, organized by session ID (e.g. `ses-2149b518/`).

## Standard Files

Every commission folder contains these baseline artifacts:

| File | Description |
|------|-------------|
| `prompt.md` | The dispatch prompt sent to the anima — the full instruction set for the commission. Also used as the spec file for quality scoring. |
| `spec.md` | Snapshot of the architecture spec at dispatch time. Provides context for what the anima was building against. |
| `session.json` | Session record from the Animator: timing, cost, token usage, provider metadata. |
| `review.md` | Patron review and scorer summary — spec assessment, review notes, and quality scorer observations. |
| `quality-blind.yaml` | Quality scorer output in blind mode (code-only, no spec comparison). |
| `quality-aware.yaml` | Quality scorer output in aware mode (spec-aware, includes requirement coverage). |

## Notes

- The `prompt.md` is the dispatch prompt, not the architecture spec. The quality scorer uses this as its spec reference because it captures what the anima was *actually told to do*.
- Summary fields (outcome, complexity, spec quality) live in the commission log at `experiments/ethnography/commission-log.yaml`, not here. This directory holds the full artifacts; the log holds patron-subjective judgments.
- Individual experiments may add additional files to commission folders (e.g. specialized instrument outputs). The files listed above are the baseline set.
