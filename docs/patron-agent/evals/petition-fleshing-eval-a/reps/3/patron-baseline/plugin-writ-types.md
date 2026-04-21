# Plugin-contributed writ types

I want plugins to be able to ship their own writ types — complete, first-class records with lifecycle, schema, and any components that naturally travel with the type (renderers, validators, dispatch rules). The model I have in my head is the one we already use for roles: a plugin declares contributions, `guild.json` can declare its own, and where the two overlap, `guild.json` wins. Same rules here.

## Reader and decision

The reader is a **plugin author** building a domain extension — say, a "code-review" plugin that wants its own `review` writ type with its own states and its own renderer. Their decision: can I express this writ type cleanly in my plugin manifest, or do I have to fork the framework? I want the answer to be an unambiguous yes — with a single, documented contribution point.

The secondary reader is a **guild operator** editing `guild.json` to override or tweak a plugin's writ type for their guild (e.g., renaming a state, disabling a type, pointing it at a different renderer). They're deciding: can I customize this without editing plugin source? Yes.

Frequency: plugin author uses this once per writ type at plugin authoring time; operator uses it occasionally when tuning their guild.

## Scope

**In:**
- A `writTypes` contribution key in the plugin manifest, shaped the same way `roles` are contributed today.
- A `writTypes` section in `guild.json` with identical shape.
- Merge semantics: plugin contributions are collected first, then `guild.json` entries are merged on top by `id`, with `guild.json` winning on every field it specifies (field-level override, not whole-record replacement — same behavior as roles).
- A writ-type definition covers: `id`, `displayName`, `description`, `schema` (payload shape), `states` (the lifecycle nodes allowed, on top of the framework's base `new → open → stuck → completed/failed/cancelled` — plugins add their own sub-states or refine, they don't replace the base lifecycle), `dispatchable` (whether this writ type can be dispatched to a rig), and optional component references (`renderer`, `validator`).
- Collision handling: two plugins contributing the same `writTypes.id` is an error at guild load. `guild.json` overriding is not a collision.
- CLI: `nsg writs types` lists the resolved set with their source (plugin id or `guild.json`).

**Out:**
- Dynamic/runtime registration of writ types. Contributions are static, resolved at guild load.
- Migrating existing writs when a type definition changes. Separate problem.
- A UI for editing writ types. `guild.json` edits are fine for now.
- Cross-plugin writ type inheritance ("extend this other plugin's type"). Not worth the complexity yet.

## How it works

A plugin's `plugin.json` gains a `contributes.writTypes` array, mirroring `contributes.roles`:

```json
{
  "contributes": {
    "writTypes": [
      {
        "id": "review",
        "displayName": "Code Review",
        "description": "A review of a pull request or changeset.",
        "schema": "./schemas/review.schema.json",
        "states": ["reviewing", "changes-requested", "approved"],
        "dispatchable": true,
        "renderer": "./components/review-renderer.ts"
      }
    ]
  }
}
```

`guild.json` takes the same shape under a top-level `writTypes` key. At guild load, the resolver:

1. Walks all loaded plugins, collects their `writTypes` contributions, keyed by `id`.
2. Overlays `guild.json`'s `writTypes` on top, merging field-by-field (so an operator can override just `displayName` or disable `dispatchable` without restating the whole definition).
3. Writes the resolved set into the in-memory guild registry used by the clerk, ratchet, and CLI.

Errors I want loud:
- Two plugins contributing the same `id` → hard failure at load with both plugin ids named.
- `guild.json` referring to an `id` that isn't contributed anywhere → warning (operator may be pre-declaring a future plugin) unless the entry is missing required fields, in which case hard failure.
- Schema parse errors → hard failure, naming the plugin and the file path.

Resolved writ types appear in `nsg writs types` with a `source` column: either the contributing plugin's id, or `guild.json` if fully defined there, or `<plugin>+guild.json` if merged.

## Assumptions I made

- The roles contribution mechanism already has the field-level merge semantics I'm asking for here. If it's whole-record replacement today, we should align both to field-level — but flag it rather than silently diverging.
- The base writ lifecycle (`new → open → stuck → completed/failed/cancelled`) is enforced by the framework and plugins only add sub-states or terminal variants. If plugins need to replace the base lifecycle, that's a bigger conversation.
- Components like renderers and validators are already loadable from plugin-relative paths. If not, the scope here expands to include the loader.
- "Dispatchable" is a per-writ-type boolean today. If it's more nuanced (per-rig), we need to model that.

## Deferred questions

- Should `guild.json` be able to **remove** a plugin-contributed writ type entirely (e.g., `"disabled": true`), or only override fields? I lean toward yes-removable, but want confirmation.
- How do migrations work when a plugin updates its writ-type schema and existing writs are in the books? Out of scope here, but we need a story before the first plugin ships a schema change.
- Does the ratchet need to know about plugin writ types, or only the clerk? If clicks can reference plugin writs, the ratchet needs the registry too.
- Naming: `writTypes` vs `writ-types` vs `writKinds` in the manifest. I've written `writTypes` to match `roles` casing; confirm the convention.
