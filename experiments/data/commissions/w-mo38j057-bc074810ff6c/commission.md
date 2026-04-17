# Status Convention on Writs

## Intent

Adopt a Kubernetes-style split on writs: the existing lifecycle enum (`new | open | stuck | completed | failed | cancelled`) moves to a field named `phase`, and the name `status` is re-used for a new per-plugin observation slot of shape `Record<PluginId, unknown>`. No consumers of the new slot land in this commission — Spider, the first consumer, arrives in a downstream commission. The goal here is to establish the convention and free the name, so that consumer briefs don't have to re-litigate it and so that the guild's runtime objects have a uniform place for observed state as they adopt the pattern one by one.

## Motivation

Two pressures motivate this substrate change now:

**The name `status` is misallocated.** On writs today, `status` holds the lifecycle phase — a pure enum tag. That is exactly what Kubernetes (and most systems that care about the distinction) would call `phase`. Meanwhile, the new per-plugin observation slot — the field that records *observed state* written by controllers — is literally what `status` is for in that idiom. Leaving the lifecycle enum on the `status` field forces the observation slot into an awkward alternative name (`pluginStatus`, `observers`, `extensions`) that surrenders the right word to the wrong role and makes the convention harder to reach for as other runtime objects adopt it.

**Spider is about to become the first consumer, and its design depends on the slot existing.** Spider needs a place to record the provenance of stuck transitions it authored (`stuckCause = 'failed-blocker' | 'cycle'`) so it can distinguish self-authored stucks from engine-cascade stucks (which it must not auto-unstick). If Spider's commission also has to carry the slot's introduction *and* decide the name collision, that commission's scope balloons and its implementer is asked to do substrate surgery alongside new behavior. Landing the substrate first narrows the consumer commission to the actual gating work.

The blast radius of the `status → phase` rename is large but mechanical: every read of `writ.status === 'open'` becomes `writ.phase === 'open'`. Compiler-guided, greppable, test-verifiable. The code pays this cost once to produce a system whose field names match what they describe — `phase` for the lifecycle tag, `status` for the observation surface.

## Non-negotiable decisions

### Rename the existing lifecycle field from `status` to `phase`

The existing `WritDoc.status: WritStatus` enum field is renamed to `WritDoc.phase: WritPhase`. The rename propagates through every surface that reads or writes the lifecycle field on writs:

- The type alias (`WritStatus` → `WritPhase`) and the transition machinery that guards allowed-from sets.
- The Clerk transition API, any filter type that scopes queries by lifecycle (`WritFilters.status` → `WritFilters.phase`), and any Stacks index definitions that key on the field.
- All plugins that import or reference the lifecycle field — including Spider's dispatch-gating query filter.
- Tools, CLI commands, and Oculus surfaces that display, filter, or act on writ lifecycle.
- Tests and fixtures.

The set of legal lifecycle values (`new | open | stuck | completed | failed | cancelled`) and every transition rule are unchanged. Only the field/type/filter name changes.

This rename applies **to writs only** in this commission. Rigs, engines, sessions, and input requests all keep their existing `status: ...Status` fields until a future commission needs to introduce an observation slot on those object kinds and rename their lifecycle fields in lockstep. The convention is guild-wide; the rollout is per-object-kind, driven by the first consumer that needs the slot.

### Introduce the per-plugin observation slot under the name `status`

The freed-up `status` name becomes a new optional field on `WritDoc` of shape `Record<PluginId, unknown>`. Each plugin owns the slot at `status.<pluginId>` and writes only its own slot. Other plugins and Oculus read freely.

Properties of the slot (from the design subtree at `c-mo33duvq`):

- **Ownership** — convention only, not runtime-enforced. A plugin that writes into another plugin's slot is violating convention; this is documented but not policed in v1.
- **Schema** — the field is optional/implicit. Code that reads the slot defaults to `{}` when absent. No formal schema migration on existing records; existing writ rows begin life with no slot, and that is indistinguishable from an empty slot.
- **CDC behavior** — writes into the slot emit Stacks CDC events through the same mutation path as any other field write. Watchers can react to slot changes the same way they react to lifecycle (phase) changes. No opt-out.
- **Persistence** — the slot persists for the lifetime of the writ, across terminal states. Spider's stuck-provenance record remains readable after the writ reaches `completed` (same guarantee as the rest of the writ body).
- **Concurrent writes** — last-writer-wins per key within a plugin's own slot. Cross-plugin concurrent writes are a non-issue because each plugin owns its own sub-slot. A plugin that needs stronger semantics inside its own slot serializes internally.
- **Shape per plugin** — untyped (`unknown`) in v1. Plugins document their slot's shape in prose; typed contributions are deferred (parked at `c-mo33e194`).

### No consumers, no payload in this commission

This commission introduces the slot as a data-shape and establishes its semantics. No plugin writes into it. Spider's `status.spider.stuckCause` writes land with the Spider gating commission, not here. The convention is documented with a worked example referencing the shape Spider will use — prose-only, no Spider code changes.

A fresh guild post-migration has the slot available, empty, on every writ.

### Documentation establishes the convention guild-wide

The Clerk architecture/reference doc and the Clerk README are updated to describe the convention: the spec/status split, plugin-owned sub-slots, ownership-by-convention, CDC/persistence/concurrency properties, and the intended pattern for other runtime objects when they adopt it. The writ is the first (and, in this commission, only) object kind with the convention applied. Other runtime objects are noted as future adopters; no code changes land on rigs/engines/sessions/input-requests here.

## Out of scope

- **Any consumer of the new slot.** Spider's use of `status.spider` (stuck-cause provenance) lands with the downstream Spider gating commission.
- **Introducing the convention on non-writ runtime objects.** Rigs, engines, sessions, and input requests retain their existing `status` lifecycle fields. They adopt the convention (and pay the `status → phase` rename cost) when their first consumer needs the observation slot.
- **Ownership enforcement of sub-slots** at runtime. Convention only in v1.
- **Typed contributions for plugin sub-slot shapes.** Deferred (parked at `c-mo33e194`).
- **Link-substrate renames** (`type → label`, `semanticMeaning → kind`, separator sweep). Separate commission — the two touch disjoint surfaces and can land in either order.
- **Oculus surfaces that render the new slot** (e.g. a "gate" column on the writ table). Natural follow-up once Spider populates `status.spider`, but a separate commission.
- **Closing the lifecycle-phase visibility gap** where `open` overloads "waiting", "eligible", and "running". Parked at `c-mo301yp9`.

## References

- **Design subtree** for the convention: click `c-mo33duvq-7f774446c6c9` and its concluded children covering ownership, CDC, persistence, concurrency, and schema-migration decisions.
- **Typed-contributions follow-up** (parked): click `c-mo33e194-6b7408378e9f`.
- **Downstream commission** that consumes the slot: Spider dispatch gating via `spider.follows`. Dispatched separately. Depends on the slot existing; also depends on Spider's dispatchable-writ query filter being renamed in lockstep with the lifecycle field.
- **Visibility-gap follow-up** (parked): click `c-mo301yp9-c186db746a77`.