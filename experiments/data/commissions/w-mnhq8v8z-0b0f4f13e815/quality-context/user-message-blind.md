## Commission Diff

```
```
 packages/framework/cli/src/commands/plugin.test.ts | 49 +++++++++++++++++++++-
 packages/framework/cli/src/commands/plugin.ts      | 31 ++++++++++++--
 2 files changed, 76 insertions(+), 4 deletions(-)

diff --git a/packages/framework/cli/src/commands/plugin.test.ts b/packages/framework/cli/src/commands/plugin.test.ts
index 1586df1..e1114ab 100644
--- a/packages/framework/cli/src/commands/plugin.test.ts
+++ b/packages/framework/cli/src/commands/plugin.test.ts
@@ -20,7 +20,7 @@ import { describe, it, afterEach } from 'node:test';
 import assert from 'node:assert/strict';
 import fs from 'node:fs';
 import path from 'node:path';
-import { pluginList, pluginInstall, pluginRemove, pluginUpgrade } from './plugin.ts';
+import { pluginList, pluginInstall, pluginRemove, pluginUpgrade, detectPackageManager } from './plugin.ts';
 import { setupGuildAccessor, makeTmpDir, makeGuild, makeGuildPackageJson, cleanupTestState } from './test-helpers.ts';
 
 /**
@@ -227,6 +227,39 @@ describe('plugin-install handler — link mode', () => {
     const config = JSON.parse(fs.readFileSync(path.join(tmp, 'guild.json'), 'utf-8'));
     assert.ok(config.plugins.includes('relative-detect'));
   });
+
+  it('uses link: protocol when guild has pnpm-lock.yaml', async () => {
+    const tmp = makeTmpDir('plugin');
+    makeGuild(tmp);
+    fs.writeFileSync(path.join(tmp, 'pnpm-lock.yaml'), '');
+    const pluginDir = makeFakePlugin(tmp, 'pnpm-fake-plugin');
+
+    setupGuildAccessor(tmp);
+    await pluginInstall.handler({ source: pluginDir, type: 'link' });
+
+    const pkgJson = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf-8'));
+    const depValue: string = pkgJson.dependencies['pnpm-fake-plugin'];
+    assert.ok(depValue.startsWith('link:'), `Expected link: protocol, got: ${depValue}`);
+
+    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'guild.json'), 'utf-8'));
+    assert.ok(config.plugins.includes('pnpm-fake'));
+  });
+
+  it('uses file: protocol when guild has no pnpm-lock.yaml', async () => {
+    const tmp = makeTmpDir('plugin');
+    makeGuild(tmp);
+    const pluginDir = makeFakePlugin(tmp, 'npm-fake-plugin');
+
+    setupGuildAccessor(tmp);
+    await pluginInstall.handler({ source: pluginDir, type: 'link' });
+
+    const pkgJson = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf-8'));
+    const depValue: string = pkgJson.dependencies['npm-fake-plugin'];
+    assert.ok(depValue.startsWith('file:'), `Expected file: protocol, got: ${depValue}`);
+
+    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'guild.json'), 'utf-8'));
+    assert.ok(config.plugins.includes('npm-fake'));
+  });
 });
 
 // ── plugin-remove ─��──────────────���───────────────────────────────────────
@@ -293,6 +326,20 @@ describe('plugin-remove handler', () => {
       /not installed/,
     );
   });
+
+  it('calls pnpm remove when guild has pnpm-lock.yaml', async () => {
+    const tmp = makeTmpDir('plugin');
+    // Install the plugin first via pnpm so it exists in node_modules
+    makeGuild(tmp, { plugins: ['nexus-stdlib'] });
+    fs.writeFileSync(path.join(tmp, 'pnpm-lock.yaml'), '');
+    makeGuildPackageJson(tmp, { '@shardworks/nexus-stdlib': '^1.0.0' });
+
+    setupGuildAccessor(tmp);
+    await pluginRemove.handler({ name: 'nexus-stdlib' });
+
+    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'guild.json'), 'utf-8'));
+    assert.ok(!config.plugins.includes('nexus-stdlib'));
+  });
 });
 
 // ── plugin-upgrade ───────────────────────────────────────────────────────
diff --git a/packages/framework/cli/src/commands/plugin.ts b/packages/framework/cli/src/commands/plugin.ts
index c76abc7..14f8260 100644
--- a/packages/framework/cli/src/commands/plugin.ts
+++ b/packages/framework/cli/src/commands/plugin.ts
@@ -28,6 +28,21 @@ function npm(args: string[], cwd: string): string {
   return execFileSync('npm', args, { cwd, stdio: 'pipe', encoding: 'utf-8' });
 }
 
+function pnpm(args: string[], cwd: string): string {
+  return execFileSync('pnpm', args, { cwd, stdio: 'pipe', encoding: 'utf-8' });
+}
+
+/**
+ * Detect the package manager used by the guild.
+ *
+ * Checks for lockfiles in order of specificity. Falls back to 'npm'
+ * when no lockfile is present (e.g. fresh guilds before first install).
+ */
+export function detectPackageManager(guildRoot: string): 'npm' | 'pnpm' {
+  if (fs.existsSync(path.join(guildRoot, 'pnpm-lock.yaml'))) return 'pnpm';
+  return 'npm';
+}
+
 /**
  * Parse a source specifier to extract the npm package name.
  * e.g. "@shardworks/nexus-stdlib@1.0" → "@shardworks/nexus-stdlib"
@@ -128,7 +143,12 @@ export const pluginInstall = tool({
       }
       const pkgJson = JSON.parse(fs.readFileSync(path.join(sourceDir, 'package.json'), 'utf-8')) as Record<string, unknown>;
       packageName = pkgJson.name as string;
-      npm(['install', '--save', `file:${sourceDir}`], home);
+      const pm = detectPackageManager(home);
+      if (pm === 'pnpm') {
+        pnpm(['add', `link:${sourceDir}`], home);
+      } else {
+        npm(['install', '--save', `file:${sourceDir}`], home);
+      }
     } else {
       npm(['install', '--save', source], home);
       packageName = parsePackageName(source) ?? detectInstalledPackage(home);
@@ -176,9 +196,14 @@ export const pluginRemove = tool({
     const packageName = resolvePackageNameForPluginId(home, targetId);
     if (packageName) {
       try {
-        npm(['uninstall', packageName], home);
+        const pm = detectPackageManager(home);
+        if (pm === 'pnpm') {
+          pnpm(['remove', packageName], home);
+        } else {
+          npm(['uninstall', packageName], home);
+        }
       } catch {
-        // Don't fail if npm uninstall fails — guild.json is already updated
+        // Don't fail if uninstall fails — guild.json is already updated
       }
     }
 
```
```

## Full File Contents (for context)


=== FILE: packages/framework/cli/src/commands/plugin.test.ts ===
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

=== FILE: packages/framework/cli/src/commands/plugin.ts ===
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


## Convention Reference (sibling files not modified by this commission)


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

=== CONTEXT FILE: packages/framework/cli/src/commands/status.test.ts ===
/**
 * Tests for the `status` framework command.
 *
 * Tests the handler directly — no CLI layer involved.
 * Plugins come from config.plugins. Roles are now Loom-owned plugin config,
 * not framework-level — status shows plugins but not roles.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import statusTool from './status.ts';
import { setupGuildAccessor, makeTmpDir, makeGuild, cleanupTestState } from './test-helpers.ts';

afterEach(() => {
  cleanupTestState();
});

// ── No guild ──────────────────────────────────────────────────────────────

describe('status handler — no guild', () => {
  it('throws a friendly error when guild is not initialized', async () => {
    await assert.rejects(
      async () => statusTool.handler({}),
      /Not inside a guild/,
    );
  });
});

// ── Tool metadata ──────────────────────────────────────────────────────────

describe('status tool definition', () => {
  it('has the correct name', () => {
    assert.equal(statusTool.name, 'status');
  });

  it('is callable from cli only', () => {
    assert.deepEqual(statusTool.callableBy, ['cli']);
  });
});

// ── Text output ────────────────────────────────────────────────────────────

describe('status handler — text mode', () => {
  it('shows guild name', async () => {
    const tmp = makeTmpDir('status');
    makeGuild(tmp);

    setupGuildAccessor(tmp);
    const result = await statusTool.handler({});
    assert.ok(typeof result === 'string');
    assert.ok((result as string).includes('test-guild'));
  });

  it('shows guild home path', async () => {
    const tmp = makeTmpDir('status');
    makeGuild(tmp);

    setupGuildAccessor(tmp);
    const result = await statusTool.handler({});
    assert.ok((result as string).includes(tmp));
  });

  it('shows model from settings', async () => {
    const tmp = makeTmpDir('status');
    makeGuild(tmp, { settings: { model: 'opus' } });

    setupGuildAccessor(tmp);
    const result = await statusTool.handler({});
    assert.ok((result as string).includes('opus'));
  });

  it('shows "(none)" for plugins when plugins list is empty', async () => {
    const tmp = makeTmpDir('status');
    makeGuild(tmp);

    setupGuildAccessor(tmp);
    const result = await statusTool.handler({}) as string;
    const pluginsLine = result.split('\n').find((l) => l.startsWith('Plugins:')) ?? '';
    assert.ok(pluginsLine.includes('(none)'));
  });

  it('shows installed plugin ids from config.plugins', async () => {
    const tmp = makeTmpDir('status');
    makeGuild(tmp, { plugins: ['nexus-stdlib'] });

    setupGuildAccessor(tmp);
    const result = await statusTool.handler({}) as string;
    assert.ok(result.includes('nexus-stdlib'));
  });

  it('shows multiple installed plugins', async () => {
    const tmp = makeTmpDir('status');
    makeGuild(tmp, { plugins: ['nexus-stdlib', 'nexus-ledger'] });

    setupGuildAccessor(tmp);
    const result = await statusTool.handler({}) as string;
    assert.ok(result.includes('nexus-stdlib'));
    assert.ok(result.includes('nexus-ledger'));
  });
});

// ── JSON output ────────────────────────────────────────────────────────────

describe('status handler — json mode', () => {
  it('returns an object (not a string)', async () => {
    const tmp = makeTmpDir('status');
    makeGuild(tmp);

    setupGuildAccessor(tmp);
    const result = await statusTool.handler({ json: true });
    assert.ok(typeof result === 'object' && result !== null);
  });

  it('includes guild name', async () => {
    const tmp = makeTmpDir('status');
    makeGuild(tmp);

    setupGuildAccessor(tmp);
    const result = await statusTool.handler({ json: true }) as Record<string, unknown>;
    assert.equal(result.guild, 'test-guild');
  });

  it('includes home path', async () => {
    const tmp = makeTmpDir('status');
    makeGuild(tmp);

    setupGuildAccessor(tmp);
    const result = await statusTool.handler({ json: true }) as Record<string, unknown>;
    assert.equal(result.home, tmp);
  });

  it('includes nexus version string', async () => {
    const tmp = makeTmpDir('status');
    makeGuild(tmp);

    setupGuildAccessor(tmp);
    const result = await statusTool.handler({ json: true }) as Record<string, unknown>;
    assert.ok(typeof result.nexus === 'string');
  });

  it('includes model from settings', async () => {
    const tmp = makeTmpDir('status');
    makeGuild(tmp, { settings: { model: 'haiku' } });

    setupGuildAccessor(tmp);
    const result = await statusTool.handler({ json: true }) as Record<string, unknown>;
    assert.equal(result.model, 'haiku');
  });

  it('includes plugins as a sorted array from config.plugins', async () => {
    const tmp = makeTmpDir('status');
    makeGuild(tmp, { plugins: ['nexus-ledger', 'nexus-stdlib'] });

    setupGuildAccessor(tmp);
    const result = await statusTool.handler({ json: true }) as Record<string, unknown>;
    assert.ok(Array.isArray(result.plugins));
    const plugins = result.plugins as string[];
    assert.ok(plugins.includes('nexus-stdlib'));
    assert.ok(plugins.includes('nexus-ledger'));
    assert.deepEqual(plugins, [...plugins].sort());
  });

  it('returns empty plugins array when nothing is installed', async () => {
    const tmp = makeTmpDir('status');
    makeGuild(tmp);

    setupGuildAccessor(tmp);
    const result = await statusTool.handler({ json: true }) as Record<string, unknown>;
    assert.deepEqual(result.plugins, []);
  });
});

=== CONTEXT FILE: packages/framework/cli/src/commands/init.ts ===
/**
 * nsg init — create a new guild.
 *
 * A framework command — hardcoded in the CLI, not discovered via plugins.
 *
 * Writes the minimum viable guild: directory structure, guild.json,
 * package.json, .gitignore. Does NOT git init, install bundles, create
 * the database, or instantiate animas — those are separate steps.
 *
 * After init, the user runs `nsg plugin install` to add capabilities.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tool } from '@shardworks/tools-apparatus';
import { VERSION, createInitialGuildConfig, writeGuildConfig } from '@shardworks/nexus-core';
import { z } from 'zod';

const DEFAULT_MODEL = 'sonnet';

export default tool({
  name: 'init',
  description: 'Create a new guild — directory structure, guild.json, and package.json',
  callableBy: ['cli'],
  params: {
    path: z.string().describe('Directory path for the new guild'),
    name: z.string().optional().describe('Guild name (defaults to directory basename)'),
    model: z.string().optional().describe('Default model for anima sessions (default: sonnet)'),
  },
  handler: async (params) => {
    const home = path.resolve(params.path);
    const name = params.name ?? path.basename(home);
    const model = params.model ?? DEFAULT_MODEL;

    // Validate target
    if (fs.existsSync(home)) {
      const entries = fs.readdirSync(home);
      if (entries.length > 0) {
        throw new Error(`${home} exists and is not empty.`);
      }
    }

    // Create guild root
    fs.mkdirSync(home, { recursive: true });

    // .nexus infrastructure (gitignored)
    fs.mkdirSync(path.join(home, '.nexus'), { recursive: true });

    // Scaffold guild directories
    const dirs = [
      'roles',
      'codex',
    ];
    for (const dir of dirs) {
      const full = path.join(home, dir);
      fs.mkdirSync(full, { recursive: true });
      fs.writeFileSync(path.join(full, '.gitkeep'), '');
    }

    // guild.json — V2 format: plugin-centric, model in settings
    const guildConfig = createInitialGuildConfig(name, VERSION, model);
    writeGuildConfig(home, guildConfig);

    // package.json — makes the guild an npm project so plugins install as deps.
    // If running from a published version, pin @shardworks/nexus so nsg is
    // available in the guild's node_modules/.bin without a global install.
    const dependencies: Record<string, string> = {};
    if (VERSION !== '0.0.0') {
      dependencies['@shardworks/nexus'] = `^${VERSION}`;
    }

    const packageJson = {
      name: `guild-${name}`,
      private: true,
      version: '0.0.0',
      type: 'module',
      dependencies,
    };
    fs.writeFileSync(
      path.join(home, 'package.json'),
      JSON.stringify(packageJson, null, 2) + '\n',
    );

    // .gitignore
    fs.writeFileSync(
      path.join(home, '.gitignore'),
      ['node_modules/', '.nexus/', ''].join('\n'),
    );

    // codex placeholder
    fs.writeFileSync(path.join(home, 'codex', 'all.md'), '');

    // npm install to get dependencies into node_modules
    if (Object.keys(dependencies).length > 0) {
      execFileSync('npm', ['install'], { cwd: home, stdio: 'pipe' });
    }

    const lines = [
      `Guild "${name}" created at ${home}`,
      '',
      `  cd ${params.path}`,
      '  git init                                        # if you want version control',
      '  nsg plugin install @shardworks/nexus-stdlib     # install standard tools',
      '',
    ];
    return lines.join('\n');
  },
});


## Codebase Structure (surrounding directories)

```
```

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

```
```
