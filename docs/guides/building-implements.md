# Building Implements

This guide explains how to build a new implement for Nexus, how to install it into a guild, and how dependency resolution works.

## Quick start

An implement is a package with these files:

```
my-tool/
  package.json              ← npm package metadata
  nexus-implement.json      ← Nexus descriptor
  instructions.md           ← guidance for animas (optional)
  src/
    handler.ts              ← the implement handler (default export)
```

The handler is the only file that matters for execution. Everything else is metadata. A `tsconfig.json` is only needed for framework implements that live in the Nexus monorepo — guild-built tools don't need one.

## The handler

Use the `implement()` factory from `@shardworks/nexus-core`:

```typescript
import { implement } from '@shardworks/nexus-core';
import { z } from 'zod';

export default implement({
  description: 'Brief description of what this tool does',
  params: {
    // Zod schemas for each parameter
    name: z.string().describe('Human-readable description of this param'),
    count: z.number().optional().describe('Optional params use .optional()'),
  },
  handler: async (params, context) => {
    // params — validated input, typed from your Zod schemas
    // context.home — absolute path to the guild root

    // Return any JSON-serializable value
    return { result: 'done' };
  },
});
```

### Key rules

1. **Default export.** The handler must be the default export. The MCP engine does `import(modulePath)` and reads `.default`.
2. **Zod params.** Every parameter is a Zod schema. The `.describe()` string becomes the parameter description in MCP — make it clear.
3. **Context injection.** The framework passes `{ home: string }` as the second argument. Use `home` to find guild files, the ledger, etc. The guild root is auto-detected from cwd (walks up looking for `guild.json`).
4. **Return JSON.** The MCP engine serializes the return value as JSON. Return objects, arrays, strings, or numbers. Throw errors for failures — the engine catches them and returns an MCP error.
5. **Sync or async.** Handlers can be sync or async. The framework `await`s either way.

## Reference implementation

See `packages/implement-install-tool/` for the canonical example. Key files:

- `src/handler.ts` — uses the SDK, imports `installTool` from core, returns an `InstallResult`
- `nexus-implement.json` — descriptor with `entry`, `instructions`, `version`, `description`
- `instructions.md` — teaches animas when and how to use the tool
- `package.json` — depends on `@shardworks/nexus-core` and `zod`

## File-by-file

### `package.json`

```json
{
  "name": "@shardworks/implement-my-tool",
  "version": "0.1.0",
  "description": "What this implement does",
  "type": "module",
  "exports": {
    ".": "./src/handler.ts"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@shardworks/nexus-core": "workspace:*",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "25.5.0"
  }
}
```

### `nexus-implement.json`

```json
{
  "entry": "src/handler.ts",
  "instructions": "instructions.md",
  "version": "0.1.0",
  "description": "What this implement does"
}
```

Fields:
- `entry` — (required) path to the handler module, relative to the package root
- `instructions` — (optional) path to instructions file for animas
- `version` — version slot for the guild directory
- `description` — human-readable description

Note: `installTool` records a `package` field in `guild.json` (read from your `package.json` name). This tells the manifest engine to resolve by npm package name at runtime. The slot descriptor itself is not modified.

### `instructions.md`

Written for animas, not humans. Explain:
- **When to use** the tool (and when not to)
- **Workflow context** — how it fits into larger processes
- **Judgment guidance** — edge cases, priorities, conventions
- **Interaction with other tools** — what to do before/after

MCP already provides the parameter schema and description. Instructions teach *craft*, not API reference.

## Installing tools

There are five install types, each with different durability guarantees.

### Registry — published npm packages

```
nexus install-tool some-tool@1.0 --roles artificer
```

Installs from the npm registry via `npm install --save`. The package is added to the guild's `package.json` as a dependency, so it survives `npm install` on a fresh clone.

- Descriptor and instructions are copied to the guild slot for git tracking
- Runtime code and dependencies live in `node_modules/`
- `upstream` in `guild.json`: `<package>@<version>` (e.g. `some-tool@1.0.0`)
- **Fully durable.** `package.json` has the specifier. `npm install` on fresh clone resolves it.

### Git URL — packages from git repositories

```
nexus install-tool git+https://github.com/someone/tool.git#v1.0 --roles artificer
```

Same flow as registry — npm handles `git+` URLs natively. The URL is saved to `package.json`.

- `upstream` in `guild.json`: the full git URL
- **Fully durable.** `package.json` has the git URL. `npm install` on fresh clone resolves it.

### Workshop — forge-built tools

```
nexus install-tool workshop:forge#tool/fetch-jira@1.0 --roles artificer
```

Installs from a workshop bare repo in `.nexus/workshops/`. The source specifier format is `workshop:<name>#<ref>` where `<name>` is the workshop name and `<ref>` is a git ref (branch, tag, or commit).

Workshop installs use `--no-save` semantics — the package is **not** added to `package.json` (since the `git+file://` URL would be machine-specific). Instead, the full source is copied to the guild slot for durability.

- Full source (not just metadata) is stored in the guild slot and git-tracked
- `upstream` in `guild.json`: the original `workshop:name#ref` specifier
- **Durable within the guild.** On fresh clone, `nexus rehydrate` reinstalls from the slot source.

This is the path used by forge agents installing tools they've built in a commission worktree.

### Tarball — local archive files

```
nexus install-tool ./my-tool-1.0.0.tgz --roles artificer
```

Installs from a local `.tgz` or `.tar.gz` file (e.g. a CI artifact). Uses `--no-save` semantics with full source copied to the guild slot.

- npm extracts and installs the tarball to resolve dependencies
- Full source is copied to the guild slot and git-tracked
- `upstream` in `guild.json`: `null` (local artifact, not a durable reference)
- **Durable via slot.** On fresh clone, `nexus rehydrate` reinstalls from the slot source.

### Link — dev mode with symlinks

```
nexus install-tool ~/projects/my-tool --link --roles artificer
```

Creates a symlink in `node_modules/` pointing to the source directory. Changes to the handler are reflected immediately at runtime — no reinstall needed. The tool's own `node_modules` (from the developer's project) resolves dependencies.

- Requires a directory with `package.json`
- Only metadata is copied to the guild slot
- `upstream` in `guild.json`: `null`
- **NOT durable.** The symlink target must exist on the local machine. Other clones will not have this tool — `nexus rehydrate` will report it as needing manual re-linking.

Use this while actively developing a tool. When done iterating, reinstall via a durable method (registry, tarball, etc.).

## How dependencies resolve at runtime

The guild root is an npm package (it has a `package.json` at its root). When a guild tool is installed via npm, it becomes a dependency in `node_modules/`.

At runtime, the manifest engine sets `NODE_PATH` to the guild root's `node_modules` when launching the MCP server process. This ensures that `import("some-guild-tool")` resolves correctly regardless of where the MCP engine's own code lives.

For tools with a `package` field in their descriptor, the manifest engine passes the package name (not a file path) to the MCP engine, which imports it by name. Node's module resolution + `NODE_PATH` handles the rest.

## Removing tools

```
nexus remove-tool my-tool
```

Removal behavior depends on how the tool was installed:

- **Registry/git-url** — runs `npm uninstall` to clean up `node_modules` and `package.json`, removes the guild slot, and deregisters from `guild.json`
- **Workshop/tarball** — removes the package from `node_modules` manually (it's not in `package.json`), removes the guild slot (including full source), and deregisters from `guild.json`
- **Link** — removes the symlink from `node_modules`, removes the guild slot, and deregisters from `guild.json`

Framework tools (source: `nexus`) cannot be removed with `remove-tool` — use `nexus repair` to manage those.

## Rehydrating after a fresh clone

After cloning a guild repo, `node_modules/` will be empty. Run:

```
nexus rehydrate
```

This reconstructs the runtime environment:

1. **Registry/git-url tools** — `npm install` resolves dependencies from `package.json`
2. **Workshop/tarball tools** — `npm install --no-save <slot-path>` reinstalls from the full source stored in each tool's guild slot
3. **Linked tools** — reported as needing manual re-linking (the symlink target is machine-specific)

Rehydrate is idempotent and safe to run at any time.

## Using `@shardworks/nexus-core`

The core library provides utilities that implement handlers commonly need:

| Export | Purpose |
|--------|---------|
| `VERSION` | Framework version string |
| `readGuildConfig(home)` | Read and parse `guild.json` |
| `writeGuildConfig(home, config)` | Write `guild.json` |
| `findGuildRoot(startDir?)` | Discover the guild root from cwd |
| `ledgerPath(home)` | Resolve path to the Ledger SQLite database (`.nexus/nexus.db`) |
| `installTool(opts)` | Core install logic (used by `install-tool` implement) |
| `removeTool(opts)` | Core remove logic (used by `remove-tool` implement) |
| `rehydrate(home)` | Reconstruct `node_modules` from tracked guild state |
| `createLedger(path)` | Create a new Ledger database |
| `implement(def)` | The implement SDK factory |

Import from `@shardworks/nexus-core`:

```typescript
import { readGuildConfig, findGuildRoot } from '@shardworks/nexus-core';
```

## How it gets loaded

The MCP engine (`packages/engine-mcp-server/`) loads implements at session start:

1. Receives a config listing implement names and module paths
2. For each implement: `const mod = await import(modulePath)`
3. Reads `mod.default` — expects an `ImplementDefinition` (what `implement()` returns)
4. Registers it as an MCP tool using the Zod params as the input schema
5. When called: validates params via Zod, calls `handler(params, { home })`, returns the result as JSON

The handler never talks MCP directly. The framework handles the protocol.

## Testing

Use Node.js built-in test runner. Handler tests can call the handler directly:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import handler from './handler.ts';

describe('my-tool', () => {
  it('does the thing', async () => {
    const result = await handler.handler(
      { name: 'test' },
      { home: '/tmp/test-home' },
    );
    assert.deepEqual(result, { expected: 'output' });
  });
});
```

For tests that need a real guild, use `initGuild()` to set up a temporary one:

```typescript
import { initGuild } from '@shardworks/nexus-core';

const home = '/tmp/test-guild';
initGuild(home, 'test-guild', 'test-model');
// Now home has a real guild with guild.json, package.json, and .git
```

## Adding to base tools

If this is a framework implement (ships with Nexus):

1. Add an entry to `BASE_IMPLEMENTS` in `packages/core/src/base-tools.ts`
2. The entry needs: `name`, `packageName`
3. Run `pnpm install` so the workspace picks up the new package
4. Run `pnpm test` to verify nothing breaks
