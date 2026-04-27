# Vision-keeper: petitioner kit declaration and worked example using reckoner.petition

## Intent

Implement the canonical worked example of a Reckoner petitioner —
the vision-keeper — exercising every contract surface from the
Reckoner contract: kit declaration, source stamping, dimension
claims, complexity, payload, labels, withdraw, and standing-order
feedback.

## Motivation

The Reckoner contract uses vision-keeper as the canonical worked
example throughout (especially §11). Building the actual
implementation:

1. Validates the contract end-to-end against a real consumer.
2. Provides the reference implementation for future petitioners
   to model from.
3. Activates the vision-keeping flow that's been queued behind the
   Reckoner work.

## Non-negotiable decisions

### Petitioner declaration via kit

Vision-keeper declares its petitioner source in its kit:

```typescript
petitioners: [{
  source:      'vision-keeper.snapshot',
  description: 'Vision-vs-reality snapshots emitted when the keeper observes drift worth surfacing.',
}]
```

Singleton source name regardless of how many vision instances are
tracked. Multi-instance discrimination lives in
`labels['vision-keeper.io/vision-id']`.

### Use `reckoner.petition()` helper (Workflow 2)

The canonical ergonomic path. The vision-keeper uses
`reckoner.petition({...})` to post snapshots — single call,
type-checked dimensions, defaults applied. Workflow 1 (direct
clerk.post) is also available but the worked example uses Workflow
2 to demonstrate the canonical surface.

### Dimension claims that match the situation

Drift-detected snapshots typically claim:

```typescript
{
  visionRelation: 'vision-violator',
  severity:       'serious',     // or 'critical' for severe drift
  scope:          'major-area',  // or whole-product when applicable
  time:           { decay: true, deadline: null },
  domain:         ['quality'],
}
```

Proactive elaboration nudges typically claim:

```typescript
{
  visionRelation: 'vision-advancer',
  severity:       'moderate',
  scope:          'minor-area',
  time:           { decay: false, deadline: null },
  domain:         ['feature'],
}
```

Complexity is included when the keeper has a basis (often
`'bounded'` for known-shape drift remediations); omitted for
open-ended elaborations.

### Payload carries the snapshot

The structured snapshot data (vision-vs-reality delta, metric
values, source vision id, snapshot timestamp) goes in
`writ.ext.reckoner.payload` so the rig that processes the resulting
writ has it available without overlay-book joins.

### Labels for multi-instance discrimination

When tracking multiple visions, each petition includes:

```typescript
labels: { 'vision-keeper.io/vision-id': '<vision-name>' }
```

This is how multiple vision-keeper instances (one per
product/area) coexist under a single source-id without collision.

### Withdraw via `reckoner.withdraw()`

When a snapshot is superseded (newer drift detected before this
one ran), the keeper calls
`reckoner.withdraw(writId, 'Snapshot superseded by drift detected before this ran.')`.

### Standing-order feedback recipe

The keeper ships a standing-order configuration in its
`clockworks.standingOrders` that watches for declined petitions
filtered to its source. The relay handler reacts (typically: log
the decline, possibly re-emit with adjusted context). This
exercises the Channel-1 feedback path from the contract.

## Out of scope

- **The vision artifact itself.** This commission implements the
  petitioner; the vision artifact (where the vision is stored, how
  it's structured, how drift is detected) is owned by separate
  vision-keeper apparatus design commissions.
- **Multi-vision orchestration.** Single-vision flow is the v0
  scope; multi-product/multi-vision orchestration follows.
- **The rig that processes vision-keeper-produced writs.** Out of
  scope; this commission is about the petitioner side.

## Behavioral cases

- The keeper detects drift and calls `reckoner.petition({...})`
  with appropriate dimensions and payload; a held writ is created
  with `phase: 'new'` and `ext.reckoner` populated.
- The Reckoner approves the petition (when scheduling logic
  permits — once the CDC-handler commission lands); the writ
  transitions to `open` and Spider dispatches it.
- The keeper detects newer drift superseding an outstanding
  petition; calls `reckoner.withdraw(writId, reason)`; the writ
  transitions to `cancelled`.
- The keeper's standing-order recipe fires on a decline event;
  the relay handler logs the decline reason.
- Multi-vision: keepers tracking nexus and (hypothetical) other
  visions emit petitions with distinct
  `labels['vision-keeper.io/vision-id']`; standing-order filters
  scope to the right keeper instance.

## Dependencies

- **Required: Reckoner core** (registry, helpers) — separate
  commission this one follows. Vision-keeper exercises the
  helper API.

## References

The Reckoner contract: `docs/architecture/petitioner-registration.md`
(§11 vision-keeper worked example, §1 helper API, §3 priority
dimensions, §4 complexity).