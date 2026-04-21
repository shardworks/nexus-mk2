# Plugins ship custom writ types

I want plugins to contribute new writ types the same way they contribute roles today — declared in the plugin manifest, picked up at guild load, overridable by `guild.json`. Right now `mandate` is effectively the only first-class writ type; anything else gets shoehorned into it. That's wrong. A plugin that implements code review should be able to define a `review` writ, a deployment plugin a `deployment` writ, and the guild should treat them as peers of `mandate`.

## Reader and decision

Primary reader: a **plugin author** building a plugin that models a domain-specific unit of work. Their decision: *can I define my own writ type, or do I have to overload `mandate`?* I want the answer to be the former, with a clear path.

Secondary reader: a **guild operator** editing `guild.json`. Their decision: *which plugin-contributed writ types do I want active in my guild, and do I need to override any of their defaults (lifecycle, dispatch rules)?* They should be able to answer this by reading one config file.

Both readers hit this rarely but in high-stakes moments — when standing up a new guild or adopting a new plugin.

## Scope

**In:**
- A manifest field on plugins (parallel to the `roles` field) for declaring writ types.
- A `writTypes` block in `guild.json` that can override or extend plugin contributions, with guild.json winning.
- Registration path: plugin writ types flow into whatever registry `mandate` is registered in today, so existing dispatch/rendering/lookup code Just Works.
- Name collision rules: guild.json > plugin > built-in. Two plugins contributing the same writ type name is a load-time error unless `guild.json` picks a winner.
- At least one worked example: migrate one existing ad-hoc use (e.g. the Ratchet's `inquiry` or a review flow) to be a plugin-contributed writ type, to prove the path.

**Out:**
- Runtime creation of writ types (they're declared at guild load, full stop).
- Migration tooling for existing writs when a type is renamed or a plugin uninstalled.
- Cross-plugin writ-type inheritance or composition.
- UI/display layer changes beyond what the registry already drives.

## How it works

A plugin's manifest gains a `writTypes` section, shaped like `roles`. Each entry declares:

- `name` — the type identifier (e.g. `review`, `deployment`).
- `lifecycle` — states and allowed transitions. Default is the standard `new → open → stuck → completed|failed|cancelled` set; plugins can replace it.
- `schema` — the body schema for writs of this type (TypeScript type reference or JSON schema, matching whatever `mandate` uses today).
- `dispatch` — optional default dispatch behavior (which rig picks it up, or "none").

At guild load:

1. Built-in writ types register first (`mandate` at minimum).
2. Each active plugin's `writTypes` register next. Name collision between two plugins → fail loudly with both plugin names in the error.
3. `guild.json`'s `writTypes` block applies last. An entry here can either **override** an existing registered type (partial merge — you can redefine just `dispatch` without restating `schema`) or **add** a new one.

Precedence is the same precedence as roles: guild.json is the operator's final say.

The writ type registry is the single source of truth. Anything that looks up "how do I handle a writ of type X" — dispatch, lifecycle validation, persistence — goes through it. No special-casing `mandate`.

## Assumptions I made

- There is already a writ type registry (or equivalent) that `mandate` flows through. If writ types are currently hardcoded rather than registered, that refactor is part of this work.
- The plugin manifest format for `roles` is stable enough to parallel. If it's not, fix it first and mirror the new shape for `writTypes`.
- Lifecycle states are per-writ-type, not global. The standard set becomes a default, not a constraint.
- `guild.json` already has a schema-validated config loader that partial-merges nested blocks. If it doesn't, the override semantics here need that capability.

## Deferred questions

- Should writ type definitions be versioned, so a plugin can evolve its schema without breaking existing writs in the books? My lean is "not yet" — defer until a plugin actually needs it.
- When a plugin is uninstalled, what happens to writs of its type still in the books? My lean is "they remain, the type is marked orphaned, no new ones can be created." Confirm.
- Do writ types need to declare which roles can act on them? Probably yes eventually, but I'd like the planner to tell me whether that belongs in this commission or a follow-up.
