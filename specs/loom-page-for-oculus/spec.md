---
author: plan-writer
estimated_complexity: 5
---

# Loom Page for Oculus

## Summary

Extend the Loom apparatus with a `listRoles()` API method, two patron-callable introspection tools (`loom-roles`, `loom-weave`), and a static HTML page contributed to the Oculus dashboard. The page displays all guild and kit-contributed roles and lets operators preview any role's resolved tool set, environment variables, and composed system prompt.

## Current State

The Loom (`packages/plugins/loom/src/loom.ts`) is an apparatus that composes session contexts. Its public API (`LoomApi`) currently exposes a single method:

```typescript
export interface LoomApi {
  weave(request: WeaveRequest): Promise<AnimaWeave>;
}
```

The apparatus stores role data in closure variables:
- `config: LoomConfig` — guild.json roles, keyed by simple name (e.g. `"artificer"`)
- `kitRoles: Map<string, RoleDefinition>` — kit-contributed roles, keyed by qualified name (e.g. `"animator.scribe"`)

The apparatus declaration is:
```typescript
apparatus: {
  requires: ['tools'],
  consumes: ['roles'],
  provides: api,
  start(ctx: StartupContext): void { ... },
}
```

There is no `recommends`, no `supportKit`, and no way to enumerate roles without already knowing their names. The Loom has `@shardworks/tools-apparatus` as a runtime dependency but currently only uses type-only imports from it.

The Oculus (`packages/plugins/oculus/src/oculus.ts`) scans apparatus `supportKit` for `pages` and `routes` contributions, serves static pages with chrome injection (nav bar + stylesheet), and auto-maps patron-callable tools to REST endpoints. No plugin currently contributes pages via `supportKit`.

## Requirements

- R1: The `LoomApi` interface must include a `listRoles(): RoleInfo[]` method that returns metadata for all registered roles (both guild-configured and kit-contributed).
- R2: `RoleInfo` must include `name` (the full qualified name matching what `weave()` accepts), `permissions` (string array), `strict` (optional boolean), and `source` (string: `'guild'` for guild roles, or the plugin ID for kit roles).
- R3: The Loom apparatus must declare `recommends: ['oculus']`.
- R4: The Loom apparatus must include a `supportKit` with a page contribution (`id: 'loom'`, `title: 'Roles'`, `dir: 'pages/loom'`) and two tools.
- R5: A tool named `loom-roles` must exist with no params, no `callableBy`, no `permission`, and return the output of `api.listRoles()`.
- R6: A tool named `loom-weave` must exist with param `role: z.string()`, no `callableBy`, no `permission`. It must call `api.weave({ role })` and return a JSON-serializable result where each tool in `AnimaWeave.tools` is mapped to `{ name, description, permission, pluginId }`.
- R7: A static page at `packages/plugins/loom/pages/loom/index.html` must be created. On load, it fetches `GET /api/loom/roles` and renders a role list table with columns: Name, Permissions (count), Strict, Source.
- R8: When the user clicks a role row, the page must fetch `GET /api/loom/weave?role=<name>` and display a detail panel below the table showing: the role's tools (table: Name, Permission, Plugin), environment variables (table: Variable, Value), and system prompt (collapsible `<details>` with `<pre>` content).
- R9: The page must use the Oculus shared CSS classes exclusively (`.card`, `.data-table`, `.badge`, `.badge--info`, `.empty-state`, etc.) with no custom CSS file.
- R10: When no roles exist, the page must show an empty-state message. When a role is selected, its row must be visually highlighted.

## Design

### Type Changes

Add `RoleInfo` to `packages/plugins/loom/src/loom.ts` in the public types section (after `AnimaWeave`):

```typescript
/** Metadata for a registered role, returned by listRoles(). */
export interface RoleInfo {
  /** Role name — the value you pass to weave({ role }). Qualified for kit roles (e.g. 'animator.scribe'). */
  name: string;
  /** Permission grants in plugin:level format. */
  permissions: string[];
  /** When true, permissionless tools are excluded unless the role grants plugin:* or *:*. */
  strict?: boolean;
  /** Source of the role definition: 'guild' for guild.json roles, or the plugin ID for kit-contributed roles. */
  source: string;
}
```

Extend `LoomApi` in the same file:

```typescript
export interface LoomApi {
  weave(request: WeaveRequest): Promise<AnimaWeave>;
  /** List all registered roles with their metadata. */
  listRoles(): RoleInfo[];
}
```

### Behavior

**`listRoles()` implementation** (inside the `api` object in `createLoom()`):

When called, the method iterates `config.roles` (guild-defined) and `kitRoles` (kit-contributed), building an array of `RoleInfo` objects:

- For each entry in `config.roles`: `name` is the key, `source` is `'guild'`.
- For each entry in `kitRoles`: `name` is the qualified key (e.g. `'animator.scribe'`), `source` is the plugin ID extracted as the substring before the first `.` in the key.
- `permissions` and `strict` are copied directly from the `RoleDefinition`.
- The method is synchronous — all data is cached in memory at startup.
- Guild roles appear first, followed by kit roles. No sorting beyond that.

**Import changes in `loom.ts`**:

Change the existing type-only import to include runtime imports:

```typescript
import type { InstrumentariumApi } from '@shardworks/tools-apparatus';
import { tool, type ResolvedTool } from '@shardworks/tools-apparatus';
```

Add zod import (needed for tool param schemas):

```typescript
import { z } from 'zod';
```

**Tool definitions** (inside `createLoom()`, after the `api` object, before the `return`):

`loom-roles`:
```typescript
const loomRolesTool = tool({
  name: 'loom-roles',
  description: 'List all roles and their configuration',
  params: {},
  handler: async () => api.listRoles(),
});
```

`loom-weave`:
```typescript
const loomWeaveTool = tool({
  name: 'loom-weave',
  description: 'Preview the weave result for a role',
  params: {
    role: z.string().describe('Role name to weave'),
  },
  handler: async ({ role }) => {
    const weave = await api.weave({ role });
    return {
      systemPrompt: weave.systemPrompt,
      tools: weave.tools?.map(t => ({
        name: t.definition.name,
        description: t.definition.description,
        permission: t.definition.permission,
        pluginId: t.pluginId,
      })),
      environment: weave.environment,
    };
  },
});
```

Both tools use no `callableBy` and no `permission`. Both reference `api` via closure (not `guild().apparatus()`).

**Apparatus declaration changes**:

```typescript
return {
  apparatus: {
    requires: ['tools'],
    recommends: ['oculus'],
    consumes: ['roles'],
    provides: api,

    supportKit: {
      tools: [loomRolesTool, loomWeaveTool],
      pages: [{ id: 'loom', title: 'Roles', dir: 'pages/loom' }],
    },

    start(ctx: StartupContext): void {
      // ... existing start logic unchanged ...
    },
  },
};
```

**`index.ts` export changes**:

Add `type RoleInfo` to the existing export block:

```typescript
export {
  type LoomApi,
  type WeaveRequest,
  type AnimaWeave,
  type LoomConfig,
  type RoleDefinition,
  type KitRoleDefinition,
  type LoomKit,
  type RoleInfo,
  createLoom,
} from './loom.ts';
```

**`package.json` changes**:

Update the `files` array:
```json
"files": [
  "dist",
  "pages"
]
```

### Page Implementation

Create `packages/plugins/loom/pages/loom/index.html` — a single HTML file with inline `<script>`. The Oculus injects the nav bar and `/static/style.css` link automatically via chrome injection.

The page structure:

```
<main style="padding: 24px;">
  <h1>Roles</h1>
  <div class="card" style="margin-bottom: 16px;">   <!-- role list card -->
    <table class="data-table">
      <thead><tr><th>Name</th><th>Permissions</th><th>Strict</th><th>Source</th></tr></thead>
      <tbody id="roles-body"><!-- populated by JS --></tbody>
    </table>
  </div>
  <div id="detail" style="display:none;">             <!-- detail panel, hidden until selection -->
    <!-- tools card, environment card, system prompt card -->
  </div>
</main>
```

JavaScript behavior:

1. **On `DOMContentLoaded`**: fetch `GET /api/loom/roles`. For each role, render a `<tr>` row:
   - Name column: role name as text.
   - Permissions column: `role.permissions.length` as a count (e.g. "3").
   - Strict column: "yes" or "no" (default to "no" when `strict` is undefined/false).
   - Source column: a `<span class="badge">` for `'guild'` source, `<span class="badge badge--info">` for kit sources, with the source string as text content.
   - Each row gets a click handler. When zero roles are returned, show `<tr><td colspan="4" class="empty-state">No roles configured.</td></tr>`.

2. **On row click**: highlight the clicked row (set `background: var(--surface2)` via inline style; clear highlight from previously selected row). Fetch `GET /api/loom/weave?role=<encodeURIComponent(role.name)>`. Show the `#detail` div and populate three sub-cards:

   - **Tools card** (`<div class="card" style="margin-bottom: 16px;">`): heading "Tools", `<table class="data-table">` with columns Name, Permission, Plugin. Each tool row shows `tool.name`, `tool.permission ?? '(none)'`, `tool.pluginId`. When no tools, show `<p class="empty-state">No tools resolved.</p>`.

   - **Environment card** (`<div class="card" style="margin-bottom: 16px;">`): heading "Environment", `<table class="data-table">` with columns Variable, Value. One row per entry in `environment`. When environment is undefined/empty, show `<p class="empty-state">No environment variables.</p>`.

   - **System Prompt card** (`<div class="card">`): heading "System Prompt", a `<details>` element with `<summary>` text like "Show system prompt ({length} chars)" and a `<pre><code>` block inside with the full system prompt text (HTML-escaped). When `systemPrompt` is undefined, show `<p class="empty-state">No system prompt composed.</p>`.

3. **HTML escaping**: the inline JS must include a helper function to escape `<`, `>`, `&`, `"` in dynamic content before inserting it into the DOM via `innerHTML`.

### Non-obvious Touchpoints

- `packages/plugins/loom/package.json` `"files"` array — must include `"pages"` alongside `"dist"` so the page assets are included in the published npm package.
- The Oculus tool-to-REST mapping (`toolNameToRoute` in `packages/plugins/oculus/src/oculus.ts`) maps `loom-roles` to `GET /api/loom/roles` and `loom-weave` to `GET /api/loom/weave`. The page's fetch URLs must match these exact paths.
- Tools with no `callableBy` pass the Oculus patron filter (`!r.definition.callableBy || r.definition.callableBy.includes('patron')` evaluates to `true` when `callableBy` is `undefined`), so both tools will be exposed as REST endpoints.

## Validation Checklist

- V1 [R1, R2]: After starting the Loom with guild-configured roles and kit-contributed roles, call `api.listRoles()` and verify it returns an array of `RoleInfo` objects. Each object must have `name`, `permissions` (array), and `source` (string). Guild roles must have `source: 'guild'`. Kit roles must have `source` equal to the plugin ID. Names must match what `weave()` accepts.

- V2 [R3]: Inspect the plugin returned by `createLoom()`. Verify `apparatus.recommends` is `['oculus']`.

- V3 [R4]: Inspect the plugin returned by `createLoom()`. Verify `apparatus.supportKit.pages` is `[{ id: 'loom', title: 'Roles', dir: 'pages/loom' }]`. Verify `apparatus.supportKit.tools` contains two tool definitions.

- V4 [R5]: Find the `loom-roles` tool in `apparatus.supportKit.tools`. Verify it has no `callableBy`, no `permission`. Call its handler with `{}` and verify the result matches `api.listRoles()` output.

- V5 [R6]: Find the `loom-weave` tool. Verify params has `role: z.string()`. Call its handler with `{ role: '<valid-role>' }`. Verify the result has `systemPrompt` (string or undefined), `tools` (array of `{ name, description, permission, pluginId }` or undefined), and `environment` (object or undefined). Verify no Zod schemas or function references appear in the result (JSON-serializable).

- V6 [R7, R10]: Verify `packages/plugins/loom/pages/loom/index.html` exists. Open the page in a browser (with Oculus running). Verify the role list table renders with columns Name, Permissions, Strict, Source. Verify source badges use the correct classes. With no roles configured, verify the empty-state message appears.

- V7 [R8]: Click a role row. Verify the detail panel appears with three sections: tools table (Name, Permission, Plugin), environment table (Variable, Value), and system prompt in a collapsible `<details>` element.

- V8 [R9]: Inspect the page HTML source. Verify no `<link>` to a custom CSS file and no `<style>` blocks (other than minimal inline styles for the selected-row highlight). All visual styling must use the Oculus shared classes.

- V9 [R10]: With roles present, click different rows and verify the previously selected row loses its highlight while the newly selected row gains it.

- V10 [R1]: Run existing loom tests (`pnpm --filter @shardworks/loom-apparatus test`). Verify all existing tests still pass — `listRoles()` must not affect `weave()` behavior.

## Test Cases

**listRoles() — guild roles only:**
Set up guild with `loomConfig: { roles: { artificer: { permissions: ['*:*'] }, scribe: { permissions: ['stdlib:read'], strict: true } } }`. Start the Loom. Call `api.listRoles()`. Expect two entries: `{ name: 'artificer', permissions: ['*:*'], source: 'guild' }` (no `strict` or `strict: undefined`) and `{ name: 'scribe', permissions: ['stdlib:read'], strict: true, source: 'guild' }`.

**listRoles() — kit roles only:**
Set up guild with no loom config. Load a kit with id `'spider'` contributing roles `{ crawler: { permissions: ['spider:read'] } }`. Start the Loom. Call `api.listRoles()`. Expect one entry: `{ name: 'spider.crawler', permissions: ['spider:read'], source: 'spider' }`.

**listRoles() — mixed guild and kit roles:**
Set up guild with one guild role and one kit role. Start the Loom. Call `api.listRoles()`. Expect guild role to have `source: 'guild'` and kit role to have `source` equal to the contributing plugin's ID.

**listRoles() — no roles:**
Set up guild with no roles configured. Start the Loom. Call `api.listRoles()`. Expect empty array `[]`.

**listRoles() — guild override of kit role:**
Set up guild with `loomConfig: { roles: { 'spider.crawler': { permissions: ['*:*'] } } }` and a kit with `id: 'spider'` contributing roles `{ crawler: { permissions: ['spider:read'] } }`. Start the Loom. Call `api.listRoles()`. Expect one entry with `name: 'spider.crawler'`, `source: 'guild'`, `permissions: ['*:*']` (guild override wins; kit version is not registered).

**loom-roles tool:**
Start the Loom with roles configured. Find the `loom-roles` tool in `supportKit.tools`. Call `handler({})`. Verify the result equals `api.listRoles()`.

**loom-weave tool — serialization:**
Start the Loom with a role that resolves tools (use a mock Instrumentarium returning tools with Zod params and handlers). Find the `loom-weave` tool. Call `handler({ role: '<role-name>' })`. Verify the result has `tools` as an array of plain objects `{ name, description, permission, pluginId }` with no Zod or function references. Verify `systemPrompt` and `environment` are present.

**loom-weave tool — unknown role:**
Call `handler({ role: 'nonexistent' })`. Expect result with `systemPrompt: undefined`, `tools: undefined`, and `environment` containing the derived git identity (since weave() derives environment from any role name, even undefined ones).

**apparatus shape:**
Verify `createLoom()` returns `{ apparatus: { requires: ['tools'], recommends: ['oculus'], consumes: ['roles'], provides: <LoomApi>, supportKit: { tools: [<2 tools>], pages: [<1 page>] } } }`.
