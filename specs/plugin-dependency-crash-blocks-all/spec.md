# Spec: Isolate Plugin Load/Validation Failures

Slug: `plugin-dependency-crash-blocks-all`

## Problem

When a plugin fails to load or validate (missing dependency, circular dependency, broken package), `validateRequires` in `guild-lifecycle.ts` throws. The exception propagates uncaught through `createGuild()` in `arbor.ts` and `main()` in `program.ts`, crashing the entire `nsg` CLI with `process.exit(1)`. This makes all CLI commands — including `nsg plugin remove` and `nsg status` — unreachable, so operators cannot self-recover.

## Solution Overview

Three layers of defense:

1. **Resilient validation** — `validateRequires` collects all errors as `FailedPlugin[]` instead of throwing. A new `filterFailedPlugins` function cascades removal of transitive dependents. Healthy plugins proceed normally.
2. **CLI error boundary** — `program.ts` wraps `createGuild` in try/catch so framework commands always survive, even for errors outside validation (e.g. guild.json parse failure).
3. **Diagnostic surface** — `nsg status` shows a "Failed plugins" section with id and reason per line. `guild().failedPlugins()` exposes failures programmatically.

---

## S1: Resilient Validation (D1, D7)

### File: `packages/framework/arbor/src/guild-lifecycle.ts`

**Change the signature and behavior of `validateRequires`.**

Current signature (line 37):
```typescript
export function validateRequires(
  kits: LoadedKit[],
  apparatuses: LoadedApparatus[],
): void
```

New signature:
```typescript
export function validateRequires(
  kits: LoadedKit[],
  apparatuses: LoadedApparatus[],
): FailedPlugin[]
```

Add the import:
```typescript
import type {
  StartupContext,
  LoadedKit,
  LoadedApparatus,
  FailedPlugin,          // ← new
} from '@shardworks/nexus-core';
```

**Implementation details:**

- Maintain a local `failures: FailedPlugin[]` array and `failedIds: Set<string>`.
- **Apparatus requires check** (current lines 48–56): Instead of throwing, push a `FailedPlugin` with `reason: '"${app.id}" requires "${dep}", which is not installed.'`. Use `failedIds` to avoid duplicate entries when a plugin has multiple missing deps.
- **Kit requires check** (current lines 59–73): Same pattern. Push with reason `'kit "${kit.id}" requires "${dep}", which is not installed.'` or `'kit "${kit.id}" requires "${dep}", but that plugin is a kit, not an apparatus. Kit requires must name apparatus plugins.'`.
- **Cycle detection** (current lines 75–98): Replace the throwing DFS with one that collects all cycle participants into a `cycleParticipants: Set<string>`. When a back-edge is detected (revisiting a node in the current `visiting` set), extract all nodes from the cycle start to the current chain end and add them to `cycleParticipants`. After the DFS completes, iterate `cycleParticipants` and push each as a `FailedPlugin` with `reason: '"${id}" is part of a circular dependency chain.'`. Skip any id already in `failedIds`.
- Return `failures`.

**Update the doc comment** to say "Returns an array of FailedPlugin entries" instead of "Throws with a descriptive error".

---

## S2: Cascade Filtering (D2, D3)

### File: `packages/framework/arbor/src/guild-lifecycle.ts`

**Add a new exported function `filterFailedPlugins` after `validateRequires`.**

```typescript
export function filterFailedPlugins(
  kits: LoadedKit[],
  apparatuses: LoadedApparatus[],
  rootFailures: FailedPlugin[],
): { kits: LoadedKit[]; apparatuses: LoadedApparatus[]; cascaded: FailedPlugin[] }
```

**Implementation details:**

- Build `failedIds: Set<string>` from `rootFailures`.
- **Apparatus cascade**: Loop iteratively (`while changed`) over `apparatuses`. For each apparatus not already in `failedIds`, check if any of its `requires` entries are in `failedIds`. If so, add it to `failedIds` and push a `FailedPlugin` with `reason: '"${app.id}" depends on failed plugin "${dep}".'`. Set `changed = true` to re-scan (transitive deps may now be removable). This handles chains like A → B → C where A is the root failure.
- **Kit cascade**: Single pass over `kits`. For each kit not in `failedIds`, check if any `requires` entry is in `failedIds`. If so, add to `failedIds` and push cascaded failure.
- Return `{ kits: kits.filter(not failed), apparatuses: apparatuses.filter(not failed), cascaded }`.

**Why eager filtering (D2):** Keeps `topoSort` unchanged — it continues to assume a valid, acyclic graph. Validation/filtering is one phase; ordering is another.

**Why distinct cascaded reasons (D3):** Operators need to understand the causal chain. `"web" depends on failed plugin "db"` tells them web itself isn't broken — fix db and web recovers automatically.

---

## S3: CLI Error Boundary (D4)

### File: `packages/framework/cli/src/program.ts`

**Wrap the `createGuild(home)` call (line 163) in try/catch.**

Current code:
```typescript
if (home) {
  await createGuild(home);

  try {
    const instrumentarium = guild().apparatus<InstrumentariumApi>('tools');
    // ...
  } catch {
    // No Instrumentarium installed
  }
}
```

New code:
```typescript
if (home) {
  try {
    await createGuild(home);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[nsg] Guild failed to load: ${message}`);
    console.warn('[nsg] Plugin-contributed commands are unavailable. Framework commands still work.');
  }

  try {
    const instrumentarium = guild().apparatus<InstrumentariumApi>('tools');
    const pluginTools = instrumentarium.list()
      .filter((r) => !r.definition.callableBy || r.definition.callableBy.includes('cli'))
      .map((r) => r.definition);
    registerTools(program, pluginTools);
  } catch {
    // No Instrumentarium installed or guild failed to load —
    // only framework commands available.
  }
}
```

**Rationale (D4):** Defense in depth. Even with resilient validation, other errors could occur (guild.json parse error, `readGuildPackageJson` failure, apparatus `start()` crash). The try/catch ensures framework commands always survive. The cost is zero — plugin tools are simply unavailable.

---

## S4: FailedPlugin Type and Guild Interface (D5)

### File: `packages/framework/core/src/plugin.ts`

**Add the `FailedPlugin` interface** after the `LoadedPlugin` type (after line 32):

```typescript
/** A plugin that failed to load, validate, or start. */
export interface FailedPlugin {
  readonly id:     string
  readonly reason: string
}
```

### File: `packages/framework/core/src/guild.ts`

**Add `FailedPlugin` to the import** (line 16):
```typescript
import type { LoadedKit, LoadedApparatus, FailedPlugin } from './plugin.ts';
```

**Add `failedPlugins()` to the `Guild` interface** (after `apparatuses()`, before the closing brace):
```typescript
  /** Snapshot of plugins that failed to load, validate, or start. */
  failedPlugins(): FailedPlugin[]
```

### File: `packages/framework/core/src/index.ts`

**Add `FailedPlugin` to the plugin type exports** (after `type LoadedPlugin` in the export block):
```typescript
  type FailedPlugin,
```

### File: `packages/framework/arbor/src/arbor.ts`

**Wire `failedPlugins()` on the guild instance.**

Add `FailedPlugin` to the core import:
```typescript
import type {
  Guild,
  LoadedKit,
  LoadedApparatus,
  FailedPlugin,          // ← new
} from '@shardworks/nexus-core';
```

Add `filterFailedPlugins` to the lifecycle import:
```typescript
import {
  validateRequires,
  filterFailedPlugins,   // ← new
  topoSort,
  collectStartupWarnings,
  buildStartupContext,
  fireEvent,
} from './guild-lifecycle.ts';
```

**Replace the validation phase** (current line 100: `validateRequires(kits, apparatuses);`):

```typescript
  // ── Validation phase ───────────────────────────────────────────────

  const allFailures: FailedPlugin[] = [];

  const rootFailures = validateRequires(kits, apparatuses);
  allFailures.push(...rootFailures);

  // Remove plugins that transitively depend on failed ones
  if (rootFailures.length > 0) {
    const filtered = filterFailedPlugins(kits, apparatuses, rootFailures);
    kits.length = 0;
    kits.push(...filtered.kits);
    apparatuses.length = 0;
    apparatuses.push(...filtered.apparatuses);
    allFailures.push(...filtered.cascaded);

    for (const f of allFailures) {
      console.warn(`[arbor] ${f.reason}`);
    }
  }
```

Note: mutating `kits` and `apparatuses` arrays in place (via `length = 0` + `push`) ensures that the rest of `createGuild` (startup warnings, topoSort, guild instance closures) sees only the healthy plugins.

**Add `failedPlugins()` to the guild instance** (alongside `kits()` and `apparatuses()`):

```typescript
    kits()          { return [...kits]; },
    apparatuses()   { return [...orderedApparatuses]; },
    failedPlugins() { return [...allFailures]; },
```

---

## S5: Status Command Enhancement (D6)

### File: `packages/framework/cli/src/commands/status.ts`

**Add failed plugins to both text and JSON output.**

After `const config = readGuildConfig(home);` (line 32), add:
```typescript
    const failed = g.failedPlugins();
```

Add `failedPlugins` to the result object:
```typescript
    const result = {
      guild:   config.name,
      nexus:   VERSION,
      home,
      model:   config.settings?.model ?? '(not set)',
      plugins: [...config.plugins].sort(),
      failedPlugins: failed,
    };
```

After the `Plugins:` line in the text output, add the failed plugins section:
```typescript
    if (failed.length > 0) {
      lines.push('');
      lines.push('Failed plugins:');
      for (const f of failed) {
        lines.push(`  ${f.id}: ${f.reason}`);
      }
    }
```

**Example text output** when plugin `web` requires missing `db` and `api` depends on `web`:
```
Guild:    my-guild
Nexus:    0.4.0
Home:     /workspace/guilds/my-guild
Model:    sonnet
Plugins:  api, db, web

Failed plugins:
  web: "web" requires "db", which is not installed.
  api: "api" depends on failed plugin "web".
```

**JSON output** includes `failedPlugins` as an array of `{ id, reason }` objects.

---

## S6: Test Updates (D8)

### File: `packages/framework/arbor/src/guild-lifecycle.test.ts`

**Convert all `validateRequires` tests from throw-based to return-based assertions.**

Tests that currently use `assert.doesNotThrow(() => validateRequires(...))` become:
```typescript
assert.deepEqual(validateRequires(kits, apps), []);
```

Tests that currently use `assert.throws(() => validateRequires(...), /pattern/)` become:
```typescript
const failures = validateRequires(kits, apps);
assert.equal(failures.length, expectedCount);
assert.equal(failures[0]!.id, 'expectedId');
assert.match(failures[0]!.reason, /expected pattern/);
```

Specific conversions:

| Old test name | New assertion pattern |
|---|---|
| "passes with no plugins" | `assert.deepEqual(result, [])` |
| "passes with kits and apparatuses that have no requires" | `assert.deepEqual(result, [])` |
| "passes when apparatus requires another installed apparatus" | `assert.deepEqual(result, [])` |
| "passes when kit requires an installed apparatus" | `assert.deepEqual(result, [])` |
| "throws when apparatus requires a missing plugin" | `failures.length === 1`, id is `'ledger'`, reason matches `/requires "db"/` |
| "throws when kit requires a missing plugin" | `failures.length === 1`, id is `'relay-kit'`, reason matches `/requires "nonexistent"/` |
| "throws when kit requires another kit" | `failures.length === 1`, id is `'kit-b'`, reason matches `/but that plugin is a kit/` |
| "includes the dependent and dependency names" | Check `failures[0]!.reason` includes both names |
| "detects a direct circular dependency (A → B → A)" | `failures.length >= 2`, ids include both `'a'` and `'b'` |
| "detects a transitive circular dependency (A → B → C → A)" | `failures.length >= 3`, ids include `'a'`, `'b'`, `'c'` |
| "includes the cycle path in the error message" | All failure reasons match `/circular dependency/` |
| "does not false-positive on a diamond dependency" | `assert.deepEqual(result, [])` |
| "passes with a self-referencing apparatus" | `failures.length === 1`, id is `'a'`, reason matches `/circular dependency/` |

**Add a new test:** "collects multiple failures in one pass" — two apparatuses each requiring different missing deps. Assert `failures.length === 2`.

**Add `filterFailedPlugins` test block** (import the new function). Tests:

1. "returns all plugins when there are no failures" — empty rootFailures → all plugins survive, `cascaded` is empty.
2. "removes apparatus that depends on a failed plugin" — `db` fails, `web` requires `db` → `web` cascaded with reason matching `/depends on failed plugin "db"/`.
3. "cascades transitively (A → B → C, A fails)" — A fails → B and C both cascaded.
4. "removes kits that depend on a failed apparatus" — apparatus `tools` fails, kit requires `tools` → kit cascaded.
5. "preserves healthy plugins alongside failed ones" — `healthy` has no deps, `broken` fails, `dependent` requires `broken` → only `healthy` survives.

### File: `packages/framework/arbor/src/arbor.test.ts`

**Convert the validation describe block** from `assert.rejects` to positive assertions.

Replace "throws when an apparatus requires a missing plugin":
```typescript
it('marks apparatus with missing dependency as failed and continues', async () => {
  const tmp = makeTmpDir();
  installFakeApparatus(tmp, 'web', { requires: ['db'] });
  writeGuildJson(tmp, { plugins: ['web'] });
  writePackageJson(tmp, { 'web': '^1.0.0' });

  const g = await createGuild(tmp);
  assert.equal(g.apparatuses().length, 0);
  assert.equal(g.failedPlugins().length, 1);
  assert.match(g.failedPlugins()[0]!.reason, /requires "db", which is not installed/);
});
```

Replace "throws on circular dependencies":
```typescript
it('marks circular dependencies as failed and continues', async () => {
  const tmp = makeTmpDir();
  installFakeApparatus(tmp, 'app-a', { requires: ['app-b'] });
  installFakeApparatus(tmp, 'app-b', { requires: ['app-a'] });
  writeGuildJson(tmp, { plugins: ['app-a', 'app-b'] });
  writePackageJson(tmp, { 'app-a': '^1.0.0', 'app-b': '^1.0.0' });

  const g = await createGuild(tmp);
  assert.equal(g.apparatuses().length, 0);
  assert.equal(g.failedPlugins().length, 2);
  const failedIds = g.failedPlugins().map((f) => f.id).sort();
  assert.deepEqual(failedIds, ['app-a', 'app-b']);
});
```

**Add a cascade integration test:**
```typescript
it('cascades failures to transitive dependents', async () => {
  const tmp = makeTmpDir();
  installFakeApparatus(tmp, 'db');
  installFakeApparatus(tmp, 'web', { requires: ['db', 'cache'] });
  installFakeApparatus(tmp, 'api', { requires: ['web'] });
  writeGuildJson(tmp, { plugins: ['db', 'web', 'api'] });
  writePackageJson(tmp, { 'db': '^1.0.0', 'web': '^1.0.0', 'api': '^1.0.0' });

  const g = await createGuild(tmp);
  // db is healthy; web fails (missing cache); api cascades
  assert.equal(g.apparatuses().length, 1);
  assert.equal(g.apparatuses()[0]!.id, 'db');
  assert.equal(g.failedPlugins().length, 2);
  const failedIds = g.failedPlugins().map((f) => f.id).sort();
  assert.deepEqual(failedIds, ['api', 'web']);
  const apiFailure = g.failedPlugins().find((f) => f.id === 'api');
  assert.match(apiFailure!.reason, /depends on failed plugin "web"/);
});
```

**Update the "works with no plugins" test** in the basic block to also assert `assert.deepEqual(g.failedPlugins(), [])`.

---

## Files Modified

| File | Scope | Change |
|---|---|---|
| `packages/framework/core/src/plugin.ts` | S4 | Add `FailedPlugin` interface |
| `packages/framework/core/src/guild.ts` | S4 | Add `failedPlugins()` to `Guild` interface |
| `packages/framework/core/src/index.ts` | S4 | Export `FailedPlugin` type |
| `packages/framework/arbor/src/guild-lifecycle.ts` | S1, S2 | Refactor `validateRequires` to return `FailedPlugin[]`; add `filterFailedPlugins` |
| `packages/framework/arbor/src/arbor.ts` | S1, S2, S4 | Use resilient validation, wire `failedPlugins()` on guild instance |
| `packages/framework/cli/src/program.ts` | S3 | Wrap `createGuild` in try/catch |
| `packages/framework/cli/src/commands/status.ts` | S5 | Show failed plugins in text and JSON output |
| `packages/framework/arbor/src/guild-lifecycle.test.ts` | S6 | Convert throw assertions to return-value assertions; add `filterFailedPlugins` tests |
| `packages/framework/arbor/src/arbor.test.ts` | S6 | Convert `assert.rejects` to positive assertions; add cascade test |

## Files NOT Modified

- `packages/framework/cli/src/commands/plugin.ts` — plugin install/remove/list work unchanged once the CLI error boundary (S3) prevents crash.
- `packages/framework/cli/src/cli.ts` — top-level error handler stays as-is; the fix is in program.ts.
- Any plugin packages — the fix is entirely in framework code.
