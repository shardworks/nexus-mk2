---
author: plan-writer
estimated_complexity: 5
---

# Kit-Contributed Roles

## Summary

Enable kits and apparatus supportKits to contribute role definitions via a `roles` field on their kit manifest. The Loom scans these contributions at startup, qualifies them as `{pluginId}.{roleName}`, validates their permissions against declared dependencies, and resolves them in `weave()` alongside guild-defined roles.

## Current State

The Loom (`packages/plugins/loom/src/loom.ts`) owns role definitions and session context composition. Today, all roles come from `guild.json` under the `loom` key:

```json
{
  "loom": {
    "roles": {
      "artificer": { "permissions": ["stacks:read", "stacks:write"] },
      "scribe": { "permissions": ["stacks:read"], "strict": true }
    }
  }
}
```

The current types:

```typescript
export interface RoleDefinition {
  permissions: string[];
  strict?: boolean;
}

export interface LoomConfig {
  roles?: Record<string, RoleDefinition>;
}
```

At startup, `start()` reads `guild().guildConfig().loom ?? {}` into `config`, then reads role instruction files from `{guild.home}/roles/{roleName}.md` for each key in `config.roles`. During `weave()`, the role name from `WeaveRequest.role` is looked up in `config.roles` for permissions/strict, and in a `roleInstructions` Map for system prompt content.

The Loom's apparatus declaration:

```typescript
apparatus: {
  requires: ['tools'],
  provides: api,
  start(_ctx: StartupContext): void { ... },
}
```

It has no `consumes` declaration and does not use `ctx.on()`.

The barrel export (`packages/plugins/loom/src/index.ts`) exports `LoomApi`, `WeaveRequest`, `AnimaWeave`, `LoomConfig`, `RoleDefinition`, `createLoom`, augments `GuildConfig` with `loom?: LoomConfig`, and default-exports `createLoom()`.

## Requirements

- R1: Kits contribute roles via a `roles: Record<string, KitRoleDefinition>` field on the kit manifest, where each key is an unqualified role name.
- R2: Kit-contributed roles are registered under the qualified name `{pluginId}.{roleName}` (dot separator). Kit authors specify only the short name; the Loom qualifies it at registration time.
- R3: Each `KitRoleDefinition` carries `permissions: string[]`, and optionally `strict?: boolean`, `instructions?: string`, or `instructionsFile?: string` (relative to the kit's npm package directory).
- R4: When both `instructions` and `instructionsFile` are present on a kit role, `instructions` takes precedence and `instructionsFile` is ignored.
- R5: Kit role `instructionsFile` is resolved to `path.join(guild.home, 'node_modules', kit.packageName, instructionsFile)` and read at registration time. When the file cannot be read, a warning is emitted and the role is registered without instructions.
- R6: Kit role permissions are dependency-scoped: only permissions whose plugin ID prefix matches the kit's own plugin ID, or a plugin ID in the kit's `requires` or `recommends`, are kept. All others — including `*`-prefixed wildcards (`*:*`, `*:level`) — produce a startup warning and are dropped from the role's effective permissions.
- R7: Permissions without a colon (malformed) are dropped with a warning.
- R8: A guild-defined role in `config.roles` (from `guild.json`) with the same qualified name as a kit-contributed role fully overrides the kit-contributed role. No merging. Override is checked both at registration time (skip registration) and at weave time (guild lookup takes precedence).
- R9: The Loom scans `guild().kits()` and `guild().apparatuses()` at startup, then subscribes to `plugin:initialized` for apparatus supportKits that start after it. Standalone kits and already-started apparatus are scanned synchronously in `start()`; the event handler processes only `isLoadedApparatus` entries.
- R10: The Loom declares `consumes: ['roles']` on its apparatus.
- R11: Malformed kit role contributions (non-object `roles` field, role entries missing `permissions`) are skipped. Missing `permissions` produces a `console.warn`; non-object types are silently skipped.
- R12: `KitRoleDefinition` and `LoomKit` types are exported from `@shardworks/loom-apparatus` for kit author type safety.
- R13: Git identity derivation applies the existing logic to the full qualified name with no special handling. `weave({ role: 'my-kit.artificer' })` produces `GIT_AUTHOR_NAME: 'My-kit.artificer'`, `GIT_AUTHOR_EMAIL: 'my-kit.artificer@nexus.local'`.
- R14: Kit role instructions are cached in the same `roleInstructions` Map as guild role instructions, keyed by the qualified name. They appear in the system prompt's role-instructions layer during `weave()`.

## Design

### Type Changes

Add to `packages/plugins/loom/src/loom.ts`:

```typescript
/** Role definition contributed by a kit or apparatus supportKit. */
export interface KitRoleDefinition {
  /** Permission grants in `plugin:level` format. */
  permissions: string[];
  /**
   * When true, permissionless tools are excluded unless the role grants
   * `plugin:*` or `*:*` for the tool's plugin. Default: false.
   */
  strict?: boolean;
  /** Inline role instructions injected into the system prompt. */
  instructions?: string;
  /**
   * Path to an instructions file, relative to the kit's npm package root.
   * Resolved at registration time. Mutually exclusive with `instructions`
   * (if both are present, `instructions` wins).
   */
  instructionsFile?: string;
}

/** Kit contribution interface for role definitions. */
export interface LoomKit {
  roles?: Record<string, KitRoleDefinition>;
}
```

The existing `RoleDefinition`, `LoomConfig`, `WeaveRequest`, `AnimaWeave`, and `LoomApi` types are unchanged.

### Behavior

#### New internal state

Inside `createLoom()`, add alongside the existing `config`, `charterContent`, and `roleInstructions` variables:

```typescript
let kitRoles: Map<string, RoleDefinition> = new Map();
```

This map stores kit-contributed roles keyed by their qualified name (`{pluginId}.{roleName}`). The values are `RoleDefinition` (not `KitRoleDefinition`) because instructions are consumed at registration time and cached in `roleInstructions` — the role's runtime representation only needs `permissions` and `strict`.

#### Modified apparatus declaration

```typescript
apparatus: {
  requires: ['tools'],
  consumes: ['roles'],
  provides: api,

  start(ctx: StartupContext): void {
    // ... existing config/charter/guild-role logic unchanged ...

    // Kit role scanning (new)
    // ... see below ...
  },
},
```

#### Registration function

Add a helper function inside `createLoom()` (before the `api` definition or after it, alongside the apparatus — follows the flat function style of the existing code, not a class):

```typescript
function registerKitRoles(
  pluginId: string,
  packageName: string,
  kit: Record<string, unknown>,
  home: string,
): void {
  const rawRoles = kit.roles;
  if (typeof rawRoles !== 'object' || rawRoles === null || Array.isArray(rawRoles)) return;

  // Compute allowed plugin IDs for dependency-scoped validation
  const allowedPlugins = new Set<string>([
    pluginId,
    ...((kit.requires as string[] | undefined) ?? []),
    ...((kit.recommends as string[] | undefined) ?? []),
  ]);

  for (const [roleName, rawDef] of Object.entries(rawRoles as Record<string, unknown>)) {
    // Skip non-object entries silently
    if (typeof rawDef !== 'object' || rawDef === null || Array.isArray(rawDef)) continue;

    const def = rawDef as Record<string, unknown>;

    // Validate permissions field exists and is an array
    if (!Array.isArray(def.permissions)) {
      console.warn(
        `[loom] Kit "${pluginId}" role "${roleName}" is missing required "permissions" array — skipped`,
      );
      continue;
    }

    const qualifiedName = `${pluginId}.${roleName}`;

    // Guild override check at registration time — skip if guild defines this role
    if (config.roles && config.roles[qualifiedName]) continue;

    // Dependency-scoped permission filtering
    const validPermissions: string[] = [];
    for (const perm of def.permissions as string[]) {
      if (typeof perm !== 'string') continue;
      const colonIdx = perm.indexOf(':');
      if (colonIdx === -1) {
        console.warn(
          `[loom] Kit "${pluginId}" role "${roleName}" permission "${perm}" has no colon separator — dropped`,
        );
        continue;
      }
      const permPluginId = perm.slice(0, colonIdx);
      if (permPluginId === '*' || !allowedPlugins.has(permPluginId)) {
        console.warn(
          `[loom] Kit "${pluginId}" role "${roleName}" permission "${perm}" references undeclared plugin "${permPluginId}" — dropped`,
        );
        continue;
      }
      validPermissions.push(perm);
    }

    // Register the role
    kitRoles.set(qualifiedName, {
      permissions: validPermissions,
      ...(def.strict === true ? { strict: true } : {}),
    });

    // Resolve instructions — inline takes precedence over file
    if (typeof def.instructions === 'string' && def.instructions) {
      roleInstructions.set(qualifiedName, def.instructions);
    } else if (typeof def.instructionsFile === 'string' && def.instructionsFile) {
      const filePath = path.join(home, 'node_modules', packageName, def.instructionsFile);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content) {
          roleInstructions.set(qualifiedName, content);
        }
      } catch {
        console.warn(
          `[loom] Could not read instructions file for kit "${pluginId}" role "${roleName}": ${filePath}`,
        );
      }
    }
  }
}
```

#### Modified `start()` logic

After the existing guild role instructions loop (which reads `roles/{roleName}.md`), add kit role scanning:

```typescript
start(ctx: StartupContext): void {
  const g = guild();
  config = g.guildConfig().loom ?? {};
  const home = g.home;

  // ... existing charter reading logic (unchanged) ...

  // Read role instruction files at startup for all configured (guild) roles.
  roleInstructions = new Map();
  if (config.roles) {
    for (const roleName of Object.keys(config.roles)) {
      const rolePath = path.join(home, 'roles', `${roleName}.md`);
      try {
        const content = fs.readFileSync(rolePath, 'utf-8');
        if (content) {
          roleInstructions.set(roleName, content);
        }
      } catch {
        // File doesn't exist — silently omit.
      }
    }
  }

  // ── Kit role scanning (new) ──────────────────────────────────
  kitRoles = new Map();

  // Phase 1a: Scan all already-loaded standalone kits.
  for (const kit of g.kits()) {
    registerKitRoles(kit.id, kit.packageName, kit.kit, home);
  }

  // Phase 1b: Scan already-started apparatus for supportKit roles.
  // The Loom requires ['tools'], so apparatus that started before it
  // (e.g. Instrumentarium) have already fired plugin:initialized.
  for (const app of g.apparatuses()) {
    if (app.apparatus.supportKit) {
      registerKitRoles(app.id, app.packageName, app.apparatus.supportKit, home);
    }
  }

  // Phase 2: Subscribe to plugin:initialized for apparatus supportKits
  // that start after the Loom in the dependency order.
  ctx.on('plugin:initialized', (plugin: unknown) => {
    const loaded = plugin as LoadedPlugin;
    if (isLoadedApparatus(loaded) && loaded.apparatus.supportKit) {
      registerKitRoles(loaded.id, loaded.packageName, loaded.apparatus.supportKit, home);
    }
  });
},
```

This requires adding imports at the top of `loom.ts`:

```typescript
import type { Plugin, StartupContext, LoadedPlugin } from '@shardworks/nexus-core';
import { guild, isLoadedApparatus } from '@shardworks/nexus-core';
```

(Change: `LoadedPlugin` added to the type import; `isLoadedApparatus` added to the value import.)

#### Modified `weave()` logic

The role lookup in `weave()` changes from a single `config.roles` check to a two-step lookup:

```typescript
async weave(request: WeaveRequest): Promise<AnimaWeave> {
  const weave: AnimaWeave = {};

  // Resolve tools if a role is provided and has a definition.
  // Guild-defined roles take precedence over kit-contributed roles.
  if (request.role) {
    const roleDef = config.roles?.[request.role] ?? kitRoles.get(request.role);
    if (roleDef) {
      try {
        const instrumentarium = guild().apparatus<InstrumentariumApi>('tools');
        weave.tools = instrumentarium.resolve({
          permissions: roleDef.permissions,
          strict: roleDef.strict,
          caller: 'anima',
        });
      } catch {
        // Instrumentarium not installed — no tools.
      }
    }
  }

  // ... git identity derivation (unchanged) ...
  // ... system prompt composition (unchanged — roleInstructions.get(request.role) works
  //     for both guild and kit roles since both are cached in the same Map) ...
}
```

The key change: `config.roles?.[request.role] ?? kitRoles.get(request.role)`. The optional chaining + nullish coalescing gives guild roles precedence. If `config.roles` is undefined or doesn't contain the role, `kitRoles` is checked.

The git identity derivation and system prompt composition are completely unchanged — they already use `request.role` as the lookup key in `roleInstructions`, and kit role instructions are stored under the qualified name.

### Updated barrel export

In `packages/plugins/loom/src/index.ts`, add the new type exports:

```typescript
export {
  type LoomApi,
  type WeaveRequest,
  type AnimaWeave,
  type LoomConfig,
  type RoleDefinition,
  type KitRoleDefinition,
  type LoomKit,
  createLoom,
} from './loom.ts';
```

### Non-obvious Touchpoints

1. **Import additions in `loom.ts`:** The existing import `import type { Plugin, StartupContext } from '@shardworks/nexus-core'` must be expanded to include `LoadedPlugin` (type import) and the value import must add `isLoadedApparatus` alongside `guild`. These are already exported from `@shardworks/nexus-core`'s barrel (`packages/framework/core/src/index.ts`).

2. **The `_ctx` parameter rename:** The current `start(_ctx: StartupContext)` uses an underscore prefix because the parameter was unused. It must be renamed to `ctx` since it's now used for `ctx.on('plugin:initialized', ...)`.

## Validation Checklist

- V1 [R1, R2]: Create a mock `LoadedKit` with `kit: { roles: { crawler: { permissions: ['spider:read'] } } }` and id `spider`. After the Loom starts with this kit in `guild().kits()`, call `weave({ role: 'spider.crawler' })`. Verify `weave.tools` is resolved using the `['spider:read']` permissions.

- V2 [R3, R4, R14]: Create a kit role with `instructions: 'Inline text'` and verify `weave({ role: '<qualified>' }).systemPrompt` includes `'Inline text'`. Create another with `instructionsFile: './role.md'`, write a file at the resolved path, verify it appears in the system prompt. Create a third with both fields; verify `instructions` wins.

- V3 [R5]: Create a kit role with `instructionsFile: './missing.md'` where the file does not exist. Verify the role is registered (tool resolution works), a warning is emitted, and `systemPrompt` does not include role instructions.

- V4 [R6, R7]: Create a kit with `id: 'foo'`, `requires: ['bar']`, `recommends: ['baz']`, and a role with permissions `['foo:read', 'bar:write', 'baz:admin', 'unknown:read', '*:*', 'nocolon']`. Verify only `['foo:read', 'bar:write', 'baz:admin']` survive. Verify three warnings are emitted (for `unknown:read`, `*:*`, `nocolon`).

- V5 [R8]: Define a guild role `loom.roles['my-kit.artificer']` and a kit role from kit `my-kit` with role name `artificer`. Verify `weave({ role: 'my-kit.artificer' })` uses the guild-defined permissions, not the kit's. Verify the kit's `instructionsFile` is never read (registration skipped).

- V6 [R9]: Set up a mock where `guild().apparatuses()` returns an apparatus with `supportKit: { roles: { helper: { permissions: ['tools:read'] } } }` (simulating an apparatus that started before the Loom). Verify `weave({ role: 'tools.helper' })` resolves correctly. Separately, fire a `plugin:initialized` event with a `LoadedApparatus` containing supportKit roles and verify those roles become available.

- V7 [R10]: Inspect the apparatus declaration returned by `createLoom()` and verify `consumes` is `['roles']`.

- V8 [R11]: Set up a kit with `roles: 'not-an-object'` — verify no crash, no registered roles. Set up a kit with `roles: { bad: { strict: true } }` (missing permissions) — verify a warning is emitted and the role is skipped.

- V9 [R12]: Verify `KitRoleDefinition` and `LoomKit` are importable from `@shardworks/loom-apparatus` (check `index.ts` exports).

- V10 [R13]: Call `weave({ role: 'my-kit.artificer' })` with a kit-contributed role. Verify `environment.GIT_AUTHOR_NAME` is `'My-kit.artificer'` and `environment.GIT_AUTHOR_EMAIL` is `'my-kit.artificer@nexus.local'`.

## Test Cases

**Happy path — kit contributes a role, weave resolves it:**
A kit with `id: 'spider'` contributes `{ roles: { crawler: { permissions: ['spider:read'] } } }`. After startup, `weave({ role: 'spider.crawler' })` resolves tools using `['spider:read']` permissions with `caller: 'anima'`. Verify tools are returned on the weave.

**Happy path — kit role with inline instructions:**
Kit contributes a role with `instructions: 'You are a crawler.'`. `weave({ role: '<qualified>' }).systemPrompt` contains `'You are a crawler.'` in the role-instructions position (after charter and tool instructions).

**Happy path — kit role with instructionsFile:**
Kit contributes a role with `instructionsFile: './roles/crawler.md'`. The file at `{guildHome}/node_modules/{packageName}/roles/crawler.md` contains `'Crawl instructions.'`. After startup, `weave().systemPrompt` includes `'Crawl instructions.'`.

**Happy path — apparatus supportKit contributes roles:**
An apparatus with `supportKit: { roles: { helper: { permissions: ['tools:read'] } } }` and `id: 'tools'` is in `guild().apparatuses()`. After Loom startup, `weave({ role: 'tools.helper' })` resolves correctly.

**Happy path — plugin:initialized delivers apparatus supportKit roles:**
An apparatus fires `plugin:initialized` after the Loom subscribes. Its `supportKit` has `{ roles: { late: { permissions: ['late:read'] } } }`. `weave({ role: 'late.late' })` resolves correctly.

**Guild override — guild role takes precedence:**
Guild defines `loom.roles['my-kit.artificer'] = { permissions: ['*:*'] }`. Kit `my-kit` contributes `{ roles: { artificer: { permissions: ['my-kit:read'] } } }`. `weave({ role: 'my-kit.artificer' })` uses the guild permissions `['*:*']`, not the kit's `['my-kit:read']`.

**Guild override — kit instructions not loaded when guild overrides:**
Same setup as above but kit role has `instructionsFile: './role.md'`. Verify the file is never read (no fs access for the overridden kit role).

**Permission scoping — valid permissions kept:**
Kit `foo` with `requires: ['bar']`, `recommends: ['baz']` contributes a role with permissions `['foo:read', 'bar:write', 'baz:admin']`. All three survive.

**Permission scoping — undeclared plugin dropped with warning:**
Kit `foo` (no requires/recommends) contributes a role with permissions `['foo:read', 'other:write']`. Only `['foo:read']` survives. A warning is emitted for `other:write`.

**Permission scoping — wildcard prefix blocked:**
Kit contributes a role with permission `['*:*']`. The permission is dropped with a warning. Kit contributes `['*:read']`. Also dropped.

**Permission scoping — malformed permission (no colon) dropped:**
Kit contributes a role with permission `['nocolon']`. Dropped with a warning.

**Malformed roles field — non-object skipped silently:**
Kit has `roles: 'not-an-object'`. No crash, no roles registered.

**Malformed role entry — missing permissions warned:**
Kit has `roles: { bad: { strict: true } }`. Warning emitted, `bad` not registered.

**Malformed role entry — non-object value skipped silently:**
Kit has `roles: { bad: 42 }`. No crash, no warning, `bad` not registered.

**instructions takes precedence over instructionsFile:**
Kit role has both `instructions: 'Inline'` and `instructionsFile: './file.md'`. System prompt contains `'Inline'`, file is never read.

**instructionsFile not found — warn, register without instructions:**
Kit role has `instructionsFile: './missing.md'`. Role is registered (tool resolution works). Warning is emitted. `systemPrompt` has no role instructions layer for this role.

**Namespacing — two kits define same short name:**
Kit `a` defines `{ roles: { helper: ... } }`, kit `b` defines `{ roles: { helper: ... } }`. Both register as `a.helper` and `b.helper` respectively. No collision.

**No kit roles — existing behavior unchanged:**
No kits contribute roles. Guild roles resolve exactly as before. All existing tests pass.

**consumes declaration present:**
`createLoom()` apparatus has `consumes: ['roles']`.

**weave() with unknown role — returns no tools (existing behavior preserved):**
`weave({ role: 'nonexistent' })` returns `tools: undefined`, same as today.

**Startup caching — kit role instructions cached at registration time:**
Kit role with `instructionsFile` is registered. Delete the file after startup. `weave()` still includes the instructions (cached at registration).