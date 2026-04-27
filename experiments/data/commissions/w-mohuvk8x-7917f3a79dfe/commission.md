# Clerk: add WritDoc.ext field and setWritExt API

## Intent

Add a new plugin-keyed metadata extension slot to `WritDoc`,
parallel to the existing `status` slot but with distinct semantics
(metadata-shape data, not runtime observation). This is the
foundational change required by the Reckoner contract
(`docs/architecture/petitioner-registration.md`) and is broadly
useful as a writ-attached metadata mechanism for any plugin.

## Motivation

The Reckoner contract requires petitioners to attach metadata-shape
data to writs (source identifier, priority dimensions, complexity
estimate, opaque payload, labels). The existing `status` slot is
documented as "post-hoc plugin observation" — wrong semantic for
metadata-shape data set at creation time. Forcing the Reckoner to
abuse `status` would conflate metadata and status, the exact failure
mode K8s separated metadata from status to avoid.

A first-class `petitionId` field on `WritDoc` was rejected as a
layering violation (Clerk would import a Reckoner-specific concept).
A generic plugin-keyed `ext` slot is layering-clean and benefits any
plugin that wants metadata-shape attachment.

## Non-negotiable decisions

### Generic plugin-keyed slot, mirroring `status`

The new field is a plugin-keyed map (`Record<PluginId, unknown>`),
identical structural shape to the existing `status` field. Each
plugin owns its own sub-slot keyed by plugin id; convention is the
same (plugin X writes only to `ext[X]`).

### Distinct write API parallel to setWritStatus

Add a `setWritExt(writId, pluginId, value)` method on `ClerkApi`,
parallel in behavior to the existing `setWritStatus`. Semantics:
transactional read-modify-write on the sub-slot keyed by `pluginId`
to preserve sibling sub-slots under concurrent writers.

### Optional, opt-in, survives terminals

`ext` is optional on `WritDoc` (absent by default — only set when a
plugin writes to its sub-slot). It survives terminal phase
transitions (same as `status`). Plugin-keyed; no global schema; each
plugin owns its sub-slot's shape.

### Writes only via setWritExt

The `transition()` and generic `put()` / `patch()` paths on the
writs book do NOT support ext-slot writes — exactly as the existing
`status` slot is handled. This prevents accidental wholesale-replace
of the slot under concurrent writers.

### Documentation distinction: metadata vs status

The Clerk doc should note the semantic distinction between `ext` and
`status`:

- `status` — post-hoc plugin observation (Spider's dispatch state,
  Sentinel's cost notes).
- `ext` — plugin-keyed metadata-shape data (provenance, cross-
  references, classification tags, configuration extensions).

Both have identical mechanism; the distinction is in canonical use.

## Out of scope

- **Petitioner-specific schema.** The Reckoner contract describes
  `ext['reckoner']` shape; that's the Reckoner's concern, not
  Clerk's. Clerk treats every plugin sub-slot as opaque `unknown`.
- **Validation of sub-slot contents.** Clerk does not enforce shape
  on per-plugin sub-slots; each plugin owns its own validation.
- **Migration of existing writs.** No existing writs need changes;
  the field is optional and absent by default.

## Behavioral cases

- A plugin writes to its sub-slot (e.g., `setWritExt(w, 'reckoner',
  {source: 'vision-keeper.snapshot', priority: {...}})`); subsequent
  reads of the writ surface that data via `writ.ext.reckoner`.
- Two plugins writing to different sub-slots concurrently both
  succeed; sibling sub-slots are preserved.
- A plugin attempting to write to another plugin's sub-slot via
  `setWritExt(w, 'other-plugin', ...)` succeeds mechanically (the
  framework convention is plugin-honor, not enforcement) but is a
  convention violation; same enforcement model as `status`.
- Transitioning a writ to a terminal state preserves `ext` (matches
  `status` behavior).
- A writ with no sub-slot writes has `ext === undefined` on read
  (not an empty object).

## References

The Reckoner contract: `docs/architecture/petitioner-registration.md`
notes the required Clerk schema addition in §13.