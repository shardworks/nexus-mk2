# Reckoner apparatus: skeleton, registry, configuration, helper APIs, priority types

## Intent

Build the Reckoner apparatus's contract surface: kit-static
petitioner registry, `guild.json` configuration parsing, priority
dimension types with default-filling, and the
`reckoner.petition()` / `reckoner.withdraw()` helper APIs. This is
the foundation that lets petitioners declare themselves and emit
properly-formed held writs through an ergonomic API.

The CDC handler that watches held writs and decides their fate is a
separate commission that follows this one.

## Motivation

The Reckoner contract
(`docs/architecture/petitioner-registration.md`) specifies a
kit-static registry where petitioners declare their sources, plus
helper APIs for posting Reckoner-gated writs in the right shape.
This commission lays down all of that surface so the CDC-handler
commission has the registry, types, and helpers it needs to plug
into.

Note: a Reckoner apparatus already exists at
`packages/plugins/sentinel-apparatus/` (it was renamed from the
queue-observer pulse-emitter to free the name). This commission may
either install into that package's renamed location or stand up a
fresh Reckoner package — the implementer's call. Either way, the
output package id is `reckoner` (the apparatus name plugins will
require).

## Non-negotiable decisions

### Kit-static petitioner registry

Petitioners declare via a `petitioners` kit contribution type:

```typescript
petitioners: [{ source: string, description: string }]
```

The Reckoner consumes the contribution at boot, builds the registry,
and seals it at `phase:started`. Per-plugin-load-cycle framing
(today equivalent to global seal). Duplicate-source contributions
are a hard startup error with both contributing plugin ids named —
matching the framework-wide collision policy applied to writ-types,
rig-template-mappings, and engine designs.

### Source-id grammar

Source ids must be `{pluginId}.{kebab-suffix}` — same shape as
Lattice trigger-types and Clerk link-kinds. Malformed ids hard-fail
at startup. The `{pluginId}.` prefix is validated against the
contributing plugin id where derivable.

### Configuration via `guild.json`

The Reckoner reads its config from `guild.json` under the `reckoner`
key:

```json
{
  "reckoner": {
    "enforceRegistration": false,
    "disabledSources": []
  }
}
```

Defaults are permissive (`enforceRegistration: false`,
`disabledSources: []`). The CDC-handler commission wires the
behavioral consequences; this commission just parses and exposes
the config to consumers (probably via the apparatus's `provides`
object).

### Priority type with default-filling

The `Priority` TypeScript type captures the five-axis schema from
the contract:

```typescript
type Priority = {
  visionRelation:
    | 'vision-blocker' | 'vision-violator'
    | 'vision-advancer' | 'vision-neutral';
  severity:  'critical' | 'serious' | 'moderate' | 'minor';
  scope:     'whole-product' | 'major-area' | 'minor-area';
  time:      { decay: boolean; deadline: string | null };
  domain:    Array<DomainTag>;
};
```

The full `domain` enum is in the contract. Plus the optional
`complexity` field as a peer to `Priority` (not inside it):

```typescript
type ComplexityTier =
  | 'mechanical' | 'bounded' | 'exploratory' | 'open-ended';
```

A `defaultPriority()` helper applies the contract's defaults
(`vision-neutral / minor / minor-area / {decay: false, deadline: null} / []`)
when fields are omitted.

### `reckoner.petition()` helper (Workflow 2)

The canonical ergonomic path. Takes a `PetitionRequest` that
combines writ fields (type, title, body, codex, parentId?) and ext
fields (source, priority, complexity?, payload?, labels?). The
helper:

1. Validates source against the registry (subject to
   `enforceRegistration` config — when true, unregistered source
   throws fail-loud).
2. Applies priority defaults for omitted dimensions.
3. Validates dimension values against schema.
4. Calls `clerk.post()` with the writ payload, then writes the ext
   fields under `writ.ext.reckoner` via `setWritExt`.

Returns the persisted `WritDoc` (with `phase: 'new'` and
`ext.reckoner` populated).

### `reckoner.withdraw()` helper

Thin wrapper around `clerk.transition(writId, 'cancelled', {reason})`.
No special source-check — the wrapper's purpose is ergonomic
discoverability, not enforcement.

### No emit-time scheduling logic

This commission does NOT implement the scheduling decision (when to
approve, defer, decline). That's the CDC-handler commission. This
commission's helpers post writs in `new` phase carrying ext; the
writs sit there until the CDC handler picks them up.

## Out of scope

- **CDC handler / scheduling logic.** Separate commission that
  follows this one.
- **Reckonings book schema and writes.** Owned by the parallel
  Reckonings-book commission; this commission does not write to
  the Reckonings book.
- **Combination function for dimension scoring.** Out of scope per
  the contract (lives in the CDC-handler or Reckoner-core
  scheduling commission).
- **Workflow 3 (post-then-petition).** Explicitly skipped per the
  contract.

## Behavioral cases

- A kit declaring two `petitioners` entries with the same source
  fails guild startup with a diagnostic naming both plugins.
- A plugin contributing `petitioners: [{source: 'wrong.format!'}]`
  fails startup with a malformed-id error.
- `reckoner.petition({source: 'unknown'})` with
  `enforceRegistration: false` (default) succeeds; the Reckoner logs
  a warning but the writ is created.
- `reckoner.petition({source: 'unknown'})` with
  `enforceRegistration: true` throws fail-loud with an unregistered-
  source error; no writ is posted.
- `reckoner.petition({source: 'vision-keeper.snapshot', priority: {visionRelation: 'vision-violator'}})`
  succeeds; omitted priority dimensions fall back to defaults.
- The resulting writ has `phase: 'new'` and
  `writ.ext.reckoner = {source, priority, complexity?, payload?, labels?}`.
- `reckoner.withdraw(writId, reason)` transitions the writ to
  `cancelled` with the reason recorded.
- After `phase:started`, attempting to register a new petitioner
  via any path fails (registry is sealed).

## Dependencies

- **Required: Clerk `WritDoc.ext` and `setWritExt` API** — separate
  commission this one follows.

## References

The Reckoner contract: `docs/architecture/petitioner-registration.md`
(§5 registry, §6 configuration, §3 priority dimensions, §4
complexity, §1 helper API).