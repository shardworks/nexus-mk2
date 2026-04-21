# Plugin-contributed writ types

I want writ types to be a first-class contribution slot — the same shape as roles. A plugin declares writ types it brings; `guild.json` can declare or override them; the framework aggregates at guild boot with guild-config winning on collision. The hinge is that *every* writ-aware surface treats a plugin-contributed type identically to a built-in — no special-casing of the ones the framework happens to ship.

## Reader and decision

The reader is a **plugin author** shipping a domain-specific writ type (e.g., a research-log plugin that wants `expedition` writs alongside the built-in `mandate`). The decision: *"can I define a writ type in my plugin and have it work in every writ surface — books, CLI tools, dispatch — without the framework needing to know about it?"* Secondary reader: a **guild integrator** who wants to override a plugin-contributed type in `guild.json`. Frequency: once per plugin dev cycle, once per guild setup. Low-cadence but load-bearing — the contribution contract set here is precedent for every future writ type (#13).

## Scope

**In:**
- A `writTypes` contribution slot on the plugin manifest, object-shaped keyed by type id (#5, #21).
- A matching `writTypes` field in `guild.json` that overrides plugin contributions on id collision.
- Aggregation at guild instantiation: merge plugin contributions, let `guild.json` win, **throw loud on plugin-vs-plugin id collision** (#2) — no last-write-wins, no silent shadowing.
- Built-in writ types (`mandate`, etc.) migrated to *be* contributions from the framework's own plugin-equivalent, not hardcoded (#10, #38). If the current books code special-cases built-ins, remove the special case.
- Complete the set (#36): `listWritTypes()` / `getWritType(id)` on the API, and the sibling CLI tools `writ-type-list` / `writ-type-show`. Every existing writ CLI/API (`nsg writ list`, `nsg writ show`, dispatch) must accept plugin-contributed types identically.
- `WritTypeDefinition` shape: `id` (noun-like, #21), `label`, `payloadSchema`, and an object-shaped `dispatch?` hint if the type opts into rig/summons dispatch (#5). That's the minimum.

**Out:**
- Per-writ-type lifecycle overrides. The standard `new → open → stuck → completed/failed/cancelled` is the lifecycle. Plugins don't get to reshape it — when a second consumer needs that, they earn it (#11, #18).
- Dynamic runtime registration. Writ types are declared at plugin load; not mutable mid-session.
- Versioning / migration of writ-type schemas. Until a real migration happens, this is speculation (#18).
- A compat shim for existing built-in types. Migrate them to the contribution path directly (#1, #10, #38).
- Any framework-level awareness of *what* a plugin's writ type means — the framework knows the id, label, and schema; domain behavior is the plugin's problem (#8).

## How it works

A plugin manifest gains `writTypes: Record<string, WritTypeDefinition>`. The key is the writ-type id, the value is the definition. Plugins that add tools/engines/handlers operating on their writ type do so through the ordinary plugin contribution machinery — referencing the type by id. There's no new "bundle" concept; the brief's "other components that use that writ type" is already served by the existing plugin surface, because the writ-type id is now a stable reference (#8, #9).

Guild boot walks plugins in load order, collects `writTypes`, then layers `guild.json.writTypes` on top. Collisions:
- **Plugin vs plugin on the same id** → throw at boot with both plugin ids named (#2). No silent ordering dependency.
- **`guild.json` vs plugin** → guild wins silently (by design, per the brief — the integrator's intent is explicit).

The extension point is the *act of declaring a writ type at plugin-load / guild-init time*, not the transport afterward (#14). Downstream surfaces read from a resolved `WritTypeRegistry` exposed on the guild — they do not re-aggregate or re-resolve.

CLI: `nsg writ-type list` shows all resolved types with source (`plugin:foo` / `guild.json`); `nsg writ-type show <id>` shows the full definition and which source won (#36). These two ship together with the contribution slot — shipping the slot without them leaves the next consumer grepping logs to answer "which won?" (#20, #36).

Naming: `writTypes` (not `writKinds`, not `writRegistrations`) — mirrors `roles` and reads cleanly in prose, config, and log lines (#32, #33).

## Assumptions I made

- There is already a `WritTypeDefinition` concept somewhere in the books/Scriptorium layer, even if implicit. The planner should locate it and extend rather than invent (#3, #17).
- The built-in `mandate` type is currently hardcoded in framework code; migrating it into the contribution system is part of this commission, not a follow-up.
- Roles contribution has a resolved shape the planner can mirror structurally — same aggregation rules, same override precedence, same surfacing of "which source won."
- Plugin-contributed tools/engines referencing a writ-type id work through existing plugin contribution plumbing without framework changes beyond the registry being queryable.

## Deferred questions

- Should `writ-type-list` include the payload schema inline, or only the id/label/source (with `writ-type-show` for full detail)? Default to the latter unless you tell me otherwise.
- If a plugin contributes a writ type *and* a tool operating on it, but `guild.json` overrides the writ type with an incompatible payload schema — fail at boot, or let the tool fail at call time? I'd prefer fail at boot, but this is the kind of thing the planner should confirm.
- Is there a Scriptorium/Books apparatus that should own this contract rather than the framework root (#9)? If writs are fundamental like roles, framework-level is right. If the books are a distinct apparatus, the contract moves there. Name the apparatus before dispatch.
