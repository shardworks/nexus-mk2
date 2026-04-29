# Vision authoring on disk: `nsg vision apply` CLI

## Intent

Add a file-based authoring surface for cartograph visions. The patron writes vision prose in `<GUILD>/vision/<slug>/vision.md` with a `vision-metadata.yml` sidecar, and runs `nsg vision apply <slug>` to snapshot the vision into the cartograph as a vision writ + VisionDoc. The CLI is the single code path for both first-time bootstrap and Nth re-import, identifying the bound writ via a `visionId` field written into the sidecar after first apply.

This commission delivers Phase 1 of the surveying-cascade architecture (see `docs/architecture/surveying-cascade.md`). It ships standalone — there is no surveyor-apparatus consuming the writes yet; the `ext['surveyor']` priority hints written by this commission are inert until a future commission lands the substrate.

## Motivation

Today, patrons author cartograph visions directly via `nsg vision create --title --body`, which works for one-shot creation but is awkward for prose-heavy long-lived visions and offers no way to re-import an edited vision without throwing away identity. The on-disk authoring flow gives patrons a normal file editor experience with persistent identity, the same flow for first/Nth import, and a natural place to attach priority hints.

## Non-negotiable decisions

### Sidecar carries the durable visionId binding

After first apply, `vision-metadata.yml` carries a `visionId` field that binds the file tree to its cartograph writ. The slug is a directory affordance only; identity lives in the sidecar's `visionId`. The slug can be renamed; the binding survives. Source: c-mojeikyh.

### Single code path for first-import and Nth-re-import

`nsg vision apply <slug>` resolves the bound writ via `visionId` if present (re-import) or creates a new vision writ if absent (first import); the rest of the work is identical: copy `vision.md` content into `writ.body`, sync stage/codex from the sidecar, write priority hints into `ext['surveyor']`, and on first run write the new id back into the sidecar.

### Single-event-per-apply guarantee

A single `nsg vision apply` MUST produce a single Stacks CDC event on the cartograph book per logical operation, not separate create+transition events. This is a correctness requirement for downstream consumers that observe the cartograph book and react to vision changes. Two implementation paths satisfy this:

- Extend `cartograph.createVision` to accept an initial stage parameter so creation lands at the desired stage in one transaction.
- Have the apply CLI wrap `createVision` + `transitionVision` in a single Stacks transaction.

Either is acceptable. The implementer chooses. Source: surveying-cascade arch doc §3.6.

### Priority hints flow through `ext['surveyor']`

The CLI writes a `SurveyorExt` payload to the vision writ's `ext['surveyor']` slot, sourced from CLI flags merged over sidecar fields. The shape:

```typescript
interface SurveyorExt {
  severity?: 'moderate' | 'serious' | 'critical';
  deadline?: string;       // ISO date
  decay?: boolean;
  complexity?: 'bounded' | 'unbounded';
}
```

CLI flags: `--severity`, `--deadline`, `--decay`. Sidecar fields with the same names. CLI flags override sidecar values when both are present. Source: arch doc §3.10.

The `ext['surveyor']` slot will be owned by the future surveyor-apparatus plugin (a separate commission). For v0 this commission writes to the slot before its owner exists; this is fine — `clerk.setWritExt(slotKey, ...)` is plugin-keyed and accepts any plugin id at write time. The future substrate will read these values when it lands.

### Stale-binding handling

If the sidecar references a `visionId` that no longer exists or was cancelled: warn at scan time; error on next apply attempt. Patron must transition the writ to sunset/cancelled explicitly before re-applying with a fresh sidecar.

### Data flow is one-way: file → writ

The writ is a snapshot of patron intent at apply time. The file is the editable source. Edits to the writ via `nsg vision patch` or `transition` do NOT propagate back to the file. Editing the file and re-applying is the canonical update path.

## Out of scope

- The surveyor-apparatus substrate that reads `ext['surveyor']` and emits survey petitions. Future commission.
- Any auto-trigger of apply (fs-watcher, git-hook). Patron runs apply explicitly.
- Drift detection between the file and the writ. Future work.
- Vision walkthrough or completion CLI. Future commissions.
- Deletion of disk vision files. Out of scope; patron handles via filesystem.

## Behavioral cases

- First apply creates a new vision writ; sidecar gains `visionId`.
- Nth apply with same sidecar updates `writ.body` and stage/codex; sidecar unchanged.
- Apply with `--severity` flag overrides sidecar severity.
- Apply with no flags uses sidecar values, falls back to substrate defaults where sidecar is silent.
- Apply where the sidecar's `visionId` references a missing or terminal-cancelled writ errors out cleanly without partial writes.
- Apply produces exactly one Stacks CDC event on the cartograph book per logical operation.

## References

- Source clicks: c-mojeikyh (vision authoring on disk decision); parent click c-moji0bdf (Commission A).
- Arch doc: `docs/architecture/surveying-cascade.md` (sections 3.1, 3.6, 3.10).