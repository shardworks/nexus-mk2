# Plugin-contributed writ types

I want plugins to be first-class contributors of **writ types** and the components that go with them — the same way plugins already contribute roles. A plugin author should be able to declare a new writ type (say, `review` or `incident`) along with its schema, lifecycle, handlers, and any rigs/engines that operate on it, drop that plugin into a guild, and have the new writ type show up in the books as if it were built in. And, as with roles, a guild's `guild.json` always wins: if the guild re-declares a type a plugin ships, the guild's definition takes precedence.

## Reader and decision

The primary reader is a **plugin author** — someone outside the core framework team who is extending Nexus to cover a domain we don't ship out of the box. They are deciding *"can I express my domain's unit of work as a writ, or do I have to build a parallel bookkeeping system?"* Today the answer is effectively "no, writ types are hard-coded," and that is the gap to close.

The secondary reader is the **guild operator** maintaining `guild.json`. Their decision is narrower: *"a plugin I'm installing ships a writ type I want to tweak — can I override it locally without forking the plugin?"* The override story needs to feel identical to how they already override roles.

## Scope

**In:**
- A plugin manifest surface for declaring writ types, parallel in shape to the role contribution surface.
- Writ-type definition fields: `name`, `description`, JSON/TS schema for the writ's payload, lifecycle state set (defaults to `new → open → stuck → completed/failed/cancelled` but overridable), and a dispatch policy (opt-in per type, matching today's model).
- Plugins may also contribute components that are *keyed on* the writ type — engines, summons, standing orders, and rig bindings — and have them register automatically when the writ type loads.
- A merge/precedence pass at guild load time: plugin contributions merge into the registry; `guild.json` entries override plugin entries by `name`; conflicts between two plugins are resolved by plugin load order with a warning logged.
- `nsg` (or equivalent tooling) gains a command to list the resolved writ-type registry, showing source (`builtin` / `plugin:<id>` / `guild.json`) for each entry, so operators can see what won.

**Out:**
- Runtime hot-reload of writ types. A guild restart to pick up new plugin contributions is fine.
- Migration of existing writs when a type's schema changes. That's a separate problem; flag it if a plugin update changes a shipped schema, but don't try to rewrite stored writs.
- Cross-guild sharing of writ-type definitions. Each guild resolves its own registry.
- A marketplace, discovery UI, or plugin registry. Plugins are installed however they are installed today.

## How it works

A plugin's manifest gets a `writTypes` section that mirrors the existing `roles` shape. Each entry names the type, points at a schema file, and optionally lists the components (engines, summons, standing orders) that should register when the type is active.

At guild startup, the loader builds the writ-type registry in three passes:

1. **Built-ins** (`mandate`, `click`, whatever else ships with the framework) are registered first.
2. **Plugin contributions** are merged in, in plugin load order. If two plugins declare the same type name, the later one wins and a warning is emitted.
3. **`guild.json` overrides** are applied last and always win. A `guild.json` entry may be a full redefinition or a patch (e.g. "same as plugin-X's `review` but with this extra lifecycle state").

The clerk and the books treat the resolved registry as authoritative — there is no runtime distinction between a built-in writ type and a plugin-contributed one. Dispatch, standing orders, and the wrist/writ lifecycle machinery all key off the registry.

When a writ-type lookup fails (a stored writ references a type no longer in the registry), the writ is readable but frozen — no transitions, visible in the books with a "missing type" indicator. That avoids data loss when a plugin is removed.

## Assumptions I made

- The existing role-contribution mechanism is the right shape to mirror. If roles today work differently than I remember, flag it and we'll realign.
- Writ type names are globally unique within a guild (flat namespace, no scoping by plugin). Worth confirming — scoped names like `plugin-x/review` are the obvious alternative.
- "Components keyed on a writ type" is a coherent category the framework can enumerate (engines, summons, standing orders, rig bindings). If that list is wrong or incomplete, the plugin manifest shape needs revising.
- Schema format: JSON Schema or TS-derived. I don't care which; pick what's consistent with how the ontology is expressed today.

## Deferred questions

- Should `guild.json` be able to **disable** a plugin-contributed writ type outright (not just override it)? I'd lean yes; confirm.
- What's the right behavior when a plugin contributes a writ type *and* an engine that handles it, but the operator overrides the type in `guild.json` with an incompatible schema? Fail loud at load time, or let the engine crash at runtime?
- Do we want a `nsg writ-types doctor` or similar that validates the resolved registry against stored writs in the books before the guild comes up?
