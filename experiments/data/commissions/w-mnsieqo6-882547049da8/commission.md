## Opened With

Historical scratch file preserved for the record. Originally drafted in `.scratch/kit-contributed-rig-templates-brief.md`:

---

# Brief: Kit-Contributed Rig Templates, Writ Types, and Mappings

## Motivation

Today, adding a new writ type with its own execution pipeline requires the guild owner to manually configure three things in `guild.json`:

1. Register the writ type with the Clerk (`clerk.writTypes`)
2. Define a rig template for it (`spider.rigTemplates`)
3. Map the writ type to the template (`spider.rigTemplates` key)

This means a plugin that wants to introduce a new kind of work — say, a `quality-audit` writ with its own multi-engine pipeline — can ship all the engine designs and block types it needs via kit contributions, but *cannot* wire them up without the guild owner editing config. The last mile is manual.

The goal is **plug-and-play work types**: a kit or apparatus can contribute a writ type, a rig template, and the mapping between them, so that installing the plugin is sufficient to make the new work type functional. Guild config retains override authority for any of these contributions.

## Key Features

### 1. Kit-contributed rig templates

Kits may contribute named rig templates via a `rigTemplates` field (a `Record<string, RigTemplate>`). The Spider consumes these, merging them into its template registry alongside config-defined templates.

**Follow the `roles` pattern from the Loom** for scoping, naming, and override semantics:

- Kit-contributed templates are namespace-qualified: `pluginId.templateName` (e.g., `quality-tools.audit`).
- Guild config templates (in `spider.rigTemplates`) are unqualified names.
- Guild config overrides kit contributions: if `spider.rigTemplates` defines a key matching a kit's qualified name, the config wins and the kit contribution is silently skipped.
- Dependency-scoped validation: a kit's rig template may only reference engine designIds from plugins declared in its `requires` or `recommends`, plus the Spider's own built-in engines.

The Spider declares `consumes: ['rigTemplates']` and scans kits at startup + subscribes to `plugin:initialized`, same as it does for `blockTypes`.

### 2. Kit-contributed writ types

Kits may contribute a `writTypes` field (an array of writ type descriptors, same shape as `clerk.writTypes` config entries). The Clerk consumes these, merging them with config-defined writ types.

- Kit-contributed writ type names are **not** namespace-qualified — they are user-facing names that appear on writs (e.g., `quality-audit`, not `quality-tools.quality-audit`). A kit contributing a writ type is asserting "this name should exist in this guild."
- Config-defined writ types override kit contributions with the same name.
- The Clerk declares `consumes: ['writTypes']`.

### 3. Kit-contributed rig template mappings

Kits may contribute a `rigTemplateMappings` field (a `Record<string, string>` mapping writ type → rig template name). The Spider consumes these.

- Values may reference any registered rig template name, including qualified kit-contributed names (e.g., `quality-tools.audit`).
- Guild config mappings override kit contributions for the same writ type.
- The Spider declares `consumes: ['rigTemplateMappings']` (or folds this into its existing `rigTemplates` consumption — planner's call on the cleanest approach).

### 4. Lookup changes

`lookupTemplate()` currently does a direct property lookup on `config.rigTemplates`. After this work, it needs to consult the merged registry: config-defined templates + kit-contributed templates + config mappings + kit-contributed mappings, with config winning on conflicts at every layer.

The `'default'` fallback template continues to work as today.

## The plug-and-play story

A plugin shipping all three contributions looks like:

```ts
export const plugin = {
  kit: {
    requires: ['spider', 'clerk'],
    // 1. New writ type
    writTypes: [{ name: 'quality-audit', description: 'Automated quality audit' }],
    // 2. Rig template for it
    rigTemplates: {
      audit: { engines: [/* ... */] },
    },
    // 3. Wire them together
    rigTemplateMappings: {
      'quality-audit': 'quality-tools.audit',
    },
  },
};
```

Installing this plugin is sufficient. No `guild.json` changes required. The guild owner *can* override any piece (swap in a different template, redefine the writ type, remap to a different template) via config, but doesn't have to.

## Out of scope

- Changes to engine design contribution (already works via Fabricator kits)
- Changes to block type contribution (already works)
- Any new writ lifecycle behavior — this is purely about type registration and rig template wiring
- Rig template inheritance or composition (templates are atomic)

## Validation

- Startup validation should cover the merged registries: duplicate detection, dangling references (mapping points to nonexistent template, template references nonexistent engine design), cycle detection in engine DAGs.
- Validation errors from kit contributions should identify the contributing kit in the error message (as the Loom does for role validation).

---

## Summary

Work shipped via writ w-mnowtmnp-fc9a5cc72898. This quest exists as a historical record of the design thinking that fed the commission.

## Notes

- 2026-04-10: migrated from scratch file .scratch/kit-contributed-rig-templates-brief.md to quest for historical preservation.
- 2026-04-10: marked complete and linked (fulfilled_by) to w-mnowtmnp-fc9a5cc72898.