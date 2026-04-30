# Commission Data (frozen)

Per-commission artifact directories from the X013 (Commission Outcomes) era. Folder names are writ IDs (`w-*`) from the Clerk; pre-Clerk commissions used session IDs (`ses-*`) or ad-hoc labels.

**This tree is no longer being populated.** The Laboratory plugin that mirrored writs and sessions into this directory was retired 2026-04-30 (see [`packages/laboratory/README.md`](../../../packages/laboratory/README.md)). The 22 surviving directories are the ones that contained substantive patron-written `review.md` notes; 1224 directories with only auto-generated content (commission body, template review, session telemetry) were deleted because all their data is reproducible from the guild books.

## Where to find data going forward

| Signal | Source |
|---|---|
| Writ body and status | `clerk/writs` — `nsg writ show <id>` |
| Writ relationships | `clerk/links` — `nsg writ` link tools |
| Session telemetry (cost, tokens, duration, anima, engine) | `animator/sessions` — `nsg session show <id>` |
| Engine→session linkage within a rig | `spider/rigs` — `nsg rig for-writ <id>` |

## What's in the surviving directories

Each preserved folder contains some subset of:

- `commission.md` (or legacy `prompt.md` / `spec.md`) — the writ body as dispatched.
- `review.md` — patron review notes (this is why the folder was kept).
- `dispatch.log` — timestamped dispatch lifecycle log from `inscribe.sh`.
- `sessions/*.yaml` — frozen session telemetry snapshots from the Laboratory era.
- `instruments/<name>/result.yaml` and `instruments/<name>/context/` — frozen instrument outputs (spec-blind / spec-aware quality scorers, codebase-integration scorer) where they were run.
- `quality-blind.yaml` / `quality-aware.yaml` / `quality-context/` — legacy pre-instruments-directory layout for some early commissions.

These are historical artifacts. The instrument runners that produced the `instruments/` outputs (`bin/instrument-review.sh` and friends) still exist as scripts but are no longer auto-triggered by the Laboratory. New commissions do not get directories here.

## Frozen commission-log baseline

The pruned commission log (150 patron-touched entries) lives in the experiments that reference it, not in this directory:

- [`experiments/X013-commission-outcomes/artifacts/2026-04-30-commission-log-frozen-baseline.yaml`](../../X013-commission-outcomes/artifacts/2026-04-30-commission-log-frozen-baseline.yaml)
- [`experiments/X008-patrons-hands/artifacts/2026-04-30-commission-log-frozen-baseline.yaml`](../../X008-patrons-hands/artifacts/2026-04-30-commission-log-frozen-baseline.yaml)
