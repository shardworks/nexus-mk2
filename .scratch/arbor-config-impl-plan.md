# Implementation Plan: Plugin Config API + Name Derivation

**Context:** Adds `ctx.config<T>(pluginId?)` and `ctx.guildConfig()` to `GuildContext` and `HandlerContext`, and updates `derivePluginId` to strip `-(plugin|apparatus|kit)` suffixes. Spec is in `docs/architecture/plugins.md` (Plugin IDs section + Configuration section).

---

## Files to Change

### 1. `packages/arbor/src/resolve-package.ts`

Update `derivePluginId` to strip trailing `-(plugin|apparatus|kit)` after scope stripping:

```typescript
export function derivePluginId(packageName: string): string {
  // Step 1: strip scope
  let name: string
  if (packageName.startsWith('@shardworks/')) {
    name = packageName.slice('@shardworks/'.length)
  } else if (packageName.startsWith('@')) {
    name = packageName.slice(1)         // @acme/foo → acme/foo
  } else {
    name = packageName
  }
  // Step 2: strip descriptor suffix
  return name.replace(/-(plugin|apparatus|kit)$/, '')
}
```

Update the JSDoc to reflect the new rule.

**Regression risk:** Any existing plugin whose id currently ends in `-kit`, `-apparatus`, or `-plugin` will get a new derived id. Audit `packages/` for package names matching these patterns before shipping. In the current codebase, none of the `@shardworks/nexus-*` packages have these suffixes, so impact should be zero.

---

### 2. `packages/core/src/plugin.ts`

Update `GuildContext` and `HandlerContext` interfaces. `GuildConfigV2` will need to be imported from `packages/core/src/guild-config.ts`.

**GuildContext** — add `home`, `config`, `guildConfig`; update `on` handler type to allow `Promise<void>`:

```typescript
export interface GuildContext {
  home:       string
  config<T = Record<string, unknown>>(pluginId?: string): T
  guildConfig(): GuildConfigV2
  apparatus<T>(name: string): T
  kits():        LoadedKit[]
  apparatuses(): LoadedApparatus[]
  plugins():     LoadedPlugin[]
  on(event: string, handler: (...args: unknown[]) => void | Promise<void>): void
}
```

**HandlerContext** — add `config`, `guildConfig`:

```typescript
export interface HandlerContext {
  home:       string
  config<T = Record<string, unknown>>(pluginId?: string): T
  guildConfig(): GuildConfigV2
  apparatus<T>(name: string): T
}
```

Check that `GuildConfigV2` is importable without creating a circular dependency. If `guild-config.ts` is already imported by `plugin.ts`, add to the import. If it would create a cycle, move the import to a shared types file.

---

### 3. `packages/arbor/src/arbor.ts`

Three changes:

#### a. `buildGuildContext` — add `home`, `config`, `guildConfig`

The function already has `config` (the `GuildConfigV2` from `readGuildConfigV2`) and `forApparatus` in scope — use them:

```typescript
function buildGuildContext(
  forApparatus:  LoadedApparatus,
  manifest:      GuildManifest,
  config:        GuildConfigV2,       // ← add this parameter
  eventHandlers: Map<...>,
): GuildContext {
  return {
    home: guildRoot,                  // needs guildRoot in scope too

    config<T = Record<string, unknown>>(pluginId?: string): T {
      const key = pluginId ?? forApparatus.id
      const cfg = config as unknown as Record<string, unknown>
      return (cfg[key] ?? {}) as T
    },

    guildConfig() {
      return config
    },

    apparatus<T>(name: string): T { ... },   // unchanged
    // ... rest unchanged
  }
}
```

`buildGuildContext` is called inside `loadAndStart` which has both `guildRoot` and `config` in scope — pass them through.

#### b. `createHandlerContext` — add `config`, `guildConfig`

`HandlerContext` is created for tool/engine dispatch. The context needs to know the owning plugin's id so `ctx.config()` with no args returns the right slice. Update the signature:

```typescript
createHandlerContext(owningPluginId?: string): HandlerContext
```

Implementation:

```typescript
createHandlerContext(owningPluginId?: string): HandlerContext {
  return {
    home: guildRoot,

    config<T = Record<string, unknown>>(pluginId?: string): T {
      const key = pluginId ?? owningPluginId
      if (!key) return {} as T
      const cfg = config as unknown as Record<string, unknown>
      return (cfg[key] ?? {}) as T
    },

    guildConfig() {
      return config
    },

    apparatus<T>(name: string): T { ... },   // unchanged
  }
}
```

Callers that dispatch a specific tool should pass `tool.pluginId`:
```typescript
const ctx = arbor.createHandlerContext(tool.pluginId)
await tool.handler(input, ctx)
```

Callers that create a generic context (e.g. for testing or CLI introspection) can omit `owningPluginId` — `ctx.config()` with no args returns `{}` in that case.

#### c. Remove `getPluginConfig` from the `Arbor` interface and implementation

`getPluginConfig` is superseded by `ctx.config()`. It was never called by any plugin. Remove it from the `Arbor` interface definition and the implementation object. If any tests reference it, update those tests to use `createHandlerContext().config()` instead.

---

## Testing

After changes:

1. Verify `derivePluginId` unit tests pass (add test cases for the new suffix stripping: `my-relay-kit` → `my-relay`, `@shardworks/books-apparatus` → `books`, `@acme/cache-apparatus` → `acme/cache`).
2. Verify `buildGuildContext` returns correct config slice for a guild with a config section under the apparatus id.
3. Verify `createHandlerContext(pluginId)` returns correct config slice.
4. Verify `createHandlerContext()` (no owning plugin) returns `{}` for `ctx.config()`.
5. Verify `ctx.config("other-plugin")` reads another plugin's config section correctly.
6. Verify `ctx.guildConfig()` returns the full parsed `GuildConfigV2`.
7. Run the full package test suite: `pnpm test` from workspace root.

---

## Commit plan

Suggest two commits:
- `update derivePluginId to strip -(plugin|apparatus|kit) suffix` — just resolve-package.ts + tests
- `add ctx.config() and ctx.guildConfig() to GuildContext and HandlerContext` — core types + arbor implementation + tests + removal of getPluginConfig
