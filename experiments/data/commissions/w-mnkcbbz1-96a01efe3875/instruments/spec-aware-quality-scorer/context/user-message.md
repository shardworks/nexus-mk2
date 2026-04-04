## Commission Spec

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

## Referenced Files (from spec, pre-commission state)

=== REFERENCED FILE: packages/framework/cli/src/cli.ts (pre-commission state) ===
#!/usr/bin/env node

/**
 * nsg — CLI entry point, built on the plugin architecture.
 *
 * Dynamically discovers installed tools via plugins, registers them as Commander
 * commands, and delegates argument parsing and invocation to Commander.
 *
 * Tools are filtered to those with 'cli' in callableBy (or no callableBy
 * set, which defaults to all callers). Tools marked 'anima'-only are invisible here.
 */

import { main } from './program.ts';

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

=== REFERENCED FILE: packages/framework/cli/src/commands/plugin.ts (pre-commission state) ===
/**
 * nsg plugin-* — manage guild plugins.
 *
 * Framework commands for plugin lifecycle. Available via CLI only (not MCP).
 *
 * Plugin install/remove are pure npm + guild.json operations. No tool
 * discovery at install time — tools are resolved at runtime by the
 * Instrumentarium via its permission-based model.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tool } from '@shardworks/tools-apparatus';
import {
  guild,
  readGuildConfig,
  writeGuildConfig,
  derivePluginId,
  readGuildPackageJson,
  resolvePackageNameForPluginId,
} from '@shardworks/nexus-core';
import { z } from 'zod';

// ── Helpers ────────────────────────────────────────────────────────────

function npm(args: string[], cwd: string): string {
  return execFileSync('npm', args, { cwd, stdio: 'pipe', encoding: 'utf-8' });
}

function pnpm(args: string[], cwd: string): string {
  return execFileSync('pnpm', args, { cwd, stdio: 'pipe', encoding: 'utf-8' });
}

/**
 * Detect the package manager used by the guild.
 *
 * Checks for lockfiles in order of specificity. Falls back to 'npm'
 * when no lockfile is present (e.g. fresh guilds before first install).
 */
export function detectPackageManager(guildRoot: string): 'npm' | 'pnpm' {
  if (fs.existsSync(path.join(guildRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  return 'npm';
}

/**
 * Parse a source specifier to extract the npm package name.
 * e.g. "@shardworks/nexus-stdlib@1.0" → "@shardworks/nexus-stdlib"
 *      "nexus-stdlib" → "nexus-stdlib"
 *
 * Returns null for git URLs — the package name must be read from
 * the guild's package.json after npm install.
 *
 * Known limitations: does not handle npm: alias specifiers, tarball URLs,
 * or workspace: protocol. These are uncommon for plugin install and can
 * be added if needed.
 */
function parsePackageName(source: string): string | null {
  if (source.startsWith('git+') || source.startsWith('git://') || source.endsWith('.git')) {
    return null;
  }
  if (source.startsWith('@')) {
    const lastAt = source.lastIndexOf('@');
    if (lastAt > 0) return source.substring(0, lastAt);
    return source;
  }
  if (source.includes('@')) {
    return source.split('@')[0]!;
  }
  return source;
}

/**
 * Find the most recently added dependency in the guild's package.json.
 * Used after `npm install <git-url>` where we can't parse the name from the source.
 *
 * Relies on Object.keys() returning insertion-ordered string keys (guaranteed
 * by the ES2015 spec for non-integer keys, and by V8/Node). A diff-based
 * approach (snapshot deps before install, compare after) would be more robust
 * but overkill for this edge case.
 */
function detectInstalledPackage(guildRoot: string): string {
  const pkgPath = path.join(guildRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const deps = pkg.dependencies as Record<string, string> | undefined ?? {};
  const names = Object.keys(deps);
  const last = names[names.length - 1];
  if (!last) throw new Error('Could not determine package name after npm install.');
  return last;
}

// ── Commands ───────────────────────────────────────────────────────────

export const pluginList = tool({
  name: 'plugin-list',
  description: 'List installed plugins',
  callableBy: ['cli'],
  params: {
    json: z.boolean().optional().describe('Output as JSON'),
  },
  handler: async (params) => {
    const { home } = guild();
    const config = readGuildConfig(home);
    const pluginIds = config.plugins;

    if (pluginIds.length === 0) {
      if (params.json) return [];
      return 'No plugins installed.';
    }

    if (params.json) {
      return [...pluginIds].sort().map((id) => ({ id }));
    }
    return [...pluginIds].sort().join('\n');
  },
});

export const pluginInstall = tool({
  name: 'plugin-install',
  description: 'Install a plugin into the guild',
  callableBy: ['cli'],
  params: {
    source: z.string().describe('Package name, git URL, or local folder path'),
    type: z.enum(['registry', 'link']).optional().describe('Install type: "registry" (npm install) or "link" (local folder). Auto-detected when source is a folder path.'),
  },
  handler: async (params) => {
    const { home } = guild();
    const { source } = params;

    // Auto-detect link mode when source looks like a filesystem path
    const sourceDir = path.resolve(source);
    const looksLikePath = source.startsWith('.') || source.startsWith('/');
    const isDirectory = looksLikePath && fs.existsSync(sourceDir) && fs.statSync(sourceDir).isDirectory();
    const installType = params.type ?? (isDirectory ? 'link' : 'registry');

    // 1. Install the npm package into the guild
    let packageName: string;

    if (installType === 'link') {
      const sourceDir = path.resolve(source);
      if (!fs.existsSync(path.join(sourceDir, 'package.json'))) {
        throw new Error(`No package.json found in ${sourceDir}. --link requires a directory with a package.json.`);
      }
      const pkgJson = JSON.parse(fs.readFileSync(path.join(sourceDir, 'package.json'), 'utf-8')) as Record<string, unknown>;
      packageName = pkgJson.name as string;
      const pm = detectPackageManager(home);
      if (pm === 'pnpm') {
        pnpm(['add', `link:${sourceDir}`], home);
      } else {
        npm(['install', '--save', `file:${sourceDir}`], home);
      }
    } else {
      npm(['install', '--save', source], home);
      packageName = parsePackageName(source) ?? detectInstalledPackage(home);

      const { pkgJson } = readGuildPackageJson(home, packageName);
      if (!pkgJson) {
        throw new Error(`Package "${packageName}" not found in node_modules after install.`);
      }
    }

    const pluginId = derivePluginId(packageName);

    // 2. Update guild.json — add to plugins list
    const config = readGuildConfig(home);

    if (!config.plugins.includes(pluginId)) {
      config.plugins.push(pluginId);
    }

    writeGuildConfig(home, config);

    return `Installed plugin: ${pluginId} (${packageName})`;
  },
});

export const pluginRemove = tool({
  name: 'plugin-remove',
  description: 'Remove a plugin from the guild',
  callableBy: ['cli'],
  params: {
    name: z.string().describe('Plugin id or package name to remove'),
  },
  handler: async (params) => {
    const { home } = guild();
    const config = readGuildConfig(home);
    const targetId = params.name.startsWith('@') ? derivePluginId(params.name) : params.name;

    if (!config.plugins.includes(targetId)) {
      throw new Error(`Plugin "${targetId}" is not installed.`);
    }

    config.plugins = config.plugins.filter((id) => id !== targetId);
    writeGuildConfig(home, config);

    const packageName = resolvePackageNameForPluginId(home, targetId);
    if (packageName) {
      try {
        const pm = detectPackageManager(home);
        if (pm === 'pnpm') {
          pnpm(['remove', packageName], home);
        } else {
          npm(['uninstall', packageName], home);
        }
      } catch {
        // Don't fail if uninstall fails — guild.json is already updated
      }
    }

    return `Removed plugin: ${targetId}`;
  },
});

export const pluginUpgrade = tool({
  name: 'plugin-upgrade',
  description: 'Upgrade a plugin to a newer version',
  callableBy: ['cli'],
  params: {
    name: z.string().describe('Plugin id or package name to upgrade'),
    version: z.string().optional().describe('Target version (default: latest)'),
  },
  handler: async () => {
    return 'Not yet implemented.';
  },
});



## Commission Diff

```
 packages/framework/arbor/src/arbor.test.ts         |  41 ++++--
 packages/framework/arbor/src/arbor.ts              |  26 +++-
 .../framework/arbor/src/guild-lifecycle.test.ts    | 150 +++++++++++++++------
 packages/framework/arbor/src/guild-lifecycle.ts    | 120 ++++++++++++++---
 packages/framework/cli/src/commands/status.ts      |  19 ++-
 packages/framework/cli/src/program.ts              |  12 +-
 packages/framework/core/src/guild.ts               |   5 +-
 packages/framework/core/src/index.ts               |   1 +
 packages/framework/core/src/plugin.ts              |   6 +
 9 files changed, 302 insertions(+), 78 deletions(-)

diff --git a/packages/framework/arbor/src/arbor.test.ts b/packages/framework/arbor/src/arbor.test.ts
index 8cfe965..10e8b97 100644
--- a/packages/framework/arbor/src/arbor.test.ts
+++ b/packages/framework/arbor/src/arbor.test.ts
@@ -160,6 +160,7 @@ describe('createGuild — basic', () => {
     const g = await createGuild(tmp);
     assert.deepEqual(g.kits(), []);
     assert.deepEqual(g.apparatuses(), []);
+    assert.deepEqual(g.failedPlugins(), []);
   });
 });
 
@@ -339,29 +340,49 @@ describe('createGuild — plugin config', () => {
 // ── createGuild — validation ─────────────────────────────────────────
 
 describe('createGuild — validation', () => {
-  it('throws when an apparatus requires a missing plugin', async () => {
+  it('marks apparatus with missing dependency as failed and continues', async () => {
     const tmp = makeTmpDir();
     installFakeApparatus(tmp, 'web', { requires: ['db'] });
     writeGuildJson(tmp, { plugins: ['web'] });
     writePackageJson(tmp, { 'web': '^1.0.0' });
 
-    await assert.rejects(
-      () => createGuild(tmp),
-      /requires "db", which is not installed/,
-    );
+    const g = await createGuild(tmp);
+    assert.equal(g.apparatuses().length, 0);
+    assert.equal(g.failedPlugins().length, 1);
+    assert.match(g.failedPlugins()[0]!.reason, /requires "db", which is not installed/);
   });
 
-  it('throws on circular dependencies', async () => {
+  it('marks circular dependencies as failed and continues', async () => {
     const tmp = makeTmpDir();
     installFakeApparatus(tmp, 'app-a', { requires: ['app-b'] });
     installFakeApparatus(tmp, 'app-b', { requires: ['app-a'] });
     writeGuildJson(tmp, { plugins: ['app-a', 'app-b'] });
     writePackageJson(tmp, { 'app-a': '^1.0.0', 'app-b': '^1.0.0' });
 
-    await assert.rejects(
-      () => createGuild(tmp),
-      /Circular dependency detected/,
-    );
+    const g = await createGuild(tmp);
+    assert.equal(g.apparatuses().length, 0);
+    assert.equal(g.failedPlugins().length, 2);
+    const failedIds = g.failedPlugins().map((f) => f.id).sort();
+    assert.deepEqual(failedIds, ['app-a', 'app-b']);
+  });
+
+  it('cascades failures to transitive dependents', async () => {
+    const tmp = makeTmpDir();
+    installFakeApparatus(tmp, 'db');
+    installFakeApparatus(tmp, 'web', { requires: ['db', 'cache'] });
+    installFakeApparatus(tmp, 'api', { requires: ['web'] });
+    writeGuildJson(tmp, { plugins: ['db', 'web', 'api'] });
+    writePackageJson(tmp, { 'db': '^1.0.0', 'web': '^1.0.0', 'api': '^1.0.0' });
+
+    const g = await createGuild(tmp);
+    // db is healthy; web fails (missing cache); api cascades
+    assert.equal(g.apparatuses().length, 1);
+    assert.equal(g.apparatuses()[0]!.id, 'db');
+    assert.equal(g.failedPlugins().length, 2);
+    const failedIds = g.failedPlugins().map((f) => f.id).sort();
+    assert.deepEqual(failedIds, ['api', 'web']);
+    const apiFailure = g.failedPlugins().find((f) => f.id === 'api');
+    assert.match(apiFailure!.reason, /depends on failed plugin "web"/);
   });
 });
 
diff --git a/packages/framework/arbor/src/arbor.ts b/packages/framework/arbor/src/arbor.ts
index 9df1acb..a40f18a 100644
--- a/packages/framework/arbor/src/arbor.ts
+++ b/packages/framework/arbor/src/arbor.ts
@@ -31,10 +31,12 @@ import type {
   Guild,
   LoadedKit,
   LoadedApparatus,
+  FailedPlugin,
 } from '@shardworks/nexus-core';
 
 import {
   validateRequires,
+  filterFailedPlugins,
   topoSort,
   collectStartupWarnings,
   buildStartupContext,
@@ -97,7 +99,24 @@ export async function createGuild(root?: string): Promise<Guild> {
 
   // ── Validation phase ───────────────────────────────────────────────
 
-  validateRequires(kits, apparatuses);
+  const allFailures: FailedPlugin[] = [];
+
+  const rootFailures = validateRequires(kits, apparatuses);
+  allFailures.push(...rootFailures);
+
+  // Remove plugins that transitively depend on failed ones
+  if (rootFailures.length > 0) {
+    const filtered = filterFailedPlugins(kits, apparatuses, rootFailures);
+    kits.length = 0;
+    kits.push(...filtered.kits);
+    apparatuses.length = 0;
+    apparatuses.push(...filtered.apparatuses);
+    allFailures.push(...filtered.cascaded);
+
+    for (const f of allFailures) {
+      console.warn(`[arbor] ${f.reason}`);
+    }
+  }
 
   // ── Startup warnings ───────────────────────────────────────────────
 
@@ -152,8 +171,9 @@ export async function createGuild(root?: string): Promise<Guild> {
       return config;
     },
 
-    kits()        { return [...kits]; },
-    apparatuses() { return [...orderedApparatuses]; },
+    kits()          { return [...kits]; },
+    apparatuses()   { return [...orderedApparatuses]; },
+    failedPlugins() { return [...allFailures]; },
   };
   setGuild(guildInstance);
 
diff --git a/packages/framework/arbor/src/guild-lifecycle.test.ts b/packages/framework/arbor/src/guild-lifecycle.test.ts
index 4f6f396..6c6f90a 100644
--- a/packages/framework/arbor/src/guild-lifecycle.test.ts
+++ b/packages/framework/arbor/src/guild-lifecycle.test.ts
@@ -10,6 +10,7 @@ import assert from 'node:assert/strict';
 import type { LoadedKit, LoadedApparatus, StartupContext } from '@shardworks/nexus-core';
 import {
   validateRequires,
+  filterFailedPlugins,
   topoSort,
   collectStartupWarnings,
   buildStartupContext,
@@ -56,13 +57,13 @@ function makeApparatus(
 
 describe('validateRequires', () => {
   it('passes with no plugins', () => {
-    assert.doesNotThrow(() => validateRequires([], []));
+    assert.deepEqual(validateRequires([], []), []);
   });
 
   it('passes with kits and apparatuses that have no requires', () => {
     const kits = [makeKit('relay-kit')];
     const apps = [makeApparatus('tools')];
-    assert.doesNotThrow(() => validateRequires(kits, apps));
+    assert.deepEqual(validateRequires(kits, apps), []);
   });
 
   it('passes when apparatus requires another installed apparatus', () => {
@@ -70,29 +71,29 @@ describe('validateRequires', () => {
       makeApparatus('db'),
       makeApparatus('ledger', { requires: ['db'] }),
     ];
-    assert.doesNotThrow(() => validateRequires([], apps));
+    assert.deepEqual(validateRequires([], apps), []);
   });
 
   it('passes when kit requires an installed apparatus', () => {
     const kits = [makeKit('relay-kit', { requires: ['ledger'] })];
     const apps = [makeApparatus('ledger')];
-    assert.doesNotThrow(() => validateRequires(kits, apps));
+    assert.deepEqual(validateRequires(kits, apps), []);
   });
 
   it('throws when apparatus requires a missing plugin', () => {
     const apps = [makeApparatus('ledger', { requires: ['db'] })];
-    assert.throws(
-      () => validateRequires([], apps),
-      /requires "db", which is not installed/,
-    );
+    const failures = validateRequires([], apps);
+    assert.equal(failures.length, 1);
+    assert.equal(failures[0]!.id, 'ledger');
+    assert.match(failures[0]!.reason, /requires "db"/);
   });
 
   it('throws when kit requires a missing plugin', () => {
     const kits = [makeKit('relay-kit', { requires: ['nonexistent'] })];
-    assert.throws(
-      () => validateRequires(kits, []),
-      /requires "nonexistent", which is not installed/,
-    );
+    const failures = validateRequires(kits, []);
+    assert.equal(failures.length, 1);
+    assert.equal(failures[0]!.id, 'relay-kit');
+    assert.match(failures[0]!.reason, /requires "nonexistent"/);
   });
 
   it('throws when kit requires another kit (not an apparatus)', () => {
@@ -100,20 +101,25 @@ describe('validateRequires', () => {
       makeKit('kit-a'),
       makeKit('kit-b', { requires: ['kit-a'] }),
     ];
-    assert.throws(
-      () => validateRequires(kits, []),
-      /but that plugin is a kit, not an apparatus/,
-    );
+    const failures = validateRequires(kits, []);
+    assert.equal(failures.length, 1);
+    assert.equal(failures[0]!.id, 'kit-b');
+    assert.match(failures[0]!.reason, /but that plugin is a kit/);
   });
 
   it('includes the dependent and dependency names in the error', () => {
     const apps = [makeApparatus('sessions', { requires: ['ledger'] })];
-    assert.throws(
-      () => validateRequires([], apps),
-      (err: Error) => {
-        return err.message.includes('"sessions"') && err.message.includes('"ledger"');
-      },
-    );
+    const failures = validateRequires([], apps);
+    assert.ok(failures[0]!.reason.includes('"sessions"') && failures[0]!.reason.includes('"ledger"'));
+  });
+
+  it('collects multiple failures in one pass', () => {
+    const apps = [
+      makeApparatus('alpha', { requires: ['missing-x'] }),
+      makeApparatus('beta', { requires: ['missing-y'] }),
+    ];
+    const failures = validateRequires([], apps);
+    assert.equal(failures.length, 2);
   });
 
   // ── Cycle detection ────────────────────────────────────────────────
@@ -123,10 +129,10 @@ describe('validateRequires', () => {
       makeApparatus('a', { requires: ['b'] }),
       makeApparatus('b', { requires: ['a'] }),
     ];
-    assert.throws(
-      () => validateRequires([], apps),
-      /Circular dependency detected/,
-    );
+    const failures = validateRequires([], apps);
+    assert.ok(failures.length >= 2);
+    const ids = failures.map((f) => f.id);
+    assert.ok(ids.includes('a') && ids.includes('b'));
   });
 
   it('detects a transitive circular dependency (A → B → C → A)', () => {
@@ -135,10 +141,10 @@ describe('validateRequires', () => {
       makeApparatus('b', { requires: ['c'] }),
       makeApparatus('c', { requires: ['a'] }),
     ];
-    assert.throws(
-      () => validateRequires([], apps),
-      /Circular dependency detected/,
-    );
+    const failures = validateRequires([], apps);
+    assert.ok(failures.length >= 3);
+    const ids = failures.map((f) => f.id);
+    assert.ok(ids.includes('a') && ids.includes('b') && ids.includes('c'));
   });
 
   it('includes the cycle path in the error message', () => {
@@ -146,13 +152,8 @@ describe('validateRequires', () => {
       makeApparatus('x', { requires: ['y'] }),
       makeApparatus('y', { requires: ['x'] }),
     ];
-    assert.throws(
-      () => validateRequires([], apps),
-      (err: Error) => {
-        // The cycle path should contain both nodes
-        return err.message.includes('x') && err.message.includes('y') && err.message.includes('→');
-      },
-    );
+    const failures = validateRequires([], apps);
+    assert.ok(failures.every((f) => f.reason.includes('circular dependency')));
   });
 
   it('does not false-positive on a diamond dependency', () => {
@@ -163,15 +164,80 @@ describe('validateRequires', () => {
       makeApparatus('c', { requires: ['d'] }),
       makeApparatus('a', { requires: ['b', 'c'] }),
     ];
-    assert.doesNotThrow(() => validateRequires([], apps));
+    assert.deepEqual(validateRequires([], apps), []);
   });
 
   it('passes with a self-referencing apparatus (allowed by requires check but not cycle check)', () => {
     const apps = [makeApparatus('a', { requires: ['a'] })];
-    assert.throws(
-      () => validateRequires([], apps),
-      /Circular dependency detected/,
-    );
+    const failures = validateRequires([], apps);
+    assert.equal(failures.length, 1);
+    assert.equal(failures[0]!.id, 'a');
+    assert.match(failures[0]!.reason, /circular dependency/);
+  });
+});
+
+// ── filterFailedPlugins ──────────────────────────────────────────────
+
+describe('filterFailedPlugins', () => {
+  it('returns all plugins when there are no failures', () => {
+    const kits = [makeKit('k1')];
+    const apps = [makeApparatus('a1'), makeApparatus('a2')];
+    const result = filterFailedPlugins(kits, apps, []);
+    assert.equal(result.kits.length, 1);
+    assert.equal(result.apparatuses.length, 2);
+    assert.deepEqual(result.cascaded, []);
+  });
+
+  it('removes apparatus that depends on a failed plugin', () => {
+    const apps = [
+      makeApparatus('db'),
+      makeApparatus('web', { requires: ['db'] }),
+    ];
+    const rootFailures = [{ id: 'db', reason: 'db failed' }];
+    const result = filterFailedPlugins([], apps, rootFailures);
+    assert.equal(result.apparatuses.length, 0);
+    assert.equal(result.cascaded.length, 1);
+    assert.equal(result.cascaded[0]!.id, 'web');
+    assert.match(result.cascaded[0]!.reason, /depends on failed plugin "db"/);
+  });
+
+  it('cascades transitively (A → B → C, A fails)', () => {
+    const apps = [
+      makeApparatus('a'),
+      makeApparatus('b', { requires: ['a'] }),
+      makeApparatus('c', { requires: ['b'] }),
+    ];
+    const rootFailures = [{ id: 'a', reason: 'a failed' }];
+    const result = filterFailedPlugins([], apps, rootFailures);
+    assert.equal(result.apparatuses.length, 0);
+    assert.equal(result.cascaded.length, 2);
+    const cascadedIds = result.cascaded.map((f) => f.id).sort();
+    assert.deepEqual(cascadedIds, ['b', 'c']);
+  });
+
+  it('removes kits that depend on a failed apparatus', () => {
+    const kits = [makeKit('my-kit', { requires: ['tools'] })];
+    const apps = [makeApparatus('tools')];
+    const rootFailures = [{ id: 'tools', reason: 'tools failed' }];
+    const result = filterFailedPlugins(kits, apps, rootFailures);
+    assert.equal(result.kits.length, 0);
+    assert.equal(result.cascaded.length, 1);
+    assert.equal(result.cascaded[0]!.id, 'my-kit');
+    assert.match(result.cascaded[0]!.reason, /depends on failed plugin "tools"/);
+  });
+
+  it('preserves healthy plugins alongside failed ones', () => {
+    const apps = [
+      makeApparatus('healthy'),
+      makeApparatus('broken'),
+      makeApparatus('dependent', { requires: ['broken'] }),
+    ];
+    const rootFailures = [{ id: 'broken', reason: 'broken failed' }];
+    const result = filterFailedPlugins([], apps, rootFailures);
+    assert.equal(result.apparatuses.length, 1);
+    assert.equal(result.apparatuses[0]!.id, 'healthy');
+    assert.equal(result.cascaded.length, 1);
+    assert.equal(result.cascaded[0]!.id, 'dependent');
   });
 });
 
diff --git a/packages/framework/arbor/src/guild-lifecycle.ts b/packages/framework/arbor/src/guild-lifecycle.ts
index a01281c..e9c88b5 100644
--- a/packages/framework/arbor/src/guild-lifecycle.ts
+++ b/packages/framework/arbor/src/guild-lifecycle.ts
@@ -13,6 +13,7 @@ import type {
   StartupContext,
   LoadedKit,
   LoadedApparatus,
+  FailedPlugin,
 } from '@shardworks/nexus-core';
 
 // ── Types ────────────────────────────────────────────────────────────
@@ -26,7 +27,7 @@ export type EventHandlerMap = Map<
 
 /**
  * Validate all `requires` declarations and detect circular dependencies.
- * Throws with a descriptive error on the first problem found.
+ * Returns an array of FailedPlugin entries describing every problem found.
  *
  * Checks:
  * - Apparatus requires: every named dependency must exist (kit or apparatus).
@@ -37,7 +38,10 @@ export type EventHandlerMap = Map<
 export function validateRequires(
   kits: LoadedKit[],
   apparatuses: LoadedApparatus[],
-): void {
+): FailedPlugin[] {
+  const failures: FailedPlugin[] = [];
+  const failedIds = new Set<string>();
+
   const apparatusIds = new Set(apparatuses.map((a) => a.id));
   const allIds = new Set([
     ...kits.map((k) => k.id),
@@ -48,9 +52,13 @@ export function validateRequires(
   for (const app of apparatuses) {
     for (const dep of app.apparatus.requires ?? []) {
       if (!allIds.has(dep)) {
-        throw new Error(
-          `[arbor] "${app.id}" requires "${dep}", which is not installed.`,
-        );
+        if (!failedIds.has(app.id)) {
+          failedIds.add(app.id);
+          failures.push({
+            id:     app.id,
+            reason: `"${app.id}" requires "${dep}", which is not installed.`,
+          });
+        }
       }
     }
   }
@@ -59,15 +67,20 @@ export function validateRequires(
   for (const kit of kits) {
     for (const dep of kit.kit.requires ?? []) {
       if (!apparatusIds.has(dep)) {
-        if (!allIds.has(dep)) {
-          throw new Error(
-            `[arbor] kit "${kit.id}" requires "${dep}", which is not installed.`,
-          );
+        if (!failedIds.has(kit.id)) {
+          failedIds.add(kit.id);
+          if (!allIds.has(dep)) {
+            failures.push({
+              id:     kit.id,
+              reason: `kit "${kit.id}" requires "${dep}", which is not installed.`,
+            });
+          } else {
+            failures.push({
+              id:     kit.id,
+              reason: `kit "${kit.id}" requires "${dep}", but that plugin is a kit, not an apparatus. Kit requires must name apparatus plugins.`,
+            });
+          }
         }
-        throw new Error(
-          `[arbor] kit "${kit.id}" requires "${dep}", but that plugin is a kit, not an apparatus. ` +
-          `Kit requires must name apparatus plugins.`,
-        );
       }
     }
   }
@@ -75,12 +88,19 @@ export function validateRequires(
   // Detect circular dependencies among apparatuses
   const visiting = new Set<string>();
   const visited = new Set<string>();
+  const cycleParticipants = new Set<string>();
 
   function visit(id: string, chain: string[]): void {
     if (visited.has(id)) return;
     if (visiting.has(id)) {
-      const cycle = [...chain, id].join(' → ');
-      throw new Error(`[arbor] Circular dependency detected: ${cycle}`);
+      // Back-edge detected — extract cycle participants from chain
+      const cycleStart = chain.indexOf(id);
+      const cycleNodes = cycleStart >= 0 ? chain.slice(cycleStart) : [...chain];
+      cycleNodes.push(id);
+      for (const node of cycleNodes) {
+        cycleParticipants.add(node);
+      }
+      return;
     }
     visiting.add(id);
     const app = apparatuses.find((a) => a.id === id);
@@ -96,6 +116,76 @@ export function validateRequires(
   for (const app of apparatuses) {
     visit(app.id, []);
   }
+
+  for (const id of cycleParticipants) {
+    if (!failedIds.has(id)) {
+      failedIds.add(id);
+      failures.push({
+        id,
+        reason: `"${id}" is part of a circular dependency chain.`,
+      });
+    }
+  }
+
+  return failures;
+}
+
+// ── Cascade filtering ─────────────────────────────────────────────────
+
+/**
+ * Remove plugins that transitively depend on any failed plugin.
+ *
+ * Iterates until stable, cascading failures through the dependency graph.
+ * Returns healthy plugins and any newly-cascaded failures.
+ */
+export function filterFailedPlugins(
+  kits: LoadedKit[],
+  apparatuses: LoadedApparatus[],
+  rootFailures: FailedPlugin[],
+): { kits: LoadedKit[]; apparatuses: LoadedApparatus[]; cascaded: FailedPlugin[] } {
+  const failedIds = new Set<string>(rootFailures.map((f) => f.id));
+  const cascaded: FailedPlugin[] = [];
+
+  // Apparatus cascade: iterate until no new failures
+  let changed = true;
+  while (changed) {
+    changed = false;
+    for (const app of apparatuses) {
+      if (failedIds.has(app.id)) continue;
+      for (const dep of app.apparatus.requires ?? []) {
+        if (failedIds.has(dep)) {
+          failedIds.add(app.id);
+          cascaded.push({
+            id:     app.id,
+            reason: `"${app.id}" depends on failed plugin "${dep}".`,
+          });
+          changed = true;
+          break;
+        }
+      }
+    }
+  }
+
+  // Kit cascade: single pass (kits can't depend on other kits)
+  for (const kit of kits) {
+    if (failedIds.has(kit.id)) continue;
+    for (const dep of kit.kit.requires ?? []) {
+      if (failedIds.has(dep)) {
+        failedIds.add(kit.id);
+        cascaded.push({
+          id:     kit.id,
+          reason: `"${kit.id}" depends on failed plugin "${dep}".`,
+        });
+        break;
+      }
+    }
+  }
+
+  return {
+    kits:        kits.filter((k) => !failedIds.has(k.id)),
+    apparatuses: apparatuses.filter((a) => !failedIds.has(a.id)),
+    cascaded,
+  };
 }
 
 // ── Dependency ordering ──────────────────────────────────────────────
diff --git a/packages/framework/cli/src/commands/status.ts b/packages/framework/cli/src/commands/status.ts
index b9c44be..578e8c1 100644
--- a/packages/framework/cli/src/commands/status.ts
+++ b/packages/framework/cli/src/commands/status.ts
@@ -30,16 +30,18 @@ export default tool({
 
     const { home } = g;
     const config = readGuildConfig(home);
+    const failed = g.failedPlugins();
 
     // Note: at status time we don't load/start plugins — we just report what's
     // declared in guild.json. Type discrimination (kit vs apparatus) requires
     // loading the modules, which is deferred to avoid startup cost for status.
     const result = {
-      guild:   config.name,
-      nexus:   VERSION,
+      guild:         config.name,
+      nexus:         VERSION,
       home,
-      model:   config.settings?.model ?? '(not set)',
-      plugins: [...config.plugins].sort(),
+      model:         config.settings?.model ?? '(not set)',
+      plugins:       [...config.plugins].sort(),
+      failedPlugins: failed,
     };
 
     if (params.json) {
@@ -53,6 +55,15 @@ export default tool({
       `Model:    ${result.model}`,
       `Plugins:  ${result.plugins.length > 0 ? result.plugins.join(', ') : '(none)'}`,
     ];
+
+    if (failed.length > 0) {
+      lines.push('');
+      lines.push('Failed plugins:');
+      for (const f of failed) {
+        lines.push(`  ${f.id}: ${f.reason}`);
+      }
+    }
+
     return lines.join('\n');
   },
 });
diff --git a/packages/framework/cli/src/program.ts b/packages/framework/cli/src/program.ts
index bea4f53..067f477 100644
--- a/packages/framework/cli/src/program.ts
+++ b/packages/framework/cli/src/program.ts
@@ -160,7 +160,13 @@ export async function main(): Promise<void> {
   // If the guild doesn't have the tools apparatus installed, no plugin
   // tools are available — only framework commands.
   if (home) {
-    await createGuild(home);
+    try {
+      await createGuild(home);
+    } catch (err) {
+      const message = err instanceof Error ? err.message : String(err);
+      console.warn(`[nsg] Guild failed to load: ${message}`);
+      console.warn('[nsg] Plugin-contributed commands are unavailable. Framework commands still work.');
+    }
 
     try {
       const instrumentarium = guild().apparatus<InstrumentariumApi>('tools');
@@ -169,8 +175,8 @@ export async function main(): Promise<void> {
         .map((r) => r.definition);
       registerTools(program, pluginTools);
     } catch {
-      // No Instrumentarium installed — only framework commands available.
-      // This is fine; the guild just doesn't have plugin-contributed CLI tools.
+      // No Instrumentarium installed or guild failed to load —
+      // only framework commands available.
     }
   }
 
diff --git a/packages/framework/core/src/guild.ts b/packages/framework/core/src/guild.ts
index 24e30bb..4421232 100644
--- a/packages/framework/core/src/guild.ts
+++ b/packages/framework/core/src/guild.ts
@@ -13,7 +13,7 @@
  */
 
 import type { GuildConfig } from './guild-config.ts';
-import type { LoadedKit, LoadedApparatus } from './plugin.ts';
+import type { LoadedKit, LoadedApparatus, FailedPlugin } from './plugin.ts';
 
 // ── Interface ──────────────────────────────────────────────────────────
 
@@ -70,6 +70,9 @@ export interface Guild {
 
   /** Snapshot of all started apparatuses. */
   apparatuses(): LoadedApparatus[]
+
+  /** Snapshot of plugins that failed to load, validate, or start. */
+  failedPlugins(): FailedPlugin[]
 }
 
 // ── Singleton ──────────────────────────────────────────────────────────
diff --git a/packages/framework/core/src/index.ts b/packages/framework/core/src/index.ts
index 5824ad8..3abda86 100644
--- a/packages/framework/core/src/index.ts
+++ b/packages/framework/core/src/index.ts
@@ -16,6 +16,7 @@ export {
   type LoadedKit,
   type LoadedApparatus,
   type LoadedPlugin,
+  type FailedPlugin,
   type StartupContext,
   isKit,
   isApparatus,
diff --git a/packages/framework/core/src/plugin.ts b/packages/framework/core/src/plugin.ts
index 7c3f25a..02f19dd 100644
--- a/packages/framework/core/src/plugin.ts
+++ b/packages/framework/core/src/plugin.ts
@@ -31,6 +31,12 @@ export interface LoadedApparatus {
 /** Union of loaded kit and loaded apparatus. */
 export type LoadedPlugin = LoadedKit | LoadedApparatus
 
+/** A plugin that failed to load, validate, or start. */
+export interface FailedPlugin {
+  readonly id:     string
+  readonly reason: string
+}
+
 // ── Context types ──────────────────────────────────────────────────────
 
 /**

```

## Full File Contents (for context)

=== FILE: packages/framework/arbor/src/arbor.test.ts ===
/**
 * Integration tests for createGuild — the Arbor entry point.
 *
 * Tests the full pipeline: read guild config → load plugins → validate →
 * start → return Guild instance. Uses real temp directories with fake
 * plugin packages in node_modules.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clearGuild, guild } from '@shardworks/nexus-core';
import { createGuild } from './arbor.ts';

// ── Fixture helpers ──────────────────────────────────────────────────

let tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arbor-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  clearGuild();
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

/**
 * Write a guild.json to the given directory.
 */
function writeGuildJson(dir: string, config: Record<string, unknown>): void {
  const full = {
    name: 'test-guild',
    nexus: '0.0.0',
    plugins: [],
    settings: { model: 'sonnet' },
    ...config,
  };
  fs.writeFileSync(path.join(dir, 'guild.json'), JSON.stringify(full, null, 2) + '\n');
}

/**
 * Write a guild-root package.json with the given dependencies.
 */
function writePackageJson(dir: string, deps: Record<string, string>): void {
  const pkg = { name: 'test-guild', version: '1.0.0', type: 'module', dependencies: deps };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
}

/**
 * Create a fake kit plugin in node_modules.
 *
 * A kit export: `export default { kit: { ... } }`
 */
function installFakeKit(
  guildRoot: string,
  packageName: string,
  kitContributions: Record<string, unknown> = {},
): void {
  const pkgDir = path.join(guildRoot, 'node_modules', packageName);
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: packageName, version: '1.0.0', type: 'module', exports: { '.': './index.js' } }),
  );
  const kitObj = JSON.stringify(kitContributions);
  fs.writeFileSync(
    path.join(pkgDir, 'index.js'),
    `export default { kit: ${kitObj} };\n`,
  );
}

/**
 * Create a fake apparatus plugin in node_modules.
 *
 * An apparatus export: `export default { apparatus: { start() {}, ... } }`
 *
 * The start function is a no-op by default. For custom behavior, pass
 * a `startBody` string — it becomes the body of the async start() function.
 * The module imports `node:fs` at the top so start bodies can use `fs.*`.
 */
function installFakeApparatus(
  guildRoot: string,
  packageName: string,
  opts: {
    requires?: string[];
    provides?: string;    // JS expression for the provides object
    consumes?: string[];
    startBody?: string;   // JS code for the start() function body (can use `fs`)
  } = {},
): void {
  const pkgDir = path.join(guildRoot, 'node_modules', packageName);
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: packageName, version: '2.0.0', type: 'module', exports: { '.': './index.js' } }),
  );

  const requires = opts.requires ? JSON.stringify(opts.requires) : 'undefined';
  const provides = opts.provides ?? 'undefined';
  const consumes = opts.consumes ? JSON.stringify(opts.consumes) : 'undefined';
  const startBody = opts.startBody ?? '';

  fs.writeFileSync(
    path.join(pkgDir, 'index.js'),
    `import fs from 'node:fs';
export default {
  apparatus: {
    requires: ${requires},
    provides: ${provides},
    consumes: ${consumes},
    async start(ctx) { ${startBody} },
  },
};\n`,
  );
}

// ── createGuild — basic ──────────────────────────────────────────────

describe('createGuild — basic', () => {
  it('returns a Guild object with the correct home path', async () => {
    const tmp = makeTmpDir();
    writeGuildJson(tmp, {});
    writePackageJson(tmp, {});

    const g = await createGuild(tmp);
    assert.equal(g.home, tmp);
  });

  it('sets the guild() singleton', async () => {
    const tmp = makeTmpDir();
    writeGuildJson(tmp, {});
    writePackageJson(tmp, {});

    const g = await createGuild(tmp);
    assert.equal(guild(), g);
  });

  it('returns the guild config via guildConfig()', async () => {
    const tmp = makeTmpDir();
    writeGuildJson(tmp, { name: 'my-test-guild' });
    writePackageJson(tmp, {});

    const g = await createGuild(tmp);
    assert.equal(g.guildConfig().name, 'my-test-guild');
  });

  it('works with no plugins declared', async () => {
    const tmp = makeTmpDir();
    writeGuildJson(tmp, { plugins: [] });
    writePackageJson(tmp, {});

    const g = await createGuild(tmp);
    assert.deepEqual(g.kits(), []);
    assert.deepEqual(g.apparatuses(), []);
    assert.deepEqual(g.failedPlugins(), []);
  });
});

// ── createGuild — kit loading ────────────────────────────────────────

describe('createGuild — kit loading', () => {
  it('loads a kit plugin and exposes it via kits()', async () => {
    const tmp = makeTmpDir();
    installFakeKit(tmp, '@shardworks/nexus-relay-kit', { tools: ['relay-send'] });
    writeGuildJson(tmp, { plugins: ['nexus-relay'] });
    writePackageJson(tmp, { '@shardworks/nexus-relay-kit': '^1.0.0' });

    const g = await createGuild(tmp);
    assert.equal(g.kits().length, 1);
    assert.equal(g.kits()[0]!.id, 'nexus-relay');
    assert.equal(g.kits()[0]!.packageName, '@shardworks/nexus-relay-kit');
  });

  it('loads multiple kits', async () => {
    const tmp = makeTmpDir();
    installFakeKit(tmp, '@shardworks/nexus-stdlib', { tools: ['commission'] });
    installFakeKit(tmp, '@shardworks/nexus-relay-kit', { relays: ['email'] });
    writeGuildJson(tmp, { plugins: ['nexus-stdlib', 'nexus-relay'] });
    writePackageJson(tmp, {
      '@shardworks/nexus-stdlib': '^1.0.0',
      '@shardworks/nexus-relay-kit': '^1.0.0',
    });

    const g = await createGuild(tmp);
    assert.equal(g.kits().length, 2);
    const ids = g.kits().map((k) => k.id).sort();
    assert.deepEqual(ids, ['nexus-relay', 'nexus-stdlib']);
  });
});

// ── createGuild — apparatus loading ──────────────────────────────────

describe('createGuild — apparatus loading', () => {
  it('loads an apparatus and exposes it via apparatuses()', async () => {
    const tmp = makeTmpDir();
    installFakeApparatus(tmp, '@shardworks/tools-apparatus');
    writeGuildJson(tmp, { plugins: ['tools'] });
    writePackageJson(tmp, { '@shardworks/tools-apparatus': '^2.0.0' });

    const g = await createGuild(tmp);
    assert.equal(g.apparatuses().length, 1);
    assert.equal(g.apparatuses()[0]!.id, 'tools');
  });

  it('calls start() on each apparatus during guild creation', async () => {
    const tmp = makeTmpDir();
    // Use a side-effect file to prove start() was called
    const marker = path.join(tmp, '.started');
    installFakeApparatus(tmp, '@shardworks/tools-apparatus', {
      startBody: `fs.writeFileSync(${JSON.stringify(marker)}, 'yes');`,
    });
    writeGuildJson(tmp, { plugins: ['tools'] });
    writePackageJson(tmp, { '@shardworks/tools-apparatus': '^2.0.0' });

    await createGuild(tmp);
    assert.ok(fs.existsSync(marker), 'start() was not called');
  });

  it('starts apparatuses in dependency order', async () => {
    const tmp = makeTmpDir();
    const orderFile = path.join(tmp, '.start-order');

    // "web" requires "db", so db.start() must run first
    installFakeApparatus(tmp, 'db', {
      startBody: `
        const prev = fs.existsSync(${JSON.stringify(orderFile)}) ? fs.readFileSync(${JSON.stringify(orderFile)}, 'utf-8') : '';
        fs.writeFileSync(${JSON.stringify(orderFile)}, prev + 'db\\n');
      `,
    });
    installFakeApparatus(tmp, 'web', {
      requires: ['db'],
      startBody: `
        const prev = fs.existsSync(${JSON.stringify(orderFile)}) ? fs.readFileSync(${JSON.stringify(orderFile)}, 'utf-8') : '';
        fs.writeFileSync(${JSON.stringify(orderFile)}, prev + 'web\\n');
      `,
    });
    writeGuildJson(tmp, { plugins: ['db', 'web'] });
    writePackageJson(tmp, {
      'db': '^1.0.0',
      'web': '^1.0.0',
    });

    await createGuild(tmp);
    const order = fs.readFileSync(orderFile, 'utf-8').trim().split('\n');
    assert.deepEqual(order, ['db', 'web']);
  });

  it('exposes apparatus provides via guild.apparatus()', async () => {
    const tmp = makeTmpDir();
    installFakeApparatus(tmp, '@shardworks/tools-apparatus', {
      provides: '{ list: () => ["tool-a"] }',
    });
    writeGuildJson(tmp, { plugins: ['tools'] });
    writePackageJson(tmp, { '@shardworks/tools-apparatus': '^2.0.0' });

    const g = await createGuild(tmp);
    const api = g.apparatus<{ list: () => string[] }>('tools');
    assert.deepEqual(api.list(), ['tool-a']);
  });

  it('exposes deferred provides set during start() via getter', async () => {
    const tmp = makeTmpDir();

    // Manually create a plugin that mirrors the Stacks pattern:
    // provides is a getter returning a variable that's undefined until start() runs.
    const pkgDir = path.join(tmp, 'node_modules', 'deferred-apparatus');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'deferred-apparatus', version: '1.0.0', type: 'module', exports: { '.': './index.js' } }),
    );
    fs.writeFileSync(
      path.join(pkgDir, 'index.js'),
      `let api;
export default {
  apparatus: {
    requires: undefined,
    get provides() { return api; },
    async start() { api = { ready: true }; },
  },
};\n`,
    );

    writeGuildJson(tmp, { plugins: ['deferred'] });
    writePackageJson(tmp, { 'deferred-apparatus': '^1.0.0' });

    const g = await createGuild(tmp);
    const api = g.apparatus('deferred');
    assert.deepEqual(api, { ready: true });
  });

  it('throws immediately when apparatus has no provides', async () => {
    const tmp = makeTmpDir();
    installFakeApparatus(tmp, '@shardworks/tools-apparatus');
    writeGuildJson(tmp, { plugins: ['tools'] });
    writePackageJson(tmp, { '@shardworks/tools-apparatus': '^2.0.0' });

    const g = await createGuild(tmp);
    assert.throws(() => g.apparatus('tools'), /is not available/);
  });
});

// ── createGuild — plugin config ──────────────────────────────────────

describe('createGuild — plugin config', () => {
  it('returns plugin-specific config via guild.config()', async () => {
    const tmp = makeTmpDir();
    installFakeApparatus(tmp, '@shardworks/tools-apparatus');
    writeGuildJson(tmp, {
      plugins: ['tools'],
      tools: { maxConcurrency: 5 },
    });
    writePackageJson(tmp, { '@shardworks/tools-apparatus': '^2.0.0' });

    const g = await createGuild(tmp);
    const cfg = g.config<{ maxConcurrency: number }>('tools');
    assert.equal(cfg.maxConcurrency, 5);
  });

  it('returns empty object for unconfigured plugin', async () => {
    const tmp = makeTmpDir();
    installFakeApparatus(tmp, '@shardworks/tools-apparatus');
    writeGuildJson(tmp, { plugins: ['tools'] });
    writePackageJson(tmp, { '@shardworks/tools-apparatus': '^2.0.0' });

    const g = await createGuild(tmp);
    const cfg = g.config('tools');
    assert.deepEqual(cfg, {});
  });
});

// ── createGuild — validation ─────────────────────────────────────────

describe('createGuild — validation', () => {
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
});

// ── createGuild — event system ───────────────────────────────────────

describe('createGuild — event system', () => {
  it('fires plugin:initialized for kits before any apparatus starts', async () => {
    const tmp = makeTmpDir();
    const logFile = path.join(tmp, '.event-log');

    installFakeKit(tmp, '@shardworks/nexus-stdlib', { tools: ['commission'] });
    installFakeApparatus(tmp, '@shardworks/tools-apparatus', {
      startBody: `
        const prev = fs.existsSync(${JSON.stringify(logFile)}) ? fs.readFileSync(${JSON.stringify(logFile)}, 'utf-8') : '';
        fs.writeFileSync(${JSON.stringify(logFile)}, prev + 'apparatus-start\\n');
      `,
    });
    writeGuildJson(tmp, { plugins: ['nexus-stdlib', 'tools'] });
    writePackageJson(tmp, {
      '@shardworks/nexus-stdlib': '^1.0.0',
      '@shardworks/tools-apparatus': '^2.0.0',
    });

    await createGuild(tmp);
    // Kit plugin:initialized fires before apparatus start()
    // (We can't easily observe the event from outside, but we can verify
    // the apparatus started — the order guarantee is structural.)
    assert.ok(fs.existsSync(logFile), 'apparatus start() should have run');
  });

  it('makes StartupContext.on() available during apparatus start()', async () => {
    const tmp = makeTmpDir();
    const marker = path.join(tmp, '.ctx-available');

    installFakeApparatus(tmp, '@shardworks/tools-apparatus', {
      startBody: `
        if (typeof ctx.on === 'function') {
          fs.writeFileSync(${JSON.stringify(marker)}, 'yes');
        }
      `,
    });
    writeGuildJson(tmp, { plugins: ['tools'] });
    writePackageJson(tmp, { '@shardworks/tools-apparatus': '^2.0.0' });

    await createGuild(tmp);
    assert.ok(fs.existsSync(marker), 'ctx.on should be available during start()');
  });
});

// ── createGuild — resilience ─────────────────────────────────────────

describe('createGuild — resilience', () => {
  it('skips plugins with no matching package in package.json', async () => {
    const tmp = makeTmpDir();
    // guild.json lists a plugin, but package.json has no matching dep
    writeGuildJson(tmp, { plugins: ['nexus-phantom'] });
    writePackageJson(tmp, {});

    const g = await createGuild(tmp);
    // Should not throw; plugin is silently skipped
    assert.deepEqual(g.kits(), []);
    assert.deepEqual(g.apparatuses(), []);
  });

  it('skips plugins that fail to load and continues with the rest', async () => {
    const tmp = makeTmpDir();

    // broken-plugin has a syntax error
    const brokenDir = path.join(tmp, 'node_modules', 'broken-plugin');
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(path.join(brokenDir, 'package.json'),
      JSON.stringify({ name: 'broken-plugin', version: '1.0.0', type: 'module', exports: { '.': './index.js' } }));
    fs.writeFileSync(path.join(brokenDir, 'index.js'), 'this is not valid javascript {{{');

    // good-kit loads fine
    installFakeKit(tmp, '@shardworks/nexus-stdlib', { tools: ['commission'] });

    writeGuildJson(tmp, { plugins: ['broken-plugin', 'nexus-stdlib'] });
    writePackageJson(tmp, {
      'broken-plugin': '^1.0.0',
      '@shardworks/nexus-stdlib': '^1.0.0',
    });

    const g = await createGuild(tmp);
    // broken-plugin is skipped; nexus-stdlib loads fine
    assert.equal(g.kits().length, 1);
    assert.equal(g.kits()[0]!.id, 'nexus-stdlib');
  });
});

// ── createGuild — snapshot isolation ─────────────────────────────────

describe('createGuild — snapshot isolation', () => {
  it('kits() returns a copy, not a reference to internal state', async () => {
    const tmp = makeTmpDir();
    installFakeKit(tmp, '@shardworks/nexus-stdlib', { tools: [] });
    writeGuildJson(tmp, { plugins: ['nexus-stdlib'] });
    writePackageJson(tmp, { '@shardworks/nexus-stdlib': '^1.0.0' });

    const g = await createGuild(tmp);
    const a = g.kits();
    const b = g.kits();
    assert.notEqual(a, b); // Different array references
    assert.deepEqual(a, b); // Same content
  });

  it('apparatuses() returns a copy, not a reference to internal state', async () => {
    const tmp = makeTmpDir();
    installFakeApparatus(tmp, '@shardworks/tools-apparatus');
    writeGuildJson(tmp, { plugins: ['tools'] });
    writePackageJson(tmp, { '@shardworks/tools-apparatus': '^2.0.0' });

    const g = await createGuild(tmp);
    const a = g.apparatuses();
    const b = g.apparatuses();
    assert.notEqual(a, b);
    assert.deepEqual(a, b);
  });
});

=== FILE: packages/framework/arbor/src/arbor.ts ===
/**
 * Arbor — the guild runtime.
 *
 * `createGuild()` is the single entry point. It reads guild.json, loads all
 * declared plugins, validates dependencies, starts apparatus in order, wires
 * the guild() singleton, and returns the Guild object.
 *
 * The full plugin lifecycle:
 *   1. Load    — imports all declared plugin packages, discriminates kit vs apparatus
 *   2. Validate — checks `requires` declarations, detects circular dependencies
 *   3. Start   — calls start(ctx) on each apparatus in dependency-resolved order
 *   4. Events  — fires `plugin:initialized` after each plugin loads
 *   5. Warn    — advisory warnings for mismatched kit contributions / recommends
 *
 * Pure logic (validation, ordering, events) lives in guild-lifecycle.ts.
 * This file handles I/O and orchestration.
 */

import {
  readGuildConfig,
  writeGuildConfig,
  findGuildRoot,
  isKit,
  isApparatus,
  setGuild,
  resolveGuildPackageEntry,
  resolvePackageNameForPluginId,
  readGuildPackageJson,
} from '@shardworks/nexus-core';
import type {
  Guild,
  LoadedKit,
  LoadedApparatus,
  FailedPlugin,
} from '@shardworks/nexus-core';

import {
  validateRequires,
  filterFailedPlugins,
  topoSort,
  collectStartupWarnings,
  buildStartupContext,
  fireEvent,
} from './guild-lifecycle.ts';
import type { EventHandlerMap } from './guild-lifecycle.ts';

// ── Public API ────────────────────────────────────────────────────────

/**
 * Create and start a guild.
 *
 * Reads guild.json, loads all declared plugins, validates dependencies,
 * starts apparatus in dependency order, and returns the Guild object.
 * Also sets the guild() singleton so apparatus code can access it.
 *
 * @param root - Absolute path to the guild root. Defaults to auto-detection
 *               by walking up from cwd until guild.json is found.
 * @returns The initialized Guild — the same object guild() returns.
 */
export async function createGuild(root?: string): Promise<Guild> {
  const guildRoot = root ?? findGuildRoot();
  const config = readGuildConfig(guildRoot);

  const kits:        LoadedKit[]        = [];
  const apparatuses: LoadedApparatus[]  = [];
  const eventHandlers: EventHandlerMap = new Map();

  // ── Load phase ─────────────────────────────────────────────────────

  for (const pluginId of config.plugins) {
    const packageName = resolvePackageNameForPluginId(guildRoot, pluginId);
    if (!packageName) {
      console.warn(`[arbor] No package found in package.json for plugin "${pluginId}" — skipping`);
      continue;
    }

    const { version } = readGuildPackageJson(guildRoot, packageName);

    try {
      const entryPath = resolveGuildPackageEntry(guildRoot, packageName);
      const mod = await import(entryPath) as { default: unknown };
      const raw = mod.default;

      if (isApparatus(raw)) {
        apparatuses.push({ packageName, id: pluginId, version, apparatus: raw.apparatus });
      } else if (isKit(raw)) {
        kits.push({ packageName, id: pluginId, version, kit: raw.kit });
      } else {
        console.warn(
          `[arbor] Plugin "${packageName}" does not export a kit or apparatus — skipping. ` +
          `Plugins must export { kit: ... } or { apparatus: ... }.`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[arbor] Failed to load plugin "${packageName}": ${message}`);
    }
  }

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

  // ── Startup warnings ───────────────────────────────────────────────

  for (const warning of collectStartupWarnings(kits, apparatuses)) {
    console.warn(warning);
  }

  // ── Start phase ────────────────────────────────────────────────────

  const orderedApparatuses = topoSort(apparatuses);
  const provides = new Map<string, unknown>();

  // Wire guild singleton before any apparatus starts so start() methods
  // can call guild(). The provides Map is populated progressively as each
  // apparatus starts; dependency ordering guarantees declared deps are
  // available.

  const guildInstance: Guild = {
    home: guildRoot,

    apparatus<T>(name: string): T {
      const p = provides.get(name);
      if (p === undefined) {
        throw new Error(
          `[guild] apparatus("${name}") is not available. ` +
          `No loaded apparatus provides this id. Check guild.json plugins list.`,
        );
      }
      return p as T;
    },

    config<T = Record<string, unknown>>(pluginId: string): T {
      // GuildConfig types only the framework-level keys (name, nexus, plugins, etc.).
      // Plugin-specific config sections (e.g. "animator", "stacks") are additional
      // top-level keys in guild.json that GuildConfig doesn't model. The cast is safe
      // because guild.json is a plain JSON object — all keys are accessible at runtime.
      // Plugins can use module augmentation on GuildConfig to get typed access; this
      // generic path remains the untyped fallback.
      const cfg = config as unknown as Record<string, unknown>;
      return (cfg[pluginId] ?? {}) as T;
    },

    writeConfig<T = Record<string, unknown>>(pluginId: string, value: T): void {
      // Update the in-memory config so subsequent reads reflect the change,
      // then persist to disk. The cast is the same pattern as config() above.
      const cfg = config as unknown as Record<string, unknown>;
      cfg[pluginId] = value;
      writeGuildConfig(guildRoot, config);
    },

    guildConfig() {
      return config;
    },

    kits()          { return [...kits]; },
    apparatuses()   { return [...orderedApparatuses]; },
    failedPlugins() { return [...allFailures]; },
  };
  setGuild(guildInstance);

  // Fire plugin:initialized for all kits before starting any apparatus
  for (const kit of kits) {
    await fireEvent(eventHandlers, 'plugin:initialized', kit);
  }

  // Start each apparatus in dependency order
  const startupCtx = buildStartupContext(eventHandlers);
  for (const app of orderedApparatuses) {
    // Register provides before start() so apparatuses with eager provides are
    // visible to later startups that run during this loop.
    if (app.apparatus.provides !== undefined) {
      provides.set(app.id, app.apparatus.provides);
    }

    await app.apparatus.start(startupCtx);

    // Re-check after start() for deferred provides (e.g. Stacks uses a getter
    // that returns undefined until start() populates the backing variable).
    if (!provides.has(app.id) && app.apparatus.provides !== undefined) {
      provides.set(app.id, app.apparatus.provides);
    }

    await fireEvent(eventHandlers, 'plugin:initialized', app);
  }

  return guildInstance;
}

=== FILE: packages/framework/arbor/src/guild-lifecycle.test.ts ===
/**
 * Tests for guild-lifecycle.ts — the pure logic layer of Arbor.
 *
 * All tests use synthetic LoadedKit / LoadedApparatus fixtures.
 * No I/O, no filesystem, no dynamic imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LoadedKit, LoadedApparatus, StartupContext } from '@shardworks/nexus-core';
import {
  validateRequires,
  filterFailedPlugins,
  topoSort,
  collectStartupWarnings,
  buildStartupContext,
  fireEvent,
} from './guild-lifecycle.ts';
import type { EventHandlerMap } from './guild-lifecycle.ts';

// ── Fixture helpers ──────────────────────────────────────────────────

function makeKit(id: string, kit: Record<string, unknown> = {}): LoadedKit {
  return {
    packageName: `@test/${id}`,
    id,
    version: '1.0.0',
    kit,
  };
}

function makeApparatus(
  id: string,
  opts: {
    requires?: string[];
    recommends?: string[];
    provides?: unknown;
    consumes?: string[];
    start?: (ctx: StartupContext) => void | Promise<void>;
  } = {},
): LoadedApparatus {
  return {
    packageName: `@test/${id}`,
    id,
    version: '1.0.0',
    apparatus: {
      requires: opts.requires,
      recommends: opts.recommends,
      provides: opts.provides,
      consumes: opts.consumes,
      start: opts.start ?? (() => {}),
    },
  };
}

// ── validateRequires ─────────────────────────────────────────────────

describe('validateRequires', () => {
  it('passes with no plugins', () => {
    assert.deepEqual(validateRequires([], []), []);
  });

  it('passes with kits and apparatuses that have no requires', () => {
    const kits = [makeKit('relay-kit')];
    const apps = [makeApparatus('tools')];
    assert.deepEqual(validateRequires(kits, apps), []);
  });

  it('passes when apparatus requires another installed apparatus', () => {
    const apps = [
      makeApparatus('db'),
      makeApparatus('ledger', { requires: ['db'] }),
    ];
    assert.deepEqual(validateRequires([], apps), []);
  });

  it('passes when kit requires an installed apparatus', () => {
    const kits = [makeKit('relay-kit', { requires: ['ledger'] })];
    const apps = [makeApparatus('ledger')];
    assert.deepEqual(validateRequires(kits, apps), []);
  });

  it('throws when apparatus requires a missing plugin', () => {
    const apps = [makeApparatus('ledger', { requires: ['db'] })];
    const failures = validateRequires([], apps);
    assert.equal(failures.length, 1);
    assert.equal(failures[0]!.id, 'ledger');
    assert.match(failures[0]!.reason, /requires "db"/);
  });

  it('throws when kit requires a missing plugin', () => {
    const kits = [makeKit('relay-kit', { requires: ['nonexistent'] })];
    const failures = validateRequires(kits, []);
    assert.equal(failures.length, 1);
    assert.equal(failures[0]!.id, 'relay-kit');
    assert.match(failures[0]!.reason, /requires "nonexistent"/);
  });

  it('throws when kit requires another kit (not an apparatus)', () => {
    const kits = [
      makeKit('kit-a'),
      makeKit('kit-b', { requires: ['kit-a'] }),
    ];
    const failures = validateRequires(kits, []);
    assert.equal(failures.length, 1);
    assert.equal(failures[0]!.id, 'kit-b');
    assert.match(failures[0]!.reason, /but that plugin is a kit/);
  });

  it('includes the dependent and dependency names in the error', () => {
    const apps = [makeApparatus('sessions', { requires: ['ledger'] })];
    const failures = validateRequires([], apps);
    assert.ok(failures[0]!.reason.includes('"sessions"') && failures[0]!.reason.includes('"ledger"'));
  });

  it('collects multiple failures in one pass', () => {
    const apps = [
      makeApparatus('alpha', { requires: ['missing-x'] }),
      makeApparatus('beta', { requires: ['missing-y'] }),
    ];
    const failures = validateRequires([], apps);
    assert.equal(failures.length, 2);
  });

  // ── Cycle detection ────────────────────────────────────────────────

  it('detects a direct circular dependency (A → B → A)', () => {
    const apps = [
      makeApparatus('a', { requires: ['b'] }),
      makeApparatus('b', { requires: ['a'] }),
    ];
    const failures = validateRequires([], apps);
    assert.ok(failures.length >= 2);
    const ids = failures.map((f) => f.id);
    assert.ok(ids.includes('a') && ids.includes('b'));
  });

  it('detects a transitive circular dependency (A → B → C → A)', () => {
    const apps = [
      makeApparatus('a', { requires: ['b'] }),
      makeApparatus('b', { requires: ['c'] }),
      makeApparatus('c', { requires: ['a'] }),
    ];
    const failures = validateRequires([], apps);
    assert.ok(failures.length >= 3);
    const ids = failures.map((f) => f.id);
    assert.ok(ids.includes('a') && ids.includes('b') && ids.includes('c'));
  });

  it('includes the cycle path in the error message', () => {
    const apps = [
      makeApparatus('x', { requires: ['y'] }),
      makeApparatus('y', { requires: ['x'] }),
    ];
    const failures = validateRequires([], apps);
    assert.ok(failures.every((f) => f.reason.includes('circular dependency')));
  });

  it('does not false-positive on a diamond dependency', () => {
    // A → B, A → C, B → D, C → D (no cycle)
    const apps = [
      makeApparatus('d'),
      makeApparatus('b', { requires: ['d'] }),
      makeApparatus('c', { requires: ['d'] }),
      makeApparatus('a', { requires: ['b', 'c'] }),
    ];
    assert.deepEqual(validateRequires([], apps), []);
  });

  it('passes with a self-referencing apparatus (allowed by requires check but not cycle check)', () => {
    const apps = [makeApparatus('a', { requires: ['a'] })];
    const failures = validateRequires([], apps);
    assert.equal(failures.length, 1);
    assert.equal(failures[0]!.id, 'a');
    assert.match(failures[0]!.reason, /circular dependency/);
  });
});

// ── filterFailedPlugins ──────────────────────────────────────────────

describe('filterFailedPlugins', () => {
  it('returns all plugins when there are no failures', () => {
    const kits = [makeKit('k1')];
    const apps = [makeApparatus('a1'), makeApparatus('a2')];
    const result = filterFailedPlugins(kits, apps, []);
    assert.equal(result.kits.length, 1);
    assert.equal(result.apparatuses.length, 2);
    assert.deepEqual(result.cascaded, []);
  });

  it('removes apparatus that depends on a failed plugin', () => {
    const apps = [
      makeApparatus('db'),
      makeApparatus('web', { requires: ['db'] }),
    ];
    const rootFailures = [{ id: 'db', reason: 'db failed' }];
    const result = filterFailedPlugins([], apps, rootFailures);
    assert.equal(result.apparatuses.length, 0);
    assert.equal(result.cascaded.length, 1);
    assert.equal(result.cascaded[0]!.id, 'web');
    assert.match(result.cascaded[0]!.reason, /depends on failed plugin "db"/);
  });

  it('cascades transitively (A → B → C, A fails)', () => {
    const apps = [
      makeApparatus('a'),
      makeApparatus('b', { requires: ['a'] }),
      makeApparatus('c', { requires: ['b'] }),
    ];
    const rootFailures = [{ id: 'a', reason: 'a failed' }];
    const result = filterFailedPlugins([], apps, rootFailures);
    assert.equal(result.apparatuses.length, 0);
    assert.equal(result.cascaded.length, 2);
    const cascadedIds = result.cascaded.map((f) => f.id).sort();
    assert.deepEqual(cascadedIds, ['b', 'c']);
  });

  it('removes kits that depend on a failed apparatus', () => {
    const kits = [makeKit('my-kit', { requires: ['tools'] })];
    const apps = [makeApparatus('tools')];
    const rootFailures = [{ id: 'tools', reason: 'tools failed' }];
    const result = filterFailedPlugins(kits, apps, rootFailures);
    assert.equal(result.kits.length, 0);
    assert.equal(result.cascaded.length, 1);
    assert.equal(result.cascaded[0]!.id, 'my-kit');
    assert.match(result.cascaded[0]!.reason, /depends on failed plugin "tools"/);
  });

  it('preserves healthy plugins alongside failed ones', () => {
    const apps = [
      makeApparatus('healthy'),
      makeApparatus('broken'),
      makeApparatus('dependent', { requires: ['broken'] }),
    ];
    const rootFailures = [{ id: 'broken', reason: 'broken failed' }];
    const result = filterFailedPlugins([], apps, rootFailures);
    assert.equal(result.apparatuses.length, 1);
    assert.equal(result.apparatuses[0]!.id, 'healthy');
    assert.equal(result.cascaded.length, 1);
    assert.equal(result.cascaded[0]!.id, 'dependent');
  });
});

// ── topoSort ─────────────────────────────────────────────────────────

describe('topoSort', () => {
  it('returns empty array for no apparatuses', () => {
    assert.deepEqual(topoSort([]), []);
  });

  it('returns a single apparatus unchanged', () => {
    const apps = [makeApparatus('a')];
    const sorted = topoSort(apps);
    assert.equal(sorted.length, 1);
    assert.equal(sorted[0]!.id, 'a');
  });

  it('preserves order when no dependencies exist', () => {
    const apps = [makeApparatus('a'), makeApparatus('b'), makeApparatus('c')];
    const sorted = topoSort(apps);
    assert.deepEqual(sorted.map((a) => a.id), ['a', 'b', 'c']);
  });

  it('places dependencies before dependents', () => {
    const apps = [
      makeApparatus('web', { requires: ['db'] }),
      makeApparatus('db'),
    ];
    const sorted = topoSort(apps);
    const ids = sorted.map((a) => a.id);
    assert.ok(ids.indexOf('db') < ids.indexOf('web'),
      `Expected db before web, got: ${ids.join(', ')}`);
  });

  it('handles a linear chain (A → B → C)', () => {
    const apps = [
      makeApparatus('a', { requires: ['b'] }),
      makeApparatus('b', { requires: ['c'] }),
      makeApparatus('c'),
    ];
    const sorted = topoSort(apps);
    const ids = sorted.map((a) => a.id);
    assert.deepEqual(ids, ['c', 'b', 'a']);
  });

  it('handles a diamond dependency', () => {
    const apps = [
      makeApparatus('top', { requires: ['left', 'right'] }),
      makeApparatus('left', { requires: ['bottom'] }),
      makeApparatus('right', { requires: ['bottom'] }),
      makeApparatus('bottom'),
    ];
    const sorted = topoSort(apps);
    const ids = sorted.map((a) => a.id);

    // bottom must be first; top must be last
    assert.equal(ids[0], 'bottom');
    assert.equal(ids[ids.length - 1], 'top');
    // left and right must both come before top
    assert.ok(ids.indexOf('left') < ids.indexOf('top'));
    assert.ok(ids.indexOf('right') < ids.indexOf('top'));
  });

  it('returns all apparatuses even when some have no deps', () => {
    const apps = [
      makeApparatus('a'),
      makeApparatus('b', { requires: ['a'] }),
      makeApparatus('c'),
    ];
    const sorted = topoSort(apps);
    assert.equal(sorted.length, 3);
    assert.ok(sorted.map((a) => a.id).indexOf('a') < sorted.map((a) => a.id).indexOf('b'));
  });
});

// ── collectStartupWarnings ───────────────────────────────────────────

describe('collectStartupWarnings', () => {
  it('returns no warnings when everything is wired correctly', () => {
    const kits = [makeKit('relay-kit', { requires: ['tools'], tools: ['relay-send'] })];
    const apps = [makeApparatus('tools', { consumes: ['tools'] })];
    const warnings = collectStartupWarnings(kits, apps);
    assert.deepEqual(warnings, []);
  });

  it('returns no warnings with no kits or apparatuses', () => {
    assert.deepEqual(collectStartupWarnings([], []), []);
  });

  it('warns when a kit recommends an apparatus that is not installed', () => {
    const kits = [makeKit('relay-kit', { recommends: ['sessions'] })];
    const warnings = collectStartupWarnings(kits, []);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0]!.includes('recommends'));
    assert.ok(warnings[0]!.includes('sessions'));
  });

  it('does not warn when a kit-recommended apparatus IS installed', () => {
    const kits = [makeKit('relay-kit', { recommends: ['sessions'] })];
    const apps = [makeApparatus('sessions')];
    const warnings = collectStartupWarnings(kits, apps);
    // No recommends warnings (there may be contribution warnings)
    const recommends = warnings.filter((w) => w.includes('recommends'));
    assert.equal(recommends.length, 0);
  });

  it('warns when an apparatus recommends another apparatus that is not installed', () => {
    const apps = [makeApparatus('animator', { recommends: ['loom'] })];
    const warnings = collectStartupWarnings([], apps);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0]!.includes('animator'));
    assert.ok(warnings[0]!.includes('recommends'));
    assert.ok(warnings[0]!.includes('loom'));
  });

  it('does not warn when an apparatus-recommended apparatus IS installed', () => {
    const apps = [
      makeApparatus('animator', { recommends: ['loom'] }),
      makeApparatus('loom'),
    ];
    const warnings = collectStartupWarnings([], apps);
    const recommends = warnings.filter((w) => w.includes('recommends'));
    assert.equal(recommends.length, 0);
  });

  it('warns when a kit contributes a type no apparatus consumes', () => {
    const kits = [makeKit('relay-kit', { engines: ['some-engine'] })];
    const apps = [makeApparatus('tools')]; // doesn't consume 'engines'
    const warnings = collectStartupWarnings(kits, apps);
    assert.ok(warnings.some((w) => w.includes('contributes "engines"')));
  });

  it('does not warn when a kit contribution type IS consumed', () => {
    const kits = [makeKit('relay-kit', { engines: ['some-engine'] })];
    const apps = [makeApparatus('clock', { consumes: ['engines'] })];
    const warnings = collectStartupWarnings(kits, apps);
    const contribution = warnings.filter((w) => w.includes('contributes'));
    assert.equal(contribution.length, 0);
  });

  it('skips requires and recommends when checking contributions', () => {
    // requires and recommends are framework fields, not contribution types
    const kits = [makeKit('relay-kit', { requires: ['tools'], recommends: ['sessions'] })];
    const apps = [makeApparatus('tools')];
    const warnings = collectStartupWarnings(kits, apps);
    // Should not warn about 'requires' or 'recommends' as contribution types
    const contributions = warnings.filter((w) => w.includes('contributes'));
    assert.equal(contributions.length, 0);
  });

  it('returns multiple warnings for multiple issues', () => {
    const kits = [
      makeKit('kit-a', { recommends: ['missing-app'], engines: ['e1'] }),
      makeKit('kit-b', { relays: ['r1'] }),
    ];
    const warnings = collectStartupWarnings(kits, []);
    // At minimum: recommends warning + engines warning + relays warning
    assert.ok(warnings.length >= 3, `Expected at least 3 warnings, got ${warnings.length}`);
  });
});

// ── buildStartupContext + fireEvent ──────────────────────────────────

describe('buildStartupContext', () => {
  it('returns an object with an on() method', () => {
    const handlers: EventHandlerMap = new Map();
    const ctx = buildStartupContext(handlers);
    assert.equal(typeof ctx.on, 'function');
  });

  it('registers handlers in the event handler map', () => {
    const handlers: EventHandlerMap = new Map();
    const ctx = buildStartupContext(handlers);
    const fn = () => {};
    ctx.on('test-event', fn);
    assert.ok(handlers.has('test-event'));
    assert.equal(handlers.get('test-event')!.length, 1);
  });

  it('allows multiple handlers for the same event', () => {
    const handlers: EventHandlerMap = new Map();
    const ctx = buildStartupContext(handlers);
    ctx.on('plugin:initialized', () => {});
    ctx.on('plugin:initialized', () => {});
    assert.equal(handlers.get('plugin:initialized')!.length, 2);
  });
});

describe('fireEvent', () => {
  it('does nothing when no handlers are registered', async () => {
    const handlers: EventHandlerMap = new Map();
    // Should not throw
    await fireEvent(handlers, 'nonexistent');
  });

  it('calls all registered handlers with the provided args', async () => {
    const handlers: EventHandlerMap = new Map();
    const calls: unknown[][] = [];
    handlers.set('test', [
      (...args: unknown[]) => { calls.push(args); },
      (...args: unknown[]) => { calls.push(args); },
    ]);

    await fireEvent(handlers, 'test', 'a', 42);

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], ['a', 42]);
    assert.deepEqual(calls[1], ['a', 42]);
  });

  it('awaits async handlers sequentially', async () => {
    const handlers: EventHandlerMap = new Map();
    const order: number[] = [];

    handlers.set('seq', [
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(1);
      },
      async () => {
        order.push(2);
      },
    ]);

    await fireEvent(handlers, 'seq');

    // Handler 1 should complete before handler 2 starts
    assert.deepEqual(order, [1, 2]);
  });

  it('only fires handlers for the named event', async () => {
    const handlers: EventHandlerMap = new Map();
    let aCalled = false;
    let bCalled = false;
    handlers.set('a', [() => { aCalled = true; }]);
    handlers.set('b', [() => { bCalled = true; }]);

    await fireEvent(handlers, 'a');

    assert.ok(aCalled);
    assert.ok(!bCalled);
  });
});

=== FILE: packages/framework/arbor/src/guild-lifecycle.ts ===
/**
 * Guild lifecycle — pure logic for plugin validation, ordering, and events.
 *
 * All functions here operate on in-memory data structures (LoadedKit[],
 * LoadedApparatus[], Maps) with no I/O. This makes them independently
 * testable with synthetic fixtures.
 *
 * `createGuild()` in arbor.ts is the orchestrator that performs I/O
 * (config reading, dynamic imports) then delegates to these functions.
 */

import type {
  StartupContext,
  LoadedKit,
  LoadedApparatus,
  FailedPlugin,
} from '@shardworks/nexus-core';

// ── Types ────────────────────────────────────────────────────────────

export type EventHandlerMap = Map<
  string,
  Array<(...args: unknown[]) => void | Promise<void>>
>;

// ── Validation ───────────────────────────────────────────────────────

/**
 * Validate all `requires` declarations and detect circular dependencies.
 * Returns an array of FailedPlugin entries describing every problem found.
 *
 * Checks:
 * - Apparatus requires: every named dependency must exist (kit or apparatus).
 * - Kit requires: every named dependency must be an apparatus (kits can't
 *   depend on kits).
 * - Cycle detection: no circular dependency chains among apparatuses.
 */
export function validateRequires(
  kits: LoadedKit[],
  apparatuses: LoadedApparatus[],
): FailedPlugin[] {
  const failures: FailedPlugin[] = [];
  const failedIds = new Set<string>();

  const apparatusIds = new Set(apparatuses.map((a) => a.id));
  const allIds = new Set([
    ...kits.map((k) => k.id),
    ...apparatuses.map((a) => a.id),
  ]);

  // Check apparatus requires
  for (const app of apparatuses) {
    for (const dep of app.apparatus.requires ?? []) {
      if (!allIds.has(dep)) {
        if (!failedIds.has(app.id)) {
          failedIds.add(app.id);
          failures.push({
            id:     app.id,
            reason: `"${app.id}" requires "${dep}", which is not installed.`,
          });
        }
      }
    }
  }

  // Check kit requires (must be apparatus names — kits can't depend on kits)
  for (const kit of kits) {
    for (const dep of kit.kit.requires ?? []) {
      if (!apparatusIds.has(dep)) {
        if (!failedIds.has(kit.id)) {
          failedIds.add(kit.id);
          if (!allIds.has(dep)) {
            failures.push({
              id:     kit.id,
              reason: `kit "${kit.id}" requires "${dep}", which is not installed.`,
            });
          } else {
            failures.push({
              id:     kit.id,
              reason: `kit "${kit.id}" requires "${dep}", but that plugin is a kit, not an apparatus. Kit requires must name apparatus plugins.`,
            });
          }
        }
      }
    }
  }

  // Detect circular dependencies among apparatuses
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleParticipants = new Set<string>();

  function visit(id: string, chain: string[]): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      // Back-edge detected — extract cycle participants from chain
      const cycleStart = chain.indexOf(id);
      const cycleNodes = cycleStart >= 0 ? chain.slice(cycleStart) : [...chain];
      cycleNodes.push(id);
      for (const node of cycleNodes) {
        cycleParticipants.add(node);
      }
      return;
    }
    visiting.add(id);
    const app = apparatuses.find((a) => a.id === id);
    if (app) {
      for (const dep of app.apparatus.requires ?? []) {
        visit(dep, [...chain, id]);
      }
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const app of apparatuses) {
    visit(app.id, []);
  }

  for (const id of cycleParticipants) {
    if (!failedIds.has(id)) {
      failedIds.add(id);
      failures.push({
        id,
        reason: `"${id}" is part of a circular dependency chain.`,
      });
    }
  }

  return failures;
}

// ── Cascade filtering ─────────────────────────────────────────────────

/**
 * Remove plugins that transitively depend on any failed plugin.
 *
 * Iterates until stable, cascading failures through the dependency graph.
 * Returns healthy plugins and any newly-cascaded failures.
 */
export function filterFailedPlugins(
  kits: LoadedKit[],
  apparatuses: LoadedApparatus[],
  rootFailures: FailedPlugin[],
): { kits: LoadedKit[]; apparatuses: LoadedApparatus[]; cascaded: FailedPlugin[] } {
  const failedIds = new Set<string>(rootFailures.map((f) => f.id));
  const cascaded: FailedPlugin[] = [];

  // Apparatus cascade: iterate until no new failures
  let changed = true;
  while (changed) {
    changed = false;
    for (const app of apparatuses) {
      if (failedIds.has(app.id)) continue;
      for (const dep of app.apparatus.requires ?? []) {
        if (failedIds.has(dep)) {
          failedIds.add(app.id);
          cascaded.push({
            id:     app.id,
            reason: `"${app.id}" depends on failed plugin "${dep}".`,
          });
          changed = true;
          break;
        }
      }
    }
  }

  // Kit cascade: single pass (kits can't depend on other kits)
  for (const kit of kits) {
    if (failedIds.has(kit.id)) continue;
    for (const dep of kit.kit.requires ?? []) {
      if (failedIds.has(dep)) {
        failedIds.add(kit.id);
        cascaded.push({
          id:     kit.id,
          reason: `"${kit.id}" depends on failed plugin "${dep}".`,
        });
        break;
      }
    }
  }

  return {
    kits:        kits.filter((k) => !failedIds.has(k.id)),
    apparatuses: apparatuses.filter((a) => !failedIds.has(a.id)),
    cascaded,
  };
}

// ── Dependency ordering ──────────────────────────────────────────────

/**
 * Sort apparatuses in dependency-resolved order using topological sort.
 * validateRequires() must be called first to ensure the graph is acyclic.
 */
export function topoSort(apparatuses: LoadedApparatus[]): LoadedApparatus[] {
  const sorted: LoadedApparatus[] = [];
  const visited = new Set<string>();

  function visit(id: string): void {
    if (visited.has(id)) return;
    const app = apparatuses.find((a) => a.id === id);
    if (!app) return;
    for (const dep of app.apparatus.requires ?? []) {
      visit(dep);
    }
    visited.add(id);
    sorted.push(app);
  }

  for (const app of apparatuses) {
    visit(app.id);
  }

  return sorted;
}

// ── Startup warnings ─────────────────────────────────────────────────

/**
 * Collect advisory warnings for kit contributions that no apparatus
 * consumes, and for missing recommended apparatuses.
 *
 * Returns an array of warning strings. The caller decides how to emit
 * them (console.warn, logger, etc.).
 */
export function collectStartupWarnings(
  kits:        LoadedKit[],
  apparatuses: LoadedApparatus[],
): string[] {
  const warnings: string[] = [];
  const consumedTypes = new Set<string>();
  const installedIds  = new Set(apparatuses.map((a) => a.id));

  for (const app of apparatuses) {
    for (const token of app.apparatus.consumes ?? []) {
      consumedTypes.add(token);
    }
  }

  // Check apparatus recommends
  for (const app of apparatuses) {
    for (const rec of app.apparatus.recommends ?? []) {
      if (!installedIds.has(rec)) {
        warnings.push(
          `[arbor] warn: "${app.id}" recommends "${rec}" but it is not installed.`,
        );
      }
    }
  }

  for (const kit of kits) {
    // Check kit recommends
    for (const rec of kit.kit.recommends ?? []) {
      if (!installedIds.has(rec)) {
        warnings.push(
          `[arbor] warn: "${kit.id}" recommends "${rec}" but it is not installed.`,
        );
      }
    }

    // Check contribution types against consumes
    for (const key of Object.keys(kit.kit)) {
      if (key === 'requires' || key === 'recommends') continue;
      if (!consumedTypes.has(key)) {
        warnings.push(
          `[arbor] warn: "${kit.id}" contributes "${key}" but no installed apparatus declares consumes: ["${key}"]`,
        );
      }
    }
  }

  return warnings;
}

// ── Event system ─────────────────────────────────────────────────────

/**
 * Build a StartupContext for an apparatus's start() call.
 * The context provides event subscription; handlers are stored in the
 * shared eventHandlers map so fireEvent can invoke them later.
 */
export function buildStartupContext(
  eventHandlers: EventHandlerMap,
): StartupContext {
  return {
    on(event: string, handler: (...args: unknown[]) => void | Promise<void>) {
      const list = eventHandlers.get(event) ?? [];
      list.push(handler);
      eventHandlers.set(event, list);
    },
  };
}

/**
 * Fire a lifecycle event, awaiting each handler sequentially.
 */
export async function fireEvent(
  eventHandlers: EventHandlerMap,
  event:         string,
  ...args: unknown[]
): Promise<void> {
  const handlers = eventHandlers.get(event) ?? [];
  for (const h of handlers) {
    await h(...args);
  }
}

=== FILE: packages/framework/cli/src/commands/status.ts ===
/**
 * nsg status — guild status.
 *
 * A framework command. Shows guild identity, framework version, and installed plugins
 * separated into apparatuses (running infrastructure) and kits (passive capabilities).
 * Domain-specific status (writ counts, session history, clock state) belongs
 * to plugins, not here.
 *
 * Requires a booted guild — prints a friendly error if run outside one.
 */

import { tool } from '@shardworks/tools-apparatus';
import { VERSION, readGuildConfig, guild } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'status',
  description: 'Show guild identity and installed plugin summary',
  callableBy: ['cli'],
  params: {
    json: z.boolean().optional().describe('Output as JSON'),
  },
  handler: async (params) => {
    let g;
    try {
      g = guild();
    } catch {
      throw new Error('Not inside a guild. Run `nsg init` to create one, or use --guild-root to specify the path.');
    }

    const { home } = g;
    const config = readGuildConfig(home);
    const failed = g.failedPlugins();

    // Note: at status time we don't load/start plugins — we just report what's
    // declared in guild.json. Type discrimination (kit vs apparatus) requires
    // loading the modules, which is deferred to avoid startup cost for status.
    const result = {
      guild:         config.name,
      nexus:         VERSION,
      home,
      model:         config.settings?.model ?? '(not set)',
      plugins:       [...config.plugins].sort(),
      failedPlugins: failed,
    };

    if (params.json) {
      return result;
    }

    const lines = [
      `Guild:    ${result.guild}`,
      `Nexus:    ${result.nexus}`,
      `Home:     ${result.home}`,
      `Model:    ${result.model}`,
      `Plugins:  ${result.plugins.length > 0 ? result.plugins.join(', ') : '(none)'}`,
    ];

    if (failed.length > 0) {
      lines.push('');
      lines.push('Failed plugins:');
      for (const f of failed) {
        lines.push(`  ${f.id}: ${f.reason}`);
      }
    }

    return lines.join('\n');
  },
});

=== FILE: packages/framework/cli/src/program.ts ===
/**
 * nsg program — dynamic Commander setup.
 *
 * Two command sources:
 *
 * 1. **Framework commands** — hardcoded in the CLI package (init, status,
 *    version, upgrade, plugin management). Always available, even without
 *    a guild.
 *
 * 2. **Plugin tools** — discovered at runtime via The Instrumentarium
 *    (tools apparatus). Only available when a guild is present and the
 *    tools apparatus is installed.
 *
 * Tool names are auto-grouped when multiple tools share a hyphen prefix:
 * 'plugin-list' + 'plugin-install' → 'nsg plugin list' / 'nsg plugin install'.
 * A tool like 'show-writ' stays flat ('nsg show-writ') since no other tool
 * starts with 'show-'.
 */

import path from 'node:path';
import { Command } from 'commander';
import { z } from 'zod';
import { findGuildRoot, guild } from '@shardworks/nexus-core';
import type { ToolDefinition, InstrumentariumApi } from '@shardworks/tools-apparatus';
import { createGuild } from '@shardworks/nexus-arbor';
import { frameworkCommands } from './commands/index.ts';
import { toFlag, isBooleanSchema, findGroupPrefixes } from './helpers.ts';

type ZodShape = Record<string, z.ZodTypeAny>;

/**
 * Build a Commander command from a ToolDefinition.
 *
 * Generates options from the Zod param shape. Commander converts kebab-case
 * flags back to camelCase in opts(), matching the tool's schema keys directly.
 *
 * The action handler validates params through the tool's Zod schema before
 * calling the handler — Zod error messages are surfaced cleanly.
 */
function buildToolCommand(
  commandName: string,
  toolDef: ToolDefinition,
): Command {
  const cmd = new Command(commandName).description(toolDef.description);

  const shape = toolDef.params.shape as ZodShape;
  for (const [key, schema] of Object.entries(shape)) {
    const flag = toFlag(key);
    const description = schema.description ?? key;

    if (isBooleanSchema(schema)) {
      // Boolean flags: --flag (no <value>), sets to true when present
      cmd.option(flag, description);
    } else if (schema.isOptional()) {
      cmd.option(`${flag} <value>`, description);
    } else {
      cmd.requiredOption(`${flag} <value>`, description);
    }
  }

  cmd.action(async (opts: Record<string, string | undefined>) => {
    try {
      const validated = toolDef.params.parse(opts);
      const result = await toolDef.handler(validated);

      const output =
        typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      console.log(output);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

  return cmd;
}

/**
 * Register tool definitions as Commander commands.
 *
 * Tools whose hyphen prefix appears in `groupPrefixes` are nested:
 * 'plugin-list' → 'nsg plugin list'.
 *
 * All other tools are registered flat:
 * 'show-writ' → 'nsg show-writ'.
 * 'signal' → 'nsg signal'.
 */
function registerTools(
  program: Command,
  tools: ToolDefinition[],
): void {
  const groupPrefixes = findGroupPrefixes(tools);
  const groups = new Map<string, Command>();

  for (const toolDef of tools) {
    const idx = toolDef.name.indexOf('-');

    // No hyphen, or prefix doesn't qualify as a group → flat command
    if (idx === -1 || !groupPrefixes.has(toolDef.name.slice(0, idx))) {
      program.addCommand(buildToolCommand(toolDef.name, toolDef));
      continue;
    }

    // Nested: split on first hyphen
    const groupName = toolDef.name.slice(0, idx);
    const subName = toolDef.name.slice(idx + 1);

    let group = groups.get(groupName);
    if (!group) {
      group = new Command(groupName).description(`${groupName} commands`);
      program.addCommand(group);
      groups.set(groupName, group);
    }

    group.addCommand(buildToolCommand(subName, toolDef));
  }
}

// ── Entry ──────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  // Pre-parse to extract --guild-root before tool discovery.
  const pre = new Command()
    .option('--guild-root <path>', 'Guild root directory')
    .allowUnknownOption()
    .allowExcessArguments()
    .exitOverride()
    .configureOutput({ writeOut: () => {}, writeErr: () => {} });

  try {
    pre.parse(process.argv);
  } catch {
    // Ignore errors — we only care about --guild-root
  }

  const preOpts = pre.opts() as { guildRoot?: string };

  const program = new Command('nsg')
    .description('Nexus Mk 2.1 — guild CLI')
    .option('--guild-root <path>', 'Guild root directory (default: auto-detect from cwd)');

  // Discover guild root. Framework commands work without a guild;
  // plugin tools only load when a guild with The Instrumentarium is found.
  let home: string | undefined;
  try {
    home = preOpts.guildRoot
      ? path.resolve(preOpts.guildRoot)
      : findGuildRoot();
  } catch {
    // Not in a guild
  }

  // Always register framework commands (init, status, version, upgrade,
  // plugin management). These work with or without a guild.
  registerTools(program, frameworkCommands);

  // Load plugin-contributed tools when inside a guild.
  // Tools are discovered via The Instrumentarium (tools apparatus).
  // If the guild doesn't have the tools apparatus installed, no plugin
  // tools are available — only framework commands.
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

  program.parse(process.argv);
}


=== FILE: packages/framework/core/src/guild.ts ===
/**
 * Guild — the process-level singleton for accessing guild infrastructure.
 *
 * All plugin code — apparatus start(), tool handlers, engine handlers,
 * relay handlers, CDC handlers — imports `guild()` to access apparatus APIs,
 * plugin config, the guild root path, and the loaded plugin graph.
 *
 * Arbor creates the Guild instance before starting apparatus and registers
 * it via `setGuild()`. The instance is backed by live data structures
 * (e.g. the provides Map) that are populated progressively as apparatus start.
 *
 * See: docs/architecture/plugins.md
 */

import type { GuildConfig } from './guild-config.ts';
import type { LoadedKit, LoadedApparatus, FailedPlugin } from './plugin.ts';

// ── Interface ──────────────────────────────────────────────────────────

/**
 * Runtime access to guild infrastructure.
 *
 * Available after Arbor creates the instance (before apparatus start).
 * One instance per process.
 */
export interface Guild {
  /** Absolute path to the guild root (contains guild.json). */
  readonly home: string

  /**
   * Retrieve a started apparatus's provides object by plugin id.
   *
   * Throws if the apparatus is not installed or has no `provides`.
   * During startup, only apparatus that have already started are visible
   * (dependency ordering guarantees declared deps are started first).
   */
  apparatus<T>(name: string): T

  /**
   * Read a plugin's configuration section from guild.json.
   *
   * Returns `guild.json[pluginId]` cast to `T`. Returns `{}` if no
   * section exists. The generic parameter is a cast — the framework
   * does not validate config shape.
   */
  config<T = Record<string, unknown>>(pluginId: string): T

  /**
   * Write a plugin's configuration section to guild.json.
   *
   * Updates `guild.json[pluginId]` with `value` and writes the file
   * to disk. Also updates the in-memory config so subsequent reads
   * reflect the change.
   *
   * For framework-level keys (name, nexus, plugins, settings), use
   * the standalone `writeGuildConfig()` function instead.
   */
  writeConfig<T = Record<string, unknown>>(pluginId: string, value: T): void

  /**
   * Read the full parsed guild.json.
   *
   * Escape hatch for framework-level fields (name, nexus, plugins,
   * settings) that don't belong to any specific plugin.
   */
  guildConfig(): GuildConfig

  /** Snapshot of all loaded kits (including apparatus supportKits). */
  kits(): LoadedKit[]

  /** Snapshot of all started apparatuses. */
  apparatuses(): LoadedApparatus[]

  /** Snapshot of plugins that failed to load, validate, or start. */
  failedPlugins(): FailedPlugin[]
}

// ── Singleton ──────────────────────────────────────────────────────────

let _guild: Guild | null = null;

/**
 * Get the active guild instance.
 *
 * Throws with a clear message if called before Arbor has initialized
 * the guild (e.g. at module import time, before startup begins).
 */
export function guild(): Guild {
  if (!_guild) {
    throw new Error(
      'Guild not initialized — guild() called before Arbor startup. ' +
      'Ensure guild() is called inside a handler or start(), not at module scope.',
    );
  }
  return _guild;
}

/**
 * Set the guild instance. Called by Arbor before starting apparatus.
 *
 * Not for plugin use — this is framework infrastructure.
 */
export function setGuild(g: Guild): void {
  _guild = g;
}

/**
 * Clear the guild instance. Called by Arbor at shutdown or in tests.
 *
 * Not for plugin use — this is framework infrastructure.
 */
export function clearGuild(): void {
  _guild = null;
}

=== FILE: packages/framework/core/src/index.ts ===
// @shardworks/nexus-core — public SDK surface

import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);
const _pkg = _require('../package.json');
export const VERSION: string = _pkg.version;

// ── Promoted modules — canonical source lives here at top-level ────────

export {
  // Plugin/Kit/Apparatus model
  type Kit,
  type Apparatus,
  type Plugin,
  type LoadedKit,
  type LoadedApparatus,
  type LoadedPlugin,
  type FailedPlugin,
  type StartupContext,
  isKit,
  isApparatus,
  isLoadedKit,
  isLoadedApparatus,
} from './plugin.ts';

// Guild — the process-level singleton for accessing guild infrastructure.
export {
  type Guild,
  guild,
  setGuild,
  clearGuild,
} from './guild.ts';

export {
  findGuildRoot,
  nexusDir,
  worktreesPath,
  clockPidPath,
  clockLogPath,
} from './nexus-home.ts';

export {
  derivePluginId,
  readGuildPackageJson,
  resolvePackageNameForPluginId,
  resolveGuildPackageEntry,
} from './resolve-package.ts';

export {
  type GuildConfig,
  createInitialGuildConfig,
  readGuildConfig,
  writeGuildConfig,
  type EventDeclaration,
  type StandingOrder,
  type ClockworksConfig,
  type GuildSettings,
  guildConfigPath,
} from './guild-config.ts';

export { generateId } from './id.ts';

=== FILE: packages/framework/core/src/plugin.ts ===
/**
 * Plugin system — core types for the Kit/Apparatus model.
 *
 * Plugins come in two kinds:
 * - Kit:       passive package contributing capabilities to consuming apparatuses.
 *              No lifecycle, no running state. Read at load time.
 * - Apparatus: package contributing persistent running infrastructure.
 *              Has a start/stop lifecycle. Receives StartupContext at start.
 *
 * See: docs/architecture/plugins.md
 */

// ── Loaded plugin descriptors ──────────────────────────────────────────

/** A kit as tracked by the Arbor runtime. */
export interface LoadedKit {
  readonly packageName: string
  readonly id:          string
  readonly version:     string
  readonly kit:         Kit
}

/** An apparatus as tracked by the Arbor runtime. */
export interface LoadedApparatus {
  readonly packageName: string
  readonly id:          string
  readonly version:     string
  readonly apparatus:   Apparatus
}

/** Union of loaded kit and loaded apparatus. */
export type LoadedPlugin = LoadedKit | LoadedApparatus

/** A plugin that failed to load, validate, or start. */
export interface FailedPlugin {
  readonly id:     string
  readonly reason: string
}

// ── Context types ──────────────────────────────────────────────────────

/**
 * Startup context passed to an apparatus's start(ctx).
 *
 * Provides lifecycle-event subscription — the only capability that is
 * meaningful only during startup. All other guild access (apparatus APIs,
 * config, home path, loaded plugins) goes through the `guild()` singleton,
 * which is available during start() and in all handlers.
 *
 * See: docs/architecture/plugins.md
 */
export interface StartupContext {
  /** Subscribe to a guild lifecycle event. Handlers may be async; run sequentially. */
  on(event: string, handler: (...args: unknown[]) => void | Promise<void>): void
}

// ── Kit ────────────────────────────────────────────────────────────────

/**
 * A kit — passive package contributing capabilities to consuming apparatuses.
 * Open record: contribution fields (engines, relays, tools, etc.) are defined
 * by the apparatus packages that consume them. `requires` and `recommends` are
 * the only framework-level fields.
 *
 * `requires`: apparatus names whose runtime APIs this kit's contributions depend
 *   on at handler invocation time. Hard startup validation failure if a declared
 *   apparatus is not installed.
 *
 * `recommends`: advisory apparatus names — generates startup warnings when
 *   expected apparatuses are absent. Not enforced.
 */
export type Kit = {
  requires?:   string[]
  recommends?: string[]
  [key: string]: unknown
}

// ── Apparatus ─────────────────────────────────────────────────────────

/**
 * An apparatus — package contributing persistent running infrastructure.
 * Has a start/stop lifecycle. Receives StartupContext at start.
 *
 * `requires`: apparatus names that must be started before this apparatus's
 *   start() runs. Determines start ordering. Hard startup validation failure
 *   if a declared apparatus is not installed.
 *
 * `recommends`: advisory apparatus names — generates startup warnings when
 *   expected apparatuses are absent. Not enforced — the apparatus starts
 *   regardless. Use for soft dependencies needed by optional API methods
 *   (e.g. The Animator recommends The Loom for summon(), but animate()
 *   works without it).
 *
 * `provides`: the runtime API object this apparatus exposes to other plugins.
 *   Retrieved via guild().apparatus<T>(name). Created at manifest-definition time,
 *   populated during start.
 *
 * `supportKit`: kit contributions this apparatus exposes to consuming apparatuses.
 *   Treated identically to standalone kit contributions by consumers.
 *
 * `consumes`: kit contribution field types this apparatus scans for and registers.
 *   Enables framework startup warnings when kits contribute types with no consumer.
 */
export type Apparatus = {
  requires?:    string[]
  recommends?:  string[]
  provides?:    unknown
  start:        (ctx: StartupContext) => void | Promise<void>
  stop?:        () => void | Promise<void>
  supportKit?:  Kit
  consumes?:    string[]
}

// ── Plugin ─────────────────────────────────────────────────────────────

/**
 * The discriminated union plugin type. A plugin is either a kit or an apparatus.
 * The plugin name is always inferred from the npm package name at load time —
 * it is never declared in the manifest.
 */
export type Plugin =
  | { kit:       Kit }
  | { apparatus: Apparatus }

// ── Type guards ────────────────────────────────────────────────────────

/** Type guard: is this value a kit plugin export? */
export function isKit(obj: unknown): obj is { kit: Kit } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'kit' in obj &&
    typeof (obj as { kit: unknown }).kit === 'object' &&
    (obj as { kit: unknown }).kit !== null &&
    !Array.isArray((obj as { kit: unknown }).kit)
  )
}

/** Type guard: is this value an apparatus plugin export? */
export function isApparatus(obj: unknown): obj is { apparatus: Apparatus } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'apparatus' in obj &&
    typeof (obj as { apparatus: unknown }).apparatus === 'object' &&
    (obj as { apparatus: unknown }).apparatus !== null &&
    typeof (
      (obj as { apparatus: Record<string, unknown> }).apparatus.start
    ) === 'function'
  )
}

/** Type guard: narrows a LoadedPlugin to LoadedKit. */
export function isLoadedKit(p: LoadedPlugin): p is LoadedKit {
  return 'kit' in p
}

/** Type guard: narrows a LoadedPlugin to LoadedApparatus. */
export function isLoadedApparatus(p: LoadedPlugin): p is LoadedApparatus {
  return 'apparatus' in p
}



## Convention Reference (sibling files not modified by this commission)

=== CONTEXT FILE: packages/framework/arbor/src/index.ts ===
/**
 * @shardworks/nexus-arbor — guild runtime
 *
 * The arbor is the guild host: plugin loading, dependency validation,
 * apparatus lifecycle management. It does NOT own tool discovery — that
 * belongs to The Instrumentarium (tools-apparatus).
 *
 * Plugin authors never import from arbor — they import from @shardworks/nexus-core.
 * The CLI imports from arbor to create the guild runtime and trigger startup.
 *
 * Package dependency graph:
 *   core   — public SDK, types, tool() factory
 *   arbor  — guild host, createGuild()
 *   cli    — nsg binary, Commander.js, framework commands + Instrumentarium tools
 *   plugins — import from core only
 */

export { createGuild } from './arbor.ts';

=== CONTEXT FILE: packages/framework/cli/src/program.test.ts ===
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { toFlag, isBooleanSchema, findGroupPrefixes } from './helpers.ts';
import type { ToolDefinition } from '@shardworks/tools-apparatus';

// Helper to create a minimal ToolDefinition for testing
function fakeTool(name: string): ToolDefinition {
  return {
    name,
    description: `test tool ${name}`,
    params: z.object({}),
    handler: async () => null,
  };
}

describe('toFlag', () => {
  it('converts camelCase to kebab-case flag', () => {
    assert.equal(toFlag('writId'), '--writ-id');
    assert.equal(toFlag('guildRoot'), '--guild-root');
  });

  it('handles single-word keys', () => {
    assert.equal(toFlag('name'), '--name');
    assert.equal(toFlag('json'), '--json');
  });

  it('handles multiple capital letters', () => {
    assert.equal(toFlag('myLongOptionName'), '--my-long-option-name');
  });
});

describe('isBooleanSchema', () => {
  it('detects z.boolean()', () => {
    assert.ok(isBooleanSchema(z.boolean()));
  });

  it('detects z.boolean().optional()', () => {
    assert.ok(isBooleanSchema(z.boolean().optional()));
  });

  it('rejects z.string()', () => {
    assert.ok(!isBooleanSchema(z.string()));
  });

  it('rejects z.string().optional()', () => {
    assert.ok(!isBooleanSchema(z.string().optional()));
  });

  it('rejects z.number()', () => {
    assert.ok(!isBooleanSchema(z.number()));
  });

  it('rejects z.enum()', () => {
    assert.ok(!isBooleanSchema(z.enum(['a', 'b'])));
  });
});

describe('findGroupPrefixes', () => {
  it('groups prefixes with 2+ tools', () => {
    const tools = [
      fakeTool('plugin-list'),
      fakeTool('plugin-install'),
      fakeTool('plugin-remove'),
    ];
    const groups = findGroupPrefixes(tools);
    assert.ok(groups.has('plugin'));
    assert.equal(groups.size, 1);
  });

  it('does not group singleton prefixes', () => {
    const tools = [
      fakeTool('show-writ'),
      fakeTool('list-writs'),
      fakeTool('post-writ'),
    ];
    const groups = findGroupPrefixes(tools);
    // Each prefix (show, list, post) has only 1 tool
    assert.ok(!groups.has('show'));
    assert.ok(!groups.has('list'));
    assert.ok(!groups.has('post'));
  });

  it('ignores tools without hyphens', () => {
    const tools = [
      fakeTool('version'),
      fakeTool('status'),
      fakeTool('signal'),
    ];
    const groups = findGroupPrefixes(tools);
    assert.equal(groups.size, 0);
  });

  it('handles mixed grouped and ungrouped', () => {
    const tools = [
      fakeTool('plugin-list'),
      fakeTool('plugin-install'),
      fakeTool('version'),
      fakeTool('show-writ'),
      fakeTool('anima-create'),
      fakeTool('anima-list'),
    ];
    const groups = findGroupPrefixes(tools);
    assert.ok(groups.has('plugin'));
    assert.ok(groups.has('anima'));
    assert.ok(!groups.has('show'));
    assert.equal(groups.size, 2);
  });
});

=== CONTEXT FILE: packages/framework/cli/src/helpers.ts ===
/**
 * Pure helper functions for CLI command generation.
 *
 * Extracted from program.ts so they can be tested independently
 * without pulling in heavy runtime dependencies (Arbor, Instrumentarium).
 */

import { z } from 'zod';
import type { ToolDefinition } from '@shardworks/tools-apparatus';

/**
 * Convert camelCase key to kebab-case CLI flag.
 * e.g. 'writId' → '--writ-id'
 */
export function toFlag(key: string): string {
  return `--${key.replace(/([A-Z])/g, (c) => `-${c.toLowerCase()}`)}`;
}

/**
 * Detect whether a Zod schema accepts booleans (and only booleans).
 * Used to register Commander flags without <value> for boolean params.
 */
export function isBooleanSchema(schema: z.ZodTypeAny): boolean {
  return (
    schema.safeParse(true).success &&
    schema.safeParse(false).success &&
    !schema.safeParse(42).success &&
    !schema.safeParse('test').success
  );
}

/**
 * Determine which hyphen prefixes have enough tools to warrant a group.
 *
 * Returns a Set of prefixes that have 2+ tools sharing them.
 * 'plugin-list' + 'plugin-install' → 'plugin' is a group.
 * 'show-writ' alone → 'show' is NOT a group.
 */
export function findGroupPrefixes(tools: ToolDefinition[]): Set<string> {
  const prefixCounts = new Map<string, number>();

  for (const t of tools) {
    const idx = t.name.indexOf('-');
    if (idx === -1) continue;
    const prefix = t.name.slice(0, idx);
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }

  const groups = new Set<string>();
  for (const [prefix, count] of prefixCounts) {
    if (count >= 2) groups.add(prefix);
  }
  return groups;
}

=== CONTEXT FILE: packages/framework/cli/src/cli.ts ===
#!/usr/bin/env node

/**
 * nsg — CLI entry point, built on the plugin architecture.
 *
 * Dynamically discovers installed tools via plugins, registers them as Commander
 * commands, and delegates argument parsing and invocation to Commander.
 *
 * Tools are filtered to those with 'cli' in callableBy (or no callableBy
 * set, which defaults to all callers). Tools marked 'anima'-only are invisible here.
 */

import { main } from './program.ts';

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

=== CONTEXT FILE: packages/framework/cli/src/commands/plugin.test.ts ===
/**
 * Tests for the plugin framework commands: plugin-list, plugin-install,
 * plugin-remove, plugin-upgrade.
 *
 * Tests the handlers directly — no CLI layer involved.
 * Plugins are tracked as string keys in config.plugins.
 *
 * `plugin-install` (link mode) is tested end-to-end by creating a minimal fake
 * plugin package in a tmp directory and installing it via npm, then checking the
 * resulting guild.json state. Registry mode (npm install from network) is not tested.
 *
 * `plugin-remove` tests manually pre-populate node_modules and guild/package.json so
 * that `resolvePackageNameForPluginId` works without npm.
 *
 * With permission-based access control, plugin-install and plugin-remove are pure
 * npm + guild.json operations — no tool discovery, no baseTools/role writes.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pluginList, pluginInstall, pluginRemove, pluginUpgrade, detectPackageManager } from './plugin.ts';
import { setupGuildAccessor, makeTmpDir, makeGuild, makeGuildPackageJson, cleanupTestState } from './test-helpers.ts';

/**
 * Create a minimal fake plugin package directory suitable for `plugin-install --type link`.
 * Returns the absolute path to the fake plugin directory.
 */
function makeFakePlugin(parentDir: string, packageName: string): string {
  const dirName = packageName.replace(/^@/, '').replace('/', '-');
  const pluginDir = path.join(parentDir, dirName);
  fs.mkdirSync(pluginDir, { recursive: true });

  const pkgJson = {
    name: packageName,
    version: '1.0.0',
    type: 'module',
    exports: { '.': './index.js' },
  };
  fs.writeFileSync(path.join(pluginDir, 'package.json'), JSON.stringify(pkgJson, null, 2));
  fs.writeFileSync(path.join(pluginDir, 'index.js'), `export default { kit: { tools: [] } };\n`);

  return pluginDir;
}

afterEach(() => {
  cleanupTestState();
});

// ── Tool metadata ──────────────────────────────────────────────────────────

describe('plugin tool definitions', () => {
  it('plugin-list is callable from cli only', () => {
    assert.deepEqual(pluginList.callableBy, ['cli']);
  });

  it('plugin-install is callable from cli only', () => {
    assert.deepEqual(pluginInstall.callableBy, ['cli']);
  });

  it('plugin-remove is callable from cli only', () => {
    assert.deepEqual(pluginRemove.callableBy, ['cli']);
  });

  it('plugin-upgrade is callable from cli only', () => {
    assert.deepEqual(pluginUpgrade.callableBy, ['cli']);
  });
});

// ── plugin-list ──────────────────────────────────────────────────────────

describe('plugin-list handler', () => {
  it('returns "No plugins installed." when plugins array is empty', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuild(tmp);

    setupGuildAccessor(tmp);
    const result = await pluginList.handler({});
    assert.equal(result, 'No plugins installed.');
  });

  it('returns empty array in json mode when no plugins installed', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuild(tmp);

    setupGuildAccessor(tmp);
    const result = await pluginList.handler({ json: true });
    assert.deepEqual(result, []);
  });

  it('shows installed plugin ids in text output', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuild(tmp, { plugins: ['nexus-stdlib'] });

    setupGuildAccessor(tmp);
    const result = await pluginList.handler({}) as string;
    assert.ok(result.includes('nexus-stdlib'));
  });

  it('returns sorted plugin ids one per line in text mode', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuild(tmp, { plugins: ['nexus-stdlib', 'nexus-ledger'] });

    setupGuildAccessor(tmp);
    const result = await pluginList.handler({}) as string;
    const lines = result.split('\n').filter(Boolean);
    assert.deepEqual(lines, ['nexus-ledger', 'nexus-stdlib']);
  });

  it('returns array of { id } objects in json mode', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuild(tmp, { plugins: ['nexus-stdlib'] });

    setupGuildAccessor(tmp);
    const result = await pluginList.handler({ json: true });
    assert.ok(Array.isArray(result));
    const arr = result as Array<{ id: string }>;
    assert.equal(arr.length, 1);
    assert.equal(arr[0]!.id, 'nexus-stdlib');
  });

  it('json output is sorted by id', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuild(tmp, { plugins: ['nexus-stdlib', 'nexus-ledger'] });

    setupGuildAccessor(tmp);
    const result = await pluginList.handler({ json: true });
    const arr = result as Array<{ id: string }>;
    assert.equal(arr.length, 2);
    const ids = arr.map((r) => r.id);
    assert.deepEqual(ids, ['nexus-ledger', 'nexus-stdlib']);
  });
});

// ── plugin-install (link mode) ───────────────────────────────────────────

describe('plugin-install handler — link mode', () => {
  it('adds the plugin id to config.plugins', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuild(tmp);
    const pluginDir = makeFakePlugin(tmp, 'my-fake-plugin');

    setupGuildAccessor(tmp);
    await pluginInstall.handler({ source: pluginDir, type: 'link' });

    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'guild.json'), 'utf-8'));
    assert.ok(Array.isArray(config.plugins));
    // derivePluginId strips the -plugin suffix: 'my-fake-plugin' → 'my-fake'
    assert.ok(config.plugins.includes('my-fake'));
  });

  it('does not write baseTools or roles (permission model)', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuild(tmp);
    const pluginDir = makeFakePlugin(tmp, 'my-fake-plugin');

    setupGuildAccessor(tmp);
    await pluginInstall.handler({ source: pluginDir, type: 'link' });

    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'guild.json'), 'utf-8'));
    assert.equal(config.baseTools, undefined);
    assert.equal(config.roles, undefined);
  });

  it('does not duplicate plugin id if already in plugins array', async () => {
    const tmp = makeTmpDir('plugin');
    // derivePluginId('my-fake-plugin') → 'my-fake'
    makeGuild(tmp, { plugins: ['my-fake'] });
    const pluginDir = makeFakePlugin(tmp, 'my-fake-plugin');

    setupGuildAccessor(tmp);
    await pluginInstall.handler({ source: pluginDir, type: 'link' });

    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'guild.json'), 'utf-8'));
    const occurrences = config.plugins.filter((r: string) => r === 'my-fake').length;
    assert.equal(occurrences, 1);
  });

  it('throws when source directory has no package.json', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuild(tmp);
    const emptyDir = path.join(tmp, 'empty-plugin');
    fs.mkdirSync(emptyDir);

    setupGuildAccessor(tmp);
    await assert.rejects(
      async () => pluginInstall.handler({ source: emptyDir, type: 'link' }),
      /No package\.json/,
    );
  });

  it('returns a success message mentioning the plugin id', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuild(tmp);
    const pluginDir = makeFakePlugin(tmp, 'my-fake-plugin');

    setupGuildAccessor(tmp);
    const result = await pluginInstall.handler({ source: pluginDir, type: 'link' }) as string;
    assert.ok(result.includes('my-fake'));
  });

  it('auto-detects link mode for absolute directory paths', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuild(tmp);
    const pluginDir = makeFakePlugin(tmp, 'auto-detect-plugin');

    setupGuildAccessor(tmp);
    // No --type flag — should auto-detect that pluginDir is a directory
    await pluginInstall.handler({ source: pluginDir });

    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'guild.json'), 'utf-8'));
    assert.ok(config.plugins.includes('auto-detect'));
  });

  it('auto-detects link mode for relative directory paths', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuild(tmp);
    const pluginDir = makeFakePlugin(tmp, 'relative-detect-plugin');

    // Compute a relative path from the guild root to the plugin dir
    const relPath = './' + path.relative(process.cwd(), pluginDir);

    setupGuildAccessor(tmp);
    await pluginInstall.handler({ source: relPath });

    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'guild.json'), 'utf-8'));
    assert.ok(config.plugins.includes('relative-detect'));
  });

  it('uses link: protocol when guild has pnpm-lock.yaml', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuild(tmp);
    fs.writeFileSync(path.join(tmp, 'pnpm-lock.yaml'), '');
    const pluginDir = makeFakePlugin(tmp, 'pnpm-fake-plugin');

    setupGuildAccessor(tmp);
    await pluginInstall.handler({ source: pluginDir, type: 'link' });

    const pkgJson = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf-8'));
    const depValue: string = pkgJson.dependencies['pnpm-fake-plugin'];
    assert.ok(depValue.startsWith('link:'), `Expected link: protocol, got: ${depValue}`);

    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'guild.json'), 'utf-8'));
    assert.ok(config.plugins.includes('pnpm-fake'));
  });

  it('uses file: protocol when guild has no pnpm-lock.yaml', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuild(tmp);
    const pluginDir = makeFakePlugin(tmp, 'npm-fake-plugin');

    setupGuildAccessor(tmp);
    await pluginInstall.handler({ source: pluginDir, type: 'link' });

    const pkgJson = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf-8'));
    const depValue: string = pkgJson.dependencies['npm-fake-plugin'];
    assert.ok(depValue.startsWith('file:'), `Expected file: protocol, got: ${depValue}`);

    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'guild.json'), 'utf-8'));
    assert.ok(config.plugins.includes('npm-fake'));
  });
});

// ── plugin-remove ─��──────────────���───────────────────────────────────────

describe('plugin-remove handler', () => {
  function makeGuildWithPlugin(dir: string): void {
    makeGuild(dir, { plugins: ['nexus-stdlib'] });
    makeGuildPackageJson(dir, { '@shardworks/nexus-stdlib': '^1.0.0' });
  }

  it('removes the plugin from config.plugins', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuildWithPlugin(tmp);

    setupGuildAccessor(tmp);
    await pluginRemove.handler({ name: 'nexus-stdlib' });

    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'guild.json'), 'utf-8'));
    assert.ok(!config.plugins.includes('nexus-stdlib'));
  });

  it('does not affect plugins belonging to a different plugin', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuild(tmp, { plugins: ['nexus-stdlib', 'nexus-ledger'] });
    makeGuildPackageJson(tmp, {
      '@shardworks/nexus-stdlib': '^1.0.0',
      '@shardworks/nexus-ledger': '^1.0.0',
    });

    setupGuildAccessor(tmp);
    await pluginRemove.handler({ name: 'nexus-stdlib' });

    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'guild.json'), 'utf-8'));
    assert.ok(config.plugins.includes('nexus-ledger'));
  });

  it('accepts full @-scoped package name and normalizes to plugin id', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuildWithPlugin(tmp);

    setupGuildAccessor(tmp);
    await pluginRemove.handler({ name: '@shardworks/nexus-stdlib' });

    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'guild.json'), 'utf-8'));
    assert.ok(!config.plugins.includes('nexus-stdlib'));
  });

  it('returns a success message with the plugin id', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuildWithPlugin(tmp);

    setupGuildAccessor(tmp);
    const result = await pluginRemove.handler({ name: 'nexus-stdlib' }) as string;
    assert.ok(result.includes('nexus-stdlib'));
  });

  it('throws when the plugin is not installed', async () => {
    const tmp = makeTmpDir('plugin');
    makeGuild(tmp);

    setupGuildAccessor(tmp);
    await assert.rejects(
      async () => pluginRemove.handler({ name: 'nonexistent-plugin' }),
      /not installed/,
    );
  });

  it('calls pnpm remove when guild has pnpm-lock.yaml', async () => {
    const tmp = makeTmpDir('plugin');
    // Install the plugin first via pnpm so it exists in node_modules
    makeGuild(tmp, { plugins: ['nexus-stdlib'] });
    fs.writeFileSync(path.join(tmp, 'pnpm-lock.yaml'), '');
    makeGuildPackageJson(tmp, { '@shardworks/nexus-stdlib': '^1.0.0' });

    setupGuildAccessor(tmp);
    await pluginRemove.handler({ name: 'nexus-stdlib' });

    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'guild.json'), 'utf-8'));
    assert.ok(!config.plugins.includes('nexus-stdlib'));
  });
});

// ── plugin-upgrade ───────────────────────────────────────────────────────

describe('plugin-upgrade handler', () => {
  it('returns a "not yet implemented" message', async () => {
    setupGuildAccessor('/fake');
    const result = await pluginUpgrade.handler({ name: 'some-plugin' });
    assert.ok(typeof result === 'string');
    assert.ok((result as string).toLowerCase().includes('not yet implemented'));
  });

  it('accepts an optional version param without error', async () => {
    setupGuildAccessor('/fake');
    const result = await pluginUpgrade.handler(
      { name: 'some-plugin', version: '2.0.0' },
    );
    assert.ok(typeof result === 'string');
  });
});

=== CONTEXT FILE: packages/framework/cli/src/commands/version.test.ts ===
/**
 * Tests for the `version` framework command.
 *
 * Tests the handler directly — no CLI layer involved.
 * Plugins come from config.plugins; package versions are resolved via
 * the guild's package.json and node_modules.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import versionTool from './version.ts';
import { setupGuildAccessor, makeTmpDir, makeGuild, makeGuildPackageJson, cleanupTestState } from './test-helpers.ts';

/**
 * Create a minimal fake package in node_modules with the given version.
 * Only writes a package.json — no exports needed for version lookups.
 */
function makeFakeNodeModule(guildRoot: string, packageName: string, version: string): void {
  const pkgDir = path.join(guildRoot, 'node_modules', packageName);
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: packageName, version }, null, 2) + '\n',
  );
}

afterEach(() => {
  cleanupTestState();
});

// ── No guild ──────────────────────────────────────────────────────────────

describe('version handler — no guild', () => {
  it('returns framework version even without a guild', async () => {
    // guild() not set — clearGuild() runs in afterEach
    // version should still work — just shows nexus + node versions
    const result = await versionTool.handler({}) as string;
    assert.ok(result.includes('nexus:'));
    assert.ok(result.includes('node:'));
  });

  it('returns only nexus and node in json mode without a guild', async () => {
    const result = await versionTool.handler({ json: true }) as Record<string, string>;
    assert.ok('nexus' in result);
    assert.ok('node' in result);
    assert.equal(Object.keys(result).length, 2);
  });
});

// ── Tool metadata ──────────────────────────────────────────────────────────

describe('version tool definition', () => {
  it('has the correct name', () => {
    assert.equal(versionTool.name, 'version');
  });

  it('is callable from cli only', () => {
    assert.deepEqual(versionTool.callableBy, ['cli']);
  });
});

// ── Text output ────────────────────────────────────────────────────────────

describe('version handler — text mode', () => {
  it('always includes "nexus:" even with no guild', async () => {
    const tmp = makeTmpDir('version'); // empty dir — no guild.json

    setupGuildAccessor(tmp);
    const result = await versionTool.handler({});
    assert.ok(typeof result === 'string');
    assert.ok((result as string).includes('nexus:'));
  });

  it('always includes "node:" even with no guild', async () => {
    const tmp = makeTmpDir('version');

    setupGuildAccessor(tmp);
    const result = await versionTool.handler({});
    assert.ok((result as string).includes('node:'));
  });

  it('reports the current node version', async () => {
    const tmp = makeTmpDir('version');

    setupGuildAccessor(tmp);
    const result = await versionTool.handler({});
    assert.ok((result as string).includes(process.version));
  });

  it('uses "key: value" format for all lines', async () => {
    const tmp = makeTmpDir('version');

    setupGuildAccessor(tmp);
    const result = await versionTool.handler({}) as string;
    for (const line of result.split('\n')) {
      if (line.trim() === '') continue;
      assert.ok(line.includes(': '), `Expected "key: value" format, got: "${line}"`);
    }
  });

  it('shows plugin id as "not installed" when guild has no package.json', async () => {
    const tmp = makeTmpDir('version');
    makeGuild(tmp, { plugins: ['nexus-stdlib'] }); // no guild package.json — resolvePackageNameForPluginId returns null

    setupGuildAccessor(tmp);
    const result = await versionTool.handler({}) as string;
    assert.ok(result.includes('nexus-stdlib'));
    assert.ok(result.includes('not installed'));
  });

  it('shows the npm package name and version when plugin is resolvable', async () => {
    const tmp = makeTmpDir('version');
    makeGuild(tmp, { plugins: ['nexus-stdlib'] });
    makeGuildPackageJson(tmp, { '@shardworks/nexus-stdlib': '^1.2.3' });
    makeFakeNodeModule(tmp, '@shardworks/nexus-stdlib', '1.2.3');

    setupGuildAccessor(tmp);
    const result = await versionTool.handler({}) as string;
    assert.ok(result.includes('@shardworks/nexus-stdlib'));
    assert.ok(result.includes('1.2.3'));
  });

  it('shows package versions for multiple installed plugins', async () => {
    const tmp = makeTmpDir('version');
    makeGuild(tmp, { plugins: ['nexus-stdlib', 'nexus-ledger'] });
    makeGuildPackageJson(tmp, {
      '@shardworks/nexus-stdlib': '^1.0.0',
      '@shardworks/nexus-ledger': '^2.0.0',
    });
    makeFakeNodeModule(tmp, '@shardworks/nexus-stdlib', '1.0.0');
    makeFakeNodeModule(tmp, '@shardworks/nexus-ledger', '2.0.0');

    setupGuildAccessor(tmp);
    const result = await versionTool.handler({}) as string;
    assert.ok(result.includes('@shardworks/nexus-stdlib'));
    assert.ok(result.includes('@shardworks/nexus-ledger'));
    assert.ok(result.includes('1.0.0'));
    assert.ok(result.includes('2.0.0'));
  });
});

// ── JSON output ────────────────────────────────────────────────────────────

describe('version handler — json mode', () => {
  it('returns an object (not a string)', async () => {
    const tmp = makeTmpDir('version');

    setupGuildAccessor(tmp);
    const result = await versionTool.handler({ json: true });
    assert.ok(typeof result === 'object' && result !== null);
  });

  it('includes nexus version string', async () => {
    const tmp = makeTmpDir('version');

    setupGuildAccessor(tmp);
    const result = await versionTool.handler({ json: true }) as Record<string, string>;
    assert.ok(typeof result.nexus === 'string');
    assert.ok(result.nexus.length > 0);
  });

  it('includes node version matching process.version', async () => {
    const tmp = makeTmpDir('version');

    setupGuildAccessor(tmp);
    const result = await versionTool.handler({ json: true }) as Record<string, string>;
    assert.equal(result.node, process.version);
  });

  it('succeeds gracefully when guild.json is missing', async () => {
    const tmp = makeTmpDir('version'); // no guild.json

    setupGuildAccessor(tmp);
    const result = await versionTool.handler({ json: true }) as Record<string, string>;
    assert.ok('nexus' in result);
    assert.ok('node' in result);
    assert.equal(Object.keys(result).length, 2);
  });

  it('marks plugin id as "not installed" when guild has no package.json', async () => {
    const tmp = makeTmpDir('version');
    makeGuild(tmp, { plugins: ['nexus-stdlib'] }); // no guild package.json

    setupGuildAccessor(tmp);
    const result = await versionTool.handler({ json: true }) as Record<string, string>;
    assert.equal(result['nexus-stdlib'], 'not installed');
  });

  it('includes resolved package name and version for an installed plugin', async () => {
    const tmp = makeTmpDir('version');
    makeGuild(tmp, { plugins: ['nexus-stdlib'] });
    makeGuildPackageJson(tmp, { '@shardworks/nexus-stdlib': '^1.2.3' });
    makeFakeNodeModule(tmp, '@shardworks/nexus-stdlib', '1.2.3');

    setupGuildAccessor(tmp);
    const result = await versionTool.handler({ json: true }) as Record<string, string>;
    assert.equal(result['@shardworks/nexus-stdlib'], '1.2.3');
  });

  it('includes both package versions for two installed plugins', async () => {
    const tmp = makeTmpDir('version');
    makeGuild(tmp, { plugins: ['nexus-stdlib', 'nexus-ledger'] });
    makeGuildPackageJson(tmp, {
      '@shardworks/nexus-stdlib': '^1.0.0',
      '@shardworks/nexus-ledger': '^2.0.0',
    });
    makeFakeNodeModule(tmp, '@shardworks/nexus-stdlib', '1.0.0');
    makeFakeNodeModule(tmp, '@shardworks/nexus-ledger', '2.0.0');

    setupGuildAccessor(tmp);
    const result = await versionTool.handler({ json: true }) as Record<string, string>;
    assert.equal(result['@shardworks/nexus-stdlib'], '1.0.0');
    assert.equal(result['@shardworks/nexus-ledger'], '2.0.0');
  });
});

=== CONTEXT FILE: packages/framework/cli/src/commands/plugin.ts ===
/**
 * nsg plugin-* — manage guild plugins.
 *
 * Framework commands for plugin lifecycle. Available via CLI only (not MCP).
 *
 * Plugin install/remove are pure npm + guild.json operations. No tool
 * discovery at install time — tools are resolved at runtime by the
 * Instrumentarium via its permission-based model.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tool } from '@shardworks/tools-apparatus';
import {
  guild,
  readGuildConfig,
  writeGuildConfig,
  derivePluginId,
  readGuildPackageJson,
  resolvePackageNameForPluginId,
} from '@shardworks/nexus-core';
import { z } from 'zod';

// ── Helpers ────────────────────────────────────────────────────────────

function npm(args: string[], cwd: string): string {
  return execFileSync('npm', args, { cwd, stdio: 'pipe', encoding: 'utf-8' });
}

function pnpm(args: string[], cwd: string): string {
  return execFileSync('pnpm', args, { cwd, stdio: 'pipe', encoding: 'utf-8' });
}

/**
 * Detect the package manager used by the guild.
 *
 * Checks for lockfiles in order of specificity. Falls back to 'npm'
 * when no lockfile is present (e.g. fresh guilds before first install).
 */
export function detectPackageManager(guildRoot: string): 'npm' | 'pnpm' {
  if (fs.existsSync(path.join(guildRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  return 'npm';
}

/**
 * Parse a source specifier to extract the npm package name.
 * e.g. "@shardworks/nexus-stdlib@1.0" → "@shardworks/nexus-stdlib"
 *      "nexus-stdlib" → "nexus-stdlib"
 *
 * Returns null for git URLs — the package name must be read from
 * the guild's package.json after npm install.
 *
 * Known limitations: does not handle npm: alias specifiers, tarball URLs,
 * or workspace: protocol. These are uncommon for plugin install and can
 * be added if needed.
 */
function parsePackageName(source: string): string | null {
  if (source.startsWith('git+') || source.startsWith('git://') || source.endsWith('.git')) {
    return null;
  }
  if (source.startsWith('@')) {
    const lastAt = source.lastIndexOf('@');
    if (lastAt > 0) return source.substring(0, lastAt);
    return source;
  }
  if (source.includes('@')) {
    return source.split('@')[0]!;
  }
  return source;
}

/**
 * Find the most recently added dependency in the guild's package.json.
 * Used after `npm install <git-url>` where we can't parse the name from the source.
 *
 * Relies on Object.keys() returning insertion-ordered string keys (guaranteed
 * by the ES2015 spec for non-integer keys, and by V8/Node). A diff-based
 * approach (snapshot deps before install, compare after) would be more robust
 * but overkill for this edge case.
 */
function detectInstalledPackage(guildRoot: string): string {
  const pkgPath = path.join(guildRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const deps = pkg.dependencies as Record<string, string> | undefined ?? {};
  const names = Object.keys(deps);
  const last = names[names.length - 1];
  if (!last) throw new Error('Could not determine package name after npm install.');
  return last;
}

// ── Commands ───────────────────────────────────────────────────────────

export const pluginList = tool({
  name: 'plugin-list',
  description: 'List installed plugins',
  callableBy: ['cli'],
  params: {
    json: z.boolean().optional().describe('Output as JSON'),
  },
  handler: async (params) => {
    const { home } = guild();
    const config = readGuildConfig(home);
    const pluginIds = config.plugins;

    if (pluginIds.length === 0) {
      if (params.json) return [];
      return 'No plugins installed.';
    }

    if (params.json) {
      return [...pluginIds].sort().map((id) => ({ id }));
    }
    return [...pluginIds].sort().join('\n');
  },
});

export const pluginInstall = tool({
  name: 'plugin-install',
  description: 'Install a plugin into the guild',
  callableBy: ['cli'],
  params: {
    source: z.string().describe('Package name, git URL, or local folder path'),
    type: z.enum(['registry', 'link']).optional().describe('Install type: "registry" (npm install) or "link" (local folder). Auto-detected when source is a folder path.'),
  },
  handler: async (params) => {
    const { home } = guild();
    const { source } = params;

    // Auto-detect link mode when source looks like a filesystem path
    const sourceDir = path.resolve(source);
    const looksLikePath = source.startsWith('.') || source.startsWith('/');
    const isDirectory = looksLikePath && fs.existsSync(sourceDir) && fs.statSync(sourceDir).isDirectory();
    const installType = params.type ?? (isDirectory ? 'link' : 'registry');

    // 1. Install the npm package into the guild
    let packageName: string;

    if (installType === 'link') {
      const sourceDir = path.resolve(source);
      if (!fs.existsSync(path.join(sourceDir, 'package.json'))) {
        throw new Error(`No package.json found in ${sourceDir}. --link requires a directory with a package.json.`);
      }
      const pkgJson = JSON.parse(fs.readFileSync(path.join(sourceDir, 'package.json'), 'utf-8')) as Record<string, unknown>;
      packageName = pkgJson.name as string;
      const pm = detectPackageManager(home);
      if (pm === 'pnpm') {
        pnpm(['add', `link:${sourceDir}`], home);
      } else {
        npm(['install', '--save', `file:${sourceDir}`], home);
      }
    } else {
      npm(['install', '--save', source], home);
      packageName = parsePackageName(source) ?? detectInstalledPackage(home);

      const { pkgJson } = readGuildPackageJson(home, packageName);
      if (!pkgJson) {
        throw new Error(`Package "${packageName}" not found in node_modules after install.`);
      }
    }

    const pluginId = derivePluginId(packageName);

    // 2. Update guild.json — add to plugins list
    const config = readGuildConfig(home);

    if (!config.plugins.includes(pluginId)) {
      config.plugins.push(pluginId);
    }

    writeGuildConfig(home, config);

    return `Installed plugin: ${pluginId} (${packageName})`;
  },
});

export const pluginRemove = tool({
  name: 'plugin-remove',
  description: 'Remove a plugin from the guild',
  callableBy: ['cli'],
  params: {
    name: z.string().describe('Plugin id or package name to remove'),
  },
  handler: async (params) => {
    const { home } = guild();
    const config = readGuildConfig(home);
    const targetId = params.name.startsWith('@') ? derivePluginId(params.name) : params.name;

    if (!config.plugins.includes(targetId)) {
      throw new Error(`Plugin "${targetId}" is not installed.`);
    }

    config.plugins = config.plugins.filter((id) => id !== targetId);
    writeGuildConfig(home, config);

    const packageName = resolvePackageNameForPluginId(home, targetId);
    if (packageName) {
      try {
        const pm = detectPackageManager(home);
        if (pm === 'pnpm') {
          pnpm(['remove', packageName], home);
        } else {
          npm(['uninstall', packageName], home);
        }
      } catch {
        // Don't fail if uninstall fails — guild.json is already updated
      }
    }

    return `Removed plugin: ${targetId}`;
  },
});

export const pluginUpgrade = tool({
  name: 'plugin-upgrade',
  description: 'Upgrade a plugin to a newer version',
  callableBy: ['cli'],
  params: {
    name: z.string().describe('Plugin id or package name to upgrade'),
    version: z.string().optional().describe('Target version (default: latest)'),
  },
  handler: async () => {
    return 'Not yet implemented.';
  },
});

=== CONTEXT FILE: packages/framework/core/src/resolve-package.test.ts ===
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { derivePluginId, resolvePackageNameForPluginId } from './resolve-package.ts';

describe('derivePluginId', () => {
  it('strips @shardworks scope', () => {
    assert.equal(derivePluginId('@shardworks/nexus-stdlib'), 'nexus-stdlib');
    assert.equal(derivePluginId('@shardworks/nexus-ledger'), 'nexus-ledger');
  });

  it('drops @ only for third-party scopes', () => {
    assert.equal(derivePluginId('@acme/my-tool'), 'acme/my-tool');
    assert.equal(derivePluginId('@other/foo'), 'other/foo');
  });

  it('passes through unscoped names', () => {
    assert.equal(derivePluginId('my-tool'), 'my-tool');
    assert.equal(derivePluginId('nexus-stdlib'), 'nexus-stdlib');
  });

  it('strips -kit suffix', () => {
    assert.equal(derivePluginId('my-relay-kit'), 'my-relay');
    assert.equal(derivePluginId('@shardworks/nexus-relay-kit'), 'nexus-relay');
  });

  it('strips -apparatus suffix', () => {
    assert.equal(derivePluginId('books-apparatus'), 'books');
    assert.equal(derivePluginId('@shardworks/books-apparatus'), 'books');
    assert.equal(derivePluginId('@acme/cache-apparatus'), 'acme/cache');
  });

  it('strips -plugin suffix', () => {
    assert.equal(derivePluginId('my-thing-plugin'), 'my-thing');
    assert.equal(derivePluginId('@shardworks/nexus-thing-plugin'), 'nexus-thing');
  });

  it('does not strip suffix-like substrings in the middle', () => {
    assert.equal(derivePluginId('my-kit-tools'), 'my-kit-tools');
    assert.equal(derivePluginId('apparatus-runner'), 'apparatus-runner');
  });
});

// ── resolvePackageNameForPluginId ────────────────────────────────────

describe('resolvePackageNameForPluginId', () => {
  let tmpDirs: string[] = [];

  function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-pkg-test-'));
    tmpDirs.push(dir);
    return dir;
  }

  function writePackageJson(dir: string, deps: Record<string, string>): void {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'test-guild', version: '1.0.0', dependencies: deps }),
    );
  }

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs = [];
  });

  it('resolves @shardworks-scoped package without suffix', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, { '@shardworks/nexus-stdlib': '^1.0.0' });
    assert.equal(resolvePackageNameForPluginId(tmp, 'nexus-stdlib'), '@shardworks/nexus-stdlib');
  });

  it('resolves @shardworks-scoped package with -apparatus suffix', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, { '@shardworks/tools-apparatus': '^2.0.0' });
    assert.equal(resolvePackageNameForPluginId(tmp, 'tools'), '@shardworks/tools-apparatus');
  });

  it('resolves @shardworks-scoped package with -kit suffix', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, { '@shardworks/nexus-relay-kit': '^1.0.0' });
    assert.equal(resolvePackageNameForPluginId(tmp, 'nexus-relay'), '@shardworks/nexus-relay-kit');
  });

  it('resolves @shardworks-scoped package with -plugin suffix', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, { '@shardworks/nexus-thing-plugin': '^1.0.0' });
    assert.equal(resolvePackageNameForPluginId(tmp, 'nexus-thing'), '@shardworks/nexus-thing-plugin');
  });

  it('resolves unscoped package name', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, { 'my-tool': '^1.0.0' });
    assert.equal(resolvePackageNameForPluginId(tmp, 'my-tool'), 'my-tool');
  });

  it('resolves unscoped package with -kit suffix', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, { 'my-relay-kit': '^1.0.0' });
    assert.equal(resolvePackageNameForPluginId(tmp, 'my-relay'), 'my-relay-kit');
  });

  it('resolves third-party scoped package', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, { '@acme/my-tool': '^1.0.0' });
    assert.equal(resolvePackageNameForPluginId(tmp, 'acme/my-tool'), '@acme/my-tool');
  });

  it('prefers @shardworks-scoped package when ambiguous', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, {
      'nexus-stdlib': '^1.0.0',
      '@shardworks/nexus-stdlib': '^2.0.0',
    });
    assert.equal(resolvePackageNameForPluginId(tmp, 'nexus-stdlib'), '@shardworks/nexus-stdlib');
  });

  it('returns null when no matching dependency exists', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, { 'other-package': '^1.0.0' });
    assert.equal(resolvePackageNameForPluginId(tmp, 'nonexistent'), null);
  });

  it('returns null when package.json is missing', () => {
    const tmp = makeTmpDir();
    assert.equal(resolvePackageNameForPluginId(tmp, 'anything'), null);
  });

  it('returns null when dependencies is empty', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, {});
    assert.equal(resolvePackageNameForPluginId(tmp, 'anything'), null);
  });
});

=== CONTEXT FILE: packages/framework/core/src/resolve-package.ts ===
/**
 * Package resolution utilities for guild-installed npm packages.
 *
 * Resolves entry points from the guild's node_modules by reading package.json
 * exports maps directly. Needed because guild plugins are ESM-only packages
 * and createRequire() can't resolve their exports.
 *
 * Also owns:
 * - derivePluginId — canonical npm package name → plugin id derivation
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Derive the guild-facing plugin id from an npm package name.
 *
 * Convention:
 * - `@shardworks/nexus-ledger`      → `nexus-ledger`   (official scope stripped)
 * - `@shardworks/books-apparatus`   → `books`           (descriptor suffix stripped)
 * - `@acme/my-plugin`               → `acme/my-plugin`  (third-party: drop @ only)
 * - `my-relay-kit`                  → `my-relay`        (descriptor suffix stripped)
 * - `my-plugin`                     → `my-plugin`       (unscoped: unchanged)
 *
 * The `@shardworks` scope is the official Nexus namespace — its plugins are
 * referenced by bare name in guild.json, CLI commands, and config keys.
 * Third-party scoped packages retain the scope as a prefix (without @) to
 * prevent collisions between `@acme/foo` and `@other/foo`.
 *
 * Descriptor suffixes (`-plugin`, `-apparatus`, `-kit`) are stripped after
 * scope resolution so that package naming conventions don't leak into ids.
 */
export function derivePluginId(packageName: string): string {
  // Step 1: strip scope
  let name: string;
  if (packageName.startsWith('@shardworks/')) {
    name = packageName.slice('@shardworks/'.length);
  } else if (packageName.startsWith('@')) {
    name = packageName.slice(1); // @acme/foo → acme/foo
  } else {
    name = packageName;
  }
  // Step 2: strip descriptor suffix
  return name.replace(/-(plugin|apparatus|kit)$/, '');
}

/**
 * Read a package.json from the guild's node_modules.
 * Returns the parsed JSON and version. Falls back gracefully.
 */
export function readGuildPackageJson(
  guildRoot: string,
  pkgName: string,
): { version: string; pkgJson: Record<string, unknown> | null } {
  const pkgJsonPath = path.join(guildRoot, 'node_modules', pkgName, 'package.json');
  try {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as Record<string, unknown>;
    return { version: (pkgJson.version as string) ?? 'unknown', pkgJson };
  } catch {
    return { version: 'unknown', pkgJson: null };
  }
}

/**
 * Resolve the npm package name for a plugin id by consulting the guild's root package.json.
 *
 * Scans all dependencies and runs `derivePluginId()` on each to find the
 * package whose derived id matches. This correctly handles descriptor
 * suffixes (-kit, -apparatus, -plugin) that derivePluginId strips.
 *
 * When multiple packages derive to the same id (unlikely but possible),
 * prefers @shardworks-scoped packages over third-party ones.
 *
 * Returns null if no matching dependency is found.
 */
export function resolvePackageNameForPluginId(guildRoot: string, pluginId: string): string | null {
  const pkgPath = path.join(guildRoot, 'package.json');
  let deps: string[] = [];
  try {
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
    deps = Object.keys((pkgJson.dependencies as Record<string, string> | undefined) ?? {});
  } catch {
    return null;
  }

  let match: string | null = null;
  for (const dep of deps) {
    if (derivePluginId(dep) === pluginId) {
      // Prefer @shardworks-scoped packages (official namespace)
      if (dep.startsWith('@shardworks/')) return dep;
      // Keep the first match as fallback
      if (!match) match = dep;
    }
  }
  return match;
}

/**
 * Resolve the entry point for a guild-installed package.
 *
 * Reads the package's exports map to find the ESM entry point.
 * Returns an absolute path suitable for dynamic import().
 */
export function resolveGuildPackageEntry(guildRoot: string, pkgName: string): string {
  const pkgDir = path.join(guildRoot, 'node_modules', pkgName);
  const { pkgJson } = readGuildPackageJson(guildRoot, pkgName);

  if (pkgJson) {
    const exports = pkgJson.exports as Record<string, unknown> | string | undefined;
    if (exports) {
      if (typeof exports === 'string') return path.join(pkgDir, exports);
      const main = (exports as Record<string, unknown>)['.'];
      if (typeof main === 'string') return path.join(pkgDir, main);
      if (main && typeof main === 'object') {
        const importPath = (main as Record<string, string>).import;
        if (importPath) return path.join(pkgDir, importPath);
      }
    }
    if (pkgJson.main) return path.join(pkgDir, pkgJson.main as string);
  }

  return path.join(pkgDir, 'index.js');
}

=== CONTEXT FILE: packages/framework/core/src/guild-config.ts ===
import fs from 'node:fs';
import path from 'node:path';

/** A custom event declaration in guild.json clockworks.events. */
export interface EventDeclaration {
  /** Human-readable description of what this event means. */
  description?: string;
  /** Optional payload schema hint (not enforced in Phase 1). */
  schema?: Record<string, string>;
}


/** A standing order — a registered response to an event. */
export type StandingOrder =
  | { on: string; run: string }
  | { on: string; summon: string; prompt?: string }
  | { on: string; brief: string };

/** The clockworks configuration block in guild.json. */
export interface ClockworksConfig {
  /** Custom event declarations. */
  events?: Record<string, EventDeclaration>;
  /** Standing orders — event → action mappings. */
  standingOrders?: StandingOrder[];
}

/** Guild-level settings — operational flags and preferences. */
export interface GuildSettings {
  /**
   * Default LLM model for anima sessions (e.g. 'sonnet', 'opus').
   * Replaces the top-level `model` field from GuildConfig V1.
   */
  model?: string;
  /**
   * Automatically apply pending database migrations when the Books are opened.
   * Defaults to `true` when not specified. Set to `false` to require explicit
   * migration via `nsg guild upgrade-books`.
   */
  autoMigrate?: boolean;
}

/**
 * Guild configuration.
 *
 * The plugin-centric model: plugins are npm packages; capabilities (tools, engines,
 * training content) are declared by plugins and discovered dynamically at runtime.
 * Framework-level keys (`name`, `nexus`, `plugins`, `settings`) are defined here;
 * all other top-level keys are plugin configuration sections, keyed by plugin id.
 */
export interface GuildConfig {
  /** Guild name — used as the guildhall npm package name. */
  name: string;
  /** Installed Nexus framework version. */
  nexus: string;
  /** Installed plugin ids (derived from npm package names). Always present; starts empty. */
  plugins: string[];
  /** Clockworks configuration — events, standing orders. */
  clockworks?: ClockworksConfig;
  /** Guild-level settings — operational flags and preferences. Includes default model. */
  settings?: GuildSettings;
}

/**
 * Create the default guild.json content for a new guild.
 * All collections start empty. The default model is stored in settings.
 */
export function createInitialGuildConfig(name: string, nexusVersion: string, model: string): GuildConfig {
  return {
    name,
    nexus: nexusVersion,
    plugins: [],
    settings: { model },
  };
}

/** Read and parse guild.json from the guild root. */
export function readGuildConfig(home: string): GuildConfig {
  const configFile = guildConfigPath(home);
  return JSON.parse(fs.readFileSync(configFile, 'utf-8')) as GuildConfig;
}

/** Write guild.json to the guild root. */
export function writeGuildConfig(home: string, config: GuildConfig): void {
  const configFile = guildConfigPath(home);
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
}

/** Resolve the path to guild.json in the guild root. */
export function guildConfigPath(home: string): string {
  return path.join(home, 'guild.json');
}



## Codebase Structure (surrounding directories)

```
=== TREE: packages/framework/arbor/src/ ===
arbor.test.ts
arbor.ts
guild-lifecycle.test.ts
guild-lifecycle.ts
index.ts

=== TREE: packages/framework/cli/src/ ===
cli.ts
commands
helpers.ts
index.ts
program.test.ts
program.ts

=== TREE: packages/framework/cli/src/commands/ ===
index.ts
init.test.ts
init.ts
plugin.test.ts
plugin.ts
status.test.ts
status.ts
test-helpers.ts
upgrade.test.ts
upgrade.ts
version.test.ts
version.ts

=== TREE: packages/framework/core/src/ ===
guild-config.ts
guild.ts
id.test.ts
id.ts
index.ts
nexus-home.ts
plugin.ts
resolve-package.test.ts
resolve-package.ts


```
