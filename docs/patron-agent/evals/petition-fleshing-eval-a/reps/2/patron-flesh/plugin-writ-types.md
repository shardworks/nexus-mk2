# Plugin-contributed writ types

I want plugins to be a first-class source of writ-type definitions, on equal footing with `guild.json` — and I want the plugin's writ type to arrive as a *coherent bundle* with the components that actually do anything with it. A writ type declaration in isolation is a label; useful plugins ship the label alongside the handlers, tools, and clockworks that recognize it.

Mirror the existing role-contribution pattern (#3) — same shape, same precedence rule, same resolution semantics. I don't want a parallel mechanism invented for writs; extend the pattern that already exists.

## Reader and decision

The reader is a **plugin author** building a domain-specific apparatus — e.g., a "procession" apparatus that wants its own `procession` writ type with bespoke fields and a handful of engines/tools scoped to it. Their decision, once per plugin, at plugin-authoring time: *"can I ship my writ type, its lifecycle hints, and the components that use it, as one package that a patron installs by adding the plugin to `guild.json`?"* Frequency: rare per plugin, but this is a capability that unblocks the whole class of domain plugins we expect to proliferate.

## Scope

**In:**
- A plugin manifest slot for contributing writ types, shaped as a list of objects (#5) — not a scalar or a map keyed by name alone.
- Ability for a plugin's own handlers, clockworks, tool contributions, and engine bindings to reference a writ type the plugin itself declared. The bundle ships as a set (#36) — writ type + its sibling consumers, together, or the contribution is incoherent.
- `guild.json` writ-type entries override plugin contributions by writ-type ID. Same precedence rule as roles (#3, stated in the brief).
- Conflict detection: two plugins declaring the same writ-type ID should fail loud at guild init (#2). No implicit last-wins.
- Introspection — the already-present mechanism that enumerates role contributions should enumerate writ-type contributions too. If `role-list`-style tooling exists, the writ-type sibling ships in the same cycle (#36).

**Out:**
- Any migration shim for existing built-in writ types. Mk 2.1 is not bridging to Mk 2.0 (#10). Built-ins stay where they are; plugins add *new* types, they don't redefine `mandate`.
- Runtime (post-init) writ-type registration. Plugins declare statically at manifest-load time. If someone wants dynamic types later, a second consumer can earn that (#18).
- A generic "writ-type merge" mechanism where `guild.json` patches individual fields of a plugin's writ type. Override is whole-object replacement by ID, like roles. If you override, you own the whole definition.
- Framework-level specialization vocabulary for writ types beyond what the apparatus that owns writs needs. If a writ type has extra structural fields, those belong in the writ-type definition the plugin ships — not as new top-level framework concepts (#8).
- Versioning of writ types. Out until there's a specific need.

## How it works

Plugin manifest gains a `writTypes` contribution slot — an array of writ-type definition objects, shaped the same way a writ type is defined inside the Scriptorium's own built-ins. Each object carries at minimum the writ-type ID, display label, and whatever lifecycle/structural hints writ types already carry. Use a noun-like identifier (`id`, not `key` — #21). Scaffold the slot even if the first plugin uses a minimal shape (#37) — the object shape is the contract.

At guild init, the resolver gathers writ-type contributions in this order, with later entries overriding earlier by ID: built-in framework types → plugin contributions (in plugin load order, with an error on collision between plugins) → `guild.json` entries. `guild.json` always wins; two plugins colliding is a configuration error, not a silent pick (#2).

Handlers, clockworks, tools, and engine bindings contributed by the same plugin may reference the plugin's writ-type IDs freely. Cross-plugin references (plugin A's handler bound to plugin B's writ type) should resolve correctly — the registry is global once assembled — but I don't want the MVP to *advertise* that as a pattern. The bundled-set ergonomic (#36) is the primary story; cross-plugin reach is a side effect.

Naming: the manifest field is `writTypes` (plural, camelCase TS identifier, reads cleanly in a log line — "plugin foo contributed 2 writTypes") (#32). Reject `writs`, `writKinds`, `writSchemas` — the first is ambiguous (could mean instances), the latter two drift from the register already established (#33, #34).

Failure mode: if a handler or tool references a writ-type ID that doesn't resolve at guild-init time, fail loud at init, not at first dispatch (#2). Don't silently skip.

Skip-when-unset (#11): plugins that contribute zero writ types simply omit the field. No framework default, no empty-array requirement.

## Assumptions I made

- The role contribution/resolution pattern is close enough to the shape I want that a planner can copy its structure wholesale. If role resolution has quirks (ordering, merging, case sensitivity of IDs), writ-type resolution inherits them — *same mechanism, different slot*.
- Writ types already have a definition shape somewhere in the Scriptorium's built-ins that the contribution object mirrors. Plugins and `guild.json` produce values of that same shape; this isn't a new type invented for plugin contribution.
- "Other components which use that writ type" means handlers, clockworks handler bindings, tool contributions, and engine bindings — the existing plugin contribution slots. I'm not introducing new contribution categories, only allowing the existing ones to reference plugin-declared writ-type IDs.
- Override is whole-object by ID, not field-merge. Matches role behavior (I'm assuming).
- No second-consumer question for the *capability itself* (#18) — the role pattern is already the second-consumer precedent; generalizing to writs is routing-through-an-existing-contract (#17), not speculative scaffolding.

## Deferred questions

- Is there a specific plugin in flight right now that needs this, or is this pre-emptive? If pre-emptive, I'm still fine shipping it — the role pattern carries the weight — but confirm there's a concrete first writer so we're not setting precedent on a hypothetical (#13).
- Does role resolution do whole-object override or field-merge when `guild.json` and plugin both define the same ID? Whatever it does, writ-type resolution does the same — check before implementing.
- Are there `role-list` / `role-show` tool endpoints today? If yes, `writType-list` / `writType-show` ship with this commission (#36). If no, flag that as a separate gap and don't invent it here.
- Collision between two plugins declaring the same writ-type ID: fail init (my call), or last-loaded-wins with a warning? I want fail — confirm that's consistent with how role collisions between plugins behave, and if role collisions are currently silent, that's a bug to fix in the same cycle, not a precedent to copy.
