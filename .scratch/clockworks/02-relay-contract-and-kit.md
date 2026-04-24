# Relay contract and ClockworksKit

## Intent

Define the relay artifact type and the kit contribution mechanism by which plugins ship relays to the Clockworks. This commission adds a `relay()` factory to `nexus-core`, fills in the `ClockworksKit.relays` contribution type (declared-but-empty in task 1), and builds the unified relay registry that merges relays from all installed plugins and the apparatus's own `supportKit` into a single lookup surface keyed by relay name.

## Motivation

Relays are the Clockworks' handler type — the thing a standing order's `run:` key names. Without a relay SDK factory, plugin authors have no canonical shape to export; without a registry, the dispatcher has nowhere to resolve names. Before any dispatcher can fire, both pieces need to exist.

Relays are deliberately distinct from engines (which run in rigs) and from bespoke framework processes (which are not plugin-authored). The distinction is already established in the architecture doc and in the guild vocabulary's engine-naming discussion: Clockworks handlers are mechanical, stimulus-response, always replaceable. The relay contract captures that.

## Non-negotiable decisions

### `relay()` factory added to `nexus-core`

New SDK factory mirroring the existing engine/tool/channel factories:

```typescript
import { relay } from '@shardworks/nexus-core';

export default relay({
  name: 'cleanup-worktree',
  handler: async (event, { home, params }) => { ... }
});
```

The factory's shape matches the architecture doc's `Relay Contract` section:

- `handler(event, context)` — event is the triggering `GuildEvent` (or null for direct invocation)
- `context` provides `home` (guild root path) and `params` (the contents of the standing order's `with:` field, defaulting to `{}` when absent)

The factory validates the shape at module load time and attaches any bookkeeping needed for registry integration.

### `ClockworksKit.relays` contribution

Fill in the kit contribution type declared but empty in task 1:

```typescript
interface ClockworksKit {
  relays?: RelayDefinition[]
}
```

Plugins contribute relays by declaring `kit: { relays: [...], recommends: ['nexus-clockworks'] } satisfies ClockworksKit`. The Clockworks apparatus discovers these contributions at startup through the standard kit-aggregation path.

### Unified relay registry

At apparatus start, the Clockworks merges relays from two sources into one registry keyed by relay name:

- Relays contributed by installed plugins (via the `ClockworksKit.relays` kit entry)
- Relays shipped in the apparatus's own `supportKit` (stdlib relays bundled with Clockworks itself — most notably the summon relay landing in task 5)

Both sources produce entries in the same registry. Callers of the eventual `ClockworksApi.resolveRelay(name)` see a single list regardless of source.

### Duplicate relay names: first-writer-wins with a warning

If two kits contribute relays with the same name, the first registered wins and a warning is logged with both source plugin ids. Matches the pattern used by `lattice` for channel factories.

### `supportKit` on the apparatus

The Clockworks plugin gains a `supportKit` field (or equivalent — whatever name the framework uses for apparatus-bundled kits) that carries stdlib relays. In this commission the supportKit is empty; task 5 populates it with the summon relay.

## Out of scope

- **The summon relay.** Task 5.
- **The dispatcher.** Task 4. This commission builds the registry and contract; invocation logic belongs to the dispatcher.
- **The event-store write path.** Task 3.
- **Runtime enforcement of relay name uniqueness across `on:` events.** A single relay can handle multiple events; that's normal and not a conflict.
- **Validation of `run:` names against the registry at guild.json load time.** Useful but orthogonal to the registry itself; defer to a later commission if wanted.

## Behavioral cases the design depends on

- A plugin exports a module satisfying `ClockworksKit` with one relay; after apparatus start, the relay is resolvable by name from the registry.
- Two plugins contribute relays with the same name; the first-registered wins, a warning is logged naming both plugins, and the second contribution is ignored.
- A relay with no destructuring of `params` continues to work — `params` defaults to `{}` when the standing order has no `with:` field.
- A relay invoked with `event: null` (direct call, no triggering event) does not throw on event access — the handler signature documents event as nullable.
- `relay({...})` with a missing or invalid handler throws at module load time with a clear message.

## References

- `docs/architecture/clockworks.md` — Relay Contract section, ClockworksKit section
- `c-mo1mql8a` — Clockworks MVP timer apparatus
