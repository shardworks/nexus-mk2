# Plugin-contributed writ types

I want plugins to be first-class contributors of writ types, on the same footing as the built-in `mandate`. An apparatus should be able to declare its own record shape (`spider.trail`, `scriptorium.inscription-review`, whatever), ship the handlers that act on that shape, and rely on the framework to give it the same generic operator surface the built-in types get. guild.json remains the final word: if the patron names a writ type in guild.json, that definition wins over any plugin's contribution of the same id.

## Reader and decision

The reader is an **apparatus author** (me wearing that hat, or a future plugin author) deciding "I want to track a new kind of typed record in the books — what's the contract I fill in, and what do I get for free?" This is an infrastructure surface, touched a handful of times per apparatus at design-time, essentially zero times at runtime. The secondary reader is the **operator** who, at runtime, needs to create/list/show writs of the new type through the standard tool vocabulary without the apparatus having re-implemented CRUD.

## Scope

**In:**
- A `writTypes` slot on the plugin contribution contract — an object map keyed by type id, values describing the writ shape (schema + any type-level defaults).
- A matching `writTypes` slot in guild.json with the identical shape. guild.json entries fully shadow plugin contributions of the same id (mirror the roles precedent — no field-level merge). (#7, #11)
- Generic operator tools — `writ-create`, `writ-list`, `writ-show` — parametric over registered writ type. A plugin that contributes a writ type gets these automatically keyed on its id; it does **not** re-ship CRUD tools per type. (#36)
- Books accept and persist writs of any registered type; type registry is the single source of truth. (#13, #15)
- Startup validation: if two plugins contribute the same writ type id and guild.json hasn't picked a winner, fail loud. No silent last-wins. (#2)

**Out:**
- Per-type custom lifecycles. Every writ type gets the standard `new → open → stuck → completed/failed/cancelled`. If and when a specific apparatus needs to diverge, that's a second-consumer moment and we revisit. (#18)
- Runtime migration of existing writs when a type's schema changes. Not the MVP question and no reader is asking for it yet. (#23)
- Per-type ACLs / permission slots. No named consumer. (#18)
- A bespoke framework-level index or cache keyed on type. Existing book queries are adequate until proven otherwise. (#27)
- Any compat shim for "legacy untyped writs." Mk 2.1 is greenfield; there are none. (#1, #10)

## How it works

Writ type contribution is **object-shaped from day one**, even though the MVP body is narrow: `{ id, schema, description }`. Object shape because this is exactly the slot where fields will accrete — a scalar-or-string contribution here is a one-cycle regret. (#5)

The `schema` field is a Zod schema for the writ's payload. Concrete, typed, one answer — not "Zod-or-JSON-Schema-or-a-string-typename." Plugins author Zod; the framework uses it for validation on create and for generating argument shapes on the generic tools. (#2, #6)

Precedence is **full shadow**, not field merge: if guild.json declares a writ type with id `spider.trail`, the guild.json entry replaces the plugin's contribution wholesale. This matches the roles precedent and keeps the override semantics readable ("look in guild.json first, then plugins"). Field-level merge would require the operator to hold two documents in their head to know the effective shape — reject. (#15, #13)

The generic tools — `writ-create`, `writ-list`, `writ-show` — ship as a set in the same cycle as the contribution slot. Shipping the contribution slot without the sibling tools is the incoherent half-surface pattern; the next consumer would route around the gap by writing their own CRUD tool, which becomes load-bearing precedent. (#36) These tools derive their type parameter from the registry at guild-boot time, so `writ-list --type spider.trail` Just Works once the plugin is mounted.

Handlers that act on the new writ type use the **existing** clockworks standing-order contribution. A plugin declaring a writ type will typically also declare standing orders in the same plugin contribution object, binding events on that type to its handlers. No new mechanism for "writ-type-scoped handlers" — the existing event/standing-order surface is the right primitive. (#8, #17)

Writ type ids are **plugin-scoped by convention**: `<pluginId>.<typeName>` (e.g., `spider.trail`). guild.json can declare unqualified ids (`trail`) which are treated as guild-local types. Convention only — not enforced by the registry — so the registry keys on the full string the contributor wrote. (#21 — the id is the id.)

## Assumptions I made

- The plugin contribution system already has a contribution object per plugin that can grow a new `writTypes` field without restructuring. If it doesn't, the slot goes on whatever the plugin's current contribution surface is — this is a framework-internal call I'm not pre-deciding.
- Zod is the right schema vocabulary. If the framework has standardized on something else for similar extension points, use that for consistency — but don't invent a new schema language for this.
- The roles precedent is **full-shadow override** at guild.json level. If the current roles behavior is actually field-level merge, flag it — I may want to change the roles behavior to match, rather than have writ types diverge.
- "Startup validation fails loud on duplicate id with no guild.json winner" is correct because there's no reasonable silent resolution and drift here is a real foot-gun. (#2)

## Deferred questions

- **Named near-term consumers.** Which apparatus actually ships a writ type in the same or next cycle as this contribution slot? Spider? Scriptorium? I want at least one real second consumer lined up to validate the shape — otherwise we're speculating. (#18)
- **Tool naming in the guild vocabulary.** `writ-create` / `writ-list` / `writ-show` are serviceable but boring. Check the guild metaphor registry — is there a more native verb for "bring a writ into being" than `create`? (#34)
- **Guild.json override for *tooling* vs. *type shape*.** If guild.json wants to override just the `description` of a plugin-contributed type but keep the `schema`, does the full-shadow rule hurt? My current call is "no, write the whole thing out" — but confirm the ergonomics against a real plugin before locking it.
