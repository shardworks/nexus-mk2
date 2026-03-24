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
    // context.home — absolute path to NEXUS_HOME

    // Return any JSON-serializable value
    return { result: 'done' };
  },
});
```

### Key rules

1. **Default export.** The handler must be the default export. The MCP engine does `import(modulePath)` and reads `.default`.
2. **Zod params.** Every parameter is a Zod schema. The `.describe()` string becomes the parameter description in MCP — make it clear.
3. **Context injection.** The framework passes `{ home: string }` as the second argument. Use `home` to find the guildhall, ledger, etc. Never read `NEXUS_HOME` from the environment directly.
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
- `version` — version slot for the guildhall directory
- `description` — human-readable description

Note: `installTool` automatically adds a `package` field to the guildhall copy of this descriptor (read from your `package.json` name). This tells the manifest engine to resolve by package name at runtime. You don't need to set it yourself.

### `instructions.md`

Written for animas, not humans. Explain:
- **When to use** the tool (and when not to)
- **Workflow context** — how it fits into larger processes
- **Judgment guidance** — edge cases, priorities, conventions
- **Interaction with other tools** — what to do before/after

MCP already provides the parameter schema and description. Instructions teach *craft*, not API reference.

## Installing tools

### From a local directory (with `package.json`)

```
nexus install-tool ./path/to/my-tool --roles artificer
```

The tool is installed via `npm install` into the guildhall's `node_modules`. Its dependencies are resolved automatically. The descriptor and instructions are copied to the guildhall slot for git tracking, but the runtime code and dependencies live in `node_modules`.

This is the path used by forge agents installing tools they've built in a commission worktree. The worktree can be cleaned up afterward — npm copied the package.

### From a local directory (dev mode with `--link`)

```
nexus install-tool ~/projects/my-tool --link --roles artificer
```

Creates a symlink in the guildhall's `node_modules` pointing to the source directory. Changes to the handler are reflected immediately at runtime — no reinstall needed. The tool's own `node_modules` (from the developer's project) resolves dependencies.

Use this while actively developing a tool. When done iterating, reinstall without `--link` for a proper copy.

### From the npm registry

```
nexus install-tool some-guild-tool@1.0 --roles herald
```

Installs the package from npm into the guildhall's `node_modules`, resolving all dependencies. The descriptor and instructions are copied from the installed package to the guildhall slot.

### From a tarball

```
nexus install-tool ./my-tool-1.0.0.tgz --roles artificer
```

Installs from a local `.tgz` file (e.g. a CI artifact). Same behavior as a registry install — npm extracts the tarball, resolves dependencies, and installs to `node_modules`.

### Bare files (no `package.json`)

```
nexus install-tool ./my-script-tool --roles artificer
```

For non-Node tools (shell scripts, etc.) or simple handlers with no third-party dependencies. The source files are copied directly to the guildhall slot. No npm involvement, no dependency resolution.

## How dependencies resolve at runtime

The guildhall is an npm package (it has a `package.json` at its root). When a guild tool is installed via npm, it becomes a dependency in `guildhall/node_modules/`.

At runtime, the manifest engine sets `NODE_PATH` to the guildhall's `node_modules` when launching the MCP server process. This ensures that `import("some-guild-tool")` resolves correctly regardless of where the MCP engine's own code lives.

For tools with a `package` field in their descriptor, the manifest engine passes the package name (not a file path) to the MCP engine, which imports it by name. Node's module resolution + `NODE_PATH` handles the rest.

For bare-local tools (no `package` field), the manifest engine passes an absolute file path. These tools can only import Node builtins and `@shardworks/nexus-core` — no third-party dependencies.

## Removing tools

```
nexus remove-tool my-tool
```

For npm-installed tools, this runs `npm uninstall` to clean up `node_modules`, removes the guildhall slot, and deregisters from `guild.json`. For linked tools, the symlink is removed. For bare-local tools, the slot directory is deleted.

## Using `@shardworks/nexus-core`

The core library provides utilities that implement handlers commonly need:

| Export | Purpose |
|--------|---------|
| `VERSION` | Framework version string |
| `readGuildConfig(home)` | Read and parse `guild.json` |
| `writeGuildConfig(home, config)` | Write `guild.json` |
| `guildhallWorktreePath(home)` | Resolve path to the standing worktree |
| `ledgerPath(home)` | Resolve path to the Ledger SQLite database |
| `installTool(opts)` | Core install logic (used by `install-tool` implement) |
| `removeTool(opts)` | Core remove logic (used by `remove-tool` implement) |
| `createLedger(path)` | Create a new Ledger database |
| `implement(def)` | The implement SDK factory |

Import from `@shardworks/nexus-core`:

```typescript
import { readGuildConfig, guildhallWorktreePath } from '@shardworks/nexus-core';
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
// Now home has a real guildhall, guild.json, and ledger
```

## Adding to base tools

If this is a framework implement (ships with Nexus):

1. Add an entry to `BASE_IMPLEMENTS` in `packages/core/src/base-tools.ts`
2. The entry needs: `name`, `packageName`
3. Run `pnpm install` so the workspace picks up the new package
4. Run `pnpm test` to verify nothing breaks
