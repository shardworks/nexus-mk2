# The Laboratory (retired)

Retired 2026-04-30. The Laboratory was an observational apparatus that watched Stacks CDC events on the Clerk's writs and links books and the Animator's sessions book, mirroring observational data into the sanctum at `experiments/data/commission-log.yaml` and `experiments/data/commissions/<id>/`. Its purpose was to feed the X013 (Commission Outcomes) research instrument with patron-subjective judgments alongside auto-collected telemetry.

## Why it was retired

Two pieces of the surrounding system shifted in ways that hollowed out the instrument:

- **Spec generation became automated.** The Astrolabe planning pipeline now produces every commission's spec from a brief. Spec quality no longer varies along a patron-craft axis, so `spec_quality_pre/post` ratings are constant by construction.
- **Structured patron review was retired.** The patron stopped routinely filling in `complexity`, `outcome`, `failure_mode`, and `reviewed_at`. Per-commission review became ad-hoc as the planning workshop and static implement→review→revise rig pipeline absorbed the quality-assurance role.

Without those signals, what remained in the commission log and per-commission directories was strictly mechanical — auto-set outcome (success/abandoned), the writ body as `commission.md`, and session telemetry — all of which is fully reproducible from the guild's own books.

X013 was moved to Superseded; the Laboratory's three CDC watchers and helper code were deleted; this package was reduced to a no-op stub so existing guild.json registrations stay loadable.

## Where the data lives now

| Signal | Source |
|---|---|
| Writ status and lifecycle | `clerk/writs` book — query via `nsg writ show` / `nsg writ list` / `nsg writ tree` |
| Writ relationships (`fixes`, `depends-on`, etc.) | `clerk/links` book — query via `nsg writ` link tools |
| Session telemetry (cost, tokens, duration, exit, output) | `animator/sessions` book — query via `nsg session show` / `nsg session list` |
| Anima role and engine id per session | `animator/sessions` book — `metadata.role`, `metadata.engineId` |
| Engine→session linkage within a rig | `spider/rigs` book — query via `nsg rig for-writ` / `nsg rig show` |

## Historical baseline

The pruned commission log (150 patron-touched entries spanning 2026-03-25 → 2026-04-29) is preserved as an artifact in the experiments that reference it:

- `experiments/X013-commission-outcomes/artifacts/2026-04-30-commission-log-frozen-baseline.yaml` — owned by the experiment that produced it.
- `experiments/X008-patrons-hands/artifacts/2026-04-30-commission-log-frozen-baseline.yaml` — referenced by §Infrastructure Milestones for the H5 review-rate-cliff evidence.

The 22 commission directories (out of 1246) that contained substantive patron-written `review.md` notes remain at `experiments/data/commissions/<id>/`. The other 1224 — pure auto-generated content — were deleted.

## Patron-side cleanup (non-urgent)

The plugin is currently a no-op. Once you are ready to fully retire the package:

1. Remove the `"laboratory"` entry from `/workspace/vibers/guild.json` plugins list.
2. Remove `@shardworks/laboratory-apparatus` from `/workspace/vibers/package.json` dependencies.
3. Restart the guild.
4. Delete `packages/laboratory/` from the sanctum.
