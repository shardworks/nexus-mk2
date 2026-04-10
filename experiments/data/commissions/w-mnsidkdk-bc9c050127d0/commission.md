## Opened With

Historical scratch file preserved for the record. Originally drafted in `.scratch/kit-contributed-roles.md`:

---

# Kit-Contributed Roles

## Problem

Roles are guild-only: defined in `guild.json`, instructions hard-coded as flat files. Plugins that ship tools, engines, or other components have no way to bundle purpose-built roles alongside them.

## Requirements

1. Kits may contribute roles via a `roles` field on the kit manifest.
2. Kit-contributed roles are namespaced: `{pluginId}.{roleName}`. The Loom resolves them by that qualified name. Plugin others only specify the roleName, and the loom applies the plugin namespace automatically.
3. Each contributed role carries `permissions`, and optionally `strict`, `instructions` (string), or `instructionsFile` (path relative to the kit's npm package directory).
4. Kit-contributed role permissions are **dependency-scoped**: a kit may only grant permissions referencing its own plugin ID, or plugin IDs declared in its `requires` or `recommends`. Permissions referencing undeclared plugins produce a startup warning and are dropped.
5. A guild-defined role in `loom.roles` with the same qualified name fully overrides the kit-contributed role — no merging.
6. The Loom scans `guild().kits()` at startup and subscribes to `plugin:initialized` for apparatus `supportKit` roles, following the established kit-consumption pattern.

---

## Summary

Work shipped via writ w-mnomti26-1cff6a869889. This quest exists as a historical record of the design thinking that fed the commission.

## Notes

- 2026-04-10: migrated from scratch file .scratch/kit-contributed-roles.md to quest for historical preservation.
- 2026-04-10: marked complete and linked (fulfilled_by) to w-mnomti26-1cff6a869889.