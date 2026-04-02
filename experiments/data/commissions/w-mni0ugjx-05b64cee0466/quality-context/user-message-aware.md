## Commission Spec

# Add Tests for Fabricator Apparatus

Add tests for the `@shardworks/fabricator-apparatus` package (`packages/plugins/fabricator/`).

## Scope

Test the public API: `EngineRegistry` registration and `FabricatorApi.getEngineDesign()` lookup. The package is a thin in-memory registry — tests should be straightforward.

## Guidelines

- Place tests at `packages/plugins/fabricator/src/fabricator.test.ts` — follow the sibling convention (e.g. `instrumentarium.test.ts`, `clerk.test.ts`).
- Use `node:test` and `node:assert` — same as the rest of the codebase.
- Test the factory and API surface, not internal class methods.
- Cover at minimum: registering engine designs from kits, looking up by ID, looking up a missing ID (returns undefined), handling of invalid/malformed contributions (should skip silently).
- All existing tests must continue to pass.

---

**Important:** When you are finished, commit all changes in a single commit with a clear, descriptive message. Do not leave uncommitted changes — they will be lost when the session closes.
## Referenced Files (from spec, pre-commission state)



## Commission Diff

```
```
 packages/plugins/fabricator/src/fabricator.test.ts | 297 +++++++++++++++++++++
 1 file changed, 297 insertions(+)

diff --git a/packages/plugins/fabricator/src/fabricator.test.ts b/packages/plugins/fabricator/src/fabricator.test.ts
new file mode 100644
index 0000000..8f59bcd
--- /dev/null
+++ b/packages/plugins/fabricator/src/fabricator.test.ts
@@ -0,0 +1,297 @@
+/**
+ * Fabricator — unit tests.
+ *
+ * Tests engine design registration from kits and apparatus supportKits,
+ * and FabricatorApi.getEngineDesign() lookup. Uses a mock guild() singleton
+ * to simulate the plugin environment.
+ */
+
+import { describe, it, afterEach } from 'node:test';
+import assert from 'node:assert/strict';
+
+import {
+  setGuild,
+  clearGuild,
+} from '@shardworks/nexus-core';
+import type {
+  Guild,
+  LoadedKit,
+  LoadedApparatus,
+  StartupContext,
+} from '@shardworks/nexus-core';
+
+import {
+  createFabricator,
+  type FabricatorApi,
+  type EngineDesign,
+} from './fabricator.ts';
+
+// ── Test helpers ──────────────────────────────────────────────────────
+
+/** Create a minimal valid engine design for testing. */
+function mockEngine(id: string): EngineDesign {
+  return {
+    id,
+    async run(_givens, _ctx) {
+      return { status: 'completed', yields: null };
+    },
+  };
+}
+
+/** Build a mock LoadedKit with engine contributions. */
+function mockKit(id: string, engines: Record<string, unknown>): LoadedKit {
+  return {
+    packageName: `@test/${id}`,
+    id,
+    version: '0.0.0',
+    kit: { engines },
+  };
+}
+
+/** Build a mock LoadedApparatus with optional supportKit engines. */
+function mockApparatus(
+  id: string,
+  supportKitEngines?: Record<string, unknown>,
+): LoadedApparatus {
+  return {
+    packageName: `@test/${id}`,
+    id,
+    version: '0.0.0',
+    apparatus: {
+      start() {},
+      ...(supportKitEngines ? { supportKit: { engines: supportKitEngines } } : {}),
+    },
+  };
+}
+
+/** Wire a mock Guild into the singleton. */
+function wireGuild(opts: {
+  kits?: LoadedKit[];
+  apparatuses?: LoadedApparatus[];
+}): void {
+  const kits = opts.kits ?? [];
+  const apparatuses = opts.apparatuses ?? [];
+
+  const mockGuild: Guild = {
+    home: '/tmp/test-guild',
+    apparatus<T>(_name: string): T {
+      throw new Error('Not implemented in test');
+    },
+    config<T>(_pluginId: string): T {
+      return {} as T;
+    },
+    writeConfig() {},
+    guildConfig() {
+      return { name: 'test', nexus: '0.0.0', workshops: {}, plugins: [] };
+    },
+    kits() { return [...kits]; },
+    apparatuses() { return [...apparatuses]; },
+  };
+
+  setGuild(mockGuild);
+}
+
+/**
+ * Build a StartupContext that captures event subscriptions.
+ * Returns both the context and a fire() function to trigger events.
+ */
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
+/** Start the Fabricator and return its API and event-firing capability. */
+function startFabricator(opts: {
+  kits?: LoadedKit[];
+  apparatuses?: LoadedApparatus[];
+}): { api: FabricatorApi; fire: (event: string, ...args: unknown[]) => Promise<void> } {
+  wireGuild(opts);
+
+  const plugin = createFabricator();
+  const api = ('apparatus' in plugin ? plugin.apparatus.provides : null) as FabricatorApi;
+  assert.ok(api, 'Fabricator must expose provides');
+
+  const { ctx, fire } = buildTestContext();
+  if ('apparatus' in plugin) {
+    plugin.apparatus.start(ctx);
+  }
+
+  return { api, fire };
+}
+
+// ── Tests ─────────────────────────────────────────────────────────────
+
+describe('Fabricator', () => {
+  afterEach(() => {
+    clearGuild();
+  });
+
+  describe('getEngineDesign()', () => {
+    it('returns undefined for an unknown engine ID', () => {
+      const { api } = startFabricator({});
+      assert.equal(api.getEngineDesign('nonexistent'), undefined);
+    });
+
+    it('finds an engine registered from a kit', () => {
+      const engine = mockEngine('draft');
+      const kit = mockKit('my-kit', { draft: engine });
+      const { api } = startFabricator({ kits: [kit] });
+
+      const found = api.getEngineDesign('draft');
+      assert.ok(found, 'engine should be found');
+      assert.equal(found.id, 'draft');
+      assert.equal(found, engine);
+    });
+
+    it('registers engines from multiple kits', () => {
+      const alpha = mockEngine('alpha');
+      const beta = mockEngine('beta');
+      const { api } = startFabricator({
+        kits: [
+          mockKit('kit-a', { alpha }),
+          mockKit('kit-b', { beta }),
+        ],
+      });
+
+      assert.equal(api.getEngineDesign('alpha'), alpha);
+      assert.equal(api.getEngineDesign('beta'), beta);
+    });
+
+    it('last-write-wins for duplicate engine IDs across kits', () => {
+      const engine1 = mockEngine('draft');
+      const engine2 = mockEngine('draft');
+      const { api } = startFabricator({
+        kits: [
+          mockKit('kit-1', { draft: engine1 }),
+          mockKit('kit-2', { draft: engine2 }),
+        ],
+      });
+
+      assert.equal(api.getEngineDesign('draft'), engine2);
+    });
+
+    it('registers engines from apparatus supportKit via plugin:initialized', async () => {
+      const engine = mockEngine('implement');
+      const app = mockApparatus('my-apparatus', { implement: engine });
+
+      const { api, fire } = startFabricator({});
+      assert.equal(api.getEngineDesign('implement'), undefined);
+
+      await fire('plugin:initialized', app);
+
+      const found = api.getEngineDesign('implement');
+      assert.ok(found, 'engine should be found after apparatus initialized');
+      assert.equal(found.id, 'implement');
+      assert.equal(found, engine);
+    });
+
+    it('ignores kits fired via plugin:initialized (kits are scanned at startup only)', async () => {
+      const engine = mockEngine('late');
+      const kit = mockKit('late-kit', { late: engine });
+
+      const { api, fire } = startFabricator({});
+      await fire('plugin:initialized', kit);
+
+      // Kits fired after startup are intentionally skipped
+      assert.equal(api.getEngineDesign('late'), undefined);
+    });
+
+    it('skips entries missing the id field silently', () => {
+      const kit = mockKit('messy-kit', {
+        noId: { run: async () => ({ status: 'completed', yields: null }) },
+      });
+      // Should not throw
+      const { api } = startFabricator({ kits: [kit] });
+      assert.equal(api.getEngineDesign('noId'), undefined);
+    });
+
+    it('skips entries missing the run field silently', () => {
+      const kit = mockKit('messy-kit', {
+        noRun: { id: 'draft' },
+      });
+      const { api } = startFabricator({ kits: [kit] });
+      assert.equal(api.getEngineDesign('draft'), undefined);
+    });
+
+    it('skips null and primitive entries silently, keeps valid ones', () => {
+      const valid = mockEngine('valid');
+      const kit = mockKit('messy-kit', {
+        a: null,
+        b: 'not-an-engine',
+        c: 42,
+        d: valid,
+      });
+      const { api } = startFabricator({ kits: [kit] });
+
+      assert.equal(api.getEngineDesign('valid'), valid);
+      assert.equal(api.getEngineDesign('a'), undefined);
+    });
+
+    it('ignores a kit with no engines field', () => {
+      const kit: LoadedKit = {
+        packageName: '@test/no-engines',
+        id: 'no-engines',
+        version: '0.0.0',
+        kit: {},
+      };
+      // Should not throw
+      const { api } = startFabricator({ kits: [kit] });
+      assert.equal(api.getEngineDesign('anything'), undefined);
+    });
+
+    it('ignores an apparatus with no supportKit', async () => {
+      const app = mockApparatus('bare-apparatus');
+      const { api, fire } = startFabricator({});
+      // Should not throw
+      await fire('plugin:initialized', app);
+      assert.equal(api.getEngineDesign('anything'), undefined);
+    });
+
+    it('ignores an apparatus supportKit with no engines field', async () => {
+      const app: LoadedApparatus = {
+        packageName: '@test/bare',
+        id: 'bare',
+        version: '0.0.0',
+        apparatus: {
+          start() {},
+          supportKit: {},
+        },
+      };
+      const { api, fire } = startFabricator({});
+      // Should not throw
+      await fire('plugin:initialized', app);
+      assert.equal(api.getEngineDesign('anything'), undefined);
+    });
+
+    it('handles engines from both kits and apparatus supportKits together', async () => {
+      const kitEngine = mockEngine('kit-engine');
+      const apparatusEngine = mockEngine('apparatus-engine');
+
+      const { api, fire } = startFabricator({
+        kits: [mockKit('my-kit', { kitEngine })],
+      });
+      await fire('plugin:initialized', mockApparatus('my-apparatus', { apparatusEngine }));
+
+      assert.equal(api.getEngineDesign('kit-engine'), kitEngine);
+      assert.equal(api.getEngineDesign('apparatus-engine'), apparatusEngine);
+    });
+  });
+});
```
```

## Full File Contents (for context)


=== FILE: packages/plugins/fabricator/src/fabricator.test.ts ===
/**
 * Fabricator — unit tests.
 *
 * Tests engine design registration from kits and apparatus supportKits,
 * and FabricatorApi.getEngineDesign() lookup. Uses a mock guild() singleton
 * to simulate the plugin environment.
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
  LoadedApparatus,
  StartupContext,
} from '@shardworks/nexus-core';

import {
  createFabricator,
  type FabricatorApi,
  type EngineDesign,
} from './fabricator.ts';

// ── Test helpers ──────────────────────────────────────────────────────

/** Create a minimal valid engine design for testing. */
function mockEngine(id: string): EngineDesign {
  return {
    id,
    async run(_givens, _ctx) {
      return { status: 'completed', yields: null };
    },
  };
}

/** Build a mock LoadedKit with engine contributions. */
function mockKit(id: string, engines: Record<string, unknown>): LoadedKit {
  return {
    packageName: `@test/${id}`,
    id,
    version: '0.0.0',
    kit: { engines },
  };
}

/** Build a mock LoadedApparatus with optional supportKit engines. */
function mockApparatus(
  id: string,
  supportKitEngines?: Record<string, unknown>,
): LoadedApparatus {
  return {
    packageName: `@test/${id}`,
    id,
    version: '0.0.0',
    apparatus: {
      start() {},
      ...(supportKitEngines ? { supportKit: { engines: supportKitEngines } } : {}),
    },
  };
}

/** Wire a mock Guild into the singleton. */
function wireGuild(opts: {
  kits?: LoadedKit[];
  apparatuses?: LoadedApparatus[];
}): void {
  const kits = opts.kits ?? [];
  const apparatuses = opts.apparatuses ?? [];

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

/** Start the Fabricator and return its API and event-firing capability. */
function startFabricator(opts: {
  kits?: LoadedKit[];
  apparatuses?: LoadedApparatus[];
}): { api: FabricatorApi; fire: (event: string, ...args: unknown[]) => Promise<void> } {
  wireGuild(opts);

  const plugin = createFabricator();
  const api = ('apparatus' in plugin ? plugin.apparatus.provides : null) as FabricatorApi;
  assert.ok(api, 'Fabricator must expose provides');

  const { ctx, fire } = buildTestContext();
  if ('apparatus' in plugin) {
    plugin.apparatus.start(ctx);
  }

  return { api, fire };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Fabricator', () => {
  afterEach(() => {
    clearGuild();
  });

  describe('getEngineDesign()', () => {
    it('returns undefined for an unknown engine ID', () => {
      const { api } = startFabricator({});
      assert.equal(api.getEngineDesign('nonexistent'), undefined);
    });

    it('finds an engine registered from a kit', () => {
      const engine = mockEngine('draft');
      const kit = mockKit('my-kit', { draft: engine });
      const { api } = startFabricator({ kits: [kit] });

      const found = api.getEngineDesign('draft');
      assert.ok(found, 'engine should be found');
      assert.equal(found.id, 'draft');
      assert.equal(found, engine);
    });

    it('registers engines from multiple kits', () => {
      const alpha = mockEngine('alpha');
      const beta = mockEngine('beta');
      const { api } = startFabricator({
        kits: [
          mockKit('kit-a', { alpha }),
          mockKit('kit-b', { beta }),
        ],
      });

      assert.equal(api.getEngineDesign('alpha'), alpha);
      assert.equal(api.getEngineDesign('beta'), beta);
    });

    it('last-write-wins for duplicate engine IDs across kits', () => {
      const engine1 = mockEngine('draft');
      const engine2 = mockEngine('draft');
      const { api } = startFabricator({
        kits: [
          mockKit('kit-1', { draft: engine1 }),
          mockKit('kit-2', { draft: engine2 }),
        ],
      });

      assert.equal(api.getEngineDesign('draft'), engine2);
    });

    it('registers engines from apparatus supportKit via plugin:initialized', async () => {
      const engine = mockEngine('implement');
      const app = mockApparatus('my-apparatus', { implement: engine });

      const { api, fire } = startFabricator({});
      assert.equal(api.getEngineDesign('implement'), undefined);

      await fire('plugin:initialized', app);

      const found = api.getEngineDesign('implement');
      assert.ok(found, 'engine should be found after apparatus initialized');
      assert.equal(found.id, 'implement');
      assert.equal(found, engine);
    });

    it('ignores kits fired via plugin:initialized (kits are scanned at startup only)', async () => {
      const engine = mockEngine('late');
      const kit = mockKit('late-kit', { late: engine });

      const { api, fire } = startFabricator({});
      await fire('plugin:initialized', kit);

      // Kits fired after startup are intentionally skipped
      assert.equal(api.getEngineDesign('late'), undefined);
    });

    it('skips entries missing the id field silently', () => {
      const kit = mockKit('messy-kit', {
        noId: { run: async () => ({ status: 'completed', yields: null }) },
      });
      // Should not throw
      const { api } = startFabricator({ kits: [kit] });
      assert.equal(api.getEngineDesign('noId'), undefined);
    });

    it('skips entries missing the run field silently', () => {
      const kit = mockKit('messy-kit', {
        noRun: { id: 'draft' },
      });
      const { api } = startFabricator({ kits: [kit] });
      assert.equal(api.getEngineDesign('draft'), undefined);
    });

    it('skips null and primitive entries silently, keeps valid ones', () => {
      const valid = mockEngine('valid');
      const kit = mockKit('messy-kit', {
        a: null,
        b: 'not-an-engine',
        c: 42,
        d: valid,
      });
      const { api } = startFabricator({ kits: [kit] });

      assert.equal(api.getEngineDesign('valid'), valid);
      assert.equal(api.getEngineDesign('a'), undefined);
    });

    it('ignores a kit with no engines field', () => {
      const kit: LoadedKit = {
        packageName: '@test/no-engines',
        id: 'no-engines',
        version: '0.0.0',
        kit: {},
      };
      // Should not throw
      const { api } = startFabricator({ kits: [kit] });
      assert.equal(api.getEngineDesign('anything'), undefined);
    });

    it('ignores an apparatus with no supportKit', async () => {
      const app = mockApparatus('bare-apparatus');
      const { api, fire } = startFabricator({});
      // Should not throw
      await fire('plugin:initialized', app);
      assert.equal(api.getEngineDesign('anything'), undefined);
    });

    it('ignores an apparatus supportKit with no engines field', async () => {
      const app: LoadedApparatus = {
        packageName: '@test/bare',
        id: 'bare',
        version: '0.0.0',
        apparatus: {
          start() {},
          supportKit: {},
        },
      };
      const { api, fire } = startFabricator({});
      // Should not throw
      await fire('plugin:initialized', app);
      assert.equal(api.getEngineDesign('anything'), undefined);
    });

    it('handles engines from both kits and apparatus supportKits together', async () => {
      const kitEngine = mockEngine('kit-engine');
      const apparatusEngine = mockEngine('apparatus-engine');

      const { api, fire } = startFabricator({
        kits: [mockKit('my-kit', { kitEngine })],
      });
      await fire('plugin:initialized', mockApparatus('my-apparatus', { apparatusEngine }));

      assert.equal(api.getEngineDesign('kit-engine'), kitEngine);
      assert.equal(api.getEngineDesign('apparatus-engine'), apparatusEngine);
    });
  });
});


## Convention Reference (sibling files not modified by this commission)


=== CONTEXT FILE: packages/plugins/fabricator/src/fabricator.ts ===
/**
 * The Fabricator — guild engine design registry apparatus.
 *
 * Scans installed engine designs from kit contributions and apparatus supportKits,
 * and serves them to the Walker on demand.
 *
 * The Fabricator does not execute engines. It is a pure query service:
 * designs in, designs out.
 */

import type {
  StartupContext,
  LoadedPlugin,
  LoadedApparatus,
  Plugin,
} from '@shardworks/nexus-core';
import {
  guild,
  isLoadedKit,
  isLoadedApparatus,
} from '@shardworks/nexus-core';

// ── Public types ──────────────────────────────────────────────────────

/** Minimal execution context passed to an engine's run() method. */
export interface EngineRunContext {
  /** Simple string identity for this engine instance (e.g. 'draft', 'implement'). */
  engineId: string;
  /** All upstream yields, keyed by engine id. Escape hatch for engines that need to inspect the full upstream chain. */
  upstream: Record<string, unknown>;
}

/**
 * The result of an engine run.
 *
 * 'completed' — synchronous work done inline, yields are available immediately.
 * 'launched'  — async work launched in a session; the Walker polls for completion.
 */
export type EngineRunResult =
  | { status: 'completed'; yields: unknown }
  | { status: 'launched'; sessionId: string };

/**
 * An engine design — the unit of work the Fabricator catalogues and the
 * Walker executes. Kit authors import this type from @shardworks/fabricator-apparatus.
 */
export interface EngineDesign {
  /** Unique identifier for this engine design (e.g. 'draft', 'implement', 'review'). */
  id: string;

  /**
   * Execute this engine.
   *
   * @param givens   — the engine's declared inputs, assembled by the Walker.
   * @param context  — minimal execution context: engine id and upstream yields.
   */
  run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult>;
}

/** The Fabricator's public API, exposed via `provides`. */
export interface FabricatorApi {
  /**
   * Look up an engine design by ID.
   * Returns the design if registered, undefined otherwise.
   */
  getEngineDesign(id: string): EngineDesign | undefined;
}

// ── Type guard ────────────────────────────────────────────────────────

/** Narrow an unknown value to EngineDesign. */
function isEngineDesign(value: unknown): value is EngineDesign {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === 'string' &&
    typeof (value as Record<string, unknown>).run === 'function'
  );
}

// ── Implementation ────────────────────────────────────────────────────

/** The engine design registry — populated at startup, queried at runtime. */
class EngineRegistry {
  private readonly designs = new Map<string, EngineDesign>();

  /** Register all engine designs from a loaded plugin. */
  register(plugin: LoadedPlugin): void {
    if (isLoadedKit(plugin)) {
      this.registerFromKit(plugin.kit);
    } else if (isLoadedApparatus(plugin)) {
      if (plugin.apparatus.supportKit) {
        this.registerFromKit(plugin.apparatus.supportKit);
      }
    }
  }

  /** Extract and register engine designs from a kit (or supportKit) contribution. */
  private registerFromKit(kit: Record<string, unknown>): void {
    const rawEngines = kit.engines;
    if (typeof rawEngines !== 'object' || rawEngines === null) return;

    for (const value of Object.values(rawEngines as Record<string, unknown>)) {
      if (isEngineDesign(value)) {
        this.designs.set(value.id, value);
      }
    }
  }

  /** Look up an engine design by ID. */
  get(id: string): EngineDesign | undefined {
    return this.designs.get(id);
  }
}

// ── Apparatus factory ─────────────────────────────────────────────────

/**
 * Create the Fabricator apparatus plugin.
 *
 * Returns a Plugin with:
 * - `consumes: ['engines']` — scans kit/supportKit contributions
 * - `provides: FabricatorApi` — the engine design registry API
 */
export function createFabricator(): Plugin {
  const registry = new EngineRegistry();

  const api: FabricatorApi = {
    getEngineDesign(id: string): EngineDesign | undefined {
      return registry.get(id);
    },
  };

  return {
    apparatus: {
      requires: [],
      consumes: ['engines'],
      provides: api,

      start(ctx: StartupContext): void {
        const g = guild();

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

=== CONTEXT FILE: packages/plugins/fabricator/src/index.ts ===
/**
 * @shardworks/fabricator-apparatus — The Fabricator.
 *
 * Guild engine design registry: scans kit contributions, stores engine designs
 * by ID, and provides the FabricatorApi for design lookup.
 *
 * The EngineDesign, EngineRunContext, and EngineRunResult types live here
 * canonically — kit authors import from this package to contribute engines.
 */

import { createFabricator } from './fabricator.ts';

// ── Engine authoring API ───────────────────────────────────────────────

export type {
  EngineDesign,
  EngineRunContext,
  EngineRunResult,
} from './fabricator.ts';

// ── Fabricator API ────────────────────────────────────────────────────

export type { FabricatorApi } from './fabricator.ts';

// ── Default export: the apparatus plugin ──────────────────────────────

export default createFabricator();


## Codebase Structure (surrounding directories)

```
```

=== TREE: packages/plugins/fabricator/src/ ===
fabricator.test.ts
fabricator.ts
index.ts

```
```
