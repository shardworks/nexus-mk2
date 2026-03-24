# Building Implements

This guide explains how to build a new implement for Nexus. It covers the SDK, the file structure, and the conventions that the MCP engine expects.

## Quick start

An implement is a package with four files:

```
packages/implement-my-tool/
  package.json              ← npm package metadata
  tsconfig.json             ← extends root tsconfig
  nexus-implement.json      ← Nexus descriptor
  instructions.md           ← guidance for animas (optional)
  src/
    handler.ts              ← the implement handler (default export)
```

The handler is the only file that matters for execution. Everything else is metadata.

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

### `tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
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

Only `entry` is required. `instructions` is optional but recommended for any tool that requires judgment.

### `instructions.md`

Written for animas, not humans. Explain:
- **When to use** the tool (and when not to)
- **Workflow context** — how it fits into larger processes
- **Judgment guidance** — edge cases, priorities, conventions
- **Interaction with other tools** — what to do before/after

MCP already provides the parameter schema and description. Instructions teach *craft*, not API reference.

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
initGuild(home, 'test-model');
// Now home has a real guildhall, guild.json, and ledger
```

## Adding to base tools

If this is a framework implement (ships with Nexus):

1. Add an entry to `BASE_IMPLEMENTS` in `packages/core/src/base-tools.ts`
2. The entry needs: `name`, `packageName`, `description`, `instructions`
3. Run `pnpm install` so the workspace picks up the new package
4. Run `pnpm test` to verify nothing breaks
