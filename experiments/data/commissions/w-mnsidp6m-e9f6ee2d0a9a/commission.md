## Opened With

Historical scratch file preserved for the record. Originally drafted in `.scratch/fix-apparatuses-returns-unstarted.md`:

---

# Fix: Startup Lifecycle Phases and Unified Kit Wiring

## Problem

Six apparatuses independently implement a scan+subscribe pattern to discover contributions from other plugins. This pattern is fragile — `g.apparatuses()` returns unstarted apparatuses, causing double-registration. Visible symptom: duplicate pages in the Oculus nav bar.

Deeper issue: there are two kinds of contribution bundles — standalone kit plugins (`plugin.kit`) and apparatus sidecars (`plugin.apparatus.supportKit`) — but they contain the same things (tools, pages, routes, engines, roles, etc.) and every consumer treats them identically. The kit/supportKit distinction is about packaging, not semantics.

## Design: Unified Kits and Lifecycle Phases

### Unify kits and supportKits

A kit is a kit. Whether it ships as a standalone plugin or as an apparatus sidecar, the contents are the same and consumers process them the same way. Arbor merges both into a single collection during a Wire phase before any apparatus starts.

```
LOAD  →  WIRE  →  START
```

**Load** (unchanged): Plugins discovered, validated, topologically sorted.

**Wire** (new): Arbor iterates all plugins and collects every kit contribution — from both standalone kit plugins and apparatus supportKits — into a flat list of `KitEntry` records. This happens before any `start()`.

**Start** (unchanged): Each apparatus runs `start()` in dependency order. All kit contributions are already available.

### KitEntry

```typescript
interface KitEntry {
  pluginId: string;
  packageName: string;
  /** The contribution key: 'tools', 'pages', 'routes', 'engines', 'roles', etc. */
  type: string;
  /** The contributed value — an array of tool defs, page defs, etc. */
  value: unknown;
}
```

During Wire, Arbor does one pass:

```typescript
const kitEntries: KitEntry[] = [];

for (const plugin of [...kits, ...orderedApparatuses]) {
  const bag = 'kit' in plugin ? plugin.kit : plugin.apparatus?.supportKit;
  if (!bag || typeof bag !== 'object') continue;

  for (const [type, value] of Object.entries(bag)) {
    kitEntries.push({ pluginId: plugin.id, packageName: plugin.packageName, type, value });
  }
}
```

Exposed on `StartupContext`:

```typescript
interface StartupContext {
  on(event: string, handler: Function): void;

  /** All kit contributions collected during Wire, queryable by type. */
  kits(type: string): KitEntry[];
}
```

Arbor doesn't know what a "page" or "engine" is. It just collects and indexes. Each consumer interprets its own contribution type.

### Consumer changes

Each apparatus replaces scan+subscribe with one `ctx.kits()` call:

**Oculus** (pages + routes):

```typescript
// Before (scan+subscribe — two code paths):
for (const app of g.apparatuses()) { scanApparatus(app); }
for (const kit of g.kits()) { scanKit(kit); }
ctx.on('plugin:initialized', (p) => { scan(p); });

// After (one query):
for (const entry of ctx.kits('pages')) {
  for (const page of entry.value as PageContribution[]) {
    registerPage(page, resolveDirForPackage(entry.packageName, page.dir));
  }
}
for (const entry of ctx.kits('routes')) {
  for (const route of entry.value as RouteContribution[]) {
    registerCustomRoute(route, entry.pluginId);
  }
}
```

Same pattern for Instrumentarium (`ctx.kits('tools')`), Fabricator (`ctx.kits('engines')`), Loom (`ctx.kits('roles')`), Spider (`ctx.kits('engines')`, `ctx.kits('rigTemplates')`, `ctx.kits('blockTypes')`), Clerk (`ctx.kits('writTypes')`).

### Events

**`plugin:initialized`** stays but gets renamed to `apparatus:started`. Its purpose is narrowed: it's for apparatus-to-apparatus coordination that genuinely depends on another apparatus having completed `start()` (e.g., CDC watcher registration). It is NOT for contribution discovery — that's the Wire phase.

Fire both old and new event names for one release cycle with a deprecation warning on the old name.

**`phase:started`** (new): Fires once after all apparatuses complete `start()`. Useful for post-startup work. The guild is fully operational at this point.

### Kit authoring constraint

SupportKit (and kit plugin) contributions are read during Wire, before any apparatus `start()`. Definitions must be self-contained:

- **No `guild()`** — the singleton isn't set yet
- **No guild config access** — not available during Wire
- **No `apparatus()` calls** — nothing has started
- **No filesystem access relative to guild home** — you don't know it yet

This applies to the *declarations* (tool name, params, description, page id/title/dir), not to *handlers*. Tool handler functions are closures that execute at invocation time, long after startup — they have full access to guild state.

In practice this isn't a new constraint — every existing supportKit is already a static object literal or imported constant. No one computes supportKit entries dynamically today. But it should be documented.

## Requirements

- R1: Arbor must collect all kit contributions (from both kit plugins and apparatus supportKits) into a flat `KitEntry[]` during a Wire phase, before any `start()`.
- R2: `StartupContext` must expose `kits(type: string): KitEntry[]` for querying contributions by type.
- R3: Wire must handle both `plugin.kit` (standalone kit plugins) and `plugin.apparatus.supportKit` (apparatus sidecars) uniformly.
- R4: `g.apparatuses()` must only return apparatuses that have completed `start()`.
- R5: Rename `plugin:initialized` to `apparatus:started`. Fire both names during a deprecation period, logging a warning on the old name.
- R6: Add `phase:started` event, fired once after all apparatus `start()` calls complete.
- R7: Oculus must replace scan+subscribe with `ctx.kits('pages')` and `ctx.kits('routes')`.
- R8: Instrumentarium must replace scan+subscribe with `ctx.kits('tools')`.
- R9: Fabricator must replace scan+subscribe with `ctx.kits('engines')`.
- R10: Loom must replace scan+subscribe with `ctx.kits('roles')`.
- R11: Spider must replace scan+subscribe with `ctx.kits('engines')`, `ctx.kits('rigTemplates')`, and `ctx.kits('blockTypes')`.
- R12: Clerk must replace scan+subscribe with `ctx.kits('writTypes')`.
- R13: All existing tests pass.
- R14: New tests verify: (a) `ctx.kits()` returns contributions from both kit plugins and apparatus supportKits, (b) `g.apparatuses()` excludes unstarted apparatuses, (c) no contribution is delivered twice, (d) kit entries are available during `start()`.

## Scope Notes

- **Books excluded** from `KitEntry` collection — Stacks handles book registration through its own mechanism.
- **The `kits()` method on the guild instance** (`g.kits()`) continues to return standalone kit plugins only. The new `ctx.kits(type)` on `StartupContext` is the unified query. These serve different purposes — `g.kits()` is "what kit plugins are installed", `ctx.kits(type)` is "what contributions exist."

---

## Summary

Work shipped via writ w-mnp6guxn-40b6c6b5f896. This quest exists as a historical record of the design thinking that fed the commission.

## Notes

- 2026-04-10: migrated from scratch file .scratch/fix-apparatuses-returns-unstarted.md to quest for historical preservation.
- 2026-04-10: marked complete and linked (fulfilled_by) to w-mnp6guxn-40b6c6b5f896.