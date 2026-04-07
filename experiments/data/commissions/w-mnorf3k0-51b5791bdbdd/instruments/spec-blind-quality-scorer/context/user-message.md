## Commission Diff

```
 packages/framework/cli/src/cli.ts                  |   2 +-
 packages/framework/cli/src/commands/init.ts        |   2 +-
 packages/framework/cli/src/commands/plugin.test.ts |   8 +-
 packages/framework/cli/src/commands/plugin.ts      |   8 +-
 packages/framework/cli/src/commands/status.test.ts |   2 +-
 packages/framework/cli/src/commands/status.ts      |   2 +-
 .../framework/cli/src/commands/upgrade.test.ts     |   2 +-
 packages/framework/cli/src/commands/upgrade.ts     |   2 +-
 .../framework/cli/src/commands/version.test.ts     |   2 +-
 packages/framework/cli/src/commands/version.ts     |   2 +-
 packages/framework/cli/src/program.ts              |   2 +-
 packages/plugins/animator/src/tools/summon.ts      |   2 +-
 .../plugins/claude-code/src/mcp-server.test.ts     |   6 +-
 packages/plugins/oculus/package.json               |  41 ++
 packages/plugins/oculus/src/index.ts               |  28 +
 packages/plugins/oculus/src/oculus.test.ts         | 767 +++++++++++++++++++++
 packages/plugins/oculus/src/oculus.ts              | 537 +++++++++++++++
 packages/plugins/oculus/src/static/style.css       | 225 ++++++
 packages/plugins/oculus/src/types.ts               |  43 ++
 packages/plugins/oculus/tsconfig.json              |  13 +
 packages/plugins/tools/src/instrumentarium.test.ts |  12 +-
 packages/plugins/tools/src/tool.test.ts            |  10 +-
 packages/plugins/tools/src/tool.ts                 |   4 +-
 .../plugins/tools/src/tools/tools-list.test.ts     |   4 +-
 packages/plugins/tools/src/tools/tools-list.ts     |   2 +-
 .../plugins/tools/src/tools/tools-show.test.ts     |   4 +-
 pnpm-lock.yaml                                     |  22 +
 27 files changed, 1715 insertions(+), 39 deletions(-)

diff --git a/packages/framework/cli/src/cli.ts b/packages/framework/cli/src/cli.ts
index 2e9abf2..86c1317 100644
--- a/packages/framework/cli/src/cli.ts
+++ b/packages/framework/cli/src/cli.ts
@@ -6,7 +6,7 @@
  * Dynamically discovers installed tools via plugins, registers them as Commander
  * commands, and delegates argument parsing and invocation to Commander.
  *
- * Tools are filtered to those with 'cli' in callableBy (or no callableBy
+ * Tools are filtered to those with 'patron' in callableBy (or no callableBy
  * set, which defaults to all callers). Tools marked 'anima'-only are invisible here.
  */
 
diff --git a/packages/framework/cli/src/commands/init.ts b/packages/framework/cli/src/commands/init.ts
index 20b8feb..8d25bf1 100644
--- a/packages/framework/cli/src/commands/init.ts
+++ b/packages/framework/cli/src/commands/init.ts
@@ -22,7 +22,7 @@ const DEFAULT_MODEL = 'sonnet';
 export default tool({
   name: 'init',
   description: 'Create a new guild — directory structure, guild.json, and package.json',
-  callableBy: ['cli'],
+  callableBy: ['patron'],
   params: {
     path: z.string().describe('Directory path for the new guild'),
     name: z.string().optional().describe('Guild name (defaults to directory basename)'),
diff --git a/packages/framework/cli/src/commands/plugin.test.ts b/packages/framework/cli/src/commands/plugin.test.ts
index e1114ab..2545360 100644
--- a/packages/framework/cli/src/commands/plugin.test.ts
+++ b/packages/framework/cli/src/commands/plugin.test.ts
@@ -52,19 +52,19 @@ afterEach(() => {
 
 describe('plugin tool definitions', () => {
   it('plugin-list is callable from cli only', () => {
-    assert.deepEqual(pluginList.callableBy, ['cli']);
+    assert.deepEqual(pluginList.callableBy, ['patron']);
   });
 
   it('plugin-install is callable from cli only', () => {
-    assert.deepEqual(pluginInstall.callableBy, ['cli']);
+    assert.deepEqual(pluginInstall.callableBy, ['patron']);
   });
 
   it('plugin-remove is callable from cli only', () => {
-    assert.deepEqual(pluginRemove.callableBy, ['cli']);
+    assert.deepEqual(pluginRemove.callableBy, ['patron']);
   });
 
   it('plugin-upgrade is callable from cli only', () => {
-    assert.deepEqual(pluginUpgrade.callableBy, ['cli']);
+    assert.deepEqual(pluginUpgrade.callableBy, ['patron']);
   });
 });
 
diff --git a/packages/framework/cli/src/commands/plugin.ts b/packages/framework/cli/src/commands/plugin.ts
index 14f8260..36777f7 100644
--- a/packages/framework/cli/src/commands/plugin.ts
+++ b/packages/framework/cli/src/commands/plugin.ts
@@ -94,7 +94,7 @@ function detectInstalledPackage(guildRoot: string): string {
 export const pluginList = tool({
   name: 'plugin-list',
   description: 'List installed plugins',
-  callableBy: ['cli'],
+  callableBy: ['patron'],
   params: {
     json: z.boolean().optional().describe('Output as JSON'),
   },
@@ -118,7 +118,7 @@ export const pluginList = tool({
 export const pluginInstall = tool({
   name: 'plugin-install',
   description: 'Install a plugin into the guild',
-  callableBy: ['cli'],
+  callableBy: ['patron'],
   params: {
     source: z.string().describe('Package name, git URL, or local folder path'),
     type: z.enum(['registry', 'link']).optional().describe('Install type: "registry" (npm install) or "link" (local folder). Auto-detected when source is a folder path.'),
@@ -177,7 +177,7 @@ export const pluginInstall = tool({
 export const pluginRemove = tool({
   name: 'plugin-remove',
   description: 'Remove a plugin from the guild',
-  callableBy: ['cli'],
+  callableBy: ['patron'],
   params: {
     name: z.string().describe('Plugin id or package name to remove'),
   },
@@ -214,7 +214,7 @@ export const pluginRemove = tool({
 export const pluginUpgrade = tool({
   name: 'plugin-upgrade',
   description: 'Upgrade a plugin to a newer version',
-  callableBy: ['cli'],
+  callableBy: ['patron'],
   params: {
     name: z.string().describe('Plugin id or package name to upgrade'),
     version: z.string().optional().describe('Target version (default: latest)'),
diff --git a/packages/framework/cli/src/commands/status.test.ts b/packages/framework/cli/src/commands/status.test.ts
index cfd0366..c4a6ce7 100644
--- a/packages/framework/cli/src/commands/status.test.ts
+++ b/packages/framework/cli/src/commands/status.test.ts
@@ -34,7 +34,7 @@ describe('status tool definition', () => {
   });
 
   it('is callable from cli only', () => {
-    assert.deepEqual(statusTool.callableBy, ['cli']);
+    assert.deepEqual(statusTool.callableBy, ['patron']);
   });
 });
 
diff --git a/packages/framework/cli/src/commands/status.ts b/packages/framework/cli/src/commands/status.ts
index 578e8c1..82a4717 100644
--- a/packages/framework/cli/src/commands/status.ts
+++ b/packages/framework/cli/src/commands/status.ts
@@ -16,7 +16,7 @@ import { z } from 'zod';
 export default tool({
   name: 'status',
   description: 'Show guild identity and installed plugin summary',
-  callableBy: ['cli'],
+  callableBy: ['patron'],
   params: {
     json: z.boolean().optional().describe('Output as JSON'),
   },
diff --git a/packages/framework/cli/src/commands/upgrade.test.ts b/packages/framework/cli/src/commands/upgrade.test.ts
index 6cc1c98..e16c481 100644
--- a/packages/framework/cli/src/commands/upgrade.test.ts
+++ b/packages/framework/cli/src/commands/upgrade.test.ts
@@ -18,7 +18,7 @@ describe('upgrade tool definition', () => {
   });
 
   it('is callable from cli only', () => {
-    assert.deepEqual(upgradeTool.callableBy, ['cli']);
+    assert.deepEqual(upgradeTool.callableBy, ['patron']);
   });
 
   it('exposes a dryRun param', () => {
diff --git a/packages/framework/cli/src/commands/upgrade.ts b/packages/framework/cli/src/commands/upgrade.ts
index c80f3b0..40a4c60 100644
--- a/packages/framework/cli/src/commands/upgrade.ts
+++ b/packages/framework/cli/src/commands/upgrade.ts
@@ -12,7 +12,7 @@ import { z } from 'zod';
 export default tool({
   name: 'upgrade',
   description: 'Upgrade the guild framework and run pending plugin migrations',
-  callableBy: ['cli'],
+  callableBy: ['patron'],
   params: {
     dryRun: z.boolean().optional().describe('Show what would be done without applying changes'),
   },
diff --git a/packages/framework/cli/src/commands/version.test.ts b/packages/framework/cli/src/commands/version.test.ts
index 56dfa06..08b9d0c 100644
--- a/packages/framework/cli/src/commands/version.test.ts
+++ b/packages/framework/cli/src/commands/version.test.ts
@@ -57,7 +57,7 @@ describe('version tool definition', () => {
   });
 
   it('is callable from cli only', () => {
-    assert.deepEqual(versionTool.callableBy, ['cli']);
+    assert.deepEqual(versionTool.callableBy, ['patron']);
   });
 });
 
diff --git a/packages/framework/cli/src/commands/version.ts b/packages/framework/cli/src/commands/version.ts
index d6cd0f1..9a096b7 100644
--- a/packages/framework/cli/src/commands/version.ts
+++ b/packages/framework/cli/src/commands/version.ts
@@ -15,7 +15,7 @@ import { z } from 'zod';
 export default tool({
   name: 'version',
   description: 'Show Nexus framework and installed plugin version information',
-  callableBy: ['cli'],
+  callableBy: ['patron'],
   params: {
     json: z.boolean().optional().describe('Output as JSON'),
   },
diff --git a/packages/framework/cli/src/program.ts b/packages/framework/cli/src/program.ts
index a5f5fa2..a27fb21 100644
--- a/packages/framework/cli/src/program.ts
+++ b/packages/framework/cli/src/program.ts
@@ -172,7 +172,7 @@ export async function main(): Promise<void> {
     try {
       const instrumentarium = guild().apparatus<InstrumentariumApi>('tools');
       const pluginTools = instrumentarium.list()
-        .filter((r) => !r.definition.callableBy || r.definition.callableBy.includes('cli'))
+        .filter((r) => !r.definition.callableBy || r.definition.callableBy.includes('patron'))
         .map((r) => r.definition);
       registerTools(program, pluginTools);
     } catch {
diff --git a/packages/plugins/animator/src/tools/summon.ts b/packages/plugins/animator/src/tools/summon.ts
index e26f6ea..d464d82 100644
--- a/packages/plugins/animator/src/tools/summon.ts
+++ b/packages/plugins/animator/src/tools/summon.ts
@@ -26,7 +26,7 @@ export default tool({
     prompt: z.string().describe('The work prompt — what the anima should do'),
     role: z.string().optional().describe('Role to summon (e.g. "artificer", "scribe")'),
   },
-  callableBy: 'cli',
+  callableBy: 'patron',
   permission: 'animate',
   handler: async (params) => {
     const animator = guild().apparatus<AnimatorApi>('animator');
diff --git a/packages/plugins/claude-code/src/mcp-server.test.ts b/packages/plugins/claude-code/src/mcp-server.test.ts
index 0d48bae..5ca07d8 100644
--- a/packages/plugins/claude-code/src/mcp-server.test.ts
+++ b/packages/plugins/claude-code/src/mcp-server.test.ts
@@ -20,7 +20,7 @@ function makeTool(overrides: {
   name?: string;
   description?: string;
   permission?: string;
-  callableBy?: ('cli' | 'anima' | 'library')[];
+  callableBy?: ('patron' | 'anima' | 'library')[];
   handler?: () => unknown;
 } = {}) {
   return tool({
@@ -53,9 +53,9 @@ describe('createMcpServer()', () => {
 
   it('filters out tools not callable by animas', async () => {
     const tools = [
-      makeTool({ name: 'cli-only', callableBy: ['cli'] }),
+      makeTool({ name: 'cli-only', callableBy: ['patron'] }),
       makeTool({ name: 'anima-ok', callableBy: ['anima'] }),
-      makeTool({ name: 'both', callableBy: ['cli', 'anima'] }),
+      makeTool({ name: 'both', callableBy: ['patron', 'anima'] }),
       makeTool({ name: 'no-restriction' }), // no callableBy → available to everyone
     ];
 
diff --git a/packages/plugins/oculus/package.json b/packages/plugins/oculus/package.json
new file mode 100644
index 0000000..56e9107
--- /dev/null
+++ b/packages/plugins/oculus/package.json
@@ -0,0 +1,41 @@
+{
+  "name": "@shardworks/oculus-apparatus",
+  "version": "0.0.0",
+  "license": "ISC",
+  "repository": {
+    "type": "git",
+    "url": "https://github.com/shardworks/nexus",
+    "directory": "packages/plugins/oculus"
+  },
+  "description": "The Oculus — web dashboard apparatus for the guild",
+  "type": "module",
+  "exports": {
+    ".": "./src/index.ts"
+  },
+  "scripts": {
+    "build": "tsc",
+    "test": "node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'src/**/*.test.ts'",
+    "typecheck": "tsc --noEmit"
+  },
+  "dependencies": {
+    "@hono/node-server": "^1.13.7",
+    "@shardworks/nexus-core": "workspace:*",
+    "@shardworks/tools-apparatus": "workspace:*",
+    "hono": "^4.7.11",
+    "zod": "4.3.6"
+  },
+  "devDependencies": {
+    "@types/node": "25.5.0"
+  },
+  "files": [
+    "dist"
+  ],
+  "publishConfig": {
+    "exports": {
+      ".": {
+        "types": "./dist/index.d.ts",
+        "import": "./dist/index.js"
+      }
+    }
+  }
+}
diff --git a/packages/plugins/oculus/src/index.ts b/packages/plugins/oculus/src/index.ts
new file mode 100644
index 0000000..2f3c5ac
--- /dev/null
+++ b/packages/plugins/oculus/src/index.ts
@@ -0,0 +1,28 @@
+/**
+ * @shardworks/oculus-apparatus — The Oculus.
+ *
+ * Web dashboard apparatus for the guild. Serves pages contributed by plugins,
+ * exposes guild tools as REST endpoints, and provides a unified web interface.
+ */
+
+import { createOculus } from './oculus.ts';
+
+export {
+  type OculusApi,
+  type OculusConfig,
+  type OculusKit,
+  type PageContribution,
+  type RouteContribution,
+} from './types.ts';
+
+export { createOculus } from './oculus.ts';
+
+import type { OculusConfig } from './types.ts';
+
+declare module '@shardworks/nexus-core' {
+  interface GuildConfig {
+    oculus?: OculusConfig;
+  }
+}
+
+export default createOculus();
diff --git a/packages/plugins/oculus/src/oculus.test.ts b/packages/plugins/oculus/src/oculus.test.ts
new file mode 100644
index 0000000..0900d75
--- /dev/null
+++ b/packages/plugins/oculus/src/oculus.test.ts
@@ -0,0 +1,767 @@
+/**
+ * Oculus apparatus — unit tests.
+ *
+ * Tests server lifecycle, page serving, chrome injection, tool route mapping,
+ * custom routes, and the API tool index.
+ */
+
+import fs from 'node:fs';
+import os from 'node:os';
+import path from 'node:path';
+import { describe, it, before, after, afterEach } from 'node:test';
+import assert from 'node:assert/strict';
+import { z } from 'zod';
+
+import {
+  setGuild,
+  clearGuild,
+  guild,
+} from '@shardworks/nexus-core';
+import type {
+  Guild,
+  LoadedKit,
+  LoadedApparatus,
+  StartupContext,
+} from '@shardworks/nexus-core';
+
+import { tool } from '@shardworks/tools-apparatus';
+import type { InstrumentariumApi, ResolvedTool } from '@shardworks/tools-apparatus';
+import type { ToolDefinition } from '@shardworks/tools-apparatus';
+
+import { createOculus, toolNameToRoute, permissionToMethod, coerceParams, injectChrome } from './oculus.ts';
+import type { PageContribution, RouteContribution } from './types.ts';
+
+// ── Test helpers ──────────────────────────────────────────────────────
+
+let tmpDir: string;
+
+function makeTmpDir(): string {
+  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oculus-test-'));
+  return tmpDir;
+}
+
+function cleanupTmpDir(): void {
+  if (tmpDir) {
+    try {
+      fs.rmSync(tmpDir, { recursive: true, force: true });
+    } catch { /* ignore */ }
+    tmpDir = '';
+  }
+}
+
+function makePageDir(parentDir: string, name: string, html: string): string {
+  const dir = path.join(parentDir, name);
+  fs.mkdirSync(dir, { recursive: true });
+  fs.writeFileSync(path.join(dir, 'index.html'), html);
+  return dir;
+}
+
+function buildTestContext(): {
+  ctx: StartupContext;
+  fire: (event: string, ...args: unknown[]) => Promise<void>;
+} {
+  const handlers = new Map<string, Array<(...args: unknown[]) => void | Promise<void>>>();
+
+  const ctx: StartupContext = {
+    on(event, handler) {
+      const list = handlers.get(event) ?? [];
+      list.push(handler);
+      handlers.set(event, list);
+    },
+  };
+
+  async function fire(event: string, ...args: unknown[]): Promise<void> {
+    for (const h of handlers.get(event) ?? []) {
+      await h(...args);
+    }
+  }
+
+  return { ctx, fire };
+}
+
+function mockKit(id: string, tools: unknown[], pages?: PageContribution[], routes?: RouteContribution[]): LoadedKit {
+  return {
+    packageName: `@test/${id}`,
+    id,
+    version: '0.0.0',
+    kit: { tools, ...(pages ? { pages } : {}), ...(routes ? { routes } : {}) },
+  };
+}
+
+/** Build a mock InstrumentariumApi from a flat list of ToolDefinitions. */
+function createMockInstrumentarium(tools: ToolDefinition[]): InstrumentariumApi {
+  const resolved: ResolvedTool[] = tools.map((def) => ({ definition: def, pluginId: 'test' }));
+  return {
+    list: () => resolved,
+    find: (name: string) => resolved.find((t) => t.definition.name === name) ?? null,
+    resolve: () => resolved,
+  };
+}
+
+function wireGuild(opts: {
+  home: string;
+  kits?: LoadedKit[];
+  apparatuses?: LoadedApparatus[];
+  instrumentarium: InstrumentariumApi;
+  guildName?: string;
+  oculusPort?: number;
+}): void {
+  const kits = opts.kits ?? [];
+  const apparatuses = opts.apparatuses ?? [];
+  const oculusPort = opts.oculusPort;
+
+  const mockGuild: Guild = {
+    home: opts.home,
+    apparatus<T>(name: string): T {
+      if (name === 'tools') return opts.instrumentarium as T;
+      throw new Error(`apparatus not found: ${name}`);
+    },
+    config<T>(_pluginId: string): T {
+      return {} as T;
+    },
+    writeConfig() {},
+    guildConfig() {
+      return {
+        name: opts.guildName ?? 'test-guild',
+        nexus: '0.0.0',
+        plugins: [],
+        ...(oculusPort !== undefined ? { oculus: { port: oculusPort } } : {}),
+      };
+    },
+    kits() { return [...kits]; },
+    apparatuses() { return [...apparatuses]; },
+    failedPlugins() { return []; },
+  };
+  setGuild(mockGuild);
+}
+
+// ── Unit tests: toolNameToRoute ───────────────────────────────────────
+
+describe('toolNameToRoute', () => {
+  it("'writ-list' → '/api/writ/list'", () => {
+    assert.equal(toolNameToRoute('writ-list'), '/api/writ/list');
+  });
+
+  it("'commission-post' → '/api/commission/post'", () => {
+    assert.equal(toolNameToRoute('commission-post'), '/api/commission/post');
+  });
+
+  it("'rig-for-writ' → '/api/rig/for-writ'", () => {
+    assert.equal(toolNameToRoute('rig-for-writ'), '/api/rig/for-writ');
+  });
+
+  it("'signal' → '/api/signal'", () => {
+    assert.equal(toolNameToRoute('signal'), '/api/signal');
+  });
+
+  it("'tools-list' → '/api/tools/list'", () => {
+    assert.equal(toolNameToRoute('tools-list'), '/api/tools/list');
+  });
+});
+
+// ── Unit tests: permissionToMethod ───────────────────────────────────
+
+describe('permissionToMethod', () => {
+  it("undefined → 'GET'", () => {
+    assert.equal(permissionToMethod(undefined), 'GET');
+  });
+
+  it("'read' → 'GET'", () => {
+    assert.equal(permissionToMethod('read'), 'GET');
+  });
+
+  it("'write' → 'POST'", () => {
+    assert.equal(permissionToMethod('write'), 'POST');
+  });
+
+  it("'admin' → 'POST'", () => {
+    assert.equal(permissionToMethod('admin'), 'POST');
+  });
+
+  it("'delete' → 'DELETE'", () => {
+    assert.equal(permissionToMethod('delete'), 'DELETE');
+  });
+
+  it("'clerk:read' → 'GET'", () => {
+    assert.equal(permissionToMethod('clerk:read'), 'GET');
+  });
+
+  it("'clerk:write' → 'POST'", () => {
+    assert.equal(permissionToMethod('clerk:write'), 'POST');
+  });
+
+  it("'spider:write' → 'POST'", () => {
+    assert.equal(permissionToMethod('spider:write'), 'POST');
+  });
+
+  it("'animate' → 'POST' (unknown level)", () => {
+    assert.equal(permissionToMethod('animate'), 'POST');
+  });
+});
+
+// ── Unit tests: coerceParams ──────────────────────────────────────────
+
+describe('coerceParams', () => {
+  it('coerces number strings to numbers', () => {
+    const shape = { limit: z.number() };
+    const result = coerceParams(shape, { limit: '5' });
+    assert.equal(result.limit, 5);
+    assert.equal(typeof result.limit, 'number');
+  });
+
+  it("coerces 'true' to boolean true", () => {
+    const shape = { verbose: z.boolean() };
+    const result = coerceParams(shape, { verbose: 'true' });
+    assert.equal(result.verbose, true);
+    assert.equal(typeof result.verbose, 'boolean');
+  });
+
+  it("coerces 'false' to boolean false", () => {
+    const shape = { verbose: z.boolean() };
+    const result = coerceParams(shape, { verbose: 'false' });
+    assert.equal(result.verbose, false);
+  });
+
+  it('leaves string values untouched', () => {
+    const shape = { name: z.string() };
+    const result = coerceParams(shape, { name: 'hello' });
+    assert.equal(result.name, 'hello');
+  });
+
+  it('unwraps optional number schema', () => {
+    const shape = { limit: z.number().optional() };
+    const result = coerceParams(shape, { limit: '5' });
+    assert.equal(result.limit, 5);
+  });
+
+  it('unwraps optional boolean schema', () => {
+    const shape = { flag: z.boolean().optional() };
+    const result = coerceParams(shape, { flag: 'true' });
+    assert.equal(result.flag, true);
+  });
+});
+
+// ── Unit tests: injectChrome ──────────────────────────────────────────
+
+describe('injectChrome', () => {
+  it('injects stylesheet link before </head> and nav after <body>', () => {
+    const html = '<html><head><title>Test</title></head><body><p>Hi</p></body></html>';
+    const result = injectChrome(html, '/static/style.css', '<nav>NAV</nav>');
+    assert.ok(result.includes('<link rel="stylesheet" href="/static/style.css">'));
+    assert.ok(result.includes('<nav>NAV</nav>'));
+    // stylesheet should come before </head>
+    const stylesheetIdx = result.indexOf('<link rel="stylesheet"');
+    const headCloseIdx = result.indexOf('</head>');
+    assert.ok(stylesheetIdx < headCloseIdx);
+    // nav should come after <body>
+    const navIdx = result.indexOf('<nav>NAV</nav>');
+    const bodyIdx = result.indexOf('<body>');
+    assert.ok(navIdx > bodyIdx);
+  });
+
+  it('works case-insensitively and handles body attributes', () => {
+    const html = '<html><HEAD><TITLE>Test</TITLE></HEAD><BODY class="main"><p>Hi</p></BODY></html>';
+    const result = injectChrome(html, '/static/style.css', '<nav>NAV</nav>');
+    assert.ok(result.includes('<link rel="stylesheet"'));
+    assert.ok(result.includes('<nav>NAV</nav>'));
+    // nav should appear after the <BODY class="main"> tag
+    const navIdx = result.indexOf('<nav>NAV</nav>');
+    const bodyCloseIdx = result.indexOf('<BODY class="main">') + '<BODY class="main">'.length;
+    assert.ok(navIdx >= bodyCloseIdx);
+  });
+
+  it('returns unmodified when neither <head> nor <body> present', () => {
+    const html = '<p>No head or body tags</p>';
+    const result = injectChrome(html, '/static/style.css', '<nav>NAV</nav>');
+    assert.equal(result, html);
+  });
+
+  it('injects both when head and body are empty', () => {
+    const html = '<html><head></head><body></body></html>';
+    const result = injectChrome(html, '/static/style.css', '<nav>NAV</nav>');
+    assert.ok(result.includes('<link rel="stylesheet"'));
+    assert.ok(result.includes('<nav>NAV</nav>'));
+  });
+});
+
+// ── Integration tests: server lifecycle ──────────────────────────────
+
+describe('Oculus server lifecycle', () => {
+  afterEach(() => {
+    clearGuild();
+    cleanupTmpDir();
+  });
+
+  it('starts and stops cleanly', async () => {
+    const home = makeTmpDir();
+    const instrumentarium = createMockInstrumentarium([]);
+    const port = 17470 + Math.floor(Math.random() * 100);
+
+    wireGuild({ home, kits: [], instrumentarium, oculusPort: port });
+
+    const plugin = createOculus();
+    assert.ok('apparatus' in plugin);
+
+    const { ctx } = buildTestContext();
+
+    if ('apparatus' in plugin) {
+      await plugin.apparatus.start(ctx);
+    }
+
+    try {
+      // Server should be listening
+      const res = await fetch(`http://localhost:${port}/`);
+      assert.ok(res.status > 0);
+
+      // api.port() should return the port
+      const api = plugin.apparatus.provides as { port(): number };
+      assert.equal(api.port(), port);
+    } finally {
+      if ('apparatus' in plugin) {
+        await plugin.apparatus.stop?.();
+      }
+    }
+  });
+});
+
+// ── Integration tests: page serving ──────────────────────────────────
+
+describe('Oculus page serving', () => {
+  let port: number;
+  let oculusPlugin: ReturnType<typeof createOculus>;
+  let guildHome: string;
+
+  before(async () => {
+    guildHome = makeTmpDir();
+    port = 17570 + Math.floor(Math.random() * 100);
+
+    // Create the fake node_modules structure
+    const nmPageDir = path.join(guildHome, 'node_modules', '@test', 'my-kit', 'pages', 'my-page');
+    fs.mkdirSync(nmPageDir, { recursive: true });
+    fs.writeFileSync(
+      path.join(nmPageDir, 'index.html'),
+      '<html><head><title>My Page</title></head><body><p>Content</p></body></html>',
+    );
+    fs.writeFileSync(path.join(nmPageDir, 'app.js'), 'console.log("hello");');
+
+    const pages: PageContribution[] = [
+      { id: 'my-page', title: 'My Page', dir: 'pages/my-page' },
+    ];
+
+    const kits: LoadedKit[] = [mockKit('my-kit', [], pages)];
+    const instrumentarium = createMockInstrumentarium([]);
+    wireGuild({ home: guildHome, kits, instrumentarium, oculusPort: port });
+
+    oculusPlugin = createOculus();
+    const { ctx } = buildTestContext();
+    if ('apparatus' in oculusPlugin) {
+      await oculusPlugin.apparatus.start(ctx);
+    }
+  });
+
+  after(async () => {
+    if (oculusPlugin && 'apparatus' in oculusPlugin) {
+      await oculusPlugin.apparatus.stop?.();
+    }
+    clearGuild();
+    cleanupTmpDir();
+  });
+
+  it('serves index.html with chrome injection', async () => {
+    const res = await fetch(`http://localhost:${port}/pages/my-page/`);
+    assert.equal(res.status, 200);
+    const text = await res.text();
+    assert.ok(text.includes('<link rel="stylesheet" href="/static/style.css">'));
+    assert.ok(text.includes('<nav id="oculus-nav">'));
+    assert.ok(text.includes('<a href="/">Guild</a>'));
+    assert.ok(text.includes('/pages/my-page/'));
+  });
+
+  it('serves index.html at explicit /index.html path with injection', async () => {
+    const res = await fetch(`http://localhost:${port}/pages/my-page/index.html`);
+    assert.equal(res.status, 200);
+    const text = await res.text();
+    assert.ok(text.includes('<link rel="stylesheet" href="/static/style.css">'));
+    assert.ok(text.includes('<nav id="oculus-nav">'));
+  });
+
+  it('serves non-index files without injection', async () => {
+    const res = await fetch(`http://localhost:${port}/pages/my-page/app.js`);
+    assert.equal(res.status, 200);
+    const text = await res.text();
+    assert.ok(!text.includes('<link rel="stylesheet"'));
+    assert.ok(!text.includes('<nav id="oculus-nav">'));
+  });
+
+  it('returns 404 for nonexistent page', async () => {
+    const res = await fetch(`http://localhost:${port}/pages/nonexistent/`);
+    assert.equal(res.status, 404);
+  });
+
+  it('rejects directory traversal attempts', async () => {
+    const res = await fetch(`http://localhost:${port}/pages/my-page/../../../etc/passwd`);
+    assert.ok(res.status === 404 || res.status === 400);
+  });
+});
+
+// ── Integration tests: static assets ─────────────────────────────────
+
+describe('Oculus static assets', () => {
+  let port: number;
+  let oculusPlugin: ReturnType<typeof createOculus>;
+
+  before(async () => {
+    const home = makeTmpDir();
+    port = 17680 + Math.floor(Math.random() * 100);
+    const instrumentarium = createMockInstrumentarium([]);
+    wireGuild({ home, instrumentarium, oculusPort: port });
+
+    oculusPlugin = createOculus();
+    const { ctx } = buildTestContext();
+    if ('apparatus' in oculusPlugin) {
+      await oculusPlugin.apparatus.start(ctx);
+    }
+  });
+
+  after(async () => {
+    if (oculusPlugin && 'apparatus' in oculusPlugin) {
+      await oculusPlugin.apparatus.stop?.();
+    }
+    clearGuild();
+    cleanupTmpDir();
+  });
+
+  it('serves /static/style.css', async () => {
+    const res = await fetch(`http://localhost:${port}/static/style.css`);
+    assert.equal(res.status, 200);
+    const text = await res.text();
+    assert.ok(text.includes('--bg: #1a1b26'));
+    assert.ok(text.includes('.card'));
+    assert.ok(text.includes('.badge'));
+    assert.ok(text.includes('.badge--success'));
+    assert.ok(text.includes('#oculus-nav'));
+    assert.ok(text.includes('monospace'));
+  });
+});
+
+// ── Integration tests: home page ──────────────────────────────────────
+
+describe('Oculus home page', () => {
+  let port: number;
+  let oculusPlugin: ReturnType<typeof createOculus>;
+
+  before(async () => {
+    const home = makeTmpDir();
+    port = 17790 + Math.floor(Math.random() * 100);
+
+    const pages: PageContribution[] = [
+      { id: 'dash', title: 'Dashboard', dir: 'pages/dash' },
+    ];
+    const kits: LoadedKit[] = [mockKit('my-kit', [], pages)];
+    const instrumentarium = createMockInstrumentarium([]);
+
+    // Create minimal node_modules structure for the page
+    const nmDir = path.join(home, 'node_modules', '@test', 'my-kit', 'pages', 'dash');
+    fs.mkdirSync(nmDir, { recursive: true });
+    fs.writeFileSync(path.join(nmDir, 'index.html'), '<html><head></head><body>Dash</body></html>');
+
+    wireGuild({ home, kits, instrumentarium, guildName: 'my-guild', oculusPort: port });
+
+    oculusPlugin = createOculus();
+    const { ctx } = buildTestContext();
+    if ('apparatus' in oculusPlugin) {
+      await oculusPlugin.apparatus.start(ctx);
+    }
+  });
+
+  after(async () => {
+    if (oculusPlugin && 'apparatus' in oculusPlugin) {
+      await oculusPlugin.apparatus.stop?.();
+    }
+    clearGuild();
+    cleanupTmpDir();
+  });
+
+  it('returns HTML with guild name and page links', async () => {
+    const res = await fetch(`http://localhost:${port}/`);
+    assert.equal(res.status, 200);
+    const text = await res.text();
+    assert.ok(text.includes('my-guild'));
+    assert.ok(text.includes('/pages/dash/'));
+    assert.ok(text.includes('/static/style.css'));
+    assert.ok(text.includes('<nav id="oculus-nav">'));
+  });
+});
+
+// ── Integration tests: tool routes ────────────────────────────────────
+
+describe('Oculus tool routes', () => {
+  let port: number;
+  let oculusPlugin: ReturnType<typeof createOculus>;
+
+  before(async () => {
+    const home = makeTmpDir();
+    port = 17890 + Math.floor(Math.random() * 100);
+
+    const tools = [
+      tool({
+        name: 'writ-list',
+        description: 'List writs',
+        permission: 'read',
+        params: { limit: z.number().optional(), offset: z.number().optional() },
+        handler: async (p) => ({ items: [], limit: p.limit, offset: p.offset }),
+      }),
+      tool({
+        name: 'commission-post',
+        description: 'Post commission',
+        permission: 'clerk:write',
+        params: { title: z.string() },
+        handler: async (p) => ({ created: true, title: p.title }),
+      }),
+      tool({
+        name: 'codex-remove',
+        description: 'Remove codex',
+        permission: 'delete',
+        params: { id: z.string() },
+        handler: async (p) => ({ deleted: p.id }),
+      }),
+      tool({
+        name: 'signal',
+        description: 'Send signal',
+        params: { message: z.string().optional() },
+        handler: async () => ({ ok: true }),
+      }),
+      tool({
+        name: 'anima-only-tool',
+        description: 'Anima only',
+        callableBy: ['anima'],
+        params: {},
+        handler: async () => ({}),
+      }),
+    ];
+
+    const instrumentarium = createMockInstrumentarium(tools);
+    wireGuild({ home, kits: [], instrumentarium, oculusPort: port });
+
+    oculusPlugin = createOculus();
+    const { ctx } = buildTestContext();
+    if ('apparatus' in oculusPlugin) {
+      await oculusPlugin.apparatus.start(ctx);
+    }
+  });
+
+  after(async () => {
+    if (oculusPlugin && 'apparatus' in oculusPlugin) {
+      await oculusPlugin.apparatus.stop?.();
+    }
+    clearGuild();
+    cleanupTmpDir();
+  });
+
+  it('GET /api/writ/list is registered (read → GET)', async () => {
+    const res = await fetch(`http://localhost:${port}/api/writ/list`);
+    assert.equal(res.status, 200);
+  });
+
+  it('POST /api/commission/post is registered (clerk:write → POST)', async () => {
+    const res = await fetch(`http://localhost:${port}/api/commission/post`, {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ title: 'test' }),
+    });
+    assert.equal(res.status, 200);
+  });
+
+  it('DELETE /api/codex/remove is registered (delete → DELETE)', async () => {
+    const res = await fetch(`http://localhost:${port}/api/codex/remove`, {
+      method: 'DELETE',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ id: '123' }),
+    });
+    assert.equal(res.status, 200);
+  });
+
+  it('GET /api/signal is registered (no permission → GET)', async () => {
+    const res = await fetch(`http://localhost:${port}/api/signal`);
+    assert.equal(res.status, 200);
+  });
+
+  it('anima-only tool has no route', async () => {
+    // anima-only-tool → /api/anima/only-tool — not registered
+    const res = await fetch(`http://localhost:${port}/api/anima/only-tool`);
+    assert.ok(res.status === 404 || res.status === 405);
+  });
+
+  it('query params are coerced to numbers', async () => {
+    const res = await fetch(`http://localhost:${port}/api/writ/list?limit=5&offset=0`);
+    assert.equal(res.status, 200);
+    const data = await res.json() as { limit: number; offset: number };
+    assert.equal(data.limit, 5);
+    assert.equal(data.offset, 0);
+    assert.equal(typeof data.limit, 'number');
+  });
+
+  it('returns 400 on Zod validation failure', async () => {
+    const res = await fetch(`http://localhost:${port}/api/commission/post`, {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ wrong_field: 'x' }), // missing required 'title'
+    });
+    assert.equal(res.status, 400);
+    const data = await res.json() as { error: string; details: unknown };
+    assert.ok(typeof data.error === 'string');
+    assert.ok('details' in data);
+  });
+
+  it('returns 200 on successful optional-params GET', async () => {
+    const res = await fetch(`http://localhost:${port}/api/writ/list`);
+    assert.equal(res.status, 200);
+  });
+});
+
+// ── Integration tests: /api/_tools ───────────────────────────────────
+
+describe('Oculus /api/_tools', () => {
+  let port: number;
+  let oculusPlugin: ReturnType<typeof createOculus>;
+
+  before(async () => {
+    const home = makeTmpDir();
+    port = 17990 + Math.floor(Math.random() * 100);
+
+    const tools = [
+      tool({
+        name: 'writ-list',
+        description: 'List writs',
+        permission: 'read',
+        params: {
+          limit: z.number().optional().describe('Max results'),
+          status: z.enum(['open', 'closed']).optional(),
+        },
+        handler: async () => ({ items: [] }),
+      }),
+    ];
+
+    const instrumentarium = createMockInstrumentarium(tools);
+    wireGuild({ home, kits: [], instrumentarium, oculusPort: port });
+
+    oculusPlugin = createOculus();
+    const { ctx } = buildTestContext();
+    if ('apparatus' in oculusPlugin) {
+      await oculusPlugin.apparatus.start(ctx);
+    }
+  });
+
+  after(async () => {
+    if (oculusPlugin && 'apparatus' in oculusPlugin) {
+      await oculusPlugin.apparatus.stop?.();
+    }
+    clearGuild();
+    cleanupTmpDir();
+  });
+
+  it('returns JSON array of tool entries', async () => {
+    const res = await fetch(`http://localhost:${port}/api/_tools`);
+    assert.equal(res.status, 200);
+    const data = await res.json() as unknown[];
+    assert.ok(Array.isArray(data));
+  });
+
+  it('each entry has name, route, method, description, params', async () => {
+    const res = await fetch(`http://localhost:${port}/api/_tools`);
+    const data = await res.json() as Array<Record<string, unknown>>;
+    // Find writ-list entry
+    const entry = data.find((e) => e.name === 'writ-list');
+    assert.ok(entry, 'writ-list should be in _tools');
+    assert.equal(entry.route, '/api/writ/list');
+    assert.equal(entry.method, 'GET');
+    assert.equal(entry.description, 'List writs');
+    assert.ok(typeof entry.params === 'object' && entry.params !== null);
+    const params = entry.params as Record<string, { type: string; description: string | null; optional: boolean }>;
+    assert.ok('limit' in params);
+    assert.equal(params.limit.type, 'number');
+    assert.equal(params.limit.optional, true);
+  });
+});
+
+// ── Integration tests: custom routes ─────────────────────────────────
+
+describe('Oculus custom routes', () => {
+  let port: number;
+  let oculusPlugin: ReturnType<typeof createOculus>;
+
+  before(async () => {
+    const home = makeTmpDir();
+    port = 18090 + Math.floor(Math.random() * 100);
+
+    const routes: RouteContribution[] = [
+      {
+        method: 'GET',
+        path: '/api/custom/stream',
+        handler: (c: import('hono').Context) => c.json({ custom: true }),
+      },
+    ];
+
+    const kits: LoadedKit[] = [mockKit('my-kit', [], undefined, routes)];
+    const instrumentarium = createMockInstrumentarium([]);
+    wireGuild({ home, kits, instrumentarium, oculusPort: port });
+
+    oculusPlugin = createOculus();
+    const { ctx } = buildTestContext();
+    if ('apparatus' in oculusPlugin) {
+      await oculusPlugin.apparatus.start(ctx);
+    }
+  });
+
+  after(async () => {
+    if (oculusPlugin && 'apparatus' in oculusPlugin) {
+      await oculusPlugin.apparatus.stop?.();
+    }
+    clearGuild();
+    cleanupTmpDir();
+  });
+
+  it('custom route at /api/custom/stream is accessible', async () => {
+    const res = await fetch(`http://localhost:${port}/api/custom/stream`);
+    assert.equal(res.status, 200);
+    const data = await res.json() as { custom: boolean };
+    assert.equal(data.custom, true);
+  });
+});
+
+describe('Oculus invalid custom routes', () => {
+  it('rejects custom route not starting with /api/', async () => {
+    const home = makeTmpDir();
+    const port = 18190 + Math.floor(Math.random() * 100);
+
+    const routes: RouteContribution[] = [
+      {
+        method: 'GET',
+        path: '/not-api/foo',
+        handler: (c: import('hono').Context) => c.json({ bad: true }),
+      },
+    ];
+
+    const kits: LoadedKit[] = [mockKit('my-kit', [], undefined, routes)];
+    const instrumentarium = createMockInstrumentarium([]);
+    wireGuild({ home, kits, instrumentarium, oculusPort: port });
+
+    const plugin = createOculus();
+    const { ctx } = buildTestContext();
+    if ('apparatus' in plugin) {
+      await plugin.apparatus.start(ctx);
+    }
+
+    try {
+      // /not-api/foo should NOT be accessible (not registered)
+      const res = await fetch(`http://localhost:${port}/not-api/foo`);
+      assert.ok(res.status === 404, `Expected 404, got ${res.status}`);
+    } finally {
+      if ('apparatus' in plugin) {
+        await plugin.apparatus.stop?.();
+      }
+      clearGuild();
+      cleanupTmpDir();
+    }
+  });
+});
diff --git a/packages/plugins/oculus/src/oculus.ts b/packages/plugins/oculus/src/oculus.ts
new file mode 100644
index 0000000..960ca37
--- /dev/null
+++ b/packages/plugins/oculus/src/oculus.ts
@@ -0,0 +1,537 @@
+/**
+ * The Oculus — web dashboard apparatus.
+ *
+ * Serves a web dashboard via Hono. Plugins contribute pages as static asset
+ * directories and custom API routes through kit contributions. Guild tools are
+ * automatically exposed as REST endpoints.
+ */
+
+import fs from 'node:fs';
+import path from 'node:path';
+import { Hono } from 'hono';
+import { serve } from '@hono/node-server';
+import type { Server } from 'node:http';
+import { z } from 'zod';
+
+import type { Plugin, StartupContext, LoadedKit, LoadedApparatus } from '@shardworks/nexus-core';
+import { guild } from '@shardworks/nexus-core';
+import type { InstrumentariumApi } from '@shardworks/tools-apparatus';
+
+import type { OculusApi, OculusConfig, OculusKit, PageContribution, RouteContribution } from './types.ts';
+
+// ── MIME types ────────────────────────────────────────────────────────
+
+const MIME_TYPES: Record<string, string> = {
+  '.html': 'text/html; charset=utf-8',
+  '.css': 'text/css; charset=utf-8',
+  '.js': 'application/javascript; charset=utf-8',
+  '.mjs': 'application/javascript; charset=utf-8',
+  '.json': 'application/json; charset=utf-8',
+  '.png': 'image/png',
+  '.jpg': 'image/jpeg',
+  '.jpeg': 'image/jpeg',
+  '.gif': 'image/gif',
+  '.svg': 'image/svg+xml',
+  '.ico': 'image/x-icon',
+  '.woff': 'font/woff',
+  '.woff2': 'font/woff2',
+  '.ttf': 'font/ttf',
+  '.map': 'application/json',
+};
+
+function getMimeType(filePath: string): string {
+  const ext = path.extname(filePath).toLowerCase();
+  return MIME_TYPES[ext] ?? 'application/octet-stream';
+}
+
+// ── Tool→REST mapping helpers ─────────────────────────────────────────
+
+export function toolNameToRoute(name: string): string {
+  const idx = name.indexOf('-');
+  if (idx === -1) return `/api/${name}`;
+  return `/api/${name.slice(0, idx)}/${name.slice(idx + 1)}`;
+}
+
+export function permissionToMethod(permission: string | undefined): 'GET' | 'POST' | 'DELETE' {
+  if (permission === undefined) return 'GET';
+  const level = permission.includes(':')
+    ? permission.slice(permission.lastIndexOf(':') + 1)
+    : permission;
+  if (level === 'read') return 'GET';
+  if (level === 'write' || level === 'admin') return 'POST';
+  if (level === 'delete') return 'DELETE';
+  return 'POST';
+}
+
+// ── Query param coercion ──────────────────────────────────────────────
+
+function isNumberSchema(schema: z.ZodTypeAny): boolean {
+  let inner: z.ZodTypeAny = schema;
+  if (inner instanceof z.ZodOptional) inner = inner.unwrap() as z.ZodTypeAny;
+  if (inner instanceof z.ZodDefault) inner = inner.unwrap() as z.ZodTypeAny;
+  if (inner instanceof z.ZodOptional) inner = inner.unwrap() as z.ZodTypeAny;
+  return inner instanceof z.ZodNumber;
+}
+
+function isBooleanSchema(schema: z.ZodTypeAny): boolean {
+  let inner: z.ZodTypeAny = schema;
+  if (inner instanceof z.ZodOptional) inner = inner.unwrap() as z.ZodTypeAny;
+  if (inner instanceof z.ZodDefault) inner = inner.unwrap() as z.ZodTypeAny;
+  if (inner instanceof z.ZodOptional) inner = inner.unwrap() as z.ZodTypeAny;
+  return inner instanceof z.ZodBoolean;
+}
+
+export function coerceParams(
+  shape: Record<string, z.ZodTypeAny>,
+  params: Record<string, string>,
+): Record<string, unknown> {
+  const result: Record<string, unknown> = { ...params };
+  for (const [key, schema] of Object.entries(shape)) {
+    const value = result[key];
+    if (typeof value !== 'string') continue;
+    if (isNumberSchema(schema)) {
+      result[key] = Number(value);
+    } else if (isBooleanSchema(schema)) {
+      result[key] = value === 'true';
+    }
+  }
+  return result;
+}
+
+// ── Chrome injection ─────────────────────────────────────────────────
+
+export function injectChrome(html: string, stylesheetPath: string, navHtml: string): string {
+  // Check for </head> case-insensitively
+  const headCloseMatch = html.match(/<\/head>/i);
+  const bodyOpenMatch = html.match(/<body[^>]*>/i);
+
+  // If neither tag present, return unmodified
+  if (!headCloseMatch && !bodyOpenMatch) return html;
+
+  let result = html;
+
+  // Insert stylesheet link before </head>
+  if (headCloseMatch && headCloseMatch.index !== undefined) {
+    const idx = headCloseMatch.index;
+    result =
+      result.slice(0, idx) +
+      `<link rel="stylesheet" href="${stylesheetPath}">` +
+      result.slice(idx);
+  }
+
+  // Insert nav after <body...>
+  // Need to recalculate position after potential head insertion
+  const bodyMatch = result.match(/<body[^>]*>/i);
+  if (bodyMatch && bodyMatch.index !== undefined) {
+    const idx = bodyMatch.index + bodyMatch[0].length;
+    result = result.slice(0, idx) + navHtml + result.slice(idx);
+  }
+
+  return result;
+}
+
+function buildNavHtml(pages: PageContribution[]): string {
+  const pageLinks = pages
+    .map((p) => `<a href="/pages/${p.id}/">${p.title}</a>`)
+    .join('\n  ');
+  return `<nav id="oculus-nav">
+  <a href="/">Guild</a>
+  ${pageLinks}
+</nav>`;
+}
+
+// ── Tool param extraction (reimplemented from tools-show) ────────────
+
+interface ParamInfo {
+  type: string;
+  description: string | null;
+  optional: boolean;
+}
+
+function zodTypeToJsonType(zodType: z.ZodType): string {
+  if (zodType instanceof z.ZodString) return 'string';
+  if (zodType instanceof z.ZodNumber) return 'number';
+  if (zodType instanceof z.ZodBoolean) return 'boolean';
+  if (zodType instanceof z.ZodArray) return 'array';
+  if (zodType instanceof z.ZodObject) return 'object';
+  if (zodType instanceof z.ZodEnum) return 'string';
+  if (zodType instanceof z.ZodLiteral) return typeof zodType._def.values[0];
+  if (zodType instanceof z.ZodUnion) return 'union';
+  if (zodType instanceof z.ZodNullable) return zodTypeToJsonType(zodType.unwrap() as z.ZodType);
+  return 'unknown';
+}
+
+function extractSingleParam(zodType: z.ZodType): ParamInfo {
+  let isOptional = false;
+  let inner: z.ZodType = zodType;
+
+  if (inner instanceof z.ZodOptional) {
+    isOptional = true;
+    inner = inner.unwrap() as z.ZodType;
+  }
+  if (inner instanceof z.ZodDefault) {
+    isOptional = true;
+    inner = inner.unwrap() as z.ZodType;
+  }
+
+  return {
+    type: zodTypeToJsonType(inner),
+    description: inner.description ?? null,
+    optional: isOptional,
+  };
+}
+
+function extractParams(schema: z.ZodObject<z.ZodRawShape>): Record<string, ParamInfo> {
+  const shape = schema.shape;
+  const result: Record<string, ParamInfo> = {};
+  for (const [key, zodType] of Object.entries(shape)) {
+    result[key] = extractSingleParam(zodType as z.ZodType);
+  }
+  return result;
+}
+
+// ── Apparatus factory ─────────────────────────────────────────────────
+
+export function createOculus(): Plugin {
+  let serverPort = 7470;
+  let server: Server | null = null;
+
+  const api: OculusApi = {
+    port(): number {
+      return serverPort;
+    },
+  };
+
+  return {
+    apparatus: {
+      requires: ['tools'],
+      consumes: ['pages', 'routes'],
+      provides: api,
+
+      async start(ctx: StartupContext): Promise<void> {
+        const g = guild();
+        const oculusConfig: OculusConfig = g.guildConfig().oculus ?? {};
+        const port = oculusConfig.port ?? 7470;
+
+        const app = new Hono();
+
+        // Track registered pages and custom route paths
+        const pages: PageContribution[] = [];
+        const customRoutePaths = new Set<string>();
+        const mappedToolRoutes = new Set<string>();
+
+        // ── Custom route registration helper ─────────────────────────
+        function registerCustomRoute(route: RouteContribution, pluginId: string): void {
+          if (!route.path.startsWith('/api/')) {
+            console.warn(`[oculus] Custom route "${route.path}" from "${pluginId}" must start with /api/ — skipped`);
+            return;
+          }
+          const method = route.method.toLowerCase() as keyof typeof app;
+          (app[method] as (path: string, handler: (c: unknown) => unknown) => void)(
+            route.path,
+            route.handler as (c: unknown) => unknown,
+          );
+          customRoutePaths.add(route.path);
+        }
+
+        // ── Page serving helper ───────────────────────────────────────
+        function resolveDirForPackage(packageName: string, dir: string): string {
+          return path.join(g.home, 'node_modules', packageName, dir);
+        }
+
+        function registerPage(page: PageContribution, resolvedDir: string): void {
+          pages.push({ ...page });
+
+          app.get(`/pages/${page.id}/*`, async (c) => {
+            const requestPath = c.req.path;
+            const prefix = `/pages/${page.id}/`;
+            const filePath = requestPath.slice(prefix.length) || 'index.html';
+
+            // Prevent directory traversal
+            if (filePath.includes('..')) {
+              return c.text('Not found', 404);
+            }
+
+            const absolutePath = path.join(resolvedDir, filePath);
+
+            // Ensure file is within resolved dir
+            if (!absolutePath.startsWith(resolvedDir)) {
+              return c.text('Not found', 404);
+            }
+
+            try {
+              const content = fs.readFileSync(absolutePath);
+              const mimeType = getMimeType(absolutePath);
+
+              // Only inject chrome for the root index.html
+              const isIndexHtml = filePath === 'index.html' || filePath === '';
+              if (isIndexHtml && mimeType.startsWith('text/html')) {
+                const html = content.toString('utf-8');
+                const navHtml = buildNavHtml(pages);
+                const injected = injectChrome(html, '/static/style.css', navHtml);
+                return new Response(injected, {
+                  headers: { 'Content-Type': 'text/html; charset=utf-8' },
+                });
+              }
+
+              return new Response(content, {
+                headers: { 'Content-Type': mimeType },
+              });
+            } catch {
+              return c.text('Not found', 404);
+            }
+          });
+        }
+
+        // ── Tool route registration helper ───────────────────────────
+        function registerToolRoute(
+          toolDef: import('@shardworks/tools-apparatus').ToolDefinition,
+          instrumentarium: InstrumentariumApi,
+        ): void {
+          const routePath = toolNameToRoute(toolDef.name);
+          const method = permissionToMethod(toolDef.permission);
+
+          if (mappedToolRoutes.has(routePath)) return;
+
+          if (customRoutePaths.has(routePath)) {
+            console.warn(
+              `[oculus] Tool route ${method} ${routePath} conflicts with custom route from plugin — skipped`,
+            );
+            return;
+          }
+
+          void instrumentarium; // suppress unused warning
+
+          const shape = toolDef.params.shape as Record<string, z.ZodTypeAny>;
+
+          if (method === 'GET') {
+            app.get(routePath, async (c) => {
+              try {
+                const rawQuery = c.req.query();
+                const coerced = coerceParams(shape, rawQuery);
+                const validated = toolDef.params.parse(coerced);
+                const result = await toolDef.handler(validated);
+                return c.json(result);
+              } catch (err) {
+                if (err instanceof z.ZodError) {
+                  return c.json({ error: err.message, details: err.issues }, 400);
+                }
+                const message = err instanceof Error ? err.message : String(err);
+                return c.json({ error: message }, 500);
+              }
+            });
+          } else if (method === 'DELETE') {
+            app.delete(routePath, async (c) => {
+              try {
+                const body = await c.req.json();
+                const validated = toolDef.params.parse(body);
+                const result = await toolDef.handler(validated);
+                return c.json(result);
+              } catch (err) {
+                if (err instanceof z.ZodError) {
+                  return c.json({ error: err.message, details: err.issues }, 400);
+                }
+                const message = err instanceof Error ? err.message : String(err);
+                return c.json({ error: message }, 500);
+              }
+            });
+          } else {
+            app.post(routePath, async (c) => {
+              try {
+                const body = await c.req.json();
+                const validated = toolDef.params.parse(body);
+                const result = await toolDef.handler(validated);
+                return c.json(result);
+              } catch (err) {
+                if (err instanceof z.ZodError) {
+                  return c.json({ error: err.message, details: err.issues }, 400);
+                }
+                const message = err instanceof Error ? err.message : String(err);
+                return c.json({ error: message }, 500);
+              }
+            });
+          }
+
+          mappedToolRoutes.add(routePath);
+        }
+
+        // ── Scan contributions from a kit ────────────────────────────
+        function scanKit(kit: LoadedKit): void {
+          const oculusKit = kit.kit as OculusKit;
+
+          if (oculusKit.routes) {
+            for (const route of oculusKit.routes) {
+              registerCustomRoute(route, kit.id);
+            }
+          }
+
+          if (oculusKit.pages) {
+            for (const page of oculusKit.pages) {
+              const resolvedDir = resolveDirForPackage(kit.packageName, page.dir);
+              registerPage(page, resolvedDir);
+            }
+          }
+        }
+
+        function scanApparatus(apparatus: LoadedApparatus): void {
+          if (!apparatus.apparatus.supportKit) return;
+          const oculusKit = apparatus.apparatus.supportKit as OculusKit;
+
+          if (oculusKit.routes) {
+            for (const route of oculusKit.routes) {
+              registerCustomRoute(route, apparatus.id);
+            }
+          }
+
+          if (oculusKit.pages) {
+            for (const page of oculusKit.pages) {
+              const resolvedDir = resolveDirForPackage(apparatus.packageName, page.dir);
+              registerPage(page, resolvedDir);
+            }
+          }
+        }
+
+        // ── Scan existing kits and apparatuses ───────────────────────
+        for (const kit of g.kits()) {
+          scanKit(kit);
+        }
+        for (const apparatus of g.apparatuses()) {
+          scanApparatus(apparatus);
+        }
+
+        // ── Register custom routes first ─────────────────────────────
+        // (already done in scanKit/scanApparatus above)
+
+        // ── Register tool routes ─────────────────────────────────────
+        const instrumentarium = g.apparatus<InstrumentariumApi>('tools');
+        const allTools = instrumentarium.list();
+        const patronTools = allTools.filter(
+          (r) => !r.definition.callableBy || r.definition.callableBy.includes('patron'),
+        );
+
+        for (const resolved of patronTools) {
+          registerToolRoute(resolved.definition, instrumentarium);
+        }
+
+        // ── GET /api/_tools ──────────────────────────────────────────
+        app.get('/api/_tools', (c) => {
+          const tools = instrumentarium.list().filter(
+            (r) => !r.definition.callableBy || r.definition.callableBy.includes('patron'),
+          );
+
+          const entries = tools.map((r) => ({
+            name: r.definition.name,
+            route: toolNameToRoute(r.definition.name),
+            method: permissionToMethod(r.definition.permission),
+            description: r.definition.description,
+            params: extractParams(r.definition.params),
+          }));
+
+          return c.json(entries);
+        });
+
+        // ── Static assets ────────────────────────────────────────────
+        const staticDir = path.join(import.meta.dirname, 'static');
+        app.get('/static/*', (c) => {
+          const requestPath = c.req.path;
+          const filePath = requestPath.slice('/static/'.length);
+
+          if (filePath.includes('..')) {
+            return c.text('Not found', 404);
+          }
+
+          const absolutePath = path.join(staticDir, filePath);
+          try {
+            const content = fs.readFileSync(absolutePath);
+            const mimeType = getMimeType(absolutePath);
+            return new Response(content, {
+              headers: { 'Content-Type': mimeType },
+            });
+          } catch {
+            return c.text('Not found', 404);
+          }
+        });
+
+        // ── Home page ────────────────────────────────────────────────
+        app.get('/', (c) => {
+          const guildName = g.guildConfig().name;
+          const navHtml = buildNavHtml(pages);
+
+          const pageLinks =
+            pages.length > 0
+              ? pages
+                  .map(
+                    (p) =>
+                      `<li><a href="/pages/${p.id}/">${p.title}</a></li>`,
+                  )
+                  .join('\n        ')
+              : '<li class="empty-state">No pages registered.</li>';
+
+          const html = `<!DOCTYPE html>
+<html lang="en">
+<head>
+  <meta charset="UTF-8">
+  <meta name="viewport" content="width=device-width, initial-scale=1.0">
+  <title>${guildName} — Guild Dashboard</title>
+  <link rel="stylesheet" href="/static/style.css">
+</head>
+<body>
+${navHtml}
+<main style="padding: 24px;">
+  <h1>${guildName}</h1>
+  <div class="card">
+    <h2>Pages</h2>
+    <ul>
+        ${pageLinks}
+    </ul>
+  </div>
+</main>
+</body>
+</html>`;
+
+          return c.html(html);
+        });
+
+        // ── Late-arriving plugins ─────────────────────────────────────
+        ctx.on('plugin:initialized', (plugin: unknown) => {
+          const loaded = plugin as LoadedApparatus | LoadedKit;
+          if ('apparatus' in loaded) {
+            scanApparatus(loaded as LoadedApparatus);
+          } else if ('kit' in loaded) {
+            scanKit(loaded as LoadedKit);
+          }
+
+          // Check for new patron-callable tools
+          const currentTools = instrumentarium.list().filter(
+            (r) => !r.definition.callableBy || r.definition.callableBy.includes('patron'),
+          );
+          for (const resolved of currentTools) {
+            registerToolRoute(resolved.definition, instrumentarium);
+          }
+        });
+
+        // ── Start HTTP server ─────────────────────────────────────────
+        await new Promise<void>((resolve, reject) => {
+          server = serve({ fetch: app.fetch, port }, () => {
+            serverPort = port;
+            console.log(`[oculus] Listening on http://localhost:${port}`);
+            resolve();
+          }) as Server;
+          server.on('error', reject);
+        });
+      },
+
+      async stop(): Promise<void> {
+        if (server) {
+          await new Promise<void>((resolve, reject) => {
+            server!.close((err) => {
+              if (err) reject(err);
+              else resolve();
+            });
+          });
+          server = null;
+        }
+      },
+    },
+  };
+}
diff --git a/packages/plugins/oculus/src/static/style.css b/packages/plugins/oculus/src/static/style.css
new file mode 100644
index 0000000..806b37c
--- /dev/null
+++ b/packages/plugins/oculus/src/static/style.css
@@ -0,0 +1,225 @@
+/* Oculus shared stylesheet — Tokyo Night palette */
+
+/* ── Custom properties ───────────────────────────────────────────── */
+:root {
+  --bg: #1a1b26;
+  --surface: #24283b;
+  --surface2: #2f3549;
+  --border: #3b4261;
+  --text: #c0caf5;
+  --text-dim: #565f89;
+  --text-bright: #e0e6ff;
+  --green: #9ece6a;
+  --red: #f7768e;
+  --yellow: #e0af68;
+  --cyan: #7dcfff;
+  --magenta: #bb9af7;
+  --blue: #7aa2f7;
+  --font-mono: "SF Mono", "Fira Code", "JetBrains Mono", monospace;
+}
+
+/* ── Element-type selectors ──────────────────────────────────────── */
+body {
+  background: var(--bg);
+  color: var(--text);
+  font-family: var(--font-mono);
+  font-size: 13px;
+  line-height: 1.6;
+  margin: 0;
+  padding: 0;
+}
+
+h1, h2, h3, h4 {
+  color: var(--text-bright);
+  font-weight: 600;
+}
+
+a {
+  color: var(--cyan);
+  text-decoration: none;
+}
+
+a:hover {
+  text-decoration: underline;
+}
+
+table {
+  width: 100%;
+  border-collapse: collapse;
+}
+
+th, td {
+  text-align: left;
+  padding: 8px;
+  border-bottom: 1px solid var(--border);
+}
+
+th {
+  color: var(--text-dim);
+  font-weight: 500;
+}
+
+button {
+  background: var(--blue);
+  color: var(--bg);
+  border: none;
+  border-radius: 6px;
+  padding: 8px 16px;
+  cursor: pointer;
+  font-family: var(--font-mono);
+  font-size: 13px;
+}
+
+button:hover {
+  opacity: 0.9;
+}
+
+input, select, textarea {
+  background: var(--surface);
+  color: var(--text);
+  border: 1px solid var(--border);
+  border-radius: 4px;
+  padding: 6px 10px;
+  font-family: var(--font-mono);
+  font-size: 13px;
+  outline: none;
+}
+
+input:focus, select:focus, textarea:focus {
+  border-color: var(--cyan);
+}
+
+pre, code {
+  background: var(--surface);
+  border-radius: 4px;
+}
+
+code {
+  padding: 2px 6px;
+}
+
+pre {
+  padding: 16px;
+  overflow-x: auto;
+}
+
+pre code {
+  background: none;
+  padding: 0;
+  border-radius: 0;
+}
+
+/* ── Utility classes ─────────────────────────────────────────────── */
+#oculus-nav {
+  display: flex;
+  gap: 16px;
+  align-items: center;
+  padding: 8px 16px;
+  background: var(--surface);
+  border-bottom: 1px solid var(--border);
+}
+
+#oculus-nav a {
+  color: var(--text-dim);
+  font-size: 12px;
+  text-decoration: none;
+}
+
+#oculus-nav a:hover,
+#oculus-nav a:active {
+  color: var(--text);
+  text-decoration: none;
+}
+
+.card {
+  background: var(--surface);
+  border: 1px solid var(--border);
+  border-radius: 8px;
+  padding: 16px;
+}
+
+.badge {
+  display: inline-block;
+  font-size: 11px;
+  padding: 2px 8px;
+  border-radius: 4px;
+  background: var(--surface2);
+  color: var(--text-dim);
+}
+
+.badge--success {
+  background: rgba(158, 206, 106, 0.15);
+  color: var(--green);
+}
+
+.badge--error {
+  background: rgba(247, 118, 142, 0.15);
+  color: var(--red);
+}
+
+.badge--warning {
+  background: rgba(224, 175, 104, 0.15);
+  color: var(--yellow);
+}
+
+.badge--info {
+  background: rgba(125, 207, 255, 0.15);
+  color: var(--cyan);
+}
+
+.badge--active {
+  background: rgba(125, 207, 255, 0.15);
+  color: var(--cyan);
+  animation: pulse 2s infinite;
+}
+
+.data-table {
+  width: 100%;
+  border-collapse: collapse;
+}
+
+.data-table tr:nth-child(even) {
+  background: rgba(47, 53, 73, 0.3);
+}
+
+.btn {
+  border: none;
+  border-radius: 6px;
+  padding: 8px 16px;
+  cursor: pointer;
+  font-family: var(--font-mono);
+  font-size: 13px;
+}
+
+.btn--primary {
+  background: var(--blue);
+  color: var(--bg);
+}
+
+.btn--success {
+  background: var(--green);
+  color: var(--bg);
+}
+
+.btn--danger {
+  background: var(--red);
+  color: var(--bg);
+}
+
+.toolbar {
+  display: flex;
+  gap: 8px;
+  align-items: center;
+  padding: 8px 0;
+}
+
+.empty-state {
+  text-align: center;
+  padding: 48px 16px;
+  color: var(--text-dim);
+}
+
+@keyframes pulse {
+  0%, 100% { opacity: 1; }
+  50% { opacity: 0.6; }
+}
diff --git a/packages/plugins/oculus/src/types.ts b/packages/plugins/oculus/src/types.ts
new file mode 100644
index 0000000..7255f22
--- /dev/null
+++ b/packages/plugins/oculus/src/types.ts
@@ -0,0 +1,43 @@
+import type { Context } from 'hono';
+
+/** A page contributed by a plugin kit or apparatus supportKit. */
+export interface PageContribution {
+  /** Unique page ID — becomes the URL segment: /pages/{id}/ */
+  id: string;
+  /** Human-readable title used in navigation. */
+  title: string;
+  /**
+   * Path to the directory containing the page's static assets,
+   * relative to the contributing package's root in node_modules.
+   * Must contain an index.html entry point.
+   */
+  dir: string;
+}
+
+/** A custom route contributed by a plugin kit or apparatus supportKit. */
+export interface RouteContribution {
+  /** HTTP method (uppercase): 'GET', 'POST', 'DELETE', etc. */
+  method: string;
+  /** Hono path pattern. Must begin with /api/. */
+  path: string;
+  /** Hono handler function. */
+  handler: (c: Context) => Response | Promise<Response>;
+}
+
+/** Kit contribution interface — consumed by the Oculus. */
+export interface OculusKit {
+  pages?: PageContribution[];
+  routes?: RouteContribution[];
+}
+
+/** The Oculus configuration from guild.json under 'oculus'. */
+export interface OculusConfig {
+  /** Port to listen on. Default: 7470. */
+  port?: number;
+}
+
+/** The Oculus's public API, exposed via provides. */
+export interface OculusApi {
+  /** The port the server is listening on. */
+  port(): number;
+}
diff --git a/packages/plugins/oculus/tsconfig.json b/packages/plugins/oculus/tsconfig.json
new file mode 100644
index 0000000..4229950
--- /dev/null
+++ b/packages/plugins/oculus/tsconfig.json
@@ -0,0 +1,13 @@
+{
+  "extends": "../../../tsconfig.json",
+  "compilerOptions": {
+    "outDir": "dist",
+    "rootDir": "src"
+  },
+  "include": [
+    "src"
+  ],
+  "exclude": [
+    "src/**/*.test.ts"
+  ]
+}
diff --git a/packages/plugins/tools/src/instrumentarium.test.ts b/packages/plugins/tools/src/instrumentarium.test.ts
index c7edccd..d6e97b4 100644
--- a/packages/plugins/tools/src/instrumentarium.test.ts
+++ b/packages/plugins/tools/src/instrumentarium.test.ts
@@ -35,7 +35,7 @@ import {
 /** Create a minimal tool definition for testing. */
 function testTool(
   name: string,
-  opts?: { callableBy?: ('cli' | 'anima' | 'library')[]; permission?: string },
+  opts?: { callableBy?: ('patron' | 'anima' | 'library')[]; permission?: string },
 ) {
   return tool({
     name,
@@ -525,14 +525,14 @@ describe('Instrumentarium', () => {
 
     it('includes tools that match the requested caller', () => {
       const kit = mockKit('nexus-stdlib', [
-        testTool('cli-only', { callableBy: ['cli'], permission: 'read' }),
+        testTool('cli-only', { callableBy: ['patron'], permission: 'read' }),
       ]);
 
       const { api } = startInstrumentarium({ kits: [kit] });
 
       const resolved = api.resolve({
         permissions: ['nexus-stdlib:read'],
-        caller: 'cli',
+        caller: 'patron',
       });
       assert.equal(resolved.length, 1);
     });
@@ -546,14 +546,14 @@ describe('Instrumentarium', () => {
 
       const resolved = api.resolve({
         permissions: ['nexus-stdlib:read'],
-        caller: 'cli',
+        caller: 'patron',
       });
       assert.equal(resolved.length, 0);
     });
 
     it('does not filter by caller when caller is omitted', () => {
       const kit = mockKit('nexus-stdlib', [
-        testTool('cli-only', { callableBy: ['cli'], permission: 'read' }),
+        testTool('cli-only', { callableBy: ['patron'], permission: 'read' }),
         testTool('anima-only', { callableBy: ['anima'], permission: 'read' }),
       ]);
 
@@ -571,7 +571,7 @@ describe('Instrumentarium', () => {
       const { api } = startInstrumentarium({ kits: [kit] });
 
       assert.equal(
-        api.resolve({ permissions: [], caller: 'cli' }).length,
+        api.resolve({ permissions: [], caller: 'patron' }).length,
         0,
       );
       assert.equal(
diff --git a/packages/plugins/tools/src/tool.test.ts b/packages/plugins/tools/src/tool.test.ts
index 03f95fe..e93b60f 100644
--- a/packages/plugins/tools/src/tool.test.ts
+++ b/packages/plugins/tools/src/tool.test.ts
@@ -30,14 +30,14 @@ describe('tool()', () => {
 
   it('normalizes callableBy single string to array', () => {
     const t = tool({
-      name: 'cli-tool',
+      name: 'patron-tool',
       description: 'CLI only',
       params: {},
       handler: async () => ({}),
-      callableBy: 'cli',
+      callableBy: 'patron',
     });
 
-    assert.deepStrictEqual(t.callableBy, ['cli']);
+    assert.deepStrictEqual(t.callableBy, ['patron']);
   });
 
   it('preserves callableBy when already an array', () => {
@@ -46,10 +46,10 @@ describe('tool()', () => {
       description: 'Both callers',
       params: {},
       handler: async () => ({}),
-      callableBy: ['cli', 'anima'],
+      callableBy: ['patron', 'anima'],
     });
 
-    assert.deepStrictEqual(t.callableBy, ['cli', 'anima']);
+    assert.deepStrictEqual(t.callableBy, ['patron', 'anima']);
   });
 
   it('omits callableBy when not provided', () => {
diff --git a/packages/plugins/tools/src/tool.ts b/packages/plugins/tools/src/tool.ts
index bf1e712..06bd24e 100644
--- a/packages/plugins/tools/src/tool.ts
+++ b/packages/plugins/tools/src/tool.ts
@@ -42,13 +42,13 @@ type ZodShape = Record<string, z.ZodType>;
 
 /**
  * The caller types a tool can be invoked by.
- * - `'cli'` — accessible via `nsg` commands (human-facing)
+ * - `'patron'` — accessible via `nsg` commands (human-facing)
  * - `'anima'` — accessible via MCP server (anima-facing, in sessions)
  * - `'library'` — accessible programmatically via direct import
  *
  * Defaults to all caller types if `callableBy` is unspecified.
  */
-export type ToolCaller = 'cli' | 'anima' | 'library';
+export type ToolCaller = 'patron' | 'anima' | 'library';
 
 /**
  * A fully-defined tool — the return type of `tool()`.
diff --git a/packages/plugins/tools/src/tools/tools-list.test.ts b/packages/plugins/tools/src/tools/tools-list.test.ts
index 7b81eff..ca0fab3 100644
--- a/packages/plugins/tools/src/tools/tools-list.test.ts
+++ b/packages/plugins/tools/src/tools/tools-list.test.ts
@@ -28,7 +28,7 @@ import {
 function testTool(
   name: string,
   opts?: {
-    callableBy?: ('cli' | 'anima' | 'library')[];
+    callableBy?: ('patron' | 'anima' | 'library')[];
     permission?: string;
     description?: string;
   },
@@ -145,7 +145,7 @@ describe('tools-list', () => {
 
   it('filters by caller type', async () => {
     const kit = mockKit('stdlib', [
-      testTool('cli-only', { callableBy: ['cli'], permission: 'read' }),
+      testTool('cli-only', { callableBy: ['patron'], permission: 'read' }),
       testTool('anima-only', { callableBy: ['anima'], permission: 'read' }),
       testTool('unrestricted', { permission: 'read' }),
     ]);
diff --git a/packages/plugins/tools/src/tools/tools-list.ts b/packages/plugins/tools/src/tools/tools-list.ts
index 99f9aff..b28a87c 100644
--- a/packages/plugins/tools/src/tools/tools-list.ts
+++ b/packages/plugins/tools/src/tools/tools-list.ts
@@ -30,7 +30,7 @@ export function createToolsList(getApi: () => InstrumentariumApi) {
     permission: 'read',
     params: {
       caller: z
-        .enum(['cli', 'anima', 'library'])
+        .enum(['patron', 'anima', 'library'])
         .optional()
         .describe('Filter to tools callable by this caller type.'),
       permission: z
diff --git a/packages/plugins/tools/src/tools/tools-show.test.ts b/packages/plugins/tools/src/tools/tools-show.test.ts
index 7078d97..65f969b 100644
--- a/packages/plugins/tools/src/tools/tools-show.test.ts
+++ b/packages/plugins/tools/src/tools/tools-show.test.ts
@@ -90,7 +90,7 @@ describe('tools-show', () => {
       name: 'writ-create',
       description: 'Create a new writ',
       permission: 'write',
-      callableBy: ['cli', 'anima'],
+      callableBy: ['patron', 'anima'],
       params: {
         title: z.string().describe('The writ title'),
         priority: z.number().optional().describe('Priority level'),
@@ -108,7 +108,7 @@ describe('tools-show', () => {
     assert.equal(result.description, 'Create a new writ');
     assert.equal(result.pluginId, 'stdlib');
     assert.equal(result.permission, 'write');
-    assert.deepStrictEqual(result.callableBy, ['cli', 'anima']);
+    assert.deepStrictEqual(result.callableBy, ['patron', 'anima']);
   });
 
   it('extracts parameter schema with types and descriptions', async () => {
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index c102b35..c7284ed 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -177,6 +177,28 @@ importers:
         specifier: 25.5.0
         version: 25.5.0
 
+  packages/plugins/oculus:
+    dependencies:
+      '@hono/node-server':
+        specifier: ^1.13.7
+        version: 1.19.11(hono@4.12.9)
+      '@shardworks/nexus-core':
+        specifier: workspace:*
+        version: link:../../framework/core
+      '@shardworks/tools-apparatus':
+        specifier: workspace:*
+        version: link:../tools
+      hono:
+        specifier: ^4.7.11
+        version: 4.12.9
+      zod:
+        specifier: 4.3.6
+        version: 4.3.6
+    devDependencies:
+      '@types/node':
+        specifier: 25.5.0
+        version: 25.5.0
+
   packages/plugins/parlour:
     dependencies:
       '@shardworks/animator-apparatus':

```

## Full File Contents (for context)

=== FILE: packages/framework/cli/src/cli.ts ===
#!/usr/bin/env node

/**
 * nsg — CLI entry point, built on the plugin architecture.
 *
 * Dynamically discovers installed tools via plugins, registers them as Commander
 * commands, and delegates argument parsing and invocation to Commander.
 *
 * Tools are filtered to those with 'patron' in callableBy (or no callableBy
 * set, which defaults to all callers). Tools marked 'anima'-only are invisible here.
 */

import { main } from './program.ts';

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

=== FILE: packages/framework/cli/src/commands/init.ts ===
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
  callableBy: ['patron'],
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
    assert.deepEqual(pluginList.callableBy, ['patron']);
  });

  it('plugin-install is callable from cli only', () => {
    assert.deepEqual(pluginInstall.callableBy, ['patron']);
  });

  it('plugin-remove is callable from cli only', () => {
    assert.deepEqual(pluginRemove.callableBy, ['patron']);
  });

  it('plugin-upgrade is callable from cli only', () => {
    assert.deepEqual(pluginUpgrade.callableBy, ['patron']);
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
  callableBy: ['patron'],
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
  callableBy: ['patron'],
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
  callableBy: ['patron'],
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
  callableBy: ['patron'],
  params: {
    name: z.string().describe('Plugin id or package name to upgrade'),
    version: z.string().optional().describe('Target version (default: latest)'),
  },
  handler: async () => {
    return 'Not yet implemented.';
  },
});

=== FILE: packages/framework/cli/src/commands/status.test.ts ===
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
    assert.deepEqual(statusTool.callableBy, ['patron']);
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
  callableBy: ['patron'],
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

=== FILE: packages/framework/cli/src/commands/upgrade.test.ts ===
/**
 * Tests for the `upgrade` framework command.
 *
 * Currently a stub — tests confirm the stub behavior and tool metadata.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import upgradeTool from './upgrade.ts';

describe('upgrade tool definition', () => {
  it('has the correct name', () => {
    assert.equal(upgradeTool.name, 'upgrade');
  });

  it('has a non-empty description', () => {
    assert.ok(upgradeTool.description.length > 0);
  });

  it('is callable from cli only', () => {
    assert.deepEqual(upgradeTool.callableBy, ['patron']);
  });

  it('exposes a dryRun param', () => {
    const shape = upgradeTool.params.shape as Record<string, unknown>;
    assert.ok('dryRun' in shape);
  });
});

describe('upgrade handler', () => {
  it('returns a "not yet implemented" message', async () => {
    const result = await upgradeTool.handler({});
    assert.ok(typeof result === 'string');
    assert.ok((result as string).toLowerCase().includes('not yet implemented'));
  });

  it('ignores dryRun param without error', async () => {
    const result = await upgradeTool.handler({ dryRun: true });
    assert.ok(typeof result === 'string');
  });
});

=== FILE: packages/framework/cli/src/commands/upgrade.ts ===
/**
 * nsg upgrade — upgrade the guild framework.
 *
 * Stub — upgrade lifecycle not yet designed. Will handle framework version
 * bumps, guild.json schema reconciliation, and plugin-specific upgrade
 * hooks when implemented.
 */

import { tool } from '@shardworks/tools-apparatus';
import { z } from 'zod';

export default tool({
  name: 'upgrade',
  description: 'Upgrade the guild framework and run pending plugin migrations',
  callableBy: ['patron'],
  params: {
    dryRun: z.boolean().optional().describe('Show what would be done without applying changes'),
  },
  handler: async () => {
    return 'Not yet implemented.';
  },
});

=== FILE: packages/framework/cli/src/commands/version.test.ts ===
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
    assert.deepEqual(versionTool.callableBy, ['patron']);
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

=== FILE: packages/framework/cli/src/commands/version.ts ===
/**
 * nsg version — show framework and plugin version info.
 *
 * A framework command — hardcoded in the CLI, not discovered via plugins.
 *
 * Always shows framework and Node versions. When run inside a guild,
 * additionally shows installed plugin versions. Gracefully degrades
 * when run outside a guild (no error, just less info).
 */

import { tool } from '@shardworks/tools-apparatus';
import { VERSION, readGuildConfig, guild, readGuildPackageJson, resolvePackageNameForPluginId } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'version',
  description: 'Show Nexus framework and installed plugin version information',
  callableBy: ['patron'],
  params: {
    json: z.boolean().optional().describe('Output as JSON'),
  },
  handler: async (params) => {
    const result: Record<string, string> = {
      nexus: VERSION,
      node: process.version,
    };

    // Add plugin versions when running inside a guild.
    // guild() throws if not initialized — that's fine, we just skip plugin info.
    try {
      const { home } = guild();
      const config = readGuildConfig(home);
      for (const pluginId of config.plugins) {
        const packageName = resolvePackageNameForPluginId(home, pluginId);
        if (!packageName) {
          result[pluginId] = 'not installed';
          continue;
        }
        const { pkgJson } = readGuildPackageJson(home, packageName);
        result[packageName] = pkgJson
          ? ((pkgJson.version as string) ?? 'unknown')
          : 'not installed';
      }
    } catch {
      // Not in a guild or guild.json unreadable — just show framework version
    }

    if (params.json) {
      return result;
    }

    const lines = Object.entries(result).map(([k, v]) => `${k}: ${v}`);
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
import { toFlag, isBooleanSchema, findGroupPrefixes, coerceCliOpts } from './helpers.ts';

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

  cmd.action(async (opts: Record<string, unknown>) => {
    try {
      const coerced = coerceCliOpts(shape, opts);
      const validated = toolDef.params.parse(coerced);
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
        .filter((r) => !r.definition.callableBy || r.definition.callableBy.includes('patron'))
        .map((r) => r.definition);
      registerTools(program, pluginTools);
    } catch {
      // No Instrumentarium installed or guild failed to load —
      // only framework commands available.
    }
  }

  program.parse(process.argv);
}


=== FILE: packages/plugins/animator/src/tools/summon.ts ===
/**
 * summon tool — dispatch an anima session from the CLI.
 *
 * High-level entry point: composes context via The Loom (passing the
 * role for system prompt composition), then launches a session via
 * The Animator. The work prompt goes directly to the provider.
 *
 * Usage:
 *   nsg summon --prompt "Build the frobnicator" --role artificer
 */

import { tool } from '@shardworks/tools-apparatus';
import { guild } from '@shardworks/nexus-core';
import { z } from 'zod';
import type { AnimatorApi } from '../types.ts';

export default tool({
  name: 'summon',
  description: 'Summon an anima — compose context and launch a session',
  instructions:
    'Dispatches an anima session. Provide a work prompt (what the anima should do) ' +
    'and optionally a role name (for system prompt composition). The Loom composes ' +
    'the identity context from the role; the prompt goes directly to the AI process. ' +
    'Returns the session result with id, status, cost, and token usage.',
  params: {
    prompt: z.string().describe('The work prompt — what the anima should do'),
    role: z.string().optional().describe('Role to summon (e.g. "artificer", "scribe")'),
  },
  callableBy: 'patron',
  permission: 'animate',
  handler: async (params) => {
    const animator = guild().apparatus<AnimatorApi>('animator');
    const cwd = guild().home;

    const { result } = animator.summon({
      prompt: params.prompt,
      role: params.role,
      cwd,
    });

    const session = await result;

    return {
      id: session.id,
      status: session.status,
      provider: session.provider,
      durationMs: session.durationMs,
      exitCode: session.exitCode,
      costUsd: session.costUsd,
      tokenUsage: session.tokenUsage,
      error: session.error,
    };
  },
});

=== FILE: packages/plugins/claude-code/src/mcp-server.test.ts ===
/**
 * Tests for the MCP server module.
 *
 * Exercises createMcpServer() with ToolDefinition arrays to verify
 * tool registration, callableBy filtering, and error handling.
 * Tests startMcpHttpServer() for HTTP server lifecycle and connectivity.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { tool } from '@shardworks/tools-apparatus';

import { createMcpServer, startMcpHttpServer } from './mcp-server.ts';

// ── Test helpers ────────────────────────────────────────────────────────

function makeTool(overrides: {
  name?: string;
  description?: string;
  permission?: string;
  callableBy?: ('patron' | 'anima' | 'library')[];
  handler?: () => unknown;
} = {}) {
  return tool({
    name: overrides.name ?? 'test-tool',
    description: overrides.description ?? 'A test tool',
    params: { input: z.string().describe('Test input') },
    handler: overrides.handler ?? (async () => ({ ok: true })),
    ...(overrides.permission !== undefined ? { permission: overrides.permission } : {}),
    ...(overrides.callableBy !== undefined ? { callableBy: overrides.callableBy } : {}),
  });
}

// ── createMcpServer ─────────────────────────────────────────────────────

describe('createMcpServer()', () => {
  it('returns an McpServer instance with no tools', async () => {
    const server = await createMcpServer([]);
    assert.ok(server, 'should return a server object');
  });

  it('accepts an array of ToolDefinitions', async () => {
    const tools = [
      makeTool({ name: 'tool-a', description: 'First tool' }),
      makeTool({ name: 'tool-b', description: 'Second tool' }),
    ];

    const server = await createMcpServer(tools);
    assert.ok(server, 'should return a server with tools registered');
  });

  it('filters out tools not callable by animas', async () => {
    const tools = [
      makeTool({ name: 'cli-only', callableBy: ['patron'] }),
      makeTool({ name: 'anima-ok', callableBy: ['anima'] }),
      makeTool({ name: 'both', callableBy: ['patron', 'anima'] }),
      makeTool({ name: 'no-restriction' }), // no callableBy → available to everyone
    ];

    // createMcpServer filters internally — it should not throw
    const server = await createMcpServer(tools);
    assert.ok(server, 'should handle mixed callableBy tools');
  });

  it('handles tools with permission fields', async () => {
    const tools = [
      makeTool({ name: 'read-tool', permission: 'read' }),
      makeTool({ name: 'write-tool', permission: 'write' }),
      makeTool({ name: 'no-perm' }),
    ];

    // Permission is not checked by createMcpServer — it registers all tools.
    // Permission gating happens upstream in the Instrumentarium.
    const server = await createMcpServer(tools);
    assert.ok(server, 'should register tools regardless of permission field');
  });
});

// ── startMcpHttpServer ──────────────────────────────────────────────────

describe('startMcpHttpServer()', () => {
  it('starts an HTTP server and returns a handle with URL and close', async () => {
    const tools = [makeTool({ name: 'test-tool' })];
    const handle = await startMcpHttpServer(tools);

    try {
      assert.ok(handle.url, 'should have a URL');
      assert.match(handle.url, /^http:\/\/127\.0\.0\.1:\d+\/sse$/, 'URL should be localhost with /sse endpoint');
      assert.equal(typeof handle.close, 'function', 'should have a close function');
    } finally {
      await handle.close();
    }
  });

  it('listens on an ephemeral port', async () => {
    const handle = await startMcpHttpServer([makeTool({ name: 'tool-a' })]);

    try {
      const port = parseInt(new URL(handle.url).port, 10);
      assert.ok(port > 0, 'should bind to a real port');
      assert.ok(port < 65536, 'port should be in valid range');
    } finally {
      await handle.close();
    }
  });

  it('responds to HTTP requests on the MCP endpoint', async () => {
    const tools = [makeTool({ name: 'ping-tool' })];
    const handle = await startMcpHttpServer(tools);

    try {
      // Send a basic HTTP request to the MCP endpoint.
      // The MCP protocol expects JSON-RPC — a plain GET should get a
      // response (likely 405 or similar) rather than a connection error.
      const res = await fetch(handle.url, { method: 'GET' });
      // Any HTTP response means the server is listening and reachable.
      assert.ok(res.status > 0, 'should get an HTTP response');
    } finally {
      await handle.close();
    }
  });

  it('can start multiple servers on different ports', async () => {
    const handle1 = await startMcpHttpServer([makeTool({ name: 'tool-1' })]);
    const handle2 = await startMcpHttpServer([makeTool({ name: 'tool-2' })]);

    try {
      assert.notEqual(handle1.url, handle2.url, 'should bind to different ports');
    } finally {
      await handle1.close();
      await handle2.close();
    }
  });

  it('close() shuts down the server', async () => {
    const handle = await startMcpHttpServer([makeTool({ name: 'tool-a' })]);
    await handle.close();

    // After close, the server should no longer accept connections.
    try {
      await fetch(handle.url, { method: 'GET' });
      assert.fail('should not be reachable after close');
    } catch (err) {
      // Expected — connection refused or similar network error
      assert.ok(err, 'fetch should throw after server is closed');
    }
  });

  it('works with empty tool set', async () => {
    const handle = await startMcpHttpServer([]);
    try {
      assert.ok(handle.url, 'should start even with no tools');
    } finally {
      await handle.close();
    }
  });
});

=== FILE: packages/plugins/oculus/package.json ===
{
  "name": "@shardworks/oculus-apparatus",
  "version": "0.0.0",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/shardworks/nexus",
    "directory": "packages/plugins/oculus"
  },
  "description": "The Oculus — web dashboard apparatus for the guild",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc",
    "test": "node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'src/**/*.test.ts'",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.7",
    "@shardworks/nexus-core": "workspace:*",
    "@shardworks/tools-apparatus": "workspace:*",
    "hono": "^4.7.11",
    "zod": "4.3.6"
  },
  "devDependencies": {
    "@types/node": "25.5.0"
  },
  "files": [
    "dist"
  ],
  "publishConfig": {
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  }
}

=== FILE: packages/plugins/oculus/src/index.ts ===
/**
 * @shardworks/oculus-apparatus — The Oculus.
 *
 * Web dashboard apparatus for the guild. Serves pages contributed by plugins,
 * exposes guild tools as REST endpoints, and provides a unified web interface.
 */

import { createOculus } from './oculus.ts';

export {
  type OculusApi,
  type OculusConfig,
  type OculusKit,
  type PageContribution,
  type RouteContribution,
} from './types.ts';

export { createOculus } from './oculus.ts';

import type { OculusConfig } from './types.ts';

declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    oculus?: OculusConfig;
  }
}

export default createOculus();

=== FILE: packages/plugins/oculus/src/oculus.test.ts ===
/**
 * Oculus apparatus — unit tests.
 *
 * Tests server lifecycle, page serving, chrome injection, tool route mapping,
 * custom routes, and the API tool index.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import {
  setGuild,
  clearGuild,
  guild,
} from '@shardworks/nexus-core';
import type {
  Guild,
  LoadedKit,
  LoadedApparatus,
  StartupContext,
} from '@shardworks/nexus-core';

import { tool } from '@shardworks/tools-apparatus';
import type { InstrumentariumApi, ResolvedTool } from '@shardworks/tools-apparatus';
import type { ToolDefinition } from '@shardworks/tools-apparatus';

import { createOculus, toolNameToRoute, permissionToMethod, coerceParams, injectChrome } from './oculus.ts';
import type { PageContribution, RouteContribution } from './types.ts';

// ── Test helpers ──────────────────────────────────────────────────────

let tmpDir: string;

function makeTmpDir(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oculus-test-'));
  return tmpDir;
}

function cleanupTmpDir(): void {
  if (tmpDir) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore */ }
    tmpDir = '';
  }
}

function makePageDir(parentDir: string, name: string, html: string): string {
  const dir = path.join(parentDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  return dir;
}

function buildTestContext(): {
  ctx: StartupContext;
  fire: (event: string, ...args: unknown[]) => Promise<void>;
} {
  const handlers = new Map<string, Array<(...args: unknown[]) => void | Promise<void>>>();

  const ctx: StartupContext = {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  };

  async function fire(event: string, ...args: unknown[]): Promise<void> {
    for (const h of handlers.get(event) ?? []) {
      await h(...args);
    }
  }

  return { ctx, fire };
}

function mockKit(id: string, tools: unknown[], pages?: PageContribution[], routes?: RouteContribution[]): LoadedKit {
  return {
    packageName: `@test/${id}`,
    id,
    version: '0.0.0',
    kit: { tools, ...(pages ? { pages } : {}), ...(routes ? { routes } : {}) },
  };
}

/** Build a mock InstrumentariumApi from a flat list of ToolDefinitions. */
function createMockInstrumentarium(tools: ToolDefinition[]): InstrumentariumApi {
  const resolved: ResolvedTool[] = tools.map((def) => ({ definition: def, pluginId: 'test' }));
  return {
    list: () => resolved,
    find: (name: string) => resolved.find((t) => t.definition.name === name) ?? null,
    resolve: () => resolved,
  };
}

function wireGuild(opts: {
  home: string;
  kits?: LoadedKit[];
  apparatuses?: LoadedApparatus[];
  instrumentarium: InstrumentariumApi;
  guildName?: string;
  oculusPort?: number;
}): void {
  const kits = opts.kits ?? [];
  const apparatuses = opts.apparatuses ?? [];
  const oculusPort = opts.oculusPort;

  const mockGuild: Guild = {
    home: opts.home,
    apparatus<T>(name: string): T {
      if (name === 'tools') return opts.instrumentarium as T;
      throw new Error(`apparatus not found: ${name}`);
    },
    config<T>(_pluginId: string): T {
      return {} as T;
    },
    writeConfig() {},
    guildConfig() {
      return {
        name: opts.guildName ?? 'test-guild',
        nexus: '0.0.0',
        plugins: [],
        ...(oculusPort !== undefined ? { oculus: { port: oculusPort } } : {}),
      };
    },
    kits() { return [...kits]; },
    apparatuses() { return [...apparatuses]; },
    failedPlugins() { return []; },
  };
  setGuild(mockGuild);
}

// ── Unit tests: toolNameToRoute ───────────────────────────────────────

describe('toolNameToRoute', () => {
  it("'writ-list' → '/api/writ/list'", () => {
    assert.equal(toolNameToRoute('writ-list'), '/api/writ/list');
  });

  it("'commission-post' → '/api/commission/post'", () => {
    assert.equal(toolNameToRoute('commission-post'), '/api/commission/post');
  });

  it("'rig-for-writ' → '/api/rig/for-writ'", () => {
    assert.equal(toolNameToRoute('rig-for-writ'), '/api/rig/for-writ');
  });

  it("'signal' → '/api/signal'", () => {
    assert.equal(toolNameToRoute('signal'), '/api/signal');
  });

  it("'tools-list' → '/api/tools/list'", () => {
    assert.equal(toolNameToRoute('tools-list'), '/api/tools/list');
  });
});

// ── Unit tests: permissionToMethod ───────────────────────────────────

describe('permissionToMethod', () => {
  it("undefined → 'GET'", () => {
    assert.equal(permissionToMethod(undefined), 'GET');
  });

  it("'read' → 'GET'", () => {
    assert.equal(permissionToMethod('read'), 'GET');
  });

  it("'write' → 'POST'", () => {
    assert.equal(permissionToMethod('write'), 'POST');
  });

  it("'admin' → 'POST'", () => {
    assert.equal(permissionToMethod('admin'), 'POST');
  });

  it("'delete' → 'DELETE'", () => {
    assert.equal(permissionToMethod('delete'), 'DELETE');
  });

  it("'clerk:read' → 'GET'", () => {
    assert.equal(permissionToMethod('clerk:read'), 'GET');
  });

  it("'clerk:write' → 'POST'", () => {
    assert.equal(permissionToMethod('clerk:write'), 'POST');
  });

  it("'spider:write' → 'POST'", () => {
    assert.equal(permissionToMethod('spider:write'), 'POST');
  });

  it("'animate' → 'POST' (unknown level)", () => {
    assert.equal(permissionToMethod('animate'), 'POST');
  });
});

// ── Unit tests: coerceParams ──────────────────────────────────────────

describe('coerceParams', () => {
  it('coerces number strings to numbers', () => {
    const shape = { limit: z.number() };
    const result = coerceParams(shape, { limit: '5' });
    assert.equal(result.limit, 5);
    assert.equal(typeof result.limit, 'number');
  });

  it("coerces 'true' to boolean true", () => {
    const shape = { verbose: z.boolean() };
    const result = coerceParams(shape, { verbose: 'true' });
    assert.equal(result.verbose, true);
    assert.equal(typeof result.verbose, 'boolean');
  });

  it("coerces 'false' to boolean false", () => {
    const shape = { verbose: z.boolean() };
    const result = coerceParams(shape, { verbose: 'false' });
    assert.equal(result.verbose, false);
  });

  it('leaves string values untouched', () => {
    const shape = { name: z.string() };
    const result = coerceParams(shape, { name: 'hello' });
    assert.equal(result.name, 'hello');
  });

  it('unwraps optional number schema', () => {
    const shape = { limit: z.number().optional() };
    const result = coerceParams(shape, { limit: '5' });
    assert.equal(result.limit, 5);
  });

  it('unwraps optional boolean schema', () => {
    const shape = { flag: z.boolean().optional() };
    const result = coerceParams(shape, { flag: 'true' });
    assert.equal(result.flag, true);
  });
});

// ── Unit tests: injectChrome ──────────────────────────────────────────

describe('injectChrome', () => {
  it('injects stylesheet link before </head> and nav after <body>', () => {
    const html = '<html><head><title>Test</title></head><body><p>Hi</p></body></html>';
    const result = injectChrome(html, '/static/style.css', '<nav>NAV</nav>');
    assert.ok(result.includes('<link rel="stylesheet" href="/static/style.css">'));
    assert.ok(result.includes('<nav>NAV</nav>'));
    // stylesheet should come before </head>
    const stylesheetIdx = result.indexOf('<link rel="stylesheet"');
    const headCloseIdx = result.indexOf('</head>');
    assert.ok(stylesheetIdx < headCloseIdx);
    // nav should come after <body>
    const navIdx = result.indexOf('<nav>NAV</nav>');
    const bodyIdx = result.indexOf('<body>');
    assert.ok(navIdx > bodyIdx);
  });

  it('works case-insensitively and handles body attributes', () => {
    const html = '<html><HEAD><TITLE>Test</TITLE></HEAD><BODY class="main"><p>Hi</p></BODY></html>';
    const result = injectChrome(html, '/static/style.css', '<nav>NAV</nav>');
    assert.ok(result.includes('<link rel="stylesheet"'));
    assert.ok(result.includes('<nav>NAV</nav>'));
    // nav should appear after the <BODY class="main"> tag
    const navIdx = result.indexOf('<nav>NAV</nav>');
    const bodyCloseIdx = result.indexOf('<BODY class="main">') + '<BODY class="main">'.length;
    assert.ok(navIdx >= bodyCloseIdx);
  });

  it('returns unmodified when neither <head> nor <body> present', () => {
    const html = '<p>No head or body tags</p>';
    const result = injectChrome(html, '/static/style.css', '<nav>NAV</nav>');
    assert.equal(result, html);
  });

  it('injects both when head and body are empty', () => {
    const html = '<html><head></head><body></body></html>';
    const result = injectChrome(html, '/static/style.css', '<nav>NAV</nav>');
    assert.ok(result.includes('<link rel="stylesheet"'));
    assert.ok(result.includes('<nav>NAV</nav>'));
  });
});

// ── Integration tests: server lifecycle ──────────────────────────────

describe('Oculus server lifecycle', () => {
  afterEach(() => {
    clearGuild();
    cleanupTmpDir();
  });

  it('starts and stops cleanly', async () => {
    const home = makeTmpDir();
    const instrumentarium = createMockInstrumentarium([]);
    const port = 17470 + Math.floor(Math.random() * 100);

    wireGuild({ home, kits: [], instrumentarium, oculusPort: port });

    const plugin = createOculus();
    assert.ok('apparatus' in plugin);

    const { ctx } = buildTestContext();

    if ('apparatus' in plugin) {
      await plugin.apparatus.start(ctx);
    }

    try {
      // Server should be listening
      const res = await fetch(`http://localhost:${port}/`);
      assert.ok(res.status > 0);

      // api.port() should return the port
      const api = plugin.apparatus.provides as { port(): number };
      assert.equal(api.port(), port);
    } finally {
      if ('apparatus' in plugin) {
        await plugin.apparatus.stop?.();
      }
    }
  });
});

// ── Integration tests: page serving ──────────────────────────────────

describe('Oculus page serving', () => {
  let port: number;
  let oculusPlugin: ReturnType<typeof createOculus>;
  let guildHome: string;

  before(async () => {
    guildHome = makeTmpDir();
    port = 17570 + Math.floor(Math.random() * 100);

    // Create the fake node_modules structure
    const nmPageDir = path.join(guildHome, 'node_modules', '@test', 'my-kit', 'pages', 'my-page');
    fs.mkdirSync(nmPageDir, { recursive: true });
    fs.writeFileSync(
      path.join(nmPageDir, 'index.html'),
      '<html><head><title>My Page</title></head><body><p>Content</p></body></html>',
    );
    fs.writeFileSync(path.join(nmPageDir, 'app.js'), 'console.log("hello");');

    const pages: PageContribution[] = [
      { id: 'my-page', title: 'My Page', dir: 'pages/my-page' },
    ];

    const kits: LoadedKit[] = [mockKit('my-kit', [], pages)];
    const instrumentarium = createMockInstrumentarium([]);
    wireGuild({ home: guildHome, kits, instrumentarium, oculusPort: port });

    oculusPlugin = createOculus();
    const { ctx } = buildTestContext();
    if ('apparatus' in oculusPlugin) {
      await oculusPlugin.apparatus.start(ctx);
    }
  });

  after(async () => {
    if (oculusPlugin && 'apparatus' in oculusPlugin) {
      await oculusPlugin.apparatus.stop?.();
    }
    clearGuild();
    cleanupTmpDir();
  });

  it('serves index.html with chrome injection', async () => {
    const res = await fetch(`http://localhost:${port}/pages/my-page/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('<link rel="stylesheet" href="/static/style.css">'));
    assert.ok(text.includes('<nav id="oculus-nav">'));
    assert.ok(text.includes('<a href="/">Guild</a>'));
    assert.ok(text.includes('/pages/my-page/'));
  });

  it('serves index.html at explicit /index.html path with injection', async () => {
    const res = await fetch(`http://localhost:${port}/pages/my-page/index.html`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('<link rel="stylesheet" href="/static/style.css">'));
    assert.ok(text.includes('<nav id="oculus-nav">'));
  });

  it('serves non-index files without injection', async () => {
    const res = await fetch(`http://localhost:${port}/pages/my-page/app.js`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes('<link rel="stylesheet"'));
    assert.ok(!text.includes('<nav id="oculus-nav">'));
  });

  it('returns 404 for nonexistent page', async () => {
    const res = await fetch(`http://localhost:${port}/pages/nonexistent/`);
    assert.equal(res.status, 404);
  });

  it('rejects directory traversal attempts', async () => {
    const res = await fetch(`http://localhost:${port}/pages/my-page/../../../etc/passwd`);
    assert.ok(res.status === 404 || res.status === 400);
  });
});

// ── Integration tests: static assets ─────────────────────────────────

describe('Oculus static assets', () => {
  let port: number;
  let oculusPlugin: ReturnType<typeof createOculus>;

  before(async () => {
    const home = makeTmpDir();
    port = 17680 + Math.floor(Math.random() * 100);
    const instrumentarium = createMockInstrumentarium([]);
    wireGuild({ home, instrumentarium, oculusPort: port });

    oculusPlugin = createOculus();
    const { ctx } = buildTestContext();
    if ('apparatus' in oculusPlugin) {
      await oculusPlugin.apparatus.start(ctx);
    }
  });

  after(async () => {
    if (oculusPlugin && 'apparatus' in oculusPlugin) {
      await oculusPlugin.apparatus.stop?.();
    }
    clearGuild();
    cleanupTmpDir();
  });

  it('serves /static/style.css', async () => {
    const res = await fetch(`http://localhost:${port}/static/style.css`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('--bg: #1a1b26'));
    assert.ok(text.includes('.card'));
    assert.ok(text.includes('.badge'));
    assert.ok(text.includes('.badge--success'));
    assert.ok(text.includes('#oculus-nav'));
    assert.ok(text.includes('monospace'));
  });
});

// ── Integration tests: home page ──────────────────────────────────────

describe('Oculus home page', () => {
  let port: number;
  let oculusPlugin: ReturnType<typeof createOculus>;

  before(async () => {
    const home = makeTmpDir();
    port = 17790 + Math.floor(Math.random() * 100);

    const pages: PageContribution[] = [
      { id: 'dash', title: 'Dashboard', dir: 'pages/dash' },
    ];
    const kits: LoadedKit[] = [mockKit('my-kit', [], pages)];
    const instrumentarium = createMockInstrumentarium([]);

    // Create minimal node_modules structure for the page
    const nmDir = path.join(home, 'node_modules', '@test', 'my-kit', 'pages', 'dash');
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(path.join(nmDir, 'index.html'), '<html><head></head><body>Dash</body></html>');

    wireGuild({ home, kits, instrumentarium, guildName: 'my-guild', oculusPort: port });

    oculusPlugin = createOculus();
    const { ctx } = buildTestContext();
    if ('apparatus' in oculusPlugin) {
      await oculusPlugin.apparatus.start(ctx);
    }
  });

  after(async () => {
    if (oculusPlugin && 'apparatus' in oculusPlugin) {
      await oculusPlugin.apparatus.stop?.();
    }
    clearGuild();
    cleanupTmpDir();
  });

  it('returns HTML with guild name and page links', async () => {
    const res = await fetch(`http://localhost:${port}/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('my-guild'));
    assert.ok(text.includes('/pages/dash/'));
    assert.ok(text.includes('/static/style.css'));
    assert.ok(text.includes('<nav id="oculus-nav">'));
  });
});

// ── Integration tests: tool routes ────────────────────────────────────

describe('Oculus tool routes', () => {
  let port: number;
  let oculusPlugin: ReturnType<typeof createOculus>;

  before(async () => {
    const home = makeTmpDir();
    port = 17890 + Math.floor(Math.random() * 100);

    const tools = [
      tool({
        name: 'writ-list',
        description: 'List writs',
        permission: 'read',
        params: { limit: z.number().optional(), offset: z.number().optional() },
        handler: async (p) => ({ items: [], limit: p.limit, offset: p.offset }),
      }),
      tool({
        name: 'commission-post',
        description: 'Post commission',
        permission: 'clerk:write',
        params: { title: z.string() },
        handler: async (p) => ({ created: true, title: p.title }),
      }),
      tool({
        name: 'codex-remove',
        description: 'Remove codex',
        permission: 'delete',
        params: { id: z.string() },
        handler: async (p) => ({ deleted: p.id }),
      }),
      tool({
        name: 'signal',
        description: 'Send signal',
        params: { message: z.string().optional() },
        handler: async () => ({ ok: true }),
      }),
      tool({
        name: 'anima-only-tool',
        description: 'Anima only',
        callableBy: ['anima'],
        params: {},
        handler: async () => ({}),
      }),
    ];

    const instrumentarium = createMockInstrumentarium(tools);
    wireGuild({ home, kits: [], instrumentarium, oculusPort: port });

    oculusPlugin = createOculus();
    const { ctx } = buildTestContext();
    if ('apparatus' in oculusPlugin) {
      await oculusPlugin.apparatus.start(ctx);
    }
  });

  after(async () => {
    if (oculusPlugin && 'apparatus' in oculusPlugin) {
      await oculusPlugin.apparatus.stop?.();
    }
    clearGuild();
    cleanupTmpDir();
  });

  it('GET /api/writ/list is registered (read → GET)', async () => {
    const res = await fetch(`http://localhost:${port}/api/writ/list`);
    assert.equal(res.status, 200);
  });

  it('POST /api/commission/post is registered (clerk:write → POST)', async () => {
    const res = await fetch(`http://localhost:${port}/api/commission/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'test' }),
    });
    assert.equal(res.status, 200);
  });

  it('DELETE /api/codex/remove is registered (delete → DELETE)', async () => {
    const res = await fetch(`http://localhost:${port}/api/codex/remove`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '123' }),
    });
    assert.equal(res.status, 200);
  });

  it('GET /api/signal is registered (no permission → GET)', async () => {
    const res = await fetch(`http://localhost:${port}/api/signal`);
    assert.equal(res.status, 200);
  });

  it('anima-only tool has no route', async () => {
    // anima-only-tool → /api/anima/only-tool — not registered
    const res = await fetch(`http://localhost:${port}/api/anima/only-tool`);
    assert.ok(res.status === 404 || res.status === 405);
  });

  it('query params are coerced to numbers', async () => {
    const res = await fetch(`http://localhost:${port}/api/writ/list?limit=5&offset=0`);
    assert.equal(res.status, 200);
    const data = await res.json() as { limit: number; offset: number };
    assert.equal(data.limit, 5);
    assert.equal(data.offset, 0);
    assert.equal(typeof data.limit, 'number');
  });

  it('returns 400 on Zod validation failure', async () => {
    const res = await fetch(`http://localhost:${port}/api/commission/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wrong_field: 'x' }), // missing required 'title'
    });
    assert.equal(res.status, 400);
    const data = await res.json() as { error: string; details: unknown };
    assert.ok(typeof data.error === 'string');
    assert.ok('details' in data);
  });

  it('returns 200 on successful optional-params GET', async () => {
    const res = await fetch(`http://localhost:${port}/api/writ/list`);
    assert.equal(res.status, 200);
  });
});

// ── Integration tests: /api/_tools ───────────────────────────────────

describe('Oculus /api/_tools', () => {
  let port: number;
  let oculusPlugin: ReturnType<typeof createOculus>;

  before(async () => {
    const home = makeTmpDir();
    port = 17990 + Math.floor(Math.random() * 100);

    const tools = [
      tool({
        name: 'writ-list',
        description: 'List writs',
        permission: 'read',
        params: {
          limit: z.number().optional().describe('Max results'),
          status: z.enum(['open', 'closed']).optional(),
        },
        handler: async () => ({ items: [] }),
      }),
    ];

    const instrumentarium = createMockInstrumentarium(tools);
    wireGuild({ home, kits: [], instrumentarium, oculusPort: port });

    oculusPlugin = createOculus();
    const { ctx } = buildTestContext();
    if ('apparatus' in oculusPlugin) {
      await oculusPlugin.apparatus.start(ctx);
    }
  });

  after(async () => {
    if (oculusPlugin && 'apparatus' in oculusPlugin) {
      await oculusPlugin.apparatus.stop?.();
    }
    clearGuild();
    cleanupTmpDir();
  });

  it('returns JSON array of tool entries', async () => {
    const res = await fetch(`http://localhost:${port}/api/_tools`);
    assert.equal(res.status, 200);
    const data = await res.json() as unknown[];
    assert.ok(Array.isArray(data));
  });

  it('each entry has name, route, method, description, params', async () => {
    const res = await fetch(`http://localhost:${port}/api/_tools`);
    const data = await res.json() as Array<Record<string, unknown>>;
    // Find writ-list entry
    const entry = data.find((e) => e.name === 'writ-list');
    assert.ok(entry, 'writ-list should be in _tools');
    assert.equal(entry.route, '/api/writ/list');
    assert.equal(entry.method, 'GET');
    assert.equal(entry.description, 'List writs');
    assert.ok(typeof entry.params === 'object' && entry.params !== null);
    const params = entry.params as Record<string, { type: string; description: string | null; optional: boolean }>;
    assert.ok('limit' in params);
    assert.equal(params.limit.type, 'number');
    assert.equal(params.limit.optional, true);
  });
});

// ── Integration tests: custom routes ─────────────────────────────────

describe('Oculus custom routes', () => {
  let port: number;
  let oculusPlugin: ReturnType<typeof createOculus>;

  before(async () => {
    const home = makeTmpDir();
    port = 18090 + Math.floor(Math.random() * 100);

    const routes: RouteContribution[] = [
      {
        method: 'GET',
        path: '/api/custom/stream',
        handler: (c: import('hono').Context) => c.json({ custom: true }),
      },
    ];

    const kits: LoadedKit[] = [mockKit('my-kit', [], undefined, routes)];
    const instrumentarium = createMockInstrumentarium([]);
    wireGuild({ home, kits, instrumentarium, oculusPort: port });

    oculusPlugin = createOculus();
    const { ctx } = buildTestContext();
    if ('apparatus' in oculusPlugin) {
      await oculusPlugin.apparatus.start(ctx);
    }
  });

  after(async () => {
    if (oculusPlugin && 'apparatus' in oculusPlugin) {
      await oculusPlugin.apparatus.stop?.();
    }
    clearGuild();
    cleanupTmpDir();
  });

  it('custom route at /api/custom/stream is accessible', async () => {
    const res = await fetch(`http://localhost:${port}/api/custom/stream`);
    assert.equal(res.status, 200);
    const data = await res.json() as { custom: boolean };
    assert.equal(data.custom, true);
  });
});

describe('Oculus invalid custom routes', () => {
  it('rejects custom route not starting with /api/', async () => {
    const home = makeTmpDir();
    const port = 18190 + Math.floor(Math.random() * 100);

    const routes: RouteContribution[] = [
      {
        method: 'GET',
        path: '/not-api/foo',
        handler: (c: import('hono').Context) => c.json({ bad: true }),
      },
    ];

    const kits: LoadedKit[] = [mockKit('my-kit', [], undefined, routes)];
    const instrumentarium = createMockInstrumentarium([]);
    wireGuild({ home, kits, instrumentarium, oculusPort: port });

    const plugin = createOculus();
    const { ctx } = buildTestContext();
    if ('apparatus' in plugin) {
      await plugin.apparatus.start(ctx);
    }

    try {
      // /not-api/foo should NOT be accessible (not registered)
      const res = await fetch(`http://localhost:${port}/not-api/foo`);
      assert.ok(res.status === 404, `Expected 404, got ${res.status}`);
    } finally {
      if ('apparatus' in plugin) {
        await plugin.apparatus.stop?.();
      }
      clearGuild();
      cleanupTmpDir();
    }
  });
});

=== FILE: packages/plugins/oculus/src/oculus.ts ===
/**
 * The Oculus — web dashboard apparatus.
 *
 * Serves a web dashboard via Hono. Plugins contribute pages as static asset
 * directories and custom API routes through kit contributions. Guild tools are
 * automatically exposed as REST endpoints.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import { z } from 'zod';

import type { Plugin, StartupContext, LoadedKit, LoadedApparatus } from '@shardworks/nexus-core';
import { guild } from '@shardworks/nexus-core';
import type { InstrumentariumApi } from '@shardworks/tools-apparatus';

import type { OculusApi, OculusConfig, OculusKit, PageContribution, RouteContribution } from './types.ts';

// ── MIME types ────────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

// ── Tool→REST mapping helpers ─────────────────────────────────────────

export function toolNameToRoute(name: string): string {
  const idx = name.indexOf('-');
  if (idx === -1) return `/api/${name}`;
  return `/api/${name.slice(0, idx)}/${name.slice(idx + 1)}`;
}

export function permissionToMethod(permission: string | undefined): 'GET' | 'POST' | 'DELETE' {
  if (permission === undefined) return 'GET';
  const level = permission.includes(':')
    ? permission.slice(permission.lastIndexOf(':') + 1)
    : permission;
  if (level === 'read') return 'GET';
  if (level === 'write' || level === 'admin') return 'POST';
  if (level === 'delete') return 'DELETE';
  return 'POST';
}

// ── Query param coercion ──────────────────────────────────────────────

function isNumberSchema(schema: z.ZodTypeAny): boolean {
  let inner: z.ZodTypeAny = schema;
  if (inner instanceof z.ZodOptional) inner = inner.unwrap() as z.ZodTypeAny;
  if (inner instanceof z.ZodDefault) inner = inner.unwrap() as z.ZodTypeAny;
  if (inner instanceof z.ZodOptional) inner = inner.unwrap() as z.ZodTypeAny;
  return inner instanceof z.ZodNumber;
}

function isBooleanSchema(schema: z.ZodTypeAny): boolean {
  let inner: z.ZodTypeAny = schema;
  if (inner instanceof z.ZodOptional) inner = inner.unwrap() as z.ZodTypeAny;
  if (inner instanceof z.ZodDefault) inner = inner.unwrap() as z.ZodTypeAny;
  if (inner instanceof z.ZodOptional) inner = inner.unwrap() as z.ZodTypeAny;
  return inner instanceof z.ZodBoolean;
}

export function coerceParams(
  shape: Record<string, z.ZodTypeAny>,
  params: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...params };
  for (const [key, schema] of Object.entries(shape)) {
    const value = result[key];
    if (typeof value !== 'string') continue;
    if (isNumberSchema(schema)) {
      result[key] = Number(value);
    } else if (isBooleanSchema(schema)) {
      result[key] = value === 'true';
    }
  }
  return result;
}

// ── Chrome injection ─────────────────────────────────────────────────

export function injectChrome(html: string, stylesheetPath: string, navHtml: string): string {
  // Check for </head> case-insensitively
  const headCloseMatch = html.match(/<\/head>/i);
  const bodyOpenMatch = html.match(/<body[^>]*>/i);

  // If neither tag present, return unmodified
  if (!headCloseMatch && !bodyOpenMatch) return html;

  let result = html;

  // Insert stylesheet link before </head>
  if (headCloseMatch && headCloseMatch.index !== undefined) {
    const idx = headCloseMatch.index;
    result =
      result.slice(0, idx) +
      `<link rel="stylesheet" href="${stylesheetPath}">` +
      result.slice(idx);
  }

  // Insert nav after <body...>
  // Need to recalculate position after potential head insertion
  const bodyMatch = result.match(/<body[^>]*>/i);
  if (bodyMatch && bodyMatch.index !== undefined) {
    const idx = bodyMatch.index + bodyMatch[0].length;
    result = result.slice(0, idx) + navHtml + result.slice(idx);
  }

  return result;
}

function buildNavHtml(pages: PageContribution[]): string {
  const pageLinks = pages
    .map((p) => `<a href="/pages/${p.id}/">${p.title}</a>`)
    .join('\n  ');
  return `<nav id="oculus-nav">
  <a href="/">Guild</a>
  ${pageLinks}
</nav>`;
}

// ── Tool param extraction (reimplemented from tools-show) ────────────

interface ParamInfo {
  type: string;
  description: string | null;
  optional: boolean;
}

function zodTypeToJsonType(zodType: z.ZodType): string {
  if (zodType instanceof z.ZodString) return 'string';
  if (zodType instanceof z.ZodNumber) return 'number';
  if (zodType instanceof z.ZodBoolean) return 'boolean';
  if (zodType instanceof z.ZodArray) return 'array';
  if (zodType instanceof z.ZodObject) return 'object';
  if (zodType instanceof z.ZodEnum) return 'string';
  if (zodType instanceof z.ZodLiteral) return typeof zodType._def.values[0];
  if (zodType instanceof z.ZodUnion) return 'union';
  if (zodType instanceof z.ZodNullable) return zodTypeToJsonType(zodType.unwrap() as z.ZodType);
  return 'unknown';
}

function extractSingleParam(zodType: z.ZodType): ParamInfo {
  let isOptional = false;
  let inner: z.ZodType = zodType;

  if (inner instanceof z.ZodOptional) {
    isOptional = true;
    inner = inner.unwrap() as z.ZodType;
  }
  if (inner instanceof z.ZodDefault) {
    isOptional = true;
    inner = inner.unwrap() as z.ZodType;
  }

  return {
    type: zodTypeToJsonType(inner),
    description: inner.description ?? null,
    optional: isOptional,
  };
}

function extractParams(schema: z.ZodObject<z.ZodRawShape>): Record<string, ParamInfo> {
  const shape = schema.shape;
  const result: Record<string, ParamInfo> = {};
  for (const [key, zodType] of Object.entries(shape)) {
    result[key] = extractSingleParam(zodType as z.ZodType);
  }
  return result;
}

// ── Apparatus factory ─────────────────────────────────────────────────

export function createOculus(): Plugin {
  let serverPort = 7470;
  let server: Server | null = null;

  const api: OculusApi = {
    port(): number {
      return serverPort;
    },
  };

  return {
    apparatus: {
      requires: ['tools'],
      consumes: ['pages', 'routes'],
      provides: api,

      async start(ctx: StartupContext): Promise<void> {
        const g = guild();
        const oculusConfig: OculusConfig = g.guildConfig().oculus ?? {};
        const port = oculusConfig.port ?? 7470;

        const app = new Hono();

        // Track registered pages and custom route paths
        const pages: PageContribution[] = [];
        const customRoutePaths = new Set<string>();
        const mappedToolRoutes = new Set<string>();

        // ── Custom route registration helper ─────────────────────────
        function registerCustomRoute(route: RouteContribution, pluginId: string): void {
          if (!route.path.startsWith('/api/')) {
            console.warn(`[oculus] Custom route "${route.path}" from "${pluginId}" must start with /api/ — skipped`);
            return;
          }
          const method = route.method.toLowerCase() as keyof typeof app;
          (app[method] as (path: string, handler: (c: unknown) => unknown) => void)(
            route.path,
            route.handler as (c: unknown) => unknown,
          );
          customRoutePaths.add(route.path);
        }

        // ── Page serving helper ───────────────────────────────────────
        function resolveDirForPackage(packageName: string, dir: string): string {
          return path.join(g.home, 'node_modules', packageName, dir);
        }

        function registerPage(page: PageContribution, resolvedDir: string): void {
          pages.push({ ...page });

          app.get(`/pages/${page.id}/*`, async (c) => {
            const requestPath = c.req.path;
            const prefix = `/pages/${page.id}/`;
            const filePath = requestPath.slice(prefix.length) || 'index.html';

            // Prevent directory traversal
            if (filePath.includes('..')) {
              return c.text('Not found', 404);
            }

            const absolutePath = path.join(resolvedDir, filePath);

            // Ensure file is within resolved dir
            if (!absolutePath.startsWith(resolvedDir)) {
              return c.text('Not found', 404);
            }

            try {
              const content = fs.readFileSync(absolutePath);
              const mimeType = getMimeType(absolutePath);

              // Only inject chrome for the root index.html
              const isIndexHtml = filePath === 'index.html' || filePath === '';
              if (isIndexHtml && mimeType.startsWith('text/html')) {
                const html = content.toString('utf-8');
                const navHtml = buildNavHtml(pages);
                const injected = injectChrome(html, '/static/style.css', navHtml);
                return new Response(injected, {
                  headers: { 'Content-Type': 'text/html; charset=utf-8' },
                });
              }

              return new Response(content, {
                headers: { 'Content-Type': mimeType },
              });
            } catch {
              return c.text('Not found', 404);
            }
          });
        }

        // ── Tool route registration helper ───────────────────────────
        function registerToolRoute(
          toolDef: import('@shardworks/tools-apparatus').ToolDefinition,
          instrumentarium: InstrumentariumApi,
        ): void {
          const routePath = toolNameToRoute(toolDef.name);
          const method = permissionToMethod(toolDef.permission);

          if (mappedToolRoutes.has(routePath)) return;

          if (customRoutePaths.has(routePath)) {
            console.warn(
              `[oculus] Tool route ${method} ${routePath} conflicts with custom route from plugin — skipped`,
            );
            return;
          }

          void instrumentarium; // suppress unused warning

          const shape = toolDef.params.shape as Record<string, z.ZodTypeAny>;

          if (method === 'GET') {
            app.get(routePath, async (c) => {
              try {
                const rawQuery = c.req.query();
                const coerced = coerceParams(shape, rawQuery);
                const validated = toolDef.params.parse(coerced);
                const result = await toolDef.handler(validated);
                return c.json(result);
              } catch (err) {
                if (err instanceof z.ZodError) {
                  return c.json({ error: err.message, details: err.issues }, 400);
                }
                const message = err instanceof Error ? err.message : String(err);
                return c.json({ error: message }, 500);
              }
            });
          } else if (method === 'DELETE') {
            app.delete(routePath, async (c) => {
              try {
                const body = await c.req.json();
                const validated = toolDef.params.parse(body);
                const result = await toolDef.handler(validated);
                return c.json(result);
              } catch (err) {
                if (err instanceof z.ZodError) {
                  return c.json({ error: err.message, details: err.issues }, 400);
                }
                const message = err instanceof Error ? err.message : String(err);
                return c.json({ error: message }, 500);
              }
            });
          } else {
            app.post(routePath, async (c) => {
              try {
                const body = await c.req.json();
                const validated = toolDef.params.parse(body);
                const result = await toolDef.handler(validated);
                return c.json(result);
              } catch (err) {
                if (err instanceof z.ZodError) {
                  return c.json({ error: err.message, details: err.issues }, 400);
                }
                const message = err instanceof Error ? err.message : String(err);
                return c.json({ error: message }, 500);
              }
            });
          }

          mappedToolRoutes.add(routePath);
        }

        // ── Scan contributions from a kit ────────────────────────────
        function scanKit(kit: LoadedKit): void {
          const oculusKit = kit.kit as OculusKit;

          if (oculusKit.routes) {
            for (const route of oculusKit.routes) {
              registerCustomRoute(route, kit.id);
            }
          }

          if (oculusKit.pages) {
            for (const page of oculusKit.pages) {
              const resolvedDir = resolveDirForPackage(kit.packageName, page.dir);
              registerPage(page, resolvedDir);
            }
          }
        }

        function scanApparatus(apparatus: LoadedApparatus): void {
          if (!apparatus.apparatus.supportKit) return;
          const oculusKit = apparatus.apparatus.supportKit as OculusKit;

          if (oculusKit.routes) {
            for (const route of oculusKit.routes) {
              registerCustomRoute(route, apparatus.id);
            }
          }

          if (oculusKit.pages) {
            for (const page of oculusKit.pages) {
              const resolvedDir = resolveDirForPackage(apparatus.packageName, page.dir);
              registerPage(page, resolvedDir);
            }
          }
        }

        // ── Scan existing kits and apparatuses ───────────────────────
        for (const kit of g.kits()) {
          scanKit(kit);
        }
        for (const apparatus of g.apparatuses()) {
          scanApparatus(apparatus);
        }

        // ── Register custom routes first ─────────────────────────────
        // (already done in scanKit/scanApparatus above)

        // ── Register tool routes ─────────────────────────────────────
        const instrumentarium = g.apparatus<InstrumentariumApi>('tools');
        const allTools = instrumentarium.list();
        const patronTools = allTools.filter(
          (r) => !r.definition.callableBy || r.definition.callableBy.includes('patron'),
        );

        for (const resolved of patronTools) {
          registerToolRoute(resolved.definition, instrumentarium);
        }

        // ── GET /api/_tools ──────────────────────────────────────────
        app.get('/api/_tools', (c) => {
          const tools = instrumentarium.list().filter(
            (r) => !r.definition.callableBy || r.definition.callableBy.includes('patron'),
          );

          const entries = tools.map((r) => ({
            name: r.definition.name,
            route: toolNameToRoute(r.definition.name),
            method: permissionToMethod(r.definition.permission),
            description: r.definition.description,
            params: extractParams(r.definition.params),
          }));

          return c.json(entries);
        });

        // ── Static assets ────────────────────────────────────────────
        const staticDir = path.join(import.meta.dirname, 'static');
        app.get('/static/*', (c) => {
          const requestPath = c.req.path;
          const filePath = requestPath.slice('/static/'.length);

          if (filePath.includes('..')) {
            return c.text('Not found', 404);
          }

          const absolutePath = path.join(staticDir, filePath);
          try {
            const content = fs.readFileSync(absolutePath);
            const mimeType = getMimeType(absolutePath);
            return new Response(content, {
              headers: { 'Content-Type': mimeType },
            });
          } catch {
            return c.text('Not found', 404);
          }
        });

        // ── Home page ────────────────────────────────────────────────
        app.get('/', (c) => {
          const guildName = g.guildConfig().name;
          const navHtml = buildNavHtml(pages);

          const pageLinks =
            pages.length > 0
              ? pages
                  .map(
                    (p) =>
                      `<li><a href="/pages/${p.id}/">${p.title}</a></li>`,
                  )
                  .join('\n        ')
              : '<li class="empty-state">No pages registered.</li>';

          const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${guildName} — Guild Dashboard</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
${navHtml}
<main style="padding: 24px;">
  <h1>${guildName}</h1>
  <div class="card">
    <h2>Pages</h2>
    <ul>
        ${pageLinks}
    </ul>
  </div>
</main>
</body>
</html>`;

          return c.html(html);
        });

        // ── Late-arriving plugins ─────────────────────────────────────
        ctx.on('plugin:initialized', (plugin: unknown) => {
          const loaded = plugin as LoadedApparatus | LoadedKit;
          if ('apparatus' in loaded) {
            scanApparatus(loaded as LoadedApparatus);
          } else if ('kit' in loaded) {
            scanKit(loaded as LoadedKit);
          }

          // Check for new patron-callable tools
          const currentTools = instrumentarium.list().filter(
            (r) => !r.definition.callableBy || r.definition.callableBy.includes('patron'),
          );
          for (const resolved of currentTools) {
            registerToolRoute(resolved.definition, instrumentarium);
          }
        });

        // ── Start HTTP server ─────────────────────────────────────────
        await new Promise<void>((resolve, reject) => {
          server = serve({ fetch: app.fetch, port }, () => {
            serverPort = port;
            console.log(`[oculus] Listening on http://localhost:${port}`);
            resolve();
          }) as Server;
          server.on('error', reject);
        });
      },

      async stop(): Promise<void> {
        if (server) {
          await new Promise<void>((resolve, reject) => {
            server!.close((err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          server = null;
        }
      },
    },
  };
}

=== FILE: packages/plugins/oculus/src/static/style.css ===
/* Oculus shared stylesheet — Tokyo Night palette */

/* ── Custom properties ───────────────────────────────────────────── */
:root {
  --bg: #1a1b26;
  --surface: #24283b;
  --surface2: #2f3549;
  --border: #3b4261;
  --text: #c0caf5;
  --text-dim: #565f89;
  --text-bright: #e0e6ff;
  --green: #9ece6a;
  --red: #f7768e;
  --yellow: #e0af68;
  --cyan: #7dcfff;
  --magenta: #bb9af7;
  --blue: #7aa2f7;
  --font-mono: "SF Mono", "Fira Code", "JetBrains Mono", monospace;
}

/* ── Element-type selectors ──────────────────────────────────────── */
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  margin: 0;
  padding: 0;
}

h1, h2, h3, h4 {
  color: var(--text-bright);
  font-weight: 600;
}

a {
  color: var(--cyan);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  text-align: left;
  padding: 8px;
  border-bottom: 1px solid var(--border);
}

th {
  color: var(--text-dim);
  font-weight: 500;
}

button {
  background: var(--blue);
  color: var(--bg);
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 13px;
}

button:hover {
  opacity: 0.9;
}

input, select, textarea {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 10px;
  font-family: var(--font-mono);
  font-size: 13px;
  outline: none;
}

input:focus, select:focus, textarea:focus {
  border-color: var(--cyan);
}

pre, code {
  background: var(--surface);
  border-radius: 4px;
}

code {
  padding: 2px 6px;
}

pre {
  padding: 16px;
  overflow-x: auto;
}

pre code {
  background: none;
  padding: 0;
  border-radius: 0;
}

/* ── Utility classes ─────────────────────────────────────────────── */
#oculus-nav {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 8px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

#oculus-nav a {
  color: var(--text-dim);
  font-size: 12px;
  text-decoration: none;
}

#oculus-nav a:hover,
#oculus-nav a:active {
  color: var(--text);
  text-decoration: none;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}

.badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--surface2);
  color: var(--text-dim);
}

.badge--success {
  background: rgba(158, 206, 106, 0.15);
  color: var(--green);
}

.badge--error {
  background: rgba(247, 118, 142, 0.15);
  color: var(--red);
}

.badge--warning {
  background: rgba(224, 175, 104, 0.15);
  color: var(--yellow);
}

.badge--info {
  background: rgba(125, 207, 255, 0.15);
  color: var(--cyan);
}

.badge--active {
  background: rgba(125, 207, 255, 0.15);
  color: var(--cyan);
  animation: pulse 2s infinite;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table tr:nth-child(even) {
  background: rgba(47, 53, 73, 0.3);
}

.btn {
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 13px;
}

.btn--primary {
  background: var(--blue);
  color: var(--bg);
}

.btn--success {
  background: var(--green);
  color: var(--bg);
}

.btn--danger {
  background: var(--red);
  color: var(--bg);
}

.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
}

.empty-state {
  text-align: center;
  padding: 48px 16px;
  color: var(--text-dim);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

=== FILE: packages/plugins/oculus/src/types.ts ===
import type { Context } from 'hono';

/** A page contributed by a plugin kit or apparatus supportKit. */
export interface PageContribution {
  /** Unique page ID — becomes the URL segment: /pages/{id}/ */
  id: string;
  /** Human-readable title used in navigation. */
  title: string;
  /**
   * Path to the directory containing the page's static assets,
   * relative to the contributing package's root in node_modules.
   * Must contain an index.html entry point.
   */
  dir: string;
}

/** A custom route contributed by a plugin kit or apparatus supportKit. */
export interface RouteContribution {
  /** HTTP method (uppercase): 'GET', 'POST', 'DELETE', etc. */
  method: string;
  /** Hono path pattern. Must begin with /api/. */
  path: string;
  /** Hono handler function. */
  handler: (c: Context) => Response | Promise<Response>;
}

/** Kit contribution interface — consumed by the Oculus. */
export interface OculusKit {
  pages?: PageContribution[];
  routes?: RouteContribution[];
}

/** The Oculus configuration from guild.json under 'oculus'. */
export interface OculusConfig {
  /** Port to listen on. Default: 7470. */
  port?: number;
}

/** The Oculus's public API, exposed via provides. */
export interface OculusApi {
  /** The port the server is listening on. */
  port(): number;
}

=== FILE: packages/plugins/oculus/tsconfig.json ===
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": [
    "src"
  ],
  "exclude": [
    "src/**/*.test.ts"
  ]
}

=== FILE: packages/plugins/tools/src/instrumentarium.test.ts ===
/**
 * Instrumentarium — unit tests.
 *
 * Tests the tool registry, permission-based resolution, strict mode,
 * and channel filtering. Uses a mock guild() singleton to simulate
 * the plugin environment.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import {
  setGuild,
  clearGuild,
} from '@shardworks/nexus-core';
import type {
  Guild,
  LoadedKit,
  LoadedApparatus,
  StartupContext,
} from '@shardworks/nexus-core';

import { tool } from './tool.ts';
import {
  createInstrumentarium,
  type InstrumentariumApi,
} from './instrumentarium.ts';

// ── Test helpers ──────────────────────────────────────────────────────

/** Create a minimal tool definition for testing. */
function testTool(
  name: string,
  opts?: { callableBy?: ('patron' | 'anima' | 'library')[]; permission?: string },
) {
  return tool({
    name,
    description: `Test tool: ${name}`,
    params: {},
    handler: async () => ({ ok: true }),
    ...(opts?.callableBy ? { callableBy: opts.callableBy } : {}),
    ...(opts?.permission !== undefined ? { permission: opts.permission } : {}),
  });
}

/** Build a mock LoadedKit. */
function mockKit(id: string, tools: unknown[]): LoadedKit {
  return {
    packageName: `@test/${id}`,
    id,
    version: '0.0.0',
    kit: { tools },
  };
}

/** Build a mock LoadedApparatus with supportKit tools. */
function mockApparatus(
  id: string,
  supportKitTools: unknown[],
): LoadedApparatus {
  return {
    packageName: `@test/${id}`,
    id,
    version: '0.0.0',
    apparatus: {
      start() {},
      supportKit: { tools: supportKitTools },
    },
  };
}

/** Build a mock Guild and wire it into the singleton. */
function wireGuild(opts: {
  kits?: LoadedKit[];
  apparatuses?: LoadedApparatus[];
  home?: string;
}): void {
  const kits = opts.kits ?? [];
  const apparatuses = opts.apparatuses ?? [];

  const mockGuild: Guild = {
    home: opts.home ?? '/tmp/test-guild',
    apparatus<T>(_name: string): T {
      throw new Error('Not implemented in test');
    },
    config<T>(_pluginId: string): T {
      return {} as T;
    },
    writeConfig() { /* noop in test */ },
    guildConfig() {
      return {
        name: 'test',
        nexus: '0.0.0',
        workshops: {},
        plugins: [],
      };
    },
    kits() { return [...kits]; },
    apparatuses() { return [...apparatuses]; },
  };

  setGuild(mockGuild);
}

/**
 * Build a StartupContext that captures event subscriptions.
 * Returns both the context and a fire() function to trigger events.
 */
function buildTestContext(): {
  ctx: StartupContext;
  fire: (event: string, ...args: unknown[]) => Promise<void>;
} {
  const handlers = new Map<string, Array<(...args: unknown[]) => void | Promise<void>>>();

  const ctx: StartupContext = {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  };

  async function fire(event: string, ...args: unknown[]): Promise<void> {
    for (const h of handlers.get(event) ?? []) {
      await h(...args);
    }
  }

  return { ctx, fire };
}

/** Start the Instrumentarium and return its API. */
function startInstrumentarium(opts: {
  kits?: LoadedKit[];
  apparatuses?: LoadedApparatus[];
  home?: string;
}): { api: InstrumentariumApi; fire: (event: string, ...args: unknown[]) => Promise<void> } {
  wireGuild(opts);

  const plugin = createInstrumentarium();
  const api = ('apparatus' in plugin ? plugin.apparatus.provides : null) as InstrumentariumApi;
  assert.ok(api, 'Instrumentarium must have provides');

  const { ctx, fire } = buildTestContext();
  if ('apparatus' in plugin) {
    plugin.apparatus.start(ctx);
  }

  return { api, fire };
}

// ── Constants ────────────────────────────────────────────────────────

/** Names of the Instrumentarium's self-registered introspection tools. */
const SELF_TOOLS = new Set(['tools-list', 'tools-show']);

/** Filter out the Instrumentarium's own tools for tests that count external tools. */
function externalOnly(tools: { definition: { name: string } }[]) {
  return tools.filter((t) => !SELF_TOOLS.has(t.definition.name));
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Instrumentarium', () => {
  afterEach(() => {
    clearGuild();
  });

  describe('list()', () => {
    it('returns only self-registered tools when no external tools installed', () => {
      const { api } = startInstrumentarium({});
      const external = externalOnly(api.list());
      assert.equal(external.length, 0);
      // Self-registered introspection tools are always present
      assert.ok(api.find('tools-list'));
      assert.ok(api.find('tools-show'));
    });

    it('scans tools from kits loaded before startup', () => {
      const t1 = testTool('alpha');
      const t2 = testTool('beta');
      const kit = mockKit('my-kit', [t1, t2]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const tools = externalOnly(api.list());
      assert.equal(tools.length, 2);
      assert.deepStrictEqual(
        tools.map((t) => t.definition.name).sort(),
        ['alpha', 'beta'],
      );
      assert.ok(tools.every((t) => t.pluginId === 'my-kit'));
    });

    it('scans tools from apparatus supportKits via plugin:initialized', async () => {
      const t1 = testTool('gamma');
      const app = mockApparatus('my-apparatus', [t1]);

      const { api, fire } = startInstrumentarium({});

      // Simulate apparatus loading after Instrumentarium started
      await fire('plugin:initialized', app);

      const tools = externalOnly(api.list());
      assert.equal(tools.length, 1);
      assert.equal(tools[0]!.definition.name, 'gamma');
      assert.equal(tools[0]!.pluginId, 'my-apparatus');
    });

    it('combines tools from multiple kits and apparatus', async () => {
      const kit = mockKit('kit-a', [testTool('one'), testTool('two')]);
      const app = mockApparatus('app-b', [testTool('three')]);

      const { api, fire } = startInstrumentarium({ kits: [kit] });
      await fire('plugin:initialized', app);

      assert.equal(externalOnly(api.list()).length, 3);
    });

    it('ignores non-tool entries in kit contributions', () => {
      const kit = mockKit('messy-kit', [
        testTool('valid'),
        'not a tool',
        42,
        null,
        { name: 'incomplete' },
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });
      const external = externalOnly(api.list());
      assert.equal(external.length, 1);
      assert.equal(external[0]!.definition.name, 'valid');
    });

    it('last-write-wins for duplicate tool names', () => {
      const kit1 = mockKit('kit-1', [testTool('dup')]);
      const kit2 = mockKit('kit-2', [testTool('dup')]);

      const { api } = startInstrumentarium({ kits: [kit1, kit2] });

      const dups = externalOnly(api.list()).filter(
        (t) => t.definition.name === 'dup',
      );
      assert.equal(dups.length, 1);
      assert.equal(dups[0]!.pluginId, 'kit-2');
    });

    it('returns all tools regardless of permissions', () => {
      const kit = mockKit('my-kit', [
        testTool('read-tool', { permission: 'read' }),
        testTool('write-tool', { permission: 'write' }),
        testTool('free-tool'),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });
      assert.equal(externalOnly(api.list()).length, 3);
    });
  });

  describe('find()', () => {
    it('returns null for unknown tool', () => {
      const { api } = startInstrumentarium({});
      assert.equal(api.find('nonexistent'), null);
    });

    it('finds a tool by name', () => {
      const kit = mockKit('my-kit', [testTool('target')]);
      const { api } = startInstrumentarium({ kits: [kit] });

      const result = api.find('target');
      assert.ok(result);
      assert.equal(result.definition.name, 'target');
      assert.equal(result.pluginId, 'my-kit');
    });
  });

  describe('resolve() — permission matching', () => {
    it('exact match: plugin:level', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('create-writ', { permission: 'write' }),
        testTool('list-writs', { permission: 'read' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const resolved = api.resolve({ permissions: ['nexus-stdlib:write'] });
      assert.equal(resolved.length, 1);
      assert.equal(resolved[0]!.definition.name, 'create-writ');
    });

    it('plugin wildcard: plugin:* matches any level', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('create-writ', { permission: 'write' }),
        testTool('list-writs', { permission: 'read' }),
        testTool('delete-writ', { permission: 'delete' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const resolved = api.resolve({ permissions: ['nexus-stdlib:*'] });
      assert.equal(resolved.length, 3);
    });

    it('level wildcard: *:level matches any plugin', () => {
      const kit1 = mockKit('nexus-stdlib', [
        testTool('list-writs', { permission: 'read' }),
        testTool('create-writ', { permission: 'write' }),
      ]);
      const kit2 = mockKit('clockworks', [
        testTool('clock-status', { permission: 'read' }),
        testTool('clock-start', { permission: 'admin' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit1, kit2] });

      const resolved = externalOnly(api.resolve({ permissions: ['*:read'] }));
      assert.equal(resolved.length, 2);
      const names = resolved.map((t) => t.definition.name).sort();
      assert.deepStrictEqual(names, ['clock-status', 'list-writs']);
    });

    it('superuser: *:* matches everything', () => {
      const kit1 = mockKit('nexus-stdlib', [
        testTool('create-writ', { permission: 'write' }),
        testTool('list-writs', { permission: 'read' }),
      ]);
      const kit2 = mockKit('clockworks', [
        testTool('clock-start', { permission: 'admin' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit1, kit2] });

      const resolved = externalOnly(api.resolve({ permissions: ['*:*'] }));
      assert.equal(resolved.length, 3);
    });

    it('non-matching grants correctly exclude', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('create-writ', { permission: 'write' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      // Wrong level
      assert.equal(
        api.resolve({ permissions: ['nexus-stdlib:read'] }).length,
        0,
      );

      // Wrong plugin
      assert.equal(
        api.resolve({ permissions: ['other:write'] }).length,
        0,
      );

      // Wrong plugin wildcard
      assert.equal(
        api.resolve({ permissions: ['other:*'] }).length,
        0,
      );
    });

    it('multiple grants are unioned', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('create-writ', { permission: 'write' }),
        testTool('list-writs', { permission: 'read' }),
        testTool('delete-writ', { permission: 'delete' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const resolved = api.resolve({
        permissions: ['nexus-stdlib:read', 'nexus-stdlib:write'],
      });
      assert.equal(resolved.length, 2);
      const names = resolved.map((t) => t.definition.name).sort();
      assert.deepStrictEqual(names, ['create-writ', 'list-writs']);
    });

    it('no hierarchy — write does not imply read', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('list-writs', { permission: 'read' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const resolved = api.resolve({ permissions: ['nexus-stdlib:write'] });
      assert.equal(resolved.length, 0);
    });

    it('ignores malformed grants (no colon)', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('list-writs', { permission: 'read' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const resolved = api.resolve({ permissions: ['nexus-stdlib-read', 'nexus-stdlib:read'] });
      assert.equal(resolved.length, 1);
    });
  });

  describe('resolve() — permissionless tools', () => {
    it('default mode: permissionless tools always included', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('signal'), // no permission
        testTool('create-writ', { permission: 'write' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      // Even with no matching grants for 'write', 'signal' is included
      const resolved = api.resolve({ permissions: [] });
      assert.equal(resolved.length, 1);
      assert.equal(resolved[0]!.definition.name, 'signal');
    });

    it('default mode: permissionless tools included alongside permission-matched tools', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('signal'), // no permission
        testTool('create-writ', { permission: 'write' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const resolved = api.resolve({ permissions: ['nexus-stdlib:write'] });
      assert.equal(resolved.length, 2);
    });

    it('strict mode: permissionless tools excluded', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('signal'), // no permission
        testTool('create-writ', { permission: 'write' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const resolved = api.resolve({
        permissions: ['nexus-stdlib:write'],
        strict: true,
      });
      assert.equal(resolved.length, 1);
      assert.equal(resolved[0]!.definition.name, 'create-writ');
    });

    it('strict mode: plugin:* includes permissionless tools from that plugin', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('signal'), // no permission
        testTool('create-writ', { permission: 'write' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const resolved = api.resolve({
        permissions: ['nexus-stdlib:*'],
        strict: true,
      });
      assert.equal(resolved.length, 2);
    });

    it('strict mode: *:* includes all permissionless tools', () => {
      const kit1 = mockKit('nexus-stdlib', [testTool('signal')]);
      const kit2 = mockKit('clockworks', [testTool('emit')]);

      const { api } = startInstrumentarium({ kits: [kit1, kit2] });

      const resolved = externalOnly(api.resolve({
        permissions: ['*:*'],
        strict: true,
      }));
      assert.equal(resolved.length, 2);
    });

    it('strict mode: specific plugin:level does NOT include permissionless tools', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('signal'), // no permission
        testTool('create-writ', { permission: 'write' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const resolved = api.resolve({
        permissions: ['nexus-stdlib:write'],
        strict: true,
      });
      assert.equal(resolved.length, 1);
      assert.equal(resolved[0]!.definition.name, 'create-writ');
    });

    it('strict mode: *:level does NOT include permissionless tools', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('signal'), // no permission
        testTool('list-writs', { permission: 'read' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const resolved = externalOnly(api.resolve({
        permissions: ['*:read'],
        strict: true,
      }));
      assert.equal(resolved.length, 1);
      assert.equal(resolved[0]!.definition.name, 'list-writs');
    });
  });

  describe('resolve() — caller filtering with permissions', () => {
    it('includes tools with no callableBy restriction', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('signal', { permission: 'write' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const resolved = api.resolve({
        permissions: ['nexus-stdlib:write'],
        caller: 'anima',
      });
      assert.equal(resolved.length, 1);
    });

    it('includes tools that match the requested caller', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('cli-only', { callableBy: ['patron'], permission: 'read' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const resolved = api.resolve({
        permissions: ['nexus-stdlib:read'],
        caller: 'patron',
      });
      assert.equal(resolved.length, 1);
    });

    it('excludes tools restricted to a different caller', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('anima-only', { callableBy: ['anima'], permission: 'read' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const resolved = api.resolve({
        permissions: ['nexus-stdlib:read'],
        caller: 'patron',
      });
      assert.equal(resolved.length, 0);
    });

    it('does not filter by caller when caller is omitted', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('cli-only', { callableBy: ['patron'], permission: 'read' }),
        testTool('anima-only', { callableBy: ['anima'], permission: 'read' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const resolved = api.resolve({ permissions: ['nexus-stdlib:read'] });
      assert.equal(resolved.length, 2);
    });

    it('caller filtering works with permissionless tools in default mode', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('anima-only-free', { callableBy: ['anima'] }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      assert.equal(
        api.resolve({ permissions: [], caller: 'patron' }).length,
        0,
      );
      assert.equal(
        api.resolve({ permissions: [], caller: 'anima' }).length,
        1,
      );
    });
  });

  describe('resolve() — cross-plugin scenarios', () => {
    it('grants from different plugins resolve independently', () => {
      const kit1 = mockKit('nexus-stdlib', [
        testTool('create-writ', { permission: 'write' }),
        testTool('list-writs', { permission: 'read' }),
      ]);
      const kit2 = mockKit('clockworks', [
        testTool('clock-start', { permission: 'write' }),
        testTool('clock-status', { permission: 'read' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit1, kit2] });

      const resolved = api.resolve({
        permissions: ['nexus-stdlib:*', 'clockworks:read'],
      });
      assert.equal(resolved.length, 3);
      const names = resolved.map((t) => t.definition.name).sort();
      assert.deepStrictEqual(names, ['clock-status', 'create-writ', 'list-writs']);
    });

    it('empty permissions returns only permissionless tools in default mode', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('signal'), // no permission
        testTool('create-writ', { permission: 'write' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const resolved = api.resolve({ permissions: [] });
      assert.equal(resolved.length, 1);
      assert.equal(resolved[0]!.definition.name, 'signal');
    });

    it('empty permissions in strict mode returns nothing', () => {
      const kit = mockKit('nexus-stdlib', [
        testTool('signal'), // no permission
        testTool('create-writ', { permission: 'write' }),
      ]);

      const { api } = startInstrumentarium({ kits: [kit] });

      const resolved = api.resolve({ permissions: [], strict: true });
      assert.equal(resolved.length, 0);
    });
  });

  describe('instruction pre-loading', () => {
    let tmpDir: string;

    /** Create a temp guild root with a package directory and optional instructions file. */
    function setupTmpGuild(packageName: string, instructionsContent?: string): string {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'instrumentarium-test-'));
      const pkgDir = path.join(tmpDir, 'node_modules', packageName);
      fs.mkdirSync(pkgDir, { recursive: true });
      if (instructionsContent !== undefined) {
        fs.writeFileSync(path.join(pkgDir, 'instructions.md'), instructionsContent);
      }
      return tmpDir;
    }

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('pre-loads instructionsFile into instructions text', () => {
      const guildHome = setupTmpGuild('@test/nexus-stdlib', 'Use this tool carefully.');

      const fileTool = tool({
        name: 'careful-tool',
        description: 'A tool with file instructions',
        params: {},
        handler: async () => ({}),
        instructionsFile: './instructions.md',
        permission: 'read',
      });
      const kit = mockKit('nexus-stdlib', [fileTool]);

      const { api } = startInstrumentarium({ kits: [kit], home: guildHome });

      const found = api.find('careful-tool');
      assert.ok(found);
      assert.equal(found.definition.instructions, 'Use this tool carefully.');
      assert.equal(found.definition.instructionsFile, undefined);
    });

    it('preserves inline instructions without change', () => {
      const guildHome = setupTmpGuild('@test/nexus-stdlib');

      const inlineTool = tool({
        name: 'inline-tool',
        description: 'A tool with inline instructions',
        params: {},
        handler: async () => ({}),
        instructions: 'Inline guidance here.',
      });
      const kit = mockKit('nexus-stdlib', [inlineTool]);

      const { api } = startInstrumentarium({ kits: [kit], home: guildHome });

      const found = api.find('inline-tool');
      assert.ok(found);
      assert.equal(found.definition.instructions, 'Inline guidance here.');
    });

    it('warns and registers tool when instructionsFile is missing', () => {
      const guildHome = setupTmpGuild('@test/nexus-stdlib'); // no file created

      const missingTool = tool({
        name: 'missing-instructions',
        description: 'Instructions file does not exist',
        params: {},
        handler: async () => ({}),
        instructionsFile: './instructions.md',
      });
      const kit = mockKit('nexus-stdlib', [missingTool]);

      // Should not throw — tool is registered without instructions
      const { api } = startInstrumentarium({ kits: [kit], home: guildHome });

      const found = api.find('missing-instructions');
      assert.ok(found, 'tool should still be registered');
      assert.equal(found.definition.instructions, undefined);
      assert.equal(found.definition.instructionsFile, undefined);
    });

    it('tools without instructions or instructionsFile are unchanged', () => {
      const guildHome = setupTmpGuild('@test/nexus-stdlib');

      const plainTool = tool({
        name: 'plain-tool',
        description: 'No instructions at all',
        params: {},
        handler: async () => ({}),
      });
      const kit = mockKit('nexus-stdlib', [plainTool]);

      const { api } = startInstrumentarium({ kits: [kit], home: guildHome });

      const found = api.find('plain-tool');
      assert.ok(found);
      assert.equal(found.definition.instructions, undefined);
      assert.equal(found.definition.instructionsFile, undefined);
    });
  });
});

=== FILE: packages/plugins/tools/src/tool.test.ts ===
/**
 * tool.ts — unit tests.
 *
 * Tests the tool() factory and isToolDefinition() public functions directly.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { tool, isToolDefinition } from './tool.ts';

// ── tool() factory ───────────────────────────────────────────────────

describe('tool()', () => {
  it('returns a ToolDefinition with params as a ZodObject', () => {
    const t = tool({
      name: 'lookup',
      description: 'Look up something',
      params: { name: z.string() },
      handler: async () => ({ ok: true }),
    });

    assert.equal(t.name, 'lookup');
    assert.equal(t.description, 'Look up something');
    assert.ok(t.params instanceof z.ZodObject, 'params should be a ZodObject');
    assert.ok(t.params.shape.name instanceof z.ZodString);
    assert.equal(typeof t.handler, 'function');
  });

  it('normalizes callableBy single string to array', () => {
    const t = tool({
      name: 'patron-tool',
      description: 'CLI only',
      params: {},
      handler: async () => ({}),
      callableBy: 'patron',
    });

    assert.deepStrictEqual(t.callableBy, ['patron']);
  });

  it('preserves callableBy when already an array', () => {
    const t = tool({
      name: 'dual-tool',
      description: 'Both callers',
      params: {},
      handler: async () => ({}),
      callableBy: ['patron', 'anima'],
    });

    assert.deepStrictEqual(t.callableBy, ['patron', 'anima']);
  });

  it('omits callableBy when not provided', () => {
    const t = tool({
      name: 'open-tool',
      description: 'No caller restriction',
      params: {},
      handler: async () => ({}),
    });

    assert.equal('callableBy' in t, false);
  });

  it('omits permission when not provided', () => {
    const t = tool({
      name: 'free-tool',
      description: 'No permission',
      params: {},
      handler: async () => ({}),
    });

    assert.equal('permission' in t, false);
  });

  it('includes permission when provided', () => {
    const t = tool({
      name: 'guarded-tool',
      description: 'Needs write',
      params: {},
      handler: async () => ({}),
      permission: 'write',
    });

    assert.equal(t.permission, 'write');
  });

  it('omits instructions and instructionsFile when neither provided', () => {
    const t = tool({
      name: 'bare-tool',
      description: 'No instructions',
      params: {},
      handler: async () => ({}),
    });

    assert.equal('instructions' in t, false);
    assert.equal('instructionsFile' in t, false);
  });

  it('includes inline instructions when provided', () => {
    const t = tool({
      name: 'instructed-tool',
      description: 'Has instructions',
      params: {},
      handler: async () => ({}),
      instructions: 'Use this tool when you need to look things up.',
    });

    assert.equal(t.instructions, 'Use this tool when you need to look things up.');
    assert.equal('instructionsFile' in t, false);
  });

  it('includes instructionsFile when provided', () => {
    const t = tool({
      name: 'file-instructed-tool',
      description: 'Has instructions file',
      params: {},
      handler: async () => ({}),
      instructionsFile: './instructions.md',
    });

    assert.equal(t.instructionsFile, './instructions.md');
    assert.equal('instructions' in t, false);
  });
});

// ── isToolDefinition() ───────────────────────────────────────────────

describe('isToolDefinition()', () => {
  it('returns true for a valid tool definition', () => {
    const t = tool({
      name: 'valid',
      description: 'A valid tool',
      params: {},
      handler: async () => ({}),
    });
    assert.equal(isToolDefinition(t), true);
  });

  it('returns true for a manually constructed tool-like object', () => {
    const obj = {
      name: 'manual',
      description: 'Manually built',
      params: z.object({}),
      handler: () => ({}),
    };
    assert.equal(isToolDefinition(obj), true);
  });

  it('returns false for null', () => {
    assert.equal(isToolDefinition(null), false);
  });

  it('returns false for undefined', () => {
    assert.equal(isToolDefinition(undefined), false);
  });

  it('returns false for primitives', () => {
    assert.equal(isToolDefinition('string'), false);
    assert.equal(isToolDefinition(42), false);
    assert.equal(isToolDefinition(true), false);
  });

  it('returns false when name is missing', () => {
    assert.equal(
      isToolDefinition({ description: 'x', params: {}, handler: () => {} }),
      false,
    );
  });

  it('returns false when description is missing', () => {
    assert.equal(
      isToolDefinition({ name: 'x', params: {}, handler: () => {} }),
      false,
    );
  });

  it('returns false when params is missing', () => {
    assert.equal(
      isToolDefinition({ name: 'x', description: 'x', handler: () => {} }),
      false,
    );
  });

  it('returns false when handler is missing', () => {
    assert.equal(
      isToolDefinition({ name: 'x', description: 'x', params: {} }),
      false,
    );
  });

  it('returns false when name is not a string', () => {
    assert.equal(
      isToolDefinition({ name: 42, description: 'x', params: {}, handler: () => {} }),
      false,
    );
  });

  it('returns false when description is not a string', () => {
    assert.equal(
      isToolDefinition({ name: 'x', description: 42, params: {}, handler: () => {} }),
      false,
    );
  });

  it('returns false when handler is not a function', () => {
    assert.equal(
      isToolDefinition({ name: 'x', description: 'x', params: {}, handler: 'not-fn' }),
      false,
    );
  });
});

=== FILE: packages/plugins/tools/src/tool.ts ===
/**
 * Tool SDK — the primary authoring interface for module-based tools.
 *
 * Use `tool()` to define a typed tool with Zod parameter schemas.
 * The returned definition is what the MCP engine imports and registers as a tool,
 * what the CLI uses to auto-generate subcommands, and what engines import directly.
 *
 * A package can export a single tool or an array of tools:
 *
 * @example Single tool
 * ```typescript
 * import { tool } from '@shardworks/tools-apparatus';
 * import { z } from 'zod';
 *
 * export default tool({
 *   name: 'lookup',
 *   description: 'Look up an anima by name',
 *   instructionsFile: './instructions.md',
 *   params: {
 *     name: z.string().describe('Anima name'),
 *   },
 *   handler: async ({ name }) => {
 *     const { home } = guild();
 *     return { found: true, status: 'active' };
 *   },
 * });
 * ```
 *
 * @example Tool collection
 * ```typescript
 * export default [
 *   tool({ name: 'commission', description: '...', params: {...}, handler: ... }),
 *   tool({ name: 'signal', description: '...', params: {...}, handler: ... }),
 * ];
 * ```
 */
import { z } from 'zod';

// Zod shape type — a record of string keys to Zod schemas.
// Using a local alias keeps our public API stable across Zod versions.
type ZodShape = Record<string, z.ZodType>;

/**
 * The caller types a tool can be invoked by.
 * - `'patron'` — accessible via `nsg` commands (human-facing)
 * - `'anima'` — accessible via MCP server (anima-facing, in sessions)
 * - `'library'` — accessible programmatically via direct import
 *
 * Defaults to all caller types if `callableBy` is unspecified.
 */
export type ToolCaller = 'patron' | 'anima' | 'library';

/**
 * A fully-defined tool — the return type of `tool()`.
 *
 * The MCP engine uses `.params.shape` to register the tool's input schema,
 * `.description` for the tool description, and `.handler` to execute calls.
 * The CLI uses `.params` to auto-generate Commander options.
 * Engines call `.handler` directly.
 */
export interface ToolDefinition<TShape extends ZodShape = ZodShape> {
  /** Tool name — used for resolution when a package exports multiple tools. */
  readonly name: string;
  readonly description: string;
  /** Per-tool instructions injected into the anima's session context (inline text). */
  readonly instructions?: string;
  /**
   * Path to an instructions file, relative to the package root.
   * Resolved by the manifest engine at session time.
   * Mutually exclusive with `instructions`.
   */
  readonly instructionsFile?: string;
  /**
   * Caller types this tool is available to.
   * Always a normalized array. Absent means available to all callers.
   */
  readonly callableBy?: ToolCaller[];
  /**
   * Permission level required to invoke this tool. Matched against role grants.
   *
   * Format: a freeform string chosen by the tool author. Conventional names:
   * - `'read'` — query/inspect operations
   * - `'write'` — create/update operations
   * - `'delete'` — destructive operations
   * - `'admin'` — configuration and lifecycle operations
   *
   * Plugins are free to define their own levels.
   * If omitted, the tool is permissionless — included by default in non-strict
   * mode, excluded in strict mode unless the role grants `plugin:*` or `*:*`.
   */
  readonly permission?: string;
  readonly params: z.ZodObject<TShape>;
  readonly handler: (
    params: z.infer<z.ZodObject<TShape>>,
  ) => unknown | Promise<unknown>;
}

/** Input to `tool()` — instructions are either inline text or a file path, not both. */
type ToolInput<TShape extends ZodShape> = {
  name: string;
  description: string;
  params: TShape;
  handler: (
    params: z.infer<z.ZodObject<TShape>>,
  ) => unknown | Promise<unknown>;
  /**
   * Caller types this tool is available to.
   * Accepts a single caller or an array. Normalized to an array in the returned definition.
   */
  callableBy?: ToolCaller | ToolCaller[];
  /**
   * Permission level required to invoke this tool.
   * See ToolDefinition.permission for details.
   */
  permission?: string;
} & (
  | { instructions?: string; instructionsFile?: never }
  | { instructions?: never; instructionsFile?: string }
);

/**
 * Define a Nexus tool.
 *
 * This is the primary SDK entry point for module-based tools. Pass a
 * name, description, a params object of Zod schemas, and a handler function.
 * The framework handles the rest — MCP registration, CLI generation, validation.
 *
 * The handler receives one argument:
 * - `params` — the validated input, typed from your Zod schemas
 *
 * To access guild infrastructure (apparatus, config, home path), import
 * `guild` from `@shardworks/nexus-core` and call `guild()` inside the handler.
 *
 * Return any JSON-serializable value. The MCP engine wraps it as tool output;
 * the CLI prints it; engines use it directly.
 *
 * Instructions can be provided inline or as a file path:
 * - `instructions: 'Use this tool when...'` — inline text
 * - `instructionsFile: './instructions.md'` — resolved at manifest time
 */
export function tool<TShape extends ZodShape>(def: ToolInput<TShape>): ToolDefinition<TShape> {
  return {
    name: def.name,
    description: def.description,
    ...(def.instructions ? { instructions: def.instructions } : {}),
    ...(def.instructionsFile ? { instructionsFile: def.instructionsFile } : {}),
    ...(def.callableBy !== undefined
      ? { callableBy: Array.isArray(def.callableBy) ? def.callableBy : [def.callableBy] }
      : {}),
    ...(def.permission !== undefined ? { permission: def.permission } : {}),
    params: z.object(def.params),
    handler: def.handler,
  };
}

/** Type guard: is this value a ToolDefinition? */
export function isToolDefinition(obj: unknown): obj is ToolDefinition {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'name' in obj &&
    'description' in obj &&
    'params' in obj &&
    'handler' in obj &&
    typeof (obj as ToolDefinition).name === 'string' &&
    typeof (obj as ToolDefinition).description === 'string' &&
    typeof (obj as ToolDefinition).handler === 'function'
  );
}

=== FILE: packages/plugins/tools/src/tools/tools-list.test.ts ===
/**
 * tools-list — unit tests.
 *
 * Tests the administrative tool listing with various filter combinations.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  setGuild,
  clearGuild,
} from '@shardworks/nexus-core';
import type {
  Guild,
  LoadedKit,
  StartupContext,
} from '@shardworks/nexus-core';

import { tool } from '../tool.ts';
import {
  createInstrumentarium,
  type InstrumentariumApi,
} from '../instrumentarium.ts';

// ── Test helpers ──────────────────────────────────────────────────────

function testTool(
  name: string,
  opts?: {
    callableBy?: ('patron' | 'anima' | 'library')[];
    permission?: string;
    description?: string;
  },
) {
  return tool({
    name,
    description: opts?.description ?? `Test tool: ${name}`,
    params: {},
    handler: async () => ({ ok: true }),
    ...(opts?.callableBy ? { callableBy: opts.callableBy } : {}),
    ...(opts?.permission !== undefined ? { permission: opts.permission } : {}),
  });
}

function mockKit(id: string, tools: unknown[]): LoadedKit {
  return {
    packageName: `@test/${id}`,
    id,
    version: '0.0.0',
    kit: { tools },
  };
}

function wireGuild(kits: LoadedKit[]): void {
  const mockGuild: Guild = {
    home: '/tmp/test-guild',
    apparatus<T>(_name: string): T {
      throw new Error('Not implemented in test');
    },
    config<T>(_pluginId: string): T {
      return {} as T;
    },
    writeConfig() {},
    guildConfig() {
      return { name: 'test', nexus: '0.0.0', workshops: {}, plugins: [] };
    },
    kits() { return [...kits]; },
    apparatuses() { return []; },
  };
  setGuild(mockGuild);
}

function startInstrumentarium(kits: LoadedKit[]): InstrumentariumApi {
  wireGuild(kits);
  const plugin = createInstrumentarium();
  const api = ('apparatus' in plugin ? plugin.apparatus.provides : null) as InstrumentariumApi;
  assert.ok(api);

  const ctx: StartupContext = { on() {} };
  if ('apparatus' in plugin) {
    plugin.apparatus.start(ctx);
  }

  return api;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('tools-list', () => {
  afterEach(() => {
    clearGuild();
  });

  it('lists all tools with summary fields', async () => {
    const kit = mockKit('stdlib', [
      testTool('writ-create', { permission: 'write', description: 'Create a writ' }),
      testTool('writ-list', { permission: 'read', description: 'List writs' }),
    ]);

    const api = startInstrumentarium([kit]);
    const toolsList = api.find('tools-list');
    assert.ok(toolsList);

    const result = await toolsList.definition.handler({}) as Array<Record<string, unknown>>;
    // Should include kit tools + the two introspection tools (tools-list, tools-show)
    const kitTools = result.filter((t) => t.pluginId === 'stdlib');
    assert.equal(kitTools.length, 2);

    const writCreate = kitTools.find((t) => t.name === 'writ-create');
    assert.ok(writCreate);
    assert.equal(writCreate.description, 'Create a writ');
    assert.equal(writCreate.permission, 'write');
    assert.equal(writCreate.callableBy, null);
  });

  it('filters by plugin', async () => {
    const kit1 = mockKit('stdlib', [testTool('alpha', { permission: 'read' })]);
    const kit2 = mockKit('clockworks', [testTool('beta', { permission: 'read' })]);

    const api = startInstrumentarium([kit1, kit2]);
    const toolsList = api.find('tools-list');
    assert.ok(toolsList);

    const result = await toolsList.definition.handler({ plugin: 'clockworks' }) as Array<Record<string, unknown>>;
    assert.equal(result.length, 1);
    assert.equal(result[0]!.name, 'beta');
  });

  it('filters by permission level', async () => {
    const kit = mockKit('stdlib', [
      testTool('reader', { permission: 'read' }),
      testTool('writer', { permission: 'write' }),
      testTool('free'), // permissionless
    ]);

    const api = startInstrumentarium([kit]);
    const toolsList = api.find('tools-list');
    assert.ok(toolsList);

    const result = await toolsList.definition.handler({ permission: 'write' }) as Array<Record<string, unknown>>;
    assert.equal(result.length, 1);
    assert.equal(result[0]!.name, 'writer');
  });

  it('filters by caller type', async () => {
    const kit = mockKit('stdlib', [
      testTool('cli-only', { callableBy: ['patron'], permission: 'read' }),
      testTool('anima-only', { callableBy: ['anima'], permission: 'read' }),
      testTool('unrestricted', { permission: 'read' }),
    ]);

    const api = startInstrumentarium([kit]);
    const toolsList = api.find('tools-list');
    assert.ok(toolsList);

    const result = await toolsList.definition.handler({ caller: 'anima' }) as Array<Record<string, unknown>>;
    const names = result.map((t) => t.name);
    assert.ok(names.includes('anima-only'));
    assert.ok(names.includes('unrestricted'));
    assert.ok(!names.includes('cli-only'));
  });

  it('combines filters with AND logic', async () => {
    const kit1 = mockKit('stdlib', [
      testTool('read-std', { permission: 'read' }),
      testTool('write-std', { permission: 'write' }),
    ]);
    const kit2 = mockKit('clockworks', [
      testTool('read-clock', { permission: 'read' }),
    ]);

    const api = startInstrumentarium([kit1, kit2]);
    const toolsList = api.find('tools-list');
    assert.ok(toolsList);

    const result = await toolsList.definition.handler({
      plugin: 'stdlib',
      permission: 'read',
    }) as Array<Record<string, unknown>>;
    assert.equal(result.length, 1);
    assert.equal(result[0]!.name, 'read-std');
  });

  it('returns empty array when no tools match filters', async () => {
    const kit = mockKit('stdlib', [testTool('alpha', { permission: 'read' })]);

    const api = startInstrumentarium([kit]);
    const toolsList = api.find('tools-list');
    assert.ok(toolsList);

    const result = await toolsList.definition.handler({ plugin: 'nonexistent' }) as Array<Record<string, unknown>>;
    assert.equal(result.length, 0);
  });

  it('has read permission', () => {
    const api = startInstrumentarium([]);
    const toolsList = api.find('tools-list');
    assert.ok(toolsList);
    assert.equal(toolsList.definition.permission, 'read');
  });
});

=== FILE: packages/plugins/tools/src/tools/tools-list.ts ===
/**
 * tools-list — administrative view of all tools installed in the guild.
 *
 * Lists the full registry with optional filters for caller type, permission
 * level, and contributing plugin. This is an inventory tool, not a
 * permission-resolved view — use MCP native tool listing for that.
 *
 * Requires `tools:read` permission.
 */

import { z } from 'zod';

import { tool } from '../tool.ts';
import type { InstrumentariumApi } from '../instrumentarium.ts';

/** Summary returned for each tool in the list. */
export interface ToolSummary {
  name: string;
  description: string;
  pluginId: string;
  permission: string | null;
  callableBy: string[] | null;
}

export function createToolsList(getApi: () => InstrumentariumApi) {
  return tool({
    name: 'tools-list',
    description:
      'List all tools installed in the guild. Administrative view — shows the full registry, not a permission-resolved set.',
    permission: 'read',
    params: {
      caller: z
        .enum(['patron', 'anima', 'library'])
        .optional()
        .describe('Filter to tools callable by this caller type.'),
      permission: z
        .string()
        .optional()
        .describe(
          'Filter to tools requiring this permission level (e.g. "read", "write").',
        ),
      plugin: z
        .string()
        .optional()
        .describe('Filter to tools contributed by this plugin id.'),
    },
    handler: async ({ caller, permission, plugin }) => {
      const api = getApi();
      let tools = api.list();

      // Filter by contributing plugin
      if (plugin) {
        tools = tools.filter((t) => t.pluginId === plugin);
      }

      // Filter by permission level
      if (permission) {
        tools = tools.filter(
          (t) => t.definition.permission === permission,
        );
      }

      // Filter by caller type (callableBy gate)
      if (caller) {
        tools = tools.filter(
          (t) =>
            !t.definition.callableBy ||
            t.definition.callableBy.includes(caller),
        );
      }

      return tools.map(
        (t): ToolSummary => ({
          name: t.definition.name,
          description: t.definition.description,
          pluginId: t.pluginId,
          permission: t.definition.permission ?? null,
          callableBy: t.definition.callableBy ?? null,
        }),
      );
    },
  });
}

=== FILE: packages/plugins/tools/src/tools/tools-show.test.ts ===
/**
 * tools-show — unit tests.
 *
 * Tests the tool detail view including parameter schema extraction
 * and instructions display.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import {
  setGuild,
  clearGuild,
} from '@shardworks/nexus-core';
import type {
  Guild,
  LoadedKit,
  StartupContext,
} from '@shardworks/nexus-core';

import { tool } from '../tool.ts';
import {
  createInstrumentarium,
  type InstrumentariumApi,
} from '../instrumentarium.ts';

// ── Test helpers ──────────────────────────────────────────────────────

function mockKit(id: string, tools: unknown[]): LoadedKit {
  return {
    packageName: `@test/${id}`,
    id,
    version: '0.0.0',
    kit: { tools },
  };
}

function wireGuild(kits: LoadedKit[]): void {
  const mockGuild: Guild = {
    home: '/tmp/test-guild',
    apparatus<T>(_name: string): T {
      throw new Error('Not implemented in test');
    },
    config<T>(_pluginId: string): T {
      return {} as T;
    },
    writeConfig() {},
    guildConfig() {
      return { name: 'test', nexus: '0.0.0', workshops: {}, plugins: [] };
    },
    kits() { return [...kits]; },
    apparatuses() { return []; },
  };
  setGuild(mockGuild);
}

function startInstrumentarium(kits: LoadedKit[]): InstrumentariumApi {
  wireGuild(kits);
  const plugin = createInstrumentarium();
  const api = ('apparatus' in plugin ? plugin.apparatus.provides : null) as InstrumentariumApi;
  assert.ok(api);

  const ctx: StartupContext = { on() {} };
  if ('apparatus' in plugin) {
    plugin.apparatus.start(ctx);
  }

  return api;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('tools-show', () => {
  afterEach(() => {
    clearGuild();
  });

  it('returns null for unknown tool', async () => {
    const api = startInstrumentarium([]);
    const toolsShow = api.find('tools-show');
    assert.ok(toolsShow);

    const result = await toolsShow.definition.handler({ name: 'nonexistent' });
    assert.equal(result, null);
  });

  it('returns full detail for a known tool', async () => {
    const target = tool({
      name: 'writ-create',
      description: 'Create a new writ',
      permission: 'write',
      callableBy: ['patron', 'anima'],
      params: {
        title: z.string().describe('The writ title'),
        priority: z.number().optional().describe('Priority level'),
      },
      handler: async () => ({ ok: true }),
    });
    const kit = mockKit('stdlib', [target]);

    const api = startInstrumentarium([kit]);
    const toolsShow = api.find('tools-show');
    assert.ok(toolsShow);

    const result = await toolsShow.definition.handler({ name: 'writ-create' }) as Record<string, unknown>;
    assert.equal(result.name, 'writ-create');
    assert.equal(result.description, 'Create a new writ');
    assert.equal(result.pluginId, 'stdlib');
    assert.equal(result.permission, 'write');
    assert.deepStrictEqual(result.callableBy, ['patron', 'anima']);
  });

  it('extracts parameter schema with types and descriptions', async () => {
    const target = tool({
      name: 'paramful',
      description: 'Tool with various param types',
      params: {
        name: z.string().describe('A name'),
        count: z.number().describe('A count'),
        active: z.boolean().describe('Is active'),
        tags: z.array(z.string()).describe('Tag list'),
      },
      handler: async () => ({}),
    });
    const kit = mockKit('stdlib', [target]);

    const api = startInstrumentarium([kit]);
    const toolsShow = api.find('tools-show');
    assert.ok(toolsShow);

    const result = await toolsShow.definition.handler({ name: 'paramful' }) as Record<string, unknown>;
    const params = result.params as Record<string, Record<string, unknown>>;

    assert.equal(params.name.type, 'string');
    assert.equal(params.name.description, 'A name');
    assert.equal(params.name.optional, false);

    assert.equal(params.count.type, 'number');
    assert.equal(params.active.type, 'boolean');
    assert.equal(params.tags.type, 'array');
  });

  it('marks optional parameters correctly', async () => {
    const target = tool({
      name: 'optional-params',
      description: 'Tool with optional params',
      params: {
        required: z.string().describe('Required field'),
        optional: z.string().optional().describe('Optional field'),
        defaulted: z.string().default('foo').describe('Defaulted field'),
      },
      handler: async () => ({}),
    });
    const kit = mockKit('stdlib', [target]);

    const api = startInstrumentarium([kit]);
    const toolsShow = api.find('tools-show');
    assert.ok(toolsShow);

    const result = await toolsShow.definition.handler({ name: 'optional-params' }) as Record<string, unknown>;
    const params = result.params as Record<string, Record<string, unknown>>;

    assert.equal(params.required.optional, false);
    assert.equal(params.optional.optional, true);
    assert.equal(params.defaulted.optional, true);
  });

  it('handles enum parameters', async () => {
    const target = tool({
      name: 'enum-tool',
      description: 'Tool with enum param',
      params: {
        status: z.enum(['active', 'inactive']).describe('Status filter'),
      },
      handler: async () => ({}),
    });
    const kit = mockKit('stdlib', [target]);

    const api = startInstrumentarium([kit]);
    const toolsShow = api.find('tools-show');
    assert.ok(toolsShow);

    const result = await toolsShow.definition.handler({ name: 'enum-tool' }) as Record<string, unknown>;
    const params = result.params as Record<string, Record<string, unknown>>;

    assert.equal(params.status.type, 'string');
  });

  it('includes instructions when present', async () => {
    const target = tool({
      name: 'documented-tool',
      description: 'A well-documented tool',
      instructions: 'Use this tool when you need to do the thing. Do not use it for the other thing.',
      params: {},
      handler: async () => ({}),
    });
    const kit = mockKit('stdlib', [target]);

    const api = startInstrumentarium([kit]);
    const toolsShow = api.find('tools-show');
    assert.ok(toolsShow);

    const result = await toolsShow.definition.handler({ name: 'documented-tool' }) as Record<string, unknown>;
    assert.equal(result.instructions, 'Use this tool when you need to do the thing. Do not use it for the other thing.');
  });

  it('returns null instructions when tool has none', async () => {
    const target = tool({
      name: 'undocumented',
      description: 'No instructions',
      params: {},
      handler: async () => ({}),
    });
    const kit = mockKit('stdlib', [target]);

    const api = startInstrumentarium([kit]);
    const toolsShow = api.find('tools-show');
    assert.ok(toolsShow);

    const result = await toolsShow.definition.handler({ name: 'undocumented' }) as Record<string, unknown>;
    assert.equal(result.instructions, null);
  });

  it('returns null permission and callableBy for unrestricted permissionless tools', async () => {
    const target = tool({
      name: 'free-tool',
      description: 'No restrictions',
      params: {},
      handler: async () => ({}),
    });
    const kit = mockKit('stdlib', [target]);

    const api = startInstrumentarium([kit]);
    const toolsShow = api.find('tools-show');
    assert.ok(toolsShow);

    const result = await toolsShow.definition.handler({ name: 'free-tool' }) as Record<string, unknown>;
    assert.equal(result.permission, null);
    assert.equal(result.callableBy, null);
  });

  it('handles tool with empty params', async () => {
    const target = tool({
      name: 'no-params',
      description: 'No parameters',
      params: {},
      handler: async () => ({}),
    });
    const kit = mockKit('stdlib', [target]);

    const api = startInstrumentarium([kit]);
    const toolsShow = api.find('tools-show');
    assert.ok(toolsShow);

    const result = await toolsShow.definition.handler({ name: 'no-params' }) as Record<string, unknown>;
    assert.deepStrictEqual(result.params, {});
  });

  it('has read permission', () => {
    const api = startInstrumentarium([]);
    const toolsShow = api.find('tools-show');
    assert.ok(toolsShow);
    assert.equal(toolsShow.definition.permission, 'read');
  });
});

=== FILE: pnpm-lock.yaml ===
lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .:
    devDependencies:
      '@tsconfig/node24':
        specifier: 24.0.4
        version: 24.0.4
      typescript:
        specifier: 5.9.3
        version: 5.9.3

  packages/framework/arbor:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../core
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/framework/cli:
    dependencies:
      '@shardworks/nexus-arbor':
        specifier: workspace:*
        version: link:../arbor
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../../plugins/tools
      commander:
        specifier: 14.0.3
        version: 14.0.3
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/framework/core:
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/animator:
    dependencies:
      '@shardworks/loom-apparatus':
        specifier: workspace:*
        version: link:../loom
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/claude-code:
    dependencies:
      '@modelcontextprotocol/sdk':
        specifier: 1.27.1
        version: 1.27.1(zod@4.3.6)
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/clerk:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/codexes:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/copilot:
    dependencies:
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/fabricator:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/loom:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/oculus:
    dependencies:
      '@hono/node-server':
        specifier: ^1.13.7
        version: 1.19.11(hono@4.12.9)
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      hono:
        specifier: ^4.7.11
        version: 4.12.9
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/parlour:
    dependencies:
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/loom-apparatus':
        specifier: workspace:*
        version: link:../loom
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/spider:
    dependencies:
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/clerk-apparatus':
        specifier: workspace:*
        version: link:../clerk
      '@shardworks/codexes-apparatus':
        specifier: workspace:*
        version: link:../codexes
      '@shardworks/fabricator-apparatus':
        specifier: workspace:*
        version: link:../fabricator
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      yaml:
        specifier: ^2.0.0
        version: 2.8.3
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/stacks:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      better-sqlite3:
        specifier: 12.8.0
        version: 12.8.0
    devDependencies:
      '@types/better-sqlite3':
        specifier: 7.6.13
        version: 7.6.13
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/tools:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

packages:

  '@hono/node-server@1.19.11':
    resolution: {integrity: sha512-dr8/3zEaB+p0D2n/IUrlPF1HZm586qgJNXK1a9fhg/PzdtkK7Ksd5l312tJX2yBuALqDYBlG20QEbayqPyxn+g==}
    engines: {node: '>=18.14.1'}
    peerDependencies:
      hono: ^4

  '@modelcontextprotocol/sdk@1.27.1':
    resolution: {integrity: sha512-sr6GbP+4edBwFndLbM60gf07z0FQ79gaExpnsjMGePXqFcSSb7t6iscpjk9DhFhwd+mTEQrzNafGP8/iGGFYaA==}
    engines: {node: '>=18'}
    peerDependencies:
      '@cfworker/json-schema': ^4.1.1
      zod: ^3.25 || ^4.0
    peerDependenciesMeta:
      '@cfworker/json-schema':
        optional: true

  '@tsconfig/node24@24.0.4':
    resolution: {integrity: sha512-2A933l5P5oCbv6qSxHs7ckKwobs8BDAe9SJ/Xr2Hy+nDlwmLE1GhFh/g/vXGRZWgxBg9nX/5piDtHR9Dkw/XuA==}

  '@types/better-sqlite3@7.6.13':
    resolution: {integrity: sha512-NMv9ASNARoKksWtsq/SHakpYAYnhBrQgGD8zkLYk/jaK8jUGn08CfEdTRgYhMypUQAfzSP8W6gNLe0q19/t4VA==}

  '@types/node@25.5.0':
    resolution: {integrity: sha512-jp2P3tQMSxWugkCUKLRPVUpGaL5MVFwF8RDuSRztfwgN1wmqJeMSbKlnEtQqU8UrhTmzEmZdu2I6v2dpp7XIxw==}

  accepts@2.0.0:
    resolution: {integrity: sha512-5cvg6CtKwfgdmVqY1WIiXKc3Q1bkRqGLi+2W/6ao+6Y7gu/RCwRuAhGEzh5B4KlszSuTLgZYuqFqo5bImjNKng==}
    engines: {node: '>= 0.6'}

  ajv-formats@3.0.1:
    resolution: {integrity: sha512-8iUql50EUR+uUcdRQ3HDqa6EVyo3docL8g5WJ3FNcWmu62IbkGUue/pEyLBW8VGKKucTPgqeks4fIU1DA4yowQ==}
    peerDependencies:
      ajv: ^8.0.0
    peerDependenciesMeta:
      ajv:
        optional: true

  ajv@8.18.0:
    resolution: {integrity: sha512-PlXPeEWMXMZ7sPYOHqmDyCJzcfNrUr3fGNKtezX14ykXOEIvyK81d+qydx89KY5O71FKMPaQ2vBfBFI5NHR63A==}

  base64-js@1.5.1:
    resolution: {integrity: sha512-AKpaYlHn8t4SVbOHCy+b5+KKgvR4vrsD8vbvrbiQJps7fKDTkjkDry6ji0rUJjC0kzbNePLwzxq8iypo41qeWA==}

  better-sqlite3@12.8.0:
    resolution: {integrity: sha512-RxD2Vd96sQDjQr20kdP+F+dK/1OUNiVOl200vKBZY8u0vTwysfolF6Hq+3ZK2+h8My9YvZhHsF+RSGZW2VYrPQ==}
    engines: {node: 20.x || 22.x || 23.x || 24.x || 25.x}

  bindings@1.5.0:
    resolution: {integrity: sha512-p2q/t/mhvuOj/UeLlV6566GD/guowlr0hHxClI0W9m7MWYkL1F0hLo+0Aexs9HSPCtR1SXQ0TD3MMKrXZajbiQ==}

  bl@4.1.0:
    resolution: {integrity: sha512-1W07cM9gS6DcLperZfFSj+bWLtaPGSOHWhPiGzXmvVJbRLdG82sH/Kn8EtW1VqWVA54AKf2h5k5BbnIbwF3h6w==}

  body-parser@2.2.2:
    resolution: {integrity: sha512-oP5VkATKlNwcgvxi0vM0p/D3n2C3EReYVX+DNYs5TjZFn/oQt2j+4sVJtSMr18pdRr8wjTcBl6LoV+FUwzPmNA==}
    engines: {node: '>=18'}

  buffer@5.7.1:
    resolution: {integrity: sha512-EHcyIPBQ4BSGlvjB16k5KgAJ27CIsHY/2JBmCRReo48y9rQ3MaUzWX3KVlBa4U7MyX02HdVj0K7C3WaB3ju7FQ==}

  bytes@3.1.2:
    resolution: {integrity: sha512-/Nf7TyzTx6S3yRJObOAV7956r8cr2+Oj8AC5dt8wSP3BQAoeX58NoHyCU8P8zGkNXStjTSi6fzO6F0pBdcYbEg==}
    engines: {node: '>= 0.8'}

  call-bind-apply-helpers@1.0.2:
    resolution: {integrity: sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==}
    engines: {node: '>= 0.4'}

  call-bound@1.0.4:
    resolution: {integrity: sha512-+ys997U96po4Kx/ABpBCqhA9EuxJaQWDQg7295H4hBphv3IZg0boBKuwYpt4YXp6MZ5AmZQnU/tyMTlRpaSejg==}
    engines: {node: '>= 0.4'}

  chownr@1.1.4:
    resolution: {integrity: sha512-jJ0bqzaylmJtVnNgzTeSOs8DPavpbYgEr/b0YL8/2GO3xJEhInFmhKMUnEJQjZumK7KXGFhUy89PrsJWlakBVg==}

  commander@14.0.3:
    resolution: {integrity: sha512-H+y0Jo/T1RZ9qPP4Eh1pkcQcLRglraJaSLoyOtHxu6AapkjWVCy2Sit1QQ4x3Dng8qDlSsZEet7g5Pq06MvTgw==}
    engines: {node: '>=20'}

  content-disposition@1.0.1:
    resolution: {integrity: sha512-oIXISMynqSqm241k6kcQ5UwttDILMK4BiurCfGEREw6+X9jkkpEe5T9FZaApyLGGOnFuyMWZpdolTXMtvEJ08Q==}
    engines: {node: '>=18'}

  content-type@1.0.5:
    resolution: {integrity: sha512-nTjqfcBFEipKdXCv4YDQWCfmcLZKm81ldF0pAopTvyrFGVbcR6P/VAAd5G7N+0tTr8QqiU0tFadD6FK4NtJwOA==}
    engines: {node: '>= 0.6'}

  cookie-signature@1.2.2:
    resolution: {integrity: sha512-D76uU73ulSXrD1UXF4KE2TMxVVwhsnCgfAyTg9k8P6KGZjlXKrOLe4dJQKI3Bxi5wjesZoFXJWElNWBjPZMbhg==}
    engines: {node: '>=6.6.0'}

  cookie@0.7.2:
    resolution: {integrity: sha512-yki5XnKuf750l50uGTllt6kKILY4nQ1eNIQatoXEByZ5dWgnKqbnqmTrBE5B4N7lrMJKQ2ytWMiTO2o0v6Ew/w==}
    engines: {node: '>= 0.6'}

  cors@2.8.6:
    resolution: {integrity: sha512-tJtZBBHA6vjIAaF6EnIaq6laBBP9aq/Y3ouVJjEfoHbRBcHBAHYcMh/w8LDrk2PvIMMq8gmopa5D4V8RmbrxGw==}
    engines: {node: '>= 0.10'}

  cross-spawn@7.0.6:
    resolution: {integrity: sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==}
    engines: {node: '>= 8'}

  debug@4.4.3:
    resolution: {integrity: sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==}
    engines: {node: '>=6.0'}
    peerDependencies:
      supports-color: '*'
    peerDependenciesMeta:
      supports-color:
        optional: true

  decompress-response@6.0.0:
    resolution: {integrity: sha512-aW35yZM6Bb/4oJlZncMH2LCoZtJXTRxES17vE3hoRiowU2kWHaJKFkSBDnDR+cm9J+9QhXmREyIfv0pji9ejCQ==}
    engines: {node: '>=10'}

  deep-extend@0.6.0:
    resolution: {integrity: sha512-LOHxIOaPYdHlJRtCQfDIVZtfw/ufM8+rVj649RIHzcm/vGwQRXFt6OPqIFWsm2XEMrNIEtWR64sY1LEKD2vAOA==}
    engines: {node: '>=4.0.0'}

  depd@2.0.0:
    resolution: {integrity: sha512-g7nH6P6dyDioJogAAGprGpCtVImJhpPk/roCzdb3fIh61/s/nPsfR6onyMwkCAR/OlC3yBC0lESvUoQEAssIrw==}
    engines: {node: '>= 0.8'}

  detect-libc@2.1.2:
    resolution: {integrity: sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==}
    engines: {node: '>=8'}

  dunder-proto@1.0.1:
    resolution: {integrity: sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==}
    engines: {node: '>= 0.4'}

  ee-first@1.1.1:
    resolution: {integrity: sha512-WMwm9LhRUo+WUaRN+vRuETqG89IgZphVSNkdFgeb6sS/E4OrDIN7t48CAewSHXc6C8lefD8KKfr5vY61brQlow==}

  encodeurl@2.0.0:
    resolution: {integrity: sha512-Q0n9HRi4m6JuGIV1eFlmvJB7ZEVxu93IrMyiMsGC0lrMJMWzRgx6WGquyfQgZVb31vhGgXnfmPNNXmxnOkRBrg==}
    engines: {node: '>= 0.8'}

  end-of-stream@1.4.5:
    resolution: {integrity: sha512-ooEGc6HP26xXq/N+GCGOT0JKCLDGrq2bQUZrQ7gyrJiZANJ/8YDTxTpQBXGMn+WbIQXNVpyWymm7KYVICQnyOg==}

  es-define-property@1.0.1:
    resolution: {integrity: sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==}
    engines: {node: '>= 0.4'}

  es-errors@1.3.0:
    resolution: {integrity: sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==}
    engines: {node: '>= 0.4'}

  es-object-atoms@1.1.1:
    resolution: {integrity: sha512-FGgH2h8zKNim9ljj7dankFPcICIK9Cp5bm+c2gQSYePhpaG5+esrLODihIorn+Pe6FGJzWhXQotPv73jTaldXA==}
    engines: {node: '>= 0.4'}

  escape-html@1.0.3:
    resolution: {integrity: sha512-NiSupZ4OeuGwr68lGIeym/ksIZMJodUGOSCZ/FSnTxcrekbvqrgdUxlJOMpijaKZVjAJrWrGs/6Jy8OMuyj9ow==}

  etag@1.8.1:
    resolution: {integrity: sha512-aIL5Fx7mawVa300al2BnEE4iNvo1qETxLrPI/o05L7z6go7fCw1J6EQmbK4FmJ2AS7kgVF/KEZWufBfdClMcPg==}
    engines: {node: '>= 0.6'}

  eventsource-parser@3.0.6:
    resolution: {integrity: sha512-Vo1ab+QXPzZ4tCa8SwIHJFaSzy4R6SHf7BY79rFBDf0idraZWAkYrDjDj8uWaSm3S2TK+hJ7/t1CEmZ7jXw+pg==}
    engines: {node: '>=18.0.0'}

  eventsource@3.0.7:
    resolution: {integrity: sha512-CRT1WTyuQoD771GW56XEZFQ/ZoSfWid1alKGDYMmkt2yl8UXrVR4pspqWNEcqKvVIzg6PAltWjxcSSPrboA4iA==}
    engines: {node: '>=18.0.0'}

  expand-template@2.0.3:
    resolution: {integrity: sha512-XYfuKMvj4O35f/pOXLObndIRvyQ+/+6AhODh+OKWj9S9498pHHn/IMszH+gt0fBCRWMNfk1ZSp5x3AifmnI2vg==}
    engines: {node: '>=6'}

  express-rate-limit@8.3.1:
    resolution: {integrity: sha512-D1dKN+cmyPWuvB+G2SREQDzPY1agpBIcTa9sJxOPMCNeH3gwzhqJRDWCXW3gg0y//+LQ/8j52JbMROWyrKdMdw==}
    engines: {node: '>= 16'}
    peerDependencies:
      express: '>= 4.11'

  express@5.2.1:
    resolution: {integrity: sha512-hIS4idWWai69NezIdRt2xFVofaF4j+6INOpJlVOLDO8zXGpUVEVzIYk12UUi2JzjEzWL3IOAxcTubgz9Po0yXw==}
    engines: {node: '>= 18'}

  fast-deep-equal@3.1.3:
    resolution: {integrity: sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hswO7BLKj09Hc5HYNz9cGI++xlpDCIgDaitVs03ATR84Q==}

  fast-uri@3.1.0:
    resolution: {integrity: sha512-iPeeDKJSWf4IEOasVVrknXpaBV0IApz/gp7S2bb7Z4Lljbl2MGJRqInZiUrQwV16cpzw/D3S5j5Julj/gT52AA==}

  file-uri-to-path@1.0.0:
    resolution: {integrity: sha512-0Zt+s3L7Vf1biwWZ29aARiVYLx7iMGnEUl9x33fbB/j3jR81u/O2LbqK+Bm1CDSNDKVtJ/YjwY7TUd5SkeLQLw==}

  finalhandler@2.1.1:
    resolution: {integrity: sha512-S8KoZgRZN+a5rNwqTxlZZePjT/4cnm0ROV70LedRHZ0p8u9fRID0hJUZQpkKLzro8LfmC8sx23bY6tVNxv8pQA==}
    engines: {node: '>= 18.0.0'}

  forwarded@0.2.0:
    resolution: {integrity: sha512-buRG0fpBtRHSTCOASe6hD258tEubFoRLb4ZNA6NxMVHNw2gOcwHo9wyablzMzOA5z9xA9L1KNjk/Nt6MT9aYow==}
    engines: {node: '>= 0.6'}

  fresh@2.0.0:
    resolution: {integrity: sha512-Rx/WycZ60HOaqLKAi6cHRKKI7zxWbJ31MhntmtwMoaTeF7XFH9hhBp8vITaMidfljRQ6eYWCKkaTK+ykVJHP2A==}
    engines: {node: '>= 0.8'}

  fs-constants@1.0.0:
    resolution: {integrity: sha512-y6OAwoSIf7FyjMIv94u+b5rdheZEjzR63GTyZJm5qh4Bi+2YgwLCcI/fPFZkL5PSixOt6ZNKm+w+Hfp/Bciwow==}

  function-bind@1.1.2:
    resolution: {integrity: sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==}

  get-intrinsic@1.3.0:
    resolution: {integrity: sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==}
    engines: {node: '>= 0.4'}

  get-proto@1.0.1:
    resolution: {integrity: sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==}
    engines: {node: '>= 0.4'}

  github-from-package@0.0.0:
    resolution: {integrity: sha512-SyHy3T1v2NUXn29OsWdxmK6RwHD+vkj3v8en8AOBZ1wBQ/hCAQ5bAQTD02kW4W9tUp/3Qh6J8r9EvntiyCmOOw==}

  gopd@1.2.0:
    resolution: {integrity: sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==}
    engines: {node: '>= 0.4'}

  has-symbols@1.1.0:
    resolution: {integrity: sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==}
    engines: {node: '>= 0.4'}

  hasown@2.0.2:
    resolution: {integrity: sha512-0hJU9SCPvmMzIBdZFqNPXWa6dqh7WdH0cII9y+CyS8rG3nL48Bclra9HmKhVVUHyPWNH5Y7xDwAB7bfgSjkUMQ==}
    engines: {node: '>= 0.4'}

  hono@4.12.9:
    resolution: {integrity: sha512-wy3T8Zm2bsEvxKZM5w21VdHDDcwVS1yUFFY6i8UobSsKfFceT7TOwhbhfKsDyx7tYQlmRM5FLpIuYvNFyjctiA==}
    engines: {node: '>=16.9.0'}

  http-errors@2.0.1:
    resolution: {integrity: sha512-4FbRdAX+bSdmo4AUFuS0WNiPz8NgFt+r8ThgNWmlrjQjt1Q7ZR9+zTlce2859x4KSXrwIsaeTqDoKQmtP8pLmQ==}
    engines: {node: '>= 0.8'}

  iconv-lite@0.7.2:
    resolution: {integrity: sha512-im9DjEDQ55s9fL4EYzOAv0yMqmMBSZp6G0VvFyTMPKWxiSBHUj9NW/qqLmXUwXrrM7AvqSlTCfvqRb0cM8yYqw==}
    engines: {node: '>=0.10.0'}

  ieee754@1.2.1:
    resolution: {integrity: sha512-dcyqhDvX1C46lXZcVqCpK+FtMRQVdIMN6/Df5js2zouUsqG7I6sFxitIC+7KYK29KdXOLHdu9zL4sFnoVQnqaA==}

  inherits@2.0.4:
    resolution: {integrity: sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==}

  ini@1.3.8:
    resolution: {integrity: sha512-JV/yugV2uzW5iMRSiZAyDtQd+nxtUnjeLt0acNdw98kKLrvuRVyB80tsREOE7yvGVgalhZ6RNXCmEHkUKBKxew==}

  ip-address@10.1.0:
    resolution: {integrity: sha512-XXADHxXmvT9+CRxhXg56LJovE+bmWnEWB78LB83VZTprKTmaC5QfruXocxzTZ2Kl0DNwKuBdlIhjL8LeY8Sf8Q==}
    engines: {node: '>= 12'}

  ipaddr.js@1.9.1:
    resolution: {integrity: sha512-0KI/607xoxSToH7GjN1FfSbLoU0+btTicjsQSWQlh/hZykN8KpmMf7uYwPW3R+akZ6R/w18ZlXSHBYXiYUPO3g==}
    engines: {node: '>= 0.10'}

  is-promise@4.0.0:
    resolution: {integrity: sha512-hvpoI6korhJMnej285dSg6nu1+e6uxs7zG3BYAm5byqDsgJNWwxzM6z6iZiAgQR4TJ30JmBTOwqZUw3WlyH3AQ==}

  isexe@2.0.0:
    resolution: {integrity: sha512-RHxMLp9lnKHGHRng9QFhRCMbYAcVpn69smSGcq3f36xjgVVWThj4qqLbTLlq7Ssj8B+fIQ1EuCEGI2lKsyQeIw==}

  jose@6.2.2:
    resolution: {integrity: sha512-d7kPDd34KO/YnzaDOlikGpOurfF0ByC2sEV4cANCtdqLlTfBlw2p14O/5d/zv40gJPbIQxfES3nSx1/oYNyuZQ==}

  json-schema-traverse@1.0.0:
    resolution: {integrity: sha512-NM8/P9n3XjXhIZn1lLhkFaACTOURQXjWhV4BA/RnOv8xvgqtqpAX9IO4mRQxSx1Rlo4tqzeqb0sOlruaOy3dug==}

  json-schema-typed@8.0.2:
    resolution: {integrity: sha512-fQhoXdcvc3V28x7C7BMs4P5+kNlgUURe2jmUT1T//oBRMDrqy1QPelJimwZGo7Hg9VPV3EQV5Bnq4hbFy2vetA==}

  math-intrinsics@1.1.0:
    resolution: {integrity: sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==}
    engines: {node: '>= 0.4'}

  media-typer@1.1.0:
    resolution: {integrity: sha512-aisnrDP4GNe06UcKFnV5bfMNPBUw4jsLGaWwWfnH3v02GnBuXX2MCVn5RbrWo0j3pczUilYblq7fQ7Nw2t5XKw==}
    engines: {node: '>= 0.8'}

  merge-descriptors@2.0.0:
    resolution: {integrity: sha512-Snk314V5ayFLhp3fkUREub6WtjBfPdCPY1Ln8/8munuLuiYhsABgBVWsozAG+MWMbVEvcdcpbi9R7ww22l9Q3g==}
    engines: {node: '>=18'}

  mime-db@1.54.0:
    resolution: {integrity: sha512-aU5EJuIN2WDemCcAp2vFBfp/m4EAhWJnUNSSw0ixs7/kXbd6Pg64EmwJkNdFhB8aWt1sH2CTXrLxo/iAGV3oPQ==}
    engines: {node: '>= 0.6'}

  mime-types@3.0.2:
    resolution: {integrity: sha512-Lbgzdk0h4juoQ9fCKXW4by0UJqj+nOOrI9MJ1sSj4nI8aI2eo1qmvQEie4VD1glsS250n15LsWsYtCugiStS5A==}
    engines: {node: '>=18'}

  mimic-response@3.1.0:
    resolution: {integrity: sha512-z0yWI+4FDrrweS8Zmt4Ej5HdJmky15+L2e6Wgn3+iK5fWzb6T3fhNFq2+MeTRb064c6Wr4N/wv0DzQTjNzHNGQ==}
    engines: {node: '>=10'}

  minimist@1.2.8:
    resolution: {integrity: sha512-2yyAR8qBkN3YuheJanUpWC5U3bb5osDywNB8RzDVlDwDHbocAJveqqj1u8+SVD7jkWT4yvsHCpWqqWqAxb0zCA==}

  mkdirp-classic@0.5.3:
    resolution: {integrity: sha512-gKLcREMhtuZRwRAfqP3RFW+TK4JqApVBtOIftVgjuABpAtpxhPGaDcfvbhNvD0B8iD1oUr/txX35NjcaY6Ns/A==}

  ms@2.1.3:
    resolution: {integrity: sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==}

  napi-build-utils@2.0.0:
    resolution: {integrity: sha512-GEbrYkbfF7MoNaoh2iGG84Mnf/WZfB0GdGEsM8wz7Expx/LlWf5U8t9nvJKXSp3qr5IsEbK04cBGhol/KwOsWA==}

  negotiator@1.0.0:
    resolution: {integrity: sha512-8Ofs/AUQh8MaEcrlq5xOX0CQ9ypTF5dl78mjlMNfOK08fzpgTHQRQPBxcPlEtIw0yRpws+Zo/3r+5WRby7u3Gg==}
    engines: {node: '>= 0.6'}

  node-abi@3.89.0:
    resolution: {integrity: sha512-6u9UwL0HlAl21+agMN3YAMXcKByMqwGx+pq+P76vii5f7hTPtKDp08/H9py6DY+cfDw7kQNTGEj/rly3IgbNQA==}
    engines: {node: '>=10'}

  object-assign@4.1.1:
    resolution: {integrity: sha512-rJgTQnkUnH1sFw8yT6VSU3zD3sWmu6sZhIseY8VX+GRu3P6F7Fu+JNDoXfklElbLJSnc3FUQHVe4cU5hj+BcUg==}
    engines: {node: '>=0.10.0'}

  object-inspect@1.13.4:
    resolution: {integrity: sha512-W67iLl4J2EXEGTbfeHCffrjDfitvLANg0UlX3wFUUSTx92KXRFegMHUVgSqE+wvhAbi4WqjGg9czysTV2Epbew==}
    engines: {node: '>= 0.4'}

  on-finished@2.4.1:
    resolution: {integrity: sha512-oVlzkg3ENAhCk2zdv7IJwd/QUD4z2RxRwpkcGY8psCVcCYZNq4wYnVWALHM+brtuJjePWiYF/ClmuDr8Ch5+kg==}
    engines: {node: '>= 0.8'}

  once@1.4.0:
    resolution: {integrity: sha512-lNaJgI+2Q5URQBkccEKHTQOPaXdUxnZZElQTZY0MFUAuaEqe1E+Nyvgdz/aIyNi6Z9MzO5dv1H8n58/GELp3+w==}

  parseurl@1.3.3:
    resolution: {integrity: sha512-CiyeOxFT/JZyN5m0z9PfXw4SCBJ6Sygz1Dpl0wqjlhDEGGBP1GnsUVEL0p63hoG1fcj3fHynXi9NYO4nWOL+qQ==}
    engines: {node: '>= 0.8'}

  path-key@3.1.1:
    resolution: {integrity: sha512-ojmeN0qd+y0jszEtoY48r0Peq5dwMEkIlCOu6Q5f41lfkswXuKtYrhgoTpLnyIcHm24Uhqx+5Tqm2InSwLhE6Q==}
    engines: {node: '>=8'}

  path-to-regexp@8.3.0:
    resolution: {integrity: sha512-7jdwVIRtsP8MYpdXSwOS0YdD0Du+qOoF/AEPIt88PcCFrZCzx41oxku1jD88hZBwbNUIEfpqvuhjFaMAqMTWnA==}

  pkce-challenge@5.0.1:
    resolution: {integrity: sha512-wQ0b/W4Fr01qtpHlqSqspcj3EhBvimsdh0KlHhH8HRZnMsEa0ea2fTULOXOS9ccQr3om+GcGRk4e+isrZWV8qQ==}
    engines: {node: '>=16.20.0'}

  prebuild-install@7.1.3:
    resolution: {integrity: sha512-8Mf2cbV7x1cXPUILADGI3wuhfqWvtiLA1iclTDbFRZkgRQS0NqsPZphna9V+HyTEadheuPmjaJMsbzKQFOzLug==}
    engines: {node: '>=10'}
    deprecated: No longer maintained. Please contact the author of the relevant native addon; alternatives are available.
    hasBin: true

  proxy-addr@2.0.7:
    resolution: {integrity: sha512-llQsMLSUDUPT44jdrU/O37qlnifitDP+ZwrmmZcoSKyLKvtZxpyV0n2/bD/N4tBAAZ/gJEdZU7KMraoK1+XYAg==}
    engines: {node: '>= 0.10'}

  pump@3.0.4:
    resolution: {integrity: sha512-VS7sjc6KR7e1ukRFhQSY5LM2uBWAUPiOPa/A3mkKmiMwSmRFUITt0xuj+/lesgnCv+dPIEYlkzrcyXgquIHMcA==}

  qs@6.15.0:
    resolution: {integrity: sha512-mAZTtNCeetKMH+pSjrb76NAM8V9a05I9aBZOHztWy/UqcJdQYNsf59vrRKWnojAT9Y+GbIvoTBC++CPHqpDBhQ==}
    engines: {node: '>=0.6'}

  range-parser@1.2.1:
    resolution: {integrity: sha512-Hrgsx+orqoygnmhFbKaHE6c296J+HTAQXoxEF6gNupROmmGJRoyzfG3ccAveqCBrwr/2yxQ5BVd/GTl5agOwSg==}
    engines: {node: '>= 0.6'}

  raw-body@3.0.2:
    resolution: {integrity: sha512-K5zQjDllxWkf7Z5xJdV0/B0WTNqx6vxG70zJE4N0kBs4LovmEYWJzQGxC9bS9RAKu3bgM40lrd5zoLJ12MQ5BA==}
    engines: {node: '>= 0.10'}

  rc@1.2.8:
    resolution: {integrity: sha512-y3bGgqKj3QBdxLbLkomlohkvsA8gdAiUQlSBJnBhfn+BPxg4bc62d8TcBW15wavDfgexCgccckhcZvywyQYPOw==}
    hasBin: true

  readable-stream@3.6.2:
    resolution: {integrity: sha512-9u/sniCrY3D5WdsERHzHE4G2YCXqoG5FTHUiCC4SIbr6XcLZBY05ya9EKjYek9O5xOAwjGq+1JdGBAS7Q9ScoA==}
    engines: {node: '>= 6'}

  require-from-string@2.0.2:
    resolution: {integrity: sha512-Xf0nWe6RseziFMu+Ap9biiUbmplq6S9/p+7w7YXP/JBHhrUDDUhwa+vANyubuqfZWTveU//DYVGsDG7RKL/vEw==}
    engines: {node: '>=0.10.0'}

  router@2.2.0:
    resolution: {integrity: sha512-nLTrUKm2UyiL7rlhapu/Zl45FwNgkZGaCpZbIHajDYgwlJCOzLSk+cIPAnsEqV955GjILJnKbdQC1nVPz+gAYQ==}
    engines: {node: '>= 18'}

  safe-buffer@5.2.1:
    resolution: {integrity: sha512-rp3So07KcdmmKbGvgaNxQSJr7bGVSVk5S9Eq1F+ppbRo70+YeaDxkw5Dd8NPN+GD6bjnYm2VuPuCXmpuYvmCXQ==}

  safer-buffer@2.1.2:
    resolution: {integrity: sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==}

  semver@7.7.4:
    resolution: {integrity: sha512-vFKC2IEtQnVhpT78h1Yp8wzwrf8CM+MzKMHGJZfBtzhZNycRFnXsHk6E5TxIkkMsgNS7mdX3AGB7x2QM2di4lA==}
    engines: {node: '>=10'}
    hasBin: true

  send@1.2.1:
    resolution: {integrity: sha512-1gnZf7DFcoIcajTjTwjwuDjzuz4PPcY2StKPlsGAQ1+YH20IRVrBaXSWmdjowTJ6u8Rc01PoYOGHXfP1mYcZNQ==}
    engines: {node: '>= 18'}

  serve-static@2.2.1:
    resolution: {integrity: sha512-xRXBn0pPqQTVQiC8wyQrKs2MOlX24zQ0POGaj0kultvoOCstBQM5yvOhAVSUwOMjQtTvsPWoNCHfPGwaaQJhTw==}
    engines: {node: '>= 18'}

  setprototypeof@1.2.0:
    resolution: {integrity: sha512-E5LDX7Wrp85Kil5bhZv46j8jOeboKq5JMmYM3gVGdGH8xFpPWXUMsNrlODCrkoxMEeNi/XZIwuRvY4XNwYMJpw==}

  shebang-command@2.0.0:
    resolution: {integrity: sha512-kHxr2zZpYtdmrN1qDjrrX/Z1rR1kG8Dx+gkpK1G4eXmvXswmcE1hTWBWYUzlraYw1/yZp6YuDY77YtvbN0dmDA==}
    engines: {node: '>=8'}

  shebang-regex@3.0.0:
    resolution: {integrity: sha512-7++dFhtcx3353uBaq8DDR4NuxBetBzC7ZQOhmTQInHEd6bSrXdiEyzCvG07Z44UYdLShWUyXt5M/yhz8ekcb1A==}
    engines: {node: '>=8'}

  side-channel-list@1.0.0:
    resolution: {integrity: sha512-FCLHtRD/gnpCiCHEiJLOwdmFP+wzCmDEkc9y7NsYxeF4u7Btsn1ZuwgwJGxImImHicJArLP4R0yX4c2KCrMrTA==}
    engines: {node: '>= 0.4'}

  side-channel-map@1.0.1:
    resolution: {integrity: sha512-VCjCNfgMsby3tTdo02nbjtM/ewra6jPHmpThenkTYh8pG9ucZ/1P8So4u4FGBek/BjpOVsDCMoLA/iuBKIFXRA==}
    engines: {node: '>= 0.4'}

  side-channel-weakmap@1.0.2:
    resolution: {integrity: sha512-WPS/HvHQTYnHisLo9McqBHOJk2FkHO/tlpvldyrnem4aeQp4hai3gythswg6p01oSoTl58rcpiFAjF2br2Ak2A==}
    engines: {node: '>= 0.4'}

  side-channel@1.1.0:
    resolution: {integrity: sha512-ZX99e6tRweoUXqR+VBrslhda51Nh5MTQwou5tnUDgbtyM0dBgmhEDtWGP/xbKn6hqfPRHujUNwz5fy/wbbhnpw==}
    engines: {node: '>= 0.4'}

  simple-concat@1.0.1:
    resolution: {integrity: sha512-cSFtAPtRhljv69IK0hTVZQ+OfE9nePi/rtJmw5UjHeVyVroEqJXP1sFztKUy1qU+xvz3u/sfYJLa947b7nAN2Q==}

  simple-get@4.0.1:
    resolution: {integrity: sha512-brv7p5WgH0jmQJr1ZDDfKDOSeWWg+OVypG99A/5vYGPqJ6pxiaHLy8nxtFjBA7oMa01ebA9gfh1uMCFqOuXxvA==}

  statuses@2.0.2:
    resolution: {integrity: sha512-DvEy55V3DB7uknRo+4iOGT5fP1slR8wQohVdknigZPMpMstaKJQWhwiYBACJE3Ul2pTnATihhBYnRhZQHGBiRw==}
    engines: {node: '>= 0.8'}

  string_decoder@1.3.0:
    resolution: {integrity: sha512-hkRX8U1WjJFd8LsDJ2yQ/wWWxaopEsABU1XfkM8A+j0+85JAGppt16cr1Whg6KIbb4okU6Mql6BOj+uup/wKeA==}

  strip-json-comments@2.0.1:
    resolution: {integrity: sha512-4gB8na07fecVVkOI6Rs4e7T6NOTki5EmL7TUduTs6bu3EdnSycntVJ4re8kgZA+wx9IueI2Y11bfbgwtzuE0KQ==}
    engines: {node: '>=0.10.0'}

  tar-fs@2.1.4:
    resolution: {integrity: sha512-mDAjwmZdh7LTT6pNleZ05Yt65HC3E+NiQzl672vQG38jIrehtJk/J3mNwIg+vShQPcLF/LV7CMnDW6vjj6sfYQ==}

  tar-stream@2.2.0:
    resolution: {integrity: sha512-ujeqbceABgwMZxEJnk2HDY2DlnUZ+9oEcb1KzTVfYHio0UE6dG71n60d8D2I4qNvleWrrXpmjpt7vZeF1LnMZQ==}
    engines: {node: '>=6'}

  toidentifier@1.0.1:
    resolution: {integrity: sha512-o5sSPKEkg/DIQNmH43V0/uerLrpzVedkUh8tGNvaeXpfpuwjKenlSox/2O/BTlZUtEe+JG7s5YhEz608PlAHRA==}
    engines: {node: '>=0.6'}

  tunnel-agent@0.6.0:
    resolution: {integrity: sha512-McnNiV1l8RYeY8tBgEpuodCC1mLUdbSN+CYBL7kJsJNInOP8UjDDEwdk6Mw60vdLLrr5NHKZhMAOSrR2NZuQ+w==}

  type-is@2.0.1:
    resolution: {integrity: sha512-OZs6gsjF4vMp32qrCbiVSkrFmXtG/AZhY3t0iAMrMBiAZyV9oALtXO8hsrHbMXF9x6L3grlFuwW2oAz7cav+Gw==}
    engines: {node: '>= 0.6'}

  typescript@5.9.3:
    resolution: {integrity: sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==}
    engines: {node: '>=14.17'}
    hasBin: true

  undici-types@7.18.2:
    resolution: {integrity: sha512-AsuCzffGHJybSaRrmr5eHr81mwJU3kjw6M+uprWvCXiNeN9SOGwQ3Jn8jb8m3Z6izVgknn1R0FTCEAP2QrLY/w==}

  unpipe@1.0.0:
    resolution: {integrity: sha512-pjy2bYhSsufwWlKwPc+l3cN7+wuJlK6uz0YdJEOlQDbl6jo/YlPi4mb8agUkVC8BF7V8NuzeyPNqRksA3hztKQ==}
    engines: {node: '>= 0.8'}

  util-deprecate@1.0.2:
    resolution: {integrity: sha512-EPD5q1uXyFxJpCrLnCc1nHnq3gOa6DZBocAIiI2TaSCA7VCJ1UJDMagCzIkXNsUYfD1daK//LTEQ8xiIbrHtcw==}

  vary@1.1.2:
    resolution: {integrity: sha512-BNGbWLfd0eUPabhkXUVm0j8uuvREyTh5ovRa/dyow/BqAbZJyC+5fU+IzQOzmAKzYqYRAISoRhdQr3eIZ/PXqg==}
    engines: {node: '>= 0.8'}

  which@2.0.2:
    resolution: {integrity: sha512-BLI3Tl1TW3Pvl70l3yq3Y64i+awpwXqsGBYWkkqMtnbXgrMD+yj7rhW0kuEDxzJaYXGjEW5ogapKNMEKNMjibA==}
    engines: {node: '>= 8'}
    hasBin: true

  wrappy@1.0.2:
    resolution: {integrity: sha512-l4Sp/DRseor9wL6EvV2+TuQn63dMkPjZ/sp9XkghTEbV9KlPS1xUsZ3u7/IQO4wxtcFB4bgpQPRcR3QCvezPcQ==}

  yaml@2.8.3:
    resolution: {integrity: sha512-AvbaCLOO2Otw/lW5bmh9d/WEdcDFdQp2Z2ZUH3pX9U2ihyUY0nvLv7J6TrWowklRGPYbB/IuIMfYgxaCPg5Bpg==}
    engines: {node: '>= 14.6'}
    hasBin: true

  zod-to-json-schema@3.25.1:
    resolution: {integrity: sha512-pM/SU9d3YAggzi6MtR4h7ruuQlqKtad8e9S0fmxcMi+ueAK5Korys/aWcV9LIIHTVbj01NdzxcnXSN+O74ZIVA==}
    peerDependencies:
      zod: ^3.25 || ^4

  zod@4.3.6:
    resolution: {integrity: sha512-rftlrkhHZOcjDwkGlnUtZZkvaPHCsDATp4pGpuOOMDaTdDDXF91wuVDJoWoPsKX/3YPQ5fHuF3STjcYyKr+Qhg==}

snapshots:

  '@hono/node-server@1.19.11(hono@4.12.9)':
    dependencies:
      hono: 4.12.9

  '@modelcontextprotocol/sdk@1.27.1(zod@4.3.6)':
    dependencies:
      '@hono/node-server': 1.19.11(hono@4.12.9)
      ajv: 8.18.0
      ajv-formats: 3.0.1(ajv@8.18.0)
      content-type: 1.0.5
      cors: 2.8.6
      cross-spawn: 7.0.6
      eventsource: 3.0.7
      eventsource-parser: 3.0.6
      express: 5.2.1
      express-rate-limit: 8.3.1(express@5.2.1)
      hono: 4.12.9
      jose: 6.2.2
      json-schema-typed: 8.0.2
      pkce-challenge: 5.0.1
      raw-body: 3.0.2
      zod: 4.3.6
      zod-to-json-schema: 3.25.1(zod@4.3.6)
    transitivePeerDependencies:
      - supports-color

  '@tsconfig/node24@24.0.4': {}

  '@types/better-sqlite3@7.6.13':
    dependencies:
      '@types/node': 25.5.0

  '@types/node@25.5.0':
    dependencies:
      undici-types: 7.18.2

  accepts@2.0.0:
    dependencies:
      mime-types: 3.0.2
      negotiator: 1.0.0

  ajv-formats@3.0.1(ajv@8.18.0):
    optionalDependencies:
      ajv: 8.18.0

  ajv@8.18.0:
    dependencies:
      fast-deep-equal: 3.1.3
      fast-uri: 3.1.0
      json-schema-traverse: 1.0.0
      require-from-string: 2.0.2

  base64-js@1.5.1: {}

  better-sqlite3@12.8.0:
    dependencies:
      bindings: 1.5.0
      prebuild-install: 7.1.3

  bindings@1.5.0:
    dependencies:
      file-uri-to-path: 1.0.0

  bl@4.1.0:
    dependencies:
      buffer: 5.7.1
      inherits: 2.0.4
      readable-stream: 3.6.2

  body-parser@2.2.2:
    dependencies:
      bytes: 3.1.2
      content-type: 1.0.5
      debug: 4.4.3
      http-errors: 2.0.1
      iconv-lite: 0.7.2
      on-finished: 2.4.1
      qs: 6.15.0
      raw-body: 3.0.2
      type-is: 2.0.1
    transitivePeerDependencies:
      - supports-color

  buffer@5.7.1:
    dependencies:
      base64-js: 1.5.1
      ieee754: 1.2.1

  bytes@3.1.2: {}

  call-bind-apply-helpers@1.0.2:
    dependencies:
      es-errors: 1.3.0
      function-bind: 1.1.2

  call-bound@1.0.4:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      get-intrinsic: 1.3.0

  chownr@1.1.4: {}

  commander@14.0.3: {}

  content-disposition@1.0.1: {}

  content-type@1.0.5: {}

  cookie-signature@1.2.2: {}

  cookie@0.7.2: {}

  cors@2.8.6:
    dependencies:
      object-assign: 4.1.1
      vary: 1.1.2

  cross-spawn@7.0.6:
    dependencies:
      path-key: 3.1.1
      shebang-command: 2.0.0
      which: 2.0.2

  debug@4.4.3:
    dependencies:
      ms: 2.1.3

  decompress-response@6.0.0:
    dependencies:
      mimic-response: 3.1.0

  deep-extend@0.6.0: {}

  depd@2.0.0: {}

  detect-libc@2.1.2: {}

  dunder-proto@1.0.1:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      es-errors: 1.3.0
      gopd: 1.2.0

  ee-first@1.1.1: {}

  encodeurl@2.0.0: {}

  end-of-stream@1.4.5:
    dependencies:
      once: 1.4.0

  es-define-property@1.0.1: {}

  es-errors@1.3.0: {}

  es-object-atoms@1.1.1:
    dependencies:
      es-errors: 1.3.0

  escape-html@1.0.3: {}

  etag@1.8.1: {}

  eventsource-parser@3.0.6: {}

  eventsource@3.0.7:
    dependencies:
      eventsource-parser: 3.0.6

  expand-template@2.0.3: {}

  express-rate-limit@8.3.1(express@5.2.1):
    dependencies:
      express: 5.2.1
      ip-address: 10.1.0

  express@5.2.1:
    dependencies:
      accepts: 2.0.0
      body-parser: 2.2.2
      content-disposition: 1.0.1
      content-type: 1.0.5
      cookie: 0.7.2
      cookie-signature: 1.2.2
      debug: 4.4.3
      depd: 2.0.0
      encodeurl: 2.0.0
      escape-html: 1.0.3
      etag: 1.8.1
      finalhandler: 2.1.1
      fresh: 2.0.0
      http-errors: 2.0.1
      merge-descriptors: 2.0.0
      mime-types: 3.0.2
      on-finished: 2.4.1
      once: 1.4.0
      parseurl: 1.3.3
      proxy-addr: 2.0.7
      qs: 6.15.0
      range-parser: 1.2.1
      router: 2.2.0
      send: 1.2.1
      serve-static: 2.2.1
      statuses: 2.0.2
      type-is: 2.0.1
      vary: 1.1.2
    transitivePeerDependencies:
      - supports-color

  fast-deep-equal@3.1.3: {}

  fast-uri@3.1.0: {}

  file-uri-to-path@1.0.0: {}

  finalhandler@2.1.1:
    dependencies:
      debug: 4.4.3
      encodeurl: 2.0.0
      escape-html: 1.0.3
      on-finished: 2.4.1
      parseurl: 1.3.3
      statuses: 2.0.2
    transitivePeerDependencies:
      - supports-color

  forwarded@0.2.0: {}

  fresh@2.0.0: {}

  fs-constants@1.0.0: {}

  function-bind@1.1.2: {}

  get-intrinsic@1.3.0:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      es-define-property: 1.0.1
      es-errors: 1.3.0
      es-object-atoms: 1.1.1
      function-bind: 1.1.2
      get-proto: 1.0.1
      gopd: 1.2.0
      has-symbols: 1.1.0
      hasown: 2.0.2
      math-intrinsics: 1.1.0

  get-proto@1.0.1:
    dependencies:
      dunder-proto: 1.0.1
      es-object-atoms: 1.1.1

  github-from-package@0.0.0: {}

  gopd@1.2.0: {}

  has-symbols@1.1.0: {}

  hasown@2.0.2:
    dependencies:
      function-bind: 1.1.2

  hono@4.12.9: {}

  http-errors@2.0.1:
    dependencies:
      depd: 2.0.0
      inherits: 2.0.4
      setprototypeof: 1.2.0
      statuses: 2.0.2
      toidentifier: 1.0.1

  iconv-lite@0.7.2:
    dependencies:
      safer-buffer: 2.1.2

  ieee754@1.2.1: {}

  inherits@2.0.4: {}

  ini@1.3.8: {}

  ip-address@10.1.0: {}

  ipaddr.js@1.9.1: {}

  is-promise@4.0.0: {}

  isexe@2.0.0: {}

  jose@6.2.2: {}

  json-schema-traverse@1.0.0: {}

  json-schema-typed@8.0.2: {}

  math-intrinsics@1.1.0: {}

  media-typer@1.1.0: {}

  merge-descriptors@2.0.0: {}

  mime-db@1.54.0: {}

  mime-types@3.0.2:
    dependencies:
      mime-db: 1.54.0

  mimic-response@3.1.0: {}

  minimist@1.2.8: {}

  mkdirp-classic@0.5.3: {}

  ms@2.1.3: {}

  napi-build-utils@2.0.0: {}

  negotiator@1.0.0: {}

  node-abi@3.89.0:
    dependencies:
      semver: 7.7.4

  object-assign@4.1.1: {}

  object-inspect@1.13.4: {}

  on-finished@2.4.1:
    dependencies:
      ee-first: 1.1.1

  once@1.4.0:
    dependencies:
      wrappy: 1.0.2

  parseurl@1.3.3: {}

  path-key@3.1.1: {}

  path-to-regexp@8.3.0: {}

  pkce-challenge@5.0.1: {}

  prebuild-install@7.1.3:
    dependencies:
      detect-libc: 2.1.2
      expand-template: 2.0.3
      github-from-package: 0.0.0
      minimist: 1.2.8
      mkdirp-classic: 0.5.3
      napi-build-utils: 2.0.0
      node-abi: 3.89.0
      pump: 3.0.4
      rc: 1.2.8
      simple-get: 4.0.1
      tar-fs: 2.1.4
      tunnel-agent: 0.6.0

  proxy-addr@2.0.7:
    dependencies:
      forwarded: 0.2.0
      ipaddr.js: 1.9.1

  pump@3.0.4:
    dependencies:
      end-of-stream: 1.4.5
      once: 1.4.0

  qs@6.15.0:
    dependencies:
      side-channel: 1.1.0

  range-parser@1.2.1: {}

  raw-body@3.0.2:
    dependencies:
      bytes: 3.1.2
      http-errors: 2.0.1
      iconv-lite: 0.7.2
      unpipe: 1.0.0

  rc@1.2.8:
    dependencies:
      deep-extend: 0.6.0
      ini: 1.3.8
      minimist: 1.2.8
      strip-json-comments: 2.0.1

  readable-stream@3.6.2:
    dependencies:
      inherits: 2.0.4
      string_decoder: 1.3.0
      util-deprecate: 1.0.2

  require-from-string@2.0.2: {}

  router@2.2.0:
    dependencies:
      debug: 4.4.3
      depd: 2.0.0
      is-promise: 4.0.0
      parseurl: 1.3.3
      path-to-regexp: 8.3.0
    transitivePeerDependencies:
      - supports-color

  safe-buffer@5.2.1: {}

  safer-buffer@2.1.2: {}

  semver@7.7.4: {}

  send@1.2.1:
    dependencies:
      debug: 4.4.3
      encodeurl: 2.0.0
      escape-html: 1.0.3
      etag: 1.8.1
      fresh: 2.0.0
      http-errors: 2.0.1
      mime-types: 3.0.2
      ms: 2.1.3
      on-finished: 2.4.1
      range-parser: 1.2.1
      statuses: 2.0.2
    transitivePeerDependencies:
      - supports-color

  serve-static@2.2.1:
    dependencies:
      encodeurl: 2.0.0
      escape-html: 1.0.3
      parseurl: 1.3.3
      send: 1.2.1
    transitivePeerDependencies:
      - supports-color

  setprototypeof@1.2.0: {}

  shebang-command@2.0.0:
    dependencies:
      shebang-regex: 3.0.0

  shebang-regex@3.0.0: {}

  side-channel-list@1.0.0:
    dependencies:
      es-errors: 1.3.0
      object-inspect: 1.13.4

  side-channel-map@1.0.1:
    dependencies:
      call-bound: 1.0.4
      es-errors: 1.3.0
      get-intrinsic: 1.3.0
      object-inspect: 1.13.4

  side-channel-weakmap@1.0.2:
    dependencies:
      call-bound: 1.0.4
      es-errors: 1.3.0
      get-intrinsic: 1.3.0
      object-inspect: 1.13.4
      side-channel-map: 1.0.1

  side-channel@1.1.0:
    dependencies:
      es-errors: 1.3.0
      object-inspect: 1.13.4
      side-channel-list: 1.0.0
      side-channel-map: 1.0.1
      side-channel-weakmap: 1.0.2

  simple-concat@1.0.1: {}

  simple-get@4.0.1:
    dependencies:
      decompress-response: 6.0.0
      once: 1.4.0
      simple-concat: 1.0.1

  statuses@2.0.2: {}

  string_decoder@1.3.0:
    dependencies:
      safe-buffer: 5.2.1

  strip-json-comments@2.0.1: {}

  tar-fs@2.1.4:
    dependencies:
      chownr: 1.1.4
      mkdirp-classic: 0.5.3
      pump: 3.0.4
      tar-stream: 2.2.0

  tar-stream@2.2.0:
    dependencies:
      bl: 4.1.0
      end-of-stream: 1.4.5
      fs-constants: 1.0.0
      inherits: 2.0.4
      readable-stream: 3.6.2

  toidentifier@1.0.1: {}

  tunnel-agent@0.6.0:
    dependencies:
      safe-buffer: 5.2.1

  type-is@2.0.1:
    dependencies:
      content-type: 1.0.5
      media-typer: 1.1.0
      mime-types: 3.0.2

  typescript@5.9.3: {}

  undici-types@7.18.2: {}

  unpipe@1.0.0: {}

  util-deprecate@1.0.2: {}

  vary@1.1.2: {}

  which@2.0.2:
    dependencies:
      isexe: 2.0.0

  wrappy@1.0.2: {}

  yaml@2.8.3: {}

  zod-to-json-schema@3.25.1(zod@4.3.6):
    dependencies:
      zod: 4.3.6

  zod@4.3.6: {}



## Convention Reference (sibling files not modified by this commission)

=== CONTEXT FILE: README.md ===
# Nexus Mk 2.1

A framework for operating multi-agent AI workforces. Nexus provides the guild model: a structured workspace where animas (AI identities) receive commissions, use tools, record work, and collaborate through a shared Books database and event-driven Clockworks.

The framework is plugin-based. Almost everything — tools, engines, database schemas, anima management — is contributed by plugins. The core runtime is intentionally minimal.

---

## For users

### Install the CLI

```sh
npm install -g @shardworks/nexus
```

This installs the `nsg` command globally.

### Initialize a guild

A guild is the workspace where animas operate. Create one with `nsg init`:

```sh
nsg init ./my-guild --name my-guild
cd my-guild
```

This writes `guild.json`, `package.json`, `.gitignore`, and the `.nexus/` directory structure. It does not install any plugins or create any animas.

### Install plugins

Plugins are npm packages that contribute tools, engines, database schemas, and other capabilities to your guild. Install them with `nsg rig install`:

```sh
# Install from npm
nsg rig install @shardworks/nexus-stdlib

# Pin a version
nsg rig install @shardworks/nexus-stdlib@1.2.0

# Install from a git repository
nsg rig install git+https://github.com/acme/my-plugin.git

# Symlink a local directory during development
nsg rig install ./path/to/my-plugin --type link
```

By default, a plugin's tools are added to `baseTools` (available to all animas). To assign tools to specific roles instead:

```sh
nsg rig install @shardworks/nexus-stdlib --roles artificer,scribe
```

List installed plugins:

```sh
nsg rig list
```

Remove a plugin:

```sh
nsg rig remove nexus-stdlib
```

### Check guild status

```sh
nsg status          # guild name, nexus version, installed plugins, roles
nsg version         # framework version + installed plugin versions
```

### `guild.json`

The guild's central configuration file. Updated automatically by `nsg rig install` and `nsg rig remove`. Stores the plugin list, role definitions, tool assignments, Clockworks standing orders, and guild settings.

Plugins are listed by their derived plugin id (package name with the `@shardworks/` scope stripped):

```json
{
  "name": "my-guild",
  "nexus": "2.1.0",
  "plugins": ["nexus-stdlib", "nexus-clockworks"],
  "baseTools": ["commission", "signal", "list-writs"],
  "roles": { ... },
  "settings": { "model": "claude-opus-4-5" }
}
```

---

## For plugin authors

Nexus plugins are npm packages that contribute capabilities to a guild. There are two kinds:

- **Kit** — a passive package contributing tools, engines, relays, or other capabilities. No lifecycle; contributions are read at load time and used by consuming apparatuses.
- **Apparatus** — a package contributing persistent running infrastructure. Has a `start`/`stop` lifecycle, receives `GuildContext` at startup, and exposes a runtime API via `provides`.

Plugin authors import exclusively from `@shardworks/nexus-core`. The arbor runtime (`@shardworks/nexus-arbor`) is an internal concern of the CLI and session provider.

### Key points

- A plugin's **name is inferred from its npm package name** at load time — never declared in the manifest.
- A **kit** is a plain object exported as `{ kit: { ... } }`. The `tools` field (array of `ToolDefinition`) is the most common contribution.
- An **apparatus** is exported as `{ apparatus: { start, stop?, provides?, requires?, supportKit?, consumes? } }`.
- `requires` on a kit names apparatuses whose runtime APIs the kit's tool handlers will call. Hard startup failure if not installed.
- `requires` on an apparatus names other apparatuses that must be started first. Determines start order.
- Apparatus `provides` objects are retrieved at handler invocation time via `ctx.apparatus<T>(name)`.

### Authoring tools

The `tool()` function is the primary authoring entry point. Define a name, description, Zod param schema, and a handler:

```typescript
import { tool } from '@shardworks/nexus-core';
import { z } from 'zod';

const greet = tool({
  name: 'greet',
  description: 'Greet someone by name',
  params: {
    name: z.string().describe('Name to greet'),
  },
  handler: async ({ name }, ctx) => {
    return `Hello, ${name}! Guild root: ${ctx.home}`;
  },
});
```

The handler receives:
- `params` — validated input, typed from your Zod schemas
- `ctx` — a `HandlerContext` with `home` (guild root path) and `apparatus<T>(name)` for accessing started apparatus APIs

Restrict a tool to specific callers with `callableBy`:

```typescript
tool({
  name: 'admin-reset',
  callableBy: ['cli'],    // CLI only — not available to animas
  // ...
});
```

### Exporting a kit

A kit is the simplest plugin form — a plain object with a `kit` key:

```typescript
import { tool, type Kit } from '@shardworks/nexus-core';

const myTool = tool({ name: 'lookup', /* ... */ });

export default {
  kit: {
    tools: [myTool],

    // Optional: declare required apparatuses whose APIs your handlers call
    requires: ['nexus-books'],

    // Optional: document contribution fields for consuming apparatuses
    // (field types are defined by the apparatus packages that consume them)
    books: {
      records: { indexes: ['status', 'createdAt'] },
    },
  } satisfies Kit,
};
```

The `tools` field is the most common kit contribution. Other contribution fields (`engines`, `relays`, etc.) are defined by the apparatus packages that consume them — the framework treats any unknown field as opaque data.

### Exporting an apparatus

An apparatus has a `start`/`stop` lifecycle and can expose a runtime API:

```typescript
import { type Apparatus, type GuildContext } from '@shardworks/nexus-core';

// The API you expose to other plugins
interface MyApi {
  lookup(key: string): string | null;
}

const store = new Map<string, string>();

export default {
  apparatus: {
    // Apparatuses this one requires to be started first
    requires: ['nexus-books'],

    // The runtime API object exposed via ctx.apparatus<MyApi>('my-plugin')
    provides: {
      lookup(key: string) { return store.get(key) ?? null; },
    } satisfies MyApi,

    async start(ctx: GuildContext) {
      // ctx.apparatus<BooksApi>('nexus-books') is available here
      // ctx.kits() — snapshot of all loaded kits
      // ctx.on('plugin:initialized', handler) — react to kit contributions
    },

    async stop() {
      store.clear();
    },
  } satisfies Apparatus,
};
```

Consumers retrieve your `provides` object via `ctx.apparatus<MyApi>('my-plugin')` — either in their own `start()` or in tool handlers via `HandlerContext.apparatus<T>()`.

An apparatus can also contribute tools via `supportKit`:

```typescript
export default {
  apparatus: {
    supportKit: {
      tools: [myAdminTool],
    },
    // ...
  },
};
```

### `HandlerContext`

Injected into every tool and engine handler at invocation time:

```typescript
interface HandlerContext {
  home: string;                        // absolute path to the guild root
  apparatus<T>(name: string): T;       // access a started apparatus's provides object
}
```

### Further reading

- [`packages/arbor/README.md`](packages/arbor/README.md) — runtime API reference (`createArbor`, `Arbor`, `LoadedKit`, `LoadedApparatus`, `derivePluginId`, Books database)
- [`docs/architecture/plugins.md`](docs/architecture/plugins.md) — full plugin architecture specification
- [`docs/architecture/apparatus/books.md`](docs/architecture/apparatus/books.md) — Books apparatus design (in progress)

=== CONTEXT FILE: package.json ===
{
  "private": true,
  "packageManager": "pnpm@10.32.1",
  "version": "0.0.0",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/shardworks/nexus-mk2"
  },
  "type": "module",
  "engines": {
    "node": "24.x"
  },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "nsg": "node --disable-warning=ExperimentalWarning --experimental-transform-types packages/framework/cli/src/cli.ts",
    "vibe": "node --disable-warning=ExperimentalWarning --experimental-transform-types packages/framework/cli/src/cli.ts --guild-root /workspace/vibers"
  },
  "devDependencies": {
    "@tsconfig/node24": "24.0.4",
    "typescript": "5.9.3"
  },
  "pnpm": {
    "onlyBuiltDependencies": [
      "better-sqlite3"
    ]
  }
}

=== CONTEXT FILE: LICENSE ===
ISC License

Copyright (c) 2026 Sean Boots

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

=== CONTEXT FILE: packages/framework/cli/src/program.test.ts ===
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { toFlag, isBooleanSchema, findGroupPrefixes, coerceCliOpts } from './helpers.ts';
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

describe('coerceCliOpts', () => {
  // Number coercion — happy path
  it('converts integer string to number', () => {
    const shape = { limit: z.number() };
    assert.deepEqual(coerceCliOpts(shape, { limit: '5' }), { limit: 5 });
  });

  it('converts float string to number', () => {
    const shape = { ratio: z.number() };
    assert.deepEqual(coerceCliOpts(shape, { ratio: '1.5' }), { ratio: 1.5 });
  });

  it('converts negative number string', () => {
    const shape = { offset: z.number() };
    assert.deepEqual(coerceCliOpts(shape, { offset: '-3' }), { offset: -3 });
  });

  it('coerces optional number', () => {
    const shape = { limit: z.number().optional() };
    assert.deepEqual(coerceCliOpts(shape, { limit: '10' }), { limit: 10 });
  });

  it('coerces optional number with default', () => {
    const shape = { limit: z.number().optional().default(20) };
    assert.deepEqual(coerceCliOpts(shape, { limit: '5' }), { limit: 5 });
  });

  it('coerces number with default (no optional)', () => {
    const shape = { limit: z.number().default(20) };
    assert.deepEqual(coerceCliOpts(shape, { limit: '5' }), { limit: 5 });
  });

  // Pass-through — values that must not be coerced
  it('leaves string param unchanged', () => {
    const shape = { name: z.string() };
    assert.deepEqual(coerceCliOpts(shape, { name: 'hello' }), { name: 'hello' });
  });

  it('leaves enum param unchanged', () => {
    const shape = { status: z.enum(['ready', 'active']) };
    assert.deepEqual(coerceCliOpts(shape, { status: 'ready' }), { status: 'ready' });
  });

  it('passes undefined through unchanged', () => {
    const shape = { limit: z.number().optional() };
    assert.deepEqual(coerceCliOpts(shape, { limit: undefined }), { limit: undefined });
  });

  it('passes missing key through unchanged', () => {
    const shape = { limit: z.number().optional() };
    assert.deepEqual(coerceCliOpts(shape, {}), {});
  });

  it('leaves boolean value (true) unchanged', () => {
    const shape = { force: z.boolean().optional() };
    assert.deepEqual(coerceCliOpts(shape, { force: true }), { force: true });
  });

  // Mixed shapes
  it('only coerces number fields in mixed shape', () => {
    const shape = {
      name: z.string(),
      limit: z.number().optional(),
      status: z.enum(['a', 'b']).optional(),
    };
    const opts = { name: 'test', limit: '5', status: 'a' };
    assert.deepEqual(coerceCliOpts(shape, opts), { name: 'test', limit: 5, status: 'a' });
  });

  // Edge / error cases
  it('non-numeric string becomes NaN', () => {
    const shape = { limit: z.number() };
    const result = coerceCliOpts(shape, { limit: 'abc' });
    assert.ok(Number.isNaN(result['limit'] as number));
  });

  it('empty string becomes 0 (Number("") === 0)', () => {
    const shape = { limit: z.number() };
    assert.deepEqual(coerceCliOpts(shape, { limit: '' }), { limit: 0 });
  });

  it('empty shape leaves extra keys unchanged', () => {
    const shape = {};
    assert.deepEqual(coerceCliOpts(shape, { anything: 'value' }), { anything: 'value' });
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
 * Check whether a Zod schema is a number type, possibly wrapped
 * in ZodOptional and/or ZodDefault.
 */
function isNumberSchema(schema: z.ZodTypeAny): boolean {
  let inner: z.ZodTypeAny = schema;

  if (inner instanceof z.ZodOptional) {
    inner = inner.unwrap() as z.ZodTypeAny;
  }
  if (inner instanceof z.ZodDefault) {
    inner = inner.unwrap() as z.ZodTypeAny;
  }
  // Handle the reverse nesting order too (default wrapping optional)
  if (inner instanceof z.ZodOptional) {
    inner = inner.unwrap() as z.ZodTypeAny;
  }

  return inner instanceof z.ZodNumber;
}

/**
 * Coerce Commander string opts to match the expected Zod schema types.
 *
 * Commander passes all --option <value> arguments as strings. This function
 * walks the Zod shape and converts string values to numbers where the
 * schema expects z.number() (including when wrapped in ZodOptional/ZodDefault).
 *
 * Undefined values pass through unchanged — Zod handles optional/default.
 * Non-number schemas are left untouched.
 */
export function coerceCliOpts(
  shape: Record<string, z.ZodTypeAny>,
  opts: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...opts };

  for (const [key, schema] of Object.entries(shape)) {
    const value = result[key];
    if (typeof value !== 'string') continue;

    if (isNumberSchema(schema)) {
      result[key] = Number(value);
    }
  }

  return result;
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

=== CONTEXT FILE: packages/framework/cli/src/commands ===
tree dfac453:packages/framework/cli/src/commands

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

=== CONTEXT FILE: packages/framework/cli/src/commands/init.test.ts ===
/**
 * Tests for the `init` framework command.
 *
 * Tests the handler directly — no CLI layer involved.
 * init does not use guild() — it creates a new guild from scratch.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import initTool from './init.ts';
import { makeTmpDir, cleanupTestState } from './test-helpers.ts';

afterEach(() => {
  cleanupTestState();
});

describe('nsg init', () => {
  it('creates guild.json with correct shape', async () => {
    const tmp = makeTmpDir('init');
    const guildPath = path.join(tmp, 'my-guild');

    await initTool.handler({ path: guildPath });

    const config = JSON.parse(fs.readFileSync(path.join(guildPath, 'guild.json'), 'utf-8'));
    assert.equal(config.name, 'my-guild');
    assert.equal(config.settings?.model, 'sonnet');
    assert.deepEqual(config.plugins, []);
    // V3: no baseTools or roles (permission model — roles owned by Loom)
    assert.equal(config.baseTools, undefined);
    assert.equal(config.roles, undefined);
    assert.equal(config.tools, undefined);
    assert.equal(config.engines, undefined);
  });

  it('creates package.json', async () => {
    const tmp = makeTmpDir('init');
    const guildPath = path.join(tmp, 'test-guild');

    await initTool.handler({ path: guildPath });

    const pkg = JSON.parse(fs.readFileSync(path.join(guildPath, 'package.json'), 'utf-8'));
    assert.equal(pkg.name, 'guild-test-guild');
    assert.equal(pkg.private, true);
    assert.equal(pkg.type, 'module');
  });

  it('creates .gitignore', async () => {
    const tmp = makeTmpDir('init');
    const guildPath = path.join(tmp, 'g');

    await initTool.handler({ path: guildPath });

    const gitignore = fs.readFileSync(path.join(guildPath, '.gitignore'), 'utf-8');
    assert.ok(gitignore.includes('node_modules/'));
    assert.ok(gitignore.includes('.nexus/'));
  });

  it('scaffolds directories', async () => {
    const tmp = makeTmpDir('init');
    const guildPath = path.join(tmp, 'g');

    await initTool.handler({ path: guildPath });

    assert.ok(fs.existsSync(path.join(guildPath, '.nexus')));
  });

  it('respects --name override', async () => {
    const tmp = makeTmpDir('init');
    const guildPath = path.join(tmp, 'dir-name');

    await initTool.handler({ path: guildPath, name: 'custom-name' });

    const config = JSON.parse(fs.readFileSync(path.join(guildPath, 'guild.json'), 'utf-8'));
    assert.equal(config.name, 'custom-name');
  });

  it('respects --model override', async () => {
    const tmp = makeTmpDir('init');
    const guildPath = path.join(tmp, 'g');

    await initTool.handler({ path: guildPath, model: 'opus' });

    const config = JSON.parse(fs.readFileSync(path.join(guildPath, 'guild.json'), 'utf-8'));
    assert.equal(config.settings?.model, 'opus');
  });

  it('fails on non-empty directory', async () => {
    const tmp = makeTmpDir('init');
    const guildPath = path.join(tmp, 'exists');
    fs.mkdirSync(guildPath);
    fs.writeFileSync(path.join(guildPath, 'file.txt'), 'not empty');

    await assert.rejects(
      async () => initTool.handler({ path: guildPath }),
      /not empty/,
    );
  });
});

=== CONTEXT FILE: packages/framework/cli/src/commands/test-helpers.ts ===
/**
 * Shared test helpers for CLI command tests.
 *
 * Provides guild accessor setup, temp directory management, and minimal
 * guild.json scaffolding. Extracted from status.test.ts, version.test.ts,
 * and plugin.test.ts where these were copy-pasted identically.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setGuild, clearGuild } from '@shardworks/nexus-core';

/** Accumulates temp dirs for cleanup in afterEach. */
let tmpDirs: string[] = [];

/** Set up a minimal guild accessor pointing at the given directory. */
export function setupGuildAccessor(home: string): void {
  setGuild({
    home,
    apparatus: () => { throw new Error('not available in test'); },
    config: () => ({}) as never,
    writeConfig: () => { throw new Error('not available in test'); },
    guildConfig: () => ({}) as never,
    kits: () => [],
    apparatuses: () => [],
    failedPlugins: () => [],
  });
}

/** Create a temp directory and register it for cleanup. */
export function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nsg-${prefix}-test-`));
  tmpDirs.push(dir);
  return dir;
}

/** Write a minimal guild.json to dir, with optional overrides. */
export function makeGuild(dir: string, overrides: Record<string, unknown> = {}): void {
  const config = {
    name: 'test-guild',
    nexus: '0.0.0',
    plugins: [],
    settings: { model: 'sonnet' },
    ...overrides,
  };
  fs.writeFileSync(path.join(dir, 'guild.json'), JSON.stringify(config, null, 2) + '\n');
}

/** Write a guild-root package.json declaring the given npm dependencies. */
export function makeGuildPackageJson(dir: string, deps: Record<string, string>): void {
  const pkg = { name: 'test-guild', version: '1.0.0', dependencies: deps };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
}

/** Clean up guild state and temp directories. Call from afterEach(). */
export function cleanupTestState(): void {
  clearGuild();
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
}

=== CONTEXT FILE: packages/framework/cli/src/commands/index.ts ===
/**
 * Framework commands — hardcoded CLI commands that work with or without a guild.
 *
 * These are guild lifecycle and plugin management commands that the CLI
 * registers directly, bypassing plugin discovery. They are the CLI's own
 * commands, not tools contributed by kits or apparatus.
 *
 * Plugin-contributed tools are discovered at runtime via The Instrumentarium
 * when a guild is present and the tools apparatus is installed.
 */

import type { ToolDefinition } from '@shardworks/tools-apparatus';
import init from './init.ts';
import version from './version.ts';
import status from './status.ts';
import upgrade from './upgrade.ts';
import { pluginList, pluginInstall, pluginRemove, pluginUpgrade } from './plugin.ts';

/** All framework commands, typed as the base ToolDefinition for uniform handling. */
export const frameworkCommands = [
  init,
  version,
  status,
  upgrade,
  pluginList,
  pluginInstall,
  pluginRemove,
  pluginUpgrade,
] as ToolDefinition[];

=== CONTEXT FILE: packages/plugins/animator/src/tools/session-tools.test.ts ===
/**
 * Tests for session-list and session-show tools.
 *
 * Uses the same fake guild + in-memory Stacks harness as the main animator
 * tests. Seeds session documents directly into Stacks, then exercises the
 * tool handlers to verify query construction, filtering, and error handling.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import type { Guild } from '@shardworks/nexus-core';
import { createStacksApparatus } from '@shardworks/stacks-apparatus';
import { MemoryBackend } from '@shardworks/stacks-apparatus/testing';
import type { StacksApi, Book } from '@shardworks/stacks-apparatus';

import type { SessionDoc } from '../types.ts';
import sessionList from './session-list.ts';
import sessionShow from './session-show.ts';

// ── Test harness ────────────────────────────────────────────────────

let stacks: StacksApi;
let sessions: Book<SessionDoc>;

function setup() {
  const memBackend = new MemoryBackend();
  const stacksPlugin = createStacksApparatus(memBackend);

  const apparatusMap = new Map<string, unknown>();

  const fakeGuild: Guild = {
    home: '/tmp/fake-guild',
    apparatus<T>(name: string): T {
      const api = apparatusMap.get(name);
      if (!api) throw new Error(`Apparatus "${name}" not installed`);
      return api as T;
    },
    config<T>(): T {
      return {} as T;
    },
    writeConfig() { /* noop in test */ },
    guildConfig: () => ({
      name: 'test-guild',
      nexus: '0.0.0',
      workshops: {},
      roles: {},
      baseTools: [],
      plugins: [],
      settings: { model: 'sonnet' },
    }),
    kits: () => [],
    apparatuses: () => [],
  };

  setGuild(fakeGuild);

  const sa = (stacksPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  sa.start({ on: () => {} });
  stacks = sa.provides as StacksApi;
  apparatusMap.set('stacks', stacks);

  memBackend.ensureBook({ ownerId: 'animator', book: 'sessions' }, {
    indexes: ['startedAt', 'status', 'conversationId', 'provider'],
  });

  sessions = stacks.book<SessionDoc>('animator', 'sessions');
}

// ── Seed data ───────────────────────────────────────────────────────

const seedSessions: SessionDoc[] = [
  {
    id: 'ses-00000001',
    status: 'completed',
    startedAt: '2026-04-01T10:00:00Z',
    endedAt: '2026-04-01T10:05:00Z',
    durationMs: 300000,
    provider: 'claude-code',
    exitCode: 0,
    costUsd: 0.42,
    conversationId: 'conv-aaa',
    metadata: { trigger: 'summon', animaName: 'scribe' },
  },
  {
    id: 'ses-00000002',
    status: 'failed',
    startedAt: '2026-04-01T11:00:00Z',
    endedAt: '2026-04-01T11:01:00Z',
    durationMs: 60000,
    provider: 'claude-code',
    exitCode: 1,
    error: 'Process crashed',
    conversationId: 'conv-bbb',
  },
  {
    id: 'ses-00000003',
    status: 'completed',
    startedAt: '2026-04-01T12:00:00Z',
    endedAt: '2026-04-01T12:10:00Z',
    durationMs: 600000,
    provider: 'other-provider',
    exitCode: 0,
    costUsd: 1.20,
    conversationId: 'conv-aaa',
  },
  {
    id: 'ses-00000004',
    status: 'timeout',
    startedAt: '2026-04-01T13:00:00Z',
    endedAt: '2026-04-01T13:05:00Z',
    durationMs: 300000,
    provider: 'claude-code',
    exitCode: 124,
    error: 'Session timed out',
  },
  {
    id: 'ses-00000005',
    status: 'running',
    startedAt: '2026-04-01T14:00:00Z',
    provider: 'claude-code',
  },
];

async function seedAll() {
  for (const doc of seedSessions) {
    await sessions.put(doc);
  }
}

// ── Tests ───────────────────────────────────────────────────────────

describe('session-list tool', () => {
  beforeEach(async () => {
    setup();
    await seedAll();
  });

  afterEach(() => {
    clearGuild();
  });

  it('returns all sessions with no filters', async () => {
    const results = await sessionList.handler({ limit: 20 });
    assert.equal(results.length, 5);
  });

  it('filters by status', async () => {
    const results = await sessionList.handler({ status: 'completed', limit: 20 });
    assert.equal(results.length, 2);
    for (const r of results) {
      assert.equal(r.status, 'completed');
    }
  });

  it('filters by provider', async () => {
    const results = await sessionList.handler({ provider: 'other-provider', limit: 20 });
    assert.equal(results.length, 1);
    assert.equal(results[0]!.id, 'ses-00000003');
  });

  it('filters by conversationId', async () => {
    const results = await sessionList.handler({ conversationId: 'conv-aaa', limit: 20 });
    assert.equal(results.length, 2);
    const ids = results.map((r) => r.id).sort();
    assert.deepEqual(ids, ['ses-00000001', 'ses-00000003']);
  });

  it('filters by running status', async () => {
    const results = await sessionList.handler({ status: 'running', limit: 20 });
    assert.equal(results.length, 1);
    assert.equal(results[0]!.id, 'ses-00000005');
  });

  it('combines multiple filters', async () => {
    const results = await sessionList.handler({
      status: 'completed',
      provider: 'claude-code',
      limit: 20,
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]!.id, 'ses-00000001');
  });

  it('respects limit', async () => {
    const results = await sessionList.handler({ limit: 2 });
    assert.equal(results.length, 2);
  });

  it('returns summary projection (expected fields only)', async () => {
    const results = await sessionList.handler({ limit: 1 });
    assert.equal(results.length, 1);
    const keys = Object.keys(results[0]!).sort();
    assert.deepEqual(keys, [
      'costUsd', 'durationMs', 'endedAt', 'exitCode',
      'id', 'provider', 'startedAt', 'status',
    ]);
  });

  it('returns empty array when no sessions match', async () => {
    const results = await sessionList.handler({ provider: 'nonexistent', limit: 20 });
    assert.equal(results.length, 0);
  });
});

describe('session-show tool', () => {
  beforeEach(async () => {
    setup();
    await seedAll();
  });

  afterEach(() => {
    clearGuild();
  });

  it('returns full session record by id', async () => {
    const result = await sessionShow.handler({ id: 'ses-00000001' });
    assert.equal(result.id, 'ses-00000001');
    assert.equal(result.status, 'completed');
    assert.equal(result.provider, 'claude-code');
    assert.equal(result.costUsd, 0.42);
    assert.deepEqual(result.metadata, { trigger: 'summon', animaName: 'scribe' });
  });

  it('returns session with error fields', async () => {
    const result = await sessionShow.handler({ id: 'ses-00000002' });
    assert.equal(result.status, 'failed');
    assert.equal(result.error, 'Process crashed');
    assert.equal(result.exitCode, 1);
  });

  it('throws for missing session id', async () => {
    await assert.rejects(
      () => sessionShow.handler({ id: 'ses-nonexistent' }),
      { message: 'Session "ses-nonexistent" not found.' },
    );
  });
});

=== CONTEXT FILE: packages/plugins/animator/src/tools/session-list.ts ===
/**
 * session-list tool — list recent sessions with optional filters.
 *
 * Queries The Animator's `sessions` book in The Stacks.
 * Returns session summaries ordered by startedAt descending (newest first).
 *
 * See: docs/specification.md (animator § session-list tool)
 */

import { tool } from '@shardworks/tools-apparatus';
import { guild } from '@shardworks/nexus-core';
import { z } from 'zod';
import type { StacksApi, WhereCondition } from '@shardworks/stacks-apparatus';
import type { SessionDoc } from '../types.ts';

export default tool({
  name: 'session-list',
  description: 'List recent sessions with optional filters',
  instructions:
    'Returns session summaries ordered by start time (newest first). ' +
    'Use for investigating recent activity, debugging, or reporting. ' +
    'Filters by indexed fields only — use Stacks queries directly for metadata fields.',
  params: {
    status: z.enum(['running', 'completed', 'failed', 'timeout']).optional()
      .describe('Filter by session status'),
    provider: z.string().optional()
      .describe('Filter by provider name (e.g. "claude-code")'),
    conversationId: z.string().optional()
      .describe('Filter by conversation id'),
    limit: z.number().optional().default(20)
      .describe('Maximum results (default: 20)'),
  },
  permission: 'read',
  handler: async (params) => {
    const stacks = guild().apparatus<StacksApi>('stacks');
    const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');

    const where: WhereCondition[] = [];
    if (params.status) where.push(['status', '=', params.status]);
    if (params.provider) where.push(['provider', '=', params.provider]);
    if (params.conversationId) where.push(['conversationId', '=', params.conversationId]);

    const results = await sessions.find({
      where: where.length > 0 ? where : undefined,
      orderBy: ['startedAt', 'desc'],
      limit: params.limit,
    });

    // Return summary projection
    return results.map((s) => ({
      id: s.id,
      status: s.status,
      provider: s.provider,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationMs: s.durationMs,
      exitCode: s.exitCode,
      costUsd: s.costUsd,
    }));
  },
});

=== CONTEXT FILE: packages/plugins/animator/src/tools/session-show.ts ===
/**
 * session-show tool — show full detail for a single session by id.
 *
 * Reads the complete session record from The Animator's `sessions` book
 * in The Stacks, including tokenUsage, metadata, and all indexed fields.
 *
 * See: docs/specification.md (animator § session-show tool)
 */

import { tool } from '@shardworks/tools-apparatus';
import { guild } from '@shardworks/nexus-core';
import { z } from 'zod';
import type { StacksApi } from '@shardworks/stacks-apparatus';
import type { SessionDoc } from '../types.ts';

export default tool({
  name: 'session-show',
  description: 'Show full detail for a single session by id',
  instructions:
    'Returns the complete session record from The Stacks, including ' +
    'tokenUsage, metadata, and all indexed fields.',
  params: {
    id: z.string().describe('Session id'),
  },
  permission: 'read',
  handler: async (params) => {
    const stacks = guild().apparatus<StacksApi>('stacks');
    const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');

    const session = await sessions.get(params.id);
    if (!session) {
      throw new Error(`Session "${params.id}" not found.`);
    }
    return session;
  },
});

=== CONTEXT FILE: packages/plugins/claude-code/src/index.ts ===
/**
 * Claude Code Session Provider
 *
 * Apparatus plugin that implements AnimatorSessionProvider for the
 * Claude Code CLI. The Animator discovers this via guild config:
 *
 *   guild.json["animator"]["sessionProvider"] = "claude-code"
 *
 * Launches sessions via the `claude` CLI in autonomous mode (--print)
 * with --output-format stream-json for structured telemetry.
 *
 * Key design choice: uses async spawn() instead of spawnSync().
 * This is required for stream-json transcript parsing, timeout enforcement,
 * and future concurrent session support.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Plugin } from '@shardworks/nexus-core';
import type {
  AnimatorSessionProvider,
  SessionProviderConfig,
  SessionProviderResult,
  SessionChunk,
} from '@shardworks/animator-apparatus';

import { startMcpHttpServer } from './mcp-server.ts';
import type { McpHttpHandle } from './mcp-server.ts';

// ── Session File Preparation ────────────────────────────────────────────

/** Prepared session files in a temp directory. */
interface PreparedSession {
  tmpDir: string;
  args: string[];
  /** If an MCP server was started, this handle closes it. */
  mcpHandle?: McpHttpHandle;
}

/**
 * Prepare session files and build base CLI args.
 *
 * Writes system prompt to a temp directory. Builds the base args array
 * including --resume support. When tools are provided, starts an
 * in-process MCP HTTP server and writes --mcp-config.
 *
 * Caller is responsible for cleaning up tmpDir and calling mcpHandle.close().
 */
async function prepareSession(config: SessionProviderConfig): Promise<PreparedSession> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nsg-session-'));

  const args: string[] = [
    '--setting-sources', 'user',
    '--dangerously-skip-permissions',
    '--model', config.model,
  ];

  if (config.systemPrompt) {
    const systemPromptPath = path.join(tmpDir, 'system-prompt.md');
    fs.writeFileSync(systemPromptPath, config.systemPrompt);
    args.push('--system-prompt-file', systemPromptPath);
  }

  // Resume an existing conversation
  if (config.conversationId) {
    args.push('--resume', config.conversationId);
  }

  // Tool-equipped session: start MCP HTTP server, write --mcp-config
  let mcpHandle: McpHttpHandle | undefined;

  if (config.tools && config.tools.length > 0) {
    const tools = config.tools.map((rt) => rt.definition);
    mcpHandle = await startMcpHttpServer(tools);

    const mcpConfig = {
      mcpServers: {
        'nexus-guild': {
          type: 'sse',
          url: mcpHandle.url,
        },
      },
    };

    const mcpConfigPath = path.join(tmpDir, 'mcp-config.json');
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig));
    args.push('--mcp-config', mcpConfigPath, '--strict-mcp-config');
  }

  return { tmpDir, args, mcpHandle };
}

// ── Output extraction ───────────────────────────────────────────────

/**
 * Extract the final assistant text from a transcript.
 *
 * Walks the transcript backwards to find the last `assistant` message
 * and concatenates its text content blocks.
 *
 * @internal Exported for testing only.
 */
export function extractFinalAssistantText(transcript: Record<string, unknown>[]): string | undefined {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const msg = transcript[i]!;
    if (msg.type !== 'assistant') continue;

    const message = msg.message as Record<string, unknown> | undefined;
    const content = message?.content as Array<Record<string, unknown>> | undefined;
    if (!content) continue;

    const text = content
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('');

    return text || undefined;
  }
  return undefined;
}

// ── Result builder ──────────────────────────────────────────────────

function buildResult(raw: StreamJsonResult): SessionProviderResult {
  const status = raw.exitCode === 0 ? 'completed' as const : 'failed' as const;
  return {
    status,
    exitCode: raw.exitCode,
    error: status === 'failed' ? `claude exited with code ${raw.exitCode}` : undefined,
    costUsd: raw.costUsd,
    tokenUsage: raw.tokenUsage,
    providerSessionId: raw.providerSessionId,
    transcript: raw.transcript,
    output: extractFinalAssistantText(raw.transcript),
  };
}

// ── Provider implementation ──────────────────────────────────────────

const provider: AnimatorSessionProvider = {
  name: 'claude-code',

  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>;
    result: Promise<SessionProviderResult>;
  } {
    // prepareSession is async (MCP server start), so we wrap the launch
    // in a promise. The chunks iterable bridges the async gap — it waits
    // for prep to complete before yielding.

    let chunkResolve: (() => void) | null = null;
    let innerChunks: AsyncIterable<SessionChunk> | null = null;
    let innerIterator: AsyncIterator<SessionChunk> | null = null;
    let prepDone = false;
    let prepError: Error | null = null;
    let done = false;

    const result = prepareSession(config).then(async ({ tmpDir, args, mcpHandle }) => {
      // Autonomous mode: prompt piped via stdin (--print - reads from stdin).
      // This avoids Commander parsing issues when the prompt starts with '-'
      // (e.g. YAML frontmatter '---') and also avoids OS arg length limits.
      const prompt = config.initialPrompt ?? '';
      args.push(
        '--print', '-',
        '--output-format', 'stream-json',
        '--verbose',
      );

      const cleanup = async () => {
        await mcpHandle?.close().catch(() => {});
        fs.rmSync(tmpDir, { recursive: true, force: true });
      };

      try {
        if (config.streaming) {
          const spawned = spawnClaudeStreamingJson(args, config.cwd, config.environment, prompt);
          innerChunks = spawned.chunks;
          prepDone = true;
          if (chunkResolve) { chunkResolve(); chunkResolve = null; }

          const raw = await spawned.result;
          await cleanup();
          return buildResult(raw);
        }

        // Non-streaming
        prepDone = true;
        done = true;
        if (chunkResolve) { chunkResolve(); chunkResolve = null; }

        const raw = await spawnClaudeStreamJson(args, config.cwd, config.environment, prompt);
        await cleanup();
        return buildResult(raw);
      } catch (err) {
        await cleanup();
        throw err;
      }
    }).catch((err) => {
      // If prep itself failed, unblock the chunk iterator
      prepError = err instanceof Error ? err : new Error(String(err));
      prepDone = true;
      done = true;
      if (chunkResolve) { chunkResolve(); chunkResolve = null; }
      throw err;
    });

    // Chunks iterable that bridges the async prep gap. In non-streaming
    // mode or on error, it completes immediately with no items.
    const chunks: AsyncIterable<SessionChunk> = {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<SessionChunk>> {
            // Wait for prep to complete
            while (!prepDone) {
              await new Promise<void>((resolve) => { chunkResolve = resolve; });
            }

            if (prepError || done) {
              return { value: undefined as unknown as SessionChunk, done: true };
            }

            // Delegate to inner streaming iterator
            if (innerChunks && !innerIterator) {
              innerIterator = innerChunks[Symbol.asyncIterator]();
            }

            if (innerIterator) {
              return innerIterator.next();
            }

            return { value: undefined as unknown as SessionChunk, done: true };
          },
        };
      },
    };

    return { chunks, result };
  },
};

// ── Apparatus export ─────────────────────────────────────────────────

/**
 * Create the Claude Code session provider apparatus.
 *
 * The apparatus has no startup logic — it just provides the
 * AnimatorSessionProvider implementation. The Animator looks it up
 * via guild().apparatus('claude-code').
 */
export function createClaudeCodeProvider(): Plugin {
  return {
    apparatus: {
      requires: [],
      provides: provider,

      start() {
        // No startup work — the provider is stateless.
      },
    },
  };
}

export default createClaudeCodeProvider();

// ── MCP server re-exports ───────────────────────────────────────────
// The MCP server module is used by the session provider to attach tools
// to sessions via --mcp-config, and can be imported directly for
// testing or custom integrations.

export { createMcpServer, startMcpHttpServer } from './mcp-server.ts';
export type { McpHttpHandle } from './mcp-server.ts';

// ── Spawn helpers ────────────────────────────────────────────────────

/** Parsed result from stream-json output. @internal */
export interface StreamJsonResult {
  exitCode: number;
  transcript: Record<string, unknown>[];
  costUsd?: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  providerSessionId?: string;
}

/**
 * Parse a single NDJSON message from stream-json output.
 *
 * Returns parsed chunks for streaming and accumulates data into the
 * provided accumulators (transcript, metrics).
 *
 * @internal Exported for testing only.
 */
export function parseStreamJsonMessage(
  msg: Record<string, unknown>,
  acc: {
    transcript: Record<string, unknown>[];
    costUsd?: number;
    tokenUsage?: StreamJsonResult['tokenUsage'];
    providerSessionId?: string;
  },
): SessionChunk[] {
  const chunks: SessionChunk[] = [];

  if (msg.type === 'assistant') {
    acc.transcript.push(msg);

    const message = msg.message as Record<string, unknown> | undefined;
    if (message) {
      const content = message.content as Array<Record<string, unknown>> | undefined;
      if (content) {
        for (const block of content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            process.stderr.write(block.text);
            chunks.push({ type: 'text', text: block.text });
          } else if (block.type === 'tool_use' && typeof block.name === 'string') {
            chunks.push({ type: 'tool_use', tool: block.name });
          }
        }
      }
    }
  } else if (msg.type === 'user') {
    acc.transcript.push(msg);

    const content = (msg as Record<string, unknown>).content as Array<Record<string, unknown>> | undefined;
    if (content) {
      for (const block of content) {
        if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
          chunks.push({ type: 'tool_result', tool: String(block.tool_use_id) });
        }
      }
    }
  } else if (msg.type === 'result') {
    acc.costUsd = typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd : undefined;
    acc.providerSessionId = typeof msg.session_id === 'string' ? msg.session_id : undefined;

    const usage = msg.usage as Record<string, unknown> | undefined;
    if (usage) {
      acc.tokenUsage = {
        inputTokens: (typeof usage.input_tokens === 'number' ? usage.input_tokens : 0),
        outputTokens: (typeof usage.output_tokens === 'number' ? usage.output_tokens : 0),
        cacheReadTokens: typeof usage.cache_read_input_tokens === 'number'
          ? usage.cache_read_input_tokens : undefined,
        cacheWriteTokens: typeof usage.cache_creation_input_tokens === 'number'
          ? usage.cache_creation_input_tokens : undefined,
      };
    }
  }

  return chunks;
}

/**
 * Process NDJSON buffer, calling handler for each complete line.
 * Returns the remaining incomplete buffer.
 *
 * @internal Exported for testing only.
 */
export function processNdjsonBuffer(
  buffer: string,
  handler: (msg: Record<string, unknown>) => void,
): string {
  let newlineIdx: number;
  while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIdx).trim();
    buffer = buffer.slice(newlineIdx + 1);

    if (!line) continue;

    try {
      const msg = JSON.parse(line) as Record<string, unknown>;
      handler(msg);
    } catch {
      // Non-JSON line — ignore
    }
  }
  return buffer;
}

/**
 * Spawn Claude in autonomous mode with --output-format stream-json.
 *
 * Captures stdout (NDJSON lines), parses each line to extract:
 * - assistant messages → transcript
 * - result message → cost, token usage, session ID
 *
 * Forwards assistant text content to stderr so it's visible during execution.
 */
function spawnClaudeStreamJson(args: string[], cwd: string, env?: Record<string, string>, stdinData?: string): Promise<StreamJsonResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, ...env },
    });

    // Pipe prompt via stdin (--print - reads from stdin)
    if (stdinData !== undefined) {
      proc.stdin!.write(stdinData);
      proc.stdin!.end();
    }

    const acc: {
      transcript: Record<string, unknown>[];
      costUsd?: number;
      tokenUsage?: StreamJsonResult['tokenUsage'];
      providerSessionId?: string;
    } = { transcript: [] };

    let buffer = '';

    proc.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      buffer = processNdjsonBuffer(buffer, (msg) => {
        parseStreamJsonMessage(msg, acc);
      });
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (acc.transcript.length > 0) {
        process.stderr.write('\n');
      }

      resolve({
        exitCode: code ?? 1,
        transcript: acc.transcript,
        costUsd: acc.costUsd,
        tokenUsage: acc.tokenUsage,
        providerSessionId: acc.providerSessionId,
      });
    });
  });
}

/**
 * Spawn Claude with streaming — yields SessionChunks as they arrive
 * while also accumulating the full result.
 *
 * Returns an async iterable of chunks for real-time consumption and
 * a promise for the final StreamJsonResult.
 */
function spawnClaudeStreamingJson(args: string[], cwd: string, env?: Record<string, string>, stdinData?: string): {
  chunks: AsyncIterable<SessionChunk>;
  result: Promise<StreamJsonResult>;
} {
  const chunkQueue: SessionChunk[] = [];
  let chunkResolve: (() => void) | null = null;
  let done = false;

  const acc: {
    transcript: Record<string, unknown>[];
    costUsd?: number;
    tokenUsage?: StreamJsonResult['tokenUsage'];
    providerSessionId?: string;
  } = { transcript: [] };

  const proc = spawn('claude', args, {
    cwd,
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, ...env },
  });

  // Pipe prompt via stdin (--print - reads from stdin)
  if (stdinData !== undefined) {
    proc.stdin!.write(stdinData);
    proc.stdin!.end();
  }

  let buffer = '';

  proc.stdout!.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    buffer = processNdjsonBuffer(buffer, (msg) => {
      const newChunks = parseStreamJsonMessage(msg, acc);
      if (newChunks.length > 0) {
        chunkQueue.push(...newChunks);
        if (chunkResolve) {
          chunkResolve();
          chunkResolve = null;
        }
      }
    });
  });

  const result = new Promise<StreamJsonResult>((resolve, reject) => {
    proc.on('error', (err) => {
      done = true;
      if (chunkResolve) { chunkResolve(); chunkResolve = null; }
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (acc.transcript.length > 0) {
        process.stderr.write('\n');
      }
      done = true;
      if (chunkResolve) { chunkResolve(); chunkResolve = null; }
      resolve({
        exitCode: code ?? 1,
        transcript: acc.transcript,
        costUsd: acc.costUsd,
        tokenUsage: acc.tokenUsage,
        providerSessionId: acc.providerSessionId,
      });
    });
  });

  const chunks: AsyncIterable<SessionChunk> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<SessionChunk>> {
          while (true) {
            if (chunkQueue.length > 0) {
              return { value: chunkQueue.shift()!, done: false };
            }
            if (done) {
              return { value: undefined as unknown as SessionChunk, done: true };
            }
            await new Promise<void>((resolve) => { chunkResolve = resolve; });
          }
        },
      };
    },
  };

  return { chunks, result };
}

=== CONTEXT FILE: packages/plugins/claude-code/src/stream-parser.test.ts ===
/**
 * Tests for the NDJSON stream parsing logic in the Claude Code session provider.
 *
 * Exercises parseStreamJsonMessage() and processNdjsonBuffer() — the pure
 * functions that parse Claude's --output-format stream-json output into
 * SessionChunks and accumulated metrics.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseStreamJsonMessage,
  processNdjsonBuffer,
  extractFinalAssistantText,
  type StreamJsonResult,
} from './index.ts';

// ── Helper ──────────────────────────────────────────────────────────

function freshAcc(): {
  transcript: Record<string, unknown>[];
  costUsd?: number;
  tokenUsage?: StreamJsonResult['tokenUsage'];
  providerSessionId?: string;
} {
  return { transcript: [] };
}

// ── parseStreamJsonMessage ──────────────────────────────────────────

describe('parseStreamJsonMessage()', () => {
  it('parses assistant text content into text chunks', () => {
    const acc = freshAcc();
    const chunks = parseStreamJsonMessage({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Hello world' },
        ],
      },
    }, acc);

    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0], { type: 'text', text: 'Hello world' });
    assert.equal(acc.transcript.length, 1);
  });

  it('parses assistant tool_use into tool_use chunks', () => {
    const acc = freshAcc();
    const chunks = parseStreamJsonMessage({
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', name: 'bash' },
        ],
      },
    }, acc);

    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0], { type: 'tool_use', tool: 'bash' });
  });

  it('parses multiple content blocks in one message', () => {
    const acc = freshAcc();
    const chunks = parseStreamJsonMessage({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Let me run that.' },
          { type: 'tool_use', name: 'bash' },
        ],
      },
    }, acc);

    assert.equal(chunks.length, 2);
    assert.equal(chunks[0]!.type, 'text');
    assert.equal(chunks[1]!.type, 'tool_use');
  });

  it('parses user tool_result into tool_result chunks', () => {
    const acc = freshAcc();
    const chunks = parseStreamJsonMessage({
      type: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tu_abc123' },
      ],
    }, acc);

    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0], { type: 'tool_result', tool: 'tu_abc123' });
  });

  it('extracts cost and token usage from result message', () => {
    const acc = freshAcc();
    const chunks = parseStreamJsonMessage({
      type: 'result',
      total_cost_usd: 0.42,
      session_id: 'sess-xyz',
      usage: {
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_input_tokens: 200,
        cache_creation_input_tokens: 100,
      },
    }, acc);

    assert.equal(chunks.length, 0);
    assert.equal(acc.costUsd, 0.42);
    assert.equal(acc.providerSessionId, 'sess-xyz');
    assert.deepEqual(acc.tokenUsage, {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 200,
      cacheWriteTokens: 100,
    });
  });

  it('handles result message without optional usage fields', () => {
    const acc = freshAcc();
    parseStreamJsonMessage({
      type: 'result',
      total_cost_usd: 0.10,
      usage: {
        input_tokens: 500,
        output_tokens: 100,
      },
    }, acc);

    assert.equal(acc.costUsd, 0.10);
    assert.equal(acc.tokenUsage!.cacheReadTokens, undefined);
    assert.equal(acc.tokenUsage!.cacheWriteTokens, undefined);
  });

  it('handles assistant message with no content blocks', () => {
    const acc = freshAcc();
    const chunks = parseStreamJsonMessage({
      type: 'assistant',
      message: {},
    }, acc);

    assert.equal(chunks.length, 0);
    assert.equal(acc.transcript.length, 1);
  });

  it('handles assistant message with no message field', () => {
    const acc = freshAcc();
    const chunks = parseStreamJsonMessage({
      type: 'assistant',
    }, acc);

    assert.equal(chunks.length, 0);
    assert.equal(acc.transcript.length, 1);
  });

  it('ignores unknown message types', () => {
    const acc = freshAcc();
    const chunks = parseStreamJsonMessage({
      type: 'system',
      data: 'something',
    }, acc);

    assert.equal(chunks.length, 0);
    assert.equal(acc.transcript.length, 0);
  });

  it('accumulates across multiple calls', () => {
    const acc = freshAcc();

    parseStreamJsonMessage({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Part 1' }] },
    }, acc);

    parseStreamJsonMessage({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Part 2' }] },
    }, acc);

    parseStreamJsonMessage({
      type: 'result',
      total_cost_usd: 0.50,
      session_id: 'sess-123',
      usage: { input_tokens: 2000, output_tokens: 800 },
    }, acc);

    assert.equal(acc.transcript.length, 2);
    assert.equal(acc.costUsd, 0.50);
    assert.equal(acc.providerSessionId, 'sess-123');
  });
});

// ── extractFinalAssistantText ───────────────────────────────────────

describe('extractFinalAssistantText()', () => {
  it('returns undefined for empty transcript', () => {
    assert.equal(extractFinalAssistantText([]), undefined);
  });

  it('returns undefined when no assistant messages', () => {
    const transcript = [
      { type: 'result', total_cost_usd: 0.01 },
    ];
    assert.equal(extractFinalAssistantText(transcript), undefined);
  });

  it('extracts text from the last assistant message', () => {
    const transcript = [
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'First response' }] },
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Final response' }] },
      },
    ];
    assert.equal(extractFinalAssistantText(transcript), 'Final response');
  });

  it('concatenates multiple text blocks from the last assistant message', () => {
    const transcript = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Part one. ' },
            { type: 'tool_use', name: 'bash' },
            { type: 'text', text: 'Part two.' },
          ],
        },
      },
    ];
    assert.equal(extractFinalAssistantText(transcript), 'Part one. Part two.');
  });

  it('skips non-text content blocks', () => {
    const transcript = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'bash' },
          ],
        },
      },
    ];
    assert.equal(extractFinalAssistantText(transcript), undefined);
  });

  it('skips earlier assistant messages and uses the last', () => {
    const transcript = [
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Earlier' }] },
      },
      { type: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1' }] },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Later' }] },
      },
      { type: 'result', total_cost_usd: 0.05 },
    ];
    assert.equal(extractFinalAssistantText(transcript), 'Later');
  });

  it('returns undefined for assistant message with no content', () => {
    const transcript = [
      { type: 'assistant', message: {} },
    ];
    assert.equal(extractFinalAssistantText(transcript), undefined);
  });

  it('returns undefined for assistant message with no message field', () => {
    const transcript = [
      { type: 'assistant' },
    ];
    assert.equal(extractFinalAssistantText(transcript), undefined);
  });
});

// ── processNdjsonBuffer ─────────────────────────────────────────────

describe('processNdjsonBuffer()', () => {
  it('processes complete lines and returns empty remainder', () => {
    const messages: Record<string, unknown>[] = [];
    const remainder = processNdjsonBuffer(
      '{"type":"assistant"}\n{"type":"result"}\n',
      (msg) => messages.push(msg),
    );

    assert.equal(messages.length, 2);
    assert.equal(messages[0]!.type, 'assistant');
    assert.equal(messages[1]!.type, 'result');
    assert.equal(remainder, '');
  });

  it('returns incomplete trailing data as remainder', () => {
    const messages: Record<string, unknown>[] = [];
    const remainder = processNdjsonBuffer(
      '{"type":"assistant"}\n{"type":"res',
      (msg) => messages.push(msg),
    );

    assert.equal(messages.length, 1);
    assert.equal(remainder, '{"type":"res');
  });

  it('handles empty buffer', () => {
    const messages: Record<string, unknown>[] = [];
    const remainder = processNdjsonBuffer('', (msg) => messages.push(msg));

    assert.equal(messages.length, 0);
    assert.equal(remainder, '');
  });

  it('skips blank lines', () => {
    const messages: Record<string, unknown>[] = [];
    const remainder = processNdjsonBuffer(
      '{"type":"a"}\n\n\n{"type":"b"}\n',
      (msg) => messages.push(msg),
    );

    assert.equal(messages.length, 2);
    assert.equal(remainder, '');
  });

  it('skips non-JSON lines without throwing', () => {
    const messages: Record<string, unknown>[] = [];
    const remainder = processNdjsonBuffer(
      'not-json-at-all\n{"type":"ok"}\n',
      (msg) => messages.push(msg),
    );

    assert.equal(messages.length, 1);
    assert.equal(messages[0]!.type, 'ok');
    assert.equal(remainder, '');
  });

  it('handles multiple chunks arriving incrementally', () => {
    const messages: Record<string, unknown>[] = [];
    const handler = (msg: Record<string, unknown>) => messages.push(msg);

    let buf = processNdjsonBuffer('{"type":', handler);
    assert.equal(messages.length, 0);

    buf = processNdjsonBuffer(buf + '"assistant"}\n', handler);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]!.type, 'assistant');
    assert.equal(buf, '');
  });
});

=== CONTEXT FILE: packages/plugins/claude-code/src/mcp-server.ts ===
/**
 * MCP Tool Server — serves guild tools as typed MCP tools during anima sessions.
 *
 * Two entry points:
 *
 * 1. **`createMcpServer(tools)`** — library function. Takes an array of
 *    ToolDefinitions (already resolved by the Instrumentarium) and returns
 *    a configured McpServer.
 *
 * 2. **`startMcpHttpServer(tools)`** — starts an in-process HTTP server
 *    serving the MCP tool set via Streamable HTTP on an ephemeral localhost
 *    port. Returns a handle with the URL (for --mcp-config) and a close()
 *    function for cleanup.
 *
 * The MCP server is one-per-session. The claude-code provider owns the
 * lifecycle — starts before the Claude process, stops after it exits.
 *
 * See: docs/architecture/apparatus/claude-code.md
 */

import http from 'node:http';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { VERSION } from '@shardworks/nexus-core';
import type { ToolDefinition } from '@shardworks/tools-apparatus';

// ── Public types ────────────────────────────────────────────────────────

/**
 * Handle returned by startMcpHttpServer().
 *
 * Provides the URL for --mcp-config and a close() function for cleanup.
 */
export interface McpHttpHandle {
  /** URL for --mcp-config (e.g. "http://127.0.0.1:PORT/mcp"). */
  url: string;
  /** Shut down the HTTP server and MCP transport. */
  close(): Promise<void>;
}

// ── Library API ─────────────────────────────────────────────────────────

/**
 * Create and configure an MCP server with the given tools.
 *
 * Each tool's Zod param schema is registered directly with the MCP SDK
 * (which handles JSON Schema conversion). The handler is wrapped to
 * validate params via Zod and format the result as MCP tool output.
 *
 * Tools with `callableBy` set that does not include `'anima'` are
 * filtered out. Tools without `callableBy` are included (available
 * to all callers by default).
 */
export async function createMcpServer(tools: ToolDefinition[]): Promise<McpServer> {
  const server = new McpServer({
    name: 'nexus-guild',
    version: VERSION,
  });

  for (const def of tools) {
    // Filter by callableBy — only serve tools callable by animas.
    // Tools with no callableBy default to all callers (available everywhere).
    if (def.callableBy && !def.callableBy.includes('anima')) {
      continue;
    }

    server.tool(
      def.name,
      def.description,
      def.params.shape,
      async (params) => {
        try {
          const validated = def.params.parse(params);
          const result = await def.handler(validated);

          return {
            content: [{
              type: 'text' as const,
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            }],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: 'text' as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}

// ── HTTP Server ─────────────────────────────────────────────────────────

/**
 * Start an in-process HTTP server serving the MCP tool set via SSE.
 *
 * Uses the MCP SDK's SSE transport: the client GETs /sse to establish
 * the event stream, then POSTs messages to /message. Claude Code's
 * --mcp-config expects `type: "sse"` for HTTP-based MCP servers.
 *
 * The server binds to 127.0.0.1 only — not network-accessible.
 *
 * Returns a handle with the URL (for --mcp-config) and a close() function.
 * The caller is responsible for calling close() after the session exits.
 *
 * Each session gets its own server instance. Concurrent sessions get
 * independent servers on different ports.
 */
export async function startMcpHttpServer(tools: ToolDefinition[]): Promise<McpHttpHandle> {
  const mcpServer = await createMcpServer(tools);

  // SSE transport: the client GETs /sse, the transport tells it to POST
  // messages to /message. One transport per connection (single-session).
  let transport: SSEServerTransport | null = null;

  const httpServer = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/sse') {
        // New SSE connection — create transport bound to this response.
        transport = new SSEServerTransport('/message', res);
        await mcpServer.connect(transport);
      } else if (req.method === 'POST' && req.url?.startsWith('/message')) {
        if (!transport) {
          res.writeHead(400).end('No active SSE connection');
          return;
        }
        await transport.handlePostMessage(req, res);
      } else {
        res.writeHead(404).end('Not found');
      }
    } catch {
      if (!res.headersSent) {
        res.writeHead(500).end('Internal Server Error');
      }
    }
  });

  // Listen on ephemeral port, localhost only.
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });

  const addr = httpServer.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to get server address');
  }

  const url = `http://127.0.0.1:${addr.port}/sse`;

  return {
    url,
    async close() {
      if (transport) {
        await transport.close();
      }
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

=== CONTEXT FILE: packages/plugins/oculus/src ===
tree dfac453:packages/plugins/oculus/src

index.ts
oculus.test.ts
oculus.ts
static/
types.ts

=== CONTEXT FILE: packages/plugins/oculus/src/static ===
tree dfac453:packages/plugins/oculus/src/static

style.css

=== CONTEXT FILE: packages/plugins/tools/src/instrumentarium.ts ===
/**
 * The Instrumentarium — guild tool registry apparatus.
 *
 * Scans installed tools from kit contributions and apparatus supportKits,
 * resolves permission-gated tool sets on demand, and serves as the single
 * source of truth for "what tools exist and who can use them."
 *
 * The Instrumentarium is role-agnostic — it receives an already-resolved
 * permissions array from the Loom and returns the matching tool set.
 * Role definitions and permission grants are owned by the Loom.
 */

import fs from 'node:fs';
import path from 'node:path';

import type {
  StartupContext,
  LoadedPlugin,
  LoadedKit,
  LoadedApparatus,
  Plugin,
} from '@shardworks/nexus-core';
import {
  guild,
  isLoadedKit,
  isLoadedApparatus,
} from '@shardworks/nexus-core';

import type { ToolDefinition, ToolCaller } from './tool.ts';
import { isToolDefinition } from './tool.ts';
import { createToolsList } from './tools/tools-list.ts';
import { createToolsShow } from './tools/tools-show.ts';

// ── Public types ──────────────────────────────────────────────────────

/** A resolved tool with provenance metadata. */
export interface ResolvedTool {
  /** The tool definition (name, description, params schema, handler). */
  definition: ToolDefinition;
  /** Plugin id of the kit or apparatus that contributed this tool. */
  pluginId: string;
}

/** Options for resolving a permission-gated tool set. */
export interface ResolveOptions {
  /**
   * Permission grants in `plugin:level` format.
   * Supports wildcards: `plugin:*`, `*:level`, `*:*`.
   */
  permissions: string[];
  /**
   * When true, permissionless tools are excluded unless the role grants
   * `plugin:*` or `*:*` for the tool's plugin. When false (default),
   * permissionless tools are included unconditionally.
   */
  strict?: boolean;
  /** Filter by invocation caller. Tools with no callableBy pass all callers. */
  caller?: ToolCaller;
}

/** The Instrumentarium's public API, exposed via `provides`. */
export interface InstrumentariumApi {
  /**
   * Resolve the tool set for a given set of permissions.
   *
   * Evaluates each registered tool against the permission grants:
   * - Tools with a `permission` field: included if any grant matches
   * - Permissionless tools: always included (default) or gated by `strict`
   * - Caller filtering applied last
   */
  resolve(options: ResolveOptions): ResolvedTool[];

  /**
   * Find a single tool by name. Returns null if not installed.
   */
  find(name: string): ResolvedTool | null;

  /**
   * List all installed tools, regardless of permissions.
   */
  list(): ResolvedTool[];
}

// ── Permission matching ──────────────────────────────────────────────

/** A parsed permission grant. */
interface ParsedGrant {
  plugin: string;
  level: string;
}

/** Parse a grant string like "plugin:level" into its components. */
function parseGrant(grant: string): ParsedGrant | null {
  const colonIdx = grant.indexOf(':');
  if (colonIdx === -1) return null;
  return {
    plugin: grant.slice(0, colonIdx),
    level: grant.slice(colonIdx + 1),
  };
}

/**
 * Check if a tool with the given permission level from the given plugin
 * is matched by any of the parsed grants.
 */
function matchesPermission(
  pluginId: string,
  permission: string,
  grants: ParsedGrant[],
): boolean {
  for (const grant of grants) {
    // Exact match: plugin:level
    if (grant.plugin === pluginId && grant.level === permission) return true;
    // Plugin wildcard: plugin:*
    if (grant.plugin === pluginId && grant.level === '*') return true;
    // Level wildcard: *:level
    if (grant.plugin === '*' && grant.level === permission) return true;
    // Superuser: *:*
    if (grant.plugin === '*' && grant.level === '*') return true;
  }
  return false;
}

/**
 * Check if a permissionless tool from the given plugin should be included
 * in strict mode. Only `plugin:*` or `*:*` opts in permissionless tools.
 */
function strictAllowsPermissionless(
  pluginId: string,
  grants: ParsedGrant[],
): boolean {
  for (const grant of grants) {
    if (grant.plugin === pluginId && grant.level === '*') return true;
    if (grant.plugin === '*' && grant.level === '*') return true;
  }
  return false;
}

// ── Implementation ────────────────────────────────────────────────────

/**
 * The tool registry — accumulates tools from plugin contributions
 * and resolves permission-gated tool sets.
 */
class ToolRegistry {
  /** Map from tool name → ResolvedTool. Last-write-wins for duplicates. */
  private readonly tools = new Map<string, ResolvedTool>();
  /** Guild root path — set at startup, used for instructionsFile resolution. */
  private guildHome = '';

  /** Set the guild root path for instructionsFile resolution. */
  setHome(home: string): void {
    this.guildHome = home;
  }

  /** Register all tools from a loaded plugin. */
  register(plugin: LoadedPlugin): void {
    const pluginId = plugin.id;
    const packageName = plugin.packageName;

    if (isLoadedKit(plugin)) {
      this.registerToolsFromKit(pluginId, packageName, plugin.kit);
    } else if (isLoadedApparatus(plugin)) {
      if (plugin.apparatus.supportKit) {
        this.registerToolsFromKit(pluginId, packageName, plugin.apparatus.supportKit);
      }
    }
  }

  /** Extract and register tools from a kit (or supportKit) contribution. */
  private registerToolsFromKit(
    pluginId: string,
    packageName: string,
    kit: Record<string, unknown>,
  ): void {
    const rawTools = kit.tools;
    if (!Array.isArray(rawTools)) return;

    for (const t of rawTools) {
      if (isToolDefinition(t)) {
        const definition = this.preloadInstructions(t, packageName);
        this.tools.set(definition.name, { definition, pluginId });
      }
    }
  }

  /**
   * Pre-load instructionsFile into instructions text.
   *
   * If the tool has an `instructionsFile`, resolve it relative to the
   * package root in node_modules, read the file, and return a copy with
   * `instructions` set to the file content and `instructionsFile` cleared.
   *
   * Tools with inline `instructions` or neither field are returned as-is.
   */
  private preloadInstructions(
    tool: ToolDefinition,
    packageName: string,
  ): ToolDefinition {
    if (!tool.instructionsFile) return tool;

    const packageDir = path.join(this.guildHome, 'node_modules', packageName);
    const filePath = path.join(packageDir, tool.instructionsFile);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      // Return a mutated copy — instructionsFile consumed, instructions set
      const { instructionsFile: _, ...rest } = tool;
      return { ...rest, instructions: content } as ToolDefinition;
    } catch {
      console.warn(
        `[instrumentarium] Could not read instructions file for tool "${tool.name}": ${filePath}`,
      );
      // Return tool without instructions — don't block registration
      const { instructionsFile: _, ...rest } = tool;
      return rest as ToolDefinition;
    }
  }

  /** Register a single tool definition directly (for self-contributed tools). */
  registerTool(definition: ToolDefinition, pluginId: string): void {
    this.tools.set(definition.name, { definition, pluginId });
  }

  /** Find a tool by name. */
  find(name: string): ResolvedTool | null {
    return this.tools.get(name) ?? null;
  }

  /** List all installed tools. */
  list(): ResolvedTool[] {
    return [...this.tools.values()];
  }

  /**
   * Resolve a permission-gated tool set.
   *
   * 1. Parse each grant into (plugin, level) pairs
   * 2. For each registered tool:
   *    a. If tool has no permission:
   *       - If NOT strict → include
   *       - If strict → include only if grants contain <tool's plugin>:* or *:*
   *    b. If tool has a permission:
   *       - Match against grants: exact, plugin wildcard, level wildcard, or superuser
   *       - Include if any grant matches
   * 3. Filter by caller (callableBy)
   */
  resolve(options: ResolveOptions): ResolvedTool[] {
    const grants = options.permissions
      .map(parseGrant)
      .filter((g): g is ParsedGrant => g !== null);
    const strict = options.strict ?? false;

    const result: ResolvedTool[] = [];

    for (const resolved of this.tools.values()) {
      const { definition, pluginId } = resolved;
      const permission = definition.permission;

      // Permission check
      if (permission === undefined) {
        // Permissionless tool
        if (strict && !strictAllowsPermissionless(pluginId, grants)) {
          continue;
        }
        // In default mode, permissionless tools are always included
      } else {
        // Tool has a permission — must match against grants
        if (!matchesPermission(pluginId, permission, grants)) {
          continue;
        }
      }

      // Caller filter
      if (
        options.caller &&
        definition.callableBy &&
        !definition.callableBy.includes(options.caller)
      ) {
        continue;
      }

      result.push(resolved);
    }

    return result;
  }
}

// ── Apparatus factory ─────────────────────────────────────────────────

/**
 * Create the Instrumentarium apparatus plugin.
 *
 * Returns a Plugin with:
 * - `consumes: ['tools']` — scans kit/supportKit contributions
 * - `provides: InstrumentariumApi` — the tool registry API
 */
export function createInstrumentarium(): Plugin {
  const registry = new ToolRegistry();

  const api: InstrumentariumApi = {
    resolve(options: ResolveOptions): ResolvedTool[] {
      return registry.resolve(options);
    },

    find(name: string): ResolvedTool | null {
      return registry.find(name);
    },

    list(): ResolvedTool[] {
      return registry.list();
    },
  };

  // Introspection tools use a lazy getter so they can query the registry
  // after all plugins have registered their tools at startup.
  const getApi = () => api;
  const toolsList = createToolsList(getApi);
  const toolsShow = createToolsShow(getApi);

  return {
    apparatus: {
      requires: [],
      consumes: ['tools'],
      provides: api,

      supportKit: {
        tools: [toolsList, toolsShow],
      },

      start(ctx: StartupContext): void {
        const g = guild();
        registry.setHome(g.home);

        // Register our own supportKit tools (tools-list, tools-show).
        // These live on this apparatus and aren't discovered through the
        // normal kit scanning path.
        for (const t of [toolsList, toolsShow] as ToolDefinition[]) {
          registry.registerTool(t, 'tools');
        }

        // Scan all already-loaded kits. These fired plugin:initialized before
        // any apparatus started, so we can't catch them via events.
        for (const kit of g.kits()) {
          registry.register(kit);
        }

        // Subscribe to plugin:initialized for apparatus supportKits that
        // fire after us in the startup sequence.
        ctx.on('plugin:initialized', (plugin: unknown) => {
          const loaded = plugin as LoadedPlugin;
          // Skip kits — we already scanned them above.
          if (isLoadedApparatus(loaded)) {
            registry.register(loaded);
          }
        });
      },
    },
  };
}

=== CONTEXT FILE: packages/plugins/tools/src/index.ts ===
/**
 * @shardworks/tools-apparatus — The Instrumentarium.
 *
 * Guild tool registry: scans kit contributions, resolves permission-gated
 * tool sets, and provides the InstrumentariumApi for tool lookup and resolution.
 *
 * The tool() factory and ToolDefinition type live here canonically.
 *
 * See: docs/specification.md (instrumentarium)
 */

import { createInstrumentarium } from './instrumentarium.ts';

// ── Tool authoring API ───────────────────────────────────────────────

export {
  type ToolCaller,
  type ToolDefinition,
  tool,
  isToolDefinition,
} from './tool.ts';

// ── Instrumentarium API ───────────────────────────────────────────────

export {
  type InstrumentariumApi,
  type ResolvedTool,
  type ResolveOptions,
} from './instrumentarium.ts';

// ── Default export: the apparatus plugin ──────────────────────────────

export default createInstrumentarium();

=== CONTEXT FILE: packages/plugins/tools/src/tools ===
tree dfac453:packages/plugins/tools/src/tools

tools-list.test.ts
tools-list.ts
tools-show.test.ts
tools-show.ts

=== CONTEXT FILE: packages/plugins/tools/src/tools/tools-show.ts ===
/**
 * tools-show — show full details for a single tool.
 *
 * Returns name, description, plugin, permission, callableBy, parameter
 * schema, and instructions for the named tool. Returns null if not found.
 *
 * Requires `tools:read` permission.
 */

import { z } from 'zod';

import { tool } from '../tool.ts';
import type { InstrumentariumApi } from '../instrumentarium.ts';

/** Parameter info derived from the Zod schema. */
export interface ParamInfo {
  type: string;
  description: string | null;
  optional: boolean;
}

/** Full detail returned for a single tool. */
export interface ToolDetail {
  name: string;
  description: string;
  pluginId: string;
  permission: string | null;
  callableBy: string[] | null;
  params: Record<string, ParamInfo>;
  instructions: string | null;
}

/**
 * Extract parameter info from a Zod object schema.
 *
 * Walks the shape, unwraps ZodOptional/ZodDefault wrappers, and
 * derives the JSON Schema type name from the inner Zod type.
 */
function extractParams(schema: z.ZodObject<z.ZodRawShape>): Record<string, ParamInfo> {
  const shape = schema.shape;
  const result: Record<string, ParamInfo> = {};

  for (const [key, zodType] of Object.entries(shape)) {
    result[key] = extractSingleParam(zodType as z.ZodType);
  }

  return result;
}

/** Extract info for a single Zod parameter. */
function extractSingleParam(zodType: z.ZodType): ParamInfo {
  let isOptional = false;
  let inner: z.ZodType = zodType;

  // Unwrap ZodOptional
  if (inner instanceof z.ZodOptional) {
    isOptional = true;
    inner = inner.unwrap() as z.ZodType;
  }

  // Unwrap ZodDefault
  if (inner instanceof z.ZodDefault) {
    isOptional = true;
    inner = inner.unwrap() as z.ZodType;
  }

  return {
    type: zodTypeToJsonType(inner),
    description: inner.description ?? null,
    optional: isOptional,
  };
}

/** Map a Zod type to a JSON Schema type string. */
function zodTypeToJsonType(zodType: z.ZodType): string {
  if (zodType instanceof z.ZodString) return 'string';
  if (zodType instanceof z.ZodNumber) return 'number';
  if (zodType instanceof z.ZodBoolean) return 'boolean';
  if (zodType instanceof z.ZodArray) return 'array';
  if (zodType instanceof z.ZodObject) return 'object';
  if (zodType instanceof z.ZodEnum) return 'string';
  if (zodType instanceof z.ZodLiteral) return typeof zodType._def.values[0];
  if (zodType instanceof z.ZodUnion) return 'union';
  if (zodType instanceof z.ZodNullable) return zodTypeToJsonType(zodType.unwrap() as z.ZodType);
  return 'unknown';
}

export function createToolsShow(getApi: () => InstrumentariumApi) {
  return tool({
    name: 'tools-show',
    description:
      'Show details for a tool by name, including parameter schema and instructions.',
    permission: 'read',
    params: {
      name: z.string().describe('Tool name to look up.'),
    },
    handler: async ({ name }) => {
      const api = getApi();
      const resolved = api.find(name);

      if (!resolved) return null;

      const { definition, pluginId } = resolved;

      const detail: ToolDetail = {
        name: definition.name,
        description: definition.description,
        pluginId,
        permission: definition.permission ?? null,
        callableBy: definition.callableBy ?? null,
        params: extractParams(definition.params),
        instructions: definition.instructions ?? null,
      };

      return detail;
    },
  });
}



## Codebase Structure (surrounding directories)

```
=== TREE: ./ ===
.claude
.gitattributes
.github
.gitignore
.nvmrc
LICENSE
README.md
bin
docs
package.json
packages
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.json

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

=== TREE: packages/plugins/animator/src/tools/ ===
index.ts
session-list.ts
session-show.ts
session-tools.test.ts
summon.ts

=== TREE: packages/plugins/claude-code/src/ ===
index.ts
mcp-server.test.ts
mcp-server.ts
stream-parser.test.ts

=== TREE: packages/plugins/oculus/ ===
package.json
src
tsconfig.json

=== TREE: packages/plugins/oculus/src/ ===
index.ts
oculus.test.ts
oculus.ts
static
types.ts

=== TREE: packages/plugins/oculus/src/static/ ===
style.css

=== TREE: packages/plugins/tools/src/ ===
index.ts
instrumentarium.test.ts
instrumentarium.ts
tool.test.ts
tool.ts
tools

=== TREE: packages/plugins/tools/src/tools/ ===
tools-list.test.ts
tools-list.ts
tools-show.test.ts
tools-show.ts


```
