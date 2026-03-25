# Commission: Consolidate tool and engine packages into `@shardworks/nexus-stdlib`

## Goal

Replace the 11 micro-packages (`tool-*`, `engine-*`) with a single `@shardworks/nexus-stdlib` package. This reduces monorepo overhead (11 package.json files, 11 publish targets) to one package that exports all default tools and engines.

## Context

The `tool()` and `engine()` SDKs now support:
- **Required `name` field** — every tool and engine carries its own name
- **Array exports** — `export default [tool({...}), tool({...})]`
- **`instructions` / `instructionsFile`** — per-tool instructions inline or via file path
- **Runtime resolvers** — `resolveToolFromExport()` and `resolveEngineFromExport()` handle both single and array exports, used by the MCP server and Clockworks runner

The bundle installer (`packages/core/src/bundle.ts`) already handles collection packages — when a package has no per-tool descriptor file, it registers the tool in guild.json using the bundle manifest's `name` field.

## What to create

### New package: `packages/stdlib/`

```
packages/stdlib/
  package.json
  tsconfig.json
  src/
    tools.ts              ← exports array of all tool definitions
    engines.ts            ← exports array of all engine definitions
    tools/
      commission.ts       ← handler code (moved from packages/tool-commission/src/handler.ts)
      signal.ts           ← moved from packages/tool-signal/src/handler.ts
      install.ts          ← moved from packages/tool-install/src/handler.ts
      remove.ts           ← moved from packages/tool-remove/src/handler.ts
      instantiate.ts      ← moved from packages/tool-instantiate/src/handler.ts
      nexus-version.ts    ← moved from packages/tool-nexus-version/src/handler.ts
    engines/
      workshop-prepare.ts ← moved from packages/engine-workshop-prepare/src/index.ts
      workshop-merge.ts   ← moved from packages/engine-workshop-merge/src/index.ts
    instructions/
      commission.md       ← moved from packages/tool-commission/instructions.md
      signal.md           ← moved from packages/tool-signal/instructions.md
      install.md          ← moved from packages/tool-install/instructions.md
      remove.md           ← moved from packages/tool-remove/instructions.md
      instantiate.md      ← moved from packages/tool-instantiate/instructions.md
      nexus-version.md    ← moved from packages/tool-nexus-version/instructions.md
```

### `src/tools.ts`

```typescript
export { default as commission } from './tools/commission.ts';
export { default as signal } from './tools/signal.ts';
export { default as install } from './tools/install.ts';
export { default as remove } from './tools/remove.ts';
export { default as instantiate } from './tools/instantiate.ts';
export { default as nexusVersion } from './tools/nexus-version.ts';

import commission from './tools/commission.ts';
import signal from './tools/signal.ts';
import install from './tools/install.ts';
import remove from './tools/remove.ts';
import instantiate from './tools/instantiate.ts';
import nexusVersion from './tools/nexus-version.ts';

export default [commission, signal, install, remove, instantiate, nexusVersion];
```

### `src/engines.ts`

```typescript
export { default as workshopPrepare } from './engines/workshop-prepare.ts';
export { default as workshopMerge } from './engines/workshop-merge.ts';

import workshopPrepare from './engines/workshop-prepare.ts';
import workshopMerge from './engines/workshop-merge.ts';

export default [workshopPrepare, workshopMerge];
```

### `package.json`

```json
{
  "name": "@shardworks/nexus-stdlib",
  "version": "0.1.17",
  "description": "Standard tools and engines for the Nexus guild system",
  "type": "module",
  "exports": {
    "./tools": "./src/tools.ts",
    "./engines": "./src/engines.ts"
  },
  "dependencies": {
    "@shardworks/nexus-core": "workspace:*",
    "@shardworks/engine-worktree-setup": "workspace:*",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "25.5.0"
  },
  "files": ["dist"],
  "publishConfig": {
    "exports": {
      "./tools": {
        "types": "./dist/tools.d.ts",
        "import": "./dist/tools.js"
      },
      "./engines": {
        "types": "./dist/engines.d.ts",
        "import": "./dist/engines.js"
      }
    }
  }
}
```

### Tool handler changes

Each moved tool file should add `instructionsFile` pointing to the instructions markdown:

```typescript
// e.g. src/tools/commission.ts
export default tool({
  name: 'commission',
  description: 'Post a commission to the guild for an artificer to work on',
  instructionsFile: './instructions/commission.md',
  params: { ... },
  handler: (params, { home }) => { ... },
});
```

**Important**: `instructionsFile` paths are resolved relative to the package root in `node_modules` at manifest time (by the manifest engine). So `./instructions/commission.md` resolves to `node_modules/@shardworks/nexus-stdlib/instructions/commission.md`.

The instructions files must be included in the package's `"files"` array so they're published to npm. Update `"files"` to: `["dist", "instructions"]`.

### Engine handler changes

The two clockwork engines (`workshop-prepare`, `workshop-merge`) already have `name` set. The only change is the import paths — they currently import from `@shardworks/engine-worktree-setup`. That package is a **static engine** (not a clockwork engine — it doesn't use the `engine()` factory). It's imported programmatically by workshop-prepare and workshop-merge, not loaded by the Clockworks runner.

**Keep `engine-worktree-setup` as a separate package.** It's a static engine with its own `nexus-engine.json` descriptor, registered in guild.json by the bundle installer. It's imported as a library by workshop-prepare and workshop-merge. The stdlib package should depend on `@shardworks/engine-worktree-setup` and the imports in the moved engine files stay the same (`import { setupWorktree } from '@shardworks/engine-worktree-setup'`).

## What to update

### `packages/guild-starter-kit/nexus-bundle.json`

The static engines (`manifest`, `mcp-server`, `worktree-setup`, `ledger-migrate`) stay as separate packages but remain in the bundle — guilds need them registered in `guild.json`. The clockwork engines (`workshop-prepare`, `workshop-merge`) move to stdlib. Tools move to stdlib. The `signal` tool is NOT in the current bundle (it's installed separately) — keep it out of the bundle, but it still moves into stdlib.

```json
{
  "description": "Everything a new guild needs — base tools, starter training, and initial schema",
  "tools": [
    { "package": "@shardworks/nexus-stdlib@0.x", "name": "install-tool" },
    { "package": "@shardworks/nexus-stdlib@0.x", "name": "remove-tool" },
    { "package": "@shardworks/nexus-stdlib@0.x", "name": "commission" },
    { "package": "@shardworks/nexus-stdlib@0.x", "name": "instantiate" },
    { "package": "@shardworks/nexus-stdlib@0.x", "name": "nexus-version" }
  ],
  "engines": [
    { "package": "@shardworks/engine-manifest@0.x", "name": "manifest" },
    { "package": "@shardworks/engine-mcp-server@0.x", "name": "mcp-server" },
    { "package": "@shardworks/engine-worktree-setup@0.x", "name": "worktree-setup" },
    { "package": "@shardworks/engine-ledger-migrate@0.x", "name": "ledger-migrate" },
    { "package": "@shardworks/nexus-stdlib@0.x", "name": "workshop-prepare" },
    { "package": "@shardworks/nexus-stdlib@0.x", "name": "workshop-merge" }
  ],
  "temperaments": [...unchanged...],
  "curricula": [...unchanged...],
  "migrations": [...unchanged...]
}

### `packages/cli/package.json`

Remove dependencies on the deleted tool packages. Add dependency on `@shardworks/nexus-stdlib`:

**Remove:**
- `@shardworks/tool-commission`
- `@shardworks/tool-install`
- `@shardworks/tool-instantiate`
- `@shardworks/tool-nexus-version`
- `@shardworks/tool-remove`

**Add:**
- `@shardworks/nexus-stdlib`

**Keep** (the CLI imports these directly, or they're needed at runtime):
- `@shardworks/engine-ledger-migrate`
- `@shardworks/engine-manifest`
- `@shardworks/engine-mcp-server`
- `@shardworks/engine-worktree-setup`

### `packages/engine-mcp-server/package.json`

Remove the test dependency on `@shardworks/tool-install`. Update the test to use `@shardworks/nexus-stdlib/tools` instead — import a tool from stdlib and verify it loads.

Update `packages/engine-mcp-server/src/index.test.ts`:
- Change the test tool modulePath from `@shardworks/tool-install` to `@shardworks/nexus-stdlib/tools`
- The test should still verify that the MCP server can load a tool. Since stdlib exports an array, the test now also validates array resolution.

Update the doc comment in `packages/engine-mcp-server/src/index.ts` that shows `@shardworks/tool-install` as an example modulePath.

### `packages/cli/src/commands/init.test.ts`

The `makeLocalBundle()` function rewrites bundle manifest package paths from `@shardworks/tool-commission@0.x` to local filesystem paths. After consolidation, this rewrite logic changes — all tools point to the same local stdlib path, and the tool packages no longer exist as separate directories.

Update `makeLocalBundle()`:
- For tools and engines that reference `@shardworks/nexus-stdlib@0.x`, rewrite to the local path of `packages/stdlib`
- For engines that still reference individual packages (`engine-manifest`, etc.), keep the existing rewrite logic

### `packages/engine-mcp-server/src/index.ts` — doc comment

Update the usage example that shows `@shardworks/tool-install` as an example modulePath.

## What to delete

After stdlib is created and all references updated:

- `packages/tool-commission/` (entire directory)
- `packages/tool-signal/` (entire directory)
- `packages/tool-install/` (entire directory)
- `packages/tool-remove/` (entire directory)
- `packages/tool-instantiate/` (entire directory)
- `packages/tool-nexus-version/` (entire directory)
- `packages/engine-workshop-prepare/` (entire directory)
- `packages/engine-workshop-merge/` (entire directory)
That's 8 packages deleted, 1 created.

## What NOT to touch

- `packages/core/` — no changes needed. The SDK and resolver changes are already done.
- `packages/engine-manifest/` — stays as its own package (static engine, imported directly by CLI, has `better-sqlite3` dependency)
- `packages/engine-mcp-server/` — stays as its own package (static engine, has `@modelcontextprotocol/sdk` dependency)
- `packages/engine-ledger-migrate/` — stays as its own package (static engine, has `better-sqlite3` dependency)
- `packages/engine-worktree-setup/` — stays as its own package (static engine with descriptor, imported as library by stdlib's clockwork engines)
- `packages/guild-starter-kit/` — only the `nexus-bundle.json` changes (listed above)
- `pnpm-workspace.yaml` — no changes needed (still `packages/*`)

## Verification

After all changes:

1. `pnpm install` — workspace resolves cleanly
2. `npx tsc --noEmit` on all remaining packages — clean typecheck
3. `npx tsx --test packages/core/src/*.test.ts` — all passing
4. `npx tsx --test packages/engine-mcp-server/src/*.test.ts` — all passing
5. `npx tsx --test packages/cli/src/commands/*.test.ts` — all passing (this is the critical one — it runs the full init sequence including bundle install)

## Important details

### How the MCP server resolves tools from stdlib

When a guild installs tools from the bundle, guild.json gets:
```json
"commission": { "package": "@shardworks/nexus-stdlib/tools" }
```

At runtime, the manifest engine generates MCP config with:
```json
{ "name": "commission", "modulePath": "@shardworks/nexus-stdlib/tools" }
```

The MCP server does `import("@shardworks/nexus-stdlib/tools")`, gets the array, and `resolveToolFromExport(mod.default, "commission")` finds the right tool by name.

Multiple tools referencing the same modulePath means the module is imported once (Node.js caches it) and different tools are resolved from the cached array.

### Bundle installer deduplication

The bundle installer currently does `npm install --save` with all package specs batched. When multiple entries reference `@shardworks/nexus-stdlib@0.x`, npm deduplicates naturally — it installs the package once.

### The `signal` tool

The `signal` tool is NOT in the starter kit bundle (it's installed separately). It still moves into stdlib — it's just not referenced by the bundle manifest. A guild that wants signal can do `nsg tool install @shardworks/nexus-stdlib` (which would install the whole collection) or we can support that later.

### `instructionsFile` resolution

The manifest engine resolves `instructionsFile` relative to the package root in `node_modules`. For stdlib tools:
- `guild.json` has `"package": "@shardworks/nexus-stdlib/tools"`
- Manifest engine imports the module from `@shardworks/nexus-stdlib/tools`
- For `instructionsFile`, it needs the **base package name** to find the file on disk

Currently the manifest engine uses `entry.package` to construct the path: `path.join(home, 'node_modules', entry.package, toolDef.instructionsFile)`. For stdlib, `entry.package` will be `@shardworks/nexus-stdlib/tools` — but the file lives at `node_modules/@shardworks/nexus-stdlib/instructions/commission.md`, not `node_modules/@shardworks/nexus-stdlib/tools/instructions/commission.md`.

**Fix needed in the manifest engine:** strip the subpath from the package name when resolving `instructionsFile`. Extract the npm package name (everything before a subpath that starts with `/`):
- `@shardworks/nexus-stdlib/tools` → `@shardworks/nexus-stdlib`
- `@shardworks/tool-commission` → `@shardworks/tool-commission` (unchanged)

This is a small fix in `packages/engine-manifest/src/index.ts` in the `resolveTools` function where `instructionsFile` is resolved. Add a helper:

```typescript
/** Extract the npm package name from a package specifier that may include a subpath. */
function basePackageName(pkg: string): string {
  // Scoped: @scope/name/subpath → @scope/name
  if (pkg.startsWith('@')) {
    const parts = pkg.split('/');
    return parts.slice(0, 2).join('/');
  }
  // Unscoped: name/subpath → name
  return pkg.split('/')[0]!;
}
```

Then use it:
```typescript
const instrPath = path.join(
  home, 'node_modules', basePackageName(entry.package), toolDef.instructionsFile,
);
```
